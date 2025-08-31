import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Pinecone } from '@pinecone-database/pinecone';
import pdfParse from 'pdf-parse';

// Optional DOCX support. If the module isn't installed, we detect and gracefully error.
let mammoth: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  mammoth = require('mammoth');
} catch (_) {
  mammoth = null;
}

// Initialize Firebase Admin if not already
if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

// --- Clients ---
const getOpenAIClient = () => {
  const apiKey = functions.config().openai?.key;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
};

const getGeminiClient = () => {
  const apiKey = functions.config().gemini?.key;
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
};

const getPineconeClient = () => {
  const apiKey = functions.config().pinecone?.key;
  if (!apiKey) return null;
  return new Pinecone({ apiKey });
};

// --- Types used between FE/BE ---
type Difficulty = 'easy' | 'medium' | 'hard';
type QuestionType = 'multiple-choice' | 'true-false' | 'fill-in-the-blank' | 'short-answer';

interface SourceAttribution {
  id: string;
  title: string;
  url?: string;
  score?: number;
}

interface QuizQuestion {
  id: string;
  type: QuestionType;
  questionText: string;
  options?: string[];
  correctAnswer: string | string[];
  explanation?: string;
  bloomLevel?: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
  sources?: SourceAttribution[];
  language?: string;
  accessibilityNotes?: string; // plain language constraints used
}

interface GeneratedQuiz {
  title: string;
  difficulty: Difficulty;
  questionCount: number;
  questions: QuizQuestion[];
  language?: string;
  contentSource?: 'note' | 'paste' | 'file' | 'transcript';
}

interface GenerateValidatedQuizInput {
  text: string; // user-provided content (notes/paste/transcript or extracted file text)
  userId: string;
  numberOfQuestions?: number;
  difficulty?: Difficulty;
  questionTypes?: QuestionType[];
  languageCode?: string; // e.g., 'en', 'es', 'fr'
  contentSource?: 'note' | 'paste' | 'file' | 'transcript';
}

interface GenerateValidatedQuizResponse extends GeneratedQuiz {
  validationReport: {
    total: number;
    passed: number;
    filteredOut: number;
    issues?: Array<{ id?: string; reasons: string[] }>
  };
  retrievedSources?: SourceAttribution[];
}

// --- Utilities for large input handling ---
function chunkText(text: string, maxChars = 12000): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    // try to break on sentence boundary if possible
    let sliceEnd = end;
    if (end < text.length) {
      const periodIdx = text.lastIndexOf('.', end);
      if (periodIdx > start + Math.floor(maxChars * 0.6)) sliceEnd = periodIdx + 1;
    }
    chunks.push(text.slice(start, sliceEnd));
    start = sliceEnd;
  }
  return chunks;
}

function distributeCounts(total: number, parts: number, weights?: number[]): number[] {
  if (parts <= 0) return [];
  if (!weights || weights.length !== parts) weights = new Array(parts).fill(1);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  // initial allocation via floor
  const base = weights.map(w => Math.floor((w / sum) * total));
  let assigned = base.reduce((a, b) => a + b, 0);
  // distribute remainder greedily
  let i = 0;
  while (assigned < total) {
    base[i % parts] += 1;
    assigned += 1;
    i += 1;
  }
  return base;
}

// --- RAG Retrieval ---
async function retrieveRagContext(openai: OpenAI, pinecone: Pinecone, text: string) {
  // 1) Create a short topic summary to use as a query seed
  const topicPrompt = `Extract 5-8 concise keywords from the following study content for retrieval. Output as a single comma-separated line.\n\n${text}`;
  const topicResp = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: topicPrompt }],
    temperature: 0.2,
  });
  const seed = topicResp.choices[0]?.message?.content || '';

  const emb = await openai.embeddings.create({ model: 'text-embedding-3-small', input: seed.substring(0, 8000) });
  const vector = emb.data[0].embedding;

  const index = pinecone.index('learnnest-corpus'); // assumed index
  const res: any = await index.query({ vector, topK: 5, includeMetadata: true });
  const matches = res.matches || [];
  const context = matches.map((m: any) => (m?.metadata as any)?.text).filter(Boolean).join('\n\n---\n\n');
  const sources: SourceAttribution[] = matches.map((m: any) => ({
    id: m.id,
    title: ((m?.metadata as any)?.title as string) || 'Untitled Source',
    url: (m?.metadata as any)?.url as string | undefined,
    score: m.score || undefined,
  }));
  return { context, sources };
}

// --- Generation with GPT-4o ---
async function generateQuestionsWithGPT({
  openai,
  baseText,
  ragContext,
  ragSources,
  numberOfQuestions,
  difficulty,
  questionTypes,
  languageCode,
}: {
  openai: OpenAI; baseText: string; ragContext: string; ragSources: SourceAttribution[];
  numberOfQuestions: number; difficulty: Difficulty; questionTypes: QuestionType[]; languageCode: string;
}): Promise<QuizQuestion[]> {
  const sourceTitles = ragSources.map(s => s.title).join(', ');

  const sys = `You are an expert assessment designer. Generate accessible, plain-language questions in ${languageCode}. Avoid jargon unless necessary; if used, define it briefly.`;

  const user = `Create ${numberOfQuestions} quiz questions across Bloom's taxonomy (from remember to analyze), matching overall difficulty "${difficulty}".
Question types allowed: ${questionTypes.join(', ')}. Use a mix. For multiple-choice, include exactly 4 options with plausible, non-overlapping distractors.

Ground your questions ONLY in the given STUDY CONTENT and RAG CONTEXT. Cite sources you used by their titles from the RAG SOURCES list.

Output strict JSON array of question objects with keys:
- id (string uuid-like)
- type (one of ${questionTypes.join(' | ')})
- questionText (string, plain language, concise)
- options (array of 4 strings) if type is multiple-choice
- correctAnswer (string or array of strings for blanks)
- explanation (string, 1-2 sentences)
- bloomLevel (remember|understand|apply|analyze|evaluate|create)
- sources (array of { id, title }) referencing items from RAG SOURCES by title
- language (BCP47 code, e.g., ${languageCode})
- accessibilityNotes (string explaining simplifications)

STUDY CONTENT:\n"""\n${baseText.substring(0, 15000)}\n"""

RAG CONTEXT:\n"""\n${ragContext.substring(0, 15000)}\n"""

RAG SOURCES: ${sourceTitles}

Return ONLY the JSON array.`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
    temperature: 0.3,
  });

  let raw = resp.choices[0]?.message?.content?.trim() || '[]';
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```json\n?|```/g, '').trim();
  }
  // Helper to try extracting a JSON array substring
  const extractJSONArray = (text: string): string | null => {
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      return text.slice(firstBracket, lastBracket + 1);
    }
    return null;
  };
  let parsed: any[] = [];
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // Fallback: attempt to fix trailing commas or invalid JSON
    raw = raw.replace(/,\s*\]/g, ']');
    try {
      parsed = JSON.parse(raw);
    } catch (e2) {
      const extracted = extractJSONArray(raw);
      if (extracted) {
        try {
          parsed = JSON.parse(extracted);
        } catch (e3) {
          throw new functions.https.HttpsError('internal', 'Failed to parse quiz JSON from model');
        }
      } else {
        throw new functions.https.HttpsError('internal', 'Failed to parse quiz JSON from model');
      }
    }
  }
  // Normalize ids if missing
  parsed.forEach((q, i) => { if (!q.id) q.id = `q-${Date.now()}-${i}`; });
  return parsed as QuizQuestion[];
}

// --- Validation with Gemini ---
async function validateWithGemini({ questions, ragContext, languageCode, genAI }: { questions: QuizQuestion[]; ragContext: string; languageCode: string; genAI: GoogleGenerativeAI; }): Promise<{ validFlags: boolean[]; issues: string[][]; }> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
  const payload = {
    questions,
    rules: {
      factCheck: true,
      distractorQuality: true,
      biasAndFairness: true,
      accessibility: true,
      languageCode,
    },
    context: ragContext.substring(0, 15000),
  };
  const prompt = `You are validating a quiz. For each question, return JSON with an array of objects: { valid: boolean, reasons: string[] }.
Criteria: factual correctness against CONTEXT, no harmful or biased content, appropriate difficulty, MCQ distractors plausible/non-trivial, clear plain-language phrasing in ${languageCode}, and answer/explanation alignment. If invalid, list reasons succinctly.
CONTEXT (authoritative, use only this to fact-check):\n"""\n${payload.context}\n"""\n
QUESTIONS JSON:\n${JSON.stringify(payload.questions)}\n
Return ONLY JSON array like: [{"valid":true,"reasons":[]}, ...]`;

  const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
  const text = res.response.text().trim();
  let raw = text;
  if (raw.startsWith('```')) raw = raw.replace(/^```json\n?|```/g, '').trim();
  const arr = JSON.parse(raw) as Array<{ valid: boolean; reasons: string[] }>;
  return { validFlags: arr.map(a => !!a.valid), issues: arr.map(a => a.reasons || []) };
}

function programmaticChecks(q: QuizQuestion): string[] {
  const issues: string[] = [];
  if (!q.questionText || typeof q.questionText !== 'string' || q.questionText.length < 5) issues.push('Question text too short/invalid');
  if (q.type === 'multiple-choice') {
    if (!Array.isArray(q.options) || q.options.length !== 4) issues.push('MCQ must have exactly 4 options');
    if (Array.isArray(q.options)) {
      const set = new Set(q.options.map(o => o.trim().toLowerCase()));
      if (set.size !== 4) issues.push('MCQ options must be unique');
    }
  }
  if (q.explanation && q.explanation.length > 400) issues.push('Explanation too long');
  return issues;
}

// --- Callable: Generate + Validate Quiz ---
export const generateValidatedQuiz = functions.runWith({ memory: '1GB', timeoutSeconds: 120 }).https.onCall(async (data: GenerateValidatedQuizInput, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  const {
    text,
    userId,
    numberOfQuestions = 8,
    difficulty = 'medium',
    questionTypes = ['multiple-choice', 'true-false', 'short-answer'],
    languageCode = 'en',
    contentSource = 'paste',
  } = data || {} as GenerateValidatedQuizInput;

  if (!text || !userId) throw new functions.https.HttpsError('invalid-argument', 'Missing text or userId');

  const openai = getOpenAIClient();
  const genAI = getGeminiClient();
  const pinecone = getPineconeClient();
  if (!openai) throw new functions.https.HttpsError('failed-precondition', 'OpenAI not configured');
  if (!genAI) throw new functions.https.HttpsError('failed-precondition', 'Gemini not configured');

  // Retrieve RAG context (optional). If Pinecone is not configured or retrieval fails, continue without RAG.
  let ragContext = '';
  let ragSources: SourceAttribution[] = [];
  if (pinecone) {
    try {
      const res = await retrieveRagContext(openai, pinecone, text);
      ragContext = res.context || '';
      ragSources = res.sources || [];
    } catch (_) {
      ragContext = '';
      ragSources = [];
    }
  }

  // --- Large input handling: chunk long text and generate per chunk ---
  const chunks = chunkText(text, 12000);
  const limitedChunks = chunks.length > 4 ? chunks.slice(0, 4) : chunks; // cap to avoid timeouts
  const weights = limitedChunks.map(c => Math.max(1, c.length));
  const perChunkCounts = distributeCounts(numberOfQuestions, limitedChunks.length, weights);
  let questions: QuizQuestion[] = [];
  for (let i = 0; i < limitedChunks.length; i++) {
    const baseText = limitedChunks[i];
    const quota = perChunkCounts[i] || 0;
    if (quota <= 0) continue;
    try {
      const part = await generateQuestionsWithGPT({
        openai,
        baseText,
        ragContext: ragContext || '',
        ragSources,
        numberOfQuestions: quota,
        difficulty,
        questionTypes,
        languageCode,
      });
      questions = questions.concat(part);
    } catch (e) {
      // skip this chunk on failure and continue
    }
  }
  // If chunking produced fewer questions than requested, attempt one more pass on the full (truncated) text
  if (questions.length < numberOfQuestions) {
    try {
      const needed = numberOfQuestions - questions.length;
      const part = await generateQuestionsWithGPT({
        openai,
        baseText: text.substring(0, 48000),
        ragContext: ragContext || '',
        ragSources,
        numberOfQuestions: needed,
        difficulty,
        questionTypes,
        languageCode,
      });
      questions = questions.concat(part);
    } catch (_) {
      // ignore
    }
  }

  // Programmatic checks
  const programIssues = questions.map(programmaticChecks);

  // Validate (semantic) with Gemini; if it fails, proceed without semantic validation
  let validFlags: boolean[] = new Array(questions.length).fill(true);
  let issues: string[][] = new Array(questions.length).fill([]);
  try {
    const res = await validateWithGemini({ questions, ragContext: ragContext || '', languageCode, genAI });
    validFlags = res.validFlags;
    issues = res.issues;
  } catch (e) {
    // keep defaults: all questions considered valid from semantic standpoint
  }

  const filtered: QuizQuestion[] = [];
  const validationIssues: Array<{ id?: string; reasons: string[] }> = [];
  questions.forEach((q, idx) => {
    const allIssues = [...(programIssues[idx] || []), ...(issues[idx] || [])];
    if (validFlags[idx] && allIssues.length === 0) {
      filtered.push(q);
    } else {
      validationIssues.push({ id: q.id, reasons: allIssues });
    }
  });

  // If too many filtered out, fallback to programmatically keeping some of the original questions
  let finalQuestions = filtered.slice(0, numberOfQuestions);
  if (finalQuestions.length === 0 && questions.length > 0) {
    // pick first N questions that had minimal programmatic issues
    const ranked = questions
      .map((q, idx) => ({ q, score: (programIssues[idx] || []).length }))
      .sort((a, b) => a.score - b.score)
      .slice(0, numberOfQuestions)
      .map(x => x.q);
  finalQuestions = ranked;
  }

  const title = `AI Quiz (${difficulty}) — ${new Date().toLocaleString('en-US')}`;
  const result: GenerateValidatedQuizResponse = {
    title,
    difficulty,
    questionCount: finalQuestions.length,
    questions: finalQuestions,
    language: languageCode,
    contentSource,
  validationReport: {
      total: questions.length,
      passed: finalQuestions.length,
      filteredOut: questions.length - finalQuestions.length,
      issues: validationIssues,
    },
    retrievedSources: ragSources,
  };

  // Log usage
  await db.collection('aiUsageLogs').add({
    userId,
    modelUsed: 'gpt-4o+gemini-validate',
    kind: 'quiz-generation',
    nRequested: numberOfQuestions,
    nReturned: finalQuestions.length,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return result;
});

// --- Callable: Extract text from uploaded file (PDF/DOCX) ---
export const extractTextFromFile = functions.runWith({ memory: '1GB', timeoutSeconds: 120 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  const { base64, mimeType, fileName } = data || {};
  if (!base64 || !mimeType) throw new functions.https.HttpsError('invalid-argument', 'Missing base64 or mimeType');

  const buffer = Buffer.from(base64, 'base64');
  try {
    if (mimeType === 'application/pdf') {
      const parsed = await pdfParse(buffer);
      return { text: parsed.text, pageCount: parsed.numpages, fileName };
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mimeType === 'application/msword') {
      if (!mammoth) throw new functions.https.HttpsError('failed-precondition', 'DOCX parsing not available on server');
      const { value } = await mammoth.extractRawText({ buffer });
      return { text: value, fileName };
    }
    throw new functions.https.HttpsError('invalid-argument', `Unsupported mimeType: ${mimeType}`);
  } catch (e: any) {
    throw new functions.https.HttpsError('internal', e?.message || 'Failed to extract text');
  }
});

// --- Callable: Submit quiz attempt + personalization ---
export const submitQuizAttempt = functions.runWith({ memory: '512MB', timeoutSeconds: 60 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  const { userId, quizId, answers, correctCount, totalCount, timePerQuestion = [], confidence = [], questions = [] } = data || {};
  if (!userId || !quizId || !Array.isArray(answers) || typeof correctCount !== 'number' || typeof totalCount !== 'number') {
    throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid fields');
  }

  const accuracy = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;
  let recommendedDifficulty: Difficulty = 'medium';
  if (accuracy >= 70) recommendedDifficulty = 'hard';
  else if (accuracy < 50) recommendedDifficulty = 'easy';

  // Use Gemini to propose 3 short focus areas based on incorrect items
  const genAI = getGeminiClient();
  let focusAreas: string[] = [];
  try {
    if (genAI && questions.length) {
      const incorrectItems = questions.filter((_: any, idx: number) => {
        const ua = (answers[idx] || '').toString();
        const q = questions[idx];
        const correct = Array.isArray(q.correctAnswer) ? q.correctAnswer.map((p: string) => p.toLowerCase().trim()).every((p: string) => ua.toLowerCase().includes(p)) : ua.toLowerCase().trim() === String(q.correctAnswer).toLowerCase().trim();
        return !correct;
      }).map((q: any) => ({ questionText: q.questionText, explanation: q.explanation || '' }));
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `Given the following incorrectly answered questions with explanations, list 3 concise focus areas (concepts or skills) to improve, as a JSON array of strings.\n\n${JSON.stringify(incorrectItems).substring(0, 8000)}`;
      const resp = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
      let t = resp.response.text().trim();
      if (t.startsWith('```')) t = t.replace(/^```json\n?|```/g, '').trim();
      const arr = JSON.parse(t);
      if (Array.isArray(arr)) focusAreas = arr.slice(0, 3).map((s: any) => String(s));
    }
  } catch (_) {
    // ignore focus generation errors
  }

  // Persist attempt
  const attemptRef = await db.collection(`users/${userId}/quizAttempts`).add({
    quizId,
    answers,
    correctCount,
    totalCount,
    accuracy,
    timePerQuestion,
    confidence,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Update quiz aggregate stats
  const quizRef = db.doc(`users/${userId}/quizzes/${quizId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(quizRef);
    const data = snap.exists ? snap.data() as any : {};
    const prevHighest = (data?.highestScore as number) || 0;
    const prevAttempts = (data?.completedAttempts as number) || 0;
    tx.set(quizRef, {
      highestScore: Math.max(prevHighest, accuracy),
      completedAttempts: prevAttempts + 1,
      lastAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return {
    attemptId: attemptRef.id,
    accuracy,
    recommendedDifficulty,
    focusAreas,
  };
});

// --- Callable: Generate progressive hints for a question ---
export const generateQuestionHint = functions.runWith({ memory: '512MB', timeoutSeconds: 60 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  const { question, languageCode = 'en' } = data || {};
  if (!question?.questionText) throw new functions.https.HttpsError('invalid-argument', 'Missing question');
  const genAI = getGeminiClient();
  if (!genAI) throw new functions.https.HttpsError('failed-precondition', 'Gemini not configured');
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const prompt = `Provide progressive disclosure hints in ${languageCode} for the quiz question below as JSON with keys: {"hints":["small nudge","bigger clue"], "explanation":"final explanation"}. Keep hints short and avoid revealing the full answer until the explanation.\n\n${JSON.stringify(question).substring(0, 4000)}`;
  const resp = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
  let t = resp.response.text().trim();
  if (t.startsWith('```')) t = t.replace(/^```json\n?|```/g, '').trim();
  const parsed = JSON.parse(t);
  return parsed;
});

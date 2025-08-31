"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateQuestionHint = exports.submitQuizAttempt = exports.extractTextFromFile = exports.generateValidatedQuiz = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const openai_1 = __importDefault(require("openai"));
const generative_ai_1 = require("@google/generative-ai");
const pinecone_1 = require("@pinecone-database/pinecone");
const pdf_parse_1 = __importDefault(require("pdf-parse"));
// Optional DOCX support. If the module isn't installed, we detect and gracefully error.
let mammoth = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mammoth = require('mammoth');
}
catch (_) {
    mammoth = null;
}
// Initialize Firebase Admin if not already
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
// --- Clients ---
const getOpenAIClient = () => {
    var _a;
    const apiKey = (_a = functions.config().openai) === null || _a === void 0 ? void 0 : _a.key;
    if (!apiKey)
        return null;
    return new openai_1.default({ apiKey });
};
const getGeminiClient = () => {
    var _a;
    const apiKey = (_a = functions.config().gemini) === null || _a === void 0 ? void 0 : _a.key;
    if (!apiKey)
        return null;
    return new generative_ai_1.GoogleGenerativeAI(apiKey);
};
const getPineconeClient = () => {
    var _a;
    const apiKey = (_a = functions.config().pinecone) === null || _a === void 0 ? void 0 : _a.key;
    if (!apiKey)
        return null;
    return new pinecone_1.Pinecone({ apiKey });
};
// --- Utilities for large input handling ---
function chunkText(text, maxChars = 12000) {
    if (!text)
        return [];
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + maxChars, text.length);
        // try to break on sentence boundary if possible
        let sliceEnd = end;
        if (end < text.length) {
            const periodIdx = text.lastIndexOf('.', end);
            if (periodIdx > start + Math.floor(maxChars * 0.6))
                sliceEnd = periodIdx + 1;
        }
        chunks.push(text.slice(start, sliceEnd));
        start = sliceEnd;
    }
    return chunks;
}
function distributeCounts(total, parts, weights) {
    if (parts <= 0)
        return [];
    if (!weights || weights.length !== parts)
        weights = new Array(parts).fill(1);
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
async function retrieveRagContext(openai, pinecone, text) {
    var _a, _b;
    // 1) Create a short topic summary to use as a query seed
    const topicPrompt = `Extract 5-8 concise keywords from the following study content for retrieval. Output as a single comma-separated line.\n\n${text}`;
    const topicResp = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: topicPrompt }],
        temperature: 0.2,
    });
    const seed = ((_b = (_a = topicResp.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '';
    const emb = await openai.embeddings.create({ model: 'text-embedding-3-small', input: seed.substring(0, 8000) });
    const vector = emb.data[0].embedding;
    const index = pinecone.index('learnnest-corpus'); // assumed index
    const res = await index.query({ vector, topK: 5, includeMetadata: true });
    const matches = res.matches || [];
    const context = matches.map((m) => { var _a; return (_a = m === null || m === void 0 ? void 0 : m.metadata) === null || _a === void 0 ? void 0 : _a.text; }).filter(Boolean).join('\n\n---\n\n');
    const sources = matches.map((m) => {
        var _a, _b;
        return ({
            id: m.id,
            title: ((_a = m === null || m === void 0 ? void 0 : m.metadata) === null || _a === void 0 ? void 0 : _a.title) || 'Untitled Source',
            url: (_b = m === null || m === void 0 ? void 0 : m.metadata) === null || _b === void 0 ? void 0 : _b.url,
            score: m.score || undefined,
        });
    });
    return { context, sources };
}
// --- Generation with GPT-4o ---
async function generateQuestionsWithGPT({ openai, baseText, ragContext, ragSources, numberOfQuestions, difficulty, questionTypes, languageCode, }) {
    var _a, _b, _c;
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
    let raw = ((_c = (_b = (_a = resp.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim()) || '[]';
    if (raw.startsWith('```')) {
        raw = raw.replace(/^```json\n?|```/g, '').trim();
    }
    // Helper to try extracting a JSON array substring
    const extractJSONArray = (text) => {
        const firstBracket = text.indexOf('[');
        const lastBracket = text.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            return text.slice(firstBracket, lastBracket + 1);
        }
        return null;
    };
    let parsed = [];
    try {
        parsed = JSON.parse(raw);
    }
    catch (e) {
        // Fallback: attempt to fix trailing commas or invalid JSON
        raw = raw.replace(/,\s*\]/g, ']');
        try {
            parsed = JSON.parse(raw);
        }
        catch (e2) {
            const extracted = extractJSONArray(raw);
            if (extracted) {
                try {
                    parsed = JSON.parse(extracted);
                }
                catch (e3) {
                    throw new functions.https.HttpsError('internal', 'Failed to parse quiz JSON from model');
                }
            }
            else {
                throw new functions.https.HttpsError('internal', 'Failed to parse quiz JSON from model');
            }
        }
    }
    // Normalize ids if missing
    parsed.forEach((q, i) => { if (!q.id)
        q.id = `q-${Date.now()}-${i}`; });
    return parsed;
}
// --- Validation with Gemini ---
async function validateWithGemini({ questions, ragContext, languageCode, genAI }) {
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
    if (raw.startsWith('```'))
        raw = raw.replace(/^```json\n?|```/g, '').trim();
    const arr = JSON.parse(raw);
    return { validFlags: arr.map(a => !!a.valid), issues: arr.map(a => a.reasons || []) };
}
function programmaticChecks(q) {
    const issues = [];
    if (!q.questionText || typeof q.questionText !== 'string' || q.questionText.length < 5)
        issues.push('Question text too short/invalid');
    if (q.type === 'multiple-choice') {
        if (!Array.isArray(q.options) || q.options.length !== 4)
            issues.push('MCQ must have exactly 4 options');
        if (Array.isArray(q.options)) {
            const set = new Set(q.options.map(o => o.trim().toLowerCase()));
            if (set.size !== 4)
                issues.push('MCQ options must be unique');
        }
    }
    if (q.explanation && q.explanation.length > 400)
        issues.push('Explanation too long');
    return issues;
}
// --- Callable: Generate + Validate Quiz ---
exports.generateValidatedQuiz = functions.runWith({ memory: '1GB', timeoutSeconds: 120 }).https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    const { text, userId, numberOfQuestions = 8, difficulty = 'medium', questionTypes = ['multiple-choice', 'true-false', 'short-answer'], languageCode = 'en', contentSource = 'paste', } = data || {};
    if (!text || !userId)
        throw new functions.https.HttpsError('invalid-argument', 'Missing text or userId');
    const openai = getOpenAIClient();
    const genAI = getGeminiClient();
    const pinecone = getPineconeClient();
    if (!openai)
        throw new functions.https.HttpsError('failed-precondition', 'OpenAI not configured');
    if (!genAI)
        throw new functions.https.HttpsError('failed-precondition', 'Gemini not configured');
    // Retrieve RAG context (optional). If Pinecone is not configured or retrieval fails, continue without RAG.
    let ragContext = '';
    let ragSources = [];
    if (pinecone) {
        try {
            const res = await retrieveRagContext(openai, pinecone, text);
            ragContext = res.context || '';
            ragSources = res.sources || [];
        }
        catch (_) {
            ragContext = '';
            ragSources = [];
        }
    }
    // --- Large input handling: chunk long text and generate per chunk ---
    const chunks = chunkText(text, 12000);
    const limitedChunks = chunks.length > 4 ? chunks.slice(0, 4) : chunks; // cap to avoid timeouts
    const weights = limitedChunks.map(c => Math.max(1, c.length));
    const perChunkCounts = distributeCounts(numberOfQuestions, limitedChunks.length, weights);
    let questions = [];
    for (let i = 0; i < limitedChunks.length; i++) {
        const baseText = limitedChunks[i];
        const quota = perChunkCounts[i] || 0;
        if (quota <= 0)
            continue;
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
        }
        catch (e) {
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
        }
        catch (_) {
            // ignore
        }
    }
    // Programmatic checks
    const programIssues = questions.map(programmaticChecks);
    // Validate (semantic) with Gemini; if it fails, proceed without semantic validation
    let validFlags = new Array(questions.length).fill(true);
    let issues = new Array(questions.length).fill([]);
    try {
        const res = await validateWithGemini({ questions, ragContext: ragContext || '', languageCode, genAI });
        validFlags = res.validFlags;
        issues = res.issues;
    }
    catch (e) {
        // keep defaults: all questions considered valid from semantic standpoint
    }
    const filtered = [];
    const validationIssues = [];
    questions.forEach((q, idx) => {
        const allIssues = [...(programIssues[idx] || []), ...(issues[idx] || [])];
        if (validFlags[idx] && allIssues.length === 0) {
            filtered.push(q);
        }
        else {
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
    const result = {
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
exports.extractTextFromFile = functions.runWith({ memory: '1GB', timeoutSeconds: 120 }).https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    const { base64, mimeType, fileName } = data || {};
    if (!base64 || !mimeType)
        throw new functions.https.HttpsError('invalid-argument', 'Missing base64 or mimeType');
    const buffer = Buffer.from(base64, 'base64');
    try {
        if (mimeType === 'application/pdf') {
            const parsed = await (0, pdf_parse_1.default)(buffer);
            return { text: parsed.text, pageCount: parsed.numpages, fileName };
        }
        if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mimeType === 'application/msword') {
            if (!mammoth)
                throw new functions.https.HttpsError('failed-precondition', 'DOCX parsing not available on server');
            const { value } = await mammoth.extractRawText({ buffer });
            return { text: value, fileName };
        }
        throw new functions.https.HttpsError('invalid-argument', `Unsupported mimeType: ${mimeType}`);
    }
    catch (e) {
        throw new functions.https.HttpsError('internal', (e === null || e === void 0 ? void 0 : e.message) || 'Failed to extract text');
    }
});
// --- Callable: Submit quiz attempt + personalization ---
exports.submitQuizAttempt = functions.runWith({ memory: '512MB', timeoutSeconds: 60 }).https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    const { userId, quizId, answers, correctCount, totalCount, timePerQuestion = [], confidence = [], questions = [] } = data || {};
    if (!userId || !quizId || !Array.isArray(answers) || typeof correctCount !== 'number' || typeof totalCount !== 'number') {
        throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid fields');
    }
    const accuracy = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;
    let recommendedDifficulty = 'medium';
    if (accuracy >= 70)
        recommendedDifficulty = 'hard';
    else if (accuracy < 50)
        recommendedDifficulty = 'easy';
    // Use Gemini to propose 3 short focus areas based on incorrect items
    const genAI = getGeminiClient();
    let focusAreas = [];
    try {
        if (genAI && questions.length) {
            const incorrectItems = questions.filter((_, idx) => {
                const ua = (answers[idx] || '').toString();
                const q = questions[idx];
                const correct = Array.isArray(q.correctAnswer) ? q.correctAnswer.map((p) => p.toLowerCase().trim()).every((p) => ua.toLowerCase().includes(p)) : ua.toLowerCase().trim() === String(q.correctAnswer).toLowerCase().trim();
                return !correct;
            }).map((q) => ({ questionText: q.questionText, explanation: q.explanation || '' }));
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const prompt = `Given the following incorrectly answered questions with explanations, list 3 concise focus areas (concepts or skills) to improve, as a JSON array of strings.\n\n${JSON.stringify(incorrectItems).substring(0, 8000)}`;
            const resp = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
            let t = resp.response.text().trim();
            if (t.startsWith('```'))
                t = t.replace(/^```json\n?|```/g, '').trim();
            const arr = JSON.parse(t);
            if (Array.isArray(arr))
                focusAreas = arr.slice(0, 3).map((s) => String(s));
        }
    }
    catch (_) {
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
        const data = snap.exists ? snap.data() : {};
        const prevHighest = (data === null || data === void 0 ? void 0 : data.highestScore) || 0;
        const prevAttempts = (data === null || data === void 0 ? void 0 : data.completedAttempts) || 0;
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
exports.generateQuestionHint = functions.runWith({ memory: '512MB', timeoutSeconds: 60 }).https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    const { question, languageCode = 'en' } = data || {};
    if (!(question === null || question === void 0 ? void 0 : question.questionText))
        throw new functions.https.HttpsError('invalid-argument', 'Missing question');
    const genAI = getGeminiClient();
    if (!genAI)
        throw new functions.https.HttpsError('failed-precondition', 'Gemini not configured');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Provide progressive disclosure hints in ${languageCode} for the quiz question below as JSON with keys: {"hints":["small nudge","bigger clue"], "explanation":"final explanation"}. Keep hints short and avoid revealing the full answer until the explanation.\n\n${JSON.stringify(question).substring(0, 4000)}`;
    const resp = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    let t = resp.response.text().trim();
    if (t.startsWith('```'))
        t = t.replace(/^```json\n?|```/g, '').trim();
    const parsed = JSON.parse(t);
    return parsed;
});
//# sourceMappingURL=quizPipeline.js.map
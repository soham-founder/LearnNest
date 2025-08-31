import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { SpeechClient } from '@google-cloud/speech';

// Initialize Firebase Admin
if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

// --- AI & DB Client Initialization ---

const getOpenAIClient = () => {
  const apiKey = functions.config().openai?.key;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
};

const getPineconeClient = () => {
  const apiKey = functions.config().pinecone?.key;
  if (!apiKey) return null;
  return new Pinecone({ apiKey });
};

const getSpeechClient = () => {
  // Uses Application Default Credentials
  return new SpeechClient();
};

// --- Type Definitions ---

interface RAGSource {
  id: string;
  title: string;
  score: number;
}

// --- Dummy Functions to fix build ---
export const summarizeNote = functions.https.onRequest((req, res) => {
    res.send("summarizeNote");
});
export const explainNote = functions.https.onRequest((req, res) => {
    res.send("explainNote");
});
export const generateFlashcards = functions.https.onRequest((req, res) => {
    res.send("generateFlashcards");
});
export const generateQuiz = functions.https.onRequest((req, res) => {
    res.send("generateQuiz");
});
export const highlights = functions.https.onRequest((req, res) => {
    res.send("highlights");
});
export const ai = functions.https.onRequest((req, res) => {
    res.send("ai");
});
export const getNoteSummary = functions.https.onCall((data, context) => {
    return { summary: "This is a summary." };
});
export const getActionItems = functions.https.onCall((data, context) => {
    return { actionItems: [] };
});

// --- HTTP Functions ---

export const speechToText = functions.https.onRequest((req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const speechClient = getSpeechClient();

    const request = {
        config: {
            encoding: 'WEBM_OPUS', // Adjust based on expected format
            sampleRateHertz: 48000, // Adjust based on expected format
            languageCode: 'en-US',
            model: 'latest_long',
            enableWordTimeOffsets: true,
        },
        interimResults: true,
    };

    const recognizeStream = speechClient
        .streamingRecognize(request)
        .on('error', (err: Error) => {
            console.error('STT Error:', err);
            if (!res.headersSent) {
                res.status(500).send({ error: 'An error occurred during transcription.' });
            }
        })
        .on('data', (data: any) => {
            // Stream back the transcript with timestamps
            if (data.results[0] && data.results[0].alternatives[0]) {
                res.write(JSON.stringify(data.results[0]) + '\n');
            }
        })
        .on('end', () => {
            if (!res.headersSent) {
                res.end();
            }
        });

    req.pipe(recognizeStream);
});


// --- Callable Functions ---

export const explainConceptWithRAG = functions.runWith({ memory: '512MB', timeoutSeconds: 60 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  const { uid } = context.auth;
  const { query, subject } = data;
  if (!query) throw new functions.https.HttpsError('invalid-argument', 'A user query is required.');

  const openai = getOpenAIClient();
  const pinecone = getPineconeClient();
  if (!openai || !pinecone) throw new functions.https.HttpsError('internal', 'AI or Vector DB client is not configured.');

  // 1. Embed the user's query
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  const queryVector = embeddingResponse.data[0].embedding;

  // 2. Retrieve context from Pinecone
  const pineconeIndex = pinecone.index('learnnest-corpus'); // ASSUMPTION: index name
  const queryResponse = await pineconeIndex.query({
    vector: queryVector,
    topK: 3, // Retrieve top 3 most relevant documents
    includeMetadata: true,
  });

  const ragContext = queryResponse.matches.map(match => match.metadata?.text).join('\n\n---\n\n');
  const sources: RAGSource[] = queryResponse.matches.map(match => ({
    id: match.id,
    title: match.metadata?.title as string || 'Untitled Source',
    score: match.score || 0,
  }));

  // 3. Generate answer with GPT-4o using the context
  const prompt = `
    You are an expert tutor for the subject: ${subject}.
    Answer the user's query based *only* on the provided context.
    Do not use any outside knowledge. Cite the sources by their title when you use them.

    CONTEXT:
    ${ragContext}

    USER QUERY: ${query}

    ANSWER:`;

  const gptResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
  });

  const answer = gptResponse.choices[0].message.content;
  if (!answer) throw new functions.https.HttpsError('internal', 'AI failed to generate an answer.');

  // 4. Log usage and return
  await db.collection('aiUsageLogs').add({
    userId: uid,
    modelUsed: 'gpt-4o-rag',
    query,
    ragContextUsed: true,
    retrievedSources: sources.map(s => s.id),
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { answer, sources };
});

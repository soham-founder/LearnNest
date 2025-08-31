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
exports.explainConceptWithRAG = exports.speechToText = exports.getActionItems = exports.getNoteSummary = exports.ai = exports.highlights = exports.generateQuiz = exports.generateFlashcards = exports.explainNote = exports.summarizeNote = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const openai_1 = __importDefault(require("openai"));
const pinecone_1 = require("@pinecone-database/pinecone");
const speech_1 = require("@google-cloud/speech");
// Initialize Firebase Admin
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
// --- AI & DB Client Initialization ---
const getOpenAIClient = () => {
    var _a;
    const apiKey = (_a = functions.config().openai) === null || _a === void 0 ? void 0 : _a.key;
    if (!apiKey)
        return null;
    return new openai_1.default({ apiKey });
};
const getPineconeClient = () => {
    var _a;
    const apiKey = (_a = functions.config().pinecone) === null || _a === void 0 ? void 0 : _a.key;
    if (!apiKey)
        return null;
    return new pinecone_1.Pinecone({ apiKey });
};
const getSpeechClient = () => {
    // Uses Application Default Credentials
    return new speech_1.SpeechClient();
};
// --- Dummy Functions to fix build ---
exports.summarizeNote = functions.https.onRequest((req, res) => {
    res.send("summarizeNote");
});
exports.explainNote = functions.https.onRequest((req, res) => {
    res.send("explainNote");
});
exports.generateFlashcards = functions.https.onRequest((req, res) => {
    res.send("generateFlashcards");
});
exports.generateQuiz = functions.https.onRequest((req, res) => {
    res.send("generateQuiz");
});
exports.highlights = functions.https.onRequest((req, res) => {
    res.send("highlights");
});
exports.ai = functions.https.onRequest((req, res) => {
    res.send("ai");
});
exports.getNoteSummary = functions.https.onCall((data, context) => {
    return { summary: "This is a summary." };
});
exports.getActionItems = functions.https.onCall((data, context) => {
    return { actionItems: [] };
});
// --- HTTP Functions ---
exports.speechToText = functions.https.onRequest((req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    const speechClient = getSpeechClient();
    const request = {
        config: {
            encoding: 'WEBM_OPUS',
            sampleRateHertz: 48000,
            languageCode: 'en-US',
            model: 'latest_long',
            enableWordTimeOffsets: true,
        },
        interimResults: true,
    };
    const recognizeStream = speechClient
        .streamingRecognize(request)
        .on('error', (err) => {
        console.error('STT Error:', err);
        if (!res.headersSent) {
            res.status(500).send({ error: 'An error occurred during transcription.' });
        }
    })
        .on('data', (data) => {
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
exports.explainConceptWithRAG = functions.runWith({ memory: '512MB', timeoutSeconds: 60 }).https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    const { uid } = context.auth;
    const { query, subject } = data;
    if (!query)
        throw new functions.https.HttpsError('invalid-argument', 'A user query is required.');
    const openai = getOpenAIClient();
    const pinecone = getPineconeClient();
    if (!openai || !pinecone)
        throw new functions.https.HttpsError('internal', 'AI or Vector DB client is not configured.');
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
        topK: 3,
        includeMetadata: true,
    });
    const ragContext = queryResponse.matches.map(match => { var _a; return (_a = match.metadata) === null || _a === void 0 ? void 0 : _a.text; }).join('\n\n---\n\n');
    const sources = queryResponse.matches.map(match => {
        var _a;
        return ({
            id: match.id,
            title: ((_a = match.metadata) === null || _a === void 0 ? void 0 : _a.title) || 'Untitled Source',
            score: match.score || 0,
        });
    });
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
    if (!answer)
        throw new functions.https.HttpsError('internal', 'AI failed to generate an answer.');
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
//# sourceMappingURL=ai.js.map
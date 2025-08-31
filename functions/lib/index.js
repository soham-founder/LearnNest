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
exports.cleanupInactivePresence = exports.removeDeckAccess = exports.updateCollaboratorRole = exports.inviteCollaborator = exports.shareDeck = exports.getActionItems = exports.getNoteSummary = exports.aiEndpoints = exports.aiSpeechToText = exports.aiHighlights = exports.aiGenerateQuiz = exports.aiGenerateFlashcards = exports.aiExplainNote = exports.aiSummarizeNote = exports.tutorApi = exports.generateQuestionHint = exports.submitQuizAttempt = exports.extractTextFromFile = exports.generateValidatedQuiz = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const express_1 = __importDefault(require("express"));
const ai_1 = require("./ai");
Object.defineProperty(exports, "getNoteSummary", { enumerable: true, get: function () { return ai_1.getNoteSummary; } });
Object.defineProperty(exports, "getActionItems", { enumerable: true, get: function () { return ai_1.getActionItems; } });
// Quiz pipeline callables
var quizPipeline_1 = require("./quizPipeline");
Object.defineProperty(exports, "generateValidatedQuiz", { enumerable: true, get: function () { return quizPipeline_1.generateValidatedQuiz; } });
Object.defineProperty(exports, "extractTextFromFile", { enumerable: true, get: function () { return quizPipeline_1.extractTextFromFile; } });
Object.defineProperty(exports, "submitQuizAttempt", { enumerable: true, get: function () { return quizPipeline_1.submitQuizAttempt; } });
Object.defineProperty(exports, "generateQuestionHint", { enumerable: true, get: function () { return quizPipeline_1.generateQuestionHint; } });
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
// ---- AI Tutor App (Express) ----
// Modular Express app to host tutor endpoints under one function URL.
const tutorApp = (0, express_1.default)();
// Middleware for JSON
tutorApp.use(express_1.default.json());
// Memory service: simple Firestore-based memory store (scaffold)
tutorApp.post('/memory/upsert', async (req, res) => {
    try {
        const { userId, items } = req.body || {};
        if (!userId || !Array.isArray(items))
            return res.status(400).json({ error: 'Missing userId or items' });
        const col = db.collection(`users/${userId}/tutorMemory`);
        const batch = db.batch();
        items.forEach((it) => {
            const ref = it.id ? col.doc(it.id) : col.doc();
            batch.set(ref, { ...it, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        });
        await batch.commit();
        return res.json({ ok: true });
    }
    catch (e) {
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || 'memory upsert failed' });
    }
});
// Logging for compliance: consent, audit history
tutorApp.post('/logs', async (req, res) => {
    try {
        const { userId, event, payload } = req.body || {};
        if (!userId || !event)
            return res.status(400).json({ error: 'Missing userId or event' });
        await db.collection('tutorAuditLogs').add({ userId, event, payload: payload || null, ts: admin.firestore.FieldValue.serverTimestamp() });
        return res.json({ ok: true });
    }
    catch (e) {
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || 'log failed' });
    }
});
// Analytics stub: capture effectiveness/engagement
tutorApp.post('/analytics', async (req, res) => {
    try {
        const { userId, metrics } = req.body || {};
        if (!userId || !metrics)
            return res.status(400).json({ error: 'Missing userId or metrics' });
        await db.collection('tutorAnalytics').add({ userId, metrics, ts: admin.firestore.FieldValue.serverTimestamp() });
        return res.json({ ok: true });
    }
    catch (e) {
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || 'analytics write failed' });
    }
});
// Tutoring endpoint (RAG + Socratic dialog) — scaffold only; implement in services/tutor
tutorApp.post('/tutor', async (req, res) => {
    try {
        const { userId, message } = req.body || {};
        if (!userId || !message)
            return res.status(400).json({ error: 'Missing userId or message' });
        // TODO: integrate vector DB (Pinecone/Firestore vector), compose prompt for Socratic guidance,
        // and track memory. For now, return a placeholder.
        const reply = 'Let’s think step-by-step. What do you notice first about the problem?';
        return res.json({ reply, steps: ['Restate the question', 'Identify knowns', 'Propose a first step'] });
    }
    catch (e) {
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || 'tutor failed' });
    }
});
exports.tutorApi = functions.https.onRequest(tutorApp);
// --- Legacy HTTPS Request Functions ---
// Exported with specific names for clarity in the Google Cloud Console.
exports.aiSummarizeNote = ai_1.summarizeNote;
exports.aiExplainNote = ai_1.explainNote;
exports.aiGenerateFlashcards = ai_1.generateFlashcards;
exports.aiGenerateQuiz = ai_1.generateQuiz;
exports.aiHighlights = ai_1.highlights;
exports.aiSpeechToText = ai_1.speechToText;
// --- Aggregated Express App for RESTful endpoints ---
exports.aiEndpoints = ai_1.ai;
exports.shareDeck = functions.https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { deckId, permissions, expiresAt } = data;
    if (!deckId || !permissions) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing deckId or permissions.');
    }
    const deckRef = db.collection('decks').doc(deckId);
    const deckSnap = await deckRef.get();
    if (!deckSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Deck not found.');
    }
    const deckData = deckSnap.data();
    if ((deckData === null || deckData === void 0 ? void 0 : deckData.createdBy) !== context.auth.uid && ((_b = (_a = deckData === null || deckData === void 0 ? void 0 : deckData.collaborators) === null || _a === void 0 ? void 0 : _a[context.auth.uid]) === null || _b === void 0 ? void 0 : _b.role) !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Only the owner or an admin can share this deck.');
    }
    const newShareId = deckId; // For simplicity, using deckId as shareId for now
    const collaborators = { ...(deckData === null || deckData === void 0 ? void 0 : deckData.collaborators) || {}, ...permissions };
    await deckRef.update({
        isShared: true,
        shareId: newShareId,
        collaborators,
        'settings.isPublic': false,
        'settings.allowComments': true,
        'settings.allowEditing': true,
        expiresAt: expiresAt ? admin.firestore.Timestamp.fromMillis(expiresAt) : null,
    });
    return { success: true, shareId: newShareId };
});
exports.inviteCollaborator = functions.https.onCall(async (data, context) => {
    var _a, _b, _c;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { shareId, email, role } = data;
    if (!shareId || !email || !role) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing shareId, email, or role.');
    }
    const deckRef = db.collection('decks').where('shareId', '==', shareId);
    const deckSnap = await deckRef.get();
    if (deckSnap.empty) {
        throw new functions.https.HttpsError('not-found', 'Deck not found or not shared.');
    }
    const deckDoc = deckSnap.docs[0];
    const deckData = deckDoc.data();
    if (deckData.createdBy !== context.auth.uid && ((_b = (_a = deckData.collaborators) === null || _a === void 0 ? void 0 : _a[context.auth.uid]) === null || _b === void 0 ? void 0 : _b.role) !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Only the owner or an admin can invite collaborators.');
    }
    const userRecord = await admin.auth().getUserByEmail(email);
    const newCollaboratorId = userRecord.uid;
    if ((_c = deckData.collaborators) === null || _c === void 0 ? void 0 : _c[newCollaboratorId]) {
        throw new functions.https.HttpsError('already-exists', 'User is already a collaborator.');
    }
    const updatedCollaborators = {
        ...deckData.collaborators,
        [newCollaboratorId]: { role, joinedAt: admin.firestore.FieldValue.serverTimestamp(), displayName: userRecord.displayName || userRecord.email, photoURL: userRecord.photoURL },
    };
    await deckDoc.ref.update({ collaborators: updatedCollaborators });
    return { success: true };
});
exports.updateCollaboratorRole = functions.https.onCall(async (data, context) => {
    var _a, _b, _c;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { shareId, userId, newRole } = data;
    if (!shareId || !userId || !newRole) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing shareId, userId, or newRole.');
    }
    const deckRef = db.collection('decks').where('shareId', '==', shareId);
    const deckSnap = await deckRef.get();
    if (deckSnap.empty) {
        throw new functions.https.HttpsError('not-found', 'Deck not found or not shared.');
    }
    const deckDoc = deckSnap.docs[0];
    const deckData = deckDoc.data();
    if (deckData.createdBy !== context.auth.uid && ((_b = (_a = deckData.collaborators) === null || _a === void 0 ? void 0 : _a[context.auth.uid]) === null || _b === void 0 ? void 0 : _b.role) !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Only the owner or an admin can update collaborator roles.');
    }
    if (!((_c = deckData.collaborators) === null || _c === void 0 ? void 0 : _c[userId])) {
        throw new functions.https.HttpsError('not-found', 'Collaborator not found.');
    }
    const updatedCollaborators = {
        ...deckData.collaborators,
        [userId]: { ...deckData.collaborators[userId], role: newRole },
    };
    await deckDoc.ref.update({ collaborators: updatedCollaborators });
    return { success: true };
});
exports.removeDeckAccess = functions.https.onCall(async (data, context) => {
    var _a, _b, _c;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { shareId, userId } = data;
    if (!shareId || !userId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing shareId or userId.');
    }
    const deckRef = db.collection('decks').where('shareId', '==', shareId);
    const deckSnap = await deckRef.get();
    if (deckSnap.empty) {
        throw new functions.https.HttpsError('not-found', 'Deck not found or not shared.');
    }
    const deckDoc = deckSnap.docs[0];
    const deckData = deckDoc.data();
    if (deckData.createdBy !== context.auth.uid && ((_b = (_a = deckData.collaborators) === null || _a === void 0 ? void 0 : _a[context.auth.uid]) === null || _b === void 0 ? void 0 : _b.role) !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Only the owner or an admin can remove collaborators.');
    }
    if (!((_c = deckData.collaborators) === null || _c === void 0 ? void 0 : _c[userId])) {
        throw new functions.https.HttpsError('not-found', 'Collaborator not found.');
    }
    const updatedCollaborators = { ...deckData.collaborators };
    delete updatedCollaborators[userId];
    await deckDoc.ref.update({ collaborators: updatedCollaborators });
    return { success: true };
});
exports.cleanupInactivePresence = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
    const fiveMinutesAgo = admin.firestore.Timestamp.now().toMillis() - (5 * 60 * 1000);
    const inactiveUsers = await db.collectionGroup('presence')
        .where('lastActive', '<=', fiveMinutesAgo)
        .get();
    const batch = db.batch();
    inactiveUsers.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`Cleaned up ${inactiveUsers.size} inactive presence records.`);
    return null;
});
//# sourceMappingURL=index.js.map
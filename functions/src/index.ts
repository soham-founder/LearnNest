import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import express from 'express';
import {
  summarizeNote,
  explainNote,
  generateFlashcards,
  generateQuiz,
  highlights,
  ai,
  getNoteSummary,
  getActionItems,
  speechToText,
} from './ai';
// Quiz pipeline callables
export { generateValidatedQuiz, extractTextFromFile, submitQuizAttempt, generateQuestionHint } from './quizPipeline';

if (admin.apps.length === 0) { admin.initializeApp(); }
const db = admin.firestore();

// ---- AI Tutor App (Express) ----
// Modular Express app to host tutor endpoints under one function URL.
const tutorApp = express();
// Middleware for JSON
tutorApp.use(express.json());

// Memory service: simple Firestore-based memory store (scaffold)
tutorApp.post('/memory/upsert', async (req, res) => {
  try {
    const { userId, items } = req.body || {};
  if (!userId || !Array.isArray(items)) return res.status(400).json({ error: 'Missing userId or items' });
    const col = db.collection(`users/${userId}/tutorMemory`);
    const batch = db.batch();
    items.forEach((it: any) => {
      const ref = it.id ? col.doc(it.id) : col.doc();
      batch.set(ref, { ...it, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  return res.json({ ok: true });
  } catch (e: any) {
  return res.status(500).json({ error: e?.message || 'memory upsert failed' });
  }
});

// Logging for compliance: consent, audit history
tutorApp.post('/logs', async (req, res) => {
  try {
    const { userId, event, payload } = req.body || {};
  if (!userId || !event) return res.status(400).json({ error: 'Missing userId or event' });
    await db.collection('tutorAuditLogs').add({ userId, event, payload: payload || null, ts: admin.firestore.FieldValue.serverTimestamp() });
  return res.json({ ok: true });
  } catch (e: any) {
  return res.status(500).json({ error: e?.message || 'log failed' });
  }
});

// Analytics stub: capture effectiveness/engagement
tutorApp.post('/analytics', async (req, res) => {
  try {
    const { userId, metrics } = req.body || {};
  if (!userId || !metrics) return res.status(400).json({ error: 'Missing userId or metrics' });
    await db.collection('tutorAnalytics').add({ userId, metrics, ts: admin.firestore.FieldValue.serverTimestamp() });
  return res.json({ ok: true });
  } catch (e: any) {
  return res.status(500).json({ error: e?.message || 'analytics write failed' });
  }
});

// Tutoring endpoint (RAG + Socratic dialog) — scaffold only; implement in services/tutor
tutorApp.post('/tutor', async (req, res) => {
  try {
  const { userId, message } = req.body || {};
  if (!userId || !message) return res.status(400).json({ error: 'Missing userId or message' });
    // TODO: integrate vector DB (Pinecone/Firestore vector), compose prompt for Socratic guidance,
    // and track memory. For now, return a placeholder.
    const reply = 'Let’s think step-by-step. What do you notice first about the problem?';
  return res.json({ reply, steps: ['Restate the question', 'Identify knowns', 'Propose a first step'] });
  } catch (e: any) {
  return res.status(500).json({ error: e?.message || 'tutor failed' });
  }
});

export const tutorApi = functions.https.onRequest(tutorApp);

// --- Legacy HTTPS Request Functions ---
// Exported with specific names for clarity in the Google Cloud Console.
export const aiSummarizeNote = summarizeNote;
export const aiExplainNote = explainNote;
export const aiGenerateFlashcards = generateFlashcards;
export const aiGenerateQuiz = generateQuiz;
export const aiHighlights = highlights;
export const aiSpeechToText = speechToText;

// --- Aggregated Express App for RESTful endpoints ---
export const aiEndpoints = ai;

// --- Modern, Secure Callable Functions ---
// These are the functions our client is now using.
export { getNoteSummary, getActionItems };

export const shareDeck = functions.https.onCall(async (data, context) => {
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
  if (deckData?.createdBy !== context.auth.uid && deckData?.collaborators?.[context.auth.uid]?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only the owner or an admin can share this deck.');
  }

  const newShareId = deckId; // For simplicity, using deckId as shareId for now
  const collaborators = { ...deckData?.collaborators || {}, ...permissions };

  await deckRef.update({
    isShared: true,
    shareId: newShareId,
    collaborators,
    'settings.isPublic': false, // Shared decks are not public by default
    'settings.allowComments': true, // Default settings
    'settings.allowEditing': true,
    expiresAt: expiresAt ? admin.firestore.Timestamp.fromMillis(expiresAt) : null,
  });

  return { success: true, shareId: newShareId };
});

export const inviteCollaborator = functions.https.onCall(async (data, context) => {
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

  if (deckData.createdBy !== context.auth.uid && deckData.collaborators?.[context.auth.uid]?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only the owner or an admin can invite collaborators.');
  }

  const userRecord = await admin.auth().getUserByEmail(email);
  const newCollaboratorId = userRecord.uid;

  if (deckData.collaborators?.[newCollaboratorId]) {
    throw new functions.https.HttpsError('already-exists', 'User is already a collaborator.');
  }

  const updatedCollaborators = {
    ...deckData.collaborators,
    [newCollaboratorId]: { role, joinedAt: admin.firestore.FieldValue.serverTimestamp(), displayName: userRecord.displayName || userRecord.email, photoURL: userRecord.photoURL },
  };

  await deckDoc.ref.update({ collaborators: updatedCollaborators });

  return { success: true };
});

export const updateCollaboratorRole = functions.https.onCall(async (data, context) => {
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

  if (deckData.createdBy !== context.auth.uid && deckData.collaborators?.[context.auth.uid]?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only the owner or an admin can update collaborator roles.');
  }

  if (!deckData.collaborators?.[userId]) {
    throw new functions.https.HttpsError('not-found', 'Collaborator not found.');
  }

  const updatedCollaborators = {
    ...deckData.collaborators,
    [userId]: { ...deckData.collaborators[userId], role: newRole },
  };

  await deckDoc.ref.update({ collaborators: updatedCollaborators });

  return { success: true };
});

export const removeDeckAccess = functions.https.onCall(async (data, context) => {
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

  if (deckData.createdBy !== context.auth.uid && deckData.collaborators?.[context.auth.uid]?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only the owner or an admin can remove collaborators.');
  }

  if (!deckData.collaborators?.[userId]) {
    throw new functions.https.HttpsError('not-found', 'Collaborator not found.');
  }

  const updatedCollaborators = { ...deckData.collaborators };
  delete updatedCollaborators[userId];

  await deckDoc.ref.update({ collaborators: updatedCollaborators });

  return { success: true };
});

export const cleanupInactivePresence = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
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
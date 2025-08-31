import { auth, db, firebaseProjectId } from '../common/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

// Build base URL for the tutorApi HTTPS function.
// NOTE: region defaults to us-central1 unless configured; update as needed.
const region = 'us-central1';
const baseUrl = `https://${region}-${firebaseProjectId}.cloudfunctions.net/tutorApi`;

export async function sendTutorMessage(sessionId: string, message: string): Promise<{ reply: string; steps?: string[] }>{
  const user = auth.currentUser;
  if (!user) throw new Error('Unauthenticated');
  const res = await fetch(`${baseUrl}/tutor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.uid, sessionId, message }),
  });
  if (!res.ok) throw new Error(`Tutor API error ${res.status}`);
  const data = await res.json();
  // Persist raw message locally under session for MVP history
  await addDoc(collection(db, `users/${user.uid}/tutorSessions/${sessionId}/messages`), {
    role: 'user', text: message, ts: serverTimestamp(),
  });
  await addDoc(collection(db, `users/${user.uid}/tutorSessions/${sessionId}/messages`), {
    role: 'tutor', text: data.reply, ts: serverTimestamp(),
  });
  return data;
}

export async function createSession(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Unauthenticated');
  const docRef = await addDoc(collection(db, `users/${user.uid}/tutorSessions`), {
    createdAt: serverTimestamp(),
    status: 'active',
  });
  return docRef.id;
}

export async function logCompliance(event: string, payload?: any) {
  const user = auth.currentUser;
  if (!user) return;
  // Immutable audit log is enforced server-side; client just posts events.
  await fetch(`${baseUrl}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.uid, event, payload }),
  });
}

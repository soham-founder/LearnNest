import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../../common/firebase';
import { useAuth } from '../../../context/AuthContext';

const TranscriptViewer: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Array<{ id: string; role: string; text: string }>>([]);

  useEffect(() => {
    if (!user || !sessionId) return;
    const col = collection(db, `users/${user.uid}/tutorSessions/${sessionId}/messages`);
    const q = query(col, orderBy('ts', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => unsub();
  }, [user, sessionId]);

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3">
      <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Transcript</h4>
      <div className="space-y-2 text-sm">
        {messages.map((m) => (
          <div key={m.id}>
            <span className="font-medium capitalize">{m.role}:</span> {m.text}
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-neutral-500 dark:text-neutral-400">No messages yet.</p>
        )}
      </div>
    </div>
  );
};

export default TranscriptViewer;

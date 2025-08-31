import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../../common/firebase';
import { useAuth } from '../../../context/AuthContext';

const SessionList: React.FC<{ onSelect: (id: string) => void; selectedId?: string }> = ({ onSelect, selectedId }) => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Array<{ id: string; createdAt?: any }>>([]);

  useEffect(() => {
    if (!user) return;
    const col = collection(db, `users/${user.uid}/tutorSessions`);
    const q = query(col, orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() as any })));
    });
    return () => unsub();
  }, [user]);

  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={`w-full text-left px-3 py-2 rounded-lg border ${selectedId === s.id ? 'border-primary-sky-blue bg-blue-50' : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-700'}`}
        >
          Session {s.id.slice(0, 6)}
        </button>
      ))}
      {sessions.length === 0 && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No sessions yet.</p>
      )}
    </div>
  );
};

export default SessionList;

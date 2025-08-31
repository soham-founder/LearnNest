import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../common/firebase';
import { collection, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import type { AnalyticsRecord, DeckId } from '../types/flashcards';

export function useAnalytics(deckId: DeckId | null, opts?: { start?: Date; end?: Date }) {
  const [rows, setRows] = useState<AnalyticsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deckId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setError(null);
      setRows([]);
      if (!user) { setLoading(false); return; }

      const clauses: any[] = [];
      if (opts?.start) clauses.push(where('reviewedAt', '>=', Timestamp.fromDate(opts.start)));
      if (opts?.end) clauses.push(where('reviewedAt', '<=', Timestamp.fromDate(opts.end)));

      const q = query(collection(db, `users/${user.uid}/flashcards/${deckId}/analytics`), ...clauses, orderBy('reviewedAt', 'desc'));
      const unsub = onSnapshot(q, (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as AnalyticsRecord));
        setRows(items);
        setLoading(false);
      }, (err) => { setError(err.message); setLoading(false); });
      return () => unsub();
    });
    return () => unsubAuth();
  }, [deckId, opts?.start?.getTime(), opts?.end?.getTime()]);

  const summary = useMemo(() => {
    const total = rows.length;
    const correct = rows.filter(r => r.correct).length;
    const timeStudiedSec = Math.round(rows.reduce((acc, r) => acc + (r.timeToAnswerMs || 0), 0) / 1000);
    return { total, correct, accuracy: total ? correct / total : 0, timeStudiedSec };
  }, [rows]);

  return { rows, summary, loading, error } as const;
}

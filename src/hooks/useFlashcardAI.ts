import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../common/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import type { AIJob } from '../types/flashcards';

export type Schedule = {
  date: string; // YYYY-MM-DD
  dueCount: number;
  recommendedMinutes: number;
};

// Hook to watch AI jobs for the current user (optionally filter by deck)
export function useFlashcardAI(opts?: { deckId?: string }) {
  const [jobs, setJobs] = useState<AIJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setError(null);
      setJobs([]);
      if (!user) { setLoading(false); return; }

      const q = query(collection(db, `users/${user.uid}/aiJobs`), orderBy('updatedAt', 'desc'));
      const unsub = onSnapshot(q, (snap) => {
        const items = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) } as AIJob))
          .filter(j => (opts?.deckId ? j.input?.deckId === opts.deckId : true));
        setJobs(items);
        setLoading(false);
      }, (err) => { setError(err.message); setLoading(false); });
      return () => unsub();
    });
    return () => unsubAuth();
  }, [opts?.deckId]);

  return { jobs, loading, error } as const;
}

// Backwards-compat helpers (thin shims)
export async function generateCardsFromNotes(_notes: string, _deckId: string): Promise<void> {
  // Deprecated in favor of Cloud Functions / AI jobs flow. Intentionally no-op here.
  return Promise.resolve();
}

export async function getContextualHelper(_cardIdOrQuestion: string): Promise<string> {
  return '';
}

export async function planStudySchedule(_deckId: string): Promise<Schedule> {
  return { date: new Date().toISOString().slice(0,10), dueCount: 0, recommendedMinutes: 15 };
}

// Simple helper: derive latest job for a deck
export function useLatestDeckJob(deckId?: string) {
  const { jobs } = useFlashcardAI(deckId ? { deckId } : undefined);
  return jobs[0];
}

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../common/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import type { Deck } from '../types/flashcards';

export function useDecks() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setError(null);
      setDecks([]);
      if (!user) {
        setLoading(false);
        return;
      }
  // Order by position if present, then updatedAt as tie-breaker
  const q = query(collection(db, `users/${user.uid}/flashcards`), orderBy('position', 'asc'), orderBy('updatedAt', 'desc'));
      const unsub = onSnapshot(q, (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Deck));
        setDecks(items);
        setLoading(false);
      }, (err) => { setError(err.message); setLoading(false); });
      return () => unsub();
    });
    return () => unsubAuth();
  }, []);

  return { decks, loading, error } as const;
}

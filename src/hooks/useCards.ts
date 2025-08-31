import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../common/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import type { DeckId, Flashcard } from '../types/flashcards';

export function useCards(deckId: DeckId | null) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deckId) { setCards([]); setLoading(false); return; }
    setLoading(true);
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setError(null);
      setCards([]);
      if (!user) { setLoading(false); return; }
      const q = query(collection(db, `users/${user.uid}/flashcards/${deckId}/cards`), orderBy('srs.dueDate', 'asc'));
      const unsub = onSnapshot(q, (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Flashcard));
        setCards(items);
        setLoading(false);
      }, (err) => { setError(err.message); setLoading(false); });
      return () => unsub();
    });
    return () => unsubAuth();
  }, [deckId]);

  return { cards, loading, error } as const;
}

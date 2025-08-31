import React, { createContext, useContext, useMemo, useState } from 'react';
import type { DeckId, Flashcard, CardRating } from '../types/flashcards';

export interface ReviewStats {
  total: number;
  index: number; // 0-based
  answered: number;
  correct: number;
  progressPct: number;
  startedAt: number; // epoch ms
}

interface ReviewSessionContextValue {
  deckId: DeckId;
  cards: Flashcard[];
  current: Flashcard | null;
  stats: ReviewStats;
  setIndex: (i: number) => void;
  next: () => void;
  onRated: (cardId: string, rating: CardRating, correct: boolean) => void;
}

const ReviewSessionContext = createContext<ReviewSessionContextValue | undefined>(undefined);

export const ReviewSessionProvider: React.FC<{ deckId: DeckId; cards: Flashcard[]; children: React.ReactNode; }>
  = ({ deckId, cards, children }) => {
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  const startedAt = useMemo(() => Date.now(), []);

  const current = cards[index] || null;
  const progressPct = cards.length ? Math.min(100, Math.round((index / cards.length) * 100)) : 100;
  const stats: ReviewStats = { total: cards.length, index, answered, correct, progressPct, startedAt };

  const next = () => setIndex(i => Math.min(i + 1, Math.max(cards.length - 1, 0)));
  const onRated = (_cardId: string, _rating: CardRating, wasCorrect: boolean) => {
    setAnswered(v => v + 1);
    if (wasCorrect) setCorrect(v => v + 1);
  };

  const value: ReviewSessionContextValue = { deckId, cards, current, stats, setIndex, next, onRated };
  return <ReviewSessionContext.Provider value={value}>{children}</ReviewSessionContext.Provider>;
};

export const useReviewSession = () => {
  const ctx = useContext(ReviewSessionContext);
  if (!ctx) throw new Error('useReviewSession must be used within ReviewSessionProvider');
  return ctx;
};

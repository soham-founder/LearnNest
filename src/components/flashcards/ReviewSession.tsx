import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import type { DeckId, Flashcard, CardRating } from '../../types/flashcards';
import ReviewView from './ReviewView';
import { ReviewSessionProvider, useReviewSession } from '../../context/ReviewSessionContext';
import { useAuth } from '../../context/AuthContext';
import { FlashcardService } from '../../services/FlashcardService';
// AI hinting is handled inside ReviewView directly.

export interface ReviewSessionProps {
  deckId: DeckId;
  cards: Flashcard[];
}

type StudyMode = 'review-due' | 'learn-new' | 'cram-all' | 'test';

interface PersistedState {
  mode: StudyMode;
  order: string[]; // card ids in order
  index: number;
  answered: number;
  correct: number;
  startedAt: number; // epoch ms
  elapsedMs: number;
  paused: boolean;
  goals?: { targetCards?: number; targetMinutes?: number };
  perCardMs?: number[]; // durations per answered card
}

const storageKey = (deckId: DeckId) => `reviewSession.v1.${deckId}`;

const ReviewController = ({ deckId, mode, goals, onPauseChange, paused, elapsedMs, onElapsedTick, perCardMs, addCardDuration, recoverable }: {
  deckId: DeckId;
  mode: StudyMode;
  goals?: { targetCards?: number; targetMinutes?: number };
  paused: boolean;
  onPauseChange: (p: boolean) => void;
  elapsedMs: number;
  onElapsedTick: (ms: number) => void;
  perCardMs: number[];
  addCardDuration: (ms: number) => void;
  recoverable?: boolean;
}) => {
  const { user } = useAuth();
  const { current, onRated, stats } = useReviewSession();
  const cardStartRef = useRef<number | null>(null);
  // Hints are handled within ReviewView; no local hint state here.

  // start timing for current card
  useEffect(() => {
    cardStartRef.current = Date.now();
  // no-op
  }, [current?.id]);

  useEffect(() => {
    // prefetch anything if needed
  }, [current?.id]);

  const handleRate = async (cardId: string, rating: CardRating) => {
    if (!user || !current) return;
    // track duration for this card
    if (cardStartRef.current) {
      addCardDuration(Date.now() - cardStartRef.current);
      cardStartRef.current = null;
    }
    // compute schedule for modes that affect SRS
    if (mode === 'review-due' || mode === 'learn-new') {
      const nextSrs = FlashcardService.schedule({ rating, srs: current.srs, difficulty: (current as any).difficulty ?? 5 });
      await FlashcardService.updateCard(user.uid, deckId, cardId as any, { srs: nextSrs } as any);
    }
    await FlashcardService.recordAnalytics(user.uid, deckId, {
      cardId: cardId as any,
      deckId,
      sessionId: `${deckId}-${Date.now()}`,
      reviewedAt: Timestamp.now(),
      rating,
  correct: rating === 'good' || rating === 'easy',
  difficulty: (current as any).difficulty ?? 5,
      userId: user.uid,
    } as any);
    onRated(cardId, rating, rating === 'good' || rating === 'easy');
    // no-op
  };

  // pause timer ticker in parent
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => onElapsedTick(1000), 1000);
    return () => clearInterval(id);
  }, [paused, onElapsedTick]);

  return <ReviewView dueCards={[]} onRate={handleRate} paused={paused} onPauseToggle={()=>onPauseChange(!paused)}
    remaining={Math.max(0, stats.total - (stats.index + 1))} progressPct={stats.progressPct} mode={mode} goals={goals}
    elapsedMs={elapsedMs} perCardMs={perCardMs} recoverable={recoverable} />;
};

const ReviewSession = ({ deckId, cards }: ReviewSessionProps) => {
  const [mode, setMode] = useState<StudyMode>('review-due');
  const [goals, setGoals] = useState<{ targetCards?: number; targetMinutes?: number }>({});
  const [paused, setPaused] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [perCardMs, setPerCardMs] = useState<number[]>([]);
  const [recoverable, setRecoverable] = useState(false);

  // load persisted state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(deckId));
      if (!raw) return;
      const saved = JSON.parse(raw) as PersistedState;
      if (!saved || !Array.isArray(saved.order)) return;
      setMode(saved.mode);
      setPaused(saved.paused);
      setElapsedMs(saved.elapsedMs || 0);
      setGoals(saved.goals || {});
      setPerCardMs(saved.perCardMs || []);
      setRecoverable(true);
    } catch {}
  }, [deckId]);

  const persist = useCallback((ctx?: { order?: string[]; index?: number; answered?: number; correct?: number }) => {
    try {
      const raw = localStorage.getItem(storageKey(deckId));
      const existing = raw ? (JSON.parse(raw) as PersistedState) : ({} as PersistedState);
      const next: PersistedState = {
        mode,
        order: ctx?.order || existing.order || cards.map(c => c.id),
        index: ctx?.index ?? existing.index ?? 0,
        answered: ctx?.answered ?? existing.answered ?? 0,
        correct: ctx?.correct ?? existing.correct ?? 0,
        startedAt: existing.startedAt || Date.now(),
        elapsedMs,
        paused,
        goals,
        perCardMs,
      };
      localStorage.setItem(storageKey(deckId), JSON.stringify(next));
    } catch {}
  }, [deckId, mode, elapsedMs, paused, goals, perCardMs, cards]);

  // filtered cards based on mode
  const filtered = useMemo(() => {
    const now = Date.now();
    if (mode === 'learn-new') return cards.filter(c => (c.srs.repetitions || 0) === 0);
    if (mode === 'review-due') return cards.filter(c => (c.srs.dueDate?.toMillis?.() ?? 0) <= now);
    if (mode === 'cram-all' || mode === 'test') return cards;
    return cards;
  }, [cards, mode]);

  const [resume, setResume] = useState<boolean>(false);

  // compute cards to pass (resume support): order from persisted state if matching
  const orderedCards = useMemo(() => {
    try {
      const raw = localStorage.getItem(storageKey(deckId));
      const saved = raw ? (JSON.parse(raw) as PersistedState) : undefined;
      if (resume && saved?.order) {
        const byId: Record<string, Flashcard> = Object.fromEntries(filtered.map(c => [c.id, c]));
        return saved.order.map(id => byId[id]).filter(Boolean);
      }
    } catch {}
    return filtered;
  }, [filtered, deckId, resume]);

  // save periodically
  useEffect(() => {
    const id = setInterval(() => persist(), 5000);
    return () => clearInterval(id);
  }, [persist]);

  const handleElapsedTick = (ms: number) => setElapsedMs(v => v + ms);
  const handleAddCardDuration = (ms: number) => setPerCardMs(v => [...v, ms]);

  if (!filtered.length) return <div className="p-6 text-sm opacity-70">No cards for this mode.</div>;

  return (
    <div className="fixed inset-0 bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Session header to pick mode/goals and resume */}
      <div className="h-14 px-4 border-b border-neutral-800 flex items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm opacity-80">Mode</label>
          <select className="px-2 py-1 rounded bg-neutral-900 border border-neutral-700" value={mode} onChange={e=>setMode(e.target.value as StudyMode)}>
            <option value="review-due">Review Due</option>
            <option value="learn-new">Learn New</option>
            <option value="cram-all">Cram All</option>
            <option value="test">Test Mode</option>
          </select>
          <label className="ml-3 text-sm opacity-80">Goal</label>
          <input type="number" min={1} className="w-24 px-2 py-1 rounded bg-neutral-900 border border-neutral-700" placeholder="# cards" value={goals.targetCards ?? ''} onChange={e=>setGoals(g=>({ ...g, targetCards: e.target.value ? Number(e.target.value) : undefined }))} />
          <input type="number" min={1} className="w-24 px-2 py-1 rounded bg-neutral-900 border border-neutral-700" placeholder="minutes" value={goals.targetMinutes ?? ''} onChange={e=>setGoals(g=>({ ...g, targetMinutes: e.target.value ? Number(e.target.value) : undefined }))} />
        </div>
        <div className="flex items-center gap-2">
          {recoverable && !resume && (
            <button className="px-3 py-1.5 rounded bg-primary-sky-blue text-white" onClick={()=>setResume(true)}>Resume</button>
          )}
          <button className="px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700" onClick={()=>{ setElapsedMs(0); setPerCardMs([]); setResume(false); setRecoverable(false); localStorage.removeItem(storageKey(deckId)); }}>Reset Session</button>
          <button className="px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700" onClick={()=>setPaused(p=>!p)}>{paused ? 'Resume' : 'Pause'}</button>
        </div>
      </div>

      <ReviewSessionProvider deckId={deckId} cards={orderedCards}>
        <ReviewController deckId={deckId} mode={mode} goals={goals} paused={paused} onPauseChange={setPaused}
          elapsedMs={elapsedMs} onElapsedTick={handleElapsedTick} perCardMs={perCardMs} addCardDuration={handleAddCardDuration} recoverable={recoverable} />
      </ReviewSessionProvider>
    </div>
  );
};

export default ReviewSession;

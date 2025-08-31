import React, { useEffect, useMemo, useRef, useState } from 'react';
import Markdown from '../Markdown';
import type { Flashcard, CardRating } from '../../types/flashcards';
import { motion, AnimatePresence } from 'framer-motion';
import { useReviewSession } from '../../context/ReviewSessionContext';
import { FlashcardAIService } from '../../services/FlashcardAIService';

interface Props {
  dueCards: Flashcard[];
  onRate: (cardId: string, rating: CardRating) => Promise<void>;
  paused?: boolean;
  onPauseToggle?: () => void;
  remaining?: number;
  progressPct?: number;
  mode?: 'review-due' | 'learn-new' | 'cram-all' | 'test';
  goals?: { targetCards?: number; targetMinutes?: number };
  elapsedMs?: number;
  perCardMs?: number[];
  recoverable?: boolean;
}

const ProgressRing = ({ value }: { value: number }) => {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" role="img" aria-label={`Progress ${Math.round(value)}%`}>
      <circle cx="24" cy="24" r={radius} stroke="#2e2e2e" strokeWidth="6" fill="none" />
      <circle cx="24" cy="24" r={radius} stroke="#22d3ee" strokeWidth="6" fill="none"
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  );
};

const RenderCard = ({ card, show }: { card: Flashcard; show: boolean }) => {
  if (card.type === 'basic') {
    return (
      <div className="w-full h-full relative preserve-3d transition-transform duration-700 rounded-2xl shadow-soft">
        <div className="absolute w-full h-full backface-hidden bg-neutral-900 p-6 rounded-2xl text-lg overflow-auto">
          <Markdown className="markdown">{card.question}</Markdown>
        </div>
        {show && (
          <div className="absolute w-full h-full backface-hidden bg-neutral-800 p-6 rounded-2xl text-lg overflow-auto">
            <Markdown className="markdown">{card.answer}</Markdown>
          </div>
        )}
      </div>
    );
  }
  if (card.type === 'mcq') {
    return (
      <div className="w-full h-full bg-neutral-900 p-6 rounded-2xl">
        <div className="text-lg font-semibold mb-4">{card.prompt}</div>
        <ul className="space-y-2">
          {card.options.map((opt, i) => (
            <li key={i} className={`px-3 py-2 rounded border border-neutral-700 ${show && i === card.correctIndex ? 'bg-emerald-600/20 border-emerald-600' : ''}`}>{opt}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (card.type === 'tf') {
    return (
      <div className="w-full h-full bg-neutral-900 p-6 rounded-2xl flex items-center justify-center text-2xl">
        {card.statement}
        {show && <div className="absolute bottom-4 text-sm opacity-80">Answer: {card.answer ? 'True' : 'False'}</div>}
      </div>
    );
  }
  if (card.type === 'cloze') {
    const masked = card.text.replace(/\{\{c\d+::(.*?)\}\}/g, show ? '$1' : '____');
    return (
      <div className="w-full h-full bg-neutral-900 p-6 rounded-2xl whitespace-pre-wrap text-lg">
        {masked}
      </div>
    );
  }
  return <div>Unsupported card type</div>;
};

const ReviewView: React.FC<Props> = ({ dueCards, onRate, paused, onPauseToggle, remaining, progressPct, goals, elapsedMs = 0, perCardMs = [], recoverable }) => {
  const [show, setShow] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<'hint' | null>(null);
  const { current, next, stats } = useReviewSession();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!current) return;
      if (e.key === '?') { e.preventDefault(); setShowShortcuts(v=>!v); return; }
      if (e.key.toLowerCase() === 'p') { e.preventDefault(); onPauseToggle?.(); return; }
      if (e.key.toLowerCase() === 's') { e.preventDefault(); setShowStats(v=>!v); return; }
      if (e.key.toLowerCase() === 't') { e.preventDefault(); speakCurrent(); return; }
      if (e.key === ' ') { e.preventDefault(); setShow(s=>!s); }
      if (!show) return;
      if (e.key === '1') handleRate('again');
      if (e.key === '2') handleRate('hard');
      if (e.key === '3') handleRate('good');
      if (e.key === '4') handleRate('easy');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, show]);

  // Touch swipe gestures (left/right rate, up hint, down skip)
  useEffect(() => {
    let startX = 0, startY = 0;
    let endX = 0, endY = 0;
    const onTouchStart = (e: TouchEvent) => { startX = e.changedTouches[0].clientX; startY = e.changedTouches[0].clientY; };
    const onTouchEnd = (e: TouchEvent) => {
      endX = e.changedTouches[0].clientX; endY = e.changedTouches[0].clientY;
      const dx = endX - startX; const dy = endY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
        // Right swipe = easy, Left swipe = again
        if (dx > 0) handleRate('easy'); else handleRate('again');
      } else if (Math.abs(dy) > 60) {
        if (dy < 0) { // up = hint
          if (!aiLoading && current) { void requestHint(); }
        } else { // down = skip
          skipCard();
        }
      }
    };
    window.addEventListener('touchstart', onTouchStart);
    window.addEventListener('touchend', onTouchEnd);
    return () => { window.removeEventListener('touchstart', onTouchStart); window.removeEventListener('touchend', onTouchEnd); };
  }, [current, show]);

  const handleRate = async (rating: CardRating) => {
    if (!current) return;
    await onRate(current.id, rating);
    setShow(false);
    setAiText(null);
    next();
  };

  const skipCard = () => {
    if (!current) return;
    setShow(false);
    setAiText(null);
    next();
  };

  const requestHint = async () => {
    if (!current) return;
    setAiLoading('hint');
    try {
      const hint = await FlashcardAIService.generateHint(current.deckId, current.id);
      setAiText(hint || 'Here is a hint to guide you.');
    } catch (e:any) { setAiText(e?.message || 'AI hint unavailable.'); } finally { setAiLoading(null); }
  };

  const speakCurrent = () => {
    try {
      const synth = synthRef.current;
      if (!synth) return;
      if (synth.speaking) synth.cancel();
      const text = current ? (current.type === 'basic' ? (!show ? current.question : current.answer) : current.type === 'mcq' ? current.prompt : current.type === 'tf' ? current.statement : (current as any).text) : '';
      if (!text) return;
      const utter = new SpeechSynthesisUtterance(text.replace(/[#*_`>\-]/g, ' '));
      utter.rate = 1.0; utter.pitch = 1.0;
      utterRef.current = utter;
      synth.speak(utter);
    } catch {}
  };

  const elapsedText = useMemo(() => {
    const total = Math.max(0, Math.floor((elapsedMs || 0) / 1000));
    const h = Math.floor(total / 3600).toString().padStart(2, '0');
    const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(total % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }, [elapsedMs]);

  const avgMs = useMemo(() => {
    if (!perCardMs.length) return 0;
    return Math.round(perCardMs.reduce((a, b) => a + b, 0) / perCardMs.length);
  }, [perCardMs]);

  if (dueCards.length === 0) return (
    <div className="p-8 text-center opacity-70">All caught up! No cards due.</div>
  );

  return (
    <div className="fixed inset-0 bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="h-14 flex items-center justify-between px-4 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <ProgressRing value={progressPct ?? stats.progressPct} />
          <div className="text-sm opacity-80">{stats.index + 1} / {stats.total} <span className="ml-2 opacity-60">({remaining ?? Math.max(0, stats.total - (stats.index + 1))} left)</span></div>
          {paused && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-yellow-900/40 border border-yellow-700">Paused</span>}
          {recoverable && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-900/30 border border-emerald-700">Recovered</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs opacity-80 tabular-nums">{elapsedText}</div>
          <button
            onClick={()=>setShow(s=>!s)}
            className="px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            aria-pressed={show}
          >{show ? 'Hide' : 'Show'}</button>
          <button
            disabled={!!aiLoading || !current}
            onClick={requestHint}
            className="px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >{aiLoading ? 'Hint…' : 'Hint'}</button>
          <button
            disabled={!current}
            onClick={speakCurrent}
            className="px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >Speak</button>
          <button
            onClick={onPauseToggle}
            className="px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700"
          >{paused ? 'Resume' : 'Pause'}</button>
          <button
            onClick={()=>setShowShortcuts(true)}
            className="px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700"
            title="Keyboard shortcuts (?)"
          >?</button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl h-[60vh]">
          <AnimatePresence mode="popLayout">
            <motion.div key={current?.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="relative w-full h-full">
              {current && <RenderCard card={current} show={show} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {aiText && (
        <div className="px-4 mb-2">
          <div className="max-w-2xl mx-auto p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-sm">{aiText}</div>
        </div>
      )}

      <footer className="h-20 border-t border-neutral-800 flex items-center justify-center gap-2 px-4">
        {show ? (
          <div className="flex gap-2">
            <button onClick={()=>handleRate('again')} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300" aria-label="Rate again">Again</button>
            <button onClick={()=>handleRate('hard')} className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300" aria-label="Rate hard">Hard</button>
            <button onClick={()=>handleRate('good')} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300" aria-label="Rate good">Good</button>
            <button onClick={()=>handleRate('easy')} className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-300" aria-label="Rate easy">Easy</button>
          </div>
        ) : (
          <div className="text-sm opacity-70">Tap Show or press Space to reveal</div>
        )}
      </footer>

      {/* Shortcuts overlay */}
      {showShortcuts && (
        <div role="dialog" aria-modal className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setShowShortcuts(false)} />
          <div className="relative z-50 w-full max-w-lg p-4 rounded-xl border border-neutral-700 bg-neutral-900">
            <h3 className="font-semibold mb-2">Keyboard & Gestures</h3>
            <ul className="text-sm space-y-1 opacity-90">
              <li><b>Space</b>: Show/Hide answer</li>
              <li><b>1/2/3/4</b>: Again/Hard/Good/Easy</li>
              <li><b>T</b>: Text-to-Speech (current side)</li>
              <li><b>P</b>: Pause/Resume</li>
              <li><b>S</b>: Toggle Stats</li>
              <li><b>?</b>: Toggle this help</li>
              <li><b>Swipe Left/Right</b>: Again/Easy</li>
              <li><b>Swipe Up</b>: Hint</li>
              <li><b>Swipe Down</b>: Skip</li>
            </ul>
            <div className="mt-3 text-right">
              <button className="px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700" onClick={()=>setShowShortcuts(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Stats overlay */}
      {showStats && (
        <div role="dialog" aria-modal className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setShowStats(false)} />
          <div className="relative z-50 w-full max-w-md p-4 rounded-xl border border-neutral-700 bg-neutral-900">
            <h3 className="font-semibold mb-2">Session Stats</h3>
            <div className="text-sm space-y-1">
              <div>Answered: {stats.answered}</div>
              <div>Accuracy: {stats.answered ? Math.round((stats.correct / Math.max(1, stats.answered)) * 100) : 0}%</div>
              <div>Avg time/card: {Math.round(avgMs/100)/10}s</div>
              {goals?.targetCards && <div>Cards goal: {stats.answered}/{goals.targetCards} {stats.answered >= goals.targetCards ? '✓' : ''}</div>}
              {goals?.targetMinutes && <div>Time goal: {Math.round((elapsedMs||0)/60000)}/{goals.targetMinutes} min {((elapsedMs||0)/60000) >= (goals.targetMinutes||Infinity) ? '✓' : ''}</div>}
            </div>
            <div className="mt-3 text-right">
              <button className="px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700" onClick={()=>setShowStats(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewView;

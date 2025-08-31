import { useEffect, useMemo, useState } from 'react';
import type { Deck } from '../types/flashcards';

export type DeckFilter = 'all' | 'favorites' | 'archived' | 'active';

export type DueFilter = 'any' | 'hasDue' | 'noDue';

export interface AdvancedDeckFilters {
  subject?: string;            // exact match from existing subjects
  minDifficulty?: number;      // 1..10
  maxDifficulty?: number;      // 1..10
  lastStudiedFrom?: string;    // ISO date (yyyy-mm-dd)
  lastStudiedTo?: string;      // ISO date
  due?: DueFilter;             // due cards filter
}

const STORAGE_KEY = 'deckFilters.v1';

export function useDeckSearchFilter(decks: Deck[]) {
  // base filters
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DeckFilter>('all');
  // advanced filters
  const [adv, setAdv] = useState<AdvancedDeckFilters>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { due: 'any' };
      const parsed = JSON.parse(raw);
      return { due: 'any', ...parsed } as AdvancedDeckFilters;
    } catch {
      return { due: 'any' };
    }
  });

  // persist
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(adv));
    } catch {}
  }, [adv]);

  // normalize query once
  const q = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    const list = decks || [];
    let stage = list;
    if (filter === 'favorites') stage = stage.filter(d => (d.tags || []).includes('favorite'));
    if (filter === 'archived') stage = stage.filter(d => (d as any).archived === true);
    if (filter === 'active') stage = stage.filter(d => !(d as any).archived);
    // advanced: subject
    if (adv.subject) stage = stage.filter(d => (d.subject || '').toLowerCase() === adv.subject!.toLowerCase());
    // advanced: difficulty
    if (adv.minDifficulty || adv.maxDifficulty) {
      const min = adv.minDifficulty ?? 1;
      const max = adv.maxDifficulty ?? 10;
      stage = stage.filter(d => {
        const dif = (d.difficulty ?? 5);
        return dif >= min && dif <= max;
      });
    }
    // advanced: last studied date range
    if (adv.lastStudiedFrom || adv.lastStudiedTo) {
      const from = adv.lastStudiedFrom ? new Date(adv.lastStudiedFrom).getTime() : -Infinity;
      const to = adv.lastStudiedTo ? new Date(adv.lastStudiedTo).getTime() + 24*60*60*1000 - 1 : Infinity; // inclusive end of day
      stage = stage.filter(d => {
        const t = (d as any).lastStudied ? (d as any).lastStudied.toMillis?.() ?? new Date((d as any).lastStudied).getTime() : undefined;
        if (t == null) return false; // if filtering by date, require value
        return t >= from && t <= to;
      });
    }
    // advanced: due cards
    if (adv.due && adv.due !== 'any') {
      stage = stage.filter(d => {
        const due = d.dueTodayCount || 0;
        return adv.due === 'hasDue' ? due > 0 : due === 0;
      });
    }
    const bySearch = q
      ? stage.filter(d =>
          d.name.toLowerCase().includes(q) ||
          (d.description || '').toLowerCase().includes(q) ||
          (d.tags || []).some(t => t.toLowerCase().includes(q))
        )
      : stage;
    return bySearch;
  }, [decks, q, filter, adv]);

  // helpers
  const isFavorite = (d: Deck) => (d.tags || []).includes('favorite');

  // subjects list from decks
  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const d of decks) if (d.subject) set.add(d.subject);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [decks]);

  const resetFilters = () => setAdv({ due: 'any' });

  return { search, setSearch, filter, setFilter, filteredDecks: filtered, isFavorite, adv, setAdv, subjects, resetFilters } as const;
}

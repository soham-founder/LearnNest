import { useEffect, useMemo, useState } from 'react';
import type { DeckId, Flashcard } from '../../types/flashcards';
import { useToast, Toast } from '../Toast';
import { useAuth } from '../../context/AuthContext';
import { FlashcardService } from '../../services/FlashcardService';
import { useDecks } from '../../hooks/useDecks';

export interface CardListProps {
  cards: Flashcard[];
  deckId?: DeckId;
  onEdit?: (card: Flashcard) => void;
  onDelete?: (cardId: string) => void;
}

const CardList = ({ cards, deckId, onEdit, onDelete }: CardListProps) => {
  const { user } = useAuth();
  const { decks } = useDecks();
  const { toast, show, clear } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<DeckId | ''>('');
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [undoState, setUndoState] = useState<{ items: Array<Omit<Flashcard, 'id' | 'createdAt' | 'updatedAt'>>; count: number; timeoutId: any } | null>(null);
  const [deckSearch, setDeckSearch] = useState('');
  const [tagIndex, setTagIndex] = useState<Record<string, number>>({});
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [minDiff, setMinDiff] = useState<number | ''>('');
  const [maxDiff, setMaxDiff] = useState<number | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState(''); // debounced
  const [page, setPage] = useState(1);
  const pageSize = 100; // simple client-side pagination guard
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagAction, setTagAction] = useState<'add' | 'remove'>('add');
  const [tagText, setTagText] = useState('');

  const renderHighlight = (text: string, q: string) => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return (
      <>
        {before}
        <mark className="bg-yellow-600/40 rounded px-0.5">{match}</mark>
        {after}
      </>
    );
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!user || !deckId) return;
        const idx = await FlashcardService.getDeckTagIndex(user.uid, deckId);
        if (active) setTagIndex(idx);
      } catch {}
    })();
    return () => { active = false; };
  }, [user, deckId, cards.length]);

  // initialize search from URL (no router dependency)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q') || '';
      if (q) {
        setSearchInput(q);
        setSearch(q);
      }
    } catch {}
  }, []);

  // debounce input -> search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
      try {
        const url = new URL(window.location.href);
        if (searchInput.trim()) url.searchParams.set('q', searchInput.trim());
        else url.searchParams.delete('q');
        window.history.replaceState({}, '', url.toString());
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filterByTags = (items: Flashcard[], selected: string[]) => {
    if (!selected.length) return items;
    const wanted = selected.map(s => s.toLowerCase());
    return items.filter(c => {
      const tags = ((c as any).tags as string[] | undefined)?.map(t => t.toLowerCase()) || [];
      return wanted.every(w => tags.includes(w));
    });
  };
  const searchMatch = (c: Flashcard, q: string) => {
    if (!q) return true;
    const lc = q.toLowerCase();
    const tags = ((c as any).tags as string[] | undefined)?.join(' ') || '';
    let text = '';
    if ('question' in c) text = `${c.question} ${c.answer}`;
    else if ('prompt' in (c as any)) text = `${(c as any).prompt} ${(c as any).options?.join(' ') || ''} ${(c as any).explanation || ''}`;
    else if ('statement' in (c as any)) text = `${(c as any).statement} ${(c as any).explanation || ''}`;
    else if ('text' in (c as any)) text = `${(c as any).text}`;
    const hay = `${text} ${tags}`.toLowerCase();
    return hay.includes(lc);
  };

  const filteredCards: Flashcard[] = useMemo(() => {
    const svc: any = FlashcardService as any;
  const byTags = typeof svc.filterCardsByTags === 'function' ? svc.filterCardsByTags(cards, activeTags) : filterByTags(cards, activeTags);
  const bySearch = search ? byTags.filter((c: Flashcard) => searchMatch(c, search)) : byTags;
    const byDiff = bySearch.filter((c: any) => {
      const d = typeof c.difficulty === 'number' ? c.difficulty : 5;
      const okMin = minDiff === '' ? true : d >= (minDiff as number);
      const okMax = maxDiff === '' ? true : d <= (maxDiff as number);
      return okMin && okMax;
    });
    return byDiff;
  }, [cards, activeTags, search]);
  const allIds = useMemo(() => filteredCards.map((c: Flashcard) => c.id), [filteredCards]);
  const allChecked = selected.size > 0 && selected.size === allIds.length;
  const anyChecked = selected.size > 0;

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected(prev => prev.size === allIds.length ? new Set() : new Set(allIds));
  };
  const resetSelection = () => setSelected(new Set());

  const handleDeleteSelected = async () => {
    if (!user || !deckId) return;
    setConfirmOpen(false);
    setDeleting(true);
    const ids = Array.from(selected);
    // Snapshot payloads for undo (best-effort; exclude id and timestamps)
    const snapshot = cards
      .filter(c => selected.has(c.id))
      .map((c) => {
        const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = c as any;
        return { ...rest } as Omit<Flashcard, 'id' | 'createdAt' | 'updatedAt'>;
      });
    try {
      await FlashcardService.deleteCards(user.uid, deckId, ids as any);
      show(`${ids.length} card(s) deleted. Undo?`, 'info');
      // Undo timer
      const timeoutId = setTimeout(() => setUndoState(null), 15000);
      setUndoState({ items: snapshot, count: ids.length, timeoutId });
      resetSelection();
    } catch (e:any) {
      show(e?.message || 'Failed to delete cards', 'error');
    } finally { setDeleting(false); }
  };

  const handleUndoDelete = async () => {
    if (!user || !deckId || !undoState) return;
    clearTimeout(undoState.timeoutId);
    try {
      for (const item of undoState.items) {
        await FlashcardService.addCard(user.uid, deckId, item as any);
      }
      show(`Restored ${undoState.count} card(s)`, 'success');
    } catch (e:any) {
      show(e?.message || 'Failed to undo delete', 'error');
    } finally {
      setUndoState(null);
    }
  };

  const handleMoveSelected = async () => {
    if (!user || !deckId || !moveTarget) return;
    setMoving(true);
    const ids = Array.from(selected);
    try {
      await FlashcardService.moveCards(user.uid, ids as any, deckId, moveTarget as DeckId);
      show(`Moved ${ids.length} card(s)`, 'success');
      setMoveOpen(false);
      resetSelection();
    } catch (e:any) { show(e?.message || 'Failed to move cards', 'error'); }
    finally { setMoving(false); }
  };

  const handleApplyTags = async () => {
    if (!user || !deckId) return;
    const ids = Array.from(selected);
    const tags = tagText.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    if (!ids.length || !tags.length) { setTagModalOpen(false); return; }
    try {
      if (tagAction === 'add') await FlashcardService.addTagsToCards(user.uid, deckId, ids as any, tags);
      else await FlashcardService.removeTagsFromCards(user.uid, deckId, ids as any, tags);
      show(`${tagAction === 'add' ? 'Updated' : 'Removed'} tags for ${ids.length} card(s)`, 'success');
      setTagModalOpen(false);
      setTagText('');
      resetSelection();
    } catch (e:any) { show(e?.message || 'Failed to update tags', 'error'); }
  };

  const totalResults = filteredCards.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const pagedCards = useMemo(() => filteredCards.slice((page - 1) * pageSize, page * pageSize), [filteredCards, page]);

  if (!filteredCards?.length) {
    return <div className="p-4 text-sm opacity-70">No cards in this deck.</div>;
  }

  return (
    <div className="relative">
      {toast && <Toast message={toast.msg} kind={toast.kind} onClose={clear} />}
      <div className="min-w-full">
  {/* Filters */}
        <div className="px-2 py-2 border-b border-neutral-800 flex flex-wrap gap-2 items-center sticky top-0 bg-neutral-950 z-10">
          {/* Search */}
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <input
              aria-label="Search"
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700"
              placeholder="Search cards…"
              value={searchInput}
              onChange={e=>setSearchInput(e.target.value)}
            />
            {search && (
              <button className="text-sm px-2 py-1 rounded bg-neutral-800 border border-neutral-700" onClick={()=>setSearchInput('')}>Clear</button>
            )}
            {search && (
              <span className="text-xs opacity-70">{totalResults} result{totalResults!==1?'s':''}</span>
            )}
          </div>
          {/* Tag filters */}
          {Object.keys(tagIndex).length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs opacity-70">Filter by tags:</span>
            {Object.entries(tagIndex).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,20).map(([tag, count]) => {
              const active = activeTags.includes(tag);
              return (
                <button key={tag} className={`text-xs px-2 py-1 rounded-full border ${active? 'bg-primary-sky-blue/20 border-primary-sky-blue text-primary-sky-blue' : 'bg-neutral-800/60 border-neutral-700'}`} onClick={() => setActiveTags(prev => active ? prev.filter(t=>t!==tag) : [...prev, tag])}>
                  #{tag} <span className="opacity-70">{count}</span>
                </button>
              );
            })}
            {activeTags.length > 0 && (
              <button className="ml-auto text-xs underline" onClick={()=>setActiveTags([])}>Clear</button>
            )}
            </div>
          )}
          {/* Difficulty filter */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs opacity-70">Difficulty</span>
            <input aria-label="Min difficulty" type="number" min={1} max={10} value={minDiff} onChange={e=>setMinDiff(e.target.value===''? '': Math.max(1, Math.min(10, Number(e.target.value))))} className="w-16 px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-sm" placeholder="min" />
            <span className="opacity-70">–</span>
            <input aria-label="Max difficulty" type="number" min={1} max={10} value={maxDiff} onChange={e=>setMaxDiff(e.target.value===''? '': Math.max(1, Math.min(10, Number(e.target.value))))} className="w-16 px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-sm" placeholder="max" />
            {(minDiff!=='' || maxDiff!=='') && (
              <button className="text-xs underline" onClick={()=>{ setMinDiff(''); setMaxDiff(''); }}>Clear</button>
            )}
          </div>
        </div>
        <div className="sticky top-0 bg-neutral-950 z-10 border-b border-neutral-800 px-2 py-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" aria-label="Select all" checked={allChecked} onChange={toggleAll} />
            <span>{anyChecked ? `${selected.size} selected` : 'Select'}</span>
          </label>
          {activeTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {activeTags.map(t => (
                <span key={t} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-neutral-700/60 border border-neutral-600">
                  #{t}
                  <button aria-label={`Remove filter ${t}`} onClick={()=>setActiveTags(prev=>prev.filter(x=>x!==t))}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="divide-y divide-neutral-800 overflow-y-auto">
          {pagedCards.map((c) => (
            <div key={c.id} className="py-3 px-2 hover:bg-neutral-900/20 flex items-start gap-3">
              <input type="checkbox" aria-label={`Select card ${c.id}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="mt-1" />
              <div className="flex-1">
                {'question' in c ? (
                  <>
                    <div className="font-medium">{renderHighlight(c.question, search)}</div>
                    <div className="text-sm opacity-80">{renderHighlight(c.answer, search)}</div>
                    {'tags' in c && (c as any).tags?.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(c as any).tags.map((t: string) => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-800/60 border border-neutral-700">#{t}</span>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="text-sm opacity-70">Unsupported card type</div>
                )}
              </div>
              <div className="shrink-0 space-x-2">
                {typeof (c as any).difficulty === 'number' && (
                  <span className={`inline-block align-middle text-[10px] px-1.5 py-0.5 rounded-full border ${((c as any).difficulty||5) >=7 ? 'border-red-500 text-red-400' : ((c as any).difficulty||5) <=3 ? 'border-emerald-500 text-emerald-400' : 'border-yellow-500 text-yellow-400'}`}>D{(c as any).difficulty}</span>
                )}
                <button className="text-sm px-2 py-1 rounded bg-neutral-200/10" onClick={() => onEdit?.(c)}>Edit</button>
                <button className="text-sm px-2 py-1 rounded bg-red-600 text-white" onClick={() => onDelete?.(c.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="px-2 py-2 border-t border-neutral-800 flex items-center gap-2 text-sm">
            <button className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 disabled:opacity-50" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Prev</button>
            <span className="opacity-80">Page {page} / {totalPages}</span>
            <button className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 disabled:opacity-50" disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next</button>
          </div>
        )}
      </div>

      {anyChecked && (
        <div className="sticky bottom-0 inset-x-0 bg-neutral-900/90 backdrop-blur border-t border-neutral-800 px-4 py-3 flex items-center gap-2">
          <button className="px-3 py-2 rounded bg-red-600 text-white disabled:opacity-60" disabled={deleting} onClick={()=>setConfirmOpen(true)}>
            {deleting ? 'Deleting…' : 'Delete Selected'}
          </button>
          <button className="px-3 py-2 rounded bg-neutral-200/10" onClick={()=>setMoveOpen(true)}>Move to Deck</button>
          <button className="px-3 py-2 rounded bg-neutral-200/10" onClick={()=>{ setTagAction('add'); setTagText(''); setTagModalOpen(true); }}>Add Tags</button>
          <button className="px-3 py-2 rounded bg-neutral-200/10" onClick={()=>{ setTagAction('remove'); setTagText(''); setTagModalOpen(true); }}>Remove Tags</button>
          <button className="ml-auto px-3 py-2 rounded bg-neutral-800 border border-neutral-700" onClick={resetSelection}>Cancel</button>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="w-full max-w-sm rounded-xl bg-neutral-900 border border-neutral-800 p-4">
            <div className="text-lg font-semibold mb-2">Delete {selected.size} card(s)?</div>
            <p className="text-sm opacity-80 mb-4">This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700" onClick={()=>setConfirmOpen(false)}>Cancel</button>
              <button className="px-3 py-2 rounded bg-red-600 text-white" onClick={handleDeleteSelected}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Move modal */}
  {moveOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="w-full max-w-md rounded-xl bg-neutral-900 border border-neutral-800 p-4">
            <div className="text-lg font-semibold mb-2">Move {selected.size} card(s)</div>
    <label className="block text-sm mb-2">Select destination deck</label>
    <input className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 mb-2" placeholder="Search decks" value={deckSearch} onChange={e=>setDeckSearch(e.target.value)} />
    <select className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700" value={moveTarget} onChange={e=>setMoveTarget(e.target.value as DeckId)}>
              <option value="">Choose a deck…</option>
      {decks.filter(d=>d.id!==deckId && d.name.toLowerCase().includes(deckSearch.toLowerCase())).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700" onClick={()=>setMoveOpen(false)}>Cancel</button>
              <button className="px-3 py-2 rounded bg-primary-sky-blue text-white disabled:opacity-60" disabled={!moveTarget || moving} onClick={handleMoveSelected}>{moving ? 'Moving…' : 'Move'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Tag modal */}
      {tagModalOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="w-full max-w-md rounded-xl bg-neutral-900 border border-neutral-800 p-4">
            <div className="text-lg font-semibold mb-2">{tagAction === 'add' ? 'Add' : 'Remove'} tags for {selected.size} card(s)</div>
            <label className="block text-sm mb-2">Comma-separated tags</label>
            <input className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700" placeholder="e.g. algebra, matrices" value={tagText} onChange={e=>setTagText(e.target.value)} />
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700" onClick={()=>setTagModalOpen(false)}>Cancel</button>
              <button className="px-3 py-2 rounded bg-primary-sky-blue text-white disabled:opacity-60" disabled={!tagText.trim()} onClick={handleApplyTags}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Undo toast action (informational) */}
    {undoState && (
        <div className="fixed bottom-20 right-4 z-50 px-4 py-2 rounded-lg border border-neutral-700 bg-neutral-900 text-sm">
      Deleted {undoState.count} card(s). <button className="underline ml-2" onClick={handleUndoDelete}>Undo</button>
        </div>
      )}
    </div>
  );
};

export default CardList;

import { useEffect, useState } from 'react';
import type { Deck, DeckId } from '../../types/flashcards';
import { useDeckSearchFilter } from '../../hooks/useDeckSearchFilter';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import FlashcardEditor from './FlashcardEditor';
import { useAuth } from '../../context/AuthContext';
import { FlashcardService } from '../../services/FlashcardService';
import { PresenceService } from '../../services/PresenceService';
import { Toast, useToast } from '../Toast';
import QRCode from 'qrcode';

type ReorderHandler = (newOrder: DeckId[]) => void;

export interface DeckListProps {
  decks: Deck[];
  onOpen?: (deckId: DeckId) => void;
  onEdit?: (deckId: DeckId) => void;
  onAnalytics?: (deckId: DeckId) => void;
  onRename?: (deckId: DeckId, name: string) => void;
  onDelete?: (deckId: DeckId) => void;
  onToggleFavorite?: (deckId: DeckId, value: boolean) => void;
  onReorder?: ReorderHandler;
  onShare?: (deckId: DeckId) => void;
  onArchiveToggle?: (deckId: DeckId, value: boolean) => void;
  onDuplicate?: (deckId: DeckId) => void;
}
const ItemTypes = { DECK: 'deck' } as const;

function useLocalOrder(decks: Deck[]) {
  const [ordered, setOrdered] = useState<Deck[]>(decks);
  useEffect(() => setOrdered(decks), [decks]);
  const move = (from: number, to: number) => {
    setOrdered(prev => {
      const next = [...prev];
      const [spliced] = next.splice(from, 1);
      next.splice(to, 0, spliced);
      return next;
    });
  };
  return { ordered, setOrdered, move } as const;
}

function ProgressBar({ total = 0, due = 0 }: { total?: number; due?: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((due / total) * 100)) : 0;
  return (
    <div className="w-full h-2 bg-neutral-800 rounded overflow-hidden" aria-label={`Due ${due} of ${total}`}>
      <div className="h-full bg-primary-sky-blue" style={{ width: `${pct}%` }} />
    </div>
  );
}

function DeckCard({
  deck,
  index,
  move,
  onOpen,
  onEdit,
  onAnalytics,
  onRename,
  onDelete,
  onToggleFavorite,
  onShare,
  onArchiveToggle,
  onDuplicate,
  isFavorite,
  announceMove,
  activeUsers,
}: {
  deck: Deck; index: number; move: (from: number, to: number) => void;
  onOpen?: (id: DeckId)=>void; onEdit?: (id: DeckId)=>void; onAnalytics?: (id: DeckId)=>void;
  onRename?: (id: DeckId, name: string)=>void; onDelete?: (id: DeckId)=>void;
  onToggleFavorite?: (id: DeckId, value: boolean)=>void; onShare?: (id: DeckId)=>void; onArchiveToggle?: (id: DeckId, value: boolean)=>void; onDuplicate?: (id: DeckId)=>void;
  isFavorite: boolean; announceMove: (msg: string)=>void;
  activeUsers: { uid: string; displayName: string; photoURL?: string }[];
}) {
  const [{ isDragging }, dragRef] = useDrag(() => ({
    type: ItemTypes.DECK,
    item: { id: deck.id, index },
    collect: (monitor: import('react-dnd').DragSourceMonitor) => ({ isDragging: monitor.isDragging() }),
  }), [deck.id, index]);

  const [, dropRef] = useDrop<{ id: DeckId; index: number }, void, unknown>({
    accept: ItemTypes.DECK,
    hover: (item: { id: DeckId; index: number }, monitor: import('react-dnd').DropTargetMonitor) => {
      if (!monitor.isOver({ shallow: true })) return;
      const from = item.index;
      const to = index;
      if (from === to) return;
      move(from, to);
      item.index = to;
      announceMove(`Moved ${item.id} to position ${to + 1}`);
    },
  }, [index, move]);

  const refCb = (node: HTMLDivElement | null) => {
    dragRef(dropRef(node));
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const toggleMenu = () => setMenuOpen(v => !v);

  const handleRename = () => {
    const name = prompt('Rename deck', deck.name);
    if (name && name.trim() && name !== deck.name) onRename?.(deck.id, name.trim());
  };

  const handleShare = async () => {
  onShare?.(deck.id);
  };

  return (
    <div ref={refCb} role="listitem" aria-roledescription="Draggable deck" aria-grabbed={isDragging}
      className={`rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 focus-within:ring-2 ring-primary-sky-blue/50 ${isDragging ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <button className="text-left flex-1 min-w-0" onClick={() => onOpen?.(deck.id)} aria-label={`Open ${deck.name}`}>
          <h3 className="font-semibold truncate">{deck.name}</h3>
          {deck.description && (
            <p className="text-sm opacity-80 line-clamp-2 mt-0.5">{deck.description}</p>
          )}
        </button>
        <div className="flex items-center gap-1">
          {activeUsers.length > 0 && (
            <div className="flex -space-x-1 overflow-hidden mr-2" title={activeUsers.map(u => u.displayName).join(', ') + ' active'}>
              {activeUsers.map(u => (
                <img key={u.uid} className="inline-block h-6 w-6 rounded-full ring-2 ring-neutral-900" src={u.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${u.displayName}`} alt={u.displayName} />
              ))}
            </div>
          )}
          <button aria-pressed={isFavorite} aria-label={isFavorite ? 'Unfavorite deck' : 'Favorite deck'}
            title={isFavorite ? 'Unfavorite' : 'Favorite'}
            className={`p-2 rounded hover:bg-neutral-800 ${isFavorite ? 'text-yellow-400' : 'text-neutral-300'}`}
            onClick={() => onToggleFavorite?.(deck.id, !isFavorite)}>
            <span aria-hidden>★</span>
          </button>
          <div className="relative">
            <button aria-haspopup="menu" aria-expanded={menuOpen} onClick={toggleMenu}
              className="p-2 rounded hover:bg-neutral-800" title="Actions" aria-label="Deck actions">
              ⋯
            </button>
            {menuOpen && (
              <ul role="menu" className="absolute right-0 mt-1 w-40 rounded-md border border-neutral-700 bg-neutral-900 shadow-lg z-10">
                <li role="none"><button role="menuitem" className="w-full text-left px-3 py-2 hover:bg-neutral-800" onClick={handleRename}>Rename</button></li>
                <li role="none"><button role="menuitem" className="w-full text-left px-3 py-2 hover:bg-neutral-800" onClick={() => onDuplicate?.(deck.id)}>Duplicate</button></li>
                <li role="none"><button role="menuitem" className="w-full text-left px-3 py-2 hover:bg-neutral-800" onClick={() => onEdit?.(deck.id)}>Add Card</button></li>
                <li role="none"><button role="menuitem" className="w-full text-left px-3 py-2 hover:bg-neutral-800" onClick={() => onEdit?.(deck.id)}>Edit</button></li>
                <li role="none"><button role="menuitem" className="w-full text-left px-3 py-2 hover:bg-neutral-800" onClick={() => onAnalytics?.(deck.id)}>Analytics</button></li>
                <li role="none"><button role="menuitem" className="w-full text-left px-3 py-2 hover:bg-neutral-800" onClick={handleShare}>Share link</button></li>
                <li role="none"><button role="menuitem" className="w-full text-left px-3 py-2 hover:bg-neutral-800" onClick={()=> onArchiveToggle?.(deck.id, !(deck as any).archived)}>{(deck as any).archived ? 'Unarchive' : 'Archive'}</button></li>
                <li role="none"><button role="menuitem" className="w-full text-left px-3 py-2 hover:bg-red-900/40 text-red-300" onClick={() => onDelete?.(deck.id)}>Delete</button></li>
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <ProgressBar total={deck.cardCount || 0} due={deck.dueTodayCount || 0} />
        </div>
        <div className="text-xs opacity-80 whitespace-nowrap" aria-label={`${deck.dueTodayCount || 0} due of ${deck.cardCount || 0}`}>
          {deck.dueTodayCount || 0}/{deck.cardCount || 0}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button className="px-3 py-1.5 rounded bg-primary-sky-blue text-white text-sm" onClick={() => onOpen?.(deck.id)}>Study</button>
        <button className="px-3 py-1.5 rounded bg-neutral-200/10 text-sm" onClick={() => onEdit?.(deck.id)}>Edit</button>
        <button className="px-3 py-1.5 rounded bg-neutral-200/10 text-sm" onClick={() => onAnalytics?.(deck.id)}>Analytics</button>
  <button className="ml-auto px-3 py-1.5 rounded bg-neutral-200/10 text-sm" onClick={handleShare}>Share</button>
      </div>
    </div>
  );
}

const DeckList = ({ decks, onOpen, onEdit, onAnalytics, onRename, onDelete, onToggleFavorite, onReorder, onShare, onArchiveToggle, onDuplicate }: DeckListProps) => {
  const { search, setSearch, filter, setFilter, filteredDecks, isFavorite, adv, setAdv, subjects, resetFilters } = useDeckSearchFilter(decks);
  const { ordered, setOrdered, move } = useLocalOrder(filteredDecks);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [shareDeck, setShareDeck] = useState<Deck | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copyOk, setCopyOk] = useState(false);
  const [allowReshare, setAllowReshare] = useState(true);
  const [allPresence, setAllPresence] = useState<Map<string, { currentDeckId?: string; displayName?: string; photoURL?: string }>>(new Map());
  const { user } = useAuth();

  useEffect(() => setOrdered(filteredDecks), [filteredDecks, setOrdered]);

  // Listen to all user presences
  useEffect(() => {
    const unsubscribe = PresenceService.listenToAllPresence(presenceMap => {
      setAllPresence(presenceMap);
    });
    return () => unsubscribe();
  }, []);

  // Update user presence when active deck changes
  useEffect(() => {
    if (!user) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        PresenceService.updatePresence(user.uid, { currentDeckId: undefined });
      } else {
        // Re-set presence on tab focus if a deck is open
        // This needs to be handled by the component that actually sets the active deck
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Clear presence when component unmounts
      PresenceService.clearPresence(user.uid);
    };
  }, [user]);

  const [liveRegion, setLiveRegion] = useState('');
  const announceMove = (msg: string) => {
    setLiveRegion(msg);
    // clear after short delay
    setTimeout(() => setLiveRegion(''), 1000);
  };

  const commitOrder = () => {
    if (onReorder) onReorder(ordered.map(d => d.id));
  };

  // Open Share modal with QR code
  const openShare = async (deckId: DeckId) => {
    const d = decks.find(x => x.id === deckId) || filteredDecks.find(x => x.id === deckId) || null;
    setShareDeck(d || null);
    const shareId = deckId; // placeholder; could be a dedicated shareId if implemented
    const url = `${location.origin}/shared/deck/${shareId}`;
    setShareUrl(url);
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
      setQrDataUrl(dataUrl);
    } catch (e) {
      console.error('QR generation failed', e);
      setQrDataUrl('');
    }
  };

  const closeShare = () => {
    setShareDeck(null);
    setShareUrl('');
    setQrDataUrl('');
    setCopyOk(false);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1500);
    } catch {}
  };

  const downloadPng = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${shareDeck?.name || 'deck'}-qr.png`;
    a.click();
  };

  return (
    <div className="w-full" aria-label="Deck browser">
      {/* New Flashcard inline modal */}
      <NewFlashcardInline />
      <div aria-live="polite" className="sr-only">{liveRegion}</div>
  <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex-1 flex gap-2">
          <label htmlFor="deck-search" className="sr-only">Search decks</label>
          <input id="deck-search" value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search decks" className="w-full sm:max-w-md px-3 py-2 rounded border border-neutral-700 bg-neutral-900 placeholder-neutral-500" />
        </div>
        <div className="flex gap-2">
          <label htmlFor="deck-filter" className="sr-only">Filter</label>
          <select id="deck-filter" value={filter} onChange={e=>setFilter(e.target.value as any)}
            className="px-3 py-2 rounded border border-neutral-700 bg-neutral-900">
            <option value="all">All</option>
            <option value="favorites">Favorites</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          {/* Advanced filters trigger (dropdown on small, sidebar-like group) */}
          <details className="relative">
            <summary className="px-3 py-2 rounded border border-neutral-700 bg-neutral-900 cursor-pointer select-none">Filters</summary>
            <div className="absolute right-0 mt-2 w-[320px] p-3 rounded border border-neutral-700 bg-neutral-900 shadow-xl z-20 grid grid-cols-1 gap-3">
              {/* Subject */}
              <div>
                <label className="block text-xs opacity-70 mb-1">Subject</label>
                <select className="w-full px-2 py-1 rounded bg-neutral-800 border border-neutral-700" value={adv.subject || ''} onChange={e=>setAdv(v=>({ ...v, subject: e.target.value || undefined }))}>
                  <option value="">Any</option>
                  {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {/* Difficulty range */}
              <div>
                <label className="block text-xs opacity-70 mb-1">Difficulty range</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} max={10} className="w-20 px-2 py-1 rounded bg-neutral-800 border border-neutral-700" value={adv.minDifficulty ?? ''} placeholder="Min" onChange={e=>setAdv(v=>({ ...v, minDifficulty: e.target.value ? Number(e.target.value) : undefined }))} />
                  <span className="opacity-70">to</span>
                  <input type="number" min={1} max={10} className="w-20 px-2 py-1 rounded bg-neutral-800 border border-neutral-700" value={adv.maxDifficulty ?? ''} placeholder="Max" onChange={e=>setAdv(v=>({ ...v, maxDifficulty: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
              </div>
              {/* Last studied date range */}
              <div>
                <label className="block text-xs opacity-70 mb-1">Last studied</label>
                <div className="flex items-center gap-2">
                  <input type="date" className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700" value={adv.lastStudiedFrom ?? ''} onChange={e=>setAdv(v=>({ ...v, lastStudiedFrom: e.target.value || undefined }))} />
                  <span className="opacity-70">to</span>
                  <input type="date" className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700" value={adv.lastStudiedTo ?? ''} onChange={e=>setAdv(v=>({ ...v, lastStudiedTo: e.target.value || undefined }))} />
                </div>
              </div>
              {/* Due cards */}
              <div>
                <label className="block text-xs opacity-70 mb-1">Due cards</label>
                <select className="w-full px-2 py-1 rounded bg-neutral-800 border border-neutral-700" value={adv.due || 'any'} onChange={e=>setAdv(v=>({ ...v, due: e.target.value as any }))}>
                  <option value="any">Any</option>
                  <option value="hasDue">Has due cards</option>
                  <option value="noDue">No due cards</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <button type="button" className="text-sm px-2 py-1 rounded bg-neutral-800 border border-neutral-700" onClick={resetFilters}>Reset</button>
                <span className="text-xs opacity-70">Filters auto-apply</span>
              </div>
            </div>
          </details>
          <div className="flex items-center gap-1" role="group" aria-label="View mode">
            <button aria-pressed={view==='grid'} className={`px-3 py-2 rounded border border-neutral-700 ${view==='grid'?'bg-neutral-800':'bg-neutral-900'}`} onClick={()=>setView('grid')}>Grid</button>
            <button aria-pressed={view==='list'} className={`px-3 py-2 rounded border border-neutral-700 ${view==='list'?'bg-neutral-800':'bg-neutral-900'}`} onClick={()=>setView('list')}>List</button>
          </div>
          {onReorder && (
            <button className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700" onClick={commitOrder} title="Save order">Save order</button>
          )}
        </div>
      </div>

      {/* Active filters chips */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {adv.subject && (
          <span className="text-xs px-2 py-1 rounded-full bg-neutral-800 border border-neutral-700">Subject: {adv.subject}</span>
        )}
        {(adv.minDifficulty != null || adv.maxDifficulty != null) && (
          <span className="text-xs px-2 py-1 rounded-full bg-neutral-800 border border-neutral-700">Difficulty: {adv.minDifficulty ?? 1}–{adv.maxDifficulty ?? 10}</span>
        )}
        {(adv.lastStudiedFrom || adv.lastStudiedTo) && (
          <span className="text-xs px-2 py-1 rounded-full bg-neutral-800 border border-neutral-700">Studied: {adv.lastStudiedFrom || '…'} → {adv.lastStudiedTo || '…'}</span>
        )}
        {adv.due && adv.due !== 'any' && (
          <span className="text-xs px-2 py-1 rounded-full bg-neutral-800 border border-neutral-700">{adv.due === 'hasDue' ? 'Has due cards' : 'No due cards'}</span>
        )}
        {(adv.subject || adv.minDifficulty != null || adv.maxDifficulty != null || adv.lastStudiedFrom || adv.lastStudiedTo || (adv.due && adv.due !== 'any')) && (
          <button className="text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700" onClick={resetFilters}>Clear filters</button>
        )}
      </div>

  {ordered.length === 0 ? (
        <div className="p-6 text-sm opacity-70">No decks match your filters.</div>
      ) : (
        <DndProvider backend={HTML5Backend}>
      <div role="list" className={view==='grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'flex flex-col gap-3'}>
            {ordered.map((d, idx) => (
      <DeckCard key={d.id} deck={d} index={idx} move={move}
                onOpen={(deckId) => { onOpen?.(deckId); if (user) PresenceService.updatePresence(user.uid, { currentDeckId: deckId, displayName: user.displayName || user.email || 'Anonymous', photoURL: user.photoURL || undefined }); }}
                onEdit={onEdit} onAnalytics={onAnalytics}
    onRename={onRename} onDelete={onDelete} onToggleFavorite={onToggleFavorite} onShare={(id)=>{ onShare?.(id); openShare(id); }} onArchiveToggle={onArchiveToggle} onDuplicate={onDuplicate}
                isFavorite={isFavorite(d)} announceMove={announceMove}
                activeUsers={Array.from(allPresence.entries())
                  .filter(([uid, p]) => p.currentDeckId === d.id && uid !== user?.uid)
                  .map(([uid, p]) => ({ uid, displayName: p.displayName || 'Anonymous', photoURL: p.photoURL || undefined }))}
              />
            ))}
          </div>
        </DndProvider>
      )}
      <p className="mt-2 text-xs opacity-60">Tip: Drag cards to reorder. Use the Save order button to persist.</p>

      {/* Share Modal */}
      {shareDeck && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={closeShare} />
          <div className="relative z-50 w-full sm:max-w-md sm:rounded-xl sm:border sm:border-neutral-700 bg-neutral-900 p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="font-semibold">Share Deck</h3>
                <p className="text-sm opacity-80">{shareDeck.name}</p>
              </div>
              <button aria-label="Close" className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700" onClick={closeShare}>✕</button>
            </div>
            <div className="flex flex-col items-center gap-3">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR code for deck share" className="w-56 h-56 bg-white p-2 rounded" />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center rounded border border-neutral-700">Generating QR…</div>
              )}
              <div className="w-full">
                <label className="sr-only" htmlFor="share-link">Share link</label>
                <input id="share-link" className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm" readOnly value={shareUrl} />
              </div>
              <div className="w-full flex gap-2">
                <button className="flex-1 px-3 py-2 rounded bg-primary-sky-blue text-white" onClick={copyLink}>{copyOk ? 'Copied!' : 'Copy link'}</button>
                <button className="px-3 py-2 rounded bg-neutral-200/10" onClick={downloadPng}>Download QR</button>
              </div>
              <label className="mt-2 inline-flex items-center gap-2 text-sm opacity-90">
                <input type="checkbox" checked={allowReshare} onChange={e=>setAllowReshare(e.target.checked)} />
                Allow re-share
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeckList;

function NewFlashcardInline() {
  const { user } = useAuth();
  const { toast, show, clear } = useToast();
  const [open, setOpen] = useState(false);
  const [activeDeckId, setActiveDeckId] = useState<DeckId | ''>('');

  async function handleSave(card: any) {
    if (!user) { show('Sign in to add cards', 'error'); return; }
    if (!activeDeckId) { show('Choose a deck first', 'error'); return; }
    try {
  await FlashcardService.addCard(user.uid, activeDeckId as DeckId, card);
      show('Flashcard added', 'success');
      setOpen(false);
    } catch (e: any) {
      show(e?.message || 'Failed to add card', 'error');
    }
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <label htmlFor="new-card-deck" className="sr-only">Target deck</label>
        <input id="new-card-deck" className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700" placeholder="Deck ID" value={activeDeckId} onChange={e=>setActiveDeckId(e.target.value as DeckId)} />
        <button className="px-3 py-2 rounded bg-primary-sky-blue text-white" onClick={()=>setOpen(true)}>New Flashcard</button>
      </div>
      {open && (
        <div role="dialog" aria-modal="true" className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold">New Flashcard</h4>
            <button className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700" onClick={()=>setOpen(false)} aria-label="Close">✕</button>
          </div>
          <FlashcardEditor deckId={activeDeckId as DeckId} onSave={handleSave} onClose={()=>setOpen(false)} onSaved={() => { /* listener updates list */ }} />
        </div>
      )}
      {toast && <Toast message={toast.msg} kind={toast.kind} onClose={clear} />}
    </div>
  );
};
 

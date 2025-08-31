import type { Deck, DeckId } from '../../types/flashcards';
import { useDeckSearchFilter } from '../../hooks/useDeckSearchFilter';
import { useDebouncedValue } from '../../hooks/useDebounce';
import { useEffect, useState } from 'react';

export interface DeckSidebarProps {
  decks?: Deck[];
  activeDeckId?: DeckId | null;
  onSelectDeck?: (id: DeckId) => void;
  onCreateDeck?: () => void;
  onToggleFavorite?: (deckId: DeckId, value: boolean) => void;
}

const DeckSidebar = ({ decks = [], activeDeckId, onSelectDeck, onCreateDeck, onToggleFavorite }: DeckSidebarProps) => {
  const { search, setSearch, filter, setFilter, filteredDecks, isFavorite } = useDeckSearchFilter(decks);
  const [input, setInput] = useState(search);
  const debounced = useDebouncedValue(input, 300);

  // Push debounced input into hook's search state
  useEffect(() => { setSearch(debounced); }, [debounced, setSearch]);
  const favs = filteredDecks.filter(d => isFavorite(d));
  const others = filteredDecks.filter(d => !isFavorite(d));

  return (
    <aside className="w-full sm:w-72 shrink-0 border-r border-neutral-800 bg-neutral-900/30 p-4 overflow-y-auto" aria-label="Deck sidebar">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-lg font-semibold">Decks</h2>
        <button
          className="px-2 py-1 rounded bg-primary-sky-blue text-white text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          onClick={onCreateDeck}
          title="Create deck"
          aria-label="Create new deck"
        >
          New
        </button>
      </div>

      <div className="mb-3">
        <label htmlFor="sidebar-deck-search" className="sr-only">Search decks</label>
  <input id="sidebar-deck-search" value={input} onChange={e=>setInput(e.target.value)}
          placeholder="Search decks"
          className="w-full px-3 py-2 rounded border border-neutral-700 bg-neutral-900 placeholder-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" />
        <label htmlFor="sidebar-deck-filter" className="sr-only">Filter decks</label>
        <select id="sidebar-deck-filter" value={filter} onChange={e=>setFilter(e.target.value as any)}
          className="mt-2 w-full px-3 py-2 rounded border border-neutral-700 bg-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
          <option value="all">All</option>
          <option value="favorites">Favorites</option>
        </select>
      </div>

      {favs.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><span aria-hidden>★</span> Favorites</h3>
          <ul className="space-y-1">
            {favs.map((d) => (
              <li key={d.id}>
                <button
                  className={`w-full text-left px-3 py-2 rounded hover:bg-neutral-800 transition ${d.id === activeDeckId ? 'bg-neutral-800 ring-1 ring-neutral-700' : ''}`}
                  onClick={() => onSelectDeck?.(d.id)}
                  aria-current={d.id === activeDeckId ? 'true' : undefined}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{d.name}</span>
                    <span className="text-xs opacity-70">{d.dueTodayCount ?? 0}/{d.cardCount ?? 0}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    {d.description && (
                      <div className="text-xs opacity-70 line-clamp-1 mr-2">{d.description}</div>
                    )}
                    <button
                      className="p-1 rounded hover:bg-neutral-800 text-yellow-400"
                      aria-label="Unfavorite deck"
                      title="Unfavorite deck"
                      onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(d.id, false); }}
                    >★</button>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="text-sm font-semibold mb-2">All Decks</h3>
      <ul className="space-y-1">
        {others.length === 0 && (
          <li className="text-sm opacity-70">No decks found.</li>
        )}
        {others.map((d) => (
          <li key={d.id}>
            <button
              className={`w-full text-left px-3 py-2 rounded hover:bg-neutral-800 transition ${d.id === activeDeckId ? 'bg-neutral-800 ring-1 ring-neutral-700' : ''}`}
              onClick={() => onSelectDeck?.(d.id)}
              aria-current={d.id === activeDeckId ? 'true' : undefined}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium truncate">{d.name}</span>
                <span className="text-xs opacity-70">{d.dueTodayCount ?? 0}/{d.cardCount ?? 0}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                {d.description && (
                  <div className="text-xs opacity-70 line-clamp-1 mr-2">{d.description}</div>
                )}
                <button
                  className="p-1 rounded hover:bg-neutral-800 text-neutral-300"
                  aria-label="Favorite deck"
                  title="Favorite deck"
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(d.id, true); }}
                >★</button>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
};

export default DeckSidebar;

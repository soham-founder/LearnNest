import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import React, { Suspense, lazy } from 'react';
import DeckSidebar from '../components/flashcards/DeckSidebar';
import DeckList from '../components/flashcards/DeckList';
const CardList = lazy(() => import('../components/flashcards/CardList'));
const ReviewSession = lazy(() => import('../components/flashcards/ReviewSession'));
const AnalyticsTab = lazy(() => import('../components/flashcards/AnalyticsTab'));
import { useDecks } from '../hooks/useDecks';
import { useCards } from '../hooks/useCards';
import { useAuth } from '../context/AuthContext';
import { FlashcardService } from '../services/FlashcardService';

// This page acts as a router entry and layout for all flashcards views.

const DeckBrowser = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { decks } = useDecks();

  const handleReorder = async (ids: string[]) => {
    if (!user) return;
    await FlashcardService.reorderDecks(user.uid, ids as any);
  };

  const handleToggleFav = async (deckId: string, value: boolean) => {
    if (!user) return;
    const deck = decks.find(d => d.id === deckId);
    const tags = new Set([...(deck?.tags || [])]);
    if (value) tags.add('favorite'); else tags.delete('favorite');
    await FlashcardService.updateDeck(user.uid, deckId as any, { tags: Array.from(tags) } as any);
  };

  const handleRename = async (deckId: string, name: string) => {
    if (!user) return;
    await FlashcardService.updateDeck(user.uid, deckId as any, { name } as any);
  };

  const handleDelete = async (deckId: string) => {
    if (!user) return;
    if (!confirm('Delete this deck and all its cards?')) return;
    await FlashcardService.deleteDeck(user.uid, deckId as any);
  };

  const handleCreateDeck = async () => {
    if (!user) return;
    const name = prompt('Deck name');
    if (!name || !name.trim()) return;
    const id = await FlashcardService.createDeck(user.uid, name.trim());
    navigate(`/flashcards/${id}/edit`);
  };

  const handleArchiveToggle = async (deckId: string, value: boolean) => {
    if (!user) return;
    await FlashcardService.updateDeck(user.uid, deckId as any, { archived: value } as any);
  };

  const handleDuplicate = async (deckId: string) => {
    if (!user) return;
    const newId = await FlashcardService.duplicateDeck(user.uid, deckId as any);
    if (newId) navigate(`/flashcards/${newId}/edit`);
  };
  return (
    <div className="flex h-full">
      <DeckSidebar decks={decks} onCreateDeck={handleCreateDeck} onToggleFavorite={handleToggleFav} />
      <main className="flex-1 p-4">
        <h1 className="text-xl font-semibold mb-4">Your Decks</h1>
        <DeckList decks={decks}
          onOpen={(id)=>navigate(`/flashcards/${id}`)}
          onEdit={(id)=>navigate(`/flashcards/${id}/edit`)}
          onAnalytics={(id)=>navigate(`/flashcards/${id}/analytics`)}
          onRename={handleRename}
          onDelete={handleDelete}
          onToggleFavorite={handleToggleFav}
          onReorder={handleReorder}
          onArchiveToggle={handleArchiveToggle}
          onDuplicate={handleDuplicate}
        />
      </main>
    </div>
  );
};

const EditDeckView = () => {
  const { deckId } = useParams();
  const FlashcardEditor = React.useMemo(() => lazy(() => import('../components/flashcards/FlashcardEditor')), []);
  return (
    <div className="flex h-full">
      <DeckSidebar decks={[]} />
      <main className="flex-1 p-4 space-y-4">
        <h1 className="text-xl font-semibold">Edit Deck {deckId}</h1>
        <Suspense fallback={<div className="p-2 text-sm opacity-70">Loading editor…</div>}>
          <CardList cards={[]} />
          <FlashcardEditor deckId={(deckId || '') as any} />
        </Suspense>
      </main>
    </div>
  );
};

const StudySessionView = () => {
  const { deckId } = useParams();
  const { cards } = useCards(deckId || null);
  if (!deckId) return null;
  return <ReviewSession deckId={deckId} cards={cards} />;
};

const AnalyticsView = () => {
  const { deckId } = useParams();
  return (
    <div className="flex h-full">
      <DeckSidebar decks={[]} />
      <main className="flex-1 p-4 space-y-4">
        <h1 className="text-xl font-semibold">Analytics {deckId}</h1>
        <AnalyticsTab />
      </main>
    </div>
  );
};

const FlashcardsRouter = () => {
  return (
    <Suspense fallback={<div className="p-4 text-sm opacity-70">Loading…</div>}>
      <Routes>
        <Route index element={<DeckBrowser />} />
        <Route path=":deckId" element={<StudySessionView />} />
        <Route path=":deckId/edit" element={<EditDeckView />} />
        <Route path=":deckId/analytics" element={<AnalyticsView />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </Suspense>
  );
};

export default FlashcardsRouter;

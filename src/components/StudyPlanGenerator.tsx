
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../common/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { planStudySchedule } from '../services/aiFlashcards';
import type { StudySchedule } from '../services/aiFlashcards';

interface Deck {
  id: string;
  name: string;
}

export const StudyPlanGenerator: React.FC = () => {
  const { user } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [schedule, setSchedule] = useState<StudySchedule | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDecks = async () => {
      if (user) {
        try {
          const decksRef = collection(db, `users/${user.uid}/flashcards`);
          const snapshot = await getDocs(decksRef);
          const fetchedDecks = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name || 'Untitled Deck' } as Deck));
          setDecks(fetchedDecks);
          if (fetchedDecks.length > 0) {
            setSelectedDeckId(fetchedDecks[0].id);
          }
        } catch (err) {
          console.error("Failed to fetch decks:", err);
          setError("Could not load your decks. Please try again later.");
        }
      }
    };
    fetchDecks();
  }, [user]);

  const handleGeneratePlan = async () => {
    if (!selectedDeckId) {
      setError("Please select a deck.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSchedule(null);

    try {
      const generatedSchedule = await planStudySchedule(selectedDeckId);
      setSchedule(generatedSchedule);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-800 p-6 rounded-2xl shadow-soft mb-8">
      <h2 className="font-poppins text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">AI Study Planner</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
        Select a deck and let the AI create a balanced 7-day study schedule to maximize your retention.
      </p>
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <select
          value={selectedDeckId}
          onChange={(e) => setSelectedDeckId(e.target.value)}
          className="flex-1 w-full px-4 py-2.5 border-2 border-neutral-300 dark:border-neutral-600 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-sky-blue bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
        >
          {decks.length === 0 ? (
            <option>No decks found</option>
          ) : (
            decks.map(deck => (
              <option key={deck.id} value={deck.id}>{deck.name}</option>
            ))
          )}
        </select>
        <button
          onClick={handleGeneratePlan}
          disabled={isLoading || !selectedDeckId}
          className="bg-secondary-green hover:bg-green-600 text-white font-sans font-medium py-2.5 px-6 rounded-xl shadow-md disabled:bg-neutral-400 flex items-center justify-center"
        >
          {isLoading ? 'Generating Plan...' : 'Generate 7-Day Plan'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
      {schedule && (
        <div className="mt-6 space-y-4">
          <h3 className="font-poppins text-xl font-semibold">Your Recommended Schedule:</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
            {Object.entries(schedule).map(([date, plan]) => (
              <div key={date} className="bg-neutral-100 dark:bg-neutral-700 p-4 rounded-lg">
                <p className="font-bold text-center">{new Date(date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</p>
                <p className="text-2xl font-bold text-center my-2">{plan.cardIds.length}</p>
                <p className="text-xs text-center text-neutral-600 dark:text-neutral-400">cards</p>
                <p className="text-xs text-center text-neutral-500 mt-2"><em>{plan.reasoning}</em></p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { triggerFlashcardGeneration } from '../services/FlashcardAIService';
import type { CardGenerationPreferences } from '../services/FlashcardAIService';

interface AICompanionPanelProps {
  activeDeckId: string | null;
}

export const AICompanionPanel: React.FC<AICompanionPanelProps> = ({ activeDeckId }) => {
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Simple preferences state, can be expanded with more UI controls
  const [preferences] = useState<CardGenerationPreferences>({
    numberOfCards: 8,
    difficulty: 'medium',
  });

  const handleGenerate = async () => {
    if (!activeDeckId) {
      setError("Please select a deck first.");
      return;
    }
    if (!notes.trim()) {
      setError("Please paste some notes to generate cards from.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Call the new service that triggers the Cloud Function
      await triggerFlashcardGeneration({
        deckId: activeDeckId,
        sourceType: 'text',
        sourceData: notes,
        preferences: preferences,
      });
      setSuccess(true);
      setNotes(''); // Clear notes on success
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 border-l border-neutral-200 dark:border-neutral-700 w-96">
      <h3 className="text-lg font-semibold mb-4">AI Card Generator</h3>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
        Paste your notes below. The AI will generate cards and add them to the active deck.
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Paste your lecture notes, a chapter from a textbook, or any text content here..."
        className="w-full h-60 p-2 border rounded-md bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 focus:ring-2 focus:ring-primary-sky-blue"
        disabled={isLoading}
      />
      <button
        onClick={handleGenerate}
        disabled={isLoading || !activeDeckId}
        className="w-full mt-4 bg-primary-sky-blue hover:bg-blue-700 text-white py-2 rounded-lg disabled:bg-neutral-400 disabled:cursor-not-allowed flex items-center justify-center"
      >
        {isLoading ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Generating...
          </>
        ) : '✨ Generate Flashcards'}
      </button>
      {!activeDeckId && (
        <p className="text-xs text-yellow-600 mt-2">
          You must select a deck from the sidebar before generating cards.
        </p>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {success && <p className="text-sm text-green-600 mt-2">Successfully started generation! Cards will appear in your deck shortly.</p>}
    </div>
  );
};
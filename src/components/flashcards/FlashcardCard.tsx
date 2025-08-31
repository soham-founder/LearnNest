import { useState, useEffect } from 'react';
import type { Flashcard, CardRating } from '../../types/flashcards';
import { getAIHintForCard } from '../../services/FlashcardAIService';

export interface FlashcardCardProps {
  card: Flashcard;
  onRate?: (rating: CardRating) => void;
}

const FlashcardCard = ({ card, onRate }: FlashcardCardProps) => {
  const [flipped, setFlipped] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [isHintLoading, setIsHintLoading] = useState(false);

  const showAnswer = () => setFlipped(true);

  const handleGetHint = async () => {
    if (!card.deckId) {
        setHint("Error: Deck ID is missing for this card.");
        return;
    }
    setIsHintLoading(true);
    try {
        const result = await getAIHintForCard({ cardId: card.id, deckId: card.deckId });
        setHint(result.hint);
    } catch (error) {
        setHint(error instanceof Error ? error.message : "Failed to load hint.");
    } finally {
        setIsHintLoading(false);
    }
  }

  // Reset state when the card changes
  useEffect(() => {
    setFlipped(false);
    setHint(null);
    setIsHintLoading(false);
  }, [card]);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6">
      {'question' in card ? (
        <>
          <div className="text-lg font-semibold mb-3">{card.question}</div>
          {flipped && <div className="opacity-90">{card.answer}</div>}
          
          {hint && !flipped && (
            <div className="mt-4 p-3 bg-yellow-900/30 text-yellow-200 rounded-lg text-sm opacity-80">
                <strong>Hint:</strong> {hint}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            {!flipped && (
                <button className="px-3 py-1.5 rounded bg-neutral-200/10" onClick={showAnswer}>Show Answer</button>
            )}
            {!flipped && !hint && (
                <button 
                    className="px-3 py-1.5 rounded bg-yellow-500/20 disabled:opacity-50"
                    onClick={handleGetHint}
                    disabled={isHintLoading}
                >
                    {isHintLoading ? 'Getting Hint...' : 'Get AI Hint'}
                </button>
            )}
          </div>
        </>
      ) : (
        <div>Unsupported card type: {card.type}</div>
      )}

      {flipped && (
        <div className="mt-6 flex gap-2">
          {(['again','hard','good','easy'] as CardRating[]).map(r => (
            <button key={r} className="px-3 py-1.5 rounded bg-neutral-200/10" onClick={() => onRate?.(r)}>{r}</button>
          ))}
        </div>
      )}
    </div>
  );
};

export default FlashcardCard;
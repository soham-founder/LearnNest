import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, vi, expect, beforeEach } from 'vitest';
import CardList from '../CardList';

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, loading: false })
}));

vi.mock('../../../hooks/useDecks', () => ({
  useDecks: () => ({ decks: [{ id: 'd1', name: 'Deck 1' }, { id: 'd2', name: 'Deck 2' }], loading: false, error: null })
}));

vi.mock('../../../services/FlashcardService', () => {
  const fns = {
    getDeckTagIndex: vi.fn().mockResolvedValue({ math: 2, algebra: 1, basics: 1 })
  };
  return { FlashcardService: fns };
});

const card = (id: string, overrides: Partial<any> = {}) => ({ id, deckId: 'd1', type: 'basic', question: `What is ${id}?`, answer: `Ans ${id}`, tags: ['math'], createdAt: {} as any, updatedAt: {} as any, srs: { repetitions:0, easeFactor:2.5, interval:0, dueDate: {} as any } as any, ...overrides });

describe('CardList search + tag filters', () => {
  beforeEach(() => {
    const hist = window.history as unknown as { replaceState: (...args: any[]) => void };
    vi.spyOn(hist, 'replaceState').mockImplementation(() => {});
  });

  it('filters by search text across question/answer', async () => {
    render(<CardList deckId={'d1' as any} cards={[card('1'), card('2', { question: 'Special topic', tags: ['algebra'] })] as any} />);

    const input = await screen.findByLabelText('Search');
  fireEvent.change(input, { target: { value: 'special' } });
  await new Promise(r => setTimeout(r, 400));

    // Only the second card should be visible
  expect(screen.queryByLabelText('Select card 1')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Select card 2')).toBeInTheDocument();
  });

  it('combines tag filter with search', async () => {
    render(<CardList deckId={'d1' as any} cards={[card('1', { tags: ['algebra'], question: 'Matrix' }), card('2', { tags: ['basics'], question: 'Addition' })] as any} />);

    // Click tag pill '#algebra'
  const algebra = await screen.findByRole('button', { name: /algebra/i });
    fireEvent.click(algebra);

    const input = await screen.findByLabelText('Search');
  fireEvent.change(input, { target: { value: 'matrix' } });
  await new Promise(r => setTimeout(r, 400));

  expect(screen.getByText('Matrix')).toBeInTheDocument();
  expect(screen.queryByText('Addition')).not.toBeInTheDocument();
  });
});

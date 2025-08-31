import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import FlashcardEditor from '../FlashcardEditor';

vi.mock('../../../services/FlashcardService', () => ({
  FlashcardService: {
    addCard: vi.fn().mockResolvedValue('card-1')
  }
}));

vi.mock('../../../services/FlashcardAIService', () => ({
  FlashcardAIService: {
    generateFromText: vi.fn().mockResolvedValue([
      { front: 'Q1', back: 'A1' },
      { front: 'Q2', back: 'A2' }
    ])
  }
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'test-uid' }, loading: false })
}));

describe('FlashcardEditor', () => {
  it('renders and saves basic card', async () => {
    render(<FlashcardEditor deckId={'deck-1'} />);
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'What is 2+2?' } });
    fireEvent.change(screen.getByLabelText('Answer'), { target: { value: '4' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('generates with AI and shows accept buttons', async () => {
    render(<FlashcardEditor deckId={'deck-1'} />);

    fireEvent.change(screen.getByLabelText('AI input'), { target: { value: 'some notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));

    await screen.findAllByText('Accept');
    expect(screen.getAllByText('Accept').length).toBeGreaterThan(0);
  });
});

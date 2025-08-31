import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import DeckList from '../DeckList';

vi.mock('../../../services/FlashcardService', () => ({
	FlashcardService: {
		addCard: vi.fn().mockResolvedValue('new-card-id'),
	},
}));

vi.mock('../../../services/FlashcardAIService', () => ({
	FlashcardAIService: {
		generateFromText: vi.fn().mockResolvedValue([]),
		generateHint: vi.fn().mockResolvedValue(''),
	},
}));

vi.mock('../../../context/AuthContext', () => ({
	useAuth: () => ({ user: { uid: 'test-uid' }, loading: false }),
}));

describe('DeckList — New Flashcard flow', () => {
	it('opens editor and saves new basic card', async () => {
		const decks = [
			{
				id: 'deck-1',
				name: 'Algebra',
				description: 'Basics',
				createdAt: { toDate: () => new Date() } as any,
				updatedAt: { toDate: () => new Date() } as any,
				position: 0,
				cardCount: 0,
				dueTodayCount: 0,
			},
		];

		render(<DeckList decks={decks as any} />);

		// Click New Flashcard
		fireEvent.click(screen.getByRole('button', { name: 'New Flashcard' }));

		// Provide a deck id (simulating targeting deck)
		fireEvent.change(screen.getByLabelText('Target deck'), { target: { value: 'deck-1' } });

		// Editor appears
		await screen.findByText('Flashcard Editor');

		// Fill required fields for basic card type
		fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'What is 2+2?' } });
		fireEvent.change(screen.getByLabelText('Answer'), { target: { value: '4' } });

		// Save
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		// Success toast appears and editor closes
		await screen.findByRole('status');
		await waitFor(() => expect(screen.queryByText('Flashcard Editor')).not.toBeInTheDocument());
	});
});

// Keep simple placeholders to ensure the test file remains recognized in environments expecting them
describe('DeckList placeholder', () => {
	it('runs', () => {
		expect(true).toBe(true);
	});
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CardList from '../CardList';

vi.mock('../../../context/AuthContext', () => ({
	useAuth: () => ({ user: { uid: 'u1' }, loading: false })
}));

vi.mock('../../../hooks/useDecks', () => ({
	useDecks: () => ({ decks: [{ id: 'd1', name: 'Deck 1' }, { id: 'd2', name: 'Deck 2' }], loading: false, error: null })
}));

vi.mock('../../../services/FlashcardService', () => {
	const fns = {
		deleteCards: vi.fn().mockResolvedValue(undefined),
		moveCards: vi.fn().mockResolvedValue(undefined),
		addTagsToCards: vi.fn().mockResolvedValue(undefined),
		removeTagsFromCards: vi.fn().mockResolvedValue(undefined),
	};
	return { FlashcardService: fns };
});

const sample = (id: string) => ({ id, deckId: 'd1', type: 'basic', question: `Q${id}`, answer: `A${id}`, createdAt: {} as any, updatedAt: {} as any, srs: { repetitions:0, easeFactor:2.5, interval:0, dueDate: {} as any } as any });

describe('CardList bulk ops', () => {
	beforeEach(async () => {
		const mod: any = await import('../../../services/FlashcardService');
		mod.FlashcardService.deleteCards.mockClear();
		mod.FlashcardService.moveCards.mockClear();
	});

	it('selects all and deletes selected', async () => {
		render(<CardList deckId={'d1' as any} cards={[sample('c1') as any, sample('c2') as any]} />);

		fireEvent.click(screen.getByLabelText('Select all'));
		fireEvent.click(screen.getByText('Delete Selected'));

		// confirm modal
		const dialog = await screen.findByRole('dialog');
		const buttons = dialog.querySelectorAll('button');
		const confirmBtn = Array.from(buttons).find(b => b.textContent === 'Delete')!;
		fireEvent.click(confirmBtn);

				await waitFor(async () => {
					const mod: any = await import('../../../services/FlashcardService');
					expect(mod.FlashcardService.deleteCards).toHaveBeenCalledWith('u1', 'd1', ['c1','c2']);
				});
	});

	it('moves selected to target deck', async () => {
		render(<CardList deckId={'d1' as any} cards={[sample('c1') as any, sample('c2') as any]} />);
		// select one
		fireEvent.click(screen.getByLabelText('Select card c1'));
		fireEvent.click(screen.getByText('Move to Deck'));
		const dialog = await screen.findByRole('dialog');
		const select = dialog.querySelector('select') as HTMLSelectElement;
		fireEvent.change(select, { target: { value: 'd2' } });
		fireEvent.click(screen.getByRole('button', { name: 'Move' }));
				await waitFor(async () => {
					const mod: any = await import('../../../services/FlashcardService');
					expect(mod.FlashcardService.moveCards).toHaveBeenCalledWith('u1', ['c1'], 'd1', 'd2');
				});
	});

	it('adds and removes tags for selected', async () => {
		render(<CardList deckId={'d1' as any} cards={[sample('c1') as any, sample('c2') as any]} />);
		// select all
		fireEvent.click(screen.getByLabelText('Select all'));
		// add tags
		fireEvent.click(screen.getByText('Add Tags'));
		const dialog1 = await screen.findByRole('dialog');
		const input1 = dialog1.querySelector('input')!;
		fireEvent.change(input1, { target: { value: 'algebra, basics' } });
		fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
		await waitFor(async () => {
			const mod: any = await import('../../../services/FlashcardService');
			expect(mod.FlashcardService.addTagsToCards).toHaveBeenCalledWith('u1', 'd1', ['c1','c2'], ['algebra','basics']);
		});
		// remove tags
		fireEvent.click(screen.getByLabelText('Select all'));
		fireEvent.click(screen.getByText('Remove Tags'));
		const dialog2 = await screen.findByRole('dialog');
		const input2 = dialog2.querySelector('input')!;
		fireEvent.change(input2, { target: { value: 'basics' } });
		fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
		await waitFor(async () => {
			const mod: any = await import('../../../services/FlashcardService');
			expect(mod.FlashcardService.removeTagsFromCards).toHaveBeenCalledWith('u1', 'd1', ['c1','c2'], ['basics']);
		});
	});
});

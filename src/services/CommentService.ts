import { db } from '../common/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, Timestamp, where } from 'firebase/firestore';
import type { Comment, DeckId, CardId, UID } from '../types/flashcards';

const commentsCollection = collection(db, 'comments');

export const CommentService = {
  /**
   * Adds a new comment to a deck or card.
   * @param userId The UID of the user posting the comment.
   * @param deckId The ID of the deck the comment belongs to.
   * @param text The content of the comment.
   * @param cardId Optional: The ID of the card the comment belongs to.
   * @returns The ID of the newly created comment.
   */
  async addComment(userId: UID, deckId: DeckId, text: string, cardId?: CardId): Promise<string> {
    const newCommentRef = await addDoc(commentsCollection, {
      userId,
      deckId,
      cardId: cardId || null, // Store null if no cardId
      text,
      createdAt: Timestamp.now(),
    });
    return newCommentRef.id;
  },

  /**
   * Listens to comments for a specific deck or card.
   * @param deckId The ID of the deck.
   * @param cardId Optional: The ID of the card to listen for comments on.
   * @param callback Callback function to receive the list of comments.
   * @returns An unsubscribe function.
   */
  listenToComments(deckId: DeckId, cardId: CardId | undefined, callback: (comments: Comment[]) => void) {
    let q = query(
      commentsCollection,
      where('deckId', '==', deckId),
      orderBy('createdAt', 'asc')
    );

    if (cardId) {
      q = query(q, where('cardId', '==', cardId));
    } else {
      // For deck-level comments, ensure cardId is null
      q = query(q, where('cardId', '==', null));
    }

    return onSnapshot(q, (snapshot) => {
      const comments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Comment[];
      callback(comments);
    });
  },
};
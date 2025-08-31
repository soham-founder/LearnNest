import type { HttpsCallable } from 'firebase/functions';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../common/firebase';

const functions = getFunctions(app);

// A generic callable function for robust, type-safe AI interactions.
const getNoteSummaryCallable: HttpsCallable<{ noteContent: string }, { summary: string }> = httpsCallable(functions, 'getNoteSummary');
const getActionItemsCallable: HttpsCallable<{ noteContent: string }, { actionItems: string[] }> = httpsCallable(functions, 'getActionItems');


/**
 * NoteAIService: A dedicated service for AI capabilities within notes.
 */
export const NoteAIService = {
  /**
   * Generates a concise, AI-powered summary for a given note.
   * @param noteContent The HTML content of the note.
   * @returns A promise that resolves to the AI-generated summary.
   */
  getSummary: async (noteContent: string): Promise<string> => {
    if (!noteContent.trim()) {
      return 'Provide content for the AI to summarize.';
    }
    try {
      console.log('🚀 Engaging AI for summarization...');
      const result = await getNoteSummaryCallable({ noteContent });
      console.log('✅ AI summarization successful.');
      return result.data.summary;
    } catch (error) {
      console.error('❌ AI Service Error: Failed to generate note summary.', error);
      throw new Error('The AI assistant failed to generate a summary. Please try again.');
    }
  },

  /**
   * Extracts actionable items from a note.
   * @param noteContent The HTML content of the note.
   * @returns A promise that resolves to an array of action item strings.
   */
  getActionItems: async (noteContent: string): Promise<string[]> => {
    if (!noteContent.trim()) {
      return [];
    }
    try {
        console.log('🚀 Engaging AI for action item extraction...');
        const result = await getActionItemsCallable({ noteContent });
        console.log('✅ AI action item extraction successful.');
        return result.data.actionItems || [];
    } catch (error) {
        console.error('❌ AI Service Error: Failed to extract action items.', error);
        throw new Error('The AI assistant failed to extract action items. Please try again.');
    }
  }
};

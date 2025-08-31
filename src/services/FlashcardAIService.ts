// src/services/FlashcardAIService.ts

import { getFunctions, httpsCallable } from 'firebase/functions';

// --- Types ---

export interface CardGenerationPreferences {
  numberOfCards?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
}

interface GenerateFlashcardsRequest {
  deckId: string;
  sourceType: 'text' | 'pdf' | 'image' | 'audio';
  sourceData: string;
  preferences: CardGenerationPreferences;
}

interface GenerateHintRequest { deckId: string; cardId: string }
interface HintResponse { hint: string; citations?: string[]; source?: 'cache' | 'generated' }

interface RAGRequest { query: string; subject: string }
interface RAGSource { id: string; title: string; score: number }
interface RAGResponse { answer: string; sources: RAGSource[] }

const functions = getFunctions();

// --- Callable helpers kept for direct use in UI ---

export const triggerFlashcardGeneration = async (request: GenerateFlashcardsRequest): Promise<any> => {
  try {
    const callable = httpsCallable(functions, 'generateFlashcardsFromContent');
    const res = await callable(request);
    return res.data;
  } catch (err) {
    // Fallback: indicate not available
    return { status: 'unavailable', message: 'AI generation function is not deployed.' };
  }
};

export const getAIHintForCard = async (request: GenerateHintRequest): Promise<HintResponse> => {
  try {
    const callable = httpsCallable<GenerateHintRequest, HintResponse>(functions, 'generateHint');
    const res = await callable(request);
    return res.data;
  } catch (err) {
    // Graceful fallback hint
    return { hint: 'Focus on the core concept and any formulas or definitions tied to this card.', source: 'generated' } as HintResponse;
  }
};

/**
 * RAG explanation
 */
export const getExplanationWithRAG = async (request: RAGRequest): Promise<RAGResponse> => {
  const callable = httpsCallable<RAGRequest, RAGResponse>(functions, 'explainConceptWithRAG');
  const result = await callable(request);
  return result.data;
};

// --- Unified client used across components ---

async function previewFromText(text: string, preferences?: CardGenerationPreferences) {
  try {
    // Optional callable for previewing AI-generated cards
    const callable = httpsCallable(functions, 'previewFlashcardsFromText');
    const res = await callable({ text, preferences });
    // Expected: [{ question/front, answer/back, tags? }]
    const arr = (res.data as any[]) || [];
    return arr.map((c: any) => ({
      // Normalize to the shape expected by FlashcardEditor preview: { front, back, hint? }
      front: String(c.front ?? c.question ?? ''),
      back: String(c.back ?? c.answer ?? ''),
      hint: typeof c.hint === 'string' ? c.hint : undefined,
    }));
  } catch {
    // Local fallback: naive split by lines to create Q/A pairs
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const pairs: { front: string; back: string }[] = [];
    for (let i = 0; i < lines.length; i += 2) {
      const q = lines[i];
      const a = lines[i + 1] ?? '';
      if (q) pairs.push({ front: q.replace(/^Q[:\-]\s*/i, ''), back: a.replace(/^A[:\-]\s*/i, '') });
    }
    if (pairs.length === 0 && text.trim()) {
      // If only one block of text, create one generic card
      pairs.push({ front: 'Key idea:', back: text.trim().slice(0, 280) });
    }
    return pairs;
  }
}

async function generateHintByIds(deckId: string, cardId: string) {
  const { hint } = await getAIHintForCard({ deckId, cardId });
  return hint;
}

export const FlashcardAIService = {
  generateFromText: previewFromText,
  generateHint: generateHintByIds,
};

export type { GenerateFlashcardsRequest, RAGRequest, RAGResponse, RAGSource };
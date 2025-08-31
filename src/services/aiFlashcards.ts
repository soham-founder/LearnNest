// /src/services/aiFlashcards.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import { db, auth } from '../common/firebase'; // Assuming you have a central firebase export
import { collection, doc, writeBatch, getDocs, query, Timestamp } from "firebase/firestore";

// --- 1. TYPE DEFINITIONS ---

export interface FlashcardDoc {
  question: string;
  answer: string;
  hint?: string;
  tags?: string[];
  interval: number;
  repetition: number;
  efactor: number;
  dueDate: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StudySchedule {
  [date: string]: { 
    cardIds: string[];
    reasoning: string;
  };
}

// --- 2. GEMINI API INITIALIZATION ---

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

const getFlashModel = () => {
  if (!genAI) throw new Error("AI is not configured. Set VITE_GEMINI_API_KEY in .env.local");
  return genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
};
const getProModel = () => {
  if (!genAI) throw new Error("AI is not configured. Set VITE_GEMINI_API_KEY in .env.local");
  return genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
};

// --- 3. AI FEATURE IMPLEMENTATIONS ---

/**
 * Parses flashcards from a raw text string using a Q:/A: format.
 * @param text - The raw text from the AI.
 * @returns An array of flashcard data objects.
 */
const parseQAFallback = (
  text: string
): Omit<FlashcardDoc, 'id' | 'interval' | 'repetition' | 'efactor' | 'dueDate' | 'createdAt' | 'updatedAt'>[] => {
  const cards: { question: string; answer: string; tags?: string[] }[] = [];
  // Match blocks starting with Q or Question, followed by A or Answer.
  const regex = /(?:^|\n)(?:Q|Question):\s*([\s\S]*?)(?:\n(?:A|Answer):\s*([\s\S]*?))(?=\n(?:Q|Question):|\n*$)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const q = m[1]?.trim().replace(/\n+/g, ' ');
    const a = m[2]?.trim();
    if (q && a) cards.push({ question: q, answer: a, tags: ['ai-generated'] });
  }
  return cards;
};

/**
 * Generates 5-10 high-quality flashcards from user notes and saves them to Firebase.
 * @param notes - The user's raw text notes.
 * @param deckId - The ID of the deck to add the cards to.
 */
export async function generateCardsFromNotes(notes: string, deckId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated.");

  const prompt = `
    You are an expert learning assistant. Your task is to analyze the following notes
    and generate 5 to 10 high-quality, atomic flashcards.

    RULES:
    - **Primary Format**: Return a valid JSON object with a single key "flashcards".
    - The value of "flashcards" must be an array of objects, each with keys: "question", "answer", "hint" (optional), and "tags" (array of strings, optional).
    - **Fallback Format**: If you cannot generate valid JSON, provide the flashcards as a list of 'Q: ...' and 'A: ...' pairs on separate lines.
    - Questions should be concise and test a single concept.
    - Answers should be direct and accurate.

    NOTES TO ANALYZE:
    ---
    ${notes}
    ---
  `;

  let generatedCards: Omit<FlashcardDoc, 'id' | 'interval' | 'repetition' | 'efactor' | 'dueDate' | 'createdAt' | 'updatedAt'>[] = [];

  // Helpers to improve robustness when models wrap JSON in fences or use relaxed JSON
  const stripCodeFences = (t: string) => t.replace(/```json\s*([\s\S]*?)```/gi, '$1').replace(/```[\s\S]*?```/g, (m)=>m.replace(/```/g,''));
  const normalizeQuotes = (t: string) => t.replace(/[“”]/g, '"').replace(/[‘’]/g, '\'');
  const removeTrailingCommas = (t: string) => t.replace(/,\s*(\}|\])/g, '$1');
  const extractFenced = (t: string) => {
    const m = t.match(/```json\s*([\s\S]*?)```/i) || t.match(/```\s*([\s\S]*?)```/i);
    return m ? m[1] : null;
  };

  try {
    const model = getFlashModel();
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    const responseText = result.response.text();

    try {
      // First, attempt to parse as JSON
      // Try raw
      const tryParse = (s: string) => JSON.parse(removeTrailingCommas(normalizeQuotes(stripCodeFences(s))));
      let parsed: any;
      try {
        parsed = tryParse(responseText);
      } catch {
        // Try fenced block content only
        const fenced = extractFenced(responseText);
        if (fenced) parsed = tryParse(fenced);
        else throw new Error('No parseable JSON found');
      }
      const arr = Array.isArray(parsed) ? parsed : parsed?.flashcards;
      if (Array.isArray(arr)) {
        generatedCards = arr.map((c: any) => ({
          question: String(c.question || '').trim(),
          answer: String(c.answer || '').trim(),
          tags: Array.isArray(c.tags) ? c.tags.map((t: any) => String(t)) : ['ai-generated'],
          hint: typeof c.hint === 'string' ? c.hint : undefined,
        })).filter(c => c.question && c.answer);
      } else {
        throw new Error('JSON not in expected array/object format');
      }
    } catch (jsonError) {
      // If JSON parsing fails, use the fallback Q/A parser
      console.warn("JSON parsing failed, attempting Q/A fallback.");
      // Normalize bullet formats like "- Q:" as well
      const normalized = responseText.replace(/^-\s*/gm, '');
      generatedCards = parseQAFallback(normalized);
    }

    if (!generatedCards || generatedCards.length === 0) {
      throw new Error("AI returned no valid flashcards in JSON or Q/A format.");
    }

    const batch = writeBatch(db);
    const now = Timestamp.now();

    generatedCards.forEach(cardData => {
      const cardRef = doc(collection(db, `users/${user.uid}/flashcards/${deckId}/cards`));
      const newCard: FlashcardDoc = {
        ...cardData,
        interval: 0,
        repetition: 0,
        efactor: 2.5,
        dueDate: now,
        createdAt: now,
        updatedAt: now,
      };
      batch.set(cardRef, newCard);
    });

    await batch.commit();
    console.log(`${generatedCards.length} flashcards successfully generated and saved.`);

  } catch (error: any) {
    console.error("Error generating flashcards:", error);
    const msg = (error?.message || '').slice(0, 200);
    throw new Error(msg ? `Failed to generate: ${msg}` : "Failed to generate flashcards from notes. The AI may be temporarily unavailable or the response was unreadable.");
  }
}

/**
 * Provides a contextual explanation, hint, or memory trick for a given flashcard.
 */
export async function getContextualHelper(
  card: { question: string; answer: string },
  kind?: 'hint' | 'explain'
): Promise<string> {
  const directive = kind === 'hint'
    ? 'Provide a helpful hint that gently guides the student to the answer without giving it away.'
    : kind === 'explain'
    ? 'Provide a simple, beginner-friendly explanation of the answer.'
    : 'Provide either a simple explanation, a helpful hint, or a short mnemonic—whichever is most useful.';

  const prompt = `
    You are a friendly study coach.
    Flashcard Question: "${card.question}"
    Flashcard Answer: "${card.answer}"
    Task: ${directive}
    Keep it to 2-3 sentences, positive, and easy to understand.
  `;

  try {
    const model = getProModel();
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Error getting contextual helper:", error);
    return "Sorry, I couldn't come up with a hint right now. Keep trying, you've got this!";
  }
}

/**
 * Generates a 7-day study plan for a specific deck based on card review history.
 */
export async function planStudySchedule(deckId: string): Promise<StudySchedule> {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated.");

  const cardsQuery = query(collection(db, `users/${user.uid}/flashcards/${deckId}/cards`));
  const querySnapshot = await getDocs(cardsQuery);
  const allCards = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));

  if (allCards.length < 10) {
    throw new Error("A study plan requires at least 10 cards in the deck.");
  }

  const cardReviewData = allCards.map((c: any) => ({
    id: c.id,
    efactor: Number(c.efactor || 2.5).toFixed(2),
    interval: Number(c.interval || 0),
    dueDate: (c.dueDate instanceof Timestamp ? c.dueDate.toDate() : new Date()).toISOString().split('T')[0],
  }));

  const prompt = `
    You are an expert learning strategist using a spaced repetition system (SRS).
    Given a list of flashcards with their current SRS data, create a balanced 7-day study plan.
    Return a valid JSON object where each key is a date for the next 7 days (starting tomorrow)
    in "YYYY-MM-DD" format. The value for each date should be an object containing "cardIds" (an array of strings)
    and "reasoning" (a short string).

    Current Date: ${new Date().toISOString().split('T')[0]}
    Card Data:
    ${JSON.stringify(cardReviewData, null, 2)}
  `;

  try {
    const model = getProModel();
    const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } });
    const responseText = result.response.text();
    return JSON.parse(responseText) as StudySchedule;
  } catch (error) {
    console.error("Error planning study schedule:", error);
    throw new Error("Failed to create a study plan. The AI may be temporarily unavailable.");
  }
}

// Flashcards domain types (single source of truth)
import type { Timestamp } from 'firebase/firestore';

export type UID = string;
export type DeckId = string;
export type CardId = string;

// Ratings used by SRS and analytics
export type CardRating = 'again' | 'hard' | 'good' | 'easy';

// Supported card types
export type CardType = 'basic' | 'cloze' | 'mcq' | 'tf';

export interface SourceRef {
  type: 'note' | 'quiz' | 'ai-tutor' | 'manual';
  id?: string; // optional id of source document
}

export interface SRSData {
  repetitions: number; // total successful reps
  easeFactor: number;  // EF, default 2.5
  interval: number;    // days
  dueDate: Timestamp;  // when due next
  lastReviewed?: Timestamp;
}

export interface FlashcardBase {
  id: CardId;
  deckId: DeckId;
  type: CardType;
  // User-assigned difficulty 1 (easiest) .. 10 (hardest)
  difficulty?: number;
  tags?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  srs: SRSData;
  source?: SourceRef;
}

export interface BasicCard extends FlashcardBase {
  type: 'basic';
  question: string; // supports markdown
  answer: string;   // supports markdown
  images?: string[];
  audioUrl?: string;
}

export interface ClozeBlank {
  key: string; // c1, c2, ...
  answer: string;
  hint?: string;
}

export interface ClozeCard extends FlashcardBase {
  type: 'cloze';
  text: string; // full text with {{c1::...}} placeholders
  blanks?: ClozeBlank[];
}

export interface MCQCard extends FlashcardBase {
  type: 'mcq';
  prompt: string;
  options: string[];
  correctIndex: number; // index into options
  explanation?: string;
}

export interface TFCard extends FlashcardBase {
  type: 'tf';
  statement: string;
  answer: boolean;
  explanation?: string;
}

export type Flashcard = BasicCard | ClozeCard | MCQCard | TFCard;

export interface Deck {
  id: DeckId;
  name: string;
  description?: string;
  tags?: string[];
  // optional metadata
  subject?: string;         // e.g., Math, Biology
  difficulty?: number;      // 1..10 overall deck difficulty
  lastStudied?: Timestamp;  // last time user studied this deck
  // manual ordering position (lower comes first); optional for legacy decks
  position?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // derived stats (optional cached): counts, dueToday
  cardCount?: number;
  dueTodayCount?: number;
}

export interface AnalyticsRecord {
  id: string;
  userId: UID;
  deckId: DeckId;
  cardId: CardId;
  sessionId: string;
  reviewedAt: Timestamp;
  rating: CardRating;
  correct: boolean;
  difficulty?: number;
  timeToAnswerMs?: number;
}

export type AIJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type AIJobType = 'generate-cards' | 'explain-card' | 'summarize-deck';

export interface AIJobInput {
  deckId: DeckId;
  notes?: string;
  topic?: string;
  count?: number;
}

export interface AIJobOutputMeta {
  createdCardIds?: CardId[];
  count?: number;
}

export interface AIJob {
  id: string;
  userId: UID;
  status: AIJobStatus;
  type: AIJobType;
  input: AIJobInput;
  error?: string;
  outputMeta?: AIJobOutputMeta;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Simple comment type used by CommentService
export interface Comment {
  id: string;
  userId: UID;
  deckId: DeckId;
  cardId?: CardId | null;
  text: string;
  createdAt: Timestamp;
}


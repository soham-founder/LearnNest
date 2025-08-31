import type { Timestamp } from 'firebase/firestore';

export interface Quiz {
  id: string;
  userId: string;
  title: string;
  generatedFromNoteId?: string; // Optional: if generated from a specific note
  generatedFromNoteTitle?: string; // Optional: if generated from a specific note
  contentSource?: string; // Could be 'note', 'manual', 'paste'
  difficulty: 'easy' | 'medium' | 'hard';
  questionCount: number;
  questions: Question[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastAttemptedAt?: Timestamp; // When the user last attempted this quiz
  highestScore?: number; // Highest score achieved by the user for this quiz
  completedAttempts?: number; // Number of times quiz was completed
  language?: string; // BCP47 language code for multilingual generation
}

export type QuestionType = 'multiple-choice' | 'true-false' | 'fill-in-the-blank' | 'short-answer';

export interface Question {
  id: string; // Client-side generated ID for internal management before saving to Firestore
  type: QuestionType;
  questionText: string;
  options?: string[]; // For multiple-choice questions
  correctAnswer: string | string[]; // Single string for MC/TF/SA, array for FB (multiple blanks)
  explanation?: string; // Optional explanation for the correct answer
  difficultyRating?: 'easy' | 'medium' | 'hard'; // AI generated difficulty for this specific question
  bloomLevel?: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
  sources?: { id: string; title: string; url?: string; score?: number }[]; // RAG attributions
  language?: string;
  accessibilityNotes?: string;
}

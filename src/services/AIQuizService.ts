import { httpsCallable } from 'firebase/functions';
import { functions } from '../common/firebase';
import type { Question } from '../types/quiz';

export type GenerateQuizParams = {
  text: string;
  userId: string;
  numberOfQuestions?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  questionTypes?: Array<'multiple-choice' | 'true-false' | 'fill-in-the-blank' | 'short-answer'>;
  languageCode?: string; // e.g., 'en', 'es'
  contentSource?: 'note' | 'paste' | 'file' | 'transcript';
};

export type GenerateQuizResult = {
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionCount: number;
  questions: Question[];
  language?: string;
  contentSource?: string;
  validationReport: {
    total: number;
    passed: number;
    filteredOut: number;
    issues?: Array<{ id?: string; reasons: string[] }>
  };
  retrievedSources?: { id: string; title: string; url?: string; score?: number }[];
};

export async function generateValidatedQuiz(params: GenerateQuizParams): Promise<GenerateQuizResult> {
  const callable = httpsCallable(functions, 'generateValidatedQuiz');
  const res = await callable(params);
  return res.data as GenerateQuizResult;
}

export async function extractTextFromFile(base64: string, mimeType: string, fileName?: string): Promise<{ text: string; pageCount?: number; fileName?: string }>{
  const callable = httpsCallable(functions, 'extractTextFromFile');
  const res = await callable({ base64, mimeType, fileName });
  return res.data as any;
}

export async function submitQuizAttempt(opts: {
  userId: string;
  quizId: string;
  answers: string[];
  correctCount: number;
  totalCount: number;
  timePerQuestion?: number[];
  confidence?: number[];
  questions: Question[];
}): Promise<{ attemptId: string; accuracy: number; recommendedDifficulty: 'easy' | 'medium' | 'hard'; focusAreas: string[] }>{
  const callable = httpsCallable(functions, 'submitQuizAttempt');
  const res = await callable(opts);
  return res.data as any;
}

export async function generateQuestionHint(question: Question, languageCode = (navigator.language || 'en')): Promise<{ hints: string[]; explanation: string }>{
  const callable = httpsCallable(functions, 'generateQuestionHint');
  const res = await callable({ question, languageCode });
  return res.data as any;
}

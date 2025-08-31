import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../common/firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { AcademicCapIcon, PlusIcon, TrashIcon, CheckCircleIcon, XCircleIcon, PencilIcon } from '@heroicons/react/24/outline';
import { generateValidatedQuiz, extractTextFromFile, submitQuizAttempt, generateQuestionHint } from '../services/AIQuizService';
import { generateQuizFromNotes } from '../common/aiQuizGenerator';
import type { Quiz, QuestionType } from '../types/quiz';
import type { Question } from '../types/quiz';

interface Note {
  id: string;
  title: string;
  plainText: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const Quizzes: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiQuizError, setAiQuizError] = useState<string | null>(null);
  const [quizMode, setQuizMode] = useState<'generate' | 'practice' | 'exam' | 'results' | 'view'>('generate');

  // Quiz Generation State
  const [noteContentForAIGeneration, setNoteContentForAIGeneration] = useState('');
  const [quizDifficulty, setQuizDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [numberOfQuestions, setNumberOfQuestions] = useState(5);
  const [selectedQuestionTypes, setSelectedQuestionTypes] = useState<QuestionType[]>(['multiple-choice', 'true-false']);
  const [languageCode, setLanguageCode] = useState<string>((navigator.language || 'en').split('-')[0]);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [attemptFeedback, setAttemptFeedback] = useState<{ accuracy: number; recommendedDifficulty: 'easy' | 'medium' | 'hard'; focusAreas: string[] } | null>(null);
  // Track content provenance and selected note metadata
  const [contentSource, setContentSource] = useState<'note' | 'paste' | 'file' | 'transcript'>('paste');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedNoteTitle, setSelectedNoteTitle] = useState<string | null>(null);

  // Quiz Taking State
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<string[]>([]); // Store user's answers
  const [score, setScore] = useState<number | null>(null);

  // Title Editing State
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  // Fetch Quizzes from Firebase
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      const quizzesRef = collection(db, `users/${user.uid}/quizzes`);
      const q = query(quizzesRef, orderBy('createdAt', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        type FirestoreQuizData = {
          userId?: string;
          title?: string;
          generatedFromNoteId?: string;
          generatedFromNoteTitle?: string;
          contentSource?: string;
          difficulty?: 'easy' | 'medium' | 'hard';
          questionCount?: number;
          questions: Question[];
          createdAt?: Timestamp;
          updatedAt?: Timestamp;
          lastAttemptedAt?: Timestamp;
          highestScore?: number;
          completedAttempts?: number;
        };

        const fetchedQuizzes: Quiz[] = snapshot.docs.map(d => {
          const data = d.data() as FirestoreQuizData;
          return {
            id: d.id,
            userId: data.userId || user!.uid,
            title: data.title || 'Untitled Quiz',
            generatedFromNoteId: data.generatedFromNoteId,
            generatedFromNoteTitle: data.generatedFromNoteTitle,
            contentSource: data.contentSource,
            difficulty: data.difficulty || 'medium',
            questionCount: data.questionCount ?? (data.questions ? data.questions.length : 0),
            questions: data.questions || [],
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.fromDate(new Date()),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.fromDate(new Date()),
            lastAttemptedAt: data.lastAttemptedAt,
            highestScore: data.highestScore,
            completedAttempts: data.completedAttempts,
          } as Quiz;
        }).filter(quiz => quiz.id && quiz.id.trim() !== '');
        
        setQuizzes(fetchedQuizzes);
        // If a quiz was selected but no longer exists (e.g., deleted in another tab),
        // or if no quiz is selected and quizzes exist, select the first one.
        if (selectedQuiz && !fetchedQuizzes.some(q => q.id === selectedQuiz.id)) {
          setSelectedQuiz(fetchedQuizzes.length > 0 ? fetchedQuizzes[0] : null);
        } else if (!selectedQuiz && fetchedQuizzes.length > 0) {
          setSelectedQuiz(fetchedQuizzes[0]);
        }
      }, (error) => {
        console.error("Error fetching quizzes: ", error);
        alert("Failed to load quizzes.");
      });

      return () => unsubscribe();
    } else {
      setQuizzes([]);
      setSelectedQuiz(null);
    }
  }, [user, authLoading, selectedQuiz]);

  // Fetch User's Notes for AI Generation
  const [userNotes, setUserNotes] = useState<Note[]>([]);
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      // Notes live in the root 'notes' collection, filtered by createdBy and not archived
      const notesRef = collection(db, 'notes');
      const q = query(
        notesRef,
        where('createdBy', '==', user.uid),
        where('isArchived', '==', false),
        orderBy('updatedAt', 'desc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        type FirestoreNote = {
          title?: string;
          plainText?: string;
          createdAt?: Timestamp;
          updatedAt?: Timestamp;
        };
        const fetchedNotes: Note[] = snapshot.docs.map(d => {
          const data = d.data() as FirestoreNote;
          return {
            id: d.id,
            title: data.title || 'Untitled',
            plainText: data.plainText || '',
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.fromDate(new Date()),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.fromDate(new Date()),
          };
        });
        setUserNotes(fetchedNotes);
      }, (error) => {
        console.error("Error fetching user notes for quiz generation: ", error);
      });

      return () => unsubscribe();
    } else {
      setUserNotes([]);
    }
  }, [user, authLoading]);

  const handleGenerateQuizFromNotes = async () => {
    if (!user || noteContentForAIGeneration.trim() === '') return;

    setAiLoading(true);
    setAiQuizError(null);
    try {
      const result = await generateValidatedQuiz({
        text: noteContentForAIGeneration,
        userId: user.uid,
        numberOfQuestions,
        difficulty: quizDifficulty,
        questionTypes: selectedQuestionTypes,
        languageCode,
  contentSource,
      });
      const generatedQuiz = {
        id: 'temp',
        userId: user.uid,
        title: result.title,
        difficulty: result.difficulty,
        questionCount: result.questionCount,
        questions: (result.questions || []) as Question[],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        language: result.language,
        contentSource: result.contentSource,
  generatedFromNoteId: contentSource === 'note' ? (selectedNoteId || undefined) : undefined,
  generatedFromNoteTitle: contentSource === 'note' ? (selectedNoteTitle || undefined) : undefined,
      } as Quiz;

      // Save generated quiz to Firestore
      const newQuizRef = await addDoc(collection(db, `users/${user.uid}/quizzes`), {
        userId: generatedQuiz.userId,
        title: generatedQuiz.title,
        difficulty: generatedQuiz.difficulty,
        questionCount: generatedQuiz.questionCount,
        questions: generatedQuiz.questions,
        language: (generatedQuiz as any).language, // tolerated cast for optional field not in Quiz type
        contentSource: generatedQuiz.contentSource,
  generatedFromNoteId: (generatedQuiz as any).generatedFromNoteId,
  generatedFromNoteTitle: (generatedQuiz as any).generatedFromNoteTitle,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Create a proper quiz object with the Firestore-assigned ID
      const savedQuiz: Quiz = {
        ...generatedQuiz,
        id: newQuizRef.id,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      } as Quiz;
      
      setSelectedQuiz(savedQuiz);
      setQuizMode('view'); // Switch to view mode after generation
      setNoteContentForAIGeneration(''); // Clear input
  // reset any previous file/note state
  setSelectedNoteId(null);
  setSelectedNoteTitle(null);
  setContentSource('paste');
  setFileError(null);

    } catch (error: unknown) {
      console.error("Error generating or saving quiz: ", error);
      const code = (error as any)?.code as string | undefined;
      const baseMsg = error instanceof Error ? error.message : 'Failed to generate quiz. Please try again.';
      let hint = '';
      if (code === 'failed-precondition') {
        hint = ' Missing server configuration (OpenAI/Gemini/Pinecone).';
      } else if (code === 'unauthenticated') {
        hint = ' Please sign in again.';
      } else if (code === 'internal' && baseMsg.includes('parse quiz JSON')) {
        hint = ' Model returned invalid JSON. Try again in a moment.';
      }
      // Fallback: try client-side Gemini path (requires VITE_GEMINI_API_KEY)
      try {
        const fallback = await generateQuizFromNotes(noteContentForAIGeneration, user.uid, {
          numberOfQuestions,
          difficulty: quizDifficulty,
          questionTypes: selectedQuestionTypes,
        });
        const newQuizRef = await addDoc(collection(db, `users/${user.uid}/quizzes`), {
          userId: user.uid,
          title: fallback.title,
          difficulty: fallback.difficulty,
          questionCount: fallback.questionCount,
          questions: fallback.questions,
          language: languageCode,
          contentSource,
          generatedFromNoteId: contentSource === 'note' ? selectedNoteId : undefined,
          generatedFromNoteTitle: contentSource === 'note' ? selectedNoteTitle : undefined,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        const savedQuiz: Quiz = {
          ...fallback,
          id: newQuizRef.id,
          userId: user.uid,
          language: languageCode,
          contentSource,
          generatedFromNoteId: contentSource === 'note' ? selectedNoteId || undefined : undefined,
          generatedFromNoteTitle: contentSource === 'note' ? selectedNoteTitle || undefined : undefined,
        } as Quiz;
        setSelectedQuiz(savedQuiz);
        setQuizMode('view');
        setNoteContentForAIGeneration('');
        setSelectedNoteId(null);
        setSelectedNoteTitle(null);
        setContentSource('paste');
        setFileError(null);
      } catch (fallbackErr: unknown) {
        console.error('Fallback generation failed: ', fallbackErr);
        const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        setAiQuizError(`${baseMsg}${hint}${code ? ` [${code}]` : ''} | Fallback failed: ${fbMsg}`);
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handleFileSelected = async (file: File) => {
    setFileError(null);
    try {
      setUploading(true);
      const b64 = await file.arrayBuffer().then(buf => {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      });
      const { text } = await extractTextFromFile(b64, file.type, file.name);
      setNoteContentForAIGeneration(text || '');
  setContentSource('file');
  setSelectedNoteId(null);
  setSelectedNoteTitle(null);
    } catch (e: unknown) {
      setFileError(e instanceof Error ? e.message : 'Failed to extract text from file');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteQuiz = async (quizId: string) => {
    console.log("handleDeleteQuiz called with quizId:", quizId);
    
    if (!user) {
      alert("User not authenticated.");
      return;
    }
    
    if (!quizId || quizId.trim() === '') {
      alert("Invalid quiz ID. Cannot delete quiz.");
      console.error("Empty or invalid quizId:", quizId);
      return;
    }
    
    if (window.confirm('Are you sure you want to delete this quiz?')) {
      try {
        const docPath = `users/${user.uid}/quizzes/${quizId}`;
        console.log("Attempting to delete quiz at path:", docPath);
        await deleteDoc(doc(db, docPath));
        console.log("Quiz deleted successfully");
        if (selectedQuiz?.id === quizId) {
          setSelectedQuiz(null);
          setQuizMode('generate'); // Go back to generate mode if current quiz is deleted
        }
      } catch (error: unknown) {
        console.error("Error deleting quiz: ", error);
        if (error instanceof Error) {
          if (error.message.includes('permission-denied')) {
            alert("Permission denied. Please check Firestore security rules or contact support.");
          } else if (error.message.includes('not-found')) {
            alert("Quiz not found. It may have already been deleted.");
          } else {
            alert(`Failed to delete quiz: ${error.message}`);
          }
        } else {
          alert("Failed to delete quiz: Unknown error");
        }
      }
    }
  };

  const handleUpdateQuizTitle = async (quizId: string, newTitle: string) => {
    console.log("handleUpdateQuizTitle called with quizId:", quizId, "newTitle:", newTitle);
    
    if (!user) {
      alert("User not authenticated.");
      return;
    }
    
    if (!quizId || quizId.trim() === '') {
      alert("Invalid quiz ID. Cannot update quiz title.");
      console.error("Empty or invalid quizId:", quizId);
      setIsEditingTitle(false);
      setEditedTitle('');
      return;
    }
    
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) {
      alert("Quiz title cannot be empty.");
      setIsEditingTitle(false);
      setEditedTitle('');
      return;
    }

    try {
      const docPath = `users/${user.uid}/quizzes/${quizId}`;
      console.log("Attempting to update quiz title at path:", docPath);
      await updateDoc(doc(db, docPath), {
        title: trimmedTitle,
        updatedAt: serverTimestamp(),
      });
      console.log("Quiz title updated successfully");
      setIsEditingTitle(false);
      setEditedTitle('');
      // Update the selected quiz locally to reflect the change immediately
      if (selectedQuiz && selectedQuiz.id === quizId) {
        setSelectedQuiz({
          ...selectedQuiz,
          title: trimmedTitle
        });
      }
  } catch (error: unknown) {
      console.error("Error updating quiz title: ", error);
      if (error instanceof Error) {
        if (error.message.includes('permission-denied')) {
          alert("Permission denied. Please check Firestore security rules or contact support.");
        } else if (error.message.includes('not-found')) {
          alert("Quiz not found. It may have been deleted.");
        } else {
          alert(`Failed to update quiz title: ${error.message}`);
        }
      } else {
        alert("Failed to update quiz title: Unknown error");
      }
      setIsEditingTitle(false);
      setEditedTitle('');
    }
  };

  const startEditingTitle = (currentTitle: string) => {
    setEditedTitle(currentTitle || 'Untitled Quiz');
    setIsEditingTitle(true);
  };

  const startQuiz = (quiz: Quiz, mode: 'practice' | 'exam') => {
    setSelectedQuiz(quiz);
    setQuizMode(mode);
    setCurrentQuestionIndex(0);
    setUserAnswers(new Array(quiz.questions.length).fill(''));
    setScore(null);
  };

  const handleAnswerChange = (questionIndex: number, answer: string) => {
    const newAnswers = [...userAnswers];
    newAnswers[questionIndex] = answer;
    setUserAnswers(newAnswers);
  };

  const handleNextQuestion = () => {
    if (selectedQuiz && currentQuestionIndex < selectedQuiz.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else if (selectedQuiz) {
      // Quiz finished, calculate score
  calculateScore();
      setQuizMode('results');
    }
  };

  const calculateScore = async () => {
    if (!selectedQuiz) return;

    let correctCount = 0;
    selectedQuiz.questions.forEach((q, index) => {
      const userAnswer = userAnswers[index];
      const correct = Array.isArray(q.correctAnswer)
        ? q.correctAnswer.map(p => p.toLowerCase().trim()).every(part => userAnswer.toLowerCase().split(',').map(s => s.trim()).includes(part))
        : userAnswer.toLowerCase().trim() === String(q.correctAnswer).toLowerCase().trim();
      if (correct) correctCount++;
    });
    const computed = (correctCount / selectedQuiz.questions.length) * 100;
    setScore(computed);
    try {
      if (user) {
        const feedback = await submitQuizAttempt({
          userId: user.uid,
          quizId: selectedQuiz.id,
          answers: userAnswers,
          correctCount,
          totalCount: selectedQuiz.questions.length,
      questions: selectedQuiz.questions as Question[],
        });
        setAttemptFeedback(feedback);
      }
    } catch (e: unknown) {
      console.warn('Failed to persist attempt', e);
    }
  };

  // Display loading for auth
  if (authLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-full bg-neutral-light dark:bg-neutral-dark font-sans">
        <div className="w-12 h-12 border-4 border-primary-sky-blue border-t-transparent rounded-full animate-spin"></div>
        <p className="ml-4 text-neutral-600 dark:text-neutral-400">Loading authentication...</p>
      </div>
    );
  }

  // Display message if user is not logged in
  if (!user) {
    return (
      <div className="p-6 flex items-center justify-center h-full bg-neutral-light dark:bg-neutral-dark font-sans">
        <p className="text-center text-red-500 dark:text-red-400 text-lg">Please log in to manage your quizzes.</p>
      </div>
    );
  }

  const currentQuestion = selectedQuiz?.questions[currentQuestionIndex];

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden bg-neutral-light dark:bg-neutral-dark font-sans">
      {/* Quiz List Sidebar */}
      <div className="w-full md:w-64 bg-neutral-100 dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-700 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="font-poppins text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">My Quizzes</h2>
          <button
            onClick={() => { setSelectedQuiz(null); setQuizMode('generate'); }}
            className="w-full bg-secondary-green hover:bg-green-600 text-white font-sans font-medium py-2 px-4 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary-green flex items-center justify-center transition duration-150 ease-in-out mb-4 transform hover:-translate-y-0.5"
          >
            <PlusIcon className="h-5 w-5 mr-2" /> Generate New Quiz
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {quizzes.length === 0 ? (
            <p className="font-sans text-center text-neutral-500 dark:text-neutral-400 mt-4 text-sm px-4">No quizzes yet. Create one from notes!</p>
          ) : (
            quizzes.map((quiz) => (
              <div
                key={quiz.id}
                onClick={() => { 
                  console.log("Quiz selected:", quiz.id, quiz);
                  setSelectedQuiz(quiz); 
                  setQuizMode('view'); 
                }}
                className={`flex items-center justify-between p-3 cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700 transition duration-150 ease-in-out mx-2 my-1 rounded-xl
                  ${selectedQuiz?.id === quiz.id ? 'bg-primary-sky-blue bg-opacity-10 dark:bg-primary-sky-blue dark:bg-opacity-20 text-primary-sky-blue font-semibold' : ''}
                `}
              >
                <div className="flex-grow">
                  <h3 className="font-poppins text-md font-medium text-neutral-900 dark:text-neutral-100 truncate flex-grow">
                    {quiz.title || 'Untitled Quiz'}
                  </h3>
                  <p className="font-sans text-xs text-neutral-500 dark:text-neutral-400">Questions: {quiz.questions.length}</p>
                  {quiz.contentSource && (
                    <p className="font-sans text-[11px] text-neutral-500 dark:text-neutral-400">
                      Source: {quiz.contentSource}{quiz.generatedFromNoteTitle ? ` • ${quiz.generatedFromNoteTitle}` : ''}
                    </p>
                  )}
                  {quiz.highestScore !== undefined && (
                    <p className="font-sans text-xs text-secondary-green dark:text-secondary-green">Highest Score: {quiz.highestScore?.toFixed(0)}%</p>
                  )}
                  {quiz.completedAttempts !== undefined && quiz.completedAttempts > 0 && (
                    <p className="font-sans text-xs text-neutral-500 dark:text-neutral-400">Attempts: {quiz.completedAttempts}</p>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteQuiz(quiz.id); }}
                  className="ml-2 p-1 rounded-full text-neutral-400 hover:text-red-600 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition duration-150 ease-in-out"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col p-6 bg-white dark:bg-neutral-800 rounded-xl shadow-soft m-4 overflow-hidden relative">
        {quizMode === 'generate' && (
          <div className="flex flex-col h-full">
            <h2 className="font-poppins text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-6">Generate New Quiz</h2>
            {aiQuizError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl relative mb-4" role="alert">
                <strong className="font-bold">Error:</strong>
                <span className="block sm:inline"> {aiQuizError}</span>
              </div>
            )}
            <div className="mb-4">
              <label htmlFor="noteContent" className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">Paste Note Content (or select from your notes below):</label>
              <textarea
                id="noteContent"
                value={noteContentForAIGeneration}
                onChange={(e) => {
                  setNoteContentForAIGeneration(e.target.value);
                  setContentSource('paste');
                  setSelectedNoteId(null);
                  setSelectedNoteTitle(null);
                }}
                className="w-full h-40 p-4 rounded-xl border-2 border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 resize-y focus:outline-none focus:ring-2 focus:ring-primary-sky-blue focus:border-primary-sky-blue transition duration-150 ease-in-out mb-4"
                placeholder="E.g., Key concepts about React hooks, Firebase authentication flow, etc."
              ></textarea>
              {fileError && (
                <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded-xl relative mb-4" role="alert">
                  <strong className="font-bold">File:</strong>
                  <span className="block sm:inline"> {fileError}</span>
                </div>
              )}
              <div className="flex items-center gap-3 mb-4">
                <input
                  type="file"
                  accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => e.target.files && e.target.files[0] && handleFileSelected(e.target.files[0])}
                  className="block w-full text-sm text-neutral-700 dark:text-neutral-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary-sky-blue file:text-white hover:file:bg-blue-700"
                />
                {uploading && <span className="text-sm text-neutral-500">Extracting text…</span>}
              </div>
              <div className="mb-4">
                <label className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">Select a Note:</label>
                <select
                  onChange={(e) => {
                    const selectedNote = userNotes.find(note => note.id === e.target.value);
                    if (selectedNote) {
                      setNoteContentForAIGeneration(selectedNote.plainText);
                      setSelectedNoteId(selectedNote.id);
                      setSelectedNoteTitle(selectedNote.title);
                      setContentSource('note');
                    } else {
                      setSelectedNoteId(null);
                      setSelectedNoteTitle(null);
                      setContentSource('paste');
                    }
                  }}
                  className="w-full p-2 rounded-xl border-2 border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-sky-blue focus:border-primary-sky-blue"
                >
                  <option value="">-- Select an existing note --</option>
                  {userNotes.map(note => (
                    <option key={note.id} value={note.id}>{note.title}</option>
                  ))}
                </select>
                {contentSource === 'note' && selectedNoteTitle && (
                  <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">Using note: <span className="font-medium">{selectedNoteTitle}</span></p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label htmlFor="difficulty" className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">Difficulty:</label>
                  <select
                    id="difficulty"
                    value={quizDifficulty}
                    onChange={(e) => setQuizDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                    className="w-full p-2 rounded-xl border-2 border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-sky-blue focus:border-primary-sky-blue"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="numQuestions" className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">Number of Questions:</label>
                  <input
                    type="number"
                    id="numQuestions"
                    value={numberOfQuestions}
                    onChange={(e) => setNumberOfQuestions(Math.max(1, parseInt(e.target.value)) || 1)}
                    min="1"
                    className="w-full p-2 rounded-xl border-2 border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-sky-blue focus:border-primary-sky-blue"
                  />
                </div>
                <div>
                  <label htmlFor="language" className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">Language:</label>
                  <select
                    id="language"
                    value={languageCode}
                    onChange={(e) => setLanguageCode(e.target.value)}
                    className="w-full p-2 rounded-xl border-2 border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-sky-blue focus:border-primary-sky-blue"
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="hi">हिन्दी</option>
                  </select>
                </div>
              </div>
              <div className="mb-6">
                <label className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">Question Types:</label>
                <div className="flex flex-wrap gap-3">
                  {(['multiple-choice', 'true-false', 'fill-in-the-blank', 'short-answer'] as QuestionType[]).map(type => (
                    <label key={type} className="inline-flex items-center text-neutral-900 dark:text-neutral-100">
                      <input
                        type="checkbox"
                        value={type}
                        checked={selectedQuestionTypes.includes(type)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedQuestionTypes(prev => [...prev, type]);
                          } else {
                            setSelectedQuestionTypes(prev => prev.filter(t => t !== type));
                          }
                        }}
                        className="form-checkbox h-5 w-5 text-primary-sky-blue rounded"
                      />
                      <span className="ml-2 capitalize">{type.replace('-', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={handleGenerateQuizFromNotes}
              className="bg-primary-sky-blue hover:bg-blue-700 text-white font-sans font-medium py-3 px-6 rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-sky-blue flex items-center justify-center transition duration-150 ease-in-out transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={aiLoading || noteContentForAIGeneration.trim() === '' || selectedQuestionTypes.length === 0}
            >
              {aiLoading ? 'Generating...' : 'Generate Quiz'}
            </button>
          </div>
        )}

        {quizMode === 'view' && selectedQuiz && (
          <div className="flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              {isEditingTitle ? (
                <div className="flex items-center space-x-2 flex-1">
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onBlur={() => {
                      console.log("Input blur, selectedQuiz:", selectedQuiz);
                      handleUpdateQuizTitle(selectedQuiz.id, editedTitle);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        console.log("Enter pressed, selectedQuiz:", selectedQuiz);
                        handleUpdateQuizTitle(selectedQuiz.id, editedTitle);
                      } else if (e.key === 'Escape') {
                        setIsEditingTitle(false);
                        setEditedTitle('');
                      }
                    }}
                    className="font-poppins text-2xl font-semibold text-neutral-900 dark:text-neutral-100 bg-transparent border-b-2 border-primary-sky-blue focus:outline-none flex-1"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      console.log("Save button clicked, selectedQuiz:", selectedQuiz);
                      handleUpdateQuizTitle(selectedQuiz.id, editedTitle);
                    }}
                    className="p-1 text-green-600 hover:text-green-700 transition duration-150"
                  >
                    <CheckCircleIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingTitle(false);
                      setEditedTitle('');
                    }}
                    className="p-1 text-red-600 hover:text-red-700 transition duration-150"
                  >
                    <XCircleIcon className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-2 flex-1">
                  <h2 className="font-poppins text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{selectedQuiz.title || 'Untitled Quiz'}</h2>
                  <button
                    onClick={() => {
                      console.log("Edit button clicked, selectedQuiz:", selectedQuiz);
                      startEditingTitle(selectedQuiz.title);
                    }}
                    className="p-1 text-neutral-400 hover:text-primary-sky-blue transition duration-150"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      console.log("Delete button clicked, selectedQuiz:", selectedQuiz);
                      handleDeleteQuiz(selectedQuiz.id);
                    }}
                    className="p-1 text-neutral-400 hover:text-red-600 transition duration-150"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-neutral-600 dark:text-neutral-400 mb-2">Difficulty: <span className="capitalize">{selectedQuiz.difficulty}</span></p>
            <p className="text-neutral-600 dark:text-neutral-400 mb-1">Questions: {selectedQuiz.questions.length}</p>
            {(selectedQuiz.contentSource || selectedQuiz.generatedFromNoteTitle) && (
              <p className="text-neutral-500 dark:text-neutral-400 mb-4 text-sm">
                Source: {selectedQuiz.contentSource || 'unknown'}{selectedQuiz.generatedFromNoteTitle ? ` • ${selectedQuiz.generatedFromNoteTitle}` : ''}
              </p>
            )}
            <div className="flex space-x-4 mb-6">
              <button
                onClick={() => startQuiz(selectedQuiz, 'practice')}
                className="bg-secondary-green hover:bg-green-600 text-white font-sans font-medium py-2 px-5 rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary-green flex items-center justify-center transition duration-150 ease-in-out transform hover:-translate-y-0.5"
              >
                Start Practice
              </button>
              <button
                onClick={() => startQuiz(selectedQuiz, 'exam')}
                className="bg-accent-warm-orange hover:bg-orange-600 text-white font-sans font-medium py-2 px-5 rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-warm-orange flex items-center justify-center transition duration-150 ease-in-out transform hover:-translate-y-0.5"
              >
                Start Exam
              </button>
            </div>
            <h3 className="font-poppins text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3">Questions Overview:</h3>
            <div className="space-y-3">
              {selectedQuiz.questions.map((q, index) => (
                <div key={index} className="bg-neutral-100 dark:bg-neutral-700 p-4 rounded-xl shadow-sm">
                  <p className="font-sans text-neutral-900 dark:text-neutral-100 font-medium mb-1">Q{index + 1}: {q.questionText}</p>
                  {q.type === 'multiple-choice' && q.options && (
                    <ul className="list-disc list-inside text-neutral-700 dark:text-neutral-300 text-sm">
                      {q.options.map((option, optIndex) => (
                        <li key={optIndex}>{option}</li>
                      ))}
                    </ul>
                  )}
                  <p className="font-sans text-xs text-secondary-green dark:text-secondary-green mt-2">Correct Answer: {Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : q.correctAnswer}</p>
                  {q.explanation && (
                    <p className="font-sans text-xs text-neutral-500 dark:text-neutral-400 mt-1">Explanation: {q.explanation}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(quizMode === 'practice' || quizMode === 'exam') && selectedQuiz && (
          <div className="flex flex-col h-full relative">
            <h2 className="font-poppins text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">{selectedQuiz.title} ({quizMode === 'practice' ? 'Practice' : 'Exam'} Mode)</h2>
            <div className="flex items-center mb-6">
              <div className="w-full bg-neutral-200 rounded-full h-2.5 dark:bg-neutral-700">
                <div className="bg-primary-sky-blue h-2.5 rounded-full transition-all duration-500 ease-out" style={{ width: `${((currentQuestionIndex + 1) / selectedQuiz.questions.length) * 100}%` }}></div>
              </div>
              <p className="font-sans text-sm text-neutral-600 dark:text-neutral-400 ml-4">{currentQuestionIndex + 1} / {selectedQuiz.questions.length}</p>
            </div>

            {currentQuestion && (
              <div className="flex-1 overflow-y-auto pr-2 mb-6">
                <div className="bg-neutral-100 dark:bg-neutral-700 p-6 rounded-xl shadow-md mb-6">
                  <h3 className="font-poppins text-xl font-medium text-neutral-900 dark:text-neutral-100 mb-4">Q{currentQuestionIndex + 1}: {currentQuestion.questionText}</h3>

                  {currentQuestion.type === 'multiple-choice' && currentQuestion.options && (
                    <div className="space-y-3">
                      {currentQuestion.options.map((option, optIndex) => (
                        <label key={optIndex} className="flex items-center text-neutral-900 dark:text-neutral-100 cursor-pointer">
                          <input
                            type="radio"
                            name="quiz-option"
                            value={option}
                            checked={userAnswers[currentQuestionIndex] === option}
                            onChange={() => handleAnswerChange(currentQuestionIndex, option)}
                            className="form-radio h-5 w-5 text-primary-sky-blue"
                            disabled={quizMode === 'practice' && userAnswers[currentQuestionIndex] !== ''} // Disable after first answer in practice mode
                          />
                          <span className="ml-3 text-lg">{option}</span>
                          {quizMode === 'practice' && userAnswers[currentQuestionIndex] !== '' && (
                            option === currentQuestion.correctAnswer ? (
                              <CheckCircleIcon className="ml-auto h-6 w-6 text-secondary-green" />
                            ) : userAnswers[currentQuestionIndex] === option ? (
                              <XCircleIcon className="ml-auto h-6 w-6 text-red-500" />
                            ) : null
                          )}
                        </label>
                      ))}
                    </div>
                  )}

                  {currentQuestion.type === 'true-false' && (
                    <div className="space-y-3">
                      <label className="flex items-center text-neutral-900 dark:text-neutral-100 cursor-pointer">
                        <input
                          type="radio"
                          name="quiz-tf"
                          value="True"
                          checked={userAnswers[currentQuestionIndex] === 'True'}
                          onChange={() => handleAnswerChange(currentQuestionIndex, 'True')}
                          className="form-radio h-5 w-5 text-primary-sky-blue"
                          disabled={quizMode === 'practice' && userAnswers[currentQuestionIndex] !== ''}
                        />
                        <span className="ml-3 text-lg">True</span>
                        {quizMode === 'practice' && userAnswers[currentQuestionIndex] !== '' && (
                          'True' === currentQuestion.correctAnswer ? (
                            <CheckCircleIcon className="ml-auto h-6 w-6 text-secondary-green" />
                          ) : userAnswers[currentQuestionIndex] === 'True' ? (
                            <XCircleIcon className="ml-auto h-6 w-6 text-red-500" />
                          ) : null
                        )}
                      </label>
                      <label className="flex items-center text-neutral-900 dark:text-neutral-100 cursor-pointer">
                        <input
                          type="radio"
                          name="quiz-tf"
                          value="False"
                          checked={userAnswers[currentQuestionIndex] === 'False'}
                          onChange={() => handleAnswerChange(currentQuestionIndex, 'False')}
                          className="form-radio h-5 w-5 text-primary-sky-blue"
                          disabled={quizMode === 'practice' && userAnswers[currentQuestionIndex] !== ''}
                        />
                        <span className="ml-3 text-lg">False</span>
                        {quizMode === 'practice' && userAnswers[currentQuestionIndex] !== '' && (
                          'False' === currentQuestion.correctAnswer ? (
                            <CheckCircleIcon className="ml-auto h-6 w-6 text-secondary-green" />
                          ) : userAnswers[currentQuestionIndex] === 'False' ? (
                            <XCircleIcon className="ml-auto h-6 w-6 text-red-500" />
                          ) : null
                        )}
                      </label>
                    </div>
                  )}

                  {(currentQuestion.type === 'short-answer' || currentQuestion.type === 'fill-in-the-blank') && (
                    <textarea
                      value={userAnswers[currentQuestionIndex]}
                      onChange={(e) => handleAnswerChange(currentQuestionIndex, e.target.value)}
                      placeholder={currentQuestion.type === 'fill-in-the-blank' ? 'Enter comma-separated answers for blanks' : 'Your answer...'}
                      rows={quizMode === 'practice' && userAnswers[currentQuestionIndex] !== '' ? 3 : 1}
                      className="w-full p-3 border-2 border-neutral-300 dark:border-neutral-600 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-sky-blue focus:border-primary-sky-blue bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 resize-y transition duration-150 ease-in-out"
                      disabled={quizMode === 'practice' && userAnswers[currentQuestionIndex] !== ''}
                    ></textarea>
                  )}

                  {quizMode === 'practice' && userAnswers[currentQuestionIndex] !== '' && (
                    <div className="mt-4 p-3 bg-neutral-200 dark:bg-neutral-900 rounded-xl shadow-inner">
                      <p className="font-medium text-neutral-900 dark:text-neutral-100 mb-1">Correct Answer: {Array.isArray(currentQuestion.correctAnswer) ? currentQuestion.correctAnswer.join(', ') : currentQuestion.correctAnswer}</p>
                      {currentQuestion.explanation && (
                        <p className="text-sm text-neutral-700 dark:text-neutral-300">Explanation: {currentQuestion.explanation}</p>
                      )}
                    </div>
                  )}
                  {quizMode === 'practice' && userAnswers[currentQuestionIndex] === '' && (
                    <div className="mt-4">
                      <button
                        onClick={async () => {
                          try {
                            const h = await generateQuestionHint(currentQuestion as Question, languageCode);
                            alert((h.hints || []).join('\n')); // minimal progressive hint UI
                          } catch (e) {
                            console.warn('Failed to get hint', e);
                          }
                        }}
                        className="text-sm text-primary-sky-blue hover:underline"
                      >
                        Show hint
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mt-auto p-4 border-t border-neutral-200 dark:border-neutral-700">
              <button
                onClick={() => handleNextQuestion()}
                className="bg-primary-sky-blue hover:bg-blue-700 text-white font-sans font-medium py-2 px-5 rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-sky-blue transition duration-150 ease-in-out transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={userAnswers[currentQuestionIndex] === ''}
              >
                {currentQuestionIndex === selectedQuiz.questions.length - 1 ? 'Finish Quiz' : 'Next Question'}
              </button>
            </div>
          </div>
        )}

        {quizMode === 'results' && selectedQuiz && (
          <div className="flex flex-col items-center justify-center h-full font-sans text-center">
            <AcademicCapIcon className="h-24 w-24 text-accent-warm-orange mb-6" />
            <h2 className="font-poppins text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Quiz Results</h2>
            <p className="text-4xl font-bold mb-6">
              <span className={`${score && score >= 70 ? 'text-secondary-green' : 'text-red-500'}`}>{score?.toFixed(0)}%</span>
            </p>
            {attemptFeedback && (
              <div className="w-full max-w-lg bg-neutral-100 dark:bg-neutral-700 p-4 rounded-xl text-left mb-6">
                <p className="font-sans text-neutral-800 dark:text-neutral-200 mb-2"><span className="font-semibold">Recommended next difficulty:</span> <span className="capitalize">{attemptFeedback.recommendedDifficulty}</span></p>
                {attemptFeedback.focusAreas?.length > 0 && (
                  <div>
                    <p className="font-sans font-semibold text-neutral-800 dark:text-neutral-200">Focus areas:</p>
                    <ul className="list-disc list-inside text-neutral-700 dark:text-neutral-300 text-sm">
                      {attemptFeedback.focusAreas.map((f, i) => (<li key={i}>{f}</li>))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <div className="w-full max-w-lg space-y-4 mb-6 text-left">
              {selectedQuiz.questions.map((q, index) => {
                const ua = userAnswers[index] || '';
                const correct = Array.isArray(q.correctAnswer)
                  ? q.correctAnswer.map(p => p.toLowerCase().trim()).every(part => ua.toLowerCase().split(',').map(s => s.trim()).includes(part))
                  : ua.toLowerCase().trim() === String(q.correctAnswer).toLowerCase().trim();
                return (
                  <div key={index} className="flex items-start justify-between bg-white dark:bg-neutral-700 p-3 rounded-xl shadow-sm">
                    <p className="font-sans text-neutral-800 dark:text-neutral-200 flex-1 text-left mr-4">{`Q${index + 1}: ${q.questionText}`}</p>
                    <div className="flex items-center space-x-2">
                      {correct ? (
                        <CheckCircleIcon className="h-6 w-6 text-secondary-green" />
                      ) : (
                        <XCircleIcon className="h-6 w-6 text-red-500" />
                      )}
                      <p className={`font-sans text-sm font-medium ${correct ? 'text-secondary-green' : 'text-red-500'}`}>
                        {correct ? 'Correct' : 'Incorrect'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => startQuiz(selectedQuiz, 'practice')} // Allow retaking in practice mode
                className="bg-primary-sky-blue hover:bg-blue-700 text-white font-sans font-medium py-2 px-5 rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-sky-blue transition duration-150 ease-in-out transform hover:-translate-y-0.5"
              >
                Retake Quiz (Practice Mode)
              </button>
              <button
                onClick={() => setSelectedQuiz(null)} // Go back to quiz list
                className="mt-3 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-200 font-sans font-medium py-2 px-5 rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-300 transition duration-150 ease-in-out transform hover:-translate-y-0.5"
              >
                Back to Quizzes
              </button>
            </div>
          </div>
        )}

        {!selectedQuiz && quizMode === 'view' && (
          <div className="flex flex-col items-center justify-center h-full font-sans text-center">
            <AcademicCapIcon className="h-24 w-24 text-primary-sky-blue mb-6" />
            <h2 className="font-poppins text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Select a Quiz</h2>
            <p className="text-neutral-600 dark:text-neutral-400 mb-6">Choose an existing quiz from the sidebar or generate a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Quizzes;

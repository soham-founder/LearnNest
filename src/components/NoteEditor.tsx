import React, { useState, useEffect, useRef } from 'react';
// import ReactQuill from 'react-quill';
// import 'react-quill/dist/quill.snow.css'; // ES6
import { SparklesIcon, LightBulbIcon, QuestionMarkCircleIcon, DocumentCheckIcon } from '@heroicons/react/24/outline'; // Using DocumentCheckIcon as an alternative for SaveIcon
import { askGemini } from '../pages/AITutor'; // Reusing the askGemini function
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../common/firebase';
import { useAuth } from '../context/AuthContext';

/**
 * @interface NoteEditorProps
 * @description Props for the NoteEditor component.
 * @property {object | null} note - The currently selected note object, or null if no note is selected.
 * @property {(noteId: string, newTitle: string, newContent: string) => void} onSaveNote - Callback to save the note.
 */
interface NoteEditorProps {
  note: {
    id: string;
    title: string;
    content: string;
  } | null;
  onSaveNote: (noteId: string, title: string, content: string) => void;
}

/**
 * @interface AiResponse
 * @description Defines the structure for AI-generated responses displayed inline.
 * @property {number} id - Unique ID for the AI response (e.g., timestamp).
 * @property {'summary' | 'explanation' | 'quiz'} type - The type of AI action that generated the response.
 * @property {string} content - The AI-generated text content.
 */
interface AiResponse {
  id: number;
  type: 'summary' | 'explanation' | 'quiz';
  content: string;
}

/**
 * @component NoteEditor
 * @description Provides an interface for editing note content, includes auto-save, AI tools, and save functionality.
 * @param {NoteEditorProps} props - The props for the component.
 */
const NoteEditor: React.FC<NoteEditorProps> = ({ note, onSaveNote }) => {
  const { user } = useAuth();
  const [currentTitle, setCurrentTitle] = useState(note?.title || '');
  const [currentContent, setCurrentContent] = useState(note?.content || '');
  const [aiResponses, setAiResponses] = useState<AiResponse[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const autoSaveTimeoutRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  /**
   * @function useEffect
   * @description Updates editor state when the selected note changes.
   */
  useEffect(() => {
    setCurrentTitle(note?.title || '');
    setCurrentContent(note?.content || '');
    setAiResponses([]); // Clear AI responses when note changes
  }, [note]);

  /**
   * @function useEffect
   * @description Implements auto-save functionality with a debounce delay.
   * Shows a toast notification upon successful auto-save.
   */
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    if (note) {
      autoSaveTimeoutRef.current = setTimeout(() => {
        // Only save if content has actually changed to prevent unnecessary writes.
        if (currentTitle !== note.title || currentContent !== note.content) {
          onSaveNote(note.id, currentTitle, currentContent);
          setShowToast(true);
          // Clear any existing toast timeout before setting a new one.
          if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
          }
          toastTimeoutRef.current = setTimeout(() => {
            setShowToast(false);
          }, 3000) as unknown as number;
        }
      }, 1000) as unknown as number; // 1-second debounce for auto-save
    }

    // Cleanup function to clear timeouts on component unmount or dependency change.
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [currentTitle, currentContent, note, onSaveNote]);

  /**
   * @function useEffect
   * @description Adds keyboard shortcut (Ctrl/Cmd + S) for saving the note.
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault(); // Prevent browser's default save action.
        if (note) {
          onSaveNote(note.id, currentTitle, currentContent);
          setShowToast(true);
          if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
          }
          toastTimeoutRef.current = setTimeout(() => {
            setShowToast(false);
          }, 3000) as unknown as number;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentTitle, currentContent, note, onSaveNote]);

  /**
   * @function handleAiAction
   * @description Handles AI-powered actions (summarize, explain, generate quiz).
   * Uses askGemini helper and processes responses, adding flashcards to Firestore for 'quiz' action.
   * @param {'summary' | 'explanation' | 'quiz'} type - The type of AI action to perform.
   */
  const handleAiAction = async (type: 'summary' | 'explanation' | 'quiz') => {
    if (!note || aiLoading || !user) return;
    setAiLoading(true);
    let prompt = '';
    let aiResult = '';

    try {
      // Construct prompt based on AI action type.
      if (type === 'summary') {
        prompt = `Summarize this note briefly, for a student up to 12th grade:\n\n${currentContent}`;
      } else if (type === 'explanation') {
        prompt = `Explain this note in a simple way, like I'm 15, for a student up to 12th grade:\n\n${currentContent}`;
      } else if (type === 'quiz') {
        prompt = `Generate 3 flashcards (Question/Answer pairs) from this note content. Each question should be followed by its answer. Format each flashcard clearly as: Q: [Your question]\nA: [Your answer]\n\nNote Content:\n\n${currentContent}`;
      }

      aiResult = await askGemini(prompt);

      // Special handling for 'quiz' action: parse and save flashcards to Firestore.
      if (type === 'quiz') {
        const flashcardPairs = aiResult.split('\n\n').filter(pair => pair.startsWith('Q:'));
        for (const pair of flashcardPairs) {
          const [questionPart, answerPart] = pair.split('\nA:');
          const question = questionPart.replace('Q: ', '').trim();
          const answer = answerPart.trim();

          if (question && answer) {
            const now = serverTimestamp();
            await addDoc(collection(db, `users/${user.uid}/flashcards`), {
              question,
              answer,
              createdAt: now,
              lastReviewed: now,
              interval: 1,
              easeFactor: 2.5,
              nextReview: now,
            });
          }
        }
        alert("Generated flashcards have been added to your Flashcards page!");
      } else {
        // For summarize and explain, add AI response to local state for display.
        setAiResponses(prev => [...prev, { id: Date.now(), type, content: aiResult }]);
      }
    } catch (error) {
      console.error(`Error with AI ${type} action: `, error);
      alert(`Failed to ${type} note with AI.`);
    } finally {
      setAiLoading(false);
    }
  };

  // Display message if no note is selected.
  if (!note) {
    return (
      <div className="h-full flex items-center justify-center bg-charcoal-light">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="mb-6">
            <svg className="mx-auto h-16 w-16 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-neutral-100 mb-3">Ready to Write</h3>
          <p className="text-neutral-400 leading-relaxed">
            Select a note from the sidebar or create a new one to start writing your thoughts and ideas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-charcoal-light">
      {/* Editor Header */}
      <div className="flex-shrink-0 p-6 border-b border-gray-600">
        <input
          type="text"
          value={currentTitle}
          onChange={(e) => setCurrentTitle(e.target.value)}
          placeholder="Note title..."
          className="w-full bg-transparent text-2xl md:text-3xl font-bold text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-0 border-none p-0"
        />
      </div>

      {/* Editor Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 p-6">
          <textarea
            value={currentContent}
            onChange={(e) => setCurrentContent(e.target.value)}
            placeholder="Start writing your note..."
            className="w-full h-full bg-transparent text-neutral-200 placeholder-neutral-400 focus:outline-none resize-none text-base leading-relaxed"
          />
        </div>

        {/* AI Responses Area */}
        {(aiLoading || aiResponses.length > 0) && (
          <div className="flex-shrink-0 max-h-64 overflow-y-auto border-t border-gray-600 bg-charcoal-dark">
            {/* AI Loading Spinner */}
            {aiLoading && (
              <div className="flex justify-center items-center py-6">
                <div className="w-6 h-6 border-4 border-primary-sky-blue border-t-transparent rounded-full animate-spin"></div>
                <p className="ml-3 text-neutral-400 text-sm">AI is thinking...</p>
              </div>
            )}

            {/* AI Responses Display Area */}
            <div className="p-4 space-y-4">
              {aiResponses.map((response) => (
                <div key={response.id} className="bg-charcoal p-4 rounded-lg">
                  <h3 className="font-semibold text-neutral-100 mb-2 flex items-center">
                    <svg className="h-4 w-4 mr-2 text-primary-sky-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    {response.type === 'summary' ? 'AI Summary' : response.type === 'explanation' ? 'AI Explanation' : 'AI Quiz Generation'}
                  </h3>
                  <p className="text-neutral-300 whitespace-pre-wrap text-sm leading-relaxed">{response.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Editor Footer/Toolbar */}
      <div className="flex-shrink-0 p-4 border-t border-gray-600 bg-charcoal-dark">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <button
            onClick={() => note && onSaveNote(note.id, currentTitle, currentContent)}
            className="bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-6 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-200 ease-in-out transform hover:scale-105 flex items-center justify-center"
            disabled={!note}
          >
            <DocumentCheckIcon className="h-5 w-5 mr-2" />
            Save Note
          </button>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleAiAction('summary')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center justify-center transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 text-sm"
              disabled={aiLoading || currentContent.trim() === ''}
            >
              <SparklesIcon className="h-4 w-4 mr-1.5" />
              Summarize
            </button>
            <button
              onClick={() => handleAiAction('explanation')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center justify-center transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 text-sm"
              disabled={aiLoading || currentContent.trim() === ''}
            >
              <LightBulbIcon className="h-4 w-4 mr-1.5" />
              Explain
            </button>
            <button
              onClick={() => handleAiAction('quiz')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center justify-center transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 text-sm"
              disabled={aiLoading || currentContent.trim() === ''}
            >
              <QuestionMarkCircleIcon className="h-4 w-4 mr-1.5" />
              Quiz
            </button>
          </div>
        </div>
      </div>

      {/* Auto-Save Toast Notification */}
      {showToast && (
        <div className="fixed bottom-6 right-6 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg transition-all duration-300 transform translate-y-0 opacity-100">
          <div className="flex items-center">
            <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Note saved!
          </div>
        </div>
      )}
    </div>
  );
};

export default NoteEditor;

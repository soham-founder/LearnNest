import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../common/firebase';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { ChevronRightIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { askGemini } from '../services/geminiClient';

interface InterviewQuestion {
  id: string;
  question: string;
  studentAnswer: string;
  aiFeedback?: string;
  isCorrect?: boolean;
}

interface MockInterviewSession {
  id: string;
  subject: string;
  questions: InterviewQuestion[];
  startedAt: Timestamp;
  endedAt?: Timestamp;
  score?: number;
}

const subjects = ['Math', 'Physics', 'Chemistry', 'Biology', 'CS'];

function getFallbackQuestion(subject: string): string {
  switch (subject) {
    case 'Math':
      return 'Prove that the sum of the first n odd numbers equals n^2.';
    case 'Physics':
      return 'Explain how conservation of momentum applies in an inelastic collision.';
    case 'Chemistry':
      return 'What factors affect the rate of a chemical reaction, and why?';
    case 'Biology':
      return 'Describe how natural selection leads to evolution in a population.';
    case 'CS':
      return 'What is the time complexity of binary search and why? Provide a brief proof.';
    default:
      return 'Explain your approach to solving complex problems in this subject.';
  }
}

const AIMockInterviews: React.FC = () => {
  const { user } = useAuth();
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<MockInterviewSession | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<InterviewQuestion | null>(null);
  const [studentAnswer, setStudentAnswer] = useState('');
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [pastSessions, setPastSessions] = useState<MockInterviewSession[]>([]);

  const chatAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      const sessionsRef = collection(db, `users/${user.uid}/mockInterviews`);
      const q = query(sessionsRef, orderBy('startedAt', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedSessions: MockInterviewSession[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data() as Omit<MockInterviewSession, 'id'>,
          startedAt: doc.data().startedAt instanceof Timestamp ? doc.data().startedAt : Timestamp.fromDate(new Date()),
          endedAt: doc.data().endedAt instanceof Timestamp ? doc.data().endedAt : undefined,
        }));
        setPastSessions(fetchedSessions);
      });

      return () => unsubscribe();
    }
  }, [user]);

  // Scroll to bottom of chat area when new feedback arrives
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [aiFeedback]);

  const startNewSession = async (subject: string) => {
    if (!user) return;
    setLoadingAI(true);
    setSelectedSubject(subject);
    setAiFeedback(null);
    setStudentAnswer('');
    setCurrentQuestionIndex(0);

    try {
      const initialQuestionPrompt = `Generate a challenging interview question for a 12th-grade student in ${subject}. The question should be concise and require analytical thinking.`;
      let aiQuestion: string;
      try {
        aiQuestion = await askGemini(initialQuestionPrompt);
      } catch (err: any) {
        console.warn('Gemini unavailable, using fallback question:', err?.message || err);
        aiQuestion = getFallbackQuestion(subject);
      }

      const newQuestion: InterviewQuestion = {
        id: `q-${Date.now()}`,
        question: aiQuestion,
        studentAnswer: '',
      };

      const newSession: MockInterviewSession = {
        id: '',
        subject,
        questions: [newQuestion],
        startedAt: serverTimestamp() as Timestamp,
      };

      try {
        const docRef = await addDoc(collection(db, `users/${user.uid}/mockInterviews`), newSession);
        newSession.id = docRef.id;
        setCurrentSession(newSession);
        setCurrentQuestion(newQuestion);
      } catch (e: any) {
        console.error('Failed to persist session to Firestore, continuing locally:', e?.message || e);
        const localSession: MockInterviewSession = {
          ...newSession,
          id: `local-${Date.now()}`,
          startedAt: Timestamp.fromDate(new Date()),
        } as MockInterviewSession;
        setCurrentSession(localSession);
        setCurrentQuestion(newQuestion);
        alert('Started session locally (not saved to cloud). Please deploy Firestore rules for mockInterviews to persist sessions.');
      }
    } catch (error: any) {
      console.error("Error starting new session: ", error);
      // Final fallback: start a local-only session so the user can proceed
      const fallbackQ = getFallbackQuestion(subject);
      const newQuestion: InterviewQuestion = {
        id: `q-${Date.now()}`,
        question: fallbackQ,
        studentAnswer: '',
      };
      const localSession: MockInterviewSession = {
        id: `local-${Date.now()}`,
        subject,
        questions: [newQuestion],
        startedAt: Timestamp.fromDate(new Date()),
      } as MockInterviewSession;
      setCurrentSession(localSession);
      setCurrentQuestion(newQuestion);
      alert(`Started session locally due to an error. ${error?.message ? `Details: ${error.message}` : ''}`);
    } finally {
      setLoadingAI(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!user || !currentSession || !currentQuestion || studentAnswer.trim() === '' || loadingAI) return;
    setLoadingAI(true);

    const evaluationPrompt = `Given the question: "${currentQuestion.question}" and the student's answer: "${studentAnswer}". Provide concise feedback, identify if the answer is correct/incorrect, and offer a hint for improvement if needed. Also, suggest the next challenging interview question in ${currentSession.subject} relevant to the previous question or a new subtopic. Format your response clearly as: \n\nFeedback: [Your feedback]\nCorrect: [Yes/No]\nHint: [Optional hint]\nNext Question: [Next interview question]`;

    try {
      let aiResponse: string;
      try {
        aiResponse = await askGemini(evaluationPrompt);
      } catch (err: any) {
        console.warn('Gemini unavailable during evaluation, using structured fallback:', err?.message || err);
        aiResponse = `Feedback: Thanks for your answer. Compare your steps to an ideal solution and identify any gaps.\nCorrect: No\nHint: Revisit the key definitions and try a smaller example.\nNext Question: Based on this topic, explain the main idea and apply it to a simple case.`;
      }
      setAiFeedback(aiResponse);

      const isCorrectMatch = aiResponse.match(/Correct:\s*(Yes|No)/i);
      const isCorrect = isCorrectMatch ? isCorrectMatch[1].toLowerCase() === 'yes' : undefined;

      const updatedQuestion = { ...currentQuestion, studentAnswer, aiFeedback: aiResponse, isCorrect };
      const updatedQuestions = [...currentSession.questions.filter(q => q.id !== currentQuestion.id), updatedQuestion];

      const nextQuestionMatch = aiResponse.match(/Next Question:\s*(.*)/i);
      const nextQuestionText = nextQuestionMatch ? nextQuestionMatch[1].trim() : null;

      setCurrentSession(prevSession => {
        if (!prevSession) return null;
        return { ...prevSession, questions: updatedQuestions };
      });

      if (nextQuestionText) {
        // AI suggests next question, but we don't immediately set it as currentQuestion
        // The 'Next Question' button will handle loading it
      } else {
        // If AI doesn't suggest a next question, perhaps end session or prompt user
        alert("AI did not suggest a next question. This session might be complete.");
      }

      await updateDoc(doc(db, `users/${user.uid}/mockInterviews`, currentSession.id), {
        questions: updatedQuestions,
      });

    } catch (error) {
      console.error("Error evaluating answer or getting next question: ", error);
      alert("Failed to get AI feedback or next question.");
    } finally {
      setLoadingAI(false);
    }
  };

  const handleNextQuestion = async () => {
    if (!user || !currentSession || loadingAI) return;
    setLoadingAI(true);
    setStudentAnswer('');
    setAiFeedback(null);

    const lastQuestion = currentSession.questions[currentSession.questions.length - 1];
    const nextQuestionTextMatch = lastQuestion.aiFeedback?.match(/Next Question:\s*(.*)/i);
    const generatedNextQuestionText = nextQuestionTextMatch ? nextQuestionTextMatch[1].trim() : null;

    let nextQuestionPrompt = `Generate a challenging interview question for a 12th-grade student in ${currentSession.subject}.`;
    if (generatedNextQuestionText) {
      nextQuestionPrompt = generatedNextQuestionText; // Use AI suggested next question
    }

    try {
      let aiQuestion: string;
      try {
        aiQuestion = await askGemini(nextQuestionPrompt);
      } catch (err: any) {
        console.warn('Gemini unavailable for next question, using fallback:', err?.message || err);
        aiQuestion = getFallbackQuestion(currentSession.subject);
      }
      const newQuestion: InterviewQuestion = {
        id: `q-${Date.now()}`,
        question: aiQuestion,
        studentAnswer: '',
      };

      const updatedQuestions = [...currentSession.questions, newQuestion];
      setCurrentSession(prevSession => {
        if (!prevSession) return null;
        return { ...prevSession, questions: updatedQuestions };
      });
      setCurrentQuestion(newQuestion);
      setCurrentQuestionIndex(prev => prev + 1);

      await updateDoc(doc(db, `users/${user.uid}/mockInterviews`, currentSession.id), {
        questions: updatedQuestions,
      });

    } catch (error) {
      console.error("Error generating next question: ", error);
      alert("Failed to generate next question.");
    } finally {
      setLoadingAI(false);
    }
  };

  const endSession = async () => {
    if (!user || !currentSession) return;
    setLoadingAI(true);
    try {
        const feedbackPrompt = `Review the following mock interview session in ${currentSession.subject}. Provide an overall score (out of 100), identify 3-5 weak topics, and offer 3 practical tips for improvement. \n\nSession Questions and Answers:\n${currentSession.questions.map((q, idx) => `Q${idx + 1}: ${q.question}\nStudent Answer: ${q.studentAnswer}\nAI Feedback: ${q.aiFeedback || 'N/A'}`).join('\n\n')}`;
        const finalFeedback = await askGemini(feedbackPrompt);

        // Attempt to parse score (simple regex, can be improved)
        const scoreMatch = finalFeedback.match(/Score:\s*(\d+)/i);
        const finalScore = scoreMatch ? parseInt(scoreMatch[1], 10) : undefined;

        await updateDoc(doc(db, `users/${user.uid}/mockInterviews`, currentSession.id), {
            endedAt: serverTimestamp(),
            score: finalScore,
            // We could add final feedback to session object if needed
        });
        alert("Session ended. Check past sessions for detailed feedback!");
        setSelectedSubject(null);
        setCurrentSession(null);
        setCurrentQuestion(null);
    } catch (error) {
        console.error("Error ending session: ", error);
        alert("Failed to end session and get final feedback.");
    } finally {
        setLoadingAI(false);
    }
  };

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (loadingAI || !currentSession || currentSession.endedAt) return; // Prevent actions if AI is loading or session ended

    if (event.key === 'Enter' && document.activeElement === document.getElementById('student-answer-input')) {
      event.preventDefault();
      handleSubmitAnswer();
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
      event.preventDefault();
      if (aiFeedback) { // Only allow next question if feedback has been received
        handleNextQuestion();
      } else {
          alert("Please submit your answer and receive feedback before moving to the next question.");
      }
    }
  }, [loadingAI, currentSession, aiFeedback, handleSubmitAnswer, handleNextQuestion]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  if (!user) {
    return (
      <div className="p-6 flex items-center justify-center h-full bg-neutral-light dark:bg-neutral-dark font-sans">
        <p className="text-center text-red-500 dark:text-red-400 text-lg">Please log in to use the AI Mock Interviews.</p>
      </div>
    );
  }

  const totalQuestionsPlaceholder = 5; // Assuming a mock session has 5 questions
  const progressBarWidth = currentSession ? (currentQuestionIndex / (totalQuestionsPlaceholder -1)) * 100 : 0; // -1 to make progress reach 100% on last question

  return (
    <div className="p-6 min-h-full bg-neutral-light dark:bg-neutral-dark font-sans flex flex-col md:flex-row">
      {/* Sidebar for Subject Selection and Past Sessions */}
      <div className="w-full md:w-64 bg-neutral-100 dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-700 flex flex-col flex-shrink-0 mb-6 md:mb-0 md:mr-6 rounded-2xl shadow-soft">
        <h2 className="font-poppins text-xl font-semibold text-neutral-900 dark:text-neutral-100 p-4 border-b border-neutral-200 dark:border-neutral-700">Subjects</h2>
        <nav className="flex-grow p-2 space-y-1 border-b border-neutral-200 dark:border-neutral-700">
          {subjects.map(subject => (
            <button
              key={subject}
              onClick={() => startNewSession(subject)}
              className={`w-full text-left px-4 py-2 rounded-xl font-medium transition-all duration-150 ease-in-out transform hover:-translate-y-0.5 group
                ${selectedSubject === subject && !currentSession
                  ? 'bg-primary-sky-blue bg-opacity-10 dark:bg-primary-sky-blue dark:bg-opacity-20 text-primary-sky-blue font-semibold shadow-sm'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:shadow-soft'
                }
                ${currentSession && currentSession.subject === subject ? 'bg-primary-sky-blue text-white hover:bg-primary-sky-blue-dark shadow-md' : ''}
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
              disabled={loadingAI || !!currentSession}
            >
              {subject}
            </button>
          ))}
        </nav>

        <h2 className="font-poppins text-xl font-semibold text-neutral-900 dark:text-neutral-100 p-4 border-b border-neutral-200 dark:border-neutral-700 mt-4">Past Sessions</h2>
        <div className="flex-1 overflow-y-auto py-2">
          {pastSessions.length === 0 ? (
            <p className="text-center text-neutral-500 dark:text-neutral-400 mt-4 text-sm px-4 font-sans">No past sessions.</p>
          ) : (
            pastSessions.map(session => (
              <div
                key={session.id}
                onClick={() => setCurrentSession(session)} // Re-load session data
                className="flex flex-col p-4 mx-2 rounded-xl cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors duration-150 ease-in-out mb-2 shadow-soft"
              >
                <h3 className="font-poppins text-lg font-medium text-neutral-900 dark:text-neutral-100 truncate">{session.subject} - {session.startedAt.toDate().toLocaleDateString()}</h3>
                {session.score !== undefined && (
                  <p className="font-sans text-sm text-neutral-600 dark:text-neutral-400">Score: <span className="font-bold text-primary-sky-blue">{session.score.toFixed(0)}%</span></p>
                )}
                {session.endedAt && (
                  <p className="font-sans text-xs text-neutral-500 dark:text-neutral-400">Ended: {session.endedAt.toDate().toLocaleString()}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-white dark:bg-neutral-800 rounded-2xl shadow-lg p-6">
        <h1 className="font-poppins text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-6">AI Mock Interview</h1>

        {!currentSession ? (
          <div className="flex-1 flex items-center justify-center font-sans">
            <p className="text-neutral-500 dark:text-neutral-400 text-lg">Select a subject from the sidebar to start a new mock interview.</p>
          </div>
        ) : (
          <>
            <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-3 mb-4 shadow-inner-soft">
                <div className="bg-primary-sky-blue h-3 rounded-full transition-all duration-500 ease-out" style={{ width: `${progressBarWidth}%` }}></div>
            </div>
            <p className="font-sans text-neutral-600 dark:text-neutral-400 text-sm mb-4">Question {currentQuestionIndex + 1} / {totalQuestionsPlaceholder}</p>

            {currentQuestion && (
              <div className="bg-neutral-100 dark:bg-neutral-900 p-6 rounded-2xl shadow-soft mb-6 flex-1 flex flex-col">
                <p className="font-poppins text-xl font-medium text-neutral-900 dark:text-neutral-100 mb-4">{currentQuestion.question}</p>

                <textarea
                  id="student-answer-input"
                  placeholder="Type your answer here..."
                  value={studentAnswer}
                  onChange={(e) => setStudentAnswer(e.target.value)}
                  className="flex-1 w-full p-3 border-2 border-neutral-300 dark:border-neutral-600 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-sky-blue focus:border-primary-sky-blue bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 resize-none mb-4 font-sans"
                  disabled={loadingAI || currentQuestion.aiFeedback !== undefined}
                ></textarea>

                <button
                  onClick={handleSubmitAnswer}
                  className="bg-primary-sky-blue hover:bg-blue-700 text-white font-sans font-medium py-2.5 px-6 rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-sky-blue flex items-center justify-center transition duration-150 ease-in-out transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loadingAI || studentAnswer.trim() === '' || currentQuestion.aiFeedback !== undefined}
                >
                  {loadingAI ? (
                    <div className="w-5 h-5 border-4 border-accent-warm-orange border-t-transparent rounded-full animate-spin mr-3"></div>
                  ) : (
                    <SparklesIcon className="h-5 w-5 mr-2" />
                  )}
                  Submit Answer
                </button>

                {aiFeedback && (
                  <div ref={chatAreaRef} className="mt-6 p-4 rounded-xl bg-neutral-200 dark:bg-neutral-900 shadow-inner overflow-y-auto max-h-48">
                    <h3 className="font-poppins text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">AI Feedback:</h3>
                    <p className="font-sans text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{aiFeedback}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between mt-4">
              <button
                onClick={endSession}
                className="bg-red-500 hover:bg-red-600 text-white font-sans font-medium py-2.5 px-5 rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition duration-150 ease-in-out transform hover:-translate-y-0.5"
              >
                End Session
              </button>
              <button
                onClick={handleNextQuestion}
                className="bg-secondary-green hover:bg-green-600 text-white font-sans font-medium py-2.5 px-5 rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary-green flex items-center justify-center transition duration-150 ease-in-out transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loadingAI || currentQuestion?.aiFeedback === undefined}
              >
                Next Question <ChevronRightIcon className="h-5 w-5 ml-2" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AIMockInterviews;

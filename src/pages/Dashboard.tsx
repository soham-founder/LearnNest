import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../common/firebase';

const motivationalQuotes = [
  "Success is not final, failure is not fatal: It is the courage to continue that counts.",
  "The secret of getting ahead is getting started.",
  "Don’t watch the clock; do what it does. Keep going.",
  "Believe you can and you’re halfway there.",
  "Your only limit is your mind.",
  "Push yourself, because no one else is going to do it for you."
];

const recentActivity = [
  "Added a new note",
  "Completed a task",
  "Reviewed flashcards",
  "Created a quiz",
  "Updated profile"
];

const Dashboard: React.FC = () => {
  const [userName, setUserName] = useState<string | null>(null);
  const [quote, setQuote] = useState<string>("");
  const [progress, _setProgress] = useState<number>(72); // Example progress value
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUserName(user?.displayName || null);
    });
    setQuote(motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)]);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <div className="p-6 font-sans min-h-screen bg-neutral-100 dark:bg-neutral-900 transition-colors duration-300">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-poppins text-3xl font-bold text-neutral-900 dark:text-neutral-100">{userName ? `Welcome back, ${userName}!` : "Welcome back, Learner!"}</h1>
          <p className="mt-2 text-lg text-neutral-700 dark:text-neutral-300">{quote}</p>
        </div>
        <button
          onClick={() => setDarkMode((prev) => !prev)}
          className="bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-full px-4 py-2 shadow-md hover:bg-neutral-300 dark:hover:bg-neutral-700 transition"
          aria-label="Toggle dark mode"
        >
          {darkMode ? '🌙' : '☀️'}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {/* Your Progress Card */}
        <div className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-md flex flex-col items-center justify-center">
          <h2 className="font-poppins text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Your Progress</h2>
          <div className="relative w-24 h-24 mb-2">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="10" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#6366f1"
                strokeWidth="10"
                strokeDasharray={2 * Math.PI * 45}
                strokeDashoffset={2 * Math.PI * 45 * (1 - progress / 100)}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.5s' }}
              />
              <text x="50" y="55" textAnchor="middle" fontSize="1.5em" fill="#6366f1">{progress}%</text>
            </svg>
          </div>
          <p className="text-neutral-700 dark:text-neutral-300">Keep up the great work!</p>
        </div>
        {/* Quick Actions Card */}
        <div className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-md flex flex-col justify-center">
          <h2 className="font-poppins text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 gap-3">
            <button
              className="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-4 rounded-xl shadow transition"
              onClick={() => navigate('/notes')}
            >Add Note</button>
            <button
              className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-xl shadow transition"
              onClick={() => navigate('/planner')}
            >Add Task</button>
            <button
              className="bg-pink-500 hover:bg-pink-600 text-white font-semibold py-2 px-4 rounded-xl shadow transition"
              onClick={() => navigate('/flashcards')}
            >Create Flashcard</button>
          </div>
        </div>
        {/* Recent Activity Card */}
        <div className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-md flex flex-col justify-center">
          <h2 className="font-poppins text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Recent Activity</h2>
          <ul className="list-disc pl-5 text-neutral-700 dark:text-neutral-300">
            {recentActivity.slice(0, 5).map((item, idx) => (
              <li key={idx} className="mb-2">{item}</li>
            ))}
          </ul>
        </div>
      </div>
      {/* Existing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Quick Notes Card */}
        <Link to="/notes"
          className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-md transition-all duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-lg cursor-pointer block"
        >
          <h2 className="font-poppins text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Quick Notes</h2>
          <p className="text-neutral-700 dark:text-neutral-300">Jot down your thoughts quickly and efficiently.</p>
        </Link>
        {/* Upcoming Tasks Card */}
        <Link to="/planner"
          className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-md transition-all duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-lg cursor-pointer block"
        >
          <h2 className="font-poppins text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Upcoming Tasks</h2>
          <p className="text-neutral-700 dark:text-neutral-300">Stay organized with your pending tasks and deadlines.</p>
        </Link>
        {/* Flashcard Progress Card */}
        <Link to="/flashcards"
          className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-md transition-all duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-lg cursor-pointer block"
        >
          <h2 className="font-poppins text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Flashcard Progress</h2>
          <p className="text-neutral-700 dark:text-neutral-300">Track your spaced repetition progress and master concepts.</p>
        </Link>
        {/* Quiz Performance Card */}
        <Link to="/quizzes"
          className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-md transition-all duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-lg cursor-pointer block"
        >
          <h2 className="font-poppins text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Quiz Performance</h2>
          <p className="text-neutral-700 dark:text-neutral-300">Review your scores and identify areas for improvement.</p>
        </Link>
        {/* AI Tutor Activity Card */}
        <Link to="/ai"
          className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-md transition-all duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-lg cursor-pointer block"
        >
          <h2 className="font-poppins text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">AI Tutor Activity</h2>
          <p className="text-neutral-700 dark:text-neutral-300">Catch up on your recent conversations with the AI.</p>
        </Link>
        {/* Knowledge Tree Card */}
        <Link to="/knowledgetree"
          className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-md transition-all duration-300 ease-in-out transform hover:-translate-y-1 hover:shadow-lg cursor-pointer block"
        >
          <h2 className="font-poppins text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Knowledge Tree</h2>
          <p className="text-neutral-700 dark:text-neutral-300">Explore your interconnected learning topics.</p>
        </Link>
      </div>
    </div>
  );
};

export default Dashboard;

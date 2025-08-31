import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../common/firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';

interface Message {
  role: 'user' | 'ai';
  content: string;
  createdAt: any; // Firestore Timestamp
}

// Move these constants outside to be accessible by askGemini if it's imported elsewhere
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ""; // Get from environment variables
const GEMINI_API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent";

export const askGemini = async (question: string): Promise<string> => {
  try {
    // Check if API key is configured
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "your_gemini_api_key_here") {
      throw new Error("Gemini API key is not configured. Please add VITE_GEMINI_API_KEY to your .env.local file.");
    }

    const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: question
            }]
          }]
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API error:", errorData);
      throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error("Invalid response format from Gemini API");
    }
    
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("Error calling Gemini API: ", error);
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes("API key")) {
        throw new Error("Gemini API key is not configured properly. Please check your .env.local file.");
      } else if (error.message.includes("quota")) {
        throw new Error("Gemini API quota exceeded. Please try again later.");
      } else if (error.message.includes("network") || error.message.includes("fetch")) {
        throw new Error("Network error. Please check your internet connection and try again.");
      } else {
        throw new Error(`AI service error: ${error.message}`);
      }
    }
    
    throw new Error("Failed to get response from AI. Please try again.");
  }
};

const AITutor: React.FC = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      const chatsRef = collection(db, `users/${user.uid}/chats`);
      const q = query(chatsRef, orderBy('createdAt', 'asc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedMessages: Message[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data() as Omit<Message, 'id'>
        }));
        setMessages(fetchedMessages);
      });

      return () => unsubscribe();
    }
  }, [user]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() === '' || !user || loading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      createdAt: serverTimestamp(),
    };

    // Add user message to Firestore
    try {
      await addDoc(collection(db, `users/${user.uid}/chats`), userMessage);
    } catch (error) {
      console.error("Error saving user message: ", error);
      alert("Failed to save your message.");
    }

    setInput('');
    setLoading(true);

    // Get AI response and add to Firestore
    try {
      const aiResponse = await askGemini(input);
      const aiMessage: Message = {
        role: 'ai',
        content: aiResponse,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, `users/${user.uid}/chats`), aiMessage);
    } catch (error) {
      console.error("Error getting AI response or saving it: ", error);
      alert("Failed to get AI response.");
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="p-6 flex items-center justify-center h-full bg-neutral-light dark:bg-neutral-dark font-sans">
        <p className="text-center text-red-500 dark:text-red-400 text-lg">Please log in to use the AI Tutor.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-neutral-light dark:bg-neutral-dark p-6 font-sans">
      <h1 className="font-poppins text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-6">AI Tutor</h1>

      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 rounded-2xl bg-white dark:bg-neutral-800 shadow-soft mb-4">
        {messages.length === 0 && !loading && (
          <p className="text-center text-neutral-500 dark:text-neutral-400 font-sans">Ask me anything! I'm here to help you learn.</p>
        )}
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs px-4 py-2 rounded-xl shadow-sm font-sans
                ${msg.role === 'user'
                  ? 'bg-primary-sky-blue text-white rounded-br-none'
                  : 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100 rounded-bl-none'
                }
              `}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="max-w-xs px-4 py-2 rounded-xl shadow-sm bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 rounded-bl-none">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-neutral-500 rounded-full animate-bounce"></div>
                <div className="w-3 h-3 bg-neutral-500 rounded-full animate-bounce delay-150"></div>
                <div className="w-3 h-3 bg-neutral-500 rounded-full animate-bounce delay-300"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSendMessage} className="flex space-x-3 mt-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your AI Tutor..."
          className="flex-1 px-4 py-2.5 border-2 border-neutral-300 dark:border-neutral-600 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-sky-blue focus:border-primary-sky-blue bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 transition duration-150 ease-in-out"
          disabled={loading}
        />
        <button
          type="submit"
          className="bg-primary-sky-blue hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-sky-blue flex items-center justify-center transition duration-150 ease-in-out transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          <PaperAirplaneIcon className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
};

export default AITutor;

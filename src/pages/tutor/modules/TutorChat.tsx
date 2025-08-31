import React, { useEffect, useRef, useState } from 'react';
import { MicrophoneIcon, PaperAirplaneIcon, SpeakerWaveIcon } from '@heroicons/react/24/outline';
import SessionList from './SessionList';
import { createSession, sendTutorMessage } from '../../../services/tutorApi';

type ChatRole = 'user' | 'tutor' | 'system';
interface ChatMessage { id: string; role: ChatRole; text: string; ts: number; }

const TutorChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [ttsOn, setTtsOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = await createSession();
      setActiveSessionId(sessionId);
    }
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    try {
      const data = await sendTutorMessage(sessionId!, text);
      const tutorMsg: ChatMessage = { id: crypto.randomUUID(), role: 'tutor', text: data.reply, ts: Date.now() };
      setMessages((m) => [...m, tutorMsg]);
      if (ttsOn) {
        try { const utter = new SpeechSynthesisUtterance(data.reply); window.speechSynthesis.speak(utter); } catch {}
      }
    } catch (e) {
      const errMsg: ChatMessage = { id: crypto.randomUUID(), role: 'system', text: 'Tutor service unavailable.', ts: Date.now() };
      setMessages((m) => [...m, errMsg]);
    }
  };

  const toggleRecord = async () => {
    // TODO: hook into Web Speech API or server STT
    setRecording((r) => !r);
  };

  return (
    <div className="flex flex-col h-full rounded-2xl bg-white dark:bg-neutral-800 shadow-soft">
      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
        <h2 className="font-poppins text-xl font-semibold text-neutral-900 dark:text-neutral-100">AI Tutor</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTtsOn((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${ttsOn ? 'bg-primary-sky-blue text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 border-neutral-300 dark:border-neutral-600'}`}
            aria-pressed={ttsOn}
          >
            <SpeakerWaveIcon className="h-5 w-5 inline-block mr-1" /> Voice Out
          </button>
          <button
            onClick={toggleRecord}
            className={`px-3 py-1.5 rounded-lg text-sm border ${recording ? 'bg-red-600 text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 border-neutral-300 dark:border-neutral-600'}`}
            aria-pressed={recording}
          >
            <MicrophoneIcon className="h-5 w-5 inline-block mr-1" /> {recording ? 'Stop' : 'Voice In'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 h-full">
          <div className="border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-700 p-3 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Sessions</h3>
              <button
                className="text-sm px-2 py-1 rounded bg-primary-sky-blue text-white"
                onClick={async () => setActiveSessionId(await createSession())}
              >New</button>
            </div>
            <SessionList onSelect={setActiveSessionId} selectedId={activeSessionId || undefined} />
          </div>
          <div ref={listRef} className="md:col-span-2 p-4 space-y-3 overflow-y-auto">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] px-4 py-2 rounded-xl text-sm shadow-sm ${m.role === 'user'
                    ? 'bg-primary-sky-blue text-white rounded-br-none'
                    : m.role === 'tutor'
                      ? 'bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 rounded-bl-none'
                      : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100'}`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="text-center text-neutral-500 dark:text-neutral-400 text-sm">Ask a question to get started.</div>
            )}
          </div>
        </div>
      </div>
      <div className="p-3 border-t border-neutral-200 dark:border-neutral-700">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
          <label htmlFor="tutor-input" className="sr-only">Your message</label>
          <input
            id="tutor-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border-2 border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-sky-blue"
            placeholder="Type your question..."
          />
          <button type="submit" className="px-4 rounded-lg bg-primary-sky-blue text-white hover:bg-blue-700">
            <PaperAirplaneIcon className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default TutorChat;

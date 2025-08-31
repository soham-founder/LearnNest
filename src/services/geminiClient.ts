// Lightweight Gemini client for browser-side usage (fallbacks, quick calls)
// NOTE: Prefer server-side functions for tutoring; this is used by the quiz fallback and can be reused by the Tutor UI for TTS/voice adjuncts.

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

export async function askGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured. Set VITE_GEMINI_API_KEY in .env.local');
  }
  const res = await fetch(`${GEMINI_API_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Gemini API error: ${res.status} ${data?.error?.message || ''}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Invalid response format from Gemini API');
  return text as string;
}

export default askGemini;

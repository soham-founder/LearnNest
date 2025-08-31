import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import Markdown from '../Markdown';
import { Timestamp } from 'firebase/firestore';
import type { CardType, DeckId, Flashcard } from '../../types/flashcards';
import { FlashcardService } from '../../services/FlashcardService';
import { FlashcardAIService } from '../../services/FlashcardAIService';
import { useAuth } from '../../context/AuthContext';

// Local types used by the editor form
 type BasicForm = { question: string; answer: string; tags: string[]; difficulty: number; images?: string; uploads?: Array<{ url: string; alt: string }>; uploading?: boolean; progress?: number };
 type MCQForm = { prompt: string; options: string[]; correctIndex: number; explanation?: string; tags: string[]; difficulty: number };
 type TFForm = { statement: string; answer: 'true' | 'false'; explanation?: string; tags: string[]; difficulty: number };
 type ClozeForm = { text: string; tags: string[]; difficulty: number };
 type FormState = { basic: BasicForm; mcq: MCQForm; tf: TFForm; cloze: ClozeForm };
 interface PreviewQA { id: string; front: string; back: string; hint?: string; aiMetadata?: any }
 export interface FlashcardEditorProps { deckId: DeckId; defaultType?: CardType; onSaved?: (count: number) => void; onSave?: (card: Omit<Flashcard, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void> | void; onClose?: () => void; }

const initialForm: FormState = { basic: { question: '', answer: '', tags: [], difficulty: 5, images: '' }, mcq: { prompt: '', options: ['', ''], correctIndex: 0, explanation: '', tags: [], difficulty: 5 }, tf: { statement: '', answer: 'true', explanation: '', tags: [], difficulty: 5 }, cloze: { text: '', tags: [], difficulty: 5 } };

const normalizeTag = (t: string) => t.trim().toLowerCase();
const fuzzyIncludes = (query: string, candidate: string) => { if (!query) return true; const q = query.toLowerCase(); const c = candidate.toLowerCase(); let qi = 0; for (let i = 0; i < c.length && qi < q.length; i++) { if (c[i] === q[qi]) qi++; } return qi === q.length || c.includes(q); };

function TagInput({ tags, onChange, suggestions, ariaLabel = 'Tags' }: { tags: string[]; onChange: (tags: string[]) => void; suggestions: Array<{ tag: string; count: number }>; ariaLabel?: string; }) {
  const [value, setValue] = useState('');
  const normSet = useMemo(() => new Set(tags.map(normalizeTag)), [tags]);
  const filtered = useMemo(() => suggestions.filter(s => !normSet.has(normalizeTag(s.tag))).filter(s => fuzzyIncludes(value.trim().toLowerCase(), s.tag)).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, 8), [suggestions, value, normSet]);
  const add = (raw: string) => { const n = normalizeTag(raw); if (!n) return; if (normSet.has(n)) { setValue(''); return; } onChange([...tags, n]); setValue(''); };
  const remove = (raw: string) => onChange(tags.filter(t => normalizeTag(t) !== normalizeTag(raw)));
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(value); } else if (e.key === 'Backspace' && !value && tags.length) { onChange(tags.slice(0, -1)); } };
  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2 rounded bg-neutral-800 border border-neutral-700 px-2 py-2">
        {tags.map(t => (
          <span key={t} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-neutral-700/60 border border-neutral-600">
            {t}
            <button type="button" aria-label={`Remove tag ${t}`} className="hover:text-red-300" onClick={() => remove(t)}>×</button>
          </span>
        ))}
        <input aria-label={ariaLabel} className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-neutral-400" placeholder="Add tag and press Enter" value={value} onChange={e => setValue(e.target.value)} onKeyDown={onKeyDown} onBlur={() => value && add(value)} />
      </div>
      {filtered.length > 0 && (
        <div className="mt-1 max-h-40 overflow-auto rounded border border-neutral-700 bg-neutral-900 text-sm">
          {filtered.map(s => (
            <button key={s.tag} type="button" className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 flex items-center justify-between" onClick={() => add(s.tag)}>
              <span>#{s.tag}</span>
              <span className="text-xs opacity-70">{s.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useHistoryState<T>(initial: T, max = 20) {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initial);
  const [future, setFuture] = useState<T[]>([]);
  const set = (updater: T | ((prev: T) => T)) => { setPresent(prev => { const next = typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater; setPast(p => { const updated = [...p, prev]; return updated.length > max ? updated.slice(updated.length - max) : updated; }); setFuture([]); return next; }); };
  const setSilent = (updater: T | ((prev: T) => T)) => { setPresent(prev => (typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater)); };
  const undo = () => { setPast(p => { if (!p.length) return p; const previous = p[p.length - 1]; setFuture(f => [present, ...f]); setPresent(previous); return p.slice(0, -1); }); };
  const redo = () => { setFuture(f => { if (!f.length) return f; const [next, ...rest] = f; setPast(p => [...p, present]); setPresent(next); return rest; }); };
  const reset = (value: T) => { setPast([]); setPresent(value); setFuture([]); };
  return { state: present, set, setSilent, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0, reset };
}

function CardPreview({ cardType, form }: { cardType: CardType; form: FormState; }) {
  const basicImages = useMemo(() => { const urls: string[] = []; if (form.basic.images) urls.push(...form.basic.images.split(',').map(s => s.trim()).filter(Boolean)); if (form.basic.uploads?.length) urls.push(...form.basic.uploads.map(u => u.url)); return urls; }, [form.basic.images, form.basic.uploads]);
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 h-full">
      <div className="text-xs opacity-70 mb-2">Live preview</div>
      {cardType === 'basic' && (
        <div>
          <div className="mb-3">
            <div className="text-[11px] opacity-70 mb-1">Question</div>
            <div className="rounded border border-neutral-800 bg-neutral-900 p-2">
              <Markdown className="markdown">{form.basic.question || '—'}</Markdown>
            </div>
          </div>
          <div className="mb-3">
            <div className="text-[11px] opacity-70 mb-1">Answer</div>
            <div className="rounded border border-neutral-800 bg-neutral-900 p-2">
              <Markdown className="markdown">{form.basic.answer || '—'}</Markdown>
            </div>
          </div>
          {!!basicImages.length && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {basicImages.map((src, i) => (
                <img key={i} src={src} alt="" className="w-full h-20 object-cover rounded border border-neutral-800" />
              ))}
            </div>
          )}
        </div>
      )}
      {cardType === 'mcq' && (
        <div>
          <div className="mb-3">
            <div className="text-[11px] opacity-70 mb-1">Prompt</div>
            <div className="rounded border border-neutral-800 bg-neutral-900 p-2">
              <Markdown className="markdown">{form.mcq.prompt || '—'}</Markdown>
            </div>
          </div>
          <ul className="space-y-1">
            {form.mcq.options.map((opt, idx) => (
              <li key={idx} className={`flex items-start gap-2 rounded px-2 py-1 border ${idx === form.mcq.correctIndex ? 'border-emerald-700 bg-emerald-900/20' : 'border-neutral-800 bg-neutral-900'}`}>
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs bg-neutral-700/60">{String.fromCharCode(65 + idx)}</span>
                <div className="flex-1">
                  <Markdown className="markdown">{opt || '—'}</Markdown>
                </div>
                {idx === form.mcq.correctIndex && <span className="text-emerald-400 text-xs">✓</span>}
              </li>
            ))}
          </ul>
          {form.mcq.explanation ? (
            <div className="mt-3">
              <div className="text-[11px] opacity-70 mb-1">Explanation</div>
              <div className="rounded border border-neutral-800 bg-neutral-900 p-2">
                <Markdown className="markdown">{form.mcq.explanation}</Markdown>
              </div>
            </div>
          ) : null}
        </div>
      )}
      {cardType === 'tf' && (
        <div>
          <div className="mb-3">
            <div className="text-[11px] opacity-70 mb-1">Statement</div>
            <div className="rounded border border-neutral-800 bg-neutral-900 p-2">
              <Markdown className="markdown">{form.tf.statement || '—'}</Markdown>
            </div>
          </div>
          <div className="mb-3">
            <span className="text-sm">Answer: </span>
            <span className="text-sm font-medium">{form.tf.answer === 'true' ? 'True' : 'False'}</span>
          </div>
          {form.tf.explanation ? (
            <div className="mt-2">
              <div className="text-[11px] opacity-70 mb-1">Explanation</div>
              <div className="rounded border border-neutral-800 bg-neutral-900 p-2">
                <Markdown className="markdown">{form.tf.explanation}</Markdown>
              </div>
            </div>
          ) : null}
        </div>
      )}
      {cardType === 'cloze' && (
        <div>
          <div className="mb-3">
            <div className="text-[11px] opacity-70 mb-1">Text</div>
            <div className="rounded border border-neutral-800 bg-neutral-900 p-2">
              <Markdown className="markdown">{form.cloze.text || '—'}</Markdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FlashcardEditor({ deckId, defaultType = 'basic', onSaved, onSave, onClose }: FlashcardEditorProps) {
  const { user } = useAuth();
  const [cardType, setCardType] = useState<CardType>(defaultType);
  const { state: form, set: setForm, setSilent: setFormSilent, undo, redo, canUndo, canRedo, reset: resetHistory } = useHistoryState<FormState>(initialForm, 20);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<PreviewQA[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tagIndex, setTagIndex] = useState<Record<string, number>>({});

  useEditorShortcuts(undo, redo);
  useEffect(() => { setError(null); }, [cardType]);
  useEffect(() => { let active = true; (async () => { try { if (!user) return; const idx = await FlashcardService.getDeckTagIndex(user.uid, deckId); if (active) setTagIndex(idx); } catch {} })(); return () => { active = false; }; }, [user, deckId]);

  const addOption = () => setForm(f => ({ ...f, mcq: { ...f.mcq, options: [...f.mcq.options, ''] } }));
  const updateOption = (i: number, v: string) => setForm(f => ({ ...f, mcq: { ...f.mcq, options: f.mcq.options.map((o, idx)=> idx===i? v : o) } }));
  const removeOption = (i: number) => setForm(f => ({ ...f, mcq: { ...f.mcq, options: f.mcq.options.filter((_, idx)=> idx!==i) } }));

  const canSave = () => { if (cardType === 'basic') return form.basic.question.trim() && form.basic.answer.trim(); if (cardType === 'mcq') return form.mcq.prompt.trim() && form.mcq.options.filter(o=>o.trim()).length >= 2; if (cardType === 'tf') return form.tf.statement.trim(); if (cardType === 'cloze') return form.cloze.text.trim(); return false; };

  async function handleFilesSelected(files: FileList | null) { if (!files || !user) return; const arr = Array.from(files).filter(f => f.type.startsWith('image/')); if (!arr.length) return; setFormSilent(f => ({ ...f, basic: { ...f.basic, uploading: true, progress: 0 } })); try { const uploaded: Array<{ url: string; alt: string }> = []; let completed = 0; for (const file of arr) { const downloadUrl = await FlashcardService.uploadImage(file, user.uid); uploaded.push({ url: downloadUrl, alt: '' }); completed++; setFormSilent(f => ({ ...f, basic: { ...f.basic, uploading: completed < arr.length, progress: completed < arr.length ? Math.round((completed/arr.length)*100) : 100 } })); } setForm(f => ({ ...f, basic: { ...f.basic, uploads: [...(f.basic.uploads || []), ...uploaded] } })); } catch (e:any) { setError(e?.message || 'Upload failed'); } finally { setFormSilent(f => ({ ...f, basic: { ...f.basic, uploading: false } })); } }

  async function handleManualSave() {
    if (!user) { setError('You must be signed in.'); return; }
    if (!canSave()) { setError('Please complete required fields.'); return; }
    setSaving(true);
    try {
      const baseSrs = { repetitions: 0, easeFactor: 2.5, interval: 0, dueDate: Timestamp.now() };
      if (cardType === 'basic') {
        const { question, answer, images, tags, difficulty } = form.basic;
        const uploads = form.basic.uploads || [];
        const payload = { deckId, type: 'basic' as const, question: question.trim(), answer: answer.trim(), images: [...(images ? images.split(',').map(s=>s.trim()).filter(Boolean) : []), ...uploads.map(u=>u.url)], difficulty, tags, srs: baseSrs as any } as unknown as Omit<Flashcard, 'id' | 'createdAt' | 'updatedAt'>;
        if (onSave) await onSave(payload); else await FlashcardService.addCard(user!.uid, deckId, payload as any);
      } else if (cardType === 'mcq') {
        const { prompt, options, correctIndex, explanation, tags, difficulty } = form.mcq;
        if (!prompt.trim() || options.filter(o=>o.trim()).length < 2) { setError('Add at least two options.'); setSaving(false); return; }
        const payload = { deckId, type: 'mcq' as const, prompt: prompt.trim(), options: options.map(o=>o.trim()), correctIndex: Math.max(0, Math.min(correctIndex, options.length-1)), explanation: explanation?.trim() || undefined, difficulty, tags, srs: baseSrs as any } as unknown as Omit<Flashcard, 'id' | 'createdAt' | 'updatedAt'>;
        if (onSave) await onSave(payload); else await FlashcardService.addCard(user!.uid, deckId, payload as any);
      } else if (cardType === 'tf') {
        const { statement, answer, explanation, tags, difficulty } = form.tf;
        const payload = { deckId, type: 'tf' as const, statement: statement.trim(), answer: answer === 'true', explanation: explanation?.trim() || undefined, difficulty, tags, srs: baseSrs as any } as unknown as Omit<Flashcard, 'id' | 'createdAt' | 'updatedAt'>;
        if (onSave) await onSave(payload); else await FlashcardService.addCard(user!.uid, deckId, payload as any);
      } else if (cardType === 'cloze') {
        const { text, tags, difficulty } = form.cloze;
        const payload = { deckId, type: 'cloze' as const, text: text.trim(), difficulty, tags, srs: baseSrs as any } as unknown as Omit<Flashcard, 'id' | 'createdAt' | 'updatedAt'>;
        if (onSave) await onSave(payload); else await FlashcardService.addCard(user!.uid, deckId, payload as any);
      }
      resetHistory(initialForm);
      onSaved?.(1);
      onClose?.();
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to save card');
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() { setError(null); setAiLoading(true); try { const pairs = await FlashcardAIService.generateFromText(aiText); const withIds: PreviewQA[] = pairs.map((c: any, i: number) => ({ id: `${Date.now()}-${i}`, front: c.front, back: c.back })); setPreview(withIds); } catch (e: any) { setError(e?.message || 'Failed to generate cards'); } finally { setAiLoading(false); } }

  async function handleRegenerate(cardId: string, question: string, answer: string) { setError(null); setAiLoading(true); try { const pairs = await FlashcardAIService.generateFromText(`Question: ${question}\nAnswer: ${answer}`, { numberOfCards: 1 } as any); const regenerated = (pairs as any[])[0]; if (regenerated) setPreview(prev => prev.map(card => card.id === cardId ? { ...card, front: regenerated.front, back: regenerated.back } : card)); } catch (e: any) { setError(e?.message || 'Failed to regenerate card'); } finally { setAiLoading(false); } }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
      <h3 className="font-semibold mb-3">Flashcard Editor</h3>
      {error && (<div role="alert" className="mb-3 text-sm text-red-300 bg-red-900/30 border border-red-800 rounded p-2">{error}</div>)}

      <div className="flex flex-col sm:flex-row gap-3 mb-3 items-center">
        <label className="sm:w-56">
          <span className="sr-only">Card type</span>
          <select aria-label="Card type" className="w-full px-3 py-2 rounded border border-neutral-700 bg-neutral-900" value={cardType} onChange={e=>setCardType(e.target.value as CardType)}>
            <option value="basic">Q/A</option>
            <option value="mcq">Multiple Choice</option>
            <option value="tf">True / False</option>
            <option value="cloze">Cloze</option>
          </select>
        </label>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button type="button" className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-sm disabled:opacity-50" onClick={undo} disabled={!canUndo} aria-label="Undo (Cmd+Z)" title="Undo (Cmd+Z)">Undo</button>
          <button type="button" className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-sm disabled:opacity-50" onClick={redo} disabled={!canRedo} aria-label="Redo (Cmd+Shift+Z)" title="Redo (Cmd+Shift+Z)">Redo</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          {cardType === 'basic' && (
            <div className="mb-4">
              <input aria-label="Question" className="w-full mb-2 px-3 py-2 rounded bg-neutral-800 border border-neutral-700" placeholder="Question" value={form.basic.question} onChange={e=>setForm(f=>({...f, basic:{...f.basic, question:e.target.value}}))} />
              <textarea aria-label="Answer" className="w-full mb-2 px-3 py-2 rounded bg-neutral-800 border border-neutral-700" rows={3} placeholder="Answer" value={form.basic.answer} onChange={e=>setForm(f=>({...f, basic:{...f.basic, answer:e.target.value}}))} />
              <input aria-label="Image URLs" className="w-full mb-2 px-3 py-2 rounded bg-neutral-800 border border-neutral-700" placeholder="Image URLs (comma separated)" value={form.basic.images || ''} onChange={e=>setForm(f=>({...f, basic:{...f.basic, images:e.target.value}}))} />
              <div onDragOver={(e)=>{e.preventDefault();}} onDrop={(e)=>{e.preventDefault(); handleFilesSelected(e.dataTransfer.files);}} className="mb-2 rounded border-2 border-dashed border-neutral-700 p-4 text-center cursor-pointer hover:border-neutral-500" onClick={()=>{ const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.onchange = () => handleFilesSelected(input.files); input.click(); }}>
                <div className="text-sm opacity-80">Drag & drop images here or click to browse</div>
                {form.basic.uploading && (<div className="mt-2 text-xs">Uploading… {form.basic.progress ?? 0}%</div>)}
              </div>
              <div className="mt-2">
                <label className="block text-sm mb-1">Difficulty: <span className="font-medium">{form.basic.difficulty}</span> <span className="opacity-70 text-xs">(1 easy – 10 hard)</span></label>
                <input type="range" min={1} max={10} step={1} value={form.basic.difficulty} onChange={e=>setForm(f=>({...f, basic:{...f.basic, difficulty: Number(e.target.value)}}))} className="w-full" />
              </div>
              {form.basic.uploads?.length ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-2">
                  {form.basic.uploads.map((u, idx) => (
                    <div key={idx} className="rounded border border-neutral-700 p-2">
                      <img src={u.url} alt={u.alt || ''} className="w-full h-24 object-cover rounded" />
                      <input aria-label={`Alt text ${idx+1}`} className="mt-2 w-full px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs" placeholder="Alt text for accessibility" value={u.alt} onChange={e=>setForm(f=>({ ...f, basic: { ...f.basic, uploads: (f.basic.uploads||[]).map((x,i)=> i===idx ? { ...x, alt: e.target.value } : x) } }))} />
                      <button className="mt-2 w-full text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700" onClick={()=>setForm(f=>({ ...f, basic: { ...f.basic, uploads: (f.basic.uploads||[]).filter((_,i)=>i!==idx) } }))}>Remove</button>
                    </div>
                  ))}
                </div>
              ) : null}
              <TagInput ariaLabel="Tags" tags={form.basic.tags} onChange={(tags)=>setForm(f=>({...f, basic:{...f.basic, tags}}))} suggestions={Object.entries(tagIndex).map(([tag, count])=>({ tag, count }))} />
            </div>
          )}

          {cardType === 'mcq' && (
            <div className="mb-4">
              <input aria-label="Prompt" className="w-full mb-2 px-3 py-2 rounded bg-neutral-800 border border-neutral-700" placeholder="Prompt" value={form.mcq.prompt} onChange={e=>setForm(f=>({...f, mcq:{...f.mcq, prompt:e.target.value}}))} />
              <div className="space-y-2">
                {form.mcq.options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input type="radio" aria-label="Correct option" name="correct" checked={form.mcq.correctIndex===idx} onChange={()=>setForm(f=>({...f, mcq:{...f.mcq, correctIndex: idx}}))} />
                    <input className="flex-1 px-3 py-2 rounded bg-neutral-800 border border-neutral-700" placeholder={`Option ${idx+1}`} value={opt} onChange={e=>updateOption(idx, e.target.value)} />
                    <button className="px-2 py-2 rounded bg-neutral-800 border border-neutral-700" onClick={()=>removeOption(idx)} aria-label="Remove option">✕</button>
                  </div>
                ))}
                <button className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700" onClick={addOption}>Add option</button>
              </div>
              <input aria-label="Explanation" className="w-full my-2 px-3 py-2 rounded bg-neutral-800 border border-neutral-700" placeholder="Explanation (optional)" value={form.mcq.explanation || ''} onChange={e=>setForm(f=>({...f, mcq:{...f.mcq, explanation:e.target.value}}))} />
              <TagInput ariaLabel="Tags" tags={form.mcq.tags} onChange={(tags)=>setForm(f=>({...f, mcq:{...f.mcq, tags}}))} suggestions={Object.entries(tagIndex).map(([tag, count])=>({ tag, count }))} />
              <div className="mt-3">
                <label className="block text-sm mb-1">Difficulty: <span className="font-medium">{form.mcq.difficulty}</span></label>
                <input type="range" min={1} max={10} step={1} value={form.mcq.difficulty} onChange={e=>setForm(f=>({...f, mcq:{...f.mcq, difficulty: Number(e.target.value)}}))} className="w-full" />
              </div>
            </div>
          )}

          {cardType === 'tf' && (
            <div className="mb-4">
              <input aria-label="Statement" className="w-full mb-2 px-3 py-2 rounded bg-neutral-800 border border-neutral-700" placeholder="Statement" value={form.tf.statement} onChange={e=>setForm(f=>({...f, tf:{...f.tf, statement:e.target.value}}))} />
              <div className="flex items-center gap-4 mb-2">
                <label className="flex items-center gap-2"><input type="radio" name="tf" checked={form.tf.answer==='true'} onChange={()=>setForm(f=>({...f, tf:{...f.tf, answer:'true'}}))} />True</label>
                <label className="flex items-center gap-2"><input type="radio" name="tf" checked={form.tf.answer==='false'} onChange={()=>setForm(f=>({...f, tf:{...f.tf, answer:'false'}}))} />False</label>
              </div>
              <input aria-label="Explanation" className="w-full my-2 px-3 py-2 rounded bg-neutral-800 border border-neutral-700" placeholder="Explanation (optional)" value={form.tf.explanation || ''} onChange={e=>setForm(f=>({...f, tf:{...f.tf, explanation:e.target.value}}))} />
              <TagInput ariaLabel="Tags" tags={form.tf.tags} onChange={(tags)=>setForm(f=>({...f, tf:{...f.tf, tags}}))} suggestions={Object.entries(tagIndex).map(([tag, count])=>({ tag, count }))} />
              <div className="mt-3">
                <label className="block text-sm mb-1">Difficulty: <span className="font-medium">{form.tf.difficulty}</span></label>
                <input type="range" min={1} max={10} step={1} value={form.tf.difficulty} onChange={e=>setForm(f=>({...f, tf:{...f.tf, difficulty: Number(e.target.value)}}))} className="w-full" />
              </div>
            </div>
          )}

          {cardType === 'cloze' && (
            <div className="mb-4">
              <textarea aria-label="Cloze text" className="w-full mb-2 px-3 py-2 rounded bg-neutral-800 border border-neutral-700" rows={4} placeholder="Use cloze format like: The capital of France is {{c1::Paris}}." value={form.cloze.text} onChange={e=>setForm(f=>({...f, cloze:{...f.cloze, text:e.target.value}}))} />
              <TagInput ariaLabel="Tags" tags={form.cloze.tags} onChange={(tags)=>setForm(f=>({...f, cloze:{...f.cloze, tags}}))} suggestions={Object.entries(tagIndex).map(([tag, count])=>({ tag, count }))} />
              <div className="mt-3">
                <label className="block text-sm mb-1">Difficulty: <span className="font-medium">{form.cloze.difficulty}</span></label>
                <input type="range" min={1} max={10} step={1} value={form.cloze.difficulty} onChange={e=>setForm(f=>({...f, cloze:{...f.cloze, difficulty: Number(e.target.value)}}))} className="w-full" />
              </div>
            </div>
          )}
        </div>
        <div className="min-h-[320px]"><CardPreview cardType={cardType} form={form} /></div>
      </div>

      <div className="mt-4 flex gap-2">
        <button className="px-3 py-1.5 rounded bg-neutral-200/10 disabled:opacity-50" onClick={handleManualSave} disabled={!canSave() || saving}>{saving ? 'Saving…' : 'Save'}</button>
        {onClose && (<button className="px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700" onClick={() => { resetHistory(initialForm); setError(null); onClose?.(); }}>Close</button>)}
      </div>

      <div className="mt-6">
        <h4 className="font-semibold mb-2">Generate with AI</h4>
        <textarea aria-label="AI input" className="w-full mb-2 px-3 py-2 rounded bg-neutral-800 border border-neutral-700" rows={4} placeholder="Paste notes or content to generate flashcards" value={aiText} onChange={e=>setAiText(e.target.value)} />
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-60" onClick={handleGenerate} disabled={aiLoading || !aiText.trim()}>{aiLoading ? 'Generating…' : 'Generate with AI'}</button>
          {preview.length > 0 && <button className="px-3 py-2 rounded bg-primary-sky-blue text-white" onClick={async ()=>{ for (const p of preview) { const baseSrs = { repetitions: 0, easeFactor: 2.5, interval: 0, dueDate: Timestamp.now() }; await FlashcardService.addCard(user!.uid, deckId, { deckId, type: 'basic', question: p.front, answer: p.back, tags: ['ai-generated', ...(p.aiMetadata?.tags || [])], srs: baseSrs as any, aiMetadata: p.aiMetadata } as any); } setPreview([]); onSaved?.(preview.length); }}>Accept All</button>}
          {preview.length > 0 && <button className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700" onClick={()=>setPreview([])}>Clear</button>}
        </div>
        {aiLoading && (<div className="mt-3 text-sm opacity-80">Analyzing your text and generating cards…</div>)}
        {preview.length > 0 && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {preview.map(p => (
              <div key={p.id} className="rounded border border-neutral-800 bg-neutral-900/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex gap-2">
                    {p.aiMetadata?.qualityScore !== undefined && (
                      <span className={`text-xs px-2 py-1 rounded-full ${p.aiMetadata.qualityScore > 0.7 ? 'bg-emerald-600' : p.aiMetadata.qualityScore > 0.4 ? 'bg-yellow-600' : 'bg-red-600'}`}>
                        Quality: {(p.aiMetadata.qualityScore * 100).toFixed(0)}%
                      </span>
                    )}
                    {p.aiMetadata?.difficulty && (<span className="text-xs px-2 py-1 rounded-full bg-blue-600">Difficulty: {p.aiMetadata.difficulty}</span>)}
                  </div>
                  <button className="text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700" onClick={() => handleRegenerate(p.id, p.front, p.back)}>Regenerate</button>
                </div>
                <label className="block text-xs opacity-70 mb-1">Question</label>
                <textarea className="w-full mb-2 px-2 py-2 rounded bg-neutral-800 border border-neutral-700" rows={2} value={p.front} onChange={e=>setPreview(prev=>prev.map(x=>x.id===p.id?{...x, front:e.target.value}:x))} />
                <label className="block text-xs opacity-70 mb-1">Answer</label>
                <textarea className="w-full mb-2 px-2 py-2 rounded bg-neutral-800 border border-neutral-700" rows={3} value={p.back} onChange={e=>setPreview(prev=>prev.map(x=>x.id===p.id?{...x, back:e.target.value}:x))} />
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 rounded bg-primary-sky-blue text-white text-sm" onClick={async ()=>{ const baseSrs = { repetitions: 0, easeFactor: 2.5, interval: 0, dueDate: Timestamp.now() }; await FlashcardService.addCard(user!.uid, deckId, { deckId, type: 'basic', question: p.front, answer: p.back, tags: ['ai-generated', ...(p.aiMetadata?.tags || [])], srs: baseSrs as any, aiMetadata: p.aiMetadata } as any); setPreview(prev => prev.filter(x => x.id !== p.id)); onSaved?.(1); }}>Accept</button>
                  <button className="px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700 text-sm" onClick={()=>setPreview(prev=>prev.filter(x=>x.id!==p.id))}>Discard</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function useEditorShortcuts(undo: () => void, redo: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { const isZ = e.key.toLowerCase() === 'z'; if ((e.metaKey || e.ctrlKey) && isZ) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);
}

import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../common/firebase';
import { collection, doc, getDoc, getDocs, orderBy, query, Timestamp, where } from 'firebase/firestore';
import type { AnalyticsRecord } from '../../types/flashcards';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, TimeScale } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line, Bar } from 'react-chartjs-2';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, TimeScale, MatrixController, MatrixElement);

export interface AnalyticsTabProps { deckId?: string; }

type DateRange = { start: Date; end: Date };

const defaultRange = (): DateRange => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  return { start, end };
};

function toCSV(rows: AnalyticsRecord[]): string {
  const header = ['reviewedAt','deckId','cardId','rating','correct','timeToAnswerMs'];
  const lines = rows.map(r => [
    (r.reviewedAt as any).toDate ? (r.reviewedAt as any).toDate().toISOString() : new Date().toISOString(),
    r.deckId,
    r.cardId,
    r.rating,
    r.correct ? '1' : '0',
    String(r.timeToAnswerMs ?? '')
  ].join(','));
  return [header.join(','), ...lines].join('\n');
}

const AnalyticsTab = ({ deckId }: AnalyticsTabProps) => {
  const [rows, setRows] = useState<AnalyticsRecord[]>([]);
  const [prevRows, setPrevRows] = useState<AnalyticsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [{ start, end }, setRange] = useState<DateRange>(defaultRange());
  const [uid, setUid] = useState<string | null>(null);
  const [goals, setGoals] = useState<{ targetReviews?: number; targetMinutes?: number }>(() => {
    try { return JSON.parse(localStorage.getItem('analyticsGoals.v1') || '{}') || {}; } catch { return {}; }
  });
  const [cardTypeMap, setCardTypeMap] = useState<Record<string, string>>({});

  useEffect(() => {
  setLoading(true);
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUid(user?.uid || null);
      setRows([]); setError(null);
      if (!user) { setLoading(false); return; }
      try {
        // Load per-user analytics between dates, optionally filtered by deckId
        const col = collection(db, `users/${user.uid}/analytics`);
        const filters: any[] = [
          where('reviewedAt', '>=', Timestamp.fromDate(start)),
          where('reviewedAt', '<=', Timestamp.fromDate(end)),
        ];
        if (deckId) filters.push(where('deckId', '==', deckId));
        const q = query(col, ...filters, orderBy('reviewedAt', 'asc'));
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as AnalyticsRecord));
        setRows(data);
        // Load previous period for comparison
        const msRange = end.getTime() - start.getTime();
        const prevEnd = new Date(start.getTime() - 24*60*60*1000);
        const prevStart = new Date(prevEnd.getTime() - msRange);
        const pf: any[] = [
          where('reviewedAt', '>=', Timestamp.fromDate(prevStart)),
          where('reviewedAt', '<=', Timestamp.fromDate(prevEnd)),
        ];
        if (deckId) pf.push(where('deckId', '==', deckId));
        const pq = query(col, ...pf, orderBy('reviewedAt', 'asc'));
        const psnap = await getDocs(pq);
        setPrevRows(psnap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as AnalyticsRecord)));
      } catch (e:any) {
        setError(e?.message || 'Failed to load analytics');
      } finally { setLoading(false); }
    });
  return () => unsubscribe();
  }, [start.getTime(), end.getTime(), deckId]);

  // persist goals
  useEffect(() => {
    try { localStorage.setItem('analyticsGoals.v1', JSON.stringify(goals)); } catch {}
  }, [goals]);

  const summary = useMemo(() => {
    const total = rows.length;
    const correct = rows.filter(r => r.correct).length;
    const timeStudiedMs = rows.reduce((a, r) => a + (r.timeToAnswerMs || 0), 0);
    return { total, correct, accuracy: total ? correct/total : 0, minutes: Math.round(timeStudiedMs/60000) };
  }, [rows]);

  const prevSummary = useMemo(() => {
    const total = prevRows.length;
    const correct = prevRows.filter(r => r.correct).length;
    const timeStudiedMs = prevRows.reduce((a, r) => a + (r.timeToAnswerMs || 0), 0);
    return { total, correct, accuracy: total ? correct/total : 0, minutes: Math.round(timeStudiedMs/60000) };
  }, [prevRows]);

  // Time series study minutes per day
  const timeSeries = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of rows) {
      const d = (r.reviewedAt as any).toDate ? (r.reviewedAt as any).toDate() as Date : new Date();
      const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      byDay.set(key, (byDay.get(key) || 0) + (r.timeToAnswerMs || 0));
    }
    const arr = Array.from(byDay.entries()).sort(([a],[b]) => a.localeCompare(b));
    return {
      labels: arr.map(([k]) => k),
      datasets: [{ label: 'Study minutes', data: arr.map(([,v]) => Math.round(v/60000)), borderColor: '#22d3ee', backgroundColor: 'rgba(34,211,238,0.2)' }]
    };
  }, [rows]);

  // Accuracy per deck
  const accuracyPerDeck = useMemo(() => {
    const map = new Map<string, { total: number; correct: number }>();
    rows.forEach(r => {
      const k = r.deckId; const m = map.get(k) || { total: 0, correct: 0 };
      m.total += 1; if (r.correct) m.correct += 1; map.set(k, m);
    });
    const labels = Array.from(map.keys());
    const data = labels.map(k => map.get(k)!).map(v => Math.round((v.correct/(v.total||1))*100));
    return { labels, datasets: [{ label: 'Accuracy %', data, backgroundColor: '#10b981' }] };
  }, [rows]);

  // Accuracy by difficulty (1-10)
  const accuracyByDifficulty = useMemo(() => {
    const map = new Map<number, { total: number; correct: number }>();
    rows.forEach(r => {
      const d = typeof (r as any).difficulty === 'number' ? (r as any).difficulty as number : 5;
      const m = map.get(d) || { total: 0, correct: 0 };
      m.total += 1; if (r.correct) m.correct += 1; map.set(d, m);
    });
    const labels = Array.from({ length: 10 }, (_, i) => i + 1);
    const data = labels.map(d => {
      const m = map.get(d) || { total: 0, correct: 0 };
      return m.total ? Math.round((m.correct / m.total) * 100) : 0;
    });
    return { labels, datasets: [{ label: 'Accuracy %', data, backgroundColor: '#60a5fa' }] };
  }, [rows]);

  // Time of day performance (accuracy by hour 0-23)
  const timeOfDayAccuracy = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const agg = hours.map(() => ({ t: 0, c: 0 }));
    rows.forEach(r => {
      const d = (r.reviewedAt as any).toDate ? (r.reviewedAt as any).toDate() as Date : new Date();
      const h = d.getHours();
      agg[h].t += 1; if (r.correct) agg[h].c += 1;
    });
    const data = agg.map(a => (a.t ? Math.round((a.c / a.t) * 100) : 0));
    return { labels: hours.map(h => `${h}:00`), datasets: [{ label: 'Accuracy %', data, backgroundColor: '#f59e0b' }] };
  }, [rows]);

  // Memory retention curve: accuracy by days since last review
  const retentionCurve = useMemo(() => {
    const byCard: Record<string, AnalyticsRecord[]> = {};
    rows.forEach(r => { (byCard[r.cardId] ||= []).push(r); });
    const buckets: number[] = Array.from({ length: 31 }, (_, i) => i); // 0..30 days
    const agg = buckets.map(() => ({ t: 0, c: 0 }));
    for (const arr of Object.values(byCard)) {
      const sorted = arr.slice().sort((a, b) => ((a.reviewedAt as any).toMillis?.() ?? 0) - ((b.reviewedAt as any).toMillis?.() ?? 0));
      for (let i = 1; i < sorted.length; i++) {
        const prev = (sorted[i-1].reviewedAt as any).toDate ? (sorted[i-1].reviewedAt as any).toDate() as Date : new Date();
        const cur = (sorted[i].reviewedAt as any).toDate ? (sorted[i].reviewedAt as any).toDate() as Date : new Date();
        const days = Math.min(30, Math.max(0, Math.floor((cur.getTime() - prev.getTime()) / (24*60*60*1000))));
        agg[days].t += 1; if (sorted[i].correct) agg[days].c += 1;
      }
    }
    const data = agg.map(a => (a.t ? Math.round((a.c / a.t) * 100) : 0));
    return { labels: buckets.map(d => `${d}d`), datasets: [{ label: 'Retention (Accuracy %)', data, borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.2)' }] };
  }, [rows]);

  // Session history timeline grouped by sessionId
  const sessionTimeline = useMemo(() => {
    const map = new Map<string, { at: Date; t: number; c: number; ms: number }>();
    rows.forEach(r => {
      const k = r.sessionId || 'unknown';
      const d = (r.reviewedAt as any).toDate ? (r.reviewedAt as any).toDate() as Date : new Date();
      const m = map.get(k) || { at: d, t: 0, c: 0, ms: 0 };
      if (d < m.at) m.at = d;
      m.t += 1; if (r.correct) m.c += 1; m.ms += (r.timeToAnswerMs || 0);
      map.set(k, m);
    });
    const arr = Array.from(map.values()).sort((a,b)=>a.at.getTime()-b.at.getTime());
    return {
      labels: arr.map(a => a.at.toISOString()),
      datasets: [
        { type: 'bar' as const, label: 'Reviews', data: arr.map(a=>a.t), backgroundColor: '#4ade80', yAxisID: 'y' },
        { type: 'line' as const, label: 'Accuracy %', data: arr.map(a=> Math.round((a.c/Math.max(1,a.t))*100)), borderColor: '#22d3ee', yAxisID: 'y1' },
      ],
    };
  }, [rows]);

  // Fetch card types for effectiveness chart (by cardId)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!uid) return;
        const need: Array<{ deckId: string; cardId: string }> = [];
        const seen = new Set<string>();
        rows.forEach(r => {
          const key = `${r.deckId}/${r.cardId}`;
          if (!seen.has(key) && !cardTypeMap[r.cardId]) { seen.add(key); need.push({ deckId: r.deckId, cardId: r.cardId }); }
        });
        const updates: Record<string, string> = {};
        // Fetch sequentially to keep it simple
        for (const { deckId: did, cardId } of need.slice(0, 200)) { // cap to 200
          const ref = doc(db, `users/${uid}/flashcards/${did}/cards/${cardId}`);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            const t = (snap.data() as any).type as string | undefined;
            if (t) updates[cardId] = t;
          }
          if (cancelled) break;
        }
        if (!cancelled && Object.keys(updates).length) setCardTypeMap(prev => ({ ...prev, ...updates }));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [rows, uid]);

  const cardTypeEffectiveness = useMemo(() => {
    const map = new Map<string, { t: number; c: number }>();
    rows.forEach(r => {
      const t = cardTypeMap[r.cardId] || 'unknown';
      const m = map.get(t) || { t: 0, c: 0 };
      m.t += 1; if (r.correct) m.c += 1; map.set(t, m);
    });
    const labels = Array.from(map.keys());
    const data = labels.map(k => {
      const m = map.get(k)!; return m.t ? Math.round((m.c/m.t)*100) : 0;
    });
    return { labels, datasets: [{ label: 'Accuracy %', data, backgroundColor: '#ef4444' }] };
  }, [rows, cardTypeMap]);

  // Difficulty distribution (count of reviews)
  const difficultyDistribution = useMemo(() => {
    const labels = Array.from({ length: 10 }, (_, i) => i + 1);
    const counts = labels.map(() => 0);
    rows.forEach(r => { const d = typeof (r as any).difficulty === 'number' ? (r as any).difficulty as number : 5; if (d>=1 && d<=10) counts[d-1] += 1; });
    return { labels, datasets: [{ label: 'Reviews', data: counts, backgroundColor: '#93c5fd' }] };
  }, [rows]);

  // Recommendations based on weak areas
  const recommendations = useMemo(() => {
    const recs: string[] = [];
    // weak difficulties
    const dif = accuracyByDifficulty;
    if (dif.datasets[0].data.some((v:any)=>v<60)) {
      const weak = (dif.labels as number[]).filter((_,i)=> (dif.datasets[0].data as number[])[i] < 60);
      if (weak.length) recs.push(`Focus on difficulty ${weak.slice(0,3).join(', ')}. Consider shorter intervals and targeted practice.`);
    }
    // weak hours
    const tday = timeOfDayAccuracy;
    const minHourIdx = (tday.datasets[0].data as number[]).reduce((minIdx, v, i, arr) => v < arr[minIdx] ? i : minIdx, 0);
    const minHour = tday.labels[minHourIdx];
    if ((tday.datasets[0].data as number[])[minHourIdx] < 60) recs.push(`Avoid studying at ${minHour} if possible; your accuracy is lower. Try a different time of day.`);
    // card type gaps
    if (cardTypeEffectiveness.labels.length) {
      const idx = (cardTypeEffectiveness.datasets[0].data as number[]).reduce((minIdx, v, i, arr)=> v < arr[minIdx] ? i : minIdx, 0);
      const t = cardTypeEffectiveness.labels[idx];
      if ((cardTypeEffectiveness.datasets[0].data as number[])[idx] < 60) recs.push(`Practice more ${t} cards; effectiveness is lower for this type.`);
    }
    if (!recs.length) recs.push('Great work! No obvious weak areas in this period.');
    return recs;
  }, [accuracyByDifficulty, timeOfDayAccuracy, cardTypeEffectiveness]);

  // Export PDF using jsPDF (dynamic import). Gracefully degrade if unavailable
  const handleExportPDF = async () => {
    try {
      const jsPDF = (await import('jspdf')).default;
      const doc = new jsPDF();
      let y = 10;
      doc.setFontSize(14);
      doc.text('LearnNest Analytics', 10, y); y += 8;
      doc.setFontSize(11);
      doc.text(`Range: ${start.toISOString().slice(0,10)} to ${end.toISOString().slice(0,10)}`, 10, y); y += 6;
      doc.text(`Reviews: ${summary.total} | Accuracy: ${Math.round(summary.accuracy*100)}% | Time: ${summary.minutes}m`, 10, y); y += 8;
      doc.text('Per-Deck Accuracy:', 10, y); y += 6;
      (accuracyPerDeck.labels as string[]).forEach((label, i) => { doc.text(`• ${label}: ${(accuracyPerDeck.datasets[0].data as number[])[i]}%`, 14, y); y += 5; if (y > 270) { doc.addPage(); y = 10; } });
      y += 2; doc.text('Card Type Effectiveness:', 10, y); y += 6;
      (cardTypeEffectiveness.labels as string[]).forEach((label, i) => { doc.text(`• ${label}: ${(cardTypeEffectiveness.datasets[0].data as number[])[i]}%`, 14, y); y += 5; if (y > 270) { doc.addPage(); y = 10; } });
      y += 2; doc.text('Recommendations:', 10, y); y += 6;
      recommendations.forEach(r => { const lines = doc.splitTextToSize(r, 180); doc.text(lines, 14, y); y += lines.length * 5; if (y > 270) { doc.addPage(); y = 10; } });
      doc.save('analytics.pdf');
    } catch (e) {
      alert('PDF export requires jsPDF. Please install it: npm i jspdf');
    }
  };

  // Retention heatmap (day x hour matrix of correct rate)
  const retentionMatrix = useMemo(() => {
    const cells: Array<{ x: number; y: number; v: number }>=[];
    const grid = Array.from({length:7}, () => Array.from({length:24}, () => ({ total:0, correct:0 })));
    for (const r of rows) {
      const d = (r.reviewedAt as any).toDate ? (r.reviewedAt as any).toDate() as Date : new Date();
      const day = d.getDay(); // 0-6
      const hour = d.getHours(); // 0-23
      grid[day][hour].total += 1; if (r.correct) grid[day][hour].correct += 1;
    }
    for (let day=0; day<7; day++) {
      for (let hour=0; hour<24; hour++) {
        const g = grid[day][hour];
        const pct = g.total ? Math.round((g.correct/g.total)*100) : 0;
        cells.push({ x: hour, y: day, v: pct });
      }
    }
    return {
      labels: { x: Array.from({length:24}, (_,i)=>String(i)), y: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] },
      datasets: [{ label: 'Retention %', data: cells, backgroundColor(ctx:any){ const v = ctx.raw.v as number; const alpha = 0.15 + (v/100)*0.8; return `rgba(16,185,129,${alpha})`; } }]
    };
  }, [rows]);

  const downloadCSV = () => {
    const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'analytics.csv'; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <section aria-labelledby="analytics-heading" className="space-y-4" aria-busy={loading || undefined} aria-invalid={!!error || undefined}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="analytics-heading" className="text-lg font-semibold">Analytics</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm" htmlFor="start-date">Start</label>
          <input id="start-date" type="date" value={start.toISOString().slice(0,10)} onChange={e=>setRange(r=>({ ...r, start: new Date(e.target.value) }))} className="px-2 py-1 rounded bg-neutral-900 border border-neutral-700" />
          <label className="text-sm" htmlFor="end-date">End</label>
          <input id="end-date" type="date" value={end.toISOString().slice(0,10)} onChange={e=>setRange(r=>({ ...r, end: new Date(e.target.value) }))} className="px-2 py-1 rounded bg-neutral-900 border border-neutral-700" />
          <button onClick={downloadCSV} className="px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700" aria-label="Export analytics as CSV">Export CSV</button>
          <button onClick={handleExportPDF} className="px-3 py-1.5 rounded bg-neutral-800 border border-neutral-700" aria-label="Export analytics as PDF">Export PDF</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="list" aria-label="Key metrics">
        <div role="listitem" className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/30">
          <div className="text-xs opacity-70">Reviews</div>
          <div className="text-2xl font-semibold">{summary.total}</div>
        </div>
        <div role="listitem" className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/30">
          <div className="text-xs opacity-70">Accuracy</div>
          <div className="text-2xl font-semibold">{Math.round(summary.accuracy*100)}%</div>
        </div>
        <div role="listitem" className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/30">
          <div className="text-xs opacity-70">Time Studied</div>
          <div className="text-2xl font-semibold">{summary.minutes}m</div>
        </div>
        <div role="listitem" className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/30">
          <div className="text-xs opacity-70">Streak</div>
          <div className="text-2xl font-semibold">{computeStreak(rows)}</div>
        </div>
      </div>

      {/* Goals and progress */}
      <div className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/30">
        <h3 className="text-sm font-semibold mb-2">Goals</h3>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <label className="text-sm">Reviews
            <input type="number" min={1} className="ml-2 w-24 px-2 py-1 rounded bg-neutral-900 border border-neutral-700" value={goals.targetReviews ?? ''} onChange={e=>setGoals(g=>({ ...g, targetReviews: e.target.value ? Number(e.target.value) : undefined }))} />
          </label>
          <label className="text-sm">Minutes
            <input type="number" min={1} className="ml-2 w-24 px-2 py-1 rounded bg-neutral-900 border border-neutral-700" value={goals.targetMinutes ?? ''} onChange={e=>setGoals(g=>({ ...g, targetMinutes: e.target.value ? Number(e.target.value) : undefined }))} />
          </label>
        </div>
        <div className="space-y-2">
          {goals.targetReviews && (
            <div>
              <div className="text-xs opacity-70 mb-1">Reviews progress {Math.min(100, Math.round((summary.total/Math.max(1, goals.targetReviews))*100))}%</div>
              <div className="h-2 bg-neutral-800 rounded"><div className="h-2 bg-emerald-500 rounded" style={{ width: `${Math.min(100, Math.round((summary.total/Math.max(1, goals.targetReviews))*100))}%` }} /></div>
            </div>
          )}
          {goals.targetMinutes && (
            <div>
              <div className="text-xs opacity-70 mb-1">Minutes progress {Math.min(100, Math.round((summary.minutes/Math.max(1, goals.targetMinutes))*100))}%</div>
              <div className="h-2 bg-neutral-800 rounded"><div className="h-2 bg-sky-500 rounded" style={{ width: `${Math.min(100, Math.round((summary.minutes/Math.max(1, goals.targetMinutes))*100))}%` }} /></div>
            </div>
          )}
        </div>
      </div>

      {/* Study time trends */}
      <div className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/30" aria-label="Study time trend line chart">
        <h3 className="text-sm font-semibold mb-2">Study Time</h3>
        <Line data={timeSeries} options={{ responsive: true, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, scales: { x: { type: 'time' as const } } }} />
      </div>

      {/* Performance comparison */}
      <div className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/30">
        <h3 className="text-sm font-semibold mb-2">Comparison vs previous period</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="p-3 rounded border border-neutral-800 bg-neutral-900">Reviews: {summary.total} ({diffStr(summary.total - prevSummary.total)})</div>
          <div className="p-3 rounded border border-neutral-800 bg-neutral-900">Accuracy: {Math.round(summary.accuracy*100)}% ({diffStr(Math.round(summary.accuracy*100) - Math.round(prevSummary.accuracy*100))})</div>
          <div className="p-3 rounded border border-neutral-800 bg-neutral-900">Minutes: {summary.minutes} ({diffStr(summary.minutes - prevSummary.minutes)})</div>
        </div>
      </div>

      {/* Accuracy per deck */}
      <div className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/30" aria-label="Accuracy per deck bar chart">
        <h3 className="text-sm font-semibold mb-2">Accuracy per Deck</h3>
        <Bar data={accuracyPerDeck} options={{ responsive: true, plugins: { legend: { display: false } } }} />
      </div>

      {/* Accuracy by difficulty */}
      <div className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/30" aria-label="Accuracy by difficulty bar chart">
        <h3 className="text-sm font-semibold mb-2">Accuracy by Difficulty</h3>
        <Bar data={accuracyByDifficulty} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: 'Difficulty (1-10)' } }, y: { title: { display: true, text: 'Accuracy %' }, suggestedMin: 0, suggestedMax: 100 } } }} />
      </div>

      {/* Retention heatmap */}
      <div className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/30" aria-label="Retention heatmap">
        <h3 className="text-sm font-semibold mb-2">Retention Heatmap</h3>
        <Bar
          data={{
            labels: retentionMatrix.labels.x,
            datasets: [
              {
                label: 'Retention %',
                data: retentionMatrix.datasets[0].data.map((c:any)=>c.v),
                backgroundColor: retentionMatrix.datasets[0].data.map((_:any, idx:number)=> retentionMatrix.datasets[0].backgroundColor({ raw: retentionMatrix.datasets[0].data[idx] } as any)),
              },
            ],
          }}
          options={{
            responsive: true,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx:any) => `Retention: ${ctx.raw}%` } } },
            scales: { x: { title: { display: true, text: 'Hour of Day' } }, y: { display: false } },
          }}
        />
      </div>

      {/* Time of Day Performance */}
      <div className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/30" aria-label="Time of day accuracy">
        <h3 className="text-sm font-semibold mb-2">Time of Day Accuracy</h3>
        <Bar data={timeOfDayAccuracy} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { suggestedMin: 0, suggestedMax: 100 } } }} />
      </div>

      {/* Card Type Effectiveness */}
      <div className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/30" aria-label="Card type effectiveness">
        <h3 className="text-sm font-semibold mb-2">Card Type Effectiveness</h3>
        <Bar data={cardTypeEffectiveness} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { suggestedMin: 0, suggestedMax: 100 } } }} />
      </div>

      {/* Difficulty Distribution */}
      <div className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/30" aria-label="Difficulty distribution">
        <h3 className="text-sm font-semibold mb-2">Difficulty Distribution</h3>
        <Bar data={difficultyDistribution} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: 'Difficulty (1-10)' } } } }} />
      </div>

      {/* Memory Retention Curve */}
      <div className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/30" aria-label="Retention curve">
        <h3 className="text-sm font-semibold mb-2">Memory Retention Curve</h3>
        <Line data={retentionCurve} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { suggestedMin: 0, suggestedMax: 100 } } }} />
      </div>

      {/* Weak areas and recommendations */}
      <div className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/30">
        <h3 className="text-sm font-semibold mb-2">Recommendations</h3>
        <ul className="list-disc pl-6 text-sm space-y-1">
          {recommendations.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </div>

      {/* Session history timeline */}
      <div className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/30" aria-label="Session history">
        <h3 className="text-sm font-semibold mb-2">Session History</h3>
        <Line data={sessionTimeline as any} options={{ responsive: true, plugins: { legend: { display: true } }, scales: { x: { type: 'time' as const }, y: { position: 'left' }, y1: { position: 'right', suggestedMin: 0, suggestedMax: 100, grid: { drawOnChartArea: false } } } }} />
      </div>
    </section>
  );
};

function computeStreak(rows: AnalyticsRecord[]) {
  const days = new Set<string>();
  rows.forEach(r => {
    const d = (r.reviewedAt as any).toDate ? (r.reviewedAt as any).toDate() as Date : new Date();
    days.add(new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString());
  });
  // Count consecutive days ending today
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(today.getDate() - i);
    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    if (days.has(key)) streak++; else break;
  }
  return streak;
}

export default AnalyticsTab;

function diffStr(n: number) {
  const sign = n > 0 ? '+' : n < 0 ? '' : '';
  return `${sign}${n}`;
}
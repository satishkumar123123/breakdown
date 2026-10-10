import React, { useEffect, useState } from 'react';
import { BarChart3, LineChart, RefreshCw } from 'lucide-react';
import { requestApi } from './api.js';
import { lastTenDays, today } from './reportTools.js';

const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#0891b2', '#4f46e5'];

export default function TenDayBreakdownChart() {
  const [mode, setMode] = useState('bar');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const endDate = today();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    requestApi('/reports').then(data => {
      if (!Array.isArray(data)) throw new Error('Report data sahi format me nahi mila.');
      if (active) setRecords(data);
    }).catch(err => {
      if (active) setError(err.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [refresh, endDate]);

  const days = lastTenDays(records, endDate);
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const step = Math.max(1, Math.ceil(Math.max(...days.map(day => day.count)) / 4));
  const maximum = step * 4;
  const left = 52, top = 34, bottom = 242, plotWidth = 884;
  const gap = plotWidth / days.length;
  const points = days.map((day, index) => ({ ...day, x: left + gap * (index + 0.5), y: bottom - day.count / maximum * (bottom - top) }));
  const summary = days.map(day => `${day.date}: ${day.count} breakdowns`).join('; ');

  return <section aria-label="Last 10 days breakdown chart" className="mt-6 rounded-2xl border border-violet-200 bg-gradient-to-br from-blue-50 via-violet-50 to-pink-50 p-4 sm:p-5 shadow-sm print:hidden">
    <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
      <div>
        <h2 className="text-lg font-extrabold text-violet-900">Last 10 Days • Breakdown Count</h2>
        <p className="text-xs text-violet-700 mt-1">{days[0].date} to {endDate} • saved breakdown entries per date</p>
      </div>
      <div className="flex items-center gap-2">
        <div role="group" aria-label="Choose breakdown chart type" className="flex gap-1 p-1 bg-white rounded-xl border border-violet-200">
          {[['bar', 'Bar Graph', BarChart3], ['line', 'Line Graph', LineChart]].map(([value, label, Icon]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${mode === value ? 'bg-violet-700 text-white shadow-sm' : 'text-violet-700 hover:bg-violet-50'}`}><Icon size={15} />{label}</button>)}
        </div>
        <button type="button" aria-label="Refresh last 10 days chart" disabled={loading} onClick={() => setRefresh(value => value + 1)} className="p-2.5 rounded-lg bg-white border border-violet-200 text-violet-700 disabled:opacity-50"><RefreshCw size={16} /></button>
      </div>
    </div>
    {loading ? <p role="status" className="py-14 text-center text-sm text-violet-700">Loading breakdown chart...</p> : error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p>Chart load nahi hua: {error}</p><button type="button" onClick={() => setRefresh(value => value + 1)} className="mt-2 font-bold underline">Retry chart</button></div> : <>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs font-semibold">
        <span className="rounded-lg bg-violet-100 text-violet-900 px-3 py-1.5">10-day total: {total} breakdowns</span>
        <span className="text-slate-600">Today included • zero-count dates also shown</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white bg-white/80">
        <svg viewBox="0 0 960 292" role="img" aria-label={`${mode === 'bar' ? 'Bar' : 'Line'} graph of last 10 days. ${summary}`} className="w-full min-w-[700px]">
          <text x={left} y="18" fill="#64748b" fontSize="11" fontWeight="600">Number of breakdowns</text>
          {Array.from({ length: 5 }, (_, index) => {
            const y = bottom - index / 4 * (bottom - top);
            return <g key={index}><line x1={left} x2={left + plotWidth} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray={index ? '4 5' : undefined} /><text x={left - 12} y={y + 4} textAnchor="end" fill="#64748b" fontSize="11">{index * step}</text></g>;
          })}
          {mode === 'line' && points.slice(1).map((point, index) => <line key={point.date} x1={points[index].x} y1={points[index].y} x2={point.x} y2={point.y} stroke={COLORS[index]} strokeWidth="3" strokeLinecap="round" />)}
          {points.map((point, index) => <g key={point.date}>
            <title>{point.date}: {point.count} breakdowns</title>
            {mode === 'bar' && point.count > 0 ? <rect x={point.x - 23} y={point.y} width="46" height={bottom - point.y} rx="6" fill={COLORS[index]} opacity="0.88" /> : <circle cx={point.x} cy={point.y} r={mode === 'line' ? 5 : 3} fill={COLORS[index]} stroke="white" strokeWidth="2" />}
            <text x={point.x} y={point.y - 11} textAnchor="middle" fill={COLORS[index]} fontSize="13" fontWeight="800">{point.count}</text>
            <text x={point.x} y={bottom + 23} textAnchor="middle" fill={COLORS[index]} fontSize="12" fontWeight="700">{point.date.slice(8)}/{point.date.slice(5, 7)}</text>
          </g>)}
          <text x={left + plotWidth / 2} y="286" textAnchor="middle" fill="#64748b" fontSize="11">Report date</text>
        </svg>
      </div>
      {total === 0 && <p className="text-xs text-violet-700 mt-3">Pichhle 10 din me koi saved breakdown nahi mila.</p>}
    </>}
  </section>;
}

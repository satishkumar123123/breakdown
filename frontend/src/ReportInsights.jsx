import React, { useState } from 'react';
import { analyseEntries } from './reportTools.js';

export function SummaryCards({ entries, label }) {
  const summary = analyseEntries(entries);
  return <section aria-label="Report summary" className="mb-5">
    <p className="text-xs font-semibold text-slate-600 mb-2">{label}</p>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[
        ['Total breakdowns', summary.count, 'date-theme-0'],
        ['Total downtime', `${summary.hours.toFixed(2)} hrs`, 'date-theme-2'],
        ['D shift downtime', `${summary.day.toFixed(2)} hrs`, 'date-theme-5'],
        ['N shift downtime', `${summary.night.toFixed(2)} hrs`, 'date-theme-1']
      ].map(([title, value, theme]) => <div key={title} className={`summary-card ${theme}`}>
        <p className="text-xs font-semibold mb-2">{title}</p>
        <p className="text-2xl font-extrabold">{value}</p>
      </div>)}
    </div>
    {summary.unassigned > 0 && <p className="text-xs text-slate-600 mt-2">Older reports with an unspecified D/N shift: {summary.unassigned.toFixed(2)} hrs.</p>}
  </section>;
}

export function MachineAnalysis({ entries, label }) {
  const [metric, setMetric] = useState('hours');
  const [showAll, setShowAll] = useState(false);
  const machines = analyseEntries(entries).machines.sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name));
  const shown = showAll ? machines : machines.slice(0, 8);
  const max = Math.max(1, ...machines.map(machine => machine[metric]));
  return <section aria-label="Machine-wise analysis" className="rounded-xl bg-white/90 border border-sky-200 p-4 mb-6 print:hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div><h3 className="font-bold text-sky-900">Machine-wise analysis</h3><p className="text-xs text-slate-600 mt-1">{label}</p></div>
      <div className="flex gap-2" role="group" aria-label="Chart metric">
        {[['hours', 'Downtime'], ['count', 'Breakdowns']].map(([value, title]) => <button type="button" key={value} aria-pressed={metric === value} onClick={() => setMetric(value)} className={`text-xs font-semibold px-3 py-2 rounded-lg ${metric === value ? 'bg-sky-700 text-white' : 'bg-sky-50 text-sky-800'}`}>{title}</button>)}
      </div>
    </div>
    {shown.length ? <div className="space-y-3" role="list" aria-label={`Machines ranked by ${metric === 'hours' ? 'downtime' : 'breakdown count'}`}>
      {shown.map((machine, index) => <div key={machine.name} role="listitem" className="grid grid-cols-[minmax(90px,1fr)_3fr] gap-3 items-center">
        <span className="text-xs font-semibold text-slate-700 break-words">{machine.name}</span>
        <div><div className="flex justify-between gap-2 text-xs mb-1"><span className="text-slate-500">{machine.count} breakdowns</span><strong className="text-sky-900">{metric === 'hours' ? `${machine.hours.toFixed(2)} hrs` : machine.count}</strong></div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true"><div className={`machine-bar machine-bar-${index % 4}`} style={{ width: `${machine[metric] / max * 100}%` }} /></div>
        </div>
      </div>)}
    </div> : <p className="text-sm text-slate-500">Matching breakdowns milne par machine chart yahan dikhega.</p>}
    {machines.length > 8 && <button type="button" onClick={() => setShowAll(!showAll)} className="mt-4 text-xs font-bold text-sky-700">{showAll ? 'Show top 8' : `Show all ${machines.length} machines`}</button>}
  </section>;
}

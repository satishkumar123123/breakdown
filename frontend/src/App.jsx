import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Download, Printer, History, CheckCircle2, RefreshCw, CalendarDays, Pencil, Archive, ArrowLeft } from 'lucide-react';
import * as XLSX from 'xlsx';
import { requestApi } from './api.js';
import { SummaryCards, MachineAnalysis } from './ReportInsights.jsx';
import TenDayBreakdownChart from './TenDayBreakdownChart.jsx';
import ProjectQrBlock from './ProjectQrBlock.jsx';
import { EDIT_DRAFT_KEY, today, downtime, normaliseRows } from './reportTools.js';
import { currentMonth, monthLabel, monthEnd, monthDraftKey, newMonthRow, rowHasData, readMonthDraft, savedRows, newestFirst, monthGroups } from './monthlyReports.js';

function loadForm(month, onlyNew = false) {
  try { return { month, ...readMonthDraft(window.localStorage, month, onlyNew), storageError: false }; }
  catch { return { month, rows: [], editingReport: null, storageError: true }; }
}

const headers = ['SL. NO.', 'Date', 'Machine Name', 'Shift', 'Break Down Details', 'Root Cause',
  'Corrective Action', 'Start Time', 'End Time', 'Down Time (Hrs)', 'Man Power', 'Spares Used'];

function BreakdownTable({ rows, month, busy, onChange, onRemove, onEdit, onDelete, highlightDate, emptyMessage = 'Is month mein abhi koi breakdown nahi hai. Add Breakdown Row se entry shuru karein.' }) {
  const hours = rows.reduce((sum, row) => sum + (Number(row.downTimeHours) || 0), 0);
  const manpower = rows.reduce((sum, row) => sum + (Number(row.manpowerUsed) || 0), 0);
  const input = (row, field, type = 'text') => <input
    type={type} required={field === 'machineName' || field === 'entryDate'}
    aria-label={field === 'entryDate' ? 'Breakdown date' : field === 'machineName' ? 'Machine name' : field === 'manpowerUsed' ? 'Manpower' : field === 'startTime' ? 'Start time' : field === 'endTime' ? 'End time' : 'Spares used'}
    value={row[field] ?? ''} disabled={busy}
    min={type === 'date' ? month + '-01' : type === 'number' ? 0 : undefined}
    max={type === 'date' ? monthEnd(month) : undefined}
    onChange={event => onChange(row.id, field, event.target.value)}
    className="w-full rounded px-2 py-2 text-xs border"
  />;
  const area = (row, field, label) => row.draft
    ? <textarea aria-label={label} rows={2} value={row[field] || ''} disabled={busy} onChange={event => onChange(row.id, field, event.target.value)} className="w-full rounded px-2 py-2 text-xs border resize-y" />
    : <span className="whitespace-pre-wrap break-words">{row[field] || '-'}</span>;
  return <div className="overflow-x-auto rounded-xl border border-slate-200 monthly-table-scroll">
    <table className="color-table monthly-table w-full text-left text-xs border-collapse min-w-[1400px]">
      <thead><tr>{headers.map(title => <th key={title} className="p-3">{title}</th>)}<th className="p-3 print:hidden">Status / Action</th></tr></thead>
      <tbody>
        {rows.map((row, index) => <tr key={row.key} data-entry-date={row.entryDate} className={highlightDate === row.entryDate ? 'highlight-date' : ''}>
          <td className="p-2 text-center font-bold">{index + 1}</td>
          <td className="p-2 min-w-[142px] font-bold">{row.draft ? input(row, 'entryDate', 'date') : row.entryDate}</td>
          <td className="p-2 min-w-[150px] font-semibold">{row.draft ? input(row, 'machineName') : row.machineName}</td>
          <td className="p-2 text-center">
            {row.draft ? <button type="button" role="switch" aria-label="Night shift" aria-checked={row.shift === 'N'} disabled={busy} onClick={() => onChange(row.id, 'shift', row.shift === 'N' ? 'D' : 'N')} className={'shift-toggle ' + (row.shift === 'N' ? 'shift-night' : 'shift-day')}>{row.shift}</button> : <strong>{row.shift || '-'}</strong>}
          </td>
          <td className="p-2 min-w-[170px]">{area(row, 'breakdownDetails', 'Breakdown details')}</td>
          <td className="p-2 min-w-[150px]">{area(row, 'rootCause', 'Root cause')}</td>
          <td className="p-2 min-w-[170px]">{area(row, 'correctiveAction', 'Corrective action')}</td>
          <td className="p-2">{row.draft ? input(row, 'startTime', 'time') : row.startTime || '-'}</td>
          <td className="p-2">{row.draft ? input(row, 'endTime', 'time') : row.endTime || '-'}</td>
          <td className="p-2 text-center font-bold">{Number(row.downTimeHours || 0).toFixed(2)}</td>
          <td className="p-2 min-w-[80px]">{row.draft ? input(row, 'manpowerUsed', 'number') : row.manpowerUsed || 0}</td>
          <td className="p-2 min-w-[120px]">{row.draft ? input(row, 'sparesUsed') : row.sparesUsed || '-'}</td>
          <td className="p-2 min-w-[145px] print:hidden">
            {row.draft ? <div className="flex items-center justify-between gap-2"><span className="row-status draft-status">Unsaved</span><button type="button" disabled={busy} aria-label="Remove draft row" onClick={() => onRemove(row.id)} className="p-2 text-rose-700"><Trash2 size={16} /></button></div>
              : <div className="flex flex-wrap gap-1 items-center"><span className="row-status saved-status">Saved</span><button type="button" disabled={busy} onClick={() => onEdit(row.reportId)} title="Edit all rows in this saved report" aria-label={'Edit report for ' + row.entryDate} className="p-2 text-violet-800"><Pencil size={15} /></button><button type="button" disabled={busy} onClick={() => onDelete(row.reportId)} title="Delete this entire saved report" aria-label={'Delete report for ' + row.entryDate} className="p-2 text-rose-700"><Trash2 size={15} /></button></div>}
          </td>
        </tr>)}
        {!rows.length && <tr><td colSpan={13} className="p-10 text-center">{emptyMessage}</td></tr>}
      </tbody>
      <tfoot><tr className="bg-slate-100 font-bold"><td colSpan={9} className="p-3 text-right">Total</td><td className="p-3 text-center">{hours.toFixed(2)}</td><td className="p-3">{manpower}</td><td /><td className="print:hidden" /></tr></tfoot>
    </table>
  </div>;
}

export default function App() {
  const [form, setForm] = useState(() => loadForm(currentMonth()));
  const { month, rows, editingReport } = form;
  const [calendarDate, setCalendarDate] = useState(today);
  const previousCalendarMonth = useRef(calendarDate.slice(0, 7));
  const [activeTab, setActiveTab] = useState('entry');
  const [workspace, setWorkspace] = useState({ reports: [], archivedMonths: [] });
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [storageError, setStorageError] = useState(form.storageError);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [historyMonth, setHistoryMonth] = useState('');
  const [filterMachine, setFilterMachine] = useState('');
  const [filterShift, setFilterShift] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [highlightDate, setHighlightDate] = useState('');
  const requestNumber = useRef(0);
  const mutationInProgress = useRef(false);
  const busy = saving || archiving;
  const archived = workspace.archivedMonths.includes(month);

  const refreshWorkspace = useCallback(async () => {
    const requestId = ++requestNumber.current;
    setLoading(true);
    try {
      const data = await requestApi('/reports?view=monthly');
      if (!Array.isArray(data?.reports) || !Array.isArray(data?.archivedMonths)) {
        throw new Error('Monthly reporting API available nahi hai. Updated backend deploy karke refresh karein.');
      }
      if (requestId === requestNumber.current) { setWorkspace(data); setLoaded(true); setError(''); }
      return true;
    } catch (err) {
      if (requestId === requestNumber.current) setError(err.message);
      return false;
    } finally {
      if (requestId === requestNumber.current) setLoading(false);
    }
  }, []);

  useEffect(() => { refreshWorkspace(); return () => { requestNumber.current++; }; }, [refreshWorkspace]);
  useEffect(() => {
    // Preserve a damaged/unreadable draft instead of overwriting it with an empty form.
    if (form.storageError) { setStorageError(true); return; }
    try {
      window.localStorage.setItem(monthDraftKey(month, Boolean(editingReport)), JSON.stringify({ version: 2, rows, editingReport }));
      setStorageError(false);
    } catch { setStorageError(true); }
  }, [month, rows, editingReport, form.storageError]);

  useEffect(() => {
    const timer = window.setInterval(() => setCalendarDate(today()), 60000);
    const onFocus = () => { setCalendarDate(today()); if (!mutationInProgress.current) refreshWorkspace(); };
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refreshWorkspace]);

  useEffect(() => {
    const next = calendarDate.slice(0, 7);
    if (next === previousCalendarMonth.current || busy) return;
    const previous = previousCalendarMonth.current;
    previousCalendarMonth.current = next;
    if (month === previous) { setForm(loadForm(next)); setHighlightDate(''); }
  }, [calendarDate, busy, month]);

  const changeMonth = next => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(next) || busy) return;
    setForm(loadForm(next)); setError(''); setHighlightDate('');
  };

  const allGroups = useMemo(() => monthGroups(workspace.reports), [workspace.reports]);
  const openMonths = allGroups.filter(group => !workspace.archivedMonths.includes(group.month));
  const historyGroups = allGroups.filter(group => workspace.archivedMonths.includes(group.month));
  const savedMonthRows = savedRows(workspace.reports.filter(report => report.reportDate.slice(0, 7) === month));
  const displayRows = newestFirst([
    ...((!archived || editingReport) ? savedMonthRows.filter(row => row.reportId !== editingReport?._id) : []),
    ...rows.map((row, index) => ({ ...row, draft: true, key: 'draft:' + row.id, rowIndex: index }))
  ]);
  const historyRows = (historyGroups.find(group => group.month === historyMonth)?.rows || []).filter(row =>
    (!filterMachine || String(row.machineName || '').toLowerCase().includes(filterMachine.trim().toLowerCase())) &&
    (!filterShift || row.shift === filterShift) && (!filterDate || row.entryDate === filterDate)
  );

  const changeRow = (id, field, value) => setForm(current => ({ ...current, rows: current.rows.map(row => {
    if (row.id !== id) return row;
    const updated = { ...row, [field]: value };
    if (field === 'startTime' || field === 'endTime') updated.downTimeHours = downtime(updated.startTime, updated.endTime);
    return updated;
  }) }));

  const clearEditDraft = () => {
    try {
      window.localStorage.removeItem(monthDraftKey(month, true));
      const legacy = window.localStorage.getItem(EDIT_DRAFT_KEY);
      if (legacy && JSON.parse(legacy).reportDate?.slice(0, 7) === month) window.localStorage.removeItem(EDIT_DRAFT_KEY);
    } catch { setStorageError(true); }
  };

  const cancelEdit = () => {
    if (!window.confirm('Editing changes discard karke new entries par wapas jayein?')) return;
    clearEditDraft(); setForm(loadForm(month, true)); setError('');
  };

  const editReport = reportId => {
    const report = workspace.reports.find(item => item._id === reportId);
    if (!report) return;
    const reportMonth = report.reportDate.slice(0, 7);
    if (editingReport?._id === reportId) { setActiveTab('entry'); return; }
    // New-entry drafts stay under their own month key while a report is edited.
    let otherEdit;
    try { otherEdit = readMonthDraft(window.localStorage, reportMonth).editingReport; } catch { setStorageError(true); }
    if (otherEdit && otherEdit._id !== reportId && !window.confirm('Is month ka existing edit draft replace karein?')) return;
    setForm({ month: reportMonth, rows: normaliseRows(report.entries || [], report.shift).map(row => ({ ...row, entryDate: row.entryDate || report.reportDate })),
      editingReport: { _id: report._id, updatedAt: report.updatedAt }, storageError: false });
    setActiveTab('entry'); setError(''); setHighlightDate('');
    setNotice('Saved report edit ho rahi hai. Update Report se isi record mein changes save honge.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveEntries = async event => {
    event.preventDefault();
    if (mutationInProgress.current || !loaded || (archived && !editingReport)) return;
    if (!rows.length || rows.some(row => !String(row.machineName || '').trim() || !row.entryDate || row.entryDate.slice(0, 7) !== month)) {
      setError('Har draft row mein isi month ki date aur machine name bharein. Khali rows remove karein.'); return;
    }
    mutationInProgress.current = true;
    requestNumber.current++;
    setLoading(false); setSaving(true); setError('');
    const wasEditing = Boolean(editingReport);
    const wasArchived = archived;
    try {
      const data = await requestApi(editingReport ? '/reports/' + editingReport._id : '/reports', {
        method: editingReport ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportDate: [...rows].map(row => row.entryDate).sort().at(-1),
          shift: [...new Set(rows.map(row => row.shift))].join(' / '), entries: rows, expectedUpdatedAt: editingReport?.updatedAt })
      });
      if (!data?._id) throw new Error('Save confirm nahi hua. Refresh karke saved rows check karein; draft safe hai.');
      setWorkspace(current => ({ ...current, reports: [data, ...current.reports.filter(report => report._id !== data._id)] }));
      if (wasEditing) { clearEditDraft(); setForm(loadForm(month, true)); }
      else setForm(current => ({ ...current, rows: [], editingReport: null }));
      setNotice(wasEditing ? 'Report updated successfully.' : 'Daily entries saved. Yeh rows month close hone tak main page par rahengi.');
      if (wasEditing && wasArchived) { setHistoryMonth(month); setActiveTab('history'); }
      await refreshWorkspace();
    } catch (err) { setError(err.message); }
    finally { mutationInProgress.current = false; setSaving(false); }
  };

  const archiveMonth = async () => {
    if (mutationInProgress.current || !loaded || archived) return;
    if (editingReport || rows.some(rowHasData)) { setError('Month close karne se pehle unsaved entries save karein ya edit cancel karein.'); return; }
    if (!window.confirm(monthLabel(month) + ' ke saare saved breakdowns month-wise History mein move karein?')) return;
    mutationInProgress.current = true; requestNumber.current++;
    setLoading(false); setArchiving(true); setError('');
    try {
      const result = await requestApi('/report-months/' + month + '/archive', { method: 'POST' });
      if (result.month !== month) throw new Error('Month save confirm nahi hua. Refresh karke check karein.');
      setWorkspace(current => ({ ...current, archivedMonths: [...new Set([...current.archivedMonths, month])] }));
      setForm(current => ({ ...current, rows: [], editingReport: null }));
      setHistoryMonth(month); setFilterDate(''); setFilterMachine(''); setFilterShift(''); setActiveTab('history');
      setNotice(monthLabel(month) + ' History mein save ho gaya. Naye month ki entries Main Page par save karein.');
      await refreshWorkspace();
    } catch (err) { setError(err.message); }
    finally { mutationInProgress.current = false; setArchiving(false); }
  };

  const deleteReport = async reportId => {
    if (mutationInProgress.current) return;
    const report = workspace.reports.find(item => item._id === reportId);
    if (!window.confirm('Is saved report ki saari ' + (report?.entries?.length || 0) + ' breakdown rows delete karein?')) return;
    mutationInProgress.current = true; requestNumber.current++;
    setLoading(false); setSaving(true); setError('');
    try {
      await requestApi('/reports/' + reportId, { method: 'DELETE' });
      setWorkspace(current => ({ ...current, reports: current.reports.filter(item => item._id !== reportId) }));
      if (editingReport?._id === reportId) { clearEditDraft(); setForm(loadForm(month, true)); }
      setNotice('Report deleted.'); await refreshWorkspace();
    } catch (err) { setError(err.message); }
    finally { mutationInProgress.current = false; setSaving(false); }
  };

  const exportRows = (entries, selectedMonth) => {
    const data = entries.map((row, index) => ({
      'SL. NO.': index + 1, 'DATE': row.entryDate, 'MACHINE NAME': row.machineName, 'SHIFT': row.shift,
      'BREAK DOWN DETAILS': row.breakdownDetails, 'ROOT CAUSE': row.rootCause, 'CORRECTIVE ACTION': row.correctiveAction,
      'START TIME': row.startTime, 'END TIME': row.endTime, 'DOWN TIME (HRS)': row.downTimeHours,
      'MAN POWER': row.manpowerUsed, 'SPARES USED': row.sparesUsed, 'STATUS': row.draft ? 'Unsaved draft' : 'Saved'
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data), 'Monthly_Breakdowns');
    XLSX.writeFile(book, 'Breakdown_Report_' + selectedMonth + '.xlsx');
  };

  const selectHistory = selected => { setHistoryMonth(selected); setFilterDate(''); setFilterMachine(''); setFilterShift(''); };
  const openChartDate = date => {
    const selected = date.slice(0, 7);
    if (workspace.archivedMonths.includes(selected)) { selectHistory(selected); setFilterDate(date); setActiveTab('history'); }
    else { changeMonth(selected); setHighlightDate(date); setActiveTab('entry'); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const tableActions = { busy, onChange: changeRow, onRemove: id => setForm(current => ({ ...current, rows: current.rows.filter(row => row.id !== id) })), onEdit: editReport, onDelete: deleteReport };

  return <div className="portal-background min-h-screen text-slate-900 pb-16 font-sans">
    <header className="brand-heading max-w-[1600px] mx-auto px-4 pt-8 pb-6 text-center">
      <h1 className="brand-title">S G Green annovation</h1><p className="brand-subtitle mt-2">(breakdown report)</p><div className="brand-divider mx-auto mt-4" />
    </header>
    <main className="max-w-[1600px] mx-auto px-4 print:p-0">
      <div className="report-toolbar monthly-toolbar flex flex-wrap items-center gap-3 mb-5 p-3 print:hidden">
        <nav className="flex flex-wrap gap-3" aria-label="Report pages">
          <button type="button" disabled={busy} aria-pressed={activeTab === 'entry'} onClick={() => { setActiveTab('entry'); setError(''); }} className={'page-block page-block-entry ' + (activeTab === 'entry' ? 'page-block-active' : '')}><CalendarDays size={18} /> Main Page</button>
          <button type="button" disabled={busy} aria-pressed={activeTab === 'history'} onClick={() => { setActiveTab('history'); refreshWorkspace(); }} className={'page-block page-block-history ' + (activeTab === 'history' ? 'page-block-active' : '')}><History size={18} /> Monthly History</button>
        </nav>
        <ProjectQrBlock />
        <button type="button" disabled={busy || loading} aria-label="Refresh saved breakdowns" onClick={refreshWorkspace} className="ml-auto rounded-lg border border-teal-200 bg-white p-3 text-teal-800"><RefreshCw size={18} /></button>
      </div>
      {notice && <div role="status" className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 flex justify-between gap-3 print:hidden">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
      {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button type="button" disabled={busy || loading} onClick={refreshWorkspace} className="ml-3 underline font-bold">Refresh</button></div>}
      {loading && <p role="status" className="mb-4 text-sm text-teal-800">Loading saved breakdowns...</p>}
      {activeTab === 'entry' ? <section className="entry-panel rounded-2xl p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div><h2 className="text-xl font-extrabold text-teal-900">{monthLabel(month)} · Breakdown Register</h2><p className="text-sm text-teal-700 mt-1">Daily save • newest dates first • {savedMonthRows.length} {archived ? 'breakdowns in History' : 'saved breakdowns'}</p></div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <label className="text-xs font-bold text-teal-800">Working month <input type="month" aria-label="Working month" value={month} disabled={busy} onChange={event => changeMonth(event.target.value)} className="ml-2 border border-teal-200 rounded-lg bg-teal-50 px-2 py-2" /></label>
            {month !== calendarDate.slice(0, 7) && <button type="button" disabled={busy} onClick={() => changeMonth(calendarDate.slice(0, 7))} className="action-button bg-teal-100 text-teal-900">This month</button>}
            <button type="button" onClick={() => exportRows(displayRows, month)} disabled={!displayRows.length} className="action-button bg-emerald-100 text-emerald-900"><Download size={16} /> Export Month</button>
            <button type="button" onClick={() => window.print()} className="action-button bg-indigo-100 text-indigo-900"><Printer size={16} /> Print / PDF</button>
          </div>
        </div>
        {openMonths.some(group => group.month !== month) && <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden"><span className="text-xs text-slate-600">Other open months:</span>{openMonths.filter(group => group.month !== month).map(group => <button key={group.month} type="button" disabled={busy} onClick={() => changeMonth(group.month)} className="rounded-full bg-amber-50 border border-amber-200 text-amber-900 px-3 py-1 text-xs font-bold">{monthLabel(group.month)} ({group.rows.length})</button>)}</div>}
        {archived && <p className="mb-4 p-3 rounded-xl bg-violet-50 text-violet-900 text-sm">Yeh month History mein save ho chuka hai. {editingReport ? 'Existing report update kar sakte hain.' : 'Saved reports edit kar sakte hain; nayi entries ke liye doosra working month chunein.'}</p>}
        {archived && !editingReport && <button type="button" onClick={() => { selectHistory(month); setActiveTab('history'); }} className="action-button bg-violet-100 text-violet-900 mb-4 print:hidden">Open this month in History</button>}
        {archived && !editingReport && rows.some(rowHasData) && <p role="alert" className="mb-3 text-sm text-amber-900">Is device par unsaved draft bhi hai. Export Month se draft download kar sakte hain; yeh rows History mein save nahi hui hain.</p>}
        {editingReport && <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-violet-50 rounded-xl p-3"><p className="text-sm font-bold text-violet-900">Editing saved report · baaki saved rows bhi neeche dikhengi</p><button type="button" disabled={busy} onClick={cancelEdit} className="action-button bg-white text-rose-700 print:hidden">Cancel Edit</button></div>}
        {storageError && <p role="alert" className="mb-3 text-sm text-rose-700">Draft auto-save unavailable. Tab close karne se pehle entries save ya export karein.</p>}
        {highlightDate && <p className="mb-3 text-xs font-semibold text-violet-800">Chart se selected date: {highlightDate}. Matching rows highlighted hain.</p>}
        <form onSubmit={saveEntries}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 print:hidden">
            <div className="flex flex-wrap gap-2">
              {(!archived || editingReport) && <button type="button" disabled={busy || !loaded} onClick={() => setForm(current => ({ ...current, rows: [newMonthRow(month), ...current.rows] }))} className="action-button bg-teal-700 text-white"><Plus size={16} /> Add Breakdown Row</button>}
              {(!archived || editingReport) && <button type="submit" disabled={busy || !loaded || !rows.length} className="action-button bg-blue-700 text-white"><CheckCircle2 size={16} />{saving ? 'Saving...' : editingReport ? 'Update Report' : 'Save Daily Entries'}</button>}
            </div>
            {!archived && <button type="button" disabled={busy || !loaded || !savedMonthRows.length} onClick={archiveMonth} className="action-button bg-violet-700 text-white"><Archive size={16} />{archiving ? 'Saving month...' : 'Save Month to History'}</button>}
          </div>
          <BreakdownTable rows={displayRows} month={month} highlightDate={highlightDate} emptyMessage={archived ? 'Is month ke saved breakdowns Monthly History mein milenge.' : undefined} {...tableActions} />
          <p className="text-xs text-slate-600 mt-3 print:hidden">{rows.length && (!archived || editingReport) ? rows.length + ' draft rows · ' : ''}Daily save ke baad rows yahin rahengi. Month end par Save Month to History karein.</p>
        </form>
        {loaded && <TenDayBreakdownChart onSelectDate={openChartDate} disabled={busy} records={workspace.reports} onRefresh={refreshWorkspace} />}
      </section> : <section className="history-panel rounded-2xl border border-violet-200 p-4 sm:p-6">
        <h2 className="text-xl font-extrabold text-violet-900 mb-2">Monthly Breakdown History</h2>
        <p className="text-sm text-violet-700 mb-5">Save Month to History kiye hue months yahan milenge.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6 print:hidden">
          {historyGroups.map((group, index) => <button key={group.month} type="button" aria-pressed={historyMonth === group.month} onClick={() => selectHistory(group.month)} className={'date-card date-theme-' + index % 6 + (historyMonth === group.month ? ' date-card-selected' : '')}>
            <CalendarDays size={20} /><div className="text-lg font-extrabold my-2">{monthLabel(group.month)}</div><span className="date-card-badge text-xs font-bold">{group.rows.length} breakdowns</span><p className="text-xs font-bold mt-3">Downtime: {group.hours.toFixed(2)} hrs</p>
          </button>)}
        </div>
        {!historyGroups.length && !loading && <p className="p-8 text-center text-violet-700">Abhi koi month History mein save nahi hua hai. Daily entries Main Page par milengi.</p>}
        {historyMonth && historyGroups.some(group => group.month === historyMonth) ? <>
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <h3 className="font-extrabold text-violet-900">{monthLabel(historyMonth)}</h3>
            <div className="flex flex-wrap gap-2 print:hidden">
              <input type="search" aria-label="Search history by machine name" placeholder="Search machine..." value={filterMachine} onChange={event => setFilterMachine(event.target.value)} className="history-filter" />
              <input type="date" aria-label="Filter history by date" value={filterDate} min={historyMonth + '-01'} max={monthEnd(historyMonth)} onChange={event => setFilterDate(event.target.value)} className="history-filter" />
              <select aria-label="Filter history by shift" value={filterShift} onChange={event => setFilterShift(event.target.value)} className="history-filter"><option value="">All shifts</option><option value="D">D shift</option><option value="N">N shift</option></select>
              {(filterDate || filterShift || filterMachine) && <button type="button" onClick={() => { setFilterDate(''); setFilterMachine(''); setFilterShift(''); }} className="action-button bg-white text-violet-800">Clear filters</button>}
              <button type="button" disabled={!historyRows.length} onClick={() => exportRows(historyRows, historyMonth)} className="action-button bg-emerald-700 text-white"><Download size={16} /> Download Excel</button>
              <button type="button" onClick={() => window.print()} className="action-button bg-indigo-100 text-indigo-900"><Printer size={16} /> Print / PDF</button>
            </div>
          </div>
          <SummaryCards entries={historyRows} label={monthLabel(historyMonth) + ' · saved breakdowns' + (filterDate || filterShift || filterMachine ? ' · filtered results' : '')} />
          <MachineAnalysis entries={historyRows} label="Selected month and filters" />
          <BreakdownTable rows={historyRows} month={historyMonth} emptyMessage="Koi matching breakdown nahi mila. Filters clear karke dekhein." {...tableActions} />
        </> : historyGroups.length > 0 && <p className="p-8 text-center text-violet-700">Kisi month par click karke uski saari date-wise entries dekhein.</p>}
        <button type="button" disabled={busy} onClick={() => { changeMonth(currentMonth()); setActiveTab('entry'); }} className="action-button bg-white text-teal-800 mt-5 print:hidden"><ArrowLeft size={16} /> Current Month · Main Page</button>
      </section>}
    </main>
  </div>;
}


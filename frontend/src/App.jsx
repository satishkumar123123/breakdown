import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Download,
  Printer,
  History,
  ClipboardList,
  CheckCircle2,
  RefreshCw,
  CalendarDays,
  ChevronRight,
  ArrowLeft,
  Pencil
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { requestApi } from './api.js';
import { SummaryCards, MachineAnalysis } from './ReportInsights.jsx';
import TenDayBreakdownChart from './TenDayBreakdownChart.jsx';
import { DRAFT_KEY, EDIT_DRAFT_KEY, today, emptyRow, downtime, normaliseRows, readDraft, writeDraft, filterReports } from './reportTools.js';

const loadInitialForm = () => {
  try {
    const draft = readDraft(window.localStorage, EDIT_DRAFT_KEY) || readDraft(window.localStorage, DRAFT_KEY);
    if (draft) return { ...draft, restored: true };
  } catch { return { reportDate: today(), rows: [emptyRow()], storageError: true }; }
  return { reportDate: today(), rows: [emptyRow()] };
};

export default function App() {
  const [activeTab, setActiveTab] = useState('entry'); // 'entry' ya 'history'
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [initialForm] = useState(loadInitialForm);
  const [reportDate, setReportDate] = useState(initialForm.reportDate);
  const [rows, setRows] = useState(initialForm.rows);
  const [editingReport, setEditingReport] = useState(initialForm.editingReport || null);
  const [draftStatus, setDraftStatus] = useState(initialForm.restored ? 'Draft restored — aap wahi se continue kar sakte hain.' : '');
  const [storageError, setStorageError] = useState(initialForm.storageError || false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try {
      writeDraft(window.localStorage, editingReport ? EDIT_DRAFT_KEY : DRAFT_KEY, { reportDate, rows, editingReport });
      setStorageError(false);
      setDraftStatus(initialForm.restored ? 'Draft restored • changes auto-saved on this device' : 'Draft auto-saved on this device');
    } catch { setStorageError(true); }
  }, [reportDate, rows, editingReport, initialForm.restored]);

  const [historyRecords, setHistoryRecords] = useState([]);
  const [filterDate, setFilterDate] = useState('');
  const [filterMachine, setFilterMachine] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const sectionOptions = [...new Set(historyRecords.flatMap(report => (report.entries || []).map(entry => String(entry.section || '').trim())).filter(Boolean))].sort();
  const [filterShift, setFilterShift] = useState('');
  const filteredRecords = useMemo(() => filterReports(historyRecords, { date: filterDate, machine: filterMachine, section: filterSection, shift: filterShift }), [historyRecords, filterDate, filterMachine, filterSection, filterShift]);
  const [openHistoryDate, setOpenHistoryDate] = useState(null);
  const dateGroups = useMemo(() => {
    const grouped = new Map();
    filteredRecords.forEach(report => {
      const date = report.reportDate;
      if (!grouped.has(date)) grouped.set(date, []);
      grouped.get(date).push(report);
    });
    return [...grouped].sort(([a], [b]) => b.localeCompare(a)).map(([date, reports]) => ({
      date, reports,
      downtime: reports.reduce((sum, report) => sum + (Number(report.totalDownTime) || 0), 0),
      entries: reports.reduce((sum, report) => sum + (report.entries?.length || 0), 0)
    }));
  }, [filteredRecords]);
  const selectedDateGroup = dateGroups.find(group => group.date === openHistoryDate);
  const insightReports = selectedDateGroup?.reports || filteredRecords;
  const insightEntries = insightReports.flatMap(report => (report.entries || []).map(entry => ({ ...entry, shift: entry.shift || report.shift })));
  const insightLabel = `${selectedDateGroup?.date || filterDate || 'All dates'} • saved reports${filterMachine || filterSection || filterShift ? ' • filtered results' : ''}`;


  // Breakdown Reports Fetch Logic
  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await requestApi('/reports');
      setHistoryRecords(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  const handleRowChange = (index, field, value) => {
    setRows(current => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const updated = { ...row, [field]: value };
      if (field === 'startTime' || field === 'endTime') updated.downTimeHours = downtime(updated.startTime, updated.endTime);
      return updated;
    }));
  };

  const addRow = () => setRows(current => [...current, emptyRow()]);

  const restoreNewDraft = () => {
    let draft;
    try { draft = readDraft(window.localStorage, DRAFT_KEY); } catch { setStorageError(true); }
    setEditingReport(null);
    setReportDate(draft?.reportDate || today());
    setRows(draft?.rows || [emptyRow()]);
    setError('');
  };

  const cancelEdit = () => {
    if (!window.confirm('Editing changes discard karke new report draft par wapas jayein?')) return;
    try { window.localStorage.removeItem(EDIT_DRAFT_KEY); } catch { setStorageError(true); }
    restoreNewDraft();
  };

  const handleEditReport = (reportId) => {
    const report = historyRecords.find(item => item._id === reportId);
    if (!report) return;
    if (editingReport?._id === reportId) { setActiveTab('entry'); return; }
    if (editingReport && editingReport._id !== reportId && !window.confirm('Current edit draft replace karna hai?')) return;
    setEditingReport({ _id: report._id, updatedAt: report.updatedAt });
    setReportDate(report.reportDate);
    setRows(normaliseRows(report.entries || [], report.shift));
    setError('');
    setNotice('Existing report edit ho rahi hai. Update Report se changes save karein.');
    setActiveTab('entry');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeRow = (index) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const totalDownTime = rows.reduce((sum, r) => sum + (Number(r.downTimeHours) || 0), 0).toFixed(2);
  const totalManPower = rows.reduce((sum, r) => sum + (Number(r.manpowerUsed) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!rows.length || rows.some(row => !row.machineName.trim())) {
      setError('Har breakdown row me machine name zaroori hai.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      reportDate,
      shift: [...new Set(rows.map(row => row.shift))].join(' / '),
      entries: rows,
      totalDownTime: Number(totalDownTime),
      totalManPower: Number(totalManPower),
      expectedUpdatedAt: editingReport?.updatedAt
    };

    try {
      const data = await requestApi(editingReport ? `/reports/${editingReport._id}` : '/reports', {
        method: editingReport ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!data?._id) throw new Error('Server ne saved report confirm nahi ki. History check karein.');
      setNotice(editingReport ? 'Report successfully updated!' : 'Report database me successfully save ho gaya!');
      try { window.localStorage.removeItem(editingReport ? EDIT_DRAFT_KEY : DRAFT_KEY); } catch { setStorageError(true); }
      if (editingReport) restoreNewDraft();
      else setRows([emptyRow()]);
      setHistoryRecords(current => [data, ...current.filter(report => report._id !== data._id)]);
      setFilterMachine('');
      setFilterSection('');
      setFilterShift('');
      setFilterDate('');
      setOpenHistoryDate(reportDate);
      setActiveTab('history');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReport = async (reportId) => {
    if (!window.confirm('Kya aap is report record ko delete karna chahte hain?')) return;
    try {
      await requestApi(`/reports/${reportId}`, { method: 'DELETE' });
      setHistoryRecords(historyRecords.filter((r) => r._id !== reportId));
      if (editingReport?._id === reportId) {
        try { window.localStorage.removeItem(EDIT_DRAFT_KEY); } catch { setStorageError(true); }
        restoreNewDraft();
      }
      setNotice('Report record deleted!');
    } catch (err) {
      alert('Delete error: ' + err.message);
    }
  };

  const exportToExcel = (entries, dateStr, shiftStr) => {
    const formattedData = (entries || []).map((row, idx) => ({
      'SL. NO.': idx + 1,
      'DATE': dateStr,
      'MACHINE NAME': row.machineName,
      'SECTION': row.section || '',
      'SHIFT': row.shift || shiftStr || '-',
      'BREAK DOWN DETAILS': row.breakdownDetails,
      'ROOT CAUSE': row.rootCause,
      'CORECTIVE & PREVENTIVE ACTION': row.correctiveAction,
      'START TIME': row.startTime,
      'END TIME': row.endTime,
      'DOWN TIME (HRS)': row.downTimeHours,
      'MAN POWER USED': row.manpowerUsed,
      'SPARES USED': row.sparesUsed
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Breakdown_Report');
    XLSX.writeFile(workbook, `Breakdown_Report_${dateStr}.xlsx`);
  };

  return (
    <div className="portal-background min-h-screen text-slate-900 pb-16 font-sans">
      <header className="bg-slate-900 text-white shadow sticky top-0 z-40 print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <ClipboardList className="text-blue-400" />
            <div>
              <h1 className="text-lg font-bold tracking-wide">Daily Breakdown Reporting Portal</h1>
              <p className="text-xs text-slate-400">Plant Maintenance & Operations Dashboard</p>
            </div>
          </div>

          <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              type="button"
              disabled={saving}
              onClick={() => { setError(''); setActiveTab('entry'); }}
              className={`px-3 py-1.5 rounded-md font-medium text-xs transition ${
                activeTab === 'entry' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              {editingReport ? 'Edit Report' : 'New Report'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => { setOpenHistoryDate(null); setActiveTab('history'); }}
              className={`px-3 py-1.5 rounded-md font-medium text-xs transition ${
                activeTab === 'history' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              History Log
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-8 print:m-0 print:p-0 print:max-w-full">
        {notice && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex justify-between gap-3 print:hidden">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        {activeTab === 'entry' && (
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-md border border-slate-200 p-6 print:shadow-none print:border-none">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6 pb-5 border-b border-sky-100">
              <div className="w-44 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 shadow-sm">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-sky-700 mb-1">Report Date</label>
                <input
                  aria-label="Report date"
                  disabled={saving}
                  type="date"
                  required
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full border border-sky-200 rounded-md px-2 py-1 text-xs text-sky-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 font-semibold"
                />
              </div>

              <div className="flex items-end justify-end gap-3 print:hidden">
                <button
                  type="button"
                  onClick={() => exportToExcel(rows, reportDate)}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition shadow-sm cursor-pointer"
                >
                  <Download size={16} /> Export Draft
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition shadow-sm cursor-pointer"
                >
                  <Printer size={16} /> Print / PDF
                </button>
              </div>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-3 mb-4 print:hidden">
              <p role="status" className={`text-xs font-semibold ${storageError ? 'text-rose-700' : 'text-emerald-700'}`}>{storageError ? 'Auto-save unavailable. Is tab ko close karne se pehle report save/export karein.' : draftStatus}</p>
              {editingReport && <button type="button" onClick={cancelEdit} disabled={saving} className="text-xs font-bold text-rose-700 bg-rose-50 px-3 py-2 rounded-lg">Cancel Edit</button>}
            </div>
            {editingReport && <p className="mb-4 text-sm font-semibold text-violet-800">Editing saved report • {reportDate}</p>}
            <SummaryCards entries={rows.filter(row => row.machineName.trim())} label={`Current ${editingReport ? 'edit' : 'draft'} • ${reportDate} • unsaved changes`} />
            <fieldset disabled={saving} className="min-w-0">
            <div className="overflow-x-auto border border-slate-200 rounded-lg mb-6">
              <table className="color-table entry-table w-full text-left text-xs border-collapse min-w-[1250px] print:min-w-full">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase">
                  <tr>
                    <th className="p-2 border-r text-center w-12">SL. NO.</th>
                    <th className="p-2 border-r w-36">Machine Name</th>
                    <th className="p-2 border-r w-28">Section</th>
                    <th className="p-2 border-r w-24">Shift</th>
                    <th className="p-2 border-r w-48">Break Down Details</th>
                    <th className="p-2 border-r w-44">Root Cause</th>
                    <th className="p-2 border-r w-48">Corrective Action</th>
                    <th className="p-2 border-r text-center w-24">Start Time</th>
                    <th className="p-2 border-r text-center w-24">End Time</th>
                    <th className="p-2 border-r text-center w-24">Down Time (Hrs)</th>
                    <th className="p-2 border-r text-center w-24">Man Power</th>
                    <th className="p-2 border-r w-36">Spares Used</th>
                    <th className="p-2 text-center w-12 print:hidden">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="p-2 text-center font-bold text-slate-500 border-r">{idx + 1}</td>
                      <td className="p-2 border-r">
                        <input
                          type="text"
                          required
                          aria-label={`Machine name row ${idx + 1}`}
                          placeholder="Machine..."
                          value={row.machineName}
                          onChange={(e) => handleRowChange(idx, 'machineName', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      </td>
                      <td className="p-2 border-r"><input type="text" aria-label={`Section row ${idx + 1}`} placeholder="Section..." value={row.section || ''} onChange={e => handleRowChange(idx, 'section', e.target.value)} className="w-full border rounded px-2 py-1 text-xs outline-none" /></td>
                      <td className="p-2 border-r text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-label={`Night shift for row ${idx + 1}`}
                          aria-checked={row.shift === 'N'}
                          title="Click to switch between Day and Night shift"
                          onClick={() => handleRowChange(idx, 'shift', row.shift === 'D' ? 'N' : 'D')}
                          className={`shift-toggle print:hidden ${row.shift === 'D' ? 'shift-day' : 'shift-night'}`}
                        >
                          {row.shift}
                        </button>
                        <span className="hidden print:inline font-bold">{row.shift}</span>
                      </td>
                      <td className="p-2 border-r">
                        <textarea
                          rows={2}
                          placeholder="Issue..."
                          value={row.breakdownDetails}
                          onChange={(e) => handleRowChange(idx, 'breakdownDetails', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs outline-none resize-none"
                        />
                      </td>
                      <td className="p-2 border-r">
                        <textarea
                          rows={2}
                          placeholder="Why..."
                          value={row.rootCause}
                          onChange={(e) => handleRowChange(idx, 'rootCause', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs outline-none resize-none"
                        />
                      </td>
                      <td className="p-2 border-r">
                        <textarea
                          rows={2}
                          placeholder="Action..."
                          value={row.correctiveAction}
                          onChange={(e) => handleRowChange(idx, 'correctiveAction', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs outline-none resize-none"
                        />
                      </td>
                      <td className="p-2 border-r">
                        <input
                          type="time"
                          value={row.startTime}
                          onChange={(e) => handleRowChange(idx, 'startTime', e.target.value)}
                          className="w-full border rounded px-1 py-1 text-xs outline-none"
                        />
                      </td>
                      <td className="p-2 border-r">
                        <input
                          type="time"
                          value={row.endTime}
                          onChange={(e) => handleRowChange(idx, 'endTime', e.target.value)}
                          className="w-full border rounded px-1 py-1 text-xs outline-none"
                        />
                      </td>
                      <td className="p-2 border-r text-center font-bold bg-slate-50 text-red-600">{row.downTimeHours}</td>
                      <td className="p-2 border-r">
                        <input
                          type="number"
                          min="0"
                          value={row.manpowerUsed}
                          onChange={(e) => handleRowChange(idx, 'manpowerUsed', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs text-center outline-none"
                        />
                      </td>
                      <td className="p-2 border-r">
                        <input
                          type="text"
                          placeholder="Spares..."
                          value={row.sparesUsed}
                          onChange={(e) => handleRowChange(idx, 'sparesUsed', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs outline-none"
                        />
                      </td>
                      <td className="p-2 text-center print:hidden">
                        <button
                          type="button"
                          disabled={rows.length === 1}
                          onClick={() => removeRow(idx)}
                          className="text-red-500 hover:text-red-700 disabled:opacity-30 cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                    <td colSpan={9} className="p-3 text-right pr-4 text-sm">Total</td>
                    <td className="p-3 text-center border-x text-sm text-blue-700 bg-blue-50">{totalDownTime}</td>
                    <td className="p-3 text-center border-r text-sm text-blue-700 bg-blue-50">{totalManPower}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium px-4 py-2 rounded-lg text-sm transition border border-slate-300 cursor-pointer"
              >
                <Plus size={16} /> Add Breakdown Row
              </button>

              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition shadow-md disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 size={18} /> {saving ? 'Saving...' : editingReport ? 'Update Report' : 'Submit Daily Report'}
              </button>
            </div>
            </fieldset>
            <TenDayBreakdownChart />
          </form>
        )}

        {activeTab === 'history' && (
          <section className="history-panel rounded-2xl border border-violet-200 p-4 sm:p-6 shadow-md print:shadow-none print:border-none">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 print:hidden">
              <div>
                <h2 className="text-xl font-bold text-violet-900 flex items-center gap-2"><CalendarDays size={22} /> Breakdown History</h2>
                <p className="text-sm text-fuchsia-700 mt-1">Search machines, filter shifts, or choose a date to open reports</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label="Filter history by date"
                  type="date"
                  value={filterDate}
                  onChange={(e) => { setFilterDate(e.target.value); setOpenHistoryDate(e.target.value || null); }}
                  className="w-40 border border-violet-200 bg-white rounded-lg px-2 py-2 text-xs text-violet-800 font-semibold outline-none focus:ring-2 focus:ring-violet-400"
                />
                <input type="search" aria-label="Search history by machine name" placeholder="Search machine..." value={filterMachine} onChange={e => setFilterMachine(e.target.value)} className="w-44 border border-sky-200 bg-white rounded-lg px-3 py-2 text-xs text-sky-900" />
                <select aria-label="Filter history by section" value={filterSection} onChange={e => setFilterSection(e.target.value)} className="border border-emerald-200 bg-white rounded-lg px-3 py-2 text-xs text-emerald-900"><option value="">All sections</option>{sectionOptions.map(section => <option key={section} value={section}>{section}</option>)}</select>
                <select aria-label="Filter history by shift" value={filterShift} onChange={e => setFilterShift(e.target.value)} className="border border-amber-200 bg-white rounded-lg px-3 py-2 text-xs text-amber-900"><option value="">All shifts</option><option value="D">D shift</option><option value="N">N shift</option></select>
                {(filterDate || filterMachine || filterSection || filterShift) && (
                  <button type="button" onClick={() => { setFilterDate(''); setFilterMachine(''); setFilterSection(''); setFilterShift(''); setOpenHistoryDate(null); }} className="text-xs font-semibold text-fuchsia-700 bg-fuchsia-100 px-3 py-2 rounded-lg">
                    Clear Filter
                  </button>
                )}
                <button type="button" onClick={() => fetchHistory()} aria-label="Refresh history" className="p-2 border border-violet-200 bg-white rounded-lg hover:bg-violet-100 text-violet-700">
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>

            {!loading && <>
              <SummaryCards entries={insightEntries} label={insightLabel} />
              <MachineAnalysis entries={insightEntries} label={insightLabel} />
            </>}
            {loading ? (
              <div className="py-12 text-center text-violet-600 font-medium">Loading reports...</div>
            ) : dateGroups.length === 0 ? (
              <div className="py-12 text-center text-fuchsia-600">
                <History size={48} className="mx-auto mb-3 opacity-50" />
                <p>Koi matching report nahi mila. Filters clear karke dekhein.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6 print:hidden">
                  {dateGroups.map((group, index) => (
                    <button
                      key={group.date}
                      type="button"
                      aria-expanded={openHistoryDate === group.date}
                      aria-controls="history-date-reports"
                      onClick={() => setOpenHistoryDate(openHistoryDate === group.date ? null : group.date)}
                      className={`date-card date-theme-${index % 6} ${openHistoryDate === group.date ? 'date-card-selected' : ''}`}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <CalendarDays size={20} />
                        <ChevronRight size={18} className={openHistoryDate === group.date ? 'rotate-90' : ''} />
                      </div>
                      <div className="text-lg font-extrabold mb-2">{group.date}</div>
                      <div className="flex flex-wrap gap-2 text-xs font-semibold">
                        <span className="date-card-badge">{group.reports.length} reports</span>
                        <span className="date-card-badge">{group.entries} breakdowns</span>
                      </div>
                      <p className="text-xs font-bold mt-3">Downtime: {group.downtime.toFixed(2)} hrs</p>
                    </button>
                  ))}
                </div>

                <div id="history-date-reports">
                  {selectedDateGroup ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap justify-between items-center gap-3 rounded-xl bg-white/80 border border-violet-200 p-3">
                        <h3 className="font-bold text-violet-900">Reports for {selectedDateGroup.date}</h3>
                        <button type="button" onClick={() => setOpenHistoryDate(null)} className="flex items-center gap-1 text-xs font-bold text-fuchsia-700 print:hidden"><ArrowLeft size={14} /> All dates</button>
                      </div>
                      {selectedDateGroup.reports.map((report, rIdx) => (
                        <article key={report._id || rIdx} className="rounded-xl overflow-hidden border border-sky-200 shadow-sm bg-white page-break-inside-avoid">
                          <div className="report-card-header px-4 py-3 flex flex-wrap justify-between items-center gap-3">
                            <div className="flex flex-wrap gap-3 items-center">
                              <span className="text-sm font-bold text-sky-900">Report {rIdx + 1}{(filterMachine || filterSection || filterShift) ? ' • matching rows' : ''}</span>
                              <span className="text-xs font-semibold text-rose-800 bg-rose-100 px-2 py-1 rounded-lg">Downtime: {Number(report.totalDownTime).toFixed(2)} hrs</span>
                              <span className="text-xs font-semibold text-amber-900 bg-amber-100 px-2 py-1 rounded-lg">Manpower: {report.totalManPower}</span>
                            </div>
                            <div className="flex items-center gap-2 print:hidden">
                              <button type="button" onClick={() => handleEditReport(report._id)} className="flex items-center gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white font-semibold px-3 py-2 rounded-lg"><Pencil size={14} /> Edit Full Report</button>
                              <button type="button" onClick={() => exportToExcel(report.entries, report.reportDate, report.shift)} className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-2 rounded-lg">
                                <Download size={14} /> Download Excel
                              </button>
                              <button type="button" onClick={() => handleDeleteReport(report._id)} className="p-2 text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-lg" title="Delete Record" aria-label={`Delete report ${rIdx + 1} for ${report.reportDate}`}><Trash2 size={16} /></button>
                            </div>
                          </div>
                          <div className="overflow-x-auto p-3">
                            <table className="color-table history-table w-full min-w-[950px] text-left text-xs border-collapse">
                              <thead>
                                <tr>
                                  <th className="p-2">#</th>
                                  <th className="p-2">Machine Name</th>
                                  <th className="p-2">Section</th>
                                  <th className="p-2">Shift</th>
                                  <th className="p-2">Details</th>
                                  <th className="p-2">Cause</th>
                                  <th className="p-2">Corrective Action</th>
                                  <th className="p-2 text-center">Time</th>
                                  <th className="p-2 text-center">Downtime</th>
                                  <th className="p-2 text-center">Manpower</th>
                                  <th className="p-2">Spares</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(report.entries || []).map((entry, eIdx) => (
                                  <tr key={eIdx}>
                                    <td className="p-2 font-bold">{eIdx + 1}</td>
                                    <td className="p-2 font-semibold">{entry.machineName || '-'}</td>
                                    <td className="p-2 font-semibold">{entry.section || '-'}</td>
                                    <td className="p-2 font-bold text-center">{entry.shift || report.shift || '-'}</td>
                                    <td className="p-2 max-w-[220px] whitespace-normal break-words">{entry.breakdownDetails || '-'}</td>
                                    <td className="p-2 max-w-[180px] whitespace-normal break-words">{entry.rootCause || '-'}</td>
                                    <td className="p-2 max-w-[180px] whitespace-normal break-words">{entry.correctiveAction || '-'}</td>
                                    <td className="p-2 text-center">{entry.startTime || '-'} – {entry.endTime || '-'}</td>
                                    <td className="p-2 text-center font-bold">{entry.downTimeHours} hrs</td>
                                    <td className="p-2 text-center font-semibold">{entry.manpowerUsed}</td>
                                    <td className="p-2">{entry.sparesUsed || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-violet-300 bg-white/60 p-8 text-center text-violet-700 print:hidden">Upar kisi date block par click karke reports dekhein.</div>
                  )}
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

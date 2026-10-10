import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Download,
  Printer,
  History,
  ClipboardList,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx';

const API_BASE_URL = 'http://localhost:5000/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('entry'); // 'entry' ya 'history'
  const [loading, setLoading] = useState(false);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [shift, setShift] = useState('Shift A');

  const [rows, setRows] = useState([
    {
      id: 1,
      machineId: '',
      machineName: '',
      bdNo: '',
      breakdownDetails: '',
      rootCause: '',
      correctiveAction: '',
      startTime: '',
      endTime: '',
      downTimeHours: 0,
      manpowerUsed: 0,
      sparesUsed: ''
    }
  ]);

  const [historyRecords, setHistoryRecords] = useState([]);
  const [filterDate, setFilterDate] = useState('');

  // Breakdown Reports Fetch Logic
  const fetchHistory = async (date = '') => {
    try {
      setLoading(true);
      const url = date ? `${API_BASE_URL}/reports?date=${date}` : `${API_BASE_URL}/reports`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch history');
      setHistoryRecords(data);
    } catch (err) {
      console.warn('API error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory(filterDate);
    }
  }, [activeTab, filterDate]);

  const calculateDownTime = (start, end) => {
    if (!start || !end) return 0;
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    let diffMinutes = endH * 60 + endM - (startH * 60 + startM);
    if (diffMinutes < 0) diffMinutes += 24 * 60;
    return Number((diffMinutes / 60).toFixed(2));
  };

  const handleRowChange = (index, field, value) => {
    const updatedRows = [...rows];
    updatedRows[index][field] = value;
    if (field === 'startTime' || field === 'endTime') {
      const start = field === 'startTime' ? value : updatedRows[index].startTime;
      const end = field === 'endTime' ? value : updatedRows[index].endTime;
      updatedRows[index].downTimeHours = calculateDownTime(start, end);
    }
    setRows(updatedRows);
  };

  const addRow = () => {
    setRows([
      ...rows,
      {
        id: Date.now(),
        machineId: '',
        machineName: '',
        bdNo: '',
        breakdownDetails: '',
        rootCause: '',
        correctiveAction: '',
        startTime: '',
        endTime: '',
        downTimeHours: 0,
        manpowerUsed: 0,
        sparesUsed: ''
      }
    ]);
  };

  const removeRow = (index) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const totalDownTime = rows.reduce((sum, r) => sum + (Number(r.downTimeHours) || 0), 0).toFixed(2);
  const totalManPower = rows.reduce((sum, r) => sum + (Number(r.manpowerUsed) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      reportDate,
      shift,
      entries: rows,
      totalDownTime: Number(totalDownTime),
      totalManPower: Number(totalManPower)
    };

    try {
      const res = await fetch(`${API_BASE_URL}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      alert('Report MongoDB Atlas me successfully save ho gaya!');
      // Form reset to fresh state
      setRows([
        {
          id: Date.now(),
          machineId: '',
          machineName: '',
          bdNo: '',
          breakdownDetails: '',
          rootCause: '',
          correctiveAction: '',
          startTime: '',
          endTime: '',
          downTimeHours: 0,
          manpowerUsed: 0,
          sparesUsed: ''
        }
      ]);
      setActiveTab('history');
    } catch (err) {
      alert('Save Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReport = async (reportId) => {
    if (!window.confirm('Kya aap is report record ko delete karna chahte hain?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/reports/${reportId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Delete failed');
      setHistoryRecords(historyRecords.filter((r) => r._id !== reportId));
      alert('Report record deleted!');
    } catch (err) {
      alert('Delete error: ' + err.message);
    }
  };

  const exportToExcel = (entries, dateStr, shiftStr) => {
    const formattedData = (entries || []).map((row, idx) => ({
      'SL. NO.': idx + 1,
      'DATE': dateStr,
      'SHIFT': shiftStr,
      'MACHINE I.D': row.machineId,
      'MACHINE NAME': row.machineName,
      'B/D. NO.': row.bdNo,
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
    XLSX.writeFile(workbook, `Breakdown_Report_${dateStr}_${shiftStr}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-16 font-sans">
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
              onClick={() => setActiveTab('entry')}
              className={`px-3 py-1.5 rounded-md font-medium text-xs transition ${
                activeTab === 'entry' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              New Report
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
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
        {activeTab === 'entry' && (
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-md border border-slate-200 p-6 print:shadow-none print:border-none">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6 pb-6 border-b border-slate-200">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Report Date</label>
                <input
                  type="date"
                  required
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Shift</label>
                <select
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium bg-white"
                >
                  <option value="Shift A">Shift A (Morning)</option>
                  <option value="Shift B">Shift B (Evening)</option>
                  <option value="Shift C">Shift C (Night)</option>
                  <option value="General Shift">General Shift</option>
                </select>
              </div>

              <div className="flex items-end justify-end gap-3 print:hidden">
                <button
                  type="button"
                  onClick={() => exportToExcel(rows, reportDate, shift)}
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

            <div className="overflow-x-auto border border-slate-200 rounded-lg mb-6">
              <table className="w-full text-left text-xs border-collapse min-w-[1250px] print:min-w-full">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase">
                  <tr>
                    <th className="p-2 border-r text-center w-12">SL. NO.</th>
                    <th className="p-2 border-r w-28">Machine I.D</th>
                    <th className="p-2 border-r w-36">Machine Name</th>
                    <th className="p-2 border-r w-24">B/D. No.</th>
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
                          placeholder="e.g. M-01"
                          value={row.machineId}
                          onChange={(e) => handleRowChange(idx, 'machineId', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      </td>
                      <td className="p-2 border-r">
                        <input
                          type="text"
                          required
                          placeholder="Machine..."
                          value={row.machineName}
                          onChange={(e) => handleRowChange(idx, 'machineName', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      </td>
                      <td className="p-2 border-r">
                        <input
                          type="text"
                          placeholder="BD-101"
                          value={row.bdNo}
                          onChange={(e) => handleRowChange(idx, 'bdNo', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs outline-none"
                        />
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
                disabled={loading}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition shadow-md disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 size={18} /> {loading ? 'Saving...' : 'Submit Daily Report'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 print:shadow-none print:border-none">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 print:hidden">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Historical Breakdown Records</h2>
                <p className="text-xs text-slate-500">Filter, inspect, and export previous days</p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none"
                />
                {filterDate && (
                  <button onClick={() => setFilterDate('')} className="text-xs text-blue-600 hover:underline">
                    Clear Filter
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fetchHistory(filterDate)}
                  className="p-2 border rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-500 font-medium">Loading reports...</div>
            ) : historyRecords.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <History size={48} className="mx-auto mb-2 opacity-50" />
                <p>Koi breakdown report record nahi mila.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {historyRecords.map((report, rIdx) => (
                  <div key={report._id || rIdx} className="border border-slate-200 rounded-lg overflow-hidden shadow-sm page-break-inside-avoid">
                    <div className="bg-slate-100 px-4 py-3 flex flex-wrap justify-between items-center gap-2 border-b border-slate-200">
                      <div>
                        <span className="font-bold text-slate-800 text-sm mr-3">Date: {report.reportDate}</span>
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded font-semibold">{report.shift}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-slate-600">
                          Total Hours: <span className="text-blue-600 font-bold">{report.totalDownTime} hrs</span> | Manpower: <span className="text-blue-600 font-bold">{report.totalManPower}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => exportToExcel(report.entries, report.reportDate, report.shift)}
                          className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-3 py-1.5 rounded transition cursor-pointer"
                        >
                          <Download size={14} /> Download Excel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteReport(report._id)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition cursor-pointer"
                          title="Delete Record"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Breakdown Entries Table for this report */}
                    <div className="overflow-x-auto p-3">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/50">
                            <th className="p-2">#</th>
                            <th className="p-2">Machine ID</th>
                            <th className="p-2">Machine Name</th>
                            <th className="p-2">BD No</th>
                            <th className="p-2">Details</th>
                            <th className="p-2">Cause</th>
                            <th className="p-2">Corrective Action</th>
                            <th className="p-2 text-center">Time</th>
                            <th className="p-2 text-center">Downtime</th>
                            <th className="p-2 text-center">Manpower</th>
                            <th className="p-2">Spares</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(report.entries || []).map((entry, eIdx) => (
                            <tr key={eIdx} className="hover:bg-slate-50">
                              <td className="p-2 text-slate-400 font-medium">{eIdx + 1}</td>
                              <td className="p-2 font-bold text-slate-700">{entry.machineId || '-'}</td>
                              <td className="p-2">{entry.machineName || '-'}</td>
                              <td className="p-2">{entry.bdNo || '-'}</td>
                              <td className="p-2 max-w-[200px] truncate" title={entry.breakdownDetails}>{entry.breakdownDetails || '-'}</td>
                              <td className="p-2 max-w-[150px] truncate" title={entry.rootCause}>{entry.rootCause || '-'}</td>
                              <td className="p-2 max-w-[150px] truncate" title={entry.correctiveAction}>{entry.correctiveAction || '-'}</td>
                              <td className="p-2 text-center">{entry.startTime} - {entry.endTime}</td>
                              <td className="p-2 text-center font-bold text-red-600">{entry.downTimeHours} hrs</td>
                              <td className="p-2 text-center">{entry.manpowerUsed}</td>
                              <td className="p-2">{entry.sparesUsed || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
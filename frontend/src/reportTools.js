export const DRAFT_KEY = 'breakdown-report-draft-v1';
export const EDIT_DRAFT_KEY = 'breakdown-report-edit-v1';

export function projectHomeUrl(currentUrl) {
  try {
    const url = new URL(currentUrl);
    return ['http:', 'https:'].includes(url.protocol) ? `${url.origin}/` : '';
  } catch { return ''; }
}

export const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const emptyRow = (id = Date.now()) => ({
  id, machineName: '', section: '', shift: 'D', breakdownDetails: '', rootCause: '',
  correctiveAction: '', startTime: '', endTime: '', downTimeHours: 0,
  manpowerUsed: 0, sparesUsed: ''
});

export const downtime = (start, end) => {
  if (!/^\d{2}:\d{2}$/.test(start || '') || !/^\d{2}:\d{2}$/.test(end || '')) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Number((((eh * 60 + em - sh * 60 - sm + 1440) % 1440) / 60).toFixed(2));
};

export const normaliseRows = (entries, fallbackShift = 'D') => entries.map((entry, index) => ({
  ...emptyRow(index + 1), ...entry, id: index + 1,
  shift: entry.shift === 'N' || (!entry.shift && fallbackShift === 'N') ? 'N' : 'D'
}));

export function readDraft(storage, key) {
  const raw = storage.getItem(key);
  if (!raw) return null;
  const draft = JSON.parse(raw);
  if (draft.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(draft.reportDate) ||
      !Array.isArray(draft.rows) || !draft.rows.length ||
      draft.rows.some(row => !row || typeof row !== 'object')) return null;
  if (key === EDIT_DRAFT_KEY && !draft.editingReport?._id) return null;
  return { ...draft, rows: normaliseRows(draft.rows) };
}

export function writeDraft(storage, key, draft) {
  storage.setItem(key, JSON.stringify({ ...draft, version: 1, savedAt: new Date().toISOString() }));
}

export function filterReports(reports, { date = '', machine = '', section = '', shift = '' } = {}) {
  const query = machine.trim().toLowerCase();
  return reports.map(report => ({
    ...report,
    entries: (report.entries || []).filter(entry =>
      (!date || (entry.entryDate || report.reportDate) === date) &&
      (!query || String(entry.machineName || '').toLowerCase().includes(query)) &&
      (!section || String(entry.section || '').trim() === section) &&
      (!shift || (entry.shift || report.shift) === shift)
    )
  })).filter(report => report.entries.length).map(report => ({
    ...report,
    totalDownTime: report.entries.reduce((sum, row) => sum + (Number(row.downTimeHours) || 0), 0),
    totalManPower: report.entries.reduce((sum, row) => sum + (Number(row.manpowerUsed) || 0), 0)
  }));
}

export function analyseEntries(entries) {
  const result = { count: entries.length, hours: 0, day: 0, night: 0, unassigned: 0, machines: [] };
  const machines = new Map();
  entries.forEach(entry => {
    const hours = Math.max(0, Number(entry.downTimeHours) || 0);
    result.hours += hours;
    result[entry.shift === 'D' ? 'day' : entry.shift === 'N' ? 'night' : 'unassigned'] += hours;
    const name = String(entry.machineName || '').trim() || 'Unnamed machine';
    const key = name.toLowerCase();
    if (!machines.has(key)) machines.set(key, { name, count: 0, hours: 0 });
    machines.get(key).count++;
    machines.get(key).hours += hours;
  });
  result.machines = [...machines.values()].sort((a, b) => b.hours - a.hours || b.count - a.count || a.name.localeCompare(b.name));
  return result;
}

// Include today and the preceding nine calendar dates, including zero-count days.
export function lastTenDays(reports, endDate = today()) {
  const end = new Date(`${endDate}T00:00:00Z`);
  const days = Array.from({ length: 10 }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - 9 + index);
    return { date: date.toISOString().slice(0, 10), count: 0 };
  });
  const byDate = new Map(days.map(day => [day.date, day]));
  reports.forEach(report => {
    if (!Array.isArray(report.entries)) return;
    report.entries.forEach(entry => {
      const day = byDate.get(entry.entryDate || report.reportDate);
      if (day) day.count++;
    });
  });
  return days;
}


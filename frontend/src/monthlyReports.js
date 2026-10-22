import { DRAFT_KEY, EDIT_DRAFT_KEY, normaliseRows, today } from './reportTools.js';

export const currentMonth = () => today().slice(0, 7);
export const monthLabel = month => new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
export const monthEnd = month => {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
};
export const monthDraftKey = (month, editing = false) => `${editing ? EDIT_DRAFT_KEY : DRAFT_KEY}:${month}`;
export const newMonthRow = month => ({ ...normaliseRows([{}])[0], id: globalThis.crypto.randomUUID(), entryDate: month === currentMonth() ? today() : `${month}-01` });
export const rowHasData = row => ['machineName', 'breakdownDetails', 'rootCause', 'correctiveAction', 'startTime', 'endTime', 'sparesUsed'].some(field => String(row[field] || '').trim()) || Number(row.manpowerUsed) > 0;

export function readMonthDraft(storage, month, onlyNew = false) {
  const keys = onlyNew ? [monthDraftKey(month)] : [monthDraftKey(month, true), monthDraftKey(month)];
  for (const key of keys) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    const draft = JSON.parse(raw);
    if (draft.version !== 2 || !Array.isArray(draft.rows) || draft.rows.some(row => !row || typeof row !== 'object')) throw new Error('Invalid draft');
    return { rows: normaliseRows(draft.rows).map(row => ({ ...row, entryDate: row.entryDate || `${month}-01` })), editingReport: draft.editingReport || null };
  }
  // Import the old daily draft without discarding its date or fields.
  for (const key of onlyNew ? [DRAFT_KEY] : [EDIT_DRAFT_KEY, DRAFT_KEY]) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    const draft = JSON.parse(raw);
    if (draft.version === 1 && draft.reportDate?.slice(0, 7) === month && Array.isArray(draft.rows)) {
      return { rows: normaliseRows(draft.rows).map(row => ({ ...row, entryDate: row.entryDate || draft.reportDate })), editingReport: draft.editingReport || null };
    }
  }
  return { rows: [], editingReport: null };
}

export function savedRows(reports) {
  return reports.flatMap(report => (report.entries || []).map((entry, index) => ({
    ...entry, entryDate: entry.entryDate || report.reportDate,
    shift: entry.shift || report.shift, key: `${report._id}:${index}`,
    reportId: report._id, createdAt: report.createdAt || '', rowIndex: index
  })));
}

export const newestFirst = rows => [...rows].sort((a, b) =>
  b.entryDate.localeCompare(a.entryDate) || Number(Boolean(b.draft)) - Number(Boolean(a.draft)) ||
  (b.createdAt || '').localeCompare(a.createdAt || '') || (a.rowIndex || 0) - (b.rowIndex || 0));

export function monthGroups(reports) {
  const groups = new Map();
  savedRows(reports).forEach(row => {
    const month = row.entryDate.slice(0, 7);
    if (!groups.has(month)) groups.set(month, { month, rows: [], hours: 0 });
    const group = groups.get(month);
    group.rows.push(row);
    group.hours += Number(row.downTimeHours) || 0;
  });
  return [...groups.values()].sort((a, b) => b.month.localeCompare(a.month)).map(group => ({ ...group, rows: newestFirst(group.rows) }));
}

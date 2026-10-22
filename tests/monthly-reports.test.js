import test from 'node:test';
import assert from 'node:assert/strict';
import { monthGroups, savedRows, newestFirst, monthEnd, monthDraftKey, readMonthDraft } from '../frontend/src/monthlyReports.js';
import { lastTenDays, filterReports, DRAFT_KEY } from '../frontend/src/reportTools.js';
import { reportPayload } from '../backend/reportPayload.js';

test('monthly register mixes legacy reports and per-row dates, newest first across years', () => {
  const reports = [
    { _id: 'old', reportDate: '2026-12-30', shift: 'D', entries: [{ machineName: 'Legacy', downTimeHours: 2 }] },
    { _id: 'new', reportDate: '2026-12-31', createdAt: '2026-12-31T10:00:00Z', entries: [
      { entryDate: '2026-12-29', machineName: 'Pump', downTimeHours: 1 },
      { entryDate: '2026-12-31', machineName: 'Motor', downTimeHours: 3 }
    ] },
    { _id: 'jan', reportDate: '2027-01-01', entries: [{ machineName: 'Next month', downTimeHours: 4 }] }
  ];
  const groups = monthGroups(reports);
  assert.deepEqual(groups.map(group => group.month), ['2027-01', '2026-12']);
  assert.equal(groups[1].hours, 6);
  assert.deepEqual(groups[1].rows.map(row => row.entryDate), ['2026-12-31', '2026-12-30', '2026-12-29']);
  assert.equal(groups[1].rows[1].shift, 'D');
  assert.equal(savedRows(reports).length, 4);
  assert.equal(filterReports(reports, { date: '2026-12-29' })[0].entries.length, 1);
  assert.equal(lastTenDays(reports, '2026-12-31').at(-3).count, 1);
  assert.equal(lastTenDays(reports, '2026-12-31').at(-1).count, 1);
});

test('newest date wins and a draft stays ahead of saved rows on the same day', () => {
  const result = newestFirst([
    { entryDate: '2026-10-21', key: 'older' },
    { entryDate: '2026-10-22', key: 'saved', createdAt: '2026-10-22T12:00:00Z' },
    { entryDate: '2026-10-22', key: 'draft', draft: true }
  ]);
  assert.deepEqual(result.map(row => row.key), ['draft', 'saved', 'older']);
});

test('month drafts restore independently, preserve row dates, and empty saved drafts do not resurrect old entries', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) };
  values.set(DRAFT_KEY, JSON.stringify({ version: 1, reportDate: '2026-10-21', rows: [{ machineName: 'Legacy draft' }] }));
  assert.equal(readMonthDraft(storage, '2026-10').rows[0].entryDate, '2026-10-21');
  assert.equal(readMonthDraft(storage, '2026-11').rows.length, 0);
  values.set(monthDraftKey('2026-10'), JSON.stringify({ version: 2, rows: [] }));
  assert.equal(readMonthDraft(storage, '2026-10').rows.length, 0);
  values.set(monthDraftKey('2026-10', true), JSON.stringify({ version: 2, rows: [{ entryDate: '2026-10-20', machineName: 'Edit' }], editingReport: { _id: '1' } }));
  assert.equal(readMonthDraft(storage, '2026-10').editingReport._id, '1');
  assert.equal(readMonthDraft(storage, '2026-10', true).rows.length, 0);
  values.set(monthDraftKey('2026-11'), '{');
  assert.throws(() => readMonthDraft(storage, '2026-11'));
});

test('calendar bounds and backend validation reject mixed months and impossible per-row dates', () => {
  assert.equal(monthEnd('2024-02'), '2024-02-29');
  assert.equal(monthEnd('2026-02'), '2026-02-28');
  assert.equal(monthEnd('2026-12'), '2026-12-31');
  const payload = { reportDate: '2026-10-22', shift: 'D', entries: [{ machineName: 'Pump', entryDate: '2026-10-21', downTimeHours: 1.5, manpowerUsed: 2 }], totalDownTime: 999 };
  assert.equal(reportPayload(payload).totalDownTime, 1.5);
  for (const date of ['2026-11-01', '2026-10-32', '', 123, '2026-02-30']) {
    assert.equal(reportPayload({ ...payload, entries: [{ ...payload.entries[0], entryDate: date }] }), null);
  }
});

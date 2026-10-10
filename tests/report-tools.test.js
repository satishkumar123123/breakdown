import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseEntries, filterReports, downtime, readDraft, writeDraft, DRAFT_KEY, EDIT_DRAFT_KEY, lastTenDays } from '../frontend/src/reportTools.js';

const entries = [
  { machineName: 'Pump', section: 'SMS', shift: 'D', downTimeHours: 2, manpowerUsed: 3 },
  { machineName: ' pump ', section: 'SMS', shift: 'N', downTimeHours: 1, manpowerUsed: 2 },
  { machineName: 'Motor', section: 'Mill', shift: 'D', downTimeHours: 4, manpowerUsed: 1 }
];
const reports = [
  { _id: '1', reportDate: '2026-10-10', shift: 'D / N', entries, totalDownTime: 7 },
  { _id: '2', reportDate: '2026-10-09', shift: 'N', entries: [{ machineName: 'Pump', downTimeHours: 3 }] }
];

test('last ten days count entries across reports, include gaps and exclude older/future dates', () => {
  const days = lastTenDays([
    ...reports,
    { reportDate: '2026-10-10', entries: [{}, {}] },
    { reportDate: '2026-10-01', entries: [{}] },
    { reportDate: '2026-09-30', entries: [{}, {}] },
    { reportDate: '2026-10-11', entries: [{}] },
    { reportDate: '2026-10-05' }
  ], '2026-10-10');
  assert.equal(days.length, 10);
  assert.deepEqual(days[0], { date: '2026-10-01', count: 1 });
  assert.deepEqual(days[9], { date: '2026-10-10', count: 5 });
  assert.equal(days[8].count, 1);
  assert.equal(days[4].count, 0);
  assert.equal(days.reduce((sum, day) => sum + day.count, 0), 7);
  assert.deepEqual(lastTenDays([], '2026-01-05').map(day => day.date), [
    '2025-12-27', '2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31',
    '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'
  ]);
  assert.equal(lastTenDays([], '2024-03-01')[8].date, '2024-02-29');
});

test('overnight and same-day downtime calculations', () => {
  assert.equal(downtime('23:30', '01:00'), 1.5);
  assert.equal(downtime('10:15', '11:00'), 0.75);
  assert.equal(downtime('', '11:00'), 0);
  assert.equal(downtime('10:00', '10:00'), 0);
});

test('combined date/machine/section/shift filters recalculate only matching entries', () => {
  const result = filterReports(reports, { date: '2026-10-10', machine: 'PUMP', section: 'SMS', shift: 'N' });
  assert.equal(result.length, 1);
  assert.equal(result[0].entries.length, 1);
  assert.equal(result[0].totalDownTime, 1);
  assert.equal(result[0].totalManPower, 2);
  assert.equal(reports[0].entries.length, 3);
  assert.deepEqual(filterReports(reports, { section: 'Missing' }), []);
  assert.equal(filterReports(reports, { date: '2026-10-09', shift: 'N' })[0]._id, '2');
});

test('analytics combine differently capitalised machine names and split shifts', () => {
  const result = analyseEntries(entries);
  assert.equal(result.count, 3);
  assert.equal(result.hours, 7);
  assert.equal(result.day, 6);
  assert.equal(result.night, 1);
  assert.deepEqual(result.machines, [{ name: 'Motor', count: 1, hours: 4 }, { name: 'Pump', count: 2, hours: 3 }]);
  assert.equal(analyseEntries([{ downTimeHours: 2, shift: 'Shift A' }]).unassigned, 2);
});

test('new and edit drafts restore independently with all row data intact', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  writeDraft(storage, DRAFT_KEY, { reportDate: '2026-10-10', rows: entries });
  writeDraft(storage, EDIT_DRAFT_KEY, { reportDate: '2026-10-09', rows: entries, editingReport: { _id: '2', updatedAt: '2026-10-10T12:00:00Z' } });
  assert.equal(readDraft(storage, DRAFT_KEY).rows[1].shift, 'N');
  assert.equal(readDraft(storage, DRAFT_KEY).rows[0].section, 'SMS');
  assert.equal(readDraft(storage, EDIT_DRAFT_KEY).editingReport._id, '2');
  values.delete(EDIT_DRAFT_KEY);
  assert.equal(readDraft(storage, EDIT_DRAFT_KEY), null);
  assert.equal(readDraft(storage, DRAFT_KEY).rows.length, 3);
  storage.setItem(DRAFT_KEY, '{');
  assert.throws(() => readDraft(storage, DRAFT_KEY));
  storage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, reportDate: '2026-10-10', rows: [] }));
  assert.equal(readDraft(storage, DRAFT_KEY), null);
  assert.throws(() => writeDraft({ setItem() { throw new Error('quota'); } }, DRAFT_KEY, {}), /quota/);
});

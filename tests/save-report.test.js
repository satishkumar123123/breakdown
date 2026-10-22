import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import app from '../backend/app.js';
import { requestApi, resolveApiBase } from '../frontend/src/api.js';

const require = createRequire(new URL('../backend/app.js', import.meta.url));
const mongoose = require('mongoose');

test('API URL supports same-domain and separately hosted backends', () => {
  assert.equal(resolveApiBase(), '/api');
  assert.equal(resolveApiBase('https://backend.example/'), 'https://backend.example/api');
  assert.equal(resolveApiBase('https://backend.example/api/'), 'https://backend.example/api');
});

test('client surfaces unavailable API, database error, and network failures', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>SPA</html>', {
    headers: { 'content-type': 'text/html' }
  }));
  await assert.rejects(requestApi('/reports'), /API available nahi/);
  globalThis.fetch = async () => Response.json({ error: 'Database unavailable' }, { status: 503 });
  await assert.rejects(requestApi('/reports'), /Database unavailable/);
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(requestApi('/reports'), /Backend se connection nahi hua/);
});

test('submit waits for DB, persists fields, and date-filtered history returns report', { timeout: 10000 }, async (t) => {
  const oldUri = process.env.MONGO_URI;
  const oldAlias = process.env.MONGODB_URI;
  t.after(() => {
    if (oldUri === undefined) delete process.env.MONGO_URI;
    else process.env.MONGO_URI = oldUri;
    if (oldAlias === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = oldAlias;
  });
  delete process.env.MONGO_URI;
  delete process.env.MONGODB_URI;
  let ready = false;
  const stateDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, get: () => ready ? 1 : 0 });
  t.after(() => {
    if (stateDescriptor) Object.defineProperty(mongoose.connection, 'readyState', stateDescriptor);
    else delete mongoose.connection.readyState;
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const payload = {
    reportDate: '2026-10-10', shift: 'D / N', totalDownTime: 2, totalManPower: 3,
    entries: [{ shift: 'N', machineName: 'Motor', startTime: '23:00',
      endTime: '01:00', downTimeHours: 2, manpowerUsed: 3, rootCause: 'Bearing',
      correctiveAction: 'Replaced bearing', sparesUsed: 'Bearing' },
      { shift: 'D', machineName: 'Pump', downTimeHours: 0, manpowerUsed: 0 }]
  };
  const post = body => fetch(`${url}/api/reports`, {
    signal: AbortSignal.timeout(3000), method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  assert.equal((await post(payload)).status, 503);

  process.env.MONGODB_URI = 'mongodb://test-only/breakdown';
  let attempts = 0;
  t.mock.method(mongoose, 'connect', async () => {
    attempts++;
    if (attempts === 1) throw new Error('Temporary connection failure');
    await new Promise(resolve => setTimeout(resolve, 25));
    ready = true;
  });
  assert.equal((await post(payload)).status, 503);

  const reports = [];
  const Model = mongoose.model('BreakdownReport');
  const Archive = mongoose.model('MonthArchive');
  const archives = new Map();
  t.mock.method(Archive, 'exists', async filter => archives.has(filter._id));
  t.mock.method(Archive, 'find', () => ({ lean: async () => [...archives.values()] }));
  t.mock.method(Archive, 'findOneAndUpdate', async (filter, update) => {
    if (!archives.has(filter._id)) archives.set(filter._id, { _id: filter._id, ...update.$setOnInsert });
    return archives.get(filter._id);
  });
  t.mock.method(Model, 'findById', id => ({ lean: async () => reports.find(report => String(report._id) === id) || null }));
  t.mock.method(Model.prototype, 'save', async function () {
    const report = this.toObject();
    reports.push(report);
    return this;
  });
  t.mock.method(Model, 'find', filter => ({ sort: () => ({ lean: async () =>
    reports.filter(report => !filter.$or || report.entries.some(entry => (entry.entryDate || report.reportDate) === filter.$or[0]['entries.entryDate']))
  }) }));
  const response = await post(payload);
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.ok(saved._id);
  assert.deepEqual(saved.entries, payload.entries);
  assert.deepEqual(saved.entries.map(entry => entry.shift), ['N', 'D']);
  assert.equal(saved.totalDownTime, 2);
  assert.equal(saved.totalManPower, 3);
  assert.equal(attempts, 2);
  const history = await fetch(`${url}/api/reports?date=2026-10-10`);
  assert.equal((await history.json())[0]._id, saved._id);
  const otherDate = await fetch(`${url}/api/reports?date=2026-10-09`);
  assert.deepEqual(await otherDate.json(), []);
  assert.equal((await post({ reportDate: '2026-10-10', shift: 'Shift A', entries: [] })).status, 400);
  assert.equal((await post({ ...payload, reportDate: '2026-02-30' })).status, 400);
  const initialTimestamp = '2026-10-10T12:00:00.000Z';
  reports[0].updatedAt = initialTimestamp;
  t.mock.method(Model, 'findOneAndUpdate', async (filter, update) => {
    const index = reports.findIndex(report => String(report._id) === filter._id &&
      (!filter.updatedAt || new Date(report.updatedAt).getTime() === filter.updatedAt.getTime()));
    if (index < 0) return null;
    reports[index] = { ...reports[index], ...update.$set, updatedAt: '2026-10-10T13:00:00.000Z' };
    return reports[index];
  });
  t.mock.method(Model, 'exists', async filter => reports.some(report => filter.reportDate
    ? new RegExp(filter.reportDate.$regex).test(report.reportDate) : String(report._id) === filter._id));
  const edit = (id, body) => fetch(`${url}/api/reports/${id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const editedPayload = { ...payload, reportDate: '2026-10-11', totalDownTime: 999, totalManPower: 999,
    entries: [{ ...payload.entries[0], section: 'Mill', downTimeHours: 1.5, manpowerUsed: 2 }], expectedUpdatedAt: initialTimestamp };
  const editResponse = await edit(saved._id, editedPayload);
  assert.equal(editResponse.status, 200);
  const edited = await editResponse.json();
  assert.equal(edited._id, saved._id);
  assert.equal(edited.totalDownTime, 1.5);
  assert.equal(edited.totalManPower, 2);
  assert.equal(edited.entries[0].section, 'Mill');
  assert.equal(reports.length, 1);
  assert.deepEqual(await (await fetch(`${url}/api/reports?date=2026-10-10`)).json(), []);
  assert.equal((await (await fetch(`${url}/api/reports?date=2026-10-11`)).json())[0]._id, saved._id);
  assert.equal((await edit(saved._id, editedPayload)).status, 409);
  assert.equal((await edit(saved._id, { ...editedPayload, entries: [{ machineName: '' }] })).status, 400);
  assert.equal((await edit(saved._id, { ...editedPayload, expectedUpdatedAt: 'bad timestamp' })).status, 400);
  assert.equal((await edit('bad-id', editedPayload)).status, 400);
  assert.equal((await edit('000000000000000000000000', editedPayload)).status, 404);
  assert.equal((await fetch(`${url}/api/health`)).status, 200);

  const multiDate = { ...payload, reportDate: '2026-10-22', entries: [
    { machineName: 'Pump', entryDate: '2026-10-21', shift: 'D', downTimeHours: 1 },
    { machineName: 'Motor', entryDate: '2026-10-22', shift: 'N', downTimeHours: 2 }
  ] };
  assert.equal((await post(multiDate)).status, 201);
  assert.equal((await (await fetch(`${url}/api/reports?date=2026-10-21`)).json()).length, 1);
  assert.equal((await post({ ...multiDate, entries: [{ ...multiDate.entries[0], entryDate: '2026-11-01' }] })).status, 400);
  assert.equal((await post({ ...multiDate, entries: [{ ...multiDate.entries[0], entryDate: '2026-10-32' }] })).status, 400);
  const archive = month => fetch(`${url}/api/report-months/${month}/archive`, { method: 'POST' });
  assert.equal((await archive('2026-13')).status, 400);
  assert.equal((await archive('2026-11')).status, 400);
  const closed = await (await archive('2026-10')).json();
  assert.equal(closed.month, '2026-10');
  assert.equal((await (await archive('2026-10')).json()).archivedAt, closed.archivedAt);
  const monthly = await (await fetch(`${url}/api/reports?view=monthly`)).json();
  assert.deepEqual(monthly.archivedMonths, ['2026-10']);
  assert.equal(monthly.reports.length, 2, 'archiving never removes or duplicates reports');
  assert.equal((await post(multiDate)).status, 409, 'closed months reject additional submissions');
  assert.equal((await post({ ...payload, reportDate: '2026-11-01' })).status, 201, 'next month remains open');
  assert.equal((await edit(saved._id, { ...editedPayload, reportDate: '2026-11-01', expectedUpdatedAt: '2026-10-10T13:00:00.000Z' })).status, 400, 'editing cannot move an archived record to another month');
  assert.equal((await edit(saved._id, { ...editedPayload, expectedUpdatedAt: '2026-10-10T13:00:00.000Z' })).status, 200, 'archived reports can still be corrected within their month');
  assert.equal(reports.length, 3);
});


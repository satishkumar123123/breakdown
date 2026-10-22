export const validMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function reportPayload(body = {}) {
  const { reportDate, shift, entries } = body;
  if (!validDate(reportDate) || typeof shift !== 'string' || !shift.trim() ||
      !Array.isArray(entries) || !entries.length) return null;
  const month = reportDate.slice(0, 7);
  if (entries.some(entry => !entry || typeof entry.machineName !== 'string' || !entry.machineName.trim() ||
      !validDate(entry.entryDate ?? reportDate) || (entry.entryDate ?? reportDate).slice(0, 7) !== month ||
      !Number.isFinite(Number(entry.downTimeHours ?? 0)) || Number(entry.downTimeHours ?? 0) < 0 ||
      !Number.isFinite(Number(entry.manpowerUsed ?? 0)) || Number(entry.manpowerUsed ?? 0) < 0)) return null;
  // Legacy clients may omit entryDate; readers fall back to reportDate for those rows.
  return {
    reportDate, shift, entries,
    totalDownTime: Number(entries.reduce((sum, entry) => sum + Number(entry.downTimeHours || 0), 0).toFixed(2)),
    totalManPower: entries.reduce((sum, entry) => sum + Number(entry.manpowerUsed || 0), 0)
  };
}

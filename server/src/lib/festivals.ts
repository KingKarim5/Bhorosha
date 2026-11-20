// Festival calendar for Bangladesh (approximate dates; moon-sighting can shift Eid by a day).
// Used for festival seasonality: a festival spike is not growth, and the lean week after it is not a warning.

export interface Festival {
  name: string;
  start: string; // YYYY-MM-DD, first day of the shopping rush
  end: string; // last day of the rush (the festival day itself)
  lift: number; // typical multiplier on online and gift sales during the rush
}

export const FESTIVALS: Festival[] = [
  { name: 'Eid ul-Fitr 2025', start: '2025-03-20', end: '2025-03-31', lift: 2.0 },
  { name: 'Eid ul-Adha 2025', start: '2025-05-28', end: '2025-06-07', lift: 1.5 },
  { name: 'Durga Puja 2025', start: '2025-09-24', end: '2025-10-02', lift: 1.3 },
  { name: 'Pohela Boishakh 2026', start: '2026-04-07', end: '2026-04-14', lift: 1.3 },
  { name: 'Eid ul-Fitr 2026', start: '2026-03-09', end: '2026-03-20', lift: 2.0 },
  { name: 'Eid ul-Adha 2026', start: '2026-05-17', end: '2026-05-27', lift: 1.5 },
  { name: 'Durga Puja 2026', start: '2026-10-12', end: '2026-10-20', lift: 1.3 },
  { name: 'Eid ul-Fitr 2027', start: '2027-02-27', end: '2027-03-10', lift: 2.0 },
  { name: 'Pohela Boishakh 2027', start: '2027-04-07', end: '2027-04-14', lift: 1.3 },
];

const t = (s: string) => new Date(s + 'T00:00:00Z').getTime();

export function festivalLift(d: Date): number {
  const x = d.getTime();
  for (const f of FESTIVALS) if (x >= t(f.start) && x <= t(f.end) + 86400000 - 1) return f.lift;
  return 1;
}

/** Share of a [start, end) window that falls inside festival rush days, weighted by lift (1 = no festival). */
export function windowLift(start: Date, days: number): number {
  let sum = 0;
  for (let i = 0; i < days; i++) sum += festivalLift(new Date(start.getTime() + i * 86400000));
  return sum / days;
}

/** True when the window starts within 10 days after a festival ends (the post-festival lull). */
export function isPostFestival(start: Date): boolean {
  const x = start.getTime();
  return FESTIVALS.some((f) => x > t(f.end) && x - t(f.end) <= 10 * 86400000);
}

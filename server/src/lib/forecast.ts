import { seasonalIndex } from './seasonal';
import { calMonth, quantile, addMonths } from './util';
import { windowLift, isPostFestival } from './festivals';

// Seasonal forecasting watchman (component 5).
// Method: divide out the business-type seasonal index, run Holt's damped linear smoothing on the
// adjusted series, put the season back, and form an 80% interval from the empirical quantiles of
// one-step-ahead forecast ratios (actual / forecast) on the shop's own history.

export interface Point {
  month: string;
  value: number;
}
export interface ForecastBand {
  month: string;
  low: number;
  mid: number;
  high: number;
}

export function holtForecast(adj: number[], alpha = 0.5, beta = 0.15, phi = 0.9) {
  if (!adj.length) return { next: 0, oneStep: [] as number[] };
  let level = adj[0];
  let trend = adj.length > 1 ? (adj[Math.min(2, adj.length - 1)] - adj[0]) / Math.min(2, adj.length - 1) : 0;
  const oneStep: number[] = [NaN];
  for (let i = 1; i < adj.length; i++) {
    const pred = level + phi * trend;
    oneStep.push(pred);
    const newLevel = alpha * adj[i] + (1 - alpha) * pred;
    trend = beta * (newLevel - level) + (1 - beta) * phi * trend;
    level = newLevel;
  }
  return { next: Math.max(0, level + phi * trend), oneStep };
}

export function forecastNext(history: Point[], businessType: string, seasonal: boolean, useSeason = true): ForecastBand {
  const next = addMonths(history[history.length - 1].month, 1);
  const idx = (m: string) => (seasonal && useSeason ? seasonalIndex(businessType, calMonth(m), true) : 1);
  const adj = history.map((p) => p.value / idx(p.month));
  const { next: nAdj, oneStep } = holtForecast(adj);
  const mid = nAdj * idx(next);
  const ratios: number[] = [];
  for (let i = 3; i < adj.length; i++) if (oneStep[i] > 0) ratios.push(adj[i] / oneStep[i]);
  let qLo = ratios.length >= 4 ? quantile(ratios, 0.1) : 0.8;
  let qHi = ratios.length >= 4 ? quantile(ratios, 0.9) : 1.2;
  // minimum width, wider with short history or when the seasonal prior is borrowed from the business type
  const minHalf = 0.12 + (history.length < 6 ? 0.1 : 0) + (seasonal ? 0.06 : 0);
  qLo = Math.min(qLo, 1 - minHalf);
  qHi = Math.max(qHi, 1 + minHalf);
  return { month: next, low: Math.round(mid * qLo), mid: Math.round(mid), high: Math.round(mid * qHi) };
}

/** A fixed-threshold baseline: alarm when a month falls more than 30% below the previous month. */
export function fixedThresholdFlag(prev: number, actual: number, drop = 0.3) {
  return prev > 0 && actual < prev * (1 - drop);
}

export type FlagSeverity = 'watch' | 'call' | 'no_data' | null;

/**
 * Classify the newest month. One month below the band is a watch, two in a row a call.
 * A missed check-in is no data (not distress); two missed months in a row escalate to a call.
 */
export function classify(belowStreak: number, missedStreak: number): FlagSeverity {
  if (missedStreak >= 2) return 'call';
  if (missedStreak === 1) return 'no_data';
  if (belowStreak >= 2) return 'call';
  if (belowStreak === 1) return 'watch';
  return null;
}

// ---------- weekly cadence (hybrid / digital_first) ----------

export interface WeekPoint {
  start: Date;
  value: number;
}

/**
 * Weekly forecast with festival seasonality: divide each week by its expected festival lift (on the online
 * share), smooth, put the next week's lift back. A festival spike is not growth; the lull just after a
 * festival gets a wider downside, so a quiet post-Eid week is not a warning.
 */
export function forecastNextWeek(history: WeekPoint[], onlineShare: number, nextStart: Date): ForecastBand {
  const lift = (d: Date) => 1 + onlineShare * (windowLift(d, 7) - 1);
  const adj = history.map((p) => p.value / lift(p.start));
  const { next, oneStep } = holtForecast(adj, 0.35, 0.05, 0.85);
  const mid = next * lift(nextStart);
  const ratios: number[] = [];
  for (let i = 4; i < adj.length; i++) if (oneStep[i] > 0) ratios.push(adj[i] / oneStep[i]);
  // weekly sales are noisier than monthly: flag against a wider band (5th percentile) so a healthy shop
  // is not flagged for one ordinary quiet week
  let qLo = ratios.length >= 6 ? quantile(ratios, 0.05) : 0.7;
  let qHi = ratios.length >= 6 ? quantile(ratios, 0.95) : 1.3;
  qLo = Math.min(qLo, 0.75);
  qHi = Math.max(qHi, 1.2);
  if (isPostFestival(nextStart)) qLo *= 0.7;
  return { month: nextStart.toISOString().slice(0, 10), low: Math.round(mid * qLo), mid: Math.round(mid), high: Math.round(mid * qHi) };
}

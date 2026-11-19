import fs from 'fs';
import { config } from '../config';
import type { Verdict } from './rules';

// Loads the gradient-boosting model exported by ml/train.py as JSON and evaluates it in TypeScript.
// DECISIONS.md: JSON export instead of ONNX, so there is no native runtime to install. If the file is
// missing or fails its self-check, the app runs rules-only.

interface Tree {
  feature: number[];
  threshold: number[];
  left: number[];
  right: number[];
  value: number[];
}
export interface ModelFile {
  version: string;
  trained_at: string;
  feature_names: string[];
  gbm: { init: number; learning_rate: number; trees: Tree[] };
  calibration: { x: number[]; y: number[] };
  conformal: { alpha: number; qhat: number };
  band_half: number;
  medians: number[];
  selftest: { x: number[]; p: number }[];
}

let cached: ModelFile | null | undefined;
let loadError: string | null = null;

export function loadModel(force = false): ModelFile | null {
  if (cached !== undefined && !force) return cached;
  try {
    if (!fs.existsSync(config.modelPath)) {
      loadError = 'model file not found';
      cached = null;
      return null;
    }
    const m = JSON.parse(fs.readFileSync(config.modelPath, 'utf8')) as ModelFile;
    for (const t of m.selftest || []) {
      const p = predictProba(m, t.x);
      if (Math.abs(p - t.p) > 1e-4) throw new Error(`self-check failed (${p.toFixed(5)} vs ${t.p.toFixed(5)})`);
    }
    loadError = null;
    cached = m;
    return m;
  } catch (e) {
    loadError = (e as Error).message;
    cached = null;
    return null;
  }
}

export function modelStatus() {
  const m = loadModel();
  return { loaded: !!m, error: loadError, version: m?.version ?? null, trained_at: m?.trained_at ?? null };
}

function treeValue(t: Tree, x: number[]) {
  let i = 0;
  while (t.left[i] !== -1) i = x[t.feature[i]] <= t.threshold[i] ? t.left[i] : t.right[i];
  return t.value[i];
}

export function rawScore(m: ModelFile, x: number[]) {
  let s = m.gbm.init;
  for (const t of m.gbm.trees) s += m.gbm.learning_rate * treeValue(t, x);
  return s;
}

function isotonic(m: ModelFile, p: number) {
  const { x, y } = m.calibration;
  if (!x.length) return p;
  if (p <= x[0]) return y[0];
  if (p >= x[x.length - 1]) return y[y.length - 1];
  let lo = 0;
  let hi = x.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (x[mid] <= p) lo = mid;
    else hi = mid;
  }
  const w = x[hi] === x[lo] ? 0 : (p - x[lo]) / (x[hi] - x[lo]);
  return y[lo] + w * (y[hi] - y[lo]);
}

export function predictProba(m: ModelFile, x: number[]) {
  const p = 1 / (1 + Math.exp(-rawScore(m, x)));
  return isotonic(m, p);
}

/** Split-conformal prediction set. Score = 1 - p(true class); include a label when its score <= qhat. */
export function conformalSet(m: ModelFile, p: number): Verdict[] {
  const set: Verdict[] = [];
  if (1 - p <= m.conformal.qhat) set.push('viable');
  if (p <= m.conformal.qhat) set.push('not_viable');
  return set;
}

export function setToVerdict(set: Verdict[]): Verdict {
  return set.length === 1 ? set[0] : 'not_sure';
}

/** Per-feature effect: how much the probability moves when the feature is replaced by the cohort median. */
export function contributions(m: ModelFile, x: number[]) {
  const base = predictProba(m, x);
  return m.feature_names
    .map((name, i) => {
      const y = [...x];
      y[i] = m.medians[i];
      return { feature: name, effect: base - predictProba(m, y) };
    })
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
}

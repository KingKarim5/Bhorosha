import type { Txn } from './statement';
import { mulberry32 } from './util';

// A small isolation forest (Liu et al. 2008) over per-row features. Deterministic (fixed seed).

type Vec = number[];

function features(txns: Txn[]): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < txns.length; i++) {
    const t = txns[i];
    const prev = i > 0 ? txns[i - 1] : null;
    const balJump =
      prev && prev.balance_after_bdt != null && t.balance_after_bdt != null
        ? Math.log1p(Math.abs(prev.balance_after_bdt + (t.direction === 'in' ? 1 : -1) * t.amount_bdt - t.balance_after_bdt))
        : 0;
    out.push([
      Math.log1p(t.amount_bdt),
      t.direction === 'in' ? 1 : 0,
      t.date.getUTCDate() / 31,
      t.amount_bdt % 100 === 0 ? 1 : 0,
      balJump,
    ]);
  }
  return out;
}

interface Node {
  f?: number;
  s?: number;
  l?: Node;
  r?: Node;
  size: number;
}

function c(n: number) {
  if (n <= 1) return 0;
  return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
}

function build(data: Vec[], depth: number, maxDepth: number, rng: () => number): Node {
  if (depth >= maxDepth || data.length <= 1) return { size: data.length };
  const f = Math.floor(rng() * data[0].length);
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of data) {
    lo = Math.min(lo, v[f]);
    hi = Math.max(hi, v[f]);
  }
  if (lo === hi) return { size: data.length };
  const s = lo + rng() * (hi - lo);
  return {
    f,
    s,
    l: build(data.filter((v) => v[f] < s), depth + 1, maxDepth, rng),
    r: build(data.filter((v) => v[f] >= s), depth + 1, maxDepth, rng),
    size: data.length,
  };
}

function pathLen(v: Vec, n: Node, d: number): number {
  if (n.f === undefined) return d + c(n.size);
  return v[n.f] < n.s! ? pathLen(v, n.l!, d + 1) : pathLen(v, n.r!, d + 1);
}

export function isolationScores(txns: Txn[], trees = 60, sample = 128): number[] {
  if (txns.length < 20) return txns.map(() => 0);
  const X = features(txns);
  const rng = mulberry32(42);
  const psi = Math.min(sample, X.length);
  const maxDepth = Math.ceil(Math.log2(psi));
  const forest: Node[] = [];
  for (let t = 0; t < trees; t++) {
    const s: Vec[] = [];
    for (let i = 0; i < psi; i++) s.push(X[Math.floor(rng() * X.length)]);
    forest.push(build(s, 0, maxDepth, rng));
  }
  const cn = c(psi);
  return X.map((v) => {
    const avg = forest.reduce((a, tr) => a + pathLen(v, tr, 0), 0) / trees;
    return 2 ** (-avg / cn);
  });
}

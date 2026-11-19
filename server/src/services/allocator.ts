// Investor pool allocator (component 10, simulation only).
// Proposes a spread of a budget across listed cases that limits concentration and expected loss:
// weights proportional to the lower edge of each case's likelihood band, capped per loan by the
// investor's per-loan cap and the amount still open, filled by water-filling. Compared with a naive
// split that puts everything into the single case with the highest band.

export interface Listing {
  id: string;
  band_low: number; // %
  open_bdt: number;
}

export interface Allocation {
  id: string;
  amount_bdt: number;
}

const hhi = (amts: number[]) => {
  const t = amts.reduce((a, b) => a + b, 0);
  return t ? amts.reduce((a, b) => a + (b / t) ** 2, 0) : 0;
};
const expectedLoss = (alloc: Allocation[], listings: Listing[]) =>
  alloc.reduce((a, x) => a + x.amount_bdt * (1 - (listings.find((l) => l.id === x.id)?.band_low ?? 0) / 100), 0);

export function allocate(budget: number, listings: Listing[], capPerLoan: number, already: Record<string, number> = {}) {
  const room = (l: Listing) => Math.max(0, Math.min(l.open_bdt, capPerLoan - (already[l.id] || 0)));
  const active = listings.filter((l) => room(l) >= 1000);
  const alloc: Record<string, number> = Object.fromEntries(active.map((l) => [l.id, 0]));
  let left = budget;
  for (let iter = 0; iter < 20 && left >= 1000; iter++) {
    const open = active.filter((l) => room(l) - alloc[l.id] >= 1000);
    if (!open.length) break;
    const wsum = open.reduce((a, l) => a + l.band_low, 0);
    let used = 0;
    for (const l of open) {
      const share = Math.floor(((left * l.band_low) / wsum) / 1000) * 1000;
      const add = Math.min(share, room(l) - alloc[l.id]);
      alloc[l.id] += add;
      used += add;
    }
    if (used === 0) break;
    left -= used;
  }
  const proposal = Object.entries(alloc).filter(([, v]) => v > 0).map(([id, amount_bdt]) => ({ id, amount_bdt }));
  const best = [...active].sort((a, b) => b.band_low - a.band_low)[0];
  const naive = best ? [{ id: best.id, amount_bdt: Math.min(budget, room(best)) }] : [];
  return {
    proposal,
    unallocated_bdt: budget - proposal.reduce((a, x) => a + x.amount_bdt, 0),
    metrics: {
      concentration_hhi: Math.round(hhi(proposal.map((p) => p.amount_bdt)) * 100) / 100,
      naive_concentration_hhi: Math.round(hhi(naive.map((p) => p.amount_bdt)) * 100) / 100,
      expected_loss_bdt: Math.round(expectedLoss(proposal, listings)),
      naive_expected_loss_bdt: Math.round(expectedLoss(naive, listings)),
      cap_compliant: proposal.every((p) => p.amount_bdt + (already[p.id] || 0) <= capPerLoan),
    },
  };
}

// Same amortising schedule the server uses (server/src/lib/loanTerms.ts), for live calculators.
export function investorReturn(amount: number, tenor: number, ratePct: number) {
  if (!(amount > 0) || !(tenor > 0)) return { interest_bdt: 0, total_back_bdt: 0, monthly_bdt: 0 };
  const r = ratePct / 100 / 12;
  const pay = Math.round(r === 0 ? amount / tenor : (amount * r) / (1 - (1 + r) ** -tenor));
  let bal = amount;
  let interest = 0;
  for (let n = 1; n <= tenor; n++) {
    const i = Math.round(bal * r);
    interest += i;
    bal -= n === tenor ? bal : pay - i;
  }
  return { interest_bdt: interest, total_back_bdt: amount + interest, monthly_bdt: pay };
}

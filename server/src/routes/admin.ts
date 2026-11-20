import { Router } from 'express';
import { requireRole } from '../auth';
import { User, Shop, Application, Decision, Investor, Commitment, Policy, Control, LoanAccount } from '../models';

// Admin: every lender institution and every investor on the platform, read-only.
type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const r = Router();
const admin = requireRole('admin');

r.get('/admin/overview', admin, async (_req, res) => {
  const lenders = (await User.find({ role: 'lender' }).sort({ createdAt: 1 }).lean()) as Lean[];
  const shops = (await Shop.find({ cohort_flag: 'demo' }).select('lender funded').lean()) as Lean[];
  const apps = (await Application.find({ shop: { $in: shops.map((s) => s._id) } }).select('shop loan_ask_bdt').lean()) as Lean[];
  const decisions = (await Decision.find({ application: { $in: apps.map((a) => a._id) } }).sort({ createdAt: -1 }).select('application decision createdAt').lean()) as Lean[];
  const latest = new Map<string, Lean>();
  for (const d of decisions) if (!latest.has(String(d.application))) latest.set(String(d.application), d);
  const loans = (await LoanAccount.find().select('shop principal_bdt').lean()) as Lean[];
  const lenderRows = await Promise.all(
    lenders.map(async (l) => {
      const myShops = shops.filter((s) => String(s.lender) === String(l._id));
      const ids = new Set(myShops.map((s) => String(s._id)));
      const myApps = apps.filter((a) => ids.has(String(a.shop)));
      const dec = myApps.map((a) => latest.get(String(a._id))?.decision).filter(Boolean) as string[];
      const pol = (await Policy.findOne({ lender: l._id }).sort({ version: -1 }).select('version').lean()) as Lean | null;
      const ctl = (await Control.findOne({ key: `ai:${l._id}` }).lean()) as Lean | null;
      const myLoans = loans.filter((x) => ids.has(String(x.shop)));
      return {
        id: l._id, org_name: l.org_name || '—', name: l.display_name, email: l.email, apply_code: l.apply_code, joined: l.createdAt,
        cases: myApps.length, approved: dec.filter((x) => x === 'approved_with_conditions').length, held: dec.filter((x) => x === 'hold_need_evidence').length,
        declined: dec.filter((x) => x === 'declined_with_plan').length, funded: myLoans.length, funded_bdt: myLoans.reduce((a, x) => a + (x.principal_bdt || 0), 0),
        requested_bdt: myApps.reduce((a, x) => a + (x.loan_ask_bdt || 0), 0), policy_version: pol?.version ?? 1, ai_paused: !!ctl?.paused,
      };
    }),
  );
  const investors = (await Investor.find().lean()) as Lean[];
  const users = (await User.find({ _id: { $in: investors.map((i) => i.user) } }).select('email display_name createdAt').lean()) as Lean[];
  const commits = (await Commitment.find().select('investor amount_bdt').lean()) as Lean[];
  const investorRows = investors.map((i) => {
    const u = users.find((x) => String(x._id) === String(i.user));
    const mine = commits.filter((c) => String(c.investor) === String(i._id));
    return { id: i._id, name: u?.display_name || i.label, email: u?.email, joined: u?.createdAt, verification_status: i.verification_status, kyc_status: i.kyc?.status || null, nid_masked: i.kyc?.nid_masked || null, kyc_name: i.kyc?.name_en || null, commitments: mine.length, committed_bdt: mine.reduce((a, c) => a + (c.amount_bdt || 0), 0) };
  });
  res.json({
    totals: { lenders: lenderRows.length, investors: investorRows.length, cases: apps.length, funded_loans: loans.length, committed_bdt: commits.reduce((a, c) => a + (c.amount_bdt || 0), 0) },
    lenders: lenderRows, investors: investorRows,
  });
});

export default r;

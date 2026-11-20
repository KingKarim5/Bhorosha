import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {
  ALL_MODELS, User, Shop, Application, Transaction, Doc, CheckIn, CourierSettlement, OrderRecord, Decision, Investor, Commitment, InvestorVerification,
  LenderSettings, SimState, ShadowCase, AuditLog,
} from '../models';
import { DEMO_SHOPS, SIM_BASE_MONTH } from './demoShops';
import { generate } from './generator';
import { generateOnline } from './onlineGen';
import { courierToCsv, ordersToCsv } from '../lib/online';
import { CANNED } from './sampleDocs';
import { toCsv, parseStatementCsv } from '../lib/statement';
import { recompute } from '../services/casefile';
import { addMonths, mulberry32 } from '../lib/util';
import { config } from '../config';
import { loadModel } from '../lib/model';
import { ensureContract, openLoanAccount, getTerms } from '../services/loan';
import { ensureTenancy, DEMO_ORG } from '../tenancy';

export const DEMO_PASSWORD = 'bhorsha-demo';
export const DEMO_ACCOUNTS = [
  { role: 'lender', email: 'lender@demo.bd', display_name: 'Lender policy owner (demo)' },
  { role: 'investor', email: 'investor@demo.bd', display_name: 'Investor A (demo)' },
  { role: 'investor', email: 'newinvestor@demo.bd', display_name: 'New investor (demo, not yet verified)' },
];

const token = (slug: string) => crypto.createHash('sha256').update('bhorsha-owner-' + slug).digest('hex').slice(0, 20);

/**
 * Only one seed may run at a time, even across several server instances (Vercel can start two at once).
 * A second caller waits for the running seed to finish instead of seeding again. A lock older than
 * 3 minutes is treated as left over from a crashed run.
 */
export async function seedAll(log = console.log) {
  const locks = mongoose.connection.db!.collection<{ _id: string; at: Date }>('locks');
  const stale = new Date(Date.now() - 3 * 60 * 1000);
  await locks.deleteOne({ _id: 'seed', at: { $lt: stale } });
  try {
    await locks.insertOne({ _id: 'seed', at: new Date() });
  } catch {
    log('Another seed is running; waiting for it.');
    for (let i = 0; i < 120 && (await locks.findOne({ _id: 'seed' })); i++) await new Promise((r) => setTimeout(r, 1000));
    return;
  }
  try {
    await seedUnlocked(log);
  } finally {
    await locks.deleteOne({ _id: 'seed' });
  }
}

async function seedUnlocked(log: (m: string) => void) {
  loadModel(true);
  for (const M of ALL_MODELS) await (M as typeof User).deleteMany({});
  const hash = await bcrypt.hash(DEMO_PASSWORD, 8);
  const users: Record<string, InstanceType<typeof User>> = {};
  for (const a of DEMO_ACCOUNTS) users[a.email] = await User.create({ ...a, password_hash: hash, ...(a.role === 'lender' ? { org_name: DEMO_ORG, apply_code: 'demo' } : {}) });
  users.lender = users['lender@demo.bd'];
  users.investor = users['investor@demo.bd'];
  const extraInvestors = [];
  for (let i = 2; i <= 5; i++)
    extraInvestors.push(await User.create({ role: 'investor', email: `investor${i}@demo.bd`, display_name: `Investor ${'ABCDE'[i - 1]} (demo)`, password_hash: hash }));
  await LenderSettings.create({});
  await SimState.create({ key: `sim:${users.lender._id}`, month_index: 0, base_month: SIM_BASE_MONTH, day: `${SIM_BASE_MONTH}-01` });

  const stmtDir = path.join(config.seedDataDir, 'statements');
  fs.mkdirSync(stmtDir, { recursive: true });
  const apps: Record<string, InstanceType<typeof Application>> = {};

  for (const s of DEMO_SHOPS) {
    const shop = await Shop.create({
      label: s.label, business_type: s.business_type, months_trading: s.months_trading, owner_label: s.owner_label,
      token: token(s.slug), cohort_flag: 'demo', slug: s.slug, funded: s.status === 'funded', lender: users.lender._id,
      segment: s.segment, offline_share: s.offline_share, online_share: s.online_share,
    });
    const app = await Application.create({
      shop: shop._id, loan_ask_bdt: s.loan_ask_bdt, tenor_months: s.tenor_months, purpose: s.purpose, purpose_kind: s.purpose_kind,
      status: s.status, stated: s.stated, consent: true,
    });
    apps[s.slug] = app;
    const online = s.online ? generateOnline(s.online) : null;
    const rows = generate(online ? { ...s.gen, extraRows: online.walletCredits } : s.gen);
    if (online) {
      const onlineDir = path.join(config.seedDataDir, 'online');
      fs.mkdirSync(onlineDir, { recursive: true });
      fs.writeFileSync(path.join(onlineDir, `${s.slug}_courier.csv`), courierToCsv(online.settlements));
      fs.writeFileSync(path.join(onlineDir, `${s.slug}_orders.csv`), ordersToCsv(online.orders));
      await CourierSettlement.insertMany(online.settlements.map((r) => ({ ...r, shop: shop._id })));
      await OrderRecord.insertMany(online.orders.map((r) => ({ ...r, shop: shop._id })));
    }
    // Visible history goes through the CSV parser (the same path an uploaded statement takes).
    const visible = rows.filter((r) => !r.hidden);
    const csv = toCsv(visible);
    fs.writeFileSync(path.join(stmtDir, `${s.slug}.csv`), csv);
    const parsed = parseStatementCsv(csv).txns;
    const hidden = rows.filter((r) => r.hidden);
    await Transaction.insertMany([
      ...parsed.map((t) => ({ ...t, shop: shop._id, hidden_until_sim: 0 })),
      ...hidden.map((t) => ({ ...t, shop: shop._id, hidden_until_sim: t.hidden })),
    ]);
    for (const d of s.docs) {
      const ex = CANNED[d.sample_key] as Record<string, unknown>;
      const fc = (ex.field_confidences as Record<string, number>) || {};
      await Doc.create({
        shop: shop._id, application: app._id, kind: d.kind, sample_key: d.sample_key, extracted_json: ex, field_confidences: fc, read_by: 'demo_fallback',
      });
    }
    for (const [i, c] of (s.checkins || []).entries())
      await CheckIn.create({ shop: shop._id, month: addMonths(SIM_BASE_MONTH, i), sim_index: i + 1, ...c, revealed: false });
    const terms = await getTerms(users.lender._id);
    await ensureContract(app.toObject(), shop.toObject(), terms, s.contract || {});
    await recompute(app._id, { actor: 'seed', reason: 'initial seed' });
    if (s.status === 'funded') {
      // a funded loan whose AI decision was not an approval is an existing loan in the partner's book (Karim)
      const last = await Decision.findOne({ application: app._id }).sort({ createdAt: -1 });
      if (last && last.decision !== 'approved_with_conditions') {
        last.legacy_note = "Existing loan in the partner's book before Bhorsha (not approved by Bhorsha); monitored by the watchman.";
        await last.save();
      }
      // repayment account: the released amount (first tranche when the loan is released in parts), monthly from 10 November
      const principal = last?.decision === 'approved_with_conditions' && last.first_tranche_bdt ? last.first_tranche_bdt : s.loan_ask_bdt;
      const pr = (last?.pricing || {}) as { rebate_pct?: number; penalty_pts?: number };
      await openLoanAccount(app.toObject(), shop.toObject(), {
        principal, tenor: s.tenor_months, ratePct: terms.borrower_rate_pct, rebatePct: pr.rebate_pct ?? terms.rebate_default_pct, penaltyPts: pr.penalty_pts ?? terms.penalty_default_pts, firstDue: `${SIM_BASE_MONTH}-10`,
      });
    }
    log(`  seeded ${s.label}`);
  }

  // ---- investors (simulation) and commitments through the partner's pooled facility
  const invUsers = [users.investor, ...extraInvestors];
  const investors = [];
  for (const [i, u] of invUsers.entries())
    investors.push(
      await Investor.create({
        user: u._id, label: u.display_name, verification_status: 'verified', cap_per_loan_bdt: 50000, cap_total_bdt: 200000,
        kyc: { status: 'specimen_checked', read_by: 'seed', specimen: true, name_en: u.display_name, nid_masked: `••••••${String(1000 + i).slice(-4)}`, nid_type: 'smart_10', confirmed_at: new Date(), ec_verified: false },
      }),
    );
  await Investor.create({ user: users['newinvestor@demo.bd']._id, label: 'New investor (demo)', verification_status: 'not_started', cap_per_loan_bdt: 50000, cap_total_bdt: 200000 });
  for (const inv of investors)
    for (const step of ['identity', 'source_of_funds', 'risk_acknowledgement'])
      await InvestorVerification.create({ investor: inv._id, step, status: 'done', simulated_at: new Date(), dummy_value: 'DUMMY-0000' });
  const commits: [number, string, number][] = [
    [0, 'karim', 15000], [1, 'karim', 12000], [2, 'karim', 8000],
    [0, 'jahan', 10000], [2, 'jahan', 20000],
    [1, 'sultana', 50000], [3, 'sultana', 50000], [4, 'sultana', 30000],
  ];
  for (const [i, slug, amt] of commits) {
    await Commitment.create({ investor: investors[i]._id, application: apps[slug]._id, amount_bdt: amt });
    await Investor.updateOne({ _id: investors[i]._id }, { $inc: { committed_total_bdt: amt } });
    await Application.updateOne({ _id: apps[slug]._id }, { $inc: { funded_bdt: amt } });
  }

  // ---- shadow-mode history (SIMULATION, illustrative only)
  const rng = mulberry32(777);
  const types = ['tea_grocery', 'pharmacy', 'mobile_accessories', 'online_clothing', 'fish_trader', 'knitwear', 'tailoring', 'hardware'];
  const shadow = [];
  for (let i = 0; i < 80; i++) {
    const r = rng();
    const verdict = r < 0.5 ? 'viable' : r < 0.82 ? 'not_sure' : 'not_viable';
    const mid = verdict === 'viable' ? 80 + rng() * 15 : verdict === 'not_sure' ? 55 + rng() * 25 : 25 + rng() * 25;
    const decision = verdict === 'viable' ? (rng() < 0.9 ? 'approve' : 'ask_more') : verdict === 'not_sure' ? (rng() < 0.5 ? 'approve' : rng() < 0.6 ? 'ask_more' : 'decline') : rng() < 0.15 ? 'approve' : 'decline';
    const trading = rng() < mid / 100 + (rng() - 0.5) * 0.1;
    shadow.push({ lender: users.lender._id, label: `Synthetic shop ${String(i + 1).padStart(2, '0')}`, business_type: types[i % types.length], bhorsha_verdict: verdict, band_mid: Math.round(mid), manager_decision: decision, trading_12m: trading });
  }
  await ShadowCase.insertMany(shadow);
  await AuditLog.create({ actor: 'seed', action: 'seed:reset', redacted_payload_json: {}, output_json: { shops: DEMO_SHOPS.length }, mode: 'rules' });
  await ensureTenancy(); // admin account from ADMIN_EMAIL / ADMIN_PASSWORD, if set
  log('  investors, commitments, shadow cases seeded');
}

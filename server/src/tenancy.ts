import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, Shop, Application, Policy, Control, SimState, ShadowCase } from './models';

// Each lender is its own institution: its own cases, policy, AI controls, simulation clock and repayments.
// Investors see the approved listings of every lender. An admin sees every lender and investor.

type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const DEMO_LENDER_EMAIL = 'lender@demo.bd';
export const DEMO_ORG = 'Bhorsha Demo Lender';

export async function demoLender(): Promise<Lean | null> {
  return (await User.findOne({ email: DEMO_LENDER_EMAIL, role: 'lender' }).lean()) as Lean | null;
}

export function newApplyCode(org: string) {
  const base = org.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18) || 'lender';
  return `${base}-${crypto.randomBytes(2).toString('hex')}`;
}

/** The lender an owner applies to: the code in their link, or the demo lender for the plain /apply link. */
export async function lenderForCode(code?: string | null): Promise<Lean | null> {
  if (code) return (await User.findOne({ role: 'lender', apply_code: code }).lean()) as Lean | null;
  return demoLender();
}

/** Ids of the shops a lender owns. */
export async function lenderShopIds(lenderId: unknown) {
  return (await Shop.find({ lender: lenderId }).select('_id').lean()).map((s) => s._id);
}

/** The application with this id, only when it belongs to this lender; otherwise null (the route answers 404). */
export async function ownedApp(lenderId: unknown, appId: string): Promise<{ app: Lean; shop: Lean } | null> {
  if (!mongoose.isValidObjectId(appId)) return null;
  const app = (await Application.findById(appId).lean()) as Lean | null;
  if (!app) return null;
  const shop = (await Shop.findById(app.shop).lean()) as Lean | null;
  if (!shop || String(shop.lender) !== String(lenderId)) return null;
  return { app, shop };
}

export async function lenderOfApp(appId: unknown): Promise<unknown> {
  const app = (await Application.findById(appId).select('shop').lean()) as Lean | null;
  const shop = app ? ((await Shop.findById(app.shop).select('lender').lean()) as Lean | null) : null;
  return shop?.lender ?? null;
}

/**
 * Idempotent migration from the single shared workspace: data with no owner goes to the demo lender,
 * every lender gets an institution name and an application code, and the admin account is ensured.
 */
export async function ensureTenancy() {
  // the old unique index on policy version blocks per-lender versions
  await Policy.collection.dropIndex('version_1').catch(() => undefined);
  await Policy.syncIndexes().catch(() => undefined);
  const demo = await demoLender();
  if (demo) {
    const id = demo._id;
    await Shop.updateMany({ lender: { $exists: false } }, { $set: { lender: id } });
    await Policy.updateMany({ lender: { $exists: false } }, { $set: { lender: id } });
    await ShadowCase.updateMany({ lender: { $exists: false } }, { $set: { lender: id } });
    const ctl = await Control.findOne({ key: 'ai' });
    if (ctl && !(await Control.exists({ key: `ai:${id}` }))) await Control.updateOne({ _id: ctl._id }, { key: `ai:${id}` });
    const sim = await SimState.findOne({ key: 'sim' });
    if (sim && !(await SimState.exists({ key: `sim:${id}` }))) await SimState.updateOne({ _id: sim._id }, { key: `sim:${id}` });
    if (!demo.apply_code) await User.updateOne({ _id: id }, { apply_code: 'demo', org_name: demo.org_name || DEMO_ORG });
  }
  for (const u of (await User.find({ role: 'lender', $or: [{ apply_code: { $exists: false } }, { apply_code: null }] }).lean()) as Lean[]) {
    const org = u.org_name || `${u.display_name || 'New'} institution`.replace(/\s*\(lender\)/i, '');
    await User.updateOne({ _id: u._id }, { org_name: org, apply_code: newApplyCode(org) });
  }
  await ensureAdmin();
}

/** The admin account comes from ADMIN_EMAIL and ADMIN_PASSWORD (never from code). Without them there is no admin. */
export async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) return;
  const u = await User.findOne({ email });
  if (!u) {
    await User.create({ role: 'admin', email, display_name: 'Administrator', password_hash: await bcrypt.hash(password, 10) });
    return;
  }
  const same = await bcrypt.compare(password, u.password_hash || '');
  if (u.role !== 'admin' || !same) {
    u.set({ role: 'admin', password_hash: same ? u.password_hash : await bcrypt.hash(password, 10) });
    await u.save();
  }
}

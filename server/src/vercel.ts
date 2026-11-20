// Vercel entry: the same Express app as index.ts, run as one serverless function.
// The database connection, model and first seed are set up once per warm instance.
import type { Request, Response } from 'express';
import { connectDb } from './db';
import { createApp } from './app';
import { loadModel } from './lib/model';
import { Shop } from './models';
import { seedAll } from './seed/seed';
import { ensureTenancy } from './tenancy';

const app = createApp();
let ready: Promise<void> | null = null;

function init() {
  if (!ready)
    ready = (async () => {
      await connectDb();
      loadModel();
      if ((await Shop.countDocuments({ cohort_flag: 'demo' })) === 0) await seedAll(() => undefined);
      await ensureTenancy(); // per-lender workspaces and the admin account (idempotent)
    })().catch((e) => {
      ready = null; // try again on the next request
      throw e;
    });
  return ready;
}

export default async function handler(req: Request, res: Response) {
  try {
    await init();
  } catch (e) {
    res.status(503).json({ error: `Database not reachable: ${(e as Error).message}. Check MONGODB_URI in the Vercel project settings.` });
    return;
  }
  return app(req, res);
}

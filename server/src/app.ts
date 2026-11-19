import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import { config, aiKeyPresent } from './config';
import { attachUser } from './auth';
import { dbState } from './db';
import { modelStatus } from './lib/model';
import authRoutes from './routes/auth';
import caseRoutes from './routes/cases';
import watchRoutes from './routes/watch';
import investRoutes from './routes/invest';
import miscRoutes from './routes/misc';
import { BRAND } from './brand';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '6mb' }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get('/api/health', (_req, res) => {
    const db = dbState();
    res.status(db === 'connected' ? 200 : 503).json({
      ok: db === 'connected',
      version: config.version,
      db,
      model: modelStatus(),
      eval_file: fs.existsSync(config.evalPath),
      ai: { provider: config.aiProvider, model: config.aiProvider === 'gemini' ? config.geminiModel : config.aiModel, mode: aiKeyPresent() ? 'live' : 'demo_fallback' },
    });
  });
  app.get('/api/meta', (_req, res) => res.json({ brand: BRAND, ai_mode: aiKeyPresent() ? 'live' : 'demo_fallback', model: modelStatus(), version: config.version }));

  app.use('/api/auth', authRoutes);
  app.use('/api', caseRoutes);
  app.use('/api', watchRoutes);
  app.use('/api', investRoutes);
  app.use('/api', miscRoutes);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api error]', err.message);
    res.status(400).json({ error: err.message || 'Something went wrong' });
  });
  return app;
}

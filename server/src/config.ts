import os from 'os';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Repo root = one level above server/
export const ROOT = path.resolve(__dirname, '..', '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) dotenv.config({ path: envFile });
else dotenv.config();

function rootPath(p: string) {
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

export const config = {
  version: '0.1.0',
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bhorsha',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  cookieSameSite: (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'none' | 'strict',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  aiProvider: (process.env.AI_PROVIDER || 'anthropic') as 'anthropic' | 'gemini',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'claude-opus-5-5',
  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 45000),
  modelPath: rootPath(process.env.MODEL_PATH || 'ml/model/model.json'),
  evalPath: rootPath(process.env.EVAL_PATH || 'ml/model/eval.json'),
  // On Vercel the code folder is read-only: the seed writes its sample CSVs to the temp folder instead.
  seedDataDir: process.env.VERCEL ? path.join(os.tmpdir(), 'bhorsha-seed-data') : path.join(ROOT, 'server', 'seed-data'),
  committedSeedDataDir: path.join(ROOT, 'server', 'seed-data'),
};

export function aiKeyPresent() {
  return config.aiProvider === 'gemini' ? !!config.geminiKey : !!config.anthropicKey;
}

// npm run ai:check — one tiny request to the configured AI provider. Never prints the key.
import { config, aiKeyPresent } from '../config';
import { callJson } from '../services/ai';
import { z } from 'zod';
import { AuditLog } from '../models';

(async () => {
  const model = config.aiProvider === 'gemini' ? config.geminiModel : config.aiModel;
  console.log(`Provider: ${config.aiProvider} · model: ${model} · key set: ${aiKeyPresent() ? 'yes' : 'NO'}`);
  if (!aiKeyPresent()) {
    console.log(`Add ${config.aiProvider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY'} to .env and save the file.`);
    process.exit(1);
  }
  // audit logging needs the database; stub it so this check works on its own
  (AuditLog as unknown as { create: () => Promise<void> }).create = async () => undefined;
  const r = await callJson({
    task: 'check', system: 'Return only JSON.', user: 'Return {"ok": true, "lang": "bn"} and nothing else.',
    schema: z.object({ ok: z.boolean() }), fallback: () => ({ ok: false }),
  });
  if (r.mode === 'ai') console.log(`Live AI works (${r.latency_ms} ms).`);
  else {
    console.log(`AI call failed, the app would show DEMO FALLBACK. Reason: ${r.error}`);
    process.exit(1);
  }
})();

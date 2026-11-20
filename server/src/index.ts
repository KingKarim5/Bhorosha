import { config } from './config';
import { connectDb } from './db';
import { createApp } from './app';
import { loadModel, modelStatus } from './lib/model';
import { Shop } from './models';
import { seedAll } from './seed/seed';
import { ensureTenancy } from './tenancy';

(async () => {
  try {
    await connectDb();
  } catch (e) {
    console.error(`Could not connect to MongoDB at ${config.mongoUri}: ${(e as Error).message}`);
    console.error('Start mongod (or set MONGODB_URI) and try again.');
    process.exit(1);
  }
  loadModel();
  // A fresh start must never open empty.
  if ((await Shop.countDocuments({ cohort_flag: 'demo' })) === 0) {
    console.log('Empty database: seeding demo data...');
    await seedAll(() => undefined);
  }
  await ensureTenancy();
  const app = createApp();
  app.listen(config.port, () => {
    const m = modelStatus();
    console.log(`Bhorsha API on http://localhost:${config.port}  (model: ${m.loaded ? 'loaded' : 'rules-only, ' + m.error})`);
  });
})();

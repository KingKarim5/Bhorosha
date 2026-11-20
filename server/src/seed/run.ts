import { connectDb, disconnectDb } from '../db';
import { seedAll } from './seed';

(async () => {
  try {
    await connectDb();
    console.log('Seeding Bhorsha demo data (synthetic)...');
    await seedAll();
    console.log('Done. Logins: lender@demo.bd / investor@demo.bd / newinvestor@demo.bd, password bhorsha-demo');
  } catch (e) {
    console.error('Seed failed:', (e as Error).message);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
})();

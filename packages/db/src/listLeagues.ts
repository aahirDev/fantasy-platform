import 'dotenv/config';
import { getDb } from './client.js';
import { leagues } from './schema/index.js';
import { desc } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const rows = await db
    .select({ id: leagues.id, name: leagues.name, status: leagues.status })
    .from(leagues)
    .orderBy(desc(leagues.createdAt))
    .limit(10);

  if (rows.length === 0) {
    console.log('No leagues found. Create one in the app first.');
  } else {
    console.log('\nLeagues:\n');
    for (const r of rows) {
      console.log(`  ${r.id}  ${r.status.padEnd(20)}  ${r.name}`);
    }
    console.log('');
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

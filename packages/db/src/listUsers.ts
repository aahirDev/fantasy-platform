import 'dotenv/config';
import { getDb } from './client.js';
import { users } from './schema/index.js';
import { desc } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const rows = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(10);

  if (rows.length === 0) {
    console.log('No users yet. Sign in through the app first.');
  } else {
    console.log('\nUsers:\n');
    for (const r of rows) {
      console.log(`  ${r.id}  ${r.username ?? '—'}`);
    }
    console.log('');
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

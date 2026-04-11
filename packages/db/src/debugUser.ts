import 'dotenv/config';
import { getDb } from './client.js';
import { users, leagues, leagueMembers } from './schema/index.js';
import { eq, or } from 'drizzle-orm';

async function main() {
  const db = getDb();

  // Check aahir user
  const userRows = await db.select({
    id: users.id,
    username: users.username,
    email: users.email,
    supabaseUid: users.supabaseUid,
  }).from(users).where(or(eq(users.email, 'aahirgiri@gmail.com'), eq(users.username, 'aahir')));

  console.log('\n=== aahir user ===');
  for (const r of userRows) {
    console.log(JSON.stringify(r, null, 2));
  }
  if (userRows.length === 0) {
    console.log('NOT FOUND');
  }

  // Check leagues
  const leagueRows = await db.select({
    id: leagues.id,
    name: leagues.name,
    status: leagues.status,
    commissionerId: leagues.commissionerId,
  }).from(leagues);
  console.log('\n=== leagues ===');
  for (const r of leagueRows) console.log(JSON.stringify(r));

  // Check memberships
  if (userRows[0]) {
    const memberRows = await db.select().from(leagueMembers).where(eq(leagueMembers.userId, userRows[0].id));
    console.log(`\n=== memberships for ${userRows[0].username} ===`);
    for (const r of memberRows) console.log(JSON.stringify({ leagueId: r.leagueId, teamName: r.teamName }));

    if (leagueRows[0]) {
      const commMatch = leagueRows[0].commissionerId === userRows[0].id;
      console.log(`\ncommissionerId matches aahir.id: ${commMatch}`);
      console.log(`  league.commissionerId = ${leagueRows[0].commissionerId}`);
      console.log(`  aahir.id             = ${userRows[0].id}`);
    }
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

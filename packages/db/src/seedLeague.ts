/**
 * Seed the real ipl26a league from auctionipl2026.netlify.app
 *
 * Creates:
 *  - 12 users  (one per team owner, supabaseUid = "seed_<teamId>")
 *  - 1  league (IPL Fantasy 2026 — Auction, status ACTIVE)
 *  - 12 league members
 *  - squad_players rows (all players incl. transfers with rosterConfig)
 *  - captain_assignments (from captainHistory[0])
 *
 * Then prints the league ID so you can run:
 *   LEAGUE_ID=<id> pnpm --filter @fantasy/db import-matches
 *
 * Safe to re-run — deletes existing seeded data first (by supabaseUid prefix).
 */

import 'dotenv/config';
import { getDb } from './client.js';
import {
  users,
  leagues,
  leagueMembers,
  squadPlayers,
  captainAssignments,
  players,
} from './schema/index.js';
import { eq, inArray, like } from 'drizzle-orm';
import { normaliseName } from '@fantasy/scoring';

// ─── Source data (inlined from ipl26a:roster_config) ─────────────────────────

// Real Gmail addresses from ipl-fantasy-2026/public/js/config.js GOOGLE_EMAIL_MAP
const TEAM_EMAILS: Record<string, string> = {
  aahir:    'aahirgiri@gmail.com',
  raghav:   'raghavviswa@gmail.com',
  sreekesh: 'sreekeshkrish@gmail.com',
  sarath:   'sarathsree94@gmail.com',
  sajal:    'toshniwalsajal70@gmail.com',
  sandeep:  'sandeep.babu@furlenco.com',
  gaurav:   'grvarora3011@gmail.com',
  surender: 'chauhansurender1994@gmail.com',
  mayank:   'mayank.rathi18@gmail.com',
  ark:      'aswinravikumar26@gmail.com',
  gautam:   'gautistrong@gmail.com',
  chandira: 'kchandirasekaran007@gmail.com',
};

const TEAMS = [
  {
    id: 'raghav', owner: 'Raghav', name: "Raghav's XI",
    captain: 'Aiden Markram', vc: 'Rajat Patidar',
    players: [
      { name: 'Heinrich Klaasen',  fromMatch: 1,  toMatch: null },
      { name: 'Aiden Markram',     fromMatch: 1,  toMatch: null },
      { name: 'Rajat Patidar',     fromMatch: 1,  toMatch: null },
      { name: 'Karun Nair',        fromMatch: 1,  toMatch: null },
      { name: 'Marco Jansen',      fromMatch: 1,  toMatch: null },
      { name: 'Vipraj Nigam',      fromMatch: 1,  toMatch: null },
      { name: 'Mohammed Shami',    fromMatch: 1,  toMatch: null },
      { name: 'Bhuvneshwar Kumar', fromMatch: 1,  toMatch: null },
      { name: 'Sunil Narine',      fromMatch: 1,  toMatch: null },
      { name: 'Suyash Sharma',     fromMatch: 1,  toMatch: null },
      { name: 'Prashant Veer',     fromMatch: 1,  toMatch: null },
    ],
  },
  {
    id: 'sreekesh', owner: 'Sreekesh', name: "Sreekesh's XI",
    captain: 'Jasprit Bumrah', vc: 'Ravindra Jadeja',
    players: [
      { name: 'Rishabh Pant',        fromMatch: 1, toMatch: null },
      { name: 'Shimron Hetmyer',     fromMatch: 1, toMatch: null },
      { name: 'Sherfane Rutherford', fromMatch: 1, toMatch: null },
      { name: 'Liam Livingstone',    fromMatch: 1, toMatch: null },
      { name: 'Ravindra Jadeja',     fromMatch: 1, toMatch: null },
      { name: 'Marcus Stoinis',      fromMatch: 1, toMatch: null },
      { name: 'Nitish Kumar Reddy',  fromMatch: 1, toMatch: null },
      { name: 'Ramandeep Singh',     fromMatch: 1, toMatch: null },
      { name: 'Jasprit Bumrah',      fromMatch: 1, toMatch: null },
      { name: 'Ravi Bishnoi',        fromMatch: 1, toMatch: null },
      { name: 'Mayank Yadav',        fromMatch: 1, toMatch: null },
    ],
  },
  {
    id: 'sarath', owner: 'Sarath', name: "Sarath's XI",
    captain: 'Virat Kohli', vc: 'Riyan Parag',
    players: [
      { name: 'Virat Kohli',         fromMatch: 1,  toMatch: null },
      { name: 'David Miller',        fromMatch: 1,  toMatch: null },
      { name: 'Abhishek Porel',      fromMatch: 1,  toMatch: null },
      { name: 'Riyan Parag',         fromMatch: 1,  toMatch: null },
      { name: 'Will Jacks',          fromMatch: 1,  toMatch: null },
      { name: 'Harshal Patel',       fromMatch: 1,  toMatch: null },
      { name: 'Washington Sundar',   fromMatch: 1,  toMatch: null },
      { name: 'Pat Cummins',         fromMatch: 1,  toMatch: null },
      { name: 'Blessing Muzarabani', fromMatch: 1,  toMatch: null },
      { name: 'Vaibhav Arora',       fromMatch: 1,  toMatch: null },
      { name: 'Harpreet Brar',       fromMatch: 1,  toMatch: 12  },
      { name: 'Prince Yadav',        fromMatch: 13, toMatch: null },
    ],
  },
  {
    id: 'sajal', owner: 'Sajal', name: "Sajal's XI",
    captain: 'Shubman Gill', vc: 'Ishan Kishan',
    players: [
      { name: 'Ishan Kishan',    fromMatch: 1, toMatch: null },
      { name: 'Travis Head',     fromMatch: 1, toMatch: null },
      { name: 'Ajinkya Rahane', fromMatch: 1, toMatch: null },
      { name: 'Shubman Gill',   fromMatch: 1, toMatch: null },
      { name: 'Suryakumar Yadav', fromMatch: 1, toMatch: null },
      { name: 'Sam Curran',     fromMatch: 1, toMatch: 7    },
      { name: 'Deepak Chahar',  fromMatch: 1, toMatch: null },
      { name: 'Jaydev Unadkat', fromMatch: 1, toMatch: null },
      { name: 'Matt Henry',     fromMatch: 1, toMatch: null },
      { name: 'Lungisani Ngidi', fromMatch: 1, toMatch: null },
      { name: 'Shardul Thakur', fromMatch: 8, toMatch: null },
    ],
  },
  {
    id: 'sandeep', owner: 'Sandeep', name: "Sandeep's XI",
    captain: 'KL Rahul', vc: 'Shreyas Iyer',
    players: [
      { name: 'KL Rahul',              fromMatch: 1, toMatch: null },
      { name: 'Shreyas Iyer',          fromMatch: 1, toMatch: null },
      { name: 'Shashank Singh',        fromMatch: 1, toMatch: null },
      { name: 'Dewald Brevis',         fromMatch: 1, toMatch: null },
      { name: 'Aniket Verma',          fromMatch: 1, toMatch: null },
      { name: 'Prithvi Shaw',          fromMatch: 1, toMatch: null },
      { name: 'Mitchell Santner',      fromMatch: 1, toMatch: null },
      { name: 'Mitchell Starc',        fromMatch: 1, toMatch: null },
      { name: 'Ishant Sharma',         fromMatch: 1, toMatch: null },
      { name: 'Matheesha Pathirana',   fromMatch: 1, toMatch: null },
      { name: 'Ayush Badoni',          fromMatch: 1, toMatch: null },
    ],
  },
  {
    id: 'gaurav', owner: 'Gaurav', name: "Gaurav's XI",
    captain: 'Abhishek Sharma', vc: 'Prabhsimran Singh',
    players: [
      { name: 'Prabhsimran Singh',    fromMatch: 1,  toMatch: null },
      { name: 'Pathum Nissanka',      fromMatch: 1,  toMatch: null },
      { name: 'Angkrish Raghuvanshi', fromMatch: 1,  toMatch: null },
      { name: 'Pyla Avinash',         fromMatch: 1,  toMatch: null },
      { name: 'Abhishek Sharma',      fromMatch: 1,  toMatch: null },
      { name: 'Azmatullah Omarzai',   fromMatch: 1,  toMatch: 14  },
      { name: 'Krunal Pandya',        fromMatch: 1,  toMatch: null },
      { name: 'Shahbaz Ahmed',        fromMatch: 1,  toMatch: null },
      { name: 'Prasidh Krishna',      fromMatch: 1,  toMatch: null },
      { name: 'Mukesh Kumar',         fromMatch: 1,  toMatch: null },
      { name: 'Jacob Duffy',          fromMatch: 1,  toMatch: null },
      { name: 'Anukul Roy',           fromMatch: 15, toMatch: null },
    ],
  },
  {
    id: 'surender', owner: 'Surender', name: "Surender's XI",
    captain: 'Yashasvi Jaiswal', vc: 'Mitchell Marsh',
    players: [
      { name: 'MS Dhoni',             fromMatch: 1, toMatch: null },
      { name: 'Yashasvi Jaiswal',     fromMatch: 1, toMatch: null },
      { name: 'Glenn Phillips',       fromMatch: 1, toMatch: null },
      { name: 'Rahul Tripathi',       fromMatch: 1, toMatch: null },
      { name: 'Mitchell Marsh',       fromMatch: 1, toMatch: null },
      { name: 'Sai Kishore',          fromMatch: 1, toMatch: null },
      { name: 'Tim David',            fromMatch: 1, toMatch: null },
      { name: 'Varun Chakaravarthy',  fromMatch: 1, toMatch: null },
      { name: 'Yuzvendra Chahal',     fromMatch: 1, toMatch: null },
      { name: 'Noor Ahmad',           fromMatch: 1, toMatch: null },
      { name: 'T Natarajan',          fromMatch: 1, toMatch: null },
    ],
  },
  {
    id: 'mayank', owner: 'Mayank', name: "Mayank's XI",
    captain: 'Vaibhav Suryavanshi', vc: 'Phil Salt',
    players: [
      { name: 'Phil Salt',            fromMatch: 1,  toMatch: null },
      { name: 'Tim Seifert',          fromMatch: 1,  toMatch: null },
      { name: 'Quinton de Kock',      fromMatch: 1,  toMatch: null },
      { name: 'Allah Ghazanfar',      fromMatch: 1,  toMatch: null },
      { name: 'Vaibhav Suryavanshi', fromMatch: 1,  toMatch: null },
      { name: 'Ayush Mhatre',         fromMatch: 1,  toMatch: null },
      { name: 'Himmat Singh',         fromMatch: 1,  toMatch: null },
      { name: 'Digvesh Singh',        fromMatch: 1,  toMatch: null },
      { name: 'Sandeep Sharma',       fromMatch: 1,  toMatch: null },
      { name: 'Rahul Chahar',         fromMatch: 1,  toMatch: null },
      { name: 'Venkatesh Iyer',       fromMatch: 1,  toMatch: 13  },
      { name: 'Sameer Rizvi',         fromMatch: 14, toMatch: null },
    ],
  },
  {
    id: 'aahir', owner: 'Aahir', name: "Aahir's XI",
    captain: 'Sanju Samson', vc: 'Arshdeep Singh',
    players: [
      { name: 'Sanju Samson',       fromMatch: 1, toMatch: null },
      { name: 'Ryan Rickleton',     fromMatch: 1, toMatch: null },
      { name: 'Nitish Rana',        fromMatch: 1, toMatch: null },
      { name: 'Devdutt Padikkal',   fromMatch: 1, toMatch: null },
      { name: 'Nehal Wadhera',      fromMatch: 1, toMatch: null },
      { name: 'Axar Patel',         fromMatch: 1, toMatch: null },
      { name: 'Romario Shepherd',   fromMatch: 1, toMatch: null },
      { name: 'Smaran Ravichandran',fromMatch: 1, toMatch: null },
      { name: 'Jofra Archer',       fromMatch: 1, toMatch: null },
      { name: 'Kagiso Rabada',      fromMatch: 1, toMatch: null },
      { name: 'Arshdeep Singh',     fromMatch: 1, toMatch: null },
    ],
  },
  {
    id: 'ark', owner: 'Ark', name: "Ark's XI",
    captain: 'Ruturaj Gaikwad', vc: 'Tilak Varma',
    players: [
      { name: 'Tristan Stubbs',    fromMatch: 1, toMatch: null },
      { name: 'Ruturaj Gaikwad',   fromMatch: 1, toMatch: null },
      { name: 'Tilak Varma',       fromMatch: 1, toMatch: null },
      { name: 'Rinku Singh',       fromMatch: 1, toMatch: null },
      { name: 'Sai Sudharsan',     fromMatch: 1, toMatch: null },
      { name: 'Shivam Dube',       fromMatch: 1, toMatch: null },
      { name: 'Ashutosh Sharma',   fromMatch: 1, toMatch: null },
      { name: 'Rashid Khan',       fromMatch: 1, toMatch: null },
      { name: 'Anshul Kamboj',     fromMatch: 1, toMatch: null },
      { name: 'Avesh Khan',        fromMatch: 1, toMatch: null },
      { name: 'Cooper Connolly',   fromMatch: 1, toMatch: null },
    ],
  },
  {
    id: 'gautam', owner: 'Gautam', name: "Gautam's XI",
    captain: 'Rohit Sharma', vc: 'Hardik Pandya',
    players: [
      { name: 'Jitesh Sharma',      fromMatch: 1, toMatch: null },
      { name: 'Rohit Sharma',       fromMatch: 1, toMatch: null },
      { name: 'Matthew Breetzke',   fromMatch: 1, toMatch: null },
      { name: 'Shubham Dubey',      fromMatch: 1, toMatch: null },
      { name: 'Hardik Pandya',      fromMatch: 1, toMatch: null },
      { name: 'Auqib Nabi',         fromMatch: 1, toMatch: null },
      { name: 'Wanindu Hasaranga',  fromMatch: 1, toMatch: null },
      { name: 'Trent Boult',        fromMatch: 1, toMatch: null },
      { name: 'Mohammed Siraj',     fromMatch: 1, toMatch: null },
      { name: 'Kuldeep Yadav',      fromMatch: 1, toMatch: null },
      { name: 'Khaleel Ahmed',      fromMatch: 1, toMatch: null },
    ],
  },
  {
    id: 'chandira', owner: 'Chandira', name: "Chandira's XI",
    captain: 'Cameron Green', vc: 'Finn Allen',
    players: [
      { name: 'Jos Buttler',      fromMatch: 1,  toMatch: null },
      { name: 'Nicholas Pooran',  fromMatch: 1,  toMatch: null },
      { name: 'Dhruv Jurel',      fromMatch: 1,  toMatch: null },
      { name: 'Finn Allen',       fromMatch: 1,  toMatch: null },
      { name: 'Cameron Green',    fromMatch: 1,  toMatch: null },
      { name: 'Manish Pandey',    fromMatch: 1,  toMatch: null },
      { name: 'Priyansh Arya',    fromMatch: 1,  toMatch: null },
      { name: 'Kartik Tyagi',     fromMatch: 1,  toMatch: null },
      { name: 'Zeeshan Ansari',   fromMatch: 1,  toMatch: null },
      { name: 'Sahil Parakh',     fromMatch: 1,  toMatch: null },
      { name: 'Akash Deep',       fromMatch: 1,  toMatch: 11  },
      { name: 'Abhinandan Singh', fromMatch: 12, toMatch: null },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nanoid(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const db = getDb();
  console.log('\n🏏  Seeding ipl26a league\n');

  // ── 1. Clean up any previous seed run ─────────────────────────────────────
  const seededRows = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.supabaseUid, 'seed_%'));
  const seededUserIds = seededRows.map(u => u.id);

  // Delete league first — cascades to members → squad_players + captain_assignments
  await db.delete(leagues).where(eq(leagues.name, 'IPL Fantasy 2026 — Auction'));

  if (seededUserIds.length > 0) {
    console.log(`Cleaning up ${seededUserIds.length} previously seeded users…`);
    await db.delete(users).where(inArray(users.id, seededUserIds));
  }

  // ── 2. Create users ────────────────────────────────────────────────────────
  console.log('Creating 12 users…');
  const createdUsers = await db
    .insert(users)
    .values(
      TEAMS.map(t => ({
        supabaseUid: `seed_${t.id}`,   // placeholder — overwritten on first Google login
        email: TEAM_EMAILS[t.id] ?? `${t.id}@seed.local`,
        username: t.id,
        displayName: t.owner,
      })),
    )
    .returning({ id: users.id, supabaseUid: users.supabaseUid });

  const userByTeamId = Object.fromEntries(
    createdUsers.map(u => [u.supabaseUid!.replace('seed_', ''), u.id]),
  );
  console.log(`✓ Created users: ${Object.keys(userByTeamId).join(', ')}`);

  // ── 3. Create league (commissioner = aahir) ────────────────────────────────
  const commissionerId = userByTeamId['aahir']!;
  const [league] = await db
    .insert(leagues)
    .values({
      name: 'IPL Fantasy 2026 — Auction',
      sport: 'CRICKET_T20',
      commissionerId,
      numTeams: 12,
      totalBudgetLakhs: 1000,
      squadSize: 11,
      bidTimerSeconds: 30,
      seasonName: 'IPL 2026',
      status: 'ACTIVE',
      inviteCode: nanoid(8),
    })
    .returning();

  console.log(`✓ Created league: ${league!.id}`);

  // ── 4. Create members ──────────────────────────────────────────────────────
  const memberRows = await db
    .insert(leagueMembers)
    .values(
      TEAMS.map(t => ({
        leagueId: league!.id,
        userId: userByTeamId[t.id]!,
        teamName: t.name,
        budgetRemainingLakhs: 0,  // spent everything
      })),
    )
    .returning({ id: leagueMembers.id, userId: leagueMembers.userId });

  const memberByUserId = Object.fromEntries(memberRows.map(m => [m.userId, m.id]));
  const teamIdToMemberId = Object.fromEntries(
    TEAMS.map(t => [t.id, memberByUserId[userByTeamId[t.id]!]!]),
  );
  console.log(`✓ Created ${memberRows.length} league members`);

  // ── 5. Load all players from DB ────────────────────────────────────────────
  const allPlayers = await db
    .select({ id: players.id, name: players.name, role: players.role, aliases: players.aliases, basePriceLakhs: players.basePriceLakhs })
    .from(players);

  // Build name → player map (with alias resolution)
  const playerMap = new Map<string, typeof allPlayers[0]>();
  for (const p of allPlayers) {
    playerMap.set(p.name.toLowerCase(), p);
    for (const alias of p.aliases) playerMap.set(alias.toLowerCase(), p);
  }

  function findPlayer(name: string) {
    const normalised = normaliseName(name);
    return playerMap.get(normalised.toLowerCase()) ?? playerMap.get(name.toLowerCase());
  }

  // ── 6. Create squad players ────────────────────────────────────────────────
  let totalInserted = 0;
  const unmatched = new Set<string>();

  for (const team of TEAMS) {
    const memberId = teamIdToMemberId[team.id]!;
    const rows: Array<{
      memberId: string;
      playerId: string;
      acquisitionPriceLakhs: number;
      rosterConfig: { fromMatch: number; toMatch: number | null };
    }> = [];

    for (const p of team.players) {
      const dbPlayer = findPlayer(p.name);
      if (!dbPlayer) {
        unmatched.add(`${p.name} (${team.id})`);
        continue;
      }
      rows.push({
        memberId,
        playerId: dbPlayer.id,
        acquisitionPriceLakhs: dbPlayer.basePriceLakhs,
        rosterConfig: { fromMatch: p.fromMatch, toMatch: p.toMatch },
      });
    }

    if (rows.length > 0) {
      await db.insert(squadPlayers).values(rows);
      totalInserted += rows.length;
    }
  }

  console.log(`✓ Inserted ${totalInserted} squad player rows`);
  if (unmatched.size > 0) {
    console.log(`\n⚠  ${unmatched.size} unmatched players (not in DB):`);
    for (const n of [...unmatched].sort()) console.log(`     - ${n}`);
  }

  // ── 7. Create captain assignments ─────────────────────────────────────────
  let captainRows = 0;
  for (const team of TEAMS) {
    const memberId = teamIdToMemberId[team.id]!;
    const captainPlayer = findPlayer(team.captain);
    const vcPlayer      = findPlayer(team.vc);

    if (!captainPlayer) { console.warn(`  ⚠  Captain not found: ${team.captain} (${team.id})`); continue; }
    if (!vcPlayer)      { console.warn(`  ⚠  VC not found: ${team.vc} (${team.id})`); continue; }

    await db.insert(captainAssignments).values([
      { memberId, playerId: captainPlayer.id, role: 'CAPTAIN',      fromMatch: 1 },
      { memberId, playerId: vcPlayer.id,      role: 'VICE_CAPTAIN', fromMatch: 1 },
    ]);
    captainRows += 2;
  }

  console.log(`✓ Created ${captainRows} captain assignment rows`);

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log(`
─────────────────────────────────────────────────────
✓  League seeded successfully!

   League ID : ${league!.id}

   Next step — import match scores:
   LEAGUE_ID=${league!.id} pnpm --filter @fantasy/db import-matches
─────────────────────────────────────────────────────
`);
  process.exit(0);
}

main().catch(e => { console.error('\n✗ Seed failed:', e); process.exit(1); });

import { pgTable, uuid, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { leagueMembers } from './league-members';
import { players } from './players';

export const squadPlayers = pgTable('squad_players', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => leagueMembers.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id').notNull().references(() => players.id),
  acquisitionPriceLakhs: integer('acquisition_price_lakhs').notNull(),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
  // Roster config: when the player is active in the squad
  // { fromMatch: 1, toMatch: null } means active from match 1 onwards
  rosterConfig: jsonb('roster_config').$type<{ fromMatch: number; toMatch: number | null }>(),
  // Captain history stored per-player per-match in captain_assignments table
});

export type SquadPlayer = typeof squadPlayers.$inferSelect;
export type NewSquadPlayer = typeof squadPlayers.$inferInsert;

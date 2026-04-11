import { pgTable, uuid, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { leagues } from './leagues';
import { players } from './players';

export const matchScores = pgTable('match_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id').notNull().references(() => players.id),
  matchNumber: integer('match_number').notNull(),
  // Raw stats from CricAPI / sport API
  rawStats: jsonb('raw_stats').notNull(),
  // Computed fantasy points (null = not yet computed)
  fantasyPoints: integer('fantasy_points'),
  // Manual override by admin (takes precedence over computed)
  manualOverridePoints: integer('manual_override_points'),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MatchScore = typeof matchScores.$inferSelect;
export type NewMatchScore = typeof matchScores.$inferInsert;

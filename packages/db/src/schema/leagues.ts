import { pgTable, uuid, text, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { users } from './users';

export const leagueStatusEnum = pgEnum('league_status', [
  'LOBBY',
  'AUCTION_PHASE1',
  'AUCTION_PHASE2',
  'ACTIVE',
  'COMPLETE',
]);

export const sportEnum = pgEnum('sport', [
  'CRICKET_T20',
  'CRICKET_ODI',
  'FOOTBALL',
  'BASKETBALL',
  'BASEBALL',
  'AMERICAN_FOOTBALL',
]);

export const leagues = pgTable('leagues', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  sport: sportEnum('sport').notNull(),
  status: leagueStatusEnum('status').notNull().default('LOBBY'),
  commissionerId: uuid('commissioner_id').notNull().references(() => users.id),
  // Auction config
  numTeams: integer('num_teams').notNull().default(8),
  totalBudgetLakhs: integer('total_budget_lakhs').notNull().default(1000),
  squadSize: integer('squad_size').notNull().default(11),
  bidTimerSeconds: integer('bid_timer_seconds').notNull().default(30),
  minOpeningBidLakhs: integer('min_opening_bid_lakhs').notNull().default(10),
  // Season config
  seasonName: text('season_name'),
  externalSeriesId: text('external_series_id'),
  inviteCode: text('invite_code').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type League = typeof leagues.$inferSelect;
export type NewLeague = typeof leagues.$inferInsert;

import { pgTable, uuid, integer, boolean, text, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { leagues } from './leagues';
import { users } from './users';

export const leagueMembers = pgTable('league_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  teamName: text('team_name').notNull(),
  budgetRemainingLakhs: integer('budget_remaining_lakhs').notNull(),
  isReady: boolean('is_ready').notNull().default(false),
  isOnline: boolean('is_online').notNull().default(false),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
});

export type LeagueMember = typeof leagueMembers.$inferSelect;
export type NewLeagueMember = typeof leagueMembers.$inferInsert;

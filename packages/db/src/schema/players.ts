import { pgTable, uuid, text, integer, boolean, timestamp, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { sportEnum } from './leagues';

export const playerRoleEnum = pgEnum('player_role', ['WK', 'BAT', 'AR', 'BOWL']);
export const playerPoolEnum = pgEnum('player_pool', ['A', 'B', 'C', 'D']);

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  sport: sportEnum('sport').notNull(),
  name: text('name').notNull(),
  // Cricket-specific (nullable for other sports)
  role: playerRoleEnum('role'),
  teamCode: text('team_code'),       // e.g. "MI", "CSK", "LAL", "MCI"
  playerPool: playerPoolEnum('player_pool'),
  isOverseas: boolean('is_overseas').notNull().default(false),
  isUncapped: boolean('is_uncapped').notNull().default(false),
  basePriceLakhs: integer('base_price_lakhs').notNull().default(20),
  // Aliases for external API name matching
  aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
  needsReview: boolean('needs_review').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;

import { pgTable, uuid, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { leagues } from './leagues';
import { players } from './players';
import { leagueMembers } from './league-members';

export const lotStatusEnum = pgEnum('lot_status', ['PENDING', 'ACTIVE', 'SOLD', 'UNSOLD']);

export const auctionLots = pgTable('auction_lots', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id').notNull().references(() => players.id),
  phase: integer('phase').notNull().default(1),
  lotOrder: integer('lot_order').notNull(),
  status: lotStatusEnum('status').notNull().default('PENDING'),
  soldToMemberId: uuid('sold_to_member_id').references(() => leagueMembers.id),
  finalPriceLakhs: integer('final_price_lakhs'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});

export type AuctionLot = typeof auctionLots.$inferSelect;
export type NewAuctionLot = typeof auctionLots.$inferInsert;

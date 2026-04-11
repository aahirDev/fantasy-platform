import { pgTable, uuid, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { auctionLots } from './auction-lots';
import { leagueMembers } from './league-members';

export const bids = pgTable('bids', {
  id: uuid('id').primaryKey().defaultRandom(),
  lotId: uuid('lot_id').notNull().references(() => auctionLots.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull().references(() => leagueMembers.id),
  amountLakhs: integer('amount_lakhs').notNull(),
  isWinning: boolean('is_winning').notNull().default(false),
  isAllIn: boolean('is_all_in').notNull().default(false),
  placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Bid = typeof bids.$inferSelect;
export type NewBid = typeof bids.$inferInsert;

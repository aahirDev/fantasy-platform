import { pgTable, uuid, integer, pgEnum, timestamp } from 'drizzle-orm/pg-core';
import { leagueMembers } from './league-members';
import { players } from './players';

export const captainRoleEnum = pgEnum('captain_role', ['CAPTAIN', 'VICE_CAPTAIN']);

export const captainAssignments = pgTable('captain_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => leagueMembers.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id').notNull().references(() => players.id),
  role: captainRoleEnum('role').notNull(),
  fromMatch: integer('from_match').notNull(),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CaptainAssignment = typeof captainAssignments.$inferSelect;

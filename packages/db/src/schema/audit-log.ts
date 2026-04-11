import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';
import { leagues } from './leagues';

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id),
  leagueId: uuid('league_id').references(() => leagues.id),
  action: text('action').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLogEntry = typeof auditLog.$inferSelect;

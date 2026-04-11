import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { getDb } from '@fantasy/db';
import { users } from '@fantasy/db/schema';
import { eq } from 'drizzle-orm';

const supabase = createClient(
  process.env['SUPABASE_URL'] ?? '',
  process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
);

export interface AuthenticatedRequest extends Request {
  /** Supabase auth UID — used only in auth/sync to create/link the user row */
  userId?: string;
  /** Internal users.id — use this for all DB queries in routes */
  internalUserId?: string;
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.userId = data.user.id; // Supabase UID

  // Resolve internal user ID (null for brand-new users before /auth/sync)
  const db = getDb();
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.supabaseUid, data.user.id));
  if (row) req.internalUserId = row.id;

  console.log(`[auth] ${req.method} ${req.path} supabaseUid=${req.userId?.slice(0,8)} internalUserId=${req.internalUserId?.slice(0,8) ?? 'NOT FOUND'}`);

  next();
}

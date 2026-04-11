import { Router, type Router as RouterType } from 'express';
import { getDb } from '@fantasy/db';
import { users } from '@fantasy/db/schema';
import { eq, or } from 'drizzle-orm';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env['SUPABASE_URL'] ?? '',
  process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
);

export const authRouter: RouterType = Router();

/**
 * POST /api/auth/sync
 * Called by the web app after login. Upserts the Supabase user into our users table.
 */
authRouter.post('/sync', async (req: AuthenticatedRequest, res) => {
  try {
    const supabaseUid = req.userId!;

    // Fetch profile from Supabase Auth
    const { data, error } = await supabase.auth.admin.getUserById(supabaseUid);
    if (error || !data.user) {
      res.status(400).json({ error: 'Could not fetch user from Supabase' });
      return;
    }

    const authUser = data.user;
    const email = authUser.email!;
    // Username: prefer user_metadata.username, fall back to email prefix
    const username: string =
      (authUser.user_metadata?.['username'] as string | undefined) ??
      email.split('@')[0]!;
    const displayName: string =
      (authUser.user_metadata?.['full_name'] as string | undefined) ??
      username;
    const avatarUrl: string | null =
      (authUser.user_metadata?.['avatar_url'] as string | undefined) ?? null;

    const db = getDb();

    // 1. Check by supabaseUid (returning user)
    const [byUid] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.supabaseUid, supabaseUid));

    if (byUid) {
      res.json({ id: byUid.id, created: false });
      return;
    }

    // 2. Check by email — links a pre-seeded account to a real Google login
    const [byEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));

    if (byEmail) {
      await db
        .update(users)
        .set({ supabaseUid, displayName, avatarUrl, updatedAt: new Date() })
        .where(eq(users.id, byEmail.id));
      res.json({ id: byEmail.id, created: false });
      return;
    }

    // 3. Brand-new user — insert, handling duplicate username
    const baseUsername = username.slice(0, 20).replace(/[^a-zA-Z0-9_]/g, '_');
    let finalUsername = baseUsername;
    const [conflict] = await db.select({ id: users.id }).from(users).where(eq(users.username, finalUsername));
    if (conflict) {
      finalUsername = `${baseUsername.slice(0, 16)}_${Math.random().toString(36).slice(2, 6)}`;
    }

    const [created] = await db
      .insert(users)
      .values({ email, username: finalUsername, displayName, avatarUrl, supabaseUid })
      .returning({ id: users.id });

    res.status(201).json({ id: created!.id, created: true });
  } catch (err) {
    console.error('[auth/sync]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

import { Router, type Router as RouterType } from 'express';
import { getDb } from '@fantasy/db';
import { players } from '@fantasy/db/schema';
import { eq } from 'drizzle-orm';

export const playersRouter: RouterType = Router();

playersRouter.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { sport } = req.query;
    const rows = sport
      ? await db.select().from(players).where(eq(players.sport, sport as 'CRICKET_T20'))
      : await db.select().from(players);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

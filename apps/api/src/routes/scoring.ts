import { Router, type Router as RouterType } from 'express';
import { parseScorecardToStats, calcPlayerPoints } from '@fantasy/scoring';

export const scoringRouter: RouterType = Router();

/** POST /api/scoring/preview — pass a raw CricAPI scorecard, get back per-player points */
scoringRouter.post('/preview', (req, res) => {
  try {
    const { scorecard, aliases } = req.body as {
      scorecard: unknown;
      aliases?: Record<string, string>;
    };
    const stats = parseScorecardToStats(scorecard as Parameters<typeof parseScorecardToStats>[0], aliases);
    const results = Object.entries(stats).map(([name, s]) => ({
      name,
      stats: s,
      points: calcPlayerPoints(s),
    }));
    res.json(results);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

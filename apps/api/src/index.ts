import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';

import { authRouter } from './routes/auth.js';
import { leaguesRouter } from './routes/leagues.js';
import { playersRouter } from './routes/players.js';
import { scoringRouter } from './routes/scoring.js';
import { authMiddleware } from './middleware/auth.js';
import { setupSocketIO } from './socket.js';

const PORT = process.env['PORT'] ?? 3001;
const CLIENT_ORIGIN = process.env['CLIENT_ORIGIN'] ?? 'http://localhost:5173';

const app = express();
const httpServer = createServer(app);

// ── Socket.io ──────────────────────────────────────────────────────────────
setupSocketIO(httpServer, CLIENT_ORIGIN);

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

// ── Routes ─────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.use('/api/auth', authMiddleware, authRouter);
app.use('/api/leagues', authMiddleware, leaguesRouter);
app.use('/api/players', authMiddleware, playersRouter);
app.use('/api/scoring', authMiddleware, scoringRouter);

// ── Start ──────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`[api] listening on port ${PORT}`);
});

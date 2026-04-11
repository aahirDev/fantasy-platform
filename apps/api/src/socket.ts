import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { createClient } from '@supabase/supabase-js';
import { getDb } from '@fantasy/db';
import { leagueMembers, users } from '@fantasy/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAuction } from './auction/AuctionStateManager.js';

// ── Supabase client for token verification ────────────────────────────────────

const supabase = createClient(
  process.env['SUPABASE_URL'] ?? '',
  process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
);

// ── Socket.io singleton ────────────────────────────────────────────────────────

let io: Server | null = null;

export function getIO(): Server {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

// ── Per-connection tracking ────────────────────────────────────────────────────

/** How many live sockets a user has open in each league room */
const connectionCounts = new Map<string, number>(); // key: `${leagueId}:${userId}`

/** All socket IDs for a given userId */
const userSockets = new Map<string, Set<string>>();

// ── Setup ──────────────────────────────────────────────────────────────────────

export function setupSocketIO(httpServer: HttpServer, clientOrigin: string): Server {
  io = new Server(httpServer, {
    cors: { origin: clientOrigin, credentials: true },
  });

  // Authenticate every socket connection via Supabase JWT
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as Record<string, unknown>)['token'] as string | undefined;
      if (!token) return next(new Error('Missing auth token'));

      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) return next(new Error('Invalid or expired token'));

      // Attach our internal user record to the socket
      const db = getDb();
      const [user] = await db
        .select({ id: users.id, username: users.username, supabaseUid: users.supabaseUid })
        .from(users)
        .where(eq(users.supabaseUid, data.user.id));

      if (!user) return next(new Error('User not found — please sync first'));

      (socket as AuthSocket).user = { id: user.id, supabaseUid: data.user.id, username: user.username };
      next();
    } catch (err) {
      next(new Error('Auth error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const { user } = socket as AuthSocket;
    console.log(`[ws] connected: ${socket.id} (${user.username})`);

    // Track socket IDs per user
    const sids = userSockets.get(user.id) ?? new Set<string>();
    sids.add(socket.id);
    userSockets.set(user.id, sids);

    // ── Lobby ──────────────────────────────────────────────────────────────

    socket.on('lobby:join', async (leagueId: string) => {
      if (typeof leagueId !== 'string') return;
      try {
        const db = getDb();
        const [membership] = await db
          .select()
          .from(leagueMembers)
          .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, user.id)));

        if (!membership) return; // not a member

        await socket.join(`league:${leagueId}`);

        const connKey = `${leagueId}:${user.id}`;
        const prev = connectionCounts.get(connKey) ?? 0;
        connectionCounts.set(connKey, prev + 1);

        if (prev === 0) {
          await db.update(leagueMembers).set({ isOnline: true }).where(eq(leagueMembers.id, membership.id));

          io!.to(`league:${leagueId}`).emit('lobby:presence_changed', {
            memberId: membership.id,
            userId: user.id,
            username: user.username,
            isOnline: true,
          });

          const auction = getAuction(leagueId);
          if (auction) {
            auction.updateMemberOnlineStatus(user.id, true);
            socket.emit('auction:state_snapshot', auction.getSnapshot());
          }
        }
      } catch (err) {
        console.error('[ws] lobby:join error:', err);
      }
    });

    socket.on('lobby:leave', async (leagueId: string) => {
      if (typeof leagueId !== 'string') return;
      try {
        socket.leave(`league:${leagueId}`);
        await handleLeagueLeave(user.id, leagueId);
      } catch (err) {
        console.error('[ws] lobby:leave error:', err);
      }
    });

    // ── Bidding ────────────────────────────────────────────────────────────

    socket.on('bid:place', async (data: { leagueId: string; amount: number }) => {
      try {
        if (!data || typeof data.leagueId !== 'string' || typeof data.amount !== 'number') return;

        const auction = getAuction(data.leagueId);
        if (!auction) { socket.emit('bid:rejected', { reason: 'No active auction' }); return; }

        const member = auction.members.find(m => m.userId === user.id);
        if (!member) { socket.emit('bid:rejected', { reason: 'Not a participant' }); return; }

        const result = await auction.placeBid(member.id, data.amount);
        if (!result.success) socket.emit('bid:rejected', { reason: result.reason });
      } catch (err) {
        console.error('[ws] bid:place error:', err);
        socket.emit('bid:rejected', { reason: 'Server error' });
      }
    });

    socket.on('auction:all_in', async (data: { leagueId: string }) => {
      try {
        if (!data || typeof data.leagueId !== 'string') return;

        const auction = getAuction(data.leagueId);
        if (!auction) { socket.emit('bid:rejected', { reason: 'No active auction' }); return; }

        const member = auction.members.find(m => m.userId === user.id);
        if (!member) { socket.emit('bid:rejected', { reason: 'Not a participant' }); return; }

        const result = await auction.placeAllIn(member.id);
        if (!result.success) socket.emit('bid:rejected', { reason: result.reason });
      } catch (err) {
        console.error('[ws] auction:all_in error:', err);
      }
    });

    socket.on('auction:nominate', async (data: { leagueId: string; playerId: string }) => {
      try {
        if (!data || typeof data.leagueId !== 'string' || typeof data.playerId !== 'string') return;

        const auction = getAuction(data.leagueId);
        if (!auction) { socket.emit('bid:rejected', { reason: 'No active auction' }); return; }

        const member = auction.members.find(m => m.userId === user.id);
        if (!member) { socket.emit('bid:rejected', { reason: 'Not a participant' }); return; }

        const result = await auction.nominate(member.id, data.playerId);
        if (!result.success) socket.emit('bid:rejected', { reason: result.reason });
      } catch (err) {
        console.error('[ws] auction:nominate error:', err);
      }
    });

    socket.on('auction:request_snapshot', (leagueId: string) => {
      try {
        if (typeof leagueId !== 'string') return;
        const auction = getAuction(leagueId);
        if (!auction) return;

        const member = auction.members.find(m => m.userId === user.id);
        if (!member) { socket.emit('bid:rejected', { reason: 'Not a participant' }); return; }

        socket.emit('auction:state_snapshot', auction.getSnapshot());
      } catch (err) {
        console.error('[ws] snapshot error:', err);
      }
    });

    // ── Admin controls ─────────────────────────────────────────────────────

    socket.on('auction:pause', async (leagueId: string) => {
      const auction = getAuction(leagueId);
      if (!auction || auction.commissionerId !== user.id) return;
      auction.pause('admin');
    });

    socket.on('auction:resume', async (leagueId: string) => {
      const auction = getAuction(leagueId);
      if (!auction || auction.commissionerId !== user.id) return;
      auction.resume();
    });

    socket.on('auction:skip', async (leagueId: string) => {
      const auction = getAuction(leagueId);
      if (!auction || auction.commissionerId !== user.id) return;
      await auction.skipCurrentPlayer();
    });

    socket.on('auction:undo', async (leagueId: string) => {
      const auction = getAuction(leagueId);
      if (!auction || auction.commissionerId !== user.id) return;
      await auction.undoLastAllotment();
    });

    socket.on('auction:skip_to_phase2', (leagueId: string) => {
      const auction = getAuction(leagueId);
      if (!auction || auction.commissionerId !== user.id) return;
      auction.skipToPhase2();
    });

    // ── Disconnection ──────────────────────────────────────────────────────

    socket.on('disconnecting', async () => {
      try {
        const leagueRooms = Array.from(socket.rooms).filter(r => r.startsWith('league:'));
        for (const room of leagueRooms) {
          await handleLeagueLeave(user.id, room.replace('league:', ''));
        }
      } catch (err) {
        console.error('[ws] disconnecting error:', err);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[ws] disconnected: ${socket.id}`);
      const sids = userSockets.get(user.id);
      if (sids) { sids.delete(socket.id); if (sids.size === 0) userSockets.delete(user.id); }
    });
  });

  return io;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function handleLeagueLeave(userId: string, leagueId: string): Promise<void> {
  const connKey = `${leagueId}:${userId}`;
  const current = connectionCounts.get(connKey) ?? 1;
  const next = current - 1;
  if (next <= 0) {
    connectionCounts.delete(connKey);
    await markOffline(userId, leagueId);
  } else {
    connectionCounts.set(connKey, next);
  }
}

async function markOffline(userId: string, leagueId: string): Promise<void> {
  const db = getDb();
  const [membership] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));

  if (!membership) return;

  await db.update(leagueMembers).set({ isOnline: false }).where(eq(leagueMembers.id, membership.id));

  io?.to(`league:${leagueId}`).emit('lobby:presence_changed', {
    memberId: membership.id,
    userId,
    isOnline: false,
  });

  const auction = getAuction(leagueId);
  auction?.updateMemberOnlineStatus(userId, false);
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface SocketUser {
  id: string;
  supabaseUid: string;
  username: string;
}

interface AuthSocket extends Socket {
  user: SocketUser;
}

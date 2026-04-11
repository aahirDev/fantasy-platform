import type { Server, Socket } from 'socket.io';
import { PlaceBidPayload, NominatePlayerPayload } from '@fantasy/auction';

/**
 * Register Socket.io event handlers for the auction.
 * Full AuctionStateManager implementation comes in Phase 2.
 */
export function registerAuctionHandlers(io: Server, socket: Socket): void {
  socket.on('auction:join', (leagueId: string) => {
    void socket.join(`league:${leagueId}`);
    socket.emit('auction:joined', { leagueId });
  });

  socket.on('auction:request_snapshot', (leagueId: string) => {
    // TODO: fetch AuctionStateManager for leagueId and emit snapshot
    socket.emit('auction:state_snapshot', { leagueId, placeholder: true });
  });

  socket.on('bid:place', (raw: unknown) => {
    const result = PlaceBidPayload.safeParse(raw);
    if (!result.success) {
      socket.emit('bid:error', { error: result.error.message });
      return;
    }
    // TODO: delegate to AuctionStateManager.placeBid()
    socket.emit('bid:ack', { lotId: result.data.lotId });
  });

  socket.on('auction:nominate', (raw: unknown) => {
    const result = NominatePlayerPayload.safeParse(raw);
    if (!result.success) {
      socket.emit('auction:error', { error: result.error.message });
      return;
    }
    // TODO: delegate to AuctionStateManager.nominate()
    socket.emit('auction:nominated', { playerId: result.data.playerId });
  });
}

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from '../lib/socket';
import type { AuctionSnapshot } from '../types/auction';

export interface SpinWheelData {
  tiedBidders: Array<{ memberId: string; teamName: string; color: string }>;
  amount: number;
  winnerId: string;
}

interface UseAuctionReturn {
  snapshot: AuctionSnapshot | null;
  connected: boolean;
  error: string | null;
  spinWheelData: SpinWheelData | null;
  rejectionReason: string | null;
  clearRejection: () => void;
  placeBid: (amount: number) => void;
  placeAllIn: () => void;
  nominate: (playerId: string) => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  undo: () => void;
  skipToPhase2: () => void;
}

export function useAuction(leagueId: string): UseAuctionReturn {
  const socketRef = useRef<Socket | null>(null);
  const [snapshot, setSnapshot] = useState<AuctionSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [spinWheelData, setSpinWheelData] = useState<SpinWheelData | null>(null);

  useEffect(() => {
    let cancelled = false;

    getSocket().then((sock) => {
      if (cancelled) return;
      socketRef.current = sock;

      // ── Primary state driver: full snapshot ─────────────────────────────
      const onSnapshot = (data: AuctionSnapshot) => setSnapshot(data);

      // ── UI-only transition events ────────────────────────────────────────
      // These don't need to update the snapshot (the server broadcasts it alongside)
      const onSpinWheel = (data: SpinWheelData) => setSpinWheelData(data);

      // ── Timer tick: lightweight update, no full snapshot ────────────────
      const onTimerTick = (data: { timerEndsAt: number }) => {
        setSnapshot(prev => {
          if (!prev?.currentLot) return prev;
          return {
            ...prev,
            currentLot: { ...prev.currentLot, timerEndsAt: data.timerEndsAt },
          };
        });
      };

      const onBidRejected = ({ reason }: { reason: string }) => {
        setRejectionReason(reason);
        setTimeout(() => setRejectionReason(null), 3000);
      };

      const onConnect = () => {
        setConnected(true);
        setError(null);
        sock.emit('lobby:join', leagueId);
        sock.emit('auction:request_snapshot', leagueId);
      };

      const onDisconnect = () => setConnected(false);

      const onConnectError = (err: Error) => {
        setError(err.message);
        setConnected(false);
      };

      if (sock.connected) onConnect();

      sock.on('connect', onConnect);
      sock.on('disconnect', onDisconnect);
      sock.on('connect_error', onConnectError);
      sock.on('auction:state_snapshot', onSnapshot);
      sock.on('auction:timer_tick', onTimerTick);
      sock.on('auction:spin_wheel', onSpinWheel);
      sock.on('bid:rejected', onBidRejected);

      return () => {
        sock.off('connect', onConnect);
        sock.off('disconnect', onDisconnect);
        sock.off('connect_error', onConnectError);
        sock.off('auction:state_snapshot', onSnapshot);
        sock.off('auction:timer_tick', onTimerTick);
        sock.off('auction:spin_wheel', onSpinWheel);
        sock.off('bid:rejected', onBidRejected);
        sock.emit('lobby:leave', leagueId);
      };
    }).catch((err: Error) => {
      if (!cancelled) setError(err.message);
    });

    return () => { cancelled = true; };
  }, [leagueId]);

  const placeBid = useCallback((amount: number) => {
    socketRef.current?.emit('bid:place', { leagueId, amount });
  }, [leagueId]);

  const placeAllIn = useCallback(() => {
    socketRef.current?.emit('auction:all_in', { leagueId });
  }, [leagueId]);

  const nominate = useCallback((playerId: string) => {
    socketRef.current?.emit('auction:nominate', { leagueId, playerId });
  }, [leagueId]);

  const pause = useCallback(() => {
    socketRef.current?.emit('auction:pause', leagueId);
  }, [leagueId]);

  const resume = useCallback(() => {
    socketRef.current?.emit('auction:resume', leagueId);
  }, [leagueId]);

  const skip = useCallback(() => {
    socketRef.current?.emit('auction:skip', leagueId);
  }, [leagueId]);

  const undo = useCallback(() => {
    socketRef.current?.emit('auction:undo', leagueId);
  }, [leagueId]);

  const skipToPhase2 = useCallback(() => {
    socketRef.current?.emit('auction:skip_to_phase2', leagueId);
  }, [leagueId]);

  const clearRejection = useCallback(() => setRejectionReason(null), []);

  return {
    snapshot,
    connected,
    error,
    spinWheelData,
    rejectionReason,
    clearRejection,
    placeBid,
    placeAllIn,
    nominate,
    pause,
    resume,
    skip,
    undo,
    skipToPhase2,
  };
}

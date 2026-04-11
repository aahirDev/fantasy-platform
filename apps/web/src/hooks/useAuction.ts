import { useEffect, useRef, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from '../lib/socket';
import type { AuctionSnapshot } from '../types/auction';

interface UseAuctionReturn {
  snapshot: AuctionSnapshot | null;
  connected: boolean;
  error: string | null;
  placeBid: (amount: number) => void;
  placeAllIn: () => void;
  nominate: (playerId: string) => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  undo: () => void;
  skipToPhase2: () => void;
  rejectionReason: string | null;
  clearRejection: () => void;
}

export function useAuction(leagueId: string): UseAuctionReturn {
  const socketRef = useRef<Socket | null>(null);
  const [snapshot, setSnapshot] = useState<AuctionSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getSocket().then((sock) => {
      if (cancelled) return;
      socketRef.current = sock;

      const onConnect = () => {
        setConnected(true);
        setError(null);
        sock.emit('lobby:join', leagueId);
        sock.emit('auction:request_snapshot', leagueId);
      };

      const onDisconnect = () => setConnected(false);

      const onSnapshot = (data: AuctionSnapshot) => setSnapshot(data);

      const onLotStarted = (data: AuctionSnapshot) => setSnapshot(data);
      const onBidPlaced = (data: AuctionSnapshot) => setSnapshot(data);
      const onLotSold = (data: AuctionSnapshot) => setSnapshot(data);
      const onLotUnsold = (data: AuctionSnapshot) => setSnapshot(data);
      const onPhaseChanged = (data: AuctionSnapshot) => setSnapshot(data);
      const onTimerUpdate = (data: AuctionSnapshot) => setSnapshot(data);
      const onAuctionComplete = (data: AuctionSnapshot) => setSnapshot(data);
      const onPaused = (data: AuctionSnapshot) => setSnapshot(data);
      const onResumed = (data: AuctionSnapshot) => setSnapshot(data);
      const onNominationRequired = (data: AuctionSnapshot) => setSnapshot(data);
      const onUndone = (data: AuctionSnapshot) => setSnapshot(data);
      const onAllInTie = (data: AuctionSnapshot) => setSnapshot(data);
      const onSpinWheelResult = (data: AuctionSnapshot) => setSnapshot(data);

      const onBidRejected = ({ reason }: { reason: string }) => {
        setRejectionReason(reason);
        setTimeout(() => setRejectionReason(null), 3000);
      };

      const onConnectError = (err: Error) => {
        setError(err.message);
        setConnected(false);
      };

      if (sock.connected) {
        onConnect();
      }

      sock.on('connect', onConnect);
      sock.on('disconnect', onDisconnect);
      sock.on('connect_error', onConnectError);
      sock.on('auction:state_snapshot', onSnapshot);
      sock.on('auction:lot_started', onLotStarted);
      sock.on('auction:bid_placed', onBidPlaced);
      sock.on('auction:lot_sold', onLotSold);
      sock.on('auction:lot_unsold', onLotUnsold);
      sock.on('auction:phase_changed', onPhaseChanged);
      sock.on('auction:timer_update', onTimerUpdate);
      sock.on('auction:complete', onAuctionComplete);
      sock.on('auction:paused', onPaused);
      sock.on('auction:resumed', onResumed);
      sock.on('auction:nomination_required', onNominationRequired);
      sock.on('auction:undone', onUndone);
      sock.on('auction:all_in_tie', onAllInTie);
      sock.on('auction:spin_wheel_result', onSpinWheelResult);
      sock.on('bid:rejected', onBidRejected);

      return () => {
        sock.off('connect', onConnect);
        sock.off('disconnect', onDisconnect);
        sock.off('connect_error', onConnectError);
        sock.off('auction:state_snapshot', onSnapshot);
        sock.off('auction:lot_started', onLotStarted);
        sock.off('auction:bid_placed', onBidPlaced);
        sock.off('auction:lot_sold', onLotSold);
        sock.off('auction:lot_unsold', onLotUnsold);
        sock.off('auction:phase_changed', onPhaseChanged);
        sock.off('auction:timer_update', onTimerUpdate);
        sock.off('auction:complete', onAuctionComplete);
        sock.off('auction:paused', onPaused);
        sock.off('auction:resumed', onResumed);
        sock.off('auction:nomination_required', onNominationRequired);
        sock.off('auction:undone', onUndone);
        sock.off('auction:all_in_tie', onAllInTie);
        sock.off('auction:spin_wheel_result', onSpinWheelResult);
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
    placeBid,
    placeAllIn,
    nominate,
    pause,
    resume,
    skip,
    undo,
    skipToPhase2,
    rejectionReason,
    clearRejection,
  };
}

import { io, type Socket } from 'socket.io-client';
import { supabase } from './supabase';

let socket: Socket | null = null;

export async function getSocket(): Promise<Socket> {
  if (socket?.connected) return socket;

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) throw new Error('Not authenticated');

  if (socket) {
    socket.auth = { token };
    socket.connect();
    return socket;
  }

  socket = io('/', {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getRawSocket(): Socket | null {
  return socket;
}

import { io } from 'socket.io-client';

export const socket = io(import.meta.env.VITE_BACKEND_URL || undefined, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

socket.on('connect_error', (err) => {
  console.error('[socket] connect_error:', err.message);
});

socket.on('reconnect_attempt', (attempt) => {
  console.log('[socket] reconnect attempt', attempt);
});

socket.on('reconnect_failed', () => {
  console.error('[socket] reconnection failed');
});

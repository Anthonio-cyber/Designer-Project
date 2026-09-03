import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * A single shared connection for the whole app. The handshake authenticates from
 * the session cookie, so nothing sensitive is passed through the browser.
 */
export function getSocket(): Socket {
  socket ??= io({
    path: '/socket.io',
    withCredentials: true,
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnectionDelay: 800,
    reconnectionDelayMax: 6000,
  });
  return socket;
}

export function connectSocket(): Socket {
  const instance = getSocket();
  if (!instance.connected) instance.connect();
  return instance;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

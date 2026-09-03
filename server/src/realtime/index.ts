import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import cookie from 'cookie';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { ACCESS_COOKIE } from '../lib/cookies.js';
import { verifyAccessToken } from '../lib/tokens.js';

interface SocketUser {
  id: string;
  role: 'client' | 'admin';
  name: string;
}

let io: IOServer | null = null;
const online = new Map<string, number>();

const userRoom = (userId: string) => `user:${userId}`;
const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;
const ADMIN_ROOM = 'role:admin';

const findUser = db.prepare(`SELECT id, role, name, status FROM users WHERE id = ?`);
const conversationOwner = db.prepare(`SELECT client_id FROM conversations WHERE id = ?`);

function authenticate(socket: Socket): SocketUser | null {
  const header = socket.handshake.headers.cookie;
  const raw = header ? cookie.parse(header)[ACCESS_COOKIE] : undefined;
  const token = raw ?? (socket.handshake.auth?.token as string | undefined);
  if (!token) return null;

  const payload = verifyAccessToken(token);
  if (!payload) return null;

  const user = findUser.get(payload.sub) as
    | { id: string; role: 'client' | 'admin'; name: string; status: string }
    | undefined;
  if (!user || user.status !== 'active') return null;
  return { id: user.id, role: user.role, name: user.name };
}

/** A conversation may only be joined by its own client or by an admin. */
function mayJoinConversation(user: SocketUser, conversationId: string): boolean {
  if (user.role === 'admin') return true;
  const row = conversationOwner.get(conversationId) as { client_id: string } | undefined;
  return !!row && row.client_id === user.id;
}

export function initRealtime(server: HttpServer): IOServer {
  io = new IOServer(server, {
    path: '/socket.io',
    cors: { origin: env.clientOrigins, credentials: true },
  });

  io.use((socket, next) => {
    const user = authenticate(socket);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as SocketUser;
    socket.join(userRoom(user.id));
    if (user.role === 'admin') socket.join(ADMIN_ROOM);

    online.set(user.id, (online.get(user.id) ?? 0) + 1);
    io?.emit('presence:update', { userId: user.id, online: true });

    socket.on('conversation:join', (conversationId: string) => {
      if (typeof conversationId !== 'string') return;
      if (!mayJoinConversation(user, conversationId)) return;
      socket.join(conversationRoom(conversationId));
    });

    socket.on('conversation:leave', (conversationId: string) => {
      if (typeof conversationId === 'string') socket.leave(conversationRoom(conversationId));
    });

    socket.on('typing', (payload: { conversationId?: string; typing?: boolean }) => {
      const conversationId = payload?.conversationId;
      if (typeof conversationId !== 'string') return;
      if (!mayJoinConversation(user, conversationId)) return;
      socket.to(conversationRoom(conversationId)).emit('typing', {
        conversationId,
        userId: user.id,
        name: user.name,
        typing: payload.typing !== false,
      });
    });

    socket.on('disconnect', () => {
      const remaining = (online.get(user.id) ?? 1) - 1;
      if (remaining <= 0) {
        online.delete(user.id);
        io?.emit('presence:update', { userId: user.id, online: false });
      } else {
        online.set(user.id, remaining);
      }
    });
  });

  return io;
}

export const isOnline = (userId: string): boolean => online.has(userId);
export const onlineUserIds = (): string[] => [...online.keys()];

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}

export function emitToAdmins(event: string, payload: unknown): void {
  io?.to(ADMIN_ROOM).emit(event, payload);
}

export function emitToConversation(conversationId: string, event: string, payload: unknown): void {
  io?.to(conversationRoom(conversationId)).emit(event, payload);
}

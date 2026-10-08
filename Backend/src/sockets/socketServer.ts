import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import cookieParser from 'cookie-parser';
import { env } from '../config/env';
import { authenticateToken } from '../middleware/authMiddleware';
import { findBlockState } from '../db/queries/blockQueries';
import { areUsersConnected, createMessage, markMessagesAsRead } from '../db/queries/messageQueries';
import { createNotification, NotificationType, NotificationWithUser } from '../db/queries/notificationQueries';
import { findLastConnection, touchLastConnection } from '../db/queries/profileViewQueries';
import { SafeUser } from '../types';

const cookie = cookieParser();

export interface AuthenticatedSocket extends Socket {
  user?: SafeUser;
}

const onlineUsers = new Map<number, Set<string>>();

/** Set once the server starts, so controllers can push events without passing io around. */
let ioInstance: Server | null = null;

interface PendingCall {
  callId: string;
  callType: 'audio' | 'video';
  callerId: number;
  receiverId: number;
  from_user: {
    id: number;
    first_name: string;
    last_name: string;
    username: string;
  };
  timeout: NodeJS.Timeout;
}

const pendingCalls = new Map<string, PendingCall>();
const pendingCallKey = (callerId: number, receiverId: number, callId: string): string => `${callerId}:${receiverId}:${callId}`;

const emitIncomingCall = (io: Server, call: PendingCall): void => {
  io.to(`user:${call.receiverId}`).emit('call:incoming', {
    callId: call.callId,
    callType: call.callType,
    fromUserId: call.callerId,
    from_user: call.from_user,
  });
};

/** Clears a pending call only when it belongs to this exact caller/receiver pair. */
const clearPendingCall = (callerId: number, receiverId: number, callId: string): PendingCall | null => {
  const key = pendingCallKey(callerId, receiverId, callId);
  const call = pendingCalls.get(key);
  if (!call) return null;
  clearTimeout(call.timeout);
  pendingCalls.delete(key);
  return call;
};

const clearPendingCallsForUser = (userId: number): PendingCall[] => {
  const calls = Array.from(pendingCalls.entries()).filter(([, call]) => call.callerId === userId || call.receiverId === userId);
  calls.forEach(([key, call]) => {
    clearTimeout(call.timeout);
    pendingCalls.delete(key);
  });
  return calls.map(([, call]) => call);
};


const parsePeerId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const parseCallId = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 && value.length <= 100 ? value : null;

/** Mutual like and no block in either direction (both checked by areUsersConnected). */
const canSignalCall = async (senderId: number, receiverId: number, callback?: (response: any) => void): Promise<boolean> => {
  if (senderId === receiverId) {
    callback?.({ success: false, error: 'Cannot call yourself' });
    return false;
  }

  const connected = await areUsersConnected(senderId, receiverId);
  if (!connected) {
    callback?.({ success: false, error: 'You can only call connected users' });
    return false;
  }

  return true;
};

/** Logs the real error server-side and only sends a generic message to the client. */
const failSocketEvent = (callback: ((response: any) => void) | undefined, context: string, message: string, error: unknown): void => {
  console.error(`[Socket] ${context}:`, error);
  callback?.({ success: false, error: message });
};

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------
// Presence is never broadcast to everyone. A client that wants live status for
// one profile joins `presence:<id>` via `presence:watch` (refused when a block
// exists either way) and only that room receives `presence:update`.

const presenceRoom = (userId: number): string => `presence:${userId}`;

const emitPresence = (io: Server, userId: number, online: boolean, lastSeen: Date): void => {
  io.to(presenceRoom(userId)).emit('presence:update', { userId, online, last_seen: lastSeen.toISOString() });
};

const recordLastConnection = (userId: number, at: Date): void => {
  touchLastConnection(userId, at).catch((error) => {
    console.error(`[Socket] Failed to update last connection for user ${userId}:`, error);
  });
};

/** Called when a block is created: neither user may keep watching the other's presence. */
export const stopPresenceBetween = (userA: number, userB: number): void => {
  ioInstance?.in(`user:${userA}`).socketsLeave(presenceRoom(userB));
  ioInstance?.in(`user:${userB}`).socketsLeave(presenceRoom(userA));
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Live `notification:new` payload: the stored row exactly as GET /notifications
 * returns it (real id, is_read, related-user info), plus the `from_user` /
 * `with_user_id` fields earlier listeners read.
 */
const toNotificationEvent = (row: NotificationWithUser) => ({
  ...row,
  from_user: row.related_user_id === null
    ? null
    : { id: row.related_user_id, first_name: row.related_user_first_name, username: row.related_user_username },
  ...(row.type === 'new_connection' ? { with_user_id: row.related_user_id } : {}),
});

/**
 * Stores a notification and pushes it to the recipient. Every notification goes
 * through here; mute, block (either direction) and dedupe suppression happen in
 * createNotification, so a suppressed notification is neither stored nor sent.
 */
export const notifyUser = async (
  recipientId: number,
  type: NotificationType,
  actorId: number | null,
  content: string
): Promise<NotificationWithUser | null> => {
  const row = await createNotification(recipientId, type, actorId, content);
  if (row) ioInstance?.to(`user:${recipientId}`).emit('notification:new', toNotificationEvent(row));
  return row;
};

/** Read receipt: tells `peerId` that `readerId` has read their messages. */
export const emitMessagesSeen = (readerId: number, peerId: number): void => {
  ioInstance?.to(`user:${peerId}`).emit('message:seen', { byUserId: readerId, read_at: new Date().toISOString() });
};


export const getOnlineUsers = (): number[] => Array.from(onlineUsers.keys());

export const isUserOnline = (userId: number): boolean => onlineUsers.has(userId);

export const addOnlineUser = (userId: number, socketId: string): void => {
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId)!.add(socketId);
};

export const removeOnlineUser = (userId: number, socketId: string): boolean => {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return false;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    onlineUsers.delete(userId);
    return true;
  }
  return false;
};

export const getSocketIdsForUser = (userId: number): string[] => {
  const sockets = onlineUsers.get(userId);
  return sockets ? Array.from(sockets) : [];
};

export const initializeSocketServer = (httpServer: HttpServer): Server => {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });
  ioInstance = io;

  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const req = socket.request as any;
      const res = { getHeader: () => {}, setHeader: () => {}, end: () => {} } as any;

      cookie(req, res, () => {});

      let token: string | undefined = req.cookies?.token;

      if (!token && socket.handshake.auth?.token) {
        token = socket.handshake.auth.token;
      }

      if (!token) {
        return next(new Error('Authentication required'));
      }

      // Same checks as the HTTP middleware, including token_version, so a
      // logged-out or password-reset token cannot open a socket either.
      const user = await authenticateToken(token);
      if (!user) {
        return next(new Error('Authentication failed'));
      }

      socket.user = user;
      next();
    } catch (error) {
      console.error('[Socket.io] Handshake authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.user!.id;
    const wasOffline = !isUserOnline(userId);
    addOnlineUser(userId, socket.id);
    socket.join(`user:${userId}`);

    console.log(`[Socket] User ${userId} connected (${socket.id})`);

    const connectedAt = new Date();
    recordLastConnection(userId, connectedAt);
    if (wasOffline) emitPresence(io, userId, true, connectedAt);

    pendingCalls.forEach((call) => {
      if (call.receiverId === userId) emitIncomingCall(io, call);
    });

    socket.on('message:send', async (data: { receiverId: number; content: string }, callback) => {
      try {
        const senderId = userId;
        const receiverId = parsePeerId(data?.receiverId);
        const content = data?.content;

        if (!receiverId) {
          return callback?.({ success: false, error: 'Invalid message recipient' });
        }

        if (!content || typeof content !== 'string' || content.trim().length === 0) {
          return callback?.({ success: false, error: 'Message content is required' });
        }

        if (content.length > 5000) {
          return callback?.({ success: false, error: 'Message too long (max 5000 characters)' });
        }

        if (senderId === receiverId) {
          return callback?.({ success: false, error: 'Cannot send message to yourself' });
        }

        const connected = await areUsersConnected(senderId, receiverId);
        if (!connected) {
          return callback?.({ success: false, error: 'You can only message connected users' });
        }

        const message = await createMessage(senderId, receiverId, content.trim());

        const messagePayload = {
          id: message.id,
          sender_id: message.sender_id,
          receiver_id: message.receiver_id,
          content: message.content,
          created_at: message.created_at,
          read_at: message.read_at,
        };

        socket.emit('message:sent', { success: true, message: messagePayload });

        io.to(`user:${receiverId}`).emit('message:new', messagePayload);

        callback?.({ success: true, message: messagePayload });

        // The message is already stored and delivered; a notification failure
        // must not make the sender think it was lost and resend it.
        try {
          await notifyUser(receiverId, 'message', senderId, `New message from ${socket.user!.first_name}`);
        } catch (error) {
          console.error('[Socket] Error creating message notification:', error);
        }
      } catch (error) {
        failSocketEvent(callback, 'Error sending message', 'Failed to send message', error);
      }
    });

    // Marks the peer's messages to me as read on the server (the open
    // conversation emits this as messages arrive), then tells the peer.
    socket.on('message:read', async (data: { peerId: number }, callback) => {
      try {
        const peerId = parsePeerId(data?.peerId);
        if (!peerId || peerId === userId) {
          return callback?.({ success: false, error: 'Invalid conversation' });
        }

        const connected = await areUsersConnected(userId, peerId);
        if (!connected) {
          return callback?.({ success: false, error: 'You can only read messages from connected users' });
        }

        const count = await markMessagesAsRead(userId, peerId);
        if (count > 0) emitMessagesSeen(userId, peerId);
        callback?.({ success: true, count });
      } catch (error) {
        failSocketEvent(callback, 'Error marking messages as read', 'Failed to mark messages as read', error);
      }
    });

    socket.on('presence:watch', async (data: { userId: number }, callback) => {
      try {
        const targetId = parsePeerId(data?.userId);
        if (!targetId) return callback?.({ success: false, error: 'Invalid user' });

        if (targetId !== userId && (await findBlockState(userId, targetId)).anyBlock) {
          return callback?.({ success: false, error: 'Profile not available' });
        }

        const lastConnection = await findLastConnection(targetId);
        if (lastConnection === undefined) return callback?.({ success: false, error: 'Profile not available' });

        socket.join(presenceRoom(targetId));
        callback?.({
          success: true,
          userId: targetId,
          online: isUserOnline(targetId),
          last_seen: lastConnection ? new Date(lastConnection).toISOString() : null,
        });
      } catch (error) {
        failSocketEvent(callback, 'Error watching presence', 'Failed to load online status', error);
      }
    });

    socket.on('presence:unwatch', (data: { userId: number }, callback) => {
      const targetId = parsePeerId(data?.userId);
      if (targetId) socket.leave(presenceRoom(targetId));
      callback?.({ success: true });
    });

    socket.on('call:invite', async (data: { receiverId: number; callId: string; callType: 'audio' | 'video' }, callback) => {
      try {
        const receiverId = parsePeerId(data?.receiverId);
        if (!receiverId) return callback?.({ success: false, error: 'Invalid call recipient' });
        const callId = parseCallId(data?.callId);
        if (!callId) return callback?.({ success: false, error: 'Invalid call' });
        if (data.callType !== 'audio' && data.callType !== 'video') {
          return callback?.({ success: false, error: 'Invalid call type' });
        }
        if (!(await canSignalCall(userId, receiverId, callback))) return;

        const call: PendingCall = {
          callId,
          callType: data.callType,
          callerId: userId,
          receiverId,
          from_user: {
            id: socket.user!.id,
            first_name: socket.user!.first_name,
            last_name: socket.user!.last_name,
            username: socket.user!.username,
          },
          timeout: setTimeout(() => {
            pendingCalls.delete(pendingCallKey(userId, receiverId, callId));
            io.to(`user:${userId}`).emit('call:ended', { callId, fromUserId: receiverId });
            io.to(`user:${receiverId}`).emit('call:ended', { callId, fromUserId: userId });
          }, 45_000),
        };

        pendingCalls.set(pendingCallKey(userId, receiverId, callId), call);
        emitIncomingCall(io, call);
        callback?.({ success: true });
      } catch (error) {
        failSocketEvent(callback, 'Error starting call', 'Failed to start call', error);
      }
    });

    socket.on('call:accept', async (data: { callerId: number; callId: string }, callback) => {
      try {
        const callerId = parsePeerId(data?.callerId);
        if (!callerId) return callback?.({ success: false, error: 'Invalid caller' });
        if (!(await canSignalCall(userId, callerId, callback))) return;

        clearPendingCall(callerId, userId, data.callId);
        io.to(`user:${callerId}`).emit('call:accepted', { callId: data.callId, fromUserId: userId });
        callback?.({ success: true });
      } catch (error) {
        failSocketEvent(callback, 'Error accepting call', 'Failed to accept call', error);
      }
    });

    socket.on('call:reject', async (data: { callerId: number; callId: string }, callback) => {
      try {
        const callerId = parsePeerId(data?.callerId);
        if (!callerId) return callback?.({ success: false, error: 'Invalid caller' });
        if (!(await canSignalCall(userId, callerId, callback))) return;

        clearPendingCall(callerId, userId, data.callId);
        io.to(`user:${callerId}`).emit('call:rejected', { callId: data.callId, fromUserId: userId });
        callback?.({ success: true });
      } catch (error) {
        failSocketEvent(callback, 'Error rejecting call', 'Failed to reject call', error);
      }
    });

    socket.on('call:cancel', async (data: { receiverId: number; callId: string }, callback) => {
      try {
        const receiverId = parsePeerId(data?.receiverId);
        if (!receiverId) return callback?.({ success: false, error: 'Invalid call recipient' });
        if (!(await canSignalCall(userId, receiverId, callback))) return;

        clearPendingCall(userId, receiverId, data.callId);
        io.to(`user:${receiverId}`).emit('call:cancelled', { callId: data.callId, fromUserId: userId });
        callback?.({ success: true });
      } catch (error) {
        failSocketEvent(callback, 'Error cancelling call', 'Failed to cancel call', error);
      }
    });

    socket.on('call:end', async (data: { receiverId: number; callId: string }, callback) => {
      try {
        const receiverId = parsePeerId(data?.receiverId);
        if (!receiverId) return callback?.({ success: false, error: 'Invalid call recipient' });
        if (!(await canSignalCall(userId, receiverId, callback))) return;

        // Either side may hang up, so the pending call can be keyed either way.
        if (!clearPendingCall(userId, receiverId, data.callId)) clearPendingCall(receiverId, userId, data.callId);
        io.to(`user:${receiverId}`).emit('call:ended', { callId: data.callId, fromUserId: userId });
        callback?.({ success: true });
      } catch (error) {
        failSocketEvent(callback, 'Error ending call', 'Failed to end call', error);
      }
    });

    socket.on('call:offer', async (data: { receiverId: number; callId: string; offer: Record<string, unknown> }, callback) => {
      try {
        const receiverId = parsePeerId(data?.receiverId);
        if (!receiverId) return callback?.({ success: false, error: 'Invalid call recipient' });
        if (!(await canSignalCall(userId, receiverId, callback))) return;
        io.to(`user:${receiverId}`).emit('call:offer', { callId: data.callId, fromUserId: userId, offer: data.offer });
        callback?.({ success: true });
      } catch (error) {
        failSocketEvent(callback, 'Error sending call offer', 'Failed to send call offer', error);
      }
    });

    socket.on('call:answer', async (data: { receiverId: number; callId: string; answer: Record<string, unknown> }, callback) => {
      try {
        const receiverId = parsePeerId(data?.receiverId);
        if (!receiverId) return callback?.({ success: false, error: 'Invalid call recipient' });
        if (!(await canSignalCall(userId, receiverId, callback))) return;
        io.to(`user:${receiverId}`).emit('call:answer', { callId: data.callId, fromUserId: userId, answer: data.answer });
        callback?.({ success: true });
      } catch (error) {
        failSocketEvent(callback, 'Error sending call answer', 'Failed to send call answer', error);
      }
    });

    socket.on('call:ice-candidate', async (data: { receiverId: number; callId: string; candidate: Record<string, unknown> }, callback) => {
      try {
        const receiverId = parsePeerId(data?.receiverId);
        if (!receiverId) return callback?.({ success: false, error: 'Invalid call recipient' });
        if (!(await canSignalCall(userId, receiverId, callback))) return;
        io.to(`user:${receiverId}`).emit('call:ice-candidate', { callId: data.callId, fromUserId: userId, candidate: data.candidate });
        callback?.({ success: true });
      } catch (error) {
        failSocketEvent(callback, 'Error sending call candidate', 'Failed to send call candidate', error);
      }
    });

    socket.on('disconnect', async (reason) => {
      const wasLast = removeOnlineUser(userId, socket.id);
      console.log(`[Socket] User ${userId} disconnected: ${reason}`);

      if (wasLast) {
        clearPendingCallsForUser(userId).forEach((call) => {
          const otherUserId = call.callerId === userId ? call.receiverId : call.callerId;
          io.to(`user:${otherUserId}`).emit('call:cancelled', { callId: call.callId, fromUserId: userId });
        });

        const disconnectedAt = new Date();
        recordLastConnection(userId, disconnectedAt);
        emitPresence(io, userId, false, disconnectedAt);
      }
    });
  });

  return io;
};

export const emitToUser = (io: Server, userId: number, event: string, data: any): void => {
  io.to(`user:${userId}`).emit(event, data);
};

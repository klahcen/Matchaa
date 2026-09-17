import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import cookieParser from 'cookie-parser';
import { verifyAuthToken } from '../services/authService';
import { findUserById } from '../db/queries/userQueries';
import { toSafeUser } from '../services/authService';
import { isMutualLike } from '../db/queries/likeQueries';
import { JwtPayload, SafeUser } from '../types';

const cookie = cookieParser();

export interface AuthenticatedSocket extends Socket {
  user?: SafeUser;
}

const onlineUsers = new Map<number, Set<string>>();

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

const clearPendingCall = (callId: string): PendingCall | null => {
  const entry = Array.from(pendingCalls.entries()).find(([, call]) => call.callId === callId);
  if (!entry) return null;
  const [key, call] = entry;
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

const canSignalCall = async (senderId: number, receiverId: number, callback?: (response: any) => void): Promise<boolean> => {
  if (senderId === receiverId) {
    callback?.({ success: false, error: 'Cannot call yourself' });
    return false;
  }

  const connected = await isMutualLike(senderId, receiverId);
  if (!connected) {
    callback?.({ success: false, error: 'You can only call connected users' });
    return false;
  }

  return true;
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
      origin: true,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });

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

      const payload = verifyAuthToken(token) as JwtPayload;
      const user = await findUserById(payload.userId);

      if (!user || !user.is_verified) {
        return next(new Error('User not found or not verified'));
      }

      socket.user = toSafeUser(user);
      next();
    } catch (error: any) {
      next(new Error(error.message || 'Authentication failed'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.user!.id;
    addOnlineUser(userId, socket.id);
    socket.join(`user:${userId}`);

    console.log(`[Socket] User ${userId} connected (${socket.id})`);

    const [prevId] = getSocketIdsForUser(userId).filter((id) => id !== socket.id);
    if (prevId) {
      io.to(`user:${userId}`).emit('user:online', { userId });
    }

    pendingCalls.forEach((call) => {
      if (call.receiverId === userId) emitIncomingCall(io, call);
    });

    socket.on('message:send', async (data: { receiverId: number; content: string }, callback) => {
      try {
        const senderId = userId;
        const { receiverId, content } = data;

        if (!content || typeof content !== 'string' || content.trim().length === 0) {
          return callback?.({ success: false, error: 'Message content is required' });
        }

        if (content.length > 5000) {
          return callback?.({ success: false, error: 'Message too long (max 5000 characters)' });
        }

        if (senderId === receiverId) {
          return callback?.({ success: false, error: 'Cannot send message to yourself' });
        }

        const connected = await isMutualLike(senderId, receiverId);
        if (!connected) {
          return callback?.({ success: false, error: 'You can only message connected users' });
        }

        const { createMessage } = await import('../db/queries/messageQueries');
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

        const { createNotification } = await import('../db/queries/notificationQueries');
        await createNotification(receiverId, 'message', senderId, `New message from ${socket.user!.first_name}`);

        io.to(`user:${receiverId}`).emit('notification:new', {
          type: 'message',
          from_user: { id: socket.user!.id, first_name: socket.user!.first_name, username: socket.user!.username },
          content: `New message from ${socket.user!.first_name}`,
          created_at: new Date().toISOString(),
        });

        callback?.({ success: true, message: messagePayload });
      } catch (error: any) {
        console.error('[Socket] Error sending message:', error);
        callback?.({ success: false, error: error.message || 'Failed to send message' });
      }
    });

    socket.on('call:invite', async (data: { receiverId: number; callId: string; callType: 'audio' | 'video' }, callback) => {
      try {
        const receiverId = parsePeerId(data?.receiverId);
        if (!receiverId) return callback?.({ success: false, error: 'Invalid call recipient' });
        if (data.callType !== 'audio' && data.callType !== 'video') {
          return callback?.({ success: false, error: 'Invalid call type' });
        }
        if (!(await canSignalCall(userId, receiverId, callback))) return;

        const call: PendingCall = {
          callId: data.callId,
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
            pendingCalls.delete(pendingCallKey(userId, receiverId, data.callId));
            io.to(`user:${userId}`).emit('call:ended', { callId: data.callId, fromUserId: receiverId });
            io.to(`user:${receiverId}`).emit('call:ended', { callId: data.callId, fromUserId: userId });
          }, 45_000),
        };

        pendingCalls.set(pendingCallKey(userId, receiverId, data.callId), call);
        emitIncomingCall(io, call);
        callback?.({ success: true });
      } catch (error: any) {
        console.error('[Socket] Error starting call:', error);
        callback?.({ success: false, error: error.message || 'Failed to start call' });
      }
    });

    socket.on('call:accept', async (data: { callerId: number; callId: string }, callback) => {
      try {
        const callerId = parsePeerId(data?.callerId);
        if (!callerId) return callback?.({ success: false, error: 'Invalid caller' });
        if (!(await canSignalCall(userId, callerId, callback))) return;

        clearPendingCall(data.callId);
        io.to(`user:${callerId}`).emit('call:accepted', { callId: data.callId, fromUserId: userId });
        callback?.({ success: true });
      } catch (error: any) {
        console.error('[Socket] Error accepting call:', error);
        callback?.({ success: false, error: error.message || 'Failed to accept call' });
      }
    });

    socket.on('call:reject', async (data: { callerId: number; callId: string }, callback) => {
      const callerId = parsePeerId(data?.callerId);
      if (!callerId) return callback?.({ success: false, error: 'Invalid caller' });
      clearPendingCall(data.callId);
      io.to(`user:${callerId}`).emit('call:rejected', { callId: data.callId, fromUserId: userId });
      callback?.({ success: true });
    });

    socket.on('call:cancel', async (data: { receiverId: number; callId: string }, callback) => {
      const receiverId = parsePeerId(data?.receiverId);
      if (!receiverId) return callback?.({ success: false, error: 'Invalid call recipient' });
      clearPendingCall(data.callId);
      io.to(`user:${receiverId}`).emit('call:cancelled', { callId: data.callId, fromUserId: userId });
      callback?.({ success: true });
    });

    socket.on('call:end', async (data: { receiverId: number; callId: string }, callback) => {
      const receiverId = parsePeerId(data?.receiverId);
      if (!receiverId) return callback?.({ success: false, error: 'Invalid call recipient' });
      clearPendingCall(data.callId);
      io.to(`user:${receiverId}`).emit('call:ended', { callId: data.callId, fromUserId: userId });
      callback?.({ success: true });
    });

    socket.on('call:offer', async (data: { receiverId: number; callId: string; offer: Record<string, unknown> }, callback) => {
      try {
        const receiverId = parsePeerId(data?.receiverId);
        if (!receiverId) return callback?.({ success: false, error: 'Invalid call recipient' });
        if (!(await canSignalCall(userId, receiverId, callback))) return;
        io.to(`user:${receiverId}`).emit('call:offer', { callId: data.callId, fromUserId: userId, offer: data.offer });
        callback?.({ success: true });
      } catch (error: any) {
        callback?.({ success: false, error: error.message || 'Failed to send call offer' });
      }
    });

    socket.on('call:answer', async (data: { receiverId: number; callId: string; answer: Record<string, unknown> }, callback) => {
      try {
        const receiverId = parsePeerId(data?.receiverId);
        if (!receiverId) return callback?.({ success: false, error: 'Invalid call recipient' });
        if (!(await canSignalCall(userId, receiverId, callback))) return;
        io.to(`user:${receiverId}`).emit('call:answer', { callId: data.callId, fromUserId: userId, answer: data.answer });
        callback?.({ success: true });
      } catch (error: any) {
        callback?.({ success: false, error: error.message || 'Failed to send call answer' });
      }
    });

    socket.on('call:ice-candidate', async (data: { receiverId: number; callId: string; candidate: Record<string, unknown> }, callback) => {
      try {
        const receiverId = parsePeerId(data?.receiverId);
        if (!receiverId) return callback?.({ success: false, error: 'Invalid call recipient' });
        if (!(await canSignalCall(userId, receiverId, callback))) return;
        io.to(`user:${receiverId}`).emit('call:ice-candidate', { callId: data.callId, fromUserId: userId, candidate: data.candidate });
        callback?.({ success: true });
      } catch (error: any) {
        callback?.({ success: false, error: error.message || 'Failed to send call candidate' });
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
        io.emit('user:offline', { userId });
      }
    });
  });

  return io;
};

export const emitToUser = (io: Server, userId: number, event: string, data: any): void => {
  io.to(`user:${userId}`).emit(event, data);
};

export const broadcastOnlineStatus = (io: Server, userId: number, online: boolean): void => {
  io.emit(online ? 'user:online' : 'user:offline', { userId });
};
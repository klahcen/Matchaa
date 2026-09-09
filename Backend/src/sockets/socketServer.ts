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

    socket.on('disconnect', async (reason) => {
      const wasLast = removeOnlineUser(userId, socket.id);
      console.log(`[Socket] User ${userId} disconnected: ${reason}`);

      if (wasLast) {
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
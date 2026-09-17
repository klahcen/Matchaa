import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import type { Conversation } from '../types/chat';
import type { Message } from '../types/chat';
import type { Notification } from '../types/notification';
import type { IncomingCall } from '../types/call';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  unreadNotificationCount: number;
  unreadMessageCount: number;
  notifications: Notification[];
  conversations: Conversation[];
  incomingCall: IncomingCall | null;
  addNotification: (notification: Notification) => void;
  addMessage: (message: Message, conversationId: number) => void;
  incrementUnreadNotifications: () => void;
  decrementUnreadNotifications: () => void;
  incrementUnreadMessages: () => void;
  decrementUnreadMessages: () => void;
  setNotifications: (notifications: Notification[]) => void;
  setConversations: (conversations: Conversation[]) => void;
  setUnreadNotificationCount: (count: number) => void;
  setUnreadMessageCount: (count: number) => void;
  markNotificationRead: (id: number) => void;
  markConversationRead: (conversationId: number) => void;
  clearIncomingCall: () => void;
  rejectIncomingCall: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/api.*$/, '') || 'http://localhost:3000';

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const initializedRef = useRef(false);
  const conversationsRef = useRef<Conversation[]>([]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const addNotification = useCallback((notification: Notification) => {
    setNotifications((prev) => [notification, ...prev].slice(0, 100));
    setUnreadNotificationCount((prev) => prev + 1);
  }, []);

  const addMessage = useCallback((message: Message, conversationId: number) => {
    const isIncoming = message.receiver_id === user?.id;
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === conversationId
          ? {
              ...conv,
              last_message_content: message.content,
              last_message_at: message.created_at,
              last_message_sender_id: message.sender_id,
              unread_count: isIncoming ? conv.unread_count + 1 : conv.unread_count,
            }
          : conv
      )
    );
    if (isIncoming) setUnreadMessageCount((prev) => prev + 1);
  }, [user?.id]);

  const incrementUnreadNotifications = useCallback(() => {
    setUnreadNotificationCount((prev) => prev + 1);
  }, []);

  const decrementUnreadNotifications = useCallback(() => {
    setUnreadNotificationCount((prev) => Math.max(0, prev - 1));
  }, []);

  const incrementUnreadMessages = useCallback(() => {
    setUnreadMessageCount((prev) => prev + 1);
  }, []);

  const decrementUnreadMessages = useCallback(() => {
    setUnreadMessageCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markNotificationRead = useCallback((id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadNotificationCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markConversationRead = useCallback((conversationId: number) => {
    const unreadToClear = conversationsRef.current.find((c) => c.id === conversationId)?.unread_count ?? 0;
    if (unreadToClear <= 0) return;

    setConversations((prevConvs) =>
      prevConvs.map((conv) =>
        conv.id === conversationId ? { ...conv, unread_count: 0 } : conv
      )
    );
    setUnreadMessageCount((prevCount) => Math.max(0, prevCount - unreadToClear));
  }, []);

  const clearIncomingCall = useCallback(() => {
    setIncomingCall(null);
  }, []);

  const rejectIncomingCall = useCallback(() => {
    setIncomingCall((current) => {
      if (current && socketRef.current) {
        socketRef.current.emit('call:reject', { callerId: current.fromUserId, callId: current.callId });
      }
      return null;
    });
  }, []);

  useEffect(() => {
    if (isLoading || !user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
        initializedRef.current = false;
      }
      return;
    }

    if (initializedRef.current) return;
    initializedRef.current = true;

    const newSocket = io(API_ORIGIN, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true,
    });

    newSocket.on('connect', () => {
      console.log('[Socket] Connected:', newSocket.id);
      setIsConnected(true);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      setIsConnected(false);
    });

    newSocket.on('notification:new', (data: any) => {
      console.log('[Socket] Notification received:', data);
      const notification: Notification = {
        id: Date.now(),
        user_id: user.id,
        type: data.type,
        related_user_id: data.from_user?.id || data.with_user_id || null,
        content: data.content,
        is_read: false,
        created_at: data.created_at,
        related_user_first_name: data.from_user?.first_name || null,
        related_user_username: data.from_user?.username || null,
        related_user_photo_url: null,
      };
      addNotification(notification);
    });

    newSocket.on('message:new', (message: Message) => {
      console.log('[Socket] New message:', message);
      addMessage(message, message.sender_id);
    });

    newSocket.on('message:sent', (data: any) => {
      if (data.success && data.message) {
        addMessage(data.message, data.message.receiver_id);
      }
    });

    newSocket.on('call:incoming', (data: IncomingCall) => {
      console.log('[Socket] Incoming call:', data);
      setIncomingCall(data);
    });

    const clearCallIfCurrent = (data: { callId: string }) => {
      setIncomingCall((current) => (current?.callId === data.callId ? null : current));
    };

    newSocket.on('call:cancelled', clearCallIfCurrent);
    newSocket.on('call:ended', clearCallIfCurrent);
    newSocket.on('call:rejected', clearCallIfCurrent);

    newSocket.on('user:online', (data: { userId: number }) => {
      console.log('[Socket] User online:', data.userId);
    });

    newSocket.on('user:offline', (data: { userId: number }) => {
      console.log('[Socket] User offline:', data.userId);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
      initializedRef.current = false;
    };
  }, [user, isLoading, addNotification, addMessage]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        unreadNotificationCount,
        unreadMessageCount,
        notifications,
        conversations,
        incomingCall,
        addNotification,
        addMessage,
        incrementUnreadNotifications,
        decrementUnreadNotifications,
        incrementUnreadMessages,
        decrementUnreadMessages,
        setNotifications,
        setConversations,
        setUnreadNotificationCount,
        setUnreadMessageCount,
        markNotificationRead,
        markConversationRead,
        clearIncomingCall,
        rejectIncomingCall,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

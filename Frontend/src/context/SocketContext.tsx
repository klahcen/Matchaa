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
  /** The conversation open in ChatPage; its incoming messages are not counted as unread. */
  setActiveConversation: (conversationId: number | null) => void;
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
  const notificationsRef = useRef<Notification[]>([]);
  const activeConversationRef = useRef<number | null>(null);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const addNotification = useCallback((notification: Notification) => {
    if (notificationsRef.current.some((n) => n.id === notification.id)) return;
    setNotifications((prev) =>
      prev.some((n) => n.id === notification.id) ? prev : [notification, ...prev].slice(0, 100)
    );
    if (!notification.is_read) setUnreadNotificationCount((prev) => prev + 1);
  }, []);

  const setActiveConversation = useCallback((conversationId: number | null) => {
    activeConversationRef.current = conversationId;
  }, []);

  const addMessage = useCallback((message: Message, conversationId: number) => {
    // Messages arriving in the open conversation are read on arrival (ChatPage
    // tells the server via `message:read`), so they never count as unread.
    const countsAsUnread = message.receiver_id === user?.id && activeConversationRef.current !== conversationId;
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === conversationId
          ? {
              ...conv,
              last_message_content: message.content,
              last_message_at: message.created_at,
              last_message_sender_id: message.sender_id,
              unread_count: countsAsUnread ? conv.unread_count + 1 : conv.unread_count,
            }
          : conv
      )
    );
    if (countsAsUnread) setUnreadMessageCount((prev) => prev + 1);
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
    const target = notificationsRef.current.find((n) => n.id === id);
    if (!target || target.is_read) return;
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
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    // socket.io keeps retrying on its own; the UI only needs the flag.
    newSocket.on('connect_error', () => {
      setIsConnected(false);
    });

    // Every emit carries the stored row, so the real id is used for mark-as-read.
    newSocket.on('notification:new', (data: Partial<Notification> | null) => {
      if (!data || typeof data.id !== 'number' || !data.type) return;
      addNotification({
        id: data.id,
        user_id: data.user_id ?? user.id,
        type: data.type,
        related_user_id: data.related_user_id ?? null,
        content: data.content ?? '',
        is_read: Boolean(data.is_read),
        created_at: data.created_at ?? new Date().toISOString(),
        related_user_first_name: data.related_user_first_name ?? null,
        related_user_username: data.related_user_username ?? null,
        related_user_photo_url: data.related_user_photo_url ?? null,
      });
    });

    newSocket.on('message:new', (message: Message) => {
      addMessage(message, message.sender_id);
    });

    newSocket.on('message:sent', (data: any) => {
      if (data.success && data.message) {
        addMessage(data.message, data.message.receiver_id);
      }
    });

    newSocket.on('call:incoming', (data: IncomingCall) => {
      setIncomingCall(data);
    });

    const clearCallIfCurrent = (data: { callId: string }) => {
      setIncomingCall((current) => (current?.callId === data.callId ? null : current));
    };

    newSocket.on('call:cancelled', clearCallIfCurrent);
    newSocket.on('call:ended', clearCallIfCurrent);
    newSocket.on('call:rejected', clearCallIfCurrent);

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
        setActiveConversation,
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

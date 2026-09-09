import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Send, CheckCheck, Clock, Bell } from 'lucide-react';
import { chatApi } from '../api/chat';
import { notificationApi } from '../api/notification';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { resolveMediaUrl } from '../api/profile';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { PrimaryButton } from '../components/common/PrimaryButton';
import { FameBadge } from '../components/profile/FameBadge';
import type { Conversation, Message } from '../types/chat';
import type { Notification } from '../types/notification';

const MESSAGE_PAGE_SIZE = 50;

export const ChatPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const { socket, conversations, unreadMessageCount, unreadNotificationCount, setConversations, markConversationRead } = useSocket();

  const currentUserId = user?.id ?? 0;
  const targetUserId = Number.parseInt(String(userId), 10);
  const isConversationView = !!userId && Number.isInteger(targetUserId) && targetUserId > 0;

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [targetUser, setTargetUser] = useState<Conversation | null>(null);
  const [messageText, setMessageText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const loadConversations = useCallback(async () => {
    try {
      const data = await chatApi.getConversations();
      setConversations(data.conversations);
    } catch (err: any) {
      console.error('Failed to load conversations:', err);
    }
  }, [setConversations]);

  const loadUnreadCounts = useCallback(async () => {
    try {
      await Promise.all([
        chatApi.getUnreadCount(),
        notificationApi.getUnreadCount(),
      ]);
      // The socket context will manage these counts via real-time events
      // This is just for initial load
    } catch (err) {
      console.error('Failed to load unread counts:', err);
    }
  }, []);

  const loadMessages = useCallback(async (reset = false) => {
    if (!targetUser || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const beforeId = reset ? undefined : messages[0]?.id;
      const data = await chatApi.getMessages(targetUser.id, { limit: MESSAGE_PAGE_SIZE, beforeId });
      const newMessages = data.messages;
      if (reset || !beforeId) {
        setMessages(newMessages);
      } else {
        setMessages((prev) => [...newMessages, ...prev]);
      }
      setHasMore(newMessages.length === MESSAGE_PAGE_SIZE);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load messages');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [targetUser, messages]);

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const data = await notificationApi.getNotifications({ limit: 30 });
      setNotifications(data.notifications);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
    loadUnreadCounts();
  }, [loadConversations, loadUnreadCounts]);

  useEffect(() => {
    if (isConversationView) {
      if (targetUserId === currentUserId) {
        navigate('/chat');
        return;
      }
      const conv = conversations.find((c) => c.id === targetUserId);
      if (conv) {
        setTargetUser(conv);
        setMessages([]);
        loadMessages(true);
        markConversationRead(targetUserId);
      } else {
        setError('Conversation not found or you are no longer connected');
        setLoading(false);
      }
    } else {
      setTargetUser(null);
      setMessages([]);
      setLoading(false);
    }
  }, [userId, conversations, currentUserId, isConversationView, targetUserId, loadMessages, markConversationRead, navigate]);

  const handleSendMessage = useCallback(async () => {
    if (!targetUser || !messageText.trim() || sending || !socket) return;

    const content = messageText.trim();
    setMessageText('');
    setSending(true);

    socket.emit('message:send', { receiverId: targetUser.id, content }, (response: any) => {
      setSending(false);
      if (!response.success) {
        setError(response.error || 'Failed to send message');
        setMessageText(content);
      }
    });
  }, [targetUser, messageText, sending, socket]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleScroll = useCallback(() => {
    if (messagesContainerRef.current && messagesContainerRef.current.scrollTop === 0 && hasMore && !loadingRef.current) {
      loadMessages(false);
    }
  }, [hasMore, loadMessages]);

  const formatMessageTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatNotificationTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'like': return <MessageCircle className="w-5 h-5 text-brand-accent" fill="currentColor" />;
      case 'view': return <MessageCircle className="w-5 h-5 text-brand-muted" />;
      case 'message': return <MessageCircle className="w-5 h-5 text-green-500" fill="currentColor" />;
      case 'new_connection': return <MessageCircle className="w-5 h-5 text-brand-accent" fill="currentColor" />;
      case 'unlike': return <Clock className="w-5 h-5 text-brand-muted" />;
      default: return <Bell className="w-5 h-5 text-brand-muted" />;
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (notification.related_user_id) {
      if (notification.type === 'message') {
        navigate(`/chat/${notification.related_user_id}`);
      } else {
        navigate(`/profile/${notification.related_user_id}`);
      }
    }
    await notificationApi.markAsRead(notification.id);
    setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)));
    setShowNotifications(false);
  };

  const handleMarkAllRead = async () => {
    await notificationApi.markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  if (loading && !isConversationView) {
    return (
      <div className="min-h-screen w-full bg-brand-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-brand-bg flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-gradient-to-br from-brand-start via-brand-mid to-brand-end shadow-lg">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Link to="/browse" className="text-xl sm:text-2xl font-black tracking-tight text-white">
              matcha
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {/* Notifications Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  if (!showNotifications) loadNotifications();
                }}
                className="relative w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
                aria-label={`Notifications${unreadNotificationCount > 0 ? `, ${unreadNotificationCount} unread` : ''}`}
              >
                <Bell className="w-5 h-5" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-brand-error-text text-white text-[10px] font-black rounded-full flex items-center justify-center">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-brand-surface rounded-2xl shadow-xl border border-brand-border overflow-hidden z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
                    <h3 className="font-black text-brand-text">Notifications</h3>
                    {notifications.some((n) => !n.is_read) && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-xs font-semibold text-brand-accent hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notificationsLoading ? (
                      <div className="p-4 text-center text-brand-muted">Loading...</div>
                    ) : notifications.length === 0 ? (
                      <div className="p-4 text-center text-brand-muted">No notifications yet</div>
                    ) : (
                      <ul className="divide-y divide-brand-border">
                        {notifications.map((n) => (
                          <li
                            key={n.id}
                            onClick={() => handleNotificationClick(n)}
                            className={`px-4 py-3 hover:bg-brand-bg transition-colors cursor-pointer flex items-start gap-3 ${
                              !n.is_read ? 'bg-brand-accent/5' : ''
                            }`}
                          >
                            <div className="flex-shrink-0 mt-0.5">{getNotificationIcon(n.type)}</div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm ${!n.is_read ? 'font-semibold text-brand-text' : 'text-brand-muted'}`}>
                                {n.content}
                              </p>
                              <p className="text-[11px] text-brand-muted mt-0.5">{formatNotificationTime(n.created_at)}</p>
                            </div>
                            {!n.is_read && <div className="w-2 h-2 rounded-full bg-brand-accent flex-shrink-0 mt-2" />}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Messages Indicator */}
            <Link to="/chat" className="relative w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors" aria-label={`Messages${unreadMessageCount > 0 ? `, ${unreadMessageCount} unread` : ''}`}>
              <MessageCircle className="w-5 h-5" />
              {unreadMessageCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-brand-error-text text-white text-[10px] font-black rounded-full flex items-center justify-center">
                  {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6">
        {error && (
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        )}

        {isConversationView ? (
          /* Conversation View */
          <div className="h-[calc(100vh-200px)] min-h-[500px] bg-brand-surface rounded-3xl shadow-md border border-brand-border flex flex-col overflow-hidden">
            {/* Conversation Header */}
            {targetUser && (
              <div className="flex items-center gap-3 px-4 py-3 border-b border-brand-border bg-brand-bg/50">
                <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                  {targetUser.photo_url ? (
                    <img src={resolveMediaUrl(targetUser.photo_url) ?? ''} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-brand-start/15 via-brand-mid/15 to-brand-end/15 flex items-center justify-center">
                      <span className="text-2xl font-black text-brand-accent/50">
                        {targetUser.first_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <Link to={`/profile/${targetUser.id}`} className="block">
                    <p className="font-black text-brand-text truncate">{targetUser.first_name} {targetUser.last_name}</p>
                  </Link>
                  <p className="text-xs text-brand-muted">@{targetUser.username}</p>
                </div>
                <FameBadge rating={0} size="sm" />
              </div>
            )}

            {/* Messages */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-4"
              onScroll={handleScroll}
            >
              {hasMore && messages.length > 0 && (
                <div className="text-center text-xs text-brand-muted py-2">
                  Scroll up for more messages
                </div>
              )}
              {messages.length === 0 && !loading && (
                <div className="flex-1 flex items-center justify-center text-brand-muted text-sm">
                  No messages yet. Start the conversation!
                </div>
              )}
              {messages.map((msg) => {
                const isOwn = msg.sender_id === currentUserId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'} animate-fade-in`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                        isOwn
                          ? 'bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white rounded-br-md'
                          : 'bg-brand-bg text-brand-text rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px]">
                        <span className={isOwn ? 'text-white/70' : 'text-brand-muted'}>
                          {formatMessageTime(msg.created_at)}
                        </span>
                        {isOwn && msg.read_at && (
                          <CheckCheck className="w-3.5 h-3.5 text-white/70" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            {targetUser && (
              <div className="px-4 py-3 border-t border-brand-border bg-brand-bg/50">
                <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    disabled={sending}
                    className="flex-1 min-h-[44px] px-4 py-2 rounded-full bg-brand-bg border border-brand-border text-brand-text placeholder:text-brand-muted/60 focus:outline-none focus:ring-2 focus:ring-brand-accent/40 disabled:opacity-50"
                    maxLength={5000}
                  />
                  <button
                    type="submit"
                    disabled={sending || !messageText.trim()}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white flex items-center justify-center hover:brightness-105 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
                    aria-label="Send message"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>
            )}
          </div>
        ) : (
          /* Conversations List */
          <div className="bg-brand-surface rounded-3xl shadow-md border border-brand-border overflow-hidden">
            <div className="px-5 py-4 border-b border-brand-border flex items-center justify-between">
              <h1 className="text-xl font-black text-brand-text">Messages</h1>
              {unreadMessageCount > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-brand-accent/10 text-brand-accent text-xs font-black">
                  {unreadMessageCount} unread
                </span>
              )}
            </div>
            {conversations.length === 0 ? (
              <div className="p-8 text-center">
                <MessageCircle className="w-16 h-16 text-brand-muted/30 mx-auto mb-4" />
                <h2 className="text-lg font-black text-brand-text mb-1">No conversations yet</h2>
                <p className="text-sm text-brand-muted mb-6">Connect with someone to start chatting</p>
                <Link to="/browse">
                  <PrimaryButton type="button">Browse members</PrimaryButton>
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-brand-border">
                {conversations.map((conv) => (
                  <li key={conv.id}>
                    <Link
                      to={`/chat/${conv.id}`}
                      className="block p-4 hover:bg-brand-bg transition-colors flex items-center gap-3"
                    >
                      <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                        {conv.photo_url ? (
                          <img src={resolveMediaUrl(conv.photo_url) ?? ''} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-brand-start/15 via-brand-mid/15 to-brand-end/15 flex items-center justify-center">
                            <span className="text-2xl font-black text-brand-accent/50">
                              {conv.first_name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        {conv.unread_count > 0 && (
                          <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-brand-error-text text-white text-[10px] font-black rounded-full flex items-center justify-center">
                            {conv.unread_count > 9 ? '9+' : conv.unread_count}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-brand-text truncate pr-2">
                            {conv.first_name} {conv.last_name}
                          </p>
                          {conv.last_message_at && (
                            <span className="text-xs text-brand-muted whitespace-nowrap">
                              {formatNotificationTime(conv.last_message_at)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-sm text-brand-muted truncate pr-2">
                            {conv.last_message_content || 'No messages yet'}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
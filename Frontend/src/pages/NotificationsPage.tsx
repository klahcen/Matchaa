import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CalendarDays, CheckCheck, Heart, MessageCircle, UserRoundCheck, Eye, Clock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { notificationApi } from '../api/notification';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { useSocket } from '../context/SocketContext';
import type { Notification } from '../types/notification';

const iconFor = (type: Notification['type']) => {
  switch (type) {
    case 'like':
      return <Heart className="w-5 h-5 text-brand-accent" fill="currentColor" />;
    case 'view':
      return <Eye className="w-5 h-5 text-brand-muted" />;
    case 'message':
      return <MessageCircle className="w-5 h-5 text-green-500" fill="currentColor" />;
    case 'new_connection':
      return <UserRoundCheck className="w-5 h-5 text-brand-accent" />;
    case 'unlike':
      return <Clock className="w-5 h-5 text-brand-muted" />;
    case 'date_proposed':
    case 'date_response':
      return <CalendarDays className="w-5 h-5 text-brand-accent" />;
    default:
      return <Bell className="w-5 h-5 text-brand-muted" />;
  }
};

const formatTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    notifications,
    setNotifications,
    setUnreadNotificationCount,
    markNotificationRead,
  } = useSocket();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [list, unread] = await Promise.all([
        notificationApi.getNotifications({ limit: 100, signal }),
        notificationApi.getUnreadCount(),
      ]);
      setNotifications(list.notifications);
      setUnreadNotificationCount(unread.unread_count);
    } catch (err: any) {
      if (signal?.aborted) return;
      setError(err?.message || 'Failed to load notifications');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [setNotifications, setUnreadNotificationCount]);

  useEffect(() => {
    const controller = new AbortController();
    void loadNotifications(controller.signal);
    return () => controller.abort();
  }, [loadNotifications]);

  const openNotification = async (notification: Notification) => {
    if (!notification.is_read) {
      try {
        await notificationApi.markAsRead(notification.id);
        markNotificationRead(notification.id);
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }

    if (notification.related_user_id) {
      navigate(notification.type === 'message' ? `/chat/${notification.related_user_id}` : `/profile/${notification.related_user_id}`);
    }
  };

  const markAll = async () => {
    try {
      await notificationApi.markAllAsRead();
      setNotifications(notifications.map((notification) => ({ ...notification, is_read: true })));
      setUnreadNotificationCount(0);
    } catch (err: any) {
      setError(err?.message || 'Failed to mark notifications as read');
    }
  };

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  return (
    <div className="min-h-screen w-full bg-brand-bg">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="bg-brand-surface rounded-3xl shadow-md border border-brand-border overflow-hidden">
          <div className="px-5 sm:px-7 py-5 border-b border-brand-border flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-brand-text">Notifications</h1>
              <p className="text-sm text-brand-muted mt-1">
                {unreadCount > 0 ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : 'All caught up'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-accent text-white text-xs font-black uppercase tracking-wider hover:shadow-lg transition-shadow"
              >
                <CheckCheck className="w-4 h-4" /> Mark all read
              </button>
            )}
          </div>

          <div className="p-5 sm:p-7">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-10 h-10 border-4 border-brand-border border-t-brand-accent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto rounded-full bg-brand-bg flex items-center justify-center text-brand-muted mb-3">
                  <Bell className="w-8 h-8" />
                </div>
                <h2 className="font-black text-brand-text">No notifications yet</h2>
                <p className="text-sm text-brand-muted mt-1">Likes, profile views, matches, and messages will appear here.</p>
                <Link to="/browse" className="inline-flex mt-5 px-5 py-2.5 rounded-full border border-brand-accent text-brand-accent text-sm font-bold hover:bg-brand-accent hover:text-white transition-colors">
                  Browse members
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-brand-border">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                      className={`w-full text-left px-3 py-4 rounded-2xl flex items-start gap-3 hover:bg-brand-bg transition-colors ${
                        !notification.is_read ? 'bg-brand-accent/5' : ''
                      }`}
                    >
                      <span className="shrink-0 mt-0.5">{iconFor(notification.type)}</span>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-sm ${!notification.is_read ? 'font-bold text-brand-text' : 'text-brand-muted'}`}>
                          {notification.content}
                        </span>
                        <span className="block text-xs text-brand-muted mt-1">
                          {formatTime(notification.created_at)}
                          {notification.related_user_username ? ` · @${notification.related_user_username}` : ''}
                        </span>
                      </span>
                      {!notification.is_read && <span className="w-2.5 h-2.5 rounded-full bg-brand-accent mt-2 shrink-0" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

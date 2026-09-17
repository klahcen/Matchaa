import React, { useEffect } from 'react';
import { Bell, MapPin, MessageCircle, Search } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { chatApi } from '../../api/chat';
import { notificationApi } from '../../api/notification';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

const badgeText = (count: number): string => (count > 99 ? '99+' : String(count));

export const AppHeader: React.FC = () => {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const {
    unreadMessageCount,
    unreadNotificationCount,
    setUnreadMessageCount,
    setUnreadNotificationCount,
  } = useSocket();

  useEffect(() => {
    if (!user) return;
    let active = true;

    const loadUnreadCounts = async () => {
      try {
        const [messages, notifications] = await Promise.all([
          chatApi.getUnreadCount(),
          notificationApi.getUnreadCount(),
        ]);
        if (!active) return;
        setUnreadMessageCount(messages.unread_count);
        setUnreadNotificationCount(notifications.unread_count);
      } catch (err) {
        console.error('Failed to load unread counters:', err);
      }
    };

    void loadUnreadCounts();
    return () => {
      active = false;
    };
  }, [setUnreadMessageCount, setUnreadNotificationCount, user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `text-xs sm:text-sm font-bold uppercase tracking-wider transition-colors ${
      isActive ? 'text-white' : 'text-white/80 hover:text-white'
    }`;

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-[68px] bg-gradient-to-br from-brand-start via-brand-mid to-brand-end shadow-lg">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-3">
        <Link to="/browse" className="text-xl sm:text-2xl font-black tracking-tight text-white shrink-0">
          matcha
        </Link>

        <nav className="flex items-center justify-end gap-2 sm:gap-4 min-w-0">
          <NavLink to="/browse" className={navClass}>
            Browse
          </NavLink>
          <NavLink to="/research" className={navClass}>
            <span className="hidden sm:inline">Research</span>
            <Search className="w-5 h-5 sm:hidden" aria-label="Research" />
          </NavLink>
          <NavLink to="/map" className={navClass}>
            <span className="hidden sm:inline">Map</span>
            <MapPin className="w-5 h-5 sm:hidden" aria-label="Map" />
          </NavLink>
          <NavLink
            to="/chat"
            className={({ isActive }) =>
              `relative w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors ${
                isActive ? 'ring-2 ring-white/60' : ''
              }`
            }
            aria-label={`Chat${unreadMessageCount > 0 ? `, ${unreadMessageCount} unread` : ''}`}
          >
            <MessageCircle className="w-5 h-5" />
            {unreadMessageCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-brand-error-text text-white text-[10px] font-black rounded-full flex items-center justify-center">
                {badgeText(unreadMessageCount)}
              </span>
            )}
          </NavLink>
          <NavLink
            to="/notifications"
            className={({ isActive }) =>
              `relative w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors ${
                isActive ? 'ring-2 ring-white/60' : ''
              }`
            }
            aria-label={`Notifications${unreadNotificationCount > 0 ? `, ${unreadNotificationCount} unread` : ''}`}
          >
            <Bell className="w-5 h-5" />
            {unreadNotificationCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-brand-error-text text-white text-[10px] font-black rounded-full flex items-center justify-center">
                {badgeText(unreadNotificationCount)}
              </span>
            )}
          </NavLink>
          <NavLink to="/profile" className={navClass}>
            <span className="hidden sm:inline">My profile</span>
            <span className="sm:hidden">Me</span>
          </NavLink>
          <button
            type="button"
            onClick={handleLogout}
            className="text-white/80 hover:text-white text-xs sm:text-sm font-bold uppercase tracking-wider transition-colors"
          >
            <span className="hidden sm:inline">Sign out</span>
            <span className="sm:hidden">Out</span>
          </button>
        </nav>
      </div>
    </header>
  );
};

import React, { useEffect, useState } from 'react';
import { Bell, Compass, LogOut, MapPin, Menu, MessageCircle, Search, UserRound, X } from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { chatApi } from '../../api/chat';
import { notificationApi } from '../../api/notification';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

const badgeText = (count: number): string => (count > 99 ? '99+' : String(count));

const NAV_ITEMS = [
  { to: '/browse', label: 'Browse', icon: Compass },
  { to: '/research', label: 'Research', icon: Search },
  { to: '/map', label: 'Map', icon: MapPin },
  { to: '/profile', label: 'My profile', icon: UserRound },
] as const;

/**
 * Signed-in header.
 *
 * md and up: text navigation, chat/notification icons and Sign out inline.
 * Below md: the text links collapse into a drawer behind the hamburger, while
 * chat, notifications (with their unread badges) and a one-click Sign out icon
 * stay visible in the bar at every width down to 320px.
 */
export const AppHeader: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { logout, user } = useAuth();
  const {
    unreadMessageCount,
    unreadNotificationCount,
    setUnreadMessageCount,
    setUnreadNotificationCount,
  } = useSocket();

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPath, setMenuPath] = useState(pathname);

  // Close the drawer whenever the route changes (render-phase adjustment, so
  // no effect is needed and the closed drawer never flashes on the new page).
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }

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
        setUnreadMessageCount(messages?.unread_count ?? 0);
        setUnreadNotificationCount(notifications?.unread_count ?? 0);
      } catch {
        // Badges are a convenience: on failure they keep their last value and
        // the live socket events still update them.
      }
    };

    void loadUnreadCounts();
    return () => {
      active = false;
    };
  }, [setUnreadMessageCount, setUnreadNotificationCount, user]);

  // Escape closes the drawer; growing past the md breakpoint does too.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth >= 768) setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [menuOpen]);

  // logout() never throws, so this cannot produce an unhandled rejection.
  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-bold uppercase tracking-wider transition-colors ${
      isActive ? 'text-white' : 'text-white/80 hover:text-white'
    }`;

  const iconButtonClass = ({ isActive }: { isActive: boolean }) =>
    `relative w-10 h-10 shrink-0 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors ${
      isActive ? 'ring-2 ring-white/60' : ''
    }`;

  const badge = (count: number) =>
    count > 0 && (
      <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-brand-error-text text-white text-[10px] font-black rounded-full flex items-center justify-center">
        {badgeText(count)}
      </span>
    );

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-[68px] bg-gradient-to-br from-brand-start via-brand-mid to-brand-end shadow-lg">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-3">
        <Link to="/browse" className="text-xl sm:text-2xl font-black tracking-tight text-white shrink-0">
          matcha
        </Link>

        <div className="flex items-center justify-end gap-2 sm:gap-3 lg:gap-4 min-w-0">
          {/* Text navigation: md and up only */}
          <nav aria-label="Main" className="hidden md:flex items-center gap-4 lg:gap-6 mr-1 lg:mr-2">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/profile'} className={navClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Always visible, at every width */}
          <NavLink
            to="/chat"
            className={iconButtonClass}
            aria-label={`Chat${unreadMessageCount > 0 ? `, ${unreadMessageCount} unread` : ''}`}
          >
            <MessageCircle className="w-5 h-5" />
            {badge(unreadMessageCount)}
          </NavLink>
          <NavLink
            to="/notifications"
            className={iconButtonClass}
            aria-label={`Notifications${unreadNotificationCount > 0 ? `, ${unreadNotificationCount} unread` : ''}`}
          >
            <Bell className="w-5 h-5" />
            {badge(unreadNotificationCount)}
          </NavLink>

          {/* One-click sign out: an icon on small screens, icon + label on large ones */}
          <button
            type="button"
            onClick={() => void handleLogout()}
            aria-label="Sign out"
            title="Sign out"
            className="w-10 h-10 lg:w-auto lg:px-4 shrink-0 rounded-full bg-white/15 hover:bg-white/25 lg:bg-transparent lg:hover:bg-white/15 text-white/90 hover:text-white flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wider transition-colors"
          >
            <LogOut className="w-5 h-5 lg:w-4 lg:h-4" />
            <span className="hidden lg:inline">Sign out</span>
          </button>

          {/* Drawer toggle: below md only */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="app-mobile-menu"
            className="md:hidden w-10 h-10 shrink-0 rounded-full text-white hover:bg-white/15 flex items-center justify-center transition-colors"
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
            className="md:hidden fixed inset-0 top-[68px] z-30 bg-black/30 backdrop-blur-[2px] cursor-default"
          />
          <nav
            id="app-mobile-menu"
            aria-label="Main"
            className="md:hidden absolute top-[68px] left-0 right-0 z-40 bg-brand-surface border-b border-brand-border shadow-xl px-4 py-3"
          >
            <ul className="flex flex-col">
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/profile'}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 min-h-[48px] px-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-colors ${
                        isActive
                          ? 'text-brand-accent bg-brand-accent/10'
                          : 'text-brand-text hover:text-brand-accent hover:bg-brand-bg'
                      }`
                    }
                  >
                    <Icon className="w-5 h-5" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </header>
  );
};

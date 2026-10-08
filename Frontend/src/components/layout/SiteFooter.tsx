import React from 'react';
import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BrandMark } from './BrandMark';

interface SiteFooterProps {
  /** 'light' under the app pages, 'dark' under the public/auth pages (matches the landing footer). */
  variant?: 'light' | 'dark';
}

/**
 * Compact site footer shared by the signed-in app layout and the public/auth
 * layout. The landing page keeps its larger marketing footer.
 */
export const SiteFooter: React.FC<SiteFooterProps> = ({ variant = 'light' }) => {
  const { user } = useAuth();
  const year = new Date().getFullYear();
  const dark = variant === 'dark';

  const links = user
    ? [
        { to: '/browse', label: 'Browse' },
        { to: '/research', label: 'Research' },
        { to: '/map', label: 'Map' },
        { to: '/profile', label: 'My profile' },
      ]
    : [
        { to: '/', label: 'Home' },
        { to: '/login', label: 'Sign in' },
        { to: '/register', label: 'Create account' },
      ];

  return (
    <footer
      className={
        dark
          ? 'bg-neutral-950 text-neutral-400 border-t border-neutral-900'
          : 'bg-brand-surface text-brand-muted border-t border-brand-border'
      }
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <Link to={user ? '/browse' : '/'} aria-label="Matcha home" className="shrink-0">
          <BrandMark size="sm" tone={dark ? 'light' : 'gradient'} />
        </Link>

        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-bold uppercase tracking-wider">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`transition-colors ${dark ? 'hover:text-white' : 'hover:text-brand-accent'}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className={`text-xs text-center md:text-right ${dark ? 'text-neutral-500' : 'text-brand-muted'}`}>
          © {year} Matcha · Built with{' '}
          <Heart className="inline w-3.5 h-3.5 -mt-0.5 text-brand-accent fill-brand-accent" aria-label="love" />{' '}
          for authentic connections.
        </p>
      </div>
    </footer>
  );
};

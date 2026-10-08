import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BrandMark } from './BrandMark';
import { SiteFooter } from './SiteFooter';

const ghostLink =
  'inline-flex items-center min-h-[40px] px-3 text-sm font-bold text-white/90 hover:text-white transition-colors';
const pillLink =
  'inline-flex items-center min-h-[40px] px-5 rounded-full bg-white text-brand-accent text-sm font-bold shadow-md shadow-black/10 hover:scale-105 active:scale-95 transition-all duration-200';

/**
 * Shell for the public/auth pages (sign in, register, forgot/reset password,
 * email verification): a simple header with the brand and the relevant
 * account link, the page itself as <main>, and the shared footer.
 */
export const PublicLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const { user } = useAuth();

  const onLogin = pathname.startsWith('/login');
  const onRegister = pathname.startsWith('/register');

  return (
    <div className="min-h-screen w-full flex flex-col bg-gradient-to-br from-brand-start via-brand-mid to-brand-end">
      <header className="w-full border-b border-white/10 bg-black/10 backdrop-blur-xs">
        <div className="max-w-7xl mx-auto h-[68px] px-4 sm:px-6 flex items-center justify-between gap-3">
          <Link to="/" aria-label="Matcha home" className="shrink-0 group">
            <span className="inline-block group-hover:scale-[1.03] transition-transform duration-200">
              <BrandMark />
            </span>
          </Link>

          <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
            {user ? (
              // Reachable while signed in, e.g. confirming an email change.
              <Link to="/browse" className={pillLink}>
                Back to Matcha
              </Link>
            ) : (
              <>
                {!onLogin && (
                  <Link to="/login" className={onRegister ? pillLink : `${ghostLink} hidden min-[400px]:inline-flex`}>
                    Sign in
                  </Link>
                )}
                {!onRegister && (
                  <Link to="/register" className={pillLink}>
                    Create account
                  </Link>
                )}
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full flex items-center justify-center p-4 sm:p-6">{children}</main>

      <SiteFooter variant="dark" />
    </div>
  );
};

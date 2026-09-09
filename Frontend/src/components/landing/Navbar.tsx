import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

export const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 30) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu when screen resizes to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-brand-surface/95 backdrop-blur-md shadow-sm border-b border-brand-border py-3.5'
          : 'bg-black/20 backdrop-blur-xs border-b border-white/10 py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand Logo */}
        <Link
          to="/"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-2.5 group select-none"
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-start via-brand-mid to-brand-end flex items-center justify-center shadow-md shadow-brand-accent/25 group-hover:scale-105 transition-transform duration-200">
            {/* Matcha Flame Icon */}
            <svg
              className="w-5 h-5 text-white fill-current"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12.784 1.442c-.224-.59-1.077-.59-1.301 0C10.024 5.3 4.28 10.457 4.28 15.228 4.28 19.52 7.74 23 12 23s7.72-3.48 7.72-7.772c0-4.77-5.744-9.928-6.936-13.786zm-1.03 18.067c-2.348 0-4.252-1.904-4.252-4.252 0-2.228 2.37-5.064 3.864-7.22.18-.26.596-.26.776 0 1.494 2.156 3.864 4.992 3.864 7.22 0 2.348-1.904 4.252-4.252 4.252z" />
            </svg>
          </div>
          <span
            className={`text-2xl font-black tracking-tight transition-colors duration-200 ${
              isScrolled
                ? 'text-transparent bg-clip-text bg-gradient-to-r from-brand-start to-brand-end'
                : 'text-white'
            }`}
          >
            matcha
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8">
          <a
            href="#how-it-works"
            className={`text-sm font-semibold transition-colors duration-200 hover:text-brand-accent ${
              isScrolled ? 'text-brand-text' : 'text-white/90 hover:text-white'
            }`}
          >
            How It Works
          </a>
          <a
            href="#features"
            className={`text-sm font-semibold transition-colors duration-200 hover:text-brand-accent ${
              isScrolled ? 'text-brand-text' : 'text-white/90 hover:text-white'
            }`}
          >
            Features
          </a>
          <a
            href="#safety"
            className={`text-sm font-semibold transition-colors duration-200 hover:text-brand-accent ${
              isScrolled ? 'text-brand-text' : 'text-white/90 hover:text-white'
            }`}
          >
            Safety
          </a>
          <Link
            to="/login"
            className={`text-sm font-bold transition-colors duration-200 hover:text-brand-accent ${
              isScrolled ? 'text-brand-text' : 'text-white hover:text-rose-200'
            }`}
          >
            Log In
          </Link>
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            to="/register"
            className="px-6 py-2.5 rounded-full font-bold text-sm text-white bg-gradient-to-br from-brand-start via-brand-mid to-brand-end shadow-md shadow-brand-accent/25 hover:shadow-lg hover:shadow-brand-accent/35 hover:scale-105 active:scale-95 transition-all duration-200"
          >
            Sign Up
          </Link>
        </div>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          className={`md:hidden p-2 rounded-xl transition-colors focus:outline-none ${
            isScrolled
              ? 'text-brand-text hover:bg-brand-bg'
              : 'text-white hover:bg-white/10'
          }`}
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-brand-surface/98 backdrop-blur-xl border-b border-brand-border shadow-xl px-6 py-6 transition-all duration-300">
          <nav className="flex flex-col gap-4 text-left">
            <a
              href="#how-it-works"
              onClick={closeMenu}
              className="text-base font-semibold text-brand-text hover:text-brand-accent py-2 border-b border-brand-border transition-colors"
            >
              How It Works
            </a>
            <a
              href="#features"
              onClick={closeMenu}
              className="text-base font-semibold text-brand-text hover:text-brand-accent py-2 border-b border-brand-border transition-colors"
            >
              Features
            </a>
            <a
              href="#safety"
              onClick={closeMenu}
              className="text-base font-semibold text-brand-text hover:text-brand-accent py-2 border-b border-brand-border transition-colors"
            >
              Safety
            </a>
            <Link
              to="/login"
              onClick={closeMenu}
              className="text-base font-semibold text-brand-text hover:text-brand-accent py-2 border-b border-brand-border transition-colors"
            >
              Log In
            </Link>

            <div className="pt-3 flex flex-col gap-2.5">
              <Link
                to="/register"
                onClick={closeMenu}
                className="w-full text-center py-3.5 rounded-full font-bold text-white bg-gradient-to-br from-brand-start via-brand-mid to-brand-end shadow-md shadow-brand-accent/25 active:scale-98 transition-all"
              >
                Create Account
              </Link>
              <Link
                to="/login"
                onClick={closeMenu}
                className="w-full text-center py-3.5 rounded-full font-bold text-brand-text bg-brand-bg hover:bg-brand-border active:scale-98 transition-all"
              >
                Sign In
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

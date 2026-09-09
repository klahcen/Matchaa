import React from 'react';
import { Link } from 'react-router-dom';
import { Globe, Share2, Mail, MessageCircle, Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-neutral-950 text-neutral-400 border-t border-neutral-900 pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8 mb-12">
          {/* Brand & Mission Column */}
          <div className="lg:col-span-2 space-y-4">
            <Link
              to="/"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="inline-flex items-center gap-2.5 group"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-start via-brand-mid to-brand-end flex items-center justify-center shadow-md shadow-brand-accent/25 group-hover:scale-105 transition-transform duration-200">
                <svg
                  className="w-5 h-5 text-white fill-current"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M12.784 1.442c-.224-.59-1.077-.59-1.301 0C10.024 5.3 4.28 10.457 4.28 15.228 4.28 19.52 7.74 23 12 23s7.72-3.48 7.72-7.772c0-4.77-5.744-9.928-6.936-13.786zm-1.03 18.067c-2.348 0-4.252-1.904-4.252-4.252 0-2.228 2.37-5.064 3.864-7.22.18-.26.596-.26.776 0 1.494 2.156 3.864 4.992 3.864 7.22 0 2.348-1.904 4.252-4.252 4.252z" />
                </svg>
              </div>
              <span className="text-2xl font-black tracking-tight text-white">
                matcha
              </span>
            </Link>

            <p className="text-sm text-neutral-400 max-w-sm leading-relaxed">
              Matcha connects people who share your energy, your humor, and your passions. 
              Modern dating designed for authentic, respectful chemistry.
            </p>

            {/* Social channels (Lucide icons) */}
            <div className="flex items-center gap-3 pt-2">
              <a
                href="#social"
                aria-label="Global Community"
                className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white hover:border-neutral-700 hover:scale-105 transition-all"
              >
                <Globe className="w-4 h-4" />
              </a>
              <a
                href="#social"
                aria-label="Community Discussions"
                className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white hover:border-neutral-700 hover:scale-105 transition-all"
              >
                <MessageCircle className="w-4 h-4" />
              </a>
              <a
                href="#social"
                aria-label="Share Matcha"
                className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white hover:border-neutral-700 hover:scale-105 transition-all"
              >
                <Share2 className="w-4 h-4" />
              </a>
              <a
                href="#social"
                aria-label="Contact Support"
                className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white hover:border-neutral-700 hover:scale-105 transition-all"
              >
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Navigation Column 1: Company */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-200">
              Company
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#how-it-works" className="hover:text-white transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-white transition-colors">
                  Feature Tour
                </a>
              </li>
              <li>
                <span className="text-neutral-500 hover:text-neutral-400 cursor-pointer transition-colors">
                  Careers
                </span>
              </li>
              <li>
                <span className="text-neutral-500 hover:text-neutral-400 cursor-pointer transition-colors">
                  Press & Media
                </span>
              </li>
            </ul>
          </div>

          {/* Navigation Column 2: Safety & Trust */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-200">
              Safety & Trust
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#safety" className="hover:text-white transition-colors">
                  Safety Guidelines
                </a>
              </li>
              <li>
                <span className="text-neutral-500 hover:text-neutral-400 cursor-pointer transition-colors">
                  Community Standards
                </span>
              </li>
              <li>
                <span className="text-neutral-500 hover:text-neutral-400 cursor-pointer transition-colors">
                  Verification Process
                </span>
              </li>
              <li>
                <span className="text-neutral-500 hover:text-neutral-400 cursor-pointer transition-colors">
                  Report an Issue
                </span>
              </li>
            </ul>
          </div>

          {/* Navigation Column 3: Legal & Auth */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-200">
              Legal & Access
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/register" className="text-brand-start hover:text-brand-mid transition-colors font-medium">
                  Create Account
                </Link>
              </li>
              <li>
                <Link to="/login" className="hover:text-white transition-colors">
                  Member Sign In
                </Link>
              </li>
              <li>
                <span className="text-neutral-500 hover:text-neutral-400 cursor-pointer transition-colors">
                  Privacy Policy
                </span>
              </li>
              <li>
                <span className="text-neutral-500 hover:text-neutral-400 cursor-pointer transition-colors">
                  Terms of Service
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright and disclaimer */}
        <div className="pt-8 border-t border-neutral-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <p>© {currentYear} Matcha, Inc. All rights reserved.</p>
          <div className="flex items-center gap-1">
            <span>Built with</span>
            <Heart className="w-3.5 h-3.5 text-brand-accent fill-brand-accent inline" />
            <span>for authentic modern connections.</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

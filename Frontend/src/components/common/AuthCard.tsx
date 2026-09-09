import React from 'react';

interface AuthCardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const AuthCard: React.FC<AuthCardProps> = ({
  title,
  subtitle,
  children,
  footer,
}) => {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-brand-start via-brand-mid to-brand-end">
      {/* Centered responsive card with Tinder-styled soft shadow and rounded corners */}
      <div className="w-full max-w-md bg-brand-surface rounded-3xl shadow-2xl p-6 sm:p-9 flex flex-col transition-all duration-300">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-brand-start via-brand-mid to-brand-end shadow-md shadow-brand-accent/25 mb-3 transform hover:scale-105 transition-transform duration-200">
            {/* Tinder-style flame icon */}
            <svg
              className="w-8 h-8 text-white fill-current"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12.784 1.442c-.224-.59-1.077-.59-1.301 0C10.024 5.3 4.28 10.457 4.28 15.228 4.28 19.52 7.74 23 12 23s7.72-3.48 7.72-7.772c0-4.77-5.744-9.928-6.936-13.786zm-1.03 18.067c-2.348 0-4.252-1.904-4.252-4.252 0-2.228 2.37-5.064 3.864-7.22.18-.26.596-.26.776 0 1.494 2.156 3.864 4.992 3.864 7.22 0 2.348-1.904 4.252-4.252 4.252z" />
            </svg>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-brand-start to-brand-end">
            matcha
          </h1>

          {title && (
            <h2 className="text-xl font-bold text-brand-text mt-2">
              {title}
            </h2>
          )}

          {subtitle && (
            <p className="text-sm text-brand-muted mt-1 max-w-xs">
              {subtitle}
            </p>
          )}
        </div>

        {/* Card Body */}
        <div className="flex-1">{children}</div>

        {/* Optional Footer Slot */}
        {footer && <div className="mt-6 pt-5 border-t border-brand-border text-center">{footer}</div>}
      </div>
    </div>
  );
};

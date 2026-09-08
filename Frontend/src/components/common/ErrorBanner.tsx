import React from 'react';

interface ErrorBannerProps {
  message?: string | null;
  onDismiss?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onDismiss }) => {
  if (!message) return null;

  return (
    <div className="w-full bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-2xl p-3.5 flex items-start gap-3 mb-4 transition-all duration-200">
      <div className="shrink-0 mt-0.5 text-rose-500">
        <svg className="w-5 h-5 fill-current" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      <div className="flex-1 font-medium text-xs sm:text-sm leading-snug">{message}</div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-rose-400 hover:text-rose-600 transition-colors"
          aria-label="Dismiss error"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};

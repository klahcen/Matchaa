import React from 'react';
import { House, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Top-level safety net: if any component throws while rendering, show a
 * friendly recovery screen instead of unmounting the whole app into a blank
 * page. Both actions do a full page load, which resets every piece of state
 * that could have caused the crash.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-brand-start via-brand-mid to-brand-end">
        <div role="alert" className="w-full max-w-md bg-brand-surface rounded-3xl shadow-2xl p-6 sm:p-9 text-center">
          <p className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-brand-start to-brand-end">
            matcha
          </p>
          <h1 className="text-xl font-bold text-brand-text mt-3">Something went wrong</h1>
          <p className="text-sm text-brand-muted mt-2 leading-relaxed">
            This page hit an unexpected problem. Reloading usually fixes it; your account and
            matches are safe.
          </p>

          <div className="flex flex-col sm:flex-row gap-2.5 mt-7">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-full font-bold text-sm tracking-wider uppercase text-white bg-gradient-to-br from-brand-start via-brand-mid to-brand-end shadow-lg shadow-brand-accent/25 hover:brightness-105 active:scale-[0.98] transition-all duration-200"
            >
              <RefreshCw className="w-4 h-4" /> Reload
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-full font-bold text-sm tracking-wider uppercase border-2 border-brand-accent text-brand-accent hover:bg-brand-bg active:scale-[0.98] transition-all duration-200"
            >
              <House className="w-4 h-4" /> Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}

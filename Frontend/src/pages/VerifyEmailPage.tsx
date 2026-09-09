import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/auth';
import { AuthCard } from '../components/common/AuthCard';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { PrimaryButton } from '../components/common/PrimaryButton';

export const VerifyEmailPage: React.FC = () => {
  const { token: paramToken } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const token = paramToken || searchParams.get('token');

  // Initialized from the token so a URL with no token renders the error state
  // immediately, instead of flashing a spinner before an effect corrects it.
  const [loading, setLoading] = useState<boolean>(Boolean(token));
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    token ? null : 'No verification token provided.'
  );

  useEffect(() => {
    // No token in the URL: nothing to call. The initial state above already
    // describes this case, so there is no state to write here.
    if (!token) return;

    // An AbortController replaces the previous `requestedTokenRef` + `isMounted`
    // guards. Those deadlocked under StrictMode: the ref suppressed the second
    // effect run while the cleanup flag suppressed the first run's state
    // updates, so setLoading(false) was never reached and the spinner hung
    // forever (swallowing success AND error, hence the silent console).
    // Cancelling the superseded request lets the surviving run own the UI state.
    const controller = new AbortController();

    const performVerification = async () => {
      setLoading(true);
      try {
        await authApi.verifyEmail(token, { signal: controller.signal });
        setSuccess(true);
        setErrorMessage(null);
      } catch (err: any) {
        // This run was cancelled by our own cleanup (StrictMode remount, token
        // change, or unmount). A newer run owns the state now — or nothing does,
        // if we unmounted — so exit without touching it.
        if (controller.signal.aborted) return;
        setErrorMessage(
          err?.message || 'Verification failed. The token may be expired or invalid.'
        );
      } finally {
        // Only a run that was NOT cancelled may clear the spinner. An aborted
        // run must leave it alone, or it would fight the run that replaced it.
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void performVerification();

    return () => {
      controller.abort();
    };
  }, [token]);

  // Loading state
  if (loading) {
    return (
      <AuthCard
        title="Verifying your email"
        subtitle="Please wait while we activate your account..."
      >
        <div className="flex flex-col items-center justify-center py-10">
          <div className="w-14 h-14 border-4 border-brand-accent/20 border-t-brand-accent rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-brand-muted">Checking verification token...</p>
        </div>
      </AuthCard>
    );
  }

  // Success state
  if (success) {
    return (
      <AuthCard
        title="Email Verified!"
        subtitle="Your Matcha account is active and ready"
      >
        <div className="flex flex-col items-center text-center py-4">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-4">
            <svg className="w-9 h-9 fill-current" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          <p className="text-brand-text font-medium mb-2">Welcome to the community!</p>
          <p className="text-xs text-brand-muted mb-8 leading-relaxed max-w-xs">
            Your email has been confirmed. You can now log in and begin discovering matches near you.
          </p>

          <Link to="/login" className="w-full">
            <PrimaryButton type="button">Go to Login</PrimaryButton>
          </Link>
        </div>
      </AuthCard>
    );
  }

  // Error state
  return (
    <AuthCard
      title="Verification Failed"
      subtitle="We could not verify your email address"
      footer={
        <p className="text-sm text-brand-muted">
          Need a new account?{' '}
          <Link
            to="/register"
            className="font-bold text-brand-accent hover:text-brand-mid transition-colors"
          >
            Register again
          </Link>
        </p>
      }
    >
      <div className="flex flex-col items-center text-center py-2">
        <ErrorBanner message={errorMessage} />

        <div className="w-14 h-14 rounded-full bg-brand-error-bg text-brand-error-text flex items-center justify-center mb-4">
          <svg className="w-7 h-7 fill-current" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <p className="text-xs text-brand-muted mb-6 leading-relaxed">
          The link might have expired (valid for 24 hours) or was already used. Try logging in or create a new account to request another email.
        </p>

        <div className="w-full space-y-3">
          <Link to="/login" className="w-full block">
            <PrimaryButton type="button">Go to Login</PrimaryButton>
          </Link>
        </div>
      </div>
    </AuthCard>
  );
};

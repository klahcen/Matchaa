import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';
import { profileApi } from '../api/profile';
import { AuthCard } from '../components/common/AuthCard';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { FormInput } from '../components/common/FormInput';
import { PrimaryButton } from '../components/common/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import { isProfileComplete } from '../utils/profileCompletion';
import { validateEmail } from '../utils/validation';

/**
 * Where to land after signing in: the profile page while the profile is still
 * incomplete (browsing is gated until then), otherwise browse. One cheap GET;
 * if it fails for any reason, browse is the safe default (it shows the
 * completion gate itself when needed).
 */
const resolveLandingPath = async (): Promise<string> => {
  try {
    const profile = await profileApi.getMe();
    return profile && !isProfileComplete(profile) ? '/profile' : '/browse';
  } catch {
    return '/browse';
  }
};

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  // Set by AuthContext when a request came back 401 (session expired/revoked).
  const sessionExpired = Boolean((location.state as { sessionExpired?: boolean } | null)?.sessionExpired);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Unverified resend helper state
  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  // Field-level client validation errors
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});

  const validate = (): boolean => {
    const newErrors: { username?: string; password?: string } = {};

    if (!username.trim()) {
      newErrors.username = 'Username is required';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validate()) return;

    setLoading(true);
    try {
      // Decide the landing page before the app flips to signed-in, otherwise
      // the public-route guard would already have redirected to /browse.
      let landingPath = '/browse';
      await login({ username: username.trim(), password }, async () => {
        landingPath = await resolveLandingPath();
      });

      navigate(landingPath, { replace: true });
    } catch (err: any) {
      setApiError(err.message || 'Failed to sign in. Please check your credentials.');
      if (err.message?.toLowerCase().includes('not verified')) {
        setShowResend(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendLoading) return;
    const problem = validateEmail(resendEmail);
    setResendError(problem);
    if (problem) return;
    setResendLoading(true);
    setResendMessage(null);
    try {
      const res = await authApi.resendVerification(resendEmail.trim());
      setResendMessage(res.message || 'Verification link sent!');
    } catch (err: any) {
      setResendError(err?.message || 'Failed to resend verification email.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to continue connecting on Matcha"
      footer={
        <p className="text-sm text-brand-muted">
          Don't have an account?{' '}
          <Link
            to="/register"
            className="font-bold text-brand-accent hover:text-brand-mid transition-colors inline-block py-1"
          >
            Create one
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="w-full">
        {sessionExpired && !apiError && (
          <div role="status" className="w-full bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm rounded-2xl p-3.5 mb-4 font-medium">
            Your session has expired. Please sign in again.
          </div>
        )}

        <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />

        {showResend && (
          <div className="mb-5 p-3.5 bg-brand-bg border border-brand-border rounded-2xl text-left">
            <p className="text-xs font-semibold text-brand-text mb-1.5">
              Need a new activation link?
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={resendEmail}
                onChange={(e) => {
                  setResendEmail(e.target.value);
                  if (resendError) setResendError(null);
                }}
                onKeyDown={(e) => {
                  // Enter here resends the link instead of submitting the login form.
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleResend();
                  }
                }}
                placeholder="Enter your email"
                aria-label="Email for a new activation link"
                aria-invalid={resendError ? true : undefined}
                autoComplete="email"
                maxLength={255}
                className={`flex-1 min-w-0 text-xs px-3 py-2 bg-brand-surface border rounded-xl focus:outline-none ${
                  resendError ? 'border-brand-error-text/60 focus:border-brand-error-text' : 'border-brand-border focus:border-brand-accent'
                }`}
              />
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={resendLoading || !resendEmail.trim()}
                className="text-xs font-semibold px-3.5 py-2 bg-brand-accent text-white rounded-xl hover:bg-brand-mid transition-colors disabled:opacity-50 shrink-0"
              >
                {resendLoading ? 'Sending...' : 'Resend'}
              </button>
            </div>
            {resendError && (
              <p className="text-xs mt-2 font-medium text-brand-error-text">{resendError}</p>
            )}
            {resendMessage && !resendError && (
              <p className="text-xs mt-2 font-medium text-emerald-700">
                {resendMessage}
              </p>
            )}
          </div>
        )}

        <FormInput
          id="username"
          label="Username"
          type="text"
          placeholder="e.g. matcha_lover"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (errors.username) setErrors((prev) => ({ ...prev, username: undefined }));
          }}
          error={errors.username}
          autoComplete="username"
          disabled={loading}
          required
        />

        <FormInput
          id="password"
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
          }}
          error={errors.password}
          autoComplete="current-password"
          disabled={loading}
          required
        />

        <div className="flex justify-end mb-6">
          <Link
            to="/forgot-password"
            className="text-xs font-semibold text-brand-muted hover:text-brand-accent transition-colors py-1"
          >
            Forgot password?
          </Link>
        </div>

        <PrimaryButton type="submit" loading={loading}>
          Sign In
        </PrimaryButton>
      </form>
    </AuthCard>
  );
};

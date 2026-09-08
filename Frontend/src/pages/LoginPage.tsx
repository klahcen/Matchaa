import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';
import { AuthCard } from '../components/common/AuthCard';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { FormInput } from '../components/common/FormInput';
import { PrimaryButton } from '../components/common/PrimaryButton';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Unverified resend helper state
  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

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
      await login({
        username: username.trim(),
        password,
      });

      // Redirect to browse on successful login
      navigate('/browse', { replace: true });
    } catch (err: any) {
      setApiError(err.message || 'Failed to sign in. Please check your credentials.');
      if (err.message?.toLowerCase().includes('not verified')) {
        setShowResend(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim() || resendLoading) return;
    setResendLoading(true);
    setResendMessage(null);
    try {
      const res = await authApi.resendVerification(resendEmail.trim());
      setResendMessage(res.message || 'Verification link sent!');
    } catch (err: any) {
      setResendMessage(err.message || 'Failed to resend verification email.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to continue connecting on Matcha"
      footer={
        <p className="text-sm text-gray-600">
          Don't have an account?{' '}
          <Link
            to="/register"
            className="font-bold text-[#fd297b] hover:text-[#ff5864] transition-colors inline-block py-1"
          >
            Create one
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="w-full">
        <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />

        {showResend && (
          <div className="mb-5 p-3.5 bg-rose-50/70 border border-rose-100 rounded-2xl text-left">
            <p className="text-xs font-semibold text-gray-700 mb-1.5">
              Need a new activation link?
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="Enter your email"
                className="flex-1 text-xs px-3 py-2 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-[#fd297b]"
              />
              <button
                type="button"
                onClick={handleResend}
                disabled={resendLoading || !resendEmail.trim()}
                className="text-xs font-semibold px-3.5 py-2 bg-[#fd297b] text-white rounded-xl hover:bg-[#ff5864] transition-colors disabled:opacity-50 shrink-0"
              >
                {resendLoading ? 'Sending...' : 'Resend'}
              </button>
            </div>
            {resendMessage && (
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
            className="text-xs font-semibold text-gray-500 hover:text-[#fd297b] transition-colors py-1"
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

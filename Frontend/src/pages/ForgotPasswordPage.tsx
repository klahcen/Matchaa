import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api/auth';
import { AuthCard } from '../components/common/AuthCard';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { FormInput } from '../components/common/FormInput';
import { PrimaryButton } from '../components/common/PrimaryButton';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);

  const validate = (): boolean => {
    if (!email.trim()) {
      setFieldError('Email address is required');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldError('Please enter a valid email address');
      return false;
    }
    setFieldError(undefined);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validate()) return;

    setLoading(true);
    try {
      await authApi.forgotPassword({ email: email.trim() });
      setSubmitted(true);
    } catch (err: any) {
      setApiError(err.message || 'Failed to submit request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <AuthCard
        title="Check your email"
        subtitle="Password reset instructions have been dispatched"
      >
        <div className="flex flex-col items-center text-center py-4">
          <div className="w-16 h-16 rounded-full bg-rose-50 text-[#fd297b] flex items-center justify-center mb-4">
            <svg className="w-8 h-8 fill-current" viewBox="0 0 20 20">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
          </div>

          <p className="text-gray-800 font-semibold mb-2">
            Reset link on the way
          </p>
          <p className="text-xs text-gray-500 mb-8 leading-relaxed max-w-xs">
            If an account is associated with <strong className="text-gray-700">{email}</strong>, you will receive a link to reset your password within a few minutes. (Valid for 1 hour).
          </p>

          <Link to="/login" className="w-full">
            <PrimaryButton type="button">Back to Sign In</PrimaryButton>
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgot Password?"
      subtitle="Enter your email to receive a password reset link"
      footer={
        <p className="text-sm text-gray-600">
          Remember your password?{' '}
          <Link
            to="/login"
            className="font-bold text-[#fd297b] hover:text-[#ff5864] transition-colors inline-block py-1"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="w-full">
        <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />

        <FormInput
          id="email"
          label="Email Address"
          type="email"
          placeholder="your.email@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldError) setFieldError(undefined);
          }}
          error={fieldError}
          autoComplete="email"
          disabled={loading}
          required
        />

        <div className="mt-2">
          <PrimaryButton type="submit" loading={loading}>
            Send Reset Link
          </PrimaryButton>
        </div>
      </form>
    </AuthCard>
  );
};

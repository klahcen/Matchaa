import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/auth';
import { AuthCard } from '../components/common/AuthCard';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { PrimaryButton } from '../components/common/PrimaryButton';

export const VerifyEmailPage: React.FC = () => {
  const { token: paramToken } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const token = paramToken || searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Ref guard to prevent duplicate API calls in React StrictMode
  const requestedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      setErrorMessage('No verification token provided.');
      setLoading(false);
      return;
    }

    // Skip duplicate request if already fired for this token
    if (requestedTokenRef.current === token) {
      return;
    }
    requestedTokenRef.current = token;

    let isMounted = true;

    const performVerification = async () => {
      if (!token) {
        if (isMounted) {
          setErrorMessage('No verification token provided.');
          setLoading(false);
        }
        return;
      }

      try {
        await authApi.verifyEmail(token);
        if (isMounted) {
          setSuccess(true);
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage(err.message || 'Verification failed. The token may be expired or invalid.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    performVerification();

    return () => {
      isMounted = false;
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
          <div className="w-14 h-14 border-4 border-rose-200 border-t-[#fd297b] rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-gray-500">Checking verification token...</p>
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

          <p className="text-gray-700 font-medium mb-2">Welcome to the community!</p>
          <p className="text-xs text-gray-500 mb-8 leading-relaxed max-w-xs">
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
        <p className="text-sm text-gray-600">
          Need a new account?{' '}
          <Link
            to="/register"
            className="font-bold text-[#fd297b] hover:text-[#ff5864] transition-colors"
          >
            Register again
          </Link>
        </p>
      }
    >
      <div className="flex flex-col items-center text-center py-2">
        <ErrorBanner message={errorMessage} />

        <div className="w-14 h-14 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 fill-current" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <p className="text-xs text-gray-500 mb-6 leading-relaxed">
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

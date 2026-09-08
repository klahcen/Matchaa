import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api/auth';
import { AuthCard } from '../components/common/AuthCard';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { FormInput } from '../components/common/FormInput';
import { PrimaryButton } from '../components/common/PrimaryButton';

export const RegisterPage: React.FC = () => {
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
  });

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  // Client-side field errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    } else if (formData.username.trim().length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    }

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validate()) return;

    setLoading(true);
    try {
      await authApi.register({
        email: formData.email.trim(),
        username: formData.username.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        password: formData.password,
      });

      setRegisteredEmail(formData.email.trim());
      setIsSuccess(true);
    } catch (err: any) {
      setApiError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const handleResend = async () => {
    if (!registeredEmail || resendLoading) return;
    setResendLoading(true);
    setResendMessage(null);
    try {
      const res = await authApi.resendVerification(registeredEmail);
      setResendMessage(res.message || 'Verification link resent!');
    } catch (err: any) {
      setResendMessage(err.message || 'Failed to resend verification link.');
    } finally {
      setResendLoading(false);
    }
  };

  // Render success screen when registration is complete
  if (isSuccess) {
    return (
      <AuthCard
        title="Check your inbox!"
        subtitle="We've sent an activation link to your email"
      >
        <div className="flex flex-col items-center text-center py-4">
          <div className="w-16 h-16 rounded-full bg-rose-50 text-[#fd297b] flex items-center justify-center mb-4">
            <svg className="w-8 h-8 fill-current" viewBox="0 0 20 20">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
          </div>

          <p className="text-gray-700 font-medium mb-2">
            Verification link sent to:
          </p>
          <p className="text-sm font-semibold text-[#fd297b] bg-rose-50/70 py-1.5 px-4 rounded-full mb-6 max-w-full truncate">
            {registeredEmail}
          </p>

          <p className="text-xs text-gray-500 mb-6 leading-relaxed">
            Please click the link in that email to activate your account. You will not be able to log in until your email address is verified.
          </p>

          {resendMessage && (
            <p className="text-xs font-medium text-emerald-600 mb-4 bg-emerald-50 py-1.5 px-3 rounded-lg w-full">
              {resendMessage}
            </p>
          )}

          <div className="w-full space-y-3">
            <Link to="/login" className="w-full block">
              <PrimaryButton type="button">
                Proceed to Sign In
              </PrimaryButton>
            </Link>

            <button
              type="button"
              onClick={handleResend}
              disabled={resendLoading}
              className="text-xs font-semibold text-[#fd297b] hover:text-[#ff5864] transition-colors py-1 disabled:opacity-50"
            >
              {resendLoading ? 'Sending new link...' : "Didn't receive the email? Resend link"}
            </button>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create Account"
      subtitle="Join Matcha today and find your spark"
      footer={
        <p className="text-sm text-gray-600">
          Already have an account?{' '}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-3">
          <FormInput
            id="firstName"
            name="firstName"
            label="First Name"
            type="text"
            placeholder="e.g. Alex"
            value={formData.firstName}
            onChange={handleChange}
            error={errors.firstName}
            disabled={loading}
            required
          />

          <FormInput
            id="lastName"
            name="lastName"
            label="Last Name"
            type="text"
            placeholder="e.g. Rivera"
            value={formData.lastName}
            onChange={handleChange}
            error={errors.lastName}
            disabled={loading}
            required
          />
        </div>

        <FormInput
          id="username"
          name="username"
          label="Username"
          type="text"
          placeholder="e.g. alex_rivera"
          value={formData.username}
          onChange={handleChange}
          error={errors.username}
          autoComplete="username"
          disabled={loading}
          required
        />

        <FormInput
          id="email"
          name="email"
          label="Email Address"
          type="email"
          placeholder="alex@example.com"
          value={formData.email}
          onChange={handleChange}
          error={errors.email}
          autoComplete="email"
          disabled={loading}
          required
        />

        <FormInput
          id="password"
          name="password"
          label="Password"
          type="password"
          placeholder="Min. 8 characters"
          value={formData.password}
          onChange={handleChange}
          error={errors.password}
          autoComplete="new-password"
          disabled={loading}
          required
        />

        <FormInput
          id="confirmPassword"
          name="confirmPassword"
          label="Confirm Password"
          type="password"
          placeholder="Re-enter your password"
          value={formData.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
          autoComplete="new-password"
          disabled={loading}
          required
        />

        <div className="mt-2 mb-2">
          <PrimaryButton type="submit" loading={loading}>
            Create Account
          </PrimaryButton>
        </div>
      </form>
    </AuthCard>
  );
};

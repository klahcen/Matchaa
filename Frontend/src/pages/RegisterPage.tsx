import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api/auth';
import { AuthCard } from '../components/common/AuthCard';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { FormInput } from '../components/common/FormInput';
import { FormSelect } from '../components/common/FormSelect';
import { PrimaryButton } from '../components/common/PrimaryButton';
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  validateBinaryChoice,
  validateEmail,
  validateName,
  suggestUsername,
  validatePassword,
  validateUsername,
} from '../utils/validation';

// Product decision: exactly these two options for both fields.
const GENDER_CHOICES = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];
const INTERESTED_IN_CHOICES = [
  { value: 'male', label: 'Men' },
  { value: 'female', label: 'Women' },
];

export const RegisterPage: React.FC = () => {
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
    gender: '',
    sexualPreferences: '',
  });

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  // Client-side field errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Mirrors the backend's registration validators (services/authService.ts).
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    const set = (field: string, message: string | null) => {
      if (message) newErrors[field] = message;
    };

    set('email', validateEmail(formData.email));
    set('username', validateUsername(formData.username));
    set('firstName', validateName(formData.firstName, 'First name'));
    set('lastName', validateName(formData.lastName, 'Last name'));
    set('gender', validateBinaryChoice(formData.gender, 'Please select your gender'));
    set(
      'sexualPreferences',
      validateBinaryChoice(formData.sexualPreferences, 'Please select who you are interested in')
    );
    set('password', validatePassword(formData.password));

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  // Browsers often autofill the saved email into the username field.
  const usernameSuggestion = errors.username ? suggestUsername(formData.username) : null;

  const applyUsernameSuggestion = () => {
    if (!usernameSuggestion) return;
    setFormData((prev) => ({ ...prev, username: usernameSuggestion }));
    setErrors((prev) => ({ ...prev, username: '' }));
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
        gender: formData.gender as 'male' | 'female',
        sexual_preferences: formData.sexualPreferences as 'male' | 'female',
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
          <div className="w-16 h-16 rounded-full bg-brand-bg text-brand-accent flex items-center justify-center mb-4">
            <svg className="w-8 h-8 fill-current" viewBox="0 0 20 20">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
          </div>

          <p className="text-brand-text font-medium mb-2">
            Verification link sent to:
          </p>
          <p className="text-sm font-semibold text-brand-accent bg-brand-bg py-1.5 px-4 rounded-full mb-6 max-w-full truncate border border-brand-border">
            {registeredEmail}
          </p>

          <p className="text-xs text-brand-muted mb-6 leading-relaxed">
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
              className="text-xs font-semibold text-brand-accent hover:text-brand-mid transition-colors py-1 disabled:opacity-50"
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
        <p className="text-sm text-brand-muted">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-bold text-brand-accent hover:text-brand-mid transition-colors inline-block py-1"
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
            maxLength={NAME_MAX_LENGTH}
            autoComplete="given-name"
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
            maxLength={NAME_MAX_LENGTH}
            autoComplete="family-name"
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
          maxLength={USERNAME_MAX_LENGTH}
          value={formData.username}
          onChange={handleChange}
          error={errors.username}
          autoComplete="username"
          disabled={loading}
          required
        />

        {usernameSuggestion && (
          <div className="-mt-2 mb-4">
            <button
              type="button"
              onClick={applyUsernameSuggestion}
              className="text-xs font-semibold text-brand-accent hover:text-brand-mid transition-colors py-1"
            >
              Use “{usernameSuggestion}” instead
            </button>
          </div>
        )}

        <FormInput
          id="email"
          name="email"
          label="Email Address"
          type="email"
          placeholder="alex@example.com"
          maxLength={EMAIL_MAX_LENGTH}
          value={formData.email}
          onChange={handleChange}
          error={errors.email}
          autoComplete="email"
          disabled={loading}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-3">
          <FormSelect
            id="gender"
            name="gender"
            label="Gender"
            placeholder="Select..."
            options={GENDER_CHOICES}
            value={formData.gender}
            onChange={handleChange}
            error={errors.gender}
            disabled={loading}
            required
          />

          <FormSelect
            id="sexualPreferences"
            name="sexualPreferences"
            label="Interested in"
            placeholder="Select..."
            options={INTERESTED_IN_CHOICES}
            value={formData.sexualPreferences}
            onChange={handleChange}
            error={errors.sexualPreferences}
            disabled={loading}
            required
          />
        </div>

        <FormInput
          id="password"
          name="password"
          label="Password"
          type="password"
          placeholder="Min. 8 characters"
          hint="Upper & lower case, digit, symbol"
          maxLength={PASSWORD_MAX_LENGTH}
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

/**
 * Hand-written client-side validators (no validation library).
 *
 * Each rule mirrors the backend validator named in its comment, so a value
 * that passes here is accepted by the server, and the user sees the problem
 * next to the field before any round-trip. Every function returns an error
 * message, or null when the value is valid.
 */

/** Same pattern as Backend services/authService.ts validateEmail. */
const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/** Letters (incl. Latin accents), spaces, apostrophes and hyphens. Backend validateName. */
const NAME_PATTERN = /^[a-zA-Z\u00C0-\u017F\s'-]+$/;

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Backend profileController validateTagName. */
const TAG_PATTERN = /^[a-z0-9_-]+$/;

/** Backend profileController validateLocationText. */
// eslint-disable-next-line no-control-regex
const LOCATION_FORBIDDEN = /[\u0000-\u001F\u007F<>{}[\]|\\`^~]/;

export const NAME_MAX_LENGTH = 50;
export const EMAIL_MAX_LENGTH = 255;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const BIOGRAPHY_MAX_LENGTH = 500;
export const TAG_MIN_LENGTH = 2;
export const TAG_MAX_LENGTH = 30;
export const LOCATION_MIN_LENGTH = 2;
export const LOCATION_MAX_LENGTH = 255;

export const validateEmail = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return 'Email address is required';
  if (trimmed.length > EMAIL_MAX_LENGTH) {
    return `Email must not exceed ${EMAIL_MAX_LENGTH} characters`;
  }
  if (!EMAIL_PATTERN.test(trimmed)) return 'Please enter a valid email address';
  return null;
};

export const validateName = (value: string, label: 'First name' | 'Last name'): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required`;
  if (trimmed.length > NAME_MAX_LENGTH) {
    return `${label} must be ${NAME_MAX_LENGTH} characters or fewer`;
  }
  if (!NAME_PATTERN.test(trimmed)) {
    return `${label} can only contain letters, spaces, apostrophes and hyphens`;
  }
  return null;
};

export const validateUsername = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return 'Username is required';
  // Usernames are shown on public profiles, so an email here would expose it.
  if (trimmed.includes('@')) {
    return "Your username is public, so it can't be an email address";
  }
  if (trimmed.length < USERNAME_MIN_LENGTH) {
    return `Username must be at least ${USERNAME_MIN_LENGTH} characters`;
  }
  if (trimmed.length > USERNAME_MAX_LENGTH) {
    return `Username must be ${USERNAME_MAX_LENGTH} characters or fewer`;
  }
  if (!USERNAME_PATTERN.test(trimmed)) {
    return 'Use only letters, numbers, underscores, and hyphens';
  }
  return null;
};

/**
 * A valid username derived from an invalid entry (e.g. an autofilled email:
 * "jane.doe@mail.com" -> "jane_doe"), or null when nothing usable remains.
 */
export const suggestUsername = (value: string): string | null => {
  const trimmed = value.trim();
  const suggestion = trimmed
    .split('@')[0]
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, USERNAME_MAX_LENGTH);
  return suggestion.length >= USERNAME_MIN_LENGTH && suggestion !== trimmed ? suggestion : null;
};

/**
 * Backend validatePassword: 8-128 chars with an uppercase letter, a lowercase
 * letter, a digit and a special character. (The common-password dictionary
 * check stays server-side; its message is shown in the form banner.)
 */
export const validatePassword = (value: string): string | null => {
  if (!value) return 'Password is required';
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Password must not exceed ${PASSWORD_MAX_LENGTH} characters`;
  }
  const missing: string[] = [];
  if (!/[A-Z]/.test(value)) missing.push('an uppercase letter');
  if (!/[a-z]/.test(value)) missing.push('a lowercase letter');
  if (!/[0-9]/.test(value)) missing.push('a digit');
  if (!/[^A-Za-z0-9]/.test(value)) missing.push('a special character');
  if (missing.length > 0) return `Password must include ${missing.join(', ')}`;
  return null;
};

export const validateBinaryChoice = (value: string | null | undefined, message: string): string | null =>
  value === 'male' || value === 'female' ? null : message;

export const validateBiography = (value: string): string | null =>
  value.length > BIOGRAPHY_MAX_LENGTH
    ? `Biography must not exceed ${BIOGRAPHY_MAX_LENGTH} characters`
    : null;

/** Normalizes like the backend: trims, drops a leading "#", lowercases. */
export const normalizeTagName = (value: string): string =>
  value.trim().replace(/^#/, '').toLowerCase();

export const validateTagName = (value: string): string | null => {
  const normalized = normalizeTagName(value);
  if (!normalized) return 'Type a tag name first';
  if (normalized.length < TAG_MIN_LENGTH || normalized.length > TAG_MAX_LENGTH) {
    return `Tags must be between ${TAG_MIN_LENGTH} and ${TAG_MAX_LENGTH} characters`;
  }
  if (!TAG_PATTERN.test(normalized)) {
    return 'Tags may only contain letters, numbers, underscores and hyphens (no spaces)';
  }
  return null;
};

export const validateLocationText = (value: string): string | null => {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length < LOCATION_MIN_LENGTH) {
    return `Please enter at least ${LOCATION_MIN_LENGTH} characters, e.g. "Casablanca" or "Maârif".`;
  }
  if (trimmed.length > LOCATION_MAX_LENGTH) {
    return `Location must not exceed ${LOCATION_MAX_LENGTH} characters.`;
  }
  if (LOCATION_FORBIDDEN.test(trimmed)) {
    return 'Location contains characters that are not allowed (such as < > { } [ ] | \\ ` ^ ~).';
  }
  return null;
};

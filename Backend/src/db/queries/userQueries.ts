import { query } from '../../config/db';
import { User } from '../../types';

export interface CreateUserData {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  verificationToken: string;
  verificationTokenExpiresAt: Date;
}

/**
 * Creates a new unverified user record with raw parameterized SQL.
 * Never stores plaintext passwords. Uses $1, $2, ... placeholders to prevent SQL injection.
 */
export const createUser = async (data: CreateUserData): Promise<User> => {
  const sql = `
    INSERT INTO users (
      email,
      username,
      first_name,
      last_name,
      password_hash,
      verification_token,
      verification_token_expires_at,
      is_verified
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
    RETURNING *;
  `;

  const values = [
    data.email.toLowerCase().trim(),
    data.username.trim(),
    data.firstName.trim(),
    data.lastName.trim(),
    data.passwordHash,
    data.verificationToken,
    data.verificationTokenExpiresAt,
  ];

  const result = await query<User>(sql, values);
  return result.rows[0];
};

/**
 * Finds a user by case-insensitive email.
 */
export const findUserByEmail = async (email: string): Promise<User | null> => {
  const sql = `
    SELECT * FROM users
    WHERE LOWER(email) = LOWER($1)
    LIMIT 1;
  `;
  const result = await query<User>(sql, [email.trim()]);
  return result.rows[0] || null;
};

/**
 * Finds a user by case-insensitive username.
 */
export const findUserByUsername = async (username: string): Promise<User | null> => {
  const sql = `
    SELECT * FROM users
    WHERE LOWER(username) = LOWER($1)
    LIMIT 1;
  `;
  const result = await query<User>(sql, [username.trim()]);
  return result.rows[0] || null;
};

/**
 * Checks if either an email or a username already exists.
 * Returns the conflicting fields if any exist.
 */
export const findConflictingUser = async (
  email: string,
  username: string
): Promise<{ emailTaken: boolean; usernameTaken: boolean }> => {
  const sql = `
    SELECT email, username FROM users
    WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2);
  `;
  const result = await query<{ email: string; username: string }>(sql, [
    email.trim(),
    username.trim(),
  ]);

  let emailTaken = false;
  let usernameTaken = false;

  const targetEmail = email.trim().toLowerCase();
  const targetUsername = username.trim().toLowerCase();

  for (const row of result.rows) {
    if (row.email.toLowerCase() === targetEmail) emailTaken = true;
    if (row.username.toLowerCase() === targetUsername) usernameTaken = true;
  }

  return { emailTaken, usernameTaken };
};

/**
 * Finds a user by ID.
 */
export const findUserById = async (id: number): Promise<User | null> => {
  const sql = `
    SELECT * FROM users
    WHERE id = $1
    LIMIT 1;
  `;
  const result = await query<User>(sql, [id]);
  return result.rows[0] || null;
};

/**
 * Finds a user by email verification token.
 */
export const findUserByVerificationToken = async (token: string): Promise<User | null> => {
  const sql = `
    SELECT * FROM users
    WHERE verification_token = $1
    LIMIT 1;
  `;
  const result = await query<User>(sql, [token]);
  return result.rows[0] || null;
};

/**
 * Marks a user as verified and updates timestamp.
 * Retains verification_token so subsequent duplicate requests (e.g. StrictMode, double-clicks)
 * can be idempotently recognized as verified rather than failing.
 */
export const verifyUserEmail = async (userId: number): Promise<User> => {
  const sql = `
    UPDATE users
    SET is_verified = TRUE,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
  `;
  const result = await query<User>(sql, [userId]);
  return result.rows[0];
};

/**
 * Sets a new email verification token and expiration time for an existing user.
 */
export const updateVerificationToken = async (
  userId: number,
  token: string,
  expiresAt: Date
): Promise<void> => {
  const sql = `
    UPDATE users
    SET verification_token = $1,
        verification_token_expires_at = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $3;
  `;
  await query(sql, [token, expiresAt, userId]);
};

/**
 * Sets a password reset token and expiration time for a user.
 */
export const setResetPasswordToken = async (
  userId: number,
  token: string,
  expiresAt: Date
): Promise<void> => {
  const sql = `
    UPDATE users
    SET reset_token = $1,
        reset_token_expires_at = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $3;
  `;
  await query(sql, [token, expiresAt, userId]);
};

/**
 * Finds a user by password reset token.
 */
export const findUserByResetToken = async (token: string): Promise<User | null> => {
  const sql = `
    SELECT * FROM users
    WHERE reset_token = $1
    LIMIT 1;
  `;
  const result = await query<User>(sql, [token]);
  return result.rows[0] || null;
};

/**
 * Updates a user's password hash and clears the reset token.
 */
export const updateUserPassword = async (
  userId: number,
  passwordHash: string
): Promise<void> => {
  const sql = `
    UPDATE users
    SET password_hash = $1,
        reset_token = NULL,
        reset_token_expires_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2;
  `;
  await query(sql, [passwordHash, userId]);
};

/**
 * Updates a user's last connection timestamp.
 */
export const updateLastConnection = async (userId: number): Promise<void> => {
  const sql = `
    UPDATE users
    SET last_connection = CURRENT_TIMESTAMP
    WHERE id = $1;
  `;
  await query(sql, [userId]);
};

// Aliases for alternate naming conventions
export const markUserVerified = verifyUserEmail;
export const setResetToken = setResetPasswordToken;
export const updatePassword = updateUserPassword;
export const updateLastSeen = updateLastConnection;


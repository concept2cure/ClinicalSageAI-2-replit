/**
 * Authentication Service
 * 
 * Handles user authentication including registration, login, password management,
 * and token operations using PostgreSQL/Neon database.
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, transaction } from '../lib/db.js';

const SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days
const RESET_TOKEN_EXPIRY_HOURS = 1; // 1 hour


/**
 * Register a new user
 * @param {string} email - User email
 * @param {string} username - Username
 * @param {string} password - Plain text password
 * @returns {Promise<Object>} Created user object (without password)
 */
export async function register(email, username, password) {
  // Validate inputs
  if (!email || !username || !password) {
    throw new Error('Email, username, and password are required');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    // Insert user into database
    const result = await query(
      `INSERT INTO auth_users (email, username, password_hash, email_verified, is_active)
       VALUES ($1, $2, $3, false, true)
       RETURNING id, email, username, created_at, is_active, email_verified`,
      [email.toLowerCase(), username, passwordHash]
    );

    return result.rows[0];
  } catch (error) {
    // Handle unique constraint violations
    if (error.code === '23505') {
      if (error.constraint === 'auth_users_email_key') {
        throw new Error('Email already registered');
      }
      if (error.constraint === 'auth_users_username_key') {
        throw new Error('Username already taken');
      }
    }
    throw error;
  }
}

async function ensureUniqueUsername(base) {
  let candidate = base;
  let counter = 0;

  while (true) {
    const result = await query('SELECT 1 FROM auth_users WHERE username = $1', [candidate]);
    if (result.rows.length === 0) {
      return candidate;
    }
    counter += 1;
    candidate = `${base}${counter}`;
  }
}

function normalizeUsername(name, email) {
  const raw = name || (email ? email.split('@')[0] : 'user');
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '')
    .slice(0, 24);

  if (base.length >= 3) {
    return base;
  }

  const fallback = `user${Math.floor(Math.random() * 10000)}`;
  return fallback;
}

async function getTenantContextForAuthUser(email) {
  if (!email) {
    return null;
  }

  const userResult = await query(
    `SELECT id, default_organization_id
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [email.toLowerCase()]
  );

  if (userResult.rows.length === 0) {
    return null;
  }

  const appUser = userResult.rows[0];

  const membershipResult = await query(
    `SELECT
        ou.organization_id,
        ou.role,
        ou.permissions,
        o.name,
        o.slug,
        o.tier
      FROM organization_users ou
      INNER JOIN organizations o ON o.id = ou.organization_id
      WHERE ou.user_id = $1
      ORDER BY ou.created_at ASC`,
    [appUser.id]
  );

  if (membershipResult.rows.length === 0) {
    return null;
  }

  const defaultOrgId = appUser.default_organization_id;
  const primaryOrg =
    (defaultOrgId
      ? membershipResult.rows.find(row => row.organization_id === defaultOrgId)
      : membershipResult.rows[0]) || membershipResult.rows[0];

  return {
    appUserId: appUser.id,
    organizationId: primaryOrg.organization_id,
    role: primaryOrg.role,
    permissions: primaryOrg.permissions || {},
    organizations: membershipResult.rows.map(row => ({
      id: row.organization_id,
      name: row.name,
      slug: row.slug,
      tier: row.tier,
      role: row.role,
    })),
  };
}

/**
 * Authenticate or create a user via SSO provider and generate tokens
 * @param {Object} profile - SSO profile
 * @param {string} profile.email - User email
 * @param {string} profile.name - User display name
 * @param {string} profile.provider - SSO provider
 * @param {string} ipAddress - Client IP address
 * @param {string} userAgent - Client user agent
 * @returns {Promise<Object>} Access token, refresh token, and user data
 */
export async function loginWithSsoProfile(profile, ipAddress = null, userAgent = null) {
  const email = profile?.email?.toLowerCase();

  if (!email) {
    throw new Error('SSO profile did not provide an email address');
  }

  const userResult = await query('SELECT * FROM auth_users WHERE email = $1', [email]);

  let user = userResult.rows[0];

  if (!user) {
    const usernameBase = normalizeUsername(profile?.name, email);
    const username = await ensureUniqueUsername(usernameBase);
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, SALT_ROUNDS);

    const insertResult = await query(
      `INSERT INTO auth_users (email, username, password_hash, email_verified, is_active)
       VALUES ($1, $2, $3, true, true)
       RETURNING id, email, username, created_at, is_active, email_verified`,
      [email, username, passwordHash]
    );

    user = insertResult.rows[0];
  } else if (!user.is_active) {
    throw new Error('Account is disabled');
  }

  await query('UPDATE auth_users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const tenantContext = await getTenantContextForAuthUser(user.email);
  if (!tenantContext) {
    throw new Error('User is not associated with any organization. Please contact support.');
  }

  const accessToken = generateAccessToken({ ...user, ...tenantContext });
  const refreshToken = await generateRefreshToken(user.id, ipAddress, userAgent);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
    },
  };
}

/**
 * Authenticate user and generate tokens
 * @param {string} email - User email
 * @param {string} password - Plain text password
 * @param {string} ipAddress - Client IP address
 * @param {string} userAgent - Client user agent
 * @returns {Promise<Object>} Access token, refresh token, and user data
 */
export async function login(email, password, ipAddress = null, userAgent = null) {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const normalizedEmail = email.toLowerCase();
  // Find user by email
  const userResult = await query(
    'SELECT * FROM auth_users WHERE email = $1',
    [normalizedEmail]
  );

  let user = userResult.rows[0];

  if (!user) {
    throw new Error('Invalid email or password');
  }

  // Check if user is active
  if (!user.is_active) {
    throw new Error('Account is disabled');
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    throw new Error('Invalid email or password');
  }

  // Update last login timestamp
  await query(
    'UPDATE auth_users SET last_login_at = NOW() WHERE id = $1',
    [user.id]
  );

  const tenantContext = await getTenantContextForAuthUser(user.email);
  if (!tenantContext) {
    throw new Error('User is not associated with any organization. Please contact support.');
  }

  // Generate tokens
  const accessToken = generateAccessToken({ ...user, ...tenantContext });
  const refreshToken = await generateRefreshToken(user.id, ipAddress, userAgent);

  // Return tokens and user data (without password hash)
  const { password_hash, ...userData } = user;
  
  return {
    accessToken,
    refreshToken,
    user: userData,
  };
}

/**
 * Logout user by revoking refresh token
 * @param {string} refreshToken - Refresh token to revoke
 * @returns {Promise<boolean>} Success status
 */
export async function logout(refreshToken) {
  if (!refreshToken) {
    return false;
  }

  try {
    await query(
      `UPDATE auth_refresh_tokens 
       SET revoked = true, revoked_at = NOW()
       WHERE token = $1 AND revoked = false`,
      [refreshToken]
    );
    return true;
  } catch (error) {
    console.error('Logout error:', error);
    return false;
  }
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Valid refresh token
 * @param {string} ipAddress - Client IP address
 * @param {string} userAgent - Client user agent
 * @returns {Promise<Object>} New access token and refresh token
 */
export async function refresh(refreshToken, ipAddress = null, userAgent = null) {
  if (!refreshToken) {
    throw new Error('Refresh token is required');
  }

  // Verify refresh token
  const tokenResult = await query(
    `SELECT rt.*, u.id as user_id, u.email, u.username, u.is_active
     FROM auth_refresh_tokens rt
     JOIN auth_users u ON rt.user_id = u.id
     WHERE rt.token = $1 AND rt.revoked = false AND rt.expires_at > NOW()`,
    [refreshToken]
  );

  if (tokenResult.rows.length === 0) {
    throw new Error('Invalid or expired refresh token');
  }

  const tokenData = tokenResult.rows[0];

  // Check if user is still active
  if (!tokenData.is_active) {
    throw new Error('Account is disabled');
  }

  // Revoke old refresh token
  await query(
    `UPDATE auth_refresh_tokens 
     SET revoked = true, revoked_at = NOW()
     WHERE token = $1`,
    [refreshToken]
  );

  // Generate new tokens
  const tenantContext = await getTenantContextForAuthUser(tokenData.email);
  if (!tenantContext) {
    throw new Error('User is not associated with any organization. Please contact support.');
  }

  const user = {
    id: tokenData.user_id,
    email: tokenData.email,
    username: tokenData.username,
    ...tenantContext,
  };

  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = await generateRefreshToken(tokenData.user_id, ipAddress, userAgent);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Request password reset (generate reset token)
 * @param {string} email - User email
 * @param {string} ipAddress - Client IP address
 * @returns {Promise<string>} Reset token (to be sent via email)
 */
export async function requestPasswordReset(email, ipAddress = null) {
  if (!email) {
    throw new Error('Email is required');
  }

  // Find user by email
  const userResult = await query(
    'SELECT id, email, is_active FROM auth_users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (userResult.rows.length === 0) {
    // Don't reveal if email exists or not (security best practice)
    // Still return success but don't create token
    return null;
  }

  const user = userResult.rows[0];

  if (!user.is_active) {
    // Don't reveal account status
    return null;
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + RESET_TOKEN_EXPIRY_HOURS);

  // Store reset token
  await query(
    `INSERT INTO auth_password_resets (user_id, token, expires_at, ip_address)
     VALUES ($1, $2, $3, $4)`,
    [user.id, resetToken, expiresAt, ipAddress]
  );

  return resetToken;
}

/**
 * Reset password using reset token
 * @param {string} resetToken - Password reset token
 * @param {string} newPassword - New password
 * @returns {Promise<boolean>} Success status
 */
export async function resetPassword(resetToken, newPassword) {
  if (!resetToken || !newPassword) {
    throw new Error('Reset token and new password are required');
  }

  if (newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  return await transaction(async (client) => {
    // Verify reset token
    const tokenResult = await client.query(
      `SELECT pr.*, u.id as user_id, u.is_active
       FROM auth_password_resets pr
       JOIN auth_users u ON pr.user_id = u.id
       WHERE pr.token = $1 AND pr.used = false AND pr.expires_at > NOW()`,
      [resetToken]
    );

    if (tokenResult.rows.length === 0) {
      throw new Error('Invalid or expired reset token');
    }

    const resetData = tokenResult.rows[0];

    if (!resetData.is_active) {
      throw new Error('Account is disabled');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    await client.query(
      'UPDATE auth_users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, resetData.user_id]
    );

    // Mark reset token as used
    await client.query(
      `UPDATE auth_password_resets 
       SET used = true, used_at = NOW()
       WHERE token = $1`,
      [resetToken]
    );

    // Revoke all existing refresh tokens for security
    await client.query(
      `UPDATE auth_refresh_tokens 
       SET revoked = true, revoked_at = NOW()
       WHERE user_id = $1 AND revoked = false`,
      [resetData.user_id]
    );

    return true;
  });
}

/**
 * Generate JWT access token
 * @param {Object} user - User object
 * @returns {string} JWT access token
 */
function generateAccessToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    username: user.username,
    appUserId: user.appUserId,
    organizationId: user.organizationId,
    role: user.role,
    permissions: user.permissions || {},
    organizations: user.organizations || [],
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

/**
 * Generate and store refresh token
 * @param {string} userId - User ID
 * @param {string} ipAddress - Client IP address
 * @param {string} userAgent - Client user agent
 * @returns {Promise<string>} Refresh token
 */
async function generateRefreshToken(userId, ipAddress = null, userAgent = null) {
  const refreshToken = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  await query(
    `INSERT INTO auth_refresh_tokens (user_id, token, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, refreshToken, expiresAt, ipAddress, userAgent]
  );

  return refreshToken;
}

/**
 * Verify JWT access token
 * @param {string} token - JWT access token
 * @returns {Object} Decoded token payload
 */
export function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.organizationId) {
      throw new Error('Invalid access token: missing organization context');
    }
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Access token expired');
    }
    throw new Error('Invalid access token');
  }
}

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User object (without password)
 */
export async function getUserById(userId) {
  const result = await query(
    'SELECT id, email, username, created_at, updated_at, last_login_at, is_active, email_verified FROM auth_users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Clean up expired tokens (should be run periodically)
 * @returns {Promise<Object>} Cleanup statistics
 */
export async function cleanupExpiredTokens() {
  const refreshResult = await query(
    'DELETE FROM auth_refresh_tokens WHERE expires_at < NOW() AND revoked = false RETURNING id'
  );

  const resetResult = await query(
    'DELETE FROM auth_password_resets WHERE expires_at < NOW() AND used = false RETURNING id'
  );

  return {
    refreshTokensDeleted: refreshResult.rowCount,
    resetTokensDeleted: resetResult.rowCount,
  };
}

export default {
  register,
  login,
  loginWithSsoProfile,
  logout,
  refresh,
  requestPasswordReset,
  resetPassword,
  verifyAccessToken,
  getUserById,
  cleanupExpiredTokens,
};

/**
 * Enterprise Authentication Routes
 * Concept2Cure TrialSage Platform
 * 
 * 21 CFR Part 11 Compliant Authentication System
 * Version 1.0 | January 2026
 * 
 * Features:
 * - Multi-step authentication flow
 * - Rate limiting and account lockout
 * - MFA (TOTP) support
 * - Organization selection for multi-org users
 * - SSO integration ready
 * - Comprehensive audit logging
 * - Session management with concurrent limits
 * 
 * @module routes/authEnterprise
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { db } from '../db/index.js';
import { users, organizations, organizationUsers } from '../../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import {
  rateLimiter,
  lockoutManager,
  passwordValidator,
  authAuditLogger,
  sessionManager,
} from '../services/authSecurityService.js';

const router = express.Router();

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const MFA_TOKEN_EXPIRES_IN = '5m'; // Short-lived token for MFA step
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get client info from request
 */
function getClientInfo(req) {
  return {
    ip: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: req.get('User-Agent') || 'unknown',
    fingerprint: req.body?.deviceFingerprint || req.get('X-Device-Fingerprint') || null,
  };
}

/**
 * Generate secure session ID
 */
function generateSessionId() {
  return crypto.randomUUID();
}

/**
 * Log authentication event
 */
async function logAuthEvent(eventType, data) {
  try {
    await authAuditLogger.log(eventType, data);
  } catch (err) {
    console.error('[AUTH_AUDIT] Failed to log event:', err.message);
  }
}

/**
 * Check if user has SSO configured
 */
async function checkSSOConfig(email) {
  const domain = email.split('@')[1];
  if (!domain) return null;

  try {
    const result = await db.execute(sql`
      SELECT * FROM org_sso_configs 
      WHERE email_domain = ${domain} 
      AND enabled = true 
      LIMIT 1
    `);
    return result.rows?.[0] || null;
  } catch (err) {
    console.warn('[AUTH] SSO config check failed:', err.message);
    return null;
  }
}

/**
 * Get user's organizations
 */
async function getUserOrganizations(userId) {
  try {
    const result = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        type: organizations.type,
        role: organizationUsers.role,
      })
      .from(organizationUsers)
      .innerJoin(organizations, eq(organizations.id, organizationUsers.organizationId))
      .where(eq(organizationUsers.userId, userId));
    
    return result;
  } catch (err) {
    console.error('[AUTH] Failed to get user organizations:', err.message);
    return [];
  }
}

// ============================================================================
// STEP 1: EMAIL CHECK
// ============================================================================

/**
 * @route POST /api/auth/enterprise/check-email
 * @desc Check if email exists and determine auth flow
 * @access Public
 */
router.post('/check-email', async (req, res) => {
  const clientInfo = getClientInfo(req);
  
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'EMAIL_REQUIRED',
        message: 'Email address is required',
      });
    }

    // Rate limiting check
    const rateLimitResult = await rateLimiter.check(clientInfo.ip);
    if (!rateLimitResult.allowed) {
      await logAuthEvent('RATE_LIMITED', {
        email,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        metadata: { retryAfter: rateLimitResult.retryAfter },
      });
      
      return res.status(429).json({
        success: false,
        error: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        retryAfter: rateLimitResult.retryAfter,
      });
    }

    // Check for SSO configuration
    const ssoConfig = await checkSSOConfig(email);
    if (ssoConfig) {
      await logAuthEvent('SSO_REDIRECT', {
        email,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        metadata: { provider: ssoConfig.provider },
      });
      
      return res.json({
        success: true,
        authFlow: 'sso',
        ssoProvider: ssoConfig.provider,
        ssoProviderName: ssoConfig.provider_name || ssoConfig.provider,
        message: 'SSO authentication required',
      });
    }

    // Look up user using raw SQL (migration-added columns not in ORM schema)
    const userResult = await db.execute(sql`
      SELECT id, email, name, mfa_enabled, locked_until, status
      FROM users
      WHERE LOWER(email) = ${email.toLowerCase()}
      LIMIT 1
    `);
    
    // Handle both drizzle-orm array result and pg rows object
    const userRows = Array.isArray(userResult) ? userResult : (userResult.rows || []);

    if (userRows.length === 0) {
      // Don't reveal that user doesn't exist - same response timing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return res.json({
        success: true,
        exists: false,
        authFlow: 'password',
        requiresMFA: false,
        message: 'Continue with password',
      });
    }

    const user = userRows[0];

    // Check if account is locked
    const lockoutStatus = await lockoutManager.checkLockout(user.id);
    if (lockoutStatus.locked) {
      await logAuthEvent('LOGIN_BLOCKED_LOCKOUT', {
        email,
        userId: user.id,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        metadata: { lockedUntil: lockoutStatus.lockedUntil },
      });
      
      return res.status(423).json({
        success: false,
        error: 'ACCOUNT_LOCKED',
        message: `Account is locked due to multiple failed attempts. Try again in ${lockoutStatus.remainingMinutes} minutes.`,
        lockedUntil: lockoutStatus.lockedUntil,
        remainingMinutes: lockoutStatus.remainingMinutes,
      });
    }

    // Check if account is inactive
    if (user.status && user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_INACTIVE',
        message: 'Account is not active. Please contact support.',
      });
    }

    // Return auth flow information
    return res.json({
      success: true,
      exists: true,
      authFlow: 'password',
      requiresMFA: user.mfa_enabled || false,
      userName: user.name,
      message: 'Continue with password',
    });

  } catch (error) {
    console.error('[AUTH] Email check error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'An error occurred. Please try again.',
    });
  }
});

// ============================================================================
// SSO DOMAIN CHECK
// ============================================================================

/**
 * @route GET /api/auth/enterprise/check-sso-domain
 * @desc Check if a domain has SSO configured
 * @access Public
 */
router.get('/check-sso-domain', async (req, res) => {
  try {
    const { domain } = req.query;

    if (!domain) {
      return res.status(400).json({
        success: false,
        ssoEnabled: false,
        message: 'Domain parameter is required',
      });
    }

    // Look up SSO configuration for domain
    const ssoConfig = await checkSSOConfig(`user@${domain}`);
    
    if (ssoConfig) {
      return res.json({
        success: true,
        ssoEnabled: true,
        provider: ssoConfig.provider,
        providerName: ssoConfig.provider_name || ssoConfig.provider,
        redirectUrl: `/api/auth/sso/${ssoConfig.provider}/initiate`,
      });
    }

    return res.json({
      success: true,
      ssoEnabled: false,
      message: 'No SSO configuration for this domain',
    });

  } catch (error) {
    console.error('[AUTH] SSO domain check error:', error);
    return res.json({
      success: false,
      ssoEnabled: false,
      message: 'Unable to check SSO configuration',
    });
  }
});

// ============================================================================
// STEP 2: PASSWORD VERIFICATION
// ============================================================================

/**
 * @route POST /api/auth/enterprise/verify-password
 * @desc Verify password and proceed to MFA or complete login
 * @access Public
 */
router.post('/verify-password', async (req, res) => {
  const clientInfo = getClientInfo(req);
  
  try {
    const { email, password, rememberDevice } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'CREDENTIALS_REQUIRED',
        message: 'Email and password are required',
      });
    }

    // Rate limiting check
    const rateLimitResult = await rateLimiter.check(clientInfo.ip);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        success: false,
        error: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        retryAfter: rateLimitResult.retryAfter,
      });
    }

    // Look up user using raw SQL (migration-added columns not in ORM schema)
    const userResult = await db.execute(sql`
      SELECT id, email, name, password_hash, mfa_enabled, locked_until, status
      FROM users
      WHERE LOWER(email) = ${email.toLowerCase()}
      LIMIT 1
    `);
    
    // Handle both drizzle-orm array result and pg rows object
    const userRows = Array.isArray(userResult) ? userResult : (userResult.rows || []);

    if (userRows.length === 0) {
      rateLimiter.recordAttempt(clientInfo.ip);
      await logAuthEvent('LOGIN_FAILED', {
        email,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        success: false,
        failureReason: 'User not found',
      });
      
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const user = userRows[0];

    // Check lockout
    const lockoutStatus = await lockoutManager.checkLockout(user.id);
    if (lockoutStatus.locked) {
      return res.status(423).json({
        success: false,
        error: 'ACCOUNT_LOCKED',
        message: `Account is locked. Try again in ${lockoutStatus.remainingMinutes} minutes.`,
        lockedUntil: lockoutStatus.lockedUntil,
      });
    }

    // Verify password
    if (!user.password_hash) {
      await logAuthEvent('LOGIN_FAILED', {
        email,
        userId: user.id,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        success: false,
        failureReason: 'No password set',
      });
      
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isValid) {
      // Record failed attempt
      rateLimiter.recordAttempt(clientInfo.ip);
      const attemptResult = await lockoutManager.recordFailedAttempt(user.id, clientInfo.ip);
      
      await logAuthEvent('LOGIN_FAILED', {
        email,
        userId: user.id,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        success: false,
        failureReason: 'Invalid password',
        metadata: { attemptsRemaining: attemptResult.attemptsRemaining },
      });

      // Update user's failed login count in database
      await db.execute(sql`
        UPDATE users 
        SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
            last_failed_login = NOW(),
            last_failed_ip = ${clientInfo.ip}
        WHERE id = ${user.id}
      `);

      if (attemptResult.locked) {
        return res.status(423).json({
          success: false,
          error: 'ACCOUNT_LOCKED',
          message: `Account has been locked due to multiple failed attempts. Try again in ${attemptResult.lockoutMinutes} minutes.`,
          lockedUntil: attemptResult.lockedUntil,
        });
      }

      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        attemptsRemaining: attemptResult.attemptsRemaining,
      });
    }

    // Password is valid - clear failed attempts
    await lockoutManager.clearLockout(user.id);
    await db.execute(sql`
      UPDATE users 
      SET failed_login_attempts = 0,
          last_failed_login = NULL,
          last_failed_ip = NULL
      WHERE id = ${user.id}
    `);

    // Check if MFA is required
    if (user.mfa_enabled) {
      // Generate short-lived MFA token
      const mfaToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          step: 'mfa_required',
          deviceFingerprint: clientInfo.fingerprint,
        },
        JWT_SECRET,
        { expiresIn: MFA_TOKEN_EXPIRES_IN }
      );

      await logAuthEvent('PASSWORD_VERIFIED', {
        email,
        userId: user.id,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        success: true,
        metadata: { mfaRequired: true },
      });

      return res.json({
        success: true,
        requiresMFA: true,
        mfaToken,
        message: 'Password verified. MFA required.',
      });
    }

    // No MFA - get organizations and complete login
    const userOrgs = await getUserOrganizations(user.id);

    // Check if multi-org selection needed
    if (userOrgs.length > 1) {
      const orgToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          step: 'org_selection',
        },
        JWT_SECRET,
        { expiresIn: '10m' }
      );

      await logAuthEvent('PASSWORD_VERIFIED', {
        email,
        userId: user.id,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        success: true,
        metadata: { orgSelectionRequired: true, orgCount: userOrgs.length },
      });

      return res.json({
        success: true,
        requiresOrgSelection: true,
        orgToken,
        organizations: userOrgs.map(org => ({
          id: org.id,
          name: org.name,
          type: org.type,
          role: org.role,
        })),
        message: 'Select an organization to continue.',
      });
    }

    // Single org or no org - complete login
    const selectedOrg = userOrgs[0] || { id: 1, name: 'Concept2Cure', role: 'user' };
    
    return await completeLogin(req, res, user, selectedOrg, clientInfo, rememberDevice);

  } catch (error) {
    console.error('[AUTH] Password verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'An error occurred. Please try again.',
    });
  }
});

// ============================================================================
// STEP 3: MFA VERIFICATION
// ============================================================================

/**
 * @route POST /api/auth/enterprise/verify-mfa
 * @desc Verify MFA code and complete login
 * @access Requires mfaToken
 */
router.post('/verify-mfa', async (req, res) => {
  const clientInfo = getClientInfo(req);
  
  try {
    const { mfaToken, code, trustDevice } = req.body;

    if (!mfaToken || !code) {
      return res.status(400).json({
        success: false,
        error: 'MFA_CODE_REQUIRED',
        message: 'MFA token and code are required',
      });
    }

    // Verify MFA token
    let decoded;
    try {
      decoded = jwt.verify(mfaToken, JWT_SECRET);
      if (decoded.step !== 'mfa_required') {
        throw new Error('Invalid token step');
      }
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_MFA_TOKEN',
        message: 'MFA session expired. Please start again.',
      });
    }

    // Get user using raw SQL
    const userResult = await db.execute(sql`
      SELECT id, email, name, mfa_enabled, status
      FROM users WHERE id = ${decoded.userId} LIMIT 1
    `);
    // Handle both drizzle-orm array result and pg rows object
    const userRows = Array.isArray(userResult) ? userResult : (userResult.rows || []);

    if (userRows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    const user = userRows[0];

    // Get MFA secret
    let mfaSecret;
    try {
      const mfaResult = await db.execute(sql`
        SELECT secret_encrypted, backup_codes, backup_codes_used
        FROM auth_mfa_secrets 
        WHERE user_id = ${user.id} AND enabled = true
        LIMIT 1
      `);
      
      if (mfaResult.rows?.length > 0) {
        mfaSecret = mfaResult.rows[0];
      }
    } catch (err) {
      console.warn('[AUTH] MFA secret lookup failed:', err.message);
    }

    if (!mfaSecret) {
      // MFA not set up - allow login (edge case)
      console.warn(`[AUTH] User ${user.email} has mfaEnabled but no secret`);
    }

    // Verify TOTP code
    let verified = false;
    
    if (mfaSecret?.secret_encrypted) {
      try {
        // In production, decrypt the secret
        const secret = mfaSecret.secret_encrypted; // TODO: Decrypt
        verified = speakeasy.totp.verify({
          secret: secret,
          encoding: 'base32',
          token: code,
          window: 1, // Allow 1 step before/after for time drift
        });
      } catch (err) {
        console.error('[AUTH] TOTP verification error:', err.message);
      }
    }

    // Check backup codes if TOTP failed
    if (!verified && mfaSecret?.backup_codes && code.length === 8) {
      const backupCodes = mfaSecret.backup_codes;
      const codeIndex = backupCodes.indexOf(code.toUpperCase());
      if (codeIndex !== -1) {
        verified = true;
        // Remove used backup code
        backupCodes.splice(codeIndex, 1);
        await db.execute(sql`
          UPDATE auth_mfa_secrets 
          SET backup_codes = ${backupCodes},
              backup_codes_used = COALESCE(backup_codes_used, 0) + 1
          WHERE user_id = ${user.id}
        `);
        
        await logAuthEvent('BACKUP_CODE_USED', {
          userId: user.id,
          email: user.email,
          ip: clientInfo.ip,
          userAgent: clientInfo.userAgent,
          metadata: { codesRemaining: backupCodes.length },
        });
      }
    }

    // For demo/dev: accept "000000" as valid code
    if (!verified && code === '000000' && process.env.NODE_ENV !== 'production') {
      verified = true;
      console.warn('[AUTH] Demo MFA bypass used');
    }

    if (!verified) {
      await logAuthEvent('MFA_FAILED', {
        userId: user.id,
        email: user.email,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        success: false,
        failureReason: 'Invalid MFA code',
      });

      return res.status(401).json({
        success: false,
        error: 'INVALID_MFA_CODE',
        message: 'Invalid verification code',
      });
    }

    // MFA verified
    await logAuthEvent('MFA_VERIFIED', {
      userId: user.id,
      email: user.email,
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      success: true,
    });

    // Update MFA last used
    await db.execute(sql`
      UPDATE auth_mfa_secrets 
      SET last_used_at = NOW()
      WHERE user_id = ${user.id}
    `);

    // Trust device if requested
    if (trustDevice && clientInfo.fingerprint) {
      try {
        await db.execute(sql`
          INSERT INTO auth_trusted_devices (user_id, device_fingerprint, ip_address, trusted_until)
          VALUES (${user.id}, ${clientInfo.fingerprint}, ${clientInfo.ip}, NOW() + INTERVAL '30 days')
          ON CONFLICT (user_id, device_fingerprint) 
          DO UPDATE SET last_used_at = NOW(), trusted_until = NOW() + INTERVAL '30 days'
        `);
      } catch (err) {
        console.warn('[AUTH] Failed to trust device:', err.message);
      }
    }

    // Get organizations
    const userOrgs = await getUserOrganizations(user.id);

    if (userOrgs.length > 1) {
      const orgToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          step: 'org_selection',
        },
        JWT_SECRET,
        { expiresIn: '10m' }
      );

      return res.json({
        success: true,
        requiresOrgSelection: true,
        orgToken,
        organizations: userOrgs.map(org => ({
          id: org.id,
          name: org.name,
          type: org.type,
          role: org.role,
        })),
        message: 'Select an organization to continue.',
      });
    }

    // Complete login
    const selectedOrg = userOrgs[0] || { id: 1, name: 'Concept2Cure', role: 'user' };
    return await completeLogin(req, res, user, selectedOrg, clientInfo, false);

  } catch (error) {
    console.error('[AUTH] MFA verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'An error occurred. Please try again.',
    });
  }
});

// ============================================================================
// STEP 4: ORGANIZATION SELECTION
// ============================================================================

/**
 * @route POST /api/auth/enterprise/select-organization
 * @desc Select organization and complete login
 * @access Requires orgToken
 */
router.post('/select-organization', async (req, res) => {
  const clientInfo = getClientInfo(req);
  
  try {
    const { orgToken, organizationId, rememberChoice } = req.body;

    if (!orgToken || !organizationId) {
      return res.status(400).json({
        success: false,
        error: 'ORG_REQUIRED',
        message: 'Organization token and ID are required',
      });
    }

    // Verify org token
    let decoded;
    try {
      decoded = jwt.verify(orgToken, JWT_SECRET);
      if (decoded.step !== 'org_selection') {
        throw new Error('Invalid token step');
      }
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_ORG_TOKEN',
        message: 'Session expired. Please start again.',
      });
    }

    // Get user using raw SQL
    const userResult = await db.execute(sql`
      SELECT id, email, name FROM users WHERE id = ${decoded.userId} LIMIT 1
    `);
    // Handle both drizzle-orm array result and pg rows object
    const userRows = Array.isArray(userResult) ? userResult : (userResult.rows || []);

    if (userRows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    const user = userRows[0];

    // Verify user has access to selected organization
    const orgAccessResult = await db
      .select({
        organizationId: organizationUsers.organizationId,
        role: organizationUsers.role,
        name: organizations.name,
        type: organizations.type,
      })
      .from(organizationUsers)
      .innerJoin(organizations, eq(organizations.id, organizationUsers.organizationId))
      .where(and(
        eq(organizationUsers.userId, user.id),
        eq(organizationUsers.organizationId, organizationId)
      ))
      .limit(1);

    if (orgAccessResult.length === 0) {
      await logAuthEvent('ORG_ACCESS_DENIED', {
        userId: user.id,
        email: user.email,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        success: false,
        metadata: { requestedOrgId: organizationId },
      });

      return res.status(403).json({
        success: false,
        error: 'ORG_ACCESS_DENIED',
        message: 'You do not have access to this organization',
      });
    }

    const selectedOrg = {
      id: organizationId,
      name: orgAccessResult[0].name,
      type: orgAccessResult[0].type,
      role: orgAccessResult[0].role,
    };

    // Remember org choice if requested
    if (rememberChoice) {
      try {
        await db.execute(sql`
          UPDATE users 
          SET default_organization_id = ${organizationId}
          WHERE id = ${user.id}
        `);
      } catch (err) {
        console.warn('[AUTH] Failed to save org preference:', err.message);
      }
    }

    await logAuthEvent('ORG_SELECTED', {
      userId: user.id,
      email: user.email,
      organizationId: organizationId,
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      success: true,
    });

    return await completeLogin(req, res, user, selectedOrg, clientInfo, false);

  } catch (error) {
    console.error('[AUTH] Organization selection error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'An error occurred. Please try again.',
    });
  }
});

// ============================================================================
// COMPLETE LOGIN HELPER
// ============================================================================

/**
 * Complete the login process - create session and return tokens
 */
async function completeLogin(req, res, user, selectedOrg, clientInfo, rememberDevice) {
  try {
    // Generate session ID
    const sessionId = generateSessionId();

    // Check concurrent session limit
    const activeSessions = sessionManager.getActiveSessions(user.id);
    if (activeSessions.length >= 3) {
      // Revoke oldest session
      const oldestSession = activeSessions[0];
      sessionManager.revokeSession(oldestSession.id, 'new_session');
      
      await logAuthEvent('SESSION_REVOKED', {
        userId: user.id,
        email: user.email,
        ip: clientInfo.ip,
        success: true,
        metadata: { reason: 'concurrent_limit', revokedSessionId: oldestSession.id },
      });
    }

    // Create session
    const session = sessionManager.createSession(user.id, sessionId, {
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      fingerprint: clientInfo.fingerprint,
    });

    // Store session in database
    try {
      await db.execute(sql`
        INSERT INTO auth_sessions (id, user_id, ip_address, user_agent, device_fingerprint, expires_at)
        VALUES (${sessionId}::uuid, ${user.id}, ${clientInfo.ip}, ${clientInfo.userAgent}, ${clientInfo.fingerprint}, ${session.expiresAt})
      `);
    } catch (err) {
      console.warn('[AUTH] Failed to store session in database:', err.message);
    }

    // Create JWT payload
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: selectedOrg.role || 'user',
      organizationId: selectedOrg.id,
      sessionId: sessionId,
    };

    // Generate JWT token
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: rememberDevice ? 30 * 24 * 60 * 60 * 1000 : COOKIE_MAX_AGE,
    });

    // User info cookie
    const userInfo = {
      id: user.id,
      email: user.email,
      name: user.name || user.username,
      role: selectedOrg.role || 'user',
      organizationId: selectedOrg.id,
      organizationName: selectedOrg.name,
      organizationType: selectedOrg.type,
    };

    res.cookie('user', JSON.stringify(userInfo), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: rememberDevice ? 30 * 24 * 60 * 60 * 1000 : COOKIE_MAX_AGE,
    });

    // Update last login
    await db.execute(sql`
      UPDATE users 
      SET last_login_at = NOW(),
          last_login_ip = ${clientInfo.ip}
      WHERE id = ${user.id}
    `);

    // Log successful login
    await logAuthEvent('LOGIN_SUCCESS', {
      userId: user.id,
      email: user.email,
      organizationId: selectedOrg.id,
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      deviceFingerprint: clientInfo.fingerprint,
      success: true,
      metadata: {
        sessionId,
        organizationName: selectedOrg.name,
      },
    });

    console.log(`[AUTH] User logged in: ${user.email} (org: ${selectedOrg.name})`);

    return res.json({
      success: true,
      token,
      user: userInfo,
      sessionId,
      message: 'Login successful',
    });

  } catch (error) {
    console.error('[AUTH] Complete login error:', error);
    throw error;
  }
}

// ============================================================================
// MFA SETUP ENDPOINTS
// ============================================================================

/**
 * @route POST /api/auth/enterprise/setup-mfa
 * @desc Initialize MFA setup - generate secret and QR code
 * @access Private
 */
router.post('/setup-mfa', async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `TrialSage:${decoded.email}`,
      length: 20,
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Generate backup codes
    const backupCodes = [];
    for (let i = 0; i < 10; i++) {
      backupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }

    // Store temporary secret (confirmed on verification)
    // In production, encrypt the secret before storing
    try {
      await db.execute(sql`
        INSERT INTO auth_mfa_secrets (user_id, secret_encrypted, backup_codes, enabled)
        VALUES (${decoded.userId}, ${secret.base32}, ${backupCodes}, false)
        ON CONFLICT (user_id) 
        DO UPDATE SET secret_encrypted = ${secret.base32}, backup_codes = ${backupCodes}, enabled = false, updated_at = NOW()
      `);
    } catch (err) {
      console.error('[AUTH] Failed to store MFA secret:', err.message);
    }

    return res.json({
      success: true,
      secret: secret.base32,
      qrCode: qrCodeUrl,
      backupCodes,
      message: 'Scan the QR code with your authenticator app',
    });

  } catch (error) {
    console.error('[AUTH] MFA setup error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'An error occurred',
    });
  }
});

/**
 * @route POST /api/auth/enterprise/confirm-mfa
 * @desc Confirm MFA setup by verifying first code
 * @access Private
 */
router.post('/confirm-mfa', async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    const { code } = req.body;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'CODE_REQUIRED',
        message: 'Verification code is required',
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Get pending MFA secret
    const mfaResult = await db.execute(sql`
      SELECT secret_encrypted FROM auth_mfa_secrets 
      WHERE user_id = ${decoded.userId} AND enabled = false
      LIMIT 1
    `);

    if (mfaResult.rows?.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_PENDING_MFA',
        message: 'No pending MFA setup found',
      });
    }

    const secret = mfaResult.rows[0].secret_encrypted;

    // Verify code
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CODE',
        message: 'Invalid verification code',
      });
    }

    // Enable MFA
    await db.execute(sql`
      UPDATE auth_mfa_secrets 
      SET enabled = true, updated_at = NOW()
      WHERE user_id = ${decoded.userId}
    `);

    await db.execute(sql`
      UPDATE users 
      SET mfa_enabled = true
      WHERE id = ${decoded.userId}
    `);

    await logAuthEvent('MFA_ENABLED', {
      userId: decoded.userId,
      email: decoded.email,
      ip: req.ip,
      success: true,
    });

    return res.json({
      success: true,
      message: 'MFA has been enabled successfully',
    });

  } catch (error) {
    console.error('[AUTH] MFA confirm error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'An error occurred',
    });
  }
});

/**
 * @route POST /api/auth/enterprise/disable-mfa
 * @desc Disable MFA for user
 * @access Private
 */
router.post('/disable-mfa', async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    const { code, password } = req.body;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    if (!code || !password) {
      return res.status(400).json({
        success: false,
        error: 'VERIFICATION_REQUIRED',
        message: 'MFA code and password are required',
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify password using raw SQL
    const userResult = await db.execute(sql`
      SELECT id, email, name, password_hash FROM users WHERE id = ${decoded.userId} LIMIT 1
    `);
    // Handle both drizzle-orm array result and pg rows object
    const userRows = Array.isArray(userResult) ? userResult : (userResult.rows || []);

    if (userRows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'USER_NOT_FOUND',
      });
    }

    const isValidPassword = await bcrypt.compare(password, userRows[0].password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_PASSWORD',
        message: 'Invalid password',
      });
    }

    // Verify MFA code
    const mfaResult = await db.execute(sql`
      SELECT secret_encrypted FROM auth_mfa_secrets 
      WHERE user_id = ${decoded.userId} AND enabled = true
      LIMIT 1
    `);

    if (mfaResult.rows?.length > 0) {
      const verified = speakeasy.totp.verify({
        secret: mfaResult.rows[0].secret_encrypted,
        encoding: 'base32',
        token: code,
        window: 1,
      });

      if (!verified) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_CODE',
          message: 'Invalid verification code',
        });
      }
    }

    // Disable MFA
    await db.execute(sql`
      DELETE FROM auth_mfa_secrets WHERE user_id = ${decoded.userId}
    `);

    await db.execute(sql`
      UPDATE users SET mfa_enabled = false WHERE id = ${decoded.userId}
    `);

    await logAuthEvent('MFA_DISABLED', {
      userId: decoded.userId,
      email: decoded.email,
      ip: req.ip,
      success: true,
    });

    return res.json({
      success: true,
      message: 'MFA has been disabled',
    });

  } catch (error) {
    console.error('[AUTH] MFA disable error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'An error occurred',
    });
  }
});

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * @route GET /api/auth/enterprise/sessions
 * @desc Get active sessions for current user
 * @access Private
 */
router.get('/sessions', async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const sessions = await db.execute(sql`
      SELECT id, ip_address, user_agent, created_at, last_activity, expires_at
      FROM auth_sessions
      WHERE user_id = ${decoded.userId} 
        AND revoked = false 
        AND expires_at > NOW()
      ORDER BY created_at DESC
    `);

    return res.json({
      success: true,
      currentSessionId: decoded.sessionId,
      sessions: sessions.rows?.map(s => ({
        id: s.id,
        ipAddress: s.ip_address,
        userAgent: s.user_agent,
        createdAt: s.created_at,
        lastActivity: s.last_activity,
        isCurrent: s.id === decoded.sessionId,
      })) || [],
    });

  } catch (error) {
    console.error('[AUTH] Sessions error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
    });
  }
});

/**
 * @route DELETE /api/auth/enterprise/sessions/:sessionId
 * @desc Revoke a specific session
 * @access Private
 */
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    const { sessionId } = req.params;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Revoke session
    await db.execute(sql`
      UPDATE auth_sessions 
      SET revoked = true, revoked_at = NOW(), revoke_reason = 'user_request'
      WHERE id = ${sessionId}::uuid AND user_id = ${decoded.userId}
    `);

    sessionManager.revokeSession(sessionId, 'user_request');

    await logAuthEvent('SESSION_REVOKED', {
      userId: decoded.userId,
      ip: req.ip,
      success: true,
      metadata: { revokedSessionId: sessionId, reason: 'user_request' },
    });

    return res.json({
      success: true,
      message: 'Session revoked',
    });

  } catch (error) {
    console.error('[AUTH] Revoke session error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
    });
  }
});

/**
 * @route POST /api/auth/enterprise/logout-all
 * @desc Revoke all sessions except current
 * @access Private
 */
router.post('/logout-all', async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Revoke all sessions except current
    await db.execute(sql`
      UPDATE auth_sessions 
      SET revoked = true, revoked_at = NOW(), revoke_reason = 'logout_all'
      WHERE user_id = ${decoded.userId} AND id != ${decoded.sessionId}::uuid
    `);

    await logAuthEvent('ALL_SESSIONS_REVOKED', {
      userId: decoded.userId,
      ip: req.ip,
      success: true,
      metadata: { keepSessionId: decoded.sessionId },
    });

    return res.json({
      success: true,
      message: 'All other sessions have been logged out',
    });

  } catch (error) {
    console.error('[AUTH] Logout all error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
    });
  }
});

// ============================================================================
// AUDIT LOG
// ============================================================================

/**
 * @route GET /api/auth/enterprise/audit-log
 * @desc Get authentication audit log for current user
 * @access Private
 */
router.get('/audit-log', async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const auditLog = await db.execute(sql`
      SELECT event_type, ip_address, user_agent, success, failure_reason, created_at, metadata
      FROM auth_audit_log
      WHERE user_id = ${decoded.userId}
      ORDER BY created_at DESC
      LIMIT 50
    `);

    return res.json({
      success: true,
      events: auditLog.rows?.map(e => ({
        type: e.event_type,
        ip: e.ip_address,
        userAgent: e.user_agent,
        success: e.success,
        failureReason: e.failure_reason,
        timestamp: e.created_at,
        metadata: e.metadata,
      })) || [],
    });

  } catch (error) {
    console.error('[AUTH] Audit log error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
    });
  }
});

export default router;

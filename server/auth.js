import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './db/index.js';
import {
  users,
  organizations,
  organizationUsers,
  integrationTokens,
  userIdentities,
} from '../shared/schema.ts';
import { and, eq } from 'drizzle-orm';

// Initialize auth router
const router = express.Router();

const buildJwtToken = ({ user, orgMemberships, primaryOrg }) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: primaryOrg.organizationId,
      role: primaryOrg.role,
      permissions: primaryOrg.permissions || {},
      organizations: orgMemberships.map(m => ({
        id: m.organizationId,
        name: m.orgName,
        slug: m.orgSlug,
        role: m.role,
      })),
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

const createStateToken = payload => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '10m' });
};

const verifyStateToken = token => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.verify(token, process.env.JWT_SECRET);
};

const getBaseUrl = req => process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;

const sanitizeRedirectPath = redirect => {
  if (!redirect || typeof redirect !== 'string') return '/login';
  if (redirect.startsWith('http://') || redirect.startsWith('https://')) return '/login';
  if (!redirect.startsWith('/')) return '/login';
  return redirect;
};

const slugify = value =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 64);

const findOrCreateOrganization = async emailDomain => {
  const existing = await db
    .select()
    .from(organizations)
    .where(eq(organizations.domain, emailDomain))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const allowJit = ['true', '1', 'yes'].includes(String(process.env.ALLOW_JIT_PROVISIONING).toLowerCase());
  if (!allowJit) {
    return null;
  }

  const orgName = emailDomain.split('.')[0]?.toUpperCase() || 'New Organization';
  const orgSlug = slugify(emailDomain);
  const [created] = await db
    .insert(organizations)
    .values({
      name: orgName,
      slug: orgSlug,
      domain: emailDomain,
      tier: 'standard',
      status: 'active',
    })
    .returning();

  return created;
};

const upsertUserIdentity = async ({ provider, providerUserId, email, userId, metadata }) => {
  const existingIdentity = await db
    .select()
    .from(userIdentities)
    .where(and(eq(userIdentities.provider, provider), eq(userIdentities.providerUserId, providerUserId)))
    .limit(1);

  if (existingIdentity.length > 0) {
    await db
      .update(userIdentities)
      .set({ email, metadata, updatedAt: new Date() })
      .where(eq(userIdentities.id, existingIdentity[0].id));
    return existingIdentity[0];
  }

  const [created] = await db
    .insert(userIdentities)
    .values({
      userId,
      provider,
      providerUserId,
      email,
      metadata,
    })
    .returning();

  return created;
};

const ensureOrganizationUser = async ({ organizationId, userId }) => {
  const existing = await db
    .select()
    .from(organizationUsers)
    .where(and(eq(organizationUsers.organizationId, organizationId), eq(organizationUsers.userId, userId)))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const [created] = await db
    .insert(organizationUsers)
    .values({
      organizationId,
      userId,
      role: 'member',
      permissions: {},
    })
    .returning();

  return created;
};

const upsertIntegrationToken = async ({ organizationId, userId, provider, token, refreshToken, expiresIn, scope, metadata }) => {
  const expiresAt = new Date(Date.now() + (Number(expiresIn) || 3600) * 1000);

  const existing = await db
    .select()
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.organizationId, organizationId),
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, provider)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(integrationTokens)
      .set({
        accessToken: token,
        refreshToken: refreshToken || existing[0].refreshToken,
        expiresAt,
        scope,
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(integrationTokens.id, existing[0].id));
    return;
  }

  await db.insert(integrationTokens).values({
    organizationId,
    userId,
    provider,
    accessToken: token,
    refreshToken,
    expiresAt,
    scope,
    metadata,
  });
};

// Login endpoint - SECURE IMPLEMENTATION
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Fetch user from database by email
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (userResult.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const user = userResult[0];

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active. Please contact support.',
      });
    }

    // Validate password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Get user's organization memberships
    const orgMemberships = await db
      .select({
        organizationId: organizationUsers.organizationId,
        role: organizationUsers.role,
        permissions: organizationUsers.permissions,
        orgName: organizations.name,
        orgSlug: organizations.slug,
        orgTier: organizations.tier,
      })
      .from(organizationUsers)
      .leftJoin(organizations, eq(organizationUsers.organizationId, organizations.id))
      .where(eq(organizationUsers.userId, user.id));

    if (orgMemberships.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'User is not associated with any organization. Please contact support.',
      });
    }

    // Use default organization or first organization
    const defaultOrg = user.defaultOrganizationId
      ? orgMemberships.find(m => m.organizationId === user.defaultOrganizationId)
      : orgMemberships[0];

    const primaryOrg = defaultOrg || orgMemberships[0];

    // Update last login timestamp
    await db
      .update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, user.id));

    // Generate JWT token with organizationId embedded (IMMUTABLE)
    const token = buildJwtToken({ user, orgMemberships, primaryOrg });

    // Return user data without sensitive information
    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      title: user.title,
      avatar: user.avatar,
      status: user.status,
      organization: {
        id: primaryOrg.organizationId,
        name: primaryOrg.orgName,
        slug: primaryOrg.orgSlug,
        tier: primaryOrg.orgTier,
        role: primaryOrg.role,
      },
      organizations: orgMemberships.map(m => ({
        id: m.organizationId,
        name: m.orgName,
        slug: m.orgSlug,
        role: m.role,
      })),
      lastLogin: new Date().toISOString(),
    };

    res.json({
      success: true,
      message: 'Authentication successful',
      token,
      user: userResponse,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication',
    });
  }
});

// Protected route to get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    // Fetch user from database using req.user.id from JWT
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    if (userResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const user = userResult[0];

    // Get organization info from JWT (already verified)
    const organizationId = req.user.organizationId;

    const orgResult = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const organization = orgResult[0];

    // Return user data without sensitive information
    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      title: user.title,
      department: user.department,
      avatar: user.avatar,
      status: user.status,
      organization: {
        id: organizationId,
        name: organization?.name,
        slug: organization?.slug,
        tier: organization?.tier,
        role: req.user.role,
      },
      lastLogin: user.lastLogin,
    };

    res.json({
      success: true,
      user: userResponse,
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile',
    });
  }
});

// Logout endpoint (client-side token removal)
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful',
  });
});

// Verify token endpoint
router.get('/verify', authenticateToken, (_req, res) => {
  res.json({ success: true });
});

// SSO URL generator
router.get('/sso/:provider/url', async (req, res) => {
  try {
    const provider = String(req.params.provider || '').toLowerCase();
    const redirectParam = Array.isArray(req.query.redirect)
      ? req.query.redirect[0]
      : req.query.redirect;
    const redirect = sanitizeRedirectPath(redirectParam);

    if (!['google', 'microsoft'].includes(provider)) {
      return res.status(400).json({ message: 'Unsupported SSO provider' });
    }

    const state = createStateToken({ provider, redirect });

    if (provider === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${getBaseUrl(req)}/api/auth/sso/google/callback`;

      if (!clientId) {
        return res.status(500).json({ message: 'Google SSO is not configured' });
      }

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'consent',
        state,
      });

      return res.json({ authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI || `${getBaseUrl(req)}/api/auth/sso/microsoft/callback`;

    if (!clientId) {
      return res.status(500).json({ message: 'Microsoft SSO is not configured' });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: 'openid email profile offline_access https://graph.microsoft.com/User.Read',
      state,
    });

    return res.json({
      authUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`,
    });
  } catch (error) {
    console.error('SSO URL error:', error);
    res.status(500).json({ message: 'Failed to generate SSO URL' });
  }
});

// SSO callback handler
router.get('/sso/:provider/callback', async (req, res) => {
  try {
    const provider = String(req.params.provider || '').toLowerCase();
    const { code, state, error } = req.query;
    const baseUrl = getBaseUrl(req);

    if (error) {
      const redirectPath = '/login?error=sso';
      return res.redirect(`${baseUrl}${redirectPath}`);
    }

    if (!code || !state) {
      return res.redirect(`${baseUrl}/login?error=missing_code`);
    }

    const statePayload = verifyStateToken(String(state));
    const redirectPath = sanitizeRedirectPath(statePayload.redirect);

    if (statePayload.provider && statePayload.provider !== provider) {
      return res.redirect(`${baseUrl}${redirectPath}?error=state_mismatch`);
    }

    if (!['google', 'microsoft'].includes(provider)) {
      return res.redirect(`${baseUrl}${redirectPath}?error=unsupported_provider`);
    }

    let tokenResponse;
    let profile;

    if (provider === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/sso/google/callback`;

      if (!clientId || !clientSecret) {
        return res.redirect(`${baseUrl}${redirectPath}?error=google_not_configured`);
      }

      const params = new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      });

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      tokenResponse = await tokenRes.json();
      if (!tokenRes.ok) {
        console.error('Google token error:', tokenResponse);
        return res.redirect(`${baseUrl}${redirectPath}?error=google_token`);
      }

      const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
      });
      profile = await userRes.json();
      if (!userRes.ok) {
        console.error('Google profile error:', profile);
        return res.redirect(`${baseUrl}${redirectPath}?error=google_profile`);
      }
    } else {
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
      const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
      const redirectUri = process.env.MICROSOFT_REDIRECT_URI || `${baseUrl}/api/auth/sso/microsoft/callback`;

      if (!clientId || !clientSecret) {
        return res.redirect(`${baseUrl}${redirectPath}?error=microsoft_not_configured`);
      }

      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(code),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'openid email profile offline_access https://graph.microsoft.com/User.Read',
      });

      const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      tokenResponse = await tokenRes.json();
      if (!tokenRes.ok) {
        console.error('Microsoft token error:', tokenResponse);
        return res.redirect(`${baseUrl}${redirectPath}?error=microsoft_token`);
      }

      const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
      });
      profile = await userRes.json();
      if (!userRes.ok) {
        console.error('Microsoft profile error:', profile);
        return res.redirect(`${baseUrl}${redirectPath}?error=microsoft_profile`);
      }
    }

    const email = String(profile.email || profile.mail || profile.userPrincipalName || '').toLowerCase();
    if (!email) {
      return res.redirect(`${baseUrl}${redirectPath}?error=no_email`);
    }

    const emailDomain = email.split('@')[1];
    const organization = await findOrCreateOrganization(emailDomain);
    if (!organization) {
      return res.redirect(`${baseUrl}${redirectPath}?error=unprovisioned`);
    }

    let userRecord;
    const providerUserId = String(profile.sub || profile.id);

    const identity = await db
      .select()
      .from(userIdentities)
      .where(and(eq(userIdentities.provider, provider), eq(userIdentities.providerUserId, providerUserId)))
      .limit(1);

    if (identity.length > 0) {
      const userResult = await db.select().from(users).where(eq(users.id, identity[0].userId)).limit(1);
      userRecord = userResult[0];
    }

    if (!userRecord) {
      const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
      userRecord = existingUser[0];
    }

    if (!userRecord) {
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
      const [created] = await db
        .insert(users)
        .values({
          email,
          name: profile.name || profile.displayName || email.split('@')[0],
          passwordHash,
          status: 'active',
          defaultOrganizationId: organization.id,
        })
        .returning();
      userRecord = created;
    }

    await ensureOrganizationUser({ organizationId: organization.id, userId: userRecord.id });

    if (!userRecord.defaultOrganizationId) {
      await db
        .update(users)
        .set({ defaultOrganizationId: organization.id })
        .where(eq(users.id, userRecord.id));
    }

    await upsertUserIdentity({
      provider,
      providerUserId,
      email,
      userId: userRecord.id,
      metadata: { raw: profile },
    });

    await upsertIntegrationToken({
      organizationId: organization.id,
      userId: userRecord.id,
      provider,
      token: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in,
      scope: tokenResponse.scope,
      metadata: { id_token: tokenResponse.id_token },
    });

    const orgMemberships = await db
      .select({
        organizationId: organizationUsers.organizationId,
        role: organizationUsers.role,
        permissions: organizationUsers.permissions,
        orgName: organizations.name,
        orgSlug: organizations.slug,
      })
      .from(organizationUsers)
      .leftJoin(organizations, eq(organizationUsers.organizationId, organizations.id))
      .where(eq(organizationUsers.userId, userRecord.id));

    const primaryOrg = orgMemberships.find(m => m.organizationId === organization.id) || orgMemberships[0];
    const token = buildJwtToken({ user: userRecord, orgMemberships, primaryOrg });

    return res.redirect(`${baseUrl}${redirectPath}?token=${encodeURIComponent(token)}`);
  } catch (error) {
    console.error('SSO callback error:', error);
    const baseUrl = getBaseUrl(req);
    return res.redirect(`${baseUrl}/login?error=sso_failed`);
  }
});

// Middleware to authenticate JWT token - SECURE IMPLEMENTATION
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication token is required',
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired. Please login again.',
        });
      }
      return res.status(403).json({
        success: false,
        message: 'Invalid token',
      });
    }

    // CRITICAL SECURITY: organizationId comes ONLY from verified JWT token
    // Never trust client-provided headers for tenant isolation
    if (!user.organizationId) {
      return res.status(403).json({
        success: false,
        message: 'Invalid token: missing organization context',
      });
    }

    req.user = user;
    // Set organizationId from JWT for backward compatibility with existing code
    req.organizationId = user.organizationId;
    next();
  });
}

// Helper function to verify a token (for other server components)
function verifyToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}

export {
  router,
  authenticateToken,
  verifyToken,
};

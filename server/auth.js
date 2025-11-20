import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db/index.js';
import { users, organizations, organizationUsers } from '../shared/schema.js';
import { eq, and } from 'drizzle-orm';

// Initialize auth router
const router = express.Router();

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
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: primaryOrg.organizationId, // CRITICAL: Server-verified tenant ID
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

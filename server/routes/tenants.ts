/**
 * Tenant Management API Routes
 *
 * Handles tenant provisioning, configuration, and management.
 */
import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import {
  organizations,
  organizationUsers,
  users,
  insertOrganizationSchema,
} from '../../shared/schema';
import {
  requireOrganizationContext,
  validateTenantAccessMiddleware,
} from '../middleware/tenantContext';
import { authMiddleware, requireAdminRole, requireSuperAdminRole } from '../auth';
import { createScopedLogger } from '../utils/logger';
import { db } from '../db';
import crypto from 'crypto';

const logger = createScopedLogger('tenant-api');
const router = Router();
const isDemoMode = ['true', '1', 'yes'].includes(String(process.env.DEMO_MODE).toLowerCase());

const demoTenants = [
  {
    id: 1,
    name: 'Northstar Diagnostics, Inc.',
    slug: 'northstar-diagnostics',
    domain: 'northstar.example.com',
    logo: null,
    tier: 'professional',
    maxUsers: 25,
    maxProjects: 50,
    maxStorage: 100,
    status: 'active',
    settings: {
      industryType: 'meddevice',
      complianceLevel: 'enhanced',
      region: 'US',
      primaryRegulatoryPathway: '510k',
      deviceFocus: ['IVD', 'Point-of-Care'],
    },
  },
  {
    id: 2,
    name: 'Apex Orthopedics, LLC',
    slug: 'apex-orthopedics',
    domain: 'apex-ortho.example.com',
    logo: null,
    tier: 'enterprise',
    maxUsers: 75,
    maxProjects: 150,
    maxStorage: 500,
    status: 'active',
    settings: {
      industryType: 'meddevice',
      complianceLevel: 'enhanced',
      region: 'US/EU',
      primaryRegulatoryPathway: '510k',
      deviceFocus: ['Implant', 'Instrument'],
    },
  },
  {
    id: 3,
    name: 'ClearWave Cardio Systems',
    slug: 'clearwave-cardio',
    domain: 'clearwave.example.com',
    logo: null,
    tier: 'standard',
    maxUsers: 10,
    maxProjects: 20,
    maxStorage: 25,
    status: 'active',
    settings: {
      industryType: 'meddevice',
      complianceLevel: 'standard',
      region: 'US',
      primaryRegulatoryPathway: '510k',
      deviceFocus: ['Cardiology', 'Software as a Medical Device'],
    },
  },
];

// Schema for tenant creation
const createTenantSchema = z.object({
  name: z.string().min(3).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, {
      message: 'Slug can only contain lowercase letters, numbers, and hyphens',
    }),
  domain: z.string().optional(),
  tier: z.enum(['standard', 'professional', 'enterprise']).default('standard'),
  maxUsers: z.number().int().positive().optional(),
  maxProjects: z.number().int().positive().optional(),
  maxStorage: z.number().int().positive().optional(),
  settings: z.record(z.any()).optional(),
});

// Schema for tenant update
const updateTenantSchema = createTenantSchema.partial();

/**
 * GET /api/tenants
 * Get all tenants the current user has access to
 */
router.get('/', async (req, res) => {
  try {
    if (isDemoMode || process.env.NODE_ENV === 'development') {
      return res.json(demoTenants);
    }

    // If user is super admin, get all tenants
    if (req.userRole === 'super_admin') {
      const allTenants = await db.select().from(organizations);
      return res.json(allTenants);
    }

    // Otherwise, get tenants the user has access to
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Find all organizations the user belongs to
    const userOrgs = await db
      .select({
        organization: organizations,
      })
      .from(organizationUsers)
      .innerJoin(organizations, eq(organizations.id, organizationUsers.organizationId))
      .where(eq(organizationUsers.userId, req.userId));

    const tenants = userOrgs.map(row => row.organization);
    res.json(tenants);
  } catch (error) {
    logger.error('Error retrieving tenants', error);
    res.status(500).json({ error: 'Failed to retrieve tenants' });
  }
});

/**
 * GET /api/tenants/:id
 * Get details for a specific tenant
 */
router.get('/:id', async (req, res, next) => {
  if (process.env.NODE_ENV !== 'development') return next();
  const tenantId = parseInt(req.params.id);
  const tenant = demoTenants.find(t => t.id === tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  return res.json({
    ...tenant,
    apiKey: 'demo-dev-api-key',
    settings: {
      ...(tenant as any).settings,
      brandColor: '#10b981',
      enableNotifications: true,
      allowGuests: false,
    },
  });
});

// Apply auth middleware to tenant routes (except dev-only listing endpoints above)
router.use(authMiddleware);

/**
 * GET /api/tenants/:id
 * Get details for a specific tenant
 */
router.get('/:id', validateTenantAccessMiddleware, async (req, res) => {
  const tenantId = parseInt(req.params.id);

  try {
    // For development, return mock data
    if (process.env.NODE_ENV === 'development' && tenantId === 1) {
      return res.json({
        id: 1,
        name: 'Acme Medical Devices',
        slug: 'acme-medical',
        domain: 'acme-medical.example.com',
        logo: null,
        apiKey: 'acme-dev-api-key-12345',
        tier: 'professional',
        maxUsers: 10,
        maxProjects: 20,
        maxStorage: 50,
        status: 'active',
        settings: {
          brandColor: '#4f46e5',
          enableNotifications: true,
          allowGuests: false,
        },
      });
    }

    const tenant = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1);

    if (!tenant.length) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json(tenant[0]);
  } catch (error) {
    logger.error('Error retrieving tenant', error);
    res.status(500).json({ error: 'Failed to retrieve tenant' });
  }
});

/**
 * POST /api/tenants
 * Create a new tenant
 * Requires super_admin role (or admin role in development)
 */
router.post(
  '/',
  async (req, res, next) => {
    try {
      // Check if any organizations exist
      const orgCount = await db.select({ count: organizations.id }).from(organizations);
      
      // If no organizations exist, allow any authenticated user to create the first one
      if (!orgCount || orgCount.length === 0) {
        // Still require authentication
        if (!req.userId) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        return next();
      }
      
      // In development, allow admin role to create organizations
      if (process.env.NODE_ENV === 'development') {
        if (!req.userRole || (req.userRole !== 'admin' && req.userRole !== 'super_admin')) {
          return res.status(403).json({ error: 'Admin or super admin permissions required' });
        }
        return next();
      }
      // In production, require super_admin
      return requireSuperAdminRole(req, res, next);
    } catch (error) {
      logger.error('Error checking organization count', error);
      return res.status(500).json({ error: 'Failed to check organization permissions' });
    }
  },
  async (req, res) => {
    try {
      // Validate request body
      const validatedData = createTenantSchema.parse(req.body);

      // Check if slug is already taken
      const existingTenant = await db
        .select()
        .from(organizations)
        .where(eq(organizations.slug, validatedData.slug))
        .limit(1);

      if (existingTenant.length) {
        return res.status(400).json({ error: 'Organization slug already in use' });
      }

      // Generate API key if not provided
      const apiKey = crypto.randomBytes(16).toString('hex');

      // Create new tenant
      const newTenant = await db
        .insert(organizations)
        .values({
          ...validatedData,
          apiKey,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Add the creating user as an admin of the new organization
      if (req.userId && newTenant[0]) {
        await db.insert(organizationUsers).values({
          organizationId: newTenant[0].id,
          userId: req.userId,
          role: 'admin',
          joinedAt: new Date(),
        });
      }

      res.status(201).json(newTenant[0]);
    } catch (error) {
      logger.error('Error creating tenant', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid tenant data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to create tenant' });
    }
  }
);

/**
 * PATCH /api/tenants/:id
 * Update an existing tenant
 * Requires admin role or super_admin role
 */
router.patch('/:id', validateTenantAccessMiddleware, requireAdminRole, async (req, res) => {
  const tenantId = parseInt(req.params.id);

  try {
    // Validate request body
    const validatedData = updateTenantSchema.parse(req.body);

    // Mock response for development
    if (process.env.NODE_ENV === 'development' && tenantId === 1) {
      return res.json({
        id: 1,
        ...validatedData,
        apiKey: 'acme-dev-api-key-12345',
        status: 'active',
        updatedAt: new Date().toISOString(),
      });
    }

    // Check if tenant exists
    const existingTenant = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1);

    if (!existingTenant.length) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // If slug is being changed, check if new slug is available
    if (validatedData.slug && validatedData.slug !== existingTenant[0].slug) {
      const slugCheck = await db
        .select()
        .from(organizations)
        .where(eq(organizations.slug, validatedData.slug))
        .limit(1);

      if (slugCheck.length) {
        return res.status(400).json({ error: 'Organization slug already in use' });
      }
    }

    // Update tenant
    const updatedTenant = await db
      .update(organizations)
      .set({
        ...validatedData,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, tenantId))
      .returning();

    res.json(updatedTenant[0]);
  } catch (error) {
    logger.error('Error updating tenant', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid tenant data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

/**
 * DELETE /api/tenants/:id
 * Delete a tenant
 * Requires super_admin role
 */
router.delete('/:id', requireSuperAdminRole, async (req, res) => {
  const tenantId = parseInt(req.params.id);

  try {
    // Check if tenant exists
    const existingTenant = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1);

    if (!existingTenant.length) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Delete tenant
    await db.delete(organizations).where(eq(organizations.id, tenantId));

    res.status(204).end();
  } catch (error) {
    logger.error('Error deleting tenant', error);
    res.status(500).json({ error: 'Failed to delete tenant' });
  }
});

/**
 * POST /api/tenants/:id/api-key
 * Generate a new API key for a tenant
 * Requires admin role
 */
router.post('/:id/api-key', validateTenantAccessMiddleware, requireAdminRole, async (req, res) => {
  const tenantId = parseInt(req.params.id);

  try {
    // Mock response for development
    if (process.env.NODE_ENV === 'development' && tenantId === 1) {
      return res.json({
        id: 1,
        apiKey: 'acme-dev-api-key-' + Math.random().toString(36).substring(2, 15),
      });
    }

    // Check if tenant exists
    const existingTenant = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1);

    if (!existingTenant.length) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Generate new API key
    const apiKey = crypto.randomBytes(16).toString('hex');

    // Update tenant with new API key
    const updatedTenant = await db
      .update(organizations)
      .set({
        apiKey,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, tenantId))
      .returning();

    res.json({
      id: updatedTenant[0].id,
      apiKey: updatedTenant[0].apiKey,
    });
  } catch (error) {
    logger.error('Error generating API key', error);
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

export default router;

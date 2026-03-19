/**
 * Simple Tenant Management API Routes for testing
 */
import { Router } from 'express';
import { z } from 'zod';
import postgres from 'postgres';

const router = Router();

/**
 * Clean a database URL by removing common wrapper artifacts
 * like `psql '...'` that can be accidentally copied from terminal commands
 */
function cleanDatabaseUrl(url: string | undefined): string {
  if (!url) return '';
  let cleaned = url;

  // Remove psql command wrapper if present: psql 'postgresql://...' or psql "postgresql://..."
  if (cleaned.startsWith('psql ')) {
    cleaned = cleaned.substring(5); // Remove 'psql '
  }

  // Remove surrounding quotes (single or double)
  if (
    (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
    (cleaned.startsWith('"') && cleaned.endsWith('"'))
  ) {
    cleaned = cleaned.slice(1, -1);
  }

  // Remove any leading/trailing whitespace
  return cleaned.trim();
}

// Use the same connection method as the main db
const rawConnectionString = process.env.DATABASE_URL || process.env.DATABASE_NEON_NEW_SECRET || '';
const connectionString = cleanDatabaseUrl(rawConnectionString);
const sql = postgres(connectionString, {
  ssl:
    connectionString?.includes('neon.tech') || process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

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
  tier: z.enum(['free', 'standard', 'professional', 'enterprise']).default('standard'),
  industryType: z.enum(['biotech', 'cro', 'pharma', 'meddevice']).default('pharma'),
  complianceLevel: z.enum(['base', 'standard', 'enhanced']).default('standard'),
  maxUsers: z.number().int().positive().optional(),
  maxProjects: z.number().int().positive().optional(),
  maxStorage: z.number().int().positive().optional(),
  settings: z.record(z.any()).optional(),
});

// Schema for tenant updates - same as create but all fields optional
const updateTenantSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, {
      message: 'Slug can only contain lowercase letters, numbers, and hyphens',
    })
    .optional(),
  domain: z.string().optional(),
  tier: z.enum(['free', 'standard', 'professional', 'enterprise']).optional(),
  industryType: z.enum(['biotech', 'cro', 'pharma', 'meddevice']).optional(),
  complianceLevel: z.enum(['base', 'standard', 'enhanced']).optional(),
  maxUsers: z.number().int().positive().optional(),
  maxProjects: z.number().int().positive().optional(),
  maxStorage: z.number().int().positive().optional(),
});

/**
 * GET /api/tenants
 * Get all tenants - simple version
 */
router.get('/', async (req, res) => {
  try {
    const result = await sql`
      SELECT id, name, slug, domain, logo, tier, max_users as "maxUsers",
             max_projects as "maxProjects", max_storage as "maxStorage",
             status, created_at as "createdAt", updated_at as "updatedAt"
      FROM organizations
      ORDER BY created_at DESC
    `;

    console.log('Retrieved tenants from database:', result.length);

    return res.json(result);
  } catch (error) {
    console.error('Error retrieving tenants', error);
    res.status(500).json({ error: 'Failed to retrieve tenants' });
  }
});

/**
 * POST /api/tenants
 * Create a new tenant - simple version
 */
router.post('/', async (req, res) => {
  try {
    console.log('Create tenant request received:', req.body);

    // Validate request body
    const validatedData = createTenantSchema.parse(req.body);
    console.log('Validated data:', validatedData);

    // SECURITY: Use crypto.randomBytes for API key generation (not Math.random)
    const crypto = await import('crypto');
    const apiKey = 'c2c_' + crypto.randomBytes(24).toString('base64url');

    // Use postgres to create tenant
    const result = await sql`
      INSERT INTO organizations (name, slug, domain, tier, max_users, max_projects, max_storage, status, api_key)
      VALUES (
        ${validatedData.name},
        ${validatedData.slug},
        ${validatedData.domain || null},
        ${validatedData.tier || 'standard'},
        ${validatedData.maxUsers || 5},
        ${validatedData.maxProjects || 10},
        ${validatedData.maxStorage || 5},
        'active',
        ${apiKey}
      )
      RETURNING id, name, slug, domain, logo, tier, max_users as "maxUsers",
               max_projects as "maxProjects", max_storage as "maxStorage",
               status, created_at as "createdAt", updated_at as "updatedAt"
    `;

    const newTenant = result[0];
    console.log('Created tenant in database:', newTenant);
    res.status(201).json(newTenant);
  } catch (error) {
    console.error('Error creating tenant:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid tenant data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

/**
 * PATCH /api/tenants/:id
 * Update an existing tenant/organization
 */
router.patch('/:id', async (req, res) => {
  try {
    const tenantId = parseInt(req.params.id);
    console.log('🔍 Update tenant request data:', req.body);
    const validatedData = updateTenantSchema.parse(req.body);
    console.log('🔍 Validated update data:', validatedData);

    // Use postgres for update
    const result = await sql`
      UPDATE organizations
      SET
        name = ${validatedData.name || sql`name`},
        slug = ${validatedData.slug || sql`slug`},
        domain = ${validatedData.domain || sql`domain`},
        tier = ${validatedData.tier || sql`tier`},
        max_users = ${validatedData.maxUsers || sql`max_users`},
        max_projects = ${validatedData.maxProjects || sql`max_projects`},
        max_storage = ${validatedData.maxStorage || sql`max_storage`},
        updated_at = NOW()
      WHERE id = ${tenantId}
      RETURNING id, name, slug, domain, logo, tier, max_users as "maxUsers",
               max_projects as "maxProjects", max_storage as "maxStorage",
               status, created_at as "createdAt", updated_at as "updatedAt"
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const updatedTenant = result[0];
    console.log('Updated tenant in database:', updatedTenant);
    res.json(updatedTenant);
  } catch (error) {
    console.error('Error updating tenant:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid tenant data', details: error.errors });
    }
    // Handle duplicate slug constraint error
    if (
      (error as any).code === '23505' &&
      (error as any).constraint === 'organizations_slug_unique'
    ) {
      return res.status(409).json({
        error: 'Organization URL slug already exists',
        message: 'Please choose a different organization name or URL slug.',
      });
    }
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

/**
 * GET /api/tenant-users/:tenantId
 * Get users for a specific tenant
 */
router.get('/:tenantId/users', async (req, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }

    // Get users for this organization with their roles
    const result = await sql`
      SELECT
        u.id,
        u.email,
        u.name,
        u.title,
        u.department,
        u.avatar,
        u.status,
        u.last_login as "lastLogin",
        u.created_at as "createdAt",
        ou.role,
        ou.created_at as "joinedAt"
      FROM users u
      INNER JOIN organization_users ou ON u.id = ou.user_id
      WHERE ou.organization_id = ${tenantId}
      ORDER BY u.name ASC
    `;

    res.json(result);
  } catch (error) {
    console.error('Error retrieving tenant users', error);
    res.status(500).json({ error: 'Failed to retrieve tenant users' });
  }
});

/**
 * DELETE /api/tenants/:id
 * Delete an organization and all its related data
 */
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = parseInt(req.params.id);
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    // SAFETY: Require explicit confirmation header for destructive tenant deletion
    const confirmation = req.headers['x-confirm-delete'] as string;
    if (confirmation !== `delete-org-${tenantId}`) {
      return res.status(400).json({
        error: 'Destructive operation requires confirmation',
        hint: `Set header x-confirm-delete: delete-org-${tenantId}`,
      });
    }

    // Use transaction with postgres
    await sql.begin(async sql => {
      // Check if organization exists
      const checkResult = await sql`SELECT id, name FROM organizations WHERE id = ${tenantId}`;

      if (checkResult.length === 0) {
        throw new Error('Organization not found');
      }

      const orgName = checkResult[0].name;

      // Delete related data in the correct order to handle foreign key constraints

      // 1. Delete projects (if projects table exists)
      try {
        await sql`DELETE FROM projects WHERE organization_id = ${tenantId}`;
        console.log(`Deleted projects for organization ${tenantId}`);
      } catch (error) {
        console.log('Projects table might not exist or already empty:', (error as any).message);
      }

      // 2. Delete organization_users relationships
      await sql`DELETE FROM organization_users WHERE organization_id = ${tenantId}`;
      console.log(`Deleted organization_users for organization ${tenantId}`);

      // 3. Delete client_workspaces
      try {
        await sql`DELETE FROM client_workspaces WHERE organization_id = ${tenantId}`;
        console.log(`Deleted client_workspaces for organization ${tenantId}`);
      } catch (error) {
        console.log(
          'Client workspaces table might not exist or already empty:',
          (error as any).message
        );
      }

      // 4. Finally delete the organization itself
      await sql`DELETE FROM organizations WHERE id = ${tenantId}`;
      console.log(`Deleted organization ${tenantId}: ${orgName}`);

      res.json({
        success: true,
        message: `Organization "${orgName}" and all its data have been permanently deleted`,
        deletedOrganizationId: tenantId,
      });
    });
  } catch (error) {
    console.error('Error deleting organization:', error);
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

/**
 * POST /api/tenants/:id/api-key
 * Generate a new API key for an organization
 */
router.post('/:id/api-key', async (req, res) => {
  try {
    const tenantId = parseInt(req.params.id);
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    // Generate new API key
    const newApiKey =
      'trialsage-api-' +
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);

    // Update the organization with the new API key
    const result = await sql`
      UPDATE organizations
      SET api_key = ${newApiKey}, updated_at = NOW()
      WHERE id = ${tenantId}
      RETURNING id, name, api_key as "apiKey"
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const updatedOrg = result[0];
    console.log('Generated new API key for organization:', updatedOrg.id);

    res.json({
      id: updatedOrg.id,
      name: updatedOrg.name,
      apiKey: updatedOrg.apiKey,
      message: 'API key generated successfully',
    });
  } catch (error) {
    console.error('Error generating API key:', error);
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

export default router;

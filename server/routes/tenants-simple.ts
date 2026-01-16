/**
 * Simple Tenant Management API Routes for testing
 */
import { Router } from 'express';
import { z } from 'zod';
import postgres from 'postgres';

const router = Router();

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);

// Use the same connection method as the main db.
// IMPORTANT: In dev/demo environments without DATABASE_URL, we run in memory.
const connectionString = process.env.DATABASE_URL || '';
const sql = hasDatabaseUrl
  ? postgres(connectionString, {
      ssl:
        connectionString?.includes('neon.tech') || process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false,
    })
  : null;

type DemoTenant = {
  id: number;
  name: string;
  slug: string;
  domain: string | null;
  logo: string | null;
  tier: 'free' | 'standard' | 'professional' | 'enterprise';
  industryType: 'biotech' | 'cro' | 'pharma' | 'meddevice';
  complianceLevel: 'base' | 'standard' | 'enhanced';
  maxUsers: number;
  maxProjects: number;
  maxStorage: number;
  status: 'active' | 'inactive' | 'suspended';
  settings?: Record<string, any>;
};

const demoTenantStore: DemoTenant[] = [
  {
    id: 1,
    name: 'Northstar Diagnostics, Inc.',
    slug: 'northstar-diagnostics',
    domain: 'northstar.example.com',
    logo: null,
    tier: 'professional',
    industryType: 'meddevice',
    complianceLevel: 'enhanced',
    maxUsers: 25,
    maxProjects: 50,
    maxStorage: 100,
    status: 'active',
    settings: {
      region: 'US',
      primaryRegulatoryPathway: '510k',
      deviceFocus: ['IVD', 'Point-of-Care'],
      contact: { name: 'Regulatory Ops', email: 'regops@northstar.example.com' },
    },
  },
  {
    id: 2,
    name: 'Apex Orthopedics, LLC',
    slug: 'apex-orthopedics',
    domain: 'apex-ortho.example.com',
    logo: null,
    tier: 'enterprise',
    industryType: 'meddevice',
    complianceLevel: 'enhanced',
    maxUsers: 75,
    maxProjects: 150,
    maxStorage: 500,
    status: 'active',
    settings: {
      region: 'US/EU',
      primaryRegulatoryPathway: '510k',
      deviceFocus: ['Implant', 'Instrument'],
      contact: { name: 'Quality Systems', email: 'qs@apex-ortho.example.com' },
    },
  },
  {
    id: 3,
    name: 'ClearWave Cardio Systems',
    slug: 'clearwave-cardio',
    domain: 'clearwave.example.com',
    logo: null,
    tier: 'standard',
    industryType: 'meddevice',
    complianceLevel: 'standard',
    maxUsers: 10,
    maxProjects: 20,
    maxStorage: 25,
    status: 'active',
    settings: {
      region: 'US',
      primaryRegulatoryPathway: '510k',
      deviceFocus: ['Cardiology', 'SaMD'],
      contact: { name: 'Clinical Affairs', email: 'clinical@clearwave.example.com' },
    },
  },
];

const shouldFallbackToDemoTenants = (error: unknown) => {
  if (process.env.NODE_ENV !== 'development') return false;

  const anyErr: any = error;
  const code = anyErr?.code;
  const message = String(anyErr?.message || '');
  if (code === 'ECONNREFUSED' || code === 'NO_DB') return true;
  if (message.includes('ECONNREFUSED')) return true;
  if (message.includes('DATABASE_URL') && message.includes('not set')) return true;

  const nested = anyErr?.errors;
  if (Array.isArray(nested) && nested.some((e: any) => e?.code === 'ECONNREFUSED')) return true;
  return false;
};

const generateSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'tenant';

// Cache detected organization columns to avoid repeated information_schema calls
let cachedOrganizationColumns: Set<string> | null = null;
const getOrganizationColumns = async () => {
  if (!hasDatabaseUrl || !sql) {
    return new Set<string>();
  }
  if (cachedOrganizationColumns) {
    return cachedOrganizationColumns;
  }

  const columns = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations'
  `;

  cachedOrganizationColumns = new Set((columns as any[]).map(col => col.column_name));
  return cachedOrganizationColumns;
};

const invalidateOrganizationColumnsCache = () => {
  cachedOrganizationColumns = null;
};

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
    if (!hasDatabaseUrl || !sql) {
      return res.json(demoTenantStore);
    }

    const organizationColumns = await getOrganizationColumns();

    const queryResult = await sql`
      SELECT *
      FROM organizations
      ORDER BY created_at DESC
    `;

    const normalizedResult = (queryResult as any[]).map(org => ({
      id: org.id,
      name: org.name,
      slug: organizationColumns.has('slug') ? org.slug ?? generateSlug(org.name) : generateSlug(org.name),
      domain: organizationColumns.has('domain') ? org.domain ?? null : null,
      logo: organizationColumns.has('logo') ? org.logo ?? null : null,
      tier: organizationColumns.has('tier') ? org.tier ?? 'standard' : 'standard',
      maxUsers: organizationColumns.has('max_users') ? org.max_users ?? null : null,
      maxProjects: organizationColumns.has('max_projects') ? org.max_projects ?? null : null,
      maxStorage: organizationColumns.has('max_storage') ? org.max_storage ?? null : null,
      status: organizationColumns.has('status') ? org.status ?? 'active' : 'active',
      createdAt: 'created_at' in org ? org.created_at ?? null : null,
      updatedAt: organizationColumns.has('updated_at')
        ? org.updated_at ?? org.created_at ?? null
        : 'created_at' in org
        ? org.created_at ?? null
        : null,
    }));

    console.log('Retrieved tenants from database:', normalizedResult.length);

    return res.json(normalizedResult);
  } catch (error) {
    if (shouldFallbackToDemoTenants(error)) {
      console.warn('[tenants-simple] DB unavailable; returning demo tenants');
      return res.json(demoTenantStore);
    }
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

    if (!hasDatabaseUrl || !sql) {
      const validatedData = createTenantSchema.parse(req.body);
      const nextId = Math.max(0, ...demoTenantStore.map(t => t.id)) + 1;
      const created: DemoTenant = {
        id: nextId,
        name: validatedData.name,
        slug: validatedData.slug || generateSlug(validatedData.name),
        domain: validatedData.domain || null,
        logo: null,
        tier: validatedData.tier || 'standard',
        industryType: validatedData.industryType || 'meddevice',
        complianceLevel: validatedData.complianceLevel || 'standard',
        maxUsers: validatedData.maxUsers || 5,
        maxProjects: validatedData.maxProjects || 10,
        maxStorage: validatedData.maxStorage || 5,
        status: 'active',
        settings: validatedData.settings || {},
      };
      demoTenantStore.unshift(created);
      return res.status(201).json(created);
    }

    // Validate request body
    const validatedData = createTenantSchema.parse(req.body);
    console.log('Validated data:', validatedData);

    const apiKey = 'dev-api-key-' + Math.random().toString(36).substring(2, 15);
    const organizationColumns = await getOrganizationColumns();

    const insertColumns: string[] = ['name'];
    const insertValues: any[] = [validatedData.name];

    if (organizationColumns.has('slug')) {
      insertColumns.push('slug');
      insertValues.push(validatedData.slug || generateSlug(validatedData.name));
    }

    if (organizationColumns.has('domain')) {
      insertColumns.push('domain');
      insertValues.push(validatedData.domain || null);
    }

    if (organizationColumns.has('tier')) {
      insertColumns.push('tier');
      insertValues.push(validatedData.tier || 'standard');
    }

    if (organizationColumns.has('max_users')) {
      insertColumns.push('max_users');
      insertValues.push(validatedData.maxUsers || 5);
    }

    if (organizationColumns.has('max_projects')) {
      insertColumns.push('max_projects');
      insertValues.push(validatedData.maxProjects || 10);
    }

    if (organizationColumns.has('max_storage')) {
      insertColumns.push('max_storage');
      insertValues.push(validatedData.maxStorage || 5);
    }

    if (organizationColumns.has('status')) {
      insertColumns.push('status');
      insertValues.push('active');
    }

    if (organizationColumns.has('api_key')) {
      insertColumns.push('api_key');
      insertValues.push(apiKey);
    }

    const columnList = insertColumns.map(col => `"${col}"`).join(', ');
    const valuePlaceholders = insertColumns.map((_, idx) => `$${idx + 1}`).join(', ');
    const insertSql = `
      INSERT INTO organizations (${columnList})
      VALUES (${valuePlaceholders})
      RETURNING *
    `;

    const result = await sql.unsafe(insertSql, insertValues);
    const newTenantRow = (result as any[])[0];

    invalidateOrganizationColumnsCache();

    const newTenant = {
      id: newTenantRow.id,
      name: newTenantRow.name,
      slug: organizationColumns.has('slug')
        ? newTenantRow.slug ?? generateSlug(newTenantRow.name)
        : generateSlug(newTenantRow.name),
      domain: organizationColumns.has('domain') ? newTenantRow.domain ?? null : null,
      logo: organizationColumns.has('logo') ? newTenantRow.logo ?? null : null,
      tier: organizationColumns.has('tier') ? newTenantRow.tier ?? 'standard' : 'standard',
      maxUsers: organizationColumns.has('max_users') ? newTenantRow.max_users ?? null : null,
      maxProjects: organizationColumns.has('max_projects') ? newTenantRow.max_projects ?? null : null,
      maxStorage: organizationColumns.has('max_storage') ? newTenantRow.max_storage ?? null : null,
      status: organizationColumns.has('status') ? newTenantRow.status ?? 'active' : 'active',
      createdAt: 'created_at' in newTenantRow ? newTenantRow.created_at ?? null : null,
      updatedAt: organizationColumns.has('updated_at')
        ? newTenantRow.updated_at ?? newTenantRow.created_at ?? null
        : 'created_at' in newTenantRow
        ? newTenantRow.created_at ?? null
        : null,
    };

    console.log('Created tenant in database:', newTenant);
    res.status(201).json(newTenant);
  } catch (error) {
    if (shouldFallbackToDemoTenants(error)) {
      try {
        const validatedData = createTenantSchema.parse(req.body);
        const nextId = Math.max(0, ...demoTenantStore.map(t => t.id)) + 1;
        const created: DemoTenant = {
          id: nextId,
          name: validatedData.name,
          slug: validatedData.slug || generateSlug(validatedData.name),
          domain: validatedData.domain || null,
          logo: null,
          tier: validatedData.tier || 'standard',
          industryType: validatedData.industryType || 'meddevice',
          complianceLevel: validatedData.complianceLevel || 'standard',
          maxUsers: validatedData.maxUsers || 5,
          maxProjects: validatedData.maxProjects || 10,
          maxStorage: validatedData.maxStorage || 5,
          status: 'active',
          settings: validatedData.settings || {},
        };
        demoTenantStore.unshift(created);
        console.warn('[tenants-simple] DB unavailable; created tenant in memory');
        return res.status(201).json(created);
      } catch (zodOrOther) {
        console.error('Error creating tenant (fallback):', zodOrOther);
        return res.status(400).json({ error: 'Invalid tenant data' });
      }
    }

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

        const organizationColumns = await getOrganizationColumns();

        const setFragments: string[] = [];
        const parameters: any[] = [];

        const addFragment = (column: string, value: any) => {
          parameters.push(value);
          const paramIndex = parameters.length;
          setFragments.push(`"${column}" = $${paramIndex}`);
        };

        if (organizationColumns.has('name') && validatedData.name !== undefined) {
          addFragment('name', validatedData.name);
        }
        if (organizationColumns.has('slug') && validatedData.slug !== undefined) {
          addFragment('slug', validatedData.slug);
        }
        if (organizationColumns.has('domain') && validatedData.domain !== undefined) {
          addFragment('domain', validatedData.domain);
        }
        if (organizationColumns.has('tier') && validatedData.tier !== undefined) {
          addFragment('tier', validatedData.tier);
        }
        if (organizationColumns.has('max_users') && validatedData.maxUsers !== undefined) {
          addFragment('max_users', validatedData.maxUsers);
        }
        if (organizationColumns.has('max_projects') && validatedData.maxProjects !== undefined) {
          addFragment('max_projects', validatedData.maxProjects);
        }
        if (organizationColumns.has('max_storage') && validatedData.maxStorage !== undefined) {
          addFragment('max_storage', validatedData.maxStorage);
        }
        if (organizationColumns.has('updated_at')) {
          setFragments.push('"updated_at" = NOW()');
        }

        if (setFragments.length === 0) {
          return res.status(400).json({ error: 'No updatable fields provided' });
        }

        const updateSql = `
          UPDATE organizations
          SET ${setFragments.join(', ')}
          WHERE id = $${parameters.length + 1}
          RETURNING *
        `;

        const result = await sql.unsafe(updateSql, [...parameters, tenantId]);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    invalidateOrganizationColumnsCache();

    const updatedRow = (result as any[])[0];
    const updatedTenant = {
      id: updatedRow.id,
      name: updatedRow.name,
      slug: organizationColumns.has('slug')
        ? updatedRow.slug ?? generateSlug(updatedRow.name)
        : generateSlug(updatedRow.name),
      domain: organizationColumns.has('domain') ? updatedRow.domain ?? null : null,
      logo: organizationColumns.has('logo') ? updatedRow.logo ?? null : null,
      tier: organizationColumns.has('tier') ? updatedRow.tier ?? 'standard' : 'standard',
      maxUsers: organizationColumns.has('max_users') ? updatedRow.max_users ?? null : null,
      maxProjects: organizationColumns.has('max_projects') ? updatedRow.max_projects ?? null : null,
      maxStorage: organizationColumns.has('max_storage') ? updatedRow.max_storage ?? null : null,
      status: organizationColumns.has('status') ? updatedRow.status ?? 'active' : 'active',
      createdAt: 'created_at' in updatedRow ? updatedRow.created_at ?? null : null,
      updatedAt: organizationColumns.has('updated_at')
        ? updatedRow.updated_at ?? updatedRow.created_at ?? null
        : 'created_at' in updatedRow
        ? updatedRow.created_at ?? null
        : null,
    };

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

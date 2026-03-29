/**
 * Connector Library Routes
 *
 * Self-service connector management API. Clients can:
 * - Browse the full connector catalog with setup guides
 * - Enable/disable connectors per organization (toggle on/off)
 * - Store encrypted credentials for authenticated connectors
 * - Test connector health/connectivity
 * - View their active connectors and status
 *
 * @module server/routes/connector-library
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { createScopedLogger } from '../utils/logger';
import { authMiddleware } from '../auth';
import { tenantContextMiddleware, requireOrganizationContext } from '../middleware/tenantContext';
import { logAuditEvent } from '../services/audit/auditLoggerV2';
import {
  CONNECTOR_CATALOG,
  type ConnectorCatalogEntry,
  type ConnectorSetupGuide,
} from '../services/connectors/connector-interface.js';
import {
  getConnectorCatalog,
  storeCredentials,
  searchConnectors,
} from '../services/connectors/connector-registry.js';

const logger = createScopedLogger('connector-library');
const router = Router();

router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getOrganizationId(req: Request): number {
  const ctx = (req as any).tenantContext;
  return ctx?.organizationId || 1;
}

function getUserId(req: Request): string {
  return String((req as any).userId || (req as any).user?.id || 'unknown');
}

function getUserEmail(req: Request): string {
  return (req as any).user?.email || (req as any).userEmail || 'unknown';
}

let tablesInitialized = false;

async function ensureConnectorTables(): Promise<boolean> {
  if (!pool) return false;
  if (tablesInitialized) return true;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organization_connectors (
        organization_id INTEGER NOT NULL,
        connector_id TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT false,
        configured BOOLEAN NOT NULL DEFAULT false,
        last_health_check TIMESTAMPTZ,
        health_status TEXT DEFAULT 'unknown',
        enabled_by TEXT,
        enabled_at TIMESTAMPTZ,
        disabled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (organization_id, connector_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS connector_credentials (
        organization_id INTEGER NOT NULL,
        connector_id TEXT NOT NULL,
        credentials TEXT NOT NULL,
        is_valid BOOLEAN DEFAULT true,
        last_validated_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (organization_id, connector_id)
      )
    `);

    tablesInitialized = true;
    return true;
  } catch (err) {
    logger.warn('Failed to initialize connector tables', err as Record<string, unknown>);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATALOG ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/connectors/catalog
 *
 * Returns the full connector catalog with per-org enable/configure status.
 * Filterable by category or tier.
 */
router.get('/catalog', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const category = req.query.category as string | undefined;
    const tier = req.query.tier as string | undefined;

    await ensureConnectorTables();

    // Get catalog with configuration status
    const enrichedCatalog = await getConnectorCatalog(orgId);

    // Get enable/disable state from organization_connectors table
    let enabledMap: Map<string, { enabled: boolean; healthStatus: string; enabledAt: string | null }> = new Map();
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT connector_id, enabled, health_status, enabled_at
           FROM organization_connectors
           WHERE organization_id = $1`,
          [orgId]
        );
        enabledMap = new Map(rows.map((r: any) => [
          r.connector_id,
          { enabled: r.enabled, healthStatus: r.health_status || 'unknown', enabledAt: r.enabled_at },
        ]));
      } catch {
        // DB unavailable — all connectors show as disabled
      }
    }

    let catalog = enrichedCatalog.map(entry => {
      const orgState = enabledMap.get(entry.id);
      const catalogEntry = CONNECTOR_CATALOG.find(c => c.id === entry.id);
      return {
        ...entry,
        category: catalogEntry?.category || 'regulatory',
        enabled: orgState?.enabled ?? (!entry.requiresCredentials), // Free connectors default to enabled
        healthStatus: orgState?.healthStatus || (entry.healthy ? 'healthy' : 'unknown'),
        enabledAt: orgState?.enabledAt || null,
        hasSetupGuide: !!catalogEntry?.setupGuide,
      };
    });

    // Apply filters
    if (category) {
      catalog = catalog.filter(c => c.category === category);
    }
    if (tier) {
      catalog = catalog.filter(c => c.requiredTier === tier);
    }

    return res.json({
      success: true,
      connectors: catalog,
      categories: ['regulatory', 'literature', 'clinical_data', 'dms', 'ehr'],
      tiers: ['free', 'standard', 'professional'],
    });
  } catch (err) {
    logger.error('Failed to fetch connector catalog', err as Record<string, unknown>);
    return res.status(500).json({ success: false, error: 'CATALOG_FETCH_FAILED' });
  }
});

/**
 * GET /api/connectors/:connectorId/guide
 *
 * Returns the detailed setup guide for a specific connector.
 */
router.get('/:connectorId/guide', (req: Request, res: Response) => {
  const connectorId = req.params.connectorId as string;
  const catalogEntry = CONNECTOR_CATALOG.find(c => c.id === connectorId);

  if (!catalogEntry) {
    return res.status(404).json({ success: false, error: 'CONNECTOR_NOT_FOUND' });
  }

  if (!catalogEntry.setupGuide) {
    return res.status(404).json({
      success: false,
      error: 'NO_SETUP_GUIDE',
      message: `No setup guide available for ${catalogEntry.name}.`,
    });
  }

  return res.json({
    success: true,
    connector: {
      id: catalogEntry.id,
      name: catalogEntry.name,
      description: catalogEntry.description,
      type: catalogEntry.type,
      category: catalogEntry.category,
      requiredTier: catalogEntry.requiredTier,
      requiresCredentials: catalogEntry.requiresCredentials,
      documentationUrl: catalogEntry.documentationUrl,
    },
    setupGuide: catalogEntry.setupGuide,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TOGGLE ENABLE / DISABLE
// ═══════════════════════════════════════════════════════════════════════════════

const ToggleSchema = z.object({
  enabled: z.boolean(),
});

/**
 * POST /api/connectors/:connectorId/toggle
 *
 * Enable or disable a connector for the current organization.
 * Body: { enabled: boolean }
 */
router.post('/:connectorId/toggle', async (req: Request, res: Response) => {
  try {
    const connectorId = req.params.connectorId as string;
    const orgId = getOrganizationId(req);

    const catalogEntry = CONNECTOR_CATALOG.find(c => c.id === connectorId);
    if (!catalogEntry) {
      return res.status(404).json({ success: false, error: 'CONNECTOR_NOT_FOUND' });
    }

    const parsed = ToggleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'INVALID_BODY', details: parsed.error.issues });
    }

    const { enabled } = parsed.data;
    await ensureConnectorTables();

    if (!pool) {
      return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    }

    // If enabling a connector that requires credentials, check if credentials exist
    if (enabled && catalogEntry.requiresCredentials) {
      const credCheck = await pool.query(
        `SELECT connector_id FROM connector_credentials WHERE organization_id = $1 AND connector_id = $2`,
        [orgId, connectorId]
      );
      if (credCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'CREDENTIALS_REQUIRED',
          message: `${catalogEntry.name} requires credentials before it can be enabled. Please configure credentials first.`,
          setupGuide: catalogEntry.setupGuide ? true : false,
        });
      }
    }

    await pool.query(
      `INSERT INTO organization_connectors (organization_id, connector_id, enabled, enabled_by, enabled_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (organization_id, connector_id)
       DO UPDATE SET
         enabled = $3,
         enabled_by = $4,
         ${enabled ? 'enabled_at = $5,' : 'disabled_at = $5,'}
         updated_at = NOW()`,
      [orgId, connectorId, enabled, getUserEmail(req), new Date().toISOString()]
    );

    // Audit log
    await logAuditEvent({
      category: 'workflow',
      severity: 'info',
      action: enabled ? 'connector_enabled' : 'connector_disabled',
      userId: getUserId(req),
      userName: getUserEmail(req),
      organizationId: String(orgId),
      resourceType: 'connector',
      resourceId: connectorId,
      metadata: { connectorName: catalogEntry.name, enabled },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      success: true,
    });

    logger.info(`Connector ${connectorId} ${enabled ? 'enabled' : 'disabled'} for org=${orgId} by ${getUserEmail(req)}`);

    return res.json({
      success: true,
      connectorId,
      enabled,
      message: `${catalogEntry.name} has been ${enabled ? 'enabled' : 'disabled'}.`,
    });
  } catch (err) {
    logger.error('Failed to toggle connector', err as Record<string, unknown>);
    return res.status(500).json({ success: false, error: 'TOGGLE_FAILED' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CREDENTIALS
// ═══════════════════════════════════════════════════════════════════════════════

const CredentialsSchema = z.object({
  apiKey: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  baseUrl: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  customHeaders: z.record(z.string(), z.string()).optional(),
});

/**
 * POST /api/connectors/:connectorId/credentials
 *
 * Store encrypted credentials for a connector.
 * The connector is automatically marked as configured.
 */
router.post('/:connectorId/credentials', async (req: Request, res: Response) => {
  try {
    const connectorId = req.params.connectorId as string;
    const orgId = getOrganizationId(req);

    const catalogEntry = CONNECTOR_CATALOG.find(c => c.id === connectorId);
    if (!catalogEntry) {
      return res.status(404).json({ success: false, error: 'CONNECTOR_NOT_FOUND' });
    }

    if (!catalogEntry.requiresCredentials) {
      return res.status(400).json({
        success: false,
        error: 'NO_CREDENTIALS_NEEDED',
        message: `${catalogEntry.name} does not require credentials.`,
      });
    }

    const parsed = CredentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'INVALID_CREDENTIALS', details: parsed.error.issues });
    }

    // Validate required credential fields from setup guide
    if (catalogEntry.setupGuide) {
      const requiredFields = catalogEntry.setupGuide.credentialFields
        .filter(f => !f.label.includes('optional'))
        .map(f => f.field);

      const missing = requiredFields.filter(f => !parsed.data[f as keyof typeof parsed.data]);
      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          fields: missing,
          message: `Missing required credential fields: ${missing.join(', ')}`,
        });
      }
    }

    await storeCredentials(orgId, connectorId, parsed.data);

    // Mark as configured in organization_connectors
    await ensureConnectorTables();
    if (pool) {
      await pool.query(
        `INSERT INTO organization_connectors (organization_id, connector_id, configured, updated_at)
         VALUES ($1, $2, true, NOW())
         ON CONFLICT (organization_id, connector_id)
         DO UPDATE SET configured = true, updated_at = NOW()`,
        [orgId, connectorId]
      );
    }

    // Audit log — never log the actual credentials
    await logAuditEvent({
      category: 'system',
      severity: 'info',
      action: 'connector_credentials_stored',
      userId: getUserId(req),
      userName: getUserEmail(req),
      organizationId: String(orgId),
      resourceType: 'connector',
      resourceId: connectorId,
      metadata: { connectorName: catalogEntry.name, fieldsProvided: Object.keys(parsed.data) },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      success: true,
    });

    logger.info(`Credentials stored for connector ${connectorId}, org=${orgId}`);

    return res.json({
      success: true,
      connectorId,
      message: `Credentials for ${catalogEntry.name} have been securely stored. You can now enable the connector.`,
    });
  } catch (err) {
    logger.error('Failed to store credentials', err as Record<string, unknown>);
    return res.status(500).json({ success: false, error: 'CREDENTIAL_STORE_FAILED' });
  }
});

/**
 * DELETE /api/connectors/:connectorId/credentials
 *
 * Remove stored credentials and disable the connector.
 */
router.delete('/:connectorId/credentials', async (req: Request, res: Response) => {
  try {
    const connectorId = req.params.connectorId as string;
    const orgId = getOrganizationId(req);

    if (!pool) {
      return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    }

    await ensureConnectorTables();

    // Remove credentials
    await pool.query(
      `DELETE FROM connector_credentials WHERE organization_id = $1 AND connector_id = $2`,
      [orgId, connectorId]
    );

    // Disable and mark unconfigured
    await pool.query(
      `UPDATE organization_connectors
       SET enabled = false, configured = false, disabled_at = NOW(), updated_at = NOW()
       WHERE organization_id = $1 AND connector_id = $2`,
      [orgId, connectorId]
    );

    await logAuditEvent({
      category: 'system',
      severity: 'warning',
      action: 'connector_credentials_removed',
      userId: getUserId(req),
      userName: getUserEmail(req),
      organizationId: String(orgId),
      resourceType: 'connector',
      resourceId: connectorId,
      metadata: {},
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      success: true,
    });

    const catalogEntry = CONNECTOR_CATALOG.find(c => c.id === connectorId);
    return res.json({
      success: true,
      connectorId,
      message: `Credentials for ${catalogEntry?.name || connectorId} have been removed and the connector has been disabled.`,
    });
  } catch (err) {
    logger.error('Failed to remove credentials', err as Record<string, unknown>);
    return res.status(500).json({ success: false, error: 'CREDENTIAL_REMOVE_FAILED' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK & TEST CONNECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/connectors/:connectorId/test
 *
 * Test connectivity for a configured connector.
 * Returns health status and latency.
 */
router.post('/:connectorId/test', async (req: Request, res: Response) => {
  try {
    const connectorId = req.params.connectorId as string;
    const orgId = getOrganizationId(req);

    const catalogEntry = CONNECTOR_CATALOG.find(c => c.id === connectorId);
    if (!catalogEntry) {
      return res.status(404).json({ success: false, error: 'CONNECTOR_NOT_FOUND' });
    }

    // For connectors that don't require credentials, do a basic search test
    if (!catalogEntry.requiresCredentials) {
      try {
        const results = await searchConnectors(orgId, [connectorId], { keywords: ['test'], limit: 1 });
        const result = results[0];
        const healthy = !result.error;

        // Update health status
        if (pool) {
          await ensureConnectorTables();
          await pool.query(
            `INSERT INTO organization_connectors (organization_id, connector_id, last_health_check, health_status, updated_at)
             VALUES ($1, $2, NOW(), $3, NOW())
             ON CONFLICT (organization_id, connector_id)
             DO UPDATE SET last_health_check = NOW(), health_status = $3, updated_at = NOW()`,
            [orgId, connectorId, healthy ? 'healthy' : 'error']
          );
        }

        return res.json({
          success: true,
          connectorId,
          health: {
            status: healthy ? 'healthy' : 'error',
            message: result.error || 'Connection successful',
            lastChecked: new Date().toISOString(),
          },
        });
      } catch (testErr) {
        return res.json({
          success: true,
          connectorId,
          health: {
            status: 'error',
            message: testErr instanceof Error ? testErr.message : 'Connection test failed',
            lastChecked: new Date().toISOString(),
          },
        });
      }
    }

    // For credentialed connectors, attempt a search with stored credentials
    const results = await searchConnectors(orgId, [connectorId], { keywords: ['connection test'], limit: 1 });
    const result = results[0];
    const healthy = !result.error;

    // Update health status
    if (pool) {
      await ensureConnectorTables();
      await pool.query(
        `INSERT INTO organization_connectors (organization_id, connector_id, last_health_check, health_status, updated_at)
         VALUES ($1, $2, NOW(), $3, NOW())
         ON CONFLICT (organization_id, connector_id)
         DO UPDATE SET last_health_check = NOW(), health_status = $3, updated_at = NOW()`,
        [orgId, connectorId, healthy ? 'healthy' : 'error']
      );
    }

    return res.json({
      success: true,
      connectorId,
      health: {
        status: healthy ? 'healthy' : 'error',
        message: result.error || 'Connection successful',
        lastChecked: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error('Connection test failed', err as Record<string, unknown>);
    return res.status(500).json({ success: false, error: 'TEST_FAILED' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH ACROSS ENABLED CONNECTORS
// ═══════════════════════════════════════════════════════════════════════════════

const SearchSchema = z.object({
  query: z.string().min(1),
  connectorIds: z.array(z.string()).optional(),
  indication: z.string().optional(),
  phase: z.string().optional(),
  sponsor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/**
 * POST /api/connectors/search
 *
 * Search across enabled connectors. If connectorIds not specified,
 * searches all enabled connectors for the organization.
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);

    const parsed = SearchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'INVALID_SEARCH', details: parsed.error.issues });
    }

    let targetConnectors = parsed.data.connectorIds;

    // If no specific connectors requested, use all enabled ones
    if (!targetConnectors || targetConnectors.length === 0) {
      await ensureConnectorTables();
      if (pool) {
        const { rows } = await pool.query(
          `SELECT connector_id FROM organization_connectors WHERE organization_id = $1 AND enabled = true`,
          [orgId]
        );
        targetConnectors = rows.map((r: any) => r.connector_id);

        // Also include free connectors that are enabled by default
        const freeConnectors = CONNECTOR_CATALOG
          .filter(c => !c.requiresCredentials)
          .map(c => c.id);
        targetConnectors = [...new Set([...targetConnectors, ...freeConnectors])];
      } else {
        // Fallback: search free connectors only
        targetConnectors = CONNECTOR_CATALOG.filter(c => !c.requiresCredentials).map(c => c.id);
      }
    }

    if (targetConnectors.length === 0) {
      return res.json({ success: true, results: [], message: 'No connectors are enabled. Enable connectors from the connector library.' });
    }

    const results = await searchConnectors(orgId, targetConnectors, {
      keywords: [parsed.data.query],
      indication: parsed.data.indication,
      phase: parsed.data.phase,
      sponsor: parsed.data.sponsor,
      limit: parsed.data.limit,
    });

    return res.json({
      success: true,
      results,
      connectorsSearched: targetConnectors.length,
    });
  } catch (err) {
    logger.error('Connector search failed', err as Record<string, unknown>);
    return res.status(500).json({ success: false, error: 'SEARCH_FAILED' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVE CONNECTORS SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/connectors/active
 *
 * Returns only the connectors that are currently enabled for this organization.
 */
router.get('/active', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    await ensureConnectorTables();

    const enabledConnectors: string[] = [];

    if (pool) {
      const { rows } = await pool.query(
        `SELECT connector_id, health_status, enabled_at, last_health_check
         FROM organization_connectors
         WHERE organization_id = $1 AND enabled = true
         ORDER BY enabled_at DESC`,
        [orgId]
      );

      const active = rows.map((r: any) => {
        const catalogEntry = CONNECTOR_CATALOG.find(c => c.id === r.connector_id);
        return {
          id: r.connector_id,
          name: catalogEntry?.name || r.connector_id,
          type: catalogEntry?.type || 'api',
          category: catalogEntry?.category || 'regulatory',
          healthStatus: r.health_status || 'unknown',
          enabledAt: r.enabled_at,
          lastHealthCheck: r.last_health_check,
          icon: catalogEntry?.icon,
        };
      });

      // Add free connectors that are enabled by default
      const freeConnectors = CONNECTOR_CATALOG
        .filter(c => !c.requiresCredentials && !rows.some((r: any) => r.connector_id === c.id))
        .map(c => ({
          id: c.id,
          name: c.name,
          type: c.type,
          category: c.category,
          healthStatus: 'healthy' as const,
          enabledAt: null,
          lastHealthCheck: null,
          icon: c.icon,
        }));

      return res.json({
        success: true,
        active: [...active, ...freeConnectors],
        total: active.length + freeConnectors.length,
      });
    }

    // Fallback: only free connectors
    const freeConnectors = CONNECTOR_CATALOG
      .filter(c => !c.requiresCredentials)
      .map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        category: c.category,
        healthStatus: 'healthy',
        enabledAt: null,
        lastHealthCheck: null,
        icon: c.icon,
      }));

    return res.json({ success: true, active: freeConnectors, total: freeConnectors.length });
  } catch (err) {
    logger.error('Failed to fetch active connectors', err as Record<string, unknown>);
    return res.status(500).json({ success: false, error: 'ACTIVE_FETCH_FAILED' });
  }
});

export default router;

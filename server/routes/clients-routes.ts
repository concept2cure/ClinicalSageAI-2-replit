import { Router } from 'express';
import { db } from '../db';
import {
  clientWorkspaces,
  organizations,
  clientWorkspaceSettings,
  clientSecuritySettings,
  projects,
  projectModules,
  users,
} from '@shared/schema';
import { eq, and, sql, count } from 'drizzle-orm';
import { authMiddleware } from '../auth';

// Create a new router for client endpoints
const router = Router();

import { createScopedLogger } from '../utils/logger.js';
const log = createScopedLogger('clients-routes');

// SECURITY: All client endpoints require authentication
router.use(authMiddleware);

/**
 * Extract the authenticated org id from req.user (JWT-derived). Returns
 * null if the JWT didn't carry an organizationId — callers must treat
 * that as 403.
 *
 * NEVER source the org id from query params, body, or headers: those are
 * attacker-controlled. This is the contract that makes the multi-tenant
 * isolation guarantee enforceable. The audit trail bug we just closed
 * (GET /api/clients?organizationId=X reading any org's workspaces by
 * trusting the query param) was a direct violation.
 */
function getAuthedOrgId(req: any): number | null {
  const raw =
    req.user?.organizationId ??
    req.tenantContext?.organizationId ??
    req.organizationId;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function getAuthedRole(req: any): string | undefined {
  return req.user?.role ?? req.userRole;
}

/**
 * Tenant guard for `/:id`-scoped routes. Fetches the workspace row and
 * confirms it belongs to the caller's org. Returns:
 *   - { ok: true, workspace } on success
 *   - { ok: false, response: { status, body } } when the caller should
 *     send that response and stop.
 *
 * Returns 404 (not 403) on tenant mismatch so a foreign workspace looks
 * identical to "not found" — no existence enumeration.
 *
 * super_admin (platform staff) bypasses the org filter and gets the row
 * verbatim. Every other role is org-scoped.
 */
async function loadWorkspaceForCaller(
  workspaceIdRaw: string | undefined,
  req: any,
): Promise<
  | { ok: true; workspaceId: number; workspace: typeof clientWorkspaces.$inferSelect; isSuperAdmin: boolean }
  | { ok: false; status: number; error: string }
> {
  const workspaceId = parseInt(workspaceIdRaw ?? '', 10);
  if (!Number.isFinite(workspaceId)) {
    return { ok: false, status: 400, error: 'Invalid workspace id' };
  }

  const callerOrgId = getAuthedOrgId(req);
  const isSuperAdmin = getAuthedRole(req) === 'super_admin';

  if (!isSuperAdmin && callerOrgId == null) {
    return { ok: false, status: 403, error: 'Tenant context required' };
  }

  const whereExpr = isSuperAdmin
    ? eq(clientWorkspaces.id, workspaceId)
    : and(
        eq(clientWorkspaces.id, workspaceId),
        eq(clientWorkspaces.organizationId, callerOrgId as number),
      );

  const [workspace] = await db.select().from(clientWorkspaces).where(whereExpr);
  if (!workspace) {
    return { ok: false, status: 404, error: 'Client workspace not found' };
  }
  return { ok: true, workspaceId, workspace, isSuperAdmin };
}

// Helper: compute real workspace metrics from DB
async function getWorkspaceMetrics(workspaceId: number): Promise<{
  activeProjects: number;
  teamMembers: number;
}> {
  try {
    const [projectCount] = await db
      .select({ count: count() })
      .from(projects)
      .where(eq(projects.clientWorkspaceId, workspaceId));

    const [memberCount] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.defaultOrganizationId, workspaceId));

    return {
      activeProjects: projectCount?.count ?? 0,
      teamMembers: Math.max(memberCount?.count ?? 0, 1),
    };
  } catch {
    return { activeProjects: 0, teamMembers: 1 };
  }
}

// Note: We now save clients directly to the database

/**
 * Get all clients for the authenticated user's organization
 * API: GET /api/clients/all
 * SECURITY: Scoped to user's organizationId from JWT
 */
router.get('/all', async (req, res) => {
  try {
    // SECURITY: Scope to authenticated user's organization (tenant isolation)
    const userOrgId = req.user?.organizationId ? parseInt(String(req.user.organizationId)) : null;
    if (!userOrgId) {
      return res.status(403).json({ success: false, error: 'Organization context required' });
    }

    log.debug(`Fetching client workspaces for organization: ${userOrgId}`);

    const clients = await db
      .select({
        id: clientWorkspaces.id,
        name: clientWorkspaces.name,
        slug: clientWorkspaces.slug,
        description: clientWorkspaces.description,
        logo: clientWorkspaces.logo,
        status: clientWorkspaces.status,
        quotaProjects: clientWorkspaces.quotaProjects,
        quotaStorage: clientWorkspaces.quotaStorage,
        contactName: clientWorkspaces.contactName,
        contactEmail: clientWorkspaces.contactEmail,
        industry: clientWorkspaces.industry,
        organizationId: clientWorkspaces.organizationId,
        createdAt: clientWorkspaces.createdAt,
        updatedAt: clientWorkspaces.updatedAt,
        organizationName: organizations.name,
      })
      .from(clientWorkspaces)
      .leftJoin(organizations, eq(clientWorkspaces.organizationId, organizations.id))
      .where(eq(clientWorkspaces.organizationId, userOrgId));

    log.debug(`Found ${clients.length} total client workspaces across all organizations`);

    // Transform data to match frontend expectations — compute real metrics
    const transformedClients = await Promise.all(clients.map(async client => {
      const metrics = await getWorkspaceMetrics(client.id);
      return {
        id: String(client.id),
        name: client.name,
        slug: client.slug,
        organizationId: String(client.organizationId),
        organizationName: client.organizationName,
        logo: client.logo,
        activeProjects: metrics.activeProjects,
        quotaProjects: client.quotaProjects || 5,
        storageUsedGB: 0,
        quotaStorageGB: client.quotaStorage || 1,
        lastActivity: client.updatedAt?.toISOString() || new Date().toISOString(),
        description: client.description || `Workspace for ${client.organizationName}`,
        teamMembers: metrics.teamMembers,
        status: client.status || 'active',
      };
    }));

    return res.json({
      success: true,
      clients: transformedClients,
    });
  } catch (error: any) {
    log.error('Error fetching all clients:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch clients',
    });
  }
});

/**
 * Get all clients for an organization
 * API: GET /api/clients?organizationId=1
 */
router.get('/', async (req, res) => {
  try {
    // SECURITY: The org id comes from the JWT, never from the query
    // string. The legacy `?organizationId=` query param was an IDOR —
    // any authenticated user could pass any org id and list another
    // tenant's workspaces. The param is now ignored.
    const organizationId = getAuthedOrgId(req);
    if (organizationId == null) {
      return res.status(403).json({
        success: false,
        error: 'Tenant context required',
      });
    }

    log.debug(`Fetching client workspaces for organization: ${organizationId}`);

    // Fetch client workspaces from database
    const clients = await db
      .select({
        id: clientWorkspaces.id,
        name: clientWorkspaces.name,
        slug: clientWorkspaces.slug,
        description: clientWorkspaces.description,
        logo: clientWorkspaces.logo,
        status: clientWorkspaces.status,
        quotaProjects: clientWorkspaces.quotaProjects,
        quotaStorage: clientWorkspaces.quotaStorage,
        contactName: clientWorkspaces.contactName,
        contactEmail: clientWorkspaces.contactEmail,
        industry: clientWorkspaces.industry,
        organizationId: clientWorkspaces.organizationId,
        createdAt: clientWorkspaces.createdAt,
        updatedAt: clientWorkspaces.updatedAt,
        organizationName: organizations.name,
      })
      .from(clientWorkspaces)
      .leftJoin(organizations, eq(clientWorkspaces.organizationId, organizations.id))
      .where(eq(clientWorkspaces.organizationId, organizationId));

    log.debug(`Found ${clients.length} client workspaces for organization ${organizationId}`);

    // Transform data with real metrics
    const transformedClients = await Promise.all(clients.map(async client => {
      const metrics = await getWorkspaceMetrics(client.id);
      return {
        id: String(client.id),
        name: client.name,
        slug: client.slug,
        organizationId: String(client.organizationId),
        logo: client.logo,
        activeProjects: metrics.activeProjects,
        quotaProjects: client.quotaProjects || 5,
        storageUsedGB: 0,
        quotaStorageGB: client.quotaStorage || 1,
        lastActivity: client.updatedAt?.toISOString() || new Date().toISOString(),
        description: client.description || `Workspace for ${client.organizationName}`,
        teamMembers: metrics.teamMembers,
        status: client.status || 'active',
      };
    }));

    return res.json({
      success: true,
      clients: transformedClients,
    });
  } catch (error: any) {
    log.error('Error fetching clients:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch client workspaces',
    });
  }
});

/**
 * Create a new client workspace
 * API: POST /api/clients
 */
router.post('/', async (req, res) => {
  try {
    const { name, slug, quotaProjects, quotaStorageGB } = req.body;

    // Validate required fields
    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        error: 'Client name and slug are required',
      });
    }

    // SECURITY: New workspaces always belong to the caller's org. The
    // old `organizationId = '1'` body default let any authenticated user
    // create workspaces inside org 1 (or any other org id they chose to
    // post). The org id now comes from the JWT only; body.organizationId
    // is ignored.
    const organizationId = getAuthedOrgId(req);
    if (organizationId == null) {
      return res.status(403).json({
        success: false,
        error: 'Tenant context required',
      });
    }

    log.debug('Creating new client workspace:', { name, slug, organizationId });

    // Create new client in database
    const [newClient] = await db
      .insert(clientWorkspaces)
      .values({
        name,
        slug,
        organizationId,
        description: `Client workspace for ${name}`,
        logo: '/logos/default-client.png',
        status: 'active',
        quotaProjects: parseInt(quotaProjects) || 10,
        quotaStorage: parseInt(quotaStorageGB) || 5,
        contactName: null,
        contactEmail: null,
        industry: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    log.debug('Client workspace created in database:', newClient);

    // Transform response to match frontend expectations
    const responseClient = {
      id: String(newClient.id),
      name: newClient.name,
      slug: newClient.slug,
      organizationId: String(newClient.organizationId),
      logo: newClient.logo,
      activeProjects: 0,
      quotaProjects: newClient.quotaProjects,
      storageUsedGB: 0,
      quotaStorageGB: newClient.quotaStorage,
      lastActivity: newClient.updatedAt.toISOString(),
      description: newClient.description,
      teamMembers: 1,
      settings: {
        notificationsEnabled: true,
        autoBackup: true,
        dataRetentionDays: 2555,
        complianceLevel: 'FDA 21 CFR Part 11',
      },
      projects: [],
    };

    return res.json({
      success: true,
      client: responseClient,
      message: 'Client workspace created successfully',
    });
  } catch (error: any) {
    log.error('Error creating client:', error);

    // Handle duplicate slug error specifically
    if (error.code === '23505' && error.constraint === 'unique_org_slug') {
      return res.status(409).json({
        success: false,
        error: 'A client workspace with this URL slug already exists in your organization',
        field: 'slug',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to create client workspace',
    });
  }
});

/**
 * Get individual client details
 * API: GET /api/clients/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const idRaw = req.params.id; const id = Array.isArray(idRaw) ? idRaw[0] : (idRaw ?? "");

    log.debug(`Fetching client details for ID: ${id}`);

    // Tenant guard — workspace must belong to the caller's org (or
    // caller is super_admin). Foreign tenant ⇒ 404.
    const guard = await loadWorkspaceForCaller(id, req);
    if (!guard.ok) {
      return res.status(guard.status).json({ success: false, error: guard.error });
    }
    const workspaceId = guard.workspaceId;

    // Re-fetch with the organization join so the response shape stays
    // identical to what the client expects.
    const [client] = await db
      .select({
        id: clientWorkspaces.id,
        name: clientWorkspaces.name,
        slug: clientWorkspaces.slug,
        description: clientWorkspaces.description,
        logo: clientWorkspaces.logo,
        status: clientWorkspaces.status,
        quotaProjects: clientWorkspaces.quotaProjects,
        quotaStorage: clientWorkspaces.quotaStorage,
        contactName: clientWorkspaces.contactName,
        contactEmail: clientWorkspaces.contactEmail,
        industry: clientWorkspaces.industry,
        organizationId: clientWorkspaces.organizationId,
        createdAt: clientWorkspaces.createdAt,
        updatedAt: clientWorkspaces.updatedAt,
        organizationName: organizations.name,
      })
      .from(clientWorkspaces)
      .leftJoin(organizations, eq(clientWorkspaces.organizationId, organizations.id))
      .where(eq(clientWorkspaces.id, workspaceId));

    if (!client) {
      // Race with concurrent delete — treat as not found.
      return res.status(404).json({
        success: false,
        error: 'Client workspace not found',
      });
    }

    log.debug(`Client found:`, client.name);

    // Compute real workspace metrics
    const metrics = await getWorkspaceMetrics(client.id);

    // Fetch real projects for this workspace
    const workspaceProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(eq(projects.clientWorkspaceId, client.id))
      .limit(20);

    const clientData = {
      id: String(client.id),
      name: client.name,
      slug: client.slug,
      organizationId: String(client.organizationId),
      logo: client.logo || '/logos/default-client.png',
      activeProjects: metrics.activeProjects,
      quotaProjects: client.quotaProjects || 5,
      storageUsedGB: 0,
      quotaStorageGB: client.quotaStorage || 1,
      lastActivity: client.updatedAt?.toISOString() || new Date().toISOString(),
      description: client.description || `Workspace for ${client.organizationName}`,
      teamMembers: metrics.teamMembers,
      status: client.status || 'active',
      settings: {
        notificationsEnabled: true,
        autoBackup: true,
        dataRetentionDays: 2555,
        complianceLevel: 'FDA 21 CFR Part 11',
      },
      projects: workspaceProjects.map(p => ({
        id: String(p.id),
        name: p.name,
        status: p.status || 'active',
        createdAt: p.createdAt?.toISOString(),
      })),
    };

    res.json({
      success: true,
      client: clientData,
    });
  } catch (error: any) {
    log.error(`Error fetching client ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch client details',
    });
  }
});

/**
 * Update client details
 * API: PATCH /api/clients/:id
 */
router.patch('/:id', async (req, res) => {
  try {
    const idRaw = req.params.id; const id = Array.isArray(idRaw) ? idRaw[0] : (idRaw ?? "");
    const updates = req.body;

    log.debug(`Updating client workspace ${id} with data:`, updates);

    // Tenant guard. Mismatch ⇒ 404 (no enumeration).
    const guard = await loadWorkspaceForCaller(id, req);
    if (!guard.ok) {
      return res.status(guard.status).json({ success: false, error: guard.error });
    }
    const workspaceId = guard.workspaceId;

    // Prepare update data, filtering out any undefined values.
    // organizationId is NEVER taken from the body — that would let a
    // caller relocate a workspace into another tenant. The row's
    // organizationId is immutable through this endpoint.
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.slug !== undefined) updateData.slug = updates.slug;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.logo !== undefined) updateData.logo = updates.logo;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.quotaProjects !== undefined) updateData.quotaProjects = updates.quotaProjects;
    if (updates.quotaStorageGB !== undefined) updateData.quotaStorage = updates.quotaStorageGB;
    if (updates.contactName !== undefined) updateData.contactName = updates.contactName;
    if (updates.contactEmail !== undefined) updateData.contactEmail = updates.contactEmail;
    if (updates.industry !== undefined) updateData.industry = updates.industry;

    // Always update the updatedAt timestamp
    updateData.updatedAt = new Date();

    // Update the client workspace in the database
    const [updatedClient] = await db
      .update(clientWorkspaces)
      .set(updateData)
      .where(eq(clientWorkspaces.id, workspaceId))
      .returning();

    if (!updatedClient) {
      return res.status(404).json({
        success: false,
        error: 'Client workspace not found',
      });
    }

    log.debug(`Successfully updated client workspace ${id}:`, updatedClient.name);

    // CRITICAL: Also update the workspace settings to keep them synchronized
    if (updates.name || updates.slug || updates.description) {
      // Check if workspace settings exist
      const [existingSettings] = await db
        .select()
        .from(clientWorkspaceSettings)
        .where(eq(clientWorkspaceSettings.clientWorkspaceId, parseInt(id)));

      if (existingSettings) {
        // Update existing workspace settings general section
        const currentGeneralSettings = (existingSettings.generalSettings as Record<string, any>) || {};
        const updatedGeneralSettings: Record<string, any> = {
          ...currentGeneralSettings,
        };

        if (updates.name) updatedGeneralSettings.name = updates.name;
        if (updates.slug) updatedGeneralSettings.slug = updates.slug;
        if (updates.description) updatedGeneralSettings.description = updates.description;

        await db
          .update(clientWorkspaceSettings)
          .set({
            generalSettings: updatedGeneralSettings,
            updatedAt: new Date(),
          })
          .where(eq(clientWorkspaceSettings.clientWorkspaceId, parseInt(id)));

        log.debug(`✅ Synchronized workspace settings with Edit Client changes`);
      } else {
        // Create new workspace settings if they don't exist
        await db.insert(clientWorkspaceSettings).values({
          clientWorkspaceId: parseInt(id),
          organizationId: updatedClient.organizationId,
          generalSettings: {
            name: updatedClient.name,
            description: updatedClient.description || '',
            slug: updatedClient.slug,
            industry: updatedClient.industry || 'pharmaceutical',
            logoUrl: updatedClient.logo || '',
            tier: 'standard',
            status: updatedClient.status || 'active',
          },
          quotaSettings: {
            maxUsers: 10,
            maxProjects: updatedClient.quotaProjects || 20,
            maxStorageGB: updatedClient.quotaStorage || 50,
            maxDocumentsPerProject: 500,
            enableOverageProtection: true,
          },
          moduleSettings: {
            cerEnabled: true,
            // indEnabled: true, // DELETED per user request
            vaultEnabled: true,
            csrEnabled: true,
            analyticsEnabled: true,
          },
          integrationSettings: {
            enableExternalSharing: false,
            enableApiAccess: false,
            connectToCTMS: false,
            dataExportEnabled: true,
          },
          appearanceSettings: {
            theme: 'light',
            primaryColor: 'blue',
            logoPosition: 'left',
            customBranding: false,
          },
          notificationSettings: {
            enableEmailNotifications: true,
            enableSMSNotifications: false,
            notifyOnProjectUpdates: true,
            notifyOnDocumentChanges: true,
            notifyOnMentions: true,
            notifyOnComments: true,
            digestFrequency: 'daily',
          },
        });

        log.debug(`✅ Created new workspace settings with Edit Client data`);
      }
    }

    res.json({
      success: true,
      message: 'Client workspace updated successfully',
      client: {
        id: String(updatedClient.id),
        name: updatedClient.name,
        slug: updatedClient.slug,
        description: updatedClient.description,
        logo: updatedClient.logo,
        status: updatedClient.status,
        quotaProjects: updatedClient.quotaProjects,
        quotaStorageGB: updatedClient.quotaStorage,
        contactName: updatedClient.contactName,
        contactEmail: updatedClient.contactEmail,
        industry: updatedClient.industry,
        organizationId: String(updatedClient.organizationId),
        updatedAt: updatedClient.updatedAt?.toISOString(),
      },
    });
  } catch (error: any) {
    log.error(`Error updating client ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update client workspace',
    });
  }
});

/**
 * Get client security settings
 * API: GET /api/clients/:id/security-settings
 */
router.get('/:id/security-settings', async (req, res) => {
  try {
    const idRaw = req.params.id; const id = Array.isArray(idRaw) ? idRaw[0] : (idRaw ?? "");

    log.debug(`Fetching security settings for client: ${id}`);

    // Tenant guard — security settings expose password policy, MFA
    // requirements, retention. Leaking them cross-tenant gives an
    // attacker the blueprint of another tenant's auth posture.
    const guard = await loadWorkspaceForCaller(id, req);
    if (!guard.ok) {
      return res.status(guard.status).json({ success: false, error: guard.error });
    }
    const workspaceId = guard.workspaceId;

    // Try to fetch existing security settings from database
    const [existingSettings] = await db
      .select()
      .from(clientSecuritySettings)
      .where(eq(clientSecuritySettings.clientWorkspaceId, workspaceId));

    const defaultSettings = {
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumber: true,
        requireSpecialChar: true,
        historyCount: 5,
        expiryDays: 90,
      },
      sessionSettings: {
        timeoutMinutes: 30,
        maxConcurrentSessions: 3,
        enforceIpLock: false,
        requireMfaForExternalAccess: true,
      },
      dataProtection: {
        autoLockDocuments: true,
        enforceDocumentClassification: true,
        dataRetentionDays: 3650,
        enableDLP: false,
        sensitiveDataScanFrequency: 'weekly',
      },
      auditSettings: {
        retentionDays: 365,
        enableBlockchainBackup: true,
        realTimeMonitoring: true,
        autoExportFrequency: 24,
        trackUserActivity: true,
      },
      fdaCompliance: {
        enforceElectronicSignatures: true,
        requireReason: true,
        enableAuditTrails: true,
        validationApproach: 'riskBased',
        documentRetentionPeriod: 'lifeplus10',
        enforceUserTesting: false,
        autoGenerateDocumentation: true,
        reportGeneration: 'quarterly',
        submissionFormat: 'ectd',
        inspectionReadiness: true,
        enforceApprovalWorkflows: true,
        enableEuGmpCompliance: false,
        enableIchGcpCompliance: false,
        industryType: 'pharma',
      },
    };

    // Merge saved settings with defaults
    let settings = defaultSettings;
    if (existingSettings) {
      const es = existingSettings as any;
      settings = {
        passwordPolicy: {
          ...defaultSettings.passwordPolicy,
          ...(es.passwordPolicySettings as Record<string, any> | undefined ?? {}),
        },
        sessionSettings: {
          ...defaultSettings.sessionSettings,
          ...(es.sessionSettings as Record<string, any> | undefined ?? {}),
        },
        dataProtection: {
          ...defaultSettings.dataProtection,
          ...(es.dataProtectionSettings as Record<string, any> | undefined ?? {}),
        },
        auditSettings: {
          ...defaultSettings.auditSettings,
          ...(es.auditSettings as Record<string, any> | undefined ?? {}),
        },
        fdaCompliance: {
          ...defaultSettings.fdaCompliance,
          ...(es.fdaComplianceSettings as Record<string, any> | undefined ?? {}),
        },
      };
    }

    res.json({
      success: true,
      ...settings,
    });
  } catch (error: any) {
    log.error(`Error fetching security settings for client ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch security settings',
    });
  }
});

/**
 * Update client security settings
 * API: PATCH /api/clients/:id/security-settings
 */
router.patch('/:id/security-settings', async (req, res) => {
  try {
    const idRaw = req.params.id; const id = Array.isArray(idRaw) ? idRaw[0] : (idRaw ?? "");
    const settings = req.body;

    log.debug('Updating security settings for client', { id, settingsKeys: Object.keys(settings) });

    // Tenant guard — this is the MOST sensitive endpoint in the file.
    // Pre-fix it let any authenticated user weaken another tenant's
    // password policy, session timeout, MFA requirements, or audit
    // retention. That's essentially a backdoor.
    const guard = await loadWorkspaceForCaller(id, req);
    if (!guard.ok) {
      return res.status(guard.status).json({ success: false, error: guard.error });
    }
    const workspaceId = guard.workspaceId;
    const clientWorkspace = guard.workspace;

    // Check if security settings already exist
    const [existingSettings] = await db
      .select()
      .from(clientSecuritySettings)
      .where(eq(clientSecuritySettings.clientWorkspaceId, workspaceId));

    if (existingSettings) {
      // Update existing settings
      const [updatedSettings] = await db
        .update(clientSecuritySettings)
        .set({
          passwordPolicySettings: settings.passwordPolicy,
          sessionSettings: settings.sessionSettings,
          dataProtectionSettings: settings.dataProtection,
          auditSettings: settings.auditSettings,
          fdaComplianceSettings: settings.fdaCompliance,
          updatedAt: new Date(),
        })
        .where(eq(clientSecuritySettings.clientWorkspaceId, parseInt(id)))
        .returning();

      log.debug(`Updated security settings for client ${id}`);
    } else {
      // Create new settings
      const [newSettings] = await db
        .insert(clientSecuritySettings)
        .values({
          clientWorkspaceId: parseInt(id),
          organizationId: clientWorkspace.organizationId,
          passwordPolicySettings: settings.passwordPolicy,
          sessionSettings: settings.sessionSettings,
          dataProtectionSettings: settings.dataProtection,
          auditSettings: settings.auditSettings,
          fdaComplianceSettings: settings.fdaCompliance,
        })
        .returning();

      log.debug(`Created new security settings for client ${id}`);
    }

    res.json({
      success: true,
      message: 'Security settings updated successfully',
      ...settings,
    });
  } catch (error: any) {
    log.error(`Error updating security settings for client ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update security settings',
    });
  }
});

/**
 * Delete client with cascade deletion
 * API: DELETE /api/clients/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const idRaw = req.params.id; const id = Array.isArray(idRaw) ? idRaw[0] : (idRaw ?? "");

    log.debug(`Deleting client workspace ${id} with cascade deletion from database`);

    // Tenant guard — DELETE cascades through projects, project_modules,
    // workspace_settings, security_settings. Without the guard a single
    // authenticated request could wipe out another tenant's entire
    // workspace tree.
    const guard = await loadWorkspaceForCaller(id, req);
    if (!guard.ok) {
      return res.status(guard.status).json({ success: false, error: guard.error });
    }
    const clientId = guard.workspaceId;

    // Start a transaction for safe cascade deletion
    const result = await db.transaction(async tx => {
      // First, check if client exists (race with concurrent delete).
      const existingClient = await tx
        .select()
        .from(clientWorkspaces)
        .where(eq(clientWorkspaces.id, clientId))
        .limit(1);

      if (existingClient.length === 0) {
        throw new Error('Client workspace not found');
      }

      // Delete project modules associated with projects of this client
      const deletedProjectModules = await tx
        .delete(projectModules)
        .where(eq(projectModules.clientWorkspaceId, clientId))
        .returning();

      log.debug(`Deleted ${deletedProjectModules.length} project modules for client ${id}`);

      // Delete projects associated with this client
      const deletedProjects = await tx
        .delete(projects)
        .where(eq(projects.clientWorkspaceId, clientId))
        .returning();

      log.debug(`Deleted ${deletedProjects.length} projects for client ${id}`);

      // Delete client workspace settings if they exist
      await tx
        .delete(clientWorkspaceSettings)
        .where(eq(clientWorkspaceSettings.clientWorkspaceId, clientId));

      // Delete client security settings if they exist
      await tx
        .delete(clientSecuritySettings)
        .where(eq(clientSecuritySettings.clientWorkspaceId, clientId));

      // Finally, delete the client workspace
      const deletedClient = await tx
        .delete(clientWorkspaces)
        .where(eq(clientWorkspaces.id, clientId))
        .returning();

      return {
        client: deletedClient[0],
        deletedProjects: deletedProjects.length,
        deletedProjectModules: deletedProjectModules.length,
      };
    });

    log.debug(
      `Successfully deleted client workspace ${id}: ${result.client.name} (${result.deletedProjects} projects, ${result.deletedProjectModules} project modules)`
    );

    res.json({
      success: true,
      message: 'Client workspace and all associated data deleted successfully',
      deletedProjects: result.deletedProjects,
      deletedProjectModules: result.deletedProjectModules,
    });
  } catch (error: any) {
    log.error(`Error deleting client ${req.params.id}:`, error);

    if (error.message === 'Client workspace not found') {
      return res.status(404).json({
        success: false,
        error: 'Client workspace not found',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete client workspace',
    });
  }
});

/**
 * Get client workspace settings
 * API: GET /api/clients/:id/settings
 */
router.get('/:id/settings', async (req, res) => {
  try {
    const idRaw = req.params.id; const id = Array.isArray(idRaw) ? idRaw[0] : (idRaw ?? "");

    log.debug(`Fetching workspace settings for client: ${id}`);

    // Tenant guard. Workspace settings include integration secrets,
    // webhook URLs, and quota config — never cross-tenant.
    const guard = await loadWorkspaceForCaller(id, req);
    if (!guard.ok) {
      return res.status(guard.status).json({ success: false, error: guard.error });
    }
    const workspaceId = guard.workspaceId;
    const clientWorkspace = guard.workspace;

    // Try to fetch existing workspace settings from database
    const [existingSettings] = await db
      .select()
      .from(clientWorkspaceSettings)
      .where(eq(clientWorkspaceSettings.clientWorkspaceId, workspaceId));

    const defaultSettings = {
      general: {
        name: clientWorkspace?.name || '',
        description: clientWorkspace?.description || '',
        slug: clientWorkspace?.slug || '',
        industry: clientWorkspace?.industry || 'pharmaceutical',
        logoUrl: clientWorkspace?.logo || '',
        tier: 'standard',
        status: clientWorkspace?.status || 'active',
      },
      quotas: {
        maxUsers: 10,
        maxProjects: 20,
        maxStorageGB: 50,
        maxDocumentsPerProject: 500,
        enableOverageProtection: true,
      },
      modules: {
        // indEnabled: true, // DELETED per user request
        ectdEnabled: true, // eCTD Co-Author - DO NOT TOUCH
        cmcEnabled: true,
        medicalDeviceEnabled: true,
        moduleSectionEditorEnabled: true,
        enhancedDocumentEditorEnabled: true,
        protocolDesignerEnabled: true,
        foresightEnabled: true,
        csrEnabled: true,
        regulatoryIntelligenceEnabled: true,
        riskHeatmapEnabled: true,
        vaultEnabled: true,
        analyticsEnabled: true,
        studyArchitectEnabled: true,
        submissionCenterEnabled: true,
        // ectdUnifiedEnabled: true, // DELETED per user request
      },
      integration: {
        enableExternalSharing: false,
        enableApiAccess: false,
        connectToCTMS: false,
        ctmsProvider: '',
        allowVendorAccess: false,
        webhookUrl: '',
      },
      appearance: {
        theme: 'system',
        primaryColor: '#141413',
        brandLogo: clientWorkspace?.logo || '',
        customFonts: false,
        darkModeEnabled: true,
      },
      notifications: {
        emailNotifications: true,
        notifyOnDocumentChanges: true,
        notifyOnMentions: true,
        notifyOnComments: true,
        digestFrequency: 'daily',
      },
    };

    // Merge saved settings with defaults
    let settings = defaultSettings;
    if (existingSettings) {
      const es = existingSettings as any;
      settings = {
        general: { ...defaultSettings.general, ...(es.generalSettings as Record<string, any> | undefined ?? {}) },
        quotas: { ...defaultSettings.quotas, ...(es.quotaSettings as Record<string, any> | undefined ?? {}) },
        modules: { ...defaultSettings.modules, ...(es.moduleSettings as Record<string, any> | undefined ?? {}) },
        integration: { ...defaultSettings.integration, ...(es.integrationSettings as Record<string, any> | undefined ?? {}) },
        appearance: { ...defaultSettings.appearance, ...(es.appearanceSettings as Record<string, any> | undefined ?? {}) },
        notifications: {
          ...defaultSettings.notifications,
          ...(es.notificationSettings as Record<string, any> | undefined ?? {}),
        },
      };
    }

    res.json({
      success: true,
      ...settings,
    });
  } catch (error: any) {
    log.error(`Error fetching workspace settings for client ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch workspace settings',
    });
  }
});

/**
 * Update client workspace settings
 * API: PATCH /api/clients/:id/settings
 */
router.patch('/:id/settings', async (req, res) => {
  try {
    const idRaw = req.params.id; const id = Array.isArray(idRaw) ? idRaw[0] : (idRaw ?? "");
    const settings = req.body;

    log.debug('Updating workspace settings for client', id);

    // Tenant guard — workspace settings include feature toggles and
    // integration credentials. Cross-tenant writes here would let one
    // customer disable another customer's features or swap webhook URLs.
    const guard = await loadWorkspaceForCaller(id, req);
    if (!guard.ok) {
      return res.status(guard.status).json({ success: false, error: guard.error });
    }
    const workspaceId = guard.workspaceId;
    const clientWorkspace = guard.workspace;

    // Check if workspace settings already exist
    const [existingSettings] = await db
      .select()
      .from(clientWorkspaceSettings)
      .where(eq(clientWorkspaceSettings.clientWorkspaceId, parseInt(id)));

    if (existingSettings) {
      // Update existing settings
      const [updatedSettings] = await db
        .update(clientWorkspaceSettings)
        .set({
          generalSettings: settings.general,
          quotaSettings: settings.quotas,
          moduleSettings: settings.modules,
          integrationSettings: settings.integration,
          appearanceSettings: settings.appearance,
          notificationSettings: settings.notifications,
          updatedAt: new Date(),
        })
        .where(eq(clientWorkspaceSettings.clientWorkspaceId, parseInt(id)))
        .returning();

      log.debug(`Updated workspace settings for client ${id}`);
    } else {
      // Create new settings
      const [newSettings] = await db
        .insert(clientWorkspaceSettings)
        .values({
          clientWorkspaceId: parseInt(id),
          organizationId: clientWorkspace.organizationId,
          generalSettings: settings.general,
          quotaSettings: settings.quotas,
          moduleSettings: settings.modules,
          integrationSettings: settings.integration,
          appearanceSettings: settings.appearance,
          notificationSettings: settings.notifications,
        })
        .returning();

      log.debug(`Created new workspace settings for client ${id}`);
    }

    // CRITICAL: Also update the main client_workspaces table to keep name/slug synchronized
    if (settings.general && (settings.general.name || settings.general.slug)) {
      const clientUpdates: any = {};

      if (settings.general.name && settings.general.name !== clientWorkspace.name) {
        clientUpdates.name = settings.general.name;
      }

      if (settings.general.slug && settings.general.slug !== clientWorkspace.slug) {
        clientUpdates.slug = settings.general.slug;
      }

      if (Object.keys(clientUpdates).length > 0) {
        clientUpdates.updatedAt = new Date();

        await db
          .update(clientWorkspaces)
          .set(clientUpdates)
          .where(eq(clientWorkspaces.id, parseInt(id)));

        log.debug(`✅ Synchronized client_workspaces table with updates:`, clientUpdates);
      }
    }

    res.json({
      success: true,
      message: 'Workspace settings updated successfully',
      ...settings,
    });
  } catch (error: any) {
    log.error(`Error updating workspace settings for client ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update workspace settings',
    });
  }
});

export default router;

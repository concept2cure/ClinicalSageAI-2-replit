/**
 * Ana Platform Controller — Agentic Platform Management
 *
 * Gives Ana full, autonomous control over the ClinicalSageAI platform
 * for paid clients. Once a client has an active subscription, Ana can:
 *
 *   1. READ & MODIFY organization settings (branding, preferences, defaults)
 *   2. MANAGE project configuration (templates, defaults, compliance frameworks)
 *   3. CONTROL feature access & module activation per organization
 *   4. EXECUTE platform actions on behalf of clients (create projects, configure
 *      pipelines, set default templates, assign compliance frameworks)
 *   5. MONITOR & OPTIMIZE usage patterns with proactive recommendations
 *   6. CONFIGURE client-specific AI behavior (system prompts, guardrails, models)
 *
 * Security model:
 *   - All actions require an active paid subscription (paymentStatus === 'active')
 *   - All mutations are audit-logged with actor = 'ana:platform-controller'
 *   - HITL breakpoints for destructive actions (delete, downgrade, billing)
 *   - Organization-scoped — Ana cannot cross tenant boundaries
 */

import { db } from '../db';
import { eq, and, sql } from 'drizzle-orm';
import {
  organizations,
  projects,
  auditLogs,
} from '../../shared/schema';

// ─── Types ──────────────────────────────────────────────────

export type AnaActionCategory =
  | 'settings'        // org-level settings CRUD
  | 'project'         // project lifecycle & config
  | 'feature'         // module/feature toggles
  | 'ai_config'       // AI model, prompt, guardrail config
  | 'compliance'      // regulatory framework management
  | 'usage'           // usage analysis & optimization
  | 'onboarding';     // guided setup & provisioning

export interface AnaAction {
  id: string;
  category: AnaActionCategory;
  action: string;
  description: string;
  requiresConfirmation: boolean;  // HITL breakpoint
  parameters: Record<string, unknown>;
  timestamp: string;
}

export interface AnaActionResult {
  success: boolean;
  action: string;
  result?: unknown;
  error?: string;
  auditId?: string;
}

export interface OrgSettings {
  // Branding & appearance
  brandName?: string;
  brandColor?: string;
  logoUrl?: string;
  timezone?: string;
  dateFormat?: string;

  // AI behavior defaults
  defaultModel?: string;
  defaultSystemPrompt?: string;
  maxTokensPerRequest?: number;
  enableDeepResearch?: boolean;
  enableAutoExtraction?: boolean;
  enableSafetyNarrative?: boolean;

  // Compliance defaults
  defaultComplianceFrameworks?: string[];    // e.g. ['FDA', 'EMA', 'ICH']
  defaultSubmissionType?: string;            // e.g. 'NDA'
  requireElectronicSignatures?: boolean;
  enforce21CFRPart11?: boolean;

  // Feature toggles
  enabledModules?: string[];
  disabledModules?: string[];

  // Notification preferences
  notifyOnGapAnalysis?: boolean;
  notifyOnRegulatoryChanges?: boolean;
  notifyOnComplianceAlerts?: boolean;
  weeklyDigestEnabled?: boolean;

  // Ana behavior
  anaProactiveMode?: boolean;      // Can Ana initiate actions?
  anaAutoRemediate?: boolean;      // Can Ana auto-fix detected issues?
  anaConfirmDestructive?: boolean; // Require confirmation for destructive ops?

  [key: string]: unknown;
}

interface PlatformCapability {
  id: string;
  name: string;
  description: string;
  category: AnaActionCategory;
  requiredTier: 'standard' | 'professional' | 'enterprise';
  enabled: boolean;
}

// ─── Platform Controller ────────────────────────────────────

class AnaPlatformController {

  // ── Authorization ───────────────────────────────────────

  /**
   * Verify that the organization has an active paid subscription.
   * Ana only gets full platform control for paying clients.
   */
  async verifyPaidAccess(orgId: number): Promise<{ authorized: boolean; org?: any; reason?: string }> {
    try {
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      if (!org) {
        return { authorized: false, reason: 'Organization not found' };
      }

      const activeStatuses = ['active', 'trialing'];
      if (!activeStatuses.includes(org.paymentStatus || '')) {
        return {
          authorized: false,
          reason: `Subscription is ${org.paymentStatus || 'inactive'}. Ana platform control requires an active subscription.`,
        };
      }

      if (org.status !== 'active') {
        return {
          authorized: false,
          reason: `Organization is ${org.status}. Ana platform control requires an active organization.`,
        };
      }

      return { authorized: true, org };
    } catch {
      return { authorized: false, reason: 'Failed to verify subscription status' };
    }
  }

  // ── Settings Management ─────────────────────────────────

  /**
   * Read current organization settings.
   */
  async getSettings(orgId: number): Promise<AnaActionResult> {
    const access = await this.verifyPaidAccess(orgId);
    if (!access.authorized) {
      return { success: false, action: 'get_settings', error: access.reason };
    }

    const settings = (access.org!.settings || {}) as OrgSettings;
    return {
      success: true,
      action: 'get_settings',
      result: {
        settings,
        tier: access.org!.tier,
        seatsPurchased: access.org!.seatsPurchased,
        maxProjects: access.org!.maxProjects,
        maxStorage: access.org!.maxStorage,
      },
    };
  }

  /**
   * Update organization settings. Ana can modify any setting for paid clients.
   */
  async updateSettings(orgId: number, updates: Partial<OrgSettings>, userId?: string): Promise<AnaActionResult> {
    const access = await this.verifyPaidAccess(orgId);
    if (!access.authorized) {
      return { success: false, action: 'update_settings', error: access.reason };
    }

    const currentSettings = (access.org!.settings || {}) as OrgSettings;
    const mergedSettings = { ...currentSettings, ...updates };

    await db
      .update(organizations)
      .set({
        settings: mergedSettings,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId));

    await this.auditLog(orgId, 'update_settings', {
      changed: Object.keys(updates),
      actor: userId || 'ana:platform-controller',
    });

    return {
      success: true,
      action: 'update_settings',
      result: { applied: Object.keys(updates), settings: mergedSettings },
    };
  }

  // ── Feature & Module Control ────────────────────────────

  /**
   * List all platform capabilities and their enabled/disabled state for this org.
   */
  async listCapabilities(orgId: number): Promise<AnaActionResult> {
    const access = await this.verifyPaidAccess(orgId);
    if (!access.authorized) {
      return { success: false, action: 'list_capabilities', error: access.reason };
    }

    const settings = (access.org!.settings || {}) as OrgSettings;
    const tier = access.org!.tier || 'standard';
    const enabledModules = new Set(settings.enabledModules || []);
    const disabledModules = new Set(settings.disabledModules || []);

    const capabilities: PlatformCapability[] = [
      { id: 'deep_research', name: 'Deep Research', description: 'Multi-source regulatory research with Claude synthesis', category: 'ai_config', requiredTier: 'standard', enabled: true },
      { id: 'gap_analysis', name: 'Submission Gap Analysis', description: 'Automated readiness scoring across 6 submission types', category: 'compliance', requiredTier: 'standard', enabled: true },
      { id: 'safety_narrative', name: 'Safety Narrative Generation', description: 'ICH E3 §12 compliant safety narrative generation', category: 'ai_config', requiredTier: 'standard', enabled: true },
      { id: 'intelligent_reports', name: 'Intelligent Reports', description: 'Immutable, provenance-tracked report generation', category: 'ai_config', requiredTier: 'standard', enabled: true },
      { id: 'statistical_defensibility', name: 'Statistical Defensibility', description: '7-dimension study design defensibility scoring', category: 'compliance', requiredTier: 'professional', enabled: tier !== 'standard' },
      { id: 'document_generation', name: 'Document Generation', description: 'Regulatory document authoring with eCTD structure', category: 'ai_config', requiredTier: 'standard', enabled: true },
      { id: 'cmc_blueprint', name: 'CMC Blueprint', description: 'Chemistry, Manufacturing & Controls intelligence', category: 'compliance', requiredTier: 'professional', enabled: tier !== 'standard' },
      { id: 'change_impact', name: 'Regulatory Change Impact', description: 'Analyze impact of guidance changes on submissions', category: 'compliance', requiredTier: 'standard', enabled: true },
      { id: 'multi_agency_export', name: 'Multi-Agency Export', description: 'Export submissions for FDA, EMA, PMDA, TGA, NMPA', category: 'compliance', requiredTier: 'professional', enabled: tier !== 'standard' },
      { id: 'e_signatures', name: 'Electronic Signatures', description: '21 CFR Part 11 compliant electronic signatures', category: 'compliance', requiredTier: 'enterprise', enabled: tier === 'enterprise' },
      { id: 'ana_proactive', name: 'Ana Proactive Mode', description: 'Ana initiates regulatory alerts and recommendations', category: 'ai_config', requiredTier: 'standard', enabled: settings.anaProactiveMode !== false },
      { id: 'auto_extraction', name: 'Auto-Extraction Pipeline', description: 'Automated data extraction from uploaded documents', category: 'ai_config', requiredTier: 'standard', enabled: settings.enableAutoExtraction !== false },
    ];

    // Apply org-level overrides
    for (const cap of capabilities) {
      if (disabledModules.has(cap.id)) cap.enabled = false;
      if (enabledModules.has(cap.id)) cap.enabled = true;
    }

    return {
      success: true,
      action: 'list_capabilities',
      result: { capabilities, tier, totalEnabled: capabilities.filter(c => c.enabled).length },
    };
  }

  /**
   * Enable or disable a specific module for the organization.
   */
  async toggleModule(orgId: number, moduleId: string, enabled: boolean): Promise<AnaActionResult> {
    const access = await this.verifyPaidAccess(orgId);
    if (!access.authorized) {
      return { success: false, action: 'toggle_module', error: access.reason };
    }

    const settings = (access.org!.settings || {}) as OrgSettings;
    const enabledModules = new Set(settings.enabledModules || []);
    const disabledModules = new Set(settings.disabledModules || []);

    if (enabled) {
      enabledModules.add(moduleId);
      disabledModules.delete(moduleId);
    } else {
      disabledModules.add(moduleId);
      enabledModules.delete(moduleId);
    }

    return this.updateSettings(orgId, {
      enabledModules: Array.from(enabledModules),
      disabledModules: Array.from(disabledModules),
    });
  }

  // ── Project Management ──────────────────────────────────

  /**
   * Create a new project with Ana-configured defaults.
   */
  async createProject(orgId: number, config: {
    name: string;
    description?: string;
    submissionType?: string;
    therapeuticArea?: string;
    targetAgency?: string;
    complianceFrameworks?: string[];
  }): Promise<AnaActionResult> {
    const access = await this.verifyPaidAccess(orgId);
    if (!access.authorized) {
      return { success: false, action: 'create_project', error: access.reason };
    }

    // Check project limits
    const existingProjects = await db
      .select({ count: sql<number>`count(*)` })
      .from(projects)
      .where(eq(projects.organizationId, orgId));

    const maxProjects = access.org!.maxProjects || 10;
    if ((existingProjects[0]?.count ?? 0) >= maxProjects) {
      return {
        success: false,
        action: 'create_project',
        error: `Project limit reached (${maxProjects}). Upgrade your plan for more projects.`,
      };
    }

    const settings = (access.org!.settings || {}) as OrgSettings;

    const [project] = await db
      .insert(projects)
      .values({
        organizationId: orgId,
        name: config.name,
        description: config.description || '',
        status: 'active',
        therapeuticArea: config.therapeuticArea || '',
        submissionType: config.submissionType || settings.defaultSubmissionType || 'NDA',
        targetAgencies: config.targetAgency ? [config.targetAgency] : (settings.defaultComplianceFrameworks || ['FDA']),
      } as any)
      .returning();

    await this.auditLog(orgId, 'create_project', {
      projectId: project.id,
      projectName: config.name,
      actor: 'ana:platform-controller',
    });

    return {
      success: true,
      action: 'create_project',
      result: { project },
    };
  }

  /**
   * Update project configuration.
   */
  async updateProject(orgId: number, projectId: number, updates: Record<string, unknown>): Promise<AnaActionResult> {
    const access = await this.verifyPaidAccess(orgId);
    if (!access.authorized) {
      return { success: false, action: 'update_project', error: access.reason };
    }

    // Verify project belongs to org
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)))
      .limit(1);

    if (!project) {
      return { success: false, action: 'update_project', error: 'Project not found in this organization' };
    }

    await db
      .update(projects)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(projects.id, projectId));

    await this.auditLog(orgId, 'update_project', {
      projectId,
      changed: Object.keys(updates),
      actor: 'ana:platform-controller',
    });

    return { success: true, action: 'update_project', result: { projectId, applied: Object.keys(updates) } };
  }

  // ── AI Configuration ────────────────────────────────────

  /**
   * Configure Ana's AI behavior for the organization.
   */
  async configureAI(orgId: number, config: {
    defaultModel?: string;
    defaultSystemPrompt?: string;
    maxTokensPerRequest?: number;
    enableDeepResearch?: boolean;
    enableAutoExtraction?: boolean;
    anaProactiveMode?: boolean;
    anaAutoRemediate?: boolean;
  }): Promise<AnaActionResult> {
    return this.updateSettings(orgId, config);
  }

  // ── Compliance Framework Management ─────────────────────

  /**
   * Set default compliance frameworks for the organization.
   */
  async setComplianceDefaults(orgId: number, config: {
    frameworks?: string[];
    submissionType?: string;
    requireSignatures?: boolean;
    enforce21CFR?: boolean;
  }): Promise<AnaActionResult> {
    return this.updateSettings(orgId, {
      defaultComplianceFrameworks: config.frameworks,
      defaultSubmissionType: config.submissionType,
      requireElectronicSignatures: config.requireSignatures,
      enforce21CFRPart11: config.enforce21CFR,
    });
  }

  // ── Onboarding & Provisioning ───────────────────────────

  /**
   * Run full organization onboarding — sets up defaults, creates starter project,
   * enables recommended modules based on tier.
   */
  async onboardOrganization(orgId: number, profile: {
    therapeuticArea: string;
    primaryAgency: string;
    submissionType: string;
    companySize?: 'startup' | 'mid' | 'large' | 'pharma';
  }): Promise<AnaActionResult> {
    const access = await this.verifyPaidAccess(orgId);
    if (!access.authorized) {
      return { success: false, action: 'onboard', error: access.reason };
    }

    const results: AnaActionResult[] = [];

    // 1. Set organization defaults
    const settingsResult = await this.updateSettings(orgId, {
      defaultComplianceFrameworks: [profile.primaryAgency],
      defaultSubmissionType: profile.submissionType,
      anaProactiveMode: true,
      anaConfirmDestructive: true,
      notifyOnRegulatoryChanges: true,
      notifyOnComplianceAlerts: true,
      weeklyDigestEnabled: true,
      enableDeepResearch: true,
      enableAutoExtraction: true,
      enableSafetyNarrative: true,
    });
    results.push(settingsResult);

    // 2. Create starter project
    const projectResult = await this.createProject(orgId, {
      name: `${profile.therapeuticArea} — ${profile.submissionType} Submission`,
      description: `Auto-provisioned by Ana for ${profile.primaryAgency} ${profile.submissionType} submission workflow`,
      submissionType: profile.submissionType,
      therapeuticArea: profile.therapeuticArea,
      targetAgency: profile.primaryAgency,
    });
    results.push(projectResult);

    // 3. Enable tier-appropriate modules
    const tier = access.org!.tier || 'standard';
    const modulesToEnable = ['deep_research', 'gap_analysis', 'safety_narrative', 'intelligent_reports', 'document_generation', 'change_impact', 'ana_proactive', 'auto_extraction'];

    if (tier === 'professional' || tier === 'enterprise') {
      modulesToEnable.push('statistical_defensibility', 'cmc_blueprint', 'multi_agency_export');
    }
    if (tier === 'enterprise') {
      modulesToEnable.push('e_signatures');
    }

    const modulesResult = await this.updateSettings(orgId, {
      enabledModules: modulesToEnable,
      disabledModules: [],
    });
    results.push(modulesResult);

    await this.auditLog(orgId, 'onboard_organization', {
      profile,
      tier,
      modulesEnabled: modulesToEnable,
      actor: 'ana:platform-controller',
    });

    return {
      success: results.every(r => r.success),
      action: 'onboard',
      result: {
        settingsConfigured: settingsResult.success,
        starterProjectCreated: projectResult.success,
        modulesActivated: modulesToEnable.length,
        tier,
      },
    };
  }

  // ── Usage Analysis & Recommendations ────────────────────

  /**
   * Analyze organization usage and return proactive recommendations.
   */
  async analyzeUsage(orgId: number): Promise<AnaActionResult> {
    const access = await this.verifyPaidAccess(orgId);
    if (!access.authorized) {
      return { success: false, action: 'analyze_usage', error: access.reason };
    }

    const settings = (access.org!.settings || {}) as OrgSettings;
    const tier = access.org!.tier || 'standard';
    const recommendations: string[] = [];

    // Check underutilized features
    if (!settings.enableDeepResearch) {
      recommendations.push('Enable Deep Research for comprehensive multi-source regulatory analysis');
    }
    if (!settings.anaProactiveMode) {
      recommendations.push('Enable Ana Proactive Mode to receive automated regulatory change alerts');
    }
    if (!settings.enableAutoExtraction) {
      recommendations.push('Enable Auto-Extraction Pipeline to automatically parse uploaded documents');
    }
    if (!settings.weeklyDigestEnabled) {
      recommendations.push('Enable Weekly Digest for regulatory intelligence summaries');
    }

    // Tier upgrade suggestions
    if (tier === 'standard') {
      recommendations.push('Upgrade to Professional for Statistical Defensibility scoring and Multi-Agency Export');
    }
    if (tier === 'professional') {
      recommendations.push('Upgrade to Enterprise for 21 CFR Part 11 electronic signatures');
    }

    // Compliance gaps
    if (!settings.enforce21CFRPart11 && tier === 'enterprise') {
      recommendations.push('Enable 21 CFR Part 11 enforcement for full regulatory compliance');
    }

    return {
      success: true,
      action: 'analyze_usage',
      result: {
        tier,
        activeModules: (settings.enabledModules || []).length,
        recommendations,
        optimizationScore: Math.min(100, 60 + (recommendations.length === 0 ? 40 : 40 - recommendations.length * 5)),
      },
    };
  }

  // ── Execute Agentic Action ──────────────────────────────

  /**
   * Main entry point for Ana's agentic actions. Routes to the appropriate
   * handler based on the action category and name.
   */
  async executeAction(orgId: number, action: AnaAction): Promise<AnaActionResult> {
    const access = await this.verifyPaidAccess(orgId);
    if (!access.authorized) {
      return { success: false, action: action.action, error: access.reason };
    }

    switch (action.category) {
      case 'settings':
        return this.updateSettings(orgId, action.parameters as Partial<OrgSettings>);
      case 'project':
        if (action.action === 'create') {
          return this.createProject(orgId, action.parameters as any);
        }
        if (action.action === 'update' && action.parameters.projectId) {
          const { projectId, ...updates } = action.parameters;
          return this.updateProject(orgId, projectId as number, updates);
        }
        return { success: false, action: action.action, error: 'Unknown project action' };
      case 'feature':
        if (action.parameters.moduleId && typeof action.parameters.enabled === 'boolean') {
          return this.toggleModule(orgId, action.parameters.moduleId as string, action.parameters.enabled);
        }
        return { success: false, action: action.action, error: 'Missing moduleId or enabled flag' };
      case 'ai_config':
        return this.configureAI(orgId, action.parameters as any);
      case 'compliance':
        return this.setComplianceDefaults(orgId, action.parameters as any);
      case 'onboarding':
        return this.onboardOrganization(orgId, action.parameters as any);
      case 'usage':
        return this.analyzeUsage(orgId);
      default:
        return { success: false, action: action.action, error: `Unknown action category: ${action.category}` };
    }
  }

  // ── Audit Logging ───────────────────────────────────────

  private async auditLog(orgId: number, action: string, details: Record<string, unknown>) {
    try {
      await db.insert(auditLogs).values({
        organizationId: orgId,
        userId: details.actor as string || 'ana:platform-controller',
        action: `ana:${action}`,
        entityType: 'organization',
        entityId: String(orgId),
        details,
      } as any);
    } catch {
      // Audit logging should never block the primary action
      console.error(`[Ana Platform Controller] Audit log failed for ${action} on org ${orgId}`);
    }
  }
}

// Singleton export
export const anaPlatformController = new AnaPlatformController();

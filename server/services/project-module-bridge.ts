/**
 * Project-Module Bridge Service
 *
 * Manages the many-to-many relationship between projects and platform modules.
 * Any module (CER, CSR, eCTD, Vault, Protocol, Literature, RegIntel, Analytics, FAERS)
 * can be linked to a project, providing a unified project dashboard and cross-module intelligence.
 *
 * @module server/services/project-module-bridge
 */

import { db } from '../db';
import { projectModules, projects } from '@shared/schema';
import { and, eq, sql } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export const SUPPORTED_PROJECT_MODULE_TYPES = [
  'cer',
  'csr',
  'ectd',
  'vault',
  'protocol',
  'literature',
  'regulatory_intelligence',
  'analytics',
  'faers',
  'risk',
  'ind',
  '510k',
  'cmc',
  'pma',
] as const;

export type ModuleType = (typeof SUPPORTED_PROJECT_MODULE_TYPES)[number];
export type ModuleLinkStatus = 'active' | 'inactive' | 'completed';

export interface LinkModuleRequest {
  projectId: number;
  organizationId: number;
  clientWorkspaceId: number;
  moduleType: ModuleType;
  moduleInstanceId: number;
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ModuleSummary {
  moduleType: ModuleType;
  count: number;
  lastUpdated: Date | null;
  statuses: Record<string, number>;
}

export interface ProjectModuleView {
  id: number;
  projectId: number;
  organizationId: number;
  clientWorkspaceId: number;
  moduleType: ModuleType;
  moduleInstanceId: number;
  status: ModuleLinkStatus;
  settings: unknown;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class ProjectModuleBridge {
  /**
   * Link a module instance to a project. Idempotent — returns existing link if duplicate.
   */
  async linkModule(req: LinkModuleRequest): Promise<ProjectModuleView> {
    // Check if link already exists (unique constraint: projectId + moduleType + moduleInstanceId)
    const existing = await db
      .select()
      .from(projectModules)
      .where(
        and(
          eq(projectModules.projectId, req.projectId),
          eq(projectModules.moduleType, req.moduleType),
          eq(projectModules.moduleInstanceId, req.moduleInstanceId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update metadata if provided
      if (req.metadata || req.settings) {
        const [updated] = await db
          .update(projectModules)
          .set({
            ...(req.settings && { settings: req.settings }),
            ...(req.metadata && { metadata: req.metadata }),
            updatedAt: new Date(),
          })
          .where(eq(projectModules.id, existing[0].id))
          .returning();
        return updated as ProjectModuleView;
      }
      return existing[0] as ProjectModuleView;
    }

    // Validate project exists and belongs to org
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, req.projectId), eq(projects.organizationId, req.organizationId)))
      .limit(1);

    if (!project) {
      throw new Error(
        `Project ${req.projectId} not found or does not belong to organization ${req.organizationId}`
      );
    }

    const [link] = await db
      .insert(projectModules)
      .values({
        projectId: req.projectId,
        organizationId: req.organizationId,
        clientWorkspaceId: req.clientWorkspaceId,
        moduleType: req.moduleType,
        moduleInstanceId: req.moduleInstanceId,
        status: 'active',
        settings: req.settings || {},
        metadata: req.metadata || {},
      })
      .returning();

    return link as ProjectModuleView;
  }

  /**
   * Unlink a module from a project.
   */
  async unlinkModule(
    projectId: number,
    organizationId: number,
    moduleType: ModuleType,
    moduleInstanceId: number
  ): Promise<boolean> {
    const result = await db
      .delete(projectModules)
      .where(
        and(
          eq(projectModules.projectId, projectId),
          eq(projectModules.organizationId, organizationId),
          eq(projectModules.moduleType, moduleType),
          eq(projectModules.moduleInstanceId, moduleInstanceId)
        )
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Get all modules linked to a project.
   */
  async getProjectModules(projectId: number, organizationId: number): Promise<ProjectModuleView[]> {
    const modules = await db
      .select()
      .from(projectModules)
      .where(
        and(
          eq(projectModules.projectId, projectId),
          eq(projectModules.organizationId, organizationId)
        )
      );

    return modules as ProjectModuleView[];
  }

  /**
   * Get a summary of all modules linked to a project, grouped by type.
   */
  async getModuleSummary(projectId: number, organizationId: number): Promise<ModuleSummary[]> {
    const modules = await this.getProjectModules(projectId, organizationId);

    const summaryMap = new Map<string, ModuleSummary>();

    for (const mod of modules) {
      const existing = summaryMap.get(mod.moduleType);
      if (existing) {
        existing.count++;
        existing.statuses[mod.status] = (existing.statuses[mod.status] || 0) + 1;
        if (!existing.lastUpdated || mod.updatedAt > existing.lastUpdated) {
          existing.lastUpdated = mod.updatedAt;
        }
      } else {
        summaryMap.set(mod.moduleType, {
          moduleType: mod.moduleType as ModuleType,
          count: 1,
          lastUpdated: mod.updatedAt,
          statuses: { [mod.status]: 1 },
        });
      }
    }

    return Array.from(summaryMap.values());
  }

  /**
   * Find all projects that have a specific module instance linked.
   */
  async findProjectsForModule(
    moduleType: ModuleType,
    moduleInstanceId: number,
    organizationId: number
  ): Promise<Array<{ projectId: number; projectName: string; status: string }>> {
    const links = await db
      .select({
        projectId: projectModules.projectId,
        projectName: projects.name,
        status: projects.status,
      })
      .from(projectModules)
      .innerJoin(projects, eq(projectModules.projectId, projects.id))
      .where(
        and(
          eq(projectModules.moduleType, moduleType),
          eq(projectModules.moduleInstanceId, moduleInstanceId),
          eq(projectModules.organizationId, organizationId)
        )
      );

    return links;
  }

  /**
   * Get cross-project module statistics for an organization.
   * Used by the AI Sentinel for cross-project intelligence.
   */
  async getOrganizationModuleStats(organizationId: number): Promise<{
    totalLinks: number;
    moduleTypes: Record<string, number>;
    projectsWithModules: number;
    projectsWithoutModules: number;
  }> {
    const allLinks = await db
      .select()
      .from(projectModules)
      .where(eq(projectModules.organizationId, organizationId));

    const moduleTypes: Record<string, number> = {};
    const projectsWithModulesSet = new Set<number>();

    for (const link of allLinks) {
      moduleTypes[link.moduleType] = (moduleTypes[link.moduleType] || 0) + 1;
      projectsWithModulesSet.add(link.projectId);
    }

    // Count total projects
    const totalProjects = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projects)
      .where(eq(projects.organizationId, organizationId));

    const total = totalProjects[0]?.count || 0;

    return {
      totalLinks: allLinks.length,
      moduleTypes,
      projectsWithModules: projectsWithModulesSet.size,
      projectsWithoutModules: total - projectsWithModulesSet.size,
    };
  }

  /**
   * Bulk link multiple modules to a project.
   */
  async bulkLink(
    projectId: number,
    organizationId: number,
    clientWorkspaceId: number,
    modules: Array<{
      moduleType: ModuleType;
      moduleInstanceId: number;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<ProjectModuleView[]> {
    const results: ProjectModuleView[] = [];
    for (const mod of modules) {
      const result = await this.linkModule({
        projectId,
        organizationId,
        clientWorkspaceId,
        moduleType: mod.moduleType,
        moduleInstanceId: mod.moduleInstanceId,
        metadata: mod.metadata,
      });
      results.push(result);
    }
    return results;
  }

  /**
   * Update module link status (active, inactive, completed).
   */
  async updateModuleStatus(
    projectId: number,
    organizationId: number,
    moduleType: ModuleType,
    moduleInstanceId: number,
    status: ModuleLinkStatus
  ): Promise<ProjectModuleView | null> {
    const [updated] = await db
      .update(projectModules)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(projectModules.projectId, projectId),
          eq(projectModules.organizationId, organizationId),
          eq(projectModules.moduleType, moduleType),
          eq(projectModules.moduleInstanceId, moduleInstanceId)
        )
      )
      .returning();

    return (updated as ProjectModuleView) || null;
  }

  /**
   * Update a linked module using its composite identifier.
   */
  async updateModuleLink(
    projectId: number,
    organizationId: number,
    moduleType: ModuleType,
    moduleInstanceId: number,
    updates: {
      status?: ModuleLinkStatus;
      settings?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }
  ): Promise<ProjectModuleView | null> {
    const updatePayload: Partial<typeof projectModules.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (updates.status !== undefined) {
      updatePayload.status = updates.status;
    }

    if (updates.settings !== undefined) {
      updatePayload.settings = updates.settings;
    }

    if (updates.metadata !== undefined) {
      updatePayload.metadata = updates.metadata;
    }

    const [updated] = await db
      .update(projectModules)
      .set(updatePayload)
      .where(
        and(
          eq(projectModules.projectId, projectId),
          eq(projectModules.organizationId, organizationId),
          eq(projectModules.moduleType, moduleType),
          eq(projectModules.moduleInstanceId, moduleInstanceId)
        )
      )
      .returning();

    return (updated as ProjectModuleView) || null;
  }
}

/** Singleton instance */
export const projectModuleBridge = new ProjectModuleBridge();

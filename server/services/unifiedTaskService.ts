/**
 * Unified Task Management Service
 *
 * Central service for managing tasks across ALL modules in the Regulatory Submission Center.
 * Provides a single source of truth for task management, connecting Protocol Design, CMC,
 * Medical Device, IND Wizard, eCTD Co-Author, and Vault.
 */

import { db } from '../db';
import { eq, and, or, ne, sql, inArray, isNull } from 'drizzle-orm';
import * as schema from '../../shared/schema';
import { generateUUID } from '../utils/id-generator';

/**
 * Where a write runs: the db, or a caller's Drizzle transaction. A route that
 * passes its transaction gets the write and the ledger row describing it
 * (auditTaskActionInTx) committed or rolled back together.
 */
export type TaskWriteRunner = Pick<typeof db, 'select' | 'insert' | 'update' | 'execute'>;

// Module configuration with colors and icons
export const MODULE_CONFIG = {
  CMC: {
    name: 'CMC Module',
    color: '#3B82F6', // Blue
    icon: 'FlaskConical',
    category: 'manufacturing',
  },
  IND: {
    name: 'IND Wizard',
    color: '#10B981', // Green
    icon: 'FileText',
    category: 'regulatory',
  },
  MedicalDevice: {
    name: 'Medical Device',
    color: '#78716c', // Purple
    icon: 'Activity',
    category: 'device',
  },
  eCTD: {
    name: 'eCTD Co-Author',
    color: '#F59E0B', // Amber
    icon: 'BookOpen',
    category: 'documentation',
  },
  Vault: {
    name: 'Trial Vault',
    color: '#EC4899', // Pink
    icon: 'Archive',
    category: 'storage',
  },
  ProtocolDesign: {
    name: 'Protocol Design',
    color: '#06B6D4', // Cyan
    icon: 'Clipboard',
    category: 'clinical',
  },
  ResearchCompliance: {
    name: 'Research Compliance & Sponsored Programs',
    color: '#7C3AED', // Violet
    icon: 'ShieldCheck',
    category: 'compliance',
  },
  // Raised by the biostatistics bridge (server/services/biostatistics-bridge)
  // from a design assessment: sample-size revisions, escalations, filing
  // deliverables. Source entity is the study design (cdisc_prm_studies).
  Biostatistics: {
    name: 'Biostatistics',
    color: '#5a6f9c', // matches TB_MOD.Biostatistics on the task board
    icon: 'Sigma',
    category: 'clinical',
  },
};

export interface UnifiedTaskInput {
  moduleType: keyof typeof MODULE_CONFIG;
  title: string;
  description?: string;
  category?: string;
  taskType?: string;
  assigneeId?: number;
  assigneeName?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  dueDate?: Date;
  estimatedHours?: number;
  sourceEntityId?: string;
  sourceEntityType?: string;
  tags?: string[];
  metadata?: any;
  organizationId: number;
  clientWorkspaceId?: number;
  projectId?: number;
  /** The session actor who created it — completion notifies them. */
  createdById?: number;
}

/** Whose sync it is: every read is scoped to the organization and every task
 *  stamped with it, and the actor who ran the sync is each task's creator. */
export interface SyncScope {
  organizationId: number;
  createdById: number;
}

/**
 * A module whose tasks cannot be synced. Vault's source, the legacy
 * `document_approvals` table, has no organization column (and nothing on any
 * applier creates it), so a sync would import every tenant's pending
 * approvals into the caller's organization. Refused, never read.
 */
export class ModuleSyncUnavailableError extends Error {
  constructor(public readonly module: string) {
    super(`Tasks cannot be synced from the ${module} module`);
    this.name = 'ModuleSyncUnavailableError';
  }
}

export interface TaskLinkInput {
  sourceTaskId: string;
  targetTaskId: string;
  linkType: 'dependency' | 'reference' | 'parent-child' | 'related';
  dependencyType?: 'finish-to-start' | 'start-to-start' | 'finish-to-finish' | 'start-to-finish';
  isBlocking?: boolean;
  impactDescription?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

class UnifiedTaskService {
  private static instance: UnifiedTaskService;

  private getDb() {
    if (!db) {
      throw new Error('Database unavailable');
    }
    return db;
  }

  public static getInstance(): UnifiedTaskService {
    if (!UnifiedTaskService.instance) {
      UnifiedTaskService.instance = new UnifiedTaskService();
    }
    return UnifiedTaskService.instance;
  }

  /**
   * Create a unified task from any module
   */
  async createUnifiedTask(
    input: UnifiedTaskInput,
    runner: TaskWriteRunner = this.getDb()
  ): Promise<schema.UnifiedTask> {
    const taskId = generateUUID();
    const moduleConfig = MODULE_CONFIG[input.moduleType];

    const task = await runner
      .insert(schema.unifiedTasks)
      .values({
        taskId,
        organizationId: input.organizationId,
        clientWorkspaceId: input.clientWorkspaceId,
        projectId: input.projectId,
        moduleType: input.moduleType,
        moduleIcon: moduleConfig.icon,
        moduleColor: moduleConfig.color,
        title: input.title,
        description: input.description,
        category: input.category || moduleConfig.category,
        taskType: input.taskType || 'action',
        assigneeId: input.assigneeId,
        assigneeName: input.assigneeName,
        priority: input.priority || 'medium',
        dueDate: input.dueDate,
        estimatedHours: input.estimatedHours,
        sourceEntityId: input.sourceEntityId,
        sourceEntityType: input.sourceEntityType,
        tags: input.tags || [],
        metadata: input.metadata || {},
        status: 'pending',
        createdById: input.createdById,
      })
      .returning();

    return task[0];
  }

  /**
   * Get all unified tasks across all modules
   */
  async getAllUnifiedTasks(options?: {
    organizationId?: number;
    clientWorkspaceId?: number;
    projectId?: number;
    status?: string;
    moduleType?: string;
    assigneeId?: number;
    limit?: number;
    offset?: number;
  }): Promise<schema.UnifiedTask[]> {
    const dbInstance = this.getDb();
    const baseQuery = dbInstance.select().from(schema.unifiedTasks);

    // Archived rows are invisible to every read model (soft delete, D24).
    const conditions = [sql`${schema.unifiedTasks.deletedAt} IS NULL`];
    if (options?.organizationId) {
      conditions.push(eq(schema.unifiedTasks.organizationId, options.organizationId));
    }
    if (options?.clientWorkspaceId) {
      conditions.push(eq(schema.unifiedTasks.clientWorkspaceId, options.clientWorkspaceId));
    }
    if (options?.projectId) {
      conditions.push(eq(schema.unifiedTasks.projectId, options.projectId));
    }
    if (options?.status) {
      conditions.push(eq(schema.unifiedTasks.status, options.status));
    }
    if (options?.moduleType) {
      conditions.push(eq(schema.unifiedTasks.moduleType, options.moduleType));
    }
    if (options?.assigneeId) {
      conditions.push(eq(schema.unifiedTasks.assigneeId, options.assigneeId));
    }

    const filteredQuery = conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;
    // Semantic priority order — `priority` is a text column, so desc() sorted
    // it ALPHABETICALLY (medium → low → high → critical). Rank explicitly,
    // then soonest-due first with undated work last (assessment D16).
    const orderedQuery = filteredQuery.orderBy(
      sql`CASE ${schema.unifiedTasks.priority}
            WHEN 'critical' THEN 0
            WHEN 'urgent'   THEN 1
            WHEN 'high'     THEN 2
            WHEN 'medium'   THEN 3
            WHEN 'low'      THEN 4
            ELSE 5
          END`,
      sql`${schema.unifiedTasks.dueDate} asc nulls last`
    );
    const limitedQuery = options?.limit ? orderedQuery.limit(options.limit) : orderedQuery;
    const offsetQuery = options?.offset ? limitedQuery.offset(options.offset) : limitedQuery;

    return await offsetQuery;
  }

  /**
   * One task by business key (taskId) or numeric primary key, scoped to an
   * organization. Replaces the previous pattern of fetching up to 2000 rows
   * and .find()-ing the one (assessment D17).
   */
  async getOrgTaskById(organizationId: number, id: string): Promise<schema.UnifiedTask | null> {
    const dbInstance = this.getDb();
    const numeric = Number(id);
    const idMatch =
      Number.isInteger(numeric) && numeric > 0 && String(numeric) === id
        ? or(eq(schema.unifiedTasks.taskId, id), eq(schema.unifiedTasks.id, numeric))
        : eq(schema.unifiedTasks.taskId, id);
    const rows = await dbInstance
      .select()
      .from(schema.unifiedTasks)
      .where(
        and(
          eq(schema.unifiedTasks.organizationId, organizationId),
          sql`${schema.unifiedTasks.deletedAt} IS NULL`,
          idMatch
        )
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Get tasks by module type
   */
  async getTasksByModule(
    moduleType: keyof typeof MODULE_CONFIG,
    options?: {
      organizationId?: number;
      status?: string;
      limit?: number;
    }
  ): Promise<schema.UnifiedTask[]> {
    return this.getAllUnifiedTasks({ ...options, moduleType });
  }

  /**
   * Link tasks across modules, by business key (taskId), within one
   * organization. Null when either endpoint is not a live task of that
   * organization — nothing is written.
   */
  async linkTasks(
    input: TaskLinkInput & { organizationId: number },
    runner: TaskWriteRunner = this.getDb()
  ): Promise<schema.CrossModuleTaskLink | null> {
    const linkId = generateUUID();
    const live = and(
      eq(schema.unifiedTasks.organizationId, input.organizationId),
      isNull(schema.unifiedTasks.deletedAt)
    );

    // Both endpoints in ONE read, locked in task-id order: two links over the
    // same pair queue on the first row instead of each holding one the other
    // waits for, and neither task can be archived under the link. A completion
    // locks its own row before its dependents', so a link racing a completion
    // over the same two tasks can still deadlock; Postgres aborts one side,
    // which rolls back whole (a 500, nothing written). Every row lock still
    // precedes the ledger row's audit-chain lock.
    const endpoints = await runner
      .select()
      .from(schema.unifiedTasks)
      .where(and(live, inArray(schema.unifiedTasks.taskId, [input.sourceTaskId, input.targetTaskId])))
      .orderBy(schema.unifiedTasks.taskId)
      .for('no key update');
    const sourceTask = endpoints.find(t => t.taskId === input.sourceTaskId);
    const targetTask = endpoints.find(t => t.taskId === input.targetTaskId);
    if (!sourceTask || !targetTask) return null;

    // Create the link (tenant-stamped from the validated source task, D20)
    const link = await runner
      .insert(schema.crossModuleTaskLinks)
      .values({
        linkId,
        organizationId: sourceTask.organizationId,
        sourceTaskId: input.sourceTaskId,
        sourceModule: sourceTask.moduleType,
        targetTaskId: input.targetTaskId,
        targetModule: targetTask.moduleType,
        linkType: input.linkType,
        dependencyType: input.dependencyType,
        isBlocking: input.isBlocking || false,
        impactDescription: input.impactDescription,
        riskLevel: input.riskLevel,
        status: 'active',
      })
      .returning();

    // Update tasks with linkage information. In turn, not Promise.all: a
    // transaction is one connection, and its statements run one at a time.
    if (input.linkType === 'dependency' && input.isBlocking) {
      await runner
        .update(schema.unifiedTasks)
        .set({
          blockedBy: sql`array_append(${schema.unifiedTasks.blockedBy}, ${input.sourceTaskId})`,
        })
        .where(and(live, eq(schema.unifiedTasks.taskId, input.targetTaskId)));
      await runner
        .update(schema.unifiedTasks)
        .set({
          blocks: sql`array_append(${schema.unifiedTasks.blocks}, ${input.targetTaskId})`,
        })
        .where(and(live, eq(schema.unifiedTasks.taskId, input.sourceTaskId)));
    }

    return link[0];
  }

  /**
   * Get unified dashboard metrics
   */
  async getUnifiedDashboardMetrics(organizationId: number, projectId?: number) {
    const dbInstance = this.getDb();
    const baseConditions = [
      eq(schema.unifiedTasks.organizationId, organizationId),
      sql`${schema.unifiedTasks.deletedAt} IS NULL`,
    ];
    if (projectId) {
      baseConditions.push(eq(schema.unifiedTasks.projectId, projectId));
    }

    // Get task counts by module and status
    const tasksByModule = await dbInstance
      .select({
        moduleType: schema.unifiedTasks.moduleType,
        status: schema.unifiedTasks.status,
        count: sql<number>`count(*)`,
      })
      .from(schema.unifiedTasks)
      .where(and(...baseConditions))
      .groupBy(schema.unifiedTasks.moduleType, schema.unifiedTasks.status);

    // Get overdue tasks
    const overdueTasks = await dbInstance
      .select({ count: sql<number>`count(*)` })
      .from(schema.unifiedTasks)
      .where(
        and(
          ...baseConditions,
          sql`${schema.unifiedTasks.dueDate} < NOW()`,
          sql`${schema.unifiedTasks.status} != 'completed'`
        )
      );

    // Get high priority tasks
    const highPriorityTasks = await dbInstance
      .select({ count: sql<number>`count(*)` })
      .from(schema.unifiedTasks)
      .where(
        and(
          ...baseConditions,
          or(
            eq(schema.unifiedTasks.priority, 'high'),
            eq(schema.unifiedTasks.priority, 'critical')
          ),
          sql`${schema.unifiedTasks.status} != 'completed'`
        )
      );

    // Get tasks requiring approval
    const approvalRequired = await dbInstance
      .select({ count: sql<number>`count(*)` })
      .from(schema.unifiedTasks)
      .where(
        and(
          ...baseConditions,
          eq(schema.unifiedTasks.approvalRequired, true),
          // NULL-safe "not yet approved". `= 'pending'` was structurally zero
          // (the column is nullable with no default and nothing writes that
          // value), which permanently credited the approvals component of the
          // submission-readiness score a full 100 and made the
          // "N tasks awaiting approval" critical alert unreachable.
          sql`${schema.unifiedTasks.approvalStatus} IS DISTINCT FROM 'approved'`,
          // A cancelled task is not awaiting anyone's signature. Without this
          // the NULL-safe predicate above counts cancelled gated rows as
          // pending approvals for as long as they exist, which drags the
          // submission-readiness score down and keeps a critical alert lit.
          ne(schema.unifiedTasks.status, 'cancelled')
        )
      );

    // Calculate module-wise progress
    const moduleProgress: Record<string, number> = {};
    for (const moduleKey of Object.keys(MODULE_CONFIG)) {
      const moduleTasks = tasksByModule.filter(t => t.moduleType === moduleKey);
      const total = moduleTasks.reduce((sum, t) => sum + t.count, 0);
      const completed = moduleTasks.find(t => t.status === 'completed')?.count || 0;
      moduleProgress[moduleKey] = total > 0 ? (completed / total) * 100 : 0;
    }

    return {
      totalTasks: tasksByModule.reduce((sum, t) => sum + t.count, 0),
      tasksByModule,
      moduleProgress,
      overdueTasks: overdueTasks[0]?.count || 0,
      highPriorityTasks: highPriorityTasks[0]?.count || 0,
      approvalRequired: approvalRequired[0]?.count || 0,
      moduleConfig: MODULE_CONFIG,
    };
  }

  /**
   * Sync tasks from specific module. Every read and insert runs on `runner`;
   * `createdTasks` are the rows it inserted, for a caller holding the
   * transaction to write one ledger row each before COMMIT. Throws
   * ModuleSyncUnavailableError for Vault.
   */
  async syncTasksFromModule(
    moduleType: keyof typeof MODULE_CONFIG,
    scope: SyncScope,
    runner: TaskWriteRunner = this.getDb()
  ): Promise<{
    synced: number;
    created: number;
    updated: number;
    createdTasks: schema.UnifiedTask[];
  }> {
    let synced = 0;
    let updated = 0;
    const createdTasks: schema.UnifiedTask[] = [];

    // Module-specific sync logic
    switch (moduleType) {
      case 'CMC': {
        // Sync CMC tasks (batch records, stability studies, analytical methods)
        const cmcTasks = await this.syncCMCTasks(scope, runner);
        synced += cmcTasks.synced;
        updated += cmcTasks.updated;
        createdTasks.push(...cmcTasks.createdTasks);
        break;
      }

      case 'IND': {
        // Sync IND Wizard tasks (document preparation, section completion)
        const indTasks = await this.syncINDTasks(scope, runner);
        synced += indTasks.synced;
        updated += indTasks.updated;
        createdTasks.push(...indTasks.createdTasks);
        break;
      }

      case 'MedicalDevice': {
        // Sync Medical Device tasks (510(k) prep, PMA documentation)
        const mdTasks = await this.syncMedicalDeviceTasks(scope, runner);
        synced += mdTasks.synced;
        updated += mdTasks.updated;
        createdTasks.push(...mdTasks.createdTasks);
        break;
      }

      case 'eCTD': {
        // Sync eCTD Co-Author tasks (document assembly, publishing)
        const ectdTasks = await this.syncECTDTasks(scope, runner);
        synced += ectdTasks.synced;
        updated += ectdTasks.updated;
        createdTasks.push(...ectdTasks.createdTasks);
        break;
      }

      case 'Vault':
        // Refused before any read: see ModuleSyncUnavailableError.
        throw new ModuleSyncUnavailableError('Vault');

      case 'ProtocolDesign': {
        // Sync Protocol Design tasks (study design, protocol reviews)
        const protocolTasks = await this.syncProtocolTasks(scope, runner);
        synced += protocolTasks.synced;
        updated += protocolTasks.updated;
        createdTasks.push(...protocolTasks.createdTasks);
        break;
      }
    }

    return { synced, created: createdTasks.length, updated, createdTasks };
  }

  /**
   * Whether this organization already has a task synced from this source row.
   * Org-scoped: source ids are per-tenant serials, so another organization's
   * task for the same id used to stop this one's from ever being created.
   */
  private async alreadySynced(
    runner: TaskWriteRunner,
    organizationId: number,
    moduleType: string,
    sourceEntityId: string
  ): Promise<boolean> {
    const existing = await runner
      .select({ id: schema.unifiedTasks.id })
      .from(schema.unifiedTasks)
      .where(
        and(
          eq(schema.unifiedTasks.organizationId, organizationId),
          eq(schema.unifiedTasks.sourceEntityId, sourceEntityId),
          eq(schema.unifiedTasks.moduleType, moduleType)
        )
      )
      .limit(1);
    return existing.length > 0;
  }

  private async syncCMCTasks(scope: SyncScope, runner: TaskWriteRunner) {
    const { organizationId, createdById } = scope;
    // Query stability studies and convert to unified tasks
    const tasks = await runner
      .select()
      .from(schema.stabilityStudies)
      .where(eq(schema.stabilityStudies.organizationId, organizationId))
      .limit(100);

    const createdTasks: schema.UnifiedTask[] = [];
    for (const task of tasks) {
      if (!(await this.alreadySynced(runner, organizationId, 'CMC', String(task.id)))) {
        createdTasks.push(await this.createUnifiedTask({
          moduleType: 'CMC',
          title: task.studyTitle || task.productName,
          description: task.notes ?? undefined,
          category: 'stability',
          taskType: 'study',
          assigneeId: task.studyDirector ?? undefined,
          priority: 'medium',
          dueDate: task.plannedEndDate ?? undefined,
          sourceEntityId: String(task.id),
          sourceEntityType: 'stability_study',
          organizationId,
          createdById,
        }, runner));
      }
    }

    return { synced: tasks.length, updated: 0, createdTasks };
  }

  private async syncINDTasks(scope: SyncScope, runner: TaskWriteRunner) {
    const { organizationId, createdById } = scope;
    // Query regulatory tasks for IND
    const tasks = await runner
      .select()
      .from(schema.regulatoryTasks)
      .where(
        and(
          eq(schema.regulatoryTasks.organizationId, organizationId),
          eq(schema.regulatoryTasks.category, 'regulatory')
        )
      )
      .limit(100);

    const createdTasks: schema.UnifiedTask[] = [];
    for (const task of tasks) {
      if (!(await this.alreadySynced(runner, organizationId, 'IND', task.taskId))) {
        createdTasks.push(await this.createUnifiedTask({
          moduleType: 'IND',
          title: task.title,
          description: task.description ?? undefined,
          category: task.category || 'regulatory',
          taskType: task.taskType,
          assigneeId: task.assignedTo ?? undefined,
          priority: task.priority as any,
          dueDate: task.dueDate ?? undefined,
          estimatedHours: task.estimatedHours ?? undefined,
          sourceEntityId: task.taskId ?? undefined,
          sourceEntityType: 'regulatory_task',
          organizationId,
          createdById,
        }, runner));
      }
    }

    return { synced: tasks.length, updated: 0, createdTasks };
  }

  private async syncMedicalDeviceTasks(scope: SyncScope, runner: TaskWriteRunner) {
    const { organizationId, createdById } = scope;
    // Query medical device specific tasks
    const tasks = await runner
      .select()
      .from(schema.medicalDevices)
      .where(eq(schema.medicalDevices.organizationId, organizationId))
      .limit(100);

    const createdTasks: schema.UnifiedTask[] = [];
    for (const task of tasks) {
      if (!(await this.alreadySynced(runner, organizationId, 'MedicalDevice', String(task.id)))) {
        createdTasks.push(await this.createUnifiedTask({
          moduleType: 'MedicalDevice',
          title: task.deviceName,
          description: task.deviceType ?? undefined,
          category: task.deviceClass || 'device',
          priority: 'medium',
          dueDate: undefined,
          sourceEntityId: String(task.id),
          sourceEntityType: 'medical_device',
          organizationId,
          createdById,
        }, runner));
      }
    }

    return { synced: tasks.length, updated: 0, createdTasks };
  }

  private async syncECTDTasks(scope: SyncScope, runner: TaskWriteRunner) {
    const { organizationId, createdById } = scope;
    // Query document-related tasks
    const documents = await runner
      .select()
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.organizationId, organizationId),
          eq(schema.documents.status, 'in-progress')
        )
      )
      .limit(50);

    const createdTasks: schema.UnifiedTask[] = [];
    for (const doc of documents) {
      if (!(await this.alreadySynced(runner, organizationId, 'eCTD', String(doc.id)))) {
        createdTasks.push(await this.createUnifiedTask({
          moduleType: 'eCTD',
          title: `Complete document: ${doc.title}`,
          description: `Review and finalize eCTD document ${doc.title}`,
          category: 'documentation',
          taskType: 'document',
          priority: 'medium',
          sourceEntityId: String(doc.id),
          sourceEntityType: 'document',
          organizationId,
          createdById,
        }, runner));
      }
    }

    return { synced: documents.length, updated: 0, createdTasks };
  }

  private async syncProtocolTasks(scope: SyncScope, runner: TaskWriteRunner) {
    const { organizationId, createdById } = scope;
    // Query protocol design tasks
    const protocols = await runner
      .select()
      .from(schema.protocols)
      .where(
        and(
          eq(schema.protocols.organizationId, organizationId),
          eq(schema.protocols.status, 'draft')
        )
      )
      .limit(50);

    const createdTasks: schema.UnifiedTask[] = [];
    for (const protocol of protocols) {
      if (!(await this.alreadySynced(runner, organizationId, 'ProtocolDesign', String(protocol.id)))) {
        createdTasks.push(await this.createUnifiedTask({
          moduleType: 'ProtocolDesign',
          title: `Complete Protocol: ${protocol.title}`,
          description: `Finalize protocol design and submit for review`,
          category: 'clinical',
          taskType: 'milestone',
          priority: 'high',
          sourceEntityId: String(protocol.id),
          sourceEntityType: 'protocol',
          organizationId,
          createdById,
        }, runner));
      }
    }

    return { synced: protocols.length, updated: 0, createdTasks };
  }

  /**
   * Update task status.
   *
   * The unblock cascade is NOT run here — callers run the shared, org-scoped
   * cascade (services/tasking/task-side-effects: cascadeUnblockOnCompletionInTx
   * on the transition's own transaction, or cascadeUnblockOnCompletion without one),
   * which covers both linkage systems and notifies. The private version this
   * method used to call matched blockedBy across EVERY organization.
   *
   * `opts.manifestation` is the verified §11.50 sign-off record for an
   * approval-gated completion — appended to approvalHistory with the gate
   * marked approved.
   */
  async updateTaskStatus(
    taskId: string,
    status: string,
    userId?: number,
    opts?: {
      manifestation?: {
        signedById: number | null;
        signedByName: string;
        meaning: string;
        reason: string;
        signedAt: string;
        method: string;
      } | null;
      /** Tenant of the caller. ANDed into the WHERE as defence in depth. */
      organizationId?: number;
      /**
       * Status the caller read before deciding this transition was legal.
       * Supplied => the UPDATE is a compare-and-set: it matches only while the
       * row still holds that status, so two concurrent transitions cannot both
       * commit. Returns undefined when the race is lost, which the caller must
       * treat as "nothing happened" and NOT audit.
       */
      expectedStatus?: string;
    },
    /** The caller's transaction, so the change commits with its ledger row. */
    runner: TaskWriteRunner = this.getDb()
  ) {
    const updates: any = { status, updatedAt: new Date() };

    if (status === 'completed') {
      // Only a real move into `completed` stamps the time. Signing a task
      // that is already complete attests to that completion; the
      // manifestation carries its own signedAt.
      if (opts?.expectedStatus !== 'completed') updates.completedAt = new Date();
      updates.completionPercentage = 100;
      updates.progress = 100;
    }

    // Reopening a completed task retires its signature. The manifestation in
    // approvalHistory attests to the record as it stood at first completion;
    // once the task is reopened and edited that attestation is stale, so the
    // gate must close again. Leaving approvalStatus='approved' let a signed
    // task be reopened, changed, and re-completed forever with no new PIN,
    // meaning or reason — and rendered "approved" while it sat in progress.
    // completedAt is cleared for the same reason (the sibling route does this;
    // this path did not).
    if (opts?.expectedStatus === 'completed' && status !== 'completed') {
      updates.completedAt = null;
      updates.approvalStatus = 'pending';
    }

    if (userId) {
      updates.lastModifiedBy = userId;
    }

    // Appended in the UPDATE itself rather than read-then-written: two
    // concurrent sign-offs each reading the same prior array would write
    // [...same, mine] and silently drop one verified §11.50 manifestation
    // while its ledger entry persisted. approval_history is `json`, so the
    // concat casts through jsonb and back. Set AFTER the reopen branch so an
    // actual signature always wins over the reset.
    if (opts?.manifestation) {
      updates.approvalStatus = 'approved';
      updates.approvalHistory = sql`(COALESCE(${schema.unifiedTasks.approvalHistory}, '[]'::json)::jsonb || ${JSON.stringify([opts.manifestation])}::jsonb)::json`;
    }

    const result = await runner
      .update(schema.unifiedTasks)
      .set(updates)
      .where(
        and(
          eq(schema.unifiedTasks.taskId, taskId),
          // Archived after the caller read it: out of reach, as on every write.
          isNull(schema.unifiedTasks.deletedAt),
          ...(opts?.organizationId !== undefined
            ? [eq(schema.unifiedTasks.organizationId, opts.organizationId)]
            : []),
          ...(opts?.expectedStatus !== undefined
            ? [eq(schema.unifiedTasks.status, opts.expectedStatus)]
            : []),
          // A same-status signature has no status to race on, so it sets on
          // the approval it read instead: one signature clears the gate, and
          // a second concurrent one matches nothing rather than stacking.
          ...(opts?.manifestation
            ? [sql`${schema.unifiedTasks.approvalStatus} IS DISTINCT FROM 'approved'`]
            : [])
        )
      )
      .returning();

    return result[0];
  }
}

const unifiedTaskService = UnifiedTaskService.getInstance();
export default unifiedTaskService;

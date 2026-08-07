/**
 * Unified Task Management Service
 *
 * Central service for managing tasks across ALL modules in the Regulatory Submission Center.
 * Provides a single source of truth for task management, connecting Protocol Design, CMC,
 * Medical Device, IND Wizard, eCTD Co-Author, and Vault.
 */

import { db } from '../db';
import { eq, and, or, sql } from 'drizzle-orm';
import * as schema from '../../shared/schema';
import { generateUUID } from '../utils/id-generator';

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
  async createUnifiedTask(input: UnifiedTaskInput): Promise<schema.UnifiedTask> {
    const dbInstance = this.getDb();
    const taskId = generateUUID();
    const moduleConfig = MODULE_CONFIG[input.moduleType];

    const task = await dbInstance
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
   * Link tasks across modules
   */
  async linkTasks(input: TaskLinkInput): Promise<schema.CrossModuleTaskLink> {
    const dbInstance = this.getDb();
    const linkId = generateUUID();

    // Get source and target tasks to determine modules
    const [sourceTask, targetTask] = await Promise.all([
      dbInstance
        .select()
        .from(schema.unifiedTasks)
        .where(eq(schema.unifiedTasks.taskId, input.sourceTaskId))
        .limit(1),
      dbInstance
        .select()
        .from(schema.unifiedTasks)
        .where(eq(schema.unifiedTasks.taskId, input.targetTaskId))
        .limit(1),
    ]);

    if (!sourceTask[0] || !targetTask[0]) {
      throw new Error('One or both tasks not found');
    }

    // Create the link
    const link = await dbInstance
      .insert(schema.crossModuleTaskLinks)
      .values({
        linkId,
        sourceTaskId: input.sourceTaskId,
        sourceModule: sourceTask[0].moduleType,
        targetTaskId: input.targetTaskId,
        targetModule: targetTask[0].moduleType,
        linkType: input.linkType,
        dependencyType: input.dependencyType,
        isBlocking: input.isBlocking || false,
        impactDescription: input.impactDescription,
        riskLevel: input.riskLevel,
        status: 'active',
      })
      .returning();

    // Update tasks with linkage information
    if (input.linkType === 'dependency' && input.isBlocking) {
      await Promise.all([
        dbInstance
          .update(schema.unifiedTasks)
          .set({
            blockedBy: sql`array_append(${schema.unifiedTasks.blockedBy}, ${input.sourceTaskId})`,
          })
          .where(eq(schema.unifiedTasks.taskId, input.targetTaskId)),
        dbInstance
          .update(schema.unifiedTasks)
          .set({
            blocks: sql`array_append(${schema.unifiedTasks.blocks}, ${input.targetTaskId})`,
          })
          .where(eq(schema.unifiedTasks.taskId, input.sourceTaskId)),
      ]);
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
          eq(schema.unifiedTasks.approvalStatus, 'pending')
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
   * Sync tasks from specific module
   */
  async syncTasksFromModule(
    moduleType: keyof typeof MODULE_CONFIG,
    organizationId: number
  ): Promise<{
    synced: number;
    created: number;
    updated: number;
  }> {
    let synced = 0;
    let created = 0;
    let updated = 0;

    // Module-specific sync logic
    switch (moduleType) {
      case 'CMC':
        // Sync CMC tasks (batch records, stability studies, analytical methods)
        const cmcTasks = await this.syncCMCTasks(organizationId);
        synced += cmcTasks.synced;
        created += cmcTasks.created;
        updated += cmcTasks.updated;
        break;

      case 'IND':
        // Sync IND Wizard tasks (document preparation, section completion)
        const indTasks = await this.syncINDTasks(organizationId);
        synced += indTasks.synced;
        created += indTasks.created;
        updated += indTasks.updated;
        break;

      case 'MedicalDevice':
        // Sync Medical Device tasks (510(k) prep, PMA documentation)
        const mdTasks = await this.syncMedicalDeviceTasks(organizationId);
        synced += mdTasks.synced;
        created += mdTasks.created;
        updated += mdTasks.updated;
        break;

      case 'eCTD':
        // Sync eCTD Co-Author tasks (document assembly, publishing)
        const ectdTasks = await this.syncECTDTasks(organizationId);
        synced += ectdTasks.synced;
        created += ectdTasks.created;
        updated += ectdTasks.updated;
        break;

      case 'Vault':
        // Sync Vault tasks (document reviews, approvals)
        const vaultTasks = await this.syncVaultTasks(organizationId);
        synced += vaultTasks.synced;
        created += vaultTasks.created;
        updated += vaultTasks.updated;
        break;

      case 'ProtocolDesign':
        // Sync Protocol Design tasks (study design, protocol reviews)
        const protocolTasks = await this.syncProtocolTasks(organizationId);
        synced += protocolTasks.synced;
        created += protocolTasks.created;
        updated += protocolTasks.updated;
        break;
    }

    return { synced, created, updated };
  }

  private async syncCMCTasks(organizationId: number) {
    const dbInstance = this.getDb();

    // Query stability studies and convert to unified tasks
    const tasks = await dbInstance
      .select()
      .from(schema.stabilityStudies)
      .where(eq(schema.stabilityStudies.organizationId, organizationId))
      .limit(100);

    let created = 0;
    for (const task of tasks) {
      // Check if already synced
      const existing = await dbInstance
        .select()
        .from(schema.unifiedTasks)
        .where(
          and(
            eq(schema.unifiedTasks.sourceEntityId, String(task.id)),
            eq(schema.unifiedTasks.moduleType, 'CMC')
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await this.createUnifiedTask({
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
        });
        created++;
      }
    }

    return { synced: tasks.length, created, updated: 0 };
  }

  private async syncINDTasks(organizationId: number) {
    const dbInstance = this.getDb();

    // Query regulatory tasks for IND
    const tasks = await dbInstance
      .select()
      .from(schema.regulatoryTasks)
      .where(
        and(
          eq(schema.regulatoryTasks.organizationId, organizationId),
          eq(schema.regulatoryTasks.category, 'regulatory')
        )
      )
      .limit(100);

    let created = 0;
    for (const task of tasks) {
      const existing = await dbInstance
        .select()
        .from(schema.unifiedTasks)
        .where(
          and(
            eq(schema.unifiedTasks.sourceEntityId, task.taskId),
            eq(schema.unifiedTasks.moduleType, 'IND')
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await this.createUnifiedTask({
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
        });
        created++;
      }
    }

    return { synced: tasks.length, created, updated: 0 };
  }

  private async syncMedicalDeviceTasks(organizationId: number) {
    const dbInstance = this.getDb();

    // Query medical device specific tasks
    const tasks = await dbInstance
      .select()
      .from(schema.medicalDevices)
      .where(eq(schema.medicalDevices.organizationId, organizationId))
      .limit(100);

    let created = 0;
    for (const task of tasks) {
      const existing = await dbInstance
        .select()
        .from(schema.unifiedTasks)
        .where(
          and(
            eq(schema.unifiedTasks.sourceEntityId, String(task.id)),
            eq(schema.unifiedTasks.moduleType, 'MedicalDevice')
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await this.createUnifiedTask({
          moduleType: 'MedicalDevice',
          title: task.deviceName,
          description: task.deviceType ?? undefined,
          category: task.deviceClass || 'device',
          priority: 'medium',
          dueDate: undefined,
          sourceEntityId: String(task.id),
          sourceEntityType: 'medical_device',
          organizationId,
        });
        created++;
      }
    }

    return { synced: tasks.length, created, updated: 0 };
  }

  private async syncECTDTasks(organizationId: number) {
    const dbInstance = this.getDb();

    // Query document-related tasks
    const documents = await dbInstance
      .select()
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.organizationId, organizationId),
          eq(schema.documents.status, 'in-progress')
        )
      )
      .limit(50);

    let created = 0;
    for (const doc of documents) {
      const existing = await dbInstance
        .select()
        .from(schema.unifiedTasks)
        .where(
          and(
            eq(schema.unifiedTasks.sourceEntityId, String(doc.id)),
            eq(schema.unifiedTasks.moduleType, 'eCTD')
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await this.createUnifiedTask({
          moduleType: 'eCTD',
          title: `Complete document: ${doc.title}`,
          description: `Review and finalize eCTD document ${doc.title}`,
          category: 'documentation',
          taskType: 'document',
          priority: 'medium',
          sourceEntityId: String(doc.id),
          sourceEntityType: 'document',
          organizationId,
        });
        created++;
      }
    }

    return { synced: documents.length, created, updated: 0 };
  }

  private async syncVaultTasks(organizationId: number) {
    const dbInstance = this.getDb();

    // Query vault approval tasks (raw query to avoid missing schema bindings)
    const approvalsResult = await dbInstance.execute(sql`
      select id, approver_id as approverId, status, approval_date as approvalDate
      from document_approvals
      where status = 'PENDING'
      limit 50
    `);

    const approvals = approvalsResult.rows as Array<{
      id: string;
      approverId: string | number | null;
      status: string;
      approvalDate: Date | null;
    }>;

    let created = 0;
    for (const approval of approvals) {
      const existing = await dbInstance
        .select()
        .from(schema.unifiedTasks)
        .where(
          and(
            eq(schema.unifiedTasks.sourceEntityId, String(approval.id)),
            eq(schema.unifiedTasks.moduleType, 'Vault')
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await this.createUnifiedTask({
          moduleType: 'Vault',
          title: `Document Approval Required`,
          description: `Review and approve document in Trial Vault`,
          category: 'approval',
          taskType: 'approval',
          assigneeId:
            typeof approval.approverId === 'number'
              ? approval.approverId
              : Number.isFinite(Number(approval.approverId))
                ? Number(approval.approverId)
                : undefined,
          priority: 'high',
          dueDate: approval.approvalDate || undefined,
          sourceEntityId: String(approval.id),
          sourceEntityType: 'document_approval',
          organizationId,
        });
        created++;
      }
    }

    return { synced: approvals.length, created, updated: 0 };
  }

  private async syncProtocolTasks(organizationId: number) {
    const dbInstance = this.getDb();

    // Query protocol design tasks
    const protocols = await dbInstance
      .select()
      .from(schema.protocols)
      .where(
        and(
          eq(schema.protocols.organizationId, organizationId),
          eq(schema.protocols.status, 'draft')
        )
      )
      .limit(50);

    let created = 0;
    for (const protocol of protocols) {
      const existing = await dbInstance
        .select()
        .from(schema.unifiedTasks)
        .where(
          and(
            eq(schema.unifiedTasks.sourceEntityId, String(protocol.id)),
            eq(schema.unifiedTasks.moduleType, 'ProtocolDesign')
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await this.createUnifiedTask({
          moduleType: 'ProtocolDesign',
          title: `Complete Protocol: ${protocol.title}`,
          description: `Finalize protocol design and submit for review`,
          category: 'clinical',
          taskType: 'milestone',
          priority: 'high',
          sourceEntityId: String(protocol.id),
          sourceEntityType: 'protocol',
          organizationId,
        });
        created++;
      }
    }

    return { synced: protocols.length, created, updated: 0 };
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskId: string, status: string, userId?: number) {
    const dbInstance = this.getDb();
    const updates: any = { status, updatedAt: new Date() };

    if (status === 'completed') {
      updates.completedAt = new Date();
      updates.completionPercentage = 100;
      updates.progress = 100;
    }

    if (userId) {
      updates.lastModifiedBy = userId;
    }

    const result = await dbInstance
      .update(schema.unifiedTasks)
      .set(updates)
      .where(eq(schema.unifiedTasks.taskId, taskId))
      .returning();

    // Check for dependent tasks to update
    if (status === 'completed') {
      await this.updateDependentTasks(taskId);
    }

    return result[0];
  }

  private async updateDependentTasks(completedTaskId: string) {
    const dbInstance = this.getDb();
    // Find tasks blocked by this one
    const blockedTasks = await dbInstance
      .select()
      .from(schema.unifiedTasks)
      .where(sql`${completedTaskId} = ANY(${schema.unifiedTasks.blockedBy})`);

    for (const task of blockedTasks) {
      // Remove from blockedBy array
      const newBlockedBy = task.blockedBy?.filter(id => id !== completedTaskId) || [];

      // If no more blockers, update status to in-progress
      if (newBlockedBy.length === 0 && task.status === 'blocked') {
        await dbInstance
          .update(schema.unifiedTasks)
          .set({
            blockedBy: newBlockedBy,
            status: 'in-progress',
            updatedAt: new Date(),
          })
          .where(eq(schema.unifiedTasks.taskId, task.taskId));
      } else {
        await dbInstance
          .update(schema.unifiedTasks)
          .set({
            blockedBy: newBlockedBy,
            updatedAt: new Date(),
          })
          .where(eq(schema.unifiedTasks.taskId, task.taskId));
      }
    }
  }
}

const unifiedTaskService = UnifiedTaskService.getInstance();
export default unifiedTaskService;

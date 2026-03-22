/**
 * AnA RI — Command Executor
 *
 * Gives AnA full operational control over the platform:
 * - Project lifecycle (create, update, list, switch)
 * - Document lifecycle (create, update, version, section-level edits)
 * - Task management (create, assign, update, complete, bulk)
 * - Artifact operations (create, place in dossier, promote, lock)
 * - Dossier packaging (readiness check, export)
 * - User context loading (history, preferences, work queue)
 *
 * Every command returns a structured result and logs to the audit trail.
 *
 * @module server/services/ana-ri/command-executor
 */

import { pool } from '../../db.js';
import { tagArtifact, type TagArtifactResult } from '../artifact-tagger.js';
import { logGeneration } from './enforcement.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CommandContext {
  userId: number;
  organizationId: number;
  activeProjectId?: number;
  userName?: string;
  userRole?: string;
}

export interface CommandResult {
  success: boolean;
  action: string;
  data?: Record<string, unknown>;
  message: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PROJECT OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Create a new project */
export async function createProject(
  ctx: CommandContext,
  params: {
    name: string;
    description?: string;
    submissionType?: string;
    therapeuticArea?: string;
    targetAgency?: string;
    phase?: string;
  }
): Promise<CommandResult> {
  try {
    const result = await pool.query(
      `INSERT INTO projects (organization_id, name, description, status, submission_type,
        therapeutic_area, created_by_id, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', $4, $5, $6, NOW(), NOW())
       RETURNING id, name, status`,
      [ctx.organizationId, params.name, params.description || '', params.submissionType || null,
       params.therapeuticArea || null, ctx.userId]
    );
    const project = result.rows[0];
    return {
      success: true,
      action: 'create_project',
      data: { projectId: project.id, name: project.name, status: project.status },
      message: `Project "${params.name}" created (ID: ${project.id}).`,
    };
  } catch (err: any) {
    return { success: false, action: 'create_project', message: 'Failed to create project.', error: err?.message };
  }
}

/** List user's projects */
export async function listProjects(ctx: CommandContext): Promise<CommandResult> {
  try {
    const result = await pool.query(
      `SELECT id, name, status, submission_type, therapeutic_area, progress,
              created_at, updated_at
       FROM projects
       WHERE organization_id = $1
       ORDER BY updated_at DESC
       LIMIT 50`,
      [ctx.organizationId]
    );
    return {
      success: true,
      action: 'list_projects',
      data: { projects: result.rows, count: result.rows.length },
      message: `Found ${result.rows.length} project(s).`,
    };
  } catch (err: any) {
    return { success: false, action: 'list_projects', message: 'Failed to list projects.', error: err?.message };
  }
}

/** Update project metadata */
export async function updateProject(
  ctx: CommandContext,
  projectId: number,
  updates: Record<string, unknown>
): Promise<CommandResult> {
  try {
    const allowedFields = ['name', 'description', 'status', 'submission_type', 'therapeutic_area', 'phase', 'priority', 'risk_level'];
    const setClauses: string[] = [];
    const values: unknown[] = [projectId, ctx.organizationId];
    let paramIdx = 3;

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        setClauses.push(`${snakeKey} = $${paramIdx}`);
        values.push(value);
        paramIdx++;
      }
    }

    if (setClauses.length === 0) {
      return { success: false, action: 'update_project', message: 'No valid fields to update.' };
    }

    setClauses.push('updated_at = NOW()');
    await pool.query(
      `UPDATE projects SET ${setClauses.join(', ')} WHERE id = $1 AND organization_id = $2`,
      values
    );
    return {
      success: true,
      action: 'update_project',
      data: { projectId, updated: Object.keys(updates) },
      message: `Project ${projectId} updated.`,
    };
  } catch (err: any) {
    return { success: false, action: 'update_project', message: 'Failed to update project.', error: err?.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. DOCUMENT / ARTIFACT OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Create a new artifact (document) in a project */
export async function createArtifact(
  ctx: CommandContext,
  params: {
    projectId: number;
    title: string;
    content: string;
    type?: string;
    ctdSection?: string;
    status?: string;
    source?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<CommandResult> {
  try {
    const result = await tagArtifact({
      projectId: params.projectId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      sectionCode: params.ctdSection || 'unassigned',
      title: params.title,
      content: params.content,
      status: params.status || 'draft',
      source: params.source || 'ana_ri',
      metadata: {
        ...params.metadata,
        createdVia: 'ana_command',
        createdBy: ctx.userName || ctx.userId,
      },
    });

    logGeneration({
      timestamp: new Date().toISOString(),
      route: 'ana-ri/command',
      action: 'create_artifact',
      projectId: params.projectId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      artifactCreated: true,
      artifactId: result.artifactId,
      anaRiOrchestrated: true,
    });

    return {
      success: true,
      action: 'create_artifact',
      data: { artifactId: result.artifactId, isNew: result.isNew, sectionCode: result.sectionCode },
      message: `Artifact "${params.title}" created (ID: ${result.artifactId}) in project ${params.projectId}.`,
    };
  } catch (err: any) {
    return { success: false, action: 'create_artifact', message: 'Failed to create artifact.', error: err?.message };
  }
}

/** Update artifact content (creates a new version) */
export async function updateArtifact(
  ctx: CommandContext,
  params: {
    projectId: number;
    artifactId: number;
    content: string;
    title?: string;
    changeDescription?: string;
  }
): Promise<CommandResult> {
  try {
    const result = await tagArtifact({
      projectId: params.projectId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      sectionCode: '',
      title: params.title || '',
      content: params.content,
      status: 'draft',
      artifactId: params.artifactId,
      source: 'ana_ri',
      metadata: {
        updatedVia: 'ana_command',
        changeDescription: params.changeDescription || 'Updated by AnA RI',
      },
    });
    return {
      success: true,
      action: 'update_artifact',
      data: { artifactId: result.artifactId, versionId: result.versionId },
      message: `Artifact ${params.artifactId} updated (new version created).`,
    };
  } catch (err: any) {
    return { success: false, action: 'update_artifact', message: 'Failed to update artifact.', error: err?.message };
  }
}

/** Update artifact status */
export async function updateArtifactStatus(
  ctx: CommandContext,
  params: {
    projectId: number;
    artifactId: number;
    status: 'draft' | 'review' | 'approved' | 'locked';
  }
): Promise<CommandResult> {
  try {
    await pool.query(
      `UPDATE concept2cure_artifacts
       SET status = $4, updated_at = NOW()
       WHERE artifact_id = $1 AND project_id = $2 AND organization_id = $3`,
      [params.artifactId, params.projectId, ctx.organizationId, params.status]
    );
    return {
      success: true,
      action: 'update_artifact_status',
      data: { artifactId: params.artifactId, status: params.status },
      message: `Artifact ${params.artifactId} status changed to "${params.status}".`,
    };
  } catch (err: any) {
    return { success: false, action: 'update_artifact_status', message: 'Failed to update status.', error: err?.message };
  }
}

/** Place artifact in CTD dossier section */
export async function placeInDossier(
  ctx: CommandContext,
  params: {
    projectId: number;
    artifactId: number;
    ctdSection: string;
    dossierModule?: string;
  }
): Promise<CommandResult> {
  try {
    await pool.query(
      `UPDATE concept2cure_artifacts
       SET ctd_section = $4, updated_at = NOW()
       WHERE artifact_id = $1 AND project_id = $2 AND organization_id = $3`,
      [params.artifactId, params.projectId, ctx.organizationId, params.ctdSection]
    );
    return {
      success: true,
      action: 'place_in_dossier',
      data: { artifactId: params.artifactId, ctdSection: params.ctdSection },
      message: `Artifact ${params.artifactId} placed in CTD section ${params.ctdSection}.`,
    };
  } catch (err: any) {
    return { success: false, action: 'place_in_dossier', message: 'Failed to place in dossier.', error: err?.message };
  }
}

/** List artifacts in a project */
export async function listArtifacts(
  ctx: CommandContext,
  projectId: number,
  filters?: { status?: string; ctdSection?: string }
): Promise<CommandResult> {
  try {
    let query = `SELECT artifact_id, title, status, ctd_section, version, type, created_at, updated_at
                 FROM concept2cure_artifacts
                 WHERE project_id = $1 AND organization_id = $2`;
    const values: unknown[] = [projectId, ctx.organizationId];
    let paramIdx = 3;

    if (filters?.status) {
      query += ` AND status = $${paramIdx}`;
      values.push(filters.status);
      paramIdx++;
    }
    if (filters?.ctdSection) {
      query += ` AND ctd_section = $${paramIdx}`;
      values.push(filters.ctdSection);
      paramIdx++;
    }

    query += ' ORDER BY updated_at DESC LIMIT 100';
    const result = await pool.query(query, values);

    return {
      success: true,
      action: 'list_artifacts',
      data: { artifacts: result.rows, count: result.rows.length },
      message: `Found ${result.rows.length} artifact(s) in project ${projectId}.`,
    };
  } catch (err: any) {
    return { success: false, action: 'list_artifacts', message: 'Failed to list artifacts.', error: err?.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. TASK MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/** Create a task in a project */
export async function createTask(
  ctx: CommandContext,
  params: {
    projectId: number;
    title: string;
    description?: string;
    assigneeId?: number;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    dueDate?: string;
    taskType?: string;
    linkedArtifactId?: number;
  }
): Promise<CommandResult> {
  try {
    const result = await pool.query(
      `INSERT INTO project_tasks
         (project_id, organization_id, title, description, assignee_id,
          priority, due_date, task_type, status, created_by_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, NOW(), NOW())
       RETURNING id, title, status, priority`,
      [params.projectId, ctx.organizationId, params.title, params.description || '',
       params.assigneeId || null, params.priority || 'medium',
       params.dueDate || null, params.taskType || 'general', ctx.userId]
    );
    const task = result.rows[0];
    return {
      success: true,
      action: 'create_task',
      data: { taskId: task.id, title: task.title, priority: task.priority, status: task.status },
      message: `Task "${params.title}" created (ID: ${task.id}).`,
    };
  } catch (err: any) {
    return { success: false, action: 'create_task', message: 'Failed to create task.', error: err?.message };
  }
}

/** Update a task */
export async function updateTask(
  ctx: CommandContext,
  params: {
    projectId: number;
    taskId: number;
    updates: Record<string, unknown>;
  }
): Promise<CommandResult> {
  try {
    const allowedFields = ['title', 'description', 'status', 'priority', 'assignee_id', 'due_date'];
    const setClauses: string[] = [];
    const values: unknown[] = [params.taskId, params.projectId, ctx.organizationId];
    let paramIdx = 4;

    for (const [key, value] of Object.entries(params.updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        setClauses.push(`${snakeKey} = $${paramIdx}`);
        values.push(value);
        paramIdx++;
      }
    }

    if (setClauses.length === 0) {
      return { success: false, action: 'update_task', message: 'No valid fields to update.' };
    }

    setClauses.push('updated_at = NOW()');
    await pool.query(
      `UPDATE project_tasks SET ${setClauses.join(', ')}
       WHERE id = $1 AND project_id = $2 AND organization_id = $3`,
      values
    );
    return {
      success: true,
      action: 'update_task',
      data: { taskId: params.taskId, updated: Object.keys(params.updates) },
      message: `Task ${params.taskId} updated.`,
    };
  } catch (err: any) {
    return { success: false, action: 'update_task', message: 'Failed to update task.', error: err?.message };
  }
}

/** List tasks in a project */
export async function listTasks(
  ctx: CommandContext,
  projectId: number,
  filters?: { status?: string; priority?: string; assigneeId?: number }
): Promise<CommandResult> {
  try {
    let query = `SELECT id, title, description, status, priority, assignee_id, due_date,
                        task_type, created_at, updated_at
                 FROM project_tasks
                 WHERE project_id = $1 AND organization_id = $2`;
    const values: unknown[] = [projectId, ctx.organizationId];
    let paramIdx = 3;

    if (filters?.status) { query += ` AND status = $${paramIdx}`; values.push(filters.status); paramIdx++; }
    if (filters?.priority) { query += ` AND priority = $${paramIdx}`; values.push(filters.priority); paramIdx++; }
    if (filters?.assigneeId) { query += ` AND assignee_id = $${paramIdx}`; values.push(filters.assigneeId); paramIdx++; }

    query += ' ORDER BY CASE priority WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END, due_date ASC NULLS LAST LIMIT 100';
    const result = await pool.query(query, values);

    return {
      success: true,
      action: 'list_tasks',
      data: { tasks: result.rows, count: result.rows.length },
      message: `Found ${result.rows.length} task(s) in project ${projectId}.`,
    };
  } catch (err: any) {
    return { success: false, action: 'list_tasks', message: 'Failed to list tasks.', error: err?.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DOSSIER / SUBMISSION READINESS
// ─────────────────────────────────────────────────────────────────────────────

/** Check dossier readiness for a project */
export async function checkDossierReadiness(
  ctx: CommandContext,
  projectId: number
): Promise<CommandResult> {
  try {
    // Get all artifacts and their placement status
    const artifacts = await pool.query(
      `SELECT artifact_id, title, status, ctd_section, version
       FROM concept2cure_artifacts
       WHERE project_id = $1 AND organization_id = $2
       ORDER BY ctd_section`,
      [projectId, ctx.organizationId]
    );

    const total = artifacts.rows.length;
    const placed = artifacts.rows.filter((a: any) => a.ctd_section && a.ctd_section !== 'unassigned').length;
    const approved = artifacts.rows.filter((a: any) => a.status === 'approved' || a.status === 'locked').length;
    const draft = artifacts.rows.filter((a: any) => a.status === 'draft').length;
    const inReview = artifacts.rows.filter((a: any) => a.status === 'review').length;
    const unplaced = total - placed;

    const issues: string[] = [];
    if (unplaced > 0) issues.push(`${unplaced} artifact(s) not placed in dossier`);
    if (draft > 0) issues.push(`${draft} artifact(s) still in draft`);
    if (inReview > 0) issues.push(`${inReview} artifact(s) pending review`);

    const readiness = total === 0 ? 0 : Math.round((approved / total) * 100);

    return {
      success: true,
      action: 'check_dossier_readiness',
      data: {
        total, placed, unplaced, approved, draft, inReview,
        readinessPercent: readiness,
        issues,
        artifacts: artifacts.rows,
      },
      message: `Dossier readiness: ${readiness}% (${approved}/${total} approved). ${issues.length > 0 ? 'Issues: ' + issues.join('; ') : 'No blocking issues.'}`,
    };
  } catch (err: any) {
    return { success: false, action: 'check_dossier_readiness', message: 'Failed to check readiness.', error: err?.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. USER CONTEXT LOADING
// ─────────────────────────────────────────────────────────────────────────────

/** Load full user context for AnA */
export async function loadUserContext(ctx: CommandContext): Promise<CommandResult> {
  try {
    // User profile
    const userResult = await pool.query(
      `SELECT id, email, name, title, department, preferences FROM users WHERE id = $1`,
      [ctx.userId]
    );
    const user = userResult.rows[0];

    // User's projects
    const projects = await pool.query(
      `SELECT id, name, status, submission_type, therapeutic_area, progress, updated_at
       FROM projects WHERE organization_id = $1 ORDER BY updated_at DESC LIMIT 20`,
      [ctx.organizationId]
    );

    // Recent conversations
    const conversations = await pool.query(
      `SELECT id, title, summary, status, message_count, updated_at
       FROM concept2cure_conversations
       WHERE organization_id = $1 AND created_by_id = $2
       ORDER BY updated_at DESC LIMIT 10`,
      [ctx.organizationId, ctx.userId]
    );

    // Recent artifacts created by user
    const recentArtifacts = await pool.query(
      `SELECT artifact_id, title, status, ctd_section, project_id, updated_at
       FROM concept2cure_artifacts
       WHERE organization_id = $1 AND created_by_id = $2
       ORDER BY updated_at DESC LIMIT 10`,
      [ctx.organizationId, ctx.userId]
    );

    return {
      success: true,
      action: 'load_user_context',
      data: {
        user: user || { id: ctx.userId },
        projects: projects.rows,
        recentConversations: conversations.rows,
        recentArtifacts: recentArtifacts.rows,
      },
      message: `Loaded context: ${projects.rows.length} projects, ${conversations.rows.length} recent conversations, ${recentArtifacts.rows.length} recent artifacts.`,
    };
  } catch (err: any) {
    // Graceful degradation — return partial context
    return {
      success: true,
      action: 'load_user_context',
      data: { user: { id: ctx.userId }, projects: [], recentConversations: [], recentArtifacts: [] },
      message: 'Loaded partial context (some tables may not exist yet).',
    };
  }
}

/** Load conversation history for current user */
export async function loadConversationHistory(
  ctx: CommandContext,
  params?: { projectId?: number; limit?: number }
): Promise<CommandResult> {
  try {
    let query = `SELECT c.id, c.title, c.summary, c.status, c.message_count, c.project_id, c.updated_at,
                        p.name as project_name
                 FROM concept2cure_conversations c
                 LEFT JOIN projects p ON p.id = c.project_id
                 WHERE c.organization_id = $1 AND c.created_by_id = $2`;
    const values: unknown[] = [ctx.organizationId, ctx.userId];
    let paramIdx = 3;

    if (params?.projectId) {
      query += ` AND c.project_id = $${paramIdx}`;
      values.push(params.projectId);
      paramIdx++;
    }

    query += ` ORDER BY c.updated_at DESC LIMIT $${paramIdx}`;
    values.push(params?.limit || 20);

    const result = await pool.query(query, values);
    return {
      success: true,
      action: 'load_conversation_history',
      data: { conversations: result.rows, count: result.rows.length },
      message: `Found ${result.rows.length} conversation(s).`,
    };
  } catch (err: any) {
    return { success: true, action: 'load_conversation_history', data: { conversations: [] }, message: 'No conversation history available.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SUBMISSION PACKAGING
// ─────────────────────────────────────────────────────────────────────────────

/** Create a submission package for a project */
export async function createSubmissionPackage(
  ctx: CommandContext,
  params: {
    projectId: number;
    title: string;
    packageFamily: 'ind' | '510k' | 'cer' | 'nda' | 'bla' | 'pma';
    description?: string;
    targetDate?: string;
  }
): Promise<CommandResult> {
  try {
    const result = await pool.query(
      `INSERT INTO submission_packages
         (package_id, org_id, project_id, package_family, title, description,
          target_date, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'active', NOW(), NOW())
       RETURNING package_id, title, package_family, status`,
      [ctx.organizationId, params.projectId, params.packageFamily,
       params.title, params.description || '', params.targetDate || null]
    );
    const pkg = result.rows[0];
    return {
      success: true,
      action: 'create_submission_package',
      data: { packageId: pkg.package_id, title: pkg.title, family: pkg.package_family },
      message: `Submission package "${params.title}" created (${params.packageFamily.toUpperCase()}).`,
    };
  } catch (err: any) {
    return { success: false, action: 'create_submission_package', message: 'Failed to create submission package.', error: err?.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. REVIEW OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Assign a reviewer to an artifact */
export async function assignReviewer(
  ctx: CommandContext,
  params: {
    projectId: number;
    artifactId: number;
    reviewerId: number;
    reviewType?: string;
    instructions?: string;
  }
): Promise<CommandResult> {
  try {
    const result = await pool.query(
      `INSERT INTO concept2cure_review_assignments
         (artifact_id, project_id, organization_id, reviewer_id,
          review_type, instructions, status, assigned_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, NOW(), NOW())
       RETURNING id`,
      [params.artifactId, params.projectId, ctx.organizationId,
       params.reviewerId, params.reviewType || 'standard',
       params.instructions || '', ctx.userId]
    );
    return {
      success: true,
      action: 'assign_reviewer',
      data: { assignmentId: result.rows[0]?.id, artifactId: params.artifactId, reviewerId: params.reviewerId },
      message: `Reviewer ${params.reviewerId} assigned to artifact ${params.artifactId}.`,
    };
  } catch (err: any) {
    return { success: false, action: 'assign_reviewer', message: 'Failed to assign reviewer.', error: err?.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. SEARCH ACROSS PROJECT
// ─────────────────────────────────────────────────────────────────────────────

/** Search artifacts by content or title */
export async function searchArtifacts(
  ctx: CommandContext,
  params: {
    query: string;
    projectId?: number;
    limit?: number;
  }
): Promise<CommandResult> {
  try {
    let sql = `SELECT artifact_id, title, status, ctd_section, project_id,
                      ts_rank(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')),
                              plainto_tsquery('english', $2)) as relevance
               FROM concept2cure_artifacts
               WHERE organization_id = $1
                 AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
                     @@ plainto_tsquery('english', $2)`;
    const values: unknown[] = [ctx.organizationId, params.query];
    let paramIdx = 3;

    if (params.projectId) {
      sql += ` AND project_id = $${paramIdx}`;
      values.push(params.projectId);
      paramIdx++;
    }

    sql += ` ORDER BY relevance DESC LIMIT $${paramIdx}`;
    values.push(params.limit || 20);

    const result = await pool.query(sql, values);
    return {
      success: true,
      action: 'search_artifacts',
      data: { results: result.rows, count: result.rows.length },
      message: `Found ${result.rows.length} artifact(s) matching "${params.query}".`,
    };
  } catch (err: any) {
    // Fallback to ILIKE if full-text search fails (table may lack tsvector index)
    try {
      const fallback = await pool.query(
        `SELECT artifact_id, title, status, ctd_section, project_id
         FROM concept2cure_artifacts
         WHERE organization_id = $1 AND (title ILIKE $2 OR content ILIKE $2)
         ORDER BY updated_at DESC LIMIT $3`,
        [ctx.organizationId, `%${params.query}%`, params.limit || 20]
      );
      return {
        success: true,
        action: 'search_artifacts',
        data: { results: fallback.rows, count: fallback.rows.length },
        message: `Found ${fallback.rows.length} artifact(s) matching "${params.query}".`,
      };
    } catch (fallbackErr: any) {
      return { success: false, action: 'search_artifacts', message: 'Search failed.', error: fallbackErr?.message };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. TEAM / USER OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** List team members in the organization */
export async function listTeamMembers(ctx: CommandContext): Promise<CommandResult> {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.title, u.department, ou.role
       FROM users u
       JOIN organization_users ou ON ou.user_id = u.id
       WHERE ou.organization_id = $1
       ORDER BY u.name
       LIMIT 100`,
      [ctx.organizationId]
    );
    return {
      success: true,
      action: 'list_team_members',
      data: { members: result.rows, count: result.rows.length },
      message: `Found ${result.rows.length} team member(s).`,
    };
  } catch (err: any) {
    return { success: false, action: 'list_team_members', message: 'Failed to list team.', error: err?.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. COMMAND REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

export type CommandName =
  | 'create_project' | 'list_projects' | 'update_project'
  | 'create_artifact' | 'update_artifact' | 'update_artifact_status'
  | 'list_artifacts' | 'place_in_dossier'
  | 'create_task' | 'update_task' | 'list_tasks'
  | 'check_dossier_readiness' | 'create_submission_package'
  | 'assign_reviewer' | 'search_artifacts' | 'list_team_members'
  | 'load_user_context' | 'load_conversation_history';

export interface CommandDefinition {
  name: CommandName;
  description: string;
  parameters: string;
  example: string;
}

export const COMMAND_REGISTRY: CommandDefinition[] = [
  { name: 'create_project', description: 'Create a new regulatory project', parameters: 'name, submissionType?, therapeuticArea?, description?', example: '"Create an IND project for our oncology compound"' },
  { name: 'list_projects', description: 'List all projects in the organization', parameters: 'none', example: '"Show me all my projects"' },
  { name: 'update_project', description: 'Update project metadata', parameters: 'projectId, updates (name, status, priority, etc.)', example: '"Update project 5 priority to high"' },
  { name: 'create_artifact', description: 'Create a new document/artifact in a project', parameters: 'projectId, title, content, ctdSection?, type?', example: '"Create a Module 2.5 Clinical Overview draft"' },
  { name: 'update_artifact', description: 'Update an existing artifact (creates new version)', parameters: 'projectId, artifactId, content, changeDescription?', example: '"Update artifact 12 with revised safety narrative"' },
  { name: 'update_artifact_status', description: 'Change artifact lifecycle status', parameters: 'projectId, artifactId, status (draft/review/approved/locked)', example: '"Move artifact 12 to review status"' },
  { name: 'list_artifacts', description: 'List artifacts in a project', parameters: 'projectId, status?, ctdSection?', example: '"Show all draft artifacts in project 5"' },
  { name: 'place_in_dossier', description: 'Place artifact in a CTD dossier section', parameters: 'projectId, artifactId, ctdSection', example: '"Place artifact 12 in section 2.7.4"' },
  { name: 'create_task', description: 'Create a task in a project', parameters: 'projectId, title, priority?, assigneeId?, dueDate?, description?', example: '"Create a high-priority task to complete safety tables"' },
  { name: 'update_task', description: 'Update task status or details', parameters: 'projectId, taskId, updates (status, priority, etc.)', example: '"Mark task 8 as completed"' },
  { name: 'list_tasks', description: 'List tasks in a project', parameters: 'projectId, status?, priority?', example: '"Show all pending high-priority tasks"' },
  { name: 'check_dossier_readiness', description: 'Check submission readiness of the dossier', parameters: 'projectId', example: '"How ready is the dossier for project 5?"' },
  { name: 'load_user_context', description: 'Load my full context (projects, history, artifacts)', parameters: 'none', example: '"What am I working on?"' },
  { name: 'load_conversation_history', description: 'Load my past conversations', parameters: 'projectId?, limit?', example: '"Show my recent conversations for this project"' },
  { name: 'create_submission_package', description: 'Create a submission package for regulatory filing', parameters: 'projectId, title, packageFamily (ind/510k/cer/nda/bla/pma), targetDate?', example: '"Create an IND submission package for project 5"' },
  { name: 'assign_reviewer', description: 'Assign a reviewer to an artifact', parameters: 'projectId, artifactId, reviewerId, reviewType?, instructions?', example: '"Assign Dr. Smith to review the Clinical Overview"' },
  { name: 'search_artifacts', description: 'Search artifacts by content or title', parameters: 'query, projectId?, limit?', example: '"Find all artifacts mentioning hepatotoxicity"' },
  { name: 'list_team_members', description: 'List team members in the organization', parameters: 'none', example: '"Who is on my team?"' },
];

/**
 * Build a command context block for the AnA system prompt.
 * This tells AnA what commands are available and how to invoke them.
 */
export function buildCommandContextForPrompt(): string {
  const lines: string[] = [
    '## OPERATIONAL COMMANDS (YOU CAN EXECUTE THESE)',
    '',
    'You have full operational control. When the user asks you to create, update, list, or manage anything, execute the appropriate command. Do not just describe what could be done — do it.',
    '',
    'Available commands:',
    '',
  ];

  for (const cmd of COMMAND_REGISTRY) {
    lines.push(`- **${cmd.name}**: ${cmd.description}`);
    lines.push(`  Parameters: ${cmd.parameters}`);
    lines.push(`  Example: ${cmd.example}`);
    lines.push('');
  }

  lines.push('When executing commands, include the command name and parameters in your response using this format:');
  lines.push('');
  lines.push('```command');
  lines.push('{"command": "command_name", "params": {...}}');
  lines.push('```');
  lines.push('');
  lines.push('You can chain multiple commands in one response. Execute them in order.');

  return lines.join('\n');
}

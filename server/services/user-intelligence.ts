/**
 * @fileoverview User Intelligence Service
 * @module server/services/user-intelligence
 * @version 1.0.0
 *
 * @description
 * The brain behind personalized AI interactions. Loads comprehensive user
 * context for AnA RI so the AI knows:
 * - Who the user is (name, title, department, expertise)
 * - What they're working on right now
 * - What they last worked on
 * - What they should work on next
 * - Their communication preferences
 * - Their org's license/tier and enabled modules
 * - Cross-project awareness of all their work
 *
 * This is the service that transforms AnA 1.0 RI from a generic chatbot into
 * a personalized regulatory intelligence partner.
 *
 * @compliance FDA 21 CFR Part 11 — all context reads are non-mutating
 */

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('UserIntelligence');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES — Deep User Profile
// ═══════════════════════════════════════════════════════════════════════════════

export interface UserIdentity {
  id: number;
  name: string;
  email: string;
  title: string | null; // "Senior Regulatory Affairs Manager"
  department: string | null; // "Regulatory Affairs"
  bio: string | null;
  avatar: string | null;
  /** How AnA addresses them: the recorded preferred name, else the full recorded name; null when none is recorded. */
  greetingName: string | null;
  /** organization_users.role in this organization; null when no membership row records one. */
  role: string | null; // admin, manager, member, viewer
  expertiseLevel: string | null; // novice, intermediate, expert; null when not recorded
  communicationStyle: string | null; // concise, detailed, academic; null when not recorded
  focusAreas: string[]; // ["CMC", "nonclinical", "clinical"]
  lastLogin: string | null;
}

export interface OrganizationProfile {
  id: number;
  name: string;
  slug: string;
  industryMode: string | null; // biotech, pharma, cro, medtech, academic; null when not recorded
  tier: string | null; // free, standard, professional, enterprise; null when not recorded
  maxUsers: number | null; // null when not recorded
  maxProjects: number | null; // null when not recorded
  enabledModules: string[]; // from module_subscriptions
  settings: Record<string, any>;
}

export interface ProjectSummary {
  id: number;
  name: string;
  /** As recorded in the project's metadata; null when none is recorded, never assumed. */
  submissionType: string | null;
  status: string;
  /** projects.progress as recorded; null when NULL (a recorded 0 stays 0). */
  progress: number | null;
  phase: string | null;
  therapeuticArea: string | null;
  role: string; // user's role on this project (owner, member)
  lastAccessedAt: string | null;
}

export interface WorkSession {
  contextType: string;
  contextReference: string | null;
  contextTitle: string | null;
  projectId: number | null;
  projectName: string | null;
  startedAt: string;
  lastActivityAt: string;
  durationMinutes: number | null;
  messagesSent: number;
  artifactsCreated: number;
}

export interface WorkQueueItem {
  id: number;
  taskType: string;
  taskTitle: string;
  taskDescription: string | null;
  priority: number;
  referenceType: string | null;
  referenceId: string | null;
  projectId: number | null;
  projectName: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  source: string;
  aiReasoning: string | null;
}

export interface RecentActivity {
  action: string;
  entityType: string;
  entityName: string | null;
  description: string | null;
  projectName: string | null;
  createdAt: string;
}

/**
 * Every facet below that may be null is null either because there is nothing
 * recorded (no organization row, no active session) or because its read
 * failed — and a failed read is named in `unread`. Null is never "none found"
 * for a facet listed there.
 */
export interface UserIntelligence {
  identity: UserIdentity;
  /** The organization this was loaded for, whether or not its profile could be read. */
  organizationId: number;
  organization: OrganizationProfile | null;
  projects: ProjectSummary[] | null; // all user's projects across the org
  activeProject: ProjectSummary | null;
  currentSession: WorkSession | null; // what they're doing right now
  recentSessions: WorkSession[] | null; // last 5 work sessions
  workQueue: WorkQueueItem[] | null; // AI-recommended next tasks
  recentActivity: RecentActivity[] | null; // last 10 activities
  conversationMemory: {
    // summary of past AI interactions
    totalConversations: number;
    totalMessages: number;
    lastTopics: string[]; // last 5 things they asked about
    frequentTopics: string[]; // most common query themes
  } | null;
  /** The facets whose read failed, sorted; each is null above. */
  unread: string[];
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOADER FUNCTIONS — Each loads one facet of intelligence
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load complete user identity including preferences and role context.
 */
async function loadUserIdentity(
  userId: number,
  organizationId: number
): Promise<UserIdentity | null> {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.title, u.department, u.bio, u.avatar,
              u.last_login, u.preferences,
              ou.role as org_role
       FROM users u
       LEFT JOIN organization_users ou ON ou.user_id = u.id AND ou.organization_id = $2
       WHERE u.id = $1
       LIMIT 1`,
      [userId, organizationId]
    );

    if (result.rows.length === 0) return null;

    const u = result.rows[0];
    const prefs = u.preferences || {};

    // The recorded preferred name, else the full recorded name; null when none
    // is recorded. 2026-10-15: built from the first word of the job title and
    // the last word of the name ("Senior Raman").
    const recorded = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const greetingName = recorded(prefs.greeting_name) ?? recorded(u.name);

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      title: u.title,
      department: u.department,
      bio: u.bio,
      avatar: u.avatar,
      greetingName,
      // 2026-10-15: a user with no membership row read 'member', and unrecorded
      // preferences read 'intermediate' / 'professional'. Unrecorded is null.
      role: u.org_role || null,
      expertiseLevel: prefs.expertise_level || null,
      communicationStyle: prefs.communication_style || null,
      focusAreas: prefs.focus_areas || [],
      lastLogin: u.last_login?.toISOString() || null,
    };
  } catch (error) {
    logger.warn('Failed to load identity', { error });
    throw error;
  }
}

/**
 * Load organization profile including enabled modules from subscriptions.
 */
async function loadOrganizationProfile(
  organizationId: number
): Promise<OrganizationProfile | null> {
  try {
    const [orgResult, modulesResult] = await Promise.all([
      pool.query(
        `SELECT id, name, slug, industry_mode, tier, max_users, max_projects, settings
         FROM organizations WHERE id = $1`,
        [organizationId]
      ),
      pool.query(
        `SELECT ms.module_id
         FROM module_subscriptions ms
         WHERE ms.organization_id = $1 AND ms.enabled = true`,
        [organizationId]
      ),
    ]);

    if (orgResult.rows.length === 0) return null;

    const o = orgResult.rows[0];
    // 2026-10-15: unrecorded values were filled with 'biotech' / 'standard' / 5 / 10,
    // and AnA was told an organization with no recorded industry is a biotech.
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      industryMode: o.industry_mode || null,
      tier: o.tier || null,
      maxUsers: o.max_users ?? null,
      maxProjects: o.max_projects ?? null,
      enabledModules: modulesResult.rows.map((r: any) => r.module_id),
      settings: o.settings || {},
    };
  } catch (error) {
    logger.warn('Failed to load org profile', { error });
    throw error;
  }
}

/**
 * Load all projects the user has access to, with their role on each.
 */
async function loadUserProjects(userId: number, organizationId: number): Promise<ProjectSummary[]> {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.status, p.progress, p.metadata,
              CASE WHEN p.owner_id = $1 THEN 'owner' ELSE 'member' END as user_role,
              (SELECT MAX(uws.last_activity_at) FROM user_work_sessions uws
               WHERE uws.user_id = $1 AND uws.project_id = p.id) as last_accessed_at
       FROM projects p
       WHERE p.organization_id = $2
         AND (p.owner_id = $1 OR p.created_by_id = $1 OR EXISTS (
           SELECT 1 FROM organization_users ou
           WHERE ou.user_id = $1 AND ou.organization_id = $2
         ))
       ORDER BY last_accessed_at DESC NULLS LAST, p.updated_at DESC
       LIMIT 20`,
      [userId, organizationId]
    );

    return result.rows.map((p: any) => {
      const meta = p.metadata || {};
      return {
        id: p.id,
        name: p.name,
        // 2026-10-15: an unrecorded type read 'IND' (detectActiveModule then chose
        // the IND module) and NULL progress read 0. Unrecorded is null.
        submissionType: meta.submissionType || meta.submission_type || null,
        status: p.status,
        progress: p.progress ?? null,
        phase: meta.phase || meta.clinicalPhase || null,
        therapeuticArea: meta.therapeuticArea || meta.therapeutic_area || null,
        role: p.user_role,
        lastAccessedAt: p.last_accessed_at?.toISOString() || null,
      };
    });
  } catch (error) {
    logger.warn('Failed to load projects', { error });
    throw error;
  }
}

/**
 * Load the user's current active work session (if any).
 */
async function loadCurrentSession(userId: number, organizationId: number): Promise<WorkSession | null> {
  try {
    // Project-name resolution is org-scoped so a session row can never
    // surface another org's project name. 2026-10-15: the session rows were
    // not, so a user in two organizations had the other one's open work
    // (title, reference, project id) as this one's current session.
    const result = await pool.query(
      `SELECT uws.context_type, uws.context_reference, uws.context_title,
              uws.project_id, p.name as project_name,
              uws.started_at, uws.last_activity_at, uws.duration_minutes,
              uws.messages_sent, uws.artifacts_created
       FROM user_work_sessions uws
       LEFT JOIN projects p ON p.id = uws.project_id AND p.organization_id = $2
       WHERE uws.user_id = $1 AND uws.organization_id = $2 AND uws.session_type = 'active'
       ORDER BY uws.last_activity_at DESC
       LIMIT 1`,
      [userId, organizationId]
    );

    if (result.rows.length === 0) return null;

    const s = result.rows[0];
    return {
      contextType: s.context_type || 'general',
      contextReference: s.context_reference,
      contextTitle: s.context_title,
      projectId: s.project_id,
      projectName: s.project_name,
      startedAt: s.started_at?.toISOString(),
      lastActivityAt: s.last_activity_at?.toISOString(),
      durationMinutes: s.duration_minutes,
      messagesSent: s.messages_sent || 0,
      artifactsCreated: s.artifacts_created || 0,
    };
  } catch (error) {
    logger.warn('Failed to load current session', { error });
    throw error;
  }
}

/**
 * Load recent completed work sessions.
 */
async function loadRecentSessions(userId: number, organizationId: number): Promise<WorkSession[]> {
  try {
    // Project-name resolution and the session rows are both org-scoped
    // (the rows since 2026-10-15; see loadCurrentSession).
    const result = await pool.query(
      `SELECT uws.context_type, uws.context_reference, uws.context_title,
              uws.project_id, p.name as project_name,
              uws.started_at, uws.last_activity_at, uws.duration_minutes,
              uws.messages_sent, uws.artifacts_created
       FROM user_work_sessions uws
       LEFT JOIN projects p ON p.id = uws.project_id AND p.organization_id = $2
       WHERE uws.user_id = $1 AND uws.organization_id = $2 AND uws.session_type = 'completed'
       ORDER BY uws.last_activity_at DESC
       LIMIT 5`,
      [userId, organizationId]
    );

    return result.rows.map((s: any) => ({
      contextType: s.context_type || 'general',
      contextReference: s.context_reference,
      contextTitle: s.context_title,
      projectId: s.project_id,
      projectName: s.project_name,
      startedAt: s.started_at?.toISOString(),
      lastActivityAt: s.last_activity_at?.toISOString(),
      durationMinutes: s.duration_minutes,
      messagesSent: s.messages_sent || 0,
      artifactsCreated: s.artifacts_created || 0,
    }));
  } catch (error) {
    logger.warn('Failed to load recent sessions', { error });
    throw error;
  }
}

/**
 * Load the user's AI-recommended work queue.
 */
async function loadWorkQueue(userId: number, organizationId: number): Promise<WorkQueueItem[]> {
  try {
    // 2026-10-15: the project join was unscoped. POST /work-queue/add stores the
    // body's projectId as given, so an item naming another organization's
    // project id came back with that project's name.
    const result = await pool.query(
      `SELECT uwq.id, uwq.task_type, uwq.task_title, uwq.task_description,
              uwq.priority, uwq.reference_type, uwq.reference_id,
              uwq.project_id, p.name as project_name,
              uwq.due_date, uwq.estimated_minutes, uwq.source, uwq.ai_reasoning
       FROM user_work_queue uwq
       LEFT JOIN projects p ON p.id = uwq.project_id AND p.organization_id = $2
       WHERE uwq.user_id = $1 AND uwq.organization_id = $2
         AND uwq.status = 'pending'
       ORDER BY uwq.priority ASC, uwq.due_date ASC NULLS LAST
       LIMIT 10`,
      [userId, organizationId]
    );

    return result.rows.map((q: any) => ({
      id: q.id,
      taskType: q.task_type,
      taskTitle: q.task_title,
      taskDescription: q.task_description,
      priority: q.priority,
      referenceType: q.reference_type,
      referenceId: q.reference_id,
      projectId: q.project_id,
      projectName: q.project_name,
      dueDate: q.due_date?.toISOString() || null,
      estimatedMinutes: q.estimated_minutes,
      source: q.source,
      aiReasoning: q.ai_reasoning,
    }));
  } catch (error) {
    logger.warn('Failed to load work queue', { error });
    throw error;
  }
}

/**
 * Load recent activity feed for the user.
 */
async function loadRecentActivity(
  userId: number,
  organizationId: number
): Promise<RecentActivity[]> {
  try {
    // 2026-10-15: the project join was unscoped, so an activity row naming
    // another organization's project id came back with that project's name.
    const result = await pool.query(
      `SELECT af.action, af.entity_type, af.entity_name, af.description,
              af.created_at,
              p.name as project_name
       FROM activity_feed af
       LEFT JOIN projects p ON p.organization_id = $2 AND p.id = CASE
         WHEN af.entity_type = $3 THEN CAST(af.entity_id AS INTEGER)
         ELSE NULL
       END
       WHERE af.user_id = $1 AND af.organization_id = $2
       ORDER BY af.created_at DESC
       LIMIT 10`,
      [userId, organizationId, 'project']
    );

    return result.rows.map((a: any) => ({
      action: a.action,
      entityType: a.entity_type,
      entityName: a.entity_name,
      description: a.description,
      projectName: a.project_name,
      createdAt: a.created_at?.toISOString(),
    }));
  } catch (error) {
    logger.warn('Failed to load activity', { error });
    throw error;
  }
}

/**
 * Load conversation memory — summarized AI interaction history.
 */
async function loadConversationMemory(
  userId: number,
  organizationId: number
): Promise<UserIntelligence['conversationMemory']> {
  try {
    const [countsResult, lastTopicsResult, frequentTopicsResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(DISTINCT cc.id) as total_conversations,
           COUNT(cm.id) as total_messages
         FROM concept2cure_conversations cc
         LEFT JOIN concept2cure_messages cm ON cm.conversation_id = cc.id AND cm.role = 'user'
         WHERE cc.organization_id = $1 AND cc.created_by_id = $2`,
        [organizationId, userId]
      ),
      pool.query(
        `SELECT LEFT(cm.content, 120) as topic
         FROM concept2cure_messages cm
         JOIN concept2cure_conversations cc ON cm.conversation_id = cc.id
         WHERE cc.organization_id = $1 AND cc.created_by_id = $2 AND cm.role = 'user'
         ORDER BY cm.created_at DESC
         LIMIT 5`,
        [organizationId, userId]
      ),
      // Frequent topics: extract first sentence/question from user messages, group by similarity
      pool.query(
        `SELECT LEFT(cm.content, 60) as topic, COUNT(*) as cnt
         FROM concept2cure_messages cm
         JOIN concept2cure_conversations cc ON cm.conversation_id = cc.id
         WHERE cc.organization_id = $1 AND cc.created_by_id = $2 AND cm.role = 'user'
         GROUP BY LEFT(cm.content, 60)
         ORDER BY cnt DESC
         LIMIT 5`,
        [organizationId, userId]
      ),
    ]);

    const counts = countsResult.rows[0] || { total_conversations: 0, total_messages: 0 };

    return {
      totalConversations: parseInt(counts.total_conversations, 10) || 0,
      totalMessages: parseInt(counts.total_messages, 10) || 0,
      lastTopics: lastTopicsResult.rows.map((r: any) => r.topic),
      frequentTopics: frequentTopicsResult.rows.map((r: any) => r.topic),
    };
  } catch (error) {
    logger.warn('Failed to load conversation memory', { error });
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN INTELLIGENCE LOADER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load complete user intelligence — everything AnA 1.0 RI needs to be a
 * personalized, context-aware assistant.
 *
 * All sub-queries run in parallel and fail independently, so partial
 * intelligence is still valuable — and a facet whose read failed is null and
 * named in `unread`. A failed identity read fails the whole load: without it
 * there is no user to describe, and it is not "user not found" (null).
 */
export async function loadUserIntelligence(params: {
  userId: number;
  organizationId: number;
  activeProjectId?: number;
}): Promise<UserIntelligence | null> {
  const { userId, organizationId, activeProjectId } = params;

  /* 2026-10-15: each loader caught its own error to null, [] or zero counts,
     and a failed organization read became an invented 'Unknown Organization'
     ('biotech', 'standard', 5 users, 10 projects) — so a failed read was
     indistinguishable from an empty one. */
  const unread: string[] = [];
  const facet = <T>(name: string, load: Promise<T>): Promise<T | null> =>
    load.catch(() => {
      unread.push(name); // the loader has logged the error
      return null;
    });

  const [
    identity,
    organization,
    projects,
    currentSession,
    recentSessions,
    workQueue,
    recentActivity,
    conversationMemory,
  ] = await Promise.all([
    loadUserIdentity(userId, organizationId),
    facet('organization profile', loadOrganizationProfile(organizationId)),
    facet('user projects', loadUserProjects(userId, organizationId)),
    facet('current work session', loadCurrentSession(userId, organizationId)),
    facet('recent work sessions', loadRecentSessions(userId, organizationId)),
    facet('work queue', loadWorkQueue(userId, organizationId)),
    facet('recent activity', loadRecentActivity(userId, organizationId)),
    facet('conversation memory', loadConversationMemory(userId, organizationId)),
  ]);

  if (!identity) return null;

  // Determine active project
  const readProjects = projects ?? [];
  let activeProject: ProjectSummary | null = null;
  if (activeProjectId) {
    activeProject = readProjects.find(p => p.id === activeProjectId) || null;
  } else if (currentSession?.projectId) {
    activeProject = readProjects.find(p => p.id === currentSession.projectId) || null;
  } else if (readProjects.length > 0) {
    activeProject = readProjects[0]; // Most recently accessed
  }

  return {
    identity,
    organizationId,
    organization,
    projects,
    activeProject,
    currentSession,
    recentSessions,
    workQueue,
    recentActivity,
    conversationMemory,
    unread: [...unread].sort(),
    timestamp: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT — Track what users are doing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Start or update a work session for a user.
 * Called automatically when user interacts with the platform.
 */
export async function touchWorkSession(params: {
  userId: number;
  organizationId: number;
  projectId?: number;
  contextType?: string;
  contextReference?: string;
  contextTitle?: string;
}): Promise<number | null> {
  const { userId, organizationId, projectId, contextType, contextReference, contextTitle } = params;

  try {
    // The user's active session in THIS organization. 2026-10-15: it was found
    // across organizations, so a turn in one closed or bumped (and could retitle)
    // the session open in another.
    const existingResult = await pool.query(
      `SELECT id, project_id, context_type FROM user_work_sessions
       WHERE user_id = $1 AND organization_id = $2 AND session_type = 'active'
       ORDER BY last_activity_at DESC LIMIT 1`,
      [userId, organizationId]
    );

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      const isSameContext =
        existing.project_id === (projectId || null) &&
        existing.context_type === (contextType || existing.context_type);

      if (isSameContext) {
        // Same context — just bump activity
        await pool.query(
          `UPDATE user_work_sessions SET
            last_activity_at = NOW(),
            messages_sent = messages_sent + 1,
            context_reference = COALESCE($2, context_reference),
            context_title = COALESCE($3, context_title)
           WHERE id = $1`,
          [existing.id, contextReference, contextTitle]
        );
        return existing.id;
      } else {
        // Different context — close old session, open new
        await pool.query(
          `UPDATE user_work_sessions SET
            session_type = 'completed',
            ended_at = NOW()
           WHERE id = $1`,
          [existing.id]
        );
      }
    }

    // Create new session
    const insertResult = await pool.query(
      `INSERT INTO user_work_sessions
        (user_id, organization_id, project_id, context_type, context_reference, context_title)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        userId,
        organizationId,
        projectId || null,
        contextType || 'general',
        contextReference || null,
        contextTitle || null,
      ]
    );

    return insertResult.rows[0]?.id || null;
  } catch (error) {
    logger.warn('Failed to touch session', { error });
    return null;
  }
}

// recordArtifactCreation was deleted 2026-10-15: it had no caller, and it bumped
// the user's active session in every organization (no organization predicate).

// ═══════════════════════════════════════════════════════════════════════════════
// WORK QUEUE MANAGEMENT — AI-recommended actions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Where a queued item came from. 'manual' is a person's; the others are the
 * rule that derived it from section status (generateWorkRecommendations).
 * 'ai' is not written any more: nothing here asks a model (2026-10-15).
 */
export type WorkQueueSource = 'manual' | 'deadline' | 'review_request' | 'sequence';

/**
 * Add a task to a user's work queue.
 *
 * A failed insert used to log at warn and return null, and POST
 * /work-queue/add answered 200 with { id: null }; it throws now. The
 * ai_confidence column is written NULL: no model scored these items.
 */
export async function addToWorkQueue(params: {
  userId: number;
  organizationId: number;
  projectId?: number;
  taskType: string;
  taskTitle: string;
  taskDescription?: string;
  priority?: number;
  referenceType?: string;
  referenceId?: string;
  dueDate?: Date;
  estimatedMinutes?: number;
  source: WorkQueueSource;
  /** Why the item is queued, in terms of the record it was derived from. */
  aiReasoning?: string;
}): Promise<number> {
  const result = await pool.query(
    `INSERT INTO user_work_queue
      (user_id, organization_id, project_id, task_type, task_title, task_description,
       priority, reference_type, reference_id, due_date, estimated_minutes,
       source, ai_confidence, ai_reasoning)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, $13)
     RETURNING id`,
    [
      params.userId,
      params.organizationId,
      params.projectId || null,
      params.taskType,
      params.taskTitle,
      params.taskDescription || null,
      params.priority || 50,
      params.referenceType || null,
      params.referenceId || null,
      params.dueDate || null,
      params.estimatedMinutes || null,
      params.source,
      params.aiReasoning || null,
    ]
  );
  const id = result.rows[0]?.id;
  if (id == null) throw new Error('The work-queue item was not recorded.');
  return Number(id);
}

/**
 * Auto-generate work queue items based on project state.
 * This analyzes what sections need work, what's overdue, etc.
 */
export async function generateWorkRecommendations(params: {
  userId: number;
  organizationId: number;
  projectId: number;
}): Promise<void> {
  const { userId, organizationId, projectId } = params;

  try {
    // Find sections that are not_started or stalled. 2026-10-15: this selected
    // ps.assigned_to_id and ordered by ps.sort_order; project_sections
    // (20260220_ind_section_tracking.sql) has assigned_to and no sort_order, so
    // every regeneration threw. Ordered by module, then section code.
    const sectionsResult = await pool.query(
      `SELECT ps.section_code, ps.title, ps.status, ps.deadline, ps.assigned_to,
              ps.module
       FROM project_sections ps
       WHERE ps.project_id = $1 AND ps.organization_id = $2
         AND ps.status NOT IN ('approved', 'locked')
       ORDER BY ps.module, ps.section_code`,
      [projectId, organizationId]
    );

    // Find overdue items
    const overdueItems = sectionsResult.rows.filter(
      (s: any) =>
        s.deadline &&
        new Date(s.deadline) < new Date() &&
        s.status !== 'approved' &&
        s.status !== 'locked'
    );

    // Find not-started items assigned to this user
    const myNotStarted = sectionsResult.rows.filter(
      (s: any) => s.status === 'not_started' && (s.assigned_to === userId || !s.assigned_to)
    );

    // Find items in review that might need attention
    const inReview = sectionsResult.rows.filter(
      (s: any) => s.status === 'internal_review' || s.status === 'qc_review'
    );

    /* Every item below is derived by rule from the sections' recorded status
       and deadline. They were written as source 'ai' with constant
       confidences (0.95 / 0.85 / 0.75) and reasons nothing checked —
       "Blocking downstream sections from proceeding" with no dependency
       looked at — and lumen-context-builder put those reasons in AnA's
       prompt. Each now carries the rule that produced it and the facts it
       read (2026-10-15). Old 'ai' rows are cleared with the rule's own — in this
       organization only: until 2026-10-15 the DELETE named none, so a
       regeneration here deleted the user's rows naming this project id in every
       organization. */
    await pool.query(
      `DELETE FROM user_work_queue
       WHERE user_id = $1 AND project_id = $2 AND organization_id = $3
         AND source IN ('ai', 'deadline', 'review_request', 'sequence')
         AND status = 'pending'`,
      [userId, projectId, organizationId]
    );

    let priority = 1;

    for (const item of overdueItems.slice(0, 3)) {
      await addToWorkQueue({
        userId,
        organizationId,
        projectId,
        taskType: 'draft_section',
        taskTitle: `OVERDUE: Complete ${item.title || item.section_code}`,
        taskDescription: `Section ${item.section_code} (Module ${item.module}) was due ${new Date(item.deadline).toLocaleDateString()} and is currently "${item.status}".`,
        priority: priority++,
        referenceType: 'section',
        referenceId: item.section_code,
        dueDate: item.deadline,
        source: 'deadline',
        aiReasoning: `Past its deadline (${new Date(item.deadline).toISOString().slice(0, 10)}) and still "${item.status}".`,
      });
    }

    for (const item of inReview.slice(0, 2)) {
      const stage = item.status === 'internal_review' ? 'internal' : 'QC';
      await addToWorkQueue({
        userId,
        organizationId,
        projectId,
        taskType: 'review_document',
        taskTitle: `Review: ${item.title || item.section_code}`,
        taskDescription: `Section ${item.section_code} is awaiting ${stage} review.`,
        priority: priority++,
        referenceType: 'section',
        referenceId: item.section_code,
        source: 'review_request',
        aiReasoning: `Awaiting ${stage} review.`,
      });
    }

    for (const item of myNotStarted.slice(0, 5)) {
      await addToWorkQueue({
        userId,
        organizationId,
        projectId,
        taskType: 'draft_section',
        taskTitle: `Draft: ${item.title || item.section_code}`,
        taskDescription: `Module ${item.module} section ${item.section_code} has not been started yet.`,
        priority: priority++,
        referenceType: 'section',
        referenceId: item.section_code,
        source: 'sequence',
        aiReasoning: `Not started and ${item.assigned_to === userId ? 'assigned to you' : 'unassigned'}; listed in Module ${item.module} order.`,
      });
    }
  } catch (error) {
    // A regeneration that failed is reported, not served as the queue.
    logger.warn('Failed to generate recommendations', { error });
    throw error;
  }
}

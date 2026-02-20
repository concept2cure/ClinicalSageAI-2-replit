/**
 * @fileoverview User Intelligence Service
 * @module server/services/user-intelligence
 * @version 1.0.0
 *
 * @description
 * The brain behind personalized AI interactions. Loads comprehensive user
 * context for Lumen Cortex so the AI knows:
 * - Who the user is (name, title, department, expertise)
 * - What they're working on right now
 * - What they last worked on
 * - What they should work on next
 * - Their communication preferences
 * - Their org's license/tier and enabled modules
 * - Cross-project awareness of all their work
 *
 * This is the service that transforms Lumen from a generic chatbot into
 * a personalized regulatory intelligence partner.
 *
 * @compliance FDA 21 CFR Part 11 — all context reads are non-mutating
 */

import { pool } from '../db.js';

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
  greetingName: string; // How Lumen addresses them (from prefs or parsed name)
  role: string; // admin, manager, member, viewer
  expertiseLevel: string; // novice, intermediate, expert
  communicationStyle: string; // concise, detailed, academic
  focusAreas: string[]; // ["CMC", "nonclinical", "clinical"]
  lastLogin: string | null;
}

export interface OrganizationProfile {
  id: number;
  name: string;
  slug: string;
  industryMode: string; // biotech, pharma, cro, medtech, academic
  tier: string; // free, standard, professional, enterprise
  maxUsers: number;
  maxProjects: number;
  enabledModules: string[]; // from module_subscriptions
  settings: Record<string, any>;
}

export interface ProjectSummary {
  id: number;
  name: string;
  submissionType: string;
  status: string;
  progress: number;
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

export interface UserIntelligence {
  identity: UserIdentity;
  organization: OrganizationProfile;
  projects: ProjectSummary[]; // all user's projects across the org
  activeProject: ProjectSummary | null;
  currentSession: WorkSession | null; // what they're doing right now
  recentSessions: WorkSession[]; // last 5 work sessions
  workQueue: WorkQueueItem[]; // AI-recommended next tasks
  recentActivity: RecentActivity[]; // last 10 activities
  conversationMemory: {
    // summary of past AI interactions
    totalConversations: number;
    totalMessages: number;
    lastTopics: string[]; // last 5 things they asked about
    frequentTopics: string[]; // most common query themes
  };
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
              COALESCE(ou.role, 'member') as org_role
       FROM users u
       LEFT JOIN organization_users ou ON ou.user_id = u.id AND ou.organization_id = $2
       WHERE u.id = $1
       LIMIT 1`,
      [userId, organizationId]
    );

    if (result.rows.length === 0) return null;

    const u = result.rows[0];
    const prefs = u.preferences || {};

    // Parse greeting name: preference > first name from "name" field
    const greetingName =
      prefs.greeting_name ||
      (u.title ? `${u.title.split(' ')[0]} ${u.name.split(' ').pop()}` : u.name.split(' ')[0]);

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      title: u.title,
      department: u.department,
      bio: u.bio,
      avatar: u.avatar,
      greetingName,
      role: u.org_role || 'member',
      expertiseLevel: prefs.expertise_level || 'intermediate',
      communicationStyle: prefs.communication_style || 'professional',
      focusAreas: prefs.focus_areas || [],
      lastLogin: u.last_login?.toISOString() || null,
    };
  } catch (error) {
    console.warn('[UserIntelligence] Failed to load identity:', error);
    return null;
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
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      industryMode: o.industry_mode || 'biotech',
      tier: o.tier || 'standard',
      maxUsers: o.max_users || 5,
      maxProjects: o.max_projects || 10,
      enabledModules: modulesResult.rows.map((r: any) => r.module_id),
      settings: o.settings || {},
    };
  } catch (error) {
    console.warn('[UserIntelligence] Failed to load org profile:', error);
    return null;
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
        submissionType: meta.submissionType || meta.submission_type || 'IND',
        status: p.status,
        progress: p.progress || 0,
        phase: meta.phase || meta.clinicalPhase || null,
        therapeuticArea: meta.therapeuticArea || meta.therapeutic_area || null,
        role: p.user_role,
        lastAccessedAt: p.last_accessed_at?.toISOString() || null,
      };
    });
  } catch (error) {
    console.warn('[UserIntelligence] Failed to load projects:', error);
    return [];
  }
}

/**
 * Load the user's current active work session (if any).
 */
async function loadCurrentSession(userId: number): Promise<WorkSession | null> {
  try {
    const result = await pool.query(
      `SELECT uws.context_type, uws.context_reference, uws.context_title,
              uws.project_id, p.name as project_name,
              uws.started_at, uws.last_activity_at, uws.duration_minutes,
              uws.messages_sent, uws.artifacts_created
       FROM user_work_sessions uws
       LEFT JOIN projects p ON p.id = uws.project_id
       WHERE uws.user_id = $1 AND uws.session_type = 'active'
       ORDER BY uws.last_activity_at DESC
       LIMIT 1`,
      [userId]
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
    console.warn('[UserIntelligence] Failed to load current session:', error);
    return null;
  }
}

/**
 * Load recent completed work sessions.
 */
async function loadRecentSessions(userId: number): Promise<WorkSession[]> {
  try {
    const result = await pool.query(
      `SELECT uws.context_type, uws.context_reference, uws.context_title,
              uws.project_id, p.name as project_name,
              uws.started_at, uws.last_activity_at, uws.duration_minutes,
              uws.messages_sent, uws.artifacts_created
       FROM user_work_sessions uws
       LEFT JOIN projects p ON p.id = uws.project_id
       WHERE uws.user_id = $1 AND uws.session_type = 'completed'
       ORDER BY uws.last_activity_at DESC
       LIMIT 5`,
      [userId]
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
    console.warn('[UserIntelligence] Failed to load recent sessions:', error);
    return [];
  }
}

/**
 * Load the user's AI-recommended work queue.
 */
async function loadWorkQueue(userId: number, organizationId: number): Promise<WorkQueueItem[]> {
  try {
    const result = await pool.query(
      `SELECT uwq.id, uwq.task_type, uwq.task_title, uwq.task_description,
              uwq.priority, uwq.reference_type, uwq.reference_id,
              uwq.project_id, p.name as project_name,
              uwq.due_date, uwq.estimated_minutes, uwq.source, uwq.ai_reasoning
       FROM user_work_queue uwq
       LEFT JOIN projects p ON p.id = uwq.project_id
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
    console.warn('[UserIntelligence] Failed to load work queue:', error);
    return [];
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
    const result = await pool.query(
      `SELECT af.action, af.entity_type, af.entity_name, af.description,
              af.created_at,
              p.name as project_name
       FROM activity_feed af
       LEFT JOIN projects p ON p.id = CASE
         WHEN af.entity_type = 'project' THEN CAST(af.entity_id AS INTEGER)
         ELSE NULL
       END
       WHERE af.user_id = $1 AND af.organization_id = $2
       ORDER BY af.created_at DESC
       LIMIT 10`,
      [userId, organizationId]
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
    console.warn('[UserIntelligence] Failed to load activity:', error);
    return [];
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
    console.warn('[UserIntelligence] Failed to load conversation memory:', error);
    return { totalConversations: 0, totalMessages: 0, lastTopics: [], frequentTopics: [] };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN INTELLIGENCE LOADER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load complete user intelligence — everything Lumen needs to be a
 * personalized, context-aware assistant.
 *
 * All sub-queries run in parallel and fail independently, so partial
 * intelligence is still valuable.
 */
export async function loadUserIntelligence(params: {
  userId: number;
  organizationId: number;
  activeProjectId?: number;
}): Promise<UserIntelligence | null> {
  const { userId, organizationId, activeProjectId } = params;

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
    loadOrganizationProfile(organizationId),
    loadUserProjects(userId, organizationId),
    loadCurrentSession(userId),
    loadRecentSessions(userId),
    loadWorkQueue(userId, organizationId),
    loadRecentActivity(userId, organizationId),
    loadConversationMemory(userId, organizationId),
  ]);

  if (!identity) return null;

  // Determine active project
  let activeProject: ProjectSummary | null = null;
  if (activeProjectId) {
    activeProject = projects.find(p => p.id === activeProjectId) || null;
  } else if (currentSession?.projectId) {
    activeProject = projects.find(p => p.id === currentSession.projectId) || null;
  } else if (projects.length > 0) {
    activeProject = projects[0]; // Most recently accessed
  }

  return {
    identity,
    organization: organization || {
      id: organizationId,
      name: 'Unknown Organization',
      slug: 'unknown',
      industryMode: 'biotech',
      tier: 'standard',
      maxUsers: 5,
      maxProjects: 10,
      enabledModules: [],
      settings: {},
    },
    projects,
    activeProject,
    currentSession,
    recentSessions,
    workQueue,
    recentActivity,
    conversationMemory,
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
    // Try to find an active session for this user
    const existingResult = await pool.query(
      `SELECT id, project_id, context_type FROM user_work_sessions
       WHERE user_id = $1 AND session_type = 'active'
       ORDER BY last_activity_at DESC LIMIT 1`,
      [userId]
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
    console.warn('[UserIntelligence] Failed to touch session:', error);
    return null;
  }
}

/**
 * Record that user created an artifact during their session.
 */
export async function recordArtifactCreation(userId: number): Promise<void> {
  try {
    await pool.query(
      `UPDATE user_work_sessions SET
        artifacts_created = artifacts_created + 1,
        last_activity_at = NOW()
       WHERE user_id = $1 AND session_type = 'active'`,
      [userId]
    );
  } catch {
    // Non-critical
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORK QUEUE MANAGEMENT — AI-recommended actions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Add an AI-recommended task to a user's work queue.
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
  source?: string;
  aiConfidence?: number;
  aiReasoning?: string;
}): Promise<number | null> {
  try {
    const result = await pool.query(
      `INSERT INTO user_work_queue
        (user_id, organization_id, project_id, task_type, task_title, task_description,
         priority, reference_type, reference_id, due_date, estimated_minutes,
         source, ai_confidence, ai_reasoning)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
        params.source || 'ai',
        params.aiConfidence || null,
        params.aiReasoning || null,
      ]
    );
    return result.rows[0]?.id || null;
  } catch (error) {
    console.warn('[UserIntelligence] Failed to add to queue:', error);
    return null;
  }
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
    // Find sections that are not_started or stalled
    const sectionsResult = await pool.query(
      `SELECT ps.section_code, ps.title, ps.status, ps.deadline, ps.assigned_to_id,
              ps.module
       FROM project_sections ps
       WHERE ps.project_id = $1 AND ps.organization_id = $2
         AND ps.status NOT IN ('approved', 'locked')
       ORDER BY
         CASE ps.module
           WHEN '1' THEN 1 WHEN '2' THEN 2 WHEN '3' THEN 3
           WHEN '4' THEN 4 WHEN '5' THEN 5 ELSE 6
         END,
         ps.sort_order`,
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
      (s: any) => s.status === 'not_started' && (s.assigned_to_id === userId || !s.assigned_to_id)
    );

    // Find items in review that might need attention
    const inReview = sectionsResult.rows.filter(
      (s: any) => s.status === 'internal_review' || s.status === 'qc_review'
    );

    // Clear old AI recommendations for this project
    await pool.query(
      `DELETE FROM user_work_queue
       WHERE user_id = $1 AND project_id = $2 AND source = 'ai'
         AND status = 'pending'`,
      [userId, projectId]
    );

    // Generate new recommendations
    let priority = 1;

    // Overdue items are highest priority
    for (const item of overdueItems.slice(0, 3)) {
      await addToWorkQueue({
        userId,
        organizationId,
        projectId,
        taskType: 'draft_section',
        taskTitle: `OVERDUE: Complete ${item.title || item.section_code}`,
        taskDescription: `Section ${item.section_code} (Module ${item.module}) was due ${new Date(item.deadline).toLocaleDateString()} and is currently "${item.status}". This needs immediate attention.`,
        priority: priority++,
        referenceType: 'section',
        referenceId: item.section_code,
        dueDate: item.deadline,
        source: 'ai',
        aiConfidence: 0.95,
        aiReasoning: 'Section is past deadline — regulatory timeline at risk',
      });
    }

    // Items needing review
    for (const item of inReview.slice(0, 2)) {
      await addToWorkQueue({
        userId,
        organizationId,
        projectId,
        taskType: 'review_document',
        taskTitle: `Review: ${item.title || item.section_code}`,
        taskDescription: `Section ${item.section_code} is awaiting ${item.status === 'internal_review' ? 'internal' : 'QC'} review.`,
        priority: priority++,
        referenceType: 'section',
        referenceId: item.section_code,
        source: 'ai',
        aiConfidence: 0.85,
        aiReasoning: 'Blocking downstream sections from proceeding',
      });
    }

    // Not-started items in logical order
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
        source: 'ai',
        aiConfidence: 0.75,
        aiReasoning: `Follows CTD Module ${item.module} authoring sequence`,
      });
    }
  } catch (error) {
    console.warn('[UserIntelligence] Failed to generate recommendations:', error);
  }
}

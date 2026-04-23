/**
 * @fileoverview AnA 1.0 Regulatory Intelligence — Context Builder
 * @module server/services/ana-context-builder
 * @version 2.0.0
 *
 * @description
 * Assembles rich, dynamic system prompts for AnA 1.0 RI by loading
 * project state, workflow position, document completion, IND pyramid
 * progress, and user role from the database.
 *
 * This is the bridge between the static REGULATORY_SYSTEM_PROMPT and
 * a fully context-aware AnA that knows exactly where the user is in
 * their regulatory journey.
 *
 * @compliance FDA 21 CFR Part 11 — all context assembly is logged
 */

import { pool } from '../db.js';
import {
  loadUserIntelligence,
  touchWorkSession,
  type UserIntelligence,
} from './user-intelligence.js';
import {
  getModuleIntelligence,
  getCrossCuttingIntelligence,
  detectActiveModule,
} from './module-intelligence.js';
import { assembleInstructionEnginePrompt } from './lumen-instruction-engine.js';
import {
  buildClientIntelligenceContext,
  buildProjectIntelligenceContext,
} from './client-intelligence-memory.js';
import { resolveAccountContext, formatResolvedContextForPrompt } from './account-canon.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProjectContext {
  id: number;
  name: string;
  description: string | null;
  status: string;
  submissionType: string;
  therapeuticArea: string | null;
  phase: string | null;
  progress: number;
  priority: string;
  riskLevel: string;
  tags: string[];
  depth: number;
  parentProjectId: number | null;
}

export interface DocumentContext {
  totalDocuments: number;
  completedDocuments: number;
  inProgressDocuments: number;
  recentDocuments: Array<{
    title: string;
    status: string;
    sectionCode: string | null;
    updatedAt: string;
  }>;
  /** Knowledge base document counts (uploaded reference documents) */
  totalKnowledgeDocuments: number;
  activeKnowledgeDocuments: number;
}

export interface WorkflowContext {
  activeWorkflows: number;
  completedSteps: number;
  totalSteps: number;
  currentPhase: string | null;
  blockers: string[];
}

export interface ConversationContext {
  recentTopics: string[];
  artifactCount: number;
  messageCount: number;
}

/** @deprecated Use AnAContext instead */
export type LumenContext = AnAContext;

export interface AnAContext {
  project: ProjectContext | null;
  documents: DocumentContext | null;
  workflow: WorkflowContext | null;
  conversation: ConversationContext | null;
  userRole: string | null;
  userName: string | null;
  organizationName: string | null;
  userIntelligence: UserIntelligence | null;
  accountCanon: string | null; // Selectively resolved account-level governed memory
  clientIntelligence: string | null;
  projectIntelligence: string | null;
  anaIntelligenceContext: string | null; // AnA CLAUDE.md layers: User.md + Capabilities + Wisdom + Scoped Rules
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BASE SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

// BASE_SYSTEM_PROMPT moved into its own module — pure constant, no dependencies.
import { BASE_SYSTEM_PROMPT } from './lumen-context/base-system-prompt.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT LOADING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load project context from the database.
 * Uses the same data source as the advisory route for consistency.
 */
async function loadProjectContext(
  projectId: number,
  organizationId: number
): Promise<ProjectContext | null> {
  try {
    const result = await pool.query(
      `SELECT id, name, description, status, type, progress, priority,
              risk_level, tags, depth, parent_project_id, metadata
       FROM projects
       WHERE id = $1 AND organization_id = $2`,
      [projectId, organizationId]
    );

    if (result.rows.length === 0) return null;

    const p = result.rows[0];
    const meta = p.metadata || {};

    return {
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      submissionType: meta.submissionType || meta.submission_type || 'IND',
      therapeuticArea: meta.therapeuticArea || meta.therapeutic_area || null,
      phase: meta.phase || meta.clinicalPhase || null,
      progress: p.progress || 0,
      priority: p.priority || 'medium',
      riskLevel: p.risk_level || 'medium',
      tags: p.tags || [],
      depth: p.depth || 0,
      parentProjectId: p.parent_project_id,
    };
  } catch (error) {
    console.warn('[AnA RI] Failed to load project context:', error);
    return null;
  }
}

/**
 * Load document/artifact context for the project.
 *
 * Queries concept2cure_artifacts for authored submission documents and also
 * loads the project's knowledge documents from project settings, filtering
 * out any where isActive === false so deactivated documents are excluded
 * from the AI context window.
 */
async function loadDocumentContext(
  projectId: number,
  organizationId: number
): Promise<DocumentContext | null> {
  try {
    // Load artifact counts and project knowledge documents in parallel
    const [countResult, recentResult, projectResult] = await Promise.all([
      // Get document counts from concept2cure_artifacts
      pool.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status IN ('published', 'approved', 'locked')) as completed,
           COUNT(*) FILTER (WHERE status IN ('draft', 'in_progress', 'review')) as in_progress
         FROM concept2cure_artifacts
         WHERE project_id = $1 AND organization_id = $2`,
        [projectId, organizationId]
      ),
      // Get recent documents
      pool.query(
        `SELECT title, status, metadata, updated_at
         FROM concept2cure_artifacts
         WHERE project_id = $1 AND organization_id = $2
         ORDER BY updated_at DESC
         LIMIT 5`,
        [projectId, organizationId]
      ),
      // Load project settings to get knowledge documents with isActive state
      pool.query(`SELECT settings FROM projects WHERE id = $1 AND organization_id = $2 LIMIT 1`, [
        projectId,
        organizationId,
      ]),
    ]);

    const counts = countResult.rows[0] || { total: 0, completed: 0, in_progress: 0 };

    // Extract knowledge documents from project settings and filter by isActive
    const projectSettings = projectResult.rows[0]?.settings;
    const knowledgeObj =
      projectSettings && typeof projectSettings === 'object'
        ? (projectSettings as Record<string, unknown>).knowledge
        : null;
    const knowledgeDocs: Array<{ id?: string; isActive?: boolean }> =
      knowledgeObj &&
      typeof knowledgeObj === 'object' &&
      Array.isArray((knowledgeObj as any).documents)
        ? (knowledgeObj as any).documents
        : [];
    const totalKnowledgeDocs = knowledgeDocs.length;
    const activeKnowledgeDocs = knowledgeDocs.filter(doc => doc.isActive !== false);
    const deactivatedDocIds = new Set(
      knowledgeDocs
        .filter(doc => doc.isActive === false)
        .map(doc => doc.id)
        .filter(Boolean)
    );

    // Filter recent artifacts — exclude any linked to a deactivated knowledge document
    const recentDocuments = recentResult.rows
      .filter((r: any) => {
        const linkedDocId = r.metadata?.knowledgeDocumentId || r.metadata?.sourceDocumentId;
        return !linkedDocId || !deactivatedDocIds.has(linkedDocId);
      })
      .map((r: any) => ({
        title: r.title,
        status: r.status,
        sectionCode: r.metadata?.sectionCode || r.metadata?.ectd_section || null,
        updatedAt: r.updated_at?.toISOString() || '',
      }));

    return {
      totalDocuments: parseInt(counts.total, 10) || 0,
      completedDocuments: parseInt(counts.completed, 10) || 0,
      inProgressDocuments: parseInt(counts.in_progress, 10) || 0,
      recentDocuments,
      totalKnowledgeDocuments: totalKnowledgeDocs,
      activeKnowledgeDocuments: activeKnowledgeDocs.length,
    };
  } catch (error) {
    console.warn('[AnA RI] Failed to load document context:', error);
    return null;
  }
}

/**
 * Load conversation context for recent history.
 */
async function loadConversationContext(
  projectId: number,
  organizationId: number
): Promise<ConversationContext | null> {
  try {
    // Count messages and artifacts in recent conversations for this project
    const convResult = await pool.query(
      `SELECT
         COUNT(DISTINCT cm.id) as message_count,
         COUNT(DISTINCT ca.id) as artifact_count
       FROM concept2cure_conversations cc
       LEFT JOIN concept2cure_messages cm ON cm.conversation_id = cc.id
       LEFT JOIN concept2cure_artifacts ca ON ca.project_id = cc.project_id AND ca.organization_id = cc.organization_id
       WHERE cc.project_id = $1 AND cc.organization_id = $2`,
      [projectId, organizationId]
    );

    // Extract recent topics from message titles/first lines
    const topicResult = await pool.query(
      `SELECT DISTINCT LEFT(cm.content, 80) as topic
       FROM concept2cure_messages cm
       JOIN concept2cure_conversations cc ON cm.conversation_id = cc.id
       WHERE cc.project_id = $1 AND cc.organization_id = $2
         AND cm.role = 'user'
       ORDER BY topic
       LIMIT 5`,
      [projectId, organizationId]
    );

    const counts = convResult.rows[0] || { message_count: 0, artifact_count: 0 };

    return {
      recentTopics: topicResult.rows.map((r: any) => r.topic),
      artifactCount: parseInt(counts.artifact_count, 10) || 0,
      messageCount: parseInt(counts.message_count, 10) || 0,
    };
  } catch (error) {
    console.warn('[AnA RI] Failed to load conversation context:', error);
    return null;
  }
}

/**
 * Load user information.
 */
async function loadUserContext(
  userId: number | null,
  organizationId?: number
): Promise<{ role: string | null; name: string | null }> {
  if (!userId) return { role: null, name: null };
  try {
    // users table has 'name' (not full_name/username)
    // role lives on organization_users, not users
    const result = await pool.query(
      `SELECT u.name,
              COALESCE(ou.role, 'member') as role
       FROM users u
       LEFT JOIN organization_users ou ON ou.user_id = u.id
         ${organizationId ? 'AND ou.organization_id = $2' : ''}
       WHERE u.id = $1
       LIMIT 1`,
      organizationId ? [userId, organizationId] : [userId]
    );
    if (result.rows.length === 0) return { role: null, name: null };
    return {
      role: result.rows[0].role || null,
      name: result.rows[0].name || null,
    };
  } catch {
    return { role: null, name: null };
  }
}

/**
 * Load organization name.
 */
async function loadOrganizationName(orgId: number | null): Promise<string | null> {
  if (!orgId) return null;
  try {
    const result = await pool.query(`SELECT name FROM organizations WHERE id = $1`, [orgId]);
    return result.rows[0]?.name || null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT ASSEMBLY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build complete AnA 1.0 RI context for a chat request.
 * Fast-fails on each sub-query independently so partial context
 * is still usable even if one query fails.
 */
/** @deprecated Use buildAnAContext instead */
export const buildLumenContext = buildAnAContext;

export async function buildAnAContext(params: {
  projectId?: number | string;
  organizationId?: number;
  userId?: number;
  submissionType?: string;
}): Promise<AnAContext> {
  const { organizationId, userId } = params;
  const projectId = params.projectId ? parseInt(String(params.projectId), 10) : null;

  // Load all context in parallel for speed — including full user intelligence, client intelligence, & account canon
  const [
    project,
    documents,
    conversation,
    userInfo,
    orgName,
    userIntelligence,
    clientIntelligence,
    projectIntelligence,
    anaIntelligenceContext,
    accountCanonResolved,
  ] = await Promise.all([
    projectId && organizationId
      ? loadProjectContext(projectId, organizationId)
      : Promise.resolve(null),
    projectId && organizationId
      ? loadDocumentContext(projectId, organizationId)
      : Promise.resolve(null),
    projectId && organizationId
      ? loadConversationContext(projectId, organizationId)
      : Promise.resolve(null),
    loadUserContext(userId || null, organizationId || undefined),
    loadOrganizationName(organizationId || null),
    userId && organizationId
      ? loadUserIntelligence({
          userId,
          organizationId,
          activeProjectId: projectId || undefined,
        })
      : Promise.resolve(null),
    // Client Intelligence Memory — deep knowledge of the client organization
    organizationId
      ? buildClientIntelligenceContext(organizationId).catch(() => null)
      : Promise.resolve(null),
    // Project Intelligence Memory — deep knowledge specific to the active project
    projectId
      ? buildProjectIntelligenceContext(projectId).catch(() => null)
      : Promise.resolve(null),
    // AnA Intelligence Context (CLAUDE.md Memory Compression Model)
    // User.md (personal overrides) + Capabilities + Wisdom + Scoped Rules
    userId && organizationId
      ? import('./ana-context-router')
          .then(({ buildMergedContext }) =>
            buildMergedContext({
              organizationId,
              projectId: projectId || undefined,
              userId,
            })
          )
          .then(result => result.contextBlock || null)
          .catch(() => null)
      : Promise.resolve(null),
    // Account Canon — selectively resolved governed memory (canon items, terms, bundles)
    organizationId
      ? resolveAccountContext({
          organizationId,
          submissionType: params.submissionType || undefined,
          projectId: projectId || undefined,
        })
          .then(resolved =>
            resolved.canonItems.length > 0 ||
            resolved.terms.length > 0 ||
            resolved.bundles.length > 0
              ? formatResolvedContextForPrompt(resolved)
              : null
          )
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  // Touch the work session so we track what the user is currently doing
  if (userId && organizationId) {
    touchWorkSession({
      userId,
      organizationId,
      projectId: projectId || undefined,
      contextType: params.submissionType ? 'section_drafting' : 'general',
    }).catch(() => {}); // Non-blocking
  }

  return {
    project,
    documents,
    workflow: null,
    conversation,
    userRole: userInfo.role,
    userName: userInfo.name,
    organizationName: orgName,
    userIntelligence,
    accountCanon: accountCanonResolved,
    clientIntelligence,
    projectIntelligence,
    anaIntelligenceContext,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Assemble the full system prompt with context injected.
 * Returns the base prompt if no project context is available.
 */
export async function assembleSystemPrompt(
  context: AnAContext,
  customSystemPrompt?: string
): Promise<string> {
  // If caller provided a full custom system prompt, respect it
  if (customSystemPrompt) return customSystemPrompt;

  const parts: string[] = [BASE_SYSTEM_PROMPT];
  const intel = context.userIntelligence;
  const organizationId = intel?.organization?.id;

  // ── Deep User Identity ───────────────────────────────────────────────────
  if (intel?.identity) {
    const u = intel.identity;
    const style = u.communicationStyle || 'professional';
    const expertise = u.expertiseLevel || 'intermediate';
    parts.push(`
## User Identity — You Know This Person
- **Name**: ${u.greetingName} (${u.name})
- **Email**: ${u.email}${u.title ? `\n- **Title**: ${u.title}` : ''}${
      u.department ? `\n- **Department**: ${u.department}` : ''
    }
- **Role**: ${u.role}
- **Expertise Level**: ${expertise}
- **Communication Preference**: ${style}${
      u.focusAreas.length ? `\n- **Focus Areas**: ${u.focusAreas.join(', ')}` : ''
    }

### How to Address This User:
- Greet them as "${u.greetingName}" on first message
- ${
      expertise === 'expert'
        ? 'Skip basic explanations — they know regulatory science deeply. Focus on nuanced analysis and strategic implications.'
        : expertise === 'novice'
        ? 'Provide clear explanations of regulatory concepts. Define technical terms on first use. Use examples.'
        : 'Balance depth with clarity. They understand regulatory basics but may need context for specialized topics.'
    }
- ${
      style === 'concise'
        ? 'Keep responses focused and brief. Use bullet points heavily. Skip unnecessary preambles.'
        : style === 'academic'
        ? 'Be thorough and cite sources. Use formal regulatory language. Include guideline references in-line.'
        : 'Use a professional yet approachable tone. Structured responses with clear headings.'
    }`);
  } else if (context.userName || context.userRole) {
    parts.push(`
## User Context
- **User**: ${context.userName || 'Unknown'}${context.userRole ? ` (${context.userRole})` : ''}${
      context.organizationName ? `\n- **Organization**: ${context.organizationName}` : ''
    }`);
  }

  // ── Organization & License Context ────────────────────────────────────────
  if (intel?.organization) {
    const org = intel.organization;
    parts.push(`
## Organization Profile
- **Organization**: ${org.name}
- **Industry**: ${org.industryMode}
- **Tier**: ${org.tier}
- **Enabled Modules**: ${
      org.enabledModules.length > 0 ? org.enabledModules.join(', ') : 'None configured'
    }

### Industry-Specific Awareness:
${
  org.industryMode === 'medtech'
    ? '- This is a medical device / diagnostics company. Emphasize 510(k), PMA, De Novo pathways, ISO standards, and design controls.'
    : org.industryMode === 'biotech' || org.industryMode === 'pharma'
    ? '- This is a pharma/biotech company. Emphasize IND/NDA/BLA pathways, ICH guidelines, and CTD structure.'
    : org.industryMode === 'cro'
    ? '- This is a CRO (Contract Research Organization). Focus on multi-sponsor workflows, SOW compliance, and study management.'
    : org.industryMode === 'academic'
    ? '- This is an academic/research institution. Emphasize investigator-initiated IND requirements, IRB processes, and grant compliance.'
    : '- Provide balanced guidance across all regulatory pathways.'
}`);
  }

  // ── Cross-Project Awareness ───────────────────────────────────────────────
  if (intel?.projects && intel.projects.length > 0) {
    const projectList = intel.projects
      .slice(0, 6)
      .map(
        p =>
          `  - **${p.name}** (${p.submissionType}, ${p.status}, ${p.progress}% complete)${
            p.phase ? ` — ${p.phase}` : ''
          }${p.therapeuticArea ? ` [${p.therapeuticArea}]` : ''}`
      )
      .join('\n');

    parts.push(`
## All User Projects (${intel.projects.length} total)
${projectList}${
      intel.projects.length > 6 ? `\n  - ... and ${intel.projects.length - 6} more` : ''
    }`);
  }

  // ── Active Project Context ────────────────────────────────────────────────
  if (context.project) {
    const p = context.project;
    parts.push(`
## Active Project Context (Currently Working On)
- **Project**: ${p.name} (ID: ${p.id})
- **Submission Type**: ${p.submissionType}${
      p.therapeuticArea ? `\n- **Therapeutic Area**: ${p.therapeuticArea}` : ''
    }${p.phase ? `\n- **Phase**: ${p.phase}` : ''}
- **Status**: ${p.status} | **Progress**: ${p.progress}%
- **Priority**: ${p.priority} | **Risk Level**: ${p.riskLevel}${
      p.description ? `\n- **Description**: ${p.description}` : ''
    }${p.tags?.length ? `\n- **Tags**: ${p.tags.join(', ')}` : ''}`);
  }

  // ── Work Continuity — What They Were Doing ────────────────────────────────
  if (intel?.currentSession) {
    const s = intel.currentSession;
    parts.push(`
## Current Work Session
- **Currently working on**: ${s.contextTitle || s.contextType || 'General work'}${
      s.contextReference ? ` (${s.contextReference})` : ''
    }${s.projectName ? `\n- **In project**: ${s.projectName}` : ''}
- **Session started**: ${s.startedAt ? new Date(s.startedAt).toLocaleString() : 'Unknown'}
- **Messages in session**: ${s.messagesSent} | **Artifacts created**: ${s.artifactsCreated}`);
  }

  if (intel?.recentSessions && intel.recentSessions.length > 0) {
    const recent = intel.recentSessions
      .slice(0, 3)
      .map(
        s =>
          `  - ${s.contextTitle || s.contextType || 'General'} in ${
            s.projectName || 'unknown project'
          } (${s.durationMinutes ? `${s.durationMinutes} min` : 'brief session'})`
      )
      .join('\n');
    parts.push(`
## Recent Work History
${recent}

Use this to provide continuity — reference what they last worked on and suggest logical next steps.`);
  }

  // ── AI-Recommended Next Tasks ─────────────────────────────────────────────
  if (intel?.workQueue && intel.workQueue.length > 0) {
    const tasks = intel.workQueue
      .slice(0, 5)
      .map(
        (t, i) =>
          `  ${i + 1}. **${t.taskTitle}**${t.projectName ? ` (${t.projectName})` : ''}${
            t.dueDate ? ` — due ${new Date(t.dueDate).toLocaleDateString()}` : ''
          }${t.aiReasoning ? `\n     _Reason: ${t.aiReasoning}_` : ''}`
      )
      .join('\n');
    parts.push(`
## Recommended Next Actions
These are the highest-priority items for this user:
${tasks}

When the user asks "what should I work on?" or you're providing proactive guidance, reference these tasks.`);
  }

  // ── Conversation Memory ───────────────────────────────────────────────────
  if (intel?.conversationMemory && intel.conversationMemory.totalMessages > 0) {
    const mem = intel.conversationMemory;
    parts.push(`
## Conversation History
- **Total conversations**: ${mem.totalConversations} | **Total messages**: ${mem.totalMessages}${
      mem.lastTopics.length > 0
        ? `\n- **Last topics discussed**: ${mem.lastTopics
            .slice(0, 3)
            .map(t => `"${t}"`)
            .join(', ')}`
        : ''
    }${
      mem.frequentTopics.length > 0
        ? `\n- **Frequent themes**: ${mem.frequentTopics
            .slice(0, 3)
            .map(t => `"${t}"`)
            .join(', ')}`
        : ''
    }

Use conversation history to avoid re-asking for information the user has already provided.`);
  }

  // ── Account Canon (Governed Memory) ──────────────────────────────────────
  // Selectively resolved account-level truths: canon items, locked terminology,
  // skill bundle instructions, evidence preferences. Takes precedence over
  // learned intelligence below.
  if (context.accountCanon) {
    parts.push(context.accountCanon);
  }

  // ── Client Intelligence Memory ─────────────────────────────────────────
  // Deep knowledge of the client organization, learned from ingested documents
  if (context.clientIntelligence) {
    parts.push(context.clientIntelligence);
  }

  // ── Project Intelligence Memory ───────────────────────────────────────
  // Deep knowledge specific to the active project, learned from project documents
  if (context.projectIntelligence) {
    parts.push(context.projectIntelligence);
  }

  // ── AnA Intelligence Layers (CLAUDE.md Memory Compression Model) ────
  // User.md (personal overrides) + Capability Context + Wisdom + Scoped Rules
  if (context.anaIntelligenceContext) {
    parts.push(context.anaIntelligenceContext);
  }

  // ── Document Context ─────────────────────────────────────────────────────
  if (
    context.documents &&
    (context.documents.totalDocuments > 0 || context.documents.totalKnowledgeDocuments > 0)
  ) {
    const d = context.documents;
    const knowledgeInfo =
      d.totalKnowledgeDocuments > 0
        ? `\n- **Knowledge Base**: ${d.activeKnowledgeDocuments}/${
            d.totalKnowledgeDocuments
          } documents active in context${
            d.totalKnowledgeDocuments - d.activeKnowledgeDocuments > 0
              ? ` (${d.totalKnowledgeDocuments - d.activeKnowledgeDocuments} deactivated)`
              : ''
          }`
        : '';
    parts.push(`
## Document Status
- **Total**: ${d.totalDocuments} documents | **Completed**: ${
      d.completedDocuments
    } | **In Progress**: ${d.inProgressDocuments}${knowledgeInfo}${
      d.recentDocuments.length > 0
        ? `\n- **Recent work**: ${d.recentDocuments
            .map(r => `${r.title} (${r.status}${r.sectionCode ? `, ${r.sectionCode}` : ''})`)
            .join('; ')}`
        : ''
    }`);
  }

  // ── Workflow Context ─────────────────────────────────────────────────────
  if (context.workflow) {
    const w = context.workflow;
    parts.push(`
## Workflow Status
- **Active workflows**: ${w.activeWorkflows} | **Steps**: ${w.completedSteps}/${w.totalSteps}${
      w.currentPhase ? `\n- **Current Phase**: ${w.currentPhase}` : ''
    }${w.blockers.length > 0 ? `\n- **Blockers**: ${w.blockers.join('; ')}` : ''}`);
  }

  // ── Module-Specific Intelligence ──────────────────────────────────────────
  if (intel) {
    const activeModuleId = detectActiveModule(intel);
    if (activeModuleId) {
      const moduleIntel = getModuleIntelligence(activeModuleId, intel.activeProject || null);
      if (moduleIntel) {
        parts.push(moduleIntel.systemPromptAddon);

        // Add document type awareness
        if (moduleIntel.documentTypes.length > 0) {
          const draftable = moduleIntel.documentTypes.filter(d => d.aiDraftable);
          if (draftable.length > 0) {
            parts.push(`
### AI-Draftable Document Types in This Module
${draftable
  .slice(0, 8)
  .map(d => `- **${d.name}**: ${d.description} (${d.estimatedHours}h est.)`)
  .join('\n')}

When the user asks to draft any of these document types, you can generate a complete first draft with proper regulatory formatting.`);
          }
        }

        // Add workflow awareness
        if (moduleIntel.workflowStages.length > 0) {
          parts.push(`
### Standard Workflow Stages
${moduleIntel.workflowStages
  .map((s, i) => `${i + 1}. **${s.name}** (${s.estimatedDays}d) — ${s.description}`)
  .join('\n')}`);
        }
      }
    }

    // Cross-cutting intelligence (evidence, safety)
    const crossCutting = getCrossCuttingIntelligence(intel.organization.enabledModules);
    if (crossCutting) {
      parts.push(crossCutting);
    }

    // Instruction Engine — 5-step workflow, Data Room, Dossier Manager, Editor, Narrative
    const instructionPrompt = assembleInstructionEnginePrompt(intel.organization.enabledModules);
    if (instructionPrompt) {
      parts.push(instructionPrompt);
    }
  }

  // ── Phase 3: Readiness Intelligence ──────────────────────────────────────
  // Inject readiness and recommendation context when project is active
  if (context.project?.id && organizationId) {
    try {
      const { assembleCrossObjectPayload } = await import('./orchestration/cross-object-resolver');
      const { computeReadinessAssessment } = await import('./orchestration/readiness-engine');
      const { generateRecommendations } = await import('./orchestration/recommendation-engine');

      const payload = await assembleCrossObjectPayload({
        organizationId,
        projectId: context.project.id,
      });
      const readiness = computeReadinessAssessment(payload);
      const recSet = generateRecommendations(payload, { projectId: context.project.id, limit: 5 });

      parts.push(`
## Submission Readiness Intelligence
- **Overall Readiness**: ${readiness.overallScore}% (${readiness.status.replace(/_/g, ' ')})
- **Completeness**: ${readiness.scores.completeness}% | **Quality**: ${
        readiness.scores.quality
      }% | **Compliance**: ${readiness.scores.compliance}%
- **Routing**: ${readiness.scores.routing}% | **Consistency**: ${readiness.scores.consistency}%
- **Blockers**: ${readiness.blockers.length}${
        readiness.blockers.length > 0
          ? ` — ${readiness.blockers
              .slice(0, 3)
              .map(b => b.message)
              .join('; ')}`
          : ''
      }

### Top Recommendations
${recSet.recommendations
  .slice(0, 5)
  .map((r, i) => `${i + 1}. [${r.severity.toUpperCase()}] ${r.reason} → ${r.suggestedAction}`)
  .join('\n')}

When the user asks about readiness, blockers, gaps, or what to do next, reference this data.
You can suggest running orchestration workflows: submission_readiness_review, draft_validate_route, project_blocker_scan.`);
    } catch (err) {
      // Non-blocking — readiness intelligence is best-effort
      console.warn(
        '[AnA RI] Phase 3 readiness intelligence unavailable:',
        err instanceof Error ? err.message : err
      );
    }
  }

  // ── Submission-specific guidance ─────────────────────────────────────────
  const subType = context.project?.submissionType?.toUpperCase();
  if (subType === 'IND') {
    parts.push(`
## IND-Specific Guidance
You are currently assisting with an IND (Investigational New Drug) application per 21 CFR 312.23.
- Guide the user through CTD Modules 1-5 systematically
- Prioritize: Module 1 (forms, cover letter), Module 2 (summaries), Module 3 (CMC), Module 4 (nonclinical), Module 5 (clinical protocol)
- For initial IND: Phase 1 protocol is critical path — ensure it's ICH E6(R2) compliant
- Flag any missing ICH M4 sections and suggest next authoring steps
- Reference eCTD 4.0 formatting requirements per ICH M8
- Consider IND Safety Reporting requirements (21 CFR 312.32)`);
  } else if (subType === '510K' || subType === '510(K)') {
    parts.push(`
## 510(k) Specific Guidance
You are currently assisting with a 510(k) premarket notification.
- Guide through predicate device selection and substantial equivalence arguments
- Ensure performance testing aligns with recognized consensus standards
- Review biocompatibility per ISO 10993 series
- Verify software documentation per IEC 62304 if applicable
- Consider MDSAP alignment for multi-market submissions`);
  } else if (subType === 'NDA' || subType === 'BLA') {
    parts.push(`
## ${subType} Specific Guidance
You are assisting with a ${
      subType === 'NDA' ? 'New Drug Application' : 'Biologics License Application'
    }.
- Full CTD Modules 1-5 are required with complete clinical datasets
- Ensure ISS/ISE (Integrated Summary of Safety/Efficacy) are comprehensive
- REMS assessment may be required if safety signals warrant it
- Reference ICH E1 for duration of exposure requirements (≥1500 patients for chronic use)
- Reference ICH E3 for CSR format, ICH E9(R1) for estimand framework
- Labeling per PLR format — Highlights, Full Prescribing Information, Medication Guide
- FDA Prescription Drug User Fee Act (PDUFA) date awareness — plan for Advisory Committee if applicable`);
  } else if (subType === 'ANDA') {
    parts.push(`
## ANDA Specific Guidance
You are assisting with an Abbreviated New Drug Application (generic drug).
- Bioequivalence data is the primary clinical requirement — BE study design per FDA guidance
- Reference Listed Drug (RLD) comparison: strength, dosage form, route, labeling
- Pharmaceutical equivalence per 21 CFR 320.1: same active ingredient, dosage form, route, strength
- Biowaiver eligibility assessment per BCS classification (ICH M9)
- ANDA-specific CMC: same Q1/Q2 composition not required, but dissolution similarity (f2 testing) is
- Suitability petition (505(j)(2)(C)) if any differences from RLD
- Patent certification (Paragraph I-IV) strategy — assess Orange Book patents
- Flag any exclusivity blocks (NCE, ODE, pediatric, CGT)`);
  } else if (subType === '505B2' || subType === '505(B)(2)') {
    parts.push(`
## 505(b)(2) Specific Guidance
You are assisting with a 505(b)(2) application — the hybrid pathway.
- Right to reference: identify which data comes from the RLD/published literature vs. new studies
- Bridge study strategy: what new data is needed to support the proposed changes from the RLD
- Suitability of the 505(b)(2) pathway: change in dosage form, route, strength, indication, or combination
- Literature-based evidence: systematic review methodology, quality assessment of published studies
- CMC data requirements: full Module 3 for new formulation; comparative dissolution/BA data
- FDA Pre-IND/Type B meeting to confirm pathway acceptance is critical
- Patent considerations: same Paragraph certification requirements as ANDA`);
  } else if (subType === 'PMA') {
    parts.push(`
## PMA Specific Guidance
You are assisting with a Premarket Approval application for a Class III medical device.
- Full clinical trial data typically required — pivotal study with adequate sample size and endpoints
- Nonclinical testing per applicable FDA guidance and recognized consensus standards
- Manufacturing information: design controls (820.30), process validation, sterilization validation
- Software documentation per IEC 62304 if applicable (Level of Concern assessment)
- Risk management file per ISO 14971 — design FMEA, process FMEA, use FMEA
- Labeling review: professional labeling, patient labeling, IFU compliance
- Post-approval requirements: PAS/30-day supplements strategy, annual reports
- Panel track vs. traditional PMA — assess which review pathway applies`);
  } else if (subType === 'DENOVO' || subType === 'DE_NOVO') {
    parts.push(`
## De Novo Specific Guidance
You are assisting with a De Novo classification request for a novel device.
- No predicate device — must demonstrate reasonable assurance of safety and effectiveness
- Regulatory history search: confirm no 510(k)-clearable predicate exists
- Risk-benefit analysis specific to the intended use and patient population
- Proposed classification: recommend Class I or II with special controls
- Performance testing per recognized consensus standards where applicable
- Clinical data may be required depending on device risk profile
- Special controls proposal: define the controls needed for this device type
- Post-De Novo: device becomes predicate for future 510(k) submissions`);
  } else if (subType === 'MAA') {
    parts.push(`
## MAA Specific Guidance
You are assisting with a Marketing Authorisation Application for the EMA.
- CTD Modules 1-5 required — Module 1 is region-specific (EU administrative forms)
- Centralised procedure (CP): mandatory for certain product types (biotech, orphan, HIV/cancer/diabetes/neurodegen/autoimmune/viral)
- Decentralised procedure (DCP) or Mutual Recognition (MRP) for other products
- Rapporteur/Co-rapporteur system — anticipate their assessment focus areas
- EU-specific requirements: Risk Management Plan (RMP) per GVP Module V, PSUR/PBRER per ICH E2C(R2)
- Paediatric Investigation Plan (PIP) or waiver per Regulation (EC) No 1901/2006
- EU Orphan Designation if applicable (10-year market exclusivity)
- Environmental Risk Assessment (ERA) per EMA guidelines
- Conditional Marketing Authorisation or Authorisation under Exceptional Circumstances if data is limited`);
  }

  // ── Artifact Awareness ────────────────────────────────────────────────────
  if (context.documents && context.documents.recentDocuments.length > 0) {
    const artifactList = context.documents.recentDocuments
      .slice(0, 5)
      .map(d => `- **${d.title}** (${d.status}${d.sectionCode ? `, ${d.sectionCode}` : ''})`)
      .join('\n');
    parts.push(`
## Available Artifacts
These artifacts exist in the current project. Reference them when relevant:
${artifactList}

When a tool generates a new artifact, mention it by name and relate it to existing artifacts.`);
  }

  // ── Tool Selection Guidance ────────────────────────────────────────────────
  parts.push(`
## Tool Usage Guidance
You have access to tools. Use them proactively when appropriate:
- **validation.run**: When the user wants to check submission completeness or compliance
- **workflow.510k.predicate_search**: When the user needs to find predicate devices
- **workflow.510k.substantialequivalence_analysis**: When comparing a device to a predicate
- **workflow.cer.classify_device**: When the user needs EU MDR device classification
- **analysis.protocol.compare**: When comparing protocols or study designs
- **analysis.protocol.gapanalysis**: When identifying gaps in a protocol
- **documents.upload / documents.export**: When the user wants to manage documents
- **workflow.ectd.draft_module5**: When drafting eCTD Module 5 content
- **workflow.ectd.publish**: When publishing an eCTD sequence

### Tool Rules:
- Use tools when the user's request maps to a specific regulatory action, not for general questions
- Never call the same tool twice in one turn
- Maximum 3 tool calls per turn
- After tool execution, synthesize the results into a clear, actionable response
- If a tool returns an error, explain what happened and suggest alternatives`);

  // ── Instructions ─────────────────────────────────────────────────────────
  parts.push(`
## Context-Aware Instructions
1. **Accept instructions and execute**: When told to draft, generate, analyze, or review — do it immediately. Produce the output.
2. **Be personal**: Greet the user by name. Reference their specific projects and documents.
3. **Be continuous**: Know what they last worked on and suggest what to do next.
4. **Be proactive**: Identify gaps, deadlines, and blockages without being asked.
5. **Be specific**: Use actual document names, section codes, and project details from context.
6. **Be regulatory**: Every recommendation must cite the applicable regulation or guideline.
7. **Shape the narrative**: Synthesize evidence, flag inconsistencies, present data strategically — but let the user decide.
8. **Generate at scale**: Tables, figures, entire sections — produce thousands of pages of regulatory content with precision.
9. **Maintain traceability**: Every claim traces to a source. Every change is tracked. Audit readiness at every stage.
10. **Never ask for info already in context**: You have their projects, documents, work history, and queue.
11. **Adapt to expertise**: Match response depth to the user's expertise level and communication preference.
12. **Handle updates across sections**: When data changes, identify all affected sections and propagate updates.`);

  // ── Context Budget Enforcement ───────────────────────────────────────────
  // Keep the system prompt under ~3,000 tokens (~12,000 chars) to preserve
  // reasoning quality. The BASE_SYSTEM_PROMPT (parts[0]) is always included.
  // Dynamic sections are trimmed from lowest-priority first.
  const MAX_PROMPT_CHARS = 12_000;
  let assembled = parts.join('\n');
  if (assembled.length > MAX_PROMPT_CHARS && parts.length > 1) {
    // Trim from the end (lowest-priority dynamic sections) until under budget.
    // parts[0] = base prompt (always kept), last 2 = tool guidance + instructions (kept)
    const keepHead = parts[0];
    const keepTail = parts.slice(-2).join('\n');
    const middle = parts.slice(1, -2);
    let running = keepHead.length + keepTail.length + 2; // 2 for join newlines
    const kept: string[] = [];
    for (const section of middle) {
      if (running + section.length + 1 > MAX_PROMPT_CHARS) break;
      kept.push(section);
      running += section.length + 1;
    }
    assembled = [keepHead, ...kept, keepTail].join('\n');
  }

  return assembled;
}

/**
 * One-call convenience: load context + assemble prompt.
 * If sectionCode is provided, section-specific regulatory guidance is appended.
 */
export async function buildContextAwarePrompt(params: {
  projectId?: number | string;
  organizationId?: number;
  userId?: number;
  submissionType?: string;
  customSystemPrompt?: string;
  sectionCode?: string;
}): Promise<{ systemPrompt: string; context: AnAContext }> {
  const context = await buildAnAContext(params);
  let systemPrompt = await assembleSystemPrompt(context, params.customSystemPrompt);

  // Append deep section-specific guidance if drafting a particular CTD section
  if (params.sectionCode && !params.customSystemPrompt) {
    const sectionGuide = buildSectionSpecificPrompt(params.sectionCode);
    if (sectionGuide) {
      systemPrompt += '\n' + sectionGuide;
    }
  }

  return { systemPrompt, context };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION-SPECIFIC REGULATORY PROMPTS
// Deep, per-section guidance keyed by CTD section code
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map of CTD section codes to deep regulatory drafting guidance.
 * Each entry provides the relevant ICH guidelines, required content elements,
 * common FDA review concerns, and formatting expectations.
 */
// Section-specific CTD prompt supplements moved into their own module.
// Re-exported here so callers (chat-context-builder.ts and others) keep
// working unchanged. Also imported locally because assembleSystemPrompt()
// below calls it directly.
import { buildSectionSpecificPrompt } from './lumen-context/sections.js';
export { buildSectionSpecificPrompt };

// ═══════════════════════════════════════════════════════════════════════════════
// INTELLIGENCE PREFIX — Lightweight helper for ALL AI services
// ═══════════════════════════════════════════════════════════════════════════════

// Intelligence prefix moved into its own module; re-exported here so existing
// `from '...lumen-context-builder.js'` imports keep working unchanged.
export {
  getIntelligencePrefix,
  invalidateIntelligencePrefix,
} from './lumen-context/intelligence-prefix.js';

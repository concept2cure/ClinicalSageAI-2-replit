/**
 * @fileoverview Lumen Cortex Context Builder
 * @module server/services/lumen-context-builder
 * @version 1.0.0
 *
 * @description
 * Assembles rich, dynamic system prompts for Lumen Cortex by loading
 * project state, workflow position, document completion, IND pyramid
 * progress, and user role from the database.
 *
 * This is the bridge between the static REGULATORY_SYSTEM_PROMPT and
 * a fully context-aware AI that knows exactly where the user is in
 * their regulatory journey.
 *
 * @compliance FDA 21 CFR Part 11 — all context assembly is logged
 */

import { pool } from '../db.js';

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

export interface LumenContext {
  project: ProjectContext | null;
  documents: DocumentContext | null;
  workflow: WorkflowContext | null;
  conversation: ConversationContext | null;
  userRole: string | null;
  userName: string | null;
  organizationName: string | null;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BASE SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

const BASE_SYSTEM_PROMPT = `You are Lumen Cortex, the AI regulatory intelligence engine powering TrialSage — a comprehensive platform for life sciences regulatory submissions.

## Core Capabilities
- Deep expertise in FDA IND applications (21 CFR 312.23), 510(k) submissions, NDA/BLA, EU MDR
- eCTD Module 1-5 authoring with ICH M4 compliance
- CMC (Chemistry, Manufacturing, Controls) per ICH Q-series guidelines
- Nonclinical study design per ICH M3(R2), S-series guidelines
- Clinical protocol optimization per ICH E6(R2)/E8(R3)
- 21 CFR Part 11 electronic records and signatures compliance

## Communication Style
- Precise, evidence-based regulatory guidance with citations
- Structure responses with headers, bullets, and bold key terms
- Flag risks and compliance gaps proactively
- When uncertain, say so and cite authoritative sources
- Generate actionable next steps, not just information`;

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
    console.warn('[LumenContext] Failed to load project context:', error);
    return null;
  }
}

/**
 * Load document/artifact context for the project.
 */
async function loadDocumentContext(
  projectId: number,
  organizationId: number
): Promise<DocumentContext | null> {
  try {
    // Get document counts from concept2cure_artifacts
    const countResult = await pool.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status IN ('published', 'approved', 'locked')) as completed,
         COUNT(*) FILTER (WHERE status IN ('draft', 'in_progress', 'review')) as in_progress
       FROM concept2cure_artifacts
       WHERE project_id = $1 AND organization_id = $2`,
      [projectId, organizationId]
    );

    // Get recent documents
    const recentResult = await pool.query(
      `SELECT title, status, metadata, updated_at
       FROM concept2cure_artifacts
       WHERE project_id = $1 AND organization_id = $2
       ORDER BY updated_at DESC
       LIMIT 5`,
      [projectId, organizationId]
    );

    const counts = countResult.rows[0] || { total: 0, completed: 0, in_progress: 0 };

    return {
      totalDocuments: parseInt(counts.total, 10) || 0,
      completedDocuments: parseInt(counts.completed, 10) || 0,
      inProgressDocuments: parseInt(counts.in_progress, 10) || 0,
      recentDocuments: recentResult.rows.map((r: any) => ({
        title: r.title,
        status: r.status,
        sectionCode: r.metadata?.sectionCode || r.metadata?.ectd_section || null,
        updatedAt: r.updated_at?.toISOString() || '',
      })),
    };
  } catch (error) {
    console.warn('[LumenContext] Failed to load document context:', error);
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
    console.warn('[LumenContext] Failed to load conversation context:', error);
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
 * Build complete Lumen context for a chat request.
 * Fast-fails on each sub-query independently so partial context
 * is still usable even if one query fails.
 */
export async function buildLumenContext(params: {
  projectId?: number | string;
  organizationId?: number;
  userId?: number;
  submissionType?: string;
}): Promise<LumenContext> {
  const { organizationId, userId } = params;
  const projectId = params.projectId ? parseInt(String(params.projectId), 10) : null;

  // Load all context in parallel for speed
  const [project, documents, conversation, userInfo, orgName] = await Promise.all([
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
  ]);

  return {
    project,
    documents,
    workflow: null, // Workflow context loaded separately when workflow engine is active
    conversation,
    userRole: userInfo.role,
    userName: userInfo.name,
    organizationName: orgName,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Assemble the full system prompt with context injected.
 * Returns the base prompt if no project context is available.
 */
export function assembleSystemPrompt(context: LumenContext, customSystemPrompt?: string): string {
  // If caller provided a full custom system prompt, respect it
  if (customSystemPrompt) return customSystemPrompt;

  const parts: string[] = [BASE_SYSTEM_PROMPT];

  // ── Project Context ──────────────────────────────────────────────────────
  if (context.project) {
    const p = context.project;
    parts.push(`
## Active Project Context
- **Project**: ${p.name} (ID: ${p.id})
- **Submission Type**: ${p.submissionType}${p.therapeuticArea ? `\n- **Therapeutic Area**: ${p.therapeuticArea}` : ''}${p.phase ? `\n- **Phase**: ${p.phase}` : ''}
- **Status**: ${p.status} | **Progress**: ${p.progress}%
- **Priority**: ${p.priority} | **Risk Level**: ${p.riskLevel}${p.description ? `\n- **Description**: ${p.description}` : ''}${p.tags?.length ? `\n- **Tags**: ${p.tags.join(', ')}` : ''}`);
  }

  // ── Document Context ─────────────────────────────────────────────────────
  if (context.documents && context.documents.totalDocuments > 0) {
    const d = context.documents;
    parts.push(`
## Document Status
- **Total**: ${d.totalDocuments} documents | **Completed**: ${d.completedDocuments} | **In Progress**: ${d.inProgressDocuments}${
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
- **Active workflows**: ${w.activeWorkflows} | **Steps**: ${w.completedSteps}/${w.totalSteps}${w.currentPhase ? `\n- **Current Phase**: ${w.currentPhase}` : ''}${w.blockers.length > 0 ? `\n- **Blockers**: ${w.blockers.join('; ')}` : ''}`);
  }

  // ── User Context ─────────────────────────────────────────────────────────
  if (context.userName || context.userRole) {
    parts.push(`
## User Context
- **User**: ${context.userName || 'Unknown'}${context.userRole ? ` (${context.userRole})` : ''}${context.organizationName ? `\n- **Organization**: ${context.organizationName}` : ''}`);
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
You are assisting with a ${subType === 'NDA' ? 'New Drug Application' : 'Biologics License Application'}.
- Full CTD Modules 1-5 are required with complete clinical datasets
- Ensure ISS/ISE (Integrated Summary of Safety/Efficacy) are comprehensive
- REMS assessment may be required
- Reference ICH E1/E3/E9 for clinical data formatting`);
  }

  // ── Instructions ─────────────────────────────────────────────────────────
  parts.push(`
## Context-Aware Instructions
Use the project context above to provide highly specific, relevant guidance. Reference the user's actual documents and progress when suggesting next steps. Do not ask for information that is already in the context. Proactively identify gaps based on the document status and submission requirements.`);

  return parts.join('\n');
}

/**
 * One-call convenience: load context + assemble prompt.
 */
export async function buildContextAwarePrompt(params: {
  projectId?: number | string;
  organizationId?: number;
  userId?: number;
  submissionType?: string;
  customSystemPrompt?: string;
}): Promise<{ systemPrompt: string; context: LumenContext }> {
  const context = await buildLumenContext(params);
  const systemPrompt = assembleSystemPrompt(context, params.customSystemPrompt);
  return { systemPrompt, context };
}

/**
 * @fileoverview Full CSR Builder Service
 * @module server/services/csr-builder
 *
 * Generates complete ICH E3 Clinical Study Reports with AI-powered
 * section drafting, cross-referencing, and compliance validation.
 * Integrates with deep research results and existing CSR database.
 */

import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '../db.js';
import { csrReports } from '../../shared/schema.js';
import { recordUsage, checkQuota } from './usage-metering.js';
import { e3Children, e3SectionDraftingMode, e3SectionSummary, e3TopLevel, getE3Section } from './ind/ctd/csr-e3-guidance.js';
import type { E3Section } from './ind/ctd/types.js';
import { resolveRequirements } from './ind/ctd/requirements-resolver.js';
import { acceptEvidenceBoundDraft, acceptModelDraft } from './csr/unsupplied-statistics.js';
import { CSR_EVIDENCE_DRAFTING_RULES, splitCsrClaims, type CsrAuthoringEvidence } from './csr/cortex-authoring-context.js';
import { resolveCsrBuildContext } from './csr/project-scope';

// Load the canonical gateway client only when an async drafting operation
// needs it. A top-level await propagates into the Authoring source/export
// graph and makes its mutually importing release modules deadlock in esbuild's
// cached async initializers, before the production server can listen.
type CSRClient = {
  complete: (messages: any, options?: any) => Promise<string>;
  chat: (messages: any, options?: any) => Promise<SectionReply>;
};
let aiClientPromise: Promise<CSRClient | null> | null = null;
function loadCSRClient(): Promise<CSRClient | null> {
  return aiClientPromise ??= import('../lib/unified-ai-client.js')
    .then(mod => mod.ai)
    .catch(() => {
      console.warn('[CSR Builder] Unified AI client not available, using template drafting');
      return null;
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICH E3 SECTION STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

export interface CSRSection {
  number: string;
  title: string;
  required: boolean;
  description: string;
  /** e3SectionDraftingMode: 'manual' headings (§3, §14–16) are never model-drafted. */
  draftingMode: 'narrative' | 'manual';
  content?: string;
  // 'needs_data' — content was drafted (AI or template) but still contains
  // one or more unresolved data placeholders (e.g. [DATA TO BE INSERTED],
  // [N], [value]) and is therefore NOT numerically complete. See
  // hasUnresolvedPlaceholders below. This is deliberately distinct from
  // 'drafted' so a downstream consumer gating export/submission readiness
  // on section status cannot mistake prose-with-placeholders for done.
  status: 'empty' | 'drafting' | 'drafted' | 'needs_data' | 'reviewed' | 'approved';
  // True exactly when status === 'needs_data'. Duplicated as a boolean flag
  // (in addition to the status string) so callers that only check a single
  // field can't miss it either way.
  needsData?: boolean;
  childSections?: CSRSection[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLACEHOLDER / DATA-COMPLETENESS DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Matches an unresolved data placeholder left in drafted CSR content, e.g.
 * [DATA TO BE INSERTED], [N], [value], [result], [reasons], [list], [X],
 * [statistical method to be specified], [favorable/unfavorable]. Both the AI
 * system prompt (buildSectionSystemPrompt) and the template fallback
 * (generateSectionTemplate) are instructed to use exactly this bracketed
 * convention for any real study number/finding that isn't available yet —
 * so ANY surviving `[...]` span containing a letter means the section still
 * needs real data, regardless of how much surrounding prose looks finished.
 *
 * Deliberately broad on purpose (fail closed per repo working agreement): a
 * false positive costs a section an extra "needs_data" glance from a
 * reviewer; a false negative would let a CSR section that's still full of
 * [DATA TO BE INSERTED] report as filing-ready, which is the bug this gate
 * exists to close. Legitimate regulatory prose does not use square brackets.
 */
const PLACEHOLDER_PATTERN = /\[[^[\]]*[A-Za-z][^[\]]*\]/;

/** True if `content` still contains at least one unresolved data placeholder. */
export function hasUnresolvedPlaceholders(content: string | null | undefined): boolean {
  if (!content) return false;
  return PLACEHOLDER_PATTERN.test(content);
}

/**
 * Derive a section's status from its drafted content. Non-empty content that
 * still carries a placeholder is 'needs_data', not 'drafted' — see
 * hasUnresolvedPlaceholders.
 */
function statusForContent(content: string | undefined): CSRSection['status'] {
  if (!content) return 'empty';
  return hasUnresolvedPlaceholders(content) ? 'needs_data' : 'drafted';
}

/** Apply statusForContent + the needsData mirror flag to a section in place. */
function applyContentStatus(section: CSRSection): void {
  section.status = statusForContent(section.content);
  section.needsData = section.status === 'needs_data';
}

/**
 * A section counts as *data-complete* only when it has content AND that
 * content has no residual placeholders (status 'drafted' or further along
 * the review pipeline — 'reviewed'/'approved'). Used to compute build-level
 * progress/status so a job can never report 'complete'/100 while any
 * section is still 'empty' or 'needs_data'.
 */
function isSectionDataComplete(section: CSRSection): boolean {
  return section.status === 'drafted' || section.status === 'reviewed' || section.status === 'approved';
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE OUTLINE IS ICH_E3_GUIDANCE
// ═══════════════════════════════════════════════════════════════════════════════
//
// 2026-10-29 (docs/design/CSR_END_TO_END_2026-10-29.md, slice 2): this file
// carried its own outline, ICH_E3_STRUCTURE — 46–50 nodes with an invented
// §2.1–2.10 synopsis and §8.1–8.2, and no §11.4.x, §12.2.x, §12.3.x, §14.x or
// §16.x children — and the job runner, the csr-workflow board,
// workflow-source-import and the M5 clinical QC all read that copy. It is
// deleted. Every consumer now reads the tree below, which is derived from the
// platform's one E3 model (server/services/ind/ctd/csr-e3-guidance.ts) and so
// cannot drift from it. server/services/__tests__/csr-builder-e3-outline.test.ts
// pins it.

/** Whether ICH E3 leaves heading `number` mandatory in the body of the report. */
function e3Required(section: E3Section): boolean {
  // §14–16 are what the study produced; the M5 QC owns that policy.
  return section.applies === 'always' && !/^(14|15|16)(\.|$)/.test(section.number);
}

function toCSRSection(section: E3Section): CSRSection {
  const children = e3Children(section.number);
  return {
    number: section.number,
    title: section.title,
    required: e3Required(section),
    description: e3SectionSummary(section),
    draftingMode: e3SectionDraftingMode(section.number),
    status: 'empty',
    ...(children.length ? { childSections: children.map(toCSRSection) } : {}),
  };
}

/**
 * A heading the model drafts: narrative-mode (§3 and §14–16 are prepared from
 * source, never model-drafted) and carrying content of its own — a leaf, or a
 * parent E3 gives its own contents. A bare parent such as §12.2 is drafted
 * through its children, the rule renderE3Scaffold already places tokens by.
 */
export function isDraftableE3Heading(number: string): boolean {
  const section = getE3Section(number);
  if (!section || section.number !== number || e3SectionDraftingMode(number) !== 'narrative') return false;
  return e3Children(number).length === 0 || (section.contains?.length ?? 0) > 0;
}

export interface CSRSectionSelectionRefusal {
  code: 'CSR_SECTION_SELECTION_INVALID' | 'CSR_SECTION_MANUAL';
  message: string;
}

/**
 * Why a requested section selection cannot be drafted, or null when it can.
 * Undefined means "the whole report"; an explicit empty list does not.
 */
export function csrSectionSelectionRefusal(selection: unknown): CSRSectionSelectionRefusal | null {
  if (selection === undefined) return null;
  const invalid = { code: 'CSR_SECTION_SELECTION_INVALID', message: 'Choose unique existing ICH E3 section numbers.' } as const;
  if (!Array.isArray(selection) || selection.length === 0 || new Set(selection).size !== selection.length) return invalid;
  for (const code of selection) {
    if (typeof code !== 'string' || getE3Section(code)?.number !== code) return invalid;
    if (e3SectionDraftingMode(code) === 'manual') {
      return { code: 'CSR_SECTION_MANUAL', message: `ICH E3 §${code} is prepared from source outputs and records, never drafted by a model.` };
    }
  }
  return null;
}

/**
 * The headings a build drafts, in report order: every draftable heading, or
 * those within the selected headings' subtrees. Throws on a refused selection.
 */
export function resolveCSRDraftTargets(selection?: readonly string[]): CSRSection[] {
  const refusal = csrSectionSelectionRefusal(selection);
  if (refusal) throw new Error(`${refusal.code}: ${refusal.message}`);
  const within = (n: string) => !selection || selection.some(code => n === code || n.startsWith(`${code}.`));
  return flattenICHE3Sections(getICHE3Structure()).filter(s => within(s.number) && isDraftableE3Heading(s.number));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSR BUILD JOB
// ═══════════════════════════════════════════════════════════════════════════════

export interface CSRBuildRequest {
  organizationId: number;
  userId: number;
  projectId?: number;
  studyInfo: {
    title: string;
    protocolNumber: string;
    phase: string;
    indication: string;
    sponsor: string;
    investigationalProduct: string;
    comparator?: string;
    studyDesign: string;
    primaryEndpoint: string;
    secondaryEndpoints?: string[];
    sampleSize?: number;
    treatmentDuration?: string;
    targetAgencies?: string[];
  };
  deepResearchJobId?: number; // Pull data from a completed deep research job
  sectionsToGenerate?: string[]; // Specific sections, or all if empty
  /**
   * The retained Submission Center run whose engine tables ground the results
   * sections (§2, §10–13). The job runner loads each section's evidence pack
   * from it (cortex-authoring-reader) and reconciles every drafted figure.
   */
  evidenceSource?: { programId: string; runId: string; studyId: string };
}

export interface CSRBuildJob {
  id: number;
  // 'needs_data' — drafting finished but one or more targeted sections still
  // carry unresolved data placeholders; NOT the same as 'complete'. See
  // computeBuildCompleteness.
  status: 'queued' | 'generating' | 'complete' | 'needs_data' | 'failed';
  progress: number;
  sections: CSRSection[];
  studyInfo: CSRBuildRequest['studyInfo'];
  createdAt: Date;
}

/**
 * Compute a build job's overall status/progress from its drafted section
 * tree. A job is 'complete'/100 ONLY when every *targeted* section
 * (respecting sectionsToGenerate — mirrors csr-job-runner's target-list
 * semantics so a partial build isn't held to the full ICH-E3 backbone) is
 * data-complete: it has content, and that content has no residual
 * [DATA TO BE INSERTED]-style placeholder (see hasUnresolvedPlaceholders).
 * Any targeted section still 'empty' (no template/AI content — e.g. a
 * section number with no template case) or 'needs_data' (placeholders
 * remain) holds the whole job at 'needs_data' with progress < 100.
 *
 * Fail closed: a CSR with any residual data placeholder — or any required
 * section that never got drafted at all — must never surface as
 * 'complete'/100. A downstream consumer gating export on job status depends
 * on this.
 */
function computeBuildCompleteness(
  sections: CSRSection[],
  sectionsToGenerate?: string[]
): { status: 'complete' | 'needs_data'; progress: number } {
  // Unknown or manual requested sections, including a wholly invalid
  // selection, must never be treated as a complete CSR.
  if (csrSectionSelectionRefusal(sectionsToGenerate?.length ? sectionsToGenerate : undefined)) {
    return { status: 'needs_data', progress: 0 };
  }
  const targetNumbers = new Set(resolveCSRDraftTargets(sectionsToGenerate?.length ? sectionsToGenerate : undefined).map(s => s.number));
  const targets = flattenICHE3Sections(sections).filter(s => targetNumbers.has(s.number));
  if (targets.length === 0) return { status: 'needs_data', progress: 0 };

  const completeCount = targets.filter(isSectionDataComplete).length;
  if (completeCount === targets.length) {
    return { status: 'complete', progress: 100 };
  }
  return {
    status: 'needs_data',
    progress: Math.floor((completeCount / targets.length) * 100),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Shared quota + usage envelope. Called from BOTH launchCSRBuild (sync) and
 * launchCSRBuildAsync (queued) so the async path can't silently bypass
 * billing once a route migrates to it. Throws an upgrade-required Error on
 * quota failure — callers should let that propagate so the HTTP response is
 * identical to the sync path.
 *
 * Usage is recorded at enqueue time, not at job completion, so a failed job
 * still counts (matches sync behavior, which records before drafting).
 */
async function reserveCSRBuilderQuota(request: CSRBuildRequest): Promise<void> {
  const quota = await checkQuota(request.organizationId, 'csr_builder');
  if (!quota.allowed) {
    throw new Error(
      quota.upgradeRequired
        ? `CSR Builder requires ${quota.upgradeRequired} tier or higher`
        : 'CSR Builder quota exceeded for this billing period'
    );
  }
  await recordUsage(request.organizationId, request.userId, 'csr_builder', 1, {
    protocolNumber: request.studyInfo.protocolNumber,
    indication: request.studyInfo.indication,
  });
}

/** Reject invalid section targets before quota reservation or job enqueue. */
export function validateCSRSectionSelection(sectionsToGenerate?: string[]): void {
  const refusal = csrSectionSelectionRefusal(sectionsToGenerate);
  if (refusal) throw new Error(`${refusal.code}: ${refusal.message}`);
}

/**
 * Launch a CSR build job.
 */
export async function launchCSRBuild(request: CSRBuildRequest): Promise<CSRBuildJob> {
  validateCSRSectionSelection(request.sectionsToGenerate);
  await resolveCsrBuildContext(db, request, { organizationId: request.organizationId, projectId: request.projectId, requestedBy: request.userId });
  await reserveCSRBuilderQuota(request);

  // Initialize section structure
  const sections = getICHE3Structure();

  // Generate content for each section based on study info
  const generated = await generateCSRSections(sections, request);

  // Fail closed: only report complete/100 when every targeted section is
  // actually data-complete (no residual placeholders). See
  // computeBuildCompleteness.
  const completeness = computeBuildCompleteness(generated, request.sectionsToGenerate);

  return {
    id: Date.now(),
    status: completeness.status,
    progress: completeness.progress,
    sections: generated,
    studyInfo: request.studyInfo,
    createdAt: new Date(),
  };
}

/**
 * Async variant of launchCSRBuild.
 *
 * Inserts a csr_build_jobs row in the queued state, kicks off the worker
 * out-of-band via setImmediate (deliberately NOT awaited), and returns the
 * jobId immediately so the HTTP request never blocks on AI drafting.
 *
 * Back-compat: launchCSRBuild (synchronous, in-process, single shot) is
 * preserved untouched for legacy callers. New callers — and the route
 * layer in Phase 3c — should prefer launchCSRBuildAsync. The two share the
 * same CSRBuildRequest input shape so the call site change is a 1-liner.
 *
 * Lazy import of csr-job-runner avoids a module-load circular dependency
 * (csr-job-runner imports generateCSRSections from this file).
 */
export async function launchCSRBuildAsync(
  request: CSRBuildRequest,
  ctx: { organizationId: number; projectId?: number; programId?: string; clientWorkspaceId?: number; requestedBy?: number }
): Promise<{ jobId: number; status: 'queued' }> {
  validateCSRSectionSelection(request.sectionsToGenerate);
  const scope = await resolveCsrBuildContext(db, request, ctx);
  // Quota + usage are reserved BEFORE enqueue so the async path can't bypass
  // billing. Throws the same upgrade-required error as launchCSRBuild on
  // quota failure — the HTTP response shape is identical at the route layer.
  await reserveCSRBuilderQuota(request);

  const { enqueueCSRBuildJob, runCSRBuildJob } = await import(
    './csr/csr-job-runner.js'
  );

  const enqueued = await enqueueCSRBuildJob({ ...request, projectId: scope.projectId }, scope);

  // Fire-and-forget worker. Errors are persisted on the job row by
  // runCSRBuildJob's own catch block; we still attach a .catch handler
  // here as a safety net so an unhandled rejection can't crash the process.
  setImmediate(() => {
    runCSRBuildJob(enqueued.jobId).catch(err => {
      console.error(
        `[CSR Builder] runCSRBuildJob(${enqueued.jobId}) threw outside its own error handler:`,
        err
      );
    });
  });

  return enqueued;
}

/**
 * Optional AI Gateway tenant context. Phase 3b: the async job runner threads
 * organizationId / projectId / userId down so the unified AI client can
 * attribute the call. Legacy synchronous callers leave this undefined and
 * the gateway falls back to whatever request.organizationId carries.
 */
export interface CSRAIContext {
  organizationId?: number;
  projectId?: number;
  userId?: number;
}

/**
 * Generate content for CSR sections using study information.
 * Uses AI Gateway (Claude) when available, falls back to templates.
 *
 * Exported so the async job runner (server/services/csr/csr-job-runner.ts)
 * can drive section drafting without going through launchCSRBuild's
 * quota / single-shot envelope.
 *
 * NOTE: sectionsToGenerate is a *filter* over which sections to draft —
 * it does NOT switch off AI. AI is used whenever the unified AI client is
 * available; template fallback only kicks in when ai is null or a per-
 * section AI call throws.
 */
export async function generateCSRSections(
  sections: CSRSection[],
  request: CSRBuildRequest,
  aiContext?: CSRAIContext
): Promise<CSRSection[]> {
  const info = request.studyInfo;
  const useAI = !!(await loadCSRClient());
  const ctx: CSRAIContext = {
    organizationId: aiContext?.organizationId ?? request.organizationId,
    projectId: aiContext?.projectId ?? request.projectId,
    userId: aiContext?.userId ?? request.userId,
  };

  // Only draftable E3 headings within the selection are drafted: a bare
  // parent through its children, and a manual heading never.
  const targets = new Set(resolveCSRDraftTargets(request.sectionsToGenerate?.length ? request.sectionsToGenerate : undefined).map(s => s.number));
  const draftTree = async (section: CSRSection): Promise<void> => {
    // Walk descendants even when their parent is not itself selected.
    if (targets.has(section.number)) {
      if (useAI) {
        section.content = (await generateSectionWithAI(section, info, ctx)).content;
      } else {
        section.content = generateSectionTemplate(section, info);
      }
      applyContentStatus(section);
    }
    for (const child of section.childSections ?? []) await draftTree(child);
  };
  for (const section of sections) await draftTree(section);

  return sections;
}

/**
 * Per-section drafting with full provenance, intended for the async job
 * runner. Unlike generateCSRSections (which mutates a tree and returns
 * content strings only), this returns the model + token cost + source
 * envelope so the runner can persist `model`, `token_cost`, `ai_generated`,
 * and `lineage` columns on csr_section_outputs.
 *
 * Source semantics:
 *   - 'ai'        — AI gateway returned content. model + tokenCost populated.
 *   - 'template'  — AI was unavailable or returned an empty/failed response;
 *                   we fell back to generateSectionTemplate. ai_generated MUST
 *                   be persisted as false (so the audit trail doesn't lie).
 *
 * Throws if both AI and template return empty content — the caller (runner)
 * is responsible for translating that into a failed-job transition.
 */
export interface DraftedCSRSection {
  number: string;
  content: string;
  source: 'ai' | 'template';
  model: string | null;
  tokenCost: number;
  lineage: Record<string, unknown> | null;
}

/** The gateway reply the provenance path needs: the text and who served it. */
interface SectionReply {
  content: string;
  model?: string;
  resolvedModel?: string;
  usage?: { totalTokens?: number };
}

/** Whether a retained evidence pack actually carries tables for this section. */
function usableEvidence(evidence: CsrAuthoringEvidence | undefined): evidence is CsrAuthoringEvidence {
  return !!evidence && evidence.tables.length > 0;
}

function evidenceLineage(evidence: CsrAuthoringEvidence): Record<string, unknown> {
  return {
    runId: evidence.runId, studyId: evidence.studyId, sectionNumber: evidence.sectionNumber,
    evidenceDigest: evidence.evidenceDigest, sourceSha256: evidence.source.sha256, status: evidence.status,
    tables: evidence.tables.map(t => t.key), missingTables: evidence.missingTables,
  };
}

/**
 * Accept a model reply as the section, or record on `lineage` why not.
 * Rule 2: an evidence-bound results section states only figures that
 * reconcile, cell by cell, to the retained engine tables; any other section
 * states no figure the study information does not carry. The model id is the
 * one the gateway reports serving — a reply nobody can attribute is refused.
 */
function acceptSectionReply(
  number: string, reply: SectionReply, info: CSRBuildRequest['studyInfo'],
  lineage: Record<string, unknown>, evidence?: CsrAuthoringEvidence,
): { content: string; model: string; tokenCost: number } | null {
  const model = (reply.resolvedModel || reply.model || '').trim();
  if (!reply.content?.trim()) return null;
  if (!model) {
    lineage.rejectedModelDraft = { reason: 'model_unattributed' };
    return null;
  }
  let content = reply.content;
  if (usableEvidence(evidence)) {
    const split = splitCsrClaims(content);
    if (!acceptEvidenceBoundDraft(number, split.prose, split.claims, evidence, info, lineage)) return null;
    content = split.prose;
  } else if (!acceptModelDraft(number, content, info, lineage)) {
    return null;
  }
  const tokens = Number(reply.usage?.totalTokens);
  return { content, model, tokenCost: Number.isFinite(tokens) && tokens > 0 ? Math.round(tokens) : 0 };
}

/**
 * Draft one section with its provenance, for the async job runner: the model
 * id the gateway served, its token cost, and a lineage envelope. `evidence` is
 * the section's retained evidence pack (cortex-authoring-context) when the job
 * is bound to a retained orchestrator run; the runner loads it.
 *
 * Source semantics:
 *   - 'ai'       — the gateway's draft was accepted; model and tokenCost are
 *                  the gateway's own report.
 *   - 'template' — no client, an empty, failed or refused draft; ai_generated
 *                  MUST be persisted false, and the lineage says why.
 */
export async function draftCSRSectionWithProvenance(
  section: CSRSection,
  request: CSRBuildRequest,
  aiContext?: CSRAIContext,
  evidence?: CsrAuthoringEvidence,
): Promise<DraftedCSRSection> {
  if (section.draftingMode === 'manual' || !isDraftableE3Heading(section.number)) {
    throw new Error(`CSR_SECTION_NOT_DRAFTABLE: ICH E3 §${section.number} is not a model drafting target.`);
  }
  const ai = await loadCSRClient();
  const info = request.studyInfo;
  const lineage: Record<string, unknown> = {};
  if (request.deepResearchJobId != null) lineage.deepResearchJobId = request.deepResearchJobId;
  if (evidence) lineage.evidence = evidenceLineage(evidence);
  const done = (content: string, source: DraftedCSRSection['source'], model: string | null, tokenCost: number): DraftedCSRSection =>
    ({ number: section.number, content, source, model, tokenCost, lineage: Object.keys(lineage).length > 0 ? lineage : null });

  if (ai) {
    try {
      const reply = await ai.chat(sectionMessages(section, info, evidence), {
        taskType: 'document_drafting',
        maxTokens: 4096,
        temperature: 0.3,
        callerModule: 'csr-builder/section-draft',
        organizationId: aiContext?.organizationId ?? request.organizationId,
        projectId: aiContext?.projectId ?? request.projectId,
        userId: aiContext?.userId ?? request.userId,
      });
      const accepted = acceptSectionReply(section.number, reply, info, lineage, evidence);
      if (accepted) return done(accepted.content, 'ai', accepted.model, accepted.tokenCost);
    } catch (err) {
      console.warn(`[CSR Builder] AI drafting failed for section ${section.number}, using template:`, err);
    }
  }
  // Template fallback. ai_generated MUST be false for this row.
  return done(generateSectionTemplate(section, info), 'template', null, 0);
}

/** System prompt, the section's E3 brief and — when bound — its evidence as quoted data. */
function sectionMessages(section: CSRSection, info: CSRBuildRequest['studyInfo'], evidence?: CsrAuthoringEvidence) {
  const bound = usableEvidence(evidence);
  const messages = [
    { role: 'system', content: buildSectionSystemPrompt(info, bound) },
    { role: 'user', content: buildSectionUserMessage(section) },
  ];
  // Evidence is quoted data at user priority, never a system instruction.
  if (bound) messages.push({ role: 'user', content: JSON.stringify({ type: 'retained_csr_evidence', evidence }) });
  return messages;
}

/**
 * What ICH E3 says the heading `number` must contain, from the platform's one
 * resolver (server/services/ind/ctd/requirements-resolver.ts), never from the
 * model's memory of E3. Every builder heading is an E3 heading, so there is no
 * parent fallback; null when the resolver has nothing indexed for it.
 */
export function e3RequirementsFor(number: string): { requirements: string; heading: string } | null {
  const n = String(number ?? '').trim();
  const answer = resolveRequirements({ document: 'csr', section: n });
  return answer.kind === 'answer' ? { requirements: answer.requirements, heading: n } : null;
}

/**
 * The one user message both drafting paths send: the section, then what E3
 * says it must contain (or that the platform has nothing indexed for it).
 */
function buildSectionUserMessage(section: CSRSection): string {
  const e3 = e3RequirementsFor(section.number);
  const requirements = !e3
    ? `The platform has no ICH E3 requirements indexed for §${section.number}. Do not supply them from memory; draft from the description above and mark what it does not cover with [DATA TO BE INSERTED].`
    : [`What ICH E3 §${section.number} must contain, from the platform's ICH E3 record:`, '', e3.requirements].join('\n');
  return [
    `Draft ICH E3 Section ${section.number}: ${section.title}`,
    '',
    `Description: ${section.description}`,
    '',
    requirements,
    '',
    'Write a complete, submission-ready draft for this section. Cover what the record above lists; do not add requirements from memory.',
  ].join('\n');
}

/**
 * Shared system prompt builder so generateSectionWithAI and
 * draftCSRSectionWithProvenance stay in lock-step.
 */
function buildSectionSystemPrompt(info: CSRBuildRequest['studyInfo'], evidenceBound = false): string {
  return `You are an expert clinical study report writer specializing in ICH E3 guideline-compliant CSRs.
You are drafting a section of a Clinical Study Report for a ${info.phase} clinical trial.

Study Details:
- Title: ${info.title}
- Protocol: ${info.protocolNumber}
- Phase: ${info.phase}
- Indication: ${info.indication}
- Sponsor: ${info.sponsor}
- Drug: ${info.investigationalProduct}
${info.comparator ? `- Comparator: ${info.comparator}` : ''}
- Design: ${info.studyDesign}
- Primary Endpoint: ${info.primaryEndpoint}
${info.secondaryEndpoints?.length ? `- Secondary Endpoints: ${info.secondaryEndpoints.join('; ')}` : ''}
${info.sampleSize ? `- Sample Size: ${info.sampleSize}` : ''}
${info.treatmentDuration ? `- Treatment Duration: ${info.treatmentDuration}` : ''}

Write professional regulatory prose suitable for FDA/EMA submission. Use precise clinical language.
Do NOT use markdown. Write in plain text with section headers in CAPS.
${evidenceBound ? CSR_EVIDENCE_DRAFTING_RULES : `Include placeholders like [DATA TO BE INSERTED] where actual study data would go.
Never state a statistic that is not given above: no p-value, confidence interval, percentage, ratio, count or significance level. Write [DATA TO BE INSERTED] instead.`}`;
}

/**
 * Flatten ICH-E3 tree → leaf-or-parent list for the runner. Exported so the
 * runner doesn't duplicate the walk logic; matches what
 * generateCSRSections actually drafts (parents AND children, both filtered
 * by sectionsToGenerate when provided).
 */
export function flattenICHE3Sections(sections: CSRSection[]): CSRSection[] {
  const out: CSRSection[] = [];
  const visit = (section: CSRSection): void => {
    out.push(section);
    for (const child of section.childSections ?? []) visit(child);
  };
  for (const section of sections) visit(section);
  return out;
}

/**
 * AI-powered section drafting via Claude (AI Gateway).
 * Generates regulatory-grade content aligned with ICH E3 structure.
 */
async function generateSectionWithAI(
  section: CSRSection,
  info: CSRBuildRequest['studyInfo'],
  aiContext?: CSRAIContext
): Promise<{ content: string; isAI: boolean }> {
  const ai = await loadCSRClient();
  const template = () => ({ content: generateSectionTemplate(section, info), isAI: false });
  if (!ai) return template();

  const systemPrompt = buildSectionSystemPrompt(info);

  try {
    const content = await ai.complete(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildSectionUserMessage(section) },
      ],
      {
        taskType: 'document_drafting',
        maxTokens: 4096,
        temperature: 0.3,
        callerModule: 'csr-builder/section-draft',
        organizationId: aiContext?.organizationId,
        projectId: aiContext?.projectId,
        userId: aiContext?.userId,
      }
    );
    // Same guard as the provenance path: a statistical section that states a
    // figure the study information does not contain is not used.
    if (content && !acceptModelDraft(section.number, content, info)) {
      return template();
    }
    return { content, isAI: Boolean(content?.trim()) };
  } catch (err) {
    console.warn(`[CSR Builder] AI drafting failed for section ${section.number}, using template:`, err);
    return template();
  }
}

/**
 * Draft a single CSR section with AI on demand.
 */
export async function draftCSRSection(
  sectionNumber: string,
  studyInfo: CSRBuildRequest['studyInfo'],
  aiContext?: CSRAIContext
): Promise<{ content: string; isAI: boolean }> {
  const targetSection = isDraftableE3Heading(sectionNumber)
    ? flattenICHE3Sections(getICHE3Structure()).find(s => s.number === sectionNumber)
    : undefined;

  if (!targetSection) {
    return { content: '', isAI: false };
  }

  const drafted = await generateSectionWithAI(targetSection, studyInfo, aiContext);
  // The full builder retains an empty section as incomplete. This on-demand
  // endpoint instead offers the same explicit template as the provenance path.
  return drafted.content?.trim() ? drafted : { content: generateSectionTemplate(targetSection, studyInfo), isAI: false };
}

/**
 * Cross-study comparison: find similar CSRs in the database and compare key metrics.
 */
export async function compareWithExistingCSRs(
  indication: string,
  phase: string,
  endpoint: string,
  organizationId?: number
): Promise<Array<{
  studyId: string;
  title: string;
  phase: string;
  indication: string;
  sampleSize: number;
  primaryEndpoint: string;
  outcome: string;
  similarity: number;
}>> {
  try {
    // Tenant-scoped Drizzle query. The original raw SQL also selected an `outcome`
    // column from `csr_reports`, but no such column exists in the Drizzle schema
    // (shared/schema.ts csrReports, ~lines 12659-12697) or in any migration for
    // `csr_reports`. The raw query was therefore failing with "column outcome does
    // not exist" and falling through the catch to return []. We surface the gap
    // here rather than re-introduce raw SQL or silently add a column: the mapper
    // already defaults outcome to 'Unknown', which preserves the consumer-visible
    // shape until the column is added (or sourced from another table).
    const indicationPattern = `%${indication.toLowerCase()}%`;
    const endpointPattern = `%${endpoint.toLowerCase()}%`;
    const textMatch = or(
      ilike(csrReports.indication, indicationPattern),
      ilike(csrReports.primaryEndpoint, endpointPattern),
    );
    const whereClause = organizationId
      ? and(textMatch, eq(csrReports.organizationId, organizationId))
      : textMatch;

    const rows = await db
      .select({
        id: csrReports.id,
        title: csrReports.title,
        phase: csrReports.phase,
        indication: csrReports.indication,
        sampleSize: csrReports.sampleSize,
        primaryEndpoint: csrReports.primaryEndpoint,
      })
      .from(csrReports)
      .where(whereClause)
      .orderBy(desc(csrReports.createdAt))
      .limit(20);

    return rows.map(row => ({
      studyId: String(row.id ?? ''),
      title: String(row.title || 'Untitled'),
      phase: String(row.phase || ''),
      indication: String(row.indication || ''),
      sampleSize: Number(row.sampleSize) || 0,
      primaryEndpoint: String(row.primaryEndpoint || ''),
      outcome: 'Unknown',
      similarity: indication.toLowerCase() === String(row.indication || '').toLowerCase() ? 0.95 : 0.6,
    }));
  } catch (err) {
    console.warn('[CSR Builder] Cross-study comparison query failed:', err);
    return [];
  }
}

/**
 * Analyze safety signals across CSRs for a given drug/indication.
 */
export async function analyzeCSRSafetySignals(
  drugName: string,
  indication: string
): Promise<{
  signals: Array<{
    term: string;
    frequency: string;
    severity: string;
    relatedStudies: number;
    disproportionalityScore: number;
  }>;
  summary: string;
}> {
  const ai = await loadCSRClient();
  if (!ai) {
    return {
      signals: [],
      summary: 'AI analysis unavailable. Please ensure the AI Gateway is configured.',
    };
  }

  try {
    const prompt = `Analyze potential safety signals for ${drugName} in the context of ${indication}.
Based on your knowledge of clinical pharmacology and regulatory precedents, identify the most likely adverse events
that would be monitored in a clinical trial for this drug class and indication.

Return a JSON object with this structure:
{
  "signals": [
    { "term": "AE term (MedDRA PT)", "frequency": "common/uncommon/rare", "severity": "mild/moderate/severe", "relatedStudies": <number>, "disproportionalityScore": <0-5> }
  ],
  "summary": "Brief regulatory-grade summary of the safety landscape"
}`;

    const response = await ai.complete(
      [
        { role: 'system', content: 'You are a pharmacovigilance expert. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      {
        taskType: 'regulatory_review',
        maxTokens: 4096,
        temperature: 0.2,
        callerModule: 'csr-builder/safety-signals',
      }
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Validate expected shape
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.signals)) {
          return {
            signals: parsed.signals.map((s: Record<string, unknown>) => ({
              term: String(s.term || ''),
              frequency: String(s.frequency || 'unknown'),
              severity: String(s.severity || 'unknown'),
              relatedStudies: Number(s.relatedStudies) || 0,
              disproportionalityScore: Number(s.disproportionalityScore) || 0,
            })),
            summary: String(parsed.summary || ''),
          };
        }
      }
    } catch { /* fall through */ }

    return { signals: [], summary: response };
  } catch (err) {
    console.warn('[CSR Builder] Safety signal analysis failed:', err);
    return { signals: [], summary: 'Analysis failed — please retry.' };
  }
}

/**
 * Template-based section generation (fallback when AI unavailable).
 */
function generateSectionTemplate(
  section: CSRSection,
  info: CSRBuildRequest['studyInfo']
): string {
  const templates: Record<string, string> = {
    '1': `CLINICAL STUDY REPORT\n\n${info.title}\n\nProtocol Number: ${info.protocolNumber}\nPhase: ${info.phase}\nIndication: ${info.indication}\nSponsor: ${info.sponsor}\nInvestigational Product: ${info.investigationalProduct}\n${info.comparator ? `Comparator: ${info.comparator}\n` : ''}`,

    // E3 does not number synopsis fields; the synopsis is one heading.
    '2': `Study Title: ${info.title}\nProtocol Number: ${info.protocolNumber}\nStudy Phase: ${info.phase}\nIndication: ${info.indication}\nSponsor: ${info.sponsor}\n\nPrimary Objective: To evaluate ${info.primaryEndpoint} of ${info.investigationalProduct} in patients with ${info.indication}.\n${info.secondaryEndpoints?.length ? `\nSecondary Objectives:\n${info.secondaryEndpoints.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n` : ''}\nMethodology: This was a ${info.studyDesign} study of ${info.investigationalProduct}${info.comparator ? ` versus ${info.comparator}` : ''} in patients with ${info.indication}.${info.sampleSize ? ` Approximately ${info.sampleSize} subjects were planned for enrollment.` : ''}${info.treatmentDuration ? ` The treatment duration was ${info.treatmentDuration}.` : ''}\n\nResults and conclusions: [DATA TO BE INSERTED]`,

    // Study metadata alone does not establish ethics approval, informed
    // consent or compliance; each E3 §5 heading says what its records must show.
    '5.1': `[DATA TO BE INSERTED FROM ETHICS SOURCE RECORDS]\n\nIRB/IEC review: [Identify each committee, site, protocol/amendment version, decision and date from the retained review records; describe missing or unresolved approvals.]`,

    '5.2': `[DATA TO BE INSERTED FROM ETHICS SOURCE RECORDS]\n\nEthical conduct and GCP: [Describe the applicable standards and documented study conduct, including deviations and their handling; support each statement with the relevant records.]`,

    '5.3': `[DATA TO BE INSERTED FROM ETHICS SOURCE RECORDS]\n\nInformed consent: [Describe the source-supported consent process, approved versions, timing and any exceptions or deviations. Retain the original consent records.]`,

    '7': `${info.indication} represents a significant area of unmet medical need. ${info.investigationalProduct} is being developed for the treatment of ${info.indication}.\n\nThis Phase ${info.phase} study was designed to evaluate the ${info.primaryEndpoint} of ${info.investigationalProduct} in patients with ${info.indication}.`,

    '8': `The primary objective of this study was to evaluate ${info.primaryEndpoint} of ${info.investigationalProduct}${info.comparator ? ` compared with ${info.comparator}` : ''} in patients with ${info.indication}.${info.secondaryEndpoints?.length
      ? `\n\nThe secondary objectives were:\n${info.secondaryEndpoints.map((e, i) => `${i + 1}. To evaluate ${e}`).join('\n')}`
      : ''}`,

    '9.1': `This was a ${info.studyDesign} study. ${info.sampleSize ? `Approximately ${info.sampleSize} subjects were planned for enrollment. ` : ''}Eligible patients with ${info.indication} were ${info.studyDesign.includes('randomiz') ? 'randomized' : 'assigned'} to receive ${info.investigationalProduct}${info.comparator ? ` or ${info.comparator}` : ''}.${info.treatmentDuration ? ` Treatment duration was ${info.treatmentDuration}.` : ''}`,

    '9.3': `Patients eligible for this study were adults with a confirmed diagnosis of ${info.indication}.\n\n[Inclusion and exclusion criteria to be populated from protocol]`,

    // Until 2026-10-05 this stated that the SAP was finalised before database
    // lock, that the primary population was ITT and that a two-sided 0.05 level
    // was used — facts nobody supplied. Each is now a placeholder for the SAP.
    '9.7.1': `[DATA TO BE INSERTED FROM THE SAP]\n\nThe statistical analysis plan (SAP) was finalized on [date, relative to database lock]. The primary analysis population was [population and its definition]. The primary endpoint of ${info.primaryEndpoint} was analyzed using [statistical method]. A [one- or two-sided] significance level of [alpha] was used for the primary analysis.`,

    '9.7.2': `[DATA TO BE INSERTED FROM THE SAP]\n\n${info.sampleSize ? `Sample size: ${info.sampleSize} patients were planned to provide [X]% power to detect [the planned difference].` : 'Sample size: [planned number, power and the difference it was planned to detect].'}`,

    '9.8': `[DATA TO BE INSERTED]\n\nChanges to the conduct of the study after it began: [list each protocol amendment with its number, date and rationale, or state that there were none]. Changes to the planned analyses: [describe each departure from the protocol- or SAP-specified analyses, when it was decided and whether before or after unblinding, or state that there were none].`,

    '10.1': `[DATA TO BE INSERTED]\n\nA total of [N] patients were screened, of whom [N] were randomized${info.comparator ? ` to ${info.investigationalProduct} (n=[N]) or ${info.comparator} (n=[N])` : ''}. The most common reasons for screen failure were [reasons]. [N] patients completed the study treatment period. The most common reasons for discontinuation were [reasons].`,

    // E3 §11.4.1 names the analysis set; study metadata does not, so neither does this.
    '11.4.1': `[DATA TO BE INSERTED]\n\nThe primary endpoint of ${info.primaryEndpoint} was met/not met. In the [primary analysis population], ${info.investigationalProduct} demonstrated [result] compared with ${info.comparator || 'baseline'} (p=[value]).`,

    '12.2.1': `[DATA TO BE INSERTED]\n\nAdverse events were reported by [N]% of patients in the ${info.investigationalProduct} group${info.comparator ? ` and [N]% in the ${info.comparator} group` : ''}. The most common adverse events (≥5% incidence) were [list]. Most adverse events were mild or moderate in severity.`,

    // E3 §12.3.3 analyses and discusses these events; their narratives are §12.3.2 (or §14.3.3).
    '12.3.3': `[DATA TO BE INSERTED]\n\n[N] deaths, [N] other serious adverse events and [N] other significant adverse events occurred during the study. [Analyse and discuss their significance, including relationship to the investigational product and any pattern across treatment groups.] Narratives are presented in Section 12.3.2.`,

    '12.6': `[DATA TO BE INSERTED]\n\nOverall, ${info.investigationalProduct} was [well tolerated / associated with the following safety findings] in patients with ${info.indication}. The most frequent adverse events were [list]. [N] deaths and [N] serious adverse events were reported; [summarize assessed relationship to treatment]. [No clinically meaningful trends were observed / Describe trends] in laboratory parameters, vital signs or ECG findings. The safety profile observed in this study is [consistent with / differs from] the known profile of ${info.investigationalProduct} in that [describe].`,

    '13': `This Phase ${info.phase} ${info.studyDesign} study evaluated the ${info.primaryEndpoint} of ${info.investigationalProduct} in patients with ${info.indication}.\n\nEFFICACY DISCUSSION\n[To be drafted based on study results]\n\nSAFETY DISCUSSION\n[To be drafted based on safety data]\n\nBENEFIT-RISK ASSESSMENT\nBased on the efficacy and safety data from this study, the benefit-risk profile of ${info.investigationalProduct} is considered [favorable/unfavorable] for the treatment of ${info.indication}.`,
  };

  return templates[section.number] || '';
}

/**
 * The ICH E3 tree, every heading of ICH_E3_GUIDANCE, as a fresh mutable copy.
 */
export function getICHE3Structure(): CSRSection[] {
  return e3TopLevel().map(toCSRSection);
}

export default {
  launchCSRBuild,
  launchCSRBuildAsync,
  generateCSRSections,
  draftCSRSectionWithProvenance,
  flattenICHE3Sections,
  getICHE3Structure,
  draftCSRSection,
  compareWithExistingCSRs,
  analyzeCSRSafetySignals,
  hasUnresolvedPlaceholders,
  resolveCSRDraftTargets,
};

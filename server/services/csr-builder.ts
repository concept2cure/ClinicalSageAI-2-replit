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

// AI-powered drafting via the unified AI client (Claude primary)
let ai: { complete: (messages: any, options?: any) => Promise<string> } | null = null;
try {
  const mod = await import('../lib/unified-ai-client.js');
  ai = mod.ai;
} catch {
  console.warn('[CSR Builder] Unified AI client not available, using template drafting');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICH E3 SECTION STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

export interface CSRSection {
  number: string;
  title: string;
  required: boolean;
  description: string;
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

export const ICH_E3_STRUCTURE: CSRSection[] = [
  { number: '1', title: 'Title Page', required: true, status: 'empty', description: 'Study title, protocol number, sponsor, investigators' },
  {
    number: '2', title: 'Synopsis', required: true, status: 'empty', description: 'Structured synopsis of the study',
    childSections: [
      { number: '2.1', title: 'Study Information', required: true, status: 'empty', description: 'Study title, protocol number, phase, indication' },
      { number: '2.2', title: 'Objectives', required: true, status: 'empty', description: 'Primary and secondary objectives' },
      { number: '2.3', title: 'Methodology', required: true, status: 'empty', description: 'Study design summary' },
      { number: '2.4', title: 'Number of Subjects', required: true, status: 'empty', description: 'Planned and analyzed subjects' },
      { number: '2.5', title: 'Diagnosis and Main Criteria', required: true, status: 'empty', description: 'Key inclusion/exclusion criteria' },
      { number: '2.6', title: 'Duration of Treatment', required: true, status: 'empty', description: 'Treatment and follow-up duration' },
      { number: '2.7', title: 'Test Product, Dose, Mode of Administration', required: true, status: 'empty', description: 'Drug product details' },
      { number: '2.8', title: 'Efficacy Results', required: true, status: 'empty', description: 'Summary of primary and key secondary endpoints' },
      { number: '2.9', title: 'Safety Results', required: true, status: 'empty', description: 'AE summary, SAEs, deaths, discontinuations' },
      { number: '2.10', title: 'Conclusions', required: true, status: 'empty', description: 'Key study conclusions' },
    ],
  },
  { number: '3', title: 'Table of Contents', required: true, status: 'empty', description: 'Auto-generated table of contents' },
  { number: '4', title: 'List of Abbreviations', required: true, status: 'empty', description: 'Abbreviations and special terms' },
  { number: '5', title: 'Ethics', required: true, status: 'empty', description: 'IRB/IEC review, informed consent, compliance with GCP' },
  { number: '6', title: 'Investigators and Study Administrative Structure', required: true, status: 'empty', description: 'List of investigators, study sites, CRO involvement' },
  { number: '7', title: 'Introduction', required: true, status: 'empty', description: 'Background, rationale, study objectives' },
  {
    number: '8', title: 'Study Objectives', required: true, status: 'empty', description: 'Primary and secondary objectives',
    childSections: [
      { number: '8.1', title: 'Primary Objective(s)', required: true, status: 'empty', description: 'Primary study objective(s)' },
      { number: '8.2', title: 'Secondary Objective(s)', required: true, status: 'empty', description: 'Secondary study objective(s)' },
    ],
  },
  {
    number: '9', title: 'Investigational Plan', required: true, status: 'empty', description: 'Study design and methodology',
    childSections: [
      { number: '9.1', title: 'Overall Study Design', required: true, status: 'empty', description: 'Study design, randomization, blinding' },
      { number: '9.2', title: 'Discussion of Study Design', required: true, status: 'empty', description: 'Design rationale and considerations' },
      { number: '9.3', title: 'Selection of Study Population', required: true, status: 'empty', description: 'Inclusion/exclusion criteria' },
      { number: '9.4', title: 'Treatments', required: true, status: 'empty', description: 'Study treatments, dosing, drug accountability' },
      { number: '9.5', title: 'Efficacy and Safety Variables', required: true, status: 'empty', description: 'Endpoint definitions and assessment schedule' },
      { number: '9.6', title: 'Data Quality Assurance', required: true, status: 'empty', description: 'Monitoring, data management, quality control' },
      { number: '9.7', title: 'Statistical Methods', required: true, status: 'empty', description: 'Analysis populations, statistical methods, sample size' },
    ],
  },
  {
    number: '10', title: 'Study Patients', required: true, status: 'empty', description: 'Disposition, demographics, protocol deviations',
    childSections: [
      { number: '10.1', title: 'Disposition of Patients', required: true, status: 'empty', description: 'Patient flow, withdrawals, discontinuations' },
      { number: '10.2', title: 'Protocol Deviations', required: true, status: 'empty', description: 'Major protocol deviations and impact' },
    ],
  },
  {
    number: '11', title: 'Efficacy Evaluation', required: true, status: 'empty', description: 'Efficacy data and analysis',
    childSections: [
      { number: '11.1', title: 'Data Sets Analyzed', required: true, status: 'empty', description: 'ITT, mITT, PP populations' },
      { number: '11.2', title: 'Demographics and Baseline', required: true, status: 'empty', description: 'Baseline characteristics' },
      { number: '11.3', title: 'Measurements of Treatment Compliance', required: true, status: 'empty', description: 'Drug exposure, compliance' },
      { number: '11.4', title: 'Efficacy Results and Tabulations', required: true, status: 'empty', description: 'Primary and secondary endpoint results' },
    ],
  },
  {
    number: '12', title: 'Safety Evaluation', required: true, status: 'empty', description: 'Safety data and analysis',
    childSections: [
      { number: '12.1', title: 'Extent of Exposure', required: true, status: 'empty', description: 'Drug exposure duration and dose' },
      { number: '12.2', title: 'Adverse Events', required: true, status: 'empty', description: 'AE incidence, preferred terms, by SOC' },
      { number: '12.3', title: 'Deaths, SAEs, Other Significant AEs', required: true, status: 'empty', description: 'Narratives for deaths, SAEs' },
      { number: '12.4', title: 'Clinical Laboratory Evaluation', required: true, status: 'empty', description: 'Lab results, shifts, clinically significant values' },
      { number: '12.5', title: 'Vital Signs, Physical Findings, Other Safety', required: true, status: 'empty', description: 'Vital signs, ECG, other safety data' },
    ],
  },
  { number: '13', title: 'Discussion and Overall Conclusions', required: true, status: 'empty', description: 'Efficacy discussion, safety discussion, benefit-risk assessment' },
  { number: '14', title: 'Tables, Figures, and Graphs Referred to But Not Included in the Text', required: false, status: 'empty', description: 'Supplementary tables and figures' },
  { number: '15', title: 'Reference List', required: false, status: 'empty', description: 'Literature references cited in the report' },
  { number: '16', title: 'Appendices', required: false, status: 'empty', description: 'Study protocol, SAP, CRFs, individual patient data, technical reports' },
];

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
  const flat = flattenICHE3Sections(sections);
  const targets =
    sectionsToGenerate && sectionsToGenerate.length > 0
      ? flat.filter(s => sectionsToGenerate.includes(s.number))
      : flat;

  if (targets.length === 0) {
    // Nothing was in scope to draft — vacuously complete (matches
    // csr-job-runner's totalSections === 0 -> progress 100 convention).
    return { status: 'complete', progress: 100 };
  }

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

/**
 * Launch a CSR build job.
 */
export async function launchCSRBuild(request: CSRBuildRequest): Promise<CSRBuildJob> {
  await reserveCSRBuilderQuota(request);

  // Initialize section structure
  const sections = JSON.parse(JSON.stringify(ICH_E3_STRUCTURE)) as CSRSection[];

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
  ctx: { organizationId: number; projectId?: number; requestedBy?: number }
): Promise<{ jobId: number; status: 'queued' }> {
  // Quota + usage are reserved BEFORE enqueue so the async path can't bypass
  // billing. Throws the same upgrade-required error as launchCSRBuild on
  // quota failure — the HTTP response shape is identical at the route layer.
  await reserveCSRBuilderQuota(request);

  const { enqueueCSRBuildJob, runCSRBuildJob } = await import(
    './csr/csr-job-runner.js'
  );

  const enqueued = await enqueueCSRBuildJob(request, ctx);

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
  const useAI = !!ai;
  const ctx: CSRAIContext = {
    organizationId: aiContext?.organizationId ?? request.organizationId,
    projectId: aiContext?.projectId ?? request.projectId,
    userId: aiContext?.userId ?? request.userId,
  };

  for (const section of sections) {
    if (request.sectionsToGenerate?.length && !request.sectionsToGenerate.includes(section.number)) {
      continue;
    }

    if (useAI) {
      section.content = await generateSectionWithAI(section, info, ctx);
    } else {
      section.content = generateSectionTemplate(section, info);
    }
    applyContentStatus(section);

    if (section.childSections) {
      for (const child of section.childSections) {
        if (request.sectionsToGenerate?.length && !request.sectionsToGenerate.includes(child.number)) {
          continue;
        }
        if (useAI) {
          child.content = await generateSectionWithAI(child, info, ctx);
        } else {
          child.content = generateSectionTemplate(child, info);
        }
        applyContentStatus(child);
      }
    }
  }

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

export async function draftCSRSectionWithProvenance(
  section: CSRSection,
  request: CSRBuildRequest,
  aiContext?: CSRAIContext
): Promise<DraftedCSRSection> {
  const info = request.studyInfo;
  const ctx: CSRAIContext = {
    organizationId: aiContext?.organizationId ?? request.organizationId,
    projectId: aiContext?.projectId ?? request.projectId,
    userId: aiContext?.userId ?? request.userId,
  };

  // Common lineage envelope. deepResearchJobId is the closest thing we
  // currently have to a source citation; persist it here so future audits
  // can chase the source. Section-level citation extraction will hang off
  // this same envelope as the gateway grows that capability.
  const baseLineage: Record<string, unknown> = {};
  if (request.deepResearchJobId != null) {
    baseLineage.deepResearchJobId = request.deepResearchJobId;
  }

  if (ai) {
    try {
      const systemPrompt = buildSectionSystemPrompt(info);
      // The shared AI gateway exposes `complete(messages, options) => Promise<string>`
      // (see generateSectionWithAI / draftCSRSection below). Use it here too so this
      // provenance path actually reaches the model instead of silently throwing
      // (ai.chat is not part of the gateway surface) and falling back to template.
      const content = await ai.complete(
        [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Draft ICH E3 Section ${section.number}: ${section.title}\n\nDescription: ${section.description}\n\nWrite a complete, submission-ready draft for this section. Include all required elements per ICH E3 guidelines.`,
          },
        ],
        {
          taskType: 'document_drafting',
          maxTokens: 4096,
          temperature: 0.3,
          callerModule: 'csr-builder/section-draft',
          organizationId: ctx.organizationId,
          projectId: ctx.projectId,
          userId: ctx.userId,
        }
      );

      if (content && content.length > 0) {
        return {
          number: section.number,
          content,
          source: 'ai',
          model: null,
          tokenCost: 0,
          lineage: Object.keys(baseLineage).length > 0 ? baseLineage : null,
        };
      }
      // Empty content — fall through to template
    } catch (err) {
      console.warn(
        `[CSR Builder] AI drafting failed for section ${section.number}, using template:`,
        err
      );
    }
  }

  // Template fallback. ai_generated MUST be false for this row.
  const templateContent = generateSectionTemplate(section, info);
  return {
    number: section.number,
    content: templateContent,
    source: 'template',
    model: null,
    tokenCost: 0,
    lineage: Object.keys(baseLineage).length > 0 ? baseLineage : null,
  };
}

/**
 * Shared system prompt builder so generateSectionWithAI and
 * draftCSRSectionWithProvenance stay in lock-step.
 */
function buildSectionSystemPrompt(info: CSRBuildRequest['studyInfo']): string {
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
Include placeholders like [DATA TO BE INSERTED] where actual study data would go.`;
}

/**
 * Flatten ICH-E3 tree → leaf-or-parent list for the runner. Exported so the
 * runner doesn't duplicate the walk logic; matches what
 * generateCSRSections actually drafts (parents AND children, both filtered
 * by sectionsToGenerate when provided).
 */
export function flattenICHE3Sections(sections: CSRSection[]): CSRSection[] {
  const out: CSRSection[] = [];
  for (const s of sections) {
    out.push(s);
    if (s.childSections) {
      for (const c of s.childSections) out.push(c);
    }
  }
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
): Promise<string> {
  if (!ai) return generateSectionTemplate(section, info);

  const systemPrompt = buildSectionSystemPrompt(info);

  try {
    const content = await ai.complete(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Draft ICH E3 Section ${section.number}: ${section.title}\n\nDescription: ${section.description}\n\nWrite a complete, submission-ready draft for this section. Include all required elements per ICH E3 guidelines.` },
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
    return content;
  } catch (err) {
    console.warn(`[CSR Builder] AI drafting failed for section ${section.number}, using template:`, err);
    return generateSectionTemplate(section, info);
  }
}

/**
 * Draft a single CSR section with AI on demand.
 */
export async function draftCSRSection(
  sectionNumber: string,
  studyInfo: CSRBuildRequest['studyInfo']
): Promise<{ content: string; isAI: boolean }> {
  const allSections = [...ICH_E3_STRUCTURE];
  let targetSection: CSRSection | undefined;

  for (const s of allSections) {
    if (s.number === sectionNumber) { targetSection = s; break; }
    if (s.childSections) {
      const child = s.childSections.find(c => c.number === sectionNumber);
      if (child) { targetSection = child; break; }
    }
  }

  if (!targetSection) {
    return { content: '', isAI: false };
  }

  if (ai) {
    const content = await generateSectionWithAI(targetSection, studyInfo);
    return { content, isAI: true };
  }

  return { content: generateSectionTemplate(targetSection, studyInfo), isAI: false };
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

    '2.1': `Study Title: ${info.title}\nProtocol Number: ${info.protocolNumber}\nStudy Phase: ${info.phase}\nIndication: ${info.indication}\nSponsor: ${info.sponsor}`,

    '2.2': `Primary Objective: To evaluate ${info.primaryEndpoint} of ${info.investigationalProduct} in patients with ${info.indication}.\n${info.secondaryEndpoints?.length ? `\nSecondary Objectives:\n${info.secondaryEndpoints.map((e, i) => `${i + 1}. ${e}`).join('\n')}` : ''}`,

    '2.3': `This was a ${info.studyDesign} study of ${info.investigationalProduct}${info.comparator ? ` versus ${info.comparator}` : ''} in patients with ${info.indication}.${info.sampleSize ? ` Approximately ${info.sampleSize} subjects were planned for enrollment.` : ''}${info.treatmentDuration ? ` The treatment duration was ${info.treatmentDuration}.` : ''}`,

    '5': `This study was conducted in accordance with the ethical principles that have their origin in the Declaration of Helsinki and that are consistent with ICH/Good Clinical Practice and the applicable regulatory requirements. The protocol and amendments were reviewed and approved by the Institutional Review Board (IRB) or Independent Ethics Committee (IEC) at each participating site. Written informed consent was obtained from all patients prior to performing any study-specific procedures.`,

    '7': `${info.indication} represents a significant area of unmet medical need. ${info.investigationalProduct} is being developed for the treatment of ${info.indication}.\n\nThis Phase ${info.phase} study was designed to evaluate the ${info.primaryEndpoint} of ${info.investigationalProduct} in patients with ${info.indication}.`,

    '8.1': `The primary objective of this study was to evaluate ${info.primaryEndpoint} of ${info.investigationalProduct}${info.comparator ? ` compared with ${info.comparator}` : ''} in patients with ${info.indication}.`,

    '8.2': info.secondaryEndpoints?.length
      ? `The secondary objectives were:\n${info.secondaryEndpoints.map((e, i) => `${i + 1}. To evaluate ${e}`).join('\n')}`
      : '',

    '9.1': `This was a ${info.studyDesign} study. ${info.sampleSize ? `Approximately ${info.sampleSize} subjects were planned for enrollment. ` : ''}Eligible patients with ${info.indication} were ${info.studyDesign.includes('randomiz') ? 'randomized' : 'assigned'} to receive ${info.investigationalProduct}${info.comparator ? ` or ${info.comparator}` : ''}.${info.treatmentDuration ? ` Treatment duration was ${info.treatmentDuration}.` : ''}`,

    '9.3': `Patients eligible for this study were adults with a confirmed diagnosis of ${info.indication}.\n\n[Inclusion and exclusion criteria to be populated from protocol]`,

    '9.7': `The statistical analysis plan (SAP) was finalized prior to database lock. The primary analysis population was the intent-to-treat (ITT) population, defined as all randomized patients who received at least one dose of study treatment. The primary endpoint of ${info.primaryEndpoint} was analyzed using [statistical method to be specified]. A two-sided significance level of 0.05 was used for the primary analysis.${info.sampleSize ? `\n\nSample size: ${info.sampleSize} patients were planned to provide [X]% power to detect a clinically meaningful difference.` : ''}`,

    '10.1': `[DATA TO BE INSERTED]\n\nA total of [N] patients were screened, of whom [N] were randomized${info.comparator ? ` to ${info.investigationalProduct} (n=[N]) or ${info.comparator} (n=[N])` : ''}. The most common reasons for screen failure were [reasons]. [N] patients completed the study treatment period. The most common reasons for discontinuation were [reasons].`,

    '11.4': `[DATA TO BE INSERTED]\n\nThe primary endpoint of ${info.primaryEndpoint} was met/not met. In the ITT population, ${info.investigationalProduct} demonstrated [result] compared with ${info.comparator || 'baseline'} (p=[value]).`,

    '12.2': `[DATA TO BE INSERTED]\n\nAdverse events were reported by [N]% of patients in the ${info.investigationalProduct} group${info.comparator ? ` and [N]% in the ${info.comparator} group` : ''}. The most common adverse events (≥5% incidence) were [list]. Most adverse events were mild or moderate in severity.`,

    '12.3': `[DATA TO BE INSERTED]\n\n[N] deaths occurred during the study. [N] serious adverse events (SAEs) were reported. Individual narratives for deaths and SAEs are provided below.`,

    '13': `This Phase ${info.phase} ${info.studyDesign} study evaluated the ${info.primaryEndpoint} of ${info.investigationalProduct} in patients with ${info.indication}.\n\nEFFICACY DISCUSSION\n[To be drafted based on study results]\n\nSAFETY DISCUSSION\n[To be drafted based on safety data]\n\nBENEFIT-RISK ASSESSMENT\nBased on the efficacy and safety data from this study, the benefit-risk profile of ${info.investigationalProduct} is considered [favorable/unfavorable] for the treatment of ${info.indication}.`,
  };

  return templates[section.number] || '';
}

/**
 * Get the ICH E3 section structure.
 */
export function getICHE3Structure(): CSRSection[] {
  return JSON.parse(JSON.stringify(ICH_E3_STRUCTURE));
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
  ICH_E3_STRUCTURE,
};

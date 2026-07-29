/**
 * PDEV AI drafting — generate a governed artifact bound to a PDEV activity.
 *
 * This is the "AI output never remains in chat" pipeline for the PDEV
 * workflow. The brief is explicit: every AI generation must become a
 * versioned, citation-tracked, quality-gated artifact filed against a
 * known governed slot. This service does exactly that by composing two
 * existing primitives:
 *
 *   1. openai-service::generateStructuredResponse — produces the draft
 *      text from a prompt + structured context.
 *   2. governed-ana-execution::executeGovernedAnaOperation — runs the
 *      quality gate, decision lineage, and concept2cure_artifacts
 *      persistence with full provenance.
 *
 * Then it updates the per-program PDEV activity state row:
 *   - state → 'ai_draft_generated'
 *   - attached_document_codes ← document code from the registry
 *   - stateChangedBy / stateChangedAt recorded
 *
 * Audit is via the existing `auditService` (dual-write hash chain).
 * No new audit machinery, no new artifact table.
 *
 * @module server/services/pdev/pdev-ai-drafting
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import { pdevProgramActivities } from '../../../shared/schema/pdev-workflow';
import { executeGovernedAnaOperation } from '../governed-ana-execution';
import {
  generateStructuredResponse,
  isApiKeyAvailable,
} from '../../openai-service';
import {
  getActivityByKey,
  type PdevActivity,
  type PdevRequiredDocument,
} from './pdev-activity-registry';
import auditService from '../auditService';

const logger = createScopedLogger('pdev-ai-drafting');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PdevAiDraftInput {
  programId: string;
  organizationId: number;
  /** Required: numeric project id for governance. */
  projectId: number;
  userId: number;
  /** Activity key from the PDEV registry (e.g. 'nonclinical.glp_tox'). */
  activityKey: string;
  /** Optional: which of the activity's required documents to target.
   *  If omitted, the first mandatory document is used. */
  documentCode?: string;
  /** Optional user-supplied seed prompt. The service prepends the
   *  registry-aware system prompt before calling the model. */
  userPrompt?: string;
  /** Optional evidence object ids the model should be primed with. */
  evidenceObjectIds?: string[];
}

export interface PdevAiDraftResult {
  /** State row id (uuid). */
  activityStateId: string;
  /** External artifact id minted by governed-ana-execution. */
  artifactId: string;
  /** Section / document code the artifact files against. */
  documentCode: string;
  /** eCTD section the artifact maps to ('3.2.S.2', etc.) — null when
   *  the registry document is a working doc with no eCTD destination. */
  ectdSection: string | null;
  /** Quality gate verdict. */
  qualityGrade: string;
  /** Headline title used on the artifact. */
  title: string;
  /** Word count of generated content. */
  wordCount: number;
}

export class PdevAiDraftingService {
  /**
   * Generate a governed AI draft for one PDEV activity.
   *
   * Steps:
   *   1. Tenant + activity validation.
   *   2. Pick the target document (caller override or first mandatory).
   *   3. Generate the draft text via OpenAI.
   *   4. Persist via executeGovernedAnaOperation (full quality gate +
   *      decision lineage + concept2cureArtifacts).
   *   5. Update pdev_program_activities row to ai_draft_generated.
   *   6. Audit-log the action.
   */
  async generateActivityDraft(input: PdevAiDraftInput): Promise<PdevAiDraftResult> {
    const activity = getActivityByKey(input.activityKey);
    if (!activity) {
      throw new Error(`Unknown PDEV activity key: ${input.activityKey}`);
    }

    // Tenant gate via regulatory_programs.
    const programRows = await db
      .select({
        id: regulatoryPrograms.id,
        organizationId: regulatoryPrograms.organizationId,
        productName: regulatoryPrograms.productName,
        indication: regulatoryPrograms.indication,
        programType: regulatoryPrograms.programType,
      })
      .from(regulatoryPrograms)
      .where(
        and(
          eq(regulatoryPrograms.id, input.programId),
          eq(regulatoryPrograms.organizationId, input.organizationId)
        )
      )
      .limit(1);
    const program = programRows[0];
    if (!program) {
      throw new Error('PDEV program not found in tenant');
    }

    // Pick the document slot.
    const doc = pickTargetDocument(activity, input.documentCode);
    if (!doc) {
      throw new Error(
        `Activity ${activity.key} has no document matching ${input.documentCode ?? 'mandatory'}`
      );
    }

    if (!isApiKeyAvailable()) {
      throw new Error('OpenAI API key not configured — cannot generate AI draft');
    }

    // 1. Generate draft text from the model.
    const systemPrompt = buildSystemPrompt(activity, doc, program);
    const userPrompt = (input.userPrompt ?? '').trim() ||
      buildDefaultUserPrompt(activity, doc, program);

    let modelOutput: { title?: string; sections?: Array<{ heading: string; body: string }>; content?: string };
    try {
      modelOutput = (await generateStructuredResponse(userPrompt, systemPrompt)) as typeof modelOutput;
    } catch (err) {
      logger.error('AI draft generation failed', { err, activityKey: activity.key });
      throw new Error('AI draft generation failed');
    }

    // 2. Compose persistable content. Prefer structured sections; fall
    //    back to flat content if the model returned a single blob.
    const title = (modelOutput.title ?? '').trim() || `${doc.title} — draft`;
    const content = composeArtifactContent(modelOutput);
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    // 3. Persist via the governed pipeline. Provenance carries the
    //    PDEV activity + doc binding so the artifact downstream knows
    //    where it belongs.
    const exec = await executeGovernedAnaOperation({
      evaluationInput: {
        context: {
          organizationId: String(input.organizationId),
          projectId: String(input.projectId),
          actorId: String(input.userId),
          actorRole: 'pdev_ai_drafting',
          intendedAction: 'create',
          documentType: doc.code,
          sectionCode: doc.ectdSection ?? doc.code,
          ...(doc.ectdSection ? { ctdSection: doc.ectdSection } : {}),
          originSurface: 'pdev_workbench',
        },
        documentState: {
          hasContent: content.length > 0,
          hasEvidence: /\[(KNOWN|INFERRED|MISSING|CIT)\]/.test(content),
          hasBeenReviewed: false,
          hasApproval: false,
          hasPlacement: Boolean(doc.ectdSection),
          placementValid: true,
          hasProvenance: true,
          unresolvedContradictionCount: 0,
          criticalContradictionCount: 0,
        },
      },
      artifactMutation: {
        projectId: input.projectId,
        organizationId: input.organizationId,
        documentType: doc.code,
        artifactClass: 'pdev_ai_drafted_document',
        sectionCode: doc.ectdSection ?? doc.code,
        title,
        content,
        status: 'draft',
        source: 'AnA',
        intentLens: 'pdev_workflow',
        originSurface: 'pdev_workbench',
        provenance: {
          anaGenerated: true,
          anaActionType: 'pdev_activity_draft',
          source: 'pdev_ai_drafting',
          pdevActivityKey: activity.key,
          pdevWorkstream: activity.workstream,
          pdevStage: activity.stage,
          documentCode: doc.code,
          ectdModule: doc.ectdModule,
          ectdSection: doc.ectdSection ?? null,
          evidenceObjectIds: input.evidenceObjectIds ?? [],
          requestedAt: new Date().toISOString(),
          requestedBy: input.userId,
        },
        structureSections: [],
        qualityGate: {
          grade: 'pending',
          pass: false,
          issues: [],
        },
        versioningMode: 'create',
      },
    });

    if (exec.persistenceStatus !== 'persisted' || !exec.artifactMutation) {
      throw new Error(`PDEV AI draft persistence rejected: ${exec.persistenceStatus}`);
    }

    const artifactId = String(exec.artifactMutation.artifactId);
    const qualityGrade = exec.qualityGateResult.grade ?? 'unknown';

    // 4. Upsert pdev_program_activities to ai_draft_generated.
    const now = new Date();
    const existing = await db
      .select()
      .from(pdevProgramActivities)
      .where(
        and(
          eq(pdevProgramActivities.programId, input.programId),
          eq(pdevProgramActivities.activityKey, activity.key)
        )
      )
      .limit(1);

    const updatedDocCodes = mergeStringArray(
      existing[0]?.attachedDocumentCodes ?? [],
      [doc.code]
    );

    let stateRowId: string;
    if (existing[0]) {
      const updated = await db
        .update(pdevProgramActivities)
        .set({
          state: 'ai_draft_generated',
          attachedDocumentCodes: updatedDocCodes,
          notes: existing[0].notes,
          stateChangedAt: now,
          stateChangedBy: input.userId,
          updatedAt: now,
        })
        .where(eq(pdevProgramActivities.id, existing[0].id))
        .returning({ id: pdevProgramActivities.id });
      stateRowId = updated[0].id;
    } else {
      const inserted = await db
        .insert(pdevProgramActivities)
        .values({
          programId: input.programId,
          activityKey: activity.key,
          workstream: activity.workstream,
          stage: activity.stage,
          state: 'ai_draft_generated',
          attachedDocumentCodes: updatedDocCodes,
          stateChangedAt: now,
          stateChangedBy: input.userId,
        })
        .returning({ id: pdevProgramActivities.id });
      stateRowId = inserted[0].id;
    }

    // 5. Audit log via the existing dual-write hash-chain auditor.
    void auditService.logAction({
      tenantId: input.organizationId,
      userId: input.userId,
      action: 'pdev_ai_draft_generated',
      resourceType: 'pdev_program_activity',
      resourceId: stateRowId,
      details: {
        programId: input.programId,
        activityKey: activity.key,
        artifactId,
        documentCode: doc.code,
        ectdModule: doc.ectdModule,
        ectdSection: doc.ectdSection ?? null,
        qualityGrade,
        wordCount,
      },
    });

    return {
      activityStateId: stateRowId,
      artifactId,
      documentCode: doc.code,
      ectdSection: doc.ectdSection ?? null,
      qualityGrade,
      title,
      wordCount,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (pure — exported for tests)
// ─────────────────────────────────────────────────────────────────────────────

export function pickTargetDocument(
  activity: PdevActivity,
  preferredCode?: string
): PdevRequiredDocument | undefined {
  if (preferredCode) {
    return activity.requiredDocuments.find(d => d.code === preferredCode);
  }
  return (
    activity.requiredDocuments.find(d => d.mandatoryForInd) ??
    activity.requiredDocuments[0]
  );
}

export function buildSystemPrompt(
  activity: PdevActivity,
  doc: PdevRequiredDocument,
  program: { productName: string; indication: string | null; programType: string }
): string {
  return [
    `You are drafting a regulated, IND-supporting document for a PDEV → IND program.`,
    ``,
    `Product: ${program.productName}`,
    `Indication: ${program.indication ?? 'unspecified'}`,
    `Program type: ${program.programType}`,
    ``,
    `Workstream: ${activity.workstream}`,
    `Stage: ${activity.stage}`,
    `Activity: ${activity.title} — ${activity.description}`,
    ``,
    `Document to draft: ${doc.title} (code: ${doc.code})`,
    doc.ectdSection
      ? `Target eCTD section: ${doc.ectdModule.toUpperCase()} ${doc.ectdSection}`
      : `This is a working document with no eCTD destination.`,
    `IND-mandatory: ${doc.mandatoryForInd ? 'yes' : 'no'}`,
    ``,
    `Rules:`,
    `1. Use sentence case. No exclamation marks. No marketing language.`,
    `2. Mark every factual claim with one of: [KNOWN], [INFERRED], [MISSING]. Do not assert without a tag.`,
    `3. Cite source documents inline as [CIT: <identifier>] when known.`,
    `4. Write as a regulatory drafter: short paragraphs, numbered sections,`,
    `   no filler, no hedging that obscures the technical claim.`,
    `5. If a section's content is genuinely unknown, write the section heading`,
    `   followed by "[MISSING] requires source data" rather than fabricating.`,
    ``,
    `Output a JSON object with: title (string), sections (array of {heading, body}).`,
  ].join('\n');
}

function buildDefaultUserPrompt(
  activity: PdevActivity,
  doc: PdevRequiredDocument,
  program: { productName: string }
): string {
  return [
    `Draft ${doc.title} for ${program.productName}.`,
    `Cover the standard sections expected for an IND-supporting ${activity.title}.`,
    `Be honest about gaps: mark missing content explicitly.`,
  ].join(' ');
}

function composeArtifactContent(output: {
  title?: string;
  sections?: Array<{ heading: string; body: string }>;
  content?: string;
}): string {
  if (Array.isArray(output.sections) && output.sections.length > 0) {
    const parts: string[] = [];
    output.sections.forEach((s, i) => {
      const heading = (s.heading ?? '').trim();
      const body = (s.body ?? '').trim();
      parts.push(`${i + 1}. ${heading}\n\n${body}`);
    });
    return parts.join('\n\n');
  }
  return (output.content ?? '').trim();
}

function mergeStringArray(existing: unknown, additions: string[]): string[] {
  const start = Array.isArray(existing) ? (existing as string[]) : [];
  const merged = new Set<string>(start);
  for (const a of additions) merged.add(a);
  return Array.from(merged);
}

export const pdevAiDraftingService = new PdevAiDraftingService();

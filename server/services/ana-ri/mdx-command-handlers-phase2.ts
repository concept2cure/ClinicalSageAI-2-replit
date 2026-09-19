/**
 * AnA MDX command handlers — phase 2.
 *
 * Adds the remaining MDX tools beyond phase 1:
 *   - gspr.mapping.upsert
 *   - post_market.document.{create, update, validate, approve, supersede}
 *   - evidence_sufficiency.assess
 *   - reviewer_simulation.run
 *
 * Same contract as phase 1: every state-mutating handler enforces
 * confirm + reason via requireAgentConfirm; reads are gated lighter
 * (assess + reviewer_simulation are persisted-side-effect runs, so
 * they DO require confirm + reason despite being analysis actions).
 *
 * Audit rows: every handler below writes its `agent.ana.<verb>` 21 CFR Part 11
 * §11.10(e) row through `recordAuditRow`, and the OUTCOME of that write reaches
 * the caller in `data.agentAuditTrail` and as a clause on `message` — see
 * `auditNote` below and WO-16C finding 133.
 *
 * Tools NOT yet wired (gated on external work, not laziness):
 *   - correspondence.ingest — needs Brief #2 surface for AnA-driven
 *     ingestion to make sense. Direct service call without UI is
 *     low-value.
 *   - predicate.candidate.set_status / se_matrix.patch — proxy through
 *     the BFF route since the underlying mutation lives in the Python
 *     shadow service. Phase 3 can add an internal-fetch handler when
 *     we wire the shadow's tool surface.
 */

import { recordAuditRow, type AuditRowOutcome } from '../audit/audit-write-outcome';
import {
  upsertMapping,
} from '../gspr-postmarket/gspr.service';
import {
  approveDocument,
  createDocument,
  supersedeDocument,
  updateDocument,
  validateDocument,
  getDocument,
  type ApproveArgs,
} from '../gspr-postmarket/post-market.service';
import {
  assessSufficiency,
  type DeviceProfileFlags,
} from '../evidence-sufficiency/evidence-sufficiency.service';
import { runReviewerSimulation } from '../intelligence-engine/reviewer-simulator.service';
import type { CommandContext, CommandResult } from './command-executor';
import { requireGovernedToolGate, mapServiceError, agentAuditDetails } from './mdx-tool-policy';

// ─── Local helpers ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The clause a handler appends to its own message when the 21 CFR Part 11
 * §11.10(e) row for its `agent.ana.<verb>` action did not reach a durable
 * store.
 *
 * WO-16C finding 133. Every handler in this file wrote its audit row with
 * `void auditService.logAction({…})`. `logAction` never rejects when
 * persistence fails — that is deliberate policy, an audit-trail outage must not
 * break the user action it records — it RESOLVES an `AuditWriteResult` and
 * reports what happened in `persisted`. Discarding that value left each handler
 * with two possible outcomes and one observable result: the `CommandResult`, the
 * AnA turn built from it and the sentence read back to the regulated user were
 * byte-identical whether the agent-initiated record existed or did not.
 *
 * Seven of the nine rows sit beside a mutation that had ALREADY COMMITTED by the
 * time the audit write was attempted. The other two do not, and saying "the
 * mutation underneath had already committed" of all nine — as an earlier version
 * of this docstring did — is false, and contradicted 450 lines below by this
 * file's own notes at the two sites: the approve-refusal row records an ATTEMPT
 * that mutated nothing (`approveDocument` returns NOT_FOUND / ALREADY_LOCKED /
 * GATE_BLOCKED before its UPDATE), and the validate row records an INSPECTION
 * that mutates nothing (`getDocument` reads and `validateDocument` is pure). A
 * reviewer caught the contradiction; the correction is left visible because which
 * of the two a site is decides whether a lost row is a lost log or a lost record.
 *
 * So the outcome travels twice, because this surface has two kinds of reader:
 * `data.agentAuditTrail` for anything parsing the structure, and this clause in
 * `message` for the conversational turn. On the TOOL dispatch path that clause is
 * what the model is handed and told to report verbatim
 * (AnaToolExecutor.ts:5069-5077). On the chat action-block path it is not: the
 * turn is built from the model's own prose and the handler's `message` travels
 * only inside `post_done.executedCommands`, whose one client consumer skips
 * every result but a signature-required one — so an earlier version of this
 * docstring calling the clause "the only part a chat user ever sees" overstated
 * one path's guarantee onto both. The mutation is never reverted — reverting a committed governed
 * write because its log row was lost is the worse lie — and the store's own
 * error text never appears here: `recordAuditRow` has already logged it against
 * the action and resource id.
 *
 * The field is `agentAuditTrail`, matching the sibling AnA PDEV handlers, so
 * this agent-initiated row is never confused with an `auditTrail` a spread
 * service result reports for a row of its own. Each handler here writes exactly
 * one audit row per invocation, so one key per response is unambiguous:
 * `post_market.document.approve` writes either its `…approve.blocked` row or
 * its `…approve` row, never both, and the two never appear in one result.
 */
function auditNote(outcome: AuditRowOutcome): string {
  return outcome.persisted ? '' : ` ${outcome.message}`;
}

// ─── GSPR mapping upsert ────────────────────────────────────────────────────

export async function gsprMappingUpsert(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'gspr.mapping.upsert';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const programId = typeof params.programId === 'string' ? params.programId : '';
  if (!UUID_RE.test(programId)) {
    return { success: false, action, message: 'programId must be a UUID.', error: 'INVALID_INPUT' };
  }
  const requirementId = typeof params.requirementId === 'string' ? params.requirementId : '';
  if (!requirementId) {
    return { success: false, action, message: 'requirementId is required.', error: 'INVALID_INPUT' };
  }
  const applicability = typeof params.applicability === 'string' ? params.applicability : '';
  if (!applicability) {
    return { success: false, action, message: 'applicability is required.', error: 'INVALID_INPUT' };
  }

  try {
    const row = await upsertMapping({
      organizationId: ctx.organizationId,
      programId,
      requirementId,
      applicability: applicability as any,
      decidedBy: `ana:${ctx.userId}`,
      decidedAt: new Date(),
    });

    // WO-16C #133: was `void auditService.logAction({…})`, so a GSPR
    // applicability decision already written to gspr_program_mappings by
    // `upsertMapping` above reported `success: true` with no way to tell a
    // recorded decision from an unrecorded one. The mapping row stands — this
    // is a log beside a committed mutation — and the outcome now leaves in
    // `data.agentAuditTrail` and in the message clause.
    const agentAuditTrail = await recordAuditRow({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.gspr.mapping.upsert',
      resourceType: 'gspr_program_mapping',
      resourceId: String((row as any)?.id ?? `${programId}:${requirementId}`),
      details: {
        ...agentAuditDetails(ctx, gate),
        programId,
        requirementId,
        applicability,
      },
    });

    return {
      success: true,
      action,
      data: { ...(row as Record<string, unknown>), agentAuditTrail },
      message: `Upserted GSPR mapping (${requirementId} → ${applicability}) on program ${programId}.${auditNote(agentAuditTrail)}`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── Post-market document mutations ─────────────────────────────────────────

export async function postMarketDocumentCreate(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'post_market.document.create';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const programId = typeof params.programId === 'string' ? params.programId : '';
  if (!UUID_RE.test(programId)) {
    return { success: false, action, message: 'programId must be a UUID.', error: 'INVALID_INPUT' };
  }
  const documentType = typeof params.documentType === 'string' ? params.documentType : '';
  const code = typeof params.code === 'string' ? params.code : '';
  const title = typeof params.title === 'string' ? params.title : '';
  if (!documentType || !code || !title) {
    return {
      success: false,
      action,
      message: 'documentType, code, and title are required.',
      error: 'INVALID_INPUT',
    };
  }

  try {
    const doc = await createDocument({
      organizationId: ctx.organizationId,
      programId,
      documentType: documentType as any,
      code,
      title,
      createdBy: `ana:${ctx.userId}`,
      updatedBy: `ana:${ctx.userId}`,
    });

    // WO-16C #133: was `void auditService.logAction({…})`. The document row is
    // already INSERTed by `createDocument` above, so this is a log beside a
    // committed mutation: the draft stands and the outcome of its §11.10(e) row
    // now reaches the caller instead of only the server log.
    const agentAuditTrail = await recordAuditRow({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.post_market.document.create',
      resourceType: 'post_market_document',
      resourceId: String((doc as any)?.id ?? code),
      details: {
        ...agentAuditDetails(ctx, gate),
        programId,
        documentType,
        code,
        title,
      },
    });

    return {
      success: true,
      action,
      data: { ...(doc as Record<string, unknown>), agentAuditTrail },
      message: `Created post-market document ${code} (${documentType}).${auditNote(agentAuditTrail)}`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function postMarketDocumentApprove(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'post_market.document.approve';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const documentId = typeof params.documentId === 'string' ? params.documentId : '';
  if (!documentId) {
    return { success: false, action, message: 'documentId is required.', error: 'INVALID_INPUT' };
  }

  try {
    const result = await approveDocument({
      organizationId: ctx.organizationId,
      documentId,
      approvedBy: `ana:${ctx.userId}`,
      signatureId: typeof params.signatureId === 'string' ? params.signatureId : undefined,
    } as ApproveArgs);

    if ('error' in (result as any)) {
      const code = (result as any).error;
      // WO-16C #133: was `void auditService.logAction({…})`. No document was
      // mutated on this path — `approveDocument` returns NOT_FOUND,
      // ALREADY_LOCKED or GATE_BLOCKED before its UPDATE — so this
      // `…approve.blocked` row is the only record that the agent attempted the
      // approval. The refusal is already answered as an error; what is new is
      // that the refusal now also says whether it was recorded.
      const agentAuditTrail = await recordAuditRow({
        tenantId: ctx.organizationId,
        userId: ctx.userId,
        action: 'agent.ana.post_market.document.approve.blocked',
        resourceType: 'post_market_document',
        resourceId: documentId,
        details: { ...agentAuditDetails(ctx, gate), reason: code },
      });
      return {
        success: false,
        action,
        message: `Approve refused: ${code}.${auditNote(agentAuditTrail)}`,
        error: code === 'NOT_FOUND' ? 'NOT_FOUND' : 'GATE_BLOCKED',
        data: { ...(result as unknown as Record<string, unknown>), agentAuditTrail },
      };
    }

    // WO-16C #133: was `void auditService.logAction({…})`. `approveDocument`
    // above has already set the document to approved and locked, and published
    // the downstream regulatory-change event, so this is a log beside a
    // committed mutation. The approval stands whether or not its §11.10(e) row
    // was written — and the caller is now told which.
    const agentAuditTrail = await recordAuditRow({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.post_market.document.approve',
      resourceType: 'post_market_document',
      resourceId: documentId,
      details: {
        ...agentAuditDetails(ctx, gate),
        signatureId: typeof params.signatureId === 'string' ? params.signatureId : null,
      },
    });

    return {
      success: true,
      action,
      data: { ...(result as unknown as Record<string, unknown>), agentAuditTrail },
      message: `Approved post-market document ${documentId}.${auditNote(agentAuditTrail)}`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── Evidence sufficiency assess (always persisted; gated as mutation) ──────

export async function evidenceSufficiencyAssess(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'evidence_sufficiency.assess';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const programId = typeof params.programId === 'string' ? params.programId : '';
  if (!UUID_RE.test(programId)) {
    return { success: false, action, message: 'programId must be a UUID.', error: 'INVALID_INPUT' };
  }
  const pathway = typeof params.pathway === 'string' ? params.pathway : '';
  if (!['PMA', 'DE_NOVO', '510K'].includes(pathway)) {
    return {
      success: false,
      action,
      message: 'pathway must be PMA | DE_NOVO | 510K.',
      error: 'INVALID_INPUT',
    };
  }
  const profile =
    params.profile && typeof params.profile === 'object'
      ? (params.profile as DeviceProfileFlags)
      : null;
  if (!profile) {
    return {
      success: false,
      action,
      message: 'profile (DeviceProfileFlags) is required.',
      error: 'INVALID_INPUT',
    };
  }

  try {
    const result = await assessSufficiency({
      organizationId: ctx.organizationId,
      programId,
      pathway: pathway as any,
      profile,
      trigger: 'ana',
      triggeredBy: `ana:${ctx.userId}`,
      dryRun: false,
    });

    // WO-16C #133: was `void auditService.logAction({…})`. `assessSufficiency`
    // runs with `dryRun: false`, so the assessment row is already INSERTed into
    // evidence_sufficiency_assessments before this line; a log beside a
    // committed write. The assessment stands and its §11.10(e) row's outcome
    // now travels with the verdict.
    const agentAuditTrail = await recordAuditRow({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.evidence_sufficiency.assess',
      resourceType: 'evidence_sufficiency_assessment',
      resourceId: (result as any)?.id ?? programId,
      details: {
        ...agentAuditDetails(ctx, gate),
        programId,
        pathway,
        verdict: (result as any)?.verdict ?? null,
        overallScore: (result as any)?.overallScore ?? null,
      },
    });

    return {
      success: true,
      action,
      // Serialization boundary: a typed SufficiencyResult is a plain JSON object.
      data: { ...(result as unknown as Record<string, unknown>), agentAuditTrail },
      message: `Assessed evidence sufficiency: verdict=${(result as any)?.verdict}.${auditNote(agentAuditTrail)}`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── Reviewer simulation run (persisted; gated) ─────────────────────────────

export async function reviewerSimulationRun(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'reviewer_simulation.run';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const programId = typeof params.programId === 'string' ? params.programId : '';
  if (!UUID_RE.test(programId)) {
    return { success: false, action, message: 'programId must be a UUID.', error: 'INVALID_INPUT' };
  }
  if (!params.program || typeof params.program !== 'object') {
    return { success: false, action, message: 'program object is required.', error: 'INVALID_INPUT' };
  }
  if (!params.intel || typeof params.intel !== 'object') {
    return { success: false, action, message: 'intel object is required.', error: 'INVALID_INPUT' };
  }

  try {
    const result = await runReviewerSimulation({
      organizationId: ctx.organizationId,
      programId,
      program: params.program as any,
      packet: (params.packet as any) ?? null,
      intel: params.intel as any,
      reports: params.reports as any,
      personas: Array.isArray(params.personas) ? (params.personas as any) : undefined,
      defensePacketId: typeof params.defensePacketId === 'string' ? params.defensePacketId : undefined,
      trigger: 'ana',
      triggeredBy: `ana:${ctx.userId}`,
      dryRun: false,
    });

    // WO-16C #133: was `void auditService.logAction({…})`.
    // `runReviewerSimulation` runs with `dryRun: false`, so the run row is
    // already INSERTed into reviewer_simulation_runs before this line; a log
    // beside a committed write. The run stands and the outcome of its
    // §11.10(e) row now reaches the caller.
    const agentAuditTrail = await recordAuditRow({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.reviewer_simulation.run',
      resourceType: 'reviewer_simulation_run',
      resourceId: (result as any)?.runId ?? programId,
      details: {
        ...agentAuditDetails(ctx, gate),
        programId,
        personaCount: Array.isArray(params.personas) ? params.personas.length : null,
      },
    });

    return {
      success: true,
      action,
      // Serialization boundary: a typed SimulatorResult is a plain JSON object.
      data: { ...(result as unknown as Record<string, unknown>), agentAuditTrail },
      message: `Ran reviewer simulation on program ${programId}.${auditNote(agentAuditTrail)}`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── Post-market document update / validate / supersede ───────────────────

export async function postMarketDocumentUpdate(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'post_market.document.update';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const documentId = typeof params.documentId === 'string' ? params.documentId : '';
  if (!documentId) {
    return { success: false, action, message: 'documentId is required.', error: 'INVALID_INPUT' };
  }
  const patch =
    params.patch && typeof params.patch === 'object' ? (params.patch as Record<string, unknown>) : null;
  if (!patch) {
    return { success: false, action, message: 'patch (object) is required.', error: 'INVALID_INPUT' };
  }

  try {
    const updated = await updateDocument(ctx.organizationId, documentId, {
      ...patch,
      updatedBy: `ana:${ctx.userId}`,
    });
    if (!updated) {
      return { success: false, action, message: 'Document not found.', error: 'NOT_FOUND' };
    }

    // WO-16C #133: was `void auditService.logAction({…})`. The patch is already
    // committed by `updateDocument` above — a log beside a committed mutation —
    // so the update stands and the caller now sees whether the §11.10(e) row
    // naming the changed fields exists.
    const agentAuditTrail = await recordAuditRow({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.post_market.document.update',
      resourceType: 'post_market_document',
      resourceId: documentId,
      details: {
        ...agentAuditDetails(ctx, gate),
        fieldsChanged: Object.keys(patch),
      },
    });

    return {
      success: true,
      action,
      data: { ...(updated as Record<string, unknown>), agentAuditTrail },
      message: `Updated post-market document ${documentId}.${auditNote(agentAuditTrail)}`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function postMarketDocumentValidate(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'post_market.document.validate';
  // Validation mutates nothing and persists nothing on this path: `getDocument`
  // selects the row and `validateDocument` is a pure synchronous function over it,
  // with no call after them. (This comment used to say it "PERSISTS via downstream
  // side effects in some pathways"; a reviewer checked and there are none, and the
  // claim contradicted the note at the audit row below, which is the fact that
  // decides whether a lost row here is a lost log or the only lost persistence.)
  // Gate it anyway: the act of running a validation against a tenant's document is
  // itself the audit event, which is why this handler writes a row at all.
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const documentId = typeof params.documentId === 'string' ? params.documentId : '';
  if (!documentId) {
    return { success: false, action, message: 'documentId is required.', error: 'INVALID_INPUT' };
  }

  try {
    const doc = await getDocument(ctx.organizationId, documentId);
    if (!doc) {
      return { success: false, action, message: 'Document not found.', error: 'NOT_FOUND' };
    }
    const result = validateDocument(doc);

    // WO-16C #133: was `void auditService.logAction({…})`. Nothing is mutated
    // on this path — `getDocument` reads the row and `validateDocument` is a
    // pure function over it — so this §11.10(e) row is the only write the
    // handler makes, and the findings returned below are genuine whether or not
    // it reached a store. The result therefore stays a success, and the row's
    // outcome travels with it so a lost record of the validation event is
    // visible rather than silent.
    const agentAuditTrail = await recordAuditRow({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.post_market.document.validate',
      resourceType: 'post_market_document',
      resourceId: documentId,
      details: {
        ...agentAuditDetails(ctx, gate),
        passed: (result as any)?.valid ?? null,
        findings: Array.isArray((result as any)?.findings) ? (result as any).findings.length : null,
      },
    });

    return {
      success: true,
      action,
      // Serialization boundary: a typed PostMarketValidationResult is a plain JSON object.
      data: { ...(result as unknown as Record<string, unknown>), agentAuditTrail },
      message: `Validated post-market document ${documentId}: ${
        (result as any)?.valid ? 'pass' : 'findings present'
      }.${auditNote(agentAuditTrail)}`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function postMarketDocumentSupersede(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'post_market.document.supersede';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const documentId = typeof params.documentId === 'string' ? params.documentId : '';
  if (!documentId) {
    return { success: false, action, message: 'documentId is required.', error: 'INVALID_INPUT' };
  }

  try {
    const newDoc = await supersedeDocument(ctx.organizationId, documentId, {
      newTitle: typeof params.newTitle === 'string' ? params.newTitle : undefined,
      createdBy: `ana:${ctx.userId}`,
    });
    if (!newDoc) {
      return { success: false, action, message: 'Document not found.', error: 'NOT_FOUND' };
    }

    // WO-16C #133: was `void auditService.logAction({…})`. `supersedeDocument`
    // above has already INSERTed the new version and set the old document to
    // `superseded`, so this is a log beside a committed mutation. The new
    // version stands and the outcome of its §11.10(e) row now reaches the
    // caller.
    const agentAuditTrail = await recordAuditRow({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.post_market.document.supersede',
      resourceType: 'post_market_document',
      resourceId: documentId,
      details: {
        ...agentAuditDetails(ctx, gate),
        newDocumentId: (newDoc as any)?.id ?? null,
        newTitle: typeof params.newTitle === 'string' ? params.newTitle : null,
      },
    });

    return {
      success: true,
      action,
      data: { ...(newDoc as Record<string, unknown>), agentAuditTrail },
      message: `Superseded post-market document ${documentId}.${auditNote(agentAuditTrail)}`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── Metadata ───────────────────────────────────────────────────────────────

export const MDX_COMMAND_METADATA_PHASE2 = [
  {
    name: 'gspr.mapping.upsert',
    description:
      'Upsert a GSPR (EU MDR Annex I / IVDR Annex I) requirement-to-program ' +
      'mapping. Captures sponsor applicability decision + decidedBy. ' +
      'Requires confirm + reason.',
    parameters: 'programId (UUID), requirementId, applicability, confirm="yes", reason',
    example:
      '"Mark GSPR-12 as applicable on program OR-801, reason: device contacts intact skin only."',
  },
  {
    name: 'post_market.document.create',
    description:
      'Create a draft post-market document (PMS plan, PMCF, complaint log, ' +
      'KPI report). Requires confirm + reason.',
    parameters: 'programId (UUID), documentType, code, title, confirm="yes", reason',
    example: '"Create a PMCF plan PMCF-2025-Q3 on program OR-801."',
  },
  {
    name: 'post_market.document.approve',
    description:
      'Approve a post-market document. Requires confirm + reason. May be ' +
      'gate-blocked if validation fails.',
    parameters: 'documentId, signatureId?, confirm="yes", reason',
    example: '"Approve PMCF document d-12 with signature sig-7."',
  },
  {
    name: 'post_market.document.update',
    description:
      'Patch a post-market document with arbitrary fields. Requires confirm + reason.',
    parameters: 'documentId, patch (object), confirm="yes", reason',
    example: '"Update PMCF document d-12, patch: {assignee: \'sarah.chen\'}"',
  },
  {
    name: 'post_market.document.validate',
    description:
      'Run validation against a post-market document. Returns findings list. ' +
      'Requires confirm + reason because the validation event is audited.',
    parameters: 'documentId, confirm="yes", reason',
    example: '"Validate PMCF document d-12 before approval."',
  },
  {
    name: 'post_market.document.supersede',
    description: 'Supersede a post-market document with a new version. Requires confirm + reason.',
    parameters: 'documentId, newTitle?, confirm="yes", reason',
    example: '"Supersede PMCF d-12 with new title PMCF-2026-Q1."',
  },
  {
    name: 'evidence_sufficiency.assess',
    description:
      'Run an evidence-sufficiency assessment for a regulatory program. ' +
      'Persists the assessment row. Requires confirm + reason.',
    parameters: 'programId (UUID), pathway (PMA|DE_NOVO|510K), profile (DeviceProfileFlags), confirm="yes", reason',
    example:
      '"Assess evidence sufficiency for OR-801 as 510K with profile {isImplantable: true}."',
  },
  {
    name: 'reviewer_simulation.run',
    description:
      'Run a multi-persona reviewer simulation against a program. Persists ' +
      'the run. Requires confirm + reason.',
    parameters:
      'programId (UUID), program (object), intel (object), packet?, reports?, personas?, defensePacketId?, confirm="yes", reason',
    example: '"Run a reviewer simulation on OR-801 with the standard 8-persona panel."',
  },
];

export const MDX_COMMAND_HANDLERS_PHASE2: Record<
  string,
  (ctx: CommandContext, params: Record<string, unknown>) => Promise<CommandResult>
> = {
  'gspr.mapping.upsert': gsprMappingUpsert,
  'post_market.document.create': postMarketDocumentCreate,
  'post_market.document.approve': postMarketDocumentApprove,
  'post_market.document.update': postMarketDocumentUpdate,
  'post_market.document.validate': postMarketDocumentValidate,
  'post_market.document.supersede': postMarketDocumentSupersede,
  'evidence_sufficiency.assess': evidenceSufficiencyAssess,
  'reviewer_simulation.run': reviewerSimulationRun,
};

/**
 * Catalog tools — what exists in the caller's organisation.
 *
 * Every listing runs through the platform service that already owns the read
 * (regulatory-programs.service, submission-service) with the organisation
 * from the token, so the connector inherits the same tenant predicate as the
 * REST API and the AnA chat surface.
 */

import { z } from 'zod';
import { defineTool, ok, refused, errorMessage } from './runtime';
import { MCP_SCOPES } from '../config';

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const listProjects = defineTool({
  name: 'c2c_list_projects',
  title: 'List projects',
  description:
    'List the regulatory programs (projects) you can open in your organisation: id, code, type (IND/NDA/BLA/510K/…), ' +
    'product, agency, status, phase, lead and target submission date. Use a project id from here for ' +
    'vault document listings. Returns an honest empty list when you can open no program.',
  inputSchema: {
    program_type: z.string().max(20).optional().describe('Filter by program type, e.g. IND, NDA, BLA, 510K, CER.'),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: READ,
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'server/services/regulatory-programs.service.ts listPrograms, held to getCurrentAccessibleProgramScope',
  async run(input, ctx) {
    /* It listed every program in the organisation, a private project's
       included (F1, 2026-11-05; docs/evidence/F1/2026-11-05-listing-doors-scope/).
       It now lists the verified accessible programs, the scope the Vault tools
       below read by. A scope that cannot be read is a refusal, never a list. */
    if (!ctx.sqlClient) return refused('Request-scoped project access could not be verified.', { code: 'REQUEST_DB_CONTEXT_REQUIRED' });
    const { listPrograms } = await import('../../services/regulatory-programs.service');
    const { getCurrentAccessibleProgramScope } = await import('../../services/c2c/current-program-access');
    let accessible: Set<string>;
    try {
      const scope = await getCurrentAccessibleProgramScope(ctx.sqlClient, {
        organizationId: ctx.principal.organizationId, userId: ctx.principal.userId,
      });
      accessible = new Set(scope.programIds.map((id) => id.toLowerCase()));
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      return refused(errorMessage(err), { code: typeof code === 'string' ? code : 'PROJECT_ACCESS_UNAVAILABLE' });
    }
    const rows = (await listPrograms(ctx.principal.organizationId, { programType: input.program_type }))
      .filter((r) => accessible.has(String(r.id).toLowerCase()));
    const projects = rows.slice(0, input.limit).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      programType: r.programType,
      productType: r.productType,
      productName: r.productName,
      primaryAgency: r.primaryAgency,
      status: r.status,
      phase: r.phase,
      leadUserName: r.leadUserName,
      targetSubmissionDate: r.targetSubmissionDate,
      updatedAt: r.updatedAt,
    }));
    return ok(
      projects.length === 0
        ? 'No regulatory program you can open exists in this organisation.'
        : `${projects.length} of ${rows.length} program(s): ${projects.map((p) => `${p.code} (${p.programType})`).join(', ')}.`,
      { scope: 'verified-accessible-programs', organizationId: ctx.principal.organizationId, total: rows.length, projects },
    );
  },
});

export const listSubmissions = defineTool({
  name: 'c2c_list_submissions',
  title: 'List submissions',
  description:
    'List the canonical submissions (applications) in your organisation from the submissions spine: id, ' +
    'title, application type, client type, primary region, status and lifecycle stage. A submission owns ' +
    'eCTD sequences; use c2c_list_sequences with an id from here.',
  inputSchema: { limit: z.number().int().min(1).max(200).default(50) },
  annotations: READ,
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'server/services/submission-service/submission-service.ts listSubmissions',
  async run(input, ctx) {
    const { listSubmissions: list } = await import('../../services/submission-service/submission-service');
    const rows = await list({ organizationId: ctx.principal.organizationId });
    const submissions = rows.slice(0, input.limit).map((s) => ({
      id: s.id,
      title: s.title,
      productName: s.productName,
      applicationType: s.applicationType,
      clientType: s.clientType,
      primaryRegion: s.primaryRegion,
      status: s.status,
      lifecycleStage: s.lifecycleStage,
      updatedAt: s.updatedAt,
    }));
    return ok(
      submissions.length === 0
        ? 'No submissions exist in this organisation yet.'
        : `${submissions.length} of ${rows.length} submission(s): ${submissions.map((s) => `#${s.id} ${s.title} (${s.applicationType.toUpperCase()}/${s.primaryRegion})`).join('; ')}.`,
      { organizationId: ctx.principal.organizationId, total: rows.length, submissions },
    );
  },
});

export const listSequences = defineTool({
  name: 'c2c_list_sequences',
  title: 'List eCTD sequences',
  description:
    'List the eCTD sequences (0000, 0001, …) of one submission: id, region, sequence number, type, status ' +
    '(draft|assembling|validated|frozen|dispatched), validation and dispatch status. Refuses when the ' +
    'submission is not in your organisation. Sequences in use only; c2c_get_sequence_status reports a retired one.',
  inputSchema: { submission_id: z.number().int().positive().describe('A submission id from c2c_list_submissions.') },
  annotations: READ,
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'server/services/submission-service/submission-service.ts listSequences',
  async run(input, ctx) {
    const svc = await import('../../services/submission-service/submission-service');
    try {
      const rows = await svc.listSequences(input.submission_id, { organizationId: ctx.principal.organizationId });
      const sequences = rows.map((s) => ({
        id: s.id,
        submissionId: s.submissionId,
        region: s.region,
        sequenceNumber: s.sequenceNumber,
        type: s.type,
        status: s.status,
        validationStatus: s.validationStatus,
        dispatchStatus: s.dispatchStatus,
        frozenAt: s.frozenAt,
        updatedAt: s.updatedAt,
      }));
      return ok(
        sequences.length === 0
          ? `Submission #${input.submission_id} has no sequence in use.`
          : `${sequences.length} sequence(s): ${sequences.map((s) => `${s.sequenceNumber} [${s.status}] id=${s.id}`).join(', ')}.`,
        { submissionId: input.submission_id, sequences },
      );
    } catch (err) {
      return refused(errorMessage(err));
    }
  },
});

type SubmissionService = typeof import('../../services/submission-service/submission-service');

/**
 * A sequence of this organisation that is no longer in use, said plainly
 * (P-86): retired, with when, by whom and why; or not in use with no
 * retirement recorded. Undefined when the id is not found at all, or was
 * refused for another reason, so the caller keeps its own refusal.
 */
async function notInUseAnswer(svc: SubmissionService, id: number, orgId: number, err: unknown) {
  if (!(err instanceof svc.SubmissionError) || err.code !== 'NOT_FOUND') return undefined;
  let answer: Awaited<ReturnType<SubmissionService['readRetiredSequence']>>;
  try {
    answer = await svc.readRetiredSequence(id, { organizationId: orgId });
  } catch (readErr) {
    return refused(`Sequence #${id} is not in use in this organisation, and whether it was retired could not be read: ${errorMessage(readErr)}`);
  }
  if (!answer) return undefined;
  const { sequenceNumber, region } = answer;
  if (answer.state === 'removed') {
    return ok(`Sequence ${sequenceNumber} (${region}) is not in use; no retirement is recorded for it.`,
      { sequence: { id, sequenceNumber, region, inUse: false, retired: false } });
  }
  const by = answer.retiredBy ?? 'a person the record no longer names';
  return ok(
    `Sequence ${sequenceNumber} (${region}) was retired on ${answer.retiredOn} UTC by ${by}${answer.meaning ? ` (${answer.meaning})` : ''}. ` +
      `${answer.reason ? `Reason: ${answer.reason}${/[.!?]$/.test(answer.reason) ? '' : '.'} ` : ''}It is kept as history; it is not sent, filed or built on.`,
    { sequence: { id, sequenceNumber, region, inUse: false, retired: true, retiredOn: answer.retiredOn, retiredBy: answer.retiredBy, meaning: answer.meaning, reason: answer.reason } },
  );
}

export const getSequenceStatus = defineTool({
  name: 'c2c_get_sequence_status',
  title: 'Get sequence status',
  description:
    'Status of one eCTD sequence: lifecycle state, its filed leaves (section code, title, lifecycle op, ' +
    'document pointer) and the Part 11 release-signature state (unsigned|awaiting|valid|invalid|revoked|' +
    'undetermined) as the platform resolves it. Read-only; signing happens in the app.',
  inputSchema: { sequence_id: z.number().int().positive().describe('A sequence id from c2c_list_sequences.') },
  annotations: READ,
  scope: MCP_SCOPES.read,
  governed: false,
  implementation:
    'submission-service getSequence/listLeaves + server/services/ectd/release-signature-status.ts resolveReleaseSignatureStatus',
  async run(input, ctx) {
    const svc = await import('../../services/submission-service/submission-service');
    const orgId = ctx.principal.organizationId;
    let sequence;
    try {
      sequence = await svc.getSequence(input.sequence_id, { organizationId: orgId });
    } catch (err) {
      return (await notInUseAnswer(svc, input.sequence_id, orgId, err)) ?? refused(errorMessage(err));
    }
    const leaves = await svc.listLeaves(sequence.id, { organizationId: orgId });
    let releaseSignature: Record<string, unknown>;
    try {
      const { resolveReleaseSignatureStatus } = await import('../../services/ectd/release-signature-status');
      releaseSignature = { ...(await resolveReleaseSignatureStatus({
        submissionId: sequence.submissionId,
        organizationId: orgId,
        sequenceNumber: sequence.sequenceNumber,
        sequenceId: sequence.id,
        region: sequence.region,
      })) };
    } catch (err) {
      releaseSignature = { verdict: 'undetermined', detail: `signature lookup failed: ${errorMessage(err)}` };
    }
    return ok(
      `Sequence ${sequence.sequenceNumber} (${sequence.region}) is ${sequence.status} with ${leaves.length} leaf/leaves; ` +
        `release signature: ${String(releaseSignature.verdict)}.`,
      {
        sequence: {
          id: sequence.id,
          submissionId: sequence.submissionId,
          region: sequence.region,
          sequenceNumber: sequence.sequenceNumber,
          type: sequence.type,
          status: sequence.status,
          validationStatus: sequence.validationStatus,
          dispatchStatus: sequence.dispatchStatus,
          frozenAt: sequence.frozenAt,
        },
        leafCount: leaves.length,
        leaves: leaves.map((l) => ({
          id: l.id,
          sectionCode: l.sectionCode,
          title: l.title,
          lifecycleOp: l.lifecycleOp,
          documentTable: l.documentTable,
          documentId: l.documentId,
          documentUuid: (l as { documentUuid?: string | null }).documentUuid ?? null,
          documentType: l.documentType,
        })),
        releaseSignature,
        signOff: {
          url: `${ctx.config.appBaseUrl}/concept2cure/submission-center`,
          note: 'Freeze, sign and dispatch happen in Submission Center behind 21 CFR Part 11 electronic signature.',
        },
      },
    );
  },
});

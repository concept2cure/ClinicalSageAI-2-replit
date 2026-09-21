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
    'List the regulatory programs (projects) in your organisation: id, code, type (IND/NDA/BLA/510K/…), ' +
    'product, agency, status, phase, lead and target submission date. Use a project id from here for ' +
    'vault document listings. Returns an honest empty list when the organisation has no programs.',
  inputSchema: {
    program_type: z.string().max(20).optional().describe('Filter by program type, e.g. IND, NDA, BLA, 510K, CER.'),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: READ,
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'server/services/regulatory-programs.service.ts listPrograms',
  async run(input, ctx) {
    const { listPrograms } = await import('../../services/regulatory-programs.service');
    const rows = await listPrograms(ctx.principal.organizationId, { programType: input.program_type });
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
        ? 'No regulatory programs exist in this organisation yet.'
        : `${projects.length} of ${rows.length} program(s): ${projects.map((p) => `${p.code} (${p.programType})`).join(', ')}.`,
      { organizationId: ctx.principal.organizationId, total: rows.length, projects },
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
    'submission is not in your organisation.',
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
          ? `Submission #${input.submission_id} has no sequences yet.`
          : `${sequences.length} sequence(s): ${sequences.map((s) => `${s.sequenceNumber} [${s.status}] id=${s.id}`).join(', ')}.`,
        { submissionId: input.submission_id, sequences },
      );
    } catch (err) {
      return refused(errorMessage(err));
    }
  },
});

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
      return refused(errorMessage(err));
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

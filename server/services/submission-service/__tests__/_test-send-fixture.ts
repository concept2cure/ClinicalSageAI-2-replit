/**
 * F1 (row D7, 2026-11-01): what the test-send cases of
 * refused-step-voids-signature.pglite.test.ts drive and read. They go through
 * the REAL transmit guard; only the FDA ESG gateway's own transmit is stubbed,
 * and it writes the transmittal row the guard handed it. The calling test file
 * owns the database mock and the harness; these helpers only read it.
 */
import { vi } from 'vitest';
import type { IndPgliteDb } from '../../../db/pglite-harness';
import { transmitSequence } from '../submission-service';
import { FdaEsgGateway } from '../../submission-gateways/fda-esg';
import { GatewayError } from '../../submission-gateways/types';
import { loadFiledStateBySubmission } from '../../ectd/prior-sequence-loader';

export type TransmittalRow = {
  id: number;
  metadata: {
    environment?: string;
    dispatchBinding: { attemptId: string; sequenceId: number; signatureActionId: string };
    leafManifest: Array<{ ctdSection: string; fileName: string }>;
  };
};
export type SequenceClaim = { dispatch_status: string | null; transmit_signature_action_id: string | null; transmit_attempt_id: string | null };
export type VoidContext = { environment: string | null; transmit_attempt_id: string | null; test_send: string | null };

/** The submissions and sequences the test-send cases use, one per case, each under the project PROGRAM. */
export const testSendSeedSql = (org: number, user: number, program: string) => `
  INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id) VALUES
    (27, 'F1 test send, then the filing', 'ind', 'biotech', 'fda', ${org}, ${user}, '${program}'),
    (28, 'F1 test send fails after the wire', 'ind', 'biotech', 'fda', ${org}, ${user}, '${program}'),
    (29, 'F1 production send fails after the wire', 'ind', 'biotech', 'fda', ${org}, ${user}, '${program}'),
    (30, 'F1 test send fails after the wire, its void fails', 'ind', 'biotech', 'fda', ${org}, ${user}, '${program}'),
    (31, 'F1 test send answers, its record fails', 'ind', 'biotech', 'fda', ${org}, ${user}, '${program}'),
    (32, 'F1 a signature names its environment', 'ind', 'biotech', 'fda', ${org}, ${user}, '${program}');
  INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status, dispatch_status) VALUES
    (167, 27, 'fda', '0000', ${org}, ${user}, 'dispatched', 'pending'),
    (168, 27, 'fda', '0001', ${org}, ${user}, 'validated', NULL),
    (169, 28, 'fda', '0000', ${org}, ${user}, 'dispatched', 'pending'),
    (170, 29, 'fda', '0000', ${org}, ${user}, 'dispatched', 'pending'),
    (171, 30, 'fda', '0000', ${org}, ${user}, 'dispatched', 'pending'),
    (172, 31, 'fda', '0000', ${org}, ${user}, 'dispatched', 'pending'),
    (173, 32, 'fda', '0000', ${org}, ${user}, 'dispatched', 'pending');
  INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
    (167, 'm2.3', 'Quality Overall Summary', 'new', 'coauthor_documents', 202, ${org}, ${user}),
    -- 0001 files the same document in the same section: it waits on 0000 being filed (filingOrderRefusal).
    (168, 'm2.3', 'Quality Overall Summary', 'new', 'coauthor_documents', 202, ${org}, ${user}),
    (169, 'm2.3', 'Quality Overall Summary', 'new', 'coauthor_documents', 202, ${org}, ${user}),
    (170, 'm2.3', 'Quality Overall Summary', 'new', 'coauthor_documents', 202, ${org}, ${user}),
    (171, 'm2.3', 'Quality Overall Summary', 'new', 'coauthor_documents', 202, ${org}, ${user}),
    (172, 'm2.3', 'Quality Overall Summary', 'new', 'coauthor_documents', 202, ${org}, ${user}),
    (173, 'm2.3', 'Quality Overall Summary', 'new', 'coauthor_documents', 202, ${org}, ${user});
`;

/** The gateway's own words for a send that failed after the whole bundle left. */
export const AFTER_THE_WIRE = 'FDA ESG AS2 returned HTTP 502 after the whole bundle was sent; FDA may hold it.';

export function testSendHelpers(getH: () => IndPgliteDb, ctx: { organizationId: number; userId: number }) {
  const query = (text: string, params?: unknown[]) => getH().pglite.query(text, params) as Promise<{ rows: any[] }>;
  return {
    /** The FDA ESG gateway behind the real guard: records the row it is handed, then answers or fails after the wire. */
    stubEsgGateway(after: 'answers' | 'fails after the wire' = 'answers') {
      vi.spyOn(FdaEsgGateway.prototype, 'isConfigured').mockResolvedValue(true);
      return vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockImplementation(async (req) => {
        const row = (await query(
          `INSERT INTO submission_transmittals (organization_id, region, metadata) VALUES ($1, 'fda', $2::jsonb) RETURNING id`,
          [req.organizationId, JSON.stringify(req.metadata ?? {})],
        )).rows[0] as { id: number };
        if (after === 'fails after the wire') throw new GatewayError(AFTER_THE_WIRE, 502, null, 'Bad Gateway');
        return { transmittalId: row.id, transmissionId: `ESG-${row.id}`, status: 'received', transport: 'as2', httpStatus: 200, ackReceivedAt: null, message: 'MDN received' };
      });
    },
    /** What the transmit guard recorded for each send of a sequence, oldest first. */
    transmittalsOf: async (seqId: number) =>
      (await query(
        `SELECT id, metadata FROM submission_transmittals WHERE metadata -> 'dispatchBinding' ->> 'sequenceId' = $1 ORDER BY id`,
        [String(seqId)],
      )).rows as TransmittalRow[],
    /** The sequence's dispatch status and the attempt its columns bind. */
    claimOf: async (seqId: number) =>
      (await query(
        `SELECT dispatch_status, transmit_signature_action_id, transmit_attempt_id::text AS transmit_attempt_id FROM ectd_sequences WHERE id = $1`,
        [seqId],
      )).rows[0] as SequenceClaim,
    /** What the filed fold (F1 slice 1) reads as on file for a submission. */
    filedState: (submissionId: number) => loadFiledStateBySubmission({ query }, { organizationId: ctx.organizationId, submissionId }),
    /** What the GOVERNED_SIGNATURE_VOIDED row of a signature records about the attempt. */
    voidContextOf: async (actionId: string) =>
      (await query(
        `SELECT new_values::jsonb ->> 'environment' AS environment, new_values::jsonb ->> 'transmitAttemptId' AS transmit_attempt_id,
                new_values::jsonb ->> 'testSend' AS test_send
           FROM audit_logs WHERE action = 'GOVERNED_SIGNATURE_VOIDED' AND (new_values::jsonb ->> 'signatureActionId') = $1`,
        [actionId],
      )).rows[0] as VoidContext | undefined,
    /** Transmit a sequence to one environment under the application its project records. */
    transmitTo: (sequenceId: number, signatureActionId: string, environment: 'staging' | 'production') =>
      transmitSequence({ sequenceId, ctx, signatureActionId, environment, applicationId: '123456' }),
  };
}

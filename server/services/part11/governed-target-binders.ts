/**
 * Content binders for governed sign targets whose content lives in a domain
 * of its own (21 CFR 11.70): each reads, on the signing transaction's client,
 * exactly the content a signer approves and returns its digest with the
 * binding basis. deriveGovernedTargetBinding (signature-persistence.ts) looks
 * a target's prefix up in CONTENT_BINDERS; its try owns the 42P01 ledger
 * fallback and the fail-closed rethrow, so a binder's errors propagate.
 *
 * Moved out of signature-persistence.ts on 2026-10-01 with the report-run
 * binder (P1-44b), which took that file past its size limit.
 *
 * @module server/services/part11/governed-target-binders
 */

import {
  BINDING_BASIS,
  sha256CanonicalJson,
  type GovernedBinding,
  type SignatureDbClient,
} from './signature-persistence.js';
import { AGENCY_RESPONSE_DIGEST_RECIPE, agencyResponseDigest } from '../agency-responses/response-logic.js';
import { COMMITMENT_FULFILMENT_DIGEST_RECIPE, commitmentFulfilmentDigest } from '../ha-interactions/ha-logic.js';
import { readCommitmentFulfilmentContent } from '../ha-interactions/fulfilment-record.js';

/** One target type's binder: `rest` is the pointer after `<prefix>:`. */
export type ContentBinder = (
  client: SignatureDbClient,
  rest: string,
  orgId: number,
  ledgerFallback: (why: string) => GovernedBinding,
) => Promise<GovernedBinding>;

/** The protocol-document / protocol-review-assignment binder. */
async function protocolContentBinding(
  client: SignatureDbClient,
  prefix: 'protocol-document' | 'protocol-review-assignment',
  rest: string,
  orgId: number,
  ledgerFallback: (why: string) => GovernedBinding,
): Promise<GovernedBinding> {
  // A disposition is a signature over the protocol the reviewer read, so
  // it binds that protocol's content, not the assignment row.
  //
  // CONTENT ONLY. No version, no workflow status, no timestamps: finalize
  // bumps the version and moves section status, and a reviewer's
  // signature taken before that must still re-derive afterwards when no
  // content changed (the ectd-sequence lesson in deriveGovernedTargetBinding).
  // And ALL of the content, not just the prose: the cover page, synopsis,
  // objectives, eligibility, schedule of visits, schedule of assessments
  // and study team are what a reviewer approves too.
  if (!/^\d+$/.test(rest)) return ledgerFallback('malformed protocol pointer');
  let docId = rest;
  if (prefix === 'protocol-review-assignment') {
    const a = await client.query(
      `SELECT protocol_document_id FROM protocol_review_assignments
        WHERE id = $1::int AND organization_id = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [rest, orgId],
    );
    if (a.rows.length === 0) return ledgerFallback('review assignment not readable at signing time');
    docId = String(a.rows[0].protocol_document_id);
  }
  const doc = await client.query(
    `SELECT id, protocol_kind, protocol_number, title, design_type, phase, therapeutic_area,
            synopsis, sponsor, principal_investigator
       FROM protocol_documents
      WHERE id = $1::int AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [docId, orgId],
  );
  if (doc.rows.length === 0) return ledgerFallback('protocol document not readable at signing time');
  const rows = async (sql: string) => (await client.query(sql, [docId, orgId])).rows;
  const live = 'protocol_document_id = $1::int AND organization_id = $2';
  const content = {
    protocol: doc.rows[0],
    sections: await rows(`SELECT section_key, title, content, required, order_index FROM protocol_sections WHERE ${live} AND deleted_at IS NULL ORDER BY order_index, section_key`),
    objectives: await rows(`SELECT objective_type, objective, endpoint, timepoint, order_index FROM protocol_objectives WHERE ${live} AND deleted_at IS NULL ORDER BY order_index, id`),
    eligibility: await rows(`SELECT kind, criterion, order_index FROM protocol_eligibility_criteria WHERE ${live} AND deleted_at IS NULL ORDER BY kind, order_index, id`),
    visits: await rows(`SELECT id, visit_name, timepoint, procedures, order_index FROM protocol_schedule_visits WHERE ${live} AND deleted_at IS NULL ORDER BY order_index, id`),
    assessments: await rows(`SELECT id, name, category, order_index FROM protocol_soa_assessments WHERE ${live} AND deleted_at IS NULL ORDER BY order_index, id`),
    cells: await rows(`SELECT assessment_id, visit_id, required, notes FROM protocol_soa_cells WHERE ${live} ORDER BY assessment_id, visit_id`),
    team: await rows(`SELECT member_name, role, responsibilities, personnel_id, user_id FROM protocol_team_members WHERE ${live} AND deleted_at IS NULL ORDER BY id`),
  };
  return {
    digest: sha256CanonicalJson(content),
    basis: BINDING_BASIS.PROTOCOL_DOCUMENT_CONTENT,
    note: `sha256 over the protocol's content at signing time: cover page and synopsis (protocol_documents), ${content.sections.length} section(s), ${content.objectives.length} objective(s), ${content.eligibility.length} eligibility criteria, ${content.visits.length} visit(s), ${content.assessments.length} SoA assessment(s) and ${content.cells.length} cell(s), ${content.team.length} team member(s). No version, workflow status or timestamp is bound.`,
  };
}

/**
 * report-run:<id>: the seal the finalize wrote on this client a moment ago
 * (P1-44b), on the run's latest snapshot. The run's own content, so no status
 * or timestamp is bound.
 */
const reportRunSealBinding: ContentBinder = async (client, rest, orgId, ledgerFallback) => {
  if (!/^\d+$/.test(rest)) return ledgerFallback('malformed report run pointer');
  const sealed = await client.query(
    `SELECT s.snapshot_metadata::jsonb -> 'seal' ->> 'contentHash' AS seal_hash
       FROM report_runs r
       JOIN report_snapshots s
         ON s.run_id = r.id AND s.organization_id = r.organization_id AND s.is_latest = true
      WHERE r.id = $1::int AND r.organization_id = $2
      ORDER BY s.id DESC
      LIMIT 1`,
    [rest, orgId],
  );
  const sealHash = sealed.rows[0]?.seal_hash;
  if (typeof sealHash !== 'string' || !/^[0-9a-f]{64}$/.test(sealHash)) {
    return ledgerFallback('the run carries no seal at signing time');
  }
  return {
    digest: sealHash,
    basis: BINDING_BASIS.REPORT_RUN_SEAL,
    note: "The run's seal content hash (sha256 over the rendered report and its provenance atoms), as the finalize wrote it on the run's latest snapshot in this transaction.",
  };
};

/**
 * interim-snapshot:<id>: the interim data an adaptive decision is taken on.
 *
 * An IDMC does not approve "a decision" in the abstract — it approves a
 * decision ABOUT a specific look at the data, so that look is what the
 * signature binds. CONTENT ONLY, as the protocol binder is: the look number,
 * the information fraction, the enrolment, the summary statistics, the test
 * statistic, the conditional and predictive power and the boundary. No
 * snapshot_date, no created_at, no blinding flag — a signature taken on this
 * look must re-derive later when none of the DATA changed.
 */
const interimSnapshotBinding: ContentBinder = async (client, rest, orgId, ledgerFallback) => {
  if (!/^\d+$/.test(rest)) return ledgerFallback('malformed interim snapshot pointer');
  const snap = await client.query(
    `SELECT plan_id, look_number, information_fraction, enrolled_count,
            summary_statistics, test_statistic, conditional_power,
            predictive_power, boundary
       FROM interim_data_snapshots
      WHERE id = $1::int AND organization_id = $2
      LIMIT 1`,
    [rest, orgId],
  );
  const row = snap.rows[0];
  if (!row) return ledgerFallback('interim snapshot not readable at signing time');

  const content = {
    planId: Number(row.plan_id),
    lookNumber: Number(row.look_number),
    informationFraction: row.information_fraction === null ? null : Number(row.information_fraction),
    enrolledCount: row.enrolled_count === null ? null : Number(row.enrolled_count),
    summaryStatistics: row.summary_statistics ?? null,
    testStatistic: row.test_statistic === null ? null : Number(row.test_statistic),
    conditionalPower: row.conditional_power === null ? null : Number(row.conditional_power),
    predictivePower: row.predictive_power === null ? null : Number(row.predictive_power),
    boundary: row.boundary ?? null,
  };
  return {
    digest: sha256CanonicalJson(content),
    basis: BINDING_BASIS.INTERIM_SNAPSHOT_CONTENT,
    note: `sha256 over the interim data at look ${content.lookNumber} (information fraction ${content.informationFraction}) of plan ${content.planId}: enrolment, summary statistics, test statistic, conditional and predictive power, and the boundary. No snapshot date, blinding flag or row timestamp is bound.`,
  };
};

/**
 * agency-question:<id>: one response to an agency question, as it stands in
 * the signing transaction (the sign route has the row locked FOR UPDATE).
 * The digest is agencyResponseDigest, the recipe the approval read recomputes,
 * so "is this response approved" and "what did the signature bind" cannot
 * disagree about the bytes.
 */
const agencyResponseBinding: ContentBinder = async (client, rest, orgId, ledgerFallback) => {
  if (!/^\d+$/.test(rest)) return ledgerFallback('malformed agency question pointer');
  const r = await client.query(
    `SELECT communication_event_id, question_ref, question_text, response_text
       FROM agency_communication_questions
      WHERE id = $1::int AND organization_id = $2
      LIMIT 1`,
    [rest, orgId],
  );
  const row = r.rows[0];
  if (!row) return ledgerFallback('agency question not readable at signing time');
  return {
    digest: agencyResponseDigest({
      communicationEventId: String(row.communication_event_id),
      questionRef: String(row.question_ref),
      questionText: String(row.question_text),
      responseText: String(row.response_text),
    }),
    basis: BINDING_BASIS.AGENCY_RESPONSE_CONTENT,
    note: `sha256 (recipe ${AGENCY_RESPONSE_DIGEST_RECIPE}) over the letter id, the question reference and text, and the exact response text of question ${rest} at signing time. No revision, author or timestamp is bound.`,
  };
};

/**
 * regulatory-commitment:<id>: a commitment's recorded fulfilment (P-41,
 * 2026-10-19), as the signing transaction has just written it. The digest is
 * commitmentFulfilmentDigest over readCommitmentFulfilmentContent, the one
 * reader the list read uses too, so the binder and "does the signature match
 * the record" cannot disagree about the input. A commitment not fulfilled, or
 * fulfilled without a recorder (a row from before fulfilments were recorded),
 * has no fulfilment to bind and falls back; the database then refuses the
 * commit, because it accepts only this basis.
 */
const commitmentFulfilmentBinding: ContentBinder = async (client, rest, orgId, ledgerFallback) => {
  if (!/^\d{1,10}$/.test(rest)) return ledgerFallback('malformed regulatory commitment pointer');
  const record = (await readCommitmentFulfilmentContent(client, orgId, [Number(rest)])).get(Number(rest));
  if (!record) return ledgerFallback('regulatory commitment not readable at signing time');
  if (record.status !== 'fulfilled' || !record.recorded) return ledgerFallback('the commitment carries no recorded fulfilment at signing time');
  const c = record.content;
  return {
    digest: commitmentFulfilmentDigest(c),
    basis: BINDING_BASIS.COMMITMENT_FULFILMENT_CONTENT,
    note: `sha256 (recipe ${COMMITMENT_FULFILMENT_DIGEST_RECIPE}) over commitment ${rest}'s type, description, basis and due date, the date it was fulfilled (${c.fulfilledDate}), and what met it: ${c.sequenceId != null ? `sequence ${c.sequenceNumber ?? c.sequenceId} of submission ${c.submissionId ?? 'unknown'}` : 'no sequence'}; ${c.vaultDocumentId != null ? `Vault version ${c.vaultDocumentId} at sha256 ${c.vaultSha256}` : 'no Vault version'}. No status, recorder or timestamp is bound.`,
  };
};

/**
 * A QMS controlled document's periodic review (services/qms/periodic-review.ts):
 * the reviewer attests the version in force, so the signature binds the content
 * its approval signed, by the approval's own recipe and basis
 * (computeQmsDocumentContentDigest). Approval and retirement bind their own
 * digests on their own path and never reach this binder. A document that is
 * not effective has no version in force to bind, and falls back.
 *
 * The recipe is loaded when a signature is taken, not with this module: the
 * QMS approval module imports signature-persistence, which imports this one,
 * so a static import would close that cycle at startup.
 */
const qmsDocumentContentBinding: ContentBinder = async (client, rest, orgId, ledgerFallback) => {
  if (!/^\d{1,10}$/.test(rest)) return ledgerFallback('malformed QMS document pointer');
  const { computeQmsDocumentContentDigest } = await import('../qms/document-approval-signature.js');
  const { rows } = await client.query(
    `SELECT * FROM qms_documents WHERE id = $1::int AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [rest, orgId],
  );
  const row = rows[0];
  if (!row) return ledgerFallback('QMS document not readable at signing time');
  if (row.status !== 'effective') return ledgerFallback('the QMS document has no version in force at signing time');
  return {
    digest: computeQmsDocumentContentDigest(row),
    basis: BINDING_BASIS.QMS_DOCUMENT_VERSION_CONTENT,
    note: `sha256 over QMS document ${rest} v${String(row.version)}'s controlled content (identity, title, type, category, artifact, next review date, and metadata without its approval block): the content its approval signature is bound to.`,
  };
};

/**
 * vault-data-room-seal:<uuid>: the seal written on this client a moment ago
 * (VR-19). The signature binds the seal's recorded manifest hash, the record of
 * every document it sealed; a seal not readable here has nothing to bind.
 */
const vaultDataRoomSealBinding: ContentBinder = async (client, rest, orgId, ledgerFallback) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rest)) return ledgerFallback('malformed Vault seal pointer');
  const { rows } = await client.query(
    'SELECT manifest_sha256 FROM public.vault_data_room_seals WHERE id = $1::uuid AND organization_id = $2',
    [rest, orgId],
  );
  const digest = rows[0]?.manifest_sha256;
  if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) return ledgerFallback('the Vault seal is not readable at signing time');
  return {
    digest,
    basis: BINDING_BASIS.VAULT_DATA_ROOM_SEAL_MANIFEST,
    note: `sha256 (stableStringify) over seal ${rest}'s manifest: every current document's identity, version, content hash, filing and lifecycle stage as it was sealed.`,
  };
};

/** The binders deriveGovernedTargetBinding delegates to, by target prefix. */
export const CONTENT_BINDERS: Readonly<Record<string, ContentBinder>> = {
  'protocol-document': (client, rest, orgId, fallback) =>
    protocolContentBinding(client, 'protocol-document', rest, orgId, fallback),
  'protocol-review-assignment': (client, rest, orgId, fallback) =>
    protocolContentBinding(client, 'protocol-review-assignment', rest, orgId, fallback),
  'report-run': reportRunSealBinding,
  'interim-snapshot': interimSnapshotBinding,
  'agency-question': agencyResponseBinding,
  'regulatory-commitment': commitmentFulfilmentBinding,
  'qms-document': qmsDocumentContentBinding,
  'vault-data-room-seal': vaultDataRoomSealBinding,
};

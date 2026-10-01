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

/** The binders deriveGovernedTargetBinding delegates to, by target prefix. */
export const CONTENT_BINDERS: Readonly<Record<string, ContentBinder>> = {
  'protocol-document': (client, rest, orgId, fallback) =>
    protocolContentBinding(client, 'protocol-document', rest, orgId, fallback),
  'protocol-review-assignment': (client, rest, orgId, fallback) =>
    protocolContentBinding(client, 'protocol-review-assignment', rest, orgId, fallback),
  'report-run': reportRunSealBinding,
};

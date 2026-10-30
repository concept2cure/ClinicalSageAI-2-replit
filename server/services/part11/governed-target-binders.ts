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
import {
  readRbmAssessmentSignatureContent, readRbmPlanSignatureContent,
  RBM_ASSESSMENT_SIGNATURE_RECIPE, RBM_PLAN_SIGNATURE_RECIPE,
} from '../rbm/rbm-signature-content.js';
import {
  FILED_BASELINE_DIGEST_RECIPE,
  filedBaselineDigest,
  readFiledBaselineById,
} from '../submission-service/filed-sequence-baseline-content.js';

/**
 * A record a recipe binds besides its own (P-64: the document a translation
 * translates), as the signature's manifest records it (`boundSource`).
 */
export interface BoundSource {
  target: string;
  version: string;
  contentDigest: string;
}

/**
 * A re-derivation that is not the current recipe's (signed-content-state.ts):
 * the recipe a signature recorded, so a signature taken by an earlier recipe is
 * checked by that recipe; and, for a recipe that binds a source, the source as
 * the signature recorded it, to tell a source that moved on from a record that
 * was edited. A binder that does not derive the recipe asked for falls back.
 */
export interface BinderOptions {
  recipe?: string;
  asOfSource?: BoundSource;
}

/** One target type's binder: `rest` is the pointer after `<prefix>:`. */
export type ContentBinder = (
  client: SignatureDbClient,
  rest: string,
  orgId: number,
  ledgerFallback: (why: string) => GovernedBinding,
  options?: BinderOptions,
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
  // RR4 (§2.8): a review of a document in review binds exactly what its
  // approval will sign — the version content with its authored sections
  // captured, the one recipe (qmsSignedContent) — so the review digest equals
  // the approval digest.
  if (row.status === 'in_review') {
    const { qmsSignedContent } = await import('../qms/document-approval-signature.js');
    const { contentDigest } = await qmsSignedContent(client as never, row);
    return {
      digest: contentDigest,
      basis: BINDING_BASIS.QMS_DOCUMENT_VERSION_CONTENT,
      note: `sha256 over QMS document ${rest} v${String(row.version)}'s controlled content under review (identity, title, type, category, artifact, next review date, and metadata without its approval block, with the authored sections when it is authored in the editor): the content its approval will sign.`,
    };
  }
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

/**
 * submission-filed-baseline:<uuid>: a declaration, written on this client a
 * moment ago, that a submission's US sequences 0000–N were filed outside the
 * platform (D7, 2026-10-29). The signature binds what the declarer attests:
 * the sequences, the one that opened the Original Application, and the
 * evidence's bytes. A declaration not readable here has nothing to bind, and
 * the act, which declares this basis, is refused.
 */
const filedSequenceBaselineBinding: ContentBinder = async (client, rest, orgId, ledgerFallback) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rest)) return ledgerFallback('malformed filed-baseline pointer');
  const baseline = await readFiledBaselineById(client, orgId, rest);
  if (!baseline) return ledgerFallback('the declaration is not readable at signing time');
  return {
    digest: filedBaselineDigest(baseline),
    basis: BINDING_BASIS.FILED_SEQUENCE_BASELINE_CONTENT,
    note: `sha256 (recipe ${FILED_BASELINE_DIGEST_RECIPE}) over submission ${baseline.submissionId}'s declaration that its ` +
      `${baseline.region} sequences 0000–${baseline.lastFiledSequence} were filed outside the platform, sequence ` +
      `${baseline.originalSequence} opening the Original Application, on the evidence of Vault document ` +
      `${baseline.evidenceVaultDocumentId} at sha256 ${baseline.evidenceSha256}. No reason, declarer or time is bound.`,
  };
};

/* ─── Device labeling and risk (D5, 2026-10-29) ───────────────────────────────
   docs/evidence/D5-CONTENT-DIGEST-BINDERS/2026-10-29/README.md names every
   field each recipe takes and every field it leaves out, and why. All three
   are CONTENT ONLY, as the protocol binder is: nothing the signing act itself
   writes (status, the approval stamp, the effective date, `acceptable`,
   updated_at), so the digest the binder takes after the act's write is the
   digest of the record as the signer reviewed it, and a signature still
   re-derives after a later workflow step that changed nothing it attested.
   Each act declares its basis (SignedAct.contentBasis), so a fallback below
   refuses the act rather than signing over the chain hash.

   Since P-63 and P-64 (2026-10-29; docs/evidence/D5-SIGNED-CONTENT-LOCKED/
   2026-10-29/README.md): each recipe's attested fields are a list
   (RecipeAttestation) that its binder builds its content from and that the
   one refusal of an edit to signed content reads (signed-content-lock.ts); the
   translation recipe is v2, which also binds the source document's version
   and content digest; and a binder derives the recipe a signature recorded
   (BinderOptions.recipe), so a v1 approval is still checked by v1. Each binding
   records its recipe on the manifest (`bindingRecipe`). The v1 and
   risk-residual-acceptance/v1 bytes are unchanged: the content is keyed and
   valued as before, only built from the list. */

/** Recipe tags inside the digested bytes, so a later recipe cannot collide with these. */
export const LABELING_DOCUMENT_DIGEST_RECIPE = 'labeling-document/v1' as const;
/** The translation recipe since P-64 (2026-10-29): v1, and the source document's version and content digest. */
export const LABELING_TRANSLATION_DIGEST_RECIPE = 'labeling-translation/v2' as const;
/** The translation recipe from 84aada8f7 to P-64. Still derived, for the signatures taken by it. */
export const LABELING_TRANSLATION_V1_DIGEST_RECIPE = 'labeling-translation/v1' as const;
export const RISK_RESIDUAL_ACCEPTANCE_DIGEST_RECIPE = 'risk-residual-acceptance/v1' as const;

/**
 * One field a recipe attests: the key it is digested under, which is also the
 * field's name in the record's API (PATCH body), and the column it is read from.
 */
export interface AttestedField {
  readonly field: string;
  readonly column: string;
  /** Digested as a number (an integer column node-pg may hand back as text). */
  readonly int?: true;
}

/**
 * What a recipe attests (P-63, 2026-10-29). The binder below builds its
 * content from these lists, and the one refusal of an edit to signed content
 * (services/part11/signed-content-lock.ts) refuses exactly these fields, so
 * the digest and the refusal read one list and cannot drift.
 */
export interface RecipeAttestation {
  readonly recipe: string;
  /** The record's own attested fields. */
  readonly fields: readonly AttestedField[];
  /** The API field naming the text artifact the recipe digests by its content's sha256, or null. */
  readonly textField: 'artifactId' | null;
  /** Child rows digested with the record, by table: adding, editing or removing one changes signed content. */
  readonly children: Readonly<Record<string, readonly AttestedField[]>>;
  /** The record whose version and content digest the recipe also binds (P-64), or null. */
  readonly source: 'labeling-document' | null;
}

const text = (field: string, column = field): AttestedField => ({ field, column });
const int = (field: string, column = field): AttestedField => ({ field, column, int: true });

export const LABELING_DOCUMENT_ATTESTATION: RecipeAttestation = {
  recipe: LABELING_DOCUMENT_DIGEST_RECIPE,
  fields: [
    text('deviceName', 'device_name'), text('docKind', 'doc_kind'), text('version'), text('language'),
    text('region'), text('udiDi', 'udi_di'), text('expiresAt', 'expires_at'),
  ],
  textField: 'artifactId',
  children: {
    labeling_symbols: [text('symbolCode', 'symbol_code'), text('symbolName', 'symbol_name'), text('description'), text('requiredBy', 'required_by')],
  },
  source: null,
};

const TRANSLATION_FIELDS: readonly AttestedField[] = [
  text('language'), text('translator'), text('translationMethod', 'translation_method'),
  text('backTranslationVerified', 'back_translation_verified'),
];

export const LABELING_TRANSLATION_ATTESTATION: RecipeAttestation = {
  recipe: LABELING_TRANSLATION_DIGEST_RECIPE, fields: TRANSLATION_FIELDS, textField: 'artifactId', children: {}, source: 'labeling-document',
};

export const LABELING_TRANSLATION_V1_ATTESTATION: RecipeAttestation = {
  ...LABELING_TRANSLATION_ATTESTATION, recipe: LABELING_TRANSLATION_V1_DIGEST_RECIPE, source: null,
};

export const RISK_RESIDUAL_ACCEPTANCE_ATTESTATION: RecipeAttestation = {
  recipe: RISK_RESIDUAL_ACCEPTANCE_DIGEST_RECIPE,
  fields: [
    text('refCode', 'ref_code'), text('hazard'), text('hazardousSituation', 'hazardous_situation'), text('harm'),
    text('sequenceOfEvents', 'sequence_of_events'), int('severity'), int('probability'), int('detectability'),
    int('initialRisk', 'initial_risk'), text('controlStrategy', 'control_strategy'), text('source'),
    int('residualSeverity', 'residual_severity'), int('residualProbability', 'residual_probability'),
    int('residualRisk', 'residual_risk'), text('benefitRiskRationale', 'benefit_risk_rationale'),
  ],
  textField: null,
  children: {
    risk_controls: [
      text('description'), text('controlType', 'control_type'), text('implementationEvidence', 'implementation_evidence'),
      text('verificationEvidence', 'verification_evidence'), text('effectivenessEvidence', 'effectiveness_evidence'),
      text('introducesNewRisk', 'introduces_new_risk'), int('newRiskItemId', 'new_risk_item_id'), text('status'),
    ],
  },
  source: null,
};

/**
 * The text a labeling row names (`artifact_id`, a concept2cure_artifacts id):
 * its id and the sha256 of its content, by the AnA artifact binding's own
 * hash (sha256OfContent). null when the row names none; undefined when it
 * names one this organisation cannot read, which is not "no text". The hash
 * module is loaded when a signature is taken: it imports signature-persistence,
 * which imports this module (the QMS binder's reason too).
 */
async function namedText(client: SignatureDbClient, artifactId: unknown, orgId: number): Promise<{ id: number; contentSha256: string } | null | undefined> {
  if (artifactId == null) return null;
  const { rows } = await client.query(
    `SELECT content FROM concept2cure_artifacts WHERE id = $1::int AND organization_id = $2 LIMIT 1`,
    [artifactId, orgId],
  );
  if (rows.length === 0) return undefined;
  const { sha256OfContent } = await import('../ana-ri/governed-command-signature.js');
  return { id: Number(artifactId), contentSha256: sha256OfContent(rows[0].content) };
}

const orNull = (v: unknown): unknown => (v === undefined ? null : v);
const intOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

/** `row`'s attested fields, keyed as the recipe digests them. Every SELECT below reads each listed column. */
function attestedValues(fields: readonly AttestedField[], row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f.field] = f.int ? intOrNull(row[f.column]) : orNull(row[f.column]);
  return out;
}

/** Why `options` asks for a recipe this binder does not derive, or null when it asks for none or for `current`. */
function otherRecipe(options: BinderOptions | undefined, ...derivable: string[]): string | null {
  const asked = options?.recipe;
  return asked && !derivable.includes(asked) ? `recipe '${asked}' is not one this binder derives` : null;
}

type LabelingDocumentContent = { content: Record<string, unknown>; symbols: number; text: { id: number } | null };

/** labeling-document/v1's content, or why it cannot be read now. Shared by the label's binder and the translation's source. */
async function labelingDocumentContent(client: SignatureDbClient, rest: string, orgId: number): Promise<LabelingDocumentContent | string> {
  const { rows } = await client.query(
    `SELECT device_name, doc_kind, version, language, region, udi_di,
            to_char(expires_at, 'YYYY-MM-DD') AS expires_at, artifact_id
       FROM labeling_documents
      WHERE id = $1::int AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [rest, orgId],
  );
  const d = rows[0];
  if (!d) return 'labeling document not readable at signing time';
  const named = await namedText(client, d.artifact_id, orgId);
  if (named === undefined) return `the label text it names (artifact ${String(d.artifact_id)}) is not readable at signing time`;
  const symbols = (await client.query(
    `SELECT symbol_code, symbol_name, description, required_by
       FROM labeling_symbols
      WHERE labeling_document_id = $1::int AND organization_id = $2
      ORDER BY symbol_code, id`,
    [rest, orgId],
  )).rows;
  const content = {
    recipe: LABELING_DOCUMENT_DIGEST_RECIPE,
    labelingDocumentId: Number(rest),
    // expires_at is its own yyyy-mm-dd text: node-pg reads a DATE as a local midnight.
    ...attestedValues(LABELING_DOCUMENT_ATTESTATION.fields, d),
    artifact: named,
    symbols: symbols.map((s) => attestedValues(LABELING_DOCUMENT_ATTESTATION.children.labeling_symbols, s)),
  };
  return { content, symbols: symbols.length, text: named };
}

/**
 * labeling-document:<id>: a device label as its approver attests it, for its
 * approval, its move to effective and its supersession alike. Its translations
 * are signed on their own targets, so none is digested here.
 */
const labelingDocumentBinding: ContentBinder = async (client, rest, orgId, ledgerFallback, options) => {
  if (!/^\d{1,10}$/.test(rest)) return ledgerFallback('malformed labeling document pointer');
  const unknown = otherRecipe(options, LABELING_DOCUMENT_DIGEST_RECIPE);
  if (unknown) return ledgerFallback(unknown);
  const read = await labelingDocumentContent(client, rest, orgId);
  if (typeof read === 'string') return ledgerFallback(read);
  return {
    digest: sha256CanonicalJson(read.content),
    basis: BINDING_BASIS.LABELING_DOCUMENT_CONTENT,
    note: `sha256 (recipe ${LABELING_DOCUMENT_DIGEST_RECIPE}) over labeling document ${rest}: device, kind, version ${String(read.content.version)}, language, region, UDI-DI and expiry, ${read.symbols} ISO 15223-1 symbol(s), and ${read.text ? `the sha256 of the label text in artifact ${read.text.id}` : 'no label text artifact'}. No status, approval stamp, effective date or timestamp is bound.`,
    manifest: { bindingRecipe: LABELING_DOCUMENT_DIGEST_RECIPE },
  };
};

/** The source a v2 translation binds: its document's version and labeling-document/v1 digest, as recorded or as it stands now. */
async function translationSource(client: SignatureDbClient, docId: number, orgId: number, options: BinderOptions | undefined): Promise<BoundSource | string> {
  const target = `labeling-document:${docId}`;
  if (options?.asOfSource) return options.asOfSource.target === target ? options.asOfSource : `the recorded source is ${options.asOfSource.target}, not ${target}`;
  const read = await labelingDocumentContent(client, String(docId), orgId);
  if (typeof read === 'string') return `the source document it translates cannot be bound: ${read}`;
  return { target, version: String(read.content.version), contentDigest: sha256CanonicalJson(read.content) };
}

/**
 * labeling-translation:<id>: one translation as its approver attests it, on a
 * live document of the organisation. Since P-64 (v2) the approval also binds
 * the source it translates: the document's version and its content digest by
 * the label's own recipe, recorded on the manifest as `boundSource` so a read
 * can tell a moved source from an edited translation. v1 is still derived, by
 * the recipe a signature records, for the approvals taken by it.
 */
const labelingTranslationBinding: ContentBinder = async (client, rest, orgId, ledgerFallback, options) => {
  if (!/^\d{1,10}$/.test(rest)) return ledgerFallback('malformed labeling translation pointer');
  const unknown = otherRecipe(options, LABELING_TRANSLATION_DIGEST_RECIPE, LABELING_TRANSLATION_V1_DIGEST_RECIPE);
  if (unknown) return ledgerFallback(unknown);
  const recipe = options?.recipe ?? LABELING_TRANSLATION_DIGEST_RECIPE;
  const { rows } = await client.query(
    `SELECT t.labeling_document_id, t.language, t.translator, t.translation_method,
            t.back_translation_verified, t.artifact_id
       FROM labeling_translations t
       JOIN labeling_documents d
         ON d.id = t.labeling_document_id AND d.organization_id = t.organization_id
      WHERE t.id = $1::int AND t.organization_id = $2 AND d.deleted_at IS NULL
      LIMIT 1`,
    [rest, orgId],
  );
  const t = rows[0];
  if (!t) return ledgerFallback('labeling translation not readable at signing time');
  const named = await namedText(client, t.artifact_id, orgId);
  if (named === undefined) return ledgerFallback(`the translated text it names (artifact ${String(t.artifact_id)}) is not readable at signing time`);
  const own = {
    recipe,
    translationId: Number(rest),
    labelingDocumentId: Number(t.labeling_document_id),
    ...attestedValues(TRANSLATION_FIELDS, t),
    artifact: named,
  };
  const head = `sha256 (recipe ${recipe}) over translation ${rest} (${String(t.language)}) of labeling document ${String(t.labeling_document_id)}: translator, method, back-translation check, and ${named ? `the sha256 of the translated text in artifact ${named.id}` : 'no translated text artifact'}`;
  if (recipe === LABELING_TRANSLATION_V1_DIGEST_RECIPE) {
    return {
      digest: sha256CanonicalJson(own),
      basis: BINDING_BASIS.LABELING_TRANSLATION_CONTENT,
      note: `${head}. No status, approval stamp or timestamp is bound.`,
      manifest: { bindingRecipe: recipe },
    };
  }
  const source = await translationSource(client, Number(t.labeling_document_id), orgId, options);
  if (typeof source === 'string') return ledgerFallback(source);
  return {
    digest: sha256CanonicalJson({ ...own, source: { version: source.version, contentDigest: source.contentDigest } }),
    basis: BINDING_BASIS.LABELING_TRANSLATION_CONTENT,
    note: `${head}, and the source it translates: labeling document ${String(t.labeling_document_id)} at version ${source.version}, content sha256 ${source.contentDigest} (recipe ${LABELING_DOCUMENT_DIGEST_RECIPE}). No status, approval stamp or timestamp is bound.`,
    manifest: { bindingRecipe: recipe, boundSource: source },
  };
};

/**
 * risk-item:<id>: an ISO 14971 hazard as its residual risk is accepted, with
 * every risk control the residual estimate rests on, in id order.
 */
const riskResidualAcceptanceBinding: ContentBinder = async (client, rest, orgId, ledgerFallback, options) => {
  if (!/^\d{1,10}$/.test(rest)) return ledgerFallback('malformed risk item pointer');
  const unknown = otherRecipe(options, RISK_RESIDUAL_ACCEPTANCE_DIGEST_RECIPE);
  if (unknown) return ledgerFallback(unknown);
  const { rows } = await client.query(
    `SELECT ref_code, hazard, hazardous_situation, harm, sequence_of_events, severity, probability,
            detectability, initial_risk, control_strategy, source, residual_severity,
            residual_probability, residual_risk, benefit_risk_rationale
       FROM risk_items
      WHERE id = $1::int AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [rest, orgId],
  );
  const r = rows[0];
  if (!r) return ledgerFallback('risk item not readable at signing time');
  const controls = (await client.query(
    `SELECT description, control_type, implementation_evidence, verification_evidence,
            effectiveness_evidence, introduces_new_risk, new_risk_item_id, status
       FROM risk_controls
      WHERE risk_item_id = $1::int AND organization_id = $2
      ORDER BY id`,
    [rest, orgId],
  )).rows;
  const content = {
    recipe: RISK_RESIDUAL_ACCEPTANCE_DIGEST_RECIPE,
    riskItemId: Number(rest),
    ...attestedValues(RISK_RESIDUAL_ACCEPTANCE_ATTESTATION.fields, r),
    controls: controls.map((c) => attestedValues(RISK_RESIDUAL_ACCEPTANCE_ATTESTATION.children.risk_controls, c)),
  };
  return {
    digest: sha256CanonicalJson(content),
    basis: BINDING_BASIS.RISK_RESIDUAL_ACCEPTANCE_CONTENT,
    note: `sha256 (recipe ${RISK_RESIDUAL_ACCEPTANCE_DIGEST_RECIPE}) over risk item ${rest}: hazard, hazardous situation, harm, sequence of events, initial estimate (${String(r.severity)} x ${String(r.probability)}), residual estimate (${String(r.residual_severity)} x ${String(r.residual_probability)}), control strategy, source, benefit-risk rationale, and ${controls.length} risk control(s) with their evidence and status. No status, acceptability flag, project, assignee or timestamp is bound.`,
    manifest: { bindingRecipe: RISK_RESIDUAL_ACCEPTANCE_DIGEST_RECIPE },
  };
};

/** Signing and verification use the same immutable RBM version recipe. */
function rbmContentBinding(kind: 'assessment' | 'plan'): ContentBinder {
  const assessment = kind === 'assessment';
  const recipe = assessment ? RBM_ASSESSMENT_SIGNATURE_RECIPE : RBM_PLAN_SIGNATURE_RECIPE;
  const read = assessment ? readRbmAssessmentSignatureContent : readRbmPlanSignatureContent;
  return async (client, rest, orgId, fallback, options) => {
    if (!/^\d+$/.test(rest) || !Number.isSafeInteger(Number(rest)) || Number(rest) <= 0) return fallback('malformed RBM pointer');
    const unknown = otherRecipe(options, recipe);
    if (unknown) return fallback(unknown);
    const content = await read(client, Number(rest), orgId);
    if (!content) return fallback('RBM version content or project relationships cannot be verified');
    return { digest: sha256CanonicalJson(content),
      basis: assessment ? BINDING_BASIS.RBM_ASSESSMENT_CONTENT : BINDING_BASIS.RBM_MONITORING_PLAN_CONTENT,
      note: `sha256 (recipe ${recipe}) over the retained RBM version, project identity and immutable content; workflow stamps and monitoring execution actions excluded.`,
      manifest: { bindingRecipe: recipe } };
  };
}

/** The binders deriveGovernedTargetBinding delegates to, by target prefix. */
export const CONTENT_BINDERS: Readonly<Record<string, ContentBinder>> = {
  'rbm-assessment': rbmContentBinding('assessment'),
  'rbm-monitoring-plan': rbmContentBinding('plan'),
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
  'submission-filed-baseline': filedSequenceBaselineBinding,
  'labeling-document': labelingDocumentBinding,
  'labeling-translation': labelingTranslationBinding,
  'risk-item': riskResidualAcceptanceBinding,
};

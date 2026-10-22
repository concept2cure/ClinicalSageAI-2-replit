/**
 * Informed Consent Form service (Capability C2C-18d)
 *
 * Tenant-scoped transaction functions for authoring an informed-consent form:
 * create a form (auto-seeded with the required elements of consent as not-present
 * rows), edit an element's content + presence, read the form with its elements,
 * score completeness, and approve behind a deterministic completeness gate.
 * Mutations run inside the caller's transaction with the governed-action ledger.
 *
 * @module server/services/protocol-consent/protocol-consent-service
 */

import { pool } from '../../db';
import {
  enforceAuthorLineage,
  enforceSourceAndAuthorLineage,
  type SourceAndAuthorLineageResult,
} from '../clinical-regulatory-evidence/lineage-gate';
import type { RetrievedSource } from '../clinical-regulatory-evidence/source-attribution';
import {
  consentElementTemplates,
  evaluateConsentCompleteness,
  missingTemplateElements,
  type ConsentCompletenessResult,
  type ConsentElementTemplate,
} from './protocol-consent-logic';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class ConsentFormError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'ConsentFormError';
  }
}

// ─── Forms ───────────────────────────────────────────────────────────────────

export interface ConsentFormInput {
  title: string;
  protocolDocumentId?: number | null;
  version?: string | null;
  language?: string | null;
  readingLevel?: string | null;
  /** Applicable clinical trial (42 U.S.C. 282(j)); unknown holds the form to 21 CFR 50.25(c). */
  applicableClinicalTrial?: boolean | null;
}

/**
 * Add the template elements a form's rows do not cover, after its last row.
 * Structure only — every added row is empty and not present.
 */
async function insertMissingElementsTx(client: Queryable, ids: { orgId: number; formId: number; userId: number }, templates: ConsentElementTemplate[]): Promise<number> {
  const { rows } = await client.query(
    `SELECT element_key, order_index FROM consent_form_elements WHERE consent_form_id = $1 AND organization_id = $2`,
    [ids.formId, ids.orgId],
  );
  const missing = missingTemplateElements(rows.map((r) => ({ elementKey: r.element_key })), templates);
  let order = rows.reduce((m, r) => Math.max(m, Number(r.order_index) + 1), 0);
  for (const e of missing) {
    await client.query(
      `INSERT INTO consent_form_elements (organization_id, consent_form_id, element_key, title, content, required, present, order_index, created_by)
       VALUES ($1,$2,$3,$4,NULL,$5,false,$6,$7)`,
      [ids.orgId, ids.formId, e.elementKey, e.title, e.required, order++, ids.userId],
    );
  }
  return missing.length;
}

/** Create a consent form and seed it with the elements of informed consent. */
export async function createConsentFormTx(client: Queryable, orgId: number, userId: number, input: ConsentFormInput): Promise<{ id: number; elementsSeeded: number }> {
  if (!input.title || !input.title.trim()) throw new ConsentFormError('BAD_INPUT', 'A consent form title is required.');
  const { rows } = await client.query(
    `INSERT INTO consent_forms (organization_id, protocol_document_id, title, version, language, reading_level, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'draft',$7) RETURNING id`,
    [orgId, input.protocolDocumentId ?? null, input.title.trim(), input.version ?? '0.1', input.language ?? 'en', input.readingLevel ?? null, userId],
  );
  const id = Number(rows[0].id);
  const templates = consentElementTemplates({ applicableClinicalTrial: input.applicableClinicalTrial });
  const elementsSeeded = await insertMissingElementsTx(client, { orgId, formId: id, userId }, templates);
  return { id, elementsSeeded };
}

/**
 * A draft or in-review form gains the elements it is now held to (decision of
 * 2026-10-21: the shared record's FDA elements, the ClinicalTrials.gov
 * statement required while applicable-clinical-trial status is unknown). The
 * form row is locked first, so two edits cannot add the same element twice.
 * An approved or superseded form is the signed record and is never changed.
 */
async function syncFormElementsTx(client: Queryable, orgId: number, formId: number, userId: number): Promise<number> {
  const f = await client.query(`SELECT status FROM consent_forms WHERE id = $1 AND organization_id = $2 FOR UPDATE`, [formId, orgId]);
  const status = f.rows[0]?.status;
  if (status !== 'draft' && status !== 'in_review') return 0;
  return insertMissingElementsTx(client, { orgId, formId, userId }, consentElementTemplates());
}

/**
 * Record whether the study is an applicable clinical trial: the 21 CFR
 * 50.25(c) statement is then required (true) or optional (false).
 */
export async function setApplicableClinicalTrialTx(client: Queryable, orgId: number, userId: number, input: { formId: number; applicableClinicalTrial: boolean }): Promise<{ formId: number; applicableClinicalTrial: boolean }> {
  const form = await loadForm(client, orgId, input.formId);
  assertEditable(form.status);
  await syncFormElementsTx(client, orgId, input.formId, userId);
  await client.query(
    `UPDATE consent_form_elements SET required = $3, updated_at = now() WHERE consent_form_id = $1 AND organization_id = $2 AND element_key = 'clinicaltrials_gov'`,
    [input.formId, orgId, input.applicableClinicalTrial],
  );
  return { formId: input.formId, applicableClinicalTrial: input.applicableClinicalTrial };
}

async function loadForm(client: Queryable, orgId: number, formId: number): Promise<{ status: string }> {
  const f = await client.query(`SELECT status FROM consent_forms WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [formId, orgId]);
  if (f.rows.length === 0) throw new ConsentFormError('NOT_FOUND', 'Consent form not found for this organization.');
  return { status: f.rows[0].status };
}

function assertEditable(status: string): void {
  if (status === 'approved' || status === 'superseded') throw new ConsentFormError('INVALID_STATE', `Consent form is ${status}; create a new version to edit.`);
}

// ─── Elements ──────────────────────────────────────────────────────────────

export async function updateElementTx(client: Queryable, orgId: number, elementId: number, input: { content?: string | null; present?: boolean ; sources?: RetrievedSource[] }, actorUserId: number): Promise<SourceAndAuthorLineageResult | null> {
  const el = await client.query(
    `SELECT e.id, f.status AS form_status, f.id AS form_id FROM consent_form_elements e JOIN consent_forms f ON f.id = e.consent_form_id
      WHERE e.id = $1 AND e.organization_id = $2 LIMIT 1`,
    [elementId, orgId],
  );
  if (el.rows.length === 0) throw new ConsentFormError('NOT_FOUND', 'Consent element not found for this organization.');
  assertEditable(el.rows[0].form_status);
  await syncFormElementsTx(client, orgId, Number(el.rows[0].form_id), actorUserId);
  await client.query(
    `UPDATE consent_form_elements SET content = COALESCE($3, content), present = COALESCE($4, present), updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [elementId, orgId, input.content ?? null, input.present ?? null],
  );
  // Prose gate (ledger L158): the element's text and its lineage commit in the
  // caller's transaction, exactly as protocol and biosketch sections do. With
  // `sources` (an AnA draft naming the Data Room passages it quoted) the
  // verbatim clauses are recorded against those sources and the rest against
  // the author; without, every clause is the author's assertion. A status-only
  // edit (content absent) no-ops the gate inside the helper.
  let lineage: SourceAndAuthorLineageResult | null = null;
  if (input.sources && input.sources.length > 0 && typeof input.content === 'string') {
    lineage = await enforceSourceAndAuthorLineage(client, orgId, { documentTable: 'consent_form_elements', documentId: String(elementId) }, input.content, String(actorUserId), input.sources);
  } else {
    await enforceAuthorLineage(client, orgId, { documentTable: 'consent_form_elements', documentId: String(elementId) }, input.content ?? null, String(actorUserId));
  }
  await client.query(`UPDATE consent_forms SET status = CASE WHEN status = 'draft' THEN 'in_review' ELSE status END, updated_at = now() WHERE id = $1 AND organization_id = $2`, [el.rows[0].form_id, orgId]);
  return lineage;
}

// ─── Completeness + approve ──────────────────────────────────────────────────

async function completenessInputFor(orgId: number, formId: number) {
  const { rows } = await pool.query(
    `SELECT element_key, required, present, content FROM consent_form_elements WHERE consent_form_id = $1 AND organization_id = $2`,
    [formId, orgId],
  );
  return rows.map((r) => ({ elementKey: r.element_key, required: r.required, present: r.present, content: r.content }));
}

export interface ConsentFormCompleteness extends ConsentCompletenessResult {
  /**
   * For an approved or superseded form: required elements it was approved
   * without, because they were added to the platform's requirements after.
   * The signed record is unchanged; a new version is held to them.
   */
  predatesCurrentElements: string[];
}

/** Read-only completeness assessment, against the elements a form is held to now. */
export async function getCompleteness(orgId: number, formId: number): Promise<ConsentFormCompleteness> {
  const form = await loadForm(pool, orgId, formId);
  const rows = await completenessInputFor(orgId, formId);
  const result = evaluateConsentCompleteness(rows, { expected: consentElementTemplates() });
  if (form.status !== 'approved' && form.status !== 'superseded') return { ...result, predatesCurrentElements: [] };
  const predates = missingTemplateElements(rows, consentElementTemplates()).filter((t) => t.required).map((t) => t.elementKey);
  const findings = predates.length === 0 ? result.findings : [...result.findings, {
    severity: 'info' as const,
    message: `This form was ${form.status} before the platform held consent forms to ${predates.join(', ')}. The ${form.status} record is unchanged; a new version must include them.`,
  }];
  return { ...result, findings, predatesCurrentElements: predates };
}

/** Approve — gated on the deterministic completeness check. */
export async function approveConsentFormTx(client: Queryable, orgId: number, userId: number, formId: number): Promise<{ approved: true; completeness: ConsentCompletenessResult }> {
  const form = await loadForm(client, orgId, formId);
  if (form.status === 'approved') throw new ConsentFormError('INVALID_STATE', 'Consent form is already approved.');
  if (form.status === 'superseded') throw new ConsentFormError('INVALID_STATE', 'Consent form is superseded.');
  const elements = await client.query(`SELECT element_key, required, present, content FROM consent_form_elements WHERE consent_form_id = $1 AND organization_id = $2`, [formId, orgId]);
  const completeness = evaluateConsentCompleteness(
    elements.rows.map((r) => ({ elementKey: r.element_key, required: r.required, present: r.present, content: r.content })),
    { expected: consentElementTemplates() },
  );
  if (!completeness.readyToApprove) {
    throw new ConsentFormError('INVALID_STATE', `Cannot approve — ${completeness.findings.filter((f) => f.severity === 'critical').map((f) => f.message).join(' ')}`);
  }
  await client.query(`UPDATE consent_forms SET status = 'approved', updated_at = now() WHERE id = $1 AND organization_id = $2`, [formId, orgId]);
  return { approved: true, completeness };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listConsentForms(orgId: number, protocolDocumentId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, protocol_document_id, title, version, language, reading_level, status, created_at, updated_at
               FROM consent_forms WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (protocolDocumentId != null) { params.push(protocolDocumentId); sql += ` AND protocol_document_id = $2`; }
  sql += ` ORDER BY updated_at DESC, id DESC`;
  return (await pool.query(sql, params)).rows;
}

export async function getConsentForm(orgId: number, formId: number): Promise<any | null> {
  const f = await pool.query(`SELECT * FROM consent_forms WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [formId, orgId]);
  if (f.rows.length === 0) return null;
  const elements = await pool.query(
    `SELECT id, element_key, title, content, required, present, order_index FROM consent_form_elements WHERE consent_form_id = $1 AND organization_id = $2 ORDER BY order_index, id`,
    [formId, orgId],
  );
  return { ...f.rows[0], elements: elements.rows };
}

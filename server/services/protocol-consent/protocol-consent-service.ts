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
  type ConsentCompletenessResult,
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
}

/** Create a consent form and seed it with the required elements of consent. */
export async function createConsentFormTx(client: Queryable, orgId: number, userId: number, input: ConsentFormInput): Promise<{ id: number; elementsSeeded: number }> {
  if (!input.title || !input.title.trim()) throw new ConsentFormError('BAD_INPUT', 'A consent form title is required.');
  const { rows } = await client.query(
    `INSERT INTO consent_forms (organization_id, protocol_document_id, title, version, language, reading_level, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'draft',$7) RETURNING id`,
    [orgId, input.protocolDocumentId ?? null, input.title.trim(), input.version ?? '0.1', input.language ?? 'en', input.readingLevel ?? null, userId],
  );
  const id = Number(rows[0].id);
  const templates = consentElementTemplates();
  let order = 0;
  for (const e of templates) {
    await client.query(
      `INSERT INTO consent_form_elements (organization_id, consent_form_id, element_key, title, content, required, present, order_index, created_by)
       VALUES ($1,$2,$3,$4,NULL,$5,false,$6,$7)`,
      [orgId, id, e.elementKey, e.title, e.required, order++, userId],
    );
  }
  return { id, elementsSeeded: templates.length };
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

/** Read-only completeness assessment (uses the pure evaluateConsentCompleteness). */
export async function getCompleteness(orgId: number, formId: number): Promise<ConsentCompletenessResult> {
  await loadForm(pool, orgId, formId);
  return evaluateConsentCompleteness(await completenessInputFor(orgId, formId));
}

/** Approve — gated on the deterministic completeness check. */
export async function approveConsentFormTx(client: Queryable, orgId: number, userId: number, formId: number): Promise<{ approved: true; completeness: ConsentCompletenessResult }> {
  const form = await loadForm(client, orgId, formId);
  if (form.status === 'approved') throw new ConsentFormError('INVALID_STATE', 'Consent form is already approved.');
  if (form.status === 'superseded') throw new ConsentFormError('INVALID_STATE', 'Consent form is superseded.');
  const elements = await client.query(`SELECT element_key, required, present, content FROM consent_form_elements WHERE consent_form_id = $1 AND organization_id = $2`, [formId, orgId]);
  const completeness = evaluateConsentCompleteness(elements.rows.map((r) => ({ elementKey: r.element_key, required: r.required, present: r.present, content: r.content })));
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

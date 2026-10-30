/** Persisted-signature shape for SQL/unit proofs; native positives use the real writer. */
import { manifestSignatureHash } from '../../part11/signature-persistence';
import { computeQmsDocumentContentDigest, QMS_DOCUMENT_BINDING_BASIS, type QmsDocumentRow } from '../document-approval-signature';

export const QMS_APPROVAL_FIXTURE_DDL = `CREATE TABLE electronic_signatures (
  id serial PRIMARY KEY, organization_id integer, signed_target text, signature_type text,
  signer_id integer, signer_name text, signer_email text, signed_at timestamptz,
  signature_meaning text, signature_purpose text, signature_manifest json,
  signature_hash text, binding_basis text, bound_payload_digest text,
  is_valid boolean, superseded_by integer, verification_status text
);`;

export function qmsApprovalFixture(document: QmsDocumentRow) {
  const signedAt = new Date(document.approved_at!).toISOString();
  const digest = computeQmsDocumentContentDigest(document);
  const approval = document.metadata?.approval as Record<string, unknown> | undefined;
  const reason = typeof approval?.reason === 'string' ? approval.reason : 'Independently reviewed SQL fixture release.';
  const manifest = {
    kind: 'governed-sign', actionId: `test-qms-action-${document.id}`,
    auditId: `test-qms-audit-${document.id}`, auditSha256Chain: '1'.repeat(64),
    target: `qms-document:${document.id}`, command: 'approve', reason,
    meaning: 'APPROVED', signerId: document.approver_id,
    signerName: 'QMS fixture independent approver', signerEmail: 'qms-approver@example.test',
    organizationId: document.organization_id, signedAt, boundPayloadDigest: digest,
    bindingBasis: QMS_DOCUMENT_BINDING_BASIS, bindingNote: 'Exact canonical QMS version content.',
    docNumber: document.doc_number, version: document.version,
  };
  return { organization_id: document.organization_id, signed_target: manifest.target,
    signature_type: 'qms-document-approval', signer_id: document.approver_id,
    signer_name: manifest.signerName, signer_email: manifest.signerEmail, signed_at: signedAt,
    signature_meaning: manifest.meaning, signature_purpose: reason, signature_manifest: manifest,
    signature_hash: manifestSignatureHash(manifest), binding_basis: QMS_DOCUMENT_BINDING_BASIS,
    bound_payload_digest: digest, is_valid: true, superseded_by: null, verification_status: 'valid' };
}

export async function seedQmsApprovalFixture(client: { query(sql: string, params?: unknown[]): Promise<unknown> }, document: QmsDocumentRow) {
  const row = qmsApprovalFixture(document);
  await client.query(`INSERT INTO electronic_signatures
    (organization_id,signed_target,signature_type,signer_id,signer_name,signer_email,signed_at,
     signature_meaning,signature_purpose,signature_manifest,signature_hash,binding_basis,bound_payload_digest,
     is_valid,superseded_by,verification_status)
    VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8,$9,$10::json,$11,$12,$13,$14,$15,$16)`,
  [row.organization_id,row.signed_target,row.signature_type,row.signer_id,row.signer_name,row.signer_email,row.signed_at,
    row.signature_meaning,row.signature_purpose,JSON.stringify(row.signature_manifest),row.signature_hash,row.binding_basis,
    row.bound_payload_digest,row.is_valid,row.superseded_by,row.verification_status]);
}

let everyoneRoles = 0;
/**
 * Compliance counts the people assigned to a document (P-49, MR-12 Stage 4
 * slice 3). A case about receipts rather than assignment assigns the document a
 * job role every current member of its organization holds, so "assigned" is the
 * roster. Needs migrations/20261029g_qms_job_roles_and_training_assignments.sql.
 */
export async function assignToEveryone(
  client: { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> },
  organizationId: number, documentId: number, by: number,
): Promise<void> {
  everyoneRoles += 1;
  const role = (await client.query('INSERT INTO qms_job_roles (organization_id, name, created_by) VALUES ($1, $2, $3) RETURNING id',
    [organizationId, `Everyone ${everyoneRoles}`, by])).rows[0].id;
  await client.query(`INSERT INTO qms_job_role_members (organization_id, job_role_id, user_id, added_by)
    SELECT organization_id, $2, user_id, $3 FROM organization_users WHERE organization_id = $1`, [organizationId, role, by]);
  await client.query('INSERT INTO qms_training_assignments (organization_id, document_id, job_role_id, assigned_by) VALUES ($1, $2, $3, $4)',
    [organizationId, documentId, role, by]);
}

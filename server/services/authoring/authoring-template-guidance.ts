/** The guidance actually used to seed a saved section; never a code-only match. */
import type { RequestSqlClient } from '../../db/requestDb';
import type { AuthoringPrincipal } from './authoring-permissions';
import { resolveAuthoringSectionScope, decideAuthoringPermission } from './authoring-permissions';
import { authorizeAuthoringProgram } from './authoring-program-access';
import { parseRecordedTemplateSource } from '../../../shared/authoring/recorded-template-source';

export class TemplateGuidanceError extends Error {
  constructor(readonly status: 403 | 404 | 503, message: string) { super(message); }
}

function checkedDraftingModes(rows: Array<Record<string, unknown>>) {
  if (rows.some(row => row.drafting_mode !== undefined && row.drafting_mode !== 'narrative' && row.drafting_mode !== 'manual')) {
    throw new TemplateGuidanceError(503, 'The section template drafting mode could not be verified.');
  }
  return rows;
}

function assemblyTemplateId(metadata: Record<string, unknown>, source: unknown, docId: string): unknown {
  if (metadata.assembly === undefined) return undefined;
  const receipt = metadata.assembly as Record<string, unknown> | null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const sha = /^[0-9a-f]{64}$/i;
  if (!receipt || typeof receipt !== 'object' || receipt.version !== 1 || receipt.docId !== docId) {
    throw new TemplateGuidanceError(503, 'The recorded assembly guidance identity could not be verified.');
  }
  const identities = [receipt.programId, receipt.templateId];
  const hashes = [receipt.templateSnapshot, receipt.fingerprint];
  if (!identities.every(value => typeof value === 'string' && uuid.test(value)) ||
      !hashes.every(value => typeof value === 'string' && sha.test(value))) {
    throw new TemplateGuidanceError(503, 'The recorded assembly guidance fields could not be verified.');
  }
  try {
    const template = parseRecordedTemplateSource(source, receipt.templateId);
    if (!template || template.sha256 !== receipt.templateSnapshot) throw new Error('Template snapshot mismatch');
  } catch { throw new TemplateGuidanceError(503, 'The recorded assembly template snapshot could not be verified.'); }
  return receipt.templateId;
}

function recordedGuide(metadata: unknown, templateId: unknown, sectionId: string, docId: string) {
  if (!metadata || typeof metadata !== 'object' || !('templateGuidance' in metadata)) return null;
  const source = 'templateSource' in metadata ? metadata.templateSource : null;
  const selectedId = assemblyTemplateId(metadata as Record<string, unknown>, source, docId) ?? templateId;
  if (!source || typeof source !== 'object' || !('id' in source) || source.id !== selectedId) throw new TemplateGuidanceError(503, 'The saved template guidance identity could not be verified.');
  const guide = metadata.templateGuidance;
  if (!guide || typeof guide !== 'object' || !('guidance_text' in guide) || typeof guide.guidance_text !== 'string') throw new TemplateGuidanceError(503, 'Saved template guidance could not be read.');
  return checkedDraftingModes([{ ...guide, id: `${sectionId}:template`, template_id: selectedId, template_source: source,
    guidance_note: 'Reference guidance as recorded when this section was created. Confirm current requirements and applicability; it is not authored evidence.' }]);
}

export interface SavedTemplateGuidanceRead {
  authority: 'recorded' | 'current-reference';
  rows: Array<Record<string, unknown>>;
}

/** Reference resolution after the caller has admitted current document view access.
 * A whole-document snapshot can preload the earliest CREATE metadata once;
 * the section endpoint uses the same resolution after its own access decision. */
export async function templateGuidanceAfterAccess(q: RequestSqlClient, identity: {
  tenantId: number; docId: string; sectionId: string; templateId: unknown; code: unknown;
}, seeded?: { metadata: unknown }): Promise<SavedTemplateGuidanceRead> {
  const { tenantId, docId, sectionId, templateId, code } = identity;
  const metadata = seeded ? seeded.metadata : (await q.query(`SELECT metadata FROM authoring_audit_trail
    WHERE doc_id=$1 AND section_id=$2 AND tenant_id=$3 AND operation_type='CREATE'
    ORDER BY created_at, id LIMIT 1`, [docId, sectionId, tenantId])).rows[0]?.metadata;
  const recorded = recordedGuide(metadata, templateId, sectionId, docId);
  if (recorded) return { authority: 'recorded', rows: recorded };
  if (typeof templateId !== 'string') return { authority: 'current-reference', rows: [] };
  const own = await q.query(`SELECT tg.* FROM template_guidance tg
    WHERE tg.template_id=$1 AND tg.tenant_id=$2 AND tg.section_code=$3 ORDER BY tg.section_code`, [templateId, tenantId, code]);
  if (own.rows.length) return { authority: 'current-reference', rows: checkedDraftingModes(own.rows) };
  try {
    const global = await q.query(`SELECT ts.content_guidance AS guidance_text, ts.required_elements AS compliance_checklist,
      ts.source_reference, ts.section_code, ts.section_title AS section_name
      FROM intelligence.template_sections ts JOIN intelligence.document_templates t ON t.id=ts.template_id AND t.status='active'
      WHERE ts.template_id=$1 AND ts.section_code=$2 ORDER BY ts.ordering`, [templateId, code]);
    return { authority: 'current-reference', rows: checkedDraftingModes(global.rows) };
  } catch {
    throw new TemplateGuidanceError(503, 'The reference template guidance store could not be read.');
  }
}

export async function savedTemplateGuidance(q: RequestSqlClient, tenantId: number, sectionId: string, principal: AuthoringPrincipal | null) {
  const scope = await resolveAuthoringSectionScope(q, tenantId, sectionId);
  if (!scope || !principal) throw new TemplateGuidanceError(404, 'Section not found.');
  const saved = await q.query(`SELECT d.template_id::text, d.client_program_id::text, to_jsonb(d)->'provenance' AS provenance,
    s.code FROM authoring_sections s JOIN authoring_documents d ON d.id=s.doc_id AND d.tenant_id=s.tenant_id
    WHERE s.id=$1 AND s.tenant_id=$2`, [sectionId, tenantId]);
  const doc = saved.rows[0];
  if (!doc) throw new TemplateGuidanceError(404, 'Section not found.');
  let current = principal;
  if (typeof doc.client_program_id === 'string') {
    // Email-only document grants use the current actor's canonical identity;
    // resolve it only through membership in the captured tenant.
    const user = await q.query(`SELECT u.email FROM users u
      JOIN organization_users ou ON ou.user_id=u.id
      WHERE u.id=$1 AND u.status=$2 AND ou.organization_id=$3`, [principal.id, 'active', tenantId]);
    if (user.rows.length !== 1 || (user.rows[0].email !== null && typeof user.rows[0].email !== 'string')) {
      throw new TemplateGuidanceError(403, 'Current organization membership with an active account is required.');
    }
    const email = user.rows[0].email;
    current = (await authorizeAuthoringProgram(q, { tenantId, actor: { id: principal.id, email }, programId: doc.client_program_id, forWrite: false })).principal;
  }
  if (!(await decideAuthoringPermission({ pool: q, principal: current, scope, action: 'view' })).allowed) throw new TemplateGuidanceError(403, 'Current document view permission is required.');
  return (await templateGuidanceAfterAccess(q, { tenantId, docId: scope.docId, sectionId,
    templateId: doc.template_id, code: doc.code })).rows;
}

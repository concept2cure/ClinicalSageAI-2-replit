/** Exact saved editor identity on the caller's request connection; no content or writes. */
import type { RequestSqlClient } from '../../db/requestDb';
import type { AdmittedAnaProjectScope } from '../ana/project-scope-admission';
import { authorizeAuthoringProgram } from '../authoring/authoring-program-access';
import { decideAuthoringPermission, resolveAuthoringDocumentScope, resolveAuthoringSectionScope } from '../authoring/authoring-permissions';
import { savedTemplateReview } from '../ana/saved-template-review';
import { renderSavedSectionTemplateReference, savedSectionTemplateReference } from '../authoring/authoring-draft-template';

export interface OpenDocumentAccess {
  getClient: () => RequestSqlClient;
  userId: number | null;
  project: AdmittedAnaProjectScope;
}
export interface SavedOpenSectionReference { block: string; code: string | null; source: Record<string, unknown> | null }
interface SavedOpenTemplateRead {
  header: { template_id: unknown; provenance: { templateSource: unknown } };
  documentStatus: string;
  section?: SavedOpenSectionReference;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (): never => { throw new Error('Current saved document/section reference access could not be verified.'); };

async function currentPrincipal(q: RequestSqlClient, organizationId: number, access: OpenDocumentAccess) {
  const programId = access.project.programId;
  if (!programId || !UUID.test(programId)) return fail();
  const actor = await q.query(`SELECT email FROM users WHERE id=$1 AND status=$2
    AND EXISTS (SELECT 1 FROM organization_users ou WHERE ou.user_id=users.id AND ou.organization_id=$3)`,
  [access.userId, 'active', organizationId]);
  if (actor.rows.length !== 1 || (actor.rows[0].email !== null && typeof actor.rows[0].email !== 'string')) return fail();
  const result = await authorizeAuthoringProgram(q, { tenantId: organizationId,
    actor: { id: String(access.userId), email: actor.rows[0].email as string | null }, programId, forWrite: false });
  if (result.projectId !== access.project.projectId) return fail();
  return { principal: result.principal, programId };
}

function requiredAccess(organizationId: number, access?: OpenDocumentAccess): OpenDocumentAccess {
  if (!access || typeof access.getClient !== 'function' || !Number.isSafeInteger(access.userId) || !access.userId || access.userId < 1 ||
    !access.project?.programId || !Number.isSafeInteger(organizationId) || organizationId < 1) return fail();
  return access;
}

async function admitSelector(q: RequestSqlClient, organizationId: number, access: OpenDocumentAccess, artifactId: string, sectionId?: string) {
  const { principal, programId } = await currentPrincipal(q, organizationId, access);
  // Identity only before VIEW: no template/provenance/guidance or section text.
  const identity = await q.query('SELECT id::text FROM authoring_documents WHERE id=$1 AND tenant_id=$2 AND client_program_id=$3',
    [artifactId, organizationId, programId]);
  if (identity.rows.length !== 1) return fail();
  const scope = sectionId ? await resolveAuthoringSectionScope(q, organizationId, sectionId)
    : await resolveAuthoringDocumentScope(q, organizationId, artifactId);
  if (!scope || scope.docId !== artifactId || (sectionId && scope.sectionId !== sectionId)) return fail();
  if (!(await decideAuthoringPermission({ pool: q, principal, scope, action: 'view' })).allowed) return fail();
  return { programId, documentStatus: scope.documentStatus };
}

export async function readSavedOpenTemplate(input: {
  artifactId: string; sectionId?: string; organizationId: number; access?: OpenDocumentAccess;
}): Promise<SavedOpenTemplateRead> {
  const { artifactId, sectionId, organizationId } = input;
  const access = requiredAccess(organizationId, input.access);
  const q = access.getClient();
  const { programId, documentStatus } = await admitSelector(q, organizationId, access, artifactId, sectionId);
  const result = await q.query(`SELECT d.template_id::text, to_jsonb(d)->'provenance'->'templateSource' AS template_source
    FROM authoring_documents d WHERE d.id=$1 AND d.tenant_id=$2 AND d.client_program_id=$3`, [artifactId, organizationId, programId]);
  if (result.rows.length !== 1) return fail();
  const row = result.rows[0];
  const header = { template_id: row.template_id, provenance: { templateSource: row.template_source } };
  if (!sectionId) return { header, documentStatus };
  const section = await q.query('SELECT code FROM authoring_sections WHERE id=$1 AND doc_id=$2 AND tenant_id=$3',
    [sectionId, artifactId, organizationId]);
  const code = section.rows[0]?.code;
  if (section.rows.length !== 1 || (code !== null && typeof code !== 'string')) return fail();
  const review = await savedTemplateReview(q, { tenantId: organizationId, documentId: artifactId, programId }, header, [{ sectionId, code }]);
  const selected = savedSectionTemplateReference(review, { tenantId: organizationId, documentId: artifactId, programId, sectionId, code });
  const block = renderSavedSectionTemplateReference({ ...selected.reference, draftingMode: selected.draftingMode, documentStatus },
    '## OPEN DOCUMENT\nThe exact saved section reference follows. This read-only context grants no drafting, editing or approval authority. Manual source preparation remains manual.\n');
  return { header, documentStatus, section: { block, code, source: selected.source } };
}

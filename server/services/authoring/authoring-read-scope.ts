/** Identity-first reuse of the current canonical object ACL.
 * Never page private content first or reproduce Authoring's role policy. */
import type { RequestSqlClient } from '../../db/requestDb';
import { getCurrentAccessibleProgramScope, ProgramReadAccessError } from '../c2c/current-program-access';
import { decideAuthoringPermission, type AuthoringPrincipal, type AuthoringObjectScope } from './authoring-permissions';

export class AuthoringReadScopeError extends Error {
  constructor(readonly status: 404 | 503, readonly code: string, message: string) { super(message); }
}
async function currentPrincipal(q:RequestSqlClient,organizationId:number,actor:{userId:number;role:string}):Promise<AuthoringPrincipal> {
  const person=await q.query(`SELECT u.email FROM users u
    JOIN organization_users ou ON ou.user_id=u.id AND ou.organization_id=$1
    WHERE u.id=$2 AND u.status=$3`,[organizationId,actor.userId,'active']);
  if (person.rows.length!==1) throw new Error('Current authoring identity unavailable');
  return {id:String(actor.userId),email:typeof person.rows[0].email==='string' ? person.rows[0].email.trim().toLowerCase() : null,
    roles:[actor.role.trim().toUpperCase()]};
}
async function permittedIdentities(q:RequestSqlClient,organizationId:number,principal:AuthoringPrincipal,rows:Record<string,unknown>[]) {
  const documentIds = new Set<string>(); const sectionDocumentIds=new Set<string>(); const sectionIds: string[] = [];
  const checked = new Map<string,boolean>();
  for (const row of rows) {
    const base: AuthoringObjectScope = {tenantId:organizationId,docId:String(row.doc_id),sectionId:null,
      documentStatus:String(row.status),createdBy:String(row.created_by ?? '')};
    if (!checked.has(base.docId)) checked.set(base.docId,(await decideAuthoringPermission({pool:q,principal,scope:base,action:'view'})).allowed);
    const documentAllowed = checked.get(base.docId)!;
    const sectionId = row.section_id==null ? null : String(row.section_id);
    const allowed = documentAllowed || (sectionId!==null &&
      (await decideAuthoringPermission({pool:q,principal,scope:{...base,sectionId},action:'view'})).allowed);
    if (documentAllowed) documentIds.add(base.docId);
    if (allowed && sectionId!==null) {sectionDocumentIds.add(base.docId);sectionIds.push(sectionId);}
  }
  return {documentIds:[...documentIds],sectionDocumentIds:[...sectionDocumentIds],sectionIds};
}
export async function getCurrentAuthoringReadScope(q: RequestSqlClient, input: {
  organizationId: number; userId: number | undefined; programId?: string | null; documentId?: string | null;
  /** The unfiltered Review board also retains pre-project organization records. */
  includeOrganizationDocuments?: boolean;
}): Promise<{ scope: 'verified-accessible-authoring-sections'; actor:{userId:number;email:string|null;role:string}; documentIds: string[]; sectionDocumentIds:string[]; sectionIds: string[] }> {
  try {
    const programs = await getCurrentAccessibleProgramScope(q,input);
    const principal=await currentPrincipal(q,input.organizationId,programs.actor);
    // Identity/status only; titles, prose and counts are read after ACL admission.
    const identities = await q.query(`SELECT d.id::text AS doc_id,d.status,d.created_by,s.id::text AS section_id
      FROM authoring_documents d LEFT JOIN authoring_sections s ON s.doc_id=d.id AND s.tenant_id=d.tenant_id
      WHERE d.tenant_id=$1 AND (d.client_program_id=ANY($2::uuid[])
        OR ($4::boolean AND d.client_program_id IS NULL))
        AND ($3::uuid IS NULL OR d.id=$3::uuid) ORDER BY d.id,s.id`,
    [input.organizationId,programs.programIds,input.documentId ?? null,
      input.includeOrganizationDocuments===true && !input.programId]);
    const access=await permittedIdentities(q,input.organizationId,principal,identities.rows);
    if (input.documentId && !access.documentIds.includes(input.documentId) && !access.sectionDocumentIds.includes(input.documentId)) {
      throw new AuthoringReadScopeError(404,'AUTHORING_DOCUMENT_NOT_FOUND','Document not found.');
    }
    return {scope:'verified-accessible-authoring-sections',actor:{userId:programs.actor.userId,email:principal.email,role:programs.actor.role},...access};
  } catch (error) {
    if (error instanceof ProgramReadAccessError || error instanceof AuthoringReadScopeError) throw error;
    throw new AuthoringReadScopeError(503,'AUTHORING_READ_ACCESS_UNAVAILABLE','Current Authoring access could not be verified.');
  }
}

export async function requireAuthoringReadScopeStillCurrent(q: RequestSqlClient,
  input: Parameters<typeof getCurrentAuthoringReadScope>[1], prior: Awaited<ReturnType<typeof getCurrentAuthoringReadScope>>): Promise<void> {
  let current: Awaited<ReturnType<typeof getCurrentAuthoringReadScope>>;
  try { current=await getCurrentAuthoringReadScope(q,input); } catch(error) {
    if (error instanceof AuthoringReadScopeError && error.status===404 ||
      error instanceof ProgramReadAccessError && [403,404,409].includes(error.status)) {
      throw new AuthoringReadScopeError(503,'AUTHORING_READ_ACCESS_CHANGED','Current Authoring access changed during the read.');
    }
    throw error;
  }
  const documents=new Set(current.documentIds); const parents=new Set(current.sectionDocumentIds); const sections=new Set(current.sectionIds);
  if (prior.actor.userId!==current.actor.userId || prior.actor.email!==current.actor.email || prior.actor.role!==current.actor.role ||
      prior.documentIds.some(id=>!documents.has(id)) || prior.sectionDocumentIds.some(id=>!parents.has(id)) || prior.sectionIds.some(id=>!sections.has(id))) {
    throw new AuthoringReadScopeError(503,'AUTHORING_READ_ACCESS_CHANGED','Current Authoring access changed during the read.');
  }
}

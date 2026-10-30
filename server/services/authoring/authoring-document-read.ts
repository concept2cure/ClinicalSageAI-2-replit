/** Request-owned projections over the canonical current Authoring read scope. */
import type { RequestSqlClient } from '../../db/requestDb';
import type { AuthoringReadProjection, AuthoringSourceMetadataState } from '@shared/authoring/read-projection';
import { sectionStructureIssues } from '@shared/regulatory/section-code';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';
import { expandRoleClaims, roleClaimsSatisfy } from '../../middleware/auth';
import { isSigningAuthorized, signingAuthorityRoles } from '../part11/signing-authority';
import { vaultWriteRefusal } from '../vault/vault-write-authority';
import { createScopedLogger } from '../../utils/logger';
import { qmsAuthoringWriteRefusal, qmsAuthoringGovernanceRefusal } from '../qms/controlled-document-content';
import { readDocumentProvenance } from './authoring-from-draft';
import { decideAuthoringPermission, resolveAuthoringDocumentScope, type AuthoringPermissionDecision,
  type AuthoringPrincipal } from './authoring-permissions';
import { getCurrentAuthoringReadScope, requireAuthoringReadScopeStillCurrent, AuthoringReadScopeError } from './authoring-read-scope';

const logger=createScopedLogger('authoring-document-read');
type Scope=Awaited<ReturnType<typeof getCurrentAuthoringReadScope>>;
type Gate={allowed:boolean;reason:string|null}|null;
type Access=Record<'edit'|'freeze'|'esign'|'esignReview'|'fileToVault'|'assignReview'|'placeIntoFiling',Gate>;
export interface AuthoringReadIdentity {organizationId:number;userId:number|undefined;programId?:string|null}
export interface AuthoringDocumentReadIdentity extends AuthoringReadIdentity {documentId:string}
export interface AuthoringDocumentFilters {module?:string;product_code?:string;status?:string;conversationId?:string;source?:string}
export class AuthoringReadInputError extends Error {
  readonly code='AUTHORING_READ_INPUT_INVALID';
  constructor(){super('A valid single project or document UUID is required.');}
}
function readInput<T extends AuthoringReadIdentity>(input:T) {
  return {...input,includeOrganizationDocuments:!input.programId};
}
function projection(scope:Scope,id:string):AuthoringReadProjection {
  return scope.documentIds.includes(id)?'document':'sections';
}
function parents(scope:Scope) {return [...new Set([...scope.documentIds,...scope.sectionDocumentIds])];}
function changed():never {throw new AuthoringReadScopeError(503,'AUTHORING_READ_ACCESS_CHANGED','Current Authoring access changed during the read.');}
function titleCaseRoles(roles:readonly string[]|undefined) {
  const names=(roles??[]).map(role=>role.charAt(0)+role.slice(1).toLowerCase());return names.length?names.join(', '):'none';
}
function objectGate(decision:AuthoringPermissionDecision,act:string,needs:string):Gate {
  if(decision.allowed)return {allowed:true,reason:null};
  if(decision.reason==='document-immutable')return {allowed:false,reason:`${act} is refused while the document's status is ${decision.scope?.documentStatus??'unknown'}.`};
  if(decision.reason==='organization-read-only')return {allowed:false,reason:`${act} needs an editing role in this organization. Your current organization access is read-only.`};
  if(decision.reason==='permission-denied')return {allowed:false,reason:`${act} needs ${needs} on this document. Your grants on it: ${titleCaseRoles(decision.matchedRoles)}.`};
  return null;
}
function bothGates(first:Gate,second:Gate):Gate {
  if(first&&!first.allowed)return first;if(second&&!second.allowed)return second;
  return first&&second?{allowed:true,reason:null}:null;
}
async function settle<T>(what:string,docId:string,fn:()=>Promise<T>):Promise<T|null> {
  try{return await fn();}catch(error){logger.warn('Document access could not be determined; reported as unknown',
    {what,docId,error:error instanceof Error?error.message:String(error)});return null;}
}
function roleGates(role:string) {
  const signing:Gate=isSigningAuthorized(role)?{allowed:true,reason:null}:{allowed:false,
    reason:'Applying an electronic signature needs a signing role in this organization '+`(${signingAuthorityRoles().join(', ')}). Your role: ${role}.`};
  const vault:Gate=!vaultWriteRefusal(role)?{allowed:true,reason:null}:{allowed:false,
    reason:`Filing into the vault needs an editing role in this organization. Your role: ${role}.`};
  const editor:Gate=GOVERNED_WRITE_ROLES.has(role)?{allowed:true,reason:null}:{allowed:false,
    reason:`Sending for review needs an editing role in this organization. Your role: ${role}.`};
  const place:Gate=roleClaimsSatisfy({roles:expandRoleClaims(role,undefined)},['regulatory-author'])?{allowed:true,reason:null}:{allowed:false,
    reason:`Placing into a filing needs an authoring role in this organization. Your role: ${role}.`};
  return {signing,vault,editor,place};
}
async function callerDocumentAccess(q:RequestSqlClient,input:AuthoringDocumentReadIdentity,access:Scope,status:unknown):Promise<Access> {
  const scope=await resolveAuthoringDocumentScope(q,input.organizationId,input.documentId);
  if(!scope||scope.documentStatus!==String(status??'draft'))changed();
  const principal:AuthoringPrincipal={id:String(access.actor.userId),email:access.actor.email,roles:[access.actor.role.toUpperCase()]};
  const decide=(action:'approve'|'export'|'review'|'edit')=>settle(action,input.documentId,()=>decideAuthoringPermission({pool:q,principal,scope,action}));
  const approve=await decide('approve');const produce=await decide('export');const review=await decide('review');const edit=await decide('edit');
  const roles=roleGates(access.actor.role);
  // Preserve Quality's existing distinction between editable content and signed lifecycle.
  const [contentRefusal,signingRefusal]=await Promise.all([
    qmsAuthoringWriteRefusal(q,input.organizationId,input.documentId),
    qmsAuthoringGovernanceRefusal(q,input.organizationId,input.documentId),
  ]);
  const contentGate:Gate=contentRefusal?{allowed:false,reason:contentRefusal.error}:{allowed:true,reason:null};
  const signingGate:Gate=signingRefusal?{allowed:false,reason:signingRefusal.error}:{allowed:true,reason:null};
  const approveGate=(act:string)=>approve?objectGate(approve,act,'an Owner or Approver grant'):null;
  return {
    edit:bothGates(contentGate,edit?objectGate(edit,'Editing','an Owner or Author grant'):null),
    freeze:bothGates(signingGate,bothGates(approveGate('Freezing'),roles.signing)),esign:bothGates(signingGate,bothGates(approveGate('Signing'),roles.signing)),
    esignReview:bothGates(signingGate,bothGates(review?objectGate(review,'Signing the review','a Reviewer, Approver or Owner grant'):null,roles.signing)),
    fileToVault:bothGates(produce?objectGate(produce,'Filing to the vault','an Owner, Author or Approver grant'):null,roles.vault),
    assignReview:bothGates(contentGate,bothGates(roles.editor,edit?objectGate(edit,'Sending for review','an Owner or Author grant'):null)),placeIntoFiling:roles.place,
  };
}
export async function readAuthoringDocuments(q:RequestSqlClient,input:AuthoringReadIdentity,filters:AuthoringDocumentFilters) {
  const captured=readInput(input);const capturedFilters={...filters};
  const access=await getCurrentAuthoringReadScope(q,captured);
  const status=capturedFilters.status?.trim();
  const params:unknown[]=[captured.organizationId,parents(access),access.documentIds,access.sectionIds,
    capturedFilters.module||null,capturedFilters.product_code||null,status&&status.toLowerCase()!=='all'?status:null,
    captured.programId??null,capturedFilters.conversationId?.trim()||null,capturedFilters.source==='ana'];
  // template_id: which template a working copy was made from, so a project's
  // plan can tell a deliverable is started (CLIENT_JOURNEY_2026-10-25.md pass 3).
  const result=await q.query(`SELECT d.id,d.title,d.module,d.product_code,d.locale,d.status,d.created_at,d.updated_at,d.created_by,d.template_id,
    CASE WHEN d.id=ANY($3::uuid[]) THEN to_jsonb(d)->'provenance'->>'source' END AS provenance_source,
    CASE WHEN d.id=ANY($3::uuid[]) THEN to_jsonb(d)->'provenance'->>'conversationId' END AS conversation_id,
    to_jsonb(d)->>'client_program_id' AS program_id,to_jsonb(d)->>'c2c_document_id' AS c2c_document_id,
    COUNT(s.id) AS section_count,COALESCE(SUM(LENGTH(s.content)),0) AS total_content_length
    FROM authoring_documents d LEFT JOIN authoring_sections s ON s.doc_id=d.id AND s.tenant_id=d.tenant_id AND s.id=ANY($4::uuid[])
    WHERE d.tenant_id=$1 AND d.id=ANY($2::uuid[])
    AND ($5::text IS NULL OR d.module = $5::text)
    AND ($6::text IS NULL OR d.product_code = $6::text)
    AND ($7::text IS NULL OR upper(d.status) = upper($7::text))
    AND ($8::uuid IS NULL OR (to_jsonb(d)->>'client_program_id')::uuid = $8::uuid)
    AND ($9::text IS NULL OR (d.id=ANY($3::uuid[]) AND to_jsonb(d)->'provenance'->>'conversationId' = $9::text))
    AND (NOT $10::boolean OR (d.id=ANY($3::uuid[]) AND to_jsonb(d)->'provenance'->>'source' = 'ana'))
    GROUP BY d.id ORDER BY d.updated_at DESC,d.id`,params);
  const documents=result.rows.map(row=>{
    const readScope=projection(access,String(row.id));
    if(readScope==='sections'){const header={...row};delete header.provenance_source;delete header.conversation_id;return {...header,readScope};}
    return {...row,readScope};
  });
  await requireAuthoringReadScopeStillCurrent(q,captured,access);
  return {success:true,documents,count:documents.length,filters:{...capturedFilters,programId:captured.programId??undefined}};
}

export async function readAuthoringDocument(q:RequestSqlClient,input:AuthoringDocumentReadIdentity) {
  const captured=readInput(input);const access=await getCurrentAuthoringReadScope(q,captured);
  const readScope=projection(access,captured.documentId);
  const result=await q.query(`SELECT d.id,d.title,d.module,d.product_code,d.locale,d.status,d.created_at,d.updated_at,d.created_by,
    d.template_id,d.submitted_at,d.current_workflow_id,d.approved_at,d.frozen_at,d.locked_at,d.locked_by,d.tenant_id,d.version,
    to_jsonb(d)->>'c2c_document_id' AS c2c_document_id,to_jsonb(d)->>'client_program_id' AS client_program_id,
    COUNT(DISTINCT s.id) AS section_count,
    COUNT(DISTINCT c.id) AS comment_count,COUNT(DISTINCT r.id) AS revision_count
    FROM authoring_documents d
    LEFT JOIN authoring_sections s ON s.doc_id=d.id AND s.tenant_id=d.tenant_id AND s.id=ANY($3::uuid[])
    LEFT JOIN authoring_comments c ON c.doc_id=d.id AND c.tenant_id=d.tenant_id AND (($4::boolean AND c.section_id IS NULL) OR c.section_id=ANY($3::uuid[]))
    LEFT JOIN doc_revisions r ON r.section_id=s.id AND r.tenant_id=s.tenant_id
    WHERE d.id=$1 AND d.tenant_id=$2 GROUP BY d.id`,[captured.documentId,captured.organizationId,access.sectionIds,readScope==='document']);
  if(result.rows.length!==1)changed();
  const row=result.rows[0];
  const provenance=readScope==='document'?await readDocumentProvenance(q,captured.documentId,captured.organizationId):null;
  const sourceMetadataState:AuthoringSourceMetadataState=provenance?.provenanceStore==='present'?'available':'unavailable';
  const hints=await callerDocumentAccess(q,captured,access,row.status);
  await requireAuthoringReadScopeStillCurrent(q,captured,access);
  return {success:true,document:{...row,readScope,sourceMetadataState,...(provenance?{provenance:provenance.provenance}:{})},access:hints,
    ...(provenance&&provenance.provenanceStore!=='present'?{provenanceStore:provenance.provenanceStore}:{})};
}

export async function readAuthoringDocumentSections(q:RequestSqlClient,input:AuthoringDocumentReadIdentity) {
  const captured=readInput(input);const access=await getCurrentAuthoringReadScope(q,captured);
  const readScope=projection(access,captured.documentId);
  const result=await q.query(`SELECT s.id,s.doc_id,s.code,s.title,s.content,s.order_index,s.track_changes,s.created_at,s.updated_at,s.tenant_id,
    COUNT(DISTINCT c.id) AS comment_count,COUNT(DISTINCT r.id) AS revision_count,COUNT(DISTINCT ct.id) AS citation_count
    FROM authoring_sections s
    LEFT JOIN authoring_comments c ON c.section_id=s.id AND c.tenant_id=s.tenant_id
    LEFT JOIN doc_revisions r ON r.section_id=s.id AND r.tenant_id=s.tenant_id
    LEFT JOIN authoring_citations ct ON ct.section_id=s.id AND ct.tenant_id=s.tenant_id
    WHERE s.doc_id=$1 AND s.tenant_id=$2 AND s.id=ANY($3::uuid[]) GROUP BY s.id ORDER BY s.order_index,s.created_at,s.id`,
  [captured.documentId,captured.organizationId,access.sectionIds]);
  const structure=readScope==='document'?sectionStructureIssues(result.rows.map(row=>String(row.code??''))):null;
  await requireAuthoringReadScopeStillCurrent(q,captured,access);
  return {success:true,sections:result.rows,count:result.rows.length,structure,readScope};
}

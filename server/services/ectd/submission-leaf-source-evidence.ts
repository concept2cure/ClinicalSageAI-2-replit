/** Request-owned retained-source coverage. Identity/access precede body or bytes.
 * This module never snapshots, renders, stages, writes, or opens a global DB. */
import { createHash } from 'node:crypto';
import type { RequestSqlClient } from '../../db/requestDb';
import type { SubmissionLeaf } from '../../../shared/types/database';
import type { DeliverableSourceEvidence, DeliverableSourceRef, DeliverableSourceIssue, SourceAwarePathwayLeaf } from '../../../shared/types/submission-api';
import { getCurrentAccessibleProgramScope, requireCurrentProgramAccess, requireProgramScopeStillCurrent, type CurrentAccessibleProgramScope, ProgramReadAccessError } from '../c2c/current-program-access';
import { getCurrentAuthoringReadScope, requireAuthoringReadScopeStillCurrent, AuthoringReadScopeError } from '../authoring/authoring-read-scope';
import { canonicalIdFor } from '../c2c/document-alias-map';
import { sectionPlainText } from '../c2c/section-content';
import { assembleAuthoredSections, type AuthoringSectionRow } from '../ana/authoring-canonical-bridge';
import { checkAgainstSeal } from '../coauthor/coauthor-snapshot';
import { isSubstantive } from '../pathway-engines/estar/estar-content-leaves';
import { documentTableKeyKind, isPlaceableDocumentTable } from './leaf-document-tables';
import { compareDocumentPin } from './leaf-document-resolver';
import { notFinalizedStatus, verifyRetainedLeafBytes } from './leaf-source-resolver';
import type { LeafDocumentResolution } from './dispatch-readiness';
import { getStorageProviderFor } from '../storage';
import { readLocalUploadBuffer } from '../anthropic-files';
import { vaultBinaryAvailableSql } from '../document-data-disposition/eligibility';
import { vaultVersionNotTransmittable } from '../vault/vault-lifecycle';
import { companyLegalSubmissionContext } from './company-legal-context';

type Input = {
  organizationId:number; userId:number; programId:string; projectId:number;
  sequenceId:number; submissionId:number; leaves:SubmissionLeaf[];
  /** Server-admitted sequence/submission facts, rechecked by the request reader. */
  sequenceRegion?:string; applicationType?:string;
};
export interface SubmissionLeafSourceAdmission { readonly kind:'request-owned-submission-source-admission' }
export class SubmissionLeafSourceReadError extends Error {
  constructor(readonly status:404|503,readonly code:string,message:string) { super(message); }
}
type AuthoringScope = Awaited<ReturnType<typeof getCurrentAuthoringReadScope>>;
type ReadCheck = {sql:string;params:unknown[];digest:string};
type State = {
  q:RequestSqlClient;input:Input;program:CurrentAccessibleProgramScope;checks:ReadCheck[];
  reads:Map<string,Record<string,unknown>[]>;providers:Map<string,{bytes:Buffer}|null>;
  authoring:Array<{documentId:string;scope:AuthoringScope}>;
  bytes:Array<{provider:string|null;version:string;sha256:string}|{path:string;sha256:string}>;
};
const admitted = new WeakMap<SubmissionLeafSourceAdmission,State>();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const unknown=(code:string):DeliverableSourceEvidence=>({content:'undetermined',pin:'unverifiable',lifecycle:'unverified',reasonCode:code});
const messages:Record<string,string>={
  SOURCE_PARENT_UNVERIFIED:'The retained source has no verified project relationship.',
  SOURCE_NOT_FOUND:'The retained source is not available in this project.',
  SOURCE_POINTER_UNVERIFIED:'The retained placement does not identify a supported source.',
  SOURCE_COPY_IDENTITY_CONFLICT:'The retained copy does not agree with its recorded source identity.',
  SOURCE_SEAL_UNVERIFIED:'The retained source text could not be verified against its recorded seal.',
  SOURCE_BODY_UNVERIFIED:'The retained source body or lifecycle could not be verified.',
  SOURCE_BINARY_CONTENT_UNVERIFIED:'The retained bytes were verified; substantive source text is not established.',
  SOURCE_BYTES_UNAVAILABLE:'The retained source bytes could not be read from their recorded store.',
  SOURCE_BYTES_HASH_MISMATCH:'The retained source bytes do not match their recorded content hash.',
  SOURCE_PIN_MISMATCH:'The source content differs from the pin recorded on this placement.',
  SOURCE_UNPINNED:'This retained placement has no source content pin.',
  SOURCE_PIN_UNVERIFIABLE:'The retained source content pin could not be verified.',
  SOURCE_NON_SUBSTANTIVE:'The retained source is empty, a placeholder, or still a draft.',
  SOURCE_WITHDRAWN:'This placement withdraws content and supplies no deliverable.',
  SOURCE_DISPOSITION_UNAVAILABLE:'The retained source bytes are unavailable under their current disposition.',
};
function safeReason(code:string|null) { return code ? messages[code]??'The retained source evidence could not be established.' : null; }
async function tracked(state:State,sql:string,params:unknown[]) {
  const key=JSON.stringify([sql,params]);
  if(state.reads.has(key))return state.reads.get(key)!;
  const result=await state.q.query(sql,params);
  state.reads.set(key,result.rows);
  state.checks.push({sql,params,digest:sha(JSON.stringify(result.rows))});
  return result.rows;
}
function object(value:unknown):Record<string,unknown> {
  if (typeof value==='string') { try { return object(JSON.parse(value)); } catch { return {}; } }
  return value && typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
function textBody(value:unknown) {
  const body=typeof value==='string'?value:sectionPlainText(value);
  // Existing section converter retains span offsets; normalization is only the
  // coverage predicate's text signal, never the source pin recipe.
  return body.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').trim();
}
function evidenceFor(body:string,status:unknown,store:'coauthor_documents'|'c2c_document_sections',pin:DeliverableSourceEvidence['pin']):DeliverableSourceEvidence {
  if (pin!=='match') return {...unknown(pin==='mismatch'?'SOURCE_PIN_MISMATCH':pin==='unpinned'?'SOURCE_UNPINNED':'SOURCE_PIN_UNVERIFIABLE'),pin};
  const value=String(status??'').trim().toLowerCase();
  const finalized=notFinalizedStatus(value,store)===null;
  const substantive=isSubstantive({content:body,status:finalized?'approved':value});
  const knownDraft=['todo','draft','drafted','drafting','review','in_review','in-progress','in_progress','ready_for_review'].includes(value);
  if (!finalized&&!knownDraft) return {...unknown('SOURCE_BODY_UNVERIFIED'),pin};
  return {content:substantive&&finalized?'substantive':'non-substantive',pin,lifecycle:finalized?'finalized':'draft',reasonCode:substantive&&finalized?null:'SOURCE_NON_SUBSTANTIVE'};
}
function sourceDocument(leaf:SubmissionLeaf):DeliverableSourceRef['document'] {
  const table=leaf.documentTable;
  if (!table||!isPlaceableDocumentTable(table)) return null;
  if (table==='vault_documents') return leaf.documentUuid&&UUID.test(leaf.documentUuid)&&leaf.documentId==null
    ?{table,keyKind:'uuid',id:leaf.documentUuid.toLowerCase()}:null;
  return Number.isSafeInteger(leaf.documentId)&&Number(leaf.documentId)>0&&leaf.documentUuid==null
    ?{table:table as Exclude<NonNullable<DeliverableSourceRef['document']>['table'],'vault_documents'>,keyKind:'integer',id:Number(leaf.documentId)}:null;
}
function sameProgram(state:State,value:unknown) {
  if (typeof value!=='string'||!UUID.test(value)) return false;
  if (value.toLowerCase()!==state.input.programId.toLowerCase()) {
    throw new SubmissionLeafSourceReadError(404,'SUBMISSION_SOURCE_SCOPE_MISMATCH','The retained source is not in this submission project.');
  }
  return true;
}
type StoreEvidence={label?:string;found:boolean;storedSha256:string|null;evidence:DeliverableSourceEvidence;section?:DeliverableSourceRef['section'];editor?:DeliverableSourceRef['editor']};
const unavailable=(code:string,found=true):StoreEvidence=>({found,storedSha256:null,evidence:unknown(code)});

async function c2cSection(state:State,leaf:SubmissionLeaf):Promise<StoreEvidence> {
  const parents=await tracked(state,`SELECT s.document_id,d.project_id::text AS program_id,d.status AS parent_status
    FROM c2c_document_sections s JOIN c2c_documents d ON d.id=s.document_id
    WHERE s.id=$1 AND d.org_id=$2`,[leaf.documentId,state.input.organizationId]);
  const parent=parents[0];
  if (!parent) return unavailable('SOURCE_NOT_FOUND',false);
  if (!sameProgram(state,parent.program_id)) return unavailable('SOURCE_PARENT_UNVERIFIED');
  if (parent.parent_status==='archived') return unavailable('SOURCE_BODY_UNVERIFIED');
  const rows=await tracked(state,`SELECT s.id::text AS id,s.section_key,s.content,s.status,d.title AS source_label FROM c2c_document_sections s
    JOIN c2c_documents d ON d.id=s.document_id WHERE s.id=$1 AND d.org_id=$2 AND d.project_id=$3::uuid`,
  [leaf.documentId,state.input.organizationId,state.input.programId]);
  const row=rows[0];if (!row) return unavailable('SOURCE_NOT_FOUND',false);
  let content:unknown=row.content;
  if(typeof content==='string') {try {content=JSON.parse(content);}catch {/* canonical legacy text */}}
  const plain=sectionPlainText(content).trim();
  const storedSha256=plain?sha(plain):null;
  const pin=compareDocumentPin(leaf.documentContentSha256,storedSha256);
  return {label:typeof row.source_label==='string'?row.source_label:undefined,found:true,storedSha256,evidence:evidenceFor(textBody(plain),row.status,'c2c_document_sections',pin),
    section:{id:String(row.id),code:typeof row.section_key==='string'?row.section_key:null}};
}
async function coauthorIdentity(state:State,leaf:SubmissionLeaf):Promise<string|StoreEvidence> {
  const alias=await canonicalIdFor({query:async(sql:string,params?:unknown[])=>({rows:await tracked(state,sql,params??[])})},{organizationId:state.input.organizationId,store:'coauthor_documents',nativeId:String(leaf.documentId)});
  if (!alias.available||!alias.canonicalId) return unavailable('SOURCE_PARENT_UNVERIFIED');
  const identities=await tracked(state,`SELECT id::text AS id,client_program_id::text AS program_id
    FROM authoring_documents WHERE id=$1::uuid AND tenant_id=$2`,[alias.canonicalId,state.input.organizationId]);
  const identity=identities[0];if(!identity) return unavailable('SOURCE_PARENT_UNVERIFIED');
  if(!sameProgram(state,identity.program_id)) return unavailable('SOURCE_PARENT_UNVERIFIED');
  const access=await getCurrentAuthoringReadScope(state.q,{...state.input,documentId:alias.canonicalId});
  if(!access.documentIds.includes(alias.canonicalId)) throw new SubmissionLeafSourceReadError(404,'SUBMISSION_SOURCE_NOT_FOUND','The retained source is not available.');
  state.authoring.push({documentId:alias.canonicalId,scope:access});
  const copies=await tracked(state,`SELECT metadata->>'docId' AS source_id FROM coauthor_documents
    WHERE id=$1 AND organization_id=$2`,[leaf.documentId,state.input.organizationId]);
  if(!copies[0])return unavailable('SOURCE_NOT_FOUND',false);
  if(copies[0].source_id!=null&&copies[0].source_id!==alias.canonicalId)return unavailable('SOURCE_COPY_IDENTITY_CONFLICT');
  return alias.canonicalId;
}
async function retainedSealedSections(state:State,args:{row:Record<string,unknown>;sourceId:string;body:string}):Promise<AuthoringSectionRow[]|null> {
  const {row,sourceId,body}=args;
  if(typeof row.seal_version!=='string'||typeof row.seal_hash!=='string')return null;
  const frozen=await tracked(state,`SELECT frozen_content,content_hash FROM frozen_documents
    WHERE document_id=$1 AND tenant_id=$2 AND version=$3 ORDER BY frozen_at DESC,id DESC LIMIT 1`,
  [sourceId,state.input.organizationId,row.seal_version]);
  const record=frozen[0];const sealed=object(record?.frozen_content);const sections=Array.isArray(sealed.sections)?sealed.sections as AuthoringSectionRow[]:[];
  const title=object(sealed.document).title;
  if(!record||record.content_hash!==row.seal_hash||!sections.length||typeof title!=='string')return null;
  const q={query:async<T=Record<string,unknown>>(sql:string,params?:unknown[])=>({rows:(await tracked(state,sql,params??[])) as T[]})};
  const seal=await checkAgainstSeal(q,{sourceId:sourceId,organizationId:state.input.organizationId,live:sections,title,verdict:String(row.status),sealVersion:row.seal_version});
  if(!seal.ok||assembleAuthoredSections(sections)!==body)return null;
  return sections;
}
async function sealedCopyPresentation(state:State,args:{row:Record<string,unknown>;sourceId:string;sections:AuthoringSectionRow[];storedSha256:string|null;pin:DeliverableSourceEvidence['pin'];editor:NonNullable<DeliverableSourceRef['editor']>}):Promise<StoreEvidence> {
  const {row,sourceId,sections,storedSha256,pin,editor}=args;
  const actualBodies=sections.map(s=>textBody(s.content)).join('\n\n');
  const sole=sections.length===1?sections[0]:null;
  const currentSections=await tracked(state,`SELECT s.id::text AS id,s.code FROM authoring_sections s
    JOIN authoring_documents d ON d.id=s.doc_id AND d.tenant_id=s.tenant_id
    WHERE s.doc_id=$1::uuid AND s.tenant_id=$2 AND d.client_program_id=$3::uuid ORDER BY s.id`,
  [sourceId,state.input.organizationId,state.input.programId]);
  const currentSole=sole&&typeof sole.code==='string'&&currentSections.filter(s=>s.id===String(sole.id)&&s.code===sole.code).length===1;
  return {label:typeof row.source_label==='string'?row.source_label:undefined,found:true,storedSha256,evidence:evidenceFor(actualBodies,row.status,'coauthor_documents',pin),editor:{...editor,sectionCode:currentSole?String(sole!.code):null},
    section:sole&&sole.id?{id:String(sole.id),code:typeof sole.code==='string'?sole.code:null}:null};
}
async function coauthor(state:State,leaf:SubmissionLeaf):Promise<StoreEvidence> {
  const sourceId=await coauthorIdentity(state,leaf);
  if(typeof sourceId!=='string')return sourceId;
  const rows=await tracked(state,`SELECT c.title AS source_label,c.content,c.status,c.metadata->>'docId' AS source_id,c.metadata->>'sealVersion' AS seal_version,
    c.metadata->>'sealContentHash' AS seal_hash FROM coauthor_documents c
    JOIN c2c_document_aliases a ON a.organization_id=c.organization_id AND a.store=$5 AND a.native_id=c.id::text
    JOIN authoring_documents d ON d.id=a.canonical_id AND d.tenant_id=c.organization_id
    WHERE c.id=$1 AND c.organization_id=$2 AND d.id=$3::uuid AND d.client_program_id=$4::uuid
      AND (c.metadata->>'docId' IS NULL OR c.metadata->>'docId'=$3::text)`,
  [leaf.documentId,state.input.organizationId,sourceId,state.input.programId,'coauthor_documents']);
  const row=rows[0];if(!row)return unavailable('SOURCE_NOT_FOUND',false);
  if(row.source_id!=null&&row.source_id!==sourceId)return unavailable('SOURCE_COPY_IDENTITY_CONFLICT');
  const body=typeof row.content==='string'?row.content:'';
  const storedSha256=body?sha(body):null;const pin=compareDocumentPin(leaf.documentContentSha256,storedSha256);
  const editor:DeliverableSourceRef['editor']={kind:'authoring-document',documentId:sourceId,programId:state.input.programId,sectionCode:null};
  if(pin!=='match'||notFinalizedStatus(typeof row.status==='string'?row.status:undefined,'coauthor_documents')!==null) {
    return {label:typeof row.source_label==='string'?row.source_label:undefined,found:true,storedSha256,evidence:evidenceFor(textBody(body),row.status,'coauthor_documents',pin),editor};
  }
  const sections=await retainedSealedSections(state,{row,sourceId,body});
  if(!sections)return {label:typeof row.source_label==='string'?row.source_label:undefined,found:true,storedSha256,evidence:{...unknown('SOURCE_SEAL_UNVERIFIED'),pin},editor};
  return sealedCopyPresentation(state,{row,sourceId,sections,storedSha256,pin,editor});
}
async function vaultStoredBytes(state:State,row:Record<string,unknown>):Promise<StoreEvidence|{sha256:string;bytes:Buffer}> {
  if(typeof row.storage_version_id!=='string'||typeof row.storage_provider!=='string'||!row.storage_provider.trim()||typeof row.content_hash!=='string')return unavailable('SOURCE_BYTES_UNAVAILABLE');
  const provider= row.storage_provider;
  const byteKey=JSON.stringify([provider,row.storage_version_id,state.input.organizationId]);
  let got=state.providers.get(byteKey);
  if(!state.providers.has(byteKey)) {
    try {got=await getStorageProviderFor(provider).get(row.storage_version_id,state.input.organizationId);} catch {state.providers.set(byteKey,null);return unavailable('SOURCE_BYTES_UNAVAILABLE');}
    state.providers.set(byteKey,got??null);
  }
  if(!got)return unavailable('SOURCE_BYTES_UNAVAILABLE');
  const proof=verifyRetainedLeafBytes(got.bytes,row.content_hash);if(!proof.verified)return unavailable(proof.code);
  if(!state.bytes.some(b=>!('path' in b)&&b.provider===provider&&b.version===row.storage_version_id)) {
    state.bytes.push({provider,version:row.storage_version_id,sha256:proof.sha256});
  }
  return {sha256:proof.sha256,bytes:got.bytes};
}
function retainedPlainText(bytes:Buffer):boolean {
  const plain=bytes.toString('utf8');
  const controlCharacter=Array.from(plain).some(char=>{
    const code=char.charCodeAt(0);
    return code<32&&code!==9&&code!==10&&code!==13;
  });
  return Buffer.from(plain,'utf8').equals(bytes)&&!plain.startsWith('%PDF-')&&!controlCharacter;
}
async function vaultContentEvidence(state:State,args:{leaf:SubmissionLeaf;row:Record<string,unknown>;proof:{sha256:string;bytes:Buffer};pin:DeliverableSourceEvidence['pin']}):Promise<StoreEvidence> {
  const {leaf,row,proof,pin}=args;
  const notFinalized=await vaultVersionNotTransmittable({query:async(sql:string,params?:unknown[])=>({rows:await tracked(state,sql,params??[])})},state.input.organizationId,String(leaf.documentUuid),proof.sha256,
    companyLegalSubmissionContext({programId:state.input.programId,region:state.input.sequenceRegion,applicationType:state.input.applicationType}));
  if(pin!=='match')return {label:typeof row.source_label==='string'?row.source_label:undefined,found:true,storedSha256:proof.sha256,evidence:{...unknown(pin==='mismatch'?'SOURCE_PIN_MISMATCH':'SOURCE_UNPINNED'),pin}};
  const mime=String(row.mime_type??'').toLowerCase();
  if(mime!=='text/plain')return {label:typeof row.source_label==='string'?row.source_label:undefined,found:true,storedSha256:proof.sha256,evidence:{...unknown('SOURCE_BINARY_CONTENT_UNVERIFIED'),pin,lifecycle:notFinalized?'unverified':'finalized'}};
  const plain=proof.bytes.toString('utf8');
  if(!retainedPlainText(proof.bytes))return {label:typeof row.source_label==='string'?row.source_label:undefined,found:true,storedSha256:proof.sha256,evidence:{...unknown('SOURCE_BODY_UNVERIFIED'),pin}};
  return {label:typeof row.source_label==='string'?row.source_label:undefined,found:true,storedSha256:proof.sha256,evidence:notFinalized?{...unknown('SOURCE_BODY_UNVERIFIED'),pin}
    :evidenceFor(textBody(plain),'approved','c2c_document_sections',pin)};
}
async function vault(state:State,leaf:SubmissionLeaf):Promise<StoreEvidence> {
  const identities=await tracked(state,`SELECT d.program_id::text AS program_id,d.organization_id AS source_org FROM vault.documents d
    JOIN regulatory_programs p ON p.id=d.program_id AND p.organization_id=$2 AND p.deleted_at IS NULL
    WHERE d.id=$1::uuid AND d.deleted_at IS NULL`,[leaf.documentUuid,state.input.organizationId]);
  if(!identities[0])return unavailable('SOURCE_NOT_FOUND',false);
  if(identities[0].source_org!=null&&Number(identities[0].source_org)!==state.input.organizationId)throw new SubmissionLeafSourceReadError(404,'SUBMISSION_SOURCE_SCOPE_MISMATCH','The retained source is not in this submission project.');
  if(!sameProgram(state,identities[0].program_id))return unavailable('SOURCE_PARENT_UNVERIFIED');
  if(identities[0].source_org==null)throw new ProgramReadAccessError(409,'VAULT_TENANT_RECONCILIATION_REQUIRED','The stored document needs a verified organization relationship before its data can be supplied.');
  const rows=await tracked(state,`SELECT COALESCE(d.document_title,d.file_name) AS source_label,d.storage_version_id,d.storage_provider,d.content_hash,d.mime_type,
    ${vaultBinaryAvailableSql('d')} AS binary_available FROM vault.documents d
    WHERE d.id=$1::uuid AND d.program_id=$2::uuid AND d.organization_id=$3 AND d.deleted_at IS NULL`,[leaf.documentUuid,state.input.programId,state.input.organizationId]);
  const row=rows[0];if(!row)return unavailable('SOURCE_NOT_FOUND',false);
  if(!row.binary_available)return unavailable('SOURCE_DISPOSITION_UNAVAILABLE');
  const proof=await vaultStoredBytes(state,row);
  if('evidence' in proof)return proof;
  const pin=compareDocumentPin(leaf.documentContentSha256,proof.sha256);
  return vaultContentEvidence(state,{leaf,row,proof,pin});
}
async function onboarding(state:State,leaf:SubmissionLeaf):Promise<StoreEvidence> {
  const parents=await tracked(state,`SELECT p.regulatory_program_id::text AS program_id FROM ctd_onboarding_documents d
    JOIN ctd_onboarding_projects c ON c.id=d.ctd_project_id AND c.organization_id=d.organization_id
    JOIN projects p ON p.id=c.project_id AND p.organization_id=d.organization_id AND p.deleted_at IS NULL
    WHERE d.id=$1 AND d.organization_id=$2 AND c.status<>$3`,[leaf.documentId,state.input.organizationId,'archived']);
  if(!parents[0])return unavailable('SOURCE_PARENT_UNVERIFIED');
  if(!sameProgram(state,parents[0].program_id))return unavailable('SOURCE_PARENT_UNVERIFIED');
  const rows=await tracked(state,`SELECT d.file_name AS source_label,d.storage_path FROM ctd_onboarding_documents d
    JOIN ctd_onboarding_projects c ON c.id=d.ctd_project_id AND c.organization_id=d.organization_id
    JOIN projects p ON p.id=c.project_id AND p.organization_id=d.organization_id AND p.deleted_at IS NULL
    WHERE d.id=$1 AND d.organization_id=$2 AND p.regulatory_program_id=$3::uuid AND c.status<>$4`,
  [leaf.documentId,state.input.organizationId,state.input.programId,'archived']);
  if(typeof rows[0]?.storage_path!=='string')return unavailable('SOURCE_BYTES_UNAVAILABLE');
  const byteKey=JSON.stringify(['local-upload',rows[0].storage_path,state.input.organizationId]);
  let retained=state.providers.get(byteKey);
  if(!state.providers.has(byteKey)) {
    try {const bytes=await readLocalUploadBuffer(rows[0].storage_path);retained=bytes?{bytes}:null;}catch{retained=null;}
    state.providers.set(byteKey,retained??null);
  }
  if(!retained)return unavailable('SOURCE_BYTES_UNAVAILABLE');
  const storedSha256=sha(retained.bytes);
  if(!state.bytes.some(b=>'path' in b&&b.path===rows[0].storage_path))state.bytes.push({path:rows[0].storage_path,sha256:storedSha256});
  const pin=compareDocumentPin(leaf.documentContentSha256,storedSha256);
  return {label:typeof rows[0].source_label==='string'?rows[0].source_label:undefined,found:true,storedSha256,evidence:{...unknown(pin==='mismatch'?'SOURCE_PIN_MISMATCH':pin==='unpinned'?'SOURCE_UNPINNED':'SOURCE_BINARY_CONTENT_UNVERIFIED'),pin}};
}
async function readStore(state:State,leaf:SubmissionLeaf,ref:DeliverableSourceRef['document']):Promise<StoreEvidence> {
  if(!ref)return unavailable('SOURCE_POINTER_UNVERIFIED',false);
  if(leaf.lifecycleOp.trim().toLowerCase()==='delete')return {found:true,storedSha256:null,evidence:{content:'non-substantive',pin:'unverifiable',lifecycle:'not-applicable',reasonCode:'SOURCE_WITHDRAWN'}};
  switch(ref.table) {
    case 'c2c_document_sections':return c2cSection(state,leaf);
    case 'coauthor_documents':return coauthor(state,leaf);
    case 'vault_documents':return vault(state,leaf);
    case 'ctd_onboarding_documents':return onboarding(state,leaf);
    // These stores carry no normalized program parent. A placement is not a
    // source association, and metadata guesses must not authorize a body read.
    case 'unified_documents':case 'rendered_leaf_files':return unavailable('SOURCE_PARENT_UNVERIFIED');
  }
}
function resolution(leaf:SubmissionLeaf,ref:DeliverableSourceRef['document'],read:StoreEvidence):LeafDocumentResolution {
  return {status:!ref?'no_pointer':!read.found?'missing':read.evidence.pin==='mismatch'?'content_changed':read.evidence.content==='undetermined'?'undetermined':'resolved',
    keyKind:leaf.documentTable&&isPlaceableDocumentTable(leaf.documentTable)?documentTableKeyKind(leaf.documentTable):null,
    documentTable:leaf.documentTable??null,documentId:leaf.documentId??null,documentUuid:leaf.documentUuid??null,
    pinnedSha256:leaf.documentContentSha256??null,storedSha256:read.storedSha256,pin:read.evidence.pin,
    reason:safeReason(read.evidence.reasonCode),notTransmittable:read.evidence.content==='substantive'&&read.evidence.lifecycle==='finalized'?null:safeReason(read.evidence.reasonCode)};
}
function sourcePresentation(input:Input,leaf:SubmissionLeaf,document:DeliverableSourceRef['document'],read:StoreEvidence) {
  const sourceRef:DeliverableSourceRef={leafId:leaf.id,sequenceId:input.sequenceId,submissionId:input.submissionId,programId:input.programId,projectId:input.projectId,
    document,section:read.section??null,editor:read.editor??null,evidence:read.evidence,
    ...(read.label?.trim()?{label:read.label}: {})};
  const projected:SourceAwarePathwayLeaf={sectionCode:leaf.sectionCode,title:leaf.title,documentType:leaf.documentType??undefined,sourceRef,contentEvidence:read.evidence,
    substantive:read.evidence.content==='substantive'&&read.evidence.pin==='match'&&read.evidence.lifecycle==='finalized'};
  return {projected,sourceDocument:resolution(leaf,document,read)};
}
export async function readSubmissionLeafSourceEvidence(q:RequestSqlClient,input:Input):Promise<{
  leaves:SourceAwarePathwayLeaf[];sourceIssues:DeliverableSourceIssue[];sourceDocuments:LeafDocumentResolution[];admission:SubmissionLeafSourceAdmission;
}> {
  try {
    if(!q||typeof q.query!=='function')throw new Error('Request source executor required');
    const access=await requireCurrentProgramAccess(q,input);
    if(access.projectId!==input.projectId)throw new SubmissionLeafSourceReadError(404,'SUBMISSION_SOURCE_SCOPE_MISMATCH','The retained source scope does not match.');
    const program=await getCurrentAccessibleProgramScope(q,input);
    const state:State={q,input:{...input,leaves:[...input.leaves]},program,checks:[],reads:new Map(),providers:new Map(),authoring:[],bytes:[]};
    const leaves:SourceAwarePathwayLeaf[]=[];const sourceIssues:DeliverableSourceIssue[]=[];const sourceDocuments:LeafDocumentResolution[]=[];
    for(const leaf of input.leaves) {
      if(leaf.organizationId!==input.organizationId||leaf.sequenceId!==input.sequenceId)throw new SubmissionLeafSourceReadError(404,'SUBMISSION_SOURCE_SCOPE_MISMATCH','The retained source scope does not match.');
      const document=sourceDocument(leaf);const read=await readStore(state,leaf,document);
      const presentation=sourcePresentation(input,leaf,document,read);
      leaves.push(presentation.projected);sourceDocuments.push(presentation.sourceDocument);
      if(read.evidence.reasonCode)sourceIssues.push({leafId:leaf.id,code:read.evidence.reasonCode,message:safeReason(read.evidence.reasonCode)!});
    }
    const admission:SubmissionLeafSourceAdmission=Object.freeze({kind:'request-owned-submission-source-admission'});
    admitted.set(admission,state);return {leaves,sourceIssues,sourceDocuments,admission};
  } catch(error) {
    if(error instanceof SubmissionLeafSourceReadError||error instanceof ProgramReadAccessError||error instanceof AuthoringReadScopeError)throw error;
    throw new SubmissionLeafSourceReadError(503,'SUBMISSION_SOURCE_VERIFICATION_UNAVAILABLE','The retained source evidence could not be verified. Reload before continuing.');
  }
}
async function requireRetainedProjectAnchor(state:State):Promise<void> {
  if((await requireCurrentProgramAccess(state.q,state.input)).projectId!==state.input.projectId)throw new Error('Retained source project anchor changed');
}
export async function requireSubmissionLeafSourceEvidenceStillCurrent(q:RequestSqlClient,admission:SubmissionLeafSourceAdmission):Promise<void> {
  const state=admitted.get(admission);
  if(!state||state.q!==q)throw new SubmissionLeafSourceReadError(503,'SUBMISSION_SOURCE_ADMISSION_UNVERIFIED','The retained source read could not be verified.');
  try {
    await requireProgramScopeStillCurrent(q,state.input,state.program);
    await requireRetainedProjectAnchor(state);
    for(const authoring of state.authoring)await requireAuthoringReadScopeStillCurrent(q,{...state.input,documentId:authoring.documentId},authoring.scope);
    // Replay the identity-first chain before fetching retained handles again.
    // A changed parent or alias must refuse before any second body/byte read.
    for(const check of state.checks) {
      const current=await q.query(check.sql,check.params);
      if(sha(JSON.stringify(current.rows))!==check.digest)throw new Error('Retained source changed');
    }
    for(const retained of state.bytes) {
      const bytes='path' in retained ? await readLocalUploadBuffer(retained.path)
        : (await getStorageProviderFor(retained.provider).get(retained.version,state.input.organizationId))?.bytes;
      if(!bytes||sha(bytes)!==retained.sha256)throw new Error('Retained source bytes changed');
    }
    for(const check of state.checks) {
      const current=await q.query(check.sql,check.params);
      if(sha(JSON.stringify(current.rows))!==check.digest)throw new Error('Retained source changed');
    }
    await requireProgramScopeStillCurrent(q,state.input,state.program);
    await requireRetainedProjectAnchor(state);
    for(const authoring of state.authoring)await requireAuthoringReadScopeStillCurrent(q,{...state.input,documentId:authoring.documentId},authoring.scope);
  } catch {
    throw new SubmissionLeafSourceReadError(503,'SUBMISSION_SOURCE_READ_CHANGED','The retained source or current access changed during this read. Reload before continuing.');
  }
}

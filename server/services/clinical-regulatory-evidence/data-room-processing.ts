/**
 * The one processing step for a Data Room capture (D2, Data Room catalog S2;
 * docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
 *
 * A capture (`cre_evidence_sources`, source_type 'client_document') arrives
 * three ways: a chat or Data Room upload (routes/chat/upload.ts), an adopt of
 * a conversation file (POST /api/c2c/projects/:id/adopt), and a spreadsheet
 * edit AnA saves as a new file (saveDerivedUpload). Only the upload read the
 * file. The other two recorded `extraction_status: 'pending'`, and nothing
 * ever read them: they were in the Data Room, unread, unclassified,
 * unversioned and unsearchable, forever.
 *
 * Every path now goes through here. Everything is deterministic and needs no
 * key:
 *   - describeCapture: the dossier proposal (the classifier the Vault ingest
 *     runs) and the declared version (read off the document, never counted);
 *   - extractCapture: the text, by the platform's extractor;
 *   - recordSourceProcessing: one UPDATE of the derived columns only. The
 *     checksum, scope and capturer stay as the capture wrote them (the VR-16
 *     guard holds them);
 *   - processPendingSources: the sweep for what was captured before this
 *     existed. It is resumable and bounded, and names what it could not read.
 *
 * Derived data is not the record: a re-read may replace it. The record is the
 * original bytes' checksum, which nothing here touches.
 */
import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger.js';
import { determineSourceVersion, type SourceVersionDetermination } from './source-version.js';
import { findTextFacts, matchStudy, readProgramFacts, type ProgramFacts, type TextFacts } from './catalog-facts.js';
import { profileDataset, type DatasetProfile } from './dataset-profile.js';
import { computeSha256 } from '../storage/storage-provider.js';
import { CAPTURE_EXTRACTION_REVISION, ProcessingRefusal, object, readableText, positiveId, persistedTextAvailableSql,
  type ProcessingDatabase, type ProcessingClaim, type SourceProcessingStatus } from './data-room-processing-state.js';
import { claimSource, finishClaim, isProcessingAuthorization, type ProcessingAuthorization } from './data-room-processing-store.js';
import { runProcessingSweep, validateSweepOptions, type PendingSweepReport, type PendingSweepOptions } from './data-room-processing-sweep.js';
import { readExtractionCoverage, type ExtractionCoverage } from '../../../shared/data-room-processing-status.js';
import { AUTOMATIC_PDF_OCR_BUDGET } from '../ocr/ocr-budget.js';
import { captureExtractionEvidence, readCaptureExtractionEvidence, type CaptureExtractionEvidence } from './capture-extraction-evidence.js';

export type { SourceProcessingStatus, ProcessingDatabase, PendingSweepReport, PendingSweepOptions };

const logger = createScopedLogger('data-room-processing');

type Exec = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

/** What the extractor read from a capture's bytes. */
export interface ExtractedCapture {
  /** Null when nothing readable came out: a failure, never an empty success. */
  text: string | null;
  method: string | null;
  pageCount: number | null;
  words: number;
  /** Why there is no text, when there is none. */
  error?: string;
  /** How much of a scanned PDF OCR read, when it was attempted (see extractDocumentText). */
  coverage?: ExtractionCoverage;
  sourceSha256?: string;
  extractionRevision?: typeof CAPTURE_EXTRACTION_REVISION;
  /** Exact-text-bound page/aggregate OCR evidence, not approval or source authority. */
  extractionEvidence?: CaptureExtractionEvidence;
}

export interface SourceProcessingResult {
  ok: boolean;
  processed: boolean;
  status: SourceProcessingStatus;
  reasonCode?: string;
  extracted?: ExtractedCapture;
}
export interface SourceProcessingInput {
  bytes: Buffer; fileName: string; mimeType: string; programId: string | null; processedBy: string;
  preExtracted?: ExtractedCapture; expectedWorkspaceId?: number | null;
}
export interface SourceProcessingOptions { db?: ProcessingDatabase; retryFailed?: boolean; }

/** The deterministic description of a capture: where it likely belongs, and what version it declares. */
export interface CaptureDescription {
  dossier: Record<string, unknown> | null;
  versionDetermination: SourceVersionDetermination;
}

/** What the catalog records a capture IS (S3): every value by rule, with where it came from. */
export interface CatalogFacts {
  program: ProgramFacts | null;
  text: TextFacts;
  study: { studyRef: number | null; candidates: Array<{ id: number; studyId: string; protocolId: string }> };
  datasetProfile: DatasetProfile | null;
}

/**
 * The catalog facts of a capture: the project's own record, the text rules
 * (catalog-facts.ts), the one study of this project the document names, and
 * the structure of a tabular file or define.xml (dataset-profile.ts).
 */
export async function buildCatalogFacts(
  exec: Exec,
  orgId: number,
  programId: string | null,
  input: { text: string | null; bytes?: Buffer | null; fileName: string; mimeType: string },
): Promise<CatalogFacts> {
  const text = findTextFacts(input.text);
  const program = programId ? await readProgramFacts(exec, orgId, programId) : null;
  const study = programId && program ? await matchStudy(exec, orgId, programId, text) : { studyRef: null, candidates: [] };
  const datasetProfile = input.bytes ? await profileDataset(input.bytes, input.fileName, input.mimeType) : null;
  return { program, text, study, datasetProfile };
}

/** The catalog facts as the record keeps them: the evidence for each, and the profile. */
function factsMetadata(f: CatalogFacts | undefined): Record<string, unknown> {
  if (!f) return {};
  return {
    catalogEvidence: {
      registryIds: f.text.registryIds,
      protocolNumber: f.text.protocolNumber,
      documentDate: f.text.documentDate,
      dataCutDate: f.text.dataCutDate,
      study: f.study.candidates.length > 0 ? { matched: f.study.studyRef, candidates: f.study.candidates } : null,
      inheritedFromProject: f.program ? Object.keys(f.program).filter(k => f.program?.[k as keyof ProgramFacts]) : [],
      rules: 'catalog-facts v1',
    },
    ...(f.text.dataCutDate ? { dataCutDate: f.text.dataCutDate.value } : {}),
    ...(f.datasetProfile ? { datasetProfile: f.datasetProfile } : {}),
  };
}

/** Read the bytes with the platform's extractor. Never throws. */
export async function extractCapture(bytes: Buffer, mimeType: string, fileName: string): Promise<ExtractedCapture> {
  const privateBytes = Buffer.from(bytes);
  const binding = { sourceSha256: computeSha256(privateBytes), extractionRevision: CAPTURE_EXTRACTION_REVISION };
  try {
    const { extractDocumentText } = await import('../ocr/index.js');
    // The Data Room records coverage, so it may bound OCR (extractDocumentText.ts).
    const extracted = await extractDocumentText(privateBytes, mimeType, fileName, { pdfOcrBudget: AUTOMATIC_PDF_OCR_BUDGET });
    const text = extracted.text?.trim() ? extracted.text : null;
    const coverage = extracted.coverage ? { coverage: { ...extracted.coverage } } : {};
    if (!text) return { ...binding, text: null, method: extracted.method ?? null, pageCount: null, words: 0, error: 'No text could be read from the file.', ...coverage };
    const extractionEvidence = captureExtractionEvidence(binding.sourceSha256, text, extracted.method, extracted);
    return {
      ...binding,
      text,
      method: extracted.method,
      pageCount: extracted.pageSpans?.length ?? null,
      words: text.trim().split(/\s+/).length,
      ...(extractionEvidence ? { extractionEvidence } : {}),
      ...coverage,
    };
  } catch (err) {
    return { ...binding, text: null, method: null, pageCount: null, words: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The dossier proposal and the declared version. The proposal is the same
 * classifier the Vault ingest runs, stamped as a suggestion; filing stays a
 * governed act. A classifier failure leaves no dossier, never a failed capture.
 */
export async function describeCapture(
  orgId: number,
  programId: string | null,
  input: { fileName: string; mimeType: string; text: string | null },
): Promise<CaptureDescription> {
  let dossier: Record<string, unknown> | null = null;
  try {
    const { classifyForFiling, resolveVaultView, resolveOrgVaultView } = await import('../vault/vault-filing.service.js');
    const view = programId ? await resolveVaultView(programId, orgId) : await resolveOrgVaultView(orgId);
    const c = classifyForFiling({ fileName: input.fileName, title: input.fileName, mimeType: input.mimeType, extractedText: input.text, view });
    dossier = {
      view, evidenceKind: c.evidenceKind, suggestedFolder: c.folderId, ctdSection: c.ctdSection,
      confidence: c.confidence, needsReview: c.needsReview, rationale: c.rationale,
    };
  } catch (err) {
    logger.warn('Data Room classification failed (non-fatal)', { err: err instanceof Error ? err.message : String(err) });
  }
  // A filename placeholder is not document text: pass null when nothing was read.
  const versionDetermination = determineSourceVersion({ documentText: input.text, fileName: input.fileName });
  return { dossier, versionDetermination };
}

/** extraction_status, extracted_text, char_count, page_count. */
function textValues(extracted: ExtractedCapture): unknown[] {
  const text = extracted.text;
  return [text ? 'extracted' : 'failed', text, text ? text.length : 0, extracted.pageCount];
}

/** How the capture was read and versioned, merged into its provenance. */
function processingProvenance(extracted: ExtractedCapture, description: CaptureDescription | undefined, processedBy: string, sourceSha256: string) {
  const extractionEvidence = extracted.text && extracted.method
    ? readCaptureExtractionEvidence(extracted.extractionEvidence, sourceSha256, extracted.text, extracted.method) : null;
  return {
    extractionMethod: extracted.method,
    extractionWords: extracted.words,
    ...(extracted.error ? { extractionError: extracted.error } : {}),
    ...(extracted.coverage ? { extractionCoverage: extracted.coverage } : {}),
    ...(extractionEvidence ? { extractionEvidence } : {}),
    processedBy,
    ...(description ? { versionDeclaration: { ...description.versionDetermination.declaration, determinedBy: processedBy } } : {}),
  };
}

/** product … study_ref, in the UPDATE's order; null where nothing was found. */
function factValues(facts: CatalogFacts | undefined): unknown[] {
  const pf = facts?.program;
  const v = (x: string | number | null | undefined) => x ?? null;
  return [
    v(pf?.product), v(pf?.indication), v(pf?.phase), v(pf?.applicationType), v(pf?.applicationNumber), v(pf?.agency),
    v(facts?.text.registryIds[0]?.value), v(facts?.text.documentDate?.value), v(facts?.study.studyRef),
  ];
}

/**
 * Write what processing found onto the capture: the derived columns only,
 * scoped to the organization. `version` is written only where the capture has
 * none, so a declared version is never overwritten by a re-read.
 */
export async function recordSourceProcessing(
  exec: Exec,
  orgId: number,
  sourceId: number,
  p: { extracted: ExtractedCapture; description?: CaptureDescription; facts?: CatalogFacts; processedBy: string; authorization?: ProcessingAuthorization },
): Promise<boolean> {
  if (!isProcessingAuthorization(p.authorization,exec,orgId,sourceId)) return false;
  const auth=p.authorization;
  const { extracted, description, facts } = p;
  const { rowCount } = await exec.query(
    `UPDATE cre_evidence_sources SET
        extraction_status = CASE WHEN $4::text IS NULL AND ${persistedTextAvailableSql()} THEN extraction_status ELSE $3 END,
        extracted_text = CASE WHEN $4::text IS NULL AND ${persistedTextAvailableSql()} THEN extracted_text ELSE $4 END,
        char_count = CASE WHEN $4::text IS NULL AND ${persistedTextAvailableSql()} THEN char_count ELSE $5 END,
        page_count = CASE WHEN $4::text IS NULL AND ${persistedTextAvailableSql()} THEN page_count ELSE $6 END,
        text_extracted_at = clock_timestamp(),
        version = COALESCE(version, $7),
        -- Retained text keeps its coverage/evidence; replacement text brings its own, or none.
        provenance = CASE WHEN $4::text IS NULL AND ${persistedTextAvailableSql()}
          THEN (COALESCE(provenance, '{}'::jsonb) - 'extractionError') || ($8::jsonb - 'extractionCoverage' - 'extractionEvidence')
          ELSE (COALESCE(provenance, '{}'::jsonb) - 'extractionError' - 'extractionCoverage' - 'extractionEvidence') || $8::jsonb END,
        metadata = COALESCE(metadata, '{}'::jsonb) || $9::jsonb,
        -- What it IS (S3): filled only where empty, never overwritten by a re-read.
        product = COALESCE(product, $10), indication = COALESCE(indication, $11), phase = COALESCE(phase, $12),
        application_type = COALESCE(application_type, $13), application_number = COALESCE(application_number, $14),
        agency = COALESCE(agency, $15), trial_registry_identifier = COALESCE(trial_registry_identifier, $16),
        document_date = COALESCE(document_date, $17::date), study_ref = COALESCE(study_ref, $18),
        updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND source_type = 'client_document' AND deleted_at IS NULL AND is_current IS NOT FALSE
        AND metadata->'dataRoomProcessing'->>'attemptId'=$19
        AND metadata->'dataRoomProcessing'->>'leaseExpiresAt'=$25 AND $25::timestamptz>clock_timestamp()
        AND checksum=$20 AND client_program_id IS NOT DISTINCT FROM $21::uuid
        AND client_workspace_id IS NOT DISTINCT FROM $22::int AND stored_artifact_ref IS NOT DISTINCT FROM $23
        AND provenance->>'fileUploadId'=$24`,
    [sourceId, orgId, ...textValues(extracted), description?.versionDetermination.version ?? null,
      JSON.stringify(processingProvenance(extracted, description, p.processedBy, auth.claim.identity.sha256)),
      JSON.stringify({ ...(description?.dossier ? { dossier: description.dossier } : {}), ...factsMetadata(facts), dataRoomProcessing:auth.stage }),
      ...factValues(facts),auth.claim.stage.attemptId,auth.claim.identity.sha256,auth.claim.identity.programId,
      auth.claim.identity.workspaceId,auth.claim.identity.storageRef,auth.claim.identity.fileUploadId,auth.row.metadata.dataRoomProcessing.leaseExpiresAt],
  );
  return (rowCount ?? 0) === 1;
}

/**
 * Process one capture from its bytes: read, describe, record. Called after
 * the capture commits; never throws, because the capture is the record and
 * stands without its derived text. A failure is logged and left 'pending' for
 * the sweep.
 */
export async function processCapturedSource(
  orgId: number,
  sourceId: number,
  input: SourceProcessingInput,
  opts: SourceProcessingOptions = {},
): Promise<SourceProcessingResult> {
  // The caller cannot mutate bytes after hashing while asynchronous admission runs.
  if (!Buffer.isBuffer(input.bytes)) return processingResult('blocked','ORIGINAL_IDENTITY_INVALID');
  return processSource(orgId,sourceId,{...input,bytes:Buffer.from(input.bytes),preExtracted:snapshotExtraction(input.preExtracted)},opts);
}

const processingResult=(status:SourceProcessingStatus,reasonCode?:string,extracted?:ExtractedCapture):SourceProcessingResult=>({
  ok:status==='completed'||status==='already_complete',processed:status==='completed'||status==='already_complete',status,
  ...(reasonCode?{reasonCode}:{}),...(extracted?{extracted}:{}),
});
function boundExtraction(v:unknown,sha:string):v is ExtractedCapture {
  return object(v) && v.sourceSha256===sha && v.extractionRevision===CAPTURE_EXTRACTION_REVISION
    && (v.text===null||readableText(v.text)) && (v.method===null||typeof v.method==='string')
    && (v.pageCount===null||(Number.isSafeInteger(v.pageCount)&&v.pageCount>=0))
    && Number.isSafeInteger(v.words)&&v.words>=0 && (v.error===undefined||typeof v.error==='string')
    && optionalExtractionMetadata(v);
}
const optionalCoverage=(c:unknown)=>c===undefined||readExtractionCoverage(c)!==null;
function optionalExtractionMetadata(v:Record<string,unknown>):boolean {
  if (!optionalCoverage(v.coverage)) return false;
  if (v.extractionEvidence === undefined) return true;
  return typeof v.text === 'string' && typeof v.method === 'string' && typeof v.sourceSha256 === 'string'
    && readCaptureExtractionEvidence(v.extractionEvidence,v.sourceSha256,v.text,v.method)!==null;
}
/** Detach recognized nested metadata before admission's first await. Invalid
 * supplied receipts force fresh extraction, rather than becoming legacy absence. */
function snapshotExtraction(v:ExtractedCapture|undefined):ExtractedCapture|undefined {
  if (!v || !boundExtraction(v,v.sourceSha256??'')) return undefined;
  const coverage=readExtractionCoverage(v.coverage);
  const extractionEvidence=v.extractionEvidence
    ? readCaptureExtractionEvidence(v.extractionEvidence,v.sourceSha256??'',v.text??'',v.method??'') : null;
  return {...v,...(coverage?{coverage}:{}),...(extractionEvidence?{extractionEvidence}:{})};
}
/** Text that completed but does not cover the whole document says so on the result. */
const completedReason=(e:ExtractedCapture)=>e.coverage?.limitedBy?'EXTRACTION_PARTIAL':undefined;
type ProcessingWorkInput=Omit<SourceProcessingInput,'bytes'>&{bytes:Buffer|null};
function validWork(org:number,id:number,input:ProcessingWorkInput,opts:SourceProcessingOptions,db:ProcessingDatabase):boolean {
  return [positiveId(org),positiveId(id),typeof db.connect==='function',typeof input.fileName==='string',typeof input.mimeType==='string',
    typeof input.processedBy==='string',input.programId===null||typeof input.programId==='string',
    input.expectedWorkspaceId===undefined||input.expectedWorkspaceId===null||positiveId(input.expectedWorkspaceId),
    opts.retryFailed===undefined||typeof opts.retryFailed==='boolean'].every(Boolean);
}
async function verifiedOriginal(claim:ProcessingClaim):Promise<Buffer> {
  const {loadUploadedFile}=await import('../ana/uploaded-file-access.js');
  const original=await loadUploadedFile(claim.identity.fileUploadId,claim.identity.organizationId);
  const bytes=Buffer.from(original.buffer);
  const valid=[original.fileId===claim.identity.fileUploadId,original.storagePath===claim.identity.uploadStoragePath,
    original.integrity==='verified',computeSha256(bytes)===claim.identity.sha256,bytes.length===claim.identity.sizeBytes].every(Boolean);
  if(!valid) throw new ProcessingRefusal('blocked','ORIGINAL_INTEGRITY_FAILED');
  return bytes;
}
async function deriveAndCommit(db:ProcessingDatabase,claim:ProcessingClaim,input:ProcessingWorkInput):Promise<SourceProcessingResult> {
  const bytes=await verifiedOriginal(claim);
  const {fileName,mimeType,programId,organizationId:orgId,sourceId}=claim.identity;
  const reuse=input.fileName===fileName&&input.mimeType===mimeType&&boundExtraction(input.preExtracted,claim.identity.sha256);
  const extracted=reuse?{...input.preExtracted!}:await extractCapture(bytes,mimeType,fileName);
  const description=await describeCapture(orgId,programId,{fileName,mimeType,text:extracted.text});
  const facts=await buildCatalogFacts(db,orgId,programId,{text:extracted.text,bytes,fileName,mimeType});
  await finishClaim(db,claim,{state:extracted.text?'completed':'failed',reasonCode:extracted.text?null:'EXTRACTION_FAILED',retryable:false},
    auth=>recordSourceProcessing(auth.client,orgId,sourceId,{extracted,description,facts,processedBy:input.processedBy,authorization:auth}));
  return processingResult(extracted.text?'completed':'extraction_failed',extracted.text?completedReason(extracted):'EXTRACTION_FAILED',extracted);
}
async function journalFailure(db:ProcessingDatabase,claim:ProcessingClaim,refusal:ProcessingRefusal|null):Promise<ProcessingRefusal|null> {
  if(refusal?.status==='stale_source') return refusal;
  try {await finishClaim(db,claim,{state:refusal?'blocked':'failed',reasonCode:refusal?.reasonCode??'PERSISTENCE_FAILED',retryable:!refusal});}
  catch(err) {if(err instanceof ProcessingRefusal) return err;}
  return refusal;
}
async function processingFailure(db:ProcessingDatabase,claim:ProcessingClaim|undefined,err:unknown,sourceId:number):Promise<SourceProcessingResult> {
  const initial=err instanceof ProcessingRefusal?err:uploadRefusal(err);
  const refusal=claim?await journalFailure(db,claim,initial):initial;
  logger.warn('Data Room processing did not complete; pending capture or expired lease remains recoverable',{sourceId,reasonCode:refusal?.reasonCode??'PROCESSING_UNAVAILABLE'});
  return processingResult(refusal?.status??'retryable_failure',refusal?.reasonCode??'PROCESSING_UNAVAILABLE');
}
async function processSource(orgId:number,sourceId:number,input:ProcessingWorkInput,opts:SourceProcessingOptions):Promise<SourceProcessingResult> {
  const db=opts.db ?? pool as unknown as ProcessingDatabase;
  if(!validWork(orgId,sourceId,input,opts,db)) return processingResult('blocked','ORIGINAL_IDENTITY_INVALID');
  let claim:ProcessingClaim|undefined;
  try {
    const admitted=await claimSource(db,orgId,sourceId,{programId:input.programId,expectedWorkspaceId:input.expectedWorkspaceId,
      ...(input.bytes?{suppliedSha256:computeSha256(input.bytes)}:{})},opts.retryFailed);
    if (!('claim' in admitted)) return processingResult(admitted.status,admitted.reasonCode);
    claim=admitted.claim;
    return await deriveAndCommit(db,claim,input);
  } catch (err) {
    return processingFailure(db,claim,err,sourceId);
  }
}
function uploadRefusal(err:unknown):ProcessingRefusal|null {
  const code=object(err)?err.code:undefined;
  if(code==='UPLOAD_BYTES_MISSING') return new ProcessingRefusal('blocked','ORIGINAL_BYTES_MISSING');
  if(code==='UPLOAD_INTEGRITY_FAILED') return new ProcessingRefusal('blocked','ORIGINAL_INTEGRITY_FAILED');
  if(code==='UPLOAD_NOT_FOUND') return new ProcessingRefusal('blocked','ORIGINAL_UPLOAD_UNAVAILABLE');
  return null;
}

/**
 * Process the organization's captures still marked 'pending', oldest first.
 * Bounded per run; resumable (a processed capture leaves the set); dry-run
 * unless applied. The bytes are read through the one verified loader, so a
 * file whose stored bytes no longer match their digest is refused, not read.
 */
export async function processPendingSources(
  orgId: number,
  opts: PendingSweepOptions = {},
): Promise<PendingSweepReport> {
  return runProcessingSweep(orgId,opts,pool as unknown as ProcessingDatabase,r=>processSource(orgId,Number(r.id),{
    bytes:null,fileName:r.title??'',mimeType:r.metadata?.mimeType??'application/octet-stream',
    programId:r.client_program_id??null,expectedWorkspaceId:r.client_workspace_id??null,processedBy:'data-room pending sweep',
  },{db:opts.db??pool as unknown as ProcessingDatabase,retryFailed:opts.retryFailed}));
}

/** Operator-only wrapper: resolve one tenant, then preserve its normal RLS/lifecycle posture. */
export async function processPendingSourcesForTenant(orgId:number,opts:Omit<PendingSweepOptions,'exec'|'db'>={}):Promise<PendingSweepReport> {
  validateSweepOptions(orgId,opts);
  const {runWithSystemTenantScope,runWithTenantScope}=await import('../../db/tenantStore.js');
  const found=await runWithSystemTenantScope('scripts/process-data-room-captures.mjs:org-uuid',()=>pool.query('SELECT uuid FROM organizations WHERE id=$1',[orgId]));
  const orgUuid=found.rows[0]?.uuid;
  if(!orgUuid) throw new Error('TENANT_UNAVAILABLE');
  return runWithTenantScope({tenantId:String(orgId),orgUuid:String(orgUuid),role:null,source:'cli',caller:'scripts/process-data-room-captures.mjs'},async()=>{
    const {getTenantAccessPosture,backgroundWorkPermitted}=await import('../tenant/tenant-lifecycle.js');
    const posture=await getTenantAccessPosture(orgId);
    if(!posture||!['allow','read_only'].includes(posture.decision)||(opts.apply===true&&!backgroundWorkPermitted(posture))) throw new Error('TENANT_ACCESS_REFUSED');
    return processPendingSources(orgId,opts);
  });
}

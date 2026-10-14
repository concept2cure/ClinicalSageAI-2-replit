/** Actor-aware interactive facades compose raw catalog queries with canonical
 * read admission; raw primitives remain available for authorized background work. */
import { createHash } from 'node:crypto';
import { AnaProjectScopeError } from '../ana/project-scope-admission.js';
import { assertAnaSourceProgramAllowed, type AnaSourceReadScopeInput, type AdmittedAnaSourceReadScope } from '../ana/source-read-scope.js';
import { withAnaSourceReadScope } from './document-catalog-actor-access.js';
import type { CatalogDocumentRow, ProjectDocumentPage, Queryable } from './document-catalog.service.js';

export interface AnaCatalogSourceAccess {
  actorFiltered: true;
  currentVersion: boolean;
  retainedTextOnly: boolean;
  currentUseEligible: boolean;
  receiptEligible: boolean;
  scope: 'open_project' | 'accessible_projects';
  notice: string;
}
export interface ActorCatalogDocumentRow extends CatalogDocumentRow {
  isCurrent: boolean;
  admittedScope: AdmittedAnaSourceReadScope;
  sourceAccess: AnaCatalogSourceAccess;
  /** SHA of the exact server-loaded extraction; metadata delivery does not
   * establish that the extraction body was delivered or read. */
  extractedTextSha256: string | null;
}
export interface ActorProjectDocumentPage extends ProjectDocumentPage {
  admittedScope: AdmittedAnaSourceReadScope;
  actorFiltered: true;
  sourceAccessNotice: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/i;
const unavailable = (): never => {
  throw new AnaProjectScopeError(503, 'ANA_SOURCE_IDENTITY_UNAVAILABLE', 'The exact source identity or current extraction could not be verified. No source content was returned.');
};
export function anaSourceScopeNotice(scope: AdmittedAnaSourceReadScope): string {
  return scope.projectId === null
    ? 'This listing covers only the current actor’s accessible projects and eligible creator-owned unbound uploads. It does not describe every file in the organization.'
    : 'This listing covers only the admitted open project. It does not describe files in other projects.';
}
function checkedSource(doc: CatalogDocumentRow, scope: AdmittedAnaSourceReadScope): void {
  if (doc.organizationId !== scope.organizationId || !UUID.test(doc.id) || !SHA.test(doc.contentHash) || typeof doc.isCurrent !== 'boolean') unavailable();
  assertAnaSourceProgramAllowed(scope, doc.programId);
  if (doc.disposition === 'remove_data' || doc.disposition === 'supersede') unavailable();
  if (doc.catalog?.contentHash !== undefined && doc.catalog.contentHash !== doc.contentHash) unavailable();
  if (doc.extractedText !== null && typeof doc.extractedText !== 'string') unavailable();
}
function sourceChanged(before: CatalogDocumentRow, after: CatalogDocumentRow): boolean {
  return before.id !== after.id || before.programId !== after.programId || before.contentHash !== after.contentHash ||
    before.extractedText !== after.extractedText || before.isCurrent !== after.isCurrent ||
    before.disposition !== after.disposition || before.originalFileAvailable !== after.originalFileAvailable;
}
function hasReceiptCatalog(doc: CatalogDocumentRow): boolean {
  return doc.catalog !== null && doc.catalog.contentHash === doc.contentHash && doc.catalog.status !== 'extraction_failed';
}
function actorDocument(doc: CatalogDocumentRow, scope: AdmittedAnaSourceReadScope, includeText: boolean): ActorCatalogDocumentRow {
  const isCurrent = doc.isCurrent === true;
  const retained = doc.disposition === 'keep_data' || doc.originalFileAvailable === false;
  const textReady = includeText && typeof doc.extractedText === 'string' && doc.extractedText.trim().length > 0;
  const notices = [anaSourceScopeNotice(scope)];
  if (!isCurrent) notices.push('This is a historical version. It is available for historical reading and cannot earn a new current-source read receipt or serve as a current drafting source.');
  if (retained) notices.push('Eligible extracted text was retained; the original file is unavailable and is not reopened by this read.');
  return {
    ...doc, extractedText: includeText ? doc.extractedText : null, isCurrent, admittedScope: scope,
    extractedTextSha256: doc.extractedText !== null ? createHash('sha256').update(doc.extractedText).digest('hex') : null,
    sourceAccess: { actorFiltered: true, currentVersion: isCurrent, retainedTextOnly: retained,
      currentUseEligible: isCurrent, receiptEligible: isCurrent && textReady && hasReceiptCatalog(doc),
      scope: scope.projectId === null ? 'accessible_projects' : 'open_project', notice: notices.join(' ') },
  };
}
interface ReadDeps {
  load: (documentId: string, organizationId: number, opts: { includeText?: boolean; executor?: Queryable; programId?: string; currentOnly?: boolean; allowedProgramIds?: readonly string[] }) => Promise<CatalogDocumentRow | null>;
}
export async function runLoadDocumentForActor(
  input: AnaSourceReadScopeInput & { documentId: string },
  opts: { includeText?: boolean; currentOnly?: boolean },
  deps: ReadDeps,
): Promise<ActorCatalogDocumentRow | null> {
  const pinned = { organizationId: input.organizationId, userId: input.userId, projectId: input.projectId,
    projectRef: input.projectRef, requestedProgramId: input.requestedProgramId, documentId: input.documentId };
  const includeText = opts.includeText === true;
  const currentOnly = opts.currentOnly === true;
  if (typeof pinned.documentId !== 'string' || !UUID.test(pinned.documentId)) {
    throw new AnaProjectScopeError(400, 'ANA_SOURCE_SELECTION_INVALID', 'Choose a valid source identifier.');
  }
  return withAnaSourceReadScope(pinned, async (q, scope) => {
    // A metadata-only facade still checks the actual stored extraction and
    // exposes its digest, then strips the body from its returned projection.
    const loadOpts = { includeText: true, executor: q, currentOnly, allowedProgramIds: scope.accessibleProgramIds,
      ...(scope.programId ? { programId: scope.programId } : {}) };
    const doc = await deps.load(pinned.documentId, scope.organizationId, loadOpts);
    if (!doc) return null;
    checkedSource(doc, scope);
    if (doc.id.toLowerCase() !== pinned.documentId.toLowerCase()) unavailable();
    // A fresh final source read catches extraction/source changes while other
    // asynchronous database admission work completed. It is a point-in-time
    // guard, not a continuous delivery or provider acknowledgement.
    const final = await deps.load(pinned.documentId, scope.organizationId, loadOpts);
    if (!final) throw new AnaProjectScopeError(409, 'ANA_SOURCE_CHANGED', 'The source changed before it could be returned. Read its current version again.');
    checkedSource(final, scope);
    if (sourceChanged(doc, final)) {
      throw new AnaProjectScopeError(409, 'ANA_SOURCE_CHANGED', 'The source changed before it could be returned. Read its current version again.');
    }
    return actorDocument(final, scope, includeText);
  });
}
export async function runListProjectDocumentsForActor(
  input: AnaSourceReadScopeInput,
  opts: { limit?: number },
  list: (organizationId: number, opts: { programId?: string | null; limit?: number; executor?: Queryable; allowedProgramIds?: readonly string[]; currentOnly?: boolean }) => Promise<ProjectDocumentPage>,
): Promise<ActorProjectDocumentPage> {
  const pinned = { organizationId: input.organizationId, userId: input.userId, projectId: input.projectId,
    projectRef: input.projectRef, requestedProgramId: input.requestedProgramId };
  const limit = opts.limit;
  return withAnaSourceReadScope(pinned, async (q, scope) => {
    const page = await list(scope.organizationId, { programId: scope.programId, limit,
      executor: q, allowedProgramIds: scope.accessibleProgramIds, currentOnly: true });
    for (const doc of page.documents) assertAnaSourceProgramAllowed(scope, doc.programId);
    return { ...page, actorFiltered: true, admittedScope: scope, sourceAccessNotice: anaSourceScopeNotice(scope) };
  });
}

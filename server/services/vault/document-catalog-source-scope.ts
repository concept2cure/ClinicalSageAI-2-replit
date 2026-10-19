/** Exact recorded-source identity guards. These do not replace actor/project
 * admission and do not create actor-aware organization-wide recall policy. */
import type { CatalogDocumentRow } from './document-catalog.service.js';
import { catalogableDocument } from './document-catalog-eligibility.js';

export class CatalogSourceScopeError extends Error {
  readonly code = 'CATALOG_SOURCE_SCOPE_INVALID';
  constructor() { super('The recorded catalog source and live program scope could not be verified. No catalog listing or recall was produced.'); }
}

export function assertCatalogListingScope(rows: Array<Record<string, unknown>>, organizationId: number): void {
  if (!rows.every(row => row.organization_id === organizationId && row.program_organization_id === organizationId && row.program_deleted_at === null)) {
    throw new CatalogSourceScopeError();
  }
}

export function catalogableExpectedProgram(doc: CatalogDocumentRow | null, expectedProgramId?: string):
  ReturnType<typeof catalogableDocument> | { ok: false; code: 'SOURCE_PROGRAM_CHANGED'; refusal: string } {
  const availability = catalogableDocument(doc);
  if (availability.ok && expectedProgramId !== undefined && (typeof expectedProgramId !== 'string' || availability.document.programId.toLowerCase() !== expectedProgramId.toLowerCase())) {
    return { ok: false, code: 'SOURCE_PROGRAM_CHANGED', refusal: 'The document’s program changed since this request was admitted. Open its current project and read it again. Nothing was saved.' };
  }
  return availability;
}

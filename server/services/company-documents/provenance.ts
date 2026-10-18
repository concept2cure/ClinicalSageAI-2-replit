import { createHash } from 'node:crypto';
import type { CompanyDocumentProfile } from '../../../shared/company-documents';
import { normalizeTemplateSpec } from '../../../shared/templates/template-spec';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};

/** Fixed field order and normalized style: the same identity is hashed at save and export. */
function presentationIdentity(value: unknown, organizationName = '') {
  const p = record(value);
  return {
    revision: Number.isSafeInteger(p.revision) && Number(p.revision) >= 0 ? Number(p.revision) : 0,
    companyName: typeof p.companyName === 'string' ? p.companyName : organizationName,
    address: typeof p.address === 'string' ? p.address : '',
    contact: typeof p.contact === 'string' ? p.contact : '',
    registrationDetails: typeof p.registrationDetails === 'string' ? p.registrationDetails : '',
    letterhead: normalizeTemplateSpec(p.letterhead),
  };
}

export function companyProfileHash(profile: CompanyDocumentProfile): string {
  return createHash('sha256').update(JSON.stringify(presentationIdentity(profile))).digest('hex');
}

function references(value: unknown) {
  const entries = record(value).legalDocuments;
  if (!Array.isArray(entries)) return new Map<string, { vaultDocumentId: string; contentHash: string; active: boolean }>();
  return new Map(entries.flatMap(entry => {
    const d = record(entry);
    return typeof d.id === 'string' && typeof d.vaultDocumentId === 'string' && typeof d.contentHash === 'string'
      ? [[d.id, { vaultDocumentId: d.vaultDocumentId, contentHash: d.contentHash, active: d.active === true }] as const] : [];
  }));
}

/** Only immutable reference facts and digests leave the settings transaction.
 * Company prose, legal content, contact details, logo bytes and style stay out
 * of the append-only audit ledger. */
export function companyDocumentsAuditDetails(before: unknown, after: unknown, organizationName: string) {
  const from = presentationIdentity(before, organizationName);
  const to = presentationIdentity(after, organizationName);
  const previous = references(before);
  const next = references(after);
  return {
    before: { revision: from.revision, sha256: createHash('sha256').update(JSON.stringify(from)).digest('hex') },
    after: { revision: to.revision, sha256: createHash('sha256').update(JSON.stringify(to)).digest('hex') },
    legalChanges: [...new Set([...previous.keys(), ...next.keys()])].sort()
      .filter(id => JSON.stringify(previous.get(id)) !== JSON.stringify(next.get(id)))
      .map(id => ({ id, before: previous.get(id) ?? null, after: next.get(id) ?? null })),
  };
}

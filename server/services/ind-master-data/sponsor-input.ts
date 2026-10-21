/** Existing sponsor business facts, validated before reaching the registry. */
import type { Sponsor } from '../../../shared/schema/ind-master-data';
import { createHash } from 'node:crypto';
import { DUNS_NUMBER_PATTERN, usableContactField, usableIdentifier } from '../ectd/regulatory-identifiers';

export const SPONSOR_BUSINESS_FIELDS = [
  'name', 'addressLine1', 'addressLine2', 'city', 'stateProvince', 'postalCode', 'country',
  'contactName', 'contactPhone', 'contactEmail', 'duns', 'signatoryName', 'signatoryTitle',
] as const;
export type SponsorBusinessField = (typeof SPONSOR_BUSINESS_FIELDS)[number];
export type SponsorBusinessPatch = Partial<Pick<Sponsor, SponsorBusinessField>>;

export class SponsorInputError extends Error {
  readonly code = 'VALIDATION';
}

const TEXT_LIMITS: Partial<Record<SponsorBusinessField, number>> = {
  addressLine1: 1000, addressLine2: 1000, city: 128, stateProvince: 128,
  postalCode: 32, country: 64, signatoryName: 200, signatoryTitle: 200,
};
const BUSINESS_KEYS: ReadonlySet<string> = new Set(SPONSOR_BUSINESS_FIELDS);
const CONTACT_KEYS = { contactName: 'name', contactPhone: 'phone', contactEmail: 'email' } as const;

function statedSponsorValue(key: SponsorBusinessField, value: string): string {
  if (key === 'duns' && !DUNS_NUMBER_PATTERN.test(value)) {
    throw new SponsorInputError('DUNS must contain the nine digits of the applicant’s D-U-N-S number, without dashes or a prefix.');
  }
  const contactKey = CONTACT_KEYS[key as keyof typeof CONTACT_KEYS];
  if (contactKey && usableContactField(contactKey, value) === null) {
    throw new SponsorInputError(`The regulatory contact ${contactKey} is not usable. Correct the stated value or clear it.`);
  }
  const limit = TEXT_LIMITS[key];
  if (limit !== undefined && value.length > limit) {
    throw new SponsorInputError(`${key} exceeds ${limit} characters.`);
  }
  return value;
}

function normalizeSponsorValue(key: SponsorBusinessField, rawValue: unknown): string | null {
  if (rawValue !== null && typeof rawValue !== 'string') {
    throw new SponsorInputError(`${key} must be text${key === 'name' ? '.' : ', or null to clear.'}`);
  }
  const value = typeof rawValue === 'string' ? rawValue.trim() : null;
  if (key === 'name') {
    const name = usableIdentifier('applicantName', value);
    if (!name) throw new SponsorInputError('The applicant name must be usable backbone text, 1–200 characters.');
    return name;
  }
  return value === null || value === '' ? null : statedSponsorValue(key, value);
}

/** Incomplete drafts may save; a stated malformed identifier/contact may not. */
export function normalizeSponsorBusiness(input: unknown, mode: 'create' | 'patch'): SponsorBusinessPatch {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SponsorInputError('Sponsor facts must be an object.');
  }
  const fields = Object.entries(input as Record<string, unknown>);
  if (fields.some(([key]) => !BUSINESS_KEYS.has(key))) {
    throw new SponsorInputError('The request contains an unsupported sponsor field.');
  }
  if (fields.length === 0 || (mode === 'create' && !Object.hasOwn(input, 'name'))) {
    throw new SponsorInputError(mode === 'create' ? 'The applicant name is required.' : 'State at least one sponsor fact to change.');
  }
  return Object.fromEntries(fields.map(([key, value]) =>
    [key, normalizeSponsorValue(key as SponsorBusinessField, value)])) as SponsorBusinessPatch;
}

export function sponsorReason(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 8 || value.trim().length > 2000) {
    throw new SponsorInputError('State a reason of 8–2000 characters for changing applicant master data.');
  }
  return value.trim();
}

type SponsorAuditValue = string | null | { omitted: 'exceeds-audit-limit'; characters: number; sha256: string };

function auditValue(value: string | null): SponsorAuditValue {
  // Older registry rows predate validation. Fingerprint an oversized value
  // honestly instead of storing unbounded text or claiming a truncated value
  // was the previous fact. The full record remains in its existing registry.
  return typeof value === 'string' && value.length > 1000
    ? { omitted: 'exceeds-audit-limit', characters: value.length, sha256: createHash('sha256').update(value).digest('hex') }
    : value;
}

/** Audit only bounded, known business facts, never actor or request controls. */
export function sponsorBusinessFacts(row: Sponsor): Record<SponsorBusinessField, SponsorAuditValue> {
  return Object.fromEntries(SPONSOR_BUSINESS_FIELDS.map((key) => [key, auditValue(row[key])])) as Record<SponsorBusinessField, SponsorAuditValue>;
}

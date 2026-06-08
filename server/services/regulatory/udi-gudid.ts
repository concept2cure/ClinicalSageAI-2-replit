/**
 * Unique Device Identification (UDI) and GUDID.
 *
 * The evaluation flagged that UDI/GUDID was absent. This module validates a
 * GS1 Device Identifier (GTIN-14, with the standard mod-10 check digit) and
 * scores GUDID record completeness against FDA's required attributes.
 *
 * Pure and deterministic.
 */

// ── GS1 GTIN-14 device identifier ────────────────────────────────────────────

/** Compute the GS1 mod-10 check digit for the first 13 digits of a GTIN-14. */
export function gtin14CheckDigit(first13: string): number {
  if (!/^\d{13}$/.test(first13)) throw new Error('GTIN-14 requires 13 leading digits.');
  const rev = first13.split('').reverse();
  let sum = 0;
  for (let i = 0; i < rev.length; i++) {
    sum += Number(rev[i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export interface UdiValidationResult {
  valid: boolean;
  agency: 'GS1';
  deviceIdentifier: string;
  /** Reason the DI is invalid (when valid is false). */
  error?: string;
  expectedCheckDigit?: number;
  framework: 'FDA UDI / GS1';
}

/** Validate a GS1 GTIN-14 Device Identifier (format + check digit). */
export function validateGs1DeviceIdentifier(di: string): UdiValidationResult {
  const cleaned = di.trim();
  const base = { agency: 'GS1' as const, deviceIdentifier: cleaned, framework: 'FDA UDI / GS1' as const };
  if (!/^\d{14}$/.test(cleaned)) {
    return { ...base, valid: false, error: 'GTIN-14 must be exactly 14 digits.' };
  }
  const expected = gtin14CheckDigit(cleaned.slice(0, 13));
  if (expected !== Number(cleaned[13])) {
    return { ...base, valid: false, error: 'Invalid check digit.', expectedCheckDigit: expected };
  }
  return { ...base, valid: true };
}

// ── GUDID record completeness ────────────────────────────────────────────────

export const GUDID_REQUIRED_ATTRIBUTES = [
  'primaryDi',
  'brandName',
  'versionOrModel',
  'companyName',
  'deviceCountInBasePackage',
  'fdaProductCodeOrGmdn',
  'sterilization',
  'mriSafetyStatus',
  'singleUse',
  'labeledContainsNrl', // natural rubber latex statement
] as const;

export type GudidAttribute = (typeof GUDID_REQUIRED_ATTRIBUTES)[number];

export interface GudidCompletenessResult {
  completenessScore: number;
  present: GudidAttribute[];
  gaps: GudidAttribute[];
  complete: boolean;
  framework: 'FDA GUDID';
}

/** Score GUDID record completeness against the required attributes. */
export function assessGudidCompleteness(
  attributes: Partial<Record<GudidAttribute, boolean>>
): GudidCompletenessResult {
  const present: GudidAttribute[] = [];
  const gaps: GudidAttribute[] = [];
  for (const a of GUDID_REQUIRED_ATTRIBUTES) {
    if (attributes[a] === true) present.push(a);
    else gaps.push(a);
  }
  return {
    completenessScore: present.length / GUDID_REQUIRED_ATTRIBUTES.length,
    present,
    gaps,
    complete: gaps.length === 0,
    framework: 'FDA GUDID',
  };
}

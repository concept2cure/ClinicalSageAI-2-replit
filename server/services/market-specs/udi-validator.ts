/**
 * UDI (Unique Device Identification) validator — parses and validates a device's
 * UDI carrier and reports its GUDID (FDA) / EUDAMED (EU) registration components.
 *
 * WHY THIS EXISTS (audit gap): UDI was referenced but never validated. A UDI is the
 * UDI-DI (Device Identifier, static — the GS1 GTIN, HIBCC or ICCBBA code) plus the
 * UDI-PI (Production Identifier, dynamic — lot, serial, expiry, manufacture date).
 * This module does REAL work: it computes the GS1 mod-10 check digit, validates a
 * GTIN-14, parses the human-readable GS1 application-identifier (AI) string into
 * UDI-DI + UDI-PI, and reports what's present for registration.
 *
 * HONESTY: the GS1 check-digit and AI parsing are exact algorithms (fully tested).
 * The HIBCC/ICCBBA carriers have their own structures (not parsed here — flagged).
 * Whether a given PI (lot vs serial) is required is device-specific; this reports
 * what is present and notes the registration system, not a compliance verdict.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/udi-validator
 */

export type IssuingAgency = 'gs1' | 'hibcc' | 'iccbba' | 'unknown';

/**
 * GS1 mod-10 check digit over a string of data digits (the check digit excluded).
 * From the rightmost data digit, weights alternate 3,1,3,1… The check digit makes
 * the weighted sum a multiple of 10.
 */
export function gs1CheckDigit(dataDigits: string): number {
  if (!/^\d+$/.test(dataDigits)) throw new Error('gs1CheckDigit expects digits only.');
  let sum = 0;
  for (let i = 0; i < dataDigits.length; i++) {
    const d = Number(dataDigits[dataDigits.length - 1 - i]);
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** Validate a 14-digit GTIN's check digit (the 14th digit). */
export function isValidGtin14(gtin: string): boolean {
  if (!/^\d{14}$/.test(gtin)) return false;
  return gs1CheckDigit(gtin.slice(0, 13)) === Number(gtin[13]);
}

/** Is a YYMMDD date string structurally valid (GS1 AI 11/17 format)? */
function isValidYYMMDD(s: string): boolean {
  if (!/^\d{6}$/.test(s)) return false;
  const mm = Number(s.slice(2, 4));
  const dd = Number(s.slice(4, 6));
  // GS1 allows DD = 00 (meaning end of month / unspecified day).
  return mm >= 1 && mm <= 12 && dd >= 0 && dd <= 31;
}

export interface ParsedUdi {
  issuingAgency: IssuingAgency;
  /** The UDI-DI (GS1 GTIN) when GS1. */
  udiDi?: string;
  /** True when the GTIN-14 check digit is valid. */
  udiDiValid?: boolean;
  productionIdentifiers: {
    manufactureDate?: string;
    expiryDate?: string;
    lot?: string;
    serial?: string;
  };
  /** AIs that were parsed but not interpreted. */
  otherAis: Array<{ ai: string; value: string }>;
  warnings: string[];
}

const KNOWN_AI: Record<string, keyof ParsedUdi['productionIdentifiers'] | 'gtin'> = {
  '01': 'gtin',
  '11': 'manufactureDate',
  '17': 'expiryDate',
  '10': 'lot',
  '21': 'serial',
};

/**
 * Parse the human-readable GS1 UDI carrier — the parenthesised AI form, e.g.
 * "(01)00844588003288(17)241231(10)LOT123(21)SER456". Deterministic.
 */
export function parseGs1Udi(udi: string): ParsedUdi {
  const result: ParsedUdi = { issuingAgency: 'gs1', productionIdentifiers: {}, otherAis: [], warnings: [] };
  const trimmed = (udi || '').trim();

  // Heuristic agency detection for non-GS1 carriers (HIBCC begins '+', ICCBBA '=').
  if (trimmed.startsWith('+')) {
    return { issuingAgency: 'hibcc', productionIdentifiers: {}, otherAis: [], warnings: ['HIBCC carrier — structure not parsed by this validator.'] };
  }
  if (trimmed.startsWith('=') || trimmed.startsWith('&')) {
    return { issuingAgency: 'iccbba', productionIdentifiers: {}, otherAis: [], warnings: ['ICCBBA carrier — structure not parsed by this validator.'] };
  }

  const matches = [...trimmed.matchAll(/\((\d{2,4})\)([^(]*)/g)];
  if (matches.length === 0) {
    result.issuingAgency = 'unknown';
    result.warnings.push('No GS1 application identifiers found (expected the parenthesised (AI)value form).');
    return result;
  }

  for (const m of matches) {
    const ai = m[1];
    const value = m[2].trim();
    const key = KNOWN_AI[ai];
    if (key === 'gtin') {
      result.udiDi = value;
      result.udiDiValid = isValidGtin14(value);
      if (!result.udiDiValid) result.warnings.push(`GTIN "${value}" is not a valid 14-digit GTIN (check digit / length).`);
    } else if (key) {
      result.productionIdentifiers[key] = value;
      if ((ai === '11' || ai === '17') && !isValidYYMMDD(value)) {
        result.warnings.push(`Date AI (${ai}) value "${value}" is not a valid YYMMDD date.`);
      }
    } else {
      result.otherAis.push({ ai, value });
    }
  }

  if (!result.udiDi) result.warnings.push('No UDI-DI (GS1 GTIN, AI 01) found — the UDI-DI is the mandatory device identifier.');
  return result;
}

export interface UdiValidation extends ParsedUdi {
  /** Registration systems this UDI feeds. */
  registration: { fda: string; eu: string };
  /** True when a UDI-DI is present and (for GS1) its check digit is valid. */
  udiDiOk: boolean;
}

/**
 * Validate a UDI and annotate the registration systems. Note: presence of specific
 * PIs (lot vs serial) is device-specific; this reports presence + validity.
 */
export function validateUdi(udi: string): UdiValidation {
  const parsed = parseGs1Udi(udi);
  return {
    ...parsed,
    udiDiOk: parsed.issuingAgency === 'gs1' ? parsed.udiDiValid === true : !!parsed.udiDi,
    registration: {
      fda: 'GUDID (FDA Global UDI Database) — submit the UDI-DI record',
      eu: 'EUDAMED — register the Basic UDI-DI and UDI-DI',
    },
  };
}

export default { gs1CheckDigit, isValidGtin14, parseGs1Udi, validateUdi };

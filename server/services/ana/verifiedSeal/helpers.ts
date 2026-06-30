/**
 * Pure helpers for E1 — Part 11 "verified-and-sealed" export.
 *
 * AnA's `verify_docx_against_source` step proves a generated document matches
 * the user's source. Today that verdict lives only in session memory. E1 turns
 * "verify against my source" into a GOVERNED action: when a document verifies
 * clean, the user can manifest a 21 CFR Part 11 e-signature against it and we
 * persist an immutable SealedRecord (SHA-256 content hash + provenance + audit).
 *
 * This module holds the deterministic, DB-free core so it is directly unit
 * testable: the §11.50 meaning enum (enforced SERVER-SIDE), the sample/draft
 * guard that blocks sealing placeholder content, content hashing, and the
 * SealedRecord assembler. The transactional persistence lives in
 * ../verifiedSealService.ts; the route in routes/ana-ri/utility.ts.
 *
 * Reuses the report-os SealedRecord shape (server/services/report-os/sealing)
 * so a sealed verified version is the same evidence primitive as a sealed
 * report.
 */

import { createHash } from 'node:crypto';

import type { SealedRecord } from '../../report-os/sealing/types';

/**
 * The three §11.50 signature meanings E1 admits for a verified-and-sealed
 * version. Deliberately the smaller AUTHOR | REVIEWER | APPROVER vocabulary the
 * brief specifies (not the full electronic_signatures purpose set), so the
 * sealing flow stays a focused governed action. Enforced server-side — a client
 * can never seal under an unrecognized meaning.
 */
export const SEAL_MEANINGS = ['AUTHOR', 'REVIEWER', 'APPROVER'] as const;
export type SealMeaning = (typeof SEAL_MEANINGS)[number];

/** Map the closed seal-meaning enum onto §11.50 signature purposes for the
 * manifestation block (lowercased, human-facing). */
const MEANING_TO_PURPOSE: Record<SealMeaning, string> = {
  AUTHOR: 'authorship',
  REVIEWER: 'review',
  APPROVER: 'approval',
};

/** Type guard: is `value` one of the admitted §11.50 seal meanings? Server-side
 * gate — reject anything else before any persistence happens. */
export function isSealMeaning(value: unknown): value is SealMeaning {
  return typeof value === 'string' && (SEAL_MEANINGS as readonly string[]).includes(value);
}

/** The §11.50 signature purpose string for a validated seal meaning. */
export function meaningToSignaturePurpose(meaning: SealMeaning): string {
  return MEANING_TO_PURPOSE[meaning];
}

/**
 * The manifestation a signer supplies when sealing a verified version. Mirrors
 * the three §11.50-required elements (printed name, date/time, meaning) plus the
 * free-text reason-for-change recorded verbatim to the audit trail.
 */
export interface SealManifestation {
  /** Printed name of the signer (§11.50(a)(1)). */
  printedName: string;
  /** ISO-8601 instant of signing (§11.50(a)(2)); server stamps the canonical value. */
  dateTimeUtc: string;
  /** Signature meaning (§11.50(a)(3)) — AUTHOR | REVIEWER | APPROVER. */
  meaning: SealMeaning;
  /** Reason-for-change, recorded verbatim to the audit trail (§11.10(e)). */
  reasonForChange: string;
}

/** Minimum meaningful reason-for-change length (trimmed). Matches the AnA
 * governed-action gate (part11-governance.ts). */
export const MIN_SEAL_REASON_LEN = 10;

/** Markers that betray placeholder / sample / draft content that must never be
 * sealed. Case-insensitive, checked against title + content. */
const SAMPLE_MARKERS: readonly string[] = [
  'lorem ipsum',
  '[sample]',
  '[placeholder]',
  '[draft]',
  'sample content',
  'placeholder text',
  'todo:',
  'tbd',
  'xxxxx',
];

/**
 * The content offered for sealing. `isSample`/`isDraft` are explicit signals the
 * caller may pass (e.g. an in-flight Document Studio draft that was never
 * promoted); when absent we fall back to scanning for placeholder markers.
 */
export interface SealableContent {
  title: string;
  content: string;
  /** Caller-asserted: this is sample/seed content, not a real document. */
  isSample?: boolean;
  /** Caller-asserted: this is an unpromoted in-flight draft. */
  isDraft?: boolean;
}

export interface SampleGuardResult {
  blocked: boolean;
  reason?: string;
}

/**
 * Pure, fail-closed guard: may this content be sealed? Blocks when the caller
 * flags it as sample/draft, when it is empty, or when it carries an obvious
 * placeholder marker. Sealing placeholder content would mint Part 11 evidence
 * for a document that does not exist — so we refuse it here, before the signer
 * is ever asked to sign.
 */
export function guardSampleContent(input: SealableContent): SampleGuardResult {
  if (input.isSample === true) {
    return { blocked: true, reason: 'Sample content cannot be sealed.' };
  }
  if (input.isDraft === true) {
    return { blocked: true, reason: 'An unpromoted draft cannot be sealed; promote it to a version first.' };
  }
  const content = typeof input.content === 'string' ? input.content : '';
  if (content.trim().length === 0) {
    return { blocked: true, reason: 'Empty content cannot be sealed.' };
  }
  const haystack = `${input.title ?? ''}\n${content}`.toLowerCase();
  for (const marker of SAMPLE_MARKERS) {
    if (haystack.includes(marker)) {
      return {
        blocked: true,
        reason: `Content looks like a placeholder (matched "${marker}") and cannot be sealed.`,
      };
    }
  }
  return { blocked: false };
}

/** Hex-encoded SHA-256 of the verified content. Same primitive used by
 * artifactWriteback and report-os sealing, so the hash is comparable across
 * surfaces. */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Assemble the immutable SealedRecord for a verified version. Reuses the
 * report-os `SealedRecord` shape. `aiDisclosed` is always true here: AnA
 * authored the document, so the seal must disclose AI involvement (§ AI
 * transparency). `atoms` carry optional provenance refs (e.g. the source the
 * document was verified against); empty is valid.
 */
export function buildVerifiedSealedRecord(args: {
  content: string;
  aiDisclosed?: boolean;
  atoms?: SealedRecord['atoms'];
  sealedAt?: string;
}): SealedRecord {
  const atoms = args.atoms ?? [];
  return {
    algorithm: 'sha256',
    contentHash: computeContentHash(args.content),
    atoms,
    atomCount: atoms.length,
    aiDisclosed: args.aiDisclosed ?? true,
    sealedAt: args.sealedAt ?? new Date().toISOString(),
  };
}

export interface SealManifestationInput {
  printedName?: unknown;
  meaning?: unknown;
  reasonForChange?: unknown;
}

export interface ValidatedManifestation {
  ok: boolean;
  /** Machine code for the client to branch on. */
  code?: 'MISSING_NAME' | 'INVALID_MEANING' | 'MISSING_REASON' | 'REASON_TOO_SHORT';
  error?: string;
  manifestation?: Omit<SealManifestation, 'dateTimeUtc'>;
}

/**
 * Pure, fail-closed validation of a client-supplied manifestation payload. The
 * meaning enum is enforced HERE (server-side): an unrecognized meaning is
 * rejected outright. `dateTimeUtc` is intentionally NOT taken from the client —
 * the service stamps the canonical signing instant — so it is not validated
 * here.
 */
export function validateSealManifestation(input: SealManifestationInput): ValidatedManifestation {
  const printedName = typeof input.printedName === 'string' ? input.printedName.trim() : '';
  if (printedName.length === 0) {
    return { ok: false, code: 'MISSING_NAME', error: 'A printed name is required to sign (§11.50).' };
  }
  if (!isSealMeaning(input.meaning)) {
    return {
      ok: false,
      code: 'INVALID_MEANING',
      error: `Signature meaning must be one of ${SEAL_MEANINGS.join(', ')} (§11.50).`,
    };
  }
  const reason = typeof input.reasonForChange === 'string' ? input.reasonForChange.trim() : '';
  if (reason.length === 0) {
    return { ok: false, code: 'MISSING_REASON', error: 'A reason for change is required (§11.10(e)).' };
  }
  if (reason.length < MIN_SEAL_REASON_LEN) {
    return {
      ok: false,
      code: 'REASON_TOO_SHORT',
      error: `The reason for change must be at least ${MIN_SEAL_REASON_LEN} characters.`,
    };
  }
  return {
    ok: true,
    manifestation: { printedName, meaning: input.meaning, reasonForChange: reason },
  };
}

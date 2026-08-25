/**
 * Pure core for 21 CFR Part 11 record sealing in Report-OS.
 *
 * Provides deterministic content hashing, provenance-atom extraction, sealed
 * record assembly, and tamper-evident verification. Uses only node's `crypto`;
 * no DB or IO.
 */

import { createHash } from 'crypto';

import type { RenderedReport } from '../render/types';
import type { ProvenanceAtom, SealedRecord } from './types';
import {
  CANON_VERSION_CURRENT,
  canonicalAsSealed,
  readCanonVersion,
} from '../../../../shared/versioned-digest.js';

/**
 * The version-1 canonicalizer, frozen.
 *
 * Every report sealed before `canonVersion` existed was hashed with exactly
 * this function, so it must keep reproducing that string. Its job is fidelity
 * to what was sealed, not correctness — do not "improve" it. New seals use
 * `shared/canonical-json.ts` via {@link canonicalizeReport}. Ledger L46.
 */
function legacyCanonicalizeV1(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => legacyCanonicalizeV1(item)).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys
    // Dead half: legacyCanonicalizeV1 never returns undefined, so the first
    // clause is always true. Preserved verbatim — a frozen serializer must
    // reproduce what it sealed, and simplifying it risks changing a digest.
    .filter((key) => legacyCanonicalizeV1(obj[key]) !== undefined && obj[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${legacyCanonicalizeV1(obj[key])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Canonicalize a rendered report deterministically, at a given seal generation.
 *
 * Defaults to the current generation, so a caller sealing a new report gets the
 * shared canonicalizer without having to know this parameter exists.
 *
 * A caller VERIFYING an existing seal must pass the generation that sealed it,
 * normalized through `readCanonVersion` FIRST. Passing `record.canonVersion`
 * straight through is a trap: a legacy record has no such field, the value is
 * `undefined`, and a default parameter fires on `undefined` — so the record
 * would be verified with the current serializer, which is precisely the failure
 * this mechanism exists to prevent. `verifySeal` below normalizes.
 */
export function canonicalizeReport(
  report: RenderedReport,
  canonVersion: unknown = CANON_VERSION_CURRENT,
): string {
  return canonicalAsSealed(report, canonVersion, legacyCanonicalizeV1);
}

/**
 * Compute the hex-encoded SHA-256 content hash of a rendered report, at a given
 * seal generation.
 */
export function computeContentHash(
  report: RenderedReport,
  canonVersion: unknown = CANON_VERSION_CURRENT,
): string {
  return createHash('sha256').update(canonicalizeReport(report, canonVersion)).digest('hex');
}

/**
 * Walk every section and block, flattening each block's `provenance` refs into
 * `ProvenanceAtom`s tagged with their `${sectionId}#${blockIndex}` location.
 * Blocks without provenance contribute nothing.
 */
export function extractProvenanceAtoms(report: RenderedReport): ProvenanceAtom[] {
  const atoms: ProvenanceAtom[] = [];

  for (const section of report.sections) {
    section.blocks.forEach((block, blockIndex) => {
      const provenance = (block as { provenance?: unknown }).provenance;
      if (!Array.isArray(provenance)) {
        return;
      }

      const blockPath = `${section.id}#${blockIndex}`;
      for (const ref of provenance) {
        atoms.push({
          blockPath,
          sourceTable: ref.sourceTable,
          sourceField: ref.sourceField,
          recordId: ref.recordId,
          transformation: ref.transformation,
          confidence: ref.confidence,
          auditId: ref.auditId,
        });
      }
    });
  }

  return atoms;
}

/**
 * True when the report contains AI-generated content that must be disclosed:
 * any `narrative` block flagged `aiGenerated: true`, or any `disclosure` block.
 */
export function reportIsAiDisclosed(report: RenderedReport): boolean {
  for (const section of report.sections) {
    for (const block of section.blocks) {
      if (block.kind === 'disclosure') {
        return true;
      }
      if (block.kind === 'narrative' && block.aiGenerated === true) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Assemble the immutable sealed-record payload for a rendered report.
 */
export function buildSealedRecord(report: RenderedReport, sealedAt?: string): SealedRecord {
  const atoms = extractProvenanceAtoms(report);
  return {
    algorithm: 'sha256',
    canonVersion: CANON_VERSION_CURRENT,
    contentHash: computeContentHash(report),
    atoms,
    atomCount: atoms.length,
    aiDisclosed: reportIsAiDisclosed(report),
    sealedAt: sealedAt ?? new Date().toISOString(),
  };
}

/**
 * Recompute the report's content hash and compare it against a sealed record.
 * Returns `ok: true` only when the hashes match; on mismatch the report has
 * been modified since sealing.
 */
export function verifySeal(
  report: RenderedReport,
  record: SealedRecord,
): { ok: boolean; reason?: string } {
  // Verify with the serializer that sealed this record, not the current one.
  // Normalized before the call: `undefined` would otherwise trigger the default
  // parameter and silently verify a legacy seal as if it were current.
  const contentHash = computeContentHash(report, readCanonVersion(record.canonVersion));
  if (contentHash !== record.contentHash) {
    return {
      ok: false,
      reason: 'content hash mismatch — report has been modified since sealing',
    };
  }
  return { ok: true };
}

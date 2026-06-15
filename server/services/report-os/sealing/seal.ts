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

/**
 * Recursively produce a stable JSON string for an arbitrary value: object keys
 * are sorted at every level so logically-equal values serialize identically
 * regardless of key insertion order. Array element order is preserved.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys
    // Mirror JSON.stringify: drop keys whose values serialize to undefined.
    .filter((key) => stableStringify(obj[key]) !== undefined && obj[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Canonicalize a rendered report into a deterministic JSON string with
 * recursively sorted object keys, so logically-equal reports canonicalize
 * (and therefore hash) identically regardless of key order.
 */
export function canonicalizeReport(report: RenderedReport): string {
  return stableStringify(report);
}

/**
 * Compute the hex-encoded SHA-256 content hash of a rendered report.
 */
export function computeContentHash(report: RenderedReport): string {
  return createHash('sha256').update(canonicalizeReport(report)).digest('hex');
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
  const contentHash = computeContentHash(report);
  if (contentHash !== record.contentHash) {
    return {
      ok: false,
      reason: 'content hash mismatch — report has been modified since sealing',
    };
  }
  return { ok: true };
}

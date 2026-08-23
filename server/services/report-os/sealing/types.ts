/**
 * Sealing types for Report-OS — the pure data model behind 21 CFR Part 11
 * record sealing.
 *
 * A sealed record is an immutable, tamper-evident summary of a rendered
 * report: a deterministic content hash, the flattened provenance atoms that
 * trace each value back to its source data, and an AI-disclosure flag. These
 * types carry no DB or IO concerns.
 */

/**
 * A single, flattened provenance reference pinned to its location in the
 * rendered report. One atom is emitted per `ProvenanceRef` carried by a block.
 */
export interface ProvenanceAtom {
  /** Location of the source block as `${sectionId}#${blockIndex}`. */
  blockPath: string;
  sourceTable: string;
  sourceField?: string;
  recordId?: string | number;
  transformation?: string;
  confidence?: number;
  auditId?: string;
}

/**
 * The immutable sealed-record payload for a rendered report.
 */
export interface SealedRecord {
  algorithm: 'sha256';
  /**
   * Which canonicalization produced `contentHash` — see
   * `shared/versioned-digest.ts`. Absent on records sealed before the field
   * existed; those verify under version 1, which is what makes this a
   * compatibility marker rather than a breaking change. `algorithm` records the
   * hash function and never recorded the serializer that fed it, which is the
   * gap ledger L46 is about.
   */
  canonVersion?: 1 | 2;
  /** Hex-encoded SHA-256 of the canonicalized report. */
  contentHash: string;
  atoms: ProvenanceAtom[];
  aiDisclosed: boolean;
  /** ISO-8601 timestamp the record was sealed at. */
  sealedAt: string;
  atomCount: number;
}

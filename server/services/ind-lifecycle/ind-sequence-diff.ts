/**
 * eCTD sequence diff (amendment review).
 *
 * Compares the leaves of two sequences (a prior and a current) and classifies
 * each section as added / replaced / unchanged / deleted — the view a reviewer
 * uses to see exactly what an amendment changed. Leaves are matched by
 * normalized section code; change is decided by checksum:
 *   - present in current only        → added
 *   - present in prior only          → deleted
 *   - both, equal checksums          → unchanged
 *   - both, differing checksums      → replaced
 *   - both, but a checksum is absent → replaced (conservative: cannot confirm
 *     the bytes are identical, so flag it for review)
 *
 * Pure / deterministic. Render it with renderSequenceDiffPdf.
 */

export interface DiffLeafLike {
  sectionCode: string;
  title: string;
  checksum?: string | null;
}

export type DiffChangeKind = 'added' | 'replaced' | 'unchanged' | 'deleted';

export interface SequenceDiffEntry {
  sectionCode: string;
  title: string;
  change: DiffChangeKind;
  priorChecksum: string | null;
  currentChecksum: string | null;
}

export interface SequenceDiff {
  priorSequenceNumber: string;
  currentSequenceNumber: string;
  entries: SequenceDiffEntry[];
  summary: {
    added: number;
    replaced: number;
    unchanged: number;
    deleted: number;
    total: number;
  };
}

/** Strip a leading "m" and lower-case so 'm2.5' and '2.5' key equally. */
function normalize(code: string): string {
  const c = code.trim().toLowerCase();
  return c.startsWith('m') ? c.slice(1) : c;
}

function toMap(leaves: DiffLeafLike[]): Map<string, DiffLeafLike> {
  const m = new Map<string, DiffLeafLike>();
  for (const l of leaves) m.set(normalize(l.sectionCode), l);
  return m;
}

/**
 * Diff a current sequence against a prior one. Entries are returned sorted by
 * section code; the summary counts each change kind.
 */
export function diffSequences(
  prior: { sequenceNumber: string; leaves: DiffLeafLike[] },
  current: { sequenceNumber: string; leaves: DiffLeafLike[] },
): SequenceDiff {
  const priorMap = toMap(prior.leaves);
  const currentMap = toMap(current.leaves);
  const entries: SequenceDiffEntry[] = [];

  // Added / changed / unchanged — iterate the current sequence.
  for (const [key, cur] of currentMap) {
    const prev = priorMap.get(key);
    if (!prev) {
      entries.push({ sectionCode: cur.sectionCode, title: cur.title, change: 'added', priorChecksum: null, currentChecksum: cur.checksum ?? null });
      continue;
    }
    const a = prev.checksum ?? null;
    const b = cur.checksum ?? null;
    const change: DiffChangeKind = a !== null && b !== null && a === b ? 'unchanged' : 'replaced';
    entries.push({ sectionCode: cur.sectionCode, title: cur.title, change, priorChecksum: a, currentChecksum: b });
  }

  // Deleted — in prior but not current.
  for (const [key, prev] of priorMap) {
    if (!currentMap.has(key)) {
      entries.push({ sectionCode: prev.sectionCode, title: prev.title, change: 'deleted', priorChecksum: prev.checksum ?? null, currentChecksum: null });
    }
  }

  entries.sort((a, b) => (a.sectionCode < b.sectionCode ? -1 : a.sectionCode > b.sectionCode ? 1 : 0));

  const summary = {
    added: entries.filter((e) => e.change === 'added').length,
    replaced: entries.filter((e) => e.change === 'replaced').length,
    unchanged: entries.filter((e) => e.change === 'unchanged').length,
    deleted: entries.filter((e) => e.change === 'deleted').length,
    total: entries.length,
  };

  return { priorSequenceNumber: prior.sequenceNumber, currentSequenceNumber: current.sequenceNumber, entries, summary };
}

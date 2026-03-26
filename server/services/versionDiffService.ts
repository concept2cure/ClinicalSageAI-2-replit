/**
 * Version Diff Service
 *
 * Provides line-by-line diff computation between document versions
 * using a simple LCS (Longest Common Subsequence) based algorithm.
 * Handles both plain text and JSON structured content.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiffChunk {
  type: 'add' | 'delete' | 'equal';
  content: string;
  lineStart: number;
}

export interface DiffResult {
  additions: number;
  deletions: number;
  changes: DiffChunk[];
}

export interface SectionDiffResult {
  sectionKey: string;
  sectionLabel?: string;
  diff: DiffResult;
}

// ---------------------------------------------------------------------------
// LCS-based diff algorithm
// ---------------------------------------------------------------------------

/**
 * Compute the LCS table for two arrays of lines.
 * Returns a 2-D table where lcs[i][j] = length of LCS of a[0..i-1] and b[0..j-1].
 */
function buildLcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  // Allocate (m+1) x (n+1) table initialised to 0
  const table: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1;
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
  }
  return table;
}

/**
 * Back-track through the LCS table to produce diff chunks.
 */
function backtrackDiff(table: number[][], a: string[], b: string[]): DiffChunk[] {
  const chunks: DiffChunk[] = [];
  let i = a.length;
  let j = b.length;

  // We collect in reverse then flip at the end.
  const raw: { type: 'add' | 'delete' | 'equal'; line: string; srcIdx: number }[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      raw.push({ type: 'equal', line: a[i - 1], srcIdx: i - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      raw.push({ type: 'add', line: b[j - 1], srcIdx: j - 1 });
      j--;
    } else {
      raw.push({ type: 'delete', line: a[i - 1], srcIdx: i - 1 });
      i--;
    }
  }

  raw.reverse();

  // Merge consecutive same-type entries into chunks
  let lineCounter = 1;
  for (const entry of raw) {
    const last = chunks[chunks.length - 1];
    if (last && last.type === entry.type) {
      last.content += '\n' + entry.line;
    } else {
      chunks.push({
        type: entry.type,
        content: entry.line,
        lineStart: lineCounter,
      });
    }
    lineCounter++;
  }

  return chunks;
}

/**
 * Compute a line-by-line diff between two strings.
 */
export function diffText(oldText: string, newText: string): DiffResult {
  const aLines = oldText === '' ? [] : oldText.split('\n');
  const bLines = newText === '' ? [] : newText.split('\n');

  const table = buildLcsTable(aLines, bLines);
  const changes = backtrackDiff(table, aLines, bLines);

  let additions = 0;
  let deletions = 0;
  for (const chunk of changes) {
    if (chunk.type === 'add') {
      additions += chunk.content.split('\n').length;
    } else if (chunk.type === 'delete') {
      deletions += chunk.content.split('\n').length;
    }
  }

  return { additions, deletions, changes };
}

// ---------------------------------------------------------------------------
// Structured (JSON) content diff
// ---------------------------------------------------------------------------

/**
 * Attempt to parse content as JSON. Returns null on failure.
 */
function tryParseJson(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * For structured JSON content, diff each top-level key separately so that
 * section-based documents produce per-section diffs.
 */
export function diffStructured(oldContent: string, newContent: string): SectionDiffResult[] {
  const oldObj = tryParseJson(oldContent);
  const newObj = tryParseJson(newContent);

  if (!oldObj || !newObj) {
    // Fallback: treat as plain text
    return [{ sectionKey: '_root', diff: diffText(oldContent, newContent) }];
  }

  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const results: SectionDiffResult[] = [];

  for (const key of allKeys) {
    const oldVal = oldObj[key] !== undefined ? stringify(oldObj[key]) : '';
    const newVal = newObj[key] !== undefined ? stringify(newObj[key]) : '';

    const diff = diffText(oldVal, newVal);

    // Only include sections that actually changed (or if caller wants all)
    results.push({ sectionKey: key, diff });
  }

  return results;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

// ---------------------------------------------------------------------------
// High-level API used by the route handler
// ---------------------------------------------------------------------------

import { db } from '../db';
import { documentVersions } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';

/**
 * List all versions of a document, with tenant isolation.
 */
export async function listVersions(documentId: number, organizationId: number) {
  // documentVersions table does not have organizationId directly, but the
  // parent document does. We join through documents to enforce tenant isolation.
  const { documents } = await import('../../shared/schema');

  const versions = await db
    .select({
      id: documentVersions.id,
      documentId: documentVersions.documentId,
      versionNumber: documentVersions.versionNumber,
      versionLabel: documentVersions.versionLabel,
      changeDescription: documentVersions.changeDescription,
      changeType: documentVersions.changeType,
      status: documentVersions.status,
      createdById: documentVersions.createdById,
      createdAt: documentVersions.createdAt,
    })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(
      and(eq(documentVersions.documentId, documentId), eq(documents.organizationId, organizationId))
    )
    .orderBy(desc(documentVersions.createdAt));

  return versions;
}

/**
 * Compare two versions of a document.
 * Returns a flat DiffResult for text content, or section-level diffs for JSON.
 */
export async function compareVersions(
  documentId: number,
  versionA: string,
  versionB: string,
  organizationId: number
): Promise<{ flat: DiffResult; sections: SectionDiffResult[] }> {
  const { documents } = await import('../../shared/schema');

  // Fetch both versions with tenant check
  const fetchVersion = async (versionNumber: string) => {
    const [row] = await db
      .select({
        id: documentVersions.id,
        versionNumber: documentVersions.versionNumber,
        content: documentVersions.content,
      })
      .from(documentVersions)
      .innerJoin(documents, eq(documents.id, documentVersions.documentId))
      .where(
        and(
          eq(documentVersions.documentId, documentId),
          eq(documentVersions.versionNumber, versionNumber),
          eq(documents.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!row) {
      throw new Error(`Version ${versionNumber} not found for document ${documentId}`);
    }
    return row;
  };

  const [verA, verB] = await Promise.all([fetchVersion(versionA), fetchVersion(versionB)]);

  const oldContent = verA.content || '';
  const newContent = verB.content || '';

  // Compute both flat and structured diffs
  const flat = diffText(oldContent, newContent);
  const sections = diffStructured(oldContent, newContent);

  return { flat, sections };
}

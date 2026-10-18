/** Explicit source selection shared by catalogue handoff, assembly and drafting. */
export const ASSEMBLY_SOURCE_LIMIT = 5;
export const ASSEMBLY_SOURCE_EXCERPT_LIMIT = 8000;
export type AssemblySourceSelector = (
  | { kind: 'data-room'; sourceId: number }
  | { kind: 'vault'; documentId: string }
) & { expectedChecksum?: string };
export interface AssemblySourceEntry {
  source: AssemblySourceSelector;
  title: string;
  contentHash: string;
  extractedTextSha256: string;
  version: string | null;
  originalFileAvailable: boolean | null;
  disposition: string | null;
  span: { start: number; end: number; totalChars: number; sha256: string };
}
export interface AssemblySourceManifest {
  version: 1;
  programId: string;
  fingerprint: string;
  entries: AssemblySourceEntry[];
  limitations: string[];
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
export function assemblySourceKey(source: AssemblySourceSelector): string {
  return source.kind === 'data-room' ? `data-room:${source.sourceId}` : `vault:${source.documentId.toLowerCase()}`;
}
function expectedChecksum(value: unknown): { expectedChecksum?: string } | null {
  if (value === undefined) return {};
  return typeof value === 'string' && HASH.test(value) ? { expectedChecksum: value.toLowerCase() } : null;
}
function sourceSelector(value: unknown): AssemblySourceSelector | null {
  const source = record(value);
  if (!source) return null;
  const checksum = expectedChecksum(source.expectedChecksum);
  if (!checksum) return null;
  if (source.kind === 'data-room' && Number.isSafeInteger(source.sourceId) && Number(source.sourceId) > 0) return { kind: 'data-room', sourceId: source.sourceId as number, ...checksum };
  if (source.kind === 'vault' && typeof source.documentId === 'string' && UUID.test(source.documentId)) return { kind: 'vault', documentId: source.documentId.toLowerCase(), ...checksum };
  return null;
}
/** No coercion, silent omission, duplicate identities or implicit newest-source defaults. */
export function readAssemblySourceSelectors(raw: unknown): AssemblySourceSelector[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > ASSEMBLY_SOURCE_LIMIT) return null;
  const out: AssemblySourceSelector[] = [];
  for (const value of raw) {
    const source = sourceSelector(value);
    if (!source) return null;
    out.push(source);
  }
  return new Set(out.map(assemblySourceKey)).size === out.length ? out : null;
}
const nullableText = (value: unknown): boolean => value === null || typeof value === 'string';
const digest = (value: unknown): boolean => typeof value === 'string' && HASH.test(value);
function entryFields(row: Record<string, unknown>): boolean {
  return typeof row.title === 'string' && digest(row.contentHash) && digest(row.extractedTextSha256)
    && nullableText(row.version) && nullableText(row.disposition)
    && (row.originalFileAvailable === null || typeof row.originalFileAvailable === 'boolean');
}
function sourceSpan(raw: unknown): AssemblySourceEntry['span'] | null {
  const span = record(raw);
  if (!span) return null;
  const { start, end, totalChars, sha256 } = span;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(totalChars)
    || Number(start) < 0 || Number(end) <= Number(start) || Number(end) > Number(totalChars)
    || Number(end) - Number(start) > ASSEMBLY_SOURCE_EXCERPT_LIMIT || typeof sha256 !== 'string' || !HASH.test(sha256)) return null;
  return { start: Number(start), end: Number(end), totalChars: Number(totalChars), sha256 };
}
function sourceEntry(raw: unknown): AssemblySourceEntry | null {
  const row = record(raw);
  if (!row || !entryFields(row)) return null;
  const source = sourceSelector(row.source); const span = sourceSpan(row.span);
  if (!source || !span) return null;
  return { source, title: row.title as string, contentHash: row.contentHash as string, extractedTextSha256: row.extractedTextSha256 as string,
    version: row.version as string | null, disposition: row.disposition as string | null,
    originalFileAvailable: row.originalFileAvailable as boolean | null, span };
}
/** A text-free receipt. The server alone reads and verifies the actual excerpt. */
export function readAssemblySourceManifest(raw: unknown): AssemblySourceManifest | null {
  const row = record(raw);
  if (!row || row.version !== 1 || typeof row.programId !== 'string' || !UUID.test(row.programId)
    || typeof row.fingerprint !== 'string' || !HASH.test(row.fingerprint) || !Array.isArray(row.entries)
    || row.entries.length === 0 || row.entries.length > ASSEMBLY_SOURCE_LIMIT || !Array.isArray(row.limitations)
    || !row.limitations.every(limit => typeof limit === 'string')) return null;
  const entries = row.entries.map(sourceEntry);
  if (entries.some(entry => !entry) || !readAssemblySourceSelectors(entries.map(entry => entry?.source))) return null;
  return { version: 1, programId: row.programId, fingerprint: row.fingerprint, entries: entries as AssemblySourceEntry[], limitations: [...row.limitations] };
}

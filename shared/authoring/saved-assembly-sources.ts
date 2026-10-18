/** Historical source intent, returned only after current server verification. */
import { readAssemblySourceManifest, type AssemblySourceManifest } from './assembly-sources';

export interface SavedAssemblySourceRecord {
  eventId: string;
  recordedAt: string;
  manifest: AssemblySourceManifest;
}
export interface SavedAssemblySources {
  version: 1;
  docId: string;
  programId: string;
  record: SavedAssemblySourceRecord | null;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
function readRecord(value: unknown, programId: string): SavedAssemblySourceRecord | null {
  const row = object(value);
  if (!row || !uuid(row.eventId) || typeof row.recordedAt !== 'string') return null;
  const time = Date.parse(row.recordedAt);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== row.recordedAt) return null;
  const manifest = readAssemblySourceManifest(row.manifest);
  if (!manifest || manifest.programId.toLowerCase() !== programId.toLowerCase()) return null;
  return { eventId: row.eventId, recordedAt: row.recordedAt, manifest };
}
/** Explicit null is an admitted empty history; malformed data is never empty. */
export function readSavedAssemblySources(value: unknown): SavedAssemblySources | null {
  const row = object(value);
  if (!row || row.version !== 1 || !uuid(row.docId) || !uuid(row.programId)) return null;
  const record = row.record === null ? null : readRecord(row.record, row.programId);
  if (row.record !== null && record === null) return null;
  return { version: 1, docId: row.docId, programId: row.programId, record };
}

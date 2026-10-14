import type { SourceCatalog } from './SourceCatalogLine';

export interface ProjectSourceRecord {
  id: number; title: string | null; extractionStatus: string | null;
  checksum?: string | null; isCurrent: boolean; dataEligible: boolean; originalFileAvailable: boolean;
  extractionMethod?: string | null; catalog?: SourceCatalog | null; snippet?: string | null;
  disposition?: 'keep_data' | 'remove_data' | 'supersede' | null;
}
export interface ProjectSourcePage<T extends ProjectSourceRecord = ProjectSourceRecord> {
  projectId: string; sources: T[]; total: number; currentTotal: number;
  page: { limit: number; offset: number }; window: { shown: number; truncated: boolean };
}
export interface SourcePageRequest { programId: string; limit: number; offset: number }
const INVALID_PAGE = 'The source catalogue could not be verified. Retry to read the current project sources.';
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, optional = false): boolean => value === null || typeof value === 'string' || (optional && value === undefined);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

function sourceRow(value: unknown): value is ProjectSourceRecord {
  const row = object(value);
  return Boolean(row && Number.isSafeInteger(row.id) && Number(row.id) > 0 && text(row.title) && text(row.extractionStatus)
    && text(row.checksum, true) && typeof row.isCurrent === 'boolean' && typeof row.dataEligible === 'boolean'
    && typeof row.originalFileAvailable === 'boolean' && text(row.extractionMethod, true) && text(row.snippet, true));
}
function validPageWindow(body: Record<string, unknown>, request: SourcePageRequest, length: number): boolean {
  const page = object(body.page);
  const window = object(body.window);
  if (!count(body.total) || !count(body.currentTotal) || body.currentTotal > body.total) return false;
  if (!page || page.limit !== request.limit || page.offset !== request.offset || length > request.limit) return false;
  if (!window || window.shown !== length || window.truncated !== (request.offset + length < body.total)) return false;
  return request.offset + length <= body.total && (length > 0 || request.offset >= body.total);
}

/** A page and its scope/counts are confirmed together; missing metadata is not completion. */
export function parseProjectSourcePage<T extends ProjectSourceRecord = ProjectSourceRecord>(body: unknown, request: SourcePageRequest):
  { ok: true; page: ProjectSourcePage<T> } | { ok: false; message: string } {
  const row = object(body);
  if (!row || row.success === false || row.projectId !== request.programId || !Array.isArray(row.sources)) return { ok: false, message: INVALID_PAGE };
  const sources = row.sources;
  if (!sources.every(sourceRow) || new Set(sources.map(source => source.id)).size !== sources.length || !validPageWindow(row, request, sources.length)) {
    return { ok: false, message: INVALID_PAGE };
  }
  return { ok: true, page: row as unknown as ProjectSourcePage<T> };
}

export function projectSourceCatalogUrl(programId: string, request: { limit: number; offset: number; query?: string }): string {
  const params = new URLSearchParams({ limit: String(request.limit), offset: String(request.offset) });
  if (request.query?.trim()) params.set('q', request.query.trim());
  return `/api/c2c/projects/${encodeURIComponent(programId)}/sources?${params}`;
}

/** File withdrawal may retain readable data; new grounding still requires current eligible text. */
export const sourceCitationEligible = (source: ProjectSourceRecord): boolean => source.isCurrent && source.dataEligible && source.extractionStatus === 'extracted';

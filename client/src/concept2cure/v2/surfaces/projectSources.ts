/**
 * The project's Data Room read (GET /api/c2c/projects/:id/sources): its row and
 * page shapes, the read's URL, and whether a source's text can ground a draft.
 *
 * Moved unchanged from ProjectHome.tsx on 2026-10-15, when the Respond tab
 * (FILING_SPINE F15) needed the same read to pick the agency's letter. One
 * read, two callers: the Data room and Respond.
 */
import type { ShapeGuard } from '../dataConnect';
import type { SourceCatalog } from '../editor/SourceCatalogLine';
import { sourceHasGroundingText } from '@shared/data-room-processing-status';

export interface SourceRow {
  textAvailable?: boolean | null;
  processing?: import('@shared/data-room-processing-status').DataRoomProcessingSummary | null;
  id: number;
  title: string | null;
  checksum: string | null;
  ingestionStatus: string | null;
  extractionStatus: string | null;
  createdAt: string | null;
  mimeType: string | null;
  fileSize: number | null;
  artifactId: string | null;
  origin: string | null;
  extractionMethod: string | null;
  /** False once a re-upload superseded it. Absent on a server that predates it. */
  isCurrent?: boolean;
  dataEligible?: boolean;
  originalFileAvailable?: boolean;
  disposition?: import('@shared/document-data-disposition').DocumentDispositionChoice | null;
  /** Recorded citations of this source. Absent on a server that predates it. */
  usage?: { sections: number; documents: number; changedSections: number } | null;
  /** Where a search matched in the text read from the file (ts_headline). Null outside a search. */
  snippet?: string | null;
  /** What the catalog found the source IS, by rule (S3). Absent on a server that predates it. */
  catalog?: SourceCatalog | null;
}

/** One page of the project's Data Room, as GET /:id/sources answers it. */
export interface SourcesPage {
  projectId?: string;
  sources: SourceRow[];
  /** Only an exact admitted read can attest a deliberate selection. */
  selection?: { scope: 'verified-accessible-sources'; sourceIds: number[] };
  /** Usage counts include only citations visible with the caller's current access. */
  usageScope?: 'accessible-citations';
  window?: { shown: number; truncated: boolean };
  /** Every source matching the read; currentTotal counts each re-uploaded file once. */
  total?: number;
  currentTotal?: number;
}

export const isSourcesPage: ShapeGuard<SourcesPage> = (value): value is SourcesPage => {
  if (!value || typeof value !== 'object') return false;
  const read = value as Partial<SourcesPage>;
  return Array.isArray(read.sources) && read.sources.every(row => row && typeof row.id === 'number' && typeof row.title === 'string') &&
    [read.total, read.currentTotal].every(count => count === undefined || (Number.isSafeInteger(count) && typeof count === 'number' && count >= 0));
};

/** How many sources one page of the Data Room shows. */
export const SOURCES_PAGE = 200;
/** The existing AnA exact-source admission ceiling, distinct from editor assembly. */
export const SELECTED_SOURCE_LIMIT = 20;

/** The Data Room read: a full-text search over what was read from each file, and its page. */
export function sourcesUrl(pid: string, term: string, offset: number): string {
  const params = new URLSearchParams();
  if (term) params.set('q', term);
  if (offset > 0) params.set('offset', String(offset));
  const qs = params.toString();
  return `/api/c2c/projects/${pid}/sources${qs ? `?${qs}` : ''}`;
}

export function selectedSourcesUrl(pid: string, sources: readonly SourceRow[]): string | null {
  if (!exactSourceIds(sources.map(source => source.id))) return null;
  return `/api/c2c/projects/${encodeURIComponent(pid)}/sources?sourceIds=${sources.map(source => source.id).join(',')}`;
}

function exactSourceIds(ids: unknown): ids is number[] {
  return Array.isArray(ids) && ids.length > 0 && ids.length <= SELECTED_SOURCE_LIMIT &&
    ids.every(id => Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647) && new Set(ids).size === ids.length;
}

function selectionMatchesProject(page: SourcesPage, pid: string, ids: number[]): boolean {
  const selection = page.selection;
  return page.projectId === pid && selection?.scope === 'verified-accessible-sources' &&
    exactSourceIds(selection.sourceIds) && selection.sourceIds.length === ids.length &&
    selection.sourceIds.every(id => ids.includes(id));
}

/** Match the whole admitted set and the versions actually checked. A newer
 * checksum, missing row or partial accessible set never substitutes a choice. */
export function verifiedSourceSelection(value: unknown, pid: string, checked: readonly SourceRow[]): SourceRow[] | null {
  if (!isSourcesPage(value)) return null;
  const ids = checked.map(source => source.id);
  if (!exactSourceIds(ids) || !selectionMatchesProject(value, pid, ids) || value.sources.length !== ids.length) return null;
  const rows = new Map(value.sources.map(source => [source.id, source]));
  if (rows.size !== ids.length) return null;
  const ordered: SourceRow[] = [];
  for (const source of checked) {
    const current = rows.get(source.id);
    if (typeof source.checksum !== 'string' || !source.checksum.trim() || !current || current.checksum !== source.checksum || !sourceCanGround(current)) return null;
    ordered.push(current);
  }
  return ordered;
}

/** Whether this source's text is available to draft from: persisted text and recorded processing state. */
export function sourceCanGround(s: SourceRow): boolean {
  return sourceHasGroundingText(s);
}

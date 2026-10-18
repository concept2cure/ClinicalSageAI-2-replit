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
  sources: SourceRow[];
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

/** The Data Room read: a full-text search over what was read from each file, and its page. */
export function sourcesUrl(pid: string, term: string, offset: number): string {
  const params = new URLSearchParams();
  if (term) params.set('q', term);
  if (offset > 0) params.set('offset', String(offset));
  const qs = params.toString();
  return `/api/c2c/projects/${pid}/sources${qs ? `?${qs}` : ''}`;
}

/** Whether this source's text is available to draft from: persisted text and recorded processing state. */
export function sourceCanGround(s: SourceRow): boolean {
  return sourceHasGroundingText(s);
}

/**
 * Data Origins API client.
 *
 * @module client/src/concept2cure/lineage/dataOriginsApi
 */

import { serverMessage } from '@/lib/queryClient';
import { getAuthHeaders } from '../../utils/authToken';
import { downloadBlob } from '../v2/download';

export type SpanProvenanceKind =
  | 'cre_evidence_source'
  | 'author_assertion'
  | 'accepted_machine_draft'
  /** Drafted by a machine author; no person has accepted it. assertedBy is null. */
  | 'machine_draft';
export type SpanState = 'current' | 'changed' | 'unverified' | 'unresolved';

export interface OriginRow {
  id: string;
  documentTable: string;
  documentId: string;
  charStart: number;
  charEnd: number;
  provenanceKind: SpanProvenanceKind;
  referenceId: string | null;
  payloadSha256: string | null;
  sourceLocator: string | null;
  /** For an author assertion, the author; for an accepted machine draft, the
   *  human who accepted the machine's words. */
  assertedBy: string | null;
  assertedAt: string | null;
  /** Set for accepted_machine_draft: the machine author, and its display name
   *  as the server names it. */
  machineAuthorId?: string | null;
  machineAuthorName?: string | null;
  usage: string;
  confidence: number | null;
  state?: SpanState;
  sourceTitle?: string | null;
}

export interface DataOriginsReport {
  documentTable: string;
  documentId: string;
  selection: { charStart: number; charEnd: number; text?: string };
  origins: OriginRow[];
  uncovered: Array<{ charStart: number; charEnd: number }>;
  coveragePercent: number;
  counts: {
    total: number;
    fromSources: number;
    authorAsserted: number;
    machineDrafted?: number;
    machineDraftedUnaccepted?: number;
    stale: number;
  };
  generatedAt: string;
}

export interface SelectionQuery {
  documentTable: string;
  documentId: string;
  charStart: number;
  charEnd: number;
  selectionText?: string;
  documentTitle?: string;
}

export async function fetchDataOrigins(q: SelectionQuery): Promise<DataOriginsReport> {
  const res = await fetch('/api/data-origins/selection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(q),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(serverMessage(body) || `Data origins request failed (${res.status})`);
  }
  const body = await res.json();
  return body.report as DataOriginsReport;
}

/**
 * Download the report as a PDF.
 *
 * The blob is fetched rather than linked because the endpoint is a POST — the
 * selected text belongs in a body, not in a URL where it would reach access
 * logs and browser history.
 */
export async function downloadDataOriginsPdf(q: SelectionQuery): Promise<void> {
  const res = await fetch('/api/data-origins/selection.pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(q),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(serverMessage(body) || `PDF export failed (${res.status})`);
  }

  /* This site was the only one of seven that knew revoking immediately can
     cancel the download — it deferred by a frame and said why. That knowledge
     now lives in `downloadBlob` (which defers by a second, well past the
     hand-off) instead of in a comment six other copies never read. */
  downloadBlob(
    `data-origins-${q.documentId}-${q.charStart}-${q.charEnd}.pdf`,
    await res.blob(),
  );
}

/**
 * How much of a whole document has a recorded origin, and of what kind.
 *
 * Deliberately NOT the selection report over [0, length): that report's
 * `coveragePercent` counts characters carrying ANY lineage — an author
 * assertion exactly like a citation — which is right for a selection and false
 * as a document-level claim that text traces to a source. These figures are
 * characters, partitioned by kind, and the four parts sum to `attributedChars`.
 */
export interface DocumentAttributionSummary {
  documentTable: string;
  documentId: string;
  contentLength: number;
  attributedChars: number;
  unattributedChars: number;
  byKind: {
    fromSources: number;
    authorAsserted: number;
    machineDrafted: number;
    machineDraftedUnaccepted: number;
  };
  /** Subset of byKind.fromSources whose source changed after it was cited. */
  staleChars: number;
  /**
   * The spans themselves, clipped to the current text and in document order,
   * for painting attribution over the words (useAttributionHighlights). A
   * projection of the rows, not the rows: no checksums, no actor ids.
   */
  spans: Array<{
    charStart: number;
    charEnd: number;
    provenanceKind: string;
    usage: string;
    sourceTitle: string | null;
    stale: boolean;
  }>;
  generatedAt: string;
}

/** Raised when the route refuses to answer for this document table at all. */
export class AttributionUnsupportedError extends Error {}

/**
 * GET, not POST: only identifiers travel, so there is no document text to keep
 * out of a URL. The content length is NOT sent — the server reads it, because
 * whoever supplies the denominator of a coverage figure controls the figure.
 */
export async function fetchDocumentAttribution(q: {
  documentTable: string;
  documentId: string;
}): Promise<DocumentAttributionSummary> {
  const params = new URLSearchParams({
    documentTable: q.documentTable,
    documentId: q.documentId,
  });
  const res = await fetch(`/api/data-origins/document?${params.toString()}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = serverMessage(body) || `Attribution request failed (${res.status})`;
    // A refusal is not a failure to be retried — it is an answer the surface
    // should render as "not available here" rather than as an error.
    if ((body as any)?.error?.code === 'UNSUPPORTED_DOCUMENT_TABLE') {
      throw new AttributionUnsupportedError(message);
    }
    throw new Error(message);
  }
  const body = await res.json();
  return body.summary as DocumentAttributionSummary;
}

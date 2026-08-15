/**
 * Data Origins API client.
 *
 * @module client/src/concept2cure/lineage/dataOriginsApi
 */

import { serverMessage } from '@/lib/queryClient';
import { getAuthHeaders } from '../../utils/authToken';

export type SpanProvenanceKind = 'cre_evidence_source' | 'author_assertion';
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
  assertedBy: string | null;
  assertedAt: string | null;
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
  counts: { total: number; fromSources: number; authorAsserted: number; stale: number };
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

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `data-origins-${q.documentId}-${q.charStart}-${q.charEnd}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers; one frame is
  // enough for the click to have been handed off.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

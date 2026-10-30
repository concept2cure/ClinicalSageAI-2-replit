/**
 * §14.3.3 in an Authoring copy of a saved CSR, held by reference (2026-10-30,
 * docs/evidence/D2-CSR/2026-10-30-cdisc-pilot-e2e, "§14.3.3 by reference").
 *
 * The import (server/services/authoring/workflow-source-import.ts) does not
 * copy the patient narratives into the document: they are engine output in
 * the build's narrative store. The section holds the landed opening, shown
 * read-only by the editor, and its origin holds the reference
 * (shared/csr-narrative-reference.ts): the build, the number of narratives and
 * the store's digest. This view reads the narratives from the store a page at
 * a time (GET /api/csr/jobs/:jobId/narratives/text, each checked by the
 * database against its recorded SHA-256) and the per-subject QC list the build
 * board shows (CsrBuildProgress.tsx NarrativeQcList). A narrative is changed by
 * running the narratives again on the build board and importing again; the
 * import's fingerprint covers the store's digest, so an edited store no longer
 * verifies.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { isWorkflowImportOrigin } from '@shared/authoring/source-import';
import { parseCsrNarrativeReference, type CsrNarrativeReference } from '@shared/csr-narrative-reference';
import { apiCall, apiErrorText } from '../apiCall';
import { NarrativeQcList, type CsrNarrativeQcRow } from '../surfaces/CsrBuildProgress';
import type { DocumentProvenance } from './provenance';

const PAGE = 20;

/** The narrative reference of this section of an imported CSR, or null when the section holds its own text. */
export function narrativeReferenceFor(source: DocumentProvenance['importSource'] | undefined, code: string | null | undefined): CsrNarrativeReference | null {
  if (!source || !code || !isWorkflowImportOrigin(source) || source.kind !== 'csr') return null;
  const origin = source.sectionOrigins.find(o => o.code === code);
  return origin?.narrativeReference ? parseCsrNarrativeReference(origin.narrativeReference) : null;
}

interface StoredNarrative {
  subjectId: string; sequence: number; armName: string; events: string[]; categories: string[];
  text: string; contentHash: string | null; verified: boolean;
}
interface NarrativePage { narratives: StoredNarrative[]; next: { sequence: number; subjectId: string } | null }
type Cursor = { sequence: number; subjectId: string } | null;

const pageUrl = (jobId: number, after: Cursor) => `/api/csr/jobs/${jobId}/narratives/text?limit=${PAGE}`
  + (after ? `&afterSequence=${after.sequence}&afterSubject=${encodeURIComponent(after.subjectId)}` : '');

/** The store's narratives, a page at a time; `cursors` are the starts of the pages already read, so Previous goes back exactly. */
function useNarrativePages(jobId: number) {
  const [cursors, setCursors] = useState<Cursor[]>([null]);
  const [page, setPage] = useState<NarrativePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const at = cursors[cursors.length - 1];
  useEffect(() => {
    let live = true;
    setPage(null); setError(null);
    void apiCall<NarrativePage>('GET', pageUrl(jobId, at)).then(result => {
      if (!live) return;
      if (result.ok && Array.isArray(result.body?.narratives)) setPage(result.body!);
      else setError(apiErrorText(result, 'The stored narratives could not be read.'));
    });
    return () => { live = false; };
  }, [jobId, at]);
  const next = useCallback(() => { if (page?.next) setCursors(c => [...c, page.next]); }, [page]);
  const previous = useCallback(() => setCursors(c => (c.length > 1 ? c.slice(0, -1) : c)), []);
  return { page, error, index: cursors.length - 1, next, previous };
}

function Narrative({ n }: { n: StoredNarrative }) {
  return <li style={{ padding: '6px 0' }}>
    <strong>Subject {n.subjectId} ({n.armName}): {n.events.join('; ')}</strong>
    {!n.verified && <p role="alert">This stored narrative does not match its recorded SHA-256. It cannot be filed; run the narratives again.</p>}
    {n.text.split(/\n{2,}/).map((p, i) => <p key={i} style={{ whiteSpace: 'pre-wrap' }}>{p}</p>)}
  </li>;
}

/** The QC list, read when it is opened: a large build has thousands of subjects. */
function QcList({ jobId }: { jobId: number }) {
  const [rows, setRows] = useState<CsrNarrativeQcRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (rows) return;
    const result = await apiCall<{ subjects?: CsrNarrativeQcRow[] }>('GET', `/api/csr/jobs/${jobId}/narratives`);
    if (result.ok && Array.isArray(result.body?.subjects)) setRows(result.body!.subjects!);
    else setError(apiErrorText(result, 'The narrative QC list could not be read.'));
  }, [jobId, rows]);
  return <details onToggle={e => { if ((e.currentTarget as { open?: boolean }).open) void load(); }}>
    <summary>Narrative QC list</summary>
    {error && <p role="alert">{error}</p>}
    {rows && (rows.length ? <NarrativeQcList rows={rows} /> : <p>No narratives have been composed for this build.</p>)}
  </details>;
}

/** §14.3.3 by reference: what the section is, the stored narratives a page at a time, and the QC list. Nothing here edits. */
export function CsrNarrativeReferenceView({ reference }: { reference: CsrNarrativeReference }) {
  const { page, error, index, next, previous } = useNarrativePages(reference.jobId);
  const from = index * PAGE + 1;
  return <section aria-label="Section 14.3.3 narratives, held by reference" data-testid="csr-narrative-reference" className="ed-provline">
    <p><strong>{reference.narratives} patient narratives</strong> are held in the narrative store of CSR build {reference.jobId}, not copied into this document.
      This section shows the opening only and is read-only here. To change a narrative, run the narratives again on the build board, then import again.</p>
    <p className="de-desc">Store SHA-256: <span className="source-import-hash">{reference.storeDigest}</span> · landed §14.3.3 SHA-256: <span className="source-import-hash">{reference.landedSha256}</span></p>
    {error && <p role="alert">{error}</p>}
    {!error && !page && <p role="status">Reading the stored narratives.</p>}
    {page && <>
      <p>Narratives {page.narratives.length ? `${from}–${from + page.narratives.length - 1}` : 'none'} of {reference.narratives}</p>
      <ol aria-label="Stored narratives" start={from} style={{ paddingLeft: 20 }}>{page.narratives.map(n => <Narrative key={n.subjectId} n={n} />)}</ol>
    </>}
    <div className="rl-pagination" role="group" aria-label="Narrative pages">
      <button type="button" className="btn ghost" disabled={index === 0} onClick={previous}>Previous</button>
      <span>Page {index + 1}</span>
      <button type="button" className="btn ghost" disabled={!page?.next} onClick={next}>Next</button>
    </div>
    <QcList jobId={reference.jobId} />
  </section>;
}

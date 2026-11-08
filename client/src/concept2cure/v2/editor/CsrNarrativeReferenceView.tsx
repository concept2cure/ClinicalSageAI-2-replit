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
type Cursor = { sequence: number; subjectId: string; landedOffset: number; proof: string } | null;
interface NarrativePage { narratives: StoredNarrative[]; next: Cursor; storeDigest?: string; landedSha256?: string }

const pageUrl = (jobId: number, storeDigest: string, landedSha256: string, after: Cursor, qc = false) =>
  `/api/csr/jobs/${jobId}/narratives${qc ? '' : '/text'}?limit=${PAGE}&expectedStoreDigest=${storeDigest}&expectedLandedSha256=${landedSha256}`
  + (after ? `&afterSequence=${after.sequence}&afterSubject=${encodeURIComponent(after.subjectId)}&afterLandedOffset=${after.landedOffset}&afterProof=${encodeURIComponent(after.proof)}` : '');

/** The store's narratives, a page at a time; `cursors` are the starts of the pages already read, so Previous goes back exactly. */
function useNarrativePages(jobId: number, storeDigest: string, landedSha256: string) {
  const [cursors, setCursors] = useState<Cursor[]>([null]);
  const [read, setRead] = useState<{ at: Cursor; page: NarrativePage } | null>(null);
  const [failure, setFailure] = useState<{ at: Cursor; message: string } | null>(null);
  const at = cursors[cursors.length - 1];
  const page = read && read.at === at ? read.page : null;
  const error = failure && failure.at === at ? failure.message : null;
  useEffect(() => {
    let live = true;
    setRead(null); setFailure(null);
    void apiCall<NarrativePage>('GET', pageUrl(jobId, storeDigest, landedSha256, at)).then(result => {
      if (!live) return;
      if (result.ok && Array.isArray(result.body?.narratives) && result.body.storeDigest === storeDigest && result.body.landedSha256 === landedSha256) {
        setRead({ at, page: result.body });
      } else setFailure({ at, message: apiErrorText(result, 'The imported narrative store version could not be verified. Reimport this section before reading its narratives.') });
    });
    return () => { live = false; };
  }, [jobId, storeDigest, landedSha256, at]);
  const next = useCallback(() => { if (page?.next) setCursors(c => [...c, page.next]); }, [page]);
  const previous = useCallback(() => setCursors(c => (c.length > 1 ? c.slice(0, -1) : c)), []);
  return { page, error, at, index: cursors.length - 1, next, previous };
}

function Narrative({ n }: { n: StoredNarrative }) {
  return <li style={{ padding: '6px 0' }}>
    <strong>Subject {n.subjectId} ({n.armName}): {n.events.join('; ')}</strong>
    {!n.verified && <p role="alert">This stored narrative does not match its recorded SHA-256. It cannot be filed; run the narratives again.</p>}
    {n.text.split(/\n{2,}/).map((p, i) => <p key={i} style={{ whiteSpace: 'pre-wrap' }}>{p}</p>)}
  </li>;
}

/** The QC list, read when it is opened: a large build has thousands of subjects. */
function QcList({ jobId, storeDigest, landedSha256, at }: { jobId: number; storeDigest: string; landedSha256: string; at: Cursor }) {
  const [rows, setRows] = useState<CsrNarrativeQcRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (rows) return;
    const result = await apiCall<{ subjects?: CsrNarrativeQcRow[]; storeDigest?: string; landedSha256?: string }>('GET', pageUrl(jobId, storeDigest, landedSha256, at, true));
    if (result.ok && Array.isArray(result.body?.subjects) && result.body.storeDigest === storeDigest && result.body.landedSha256 === landedSha256) {
      setRows(result.body.subjects); setError(null);
    }
    else setError(apiErrorText(result, 'The imported narrative QC version could not be verified. Reimport this section before reading its QC.'));
  }, [jobId, storeDigest, landedSha256, at, rows]);
  return <details onToggle={e => { if ((e.currentTarget as { open?: boolean }).open) void load(); }}>
    <summary>Narrative QC list for this page</summary>
    {error && <p role="alert">{error}</p>}
    {rows && (rows.length ? <NarrativeQcList rows={rows} /> : <p>No narratives have been composed for this build.</p>)}
  </details>;
}

/** §14.3.3 by reference: what the section is, the stored narratives a page at a time, and the QC list. Nothing here edits. */
function NarrativeReferenceContent({ reference }: { reference: CsrNarrativeReference }) {
  const { page, error, at, index, next, previous } = useNarrativePages(reference.jobId, reference.storeDigest, reference.landedSha256);
  const from = index * PAGE + 1;
  const qcVisit = at ? `${at.sequence}:${at.subjectId}:${at.landedOffset}:${at.proof}` : 'first';
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
    <QcList key={qcVisit} jobId={reference.jobId} storeDigest={reference.storeDigest} landedSha256={reference.landedSha256} at={at} />
  </section>;
}

/** A replaced import starts a new visit, including its page cursor and lazy QC. */
export function CsrNarrativeReferenceView({ reference }: { reference: CsrNarrativeReference }) {
  const identity = `${reference.jobId}:${reference.storeDigest}:${reference.landedSha256}:${reference.openingSha256}:${reference.narratives}`;
  return <NarrativeReferenceContent key={identity} reference={reference} />;
}

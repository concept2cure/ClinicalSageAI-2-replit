/**
 * Sequence QC in Submission Center's eCTD view (P-122, 2026-11-10): what changed against the previous sequence of
 * the same submission, leaf by leaf, and the package manifest, every leaf by CTD module with its checksum. Every
 * publisher does this check before dispatch.
 *
 * Both were built on the server and never called (CLAUDE.md Rule 3 names them):
 *   GET /api/ind-lifecycle/sequence/:id/diff?priorId=…   (+ /pdf)   ind-sequence-diff.ts diffSequences
 *   GET /api/ind-lifecycle/sequence/:id/manifest          (+ /pdf)   ind-package-manifest.ts buildPackageManifest
 * Production serves exactly those (the `ectd-compile` claim in ui-surface-registry.ts), and each admits the
 * sequence's project for the person first. The verdicts are the server's; this only shows them.
 *
 * The project's sequences come from Submission Center's own reads (GET /api/submissions?programId=…, then each
 * submission's /sequences). The sequence shown is the one the eCTD view was opened on, else the latest; the
 * comparison is with the sequence before it in the same submission. A first sequence says it has nothing earlier,
 * and a read that fails says so: neither is shown as "no changes".
 *
 * @module client/src/concept2cure/v2/surfaces/EctdSequenceQc
 */
import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { I } from '../icons';
import { liveGetOrNull, unwrapList, useLiveData, useLiveRows } from '../dataConnect';
import { downloadBlob } from '../download';
import { programSubmissionsPath } from './programSequence';

interface Seq { id: number; sequenceNumber: string; submissionId: number; submissionTitle: string }
interface DiffEntry { sectionCode: string; title: string; change: 'added' | 'replaced' | 'unchanged' | 'deleted' }
interface SequenceDiff {
  priorSequenceNumber: string; currentSequenceNumber: string; entries: DiffEntry[];
  summary: { added: number; replaced: number; unchanged: number; deleted: number; total: number };
}
interface ManifestLeaf { sectionCode: string; title: string; lifecycleOp: string; checksum: string | null }
interface PackageManifest {
  sequenceNumber: string; modules: Array<{ module: string; label: string; leaves: ManifestLeaf[] }>;
  totalLeaves: number; missingChecksums: number;
}

const isDiff = (v: unknown): v is SequenceDiff => !!v && Array.isArray((v as SequenceDiff).entries) && !!(v as SequenceDiff).summary;
const isManifest = (v: unknown): v is PackageManifest => !!v && Array.isArray((v as PackageManifest).modules);
/* The engine's verdicts (ind-sequence-diff.ts), in words that stay true: a leaf only in the earlier sequence was not
   deleted from the dossier (a delete is its own lifecycle operation), and "replaced" includes a leaf whose bytes
   cannot be compared because a checksum is missing. */
const CHANGE: Record<DiffEntry['change'], (prior: string) => string> = {
  added: () => 'Added',
  replaced: () => 'Changed, or no checksum to compare',
  deleted: (prior) => `Only in sequence ${prior}`,
  unchanged: () => 'Unchanged',
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The project's sequences, each with its submission, read from Submission Center's routes. */
function useProjectSequences(programId: string | null): { rows: Seq[]; state: 'reading' | 'failed' | 'ready' } {
  const subs = useLiveRows<{ id: number; title: string }>(programId ? programSubmissionsPath(programId) : null);
  const [read, setRead] = useState<{ rows: Seq[]; state: 'reading' | 'failed' | 'ready' }>({ rows: [], state: 'reading' });
  /* The submissions as a value, so a re-render that returns the same list does not read their sequences again. */
  const listed = JSON.stringify(subs.rows.map((s) => [s.id, s.title]));
  useEffect(() => {
    if (subs.loading) return;
    if (subs.error) { setRead({ rows: [], state: 'failed' }); return; }
    let live = true;
    const submissions = (JSON.parse(listed) as Array<[number, string]>).map(([id, title]) => ({ id, title }));
    void Promise.all(submissions.map(async (s) => {
      const r = await liveGetOrNull<unknown>(`/api/submissions/${s.id}/sequences`);
      if (r.error || r.data == null) throw new Error('sequences');
      const list = unwrapList(r.data);
      return (Array.isArray(list) ? list : []).map((q: { id: number; sequenceNumber: string }) => ({
        id: q.id, sequenceNumber: q.sequenceNumber, submissionId: s.id, submissionTitle: s.title,
      }));
    })).then((all) => { if (live) setRead({ rows: all.flat(), state: 'ready' }); })
      .catch(() => { if (live) setRead({ rows: [], state: 'failed' }); });
    return () => { live = false; };
  }, [listed, subs.loading, subs.error]);
  return programId ? read : { rows: [], state: 'ready' };
}

async function downloadPdf(path: string, filename: string, onError: (m: string) => void) {
  try {
    const res = await apiRequest('GET', path);
    if (!res.ok) { onError(`The PDF could not be made (HTTP ${res.status}).`); return; }
    downloadBlob(filename, await res.blob());
  } catch {
    onError('The PDF could not be made.');
  }
}

function DiffBlock({ seq, prior, onPdfError }: { seq: Seq; prior: Seq | null; onPdfError: (m: string) => void }) {
  const path = prior ? `/api/ind-lifecycle/sequence/${seq.id}/diff?priorId=${prior.id}` : null;
  const d = useLiveData<SequenceDiff>(path, [path], isDiff);
  if (!prior) {
    return <p className="sec-sub">Sequence {seq.sequenceNumber} is the first of this submission, so there is nothing earlier to compare it with.</p>;
  }
  if (d.loading && !d.data) return <p role="status" className="sec-sub">Comparing with sequence {prior.sequenceNumber}…</p>;
  if (d.error || !d.data) return <p role="alert" className="sec-sub">The comparison with sequence {prior.sequenceNumber} could not be read.</p>;
  const { summary, entries } = d.data;
  const changed = entries.filter((e) => e.change !== 'unchanged');
  return (
    <div data-testid="ec-qc-diff">
      <div className="pj-sec-h">
        <h3>What changed since sequence {prior.sequenceNumber}</h3>
        <span className="pj-sec-acts">
          <button type="button" className="btn small" onClick={() => void downloadPdf(`${path!.replace('/diff?', '/diff/pdf?')}`, `sequence-${seq.sequenceNumber}-changes.pdf`, onPdfError)}>
            {I.download} Comparison (PDF)
          </button>
        </span>
      </div>
      <p className="sec-sub">
        {plural(summary.added, 'leaf added', 'leaves added')}, {summary.replaced} changed or not comparable,
        {' '}{summary.deleted} only in sequence {prior.sequenceNumber}, {summary.unchanged} unchanged.
      </p>
      {changed.length > 0 && (
        <div className="ec-qc-scroll" style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table className="reg-tbl">
            <thead><tr><th scope="col">Section</th><th scope="col">Leaf</th><th scope="col">Change</th></tr></thead>
            <tbody>
              {changed.map((e) => (
                <tr key={`${e.sectionCode}:${e.change}`}><td className="mono">{e.sectionCode}</td><td>{e.title}</td><td>{CHANGE[e.change](prior.sequenceNumber)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ManifestBlock({ seq, onPdfError }: { seq: Seq; onPdfError: (m: string) => void }) {
  const path = `/api/ind-lifecycle/sequence/${seq.id}/manifest`;
  const m = useLiveData<PackageManifest>(path, [path], isManifest);
  if (m.loading && !m.data) return <p role="status" className="sec-sub">Reading the package manifest…</p>;
  if (m.error || !m.data) return <p role="alert" className="sec-sub">The package manifest could not be read.</p>;
  const man = m.data;
  return (
    <div data-testid="ec-qc-manifest">
      <div className="pj-sec-h">
        <h3>Package manifest</h3>
        <span className="pj-sec-acts">
          <button type="button" className="btn small" onClick={() => void downloadPdf(`${path}/pdf`, `sequence-${seq.sequenceNumber}-manifest.pdf`, onPdfError)}>
            {I.download} Manifest (PDF)
          </button>
        </span>
      </div>
      <p className="sec-sub">
        {plural(man.totalLeaves, 'leaf', 'leaves')}
        {man.missingChecksums > 0 ? `; ${plural(man.missingChecksums, 'has', 'have')} no checksum yet, so its file is not attached.` : ', each with its checksum.'}
      </p>
      {man.modules.map((mod) => (
        <div key={mod.module} className="ec-qc-scroll" style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table className="reg-tbl" aria-label={mod.label}>
            <caption className="sec-sub" style={{ textAlign: 'left' }}>{mod.label}</caption>
            <thead><tr><th scope="col">Section</th><th scope="col">Leaf</th><th scope="col">Operation</th><th scope="col">SHA-256</th></tr></thead>
            <tbody>
              {mod.leaves.map((l, i) => (
                <tr key={`${l.sectionCode}:${i}`}>
                  <td className="mono">{l.sectionCode}</td><td>{l.title}</td><td>{l.lifecycleOp}</td>
                  <td className="mono" title={l.checksum ?? undefined}>{l.checksum ? `${l.checksum.slice(0, 12)}…` : 'none yet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function EctdSequenceQc({ programId, openedSequence }: { programId: string | null; openedSequence: number | null }) {
  const seqs = useProjectSequences(programId);
  const [chosen, setChosen] = useState<number | null>(openedSequence);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const ordered = useMemo(() => [...seqs.rows].sort((a, b) => a.submissionId - b.submissionId || a.sequenceNumber.localeCompare(b.sequenceNumber)), [seqs.rows]);
  const seq = ordered.find((s) => s.id === chosen) ?? ordered[ordered.length - 1] ?? null;
  const prior = seq ? [...ordered].reverse().find((s) => s.submissionId === seq.submissionId && s.sequenceNumber < seq.sequenceNumber) ?? null : null;
  if (!programId) return null;
  let body: React.ReactNode;
  if (seqs.state === 'reading') body = <p role="status" className="sec-sub">Reading this project's sequences…</p>;
  else if (seqs.state === 'failed') body = <p role="alert" className="sec-sub">This project's sequences could not be read, so no sequence is checked.</p>;
  else if (!seq) body = <p className="sec-sub">This project has no sequence yet. Start one in Submission Center.</p>;
  else {
    body = (
      <>
        <label className="ec-qc-pick" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <span>Sequence</span>
          <select className="c2c-input" style={{ maxWidth: '100%' }} value={seq.id} onChange={(e) => { setPdfError(null); setChosen(Number(e.target.value)); }}>
            {ordered.map((s) => <option key={s.id} value={s.id}>{s.submissionTitle} · {s.sequenceNumber}</option>)}
          </select>
        </label>
        {pdfError && <p role="alert" className="sec-sub">{pdfError}</p>}
        <DiffBlock key={`d${seq.id}`} seq={seq} prior={prior} onPdfError={setPdfError} />
        <ManifestBlock key={`m${seq.id}`} seq={seq} onPdfError={setPdfError} />
      </>
    );
  }
  return (
    <section className="pj-card" data-testid="ec-sequence-qc" aria-labelledby="ec-qc-h">
      <div className="pj-card-h"><h2 className="t" id="ec-qc-h">Sequence QC</h2><span className="s">what changed, and every leaf with its checksum</span></div>
      <div className="pj-card-b">{body}</div>
    </section>
  );
}

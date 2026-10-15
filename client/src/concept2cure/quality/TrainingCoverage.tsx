import * as React from 'react';
import { ErrorState } from '../v2/dataConnect';
import type { QmsDoc, TrainingRow } from './data';
import { I } from '../v2/icons';

interface TrainingCoverageProps {
  rows: TrainingRow[];
  unread: boolean;
  failed: boolean;
  error: string | null;
  refresh: () => void;
  canOpen: (documentId: number) => boolean;
  onOpen: (documentId: number) => void;
}

/** Existing roster coverage, qualified by the exact verified release. */
export function TrainingCoverage(props: TrainingCoverageProps) {
  return <section className="qms-sec">
    <div className="qms-sec-head">
      <h2>Read-and-understood training</h2>
      <span className="meta">Current released revision · active organization roster</span>
    </div>
    <p className="qms-training-summary">Coverage counts personal acknowledgements of the current verified release. It does not assess competency or role-based training requirements. Open a document to read it and acknowledge for yourself.</p>
    <div className="qms-train">
      {props.failed && <ErrorState title="Training records could not be read" message={props.error} retry={props.refresh} testId="sop-training-failed" />}
      {props.unread && !props.failed && <div className="qms-empty" role="status">Loading training records…</div>}
      {!props.unread && props.rows.length === 0 && <div className="qms-empty">No training-controlled documents yet.</div>}
      {props.rows.map((row) => <CoverageRow key={row.documentId ?? row.doc} row={row} canOpen={props.canOpen} onOpen={props.onOpen} />)}
    </div>
  </section>;
}

function CoverageRow({ row, canOpen, onOpen }: Pick<TrainingCoverageProps, 'canOpen' | 'onOpen'> & { row: TrainingRow }) {
  const pct = row.of > 0 ? Math.round((row.current / row.of) * 100) : 0;
  const tone = pct < 80 ? 'err' : pct < 95 ? 'warn' : 'ok';
  const disabled = !row.documentId || !canOpen(row.documentId);
  return <div className="qms-train-row">
    <span className="qms-train-doc" title={row.doc}>{row.doc}{row.documentVersion ? ` · v${row.documentVersion}` : ''}</span>
    {row.eligible === false ? <span className="qms-train-unavailable">Unavailable</span> : <>
      <span className="qms-train-bar"><span className="qms-train-fill" data-tone={tone} style={{ width: `${pct}%` }} /></span>
      <span className="qms-train-pct mono">{row.current}/{row.of}</span>
    </>}
    {row.eligible === false ? <span className="qms-train-when">{row.unavailableReason ?? 'Verified released text is unavailable.'}</span> :
      <span className="qms-train-when" title="Most recent acknowledgement on the active roster">Latest {row.lastCycle}</span>}
    <button className="qms-link" disabled={disabled} aria-label={`My acknowledgement for ${row.doc}`} onClick={() => { if (row.documentId) onOpen(row.documentId); }}>My acknowledgement</button>
  </div>;
}

export function DocumentReadButton({ doc, disabled, onOpen }: {
  doc: QmsDoc; disabled: boolean; onOpen: (documentId: number) => void;
}) {
  return <button className="qms-chip" disabled={disabled}
    title="Read this controlled revision and check your personal acknowledgement"
    onClick={() => onOpen(doc.id)}>{I.bookOpen} {doc.status === 'effective' ? 'Read and acknowledge' : 'Open document'}</button>;
}

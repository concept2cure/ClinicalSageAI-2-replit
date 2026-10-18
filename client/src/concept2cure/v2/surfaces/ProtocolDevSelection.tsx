import React, { useEffect, useState } from 'react';
import { useLiveRows } from '../dataConnect';
import type { PdevDoc } from '../fixtures/protocol-data';
import * as PG from './ProtocolGov';
import { ProtocolDevForm } from './ProtocolDevForms';
import { FileProtocolProgramDrawer } from './ProtocolDevFileProgram';

interface ProtocolIndexRow { id: string; title: string; shortTitle?: string; status?: string; programId?: string | null }
const isIndex = (value: unknown): value is ProtocolIndexRow[] => Array.isArray(value) && value.every((row) =>
  !!row && typeof row === 'object' && /^[1-9]\d*$/.test(String(row.id)) && typeof row.title === 'string');
const isDocument = (value: unknown): value is PdevDoc[] => Array.isArray(value) && value.every((row) =>
  !!row && typeof row === 'object' && 'id' in row && Array.isArray(row.sections) && Array.isArray(row.completenessFindings));

function selectedIdFromUrl(): string | null {
  const query = new URLSearchParams(window.location.search);
  const id = query.get('protocol');
  return id && /^[1-9]\d*$/.test(id) ? id : null;
}

/** Separate index and selected-document reads keep every older protocol reachable. */
export function useProtocolSelection(scope: string, reloadKey: number) {
  const suffix = scope === 'all' ? '' : `&programId=${encodeURIComponent(scope)}`;
  const indexPath = `/api/protocol-dev?view=index${suffix}`;
  const index = useLiveRows<ProtocolIndexRow>(indexPath, [indexPath, reloadKey], isIndex);
  const [chosenId, setChosenId] = useState<string | null>(selectedIdFromUrl);
  const selectedId = chosenId ?? index.rows[0]?.id ?? null;
  // Freeze the initial id: a later update that changes sort order is not navigation.
  useEffect(() => { if (!chosenId && selectedId) setChosenId((current) => current ?? selectedId); }, [chosenId, selectedId]);
  const path = selectedId ? `/api/protocol-dev?documentId=${selectedId}${suffix}` : null;
  const selected = useLiveRows<PdevDoc>(path, [path, reloadKey], isDocument);
  const doc = selected.rows.find((row) => String(row.id) === String(selectedId));
  const select = (id: string) => {
    setChosenId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('protocol', id);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  };
  return { index, selected, selectedId, doc, select,
    loading: index.loading || (!!selectedId && (selected.loading || (!selected.error && !selected.empty && !doc))),
    error: index.error || selected.error,
    empty: !selectedId && index.empty,
    meta: index.meta || selected.meta };
}

interface SelectionBarProps {
  selection: ReturnType<typeof useProtocolSelection>;
  programId: string | null;
  programName: string | null;
  scope: string;
  setScope: (scope: string) => void;
  onCreated: (id?: number | null) => void;
}

export function ProtocolSelectionBar({ selection, programId, programName, scope, setScope, onCreated }: SelectionBarProps) {
  const [starting, setStarting] = useState(false);
  const [filing, setFiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <div className="pde-note" style={{ margin: 16 }}>
    <div className="pde-actions">
      <label>Protocol scope <select aria-label="Protocol scope" value={scope} onChange={(event) => setScope(event.target.value)}>
        {programId && <option value={programId}>Open program: {programName || programId}</option>}
        <option value="unfiled">Unfiled protocols</option><option value="all">All organization protocols</option>
      </select></label>
      {selection.index.rows.length > 0 && <label>Protocol <select aria-label="Protocol document" value={selection.selectedId ?? ''} onChange={(event) => selection.select(event.target.value)}>
        {selection.index.rows.map((row) => <option key={row.id} value={row.id}>
          {[row.shortTitle, row.title, row.status, !row.programId && 'Unfiled'].filter(Boolean).join(' · ')}
        </option>)}
      </select></label>}
      <PG.Btn icon="plus" variant="primary" onClick={() => setStarting(true)} disabled={!programId}>Start a protocol</PG.Btn>
      {programId && selection.doc && !selection.doc.programId && !['finalized', 'superseded'].includes(selection.doc.status) &&
        <PG.Btn icon="folder" variant="outline" onClick={() => setFiling(true)}>File protocol in open program</PG.Btn>}
    </div>
    {!programId && <p>Open a program to create a protocol. Existing protocols remain available for review.</p>}
    {selection.doc && !selection.doc.programId && <p>This protocol is unfiled. It has no recorded program association.</p>}
    {error && <div className="pde-refusal" role="alert">{error}</div>}
    <SelectionDialogs starting={starting} filing={filing} selection={selection} programId={programId} programName={programName}
      onCreated={onCreated} closeStart={() => setStarting(false)} closeFile={() => setFiling(false)}
      failed={(message) => { setStarting(false); setError(message); }} />

  </div>;
}

function SelectionDialogs({ starting, filing, selection, programId, programName, onCreated, closeStart, closeFile, failed }: {
  starting: boolean; filing: boolean; selection: ReturnType<typeof useProtocolSelection>;
  programId: string | null; programName: string | null; onCreated: (id?: number | null) => void;
  closeStart: () => void; closeFile: () => void; failed: (message: string) => void;
}) {
  return <>
    {starting && programId && <ProtocolDevForm kind="start-protocol" documentId={0}
      target={{ programId, label: programName || programId }} onCancel={closeStart}
      onDone={(_kind, receipt) => { closeStart(); onCreated(receipt ? receipt.id : undefined); }}
      onError={failed} />}
    {filing && programId && selection.doc && <FileProtocolProgramDrawer documentId={Number(selection.doc.id)} programId={programId}
      programName={programName} onCancel={closeFile}
      onDone={() => { closeFile(); onCreated(Number(selection.doc?.id)); }} />}
  </>;
}

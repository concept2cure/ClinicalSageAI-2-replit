import React, { useId, useRef, useState } from 'react';
import { ASSEMBLY_SOURCE_LIMIT, readAssemblySourceSelectors, type AssemblySourceSelector } from '@shared/authoring/assembly-sources';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import { clearEditorTarget } from '../editorTarget';
import { readShellProject } from '../shellProject';
import { captureEditorDraftGuard } from './authoringDraftTransport';
import { useSourceAssemblyTarget, type SourceAssemblyDialogProps } from './useSourceAssemblyTarget';
export type { SourceAssemblyDialogProps } from './useSourceAssemblyTarget';

/** Original bytes availability belongs to import, not retained-data assembly. */
export function sourceAssemblyUnavailableReason(source: { dataEligible?: boolean; isCurrent?: boolean; disposition?: string | null }): string | null {
  return source.dataEligible === false || source.isCurrent === false || source.disposition === 'remove_data' || source.disposition === 'supersede'
    ? 'This source is excluded from active data use.' : null;
}
export function SourceAssemblyAction({ programId, sources, titles, onNav, disabled = false, unavailable }: {
  programId: string; sources: AssemblySourceSelector[]; titles?: string[]; onNav?: (id: string) => void;
  disabled?: boolean; unavailable?: string | null;
}) {
  const reasonId = useId();
  const key = `${programId}:${JSON.stringify(sources)}`;
  const scope = useRef({ key });
  if (scope.current.key !== key) scope.current = { key };
  const [launch, setLaunch] = useState<{ scope: object; current: () => boolean } | null>(null);
  const parsed = readAssemblySourceSelectors(sources);
  const reason = unavailable ?? (sources.length > ASSEMBLY_SOURCE_LIMIT
    ? `Select up to ${ASSEMBLY_SOURCE_LIMIT} sources to build in the editor. ${sources.length} are selected.`
    : !parsed ? 'The selected source identities could not be verified. Refresh the catalogue and select them again.' : null);
  const start = () => {
    if (disabled || reason || !parsed) return;
    const token = scope.current;
    setLaunch({ scope: token, current: captureEditorDraftGuard({ programId, isCurrent: () => scope.current === token }) });
  };
  return <div className="source-work-action">
    <button type="button" className="btn ghost" disabled={disabled || !!reason} onClick={start} title={reason ?? undefined} aria-describedby={reason ? reasonId : undefined}>{I.penLine} Build in editor</button>
    {reason && <p className="sec-sub" id={reasonId}>Build in editor: {reason}</p>}
    {launch && launch.scope === scope.current && parsed && <SourceAssemblyDialog programId={programId} sources={parsed}
      titles={titles} onNav={onNav} isCurrent={launch.current} onClose={() => setLaunch(null)} />}
  </div>;
}
export function SourceAssemblyDialog(props: SourceAssemblyDialogProps) {
  const sources = readAssemblySourceSelectors(props.sources);
  if (!sources) return <div role="alert" className="scaf-note">Select one to {ASSEMBLY_SOURCE_LIMIT} verified source identities before opening a build.</div>;
  return <ScopedSourceAssemblyDialog key={`${props.programId}:${JSON.stringify(sources)}`} {...props} sources={sources} />;
}
function SelectedSources({ sources, titles }: Pick<SourceAssemblyDialogProps, 'sources' | 'titles'>) {
  return <ul>{sources.map((source, index) => <li key={source.kind === 'vault' ? source.documentId : source.sourceId}>
    {titles?.[index] || (source.kind === 'vault' ? 'Vault document' : 'Data room source')} · {source.kind === 'vault' ? source.documentId : source.sourceId}
    {source.expectedChecksum && <div className="source-import-hash">SHA-256 {source.expectedChecksum}</div>}
  </li>)}</ul>;
}
function TargetFields({ target, id, external, onCreate }: {
  target: ReturnType<typeof useSourceAssemblyTarget>; id: string; external: boolean; onCreate: () => void;
}) {
  return <>
    {target.loading && <p role="status">Loading working documents…</p>}
    {target.error && <div className="de-err" role="alert">{target.error}</div>}
    {!target.loading && target.error && <button type="button" className="de-btn" onClick={() => void target.reload()}>Retry document list</button>}
    <div className="de-field"><label className="de-label" htmlFor={id}>Working document</label>
      <select className="c2c-input" id={id} value={target.selected} disabled={target.loading || target.opening} onChange={event => target.choose(event.target.value)}>
        <option value="">Choose a working document</option>
        {target.documents.map(doc => <option key={doc.id} value={doc.id}>{doc.title}</option>)}
      </select>
    </div>
    {!target.loading && !target.documents.length && !target.error && <p>No working documents are available in this project.</p>}
    <p className="de-desc">To create one, use New document in the editor, then return here to select it.</p>
    <button type="button" className="de-btn" disabled={target.opening} onClick={onCreate}>{external ? 'Open document editor' : 'Close to create a document'}</button>
  </>;
}
function ScopedSourceAssemblyDialog(props: SourceAssemblyDialogProps) {
  const labelId = useId(); const targetId = useId();
  const target = useSourceAssemblyTarget(props);
  const close = props.onClose;
  const dialogRef = useDialog(close);
  const project = readShellProject();
  const createRemedy = () => {
    if (target.invalid || target.opening) return;
    props.onClose();
    if (props.onNav) { clearEditorTarget(); props.onNav('document-authoring'); }
  };
  return <div className="de-bd" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="de de-source-import" role="dialog" aria-modal="true" aria-labelledby={labelId} tabIndex={-1} ref={dialogRef} data-testid="source-assembly-dialog">
      <div className="de-h"><div><div className="de-h-eye">Selected sources → document editor</div>
        <div className="de-h-t" id={labelId}>Build from selected sources</div></div>
        <button type="button" className="de-x" onClick={close} aria-label="Close">{I.close}</button>
      </div>
      <div className="de-body">
        {target.invalid ? <div className="de-err" role="alert">{target.error}</div> : <>
        <p className="de-gov-t">Target project: {String(project?.id) === props.programId ? project?.title || props.programId : props.programId}</p>
        <p className="de-desc">Opens the selected working document. Preview and build there, with or without AnA. No text is changed by opening it.</p>
        <SelectedSources sources={props.sources} titles={props.titles} />
        <p className="de-desc">The editor verifies the selected source versions before building. Retained readable data can be used when the original file is unavailable.</p>
        <TargetFields target={target} id={targetId} external={!!props.onNav} onCreate={createRemedy} />
        </>}
      </div>
      <div className="de-f"><button type="button" className="de-btn" onClick={close}>Cancel</button>
        <button type="button" className="de-btn primary" disabled={!target.selected || target.loading || target.opening || target.invalid} onClick={() => void target.open()}>{target.opening ? 'Checking document…' : 'Open in editor'}</button>
      </div>
    </div>
  </div>;
}

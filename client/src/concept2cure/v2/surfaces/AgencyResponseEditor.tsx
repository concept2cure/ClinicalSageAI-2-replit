/** The register reviews saved editor text; DocumentWorkbench owns response authoring. */
import React, { useId, useState } from 'react';
import { GOVERNED_REASON_MAX } from '@shared/constants/governed-reason';
import { AGENCY_RESPONSE_SECTION_CODE } from '@shared/authoring/source-import';
import { SourceImportDialog, openImportedDocument } from '../editor/SourceImportDialog';
import { useAgencyResponseEditor, type ResponseEditorProps } from './useAgencyResponseEditor';

type Preparation = ReturnType<typeof useAgencyResponseEditor>;
function SavedResponseFields({ state }: { state: Preparation }) {
  const reasonId = useId();
  if (!state.read?.copies.length) return null;
  return <>
    <label className="de-label">Saved editor response
      <select className="c2c-input" value={state.selected} disabled={state.busy} onChange={event => state.select(event.target.value)}>
        {state.read.copies.map(value => <option key={value.sectionId} value={value.sectionId}>Working copy {value.documentId.slice(-8)} · source revision {value.sourceRevision}</option>)}
      </select>
    </label>
    {state.copy?.refusal && <p className="cc-q-note" role="status">{state.copy.refusal}</p>}
    {typeof state.copy?.text === 'string' && <p className="cc-q-body" aria-label="Saved response preview">{state.copy.text || '(empty)'}</p>}
    <label className="de-label" htmlFor={reasonId}>Reason for this change</label>
    <input id={reasonId} className="cc-q-reason" value={state.reason} maxLength={GOVERNED_REASON_MAX} disabled={state.busy} onChange={event => state.setReason(event.target.value)} />
    <button type="button" className="cc-btn sm primary" disabled={!state.canSave} onClick={() => void state.save()}>Use saved editor response</button>
  </>;
}
function EditorIntake({ state, onNav, questionRef, close }: {
  state: Preparation; onNav?: (id: string) => void; questionRef: string; close: () => void;
}) {
  const programId = state.read?.programId;
  if (!programId || !state.read) return null;
  return <SourceImportDialog programId={programId} source={state.read.source} title={`Response to ${questionRef}`} onClose={close}
    initialSectionCode={AGENCY_RESPONSE_SECTION_CODE}
    onOpenDocument={onNav ? (documentId, code) => {
      if (!state.current()) return;
      close(); openImportedDocument(documentId, programId, onNav, code ?? AGENCY_RESPONSE_SECTION_CODE);
    } : undefined} />;
}

export function AgencyResponseEditor(props: ResponseEditorProps) {
  const state = useAgencyResponseEditor(props);
  const [intake, setIntake] = useState<string | null>(null);
  const close = () => { setIntake(null); if (state.current()) void state.refresh(); };
  return <div className="cc-q-edit">
    <p className="cc-q-note">Write or amend this answer in the document editor. Save it there, then refresh and review the saved response here before recording it. Approval remains separate.</p>
    {state.notice && <p className="cc-q-note" role="status">{state.notice}</p>}
    {state.read?.unavailableReason && <p className="cc-q-note">{state.read.unavailableReason}</p>}
    {state.stale && <p className="cc-q-note" role="status">The registered response changed. Refresh the saved response before saving.</p>}
    <div className="cc-comm-foot">
      <button type="button" className="cc-btn sm" disabled={state.busy || !props.onNav || !state.read?.programId} onClick={() => setIntake(state.scope)}>Open response in editor</button>
      <button type="button" className="cc-btn sm" disabled={state.busy} onClick={() => void state.refresh()}>Refresh saved response</button>
    </div>
    {!props.onNav && <p className="cc-q-note">Open this letter from the project’s Respond step or Communication to continue in the document editor.</p>}
    {state.read?.copies.length === 0 && <p className="cc-q-note">No accessible saved editor copy is available. Open the current response in the editor to prepare one.</p>}
    <SavedResponseFields state={state} />
    <button type="button" className="cc-btn sm" disabled={state.busy} onClick={props.onCancel}>Close response preparation</button>
    {intake === state.scope && <EditorIntake state={state} onNav={props.onNav} questionRef={props.questionRef} close={close} />}
  </div>;
}

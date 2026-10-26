/** Read-only retained placement/content coverage; the governed dispatch gate stays separate. */
import React from 'react';
import type { DeliverableEvaluationScope, DeliverableSourceRef, Pathway, PathwayManifestEntry, PathwayManifestResponse, SubmissionDeliverablesAvailability } from '@shared/types/submission-api';
import { CTIS_MEMBER_STATE_CODES, SUBMISSION_DELIVERABLE_PATHWAYS } from '@shared/types/submission-api';
import { redactInternals } from '@/lib/queryClient';
import { documentSourceLabel } from '@shared/regulatory/canonical-document';
import { EmptyState } from '../dataConnect';
import { I } from '../icons';
import { setEditorTarget } from '../editorTarget';
import { useSurfaceAvailable } from '../surfaceAvailable';
import { Chip, type SeqRow, type SubLike } from './SubmissionSeqWorkspaces';
import { useSubmissionScopedRead, type SubmissionReadSession } from './submissionScopedRead';

export type SubmissionCoverageSequence = SeqRow & { deliverables?: SubmissionDeliverablesAvailability };
interface Props { sub: SubLike; seq: SubmissionCoverageSequence; session: SubmissionReadSession; openProgramId: string | null; context: string; onNav?: (id: string) => void; onValidation: () => void }
const STATUS = { present: { l: 'Present', t: 'ok' }, missing: { l: 'Missing', t: 'warn' }, 'optional-absent': { l: 'Optional absent', t: 'idle' }, undetermined: { l: 'Undetermined', t: 'warn' }, 'not-applicable': { l: 'Not applicable', t: 'idle' } };
const CONTENT = { substantive: 'Substantive retained content', 'non-substantive': 'No substantive retained content', undetermined: 'Content undetermined' };
const PIN = { match: 'Source pin matched', mismatch: 'Source content changed', unpinned: 'No content pin', unverifiable: 'Pin unverifiable' };
const LIFECYCLE = { finalized: 'Retained finalized source', draft: 'Draft', unverified: 'Lifecycle unverified', 'not-applicable': 'Lifecycle not applicable' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
const nullableString = (value: unknown) => value === null || typeof value === 'string';
const own = (map: object, value: unknown) => typeof value === 'string' && Object.prototype.hasOwnProperty.call(map, value);
const knownPathway = (value: unknown): value is Pathway => typeof value === 'string' && (SUBMISSION_DELIVERABLE_PATHWAYS as readonly string[]).includes(value);
const optionalLabels = (value: Record<string, unknown>, keys: string[]) => keys.every(key => !Object.prototype.hasOwnProperty.call(value, key) || typeof value[key] === 'string');

function verifiedAvailability(value: unknown): value is SubmissionDeliverablesAvailability {
  return object(value) && typeof value.available === 'boolean' && strings(value.compatiblePathways)
    && value.compatiblePathways.every(knownPathway) && (value.recordedPathway === null || knownPathway(value.recordedPathway)) && nullableString(value.reasonCode);
}
function validSource(value: unknown, scope: DeliverableEvaluationScope): value is DeliverableSourceRef {
  if (!object(value) || !integer(value.leafId) || value.sequenceId !== scope.sequenceId || value.submissionId !== scope.submissionId
    || value.programId !== scope.programId || value.projectId !== scope.projectId || !object(value.evidence) || !optionalLabels(value, ['label'])) return false;
  const evidence = value.evidence;
  if (!own(CONTENT, evidence.content) || !own(PIN, evidence.pin) || !own(LIFECYCLE, evidence.lifecycle) || !nullableString(evidence.reasonCode)) return false;
  return validSourcePointer(value.document) && validSourceSection(value.section) && validEditor(value.editor, value.section, scope.programId);
}
function validSourcePointer(value: unknown): boolean {
  if (value === null) return true;
  if (!object(value)) return false;
  if (value.table === 'vault_documents') return value.keyKind === 'uuid' && typeof value.id === 'string' && UUID.test(value.id);
  return ['coauthor_documents', 'unified_documents', 'ctd_onboarding_documents', 'rendered_leaf_files', 'c2c_document_sections'].includes(String(value.table)) && value.keyKind === 'integer' && integer(value.id);
}
function validSourceSection(value: unknown): boolean {
  return value === null || (object(value) && typeof value.id === 'string' && value.id.length > 0 && nullableString(value.code));
}
function validEditor(value: unknown, section: unknown, programId: string): boolean {
  if (value === null) return true;
  if (!object(value) || value.kind !== 'authoring-document' || typeof value.documentId !== 'string' || !UUID.test(value.documentId)
    || value.programId !== programId || !nullableString(value.sectionCode)) return false;
  return value.sectionCode === null || (object(section) && section.code === value.sectionCode);
}
function validEntry(value: unknown, scope: DeliverableEvaluationScope): value is PathwayManifestEntry {
  return object(value) && ['path', 'id', 'label', 'group'].every(key => typeof value[key] === 'string')
    && typeof value.required === 'boolean' && own(STATUS, value.status) && strings(value.sources)
    && Array.isArray(value.sourceRefs) && value.sourceRefs.every(source => validSource(source, scope));
}
function sameRetainedIdentity(value: Record<string, unknown>, props: Props) {
  return value.organizationId === props.session.organizationId && value.programId === props.sub.programId && integer(value.projectId)
    && value.submissionId === props.sub.id && value.sequenceId === props.seq.id && value.sequenceRegion === props.seq.region
    && value.recordedApplicationType === props.sub.applicationType && value.recordedPathway === props.seq.deliverables?.recordedPathway;
}
function sameEvaluation(value: Record<string, unknown>, pathway: Pathway, memberStates: string[], explicit: boolean) {
  return value.evaluatedPathway === pathway && value.regulation === (pathway === 'mdr' || pathway === 'ivdr' ? pathway : null) && strings(value.memberStates)
    && JSON.stringify(value.memberStates) === JSON.stringify(memberStates)
    && value.inputOrigin === (explicit ? 'explicit-compatible' : 'recorded')
    && value.evaluation === 'retained-placement-content-coverage' && value.dispatchReadiness === 'separate-governed-assessment';
}
function sameScope(value: unknown, props: Props, pathway: Pathway, memberStates: string[], explicit: boolean): value is DeliverableEvaluationScope {
  return object(value) && optionalLabels(value, ['programCode', 'programTitle']) && sameRetainedIdentity(value, props) && sameEvaluation(value, pathway, memberStates, explicit);
}
function currentManifest(value: unknown, props: Props, pathway: Pathway, states: string[], explicit: boolean): value is PathwayManifestResponse {
  if (!object(value) || value.pathway !== pathway || typeof value.framework !== 'string' || value.generatedFrom !== 'canonical-core'
    || typeof value.ready !== 'boolean' || !sameScope(value.scope, props, pathway, states, explicit) || !object(value.totals)) return false;
  const scope = value.scope;
  const totals = value.totals;
  return ['sections', 'requiredPresent', 'requiredMissing', 'undetermined'].every(key => typeof totals[key] === 'number' && Number.isSafeInteger(totals[key]) && Number(totals[key]) >= 0)
    && Array.isArray(value.entries) && value.entries.every(entry => validEntry(entry, scope))
    && Array.isArray(value.sourceIssues) && value.sourceIssues.every(issue => object(issue) && integer(issue.leafId) && typeof issue.code === 'string' && typeof issue.message === 'string');
}

const frameworkLabel = (pathway: string) => pathway.replaceAll('_', ' ').replaceAll('ctis', 'CTIS').replaceAll('mdr', 'MDR').replaceAll('ivdr', 'IVDR').replaceAll('pmda', 'PMDA').replaceAll('pma', 'PMA').replaceAll('estar', 'eSTAR').replaceAll('prestar', 'PreSTAR');
function manifestPath(sub: SubLike, seq: SeqRow, pathway: Pathway | null, states: string[], explicit: boolean) {
  if (!sub.programId || !pathway) return null;
  const params = new URLSearchParams({ programId: sub.programId, submissionId: String(sub.id) });
  if (explicit) params.set('pathway', pathway);
  if (states.length) params.set('memberStates', states.join(','));
  return `/api/submissions/sequences/${seq.id}/pathway-manifest?${params}`;
}

function CoverageInputs({ choices, pathway, onPathway, stateInput, onStates }: {
  choices: Pathway[]; pathway: Pathway | null; onPathway: (value: Pathway | null) => void; stateInput: string; onStates: (value: string) => void;
}) {
  return <div className="cm-pushbar sc-seqbar sc-mb">
    <label className="sc-field">Coverage framework<select className="sc-subpick" value={pathway ?? ''} onChange={event => onPathway(event.target.value as Pathway || null)}>
      <option value="">Select a compatible framework</option>
      {choices.map(choice => <option key={choice} value={choice}>{frameworkLabel(choice)}</option>)}
    </select></label>
    {pathway === 'ctis' && <label className="sc-field">CTIS member-state codes<input className="sc-subpick" value={stateInput} placeholder="For example: DE, FR" onChange={event => onStates(event.target.value)} /></label>}
  </div>;
}
function SourceCell({ source, onOpen, canOpen, crossProgram }: { source: DeliverableSourceRef; onOpen: (source: DeliverableSourceRef) => void; canOpen: boolean; crossProgram: boolean }) {
  const key = source.document?.id;
  return <div className="sc-mb">
    {source.label && <div>{redactInternals(source.label, 'Retained source')}</div>}
    <div className="sp-q-s sc-mono">Leaf {source.leafId}{source.document && ` · ${documentSourceLabel(source.document.table, String(key))}`}</div>
    <div className="sc-chiprow sc-mt">
      <span className="rd-chip tone-idle">{CONTENT[source.evidence.content]}</span>
      <span className={`rd-chip tone-${source.evidence.pin === 'mismatch' ? 'warn' : 'idle'}`}>{PIN[source.evidence.pin]}</span>
      <span className="rd-chip tone-idle">{LIFECYCLE[source.evidence.lifecycle]}</span>
    </div>
    {source.editor && <button type="button" className="sc-trans-b sc-mt" disabled={!canOpen || crossProgram} onClick={() => onOpen(source)}
      title={crossProgram ? 'Open the recorded source project before opening its saved document.' : undefined}>Open saved document</button>}
    {source.editor && crossProgram && <div className="scaf-note">Open the recorded source project before opening its saved document.</div>}
  </div>;
}
function CoverageTable({ data, onOpen, canOpen, openProgramId }: { data: PathwayManifestResponse; onOpen: (source: DeliverableSourceRef) => void; canOpen: boolean; openProgramId: string | null }) {
  return <div className="cm-matrix"><table className="ub-inv"><thead><tr><th>Deliverable</th><th>Requirement</th><th>Coverage</th><th>Retained source</th></tr></thead><tbody>
    {data.entries.map(entry => <tr key={entry.path}>
      <td><div className="sp-q-s">{entry.group}</div>{entry.label}</td>
      <td>{entry.required ? 'Required' : 'Conditional or optional'}{entry.checkApplicability && <div className="sp-q-s">Applicability needs a decision</div>}{entry.applicability && <div className="sp-q-s">{entry.applicability}</div>}</td>
      <td><Chip map={STATUS} k={entry.status} />{entry.contentUndetermined && <div className="sp-q-s">Retained content needs verification</div>}</td>
      <td>{entry.sourceRefs.length ? entry.sourceRefs.map(source => <SourceCell key={source.leafId} source={source} onOpen={onOpen} canOpen={canOpen} crossProgram={openProgramId !== source.programId} />) : <span className="sp-q-s">No admitted retained source</span>}</td>
    </tr>)}
  </tbody></table></div>;
}
function CoverageResult({ data, props, onOpen }: { data: PathwayManifestResponse; props: Props; onOpen: (source: DeliverableSourceRef) => void }) {
  const available = useSurfaceAvailable();
  const programLabel = [data.scope.programCode, data.scope.programTitle].filter(Boolean).join(' · ') || 'Recorded project';
  return <>
    <div className="scaf-note sc-mb">{data.framework} · {data.scope.inputOrigin === 'recorded' ? 'Recorded framework' : 'Explicit compatible framework'} · {redactInternals(programLabel, 'Recorded project')} · sequence {props.seq.sequenceNumber}.
      {data.scope.memberStates.length > 0 && ` Member states: ${data.scope.memberStates.join(', ')}.`}
      <div className="sp-q-s sc-mono">Project {data.scope.programId} · submission {data.scope.submissionId} · sequence record {data.scope.sequenceId}</div>
    </div>
    <div className="sc-chiprow sc-mb"><span className="rd-chip tone-idle">{data.totals.sections} sections</span><span className="rd-chip tone-idle">{data.totals.requiredPresent} required present</span><span className="rd-chip tone-warn">{data.totals.requiredMissing} required missing</span><span className="rd-chip tone-warn">{data.totals.undetermined} undetermined</span></div>
    {data.sourceIssues.map(issue => <div key={`${issue.leafId}:${issue.code}`} className="sc-verdict tone-warn">Leaf {issue.leafId} · {redactInternals(issue.message, 'This retained source could not be verified.')}</div>)}
    {data.entries.length ? <CoverageTable data={data} onOpen={onOpen} canOpen={!!props.onNav && available('document-authoring')} openProgramId={props.openProgramId} />
      : <EmptyState icon={I.fileText} title="No deliverable entries returned" hint="This evaluated framework returned no structural entries. This does not establish filing completeness." />}
    {!!data.contradictions?.length && <div className="sc-verdict tone-warn">{data.contradictions.length} source/applicability contradictions remain in the evaluated framework.</div>}
    {!!data.checkApplicability?.length && <div className="sc-verdict tone-warn">{data.checkApplicability.length} applicability decisions remain to be checked.</div>}
  </>;
}

function UnavailableCoverage({ reason, onValidation }: { reason: string; onValidation: () => void }) {
  return <div className="scaf-note">{reason}<div className="cm-pushbar sc-mt"><button type="button" className="sc-trans-b" onClick={onValidation}>Open Validation</button></div></div>;
}
function CoverageBody({ props, pathway, read, onOpen, onRetry, statesValid }: { props: Props; pathway: Pathway | null; read: ReturnType<typeof useSubmissionScopedRead<PathwayManifestResponse>>; onOpen: (source: DeliverableSourceRef) => void; onRetry: () => void; statesValid: boolean }) {
  if (!props.sub.programId) return <UnavailableCoverage reason="This submission has no recorded project for a coverage evaluation." onValidation={props.onValidation} />;
  if (!props.session.organizationId) return <div className="scaf-note">Sign in to evaluate this sequence's retained deliverables.</div>;
  if (!pathway) return <div className="scaf-note">Select a compatible framework to evaluate retained deliverables. No framework has been inferred.</div>;
  if (!statesValid) return <div className="sc-verdict tone-warn" role="status">Use supported two-letter EU member-state codes for this CTIS evaluation.</div>;
  if (read.loading) return <div className="scaf-note" role="status">Loading retained deliverables…</div>;
  if (read.error) return <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load the deliverables" hint={read.error} retry={onRetry} />;
  return read.data ? <CoverageResult data={read.data} props={props} onOpen={onOpen} /> : null;
}
const canEvaluate = (availability: SubmissionDeliverablesAvailability | null, session: SubmissionReadSession, statesValid: boolean) => availability?.available === true && !!session.organizationId && statesValid;
export function SubmissionRequiredDeliverables(props: Props) {
  const { sub, seq, session, context } = props;
  const availability = verifiedAvailability(seq.deliverables) ? seq.deliverables : null;
  const choices = availability?.available ? availability.compatiblePathways : [];
  const recorded = availability?.recordedPathway && choices.includes(availability.recordedPathway) ? availability.recordedPathway : null;
  const [explicit, setExplicit] = React.useState<Pathway | null>(null);
  const [stateInput, setStateInput] = React.useState('');
  const [retry, setRetry] = React.useState(0);
  const pathway = explicit && choices.includes(explicit) ? explicit : recorded;
  const states = pathway === 'ctis' ? [...new Set(stateInput.split(',').map(state => state.trim().toUpperCase()).filter(Boolean))].sort() : [];
  const statesValid = states.every(state => (CTIS_MEMBER_STATE_CODES as readonly string[]).includes(state));
  const path = canEvaluate(availability, session, statesValid) ? manifestPath(sub, seq, pathway, states, explicit !== null) : null;
  const selectionKey = JSON.stringify([context, path, stateInput, session.key]);
  const currentSelection = React.useRef(selectionKey);
  currentSelection.current = selectionKey;
  const read = useSubmissionScopedRead(path, selectionKey, retry, session, (value): value is PathwayManifestResponse => !!pathway && currentManifest(value, props, pathway, states, explicit !== null));
  const latestRead = React.useRef(read);
  latestRead.current = read;
  const open = (source: DeliverableSourceRef) => {
    if (latestRead.current !== read || !read.data || !read.loadedScope || currentSelection.current !== selectionKey || !session.sameRevision() || !props.onNav
      || props.openProgramId !== source.programId || !source.editor || source.editor.programId !== sub.programId
      || !read.data.entries.some(entry => entry.sourceRefs.includes(source))) return;
    setEditorTarget({ docType: null, docId: source.editor.documentId, programId: source.editor.programId, ...(source.editor.sectionCode ? { code: source.editor.sectionCode } : {}) });
    props.onNav('document-authoring');
  };
  return <div className="pj-card"><div className="pj-card-h"><span className="t">Required deliverables · sequence {seq.sequenceNumber}</span><span className="s">structural coverage</span></div><div className="pj-card-b">
    <div className="scaf-note sc-mb">Coverage of retained material placed in this sequence. This view does not approve the documents or clear the submission for dispatch.</div>
    {!availability ? <UnavailableCoverage reason="Coverage availability could not be verified for this sequence." onValidation={props.onValidation} />
      : !availability.available ? <UnavailableCoverage reason={`A sequence coverage catalogue for ${sub.applicationType.toUpperCase()} is not available in this view.`} onValidation={props.onValidation} />
        : <><CoverageInputs choices={choices} pathway={pathway} onPathway={setExplicit} stateInput={stateInput} onStates={setStateInput} />
          <CoverageBody props={props} pathway={pathway} read={read} onOpen={open} onRetry={() => setRetry(value => value + 1)} statesValid={statesValid} />
        </>}
  </div></div>;
}

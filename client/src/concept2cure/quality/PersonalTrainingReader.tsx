import * as React from 'react';
import { canGovernedWrite } from '@shared/constants/permissions';
import { QMS_TRAINING_DECLARATION, type QmsTrainingAcknowledgement, type QmsTrainingContext } from '@shared/qms/training';
import { useAuthUser } from '@/services/portal/authService';
import { GovernedTimestamp } from '../_shared/components/GovernedTimestamp';
import { useDialog } from '../v2/useDialog';
import { registerCeremonyOpen } from '../v2/ceremony';
import { ControlledTextEditor } from './ControlledTextEditor';
import { STATUS_LABEL } from './data';
import { personalTrainingScope, type PersonalTrainingScope } from './qmsPersonalTraining';
import { usePersonalTrainingAcknowledgement, usePersonalTrainingRecord, type PersonalTrainingRecord } from './usePersonalTraining';

export interface PersonalTrainingReaderProps {
  documentId: number;
  /** Open on the version approved for a later day, when one waits (a training notice); otherwise the version in force. */
  startOnSuccessor?: boolean;
  onClose: () => void;
  onAcknowledged: () => void | Promise<void>;
}
type ReaderSessionProps = PersonalTrainingReaderProps & {
  scope: PersonalTrainingScope | null;
  user: ReturnType<typeof useAuthUser>;
  isCurrent: () => boolean;
};

/** A scope change unmounts the old session and retires all its responses. */
export function PersonalTrainingReader(props: PersonalTrainingReaderProps) {
  const user = useAuthUser();
  const userId = user?.id;
  const organizationId = user?.organizationId;
  const scope = React.useMemo(() => personalTrainingScope({ id: userId, organizationId }, props.documentId), [userId, organizationId, props.documentId]);
  const key = `${organizationId ?? ''}:${userId ?? ''}:${props.documentId}`;
  const liveKey = React.useRef(key);
  liveKey.current = key;
  return <ReaderSession key={key} {...props} scope={scope} user={user} isCurrent={() => liveKey.current === key} />;
}

function mayEdit(props: ReaderSessionProps, record: PersonalTrainingRecord): boolean {
  const context = record.context;
  return !!props.scope && context?.canEditControlledText === true && canGovernedWrite(props.user) &&
    !!context.contentDigest && (context.status === 'draft' || context.status === 'in_review');
}

function ReaderSession(props: ReaderSessionProps) {
  const record = usePersonalTrainingRecord(props.scope, props.isCurrent, props.startOnSuccessor ? 'successor' : 'in-force');
  const { busy, inFlight, acknowledge } = usePersonalTrainingAcknowledgement(props.scope, record, props.onAcknowledged);
  const [editing, setEditing] = React.useState(false);
  const beforeClose = React.useRef<(() => Promise<boolean>) | null>(null);
  const registerBeforeClose = React.useCallback((guard: (() => Promise<boolean>) | null) => { beforeClose.current = guard; }, []);
  const allowDiscard = async () => !beforeClose.current || await beforeClose.current();
  const close = async () => {
    if (inFlight.current || !await allowDiscard()) return;
    if (record.current()) props.onClose();
  };
  const dialogRef = useDialog(() => { void close(); });
  React.useEffect(registerCeremonyOpen, []);
  const back = async () => { if (await allowDiscard() && record.current()) setEditing(false); };
  const reloadEditor = async () => {
    if (await allowDiscard() && record.current()) { setEditing(false); await record.load(); }
  };
  const controlledTextSaved = async () => {
    if (!record.current()) return;
    setEditing(false);
    let coverageUnavailable = false;
    try { await props.onAcknowledged(); } catch { coverageUnavailable = true; }
    if (!record.current()) return;
    await record.load();
    if (record.current()) record.setNotice(coverageUnavailable ?
      'Controlled text was saved as a draft. Roster coverage could not be refreshed; reload it before assessing coverage.' :
      'Controlled text was saved as a draft. Send this revision for review before approval.');
  };
  const editable = mayEdit(props, record);
  return <div className="qms-training-overlay">
    <div className="qms-training-dialog" role="dialog" aria-modal="true" aria-labelledby="qms-personal-training-title" tabIndex={-1} ref={dialogRef}>
      <header className="qms-training-head">
        <div><h2 id="qms-personal-training-title">{editing ? 'Edit controlled text' : 'Read and acknowledge'}</h2>
          {record.context && record.selected && <p>{record.context.docNumber} · {record.context.title} · Revision {record.selected.documentVersion} · {versionStatus(record.selected)}</p>}
        </div>
        <button type="button" className="qms-btn ghost" disabled={busy} onClick={() => { void close(); }}>Close</button>
      </header>
      <ReaderMessages record={record} />
      {!record.loading && !editing && <SuccessorChoice record={record} busy={busy} />}
      {!record.loading && (editing ?
        <ControlledTextPane props={props} record={record} editable={editable} registerBeforeClose={registerBeforeClose} onSaved={controlledTextSaved} onReload={reloadEditor} /> :
        <TrainingReadContent record={record} busy={busy} acknowledge={acknowledge} />)}
      <footer className="qms-training-actions">
        {editable && !editing && <button type="button" className="qms-btn ghost" disabled={busy} onClick={() => setEditing(true)}>Edit controlled text</button>}
        {editing ? <button type="button" className="qms-btn ghost" onClick={() => { void back(); }}>Back to document</button> :
          <button type="button" className="qms-btn ghost" disabled={busy || record.loading || !props.scope} onClick={() => { void record.load(); }}>Reload record</button>}
      </footer>
    </div>
  </div>;
}

function ReaderMessages({ record }: { record: PersonalTrainingRecord }) {
  return <>
    {record.loading && <p role="status">Loading the controlled revision…</p>}
    {record.error && <p className="qms-training-error" role="alert">{record.error}</p>}
    {record.notice && <p className="qms-training-notice" role="status">{record.notice}</p>}
  </>;
}

/** The day a version approved for a later day counts from, when the context says so. */
function countsFrom(context: QmsTrainingContext): string | null {
  return context.inForce === false ? context.effectiveDate ?? null : null;
}

function versionStatus(context: QmsTrainingContext): string {
  const day = countsFrom(context);
  return day ? `Approved · takes effect ${day}` : STATUS_LABEL[context.status];
}

/** The version approved for a later day is read beside the version in force, never instead of it (P-49). */
function SuccessorChoice({ record, busy }: { record: PersonalTrainingRecord; busy: boolean }) {
  const context = record.context;
  const successor = context?.successor;
  if (!context || !successor) return null;
  const day = countsFrom(successor);
  const later = day ? `Takes effect ${day}` : 'Takes effect later';
  return <fieldset className="qms-training-successor">
    <legend>v{successor.documentVersion} is approved and takes effect {day ? `on ${day}` : 'on a later day'}.</legend>
    <label><input type="radio" name="qms-training-version" checked={record.reading === 'in-force'} disabled={busy}
      onChange={() => record.setReading('in-force')} />In force: v{context.documentVersion}</label>
    <label><input type="radio" name="qms-training-version" checked={record.reading === 'successor'} disabled={busy}
      onChange={() => record.setReading('successor')} />{later}: v{successor.documentVersion}</label>
  </fieldset>;
}

function ControlledTextPane({ props, record, editable, registerBeforeClose, onSaved, onReload }: {
  props: ReaderSessionProps; record: PersonalTrainingRecord; editable: boolean;
  registerBeforeClose: (guard: (() => Promise<boolean>) | null) => void;
  onSaved: () => Promise<void>; onReload: () => Promise<void>;
}) {
  const { scope, documentId, user } = props;
  const { context, documentRecord } = record;
  if (!editable || !scope || !context || !documentRecord) return null;
  return <ControlledTextEditor key={`${scope.organizationId}:${scope.userId}:${documentId}:${context.documentVersion}:${context.contentDigest}`}
    documentId={documentId} documentVersion={context.documentVersion} contentDigest={context.contentDigest} status={context.status}
    metadata={documentRecord.metadata} user={user} storageKey={`qms-controlled-text:${scope.organizationId}:${scope.userId}:${documentId}:${context.documentVersion}`}
    isCurrent={record.current} registerBeforeClose={registerBeforeClose} onSaved={onSaved} onReload={onReload} />;
}

function TrainingReadContent({ record, busy, acknowledge }: {
  record: PersonalTrainingRecord; busy: boolean; acknowledge: () => Promise<void>;
}) {
  const context = record.selected;
  if (!context) return null;
  return <>
    {context.sections.length > 0 && <div className="qms-training-content" aria-label={`${context.eligible ? 'Released revision' : 'Recorded controlled text for revision'} ${context.documentVersion}`}>
      {!context.eligible && <h3>Recorded controlled text · {STATUS_LABEL[context.status]}</h3>}
      {context.sections.map((section, index) => <section key={`${section.key}:${index}`}><h3>{section.label}</h3><p>{section.body}</p></section>)}
    </div>}
    {!context.eligible && <p className="qms-training-unavailable">{context.unavailableReason ?? 'Verified readable released text is unavailable. A document owner must save and release the controlled section text before you can acknowledge it.'}</p>}
    {record.receipt && <TrainingReceipt receipt={record.receipt} countsFrom={countsFrom(context)} />}
    {context.eligible && !record.receipt && <TrainingDeclaration record={record} busy={busy} acknowledge={acknowledge} countsFrom={countsFrom(context)} />}
  </>;
}

function TrainingReceipt({ receipt, countsFrom: day }: { receipt: QmsTrainingAcknowledgement; countsFrom: string | null }) {
  return <section className="qms-training-receipt" aria-label="My acknowledgement">
    <h3>My acknowledgement</h3>
    <p>You acknowledged revision {receipt.documentVersion}. This personal attestation records reading and understanding; it does not assess competency.</p>
    <dl>
      <div><dt>Receipt</dt><dd>{receipt.id}</dd></div>
      <div><dt>Acknowledged</dt><dd><GovernedTimestamp value={receipt.acknowledgedAt} /></dd></div>
      {day && <div><dt>Counts from</dt><dd>{day}</dd></div>}
      <div><dt>Refresh due</dt><dd>{receipt.expiresAt ? <GovernedTimestamp value={receipt.expiresAt} /> : 'No refresh date recorded'}</dd></div>
    </dl>
  </section>;
}

function TrainingDeclaration({ record, busy, acknowledge, countsFrom: day }: {
  record: PersonalTrainingRecord; busy: boolean; acknowledge: () => Promise<void>; countsFrom: string | null;
}) {
  return <div className="qms-training-declaration">
    <label><input type="checkbox" checked={record.understood} disabled={busy || record.blocked} onChange={(event) => record.setUnderstood(event.target.checked)} />{QMS_TRAINING_DECLARATION}</label>
    <p>For your signed-in account only. This is a personal attestation, not an electronic signature.</p>
    {day && <p>Your acknowledgement is recorded now and counts from {day}.</p>}
    <button type="button" className="qms-btn primary" disabled={!record.understood || busy || record.blocked} onClick={() => { void acknowledge(); }}>{busy ? 'Recording…' : 'Acknowledge this revision'}</button>
  </div>;
}

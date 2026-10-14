/** Draft controlled text stays in the canonical editor and existing QMS PATCH. */
import * as React from 'react';
import {
  qmsControlledTextInputSchema,
  qmsTrainingContextSchema,
  type QmsControlledTextInput,
  type QmsTrainingContext,
} from '@shared/qms/training';
import { canGovernedWrite } from '@shared/constants/permissions';
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import { deviceDraftKey } from '@/lib/deviceDraftCache';
import type { AuthUser } from '@/services/portal/authService';
import { RichSectionEditor, type RichSectionEditorHandle } from '../v2/editor/RichSectionEditor';
import { useDialog } from '../v2/useDialog';
import { STANDARD_SECTIONS } from './data';
import { personalTrainingScope, personalTrainingWriteHeaders, PersonalTrainingError, type PersonalTrainingScope } from './qmsPersonalTraining';

type ControlledSection = QmsControlledTextInput['controlledText']['sections'][number];
type CloseGuard = () => Promise<boolean>;
type EditorHandles = React.MutableRefObject<Map<string, RichSectionEditorHandle>>;

export interface ControlledTextEditorProps {
  documentId: number;
  documentVersion: string;
  contentDigest: string | null;
  status: QmsTrainingContext['status'];
  metadata: unknown;
  user: AuthUser | null;
  /** Includes the current organisation, account and document. */
  storageKey: string;
  isCurrent: () => boolean;
  onSaved: () => void | Promise<void>;
  onReload?: () => void | Promise<void>;
  registerBeforeClose?: (guard: CloseGuard | null) => void;
}

const UNCONFIRMED = 'The controlled-text save could not be confirmed. Reload this record to check its current text before saving again.';
const REFUSED = 'The controlled text was not saved. Your draft is still on screen.';
class ControlledTextSaveError extends Error {
  constructor(message: string, readonly reloadRequired = false) { super(message); }
}

/** An existing unknown structure must not be silently replaced by a skeleton. */
function editableSections(metadata: unknown, version: string, digest: string | null): ControlledSection[] | null {
  if (metadata != null && (typeof metadata !== 'object' || Array.isArray(metadata))) return null;
  const raw = (metadata as { sections?: unknown } | null)?.sections;
  if (raw != null && !Array.isArray(raw)) return null;
  const sections = raw == null || (Array.isArray(raw) && raw.length === 0) ? STANDARD_SECTIONS : raw;
  const candidate = (sections as unknown[]).map(section => {
    if (!section || typeof section !== 'object' || Array.isArray(section)) return section;
    const stored = section as { key?: unknown; label?: unknown; body?: unknown; order?: unknown; hint?: unknown };
    const label = stored.label === undefined ? STANDARD_SECTIONS.find(value => value.key === stored.key)?.label ?? stored.key : stored.label;
    return { key: stored.key, label, body: stored.body === undefined ? '' : stored.body,
      ...(stored.order !== undefined ? { order: stored.order } : {}), ...(stored.hint !== undefined ? { hint: stored.hint } : {}) };
  });
  const parsed = qmsControlledTextInputSchema.safeParse({
    controlledText: { documentVersion: version, contentDigest: digest, sections: candidate },
    reason: 'Validate current section structure',
  });
  return parsed.success ? parsed.data.controlledText.sections : null;
}

function sectionsMatch(actual: unknown, expected: ControlledSection[]): boolean {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  return expected.every((section, index) => {
    const other = actual[index] as Partial<ControlledSection> | null;
    return other != null && section.key === other.key && section.label === other.label && section.body === other.body &&
      section.order === other.order && section.hint === other.hint;
  });
}

type SaveEnvelope = {
  data?: { id?: unknown; organization_id?: unknown; version?: unknown; status?: unknown; metadata?: { sections?: unknown } };
  meta?: { training?: unknown; auditTrail?: { persisted?: unknown; chained?: unknown } };
};
function savedDocumentMatches(data: SaveEnvelope['data'], scope: PersonalTrainingScope, input: QmsControlledTextInput): boolean {
  return data?.id === scope.documentId && data.organization_id === scope.organizationId &&
    data.version === input.controlledText.documentVersion && data.status === 'draft' &&
    sectionsMatch(data.metadata?.sections, input.controlledText.sections);
}
function savedContextMatches(context: unknown, scope: PersonalTrainingScope, input: QmsControlledTextInput): boolean {
  const parsed = qmsTrainingContextSchema.safeParse(context);
  if (!parsed.success) return false;
  const value = parsed.data;
  return value.documentId === scope.documentId && value.documentVersion === input.controlledText.documentVersion &&
    value.status === 'draft' && !value.eligible && !value.acknowledgement &&
    Boolean(value.contentDigest) && value.contentDigest !== input.controlledText.contentDigest;
}
function isConfirmedSave(body: unknown, scope: PersonalTrainingScope, input: QmsControlledTextInput): boolean {
  const result = body as SaveEnvelope | null;
  return savedDocumentMatches(result?.data, scope, input) && savedContextMatches(result?.meta?.training, scope, input) &&
    result?.meta?.auditTrail?.persisted === true && result.meta.auditTrail.chained === true;
}

function saveFailure(error: unknown): ControlledTextSaveError {
  if (error instanceof ControlledTextSaveError) return error;
  if (error instanceof PersonalTrainingError) return new ControlledTextSaveError(error.message, true);
  if (error instanceof ApiRequestError && error.code !== 'OUTCOME_UNKNOWN') {
    const definiteRefusal = error.status >= 400 && error.status < 500 && error.status !== 408;
    if (definiteRefusal || error.code === 'AUDIT_WRITE_FAILED') {
      return new ControlledTextSaveError(redactInternals(error.message, REFUSED), error.status === 409);
    }
  }
  return new ControlledTextSaveError(UNCONFIRMED, true);
}
async function writeControlledText(scope: PersonalTrainingScope, input: QmsControlledTextInput, current: () => boolean): Promise<void> {
  const headers = personalTrainingWriteHeaders(scope);
  const response = await apiRequest('PATCH', `/api/mdx/qms/documents/${scope.documentId}`, input, headers);
  const body: unknown = await response.json().catch(() => null);
  if (!current()) throw new ControlledTextSaveError(REFUSED);
  if (!response.ok) {
    if (response.status < 400 || response.status >= 500 || response.status === 408) throw new ControlledTextSaveError(UNCONFIRMED, true);
    throw new ControlledTextSaveError(serverMessage(body) ?? REFUSED, response.status === 409);
  }
  if (!isConfirmedSave(body, scope, input)) throw new ControlledTextSaveError(UNCONFIRMED, true);
}

function useControlledTextSave(props: ControlledTextEditorProps, sections: ControlledSection[] | null, handles: EditorHandles,
  draft: { reason: string; dirtyKeys: Set<string>; markSaved: () => void }) {
  const { reason, dirtyKeys, markSaved } = draft;
  const scope = personalTrainingScope(props.user, props.documentId);
  const permitted = Boolean(scope) && canGovernedWrite(props.user) && (props.status === 'draft' || props.status === 'in_review');
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [reloadRequired, setReloadRequired] = React.useState(false);
  const busyRef = React.useRef(false);
  const alive = React.useRef(true);
  const current = () => alive.current && props.isCurrent();
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const persist = async (key: string, serialized: string) => {
    if (!permitted || !sections || !scope || !current() || busyRef.current || reloadRequired) throw new ControlledTextSaveError(REFUSED);
    const parsed = qmsControlledTextInputSchema.safeParse({
      controlledText: { documentVersion: props.documentVersion, contentDigest: props.contentDigest,
        sections: sections.map(section => ({ ...section, body: section.key === key ? serialized :
          dirtyKeys.has(section.key) ? handles.current.get(section.key)?.getContent() ?? section.body : section.body })) },
      reason: reason.trim(),
    });
    if (!parsed.success) {
      const message = reason.trim().length < 8 ? 'State a reason of at least 8 characters before saving controlled text.' :
        'The controlled text exceeds a supported limit. Keep each section below 200,000 characters and the reason below 2,000 characters.';
      setNotice(message);
      throw new ControlledTextSaveError(message);
    }
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    let confirmed = false;
    try {
      await writeControlledText(scope, parsed.data, current);
      confirmed = true;
      markSaved();
      setReloadRequired(true);
      setNotice('Controlled text saved as a draft. Send this revision for review before approval.');
      await props.onSaved();
    } catch (error) {
      if (current()) {
        if (confirmed) setNotice('The controlled text was saved, but the current record could not be refreshed. Reload this record.');
        else {
          const failure = saveFailure(error);
          if (failure.reloadRequired) setReloadRequired(true);
          setNotice(failure.message);
        }
      }
      if (!confirmed) throw error;
    } finally {
      busyRef.current = false;
      if (current()) setBusy(false);
    }
  };
  return { permitted, busy, busyRef, notice, reloadRequired, persist, setNotice };
}

/** The reader awaits this guard before closing, changing mode or reloading. */
function useControlledTextCloseGuard(pending: boolean, busyRef: React.MutableRefObject<boolean>,
  registerBeforeClose: ControlledTextEditorProps['registerBeforeClose'], onDiscard: () => void) {
  const [open, setOpen] = React.useState(false);
  const resolver = React.useRef<((allow: boolean) => void) | null>(null);
  const pendingRef = React.useRef(pending);
  const discardRef = React.useRef(onDiscard);
  pendingRef.current = pending;
  discardRef.current = onDiscard;
  const finish = (allow: boolean) => {
    if (allow) discardRef.current();
    setOpen(false);
    resolver.current?.(allow);
    resolver.current = null;
  };
  const dialogRef = useDialog(() => finish(false), open);
  React.useEffect(() => {
    registerBeforeClose?.(() => {
      if (busyRef.current) return Promise.resolve(false);
      if (!pendingRef.current) return Promise.resolve(true);
      if (resolver.current) return Promise.resolve(false);
      setOpen(true);
      return new Promise(resolve => { resolver.current = resolve; });
    });
    return () => { registerBeforeClose?.(null); resolver.current?.(false); resolver.current = null; };
  }, [busyRef, registerBeforeClose]);
  return { open, finish, dialogRef };
}

export function ControlledTextEditor(props: ControlledTextEditorProps) {
  const { documentVersion, contentDigest, metadata, storageKey, user } = props;
  const sections = React.useMemo(() => editableSections(metadata, documentVersion, contentDigest), [metadata, documentVersion, contentDigest]);
  const [reason, setReason] = React.useState('');
  const [dirtyKeys, setDirtyKeys] = React.useState<Set<string>>(() => new Set());
  const [discardEpoch, setDiscardEpoch] = React.useState(0);
  const handles = React.useRef(new Map<string, RichSectionEditorHandle>());
  const clearDrafts = () => {
    for (const section of sections ?? []) {
      try { localStorage.removeItem(deviceDraftKey(user?.id, `${storageKey}-${section.key}`)); } catch { /* device storage unavailable */ }
    }
  };
  const markSaved = () => { clearDrafts(); setReason(''); setDirtyKeys(new Set()); };
  const saving = useControlledTextSave(props, sections, handles, { reason, dirtyKeys, markSaved });
  const discard = () => {
    markSaved();
    setDiscardEpoch(epoch => epoch + 1);
  };
  const close = useControlledTextCloseGuard(dirtyKeys.size > 0 || reason.length > 0, saving.busyRef, props.registerBeforeClose, discard);
  const markDirty = React.useCallback((key: string, dirty: boolean) => {
    setDirtyKeys(previous => {
      if (previous.has(key) === dirty) return previous;
      const next = new Set(previous);
      if (dirty) next.add(key); else next.delete(key);
      return next;
    });
  }, []);
  const save = async () => {
    if (!saving.permitted || saving.busyRef.current || saving.reloadRequired || reason.trim().length < 8) return;
    const key = sections?.find(section => dirtyKeys.has(section.key))?.key;
    if (!key) return;
    const saved = await handles.current.get(key)?.save();
    if (!saved && props.isCurrent() && !saving.busyRef.current) saving.setNotice(previous => previous ?? REFUSED);
  };
  if (!saving.permitted) return <p className="qms-controlled-note">Controlled text can be edited by an authorised writer while the document is draft or under review.</p>;
  if (!sections) return <p className="qms-controlled-note" role="alert">The current section structure could not be verified for editing. Reload this record.</p>;
  return <EditorView props={props} sections={sections} reason={reason} setReason={setReason} dirty={dirtyKeys.size > 0}
    discardEpoch={discardEpoch} saving={saving} close={close} handles={handles} markDirty={markDirty} save={save} />;
}

type EditorViewProps = {
  props: ControlledTextEditorProps; sections: ControlledSection[]; reason: string; setReason: (reason: string) => void;
  dirty: boolean; discardEpoch: number; saving: ReturnType<typeof useControlledTextSave>;
  close: ReturnType<typeof useControlledTextCloseGuard>; handles: EditorHandles;
  markDirty: (key: string, dirty: boolean) => void; save: () => Promise<void>;
};
function EditorView({ props, sections, reason, setReason, dirty, discardEpoch, saving, close, handles, markDirty, save }: EditorViewProps) {
  const disabled = saving.busy || saving.reloadRequired || close.open;
  return <div className="qms-controlled-editor">
    <p className="qms-controlled-note">Edit the controlled section bodies for version {props.documentVersion}. Saving returns this document to draft and records your reason. It must be reviewed and approved before anyone can acknowledge it.</p>
    <label className="qms-controlled-reason">
      <span>Reason for controlled-text change</span>
      <textarea aria-label="Reason for controlled-text change" value={reason} maxLength={2000} disabled={disabled}
        onChange={event => setReason(event.target.value)} placeholder="Why this controlled text is changing (at least 8 characters)" />
    </label>
    {saving.notice && <p className="qms-controlled-note" role="alert">{saving.notice}</p>}
    {sections.map((section, index) => <SectionCanvas key={`${section.key}-${discardEpoch}`} section={section} first={index === 0}
      disabled={disabled} storageKey={`${props.storageKey}-${section.key}`} markDirty={markDirty}
      register={handle => { if (handle) handles.current.set(section.key, handle); else handles.current.delete(section.key); }}
      persist={serialized => saving.persist(section.key, serialized)} />)}
    <div className="qms-controlled-actions">
      <button type="button" className="qms-btn primary" disabled={disabled || !dirty || reason.trim().length < 8}
        onClick={() => void save()}>{saving.busy ? 'Saving controlled text…' : 'Save controlled text'}</button>
      {saving.reloadRequired && props.onReload && <button type="button" className="qms-btn" disabled={saving.busy}
        onClick={() => void props.onReload?.()}>Reload record</button>}
    </div>
    {close.open && <DiscardControlledText dialogRef={close.dialogRef} finish={close.finish} />}
  </div>;
}
function DiscardControlledText({ dialogRef, finish }: {
  dialogRef: React.RefObject<HTMLDivElement | null>; finish: (allow: boolean) => void;
}) {
  const titleId = React.useId();
  return <div className="qms-controlled-discard" ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); finish(false); } }}>
    <h3 id={titleId}>Discard unsaved controlled text?</h3>
    <p>Your unsaved text and reason will be discarded. The stored document will remain unchanged.</p>
    <div className="qms-controlled-actions">
      <button type="button" className="qms-btn" onClick={() => finish(false)}>Keep editing</button>
      <button type="button" className="qms-btn" onClick={() => finish(true)}>Discard changes</button>
    </div>
  </div>;
}
function SectionCanvas({ section, first, disabled, storageKey, markDirty, register, persist }: {
  section: ControlledSection; first: boolean; disabled: boolean; storageKey: string;
  markDirty: (key: string, dirty: boolean) => void;
  register: (handle: RichSectionEditorHandle | null) => void;
  persist: (serialized: string) => Promise<void>;
}) {
  const onDirty = React.useCallback((dirty: boolean) => markDirty(section.key, dirty), [markDirty, section.key]);
  return <details className="qms-controlled-section" open={first}>
    <summary>{section.label}</summary>
    {section.hint && <p className="qms-controlled-note">{section.hint}</p>}
    <RichSectionEditor ref={register} value={section.body} format="text" autosaveMs={null} showSaveButton={false}
      onSave={persist} onDirtyChange={onDirty} readOnly={disabled} storageKey={storageKey} ariaLabel={`${section.label} controlled text`} />
  </details>;
}

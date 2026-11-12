import * as React from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { useDialog } from '../v2/useDialog';
import { registerCeremonyOpen } from '../v2/ceremony';
import { ErrorState, type FailedRead } from '../v2/dataConnect';
import { I } from '../v2/icons';
import { shellProgramId, useShellProject } from '../v2/shellProject';
import { DOC_TYPE_LABEL, type DocType, type QmsDoc, type SopTemplate } from './data';
import { QmsRequestError, bindQmsDocument, createQmsDocument, reviseQmsDocument } from './qmsDocuments';

/**
 * Quality's dialogs are the product's one drawer (C15): D0's `.de`, as C2CForm draws it. The drawer has a header with
 * the title, an optional line under it and Close; then the body; then the footer's actions. While it is open it
 * registers as a ceremony, so AnA does not change the screen under a reason someone is writing (v2/ceremony.ts).
 */
export function DialogPanel({ title, sub, onClose, busy, footer, children }: {
  title: string; sub?: React.ReactNode; onClose: () => void; busy: boolean; footer?: React.ReactNode; children?: React.ReactNode;
}) {
  const ref = useDialog(() => { if (!busy) onClose(); });
  React.useEffect(() => registerCeremonyOpen(), []);
  return <div className="de-bd" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={ref} className="de" role="dialog" aria-modal="true" aria-label={title} aria-busy={busy || undefined} tabIndex={-1}>
      <div className="de-h">
        <div><div className="de-h-t">{title}</div>{sub && <div className="de-h-s">{sub}</div>}</div>
        <button type="button" className="de-x" onClick={onClose} aria-label="Close" disabled={busy}>{I.close}</button>
      </div>
      <div className="de-body">{children}</div>
      {footer && <div className="de-f">{footer}</div>}
    </div>
  </div>;
}

/** One field of the drawer, laid out as C2CForm lays its fields: the label, its hint, the control, then its error. */
export function DrawerField({ label, hint, error, children }: {
  label: string; hint?: React.ReactNode; error?: string | null;
  children: React.ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
}) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return <div className="de-field">
    <label className="de-label" htmlFor={id}>{label}</label>
    {hint && <div className="de-desc" id={hintId}>{hint}</div>}
    {React.cloneElement(children, { id, 'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined, ...(error ? { 'aria-invalid': true } : {}) })}
    {error && <div className="de-err" id={errorId} role="alert">{error}</div>}
  </div>;
}

/** The status and code of a read that threw (QmsRequestError, ApiRequestError), so a refusal is said as itself and
 *  offers no retry (C4, C15). An error with no status is a failure to answer, and keeps its Try again. */
export function failedReadOf(err: unknown): FailedRead {
  if (!(err instanceof Error)) return undefined;
  const { status, code } = err as Error & { status?: unknown; code?: unknown };
  return typeof status === 'number' ? { status, code: typeof code === 'string' ? code : null } : undefined;
}

interface Program { id: string; title: string; code?: string }

export function ControlledDocumentSetup({ template, templates = [], document, revision = false, onClose, onCreated, onNavigate }: {
  template?: SopTemplate | null; document?: QmsDoc | null; onClose: () => void;
  templates?: SopTemplate[];
  revision?: boolean;
  onCreated: (id: number) => void; onNavigate?: (target: string) => void;
}) {
  const formId = React.useId();
  const shell = useShellProject();
  const selectedProgram = shellProgramId(shell);
  const [programId, setProgramId] = React.useState(selectedProgram ?? '');
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [programError, setProgramError] = React.useState<{ message: string; read: FailedRead } | null>(null);
  const [retry, setRetry] = React.useState(0);
  const [title, setTitle] = React.useState(document?.title ?? template?.label ?? '');
  const [docType, setDocType] = React.useState<DocType>(document?.docType ?? template?.docType ?? 'sop');
  const [templateKey, setTemplateKey] = React.useState(template?.key ?? '');
  const chosenTemplate = templates.find(t => t.key === templateKey) ?? null;
  const [number, setNumber] = React.useState('');
  const [reviewDate, setReviewDate] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setProgramError(null);
    void (async () => {
      try {
        const choices: Program[] = [];
        let offset = 0;
        for (;;) {
          const res = await apiRequest('GET', `/api/c2c/projects?limit=200&offset=${offset}`);
          const body = await res.json().catch(() => null) as { data?: Program[]; code?: string; meta?: { hasMore?: boolean; pendingStore?: boolean } } | null;
          if (!res.ok) throw new QmsRequestError(serverMessage(body) ?? 'Projects could not be read. Try again.', res.status, typeof body?.code === 'string' ? body.code : undefined);
          if (!body || !Array.isArray(body.data) || body.meta?.pendingStore || body.data.some(p => typeof p?.id !== 'string' || typeof p.title !== 'string')) {
            throw new Error('Projects could not be read. Try again.');
          }
          choices.push(...body.data);
          if (!body.meta?.hasMore) break;
          if (!body.data.length) throw new Error('Projects could not be read. Try again.');
          offset += body.data.length;
          if (cancelled) return;
        }
        if (!cancelled) {
          setPrograms(choices);
          setProgramId(current => choices.some(p => p.id === current) ? current : '');
        }
      } catch (err) {
        if (!cancelled) setProgramError({ message: redactInternals(err instanceof Error ? err.message : '', 'Projects could not be read. Try again.'), read: failedReadOf(err) });
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [retry]);
  const valid = title.trim().length > 0 && reason.trim().length >= 8 && programs.some(p => p.id === programId) && !loading && !programError;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!valid || busy) return;
    setBusy(true); setError(null);
    try {
      const input = { programId, reason: reason.trim(), ...(templateKey ? { templateKey } : {}) };
      const row = document ? revision ? await reviseQmsDocument(document.id, input.reason, input) : await bindQmsDocument(document.id, input) : await createQmsDocument({ ...input,
        title: title.trim(), docType, ...(number.trim() ? { docNumber: number.trim() } : {}), ...(reviewDate ? { nextReviewDate: reviewDate } : {}) });
      onCreated(row.id);
    } catch (err) {
      setError(redactInternals(err instanceof Error ? err.message : '', 'The document change could not be confirmed. Reload the register before trying again.'));
    } finally { setBusy(false); }
  };
  const footer = <>
    <button type="button" className="de-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
    <button type="submit" form={formId} className="de-btn primary" disabled={!valid || busy}>{busy ? 'Saving…' : revision ? 'Create revision and open' : document ? 'Set up and open' : 'Create and open'}</button>
  </>;
  return <DialogPanel title={revision ? 'Start authored revision' : document ? 'Set up editing copy' : 'New controlled document'} busy={busy} onClose={onClose} footer={footer}
    sub={revision ? 'Choose a project and template for the next revision. The earlier registry record is retained; no authored content is claimed for it.' : document ? 'Choose the project for this draft’s editing copy. The existing register entry is retained.' :
      'Choose a project for the editing copy, then write and save its sections before sending it for review.'}>
    {template && <p className="de-desc">Template: {template.label}</p>}
    <form id={formId} onSubmit={event => void submit(event)}>
      <DrawerField label="Project">
        <select className="de-select" value={programId} onChange={event => setProgramId(event.target.value)} disabled={loading || busy || !!programError} required>
          <option value="">{loading ? 'Loading projects…' : 'Choose a project'}</option>
          {programs.map(p => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.title}</option>)}
        </select>
      </DrawerField>
      {programError && <ErrorState variant="inline" title="Projects could not be read" message={programError.message} read={programError.read} readWhat="the projects"
        retry={() => setRetry(n => n + 1)} testId="qms-setup-projects-failed" />}
      {!loading && !programError && programs.length === 0 && <p className="de-desc">No projects are available. Create a project in Projects to begin.
        {onNavigate && <> <button type="button" className="btn ghost small" onClick={() => { onClose(); onNavigate('projects'); }}>Open Projects</button></>}</p>}
      <DrawerField label="Title">
        <input className="de-input" value={title} onChange={event => setTitle(event.target.value)} maxLength={300} required readOnly={!!document} disabled={busy} />
      </DrawerField>
      {/* The document types are this field (D7-B, RULE 4): the nine library cards that
          opened this dialog per type went on 2026-11-06. Each option names its number
          prefix; the chosen one's description is the line beneath; and choosing one
          names an untitled document after it, as the card did. */}
      {!template && <DrawerField label="Template" hint={chosenTemplate?.description || undefined}>
        <select className="de-select" value={templateKey} disabled={busy} onChange={event => {
          setTemplateKey(event.target.value);
          const selected = templates.find(t => t.key === event.target.value);
          if (selected) setDocType(selected.docType);
          if (selected && !document && (title.trim() === '' || templates.some(t => t.label === title))) setTitle(selected.label);
        }}>
          <option value="">Standard controlled-document sections</option>
          {templates.filter(t => !document || t.docType === document.docType).map(t => <option key={t.key} value={t.key}>{t.numberPrefix ? `${t.label} (${t.numberPrefix})` : t.label}</option>)}
        </select>
      </DrawerField>}
      {!document && <>
        <DrawerField label="Document type">
          <select className="de-select" value={docType} onChange={event => { setDocType(event.target.value as DocType); setTemplateKey(''); }} disabled={busy || !!template}>
            {(Object.entries(DOC_TYPE_LABEL) as [DocType, string][]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </DrawerField>
        <DrawerField label="Document number (optional)">
          <input className="de-input" value={number} onChange={event => setNumber(event.target.value)} maxLength={60} placeholder="Assign the next number automatically" disabled={busy} />
        </DrawerField>
        <DrawerField label="Next periodic review (optional)" hint="Once effective, the document is listed for review from this date. Leave it empty and no periodic review is scheduled.">
          <input className="de-input" type="date" value={reviewDate} min={new Date().toISOString().slice(0, 10)}
            onChange={event => setReviewDate(event.target.value)} disabled={busy} />
        </DrawerField>
      </>}
      <DrawerField label="Reason" hint={`Use at least 8 characters to state why this document is being ${document ? 'set up for authoring' : 'created'}.`}>
        <textarea className="de-textarea" rows={3} value={reason} onChange={event => setReason(event.target.value)} minLength={8} maxLength={2000} required disabled={busy} />
      </DrawerField>
      {error && <div className="de-err" role="alert">{error}</div>}
    </form>
  </DialogPanel>;
}

export function ControlledDocumentReason({ title, description, action, onClose, onSubmit }: {
  title: string; description: string; action: string; onClose: () => void; onSubmit: (reason: string) => Promise<void>;
}) {
  const formId = React.useId();
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || reason.trim().length < 8) return;
    setBusy(true); setError(null);
    try { await onSubmit(reason.trim()); }
    catch (err) { setError(redactInternals(err instanceof Error ? err.message : '', 'The document change could not be confirmed. Reload the register before trying again.')); }
    finally { setBusy(false); }
  };
  const footer = <>
    <button type="button" className="de-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
    <button type="submit" form={formId} className="de-btn primary" disabled={busy || reason.trim().length < 8}>{busy ? 'Saving…' : action}</button>
  </>;
  return <DialogPanel title={title} sub={description} onClose={onClose} busy={busy} footer={footer}>
    <form id={formId} onSubmit={event => void submit(event)}>
      <DrawerField label="Reason" hint="State the reason in at least 8 characters. The reason is kept with the change.">
        <textarea className="de-textarea" rows={3} value={reason} onChange={event => setReason(event.target.value)} minLength={8} maxLength={2000} required disabled={busy} />
      </DrawerField>
      {error && <div className="de-err" role="alert">{error}</div>}
    </form>
  </DialogPanel>;
}

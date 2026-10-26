import * as React from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { useDialog } from '../v2/useDialog';
import { shellProgramId, useShellProject } from '../v2/shellProject';
import { DOC_TYPE_LABEL, type DocType, type QmsDoc, type SopTemplate } from './data';
import { bindQmsDocument, createQmsDocument, reviseQmsDocument } from './qmsDocuments';

export function DialogPanel({ title, onClose, busy, children }: {
  title: string; onClose: () => void; busy: boolean; children: React.ReactNode;
}) {
  const ref = useDialog(() => { if (!busy) onClose(); });
  return <div className="qms-dialog-backdrop">
    <div ref={ref} className="qms-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      <h2>{title}</h2>{children}
    </div>
  </div>;
}
interface Program { id: string; title: string; code?: string }

export function ControlledDocumentSetup({ template, templates = [], document, revision = false, onClose, onCreated, onNavigate }: {
  template?: SopTemplate | null; document?: QmsDoc | null; onClose: () => void;
  templates?: SopTemplate[];
  revision?: boolean;
  onCreated: (id: number) => void; onNavigate?: (target: string) => void;
}) {
  const shell = useShellProject();
  const selectedProgram = shellProgramId(shell);
  const [programId, setProgramId] = React.useState(selectedProgram ?? '');
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [programError, setProgramError] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  const [title, setTitle] = React.useState(document?.title ?? template?.label ?? '');
  const [docType, setDocType] = React.useState<DocType>(document?.docType ?? template?.docType ?? 'sop');
  const [templateKey, setTemplateKey] = React.useState(template?.key ?? '');
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
          const body = await res.json().catch(() => null) as { data?: Program[]; meta?: { hasMore?: boolean; pendingStore?: boolean } } | null;
          if (!res.ok) throw new Error(serverMessage(body) ?? 'Projects could not be read. Try again.');
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
        if (!cancelled) setProgramError(redactInternals(err instanceof Error ? err.message : '', 'Projects could not be read. Try again.'));
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
  return <DialogPanel title={revision ? 'Start authored revision' : document ? 'Set up editing copy' : 'New controlled document'} busy={busy} onClose={onClose}>
    <p>{revision ? 'Choose a project and template for the next revision. The earlier registry record is retained; no authored content is claimed for it.' : document ? 'Choose the project for this draft’s editing copy. The existing register entry is retained.' :
      'Choose a project for the editing copy, then write and save its sections before sending it for review.'}</p>
    {template && <p>Template: {template.label}</p>}
    <form onSubmit={event => void submit(event)}>
      <label>Project<select value={programId} onChange={event => setProgramId(event.target.value)} disabled={loading || busy || !!programError} required>
        <option value="">{loading ? 'Loading projects…' : 'Choose a project'}</option>
        {programs.map(p => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.title}</option>)}
      </select></label>
      {programError && <div role="alert">{programError} <button type="button" className="qms-btn ghost" onClick={() => setRetry(n => n + 1)}>Try again</button></div>}
      {!loading && !programError && programs.length === 0 && <p>No projects are available. Create a project in Projects to begin.
        {onNavigate && <button type="button" className="qms-btn ghost" onClick={() => { onClose(); onNavigate('projects'); }}>Open Projects</button>}</p>}
      <label>Title<input value={title} onChange={event => setTitle(event.target.value)} maxLength={300} required readOnly={!!document} disabled={busy} /></label>
      {!template && <label>Template<select value={templateKey} disabled={busy} onChange={event => {
        setTemplateKey(event.target.value);
        const selected = templates.find(t => t.key === event.target.value);
        if (selected) setDocType(selected.docType);
      }}>
        <option value="">Standard controlled-document sections</option>
        {templates.filter(t => !document || t.docType === document.docType).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
      </select></label>}
      {!document && <>
        <label>Document type<select value={docType} onChange={event => { setDocType(event.target.value as DocType); setTemplateKey(''); }} disabled={busy || !!template}>
          {(Object.entries(DOC_TYPE_LABEL) as [DocType, string][]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Document number (optional)<input value={number} onChange={event => setNumber(event.target.value)} maxLength={60} placeholder="Assign the next number automatically" disabled={busy} /></label>
        <label>Next periodic review (optional)<input type="date" value={reviewDate} min={new Date().toISOString().slice(0, 10)}
          onChange={event => setReviewDate(event.target.value)} disabled={busy} /></label>
        <p className="qms-dialog-hint">Once effective, the document is listed for review from this date. Leave it empty and no periodic review is scheduled.</p>
      </>}
      <label>Reason<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={8} maxLength={2000} required disabled={busy} /></label>
      <p className="qms-dialog-hint">Use at least 8 characters to state why this document is being {document ? 'set up for authoring' : 'created'}.</p>
      {error && <div role="alert">{error}</div>}
      <div className="qms-dialog-actions"><button type="button" className="qms-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="qms-btn primary" disabled={!valid || busy}>{busy ? 'Saving…' : revision ? 'Create revision and open' : document ? 'Set up and open' : 'Create and open'}</button></div>
    </form>
  </DialogPanel>;
}

export function ControlledDocumentReason({ title, description, action, onClose, onSubmit }: {
  title: string; description: string; action: string; onClose: () => void; onSubmit: (reason: string) => Promise<void>;
}) {
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
  return <DialogPanel title={title} onClose={onClose} busy={busy}>
    <p>{description}</p><form onSubmit={event => void submit(event)}>
      <label>Reason<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={8} maxLength={2000} required disabled={busy} /></label>
      <p className="qms-dialog-hint">State the reason in at least 8 characters. The reason is kept with the change.</p>
      {error && <div role="alert">{error}</div>}
      <div className="qms-dialog-actions"><button type="button" className="qms-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="qms-btn primary" disabled={busy || reason.trim().length < 8}>{busy ? 'Saving…' : action}</button></div>
    </form>
  </DialogPanel>;
}

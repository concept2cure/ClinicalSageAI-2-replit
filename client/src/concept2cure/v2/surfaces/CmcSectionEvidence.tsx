/**
 * The records a Module 3 section reads, and the Vault document each was taken
 * from (row D2; server/services/cmc/source-evidence.ts holds the rules).
 *
 * A batch's results, a specification, a stability study were typed into the
 * registers and composed into Module 3, while the certificate of analysis or
 * report they came from sat in the program's Vault — where the Data Room files
 * its captures — with nothing recorded between them. Here a person links each
 * record to the current Vault version it was taken from, with a reason, and
 * sees when that version has since been superseded or withdrawn: the export
 * gate and the approval hold the section until the record is re-verified and
 * the link moved.
 *
 * Every read renders its loading, error or empty state honestly; every write is
 * awaited, shows the server's own sentence when refused, and reloads the read
 * rather than assuming what the write did.
 */
import React from 'react';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import { apiRequest } from '@/lib/queryClient';
import { EmptyState, useLiveRows, type ListState } from '../dataConnect';
import { cmcWriteError } from './cmcShared';

export interface EvidenceLinkRow {
  id: string;
  sourceKey: string;
  documentId: string;
  title: string | null;
  version: string | null;
  contentHash: string;
  state: 'current' | 'superseded' | 'withdrawn';
  currentVersion: string | null;
  reason: string;
  linkedAt: string;
  linkedBy: string | null;
}

export interface EvidenceSourceRow {
  sourceObjectId: string;
  sourceType: string;
  sourceKey: string;
  label: string;
  evidence: EvidenceLinkRow[];
}

export interface LinkableDocumentRow {
  documentId: string;
  title: string | null;
  version: string | null;
  ctdSection: string | null;
  documentType: string | null;
  documentKind: string | null;
}

const STATE_CHIP: Record<EvidenceLinkRow['state'], { tone: string; label: string }> = {
  current: { tone: 'ok', label: 'current version' },
  superseded: { tone: 'warn', label: 'superseded' },
  withdrawn: { tone: 'err', label: 'withdrawn' },
};

/** The reason floor the server applies (governed-reason): stated, not a placeholder. */
const REASON_MIN = 8;

function docName(d: { title: string | null; version: string | null }): string {
  return `${d.title || 'Untitled document'} — version ${d.version ?? '?'}`;
}

function fmtWhen(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

type Write = (path: string, body: Record<string, unknown>, done: string) => Promise<boolean>;

function LinkForm({ source, docs, write, onDone }: {
  source: EvidenceSourceRow;
  docs: ListState<LinkableDocumentRow>;
  write: Write;
  onDone: () => void;
}) {
  const [documentId, setDocumentId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const uid = React.useId();
  const linked = new Set(source.evidence.map((e) => e.documentId));
  const choices = docs.rows.filter((d) => !linked.has(d.documentId));
  const ready = documentId !== '' && reason.trim().length >= REASON_MIN;
  const submit = async () => {
    if (!ready) return;
    const ok = await write('', { sourceKey: source.sourceKey, documentId, reason: reason.trim() }, `Linked to ${source.label}.`);
    if (ok) onDone();
  };
  if (docs.loading) return <div role="status" className="cm-meta">Loading the program’s Vault documents…</div>;
  if (docs.error) return <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load the program’s Vault documents" hint={docs.error} />;
  if (choices.length === 0) {
    return (
      <EmptyState
        icon={I.folder}
        title="No current Vault document to link"
        hint="File the certificate, report or record into this program’s Vault first — from the Data Room’s File into Vault, or an upload on the Vault page."
      />
    );
  }
  return (
    <div data-testid={`m3-evidence-link-form-${source.sourceKey}`}>
      <div className="de-field">
        <label className="de-label" htmlFor={`${uid}-doc`}>Vault document it was taken from</label>
        <select id={`${uid}-doc`} className="de-select" value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
          <option value="">Choose a current version…</option>
          {choices.map((d) => (
            <option key={d.documentId} value={d.documentId}>
              {docName(d)}{d.ctdSection ? ` · ${d.ctdSection}` : ''}{d.documentKind ? ` · ${d.documentKind}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="de-field">
        <label className="de-label" htmlFor={`${uid}-reason`}>Reason</label>
        <textarea
          id={`${uid}-reason`}
          className="de-textarea"
          rows={2}
          value={reason}
          placeholder="e.g. Results transcribed from the CDMO certificate of analysis."
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="de-f">
        <button className="de-btn ghost" onClick={onDone}>Cancel</button>
        <button className="de-btn primary" onClick={() => void submit()} disabled={!ready}>{I.lock} Link document</button>
      </div>
    </div>
  );
}

function UnlinkForm({ link, write, onDone }: { link: EvidenceLinkRow; write: Write; onDone: () => void }) {
  const [reason, setReason] = React.useState('');
  const uid = React.useId();
  const ready = reason.trim().length >= REASON_MIN;
  const submit = async () => {
    if (!ready) return;
    const ok = await write(`/${encodeURIComponent(link.id)}/unlink`, { reason: reason.trim() }, 'Evidence link removed. Its record is kept.');
    if (ok) onDone();
  };
  return (
    <div data-testid={`m3-evidence-unlink-form-${link.id}`}>
      <div className="de-field">
        <label className="de-label" htmlFor={`${uid}-reason`}>Reason for removing this link</label>
        <textarea id={`${uid}-reason`} className="de-textarea" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="de-f">
        <button className="de-btn ghost" onClick={onDone}>Cancel</button>
        <button className="de-btn primary" onClick={() => void submit()} disabled={!ready}>{I.lock} Remove link</button>
      </div>
    </div>
  );
}

function EvidenceItem({ link, write }: { link: EvidenceLinkRow; write: Write }) {
  const [removing, setRemoving] = React.useState(false);
  const chip = STATE_CHIP[link.state];
  return (
    <li>
      <div className="cm-prov-h">
        <span>{I.paperclip} {docName(link)}</span>
        <span className={'rd-chip tone-' + chip.tone}>{chip.label}</span>
      </div>
      {link.state === 'superseded' && (
        <div className="cm-meta" role="note">
          Version {link.currentVersion ?? '?'} has replaced it. Verify this record against the current version, then link
          that version — the earlier link is moved, with your reason.
        </div>
      )}
      {link.state === 'withdrawn' && (
        <div className="cm-meta" role="note">This version was withdrawn from the Vault. Link the document the record now rests on, or remove this link.</div>
      )}
      <div className="cm-meta">“{link.reason}” — {link.linkedBy || 'unknown user'}, {fmtWhen(link.linkedAt)}</div>
      {removing ? (
        <UnlinkForm link={link} write={write} onDone={() => setRemoving(false)} />
      ) : (
        <button className="nda-open" onClick={() => setRemoving(true)}>Remove link</button>
      )}
    </li>
  );
}

function EvidenceRecord({ source, docs, write }: {
  source: EvidenceSourceRow;
  docs: ListState<LinkableDocumentRow>;
  write: Write;
}) {
  const [linking, setLinking] = React.useState(false);
  return (
    <li data-testid={`m3-evidence-record-${source.sourceKey}`}>
      <div className="cm-prov-h">
        <strong>{source.label}</strong>
        <span className="cm-meta mono">{source.sourceKey}</span>
      </div>
      {source.evidence.length === 0 ? (
        <div className="cm-meta">No Vault document is linked to this record.</div>
      ) : (
        <ul className="cm-list">
          {source.evidence.map((e) => <EvidenceItem key={e.id} link={e} write={write} />)}
        </ul>
      )}
      {linking ? (
        <LinkForm source={source} docs={docs} write={write} onDone={() => setLinking(false)} />
      ) : (
        <button className="nda-open" onClick={() => setLinking(true)}>{I.link} Link Vault document</button>
      )}
    </li>
  );
}

export function SectionEvidence({ projectId, sectionKey, sectionLabel, onClose, onChanged }: {
  projectId: string;
  sectionKey: string;
  sectionLabel: string;
  onClose: () => void;
  /** The board's reload: a link changes what the gate and readiness say. */
  onChanged: () => void;
}) {
  const [tick, setTick] = React.useState(0);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const base = '/api/cmc/module3-os/source-evidence/' + encodeURIComponent(projectId);
  const sources = useLiveRows<EvidenceSourceRow>(`${base}?sectionKey=${encodeURIComponent(sectionKey)}`, [base, sectionKey, tick]);
  const docs = useLiveRows<LinkableDocumentRow>(`${base}/documents`, [base, tick]);
  const dlgRef = useDialog(onClose);

  const write: Write = async (path, body, done) => {
    setMessage(null);
    try {
      const res = await apiRequest('POST', base + path, body);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({ tone: 'error', text: `Nothing was changed — ${cmcWriteError(json, res.status)}` });
        return false;
      }
      setMessage({ tone: 'ok', text: done });
      setTick((n) => n + 1);
      onChanged();
      return true;
    } catch {
      setMessage({ tone: 'error', text: 'The change could not be sent. Check your connection; nothing was changed.' });
      return false;
    }
  };

  return (
    <div className="de-bd" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="de" ref={dlgRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={'Evidence for section ' + sectionKey}>
        <div className="de-h">
          <div>
            <div className="de-h-eye">Module 3 — evidence from the Vault</div>
            <div className="de-h-t">§{sectionKey}</div>
            <div className="de-h-s">{sectionLabel}</div>
          </div>
          <button className="de-x" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        <div className="de-body" data-testid="m3-evidence">
          <div className="de-gov">
            <span className="ico">{I.lock}</span>
            <span className="de-gov-t">
              Each link records the document version, its content hash and your reason, and is written to that document’s
              Vault history against your account. A link is removed with a reason, never erased.
            </span>
          </div>
          {message && (
            <div className={message.tone === 'error' ? 'de-err' : 'cm-meta'} role={message.tone === 'error' ? 'alert' : 'status'}>
              {message.text}
            </div>
          )}
          {sources.loading ? (
            <div role="status" className="cm-meta">Loading the records this section reads…</div>
          ) : sources.error ? (
            <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load this section’s records" hint={sources.error} />
          ) : sources.rows.length === 0 ? (
            <EmptyState
              icon={I.fileText}
              title="No CMC records feed this section yet"
              hint="Record the data in the CMC registers; each record then appears here to be linked to the document it came from."
            />
          ) : (
            <ol className="cm-prov">
              {sources.rows.map((s) => <EvidenceRecord key={s.sourceKey} source={s} docs={docs} write={write} />)}
            </ol>
          )}
        </div>
        <div className="de-f">
          <button className="de-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/** One deliberate, preview-bound decision for a project file and its extracted data. */
import React, { useEffect, useRef, useState } from 'react';
import type { DocumentDispositionChoice, DocumentDispositionPreview, DocumentDispositionRequest, DocumentDispositionTargetType } from '@shared/document-data-disposition';
import { DOCUMENT_DISPOSITION_REASON_MIN, DOCUMENT_DISPOSITION_REASON_MAX } from '@shared/document-data-disposition';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';

interface Props {
  projectId: string;
  targetType: DocumentDispositionTargetType;
  targetId: string;
  title: string;
  existingChoice?: DocumentDispositionChoice | null;
  onChanged: () => void;
}

const CHOICES: Record<DocumentDispositionChoice, { label: string; description: string }> = {
  keep_data: { label: 'Remove file; retain extracted data', description: 'The original becomes unavailable for use. Extracted data remains eligible, linked to its recorded source and hash.' },
  remove_data: { label: 'Remove file and withdraw extracted data', description: 'The data is excluded from active catalog and retrieval use. Earlier citations and the audit record remain for review.' },
  supersede: { label: 'Replace with a named newer document', description: 'The earlier data is excluded from active use and linked to the exact replacement. Existing drafts are not rewritten.' },
};
const COUNTS = {
  extractedTexts: 'Extracted texts', chunks: 'Retrieval passages', atoms: 'Evidence values',
  catalogValues: 'Catalog values', citations: 'Recorded citations', downstreamReferences: 'Downstream references',
} as const;
const count = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;
const hash = (s: unknown): s is string => typeof s === 'string' && /^[a-f0-9]{64}$/i.test(s);

function matchingTarget(p: DocumentDispositionPreview['target'] | undefined, type: DocumentDispositionTargetType, id: string): boolean {
  return p?.type === type && p.id === id && typeof p.title === 'string' && hash(p.sha256);
}
function knownCounts(p: DocumentDispositionPreview): boolean {
  return Boolean(p.counts) && Object.keys(COUNTS).every(k => count(p.counts[k as keyof typeof COUNTS]));
}
function knownRetention(p: DocumentDispositionPreview): boolean {
  return count(p.retention?.legalHolds) && p.retention?.physicalErasure === false &&
    (p.retention.retentionUntil === null || Number.isFinite(Date.parse(p.retention.retentionUntil))) && count(p.approvals?.active);
}
function knownLinks(p: DocumentDispositionPreview): boolean {
  return Array.isArray(p.linkedIds?.capturedSourceIds) && p.linkedIds.capturedSourceIds.every(n => count(n) && n > 0) &&
    ['vaultDocumentIds', 'artifactIds', 'uploadIds'].every(k => Array.isArray(p.linkedIds[k as keyof typeof p.linkedIds]) && p.linkedIds[k as keyof typeof p.linkedIds].every(n => typeof n === 'string' && n.length > 0));
}
function knownDecisionMetadata(p: DocumentDispositionPreview): boolean {
  return Array.isArray(p.blockers) && p.blockers.every(b => typeof b === 'string') &&
    Array.isArray(p.allowedChoices) && p.allowedChoices.every(c => Object.hasOwn(CHOICES, c)) &&
    typeof p.previewToken === 'string' && p.previewToken.length > 0 && Number.isFinite(Date.parse(p.expiresAt));
}

/** A partial impact read cannot authorize a decision or quietly show zero. */
function usablePreview(value: unknown, type: DocumentDispositionTargetType, id: string, replacementId: string): value is DocumentDispositionPreview {
  if (!value || typeof value !== 'object') return false;
  const p = value as DocumentDispositionPreview;
  return matchingTarget(p.target, type, id) && knownCounts(p) && knownRetention(p) && knownLinks(p) && knownDecisionMetadata(p) &&
    (replacementId ? matchingTarget(p.replacement ?? undefined, type, replacementId) : p.replacement === null);
}

function decisionReady({ preview, choice, reason, replacementDraft, replacementId, busy, expired }: {
  preview: DocumentDispositionPreview | null; choice: DocumentDispositionChoice | ''; reason: string;
  replacementDraft: string; replacementId: string; busy: boolean; expired: boolean;
}): boolean {
  if (!preview || !choice || busy || expired) return false;
  const validReplacement = choice !== 'supersede' || Boolean(replacementId && replacementDraft.trim() === replacementId && preview.replacement?.id === replacementId);
  return Date.parse(preview.expiresAt) > Date.now() && preview.allowedChoices.includes(choice) && preview.blockers.length === 0 &&
    (!preview.currentDisposition || preview.currentDisposition.choice === 'keep_data') && reason.trim().length >= DOCUMENT_DISPOSITION_REASON_MIN && validReplacement;
}
function recordedDecision(value: unknown, request: DocumentDispositionRequest): boolean {
  const r = value as { id?: string; choice?: string; target?: { id?: string; type?: string }; auditReceipt?: { id?: string; sha256Chain?: string } } | null;
  return Boolean(r?.id && r.choice === request.choice && r.target?.id === request.targetId && r.target.type === request.targetType &&
    r.auditReceipt?.id && hash(r.auditReceipt.sha256Chain));
}

function displayFailure(error: unknown, fallback: string): string {
  return redactInternals(error instanceof Error ? error.message : String(error), fallback);
}

function useDisposition({ projectId, targetType, targetId, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<DocumentDispositionPreview | null>(null);
  const [choice, setChoice] = useState<DocumentDispositionChoice | ''>('');
  const [reason, setReason] = useState('');
  const [replacementDraft, setReplacementDraft] = useState('');
  const [replacementId, setReplacementId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expired, setExpired] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);
  const sequence = useRef(0);
  const pendingWrite = useRef(false);
  const path = `/api/c2c/projects/${encodeURIComponent(projectId)}/document-dispositions`;

  useEffect(() => () => { sequence.current++; }, [projectId, targetType, targetId]);
  useEffect(() => {
    setExpired(false);
    if (!preview) return;
    const ms = Date.parse(preview.expiresAt) - Date.now();
    if (ms <= 0) { setExpired(true); return; }
    const timer = window.setTimeout(() => setExpired(true), ms);
    return () => window.clearTimeout(timer);
  }, [preview]);

  const load = async (replacement = '') => {
    const seq = ++sequence.current;
    setLoading(true); setPreview(null); setNote(null); setReplacementId(replacement);
    try {
      const query = new URLSearchParams({ targetType, targetId });
      if (replacement) query.set('replacementId', replacement);
      const res = await apiRequest('GET', `${path}/preview?${query}`);
      const body = await res.json().catch(() => null);
      if (seq !== sequence.current) return;
      if (!res.ok) throw new Error(serverMessage(body) ?? 'The removal impact could not be read.');
      if (!usablePreview(body?.preview, targetType, targetId, replacement)) throw new Error('The impact read was incomplete or did not match this document. Reload it before making a decision.');
      setPreview(body.preview);
    } catch (e) {
      if (seq === sequence.current) setNote({ error: true, text: displayFailure(e, 'The removal impact could not be read.') });
    } finally { if (seq === sequence.current) setLoading(false); }
  };
  const start = () => {
    setOpen(true); setChoice(''); setReason(''); setReplacementDraft('');
    void load();
  };
  const cancel = () => {
    sequence.current++; setOpen(false); setPreview(null); setNote(null); setLoading(false);
  };
  const choose = (next: DocumentDispositionChoice) => {
    setChoice(next); setNote(null);
    if (next === 'supersede') {
      sequence.current++; setPreview(null); setLoading(false); setReplacementId('');
    } else if (replacementId || choice === 'supersede') { setReplacementDraft(''); void load(); }
  };
  const canConfirm = decisionReady({ preview, choice, reason, replacementDraft, replacementId, busy: saving || loading, expired });

  const confirm = async () => {
    if (pendingWrite.current || !canConfirm || !preview || !choice || Date.parse(preview.expiresAt) <= Date.now()) return;
    pendingWrite.current = true;
    const seq = ++sequence.current;
    setSaving(true); setNote(null);
    const request: DocumentDispositionRequest = { targetType, targetId, choice, reason: reason.trim(), previewToken: preview.previewToken,
      ...(choice === 'supersede' ? { replacementId } : {}) };
    try {
      const res = await apiRequest('POST', path, request);
      const body = await res.json().catch(() => null);
      if (seq !== sequence.current) return;
      if (!res.ok) throw new Error(serverMessage(body) ?? 'The decision was refused. Reload the impact before retrying.');
      if (!recordedDecision(body?.disposition, request)) {
        throw new Error('The response did not confirm a recorded decision. Reload the document before retrying.');
      }
      setOpen(false); setPreview(null);
      setNote({ error: false, text: `${CHOICES[choice].label} — recorded with your reason and its audit receipt.` });
      onChanged();
    } catch (e) {
      if (seq !== sequence.current) return;
      // Every refusal invalidates the preview, including a server-side stale
      // token. A repeated click cannot replay a preview the server refused.
      setPreview(null);
      setNote({ error: true, text: displayFailure(e, 'The decision was not confirmed. Reload the impact before retrying.') });
    } finally {
      pendingWrite.current = false;
      if (seq === sequence.current) setSaving(false);
    }
  };

  const editReplacement = (value: string) => { setReplacementDraft(value); sequence.current++; setPreview(null); setLoading(false); };
  return { open, preview, choice, reason, setReason, replacementDraft, loading, saving, expired, note, load, start, cancel, choose, canConfirm, confirm, editReplacement };
}

function DispositionImpact({ preview }: { preview: DocumentDispositionPreview }) {
  return <>
    <div className="vd-d-filing-row"><span className="k">Document</span><span className="v">{preview.target.title}</span></div>
    <div className="vd-d-filing-row"><span className="k">SHA-256</span><span className="v mono" style={{ overflowWrap: 'anywhere' }}>{preview.target.sha256}</span></div>
    <dl style={{ margin: '8px 0', fontSize: 12 }}>
      {Object.entries(COUNTS).map(([key, label]) => <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><dt>{label}</dt><dd>{preview.counts[key as keyof typeof COUNTS].toLocaleString()}</dd></div>)}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><dt>Active approvals</dt><dd>{preview.approvals.active}</dd></div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><dt>Legal holds</dt><dd>{preview.retention.legalHolds}</dd></div>
    </dl>
    <p className="sec-sub">Retention until: {preview.retention.retentionUntil ? new Date(preview.retention.retentionUntil).toLocaleString() : 'No date recorded'}. Linked original files: {preview.linkedIds.uploadIds.length}; captured sources: {preview.linkedIds.capturedSourceIds.length}; Vault versions: {preview.linkedIds.vaultDocumentIds.length}.</p>
    <p className="sec-sub">Existing citations and downstream references are preserved for review. This decision does not approve data or rewrite a draft.</p>
    {preview.blockers.length > 0 && <div role="alert"><strong>Removal is blocked.</strong><ul>{preview.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul></div>}
    {preview.currentDisposition && <p role="status">{preview.currentDisposition.choice === 'keep_data'
      ? 'The earlier retention decision and its receipt remain recorded. Withdrawing or replacing the retained data adds a new decision and reason.'
      : 'A terminal decision is already recorded for this document. Reload the project to see it.'}</p>}
    {preview.replacement && <p>Replacement: <strong>{preview.replacement.title}</strong> · {preview.replacement.id}<br /><span className="mono" style={{ overflowWrap: 'anywhere' }}>{preview.replacement.sha256}</span></p>}
  </>;
}

function DispositionForm({ actions: a, title, targetType, targetId }: { actions: ReturnType<typeof useDisposition>; title: string; targetType: DocumentDispositionTargetType; targetId: string }) {
  return <section aria-label={`Removal decision for ${title}`} className="vd-d-filing" style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
      <strong>File and extracted data</strong>
      <p className="sec-sub">Choose what happens to the data this file contributed. The decision preserves source identities, hashes and the audit trail. Physical erasure follows the retention process.</p>
      {a.loading && <p role="status">Reading linked data and downstream impact…</p>}
      {a.preview && <DispositionImpact preview={a.preview} />}
      {a.expired && <p role="alert">This preview has expired. Reload the impact before confirming.</p>}
      <fieldset disabled={a.saving || a.loading} style={{ border: 0, padding: 0, margin: '10px 0' }}>
        <legend>Choose the data decision</legend>
        {(Object.keys(CHOICES) as DocumentDispositionChoice[]).map(c => <label key={c} style={{ display: 'block', margin: '8px 0', fontSize: 12 }}>
          <input type="radio" name={`disposition-${targetType}-${targetId}`} checked={a.choice === c}
            disabled={c !== 'supersede' && Boolean(a.preview && !a.preview.allowedChoices.includes(c))} onChange={() => a.choose(c)} /> {CHOICES[c].label}
          <span className="sec-sub" style={{ display: 'block', marginLeft: 20 }}>{CHOICES[c].description}</span>
        </label>)}
      </fieldset>
      {a.choice === 'supersede' && <label style={{ display: 'block', fontSize: 12 }}>Exact replacement document ID
        <input aria-label="Exact replacement document ID" className="vd-d-filing-reason" value={a.replacementDraft} disabled={a.saving} onChange={e => a.editReplacement(e.target.value)} />
        <span className="sec-sub" style={{ display: 'block' }}>Name the recorded document in this project. Review its identity and hash below before confirming.</span>
      </label>}
      <label style={{ display: 'block', fontSize: 12, marginTop: 8 }}>Reason for this decision
        <textarea className="vd-d-filing-reason" value={a.reason} disabled={a.saving} maxLength={DOCUMENT_DISPOSITION_REASON_MAX} onChange={e => a.setReason(e.target.value)} rows={3} />
      </label>
      <p className="sec-sub">At least {DOCUMENT_DISPOSITION_REASON_MIN} characters; recorded with the decision.</p>
      <div className="vd-d-filing-acts">
        <button className="sp-ask" disabled={a.saving || a.loading || a.choice === 'supersede' && !a.replacementDraft.trim()} onClick={() => void a.load(a.choice === 'supersede' ? a.replacementDraft.trim() : '')}>{a.choice === 'supersede' ? 'Review replacement and impact' : 'Reload impact'}</button>
        <button className="sp-primary" disabled={!a.canConfirm} onClick={() => void a.confirm()}>{a.saving ? 'Recording…' : 'Confirm this decision'}</button>
        <button className="sp-ask" disabled={a.saving} onClick={a.cancel}>Cancel</button>
      </div>
    </section>;
}

function DocumentDispositionForTarget(props: Props) {
  const a = useDisposition(props);
  return <div style={{ marginTop: 8 }}>
    {!a.open && <button className="sp-ask" onClick={a.start} aria-label={`Review removal of ${props.title}`}>{props.existingChoice === 'keep_data' ? 'Manage retained data' : 'Review file removal'}</button>}
    {a.open && <DispositionForm actions={a} title={props.title} targetType={props.targetType} targetId={props.targetId} />}
    {a.note && <p role={a.note.error ? 'alert' : 'status'} className={a.note.error ? 'sp-tone-warn' : 'sp-tone-ok'}>{a.note.text}</p>}
  </div>;
}


/** A different project/source gets a fresh decision, never the old preview or
 * reason. The previous request may finish on the server; its response is ignored. */
export function DocumentDisposition(props: Props) {
  return <DocumentDispositionForTarget key={JSON.stringify([props.projectId, props.targetType, props.targetId])} {...props} />;
}

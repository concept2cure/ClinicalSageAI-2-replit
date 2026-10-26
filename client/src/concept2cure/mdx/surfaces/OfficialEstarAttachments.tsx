/** Explicit FDA destinations for exact Vault versions; the existing exporter writes them. */
import React from 'react';
import { isCanonicalId } from '@shared/regulatory/canonical-document';
import { useLiveData } from '../../v2/dataConnect';
import { VaultVersionPicker, type PickedVaultVersion } from '../../v2/surfaces/VaultLibraryResults';
import type { OfficialEstarType, OfficialEstarVariant } from '../hooks/useEstarOfficialFields';
import type { OfficialEstarAttachment, EstarAttachmentReceipt, EstarAttachmentRefusal } from '../hooks/useEstarExport';

interface AttachmentSlot {
  somPath: string;
  field: string;
  description: string | null;
  chapters: string[];
  singleAttachment: string | null;
}
interface SlotCatalog {
  descriptorId: string;
  type: string;
  variant: string;
  templateVersion: string;
  slots: AttachmentSlot[];
}
interface AttachmentRow { key: number; slot: string; document: PickedVaultVersion | null; error: string | null }
// The existing POST /official request ceiling; template slot cardinality stays server-owned.
const MAX_ATTACHMENTS = 150;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const nullableText = (v: unknown): v is string | null => v === null || typeof v === 'string';
function isSlot(v: unknown): v is AttachmentSlot {
  return object(v) && text(v.somPath) && text(v.field) && nullableText(v.description) &&
    Array.isArray(v.chapters) && v.chapters.every(text) && nullableText(v.singleAttachment);
}
function isCatalog(v: unknown, type: string, variant: string): v is SlotCatalog {
  return object(v) && text(v.descriptorId) && v.type === type && v.variant === variant && text(v.templateVersion) &&
    Array.isArray(v.slots) && v.slots.every(isSlot) && new Set(v.slots.map(s => s.somPath)).size === v.slots.length;
}
const marketingType = (type: OfficialEstarType) => type === '510k' || type === 'de_novo' || type === 'pma';
const sourceProblem = 'Choose a current Vault version with a valid document id and recorded SHA-256.';
function validSource(document: PickedVaultVersion, programId: string | null): boolean {
  return isCanonicalId(document.id) && document.current === true && document.programId.toLowerCase() === programId?.toLowerCase() &&
    typeof document.contentHash === 'string' && /^[a-f0-9]{64}$/.test(document.contentHash);
}
function rowProblem(rows: AttachmentRow[], catalog: SlotCatalog): string | null {
  const seen = new Set<string>();
  for (const row of rows) {
    const slot = catalog.slots.find(s => s.somPath === row.slot);
    if (!slot || !row.document) return 'Choose an FDA destination and a Vault version for every attachment, or remove the incomplete row.';
    if (slot.singleAttachment && rows.filter(r => r.slot === row.slot).length > 1) return slot.singleAttachment;
    const key = `${row.slot}\0${row.document.id.toLowerCase()}`;
    if (seen.has(key)) return 'The same Vault version is selected more than once for this destination. Remove the duplicate attachment.';
    seen.add(key);
  }
  return null;
}

function planProblem(rows: AttachmentRow[], enabled: boolean, loading: boolean, catalog: SlotCatalog | null): string | null {
  if (!rows.length) return null;
  if (!enabled) return 'Open a project before choosing Vault attachments.';
  if (loading) return 'Reading FDA attachment destinations…';
  if (!catalog) return 'Attachment destinations could not be read. Retry them or remove the attachment rows.';
  if (!catalog.slots.length) return 'This template has no attachment destinations. Remove the attachment rows to generate without them.';
  return rowProblem(rows, catalog);
}

export function useOfficialEstarAttachments(programId: string | null, type: OfficialEstarType, variant: OfficialEstarVariant) {
  const [rows, setRows] = React.useState<AttachmentRow[]>([]);
  const next = React.useRef(0);
  const [attempt, setAttempt] = React.useState(0);
  const enabled = marketingType(type) && !!programId && isCanonicalId(programId);
  const path = enabled && rows.length ? `/api/510k/estar/attachment-slots?${new URLSearchParams({ type, variant })}` : null;
  const read = useLiveData<SlotCatalog>(path, [path, attempt], (value): value is SlotCatalog => isCatalog(value, type, variant));
  const catalog = read.loading || read.error ? null : read.data;
  const loading = !!path && (read.loading || (!read.error && !read.data));
  const problem = planProblem(rows, enabled, loading, catalog);
  const requests: OfficialEstarAttachment[] = problem ? [] : rows.flatMap(row => row.document?.contentHash ? [{
    slot: row.slot, source: { kind: 'vault_document' as const, documentId: row.document.id }, expectedSha256: row.document.contentHash,
  }] : []);
  const patch = (key: number, change: Partial<AttachmentRow>) => setRows(previous => previous.map(row => row.key === key ? { ...row, ...change } : row));
  return {
    rows, enabled, loading, catalog, problem, requests, full: rows.length >= MAX_ATTACHMENTS,
    failed: !!path && !loading && !catalog,
    retry: () => setAttempt(value => value + 1),
    add: () => { if (enabled) setRows(previous => previous.length >= MAX_ATTACHMENTS ? previous : [...previous, { key: ++next.current, slot: '', document: null, error: null }]); },
    remove: (key: number) => setRows(previous => previous.filter(row => row.key !== key)),
    slot: (key: number, slot: string) => patch(key, { slot }),
    change: (key: number) => patch(key, { document: null, error: null }),
    choose: (key: number, document: PickedVaultVersion) => patch(key, validSource(document, programId)
      ? { document, error: null } : { document: null, error: sourceProblem }),
  };
}
type AttachmentPlan = ReturnType<typeof useOfficialEstarAttachments>;
const buttonStyle: React.CSSProperties = { minHeight: 44 };
const labelOf = (slot: AttachmentSlot) => `${slot.description || slot.field}${slot.chapters.length ? ` · ${slot.chapters.join(' · ')}` : ''}`;

function AttachmentRowFields({ row, index, plan, programId, busy }: {
  row: AttachmentRow; index: number; plan: AttachmentPlan; programId: string; busy: boolean;
}) {
  const id = React.useId();
  return <fieldset disabled={busy} style={{ border: 0, borderTop: '1px solid var(--border)', margin: '12px 0 0', padding: '12px 0 0', minWidth: 0 }}>
    <legend className="section-sub">Attachment {index + 1}</legend>
    <label htmlFor={id} className="section-sub" style={{ display: 'block', marginBottom: 6 }}>FDA destination</label>
    <select id={id} className="c2c-input" value={row.slot} disabled={busy || !plan.catalog}
      style={{ width: '100%', minWidth: 0, minHeight: 44 }} onChange={event => plan.slot(row.key, event.target.value)}>
      <option value="">Choose an FDA destination…</option>
      {plan.catalog?.slots.map(slot => <option value={slot.somPath} key={slot.somPath}>{labelOf(slot)}</option>)}
    </select>
    <div style={{ marginTop: 10, minWidth: 0, overflowWrap: 'anywhere' }}>
      {row.document ? <div className="section-sub">
        <strong>{row.document.title}</strong>
        <div>Version {row.document.version || 'not recorded'} · current</div>
        <div>Vault id {row.document.id}</div>
        <div>SHA-256 {row.document.contentHash}</div>
        <button type="button" className="btn ghost small" style={buttonStyle} disabled={busy} onClick={() => plan.change(row.key)}>Change document</button>
      </div> : <>
        <p className="section-sub">Search this project’s Vault to choose a version. The server checks current approval and access again when generating.</p>
        <VaultVersionPicker programId={programId} disabled={busy} label="Search this project's Vault" onChoose={document => plan.choose(row.key, document)} />
      </>}
    </div>
    {row.error && <p role="alert" aria-live="assertive" className="section-sub">{row.error}</p>}
    <button type="button" className="btn ghost small" style={buttonStyle} disabled={busy} onClick={() => plan.remove(row.key)}>Remove attachment</button>
  </fieldset>;
}

export function OfficialEstarAttachments({ plan, programId, busy }: { plan: AttachmentPlan; programId: string | null; busy: boolean }) {
  return <section className="panel" style={{ marginTop: 8, padding: 12, minWidth: 0 }} data-testid="official-estar-attachments" aria-label="Vault attachments">
    <div className="section-sub">Optional Vault attachments. Choose each FDA destination explicitly; earlier files and exports stay unchanged.</div>
    {!plan.rows.length && <p className="section-sub">No Vault attachments selected.</p>}
    {plan.loading && <p className="section-sub" role="status" aria-live="polite" aria-busy="true">Reading FDA attachment destinations…</p>}
    {plan.failed && <div role="alert" aria-live="assertive" className="section-sub">
      Attachment destinations could not be read. This is not an empty list.
      <button type="button" className="btn ghost small" style={buttonStyle} disabled={busy} onClick={plan.retry}>Retry attachment destinations</button>
    </div>}
    {plan.catalog && plan.rows.length > 0 && <p className="section-sub">FDA template {plan.catalog.templateVersion}. Only current, approved versions can be attached.</p>}
    {programId && plan.enabled && plan.rows.map((row, index) => <AttachmentRowFields key={row.key} {...{ row, index, plan, programId, busy }} />)}
    {plan.problem && !plan.loading && !plan.failed && <p role="status" aria-live="polite" className="section-sub">{plan.problem}</p>}
    <button type="button" className="btn ghost small" style={buttonStyle} disabled={busy || !plan.enabled || plan.full} onClick={plan.add}>Add Vault attachment</button>
    {plan.full && <p className="section-sub" role="status">Up to 150 Vault attachments can be requested in one export. Remove an attachment before adding another.</p>}
    {!plan.enabled && <p className="section-sub" role="status">Open a project to choose its Vault versions.</p>}
  </section>;
}

export function OfficialEstarAttachmentOutcome({ attachments, refusals, catalog }: {
  attachments?: EstarAttachmentReceipt[]; refusals?: EstarAttachmentRefusal[]; catalog: SlotCatalog | null;
}) {
  const destination = (path: string) => { const slot = catalog?.slots.find(slot => slot.somPath === path); return slot ? slot.description || slot.field : 'Selected FDA destination'; };
  return <>
    {!!attachments?.length && <div className="section-sub" role="status" style={{ marginTop: 8, overflowWrap: 'anywhere' }} data-testid="official-estar-attachment-receipts">
      Attached files confirmed by the server:
      <ul>{attachments.map((attachment, i) => <li key={`${attachment.slot}:${attachment.source.documentId}:${i}`}>
        <strong>{attachment.fileName}</strong> · {destination(attachment.slot)} · {attachment.chapter}
        <div>Vault id {attachment.source.documentId}</div>
        <div>{attachment.byteLength} bytes · SHA-256 {attachment.sha256}</div>
      </li>)}</ul>
    </div>}
    {!!refusals?.length && <div className="section-sub" role="alert" aria-live="assertive" style={{ marginTop: 8 }} data-testid="official-estar-attachment-refusals">
      Attachment export refused:
      <ul>{refusals.map((refusal, i) => <li key={`${refusal.slot}:${i}`}>{destination(refusal.slot)}: {refusal.reasons.join(' · ')}</li>)}</ul>
    </div>}
  </>;
}

/** Setup's existing retention controls, connected to the governed Vault hold routes. */
import React, { useRef, useState } from 'react';
import { C2CForm, type C2CFormConfig, type C2CFormField, type C2CFormFieldOption } from '../C2CForm';
import { EmptyState, isPendingStore, liveMutateOrNull, useLiveData, useLiveRows, type DataState, type ListState } from '../dataConnect';
import { I } from '../icons';
import { GovernedConfirmDialog } from '../../_shared/components/GovernedConfirmDialog';
import type { VaultDoc, VaultFolder } from '../fixtures/vault-data';

export const LEGAL_HOLDS_PATH = '/api/vault/legal-holds';
type Scope = 'program' | 'document';
interface LegalHold {
  id: string;
  reference: string;
  reason: string;
  scope: Scope;
  programId: string | null;
  documentId: string | null;
  placedBy: number | null;
  placedAt: string;
  liftedAt: string | null;
  liftedBy: number | null;
  liftReason: string | null;
  active: boolean;
  targetLabel?: string | null;
  targetProjectLabel?: string | null;
}
interface Props { describeFailure: (error: string, status: number) => string }
interface ProgramChoice { id: string; name: string; code?: string }
type HoldPayload = { hold: LegalHold };
type ListPayload = { holds: LegalHold[] };
type VaultPayload = { tree: VaultFolder[]; pendingStore?: boolean; uploadsWindow?: { shown: number; total: number; truncated: boolean }; unavailable?: { branch: string; reason: string }[] };
const isDate = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const isActor = (v: unknown) => v === null || Number.isInteger(v);
const isNullableText = (v: unknown) => v === null || typeof v === 'string';
const isScopedTarget = (h: LegalHold) => (h.scope === 'program' && typeof h.programId === 'string' && h.documentId === null)
  || (h.scope === 'document' && typeof h.documentId === 'string' && h.programId === null);
const isTargetLabels = (h: LegalHold) => (h.targetLabel === undefined || isNullableText(h.targetLabel))
  && (h.targetProjectLabel === undefined || isNullableText(h.targetProjectLabel));

function isHold(v: unknown): v is LegalHold {
  if (!v || typeof v !== 'object') return false;
  const h = v as LegalHold;
  return typeof h.id === 'string' && typeof h.reference === 'string' && typeof h.reason === 'string'
    && typeof h.active === 'boolean'
    && isDate(h.placedAt) && (h.liftedAt === null || isDate(h.liftedAt))
    && isActor(h.placedBy) && isActor(h.liftedBy) && isNullableText(h.liftReason)
    && h.active === (h.liftedAt === null)
    && isScopedTarget(h) && isTargetLabels(h);
}
function isList(v: unknown): v is ListPayload {
  const holds = (v as ListPayload | null)?.holds;
  return Array.isArray(holds) && holds.every(isHold);
}
const registerReady = (live: DataState<ListPayload>) => !live.loading && !live.error && live.data !== null && !isPendingStore(live);
function isPrograms(v: unknown): v is ProgramChoice[] {
  return Array.isArray(v) && v.every((p) => p && typeof p.id === 'string' && typeof p.name === 'string');
}
function isVaultMetadata(v: VaultPayload): boolean {
  const window = v.uploadsWindow;
  const windowValid = window === undefined || (Boolean(window) && Number.isInteger(window.shown) && Number.isInteger(window.total) && typeof window.truncated === 'boolean');
  const unavailable = v.unavailable;
  const unavailableValid = unavailable === undefined || (Array.isArray(unavailable) && unavailable.every((b) => b && typeof b.branch === 'string' && typeof b.reason === 'string'));
  return windowValid && unavailableValid;
}
function isVault(v: unknown): v is VaultPayload {
  const tree = (v as VaultPayload | null)?.tree;
  const nodes = (items: unknown[]): boolean => items.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const node = item as VaultFolder & VaultDoc;
    if (Array.isArray(node.children)) return nodes(node.children);
    if (typeof node.title !== 'string') return false;
    return node.src !== 'upload' || (typeof node.docId === 'string' && typeof node.ver === 'string');
  });
  return Array.isArray(tree) && nodes(tree) && isVaultMetadata(v as VaultPayload);
}
/** Only actual Vault uploads have a document UUID the document hold route accepts. */
function documentChoices(tree: VaultFolder[]): { value: string; label: string }[] {
  const choices = new Map<string, string>();
  const walk = (nodes: (VaultFolder | VaultDoc)[]) => nodes.forEach((node) => {
    if ('children' in node) walk(node.children);
    else if (node.src === 'upload' && node.docId) choices.set(node.docId, `${node.title} · ${node.ver}`);
  });
  walk(tree);
  return [...choices].map(([value, label]) => ({ value, label }));
}

function vaultUnavailable(vault: DataState<VaultPayload>): boolean {
  return Boolean(vault.error || vault.data?.pendingStore || isPendingStore(vault)
    || vault.data?.unavailable?.some((b) => b.branch === 'Uploaded files'));
}

function documentHintOf(projectId: string, vault: DataState<VaultPayload>, documents: C2CFormFieldOption[]): string {
  if (!projectId) return 'Choose a project first.';
  if (vault.loading) return 'Loading Vault documents…';
  if (vaultUnavailable(vault)) return 'Vault documents could not be read. Choose a different project and retry this project, or close this drawer and try again.';
  if (!documents.length) return 'No uploaded Vault documents are available in this project.';
  const window = vault.data?.uploadsWindow;
  const shown = window?.truncated ? ` Showing ${window.shown} of ${window.total} uploaded documents.` : '';
  return `Choose a current stored document version to preserve.${shown}`;
}

function formNotice(programs: ListState<ProgramChoice>): string | undefined {
  if (programs.error || isPendingStore(programs)) return 'Projects could not be read. Close this drawer and try again.';
  if (!programs.rows.length && !programs.loading) return 'No projects are available. Create a project before placing a hold.';
  return undefined;
}

function holdFields(scope: Scope, programs: ListState<ProgramChoice>, documents: C2CFormFieldOption[], hint: string): C2CFormField[] {
  const options = programs.error || isPendingStore(programs) ? [] : programs.rows.map((p) => ({ value: p.id, label: p.code ? `${p.name} · ${p.code}` : p.name }));
  return [
    { key: 'programId', label: 'Project', type: 'select', required: true, desc: 'Up to 200 projects accessible in your organization.', options },
    ...(scope === 'document' ? [{ key: 'documentId', label: 'Vault document version', type: 'select' as const, required: true, options: documents, desc: hint, descLive: true }] : []),
    { key: 'reference', label: 'Hold reference', type: 'text', required: true, desc: 'Your inspection, litigation or preservation reference. Maximum 200 characters.' },
    { key: 'reason', label: 'Reason for the hold', type: 'textarea', required: true, desc: '3–2,000 characters. Recorded with your user identity and the time.' },
  ];
}

function draftError(values: Record<string, string>, scope: Scope, programs: ListState<ProgramChoice>, documents: C2CFormFieldOption[]): string | undefined {
  if (programs.error || isPendingStore(programs) || !programs.rows.some((p) => p.id === values.programId)
    || (scope === 'document' && !documents.some((d) => d.value === values.documentId))) {
    return 'Choose a target from the project and document lists after they load.';
  }
  const reference = values.reference.trim();
  const reason = values.reason.trim();
  if (!reference || reference.length > 200 || reason.length < 3 || reason.length > 2000) {
    return 'Use a hold reference of 1–200 characters and a reason of 3–2,000 characters.';
  }
  return undefined;
}

function confirmedPlacement(payload: HoldPayload | null, scope: Scope, values: Record<string, string>): boolean {
  const h = payload?.hold;
  return isHold(h) && h.active && h.scope === scope
    && (scope === 'program' ? h.programId === values.programId : h.documentId === values.documentId);
}

function PlaceHoldForm({ scope, describeFailure, onCancel, onSaved }: Props & {
  scope: Scope; onCancel: () => void; onSaved: () => void;
}) {
  const programs = useLiveRows<ProgramChoice>('/api/regulatory-programs?limit=200', [], isPrograms);
  const [projectId, setProjectId] = useState('');
  const vaultPath = scope === 'document' && projectId ? `/api/c2c/project-vault/${encodeURIComponent(projectId)}` : null;
  const vault = useLiveData<VaultPayload>(vaultPath, [vaultPath], isVault);
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState<string>();
  const documents = vaultPath && !vault.loading && !vaultUnavailable(vault)
    ? documentChoices(vault.data?.tree ?? []) : [];
  const config: C2CFormConfig = {
    eyebrow: 'Vault — records retention',
    title: `Place a ${scope === 'program' ? 'project' : 'document'} hold`,
    sub: 'A hold prevents deletion of the named records until an authorized user lifts it.',
    governed: 'The hold and its audit-trail entry are recorded together. A refused write changes neither.',
    submitLabel: saving ? 'Recording hold…' : 'Place hold',
    busy: saving ? 'Recording the hold and its audit-trail entry…' : programs.loading ? 'Loading your projects…' : undefined,
    notice: error ?? formNotice(programs),
    fields: holdFields(scope, programs, documents, documentHintOf(projectId, vault, documents)),
  };
  const save = async (values: Record<string, string>) => {
    if (locked.current) return;
    const invalid = draftError(values, scope, programs, documents);
    if (invalid) { setError(invalid); return; }
    locked.current = true;
    setSaving(true);
    setError(undefined);
    const body = { scope, reference: values.reference.trim(), reason: values.reason.trim(), ...(scope === 'program' ? { programId: values.programId } : { documentId: values.documentId }) };
    const r = await liveMutateOrNull<HoldPayload>('POST', LEGAL_HOLDS_PATH, body);
    locked.current = false;
    setSaving(false);
    if (r.error || !confirmedPlacement(r.data, scope, values)) {
      setError(r.error ? describeFailure(r.error, r.status) : 'The server returned no recorded active hold. Its outcome could not be confirmed. Close this drawer and reload the holds before retrying.');
      return;
    }
    onSaved();
  };
  return <C2CForm config={config} onCancel={() => { if (!locked.current) onCancel(); }} onSubmit={(v) => { void save(v); }} onFieldChange={(key, value) => { if (key === 'programId') setProjectId(value); setError(undefined); }} />;
}

function HoldRow({ hold: h, onLift }: { hold: LegalHold; onLift: (h: LegalHold) => void }) {
  const name = h.targetLabel || `${h.scope === 'program' ? 'Project' : 'Document'} name unavailable`;
  return (
    <div className="txw-row" data-testid={`legal-hold-${h.id}`}>
      <div className="txw-row-l">{h.reference}<small>{h.scope === 'program' ? 'Project' : 'Document version'} · {name}{h.scope === 'document' && h.targetProjectLabel ? ` · ${h.targetProjectLabel}` : ''}<br />Placed by user #{h.placedBy ?? '—'} on {new Date(h.placedAt).toLocaleString()}</small></div>
      <div className="txw-row-r">
        <b>{h.active ? 'Active' : 'Lifted'}</b>
        <span className="txw-help">Reason: {h.reason}</span>
        {h.active ? <div><button type="button" className="btn ghost small" aria-label={`Lift hold ${h.reference}`} onClick={() => onLift(h)}>Lift hold</button></div>
          : <span className="txw-help">Lifted by user #{h.liftedBy ?? '—'} on {new Date(h.liftedAt!).toLocaleString()}. Reason: {h.liftReason ?? '—'}</span>}
      </div>
    </div>
  );
}

export function LegalHoldsCard({ describeFailure }: Props) {
  const [reload, setReload] = useState(0);
  const live = useLiveData<ListPayload>(LEGAL_HOLDS_PATH, [reload], isList);
  const [scope, setScope] = useState<Scope | null>(null);
  const [lifting, setLifting] = useState<LegalHold | null>(null);
  const [liftError, setLiftError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const ready = registerReady(live);
  const holds = ready ? live.data!.holds.filter((h) => filter === 'all' || h.active) : [];
  const lift = async ({ reason }: { reason: string }) => {
    if (!lifting) return;
    if (reason.length > 2000) { setLiftError('Use a reason of no more than 2,000 characters.'); return; }
    setLiftError(null);
    const r = await liveMutateOrNull<HoldPayload>('POST', `${LEGAL_HOLDS_PATH}/${encodeURIComponent(lifting.id)}/lift`, { liftReason: reason });
    if (r.error || !isHold(r.data?.hold) || r.data.hold.active || r.data.hold.id !== lifting.id) {
      setLiftError(r.error ? describeFailure(r.error, r.status) : 'The server returned no recorded lift. Its outcome could not be confirmed. Cancel and reload the holds before retrying.');
      return;
    }
    setLifting(null);
    setNote('Hold lifted and recorded with its audit-trail entry. Other holds and retention dates still apply.');
    setReload((k) => k + 1);
  };
  return (
    <div className="txw-set-card" data-testid="legal-holds-card">
      <div className="txw-set-head">
        <div className="txw-set-head-l">
          <div className="txw-set-eyebrow">Vault — records retention</div>
          <h2 className="txw-set-title">Legal holds</h2>
          <p className="txw-set-sub">Preserve a project's records or one stored document version. Organization owners, administrators and managers can place and lift holds; each change records who acted, when and why.</p>
        </div>
      </div>
      <div className="txw-set-body">
        <div role="status" aria-live="polite" aria-atomic="true" className="txw-help">{note}</div>
        {live.loading ? <EmptyState busy icon={I.clock} title="Loading legal holds…" />
          : live.error && live.status === 403 ? <EmptyState icon={I.lock} title="Legal holds were not shown" hint={live.error} />
            : !ready ? <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load legal holds" hint="Hold status is unknown here. Reload before making a change." retry={() => setReload((k) => k + 1)} />
              : <>
                <div className="txw-row">
                  <div className="txw-row-l">Preservation controls<small>Up to 500 holds, active first. A hold stays active until you lift it.</small></div>
                  <div className="txw-row-r">
                    <div className="txw-row-r-grid">
                      <button type="button" className="btn" onClick={() => { setNote(''); setScope('program'); }}>Place project hold</button>
                      <button type="button" className="btn" onClick={() => { setNote(''); setScope('document'); }}>Place document hold</button>
                      <button type="button" className="btn ghost small" onClick={() => setReload((k) => k + 1)}>Reload holds</button>
                    </div>
                    <label className="txw-help">Show holds <select className="de-select" aria-label="Show legal holds" value={filter} onChange={(e) => setFilter(e.target.value as 'active' | 'all')}><option value="active">Active</option><option value="all">Active and lifted</option></select></label>
                  </div>
                </div>
                {holds.length === 0 ? <EmptyState icon={I.gavel} title={filter === 'active' ? 'No active holds in this list' : 'No legal holds recorded'} hint="The records' retention dates still apply." /> : holds.map((h) => <HoldRow key={h.id} hold={h} onLift={(chosen) => { setLiftError(null); setLifting(chosen); }} />)}
              </>}
      </div>
      {scope && <PlaceHoldForm scope={scope} describeFailure={describeFailure} onCancel={() => setScope(null)} onSaved={() => { setScope(null); setNote('Hold placed and recorded with its audit-trail entry.'); setReload((k) => k + 1); }} />}
      <GovernedConfirmDialog open={lifting !== null} action="Lift legal hold" target={lifting ? `${lifting.reference} · Removing this hold permits disposition when retention dates and other holds allow it.` : ''} resource={lifting?.programId ?? lifting?.documentId ?? undefined} minReason={3} confirmWord="lift" submitError={liftError} onCancel={() => setLifting(null)} onConfirm={lift} />
    </div>
  );
}

/**
 * Protocol development — the Design derivation tab (protocol → design).
 *
 * `docs/design/PROTOCOL_INTELLIGENCE.md`, direction two, and the founder's
 * explicit ask: the convergence document specified design → protocol only, so a
 * protocol a human edits is a fact about the study that dies on the page. This
 * pane is the other half — the REVIEWED DIFF.
 *
 * ── What it does, and what it refuses to do ─────────────────────────────────
 * It reads `GET /api/protocol-development/documents/:id/design-derivation` and
 * renders the engine's five buckets. It derives nothing itself. Applying posts
 * `acceptedPaths` — PATHS, never values — because the server recomputes the
 * derivation from the live rows and rejects any path the current derivation no
 * longer offers. A client that posted values would be asserting a fact about
 * the study from a screen that may be minutes stale.
 *
 * ── The five buckets mean five different things ──────────────────────────────
 *   proposed     the protocol evidences this and the design has nothing there.
 *                Selectable.
 *   conflicts    both sources carry a value and they disagree. Both are shown;
 *                neither wins automatically. Selecting one is a human choosing
 *                the protocol's value over the design's, and it says so.
 *   unchanged    the two already agree. Nothing to do, nothing to select.
 *   unevidenced  the protocol says nothing here. The design field is UNTOUCHED.
 *                Silence is not a value — this is not a gap and not a defect.
 *   incomplete   evidenced, but the design needs a field the protocol never
 *                records. The accept control DOES NOT EXIST for these rows —
 *                it is not rendered disabled, because a disabled control still
 *                says "this is nearly applicable", and it is not.
 *
 * ── Honest states ───────────────────────────────────────────────────────────
 * No design bound (409 INVALID_STATE) says so and points at the Study design
 * tab; a read failure says the read failed. Neither is ever drawn as an empty
 * diff — an error is never rendered as an empty result (CLAUDE.md).
 */
import React, { useEffect, useState } from 'react';
import { PaneHead } from './ProtocolDevShared';
import { apiRequest } from '@/lib/queryClient';
import { C2CForm } from '../C2CForm';

const MIN_REASON = 8;

export interface DerivationProvenance {
  table: string;
  rowIds: number[];
  confidence: 'structured' | 'text_scan';
  note: string;
}

export interface DerivedFieldView { path: string; value: unknown; provenance: DerivationProvenance }
export interface ConflictView {
  path: string; designValue: unknown; protocolValue: unknown; why: string; provenance: DerivationProvenance;
}
export interface UnevidencedView { path: string; reason: string }
export interface IncompleteView {
  path: string; partial: unknown; missing: string[]; reason: string; provenance: DerivationProvenance;
}

export interface DesignDerivationView {
  proposed: DerivedFieldView[];
  conflicts: ConflictView[];
  unchanged: string[];
  unevidenced: UnevidencedView[];
  incomplete: IncompleteView[];
}

export interface ApplyOutcome {
  applied: string[];
  rejected: Array<{ path: string; reason: string }>;
}

type LoadState =
  | { kind: 'loading' }
  /** The route answered 409 INVALID_STATE: nothing is bound, so there is no diff. */
  | { kind: 'unbound'; message: string }
  /** The read failed. NOT an empty derivation. */
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; studyDesignId: string; derivation: DesignDerivationView };

/** The server's refusal, in its own words. */
function refusal(body: unknown, status: number): string {
  const err = (body as { error?: unknown } | null)?.error;
  if (typeof err === 'string') return err;
  const obj = err as { message?: string; code?: string } | undefined;
  return obj?.message || obj?.code || `HTTP ${status}`;
}

function asDerivation(raw: unknown): DesignDerivationView {
  const d = (raw ?? {}) as Partial<DesignDerivationView>;
  return {
    proposed: Array.isArray(d.proposed) ? d.proposed : [],
    conflicts: Array.isArray(d.conflicts) ? d.conflicts : [],
    unchanged: Array.isArray(d.unchanged) ? d.unchanged : [],
    unevidenced: Array.isArray(d.unevidenced) ? d.unevidenced : [],
    incomplete: Array.isArray(d.incomplete) ? d.incomplete : [],
  };
}

async function loadDerivation(documentId: number): Promise<LoadState> {
  const res = await apiRequest('GET', `/api/protocol-development/documents/${documentId}/design-derivation`);
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.status === 409) return { kind: 'unbound', message: refusal(json, res.status) };
  if (!res.ok || !json) return { kind: 'failed', message: refusal(json, res.status) };
  return {
    kind: 'ready',
    studyDesignId: String(json.studyDesignId ?? ''),
    derivation: asDerivation(json.derivation),
  };
}

/* ── Value and provenance rendering ────────────────────────────────────────── */

/** A derived value as text. Structures print as JSON rather than as "[object Object]". */
function valueText(v: unknown): string {
  if (v === null || v === undefined) return 'not recorded';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v, null, 2);
}

function ValueLine({ k, v }: { k: string; v: unknown }) {
  const text = valueText(v);
  return (
    <div className="pd-kv">
      <span className="pd-kv-k">{k}</span>
      <span className="pd-kv-v pg-mono" style={{ whiteSpace: 'pre-wrap' }}>{text}</span>
    </div>
  );
}

/**
 * Where a value came from. `text_scan` says so in words: the engine read it out
 * of a free-text field, and a human confirms it rather than trusting it.
 */
function Provenance({ p }: { p: DerivationProvenance | undefined }) {
  if (!p) return <div className="pd-prov">The engine reported no source for this value.</div>;
  const rows = Array.isArray(p.rowIds) && p.rowIds.length > 0 ? p.rowIds.join(', ') : 'none named';
  return (
    <div className="pd-prov">
      <span className="pg-mono">{`${p.table} · row ${rows}`}</span>
      <span>{p.note}</span>
      {p.confidence === 'text_scan' && (
        <span className="pd-prov-conf" data-c="medium">
          This value was read from free text, not from a structured column, and needs confirming.
        </span>
      )}
    </div>
  );
}

/* ── Buckets ───────────────────────────────────────────────────────────────── */

interface BucketProps { title: string; means: string; count: number; children?: React.ReactNode }

function Bucket({ title, means, count, children }: BucketProps) {
  return (
    <section className="pj-card" style={{ padding: 12, marginTop: 10 }} role="group" aria-label={title}>
      <div className="pj-card-h">
        <span className="t">{`${title} (${count})`}</span>
      </div>
      <div className="pd-pane-s">{means}</div>
      {count === 0 && <div className="pde-note">Nothing in this bucket.</div>}
      {children}
    </section>
  );
}

interface AcceptProps { path: string; label: string; checked: boolean; onToggle: (path: string) => void }

function Accept({ path, label, checked, onToggle }: AcceptProps) {
  return (
    <label className="pde-rowbtn" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <input type="checkbox" checked={checked} aria-label={label} onChange={() => onToggle(path)} />
      <span>{label}</span>
    </label>
  );
}

function ProposedRows({ rows, selected, onToggle }: { rows: DerivedFieldView[]; selected: Set<string>; onToggle: (p: string) => void }) {
  return (
    <>
      {rows.map((r) => (
        <div key={r.path} className="pj-card" style={{ padding: 10, marginTop: 8 }} data-path={r.path}>
          <div className="pg-mono" style={{ fontSize: 12 }}><b>{r.path}</b></div>
          <ValueLine k="Protocol value" v={r.value} />
          <Provenance p={r.provenance} />
          <Accept path={r.path} label={`Accept ${r.path} into the design`} checked={selected.has(r.path)} onToggle={onToggle} />
        </div>
      ))}
    </>
  );
}

function ConflictRows({ rows, selected, onToggle }: { rows: ConflictView[]; selected: Set<string>; onToggle: (p: string) => void }) {
  return (
    <>
      {rows.map((r) => (
        <div key={r.path} className="pj-card" style={{ padding: 10, marginTop: 8 }} data-path={r.path}>
          <div className="pg-mono" style={{ fontSize: 12 }}><b>{r.path}</b></div>
          <div style={{ fontSize: 12, marginTop: 4 }}>{r.why}</div>
          <ValueLine k="Design value (today)" v={r.designValue} />
          <ValueLine k="Protocol value" v={r.protocolValue} />
          <Provenance p={r.provenance} />
          <div className="pde-note">
            Accepting this is you choosing the protocol’s value over the design’s. The design’s
            current value is replaced; nothing decides that for you.
          </div>
          <Accept path={r.path} label={`Accept ${r.path} — replace the design’s value`} checked={selected.has(r.path)} onToggle={onToggle} />
        </div>
      ))}
    </>
  );
}

function IncompleteRows({ rows }: { rows: IncompleteView[] }) {
  return (
    <>
      {rows.map((r) => (
        <div key={r.path} className="pj-card" style={{ padding: 10, marginTop: 8 }} data-path={r.path}>
          <div className="pg-mono" style={{ fontSize: 12 }}><b>{r.path}</b></div>
          <div style={{ fontSize: 12, marginTop: 4 }}>{r.reason}</div>
          <div className="pd-pane-s" style={{ marginTop: 6 }}>Supply these first, by name:</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }} aria-label={`Fields to supply for ${r.path}`}>
            {r.missing.map((m) => <li key={m} className="pg-mono">{m}</li>)}
          </ul>
          <ValueLine k="What the protocol does evidence" v={r.partial} />
          <Provenance p={r.provenance} />
        </div>
      ))}
    </>
  );
}

function UnevidencedRows({ rows }: { rows: UnevidencedView[] }) {
  return (
    <>
      {rows.map((r) => (
        <div key={r.path} className="pj-card" style={{ padding: 10, marginTop: 8 }} data-path={r.path}>
          <div className="pg-mono" style={{ fontSize: 12 }}><b>{r.path}</b></div>
          <div style={{ fontSize: 12, marginTop: 4 }}>{r.reason}</div>
        </div>
      ))}
    </>
  );
}

function BucketGroups({ d, selected, onToggle }: { d: DesignDerivationView; selected: Set<string>; onToggle: (p: string) => void }) {
  return (
    <>
      <Bucket title="Proposed" count={d.proposed.length}
        means="The protocol evidences this and the design has nothing there. Accepting writes the protocol’s value into the design.">
        <ProposedRows rows={d.proposed} selected={selected} onToggle={onToggle} />
      </Bucket>
      <Bucket title="Conflicts" count={d.conflicts.length}
        means="Both sources carry a value and they disagree. Both are shown and neither wins on its own.">
        <ConflictRows rows={d.conflicts} selected={selected} onToggle={onToggle} />
      </Bucket>
      <Bucket title="Unchanged" count={d.unchanged.length}
        means="The protocol and the design already agree here, so there is nothing to apply.">
        {d.unchanged.map((p) => (
          <div key={p} className="pj-card pg-mono" style={{ padding: 10, marginTop: 8 }} data-path={p}>{p}</div>
        ))}
      </Bucket>
      <Bucket title="Unevidenced" count={d.unevidenced.length}
        means="The protocol says nothing here, so the design field is left exactly as it is. Silence is not a value: this is not a gap in the design and nothing needs to be done about it.">
        <UnevidencedRows rows={d.unevidenced} />
      </Bucket>
      <Bucket title="Incomplete" count={d.incomplete.length}
        means="The protocol evidences part of this, but the design needs a field the protocol never records. There is no accept control here — a human supplies the named fields on the design first.">
        <IncompleteRows rows={d.incomplete} />
      </Bucket>
    </>
  );
}

/* ── Apply ─────────────────────────────────────────────────────────────────── */

function ApplyDrawer({ paths, documentId, onCancel, onDone, onError }: {
  paths: string[];
  documentId: number;
  onCancel: () => void;
  onDone: (body: Record<string, unknown>) => void;
  onError: (m: string) => void;
}) {
  const submit = async (v: Record<string, string>) => {
    if ((v.reason ?? '').trim().length < MIN_REASON) {
      onError(`The governed reason must be at least ${MIN_REASON} characters. Nothing was written.`);
      return;
    }
    try {
      const res = await apiRequest(
        'POST',
        `/api/protocol-development/documents/${documentId}/design-derivation/apply`,
        { acceptedPaths: paths, reason: v.reason.trim() } as never,
      );
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) throw new Error(refusal(json, res.status) + ' Nothing was written.');
      onDone(json ?? {});
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <C2CForm
      config={{
        eyebrow: 'Protocol · design derivation',
        title: 'Apply the accepted paths',
        sub: `${paths.length} path(s) accepted: ${paths.join(', ')}. The paths are sent, not the values — the server re-derives them from the protocol as it stands now and refuses any it no longer evidences.`,
        governed: true,
        submitLabel: 'Apply and record',
        fields: [{
          key: 'reason', label: 'Reason for change (governed)', type: 'textarea', required: true,
          placeholder: 'Why the design should carry what this protocol evidences — at least 8 characters; written to the audit trail.',
        }],
      }}
      onCancel={onCancel}
      onSubmit={submit}
    />
  );
}

function ApplyResult({ outcome }: { outcome: ApplyOutcome }) {
  return (
    <section className="pj-card" style={{ padding: 12, marginTop: 12 }} role="group" aria-label="Result of the last apply">
      <div className="pj-card-h"><span className="t">Result of the last apply</span></div>
      <div role="group" aria-label="Written to the design">
        <div className="pd-pane-s">Written to the design</div>
        {outcome.applied.length === 0
          ? <div className="pde-note">Nothing was written.</div>
          : (
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }}>
              {outcome.applied.map((p) => <li key={p} className="pg-mono">{p}</li>)}
            </ul>
          )}
      </div>
      <div role="group" aria-label="Not written, and why" style={{ marginTop: 8 }}>
        <div className="pd-pane-s">Not written, and why</div>
        {outcome.rejected.length === 0
          ? <div className="pde-note">Every accepted path was written.</div>
          : (
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }}>
              {outcome.rejected.map((r) => (
                <li key={r.path}><span className="pg-mono">{r.path}</span>{' — ' + r.reason}</li>
              ))}
            </ul>
          )}
      </div>
    </section>
  );
}

/* ── The tab ───────────────────────────────────────────────────────────────── */

export interface DerivationTabProps {
  doc: Record<string, unknown>;
  canWrite: boolean;
  onChanged?: () => void;
  onError?: (m: string) => void;
  onToast?: (m: string) => void;
}

export function DerivationTab({ doc, canWrite, onChanged, onError, onToast }: DerivationTabProps) {
  const documentId = Number(doc.id);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [drawer, setDrawer] = useState(false);
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);

  useEffect(() => {
    if (!Number.isInteger(documentId) || documentId <= 0) {
      setState({ kind: 'failed', message: 'This protocol row carries no numeric document id, so the derivation cannot be read.' });
      return;
    }
    let live = true;
    void (async () => {
      try {
        const next = await loadDerivation(documentId);
        if (live) setState(next);
      } catch (e) {
        if (live) setState({ kind: 'failed', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { live = false; };
  }, [documentId]);

  const toggle = (path: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });

  const applied = (body: Record<string, unknown>) => {
    setDrawer(false);
    setSelected(new Set());
    const list = Array.isArray(body.applied) ? (body.applied as string[]) : [];
    const rejected = Array.isArray(body.rejected) ? (body.rejected as ApplyOutcome['rejected']) : [];
    setOutcome({ applied: list, rejected });
    setState((s) => (s.kind === 'ready' ? { ...s, derivation: asDerivation(body.derivation) } : s));
    onToast?.(`${list.length} path(s) written to the design, ${rejected.length} refused. The write is in the audit trail.`);
    onChanged?.();
  };

  const paths = [...selected];

  return (
    <div className="pd-pane" role="region" aria-label="Design derivation">
      <PaneHead
        title="Design derivation"
        sub="What this protocol evidences about the study design it is bound to, as a field-level diff. A protocol edit never mutates the design: this is a proposal, you accept it path by path, and the write is one governed transaction."
        actions={[{
          label: `Apply accepted (${paths.length})`,
          icon: 'gitCompare',
          variant: 'primary',
          disabled: !canWrite || paths.length === 0 || state.kind !== 'ready',
          onAct: () => setDrawer(true),
        }]}
      />

      {state.kind === 'loading' && <div role="status" className="scaf-note">Reading the derivation…</div>}

      {state.kind === 'unbound' && (
        <div className="pde-note">
          {state.message} Nothing has been derived and no diff is shown, because there is no design
          to derive into. Bind one on the Study design tab first.
        </div>
      )}

      {state.kind === 'failed' && (
        <div className="pde-refusal" role="alert">
          {'The derivation could not be read — ' + state.message} Nothing below is a derivation, and
          this is not a protocol with nothing to propose.
        </div>
      )}

      {state.kind === 'ready' && (
        <>
          <div className="pde-note">
            {`Derived against study design ${state.studyDesignId || 'not named by the server'}. The paths are what is applied — the values are re-derived on the server from the protocol as it stands at that moment.`}
          </div>
          <BucketGroups d={state.derivation} selected={selected} onToggle={toggle} />
        </>
      )}

      {outcome && <ApplyResult outcome={outcome} />}

      {drawer && canWrite && paths.length > 0 && (
        <ApplyDrawer
          paths={paths}
          documentId={documentId}
          onCancel={() => setDrawer(false)}
          onDone={applied}
          onError={(m) => { setDrawer(false); onError?.(m); }}
        />
      )}
    </div>
  );
}

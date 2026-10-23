/**
 * Bundles — several governed reports as one pack.
 *
 * `/api/report-os/bundles` creates, lists and exports a bundle, and its PDF
 * was hardened by the 2026-10-01 review: every report, paginated, with its
 * status at export beside its bundled status, how many are final, and the
 * export id on every page and on the audit chain row
 * (`services/report-os/pdf/bundle-pdf.ts`). No screen called any of the three
 * routes, so the pack an inspector is handed could not be assembled.
 *
 * Two things this panel must state rather than hide:
 *   - a bundle is filed against the projects its runs belong to, so a run that
 *     belongs to none is refused with 422 — the client is told why;
 *   - the statuses on a card are the statuses AT BUNDLING. The PDF prints both,
 *     and the card says so, so a pack never implies a report is still in the
 *     state it was packaged in.
 *
 * @module client/src/concept2cure/v2/surfaces/InsightsBundlesPanel
 */
import React, { useMemo, useState } from 'react';
import { InsightsLegalPackage } from './InsightsLegalPackage';

import { EmptyState, ErrorState } from '../dataConnect';
import { LibraryRecovery, useLibraryActions, useLibraryMutation, useLibraryConfirmed, useLibraryRegister, type LibraryActions } from './insightsLibraryActions';
import { I } from '../icons';
import {
  BUNDLE_NEEDS_PROJECT_NOTE,
  BUNDLE_PDF_IS_A_MANIFEST,
  BUNDLE_REPORTS_PDF_NOTE,
  bundleRegisterCaveat,
  createBundle,
  isBundleList,
  whenText,
  type BundlePdfContent,
  type BundleRow,
} from './insightsLibraryModel';
import { PanelAlert, PanelHead, StatusTag } from './insightsLibraryShared';

function BundleCard({ bundle, exporting, onExport }: {
  bundle: BundleRow;
  exporting: boolean;
  onExport: (content: BundlePdfContent) => void;
}) {
  return (
    <div className="rl-card">
      <div className="rl-card-h">{bundle.name}</div>
      <div className="rl-card-meta">
        {bundle.items.length} report{bundle.items.length === 1 ? '' : 's'} · bundled {whenText(bundle.createdAt)}
      </div>
      <ul className="rl-nc-list">
        {bundle.items.map((it) => (
          <li key={it.runId} className="rl-nc-item">
            {it.reportTypeLabel} <StatusTag status={it.status} />
          </li>
        ))}
      </ul>
      <div className="rl-card-meta">Status shown is the status at bundling; the manifest prints it beside the status at export.</div>
      <div className="rl-head-acts" aria-busy={exporting}>
        <button type="button" className="rl-card-run" disabled={exporting} onClick={() => onExport('manifest')}>
          {I.download} Export manifest PDF
        </button>
        <button type="button" className="rl-card-run" disabled={exporting} onClick={() => onExport('reports')}>
          {I.download} Export reports PDF
        </button>
      </div>
      <InsightsLegalPackage bundleId={bundle.bundleId} disabled={exporting} />
      {exporting && <div className="rl-card-meta" role="status">Preparing PDF…</div>}
    </div>
  );
}

function BundleForm({
  count,
  name,
  setName,
  saving,
  locked,
  onSave,
  onClear,
}: {
  count: number;
  name: string;
  setName: (v: string) => void;
  saving: boolean;
  locked: boolean;
  onSave: () => void;
  onClear: () => void;
}) {
  const nameId = React.useId();
  return (
    <div className="rl-form" data-testid="rl-bundle-form">
      <div className="rl-filters">
        <div className="rl-filter rl-filter-wide">
          <label className="gov-label" htmlFor={nameId}>Bundle name</label>
          <input
            id={nameId}
            disabled={locked}
            className="rl-input"
            value={name}
            placeholder="e.g. Pre-approval inspection pack"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>
      <p className="rl-sub">{count} report{count === 1 ? '' : 's'} chosen in Run history.</p>
      <div className="rl-head-acts">
        <button type="button" className="btn primary" disabled={!name.trim() || locked} onClick={onSave}>
          {saving ? 'Creating…' : 'Create bundle'}
        </button>
        <button type="button" className="btn ghost" disabled={locked} onClick={onClear}>Clear selection</button>
      </div>
    </div>
  );
}

export function BundlesPanel({
  pendingRunIds,
  canWrite,
  pendingExports,
  onExport,
  onSaved,
  onClearPending,
  actions: ownerActions,
  context = 'library',
  accessCurrent = () => true,
}: {
  pendingRunIds: number[];
  canWrite: boolean;
  pendingExports: ReadonlySet<string>;
  onExport: (bundleId: string, name: string, content: BundlePdfContent) => void;
  onSaved: (msg: string) => void;
  onClearPending: () => void;
  actions?: LibraryActions;
  context?: string;
  accessCurrent?: () => boolean;
}) {
  const fallbackActions = useLibraryActions();
  const actions = ownerActions ?? fallbackActions;
  const mutate = useLibraryMutation(actions, context, accessCurrent);
  const register = useLibraryRegister<BundleRow>('/api/report-os/bundles', 'your bundles');
  const registerCaveat = useMemo(() => bundleRegisterCaveat(register.meta), [register.meta]);

  const creating = actions.get(context, 'bundle:create');
  const retained = creating?.payload.kind === 'bundle-create' ? creating.payload : null;
  const [name, setName] = useState(retained?.name ?? '');
  const [note, setNote] = useState<string | null>(null);
  const saving = creating?.phase === 'pending';
  const locked = !!creating;
  const selectedIds = retained?.runIds ?? pendingRunIds;

  const created = () => { setName(''); onClearPending(); register.refresh(); onSaved('Bundle created.'); };
  useLibraryConfirmed(actions, context, 'bundles', accessCurrent, created);
  const save = () => {
    if (!canWrite || !name.trim() || selectedIds.length === 0) return;
    setNote(null);
    void mutate('bundle:create', 'bundles', { kind: 'bundle-create', name: name.trim(), runIds: [...selectedIds] }, () => createBundle(name.trim(), selectedIds), res => {
      if (!res.ok) { if (!res.unconfirmed) setNote(res.message ?? 'The bundle was not created.'); return; }
      created();
    });
  };

  return (
    <div className="rl">
      <PanelHead
        title="Bundles"
        sub="A named set of governed reports. Export an index or the retained report bodies."
      />

      <div className="ro-dash-note" role="note" data-testid="rl-bundle-manifest-note">
        {I.info} {BUNDLE_PDF_IS_A_MANIFEST} {BUNDLE_REPORTS_PDF_NOTE} {BUNDLE_NEEDS_PROJECT_NOTE}
      </div>

      {registerCaveat && (
        <div className="ro-dash-note" role="status" data-testid="rl-bundle-register-caveat">
          {I.info} {registerCaveat}
        </div>
      )}

      <PanelAlert note={note} />
      <LibraryRecovery actions={actions} context={context} section="bundles" current={accessCurrent} path="/api/report-os/bundles" guard={isBundleList} onChecked={register.onChecked} />

      {canWrite && selectedIds.length > 0 && (
        <BundleForm
          count={selectedIds.length}
          name={name}
          setName={setName}
          saving={saving}
          locked={locked}
          onSave={() => void save()}
          onClear={onClearPending}
        />
      )}

      <BundleRegister register={register} pendingExports={pendingExports} onExport={onExport} />
    </div>
  );
}

function BundleRegister({ register, pendingExports, onExport }: {
  register: ReturnType<typeof useLibraryRegister<BundleRow>>;
  pendingExports: ReadonlySet<string>;
  onExport: (id: string, name: string, content: BundlePdfContent) => void;
}) {
  return <>{register.loading ? (
        <EmptyState busy icon={I.layers} title="Reading your bundles…" />
      ) : register.failure ? (
        (() => {
          const f = register.failure!;
          return (
            <ErrorState
              title={f.title}
              message={f.message}
              {...(f.retryable ? { retry: register.retry } : {})}
              testId="rl-bundles-error"
            />
          );
        })()
      ) : register.rows.length === 0 ? (
        <EmptyState
          icon={I.layers}
          title="No bundles yet"
          hint="Choose reports in Run history, then name a bundle here. The manifest PDF carries an export id on every page and is recorded on the audit chain."
          testId="rl-bundles-empty"
        />
      ) : (
        <div className="rl-grid">
          {register.rows.map((b) => (
            <BundleCard key={b.bundleId} bundle={b} exporting={pendingExports.has(b.bundleId)} onExport={(content) => onExport(b.bundleId, b.name, content)} />
          ))}
        </div>
      )}</>;
}

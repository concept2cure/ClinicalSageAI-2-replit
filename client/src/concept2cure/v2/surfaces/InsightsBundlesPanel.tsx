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

import { EmptyState, ErrorState, useLiveData } from '../dataConnect';
import { I } from '../icons';
import {
  BUNDLE_NEEDS_PROJECT_NOTE,
  BUNDLE_PDF_IS_A_MANIFEST,
  createBundle,
  whenText,
  type BundleRow,
} from './insightsLibraryModel';
import { PanelAlert, PanelHead, StatusTag, rowsOf } from './insightsLibraryShared';

function BundleCard({ bundle, onExport }: { bundle: BundleRow; onExport: () => void }) {
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
      <button type="button" className="rl-card-run" onClick={onExport}>
        {I.download} Export manifest PDF
      </button>
    </div>
  );
}

function BundleForm({
  count,
  name,
  setName,
  saving,
  onSave,
  onClear,
}: {
  count: number;
  name: string;
  setName: (v: string) => void;
  saving: boolean;
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
            className="rl-input"
            value={name}
            placeholder="e.g. Pre-approval inspection pack"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>
      <p className="rl-sub">{count} report{count === 1 ? '' : 's'} chosen in Run history.</p>
      <div className="rl-head-acts">
        <button type="button" className="btn primary" disabled={!name.trim() || saving} onClick={onSave}>
          {saving ? 'Creating…' : 'Create bundle'}
        </button>
        <button type="button" className="btn ghost" onClick={onClear}>Clear selection</button>
      </div>
    </div>
  );
}

export function BundlesPanel({
  pendingRunIds,
  canWrite,
  onExport,
  onSaved,
  onClearPending,
}: {
  pendingRunIds: number[];
  canWrite: boolean;
  onExport: (bundleId: string, name: string) => void;
  onSaved: (msg: string) => void;
  onClearPending: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const bundles = useLiveData<unknown>('/api/report-os/bundles', ['/api/report-os/bundles', attempt]);
  const rows = useMemo(() => rowsOf<BundleRow>(bundles.data), [bundles.data]);

  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || pendingRunIds.length === 0) return;
    setSaving(true);
    setNote(null);
    const res = await createBundle(name.trim(), pendingRunIds);
    setSaving(false);
    if (!res.ok) {
      setNote(res.message ?? 'The bundle was not created.');
      return;
    }
    setName('');
    onClearPending();
    setAttempt((n) => n + 1);
    onSaved('Bundle created.');
  };

  return (
    <div className="rl">
      <PanelHead
        title="Bundles"
        sub="A named set of governed reports, with a manifest PDF listing each one and its status."
      />

      <div className="ro-dash-note" role="note" data-testid="rl-bundle-manifest-note">
        {I.info} {BUNDLE_PDF_IS_A_MANIFEST} {BUNDLE_NEEDS_PROJECT_NOTE}
      </div>

      <PanelAlert note={note} />

      {canWrite && pendingRunIds.length > 0 && (
        <BundleForm
          count={pendingRunIds.length}
          name={name}
          setName={setName}
          saving={saving}
          onSave={() => void save()}
          onClear={onClearPending}
        />
      )}

      {bundles.loading ? (
        <EmptyState busy icon={I.layers} title="Reading your bundles…" />
      ) : bundles.error ? (
        <ErrorState
          title="Couldn't read your bundles"
          message="The bundle records could not be read. Nothing is shown in their place."
          retry={() => setAttempt((n) => n + 1)}
          testId="rl-bundles-error"
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={I.layers}
          title="No bundles yet"
          hint="Choose reports in Run history, then name a bundle here. The manifest PDF carries an export id on every page and is recorded on the audit chain."
          testId="rl-bundles-empty"
        />
      ) : (
        <div className="rl-grid">
          {rows.map((b) => (
            <BundleCard key={b.bundleId} bundle={b} onExport={() => onExport(b.bundleId, b.name)} />
          ))}
        </div>
      )}
    </div>
  );
}

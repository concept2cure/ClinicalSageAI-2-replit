/**
 * Feature Flags — global toggles with per-client override visibility. Flipping
 * a flag is a governed action (reason-for-change captured + audited).
 */

import * as React from 'react';
import { useFeatureFlags, useFeatureFlagMutation } from '../hooks/useMasterAdmin';
import { Badge, SectionHeader, Loading, ErrorState, Empty } from '../components/ui';
import { GovernedActionDialog } from '../components/GovernedActionDialog';
import { fmtRelative } from '../util';
import type { FeatureFlag } from '../types';

export function FeatureFlagsSurface() {
  const { data, loading, error, refresh } = useFeatureFlags();
  const mutate = useFeatureFlagMutation();
  const [target, setTarget] = React.useState<{ flag: FeatureFlag; next: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [mutErr, setMutErr] = React.useState<string | null>(null);

  const flags = data?.flags ?? [];

  const run = async (reason: string) => {
    if (!target) return;
    setBusy(true);
    setMutErr(null);
    const res = await mutate(target.flag.feature_key, target.next, reason);
    setBusy(false);
    if (res.ok) {
      setTarget(null);
      refresh();
    } else {
      setMutErr(res.error || 'Action failed.');
    }
  };

  if (loading && !data) return <Loading label="Loading feature flags…" />;
  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;

  return (
    <div className="ma-stack">
      <SectionHeader title="Feature flags" sub="Global rollout toggles and per-client overrides." />

      {flags.length === 0 ? (
        <Empty label="No feature flags defined." />
      ) : (
        <div className="ma-table-wrap">
          <table className="ma-table">
            <thead>
              <tr>
                <th>Flag</th>
                <th>State</th>
                <th className="ma-num">Org overrides</th>
                <th>Updated</th>
                <th className="ma-num">Action</th>
              </tr>
            </thead>
            <tbody>
              {flags.map(f => {
                const overrides = (f.enabled_for_organization_ids?.length ?? 0)
                  + (f.enabled_for_client_workspace_ids?.length ?? 0);
                return (
                  <tr key={f.feature_key}>
                    <td>
                      <div className="ma-cell-primary">{f.feature_key}</div>
                      {f.description && <div className="ma-cell-sub">{f.description}</div>}
                    </td>
                    <td><Badge tone={f.enabled ? 'ok' : 'muted'}>{f.enabled ? 'enabled' : 'disabled'}</Badge></td>
                    <td className="ma-num">{overrides}</td>
                    <td>{fmtRelative(f.updated_at)}</td>
                    <td className="ma-num">
                      <button
                        className={`ma-btn ma-btn-sm ${f.enabled ? 'ma-btn-danger' : 'ma-btn-primary'}`}
                        onClick={() => { setMutErr(null); setTarget({ flag: f, next: !f.enabled }); }}
                      >
                        {f.enabled ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <GovernedActionDialog
        open={target != null}
        title={target?.next ? 'Enable feature flag' : 'Disable feature flag'}
        description={`This changes "${target?.flag.feature_key}" globally for all clients. Recorded to the audit trail.`}
        confirmLabel={target?.next ? 'Enable flag' : 'Disable flag'}
        destructive={target ? !target.next : false}
        busy={busy}
        error={mutErr}
        onConfirm={run}
        onCancel={() => setTarget(null)}
      />
    </div>
  );
}

/** Metering Coverage — accuracy audit for the cost accounting. Shows whether
 *  every metered feature is priced explicitly, and surfaces the two gap lists
 *  that bound the accuracy of attributed cost. */

import * as React from 'react';
import { useMeteringCoverage } from '../hooks/useBusinessCenter';
import {
  Badge,
  SectionHeader,
  Loading,
  ErrorState,
  Empty,
} from '../../master-admin/components/ui';
import { fmtNumber, fmtRelative } from '../util';

export function MeteringCoverage() {
  const { data, loading, error, refresh } = useMeteringCoverage();

  if (loading && !data) return <Loading label="Loading metering coverage…" />;
  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  if (!data) return null;

  const { meteredFeatures, gaps, healthy, windowDays } = data;

  return (
    <div className="ma-stack">
      <SectionHeader
        title="Metering coverage"
        sub={`Accuracy boundary for attributed cost over the last ${windowDays} days. Cost is attributed only from features that emit metered usage.`}
      >
        <Badge tone={healthy ? 'ok' : 'warn'}>
          {healthy ? 'Healthy' : 'Attention needed'}
        </Badge>
      </SectionHeader>

      <div className="ma-card">
        <SectionHeader title="Metered features" sub="Usage seen in the window, and whether it has an explicit rate." />
        {meteredFeatures.length === 0 ? (
          <Empty label="No metered usage in the window." />
        ) : (
          <div className="ma-table-wrap">
            <table className="ma-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th className="ma-num">Credits</th>
                  <th className="ma-num">Events</th>
                  <th>Last seen</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {meteredFeatures.map(f => (
                  <tr key={f.featureId}>
                    <td>
                      <div className="ma-cell-primary">{f.featureId}</div>
                    </td>
                    <td className="ma-num">{fmtNumber(f.credits)}</td>
                    <td className="ma-num">{fmtNumber(f.events)}</td>
                    <td>{fmtRelative(f.lastSeen)}</td>
                    <td>
                      <Badge tone={f.hasExplicitRate ? 'ok' : 'warn'}>
                        {f.hasExplicitRate ? 'explicit' : 'default'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ma-card">
        <SectionHeader
          title="Usage without an explicit rate"
          sub="Billing usage priced at the catch-all default rate — a mispricing risk."
        />
        {gaps.usageWithoutExplicitRate.length === 0 ? (
          <Empty label="Every metered feature has an explicit rate." />
        ) : (
          <table className="ma-table ma-table-compact">
            <thead>
              <tr>
                <th>Feature</th>
                <th className="ma-num">Credits</th>
                <th>Priced at</th>
              </tr>
            </thead>
            <tbody>
              {gaps.usageWithoutExplicitRate.map(g => (
                <tr key={g.featureId}>
                  <td>
                    <div className="ma-cell-primary">{g.featureId}</div>
                  </td>
                  <td className="ma-num">{fmtNumber(g.credits)}</td>
                  <td>
                    <Badge tone="warn">{g.pricedAt}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="ma-card">
        <SectionHeader
          title="Rated but no usage"
          sub="A configured rate that saw no usage in the window — possibly stale."
        />
        {gaps.ratedButNoUsage.length === 0 ? (
          <Empty label="Every configured rate has matching usage." />
        ) : (
          <div className="ma-tag-list">
            {gaps.ratedButNoUsage.map(key => (
              <Badge key={key} tone="muted">
                {key}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="ma-foot-note">
        Snapshot generated {new Date(data.generatedAt).toLocaleString()}.
      </div>
    </div>
  );
}

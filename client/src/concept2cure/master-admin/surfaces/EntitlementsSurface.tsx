/** Entitlements — the module catalog and how widely each is enabled. */

import * as React from 'react';
import { useEntitlements } from '../hooks/useMasterAdmin';
import { Badge, SectionHeader, Loading, ErrorState, Empty } from '../components/ui';
import { fmtNumber } from '../util';

export function EntitlementsSurface() {
  const { data, loading, error, refresh } = useEntitlements();

  if (loading && !data) return <Loading label="Loading entitlements…" />;
  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  const modules = data?.modules ?? [];

  // Group by category for readability.
  const byCategory = React.useMemo(() => {
    const map = new Map<string, typeof modules>();
    for (const m of modules) {
      const cat = m.category || 'Other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(m);
    }
    return Array.from(map.entries());
  }, [modules]);

  return (
    <div className="ma-stack">
      <SectionHeader
        title="Entitlements"
        sub="Platform module catalog and per-module enablement across clients."
      />
      {modules.length === 0 ? (
        <Empty label="No modules in the catalog." />
      ) : (
        byCategory.map(([cat, mods]) => (
          <div className="ma-card" key={cat}>
            <div className="ma-subsection-title">{cat}</div>
            <table className="ma-table ma-table-compact">
              <thead>
                <tr>
                  <th>Module</th>
                  <th className="ma-num">Enabled clients</th>
                  <th className="ma-num">Subscriptions</th>
                </tr>
              </thead>
              <tbody>
                {mods.map(m => (
                  <tr key={m.module_id}>
                    <td>
                      <div className="ma-cell-primary">{m.name ?? m.module_id}</div>
                      {m.description && <div className="ma-cell-sub">{m.description}</div>}
                    </td>
                    <td className="ma-num">
                      <Badge tone={m.enabled_orgs > 0 ? 'ok' : 'muted'}>
                        {fmtNumber(m.enabled_orgs)}
                      </Badge>
                    </td>
                    <td className="ma-num">{fmtNumber(m.total_subscriptions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

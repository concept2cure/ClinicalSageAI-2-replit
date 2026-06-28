/** Cost Accounting — per-client revenue, cost and margin over the trailing
 *  30 days, with an authenticated CSV export. */

import * as React from 'react';
import { getAuthToken, getOrgId } from '@/utils/authToken';
import { useCostAccounting } from '../hooks/useBusinessCenter';
import {
  Badge,
  Kpi,
  SectionHeader,
  Loading,
  ErrorState,
  Empty,
} from '../../master-admin/components/ui';
import { I } from '../../mdx/icons';
import { fmtUsd, fmtPct, statusTone, marginTone } from '../util';

const CSV_URL = '/api/admin/business/cost-accounting.csv';

export function CostAccounting() {
  const { data, loading, error, refresh } = useCostAccounting();
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  // The CSV endpoint sits behind the Bearer-only /api auth gate, so a plain
  // anchor href would 401. Fetch with the same headers useFetchJson attaches,
  // then download the resulting blob.
  const onDownload = React.useCallback(async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const token = getAuthToken();
      const orgId = getOrgId();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (orgId) headers['x-organization-id'] = orgId;
      const res = await fetch(CSV_URL, { credentials: 'include', headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cost-accounting.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }, []);

  if (loading && !data) return <Loading label="Loading cost accounting…" />;
  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  if (!data) return null;

  const { clients, totals } = data;

  return (
    <div className="ma-stack">
      <SectionHeader
        title="Cost accounting"
        sub="Per-client revenue, attributed cost and gross margin over the trailing 30 days."
      >
        <button
          className="ma-btn ma-btn-sm"
          onClick={onDownload}
          disabled={downloading}
          aria-label="Download cost accounting as CSV"
        >
          <span className="bizc-btn-ico">{I.download}</span>
          {downloading ? 'Preparing…' : 'Download CSV'}
        </button>
      </SectionHeader>

      {downloadError && (
        <div className="ma-modal-error" role="alert">
          Could not export CSV. {downloadError}
        </div>
      )}

      <div className="ma-kpi-grid">
        <Kpi label="Total revenue" value={fmtUsd(totals.revenueCents)} meta="modeled MRR" />
        <Kpi label="Total cost" value={fmtUsd(totals.costCents)} meta="metered usage" />
        <Kpi
          label="Gross margin"
          value={fmtUsd(totals.marginCents)}
          meta={fmtPct(totals.marginPct)}
          metaTone={totals.marginCents >= 0 ? 'ok' : 'err'}
        />
      </div>

      <div className="ma-card">
        <SectionHeader title="By client" sub="Lowest margin first." />
        {clients.length === 0 ? (
          <Empty label="No clients yet." />
        ) : (
          <div className="ma-table-wrap">
            <table className="ma-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Tier</th>
                  <th>Status</th>
                  <th className="ma-num">Revenue</th>
                  <th className="ma-num">Cost</th>
                  <th className="ma-num">Margin</th>
                  <th className="ma-num">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.organizationId}>
                    <td>
                      <div className="ma-cell-primary">{c.name}</div>
                      <div className="ma-cell-sub">{c.slug}</div>
                    </td>
                    <td>
                      <Badge tone="accent">{c.tier}</Badge>
                    </td>
                    <td>
                      <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                    </td>
                    <td className="ma-num">{fmtUsd(c.revenueCents)}</td>
                    <td className="ma-num">{fmtUsd(c.costCents)}</td>
                    <td className="ma-num">
                      <Badge tone={marginTone(c.marginCents)}>{fmtUsd(c.marginCents)}</Badge>
                    </td>
                    <td className="ma-num">{fmtPct(c.marginPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ma-foot-note">
        Period: {data.period}. Snapshot generated {new Date(data.generatedAt).toLocaleString()}.
      </div>
    </div>
  );
}

/** Executive Summary — portfolio economics for the owner: MRR, cost run-rate,
 *  gross margin, loss-making clients, revenue concentration and tier mix. */

import * as React from 'react';
import { useExecutiveSummary } from '../hooks/useBusinessCenter';
import {
  Badge,
  Kpi,
  SectionHeader,
  Loading,
  ErrorState,
  Empty,
} from '../../master-admin/components/ui';
import { fmtUsd, fmtPct, fmtNumber } from '../bizc-format';

export function ExecutiveSummary({ onJump }: { onJump?: (nav: string) => void }) {
  const { data, loading, error, refresh } = useExecutiveSummary();

  if (loading && !data) return <Loading label="Loading executive summary…" />;
  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  if (!data) return null;

  const { portfolio, risk, topClients, tierMix } = data;
  const marginPositive = portfolio.grossMarginCents >= 0;

  return (
    <div className="ma-stack">
      <SectionHeader
        title="Executive summary"
        sub="Portfolio economics over the trailing 30 days. Revenue is modeled from the tier price card; cost is metered usage priced at the owner rates."
      />

      <div className="ma-kpi-grid">
        <Kpi
          label="Recognized MRR"
          value={fmtUsd(portfolio.mrrCents)}
          meta={`${fmtNumber(portfolio.clients)} clients · ${fmtNumber(portfolio.activeClients)} active`}
        />
        <Kpi
          label="Monthly cost run-rate"
          value={fmtUsd(portfolio.monthlyCostRunRateCents)}
          meta="metered usage × owner rates"
        />
        <Kpi
          label="Gross margin"
          value={fmtUsd(portfolio.grossMarginCents)}
          meta={marginPositive ? 'revenue exceeds cost' : 'cost exceeds revenue'}
          metaTone={marginPositive ? 'ok' : 'err'}
        />
        <Kpi
          label="Gross margin %"
          value={fmtPct(portfolio.grossMarginPct)}
          meta="blended across the portfolio"
          metaTone={marginPositive ? 'ok' : 'err'}
        />
        <Kpi
          label="Loss-making clients"
          value={fmtNumber(risk.lossMakingClients)}
          meta="cost exceeds revenue"
          metaTone={risk.lossMakingClients > 0 ? 'warn' : 'ok'}
        />
        <Kpi
          label="Top-5 revenue share"
          value={fmtPct(risk.revenueConcentrationTop5Pct)}
          meta="concentration in largest accounts"
          metaTone={risk.revenueConcentrationTop5Pct >= 60 ? 'warn' : 'muted'}
        />
      </div>

      <div className="ma-card">
        <SectionHeader
          title="Loss-making clients"
          sub="Clients whose attributed cost exceeds modeled revenue."
        >
          {onJump && (
            <button className="ma-link" onClick={() => onJump('cost-accounting')}>
              Open cost accounting →
            </button>
          )}
        </SectionHeader>
        {risk.lossMakers.length === 0 ? (
          <Empty label="No loss-making clients. Every account covers its cost." />
        ) : (
          <table className="ma-table ma-table-compact">
            <thead>
              <tr>
                <th>Client</th>
                <th className="ma-num">Revenue</th>
                <th className="ma-num">Cost</th>
                <th className="ma-num">Margin</th>
              </tr>
            </thead>
            <tbody>
              {risk.lossMakers.map(c => (
                <tr key={c.organizationId}>
                  <td>
                    <div className="ma-cell-primary">{c.name}</div>
                  </td>
                  <td className="ma-num">{fmtUsd(c.revenueCents)}</td>
                  <td className="ma-num">{fmtUsd(c.costCents)}</td>
                  <td className="ma-num">
                    <Badge tone="err">{fmtUsd(c.marginCents)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="ma-card">
        <SectionHeader
          title="Top clients by revenue"
          sub={`Top-5 accounts represent ${fmtPct(risk.revenueConcentrationTop5Pct)} of recognized revenue.`}
        />
        {topClients.length === 0 ? (
          <Empty label="No clients yet." />
        ) : (
          <table className="ma-table ma-table-compact">
            <thead>
              <tr>
                <th>Client</th>
                <th className="ma-num">Revenue</th>
                <th className="ma-num">Share</th>
              </tr>
            </thead>
            <tbody>
              {topClients.map(c => (
                <tr key={c.organizationId}>
                  <td>
                    <div className="ma-cell-primary">{c.name}</div>
                  </td>
                  <td className="ma-num">{fmtUsd(c.revenueCents)}</td>
                  <td className="ma-num">{fmtPct(c.sharePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="ma-card">
        <SectionHeader title="Tier mix" sub="Clients and recognized revenue by tier." />
        {tierMix.length === 0 ? (
          <Empty label="No clients yet." />
        ) : (
          <table className="ma-table ma-table-compact">
            <thead>
              <tr>
                <th>Tier</th>
                <th className="ma-num">Clients</th>
                <th className="ma-num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {tierMix.map(t => (
                <tr key={t.tier}>
                  <td>
                    <Badge tone="accent">{t.tier}</Badge>
                  </td>
                  <td className="ma-num">{fmtNumber(t.clients)}</td>
                  <td className="ma-num">{fmtUsd(t.revenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="ma-foot-note">
        {data.note} Snapshot generated {new Date(data.generatedAt).toLocaleString()}.
      </div>
    </div>
  );
}

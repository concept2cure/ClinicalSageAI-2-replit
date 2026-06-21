/**
 * Billing — subscription health across the estate: payment-status mix, trials
 * ending soon, past-due clients, and unacknowledged billing alerts (with a
 * one-click acknowledge for the support team).
 */

import * as React from 'react';
import { useBilling, useAlertAckMutation } from '../hooks/useMasterAdmin';
import { Badge, Kpi, SectionHeader, Loading, ErrorState, Empty } from '../components/ui';
import { fmtDate, fmtRelative, statusTone } from '../util';

export function BillingSurface() {
  const { data, loading, error, refresh } = useBilling();
  const ack = useAlertAckMutation();
  const [busyId, setBusyId] = React.useState<number | null>(null);

  if (loading && !data) return <Loading label="Loading billing…" />;
  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  if (!data) return null;

  const onAck = async (id: number) => {
    setBusyId(id);
    await ack(id);
    setBusyId(null);
    refresh();
  };

  return (
    <div className="ma-stack">
      <SectionHeader title="Billing" sub="Subscription and payment health across all clients." />

      <div className="ma-kpi-grid">
        {data.byPaymentStatus.map(s => (
          <Kpi key={s.payment_status} label={`Payment · ${s.payment_status}`} value={s.count} />
        ))}
      </div>

      <div className="ma-card">
        <SectionHeader title={`Trials ending soon (${data.trialsEndingSoon.length})`} sub="Next 14 days" />
        {data.trialsEndingSoon.length === 0 ? (
          <Empty label="No trials ending in the next 14 days." />
        ) : (
          <table className="ma-table ma-table-compact">
            <thead><tr><th>Client</th><th>Tier</th><th>Trial ends</th></tr></thead>
            <tbody>
              {data.trialsEndingSoon.map(t => (
                <tr key={t.id}>
                  <td><div className="ma-cell-primary">{t.name}</div><div className="ma-cell-sub">{t.slug}</div></td>
                  <td><Badge tone="accent">{t.tier}</Badge></td>
                  <td>{fmtDate(t.trial_ends_at)} · {fmtRelative(t.trial_ends_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="ma-card">
        <SectionHeader title={`Past due / incomplete (${data.pastDue.length})`} />
        {data.pastDue.length === 0 ? (
          <Empty label="No clients past due." />
        ) : (
          <table className="ma-table ma-table-compact">
            <thead><tr><th>Client</th><th>Status</th><th>Next billing</th></tr></thead>
            <tbody>
              {data.pastDue.map(t => (
                <tr key={t.id}>
                  <td><div className="ma-cell-primary">{t.name}</div><div className="ma-cell-sub">{t.slug}</div></td>
                  <td><Badge tone={statusTone(t.payment_status || '')}>{t.payment_status ?? 'unknown'}</Badge></td>
                  <td>{fmtDate(t.next_billing_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="ma-card">
        <SectionHeader title={`Unacknowledged alerts (${data.unacknowledgedAlerts.length})`} />
        {data.unacknowledgedAlerts.length === 0 ? (
          <Empty label="No open billing alerts." />
        ) : (
          <table className="ma-table ma-table-compact">
            <thead><tr><th>Client</th><th>Type</th><th>Message</th><th>When</th><th className="ma-num">Action</th></tr></thead>
            <tbody>
              {data.unacknowledgedAlerts.map(a => (
                <tr key={a.id}>
                  <td>{a.organization_name ?? `org ${a.organization_id}`}</td>
                  <td><Badge tone="warn">{a.type}</Badge></td>
                  <td className="ma-cell-sub">{a.message}</td>
                  <td>{fmtRelative(a.created_at)}</td>
                  <td className="ma-num">
                    <button className="ma-btn ma-btn-sm" disabled={busyId === a.id} onClick={() => onAck(a.id)}>
                      {busyId === a.id ? '…' : 'Acknowledge'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

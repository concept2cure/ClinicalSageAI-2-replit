/** Rate Cards — owner-managed cost rates (per metered credit) and tier pricing.
 *  Edits are governed: a reason-for-change is captured and written to the audit
 *  trail by the server. The new value is entered inline; the dialog confirms it
 *  alongside the reason. */

import * as React from 'react';
import {
  useCostRates,
  useTierPricing,
  useCostRateMutation,
  useTierPricingMutation,
} from '../hooks/useBusinessCenter';
import {
  Badge,
  SectionHeader,
  Loading,
  ErrorState,
  Empty,
} from '../../master-admin/components/ui';
import { GovernedActionDialog } from '../../master-admin/components/GovernedActionDialog';
import { fmtUsd, fmtRelative } from '../bizc-format';
import type { CostRate, TierPrice } from '../types';

/** Parse a dollar string (e.g. "14.99") into integer cents. */
function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Pending edit, either a cost rate or a tier price, awaiting reason capture. */
type PendingEdit =
  | { kind: 'rate'; costKey: string; label: string; unitCostCents: number }
  | { kind: 'tier'; tier: string; monthlyPriceCents: number; perSeatCents: number };

export function RateCards() {
  const rates = useCostRates();
  const tiers = useTierPricing();
  const saveRate = useCostRateMutation();
  const saveTier = useTierPricingMutation();

  const [pending, setPending] = React.useState<PendingEdit | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [dialogError, setDialogError] = React.useState<string | null>(null);

  const onConfirm = React.useCallback(
    async (reason: string) => {
      if (!pending) return;
      setBusy(true);
      setDialogError(null);
      const result =
        pending.kind === 'rate'
          ? await saveRate(pending.costKey, pending.unitCostCents, reason)
          : await saveTier(
              pending.tier,
              pending.monthlyPriceCents,
              pending.perSeatCents,
              reason
            );
      setBusy(false);
      if (result.ok) {
        setPending(null);
        if (pending.kind === 'rate') rates.refresh();
        else tiers.refresh();
      } else {
        setDialogError(result.error || 'Update failed.');
      }
    },
    [pending, saveRate, saveTier, rates, tiers]
  );

  const loading = (rates.loading && !rates.data) || (tiers.loading && !tiers.data);
  const loadError = (!rates.data && rates.error) || (!tiers.data && tiers.error);

  if (loading) return <Loading label="Loading rate cards…" />;
  if (loadError) {
    return (
      <ErrorState
        error={loadError}
        onRetry={() => {
          rates.refresh();
          tiers.refresh();
        }}
      />
    );
  }

  const dialogTitle =
    pending?.kind === 'rate'
      ? `Update cost rate — ${pending.label}`
      : pending?.kind === 'tier'
        ? `Update tier pricing — ${pending.tier}`
        : '';
  const dialogDesc =
    pending?.kind === 'rate'
      ? `New unit cost: ${fmtUsd(pending.unitCostCents)} per credit. This affects every cost-accounting figure derived from this rate.`
      : pending?.kind === 'tier'
        ? `New pricing: ${fmtUsd(pending.monthlyPriceCents)} per month + ${fmtUsd(pending.perSeatCents)} per seat. This affects recognized revenue for every client on this tier.`
        : '';

  return (
    <div className="ma-stack">
      <SectionHeader
        title="Rate cards"
        sub="Owner-managed unit costs and tier pricing. Edits are recorded to the audit trail with a reason for change."
      />

      <CostRatesCard rates={rates.data?.rates ?? []} onStage={setPending} />
      <TierPricingCard tiers={tiers.data?.tiers ?? []} onStage={setPending} />

      <GovernedActionDialog
        open={pending != null}
        title={dialogTitle}
        description={dialogDesc}
        confirmLabel="Save change"
        busy={busy}
        error={dialogError}
        onConfirm={onConfirm}
        onCancel={() => {
          if (!busy) {
            setPending(null);
            setDialogError(null);
          }
        }}
      />
    </div>
  );
}

// ─── Cost rates ──────────────────────────────────────────────────────────────

function CostRatesCard({
  rates,
  onStage,
}: {
  rates: CostRate[];
  onStage: (e: PendingEdit) => void;
}) {
  return (
    <div className="ma-card">
      <SectionHeader title="Cost rates" sub="Unit cost per metered credit, by feature." />
      {rates.length === 0 ? (
        <Empty label="No cost rates configured." />
      ) : (
        <div className="ma-table-wrap">
          <table className="ma-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Source</th>
                <th className="ma-num">Unit cost</th>
                <th className="ma-num">New value (USD)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rates.map(r => (
                <CostRateRow key={r.costKey} rate={r} onStage={onStage} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CostRateRow({
  rate,
  onStage,
}: {
  rate: CostRate;
  onStage: (e: PendingEdit) => void;
}) {
  const [value, setValue] = React.useState<string>((rate.unitCostCents / 100).toString());
  const cents = dollarsToCents(value);
  const changed = cents != null && cents !== rate.unitCostCents;

  return (
    <tr>
      <td>
        <div className="ma-cell-primary">{rate.label}</div>
        <div className="ma-cell-sub">
          {rate.costKey} · per {rate.unit}
        </div>
      </td>
      <td>
        <Badge tone={rate.source === 'override' ? 'accent' : 'muted'}>{rate.source}</Badge>
        {rate.updatedAt && (
          <div className="ma-cell-sub">updated {fmtRelative(rate.updatedAt)}</div>
        )}
      </td>
      <td className="ma-num">{fmtUsd(rate.unitCostCents)}</td>
      <td className="ma-num">
        <input
          className="ma-input bizc-input-sm"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value}
          aria-label={`New unit cost for ${rate.label} in dollars`}
          onChange={e => setValue(e.target.value)}
        />
      </td>
      <td className="ma-num">
        <button
          className="ma-btn ma-btn-sm"
          disabled={!changed}
          onClick={() =>
            cents != null &&
            onStage({ kind: 'rate', costKey: rate.costKey, label: rate.label, unitCostCents: cents })
          }
        >
          Edit
        </button>
      </td>
    </tr>
  );
}

// ─── Tier pricing ────────────────────────────────────────────────────────────

function TierPricingCard({
  tiers,
  onStage,
}: {
  tiers: TierPrice[];
  onStage: (e: PendingEdit) => void;
}) {
  return (
    <div className="ma-card">
      <SectionHeader
        title="Tier pricing"
        sub="Recognized revenue per tier: monthly base plus optional per-seat."
      />
      {tiers.length === 0 ? (
        <Empty label="No tiers configured." />
      ) : (
        <div className="ma-table-wrap">
          <table className="ma-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Source</th>
                <th className="ma-num">Monthly</th>
                <th className="ma-num">Per seat</th>
                <th className="ma-num">New monthly (USD)</th>
                <th className="ma-num">New per seat (USD)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tiers.map(t => (
                <TierPriceRow key={t.tier} tier={t} onStage={onStage} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TierPriceRow({
  tier,
  onStage,
}: {
  tier: TierPrice;
  onStage: (e: PendingEdit) => void;
}) {
  const [monthly, setMonthly] = React.useState<string>(
    (tier.monthlyPriceCents / 100).toString()
  );
  const [perSeat, setPerSeat] = React.useState<string>((tier.perSeatCents / 100).toString());
  const monthlyCents = dollarsToCents(monthly);
  const perSeatCents = dollarsToCents(perSeat);
  const valid = monthlyCents != null && perSeatCents != null;
  const changed =
    valid &&
    (monthlyCents !== tier.monthlyPriceCents || perSeatCents !== tier.perSeatCents);

  return (
    <tr>
      <td>
        <Badge tone="accent">{tier.tier}</Badge>
      </td>
      <td>
        <Badge tone={tier.source === 'override' ? 'accent' : 'muted'}>{tier.source}</Badge>
        {tier.updatedAt && (
          <div className="ma-cell-sub">updated {fmtRelative(tier.updatedAt)}</div>
        )}
      </td>
      <td className="ma-num">{fmtUsd(tier.monthlyPriceCents)}</td>
      <td className="ma-num">{fmtUsd(tier.perSeatCents)}</td>
      <td className="ma-num">
        <input
          className="ma-input bizc-input-sm"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={monthly}
          aria-label={`New monthly price for ${tier.tier} in dollars`}
          onChange={e => setMonthly(e.target.value)}
        />
      </td>
      <td className="ma-num">
        <input
          className="ma-input bizc-input-sm"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={perSeat}
          aria-label={`New per-seat price for ${tier.tier} in dollars`}
          onChange={e => setPerSeat(e.target.value)}
        />
      </td>
      <td className="ma-num">
        <button
          className="ma-btn ma-btn-sm"
          disabled={!changed}
          onClick={() =>
            valid &&
            onStage({
              kind: 'tier',
              tier: tier.tier,
              monthlyPriceCents: monthlyCents,
              perSeatCents: perSeatCents,
            })
          }
        >
          Edit
        </button>
      </td>
    </tr>
  );
}

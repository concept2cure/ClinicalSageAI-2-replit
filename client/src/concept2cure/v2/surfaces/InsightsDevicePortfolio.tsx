/**
 * Device projects in Reporting & analytics (D2, fold F4, 2026-10-30; decision
 * P-61 item 3, docs/LAUNCH_DEFINITION_OF_DONE.md;
 * docs/evidence/D2-ONE-ANA/2026-10-30/fold-f4-device-analytics/).
 *
 * The device analytics screen (mdx/surfaces/AnalyticsSurface.tsx) retired into
 * Reporting. This section shows what the overview's device read computed
 * (server/services/report-os/device-portfolio.ts) over the device projects the
 * reader can open: each recorded status with its count, the submission pace
 * over 24 months, and the AnA draft acceptance rate. Every figure on screen is
 * a field of the payload; nothing is computed, estimated or filled in here.
 *
 * A failed read is said, and no figure is drawn. A reader with no device
 * project sees no section. With no AnA draft recorded there is no rate, rather
 * than a rate of zero.
 */
import React from 'react';
import { I } from '../icons';

export type DevicePortfolioView =
  | { state: 'none' }
  | { state: 'unavailable' }
  | {
      state: 'computed';
      projectCount: number;
      byStatus: Array<{ status: string; count: number }>;
      pace: { months: string[]; counts: number[]; total: number };
      anaDrafts:
        | { state: 'computed'; accepted: number; pending: number; acceptanceRate: number | null }
        | { state: 'unavailable' };
    };

/** A recorded status as words: 'in_review' reads "In review". The value itself is the record's. */
function statusLabel(status: string): string {
  const words = status.replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : status;
}

export function InsightsDevicePortfolio({ device }: { device: DevicePortfolioView | undefined }) {
  const headingId = React.useId();
  if (!device || device.state === 'none') return null;
  if (device.state === 'unavailable') {
    return (
      <section className="ro-sec" aria-labelledby={headingId}>
        <h3 className="ro-sec-h" id={headingId}>Device projects</h3>
        <div className="ro-dash-note" role="alert">
          {I.alertTriangle} The device projects you can open could not be read just now. No figure is shown in their place.
        </div>
      </section>
    );
  }
  const { projectCount, byStatus, pace, anaDrafts } = device;
  const lastMonth = pace.months[pace.months.length - 1];
  return (
    <section className="ro-sec" aria-labelledby={headingId} data-testid="rc-device-portfolio">
      <h3 className="ro-sec-h" id={headingId}>Device projects</h3>
      <p className="ro-summary">
        {projectCount} device {projectCount === 1 ? 'project' : 'projects'} you can open, by the status each project's record holds.
      </p>
      <ul className="ro-list" aria-label="Device projects by status">
        {byStatus.map((row) => (
          <li key={row.status} className="ro-li">
            <span className="ro-li-b">{statusLabel(row.status)}</span>
            <span className="ro-bar-val">{row.count}</span>
          </li>
        ))}
      </ul>

      <div className="ro-rep-eyebrow">Submission pace</div>
      <p className="ro-summary">{pace.total} submitted in the {pace.months.length} months to {lastMonth}</p>
      <ul className="ro-list ro-pace" aria-label="Submissions by month">
        {pace.months.map((month, index) => (
          <li key={month} className="ro-li">
            <span className="ro-li-b">{month}</span>
            <span className="ro-bar-val">{pace.counts[index]}</span>
          </li>
        ))}
      </ul>

      <div className="ro-rep-eyebrow">AnA draft acceptance</div>
      {anaDrafts.state === 'unavailable' ? (
        <div className="ro-dash-note" role="note">{I.info} AnA draft acceptance could not be read, so no rate is shown.</div>
      ) : anaDrafts.acceptanceRate === null ? (
        <p className="ro-summary">No AnA draft is recorded against a device project you can open, so there is no rate.</p>
      ) : (
        <div className="ro-metric">
          <div className="ro-m-lbl">Accepted</div>
          <div className="ro-m-val" data-testid="device-ana-rate">{anaDrafts.acceptanceRate}%</div>
          <p className="ro-m-prov">{anaDrafts.accepted} of {anaDrafts.accepted + anaDrafts.pending} AnA drafts accepted</p>
        </div>
      )}
    </section>
  );
}

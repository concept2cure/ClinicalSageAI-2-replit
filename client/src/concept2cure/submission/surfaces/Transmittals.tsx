// Transmittals surface — the in-flight + recent transmission table with ACK
// chains and live status pills. All rows come from GET
// /api/mdx/gateways/transmittals (org-scoped, optional region/status filter).
// Each row opens an AnA round-trip about that transmittal. No kit / demo arrays.

import * as React from 'react';
import { useTransmittals } from '../../hooks/useSubmission';
import type { Transmittal } from '../../services/submissionService';
import { gatewayLabel, ackLevels, isInFlight, type AckState } from '../data/nav';
import type { RegionFilter } from '../shell/TopBar';
import {
  Loading, ErrorState, Empty, StatusPill, AckChain, formatTime,
} from './state';

interface Props {
  region: RegionFilter;
  onAskAna: (t: string) => void;
}

/** The transmittals table — shared shape used by the overview and this surface. */
export function TransmittalTable({
  transmittals, onAskAna,
}: { transmittals: Transmittal[]; onAskAna: (t: string) => void }) {
  return (
    <div className="sub-table" role="table" aria-label="Transmittals">
      <div className="sub-tr sub-tr-head" role="row">
        <span role="columnheader">Program</span>
        <span role="columnheader">Type</span>
        <span role="columnheader">Gateway</span>
        <span role="columnheader">Submission id</span>
        <span role="columnheader">ACK</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Submitted</span>
      </div>
      {transmittals.map(t => {
        const ack: { a1: AckState; a2: AckState; a3: AckState } = ackLevels(String(t.status));
        const label = `${gatewayLabel(String(t.gateway))} transmittal ${t.transmissionId ?? t.id}`;
        return (
          <button key={t.id} className="sub-tr" type="button" role="row"
                  aria-label={`Open ${label}`}
                  onClick={() => onAskAna(`Open transmittal ${t.transmissionId ?? t.id} (${t.programId ?? 'no program'} · ${t.submissionType ?? String(t.format ?? '')}) on ${gatewayLabel(String(t.gateway))} and show the full receipt detail and next step`)}>
            <span className="sub-prog" role="cell">{t.programId ? t.programId.slice(0, 8) : '—'}</span>
            <span className="sub-type" role="cell">{t.submissionType ?? String(t.format ?? '—')}</span>
            <span className="sub-gateway" role="cell">{gatewayLabel(String(t.gateway))}</span>
            <span className="sub-core sub-mono" role="cell">{t.transmissionId ?? '—'}</span>
            <span role="cell"><AckChain ack={ack} /></span>
            <span role="cell"><StatusPill status={String(t.status)} /></span>
            <span className="sub-when" role="cell">{formatTime(t.submittedAt)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SubmissionTransmittals({ region, onAskAna }: Props) {
  const filter = React.useMemo(
    () => (region === 'all' ? {} : { region }),
    [region],
  );
  const query = useTransmittals(filter);
  const transmittals = query.data ?? [];
  const inFlight = transmittals.filter(t => isInFlight(String(t.status))).length;

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Submission gateway · transmittals</div>
          <h1 className="bp-title">Transmittals to the agencies</h1>
          <div className="bp-meta">
            {transmittals.length} total · {inFlight} in flight
            {region !== 'all' ? ` · ${region.toUpperCase()} only` : ''}
          </div>
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <span>All transmittals</span>
          <span className="bp-meta">{transmittals.length} rows</span>
        </div>
        {query.isLoading ? (
          <Loading label="Loading transmittals…" />
        ) : query.isError ? (
          <ErrorState message="Could not load transmittals." />
        ) : transmittals.length === 0 ? (
          <Empty>No transmittals yet. Transmit a package to send it to an agency.</Empty>
        ) : (
          <TransmittalTable transmittals={transmittals} onAskAna={onAskAna} />
        )}
      </div>
    </div>
  );
}

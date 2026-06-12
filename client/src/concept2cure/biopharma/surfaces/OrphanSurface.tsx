/**
 * Orphan and rare surface — designations, RPD vouchers, advocacy (Phase 10.2,
 * SurfaceComposer template). Designation store is fixture-backed (labeled
 * sample) until the orphan endpoints land.
 *
 * @module client/src/concept2cure/biopharma/surfaces/OrphanSurface
 */

import * as React from 'react';
import { BioIcon } from '../icons';
import { SurfaceComposer, type SurfaceQueueItem } from '../shell/SurfaceComposer';
import { SamplePill, StatusPill } from './bits';
import { FIXTURE_ORPHAN } from '../data/fixtures';
import type { BiopharmaProgram } from '../data/programs';

const SAMPLE_QUEUE: SurfaceQueueItem[] = [
  { ico: 'sparkles',    title: 'FDA orphan designation requested',     sub: 'Decision pending',                    tone: 'warn', action: 'Status', cmd: 'Status of the pending FDA orphan designation request and expected decision window' },
  { ico: 'file',        title: 'Designation application planned',      sub: 'Pre-submission',                      tone: 'info', action: 'Draft',  cmd: 'Draft the FDA orphan designation application narrative — prevalence + scientific rationale' },
  { ico: 'users',       title: 'Patient advocacy steering committee',  sub: 'Quarterly engagement due',            tone: 'info', action: 'Prep',   cmd: 'Prepare the agenda for the next patient advocacy steering committee' },
];

export function BiopharmaOrphan({ programs, onAskAna }: { programs: BiopharmaProgram[]; onAskAna: (text: string) => void }) {
  void programs;
  const data = FIXTURE_ORPHAN;
  return (
    <SurfaceComposer
      scope="orphan and rare programs"
      kicker="Orphan drug · rare disease"
      title="Orphan and rare programs"
      stateLine={<>Designations across FDA / EMA / PMDA, RPD vouchers and grants, and patient advocacy engagements.</>}
      starters={[
        'Find orphan precedents for our lead rare-disease indication',
        'Draft the FDA orphan application narrative',
        'Pull every RPD voucher transaction 2022–2025',
        'Compare exclusivity benefits across FDA, EMA and PMDA designations',
      ]}
      queue={SAMPLE_QUEUE}
      queueSample
      primary={
        <button className="bp-btn-primary" type="button" onClick={() => onAskAna('Open a new orphan designation application — walk me through the prevalence evidence required')}>
          <BioIcon name="plus" /> Open designation application
        </button>
      }
      onAskAna={onAskAna}
      dashboardLabel="Reference data · designations, vouchers, advocacy"
      dashboardSample
    >
      <div className="bp-card">
        <div className="bp-card-head">
          <h3>Designations</h3>
          <SamplePill />
          <span className="bp-card-meta">FDA · EMA · PMDA</span>
        </div>
        <div className="bp-list bp-list-dense">
          {data.designations.map((d, i) => (
            <div key={i} className="bp-row">
              <span className="bp-tag bp-tag-mono">{d.product}</span>
              <span className="bp-tag">{d.agency}</span>
              <div className="bp-row-body">
                <div className="bp-row-title">{d.indication}</div>
                <div className="bp-row-sub">
                  {d.date ?? 'no date'} · {d.prevalence} · {d.benefits[0]}
                  {d.benefits.length > 1 ? ` +${d.benefits.length - 1}` : ''}
                </div>
              </div>
              <StatusPill
                status={d.status === 'designated' ? 'approved' : d.status === 'requested' ? 'review' : 'drafted'}
                label={d.status}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bp-split-1-1" style={{ marginTop: 16 }}>
        <div className="bp-card">
          <div className="bp-card-head"><h3>RPD vouchers and grants</h3><SamplePill /></div>
          <div className="bp-list bp-list-dense">
            {data.rpdGrants.map((g, i) => (
              <div key={i} className="bp-row">
                <span className="bp-tag bp-tag-mono">{g.product}</span>
                <div className="bp-row-body">
                  <div className="bp-row-title">{g.kind} · {g.voucherValue}</div>
                  <div className="bp-row-sub">{g.notes}</div>
                </div>
                <StatusPill status="approved" label={g.status} />
              </div>
            ))}
          </div>
        </div>

        <div className="bp-card">
          <div className="bp-card-head"><h3>Patient advocacy engagements</h3><SamplePill /></div>
          <div className="bp-list bp-list-dense">
            {data.patientAdvocacy.map((a, i) => (
              <div key={i} className="bp-row">
                <span className="bp-tag bp-tag-mono">{a.product}</span>
                <div className="bp-row-body">
                  <div className="bp-row-title">{a.org}</div>
                  <div className="bp-row-sub">{a.engagement}</div>
                </div>
                <button
                  className="bp-btn-tert"
                  type="button"
                  onClick={() => onAskAna(`Summarize our engagement history with ${a.org}`)}
                  aria-label={`Open ${a.org}`}
                >
                  <BioIcon name="arrowRight" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SurfaceComposer>
  );
}

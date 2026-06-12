/**
 * Lifecycle management surface — post-approval supplements, variations,
 * CMC change control, renewal cycles (Phase 10.2, SurfaceComposer template).
 *
 * The supplements / change-control / renewal stores have no live endpoint
 * yet (moat-phase deliverable) — reference data is fixture-backed and
 * labeled sample. Queue + starters dispatch real prompts to AnA.
 *
 * @module client/src/concept2cure/biopharma/surfaces/LifecycleSurface
 */

import * as React from 'react';
import { BioIcon } from '../icons';
import { SurfaceComposer, type SurfaceQueueItem } from '../shell/SurfaceComposer';
import { SamplePill, StatusPill } from './bits';
import { FIXTURE_LIFECYCLE } from '../data/fixtures';
import type { BiopharmaProgram } from '../data/programs';

const SAMPLE_QUEUE: SurfaceQueueItem[] = [
  { ico: 'history',     title: 'Type II variation in CHMP review',        sub: 'Specification change — host cell protein', tone: 'warn', action: 'Status',  cmd: 'Status of the Type II variation in CHMP review and any open questions' },
  { ico: 'beaker',      title: 'High-risk CMC change under evaluation',   sub: 'Bioreactor scale-up 2,000L → 5,000L',      tone: 'warn', action: 'Assess',  cmd: 'Assess the bioreactor scale-up change against ICH Q12 — PACMP eligible or prior-approval supplement?' },
  { ico: 'file',        title: 'Type IB variation still in drafting',     sub: 'Container closure update',                 tone: 'info', action: 'Draft',   cmd: 'Continue drafting the Type IB container closure variation' },
  { ico: 'shieldCheck', title: 'Annual report cycle approaching',         sub: 'PADER · FDA',                              tone: 'info', action: 'Prep',    cmd: 'Prepare the next PADER annual report — pull every post-approval change this cycle' },
];

export function BiopharmaLifecycle({ programs, onAskAna }: { programs: BiopharmaProgram[]; onAskAna: (text: string) => void }) {
  const approved = programs.filter(p => (p.status ?? '').toLowerCase() === 'approved' || (p.status ?? '').toLowerCase() === 'complete');
  const data = FIXTURE_LIFECYCLE;

  return (
    <SurfaceComposer
      scope="lifecycle management"
      kicker="Post-approval · supplements · variations"
      title="Lifecycle management"
      stateLine={
        approved.length > 0
          ? <><b>{approved.length}</b> approved product{approved.length === 1 ? '' : 's'} in post-approval lifecycle.</>
          : <>Post-approval changes — supplements, variations, CMC change control, and renewal cycles.</>
      }
      starters={[
        'Compare CMC change-control across the approved portfolio',
        'Draft a Type II variation against the current EMA guidance',
        'Open every supplement filed in the last 90 days',
        'Which changes are PACMP-eligible under ICH Q12?',
      ]}
      queue={SAMPLE_QUEUE}
      queueSample
      primary={
        <button className="bp-btn-primary" type="button" onClick={() => onAskAna('Start a new supplement — walk me through pathway and classification')}>
          <BioIcon name="plus" /> New supplement
        </button>
      }
      onAskAna={onAskAna}
      dashboardLabel="Reference data · supplements, CMC change control, renewals"
      dashboardSample
    >
      <div className="bp-card">
        <div className="bp-card-head">
          <h3>Supplements and variations</h3>
          <SamplePill />
          <span className="bp-card-meta">FDA · EMA · PMDA</span>
        </div>
        <div className="bp-list bp-list-dense">
          {data.supplements.map(s => (
            <div key={s.id} className="bp-row">
              <span className="bp-tag bp-tag-mono">{s.agency}</span>
              <div className="bp-row-body">
                <div className="bp-row-title">{s.kind} · {s.product} · {s.subject}</div>
                <div className="bp-row-sub small-mono">{s.id} · filed {s.filed ?? '—'} · {s.due}</div>
              </div>
              <StatusPill status={s.status} />
            </div>
          ))}
        </div>
      </div>

      <div className="bp-split-1-1" style={{ marginTop: 16 }}>
        <div className="bp-card">
          <div className="bp-card-head">
            <h3>CMC change control</h3>
            <SamplePill />
            <span className="bp-card-meta">{data.cmcChangeControl.length} changes tracked</span>
          </div>
          <div className="bp-list bp-list-dense">
            {data.cmcChangeControl.map(c => (
              <div key={c.id} className="bp-row">
                <span className={`bp-sev bp-sev-${c.risk === 'high' ? 'err' : 'warn'}`}>{c.risk}</span>
                <div className="bp-row-body">
                  <div className="bp-row-title">{c.title}</div>
                  <div className="bp-row-sub">{c.area} · {c.programs.join(', ')}</div>
                </div>
                <StatusPill
                  status={c.status === 'implemented' ? 'approved' : c.status === 'planned' ? 'drafted' : 'evaluating'}
                  label={c.status}
                />
              </div>
            ))}
          </div>
          <div className="bp-card-foot">
            <button className="bp-ask" type="button" onClick={() => onAskAna('Classify the open CMC changes against ICH Q12 — flag which are PACMP-eligible and which need a prior-approval supplement.')}>
              <span className="bp-ask-spark"><BioIcon name="sparkles" /></span>
              <span>Classify these changes against ICH Q12</span>
            </button>
          </div>
        </div>

        <div className="bp-card">
          <div className="bp-card-head">
            <h3>Renewal cycles</h3>
            <SamplePill />
            <span className="bp-card-meta">PADER · 5-year · re-exam</span>
          </div>
          <div className="bp-list bp-list-dense">
            {data.renewals.map((r, i) => (
              <div key={i} className="bp-row">
                <span className="bp-tag bp-tag-mono">{r.authority}</span>
                <div className="bp-row-body">
                  <div className="bp-row-title">{r.product} · {r.next}</div>
                  <div className="bp-row-sub">{r.interval} cycle</div>
                </div>
                <button
                  className="bp-btn-tert"
                  type="button"
                  onClick={() => onAskAna(`Prepare the ${r.authority} ${r.next} renewal for ${r.product}`)}
                  aria-label={`Prepare ${r.next}`}
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

/**
 * Pediatric surface — PREA / iPSP / EMA PIP (Phase 10.2, SurfaceComposer
 * template). Plans + milestones are fixture-backed (labeled sample) until
 * the pediatric store lands.
 *
 * @module client/src/concept2cure/biopharma/surfaces/PediatricSurface
 */

import * as React from 'react';
import { BioIcon } from '../icons';
import { SurfaceComposer, type SurfaceQueueItem } from '../shell/SurfaceComposer';
import { SamplePill, StatusPill } from './bits';
import { FIXTURE_PEDIATRIC } from '../data/fixtures';
import type { BiopharmaProgram } from '../data/programs';

const SAMPLE_QUEUE: SurfaceQueueItem[] = [
  { ico: 'users',       title: 'PIP modification pending CHMP advice',  sub: 'Paediatric population scope change',  tone: 'warn', action: 'Open',   cmd: 'Open the pending PIP modification and summarize the scope change' },
  { ico: 'file',        title: 'iPSP still in draft',                   sub: 'Pre-IND dependency',                  tone: 'warn', action: 'Draft',  cmd: 'Continue drafting the iPSP — focus on the age-range rationale' },
  { ico: 'clock',       title: 'PREA milestone due this quarter',       sub: 'Adolescent PK substudy — interim',    tone: 'info', action: 'Status', cmd: 'Status of the adolescent PK substudy interim milestone' },
  { ico: 'shieldCheck', title: 'Waiver justification not finalized',    sub: 'M1 §1.9',                             tone: 'info', action: 'Draft',  cmd: 'Draft the pediatric assessment waiver justification for M1 §1.9' },
];

export function BiopharmaPediatric({ programs, onAskAna }: { programs: BiopharmaProgram[]; onAskAna: (text: string) => void }) {
  void programs;
  const data = FIXTURE_PEDIATRIC;
  return (
    <SurfaceComposer
      scope="the pediatric strategy"
      kicker="Pediatric · §505B PREA · EMA PIP"
      title="Pediatric strategy"
      stateLine={<>FDA iPSP and EMA PIP plans, deferrals, waivers, and PREA milestones across the portfolio.</>}
      starters={[
        'Draft the PSP rationale for adolescent extrapolation',
        'Compare PIP modifications across the portfolio',
        'Surface every PIP milestone due in the next 90 days',
        'Draft a PREA waiver justification against the extrapolation framework',
      ]}
      queue={SAMPLE_QUEUE}
      queueSample
      primary={
        <button className="bp-btn-primary" type="button" onClick={() => onAskAna('Open a new pediatric plan — walk me through iPSP vs PIP requirements')}>
          <BioIcon name="plus" /> Open pediatric plan
        </button>
      }
      onAskAna={onAskAna}
      dashboardLabel="Reference data · plans and PREA milestones"
      dashboardSample
    >
      <div className="bp-card">
        <div className="bp-card-head">
          <h3>Plans</h3>
          <SamplePill />
          <span className="bp-card-meta">FDA iPSP + EMA PIP</span>
        </div>
        <div className="bp-list bp-list-dense">
          {data.plans.map(plan => (
            <div key={plan.id} className="bp-row">
              <span className="bp-tag bp-tag-mono">{plan.product}</span>
              <div className="bp-row-body">
                <div className="bp-row-title">{plan.kind} · ages {plan.ageRange}</div>
                <div className="bp-row-sub">
                  {plan.deferrals} deferral{plan.deferrals === 1 ? '' : 's'} · {plan.waivers} waiver{plan.waivers === 1 ? '' : 's'} · {plan.milestones} milestones · {plan.due}
                </div>
              </div>
              <StatusPill status={plan.status} />
            </div>
          ))}
        </div>
      </div>

      <div className="bp-card" style={{ marginTop: 16 }}>
        <div className="bp-card-head">
          <h3>Upcoming PREA milestones</h3>
          <SamplePill />
        </div>
        <div className="bp-list bp-list-dense">
          {data.prea.upcoming.map((u, i) => (
            <div key={i} className="bp-row">
              <span className="bp-tag bp-tag-mono">{u.product}</span>
              <div className="bp-row-body">
                <div className="bp-row-title">{u.ms}</div>
                <div className="bp-row-sub">Due {u.due}</div>
              </div>
              <button
                className="bp-btn-tert"
                type="button"
                onClick={() => onAskAna(`Status of the ${u.product} milestone "${u.ms}" due ${u.due}`)}
                aria-label={`Open milestone ${u.ms}`}
              >
                <BioIcon name="arrowRight" />
              </button>
            </div>
          ))}
        </div>
        <div className="bp-card-foot">
          <button className="bp-ask" type="button" onClick={() => onAskAna('Draft a PREA waiver justification against the pediatric extrapolation framework from the last Type C meeting.')}>
            <span className="bp-ask-spark"><BioIcon name="sparkles" /></span>
            <span>Draft PREA waiver justification</span>
          </button>
        </div>
      </div>
    </SurfaceComposer>
  );
}

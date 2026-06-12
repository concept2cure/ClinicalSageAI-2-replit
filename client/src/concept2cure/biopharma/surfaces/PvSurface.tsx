/**
 * Pharmacovigilance surface — signals + PSUR / PBRER cycles (Phase 10.2,
 * SurfaceComposer template). Signal and aggregate-report stores are
 * fixture-backed (labeled sample) until the PV endpoints land.
 *
 * @module client/src/concept2cure/biopharma/surfaces/PvSurface
 */

import * as React from 'react';
import { BioIcon } from '../icons';
import { SurfaceComposer, type SurfaceQueueItem } from '../shell/SurfaceComposer';
import { SamplePill, StatusPill } from './bits';
import { FIXTURE_PV } from '../data/fixtures';
import type { BiopharmaProgram } from '../data/programs';

const SAMPLE_QUEUE: SurfaceQueueItem[] = [
  { ico: 'alertCircle', title: 'Pneumonitis signal under evaluation',  sub: 'PRR 4.2 · 27 cases · FAERS',           tone: 'err',  action: 'Adjudicate', cmd: 'Adjudicate the immune-mediated pneumonitis signal — pull every case narrative, run causality assessment, suggest label update' },
  { ico: 'file',        title: 'PSUR drafting in cycle',               sub: 'EMA · day +60 window',                 tone: 'warn', action: 'Continue',   cmd: 'Continue drafting the open PSUR — focus on §15 risk evaluation' },
  { ico: 'globe',       title: 'PBRER queued for the FDA cycle',       sub: 'Day +60 window',                       tone: 'info', action: 'Start',      cmd: 'Start the queued PBRER — pull the safety data since the last data lock point' },
  { ico: 'shieldCheck', title: 'Cross-database reconciliation',        sub: 'EudraVigilance + FAERS',               tone: 'info', action: 'Run',        cmd: 'Cross-reference EudraVigilance and FAERS for the active signals' },
];

export function BiopharmaPv({ programs, onAskAna }: { programs: BiopharmaProgram[]; onAskAna: (text: string) => void }) {
  void programs;
  const data = FIXTURE_PV;
  return (
    <SurfaceComposer
      scope="safety surveillance"
      kicker="Pharmacovigilance · PSUR / PBRER · signals"
      title="Safety surveillance"
      stateLine={<>Signal detection, aggregate reports in cycle, and expedited submissions across approved products.</>}
      starters={[
        'Adjudicate the highest-PRR signal across the portfolio',
        'Draft the PSUR §15 risk evaluation',
        'Cross-reference EudraVigilance and FAERS for active signals',
        'List every expedited report filed this quarter',
      ]}
      queue={SAMPLE_QUEUE}
      queueSample
      primary={
        <button className="bp-btn-primary" type="button" onClick={() => onAskAna('Start an expedited safety report — walk me through the 7/15-day decision')}>
          <BioIcon name="send" /> Submit safety report
        </button>
      }
      onAskAna={onAskAna}
      dashboardLabel="Reference data · active signals and aggregate reports"
      dashboardSample
    >
      <div className="bp-card">
        <div className="bp-card-head">
          <h3>Active signals</h3>
          <SamplePill />
          <span className="bp-card-meta">FAERS + EudraVigilance · last 90 days</span>
        </div>
        <div className="bp-list bp-list-dense">
          {data.signals.map(s => (
            <div key={s.id} className="bp-row">
              <span className="bp-tag bp-tag-mono">{s.product}</span>
              <div className="bp-row-body">
                <div className="bp-row-title">{s.term}</div>
                <div className="bp-row-sub">
                  {s.count} cases ·{' '}
                  <span className={s.prr >= 3 ? 'tone-err' : s.prr >= 2 ? 'tone-warn' : ''}>PRR {s.prr.toFixed(1)}</span>
                  {' '}· owner {s.owner} · {s.age}
                </div>
              </div>
              <StatusPill status={s.status} />
            </div>
          ))}
        </div>
        <div className="bp-card-foot">
          <button className="bp-ask" type="button" onClick={() => onAskAna('Adjudicate the immune-mediated pneumonitis signal — pull every case narrative, run causality assessment, suggest label update.')}>
            <span className="bp-ask-spark"><BioIcon name="sparkles" /></span>
            <span>Adjudicate the pneumonitis signal</span>
          </button>
        </div>
      </div>

      <div className="bp-card" style={{ marginTop: 16 }}>
        <div className="bp-card-head">
          <h3>Aggregate reports in cycle</h3>
          <SamplePill />
          <span className="bp-card-meta">PSUR + PBRER</span>
        </div>
        <div className="bp-list bp-list-dense">
          {data.psurs.map((r, i) => (
            <div key={i} className="bp-row">
              <span className="bp-tag bp-tag-mono">{r.product}</span>
              <div className="bp-row-body">
                <div className="bp-row-title">{r.cycle}</div>
                <div className="bp-row-sub">Due {r.dueAgency} · drafted by {r.writtenBy} · reviewers {r.reviewers.join(', ')}</div>
              </div>
              <StatusPill status={r.status} />
            </div>
          ))}
        </div>
      </div>
    </SurfaceComposer>
  );
}

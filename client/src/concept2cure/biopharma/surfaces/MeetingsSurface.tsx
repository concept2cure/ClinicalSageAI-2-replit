/**
 * Agency meetings surface — FDA / EMA / PMDA meetings + briefing books
 * (Phase 10.2, SurfaceComposer template). Meeting store is fixture-backed
 * (labeled sample) until the meetings endpoints land.
 *
 * @module client/src/concept2cure/biopharma/surfaces/MeetingsSurface
 */

import * as React from 'react';
import { BioIcon } from '../icons';
import { SurfaceComposer, type SurfaceQueueItem } from '../shell/SurfaceComposer';
import { ReadinessBar, SamplePill, StatusPill } from './bits';
import { FIXTURE_MEETINGS } from '../data/fixtures';
import type { BiopharmaProgram } from '../data/programs';

const SAMPLE_QUEUE: SurfaceQueueItem[] = [
  { ico: 'messageCircle', title: 'Type C briefing book — 60% drafted',  sub: 'Briefing due before the meeting date',   tone: 'warn', action: 'Continue', cmd: 'Continue drafting the Type C briefing book — CMC stability strategy' },
  { ico: 'clock',         title: 'Scientific advice briefing at 30%',   sub: 'EMA · PIP modification scope',           tone: 'warn', action: 'Draft',    cmd: 'Draft the next sections of the EMA scientific advice briefing book' },
  { ico: 'globe',         title: 'Pre-NDA consultation not started',    sub: 'PMDA · bridging strategy alignment',     tone: 'info', action: 'Outline',  cmd: 'Outline the PMDA pre-NDA consultation briefing book' },
  { ico: 'file',          title: 'Meeting minutes pending',             sub: 'Document consult · CMC bridging',        tone: 'info', action: 'Track',    cmd: 'Track the pending PMDA document-consult minutes and summarize open items' },
];

export function BiopharmaMeetings({ programs, onAskAna }: { programs: BiopharmaProgram[]; onAskAna: (text: string) => void }) {
  void programs;
  const data = FIXTURE_MEETINGS;
  return (
    <SurfaceComposer
      scope="agency meetings"
      kicker="FDA · EMA · PMDA · Type A/B/C/D · scientific advice"
      title="Agency meetings"
      stateLine={<>Upcoming meetings, briefing-book pipeline, and concluded-meeting outcomes across agencies.</>}
      starters={[
        'Generate the next Type C briefing book outline',
        'Pull every aligned FDA outcome 2024–2026',
        'Cross-reference past minutes for the stability strategy',
        'Which upcoming briefing books are behind schedule?',
      ]}
      queue={SAMPLE_QUEUE}
      queueSample
      primary={
        <button className="bp-btn-primary" type="button" onClick={() => onAskAna('Request an agency meeting — walk me through Type A/B/C/D selection and the request letter')}>
          <BioIcon name="plus" /> Request meeting
        </button>
      }
      onAskAna={onAskAna}
      dashboardLabel="Reference data · upcoming meetings, outcomes, briefing books"
      dashboardSample
    >
      <div className="bp-card">
        <div className="bp-card-head">
          <h3>Upcoming meetings</h3>
          <SamplePill />
          <span className="bp-card-meta">Briefing books in flight</span>
        </div>
        <div className="bp-list bp-list-dense">
          {data.upcoming.map(m => (
            <div key={m.id} className="bp-row">
              <span className="bp-tag bp-tag-mono">{m.kind}</span>
              <div className="bp-row-body">
                <div className="bp-row-title">{m.product} · {m.topic}</div>
                <div className="bp-row-sub">
                  {m.date} · briefing due {m.briefingDue ?? '—'} · owner {m.owner}
                </div>
              </div>
              <div style={{ width: 120 }}><ReadinessBar pct={m.briefingPct} /></div>
              <StatusPill
                status={m.status === 'briefing-due' ? 'review' : m.status === 'scheduled' ? 'drafted' : 'queued'}
                label={m.status}
              />
            </div>
          ))}
        </div>
        <div className="bp-card-foot">
          <button className="bp-ask" type="button" onClick={() => onAskAna('Draft the complete Type C briefing book for CMC stability — pull the current FDA stability guidance, our prior nonclinical alignment, and structure 6 questions for the agency.')}>
            <span className="bp-ask-spark"><BioIcon name="sparkles" /></span>
            <span>Draft Type C briefing book</span>
          </button>
        </div>
      </div>

      <div className="bp-split-1-1" style={{ marginTop: 16 }}>
        <div className="bp-card">
          <div className="bp-card-head">
            <h3>Recent meetings</h3>
            <SamplePill />
            <span className="bp-card-meta">Outcomes + minutes</span>
          </div>
          <div className="bp-list bp-list-dense">
            {data.recent.map(m => (
              <div key={m.id} className="bp-row">
                <span className="bp-tag bp-tag-mono">{m.kind}</span>
                <div className="bp-row-body">
                  <div className="bp-row-title">{m.product} · {m.topic}</div>
                  <div className="bp-row-sub">{m.date} · {m.minutes}</div>
                </div>
                <StatusPill
                  status={m.outcome === 'aligned' ? 'approved' : m.outcome === 'partial' ? 'review' : 'drafted'}
                  label={m.outcome}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bp-card">
          <div className="bp-card-head">
            <h3>Briefing book pipeline</h3>
            <SamplePill />
            <span className="bp-card-meta">Section readiness</span>
          </div>
          <div className="bp-list bp-list-dense">
            {data.briefingBooks.map(b => {
              const pct = Math.round(((b.drafted + b.reviewed + b.finalized) / b.sections) * 100);
              const meeting = data.upcoming.find(m => m.id === b.meetingId);
              return (
                <div key={b.meetingId} className="bp-row bp-row-stack">
                  <div className="bp-row-line-1">
                    <span className="bp-tag bp-tag-mono">{meeting?.kind ?? b.meetingId}</span>
                    <span className="bp-row-title">{meeting?.topic ?? b.meetingId}</span>
                    <span className="small-mono">{b.finalized}/{b.sections} final</span>
                  </div>
                  <ReadinessBar pct={pct} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </SurfaceComposer>
  );
}

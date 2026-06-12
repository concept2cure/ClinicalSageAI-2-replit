/**
 * IND / CTA surface — Phase 10.2 reference implementation of the
 * SurfaceComposer pattern (PHASE_10_2_INSTALL.md §3.2). The remaining
 * pathway surfaces follow this template.
 *
 * Live data: programs from /api/biopharma/programs (passed in), inbound
 * HAQ/correspondence from /api/regulatory-correspondence. The reference
 * dashboard below the composer (modules, FDA interactions incl. predicted
 * HAQs, contradictions, blockers) is fixture-backed until the moat-phase
 * endpoints land — every fixture card carries the sample pill.
 *
 * Port of ui_kits/biopharma/surfaces.jsx > IndSurface.
 *
 * @module client/src/concept2cure/biopharma/surfaces/IndSurface
 */

import * as React from 'react';
import { BioIcon } from '../icons';
import { SurfaceComposer, type SurfaceQueueItem } from '../shell/SurfaceComposer';
import { ReadinessBar, SamplePill, StatusPill, ToneText } from './bits';
import { FIXTURE_IND } from '../data/fixtures';
import { useInboundCorrespondence } from '../data/correspondence';
import type { BiopharmaProgram } from '../data/programs';

interface IndSurfaceProps {
  programs: BiopharmaProgram[];
  onAskAna: (text: string) => void;
}

const SAMPLE_QUEUE: SurfaceQueueItem[] = [
  { ico: 'globe',       title: '3 open HAQs on this IND',                 sub: 'FDA · day 9 of 14 · pre-draft window closing',            tone: 'warn', action: 'Pre-draft now', cmd: '/respond all open HAQs on this IND now' },
  { ico: 'sparkles',    title: '3 predicted HAQs ready to pre-empt',      sub: '86% · 72% · 91% likelihood — agency has not raised yet',  tone: 'info', action: 'Review',        cmd: 'Show the predicted HAQs for this IND and pre-draft responses to each' },
  { ico: 'shieldCheck', title: 'Drug-substance stability — your sign-off', sub: 'M3 §3.2.S.7.3 · 24-month projection',                    tone: 'warn', action: 'Open',          cmd: 'Open M3 §3.2.S.7.3 stability projection for sign-off' },
  { ico: 'users',       title: 'Pediatric assessment waiver justification', sub: 'M1 §1.9 · due Thursday',                                tone: 'warn', action: 'Draft',         cmd: 'Draft the pediatric assessment waiver justification for M1 §1.9' },
  { ico: 'messageCircle', title: 'Type C briefing book — 60% drafted',    sub: 'CMC stability strategy',                                  tone: 'info', action: 'Continue',      cmd: 'Continue drafting the Type C briefing book — focus on CMC stability strategy' },
];

export function BiopharmaInd({ programs, onAskAna }: IndSurfaceProps) {
  const indPrograms = programs.filter(p => p.program_type.toLowerCase() === 'ind');
  const p = indPrograms[0] ?? null;
  const data = FIXTURE_IND;
  const inbound = useInboundCorrespondence();

  const openInbound = (inbound ?? []).filter(c => c.responseRequired);

  const queue: SurfaceQueueItem[] = React.useMemo(() => {
    if (inbound === null) return SAMPLE_QUEUE; // live store unavailable
    const items: SurfaceQueueItem[] = openInbound.slice(0, 4).map(c => ({
      ico: 'globe',
      title: c.subject ?? c.communicationType ?? 'Inbound agency correspondence',
      sub: [c.communicationType ?? 'correspondence', c.dueDate ? `due ${c.dueDate.slice(0, 10)}` : null]
        .filter(Boolean).join(' · '),
      tone: 'warn' as const,
      action: 'Pre-draft now',
      cmd: `/respond ${c.id} — draft a response anchored on prior submissions`,
    }));
    indPrograms.filter(x => x.status === 'blocked').slice(0, 2).forEach(x => {
      items.push({
        ico: 'alertCircle',
        title: `${x.code ?? x.name} is blocked`,
        sub: x.lead_indication ?? 'IND program',
        tone: 'err',
        action: 'Unblock',
        cmd: `What is blocking ${x.code ?? x.name} and what is the fastest path to unblock it?`,
      });
    });
    return items;
  }, [inbound, openInbound, indPrograms]);

  const stateLine = p ? (
    <>
      <b>{p.code ?? p.name}</b> · {p.status ?? 'active'} · {p.completion_percentage ?? 0}% ready
      {p.section_counts && (
        <>
          {' '}· {p.section_counts.approved + p.section_counts.locked} of {p.section_counts.total} sections approved
        </>
      )}
      {inbound !== null && (
        <>
          {' '}· <b>{openInbound.length}</b> inbound item{openInbound.length === 1 ? '' : 's'} awaiting response
        </>
      )}
    </>
  ) : (
    <>{indPrograms.length} programs in IND stage.</>
  );

  return (
    <SurfaceComposer
      scope="this IND"
      kicker="IND / CTA · §312"
      title={p ? `${p.code ?? p.name} · IND` : 'IND / CTA'}
      stateLine={stateLine}
      starters={[
        'Triage every open and predicted HAQ for this IND',
        'Prep the next Type B/C briefing book',
        'Run the IND amendment readiness check',
        'Show every blocker on this IND across modules',
      ]}
      queue={queue}
      queueSample={inbound === null}
      primary={
        <>
          <button className="bp-btn-tert" type="button" onClick={() => onAskAna('Start the IND amendment submission flow — show me what is required')}>
            <BioIcon name="send" /> Submit IND amendment
          </button>
          <button className="bp-btn-primary" type="button" onClick={() => onAskAna('Draft the next IND section with me')}>
            <BioIcon name="sparkles" /> Draft with AnA
          </button>
        </>
      }
      onAskAna={onAskAna}
      dashboardLabel="Reference data · modules, FDA interactions, contradictions, blockers"
      dashboardSample
    >
      <div className="bp-modules-strip">
        {data.modules.map(m => (
          <div key={m.id} className="bp-module-card">
            <div className="bp-module-card-head">
              <span className="bp-module-card-path">{m.path}</span>
              <StatusPill status={m.status} />
            </div>
            <div className="bp-module-card-label">{m.label}</div>
            <ReadinessBar pct={m.readiness} />
            <div className="bp-module-card-sub">{m.done} of {m.sections} sections</div>
          </div>
        ))}
      </div>

      <div className="bp-split-1-1" style={{ marginTop: 16 }}>
        <div className="bp-card">
          <div className="bp-card-head">
            <h3>FDA interactions and HAQs</h3>
            <SamplePill />
            <span className="bp-card-meta">
              {data.fdaInteractions.filter(x => x.haqRefId && x.status !== 'closed').length} open HAQs ·{' '}
              {data.fdaInteractions.filter(x => x.status === 'open' || x.status === 'drafting').length} active total
            </span>
          </div>
          <div className="bp-list bp-list-dense">
            {data.fdaInteractions.map((fda, i) => {
              const isHaq = !!fda.haqRefId;
              const isPredicted = fda.status === 'predicted';
              return (
                <div key={i} className={`bp-row ${isPredicted ? 'bp-row-predicted' : ''}`}>
                  <span className={`bp-tag bp-tag-mono ${isHaq ? 'bp-tag-haq' : ''} ${isPredicted ? 'bp-tag-predicted' : ''}`}>
                    {fda.kind}
                  </span>
                  <div className="bp-row-body">
                    <div className="bp-row-title">
                      {fda.topic}
                      {isPredicted && typeof fda.confidence === 'number' && (
                        <span className="bp-haq-conf" title="Likelihood the agency will raise this">
                          {Math.round(fda.confidence * 100)}% likely
                        </span>
                      )}
                    </div>
                    <div className="bp-row-sub">
                      {fda.date}
                      {fda.priorRef && <> · <span className="small-mono">{fda.priorRef}</span></>}
                      {fda.due && <> · <span className={fda.due.includes('day') ? 'tone-warn' : ''}>{fda.due} window</span></>}
                      <> · {fda.resolution}</>
                    </div>
                  </div>
                  {isHaq && fda.status !== 'closed' && (
                    <button
                      className="bp-btn-tert"
                      type="button"
                      title={isPredicted ? 'Pre-draft response now' : 'Draft response with AnA'}
                      onClick={e => {
                        e.stopPropagation();
                        onAskAna(
                          `/respond ${fda.haqRefId} — ${isPredicted ? 'pre-draft response now' : 'draft response'} anchored on ${fda.priorRef ?? 'the prior submission'}`,
                        );
                      }}
                    >
                      <BioIcon name="sparkles" /> {isPredicted ? 'Pre-draft' : 'Draft response'}
                    </button>
                  )}
                  <StatusPill status={fda.status} />
                </div>
              );
            })}
          </div>
        </div>

        <div className="bp-card">
          <div className="bp-card-head">
            <h3>Cross-module contradictions</h3>
            <SamplePill />
            <span className="bp-card-meta">{data.contradictions.length} open</span>
          </div>
          <div className="bp-list bp-list-dense">
            {data.contradictions.map(c => (
              <div key={c.id} className="bp-row bp-row-stack">
                <div className="bp-row-line-1">
                  <span className={`bp-icon-warn tone-${c.sev}`}><BioIcon name="warning" /></span>
                  <span className="bp-row-title">{c.title}</span>
                  <span className="bp-av bp-av-sm">{c.owner}</span>
                </div>
                <div className="bp-row-desc">{c.desc}</div>
                <div className="bp-row-where">
                  {c.where.map(w => <span key={w} className="bp-where-chip">{w}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bp-card" style={{ marginTop: 16 }}>
        <div className="bp-card-head">
          <h3>Blockers</h3>
          <SamplePill />
          <span className="bp-card-meta">
            {data.blockers.length} open · {data.blockers.filter(b => b.sev === 'err').length} critical
          </span>
        </div>
        <div className="bp-table bp-table-blockers">
          <div className="bp-tr bp-tr-head">
            <span>Sev</span><span>Owner</span><span>Blocker</span><span>Section</span><span>Due</span>
            <span style={{ textAlign: 'right' }}>Action</span>
          </div>
          {data.blockers.map(b => (
            <div key={b.id} className="bp-tr">
              <span><span className={`bp-sev bp-sev-${b.sev}`}>{b.sev === 'err' ? 'Critical' : 'Warn'}</span></span>
              <span className="bp-tr-owner"><span className="bp-av">{b.who}</span></span>
              <span className="bp-tr-name"><div className="bp-tr-title">{b.label}</div></span>
              <span className="small-mono">{b.section}</span>
              <span><ToneText tone={b.sev}>{b.due}</ToneText></span>
              <span style={{ textAlign: 'right' }}>
                <button
                  className="bp-btn-tert"
                  type="button"
                  onClick={() => onAskAna(`Open the blocker "${b.label}" (${b.section}) and propose a resolution`)}
                  aria-label={`Open blocker ${b.label}`}
                >
                  <BioIcon name="arrowRight" />
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </SurfaceComposer>
  );
}

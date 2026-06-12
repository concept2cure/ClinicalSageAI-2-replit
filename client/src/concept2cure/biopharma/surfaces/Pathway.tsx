/**
 * Biopharma pathway surfaces — NDA · BLA · MAA · JNDA (Phase 10.2).
 *
 * Every pathway surface applies the SurfaceComposer template established by
 * IndSurface (the reference implementation): greeting + state line + composer
 * + 4 surface-scoped starters + Today queue + collapsed reference dashboard.
 *
 * Live data: programs from /api/biopharma/programs, inbound correspondence
 * from /api/regulatory-correspondence. Pathway-specific reference cards
 * (FDA review clock, PMDA clock, pivotal studies, bridging studies) are
 * fixture-backed until the moat-phase endpoints land — labeled sample.
 *
 * @module client/src/concept2cure/biopharma/surfaces/Pathway
 */

import * as React from 'react';
import { BioIcon } from '../icons';
import { SurfaceComposer, type SurfaceQueueItem } from '../shell/SurfaceComposer';
import { ReadinessBar, SamplePill, StatusPill } from './bits';
import { FIXTURE_JNDA, FIXTURE_NDA } from '../data/fixtures';
import { useInboundCorrespondence } from '../data/correspondence';
import type { BiopharmaProgram } from '../data/programs';

interface PathwayConfig {
  kicker: string;
  scope: string;
  agency: string;
  starters: string[];
  sampleQueue: SurfaceQueueItem[];
  /** Pathway-specific fixture cards rendered inside the reference dashboard. */
  fixtureCards?: (onAskAna: (text: string) => void) => React.ReactNode;
}

const PATHWAY_CONFIG: Record<string, PathwayConfig> = {
  nda: {
    kicker: 'NDA · 505(b)',
    scope: 'this NDA',
    agency: 'FDA',
    starters: [
      'Strengthen NDA §2.5 against the latest FDA oncology bridging guidance',
      'Run the NDA filing readiness diagnostic',
      'Draft the FDA Q-Sub for the next Type B meeting',
      'Show every blocker between here and the PDUFA date',
    ],
    sampleQueue: [
      { ico: 'file',        title: 'Module 2.7 clinical summary — reviewer feedback open', sub: 'Day-74 risk if unresolved',          tone: 'warn', action: 'Open §2.7',  cmd: 'Open the Module 2.7 reviewer feedback and propose resolutions' },
      { ico: 'globe',       title: 'Information request from the review division',         sub: 'Response window open',               tone: 'warn', action: 'Pre-draft',  cmd: '/respond to the open FDA information request on this NDA' },
      { ico: 'shieldCheck', title: 'Filing readiness check not run this week',             sub: 'Gap list · owners · day-74 risk',    tone: 'info', action: 'Run now',    cmd: 'Run the NDA filing readiness diagnostic — gap list, owners, day-74 risk' },
    ],
    fixtureCards: onAskAna => (
      <div className="bp-split-1-1" style={{ marginTop: 16 }}>
        <div className="bp-card">
          <div className="bp-card-head">
            <h3>Pivotal studies</h3>
            <SamplePill />
            <span className="bp-card-meta">{FIXTURE_NDA.pivotalStudies.length} studies</span>
          </div>
          <div className="bp-list bp-list-dense">
            {FIXTURE_NDA.pivotalStudies.map(s => (
              <div key={s.id} className="bp-row">
                <span className="bp-tag bp-tag-mono">{s.id}</span>
                <div className="bp-row-body">
                  <div className="bp-row-title">Phase {s.phase} · N={s.n} · {s.primary}</div>
                  <div className="bp-row-sub small-mono">{s.csr}</div>
                </div>
                <StatusPill status={s.status} />
              </div>
            ))}
          </div>
        </div>
        <div className="bp-card">
          <div className="bp-card-head">
            <h3>FDA review clock</h3>
            <SamplePill />
            <span className="bp-card-meta">PDUFA · {FIXTURE_NDA.reviewClock.pdufa}</span>
          </div>
          <div className="bp-clock">
            <div className="bp-clock-item"><div className="bp-clock-lbl">Filed</div><div className="bp-clock-val">{FIXTURE_NDA.reviewClock.filed}</div></div>
            <div className="bp-clock-item"><div className="bp-clock-lbl">Day 74 filing review</div><div className="bp-clock-val">{FIXTURE_NDA.reviewClock.day74}</div></div>
            <div className="bp-clock-item"><div className="bp-clock-lbl">Mid-cycle review</div><div className="bp-clock-val">{FIXTURE_NDA.reviewClock.midcycle}</div></div>
            <div className="bp-clock-item"><div className="bp-clock-lbl">Day 120 internal review</div><div className="bp-clock-val">{FIXTURE_NDA.reviewClock.day120}</div></div>
            <div className="bp-clock-item bp-clock-pdufa"><div className="bp-clock-lbl">PDUFA target action</div><div className="bp-clock-val">{FIXTURE_NDA.reviewClock.pdufa}</div></div>
          </div>
          <div className="bp-card-foot">
            <button className="bp-ask" type="button" onClick={() => onAskAna('Generate a complete NDA filing readiness pack — gap list, owners, day-74 risk assessment.')}>
              <span className="bp-ask-spark"><BioIcon name="sparkles" /></span>
              <span>Generate filing readiness pack</span>
            </button>
          </div>
        </div>
      </div>
    ),
  },
  bla: {
    kicker: 'BLA · 351(a) biologics',
    scope: 'this BLA',
    agency: 'FDA',
    starters: [
      'Run the Tier 1 analytical similarity check',
      'Show the comparability gap with the new DS supplier',
      'Draft the 351(k) bridging strategy',
      'Show every blocker on this BLA across modules',
    ],
    sampleQueue: [
      { ico: 'beaker',      title: 'Stability data trend — OOS pending review', sub: 'Drug substance · 21 months',          tone: 'warn', action: 'Review',   cmd: 'Review the drug-substance stability OOS trend and draft the assessment' },
      { ico: 'sparkles',    title: 'Analytical similarity — attributes OOS',    sub: 'Tier 1 · comparability filing',       tone: 'warn', action: 'Triage',   cmd: 'Triage the Tier 1 analytical similarity out-of-spec attributes' },
      { ico: 'shieldCheck', title: 'Comparability protocol not drafted',        sub: 'Forthcoming DS supplier change',      tone: 'info', action: 'Draft',    cmd: 'Draft the comparability protocol for the forthcoming DS supplier change' },
    ],
  },
  maa: {
    kicker: 'MAA · EU centralized procedure',
    scope: 'this MAA',
    agency: 'EMA',
    starters: [
      'Generate the CHMP day 120 response pack',
      'Compare the PSP and PIP scopes for this product',
      'Pull the ICH M4 crosswalk for §3.2.P',
      'Show every blocker before the next CHMP milestone',
    ],
    sampleQueue: [
      { ico: 'globe',       title: 'CHMP list of questions window',     sub: 'Day 80 / day 120 cycle',         tone: 'warn', action: 'Pre-draft', cmd: '/respond to the open CHMP list of questions on this MAA' },
      { ico: 'users',       title: 'PIP modification pending advice',   sub: 'Paediatric population scope',    tone: 'warn', action: 'Open',      cmd: 'Open the PIP modification and summarize the scope change' },
      { ico: 'messageCircle', title: 'Scientific advice follow-up',     sub: 'EMA · open items from minutes',  tone: 'info', action: 'Review',    cmd: 'Review the open items from the last EMA scientific advice minutes' },
    ],
  },
  jnda: {
    kicker: 'JNDA · PMDA · Japan',
    scope: 'this JNDA',
    agency: 'PMDA',
    starters: [
      'Pull PMDA bridging precedent for this product class',
      'Compare Japan PK to the global pool',
      'Draft the Yakuji-ho compliance checklist',
      'Prep the next PMDA consultation briefing',
    ],
    sampleQueue: [
      { ico: 'globe',       title: 'Pre-NDA consult — 60-day response due', sub: 'CMC bridging · Japan release tests', tone: 'warn', action: 'Pre-draft', cmd: '/respond to the open PMDA pre-NDA consultation on CMC bridging' },
      { ico: 'users',       title: 'Japanese PK study enrolling',           sub: 'Bridging package dependency',        tone: 'info', action: 'Status',    cmd: 'Status of the Japanese PK bridging study and its impact on the JNDA timeline' },
      { ico: 'shieldCheck', title: 'MAH / local responsible person check',  sub: 'Yakuji-ho compliance',               tone: 'info', action: 'Verify',    cmd: 'Verify Yakuji-ho compliance items for the JNDA filing' },
    ],
    fixtureCards: onAskAna => (
      <div className="bp-split-1-1" style={{ marginTop: 16 }}>
        <div className="bp-card">
          <div className="bp-card-head">
            <h3>PMDA review clock</h3>
            <SamplePill />
            <span className="bp-card-meta">Chuiyaku target {FIXTURE_JNDA.pmdaClock.chuiyaku}</span>
          </div>
          <div className="bp-clock">
            <div className="bp-clock-item"><div className="bp-clock-lbl">Pre-NDA consultation</div><div className="bp-clock-val">{FIXTURE_JNDA.pmdaClock.consultation}</div></div>
            <div className="bp-clock-item"><div className="bp-clock-lbl">Application filed</div><div className="bp-clock-val">{FIXTURE_JNDA.pmdaClock.application}</div></div>
            <div className="bp-clock-item"><div className="bp-clock-lbl">Day 85 first inquiry</div><div className="bp-clock-val">{FIXTURE_JNDA.pmdaClock.day85}</div></div>
            <div className="bp-clock-item"><div className="bp-clock-lbl">Day 120 expert discussion</div><div className="bp-clock-val">{FIXTURE_JNDA.pmdaClock.day120}</div></div>
            <div className="bp-clock-item bp-clock-pdufa"><div className="bp-clock-lbl">PMDA target action</div><div className="bp-clock-val">{FIXTURE_JNDA.pmdaClock.pmdaTarget}</div></div>
          </div>
        </div>
        <div className="bp-card">
          <div className="bp-card-head">
            <h3>Consultations and bridging</h3>
            <SamplePill />
            <span className="bp-card-meta">{FIXTURE_JNDA.consultations.length} consultations</span>
          </div>
          <div className="bp-list bp-list-dense">
            {FIXTURE_JNDA.bridgingStudies.map(s => (
              <div key={s.id} className="bp-row">
                <span className="bp-tag bp-tag-mono">{s.id}</span>
                <div className="bp-row-body">
                  <div className="bp-row-title">{s.kind} · N={s.n}</div>
                  <div className="bp-row-sub">{s.site}</div>
                </div>
                <StatusPill status={s.status} />
              </div>
            ))}
            {FIXTURE_JNDA.consultations.map((c, i) => (
              <div key={i} className="bp-row">
                <span className="bp-tag bp-tag-mono">{c.kind}</span>
                <div className="bp-row-body">
                  <div className="bp-row-title">{c.topic}</div>
                  <div className="bp-row-sub">{c.date} · {c.resolution}</div>
                </div>
                <StatusPill status={c.status} />
              </div>
            ))}
          </div>
          <div className="bp-card-foot">
            <button className="bp-ask" type="button" onClick={() => onAskAna('Draft a Pre-NDA briefing book for PMDA on CMC bridging — pull every Japan-specific release test and reconcile against global specs.')}>
              <span className="bp-ask-spark"><BioIcon name="sparkles" /></span>
              <span>Draft Pre-NDA briefing for PMDA</span>
            </button>
          </div>
        </div>
      </div>
    ),
  },
};

interface PathwayProps {
  pathwayKey: string;
  programs: BiopharmaProgram[];
  onAskAna: (text: string) => void;
}

export function BiopharmaPathway({ pathwayKey, programs, onAskAna }: PathwayProps) {
  const cfg = PATHWAY_CONFIG[pathwayKey] ?? {
    kicker: pathwayKey.toUpperCase(),
    scope: `this ${pathwayKey.toUpperCase()}`,
    agency: 'Agency',
    starters: [`Run the ${pathwayKey.toUpperCase()} readiness diagnostic`],
    sampleQueue: [],
  };
  const items = programs.filter(p => p.program_type.toLowerCase() === pathwayKey);
  const p = items[0] ?? null;
  const inbound = useInboundCorrespondence();
  const openInbound = (inbound ?? []).filter(c => c.responseRequired);

  const queue: SurfaceQueueItem[] = React.useMemo(() => {
    if (inbound === null) return cfg.sampleQueue; // live store unavailable
    const out: SurfaceQueueItem[] = openInbound.slice(0, 3).map(c => ({
      ico: 'globe',
      title: c.subject ?? c.communicationType ?? 'Inbound agency correspondence',
      sub: [c.communicationType ?? 'correspondence', c.dueDate ? `due ${c.dueDate.slice(0, 10)}` : null]
        .filter(Boolean).join(' · '),
      tone: 'warn' as const,
      action: 'Pre-draft now',
      cmd: `/respond ${c.id} — draft a response anchored on prior submissions`,
    }));
    items.filter(x => x.status === 'blocked').slice(0, 2).forEach(x => {
      out.push({
        ico: 'alertCircle',
        title: `${x.code ?? x.name} is blocked`,
        sub: x.lead_indication ?? cfg.kicker,
        tone: 'err',
        action: 'Unblock',
        cmd: `What is blocking ${x.code ?? x.name} and what is the fastest path to unblock it?`,
      });
    });
    return out;
  }, [inbound, openInbound, items, cfg]);

  const stateLine = p ? (
    <>
      <b>{p.code ?? p.name}</b> · {p.status ?? 'active'} · {p.completion_percentage ?? 0}% ready
      {p.pdufa_date && <> · target action {p.pdufa_date.slice(0, 10)}</>}
      {items.length > 1 && <> · {items.length} {pathwayKey.toUpperCase()} programs total</>}
    </>
  ) : (
    <>No {pathwayKey.toUpperCase()} programs in your portfolio yet.</>
  );

  return (
    <SurfaceComposer
      scope={cfg.scope}
      kicker={cfg.kicker}
      title={p ? `${p.code ?? p.name} · ${pathwayKey.toUpperCase()}` : `${pathwayKey.toUpperCase()} programs`}
      stateLine={stateLine}
      starters={cfg.starters}
      queue={queue}
      queueSample={inbound === null}
      primary={
        <button className="bp-btn-primary" type="button" onClick={() => onAskAna(`Draft the next ${pathwayKey.toUpperCase()} section with me`)}>
          <BioIcon name="sparkles" /> Draft with AnA
        </button>
      }
      onAskAna={onAskAna}
      dashboardLabel={`Reference data · ${pathwayKey.toUpperCase()} programs and ${cfg.agency} milestones`}
    >
      {/* Live program table — same source as /api/biopharma/programs. */}
      <div className="bp-card">
        <div className="bp-card-head">
          <h3>{pathwayKey.toUpperCase()} programs</h3>
          <span className="bp-card-meta">{items.length} programs · {cfg.agency}</span>
        </div>
        {items.length === 0 ? (
          <div className="bp-empty">No {pathwayKey.toUpperCase()} programs in your portfolio.</div>
        ) : (
          <div className="bp-list bp-list-dense">
            {items.map(prog => (
              <div key={prog.id} className="bp-row">
                <span className="bp-tag bp-tag-mono">{prog.code ?? prog.name}</span>
                <div className="bp-row-body">
                  <div className="bp-row-title">{prog.lead_indication ?? prog.name}</div>
                  <div className="bp-row-sub">
                    {prog.sponsor_name ?? '—'}
                    {prog.pdufa_date && <> · target {prog.pdufa_date.slice(0, 10)}</>}
                  </div>
                </div>
                <div style={{ width: 130 }}><ReadinessBar pct={prog.completion_percentage ?? 0} /></div>
                <StatusPill status={prog.status ?? 'active'} />
              </div>
            ))}
          </div>
        )}
      </div>
      {cfg.fixtureCards?.(onAskAna)}
    </SurfaceComposer>
  );
}

// Named pathway variants — same template, pathway-scoped config.
export const BiopharmaNda  = (props: Omit<PathwayProps, 'pathwayKey'>) => <BiopharmaPathway pathwayKey="nda"  {...props} />;
export const BiopharmaBla  = (props: Omit<PathwayProps, 'pathwayKey'>) => <BiopharmaPathway pathwayKey="bla"  {...props} />;
export const BiopharmaMaa  = (props: Omit<PathwayProps, 'pathwayKey'>) => <BiopharmaPathway pathwayKey="maa"  {...props} />;
export const BiopharmaJnda = (props: Omit<PathwayProps, 'pathwayKey'>) => <BiopharmaPathway pathwayKey="jnda" {...props} />;

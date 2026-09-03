/**
 * Program Journey — kit app/biopharma-journey.jsx ported
 * (registry id `program-journey`, full-bleed surface).
 *
 * The end-to-end biotech/pharma spine: concept -> submission -> lifecycle.
 * The connective map that ties the ~30 scattered biopharma surfaces into
 * one legible arc for the active program.
 *
 * Segment-aware: the biotech and pharma records the org actually holds, read
 * from GET /api/program-journey (never a sample programme).
 * A persistent intelligence column carries CTD-module readiness, the review
 * clock, predicted HAQs, cross-module contradictions and open blockers --
 * every row routes into the deep surface that owns it.
 */
import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { getSurfaceMeta } from '../registryModel';
import { useLiveRows, EmptyState } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Window globals -- cross-surface data providers ── */
declare global {
  interface Window {
    __C2C_SEGMENT?: string;
  }
}

/* ── Types ── */

interface PjTarget {
  label: string;
  v: string;
  agency: string;
}

interface PjProgram {
  code: string;
  name: string;
  app: string;
  modality: string;
  indication: string;
  pathway: string;
  sponsor: string;
  agency: string;
  readiness: number;
  current: string;
  target: PjTarget;
}

interface PjDeliverable {
  0: string;
  1: number;
}

interface PjInteraction {
  0: string;
  1: string;
  2: string;
}

interface PjStage {
  id: string;
  num: string;
  label: string;
  icon: string;
  gate: string;
  what: string;
  deliv: PjDeliverable[];
  caps: string[];
  interactions: PjInteraction[];
  ana: string;
}

interface PjStageWithOverlay extends PjStage {
  st: string;
  pct: number;
}

interface PjModule {
  m: string;
  label: string;
  pct: number;
  risk: boolean;
}

interface PjClockEntry {
  l: string;
  day: string;
  date: string;
  st: string;
}

interface PjHaq {
  conf: number;
  t: string;
}

interface PjContra {
  t: string;
  tag: string;
  d: string;
}

interface PjBlocker {
  sev: string;
  t: string;
  m: string;
  who: string;
  due: string;
}

/* ── Program identity ──
 *
 * `PJ_PROGRAMS` used to live here: two invented programmes (BX-301 "Relapsed
 * multiple myeloma · 64% ready" and BX-204 "pivotal ORR 38.6%, OS HR 0.62")
 * keyed by segment. The surface itself was migrated to GET /api/program-journey
 * some time ago and stopped reading it — but the constant stayed exported, so
 * the fabricated identity still shipped in the bundle and was one import away
 * from being rendered again. It is deleted rather than left dormant: the only
 * source of a programme's code, indication, readiness and target action is the
 * org's own record from the live read below. `PjProgram` remains as the type
 * that record is asserted to. */

/* ── The 9-stage lifecycle ── */

const PJ_STAGES: PjStage[] = [
  { id: 'discovery', num: 'Stage 1', label: 'Discovery & candidate', icon: 'atom',
    gate: 'Target product profile agreed · lead candidate nominated',
    what: 'Candidate selection and the target product profile. AnA scans precedent approvals and the competitive landscape to shape the development and regulatory strategy before any agency contact.',
    deliv: [['Target product profile', 1], ['Candidate nomination package', 1], ['Regulatory strategy memo', 1], ['Competitive & precedent landscape', 1]],
    caps: ['pdev', 'precedent-intelligence', 'deep-research', 'orphan', 'projects'],
    interactions: [['TPP', 'Target product profile locked', 'Q1 — internal']],
    ana: 'Draft the regulatory strategy memo from the target product profile and closest precedents' },
  { id: 'preind', num: 'Stage 2', label: 'Pre-IND / enabling', icon: 'beaker',
    gate: 'Pre-IND (Type B) meeting · IND-enabling package agreed',
    what: 'IND-enabling GLP toxicology, CMC for the first GMP lots, and the pivotal trial design. The Pre-IND meeting aligns the agency on nonclinical scope, starting dose and the Phase 1 protocol.',
    deliv: [['GLP tox study reports', 1], ['Module 3 — first GMP lots', 1], ['Pre-IND briefing book', 1], ['Phase 1 protocol & starting dose', 0]],
    caps: ['pdev', 'agency-meetings', 'cmc', 'nonclinical', 'biostatistics', 'pediatric'],
    interactions: [['Type B', 'Pre-IND meeting — minutes filed', 'Complete'], ['Q-sub', 'Nonclinical scope aligned', 'Complete']],
    ana: 'Assemble the Pre-IND briefing book and pre-empt likely agency questions on starting dose' },
  { id: 'ind', num: 'Stage 3', label: 'IND / CTA active', icon: 'clipboardList',
    gate: '30-day safe-to-proceed · IND maintained (amendments, annual report)',
    what: 'The active IND: initial application, safe-to-proceed clearance, then a living file of protocol amendments, safety reports (SUSAR 7/15-day) and the annual report. Forms 1571/1572/3674 stay current.',
    deliv: [['IND initial (Forms 1571/1572/3674)', 1], ['Safe-to-proceed clearance', 1], ['Protocol amendments', 1], ['Annual report / DSUR', 0]],
    caps: ['ind-checklist', 'document-authoring', 'agency-meetings', 'safety-narrative'],
    interactions: [['IND', 'Safe-to-proceed (day 30)', 'Complete'], ['Amend', 'Protocol amendment 04 — active', 'Drafting'], ['Safety', 'SUSAR 7-day form', 'Open']],
    ana: 'Run the IND amendment readiness check and draft the next annual report from study status' },
  { id: 'clinical', num: 'Stage 4', label: 'Clinical development', icon: 'sigma',
    gate: 'End-of-Phase-2 meeting · pivotal readout · DSMB clearances',
    what: 'Phase 1->3 execution: dose-finding, the pivotal trial, risk-based monitoring and interim DSMB reviews. The End-of-Phase-2 meeting fixes the pivotal design and endpoints that the whole submission will rest on.',
    deliv: [['Phase 1/2 CSRs', 1], ['EOP2 meeting alignment', 1], ['Pivotal trial — enrolled', 1], ['Pivotal topline & CSR', 0]],
    caps: ['rbm', 'clinical-ops', 'biostatistics', 'csr-workflow', 'protocol-dev', 'safety-narrative'],
    interactions: [['Type B', 'End-of-Phase-2 meeting', 'Complete'], ['DSMB', 'Interim review 3 — continue', 'Complete'], ['Pivotal', 'Pivotal trial database lock', 'Upcoming']],
    ana: 'Summarize pivotal readiness — enrollment, DSMB history, and the gap to database lock' },
  { id: 'presub', num: 'Stage 5', label: 'Pre-submission', icon: 'messageSquare',
    gate: 'Pre-NDA / Pre-BLA meeting · filing plan & format agreed',
    what: 'The Pre-NDA/Pre-BLA meeting: agree the content, format and review division expectations, confirm the dataset package and any rolling-review plan, and lock the submission timeline and the orchestration gates before assembly begins.',
    deliv: [['Pre-NDA/BLA briefing book', 1], ['Filing plan & timeline', 1], ['Dataset package plan (define.xml, ADRG)', 0], ['Rolling review agreement', 0]],
    caps: ['agency-meetings', 'nda-cockpit', 'dossier', 'orchestration'],
    interactions: [['Type B', 'Pre-BLA meeting — questions filed', 'Drafting'], ['Plan', 'Rolling review — CMC first', 'Upcoming']],
    ana: 'Build the Pre-BLA briefing book and the filing readiness plan with the day-74 risk view' },
  { id: 'assemble', num: 'Stage 6', label: 'Submission assembly', icon: 'gitBranch',
    gate: 'CTD Module 1--5 complete · eValidator pass · publish-ready',
    what: 'Assemble the application: CTD Modules 1--5, the Module 1 administrative set (Form 356h), prescribing information, then format -> assemble -> validate the eCTD backbone. This is where readiness, contradictions and blockers must all clear.',
    deliv: [['Module 2 CTD summaries', 0], ['Module 3 CMC — comparability closed', 0], ['Prescribing information (PLLR · SPL)', 0], ['eCTD backbone validated', 0]],
    caps: ['nda-cockpit', 'dossier', 'ectd-coauthor', 'cmc', 'nonclinical', 'labeling-pi', 'submission-center'],
    interactions: [['Assemble', 'eCTD backbone — 84% mapped', 'Active'], ['Validate', 'eValidator — 1 define.xml error', 'Open']],
    ana: 'Run the filing readiness diagnostic across Modules 1--5 and stage the eCTD backbone' },
  { id: 'review', num: 'Stage 7', label: 'Agency review & HAQ', icon: 'globe',
    gate: 'Day-74 filing / RTF · mid- & late-cycle · AdComm · action date',
    what: 'Post-submission review: the day-74 filing decision (Refuse-to-File risk), information requests / HAQs, mid- and late-cycle communications, a possible advisory committee, and the PDUFA action date. AnA pre-drafts responses from prior submissions.',
    deliv: [['Filing decision (day 74 / RTF)', 0], ['Information request responses', 0], ['Advisory committee package', 0], ['Action letter', 0]],
    caps: ['submission-center', 'haq-manager', 'nda-cockpit', 'labeling-pi'],
    interactions: [['Filing', 'Day-74 filing review', 'Upcoming'], ['HAQ', '3 predicted — pre-draftable', 'Predicted'], ['AdComm', 'If convened (~day 270)', 'Upcoming']],
    ana: 'Pre-draft responses to the 3 predicted HAQs anchored on the locked CSR and prior submissions' },
  { id: 'approval', num: 'Stage 8', label: 'Approval & launch', icon: 'rocket',
    gate: 'Action letter · labeling negotiation closed · registration active',
    what: 'Approval and market entry: end-of-review labeling negotiation (sponsor vs FDA redline), the final prescribing information, registration/market-authorization status across markets, and the coding & coverage strategy that bridges to commercial.',
    deliv: [['Final prescribing information', 0], ['Labeling negotiation closed', 0], ['Registration / MA active', 0], ['Coding & coverage strategy', 0]],
    caps: ['registrations', 'labeling-pi', 'market-access', 'orphan'],
    interactions: [['Label', 'End-of-review labeling redline', 'Upcoming'], ['Reg', 'US registration activation', 'Upcoming']],
    ana: 'Draft the labeling negotiation position and map the multi-market registration sequence' },
  { id: 'lifecycle', num: 'Stage 9', label: 'Lifecycle & PV', icon: 'history',
    gate: 'PSUR/PADER on schedule · variations/supplements · renewals',
    what: 'Post-approval lifecycle: periodic safety reports (PSUR/PADER), signal management, CMC and labeling variations/supplements with change-impact determinations, regulatory-change horizon scanning, and market-authorization renewals.',
    deliv: [['PSUR / PADER schedule', 0], ['Signal management & RMP', 0], ['Variations / supplements', 0], ['MA renewals', 0]],
    caps: ['pharmacovigilance', 'lifecycle-mgmt', 'reg-change', 'change-assessment', 'registrations', 'pediatric'],
    interactions: [['PV', 'First PSUR — data lock point', 'Upcoming'], ['Var', 'Post-approval CMC change', 'Upcoming']],
    ana: 'Set up the PSUR schedule and assess the impact of the next planned CMC change' },
];

/* ── Per-program instance record (the live read contract) ──
   One program-journey INSTANCE = the program identity plus the per-program
   status (overlay, modules, clock, haqs, contra, blockers). The 9-stage
   lifecycle catalog (PJ_STAGES) stays definitional and is NOT part of the
   record. GET /api/program-journey returns exactly these keys per program,
   org-scoped; the surface renders those real rows, an honest empty state, or
   an honest error state — never a fixture. */

interface PjRecord extends PjProgram {
  seg: string;
  overlay: Record<string, [string, number]>;
  modules: PjModule[];
  clock: PjClockEntry[];
  haqs: PjHaq[];
  contra: PjContra;
  blockers: PjBlocker[];
}

/* ── Readiness ring ── */

function Ring({ pct }: { pct: number }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  const tone = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--accent-100)' : 'var(--warning)';
  return (
    <div className="pj-ring">
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--bg-200)" strokeWidth="6" />
        <circle cx="38" cy="38" r={r} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="pj-ring-v"><b>{pct}%</b><span>ready</span></div>
    </div>
  );
}

/* ════ Program Journey surface ════ */

export function BiopharmaJourney({ onAsk, onNav }: SurfaceViewProps) {
  const getSeg = (): string => {
    const s = (typeof window !== 'undefined' && window.__C2C_SEGMENT) || 'biotech';
    return s === 'pharma' ? 'pharma' : 'biotech';
  };

  const [seg, setSegState] = useState(getSeg());
  // Selected stage id; null → default to the record's current stage. Held above
  // the honest-state gates so hook order stays stable across loading/empty/error.
  const [sel, setSel] = useState<string | null>(null);

  /* Real-data read — the org's program-journey instances (segment-scoped).
     Renders the real rows, an honest empty state, or an honest error state;
     never a fixture. */
  const { rows, loading, error, empty } = useLiveRows<PjRecord>('/api/program-journey');

  const ask = onAsk;
  const open = (id: string) => {
    onNav(id);
  };
  const setSeg = (v: string) => {
    try { (window as any).__C2C_SEGMENT = v; } catch { /* noop */ }
    setSegState(v);
    setSel(null);
  };

  /* WHAT ANA SEES HERE — published above the honest-state early returns so one
     call covers every branch. Two never-fabricate rules this surface holds: no
     per-deliverable status exists on the record, and no agency-interaction
     outcomes do — neither is published. */
  const anaContext = useMemo(() => {
    if (loading) {
      return { summary: 'The program journey is still loading; nothing on screen is final yet.' };
    }
    if (error) {
      return {
        summary:
          'The program journey could not be loaded — the program-journey store did not respond. A failed read, not an empty portfolio.',
      };
    }
    if (empty) {
      return {
        summary:
          'Program journey: no program journey data yet — once a program is provisioned for this organization, its end-to-end regulatory arc appears here.',
      };
    }
    const bySegCtx: Record<string, PjRecord> = {};
    for (const r of rows) bySegCtx[r.seg] = r;
    const rec = bySegCtx[seg] ?? rows[0];
    const overlay = rec.overlay ?? {};
    const done = PJ_STAGES.filter((s) => (overlay[s.id] ?? ['upcoming', 0])[0] === 'done').length;
    return {
      summary:
        `Program journey (${seg}): ${rec.code} — ${rec.name} (${rec.app}), ${done} of 9 stages complete` +
        (typeof rec.readiness === 'number' ? `, ${rec.readiness}% ready` : '') +
        `. Current stage: ${rec.current}.`,
      facts: {
        program: {
          code: rec.code,
          name: rec.name,
          app: rec.app,
          modality: rec.modality,
          indication: rec.indication,
          pathway: rec.pathway,
          agency: rec.agency,
        },
        // typeof, not truthiness: 0% ready is a real readiness.
        ...(typeof rec.readiness === 'number' ? { readiness: rec.readiness } : {}),
        ...(rec.target ? { target: rec.target } : {}),
        currentStage: rec.current,
        doneCount: done,
        stagesTotal: 9,
        segment: seg,
        ...(sel ? { selectedStage: sel } : {}),
      },
      availableActions: ['Switch the biotech/pharma segment view; select a stage'],
    };
  }, [loading, error, empty, rows, seg, sel]);
  usePublishSurfaceContext('program-journey', anaContext);

  if (loading) {
    return (
      <div className="pj">
        <div className="scaf-note" style={{ padding: '40px 16px', textAlign: 'center' }}>Loading program journey…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="pj">
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the program journey"
          hint="The program-journey store didn't respond. This is your organization's concept-to-submission spine — sign in and retry, or check that the service is reachable."
        />
      </div>
    );
  }
  if (empty) {
    return (
      <div className="pj">
        <EmptyState
          icon={I.gitBranch}
          title="No program journey data yet"
          hint="Once a program is provisioned for this organization, its end-to-end regulatory arc — stages, CTD readiness, review clock, predicted HAQs and blockers — appears here, segment-scoped with its real status."
        />
      </div>
    );
  }

  const bySeg: Record<string, PjRecord> = {};
  for (const r of rows) bySeg[r.seg] = r;
  const rec = bySeg[seg] ?? rows[0];
  const prog = rec;
  // A record can arrive well-formed but with its per-program status columns
  // absent -- a nullable column, a narrowed SELECT, a row provisioned before
  // status was tracked. Each collection falls back to its empty form so the
  // lifecycle arc still renders; the per-stage `?? ['upcoming', 0]` below
  // already covers a stage the overlay has no entry for.
  const overlay = rec.overlay ?? {};
  const stages: PjStageWithOverlay[] = PJ_STAGES.map((s) => {
    const ov = overlay[s.id] ?? ['upcoming', 0];
    return { ...s, st: ov[0], pct: ov[1] };
  });
  const stage = stages.find((s) => s.id === (sel ?? rec.current)) || stages[0];

  const mods = rec.modules ?? [];
  const clock = rec.clock ?? [];
  const haqs = rec.haqs ?? [];
  const contra = rec.contra; // single record, not a list -- its card body is guarded below
  const blockers = rec.blockers ?? [];
  const doneCount = stages.filter((s) => s.st === 'done').length;

  return (
    <div className="pj">
      <div className="pj-head">
        <div>
          <div className="pj-eyebrow">{seg === 'pharma' ? 'Pharma' : 'Biotech'} {I.dot} program lifecycle</div>
          <h1 className="pj-title">Program journey — concept to submission</h1>
          <p className="pj-intro">The end-to-end regulatory arc for {prog.code}, from candidate selection to approval and lifecycle. Each stage carries its agency gate, deliverables and the tools that serve it — and every intelligence signal routes into the surface that owns it.</p>
        </div>
        <div className="pj-switch">
          <button className="pj-seg" data-on={seg === 'biotech' || undefined} onClick={() => setSeg('biotech')}>{I.atom} Biotech {I.dot} BLA</button>
          <button className="pj-seg" data-on={seg === 'pharma' || undefined} onClick={() => setSeg('pharma')}>{I.beaker} Pharma {I.dot} NDA</button>
        </div>
      </div>

      {/* Program identity */}
      <div className="pj-prog">
        <div>
          <div className="pj-prog-code">
            <span className="code">{prog.code}</span>
            <span className="name">{prog.name}</span>
            <span className="app">{prog.app}</span>
          </div>
          <div className="pj-prog-meta">
            <span><b>Modality</b> {I.dot} {prog.modality}</span>
            <span><b>Indication</b> {I.dot} {prog.indication}</span>
          </div>
          <div className="pj-prog-meta" style={{ marginTop: 5 }}>
            <span><b>Pathway</b> {I.dot} {prog.pathway}</span>
            <span><b>Sponsor</b> {I.dot} {prog.sponsor}</span>
            <span><b>Progress</b> {I.dot} {doneCount} of 9 stages complete</span>
          </div>
        </div>
        <div className="pj-prog-right">
          {/* No agreed filing target on the record yet -- show nothing rather
              than an empty target block asserting a date we don't have. */}
          {prog.target && (
            <div className="pj-target">
              <div className="l">{prog.target.label}</div>
              <div className="v">{prog.target.v}</div>
              <div className="agency">{prog.target.agency}</div>
            </div>
          )}
          {/* Readiness absent -> no ring. Passing undefined through renders a
              NaN dash offset and a bare "%", which reads as a score we don't have.
              typeof, not truthiness: 0% ready is a real readiness. */}
          {typeof prog.readiness === 'number' && <Ring pct={prog.readiness} />}
        </div>
      </div>

      {/* Stage spine */}
      <div className="pj-spine">
        {stages.map((s) => (
          <div key={s.id} className="pj-stage" data-st={s.st} data-sel={sel === s.id || undefined}>
            <div className="pj-stage-rail">
              <button className="pj-stage-dot" onClick={() => setSel(s.id)} title={s.label}>
                {s.st === 'done' ? I.check : (I[s.icon] || I.grid)}
              </button>
              <div className="pj-stage-line" />
            </div>
            <button className="pj-stage-btn" onClick={() => setSel(s.id)}>
              <div className="pj-stage-num">{s.num}</div>
              <div className="pj-stage-lbl">{s.label}</div>
              <div className="pj-stage-bar"><span style={{ width: s.pct + '%' }} /></div>
            </button>
          </div>
        ))}
      </div>

      <div className="pj-body">
        {/* Selected stage detail */}
        <div className="pj-card">
          <div className="pj-card-b">
            <div className="pj-detail-top">
              <div>
                <div className="pj-detail-eye">{stage.num} {I.dot} {prog.agency} gate</div>
                <h2 className="pj-detail-t">{stage.label}</h2>
              </div>
              <span className="pj-chip pj-detail-st" data-t={stage.st}>{stage.st === 'active' ? 'In progress' : stage.st === 'done' ? 'Complete' : 'Upcoming'} {I.dot} {stage.pct}%</span>
            </div>

            <div className="pj-gate">
              <span className="ico">{I.shieldCheck}</span>
              <div><div className="l">Stage gate</div><div className="v">{stage.gate}</div></div>
            </div>

            <p className="pj-what">{stage.what}</p>

            {/* ── The tick marks were a constant, not this programme's state ──
                Each row rendered a green check or a clock from `d[1]`, a
                hardcoded 1/0 in the PJ_STAGES catalog — e.g. 'IND initial
                (Forms 1571/1572/3674)', 1. Every tenant on every programme saw
                the same deliverables reported complete, and a regulatory lead
                reading "Safe-to-proceed clearance ✓" was reading a literal in
                this file, not their filing.

                PJ_STAGES is deliberately definitional — the header above says
                so — and the per-programme status arrives in `rec.overlay`,
                which is real and IS applied to the stage itself (st/pct). There
                is no per-DELIVERABLE status in the record, so there is nothing
                to overlay here.

                So the list says what the stage requires, which is true and
                useful, and claims nothing about whether this programme has done
                it. The stage's own progress above remains the live signal. */}
            <div className="pj-seclbl">Key deliverables</div>
            <div className="pj-deliv">
              {stage.deliv.map((d, i) => (
                <div key={i} className="pj-deliv-row">
                  <span className="dot">{I.circle || I.clock}</span>{d[0]}
                </div>
              ))}
            </div>
            <div className="pj-deliv-note">
              What this stage requires. Per-deliverable status is not tracked on the programme record — the stage progress above is the live signal.
            </div>

            <div className="pj-seclbl">Capabilities that serve this stage</div>
            <div className="pj-caps">
              {stage.caps.map((id) => {
                const m = getSurfaceMeta(id);
                return (
                  <button key={id} className="pj-cap" onClick={() => open(id)} title={(m as any).notes || m.label}>
                    {I[(m as any).icon] || I.grid}<span>{m.label}</span><span className="go">{I.right}</span>
                  </button>
                );
              })}
            </div>

            {/* The KIND and the description are definitional — Stage 2 is where a
                Type B Pre-IND meeting happens, and that is true of anyone. The
                OUTCOME was not, and the outcome is what this block really showed.

                `PjRecord` carries no `interactions` field, so nothing could ever
                override the literals: every organization was told its Pre-IND
                minutes were filed, its 30-day safe-to-proceed was Complete and a
                DSMB had said continue — under a header built from its own live
                programme code. That is fabricated regulatory history, and it is
                the most dangerous sentence this surface could show a customer.

                The interactions stay listed, because knowing Stage 3 turns on a
                30-day safe-to-proceed is genuinely useful. The status chip goes
                until a record backs it; Agency meetings owns that, and the row
                still routes there. Same call the deliverables above just got. */}
            <div className="pj-seclbl">Agency interactions at this stage</div>
            <div className="pj-interact">
              {stage.interactions.map((x, i) => (
                <button key={i} className="pj-int" onClick={() => open('agency-meetings')}>
                  <span className="pj-int-kind">{x[0]}</span>
                  <div className="pj-int-b"><div className="pj-int-t">{x[1]}</div></div>
                  <span className="go">{I.right}</span>
                </button>
              ))}
            </div>
            <div className="pj-deliv-note">
              Which agency interactions this stage involves. Their outcomes are not tracked on the programme record — Agency meetings holds the real history.
            </div>

            <button className="pj-ana" onClick={() => ask(stage.ana)}>{I.sparkles} {stage.ana}</button>
          </div>
        </div>

        {/* Intelligence column */}
        <div className="pj-intel">
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">CTD readiness</span><button className="pj-card-h-go" onClick={() => open('nda-cockpit')} style={{ fontSize: 11, color: 'var(--accent-200)' }}>Open cockpit {I.right}</button></div>
            <div className="pj-card-b">
              <div className="pj-mods">
                {mods.map((m) => (
                  <button key={m.m} className="pj-mod" onClick={() => open('nda-cockpit')}>
                    <span className="pj-mod-n">M{m.m}</span>
                    <span className="pj-mod-b">
                      <span className="pj-mod-l">{m.label}</span>
                      <span className="pj-mod-track"><span className="pj-mod-fill" data-risk={m.risk || undefined} style={{ width: m.pct + '%' }} /></span>
                    </span>
                    <span className="pj-mod-pct">{m.pct}%</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Review clock</span><span className="s">{prog.agency}</span></div>
            <div className="pj-card-b">
              <div className="pj-clock">
                {clock.map((c, i) => (
                  <div key={i} className="pj-ck" data-st={c.st}>
                    <div className="pj-ck-rail"><div className="pj-ck-dot" /><div className="pj-ck-line" /></div>
                    <div className="pj-ck-b">
                      <div className="pj-ck-top"><span className="pj-ck-l">{c.l}</span><span className="pj-ck-day">{c.day}</span></div>
                      <div className="pj-ck-date">{c.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Predicted HAQs</span><button onClick={() => open('haq-manager')} style={{ fontSize: 11, color: 'var(--ai)' }}>Pre-draft {I.right}</button></div>
            <div className="pj-card-b">
              <div className="pj-haq">
                {haqs.map((h, i) => (
                  <button key={i} className="pj-haq-row" onClick={() => ask(`Pre-draft a response to the predicted HAQ: ${h.t}`)}>
                    <span className="pj-haq-conf">{h.conf}%</span>
                    <span className="pj-haq-t">{h.t}</span>
                    <span className="pj-haq-go">{I.sparkles}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Cross-module contradiction</span></div>
            <div className="pj-card-b">
              {/* No contradiction recorded for this program -- the card stays,
                  its body empty, like the list cards above. */}
              {contra && (
                <div className="pj-con">
                  <span className="ico">{I.alertTriangle}</span>
                  <div>
                    <div className="pj-con-t">{contra.t}</div>
                    <div className="pj-con-d">{contra.d}</div>
                    <span className="pj-con-tag">{contra.tag}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Open blockers</span><span className="s">{blockers.length} {I.dot} day-74 RTF risk</span></div>
            <div className="pj-card-b">
              <div className="pj-blk">
                {blockers.map((b, i) => (
                  <div key={i} className="pj-blk-row">
                    <span className="pj-sev" data-s={b.sev}>{b.sev}</span>
                    <div className="pj-blk-b"><div className="pj-blk-t">{b.t}</div><div className="pj-blk-m">{b.m} {I.dot} {b.who}</div></div>
                    <span className="pj-blk-due">{b.due}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

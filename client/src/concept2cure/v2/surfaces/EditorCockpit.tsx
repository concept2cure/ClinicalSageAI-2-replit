import React, { useMemo } from 'react';
import { I } from '../icons';

/* ----------------------------------------------------------------
   Path-to-Filing cockpit -- the workflow spine that answers
   "how does the human accomplish everything they need?"
   Plan -> Author -> Evidence -> Review -> Validate -> Assemble ->
   Dispatch -> Respond -> Maintain, with live status, blockers,
   next actions, and deep-links into the studio and every surface.
   ---------------------------------------------------------------- */

interface Phase {
  id: string;
  label: string;
  icon: string;
  blurb: string;
  surface?: string;
  local?: string;
}

const PHASES: Phase[] = [
  { id: 'plan',     label: 'Plan',     icon: 'telescope',     blurb: 'Pathway, market & module map', surface: 'submission-center' },
  { id: 'author',   label: 'Author',   icon: 'penLine',       blurb: 'Draft every section with AnA', local: 'studio' },
  { id: 'evidence', label: 'Evidence', icon: 'vault',         blurb: 'Link claims to sourced evidence', surface: 'vault' },
  { id: 'review',   label: 'Review',   icon: 'messageSquare', blurb: 'Route, comment, dual-review', surface: 'review' },
  { id: 'validate', label: 'Validate', icon: 'shieldCheck',   blurb: 'Preflight, contradictions, shadow review', local: 'preflight' },
  { id: 'assemble', label: 'Assemble', icon: 'layoutPanels',  blurb: 'Compile eCTD + validate package', surface: 'submission-center' },
  { id: 'dispatch', label: 'Dispatch', icon: 'globe',         blurb: 'Gateway transmit + ACK', surface: 'submission-center' },
  { id: 'respond',  label: 'Respond',  icon: 'scroll',        blurb: 'Agency questions & responses', surface: 'submission-center' },
  { id: 'maintain', label: 'Maintain', icon: 'history',       blurb: 'Amendments, annual & safety reports', surface: 'ind-checklist' },
];

/* ----- Shared types ----- */

interface Section {
  id: string;
  num: string;
  label: string;
  status: string;
  blocker?: boolean;
  conf?: number;
}

interface SectionContext {
  empty: boolean;
  wordCount: number;
  errFlags: number;
  warnFlags: number;
  cites: number;
  status: string;
  blocker: boolean | undefined;
  conf: number;
}

interface SectionRow {
  s: Section;
  c: SectionContext;
}

interface NextAction {
  id: string;
  kind: string;
  icon: string;
  label: string;
  sub: string;
  go: () => void;
}

interface Signal {
  sev: string;
  icon: string;
  text: string;
}

interface PathwayVolume {
  vol: string;
  items: Section[];
}

interface Pathway {
  kind: string;
  program: string;
  code: string;
  owner: string;
  dueline: string;
  readiness: number;
  tree: PathwayVolume[];
}

interface Market {
  agency: string;
  region: string;
}

interface LangInfo {
  label: string;
}

interface ModuleInfo {
  vol: string;
  total: number;
  done: number;
  pct: number;
  first: Section;
}

interface CockpitData {
  total: number;
  authored: number;
  withEvidence: number;
  inReview: number;
  approved: number;
  hardBlockers: SectionRow[];
  emptyRows: SectionRow[];
  overall: number;
  phasePct: Record<string, number>;
  phaseState: (id: string) => 'done' | 'active' | 'todo';
  actions: NextAction[];
  rows: SectionRow[];
}

/* ----- Props ----- */

interface EditorCockpitProps {
  pathway: Pathway;
  sections: Section[];
  docMap: Record<string, string>;
  lang: string;
  market: Market;
  langInfo: LangInfo;
  taLabel: string;
  onOpenSection: (id: string) => void;
  onNav: (id: string) => void;
  onAuthor: () => void;
  onValidate: () => void;
}

/* ----- Helpers ----- */

function sectionCtx(s: Section, docMap: Record<string, string>, lang: string): SectionContext {
  const h = docMap[s.id + '::' + lang] || '';
  const empty = !h.trim();
  return {
    empty,
    wordCount: h.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length,
    errFlags: (h.match(/data-sev="err"/gi) || []).length,
    warnFlags: (h.match(/data-sev="warn"/gi) || []).length,
    cites: (h.match(/class="cite"/gi) || []).length,
    status: s.status,
    blocker: s.blocker,
    conf: s.conf || 0.5,
  };
}

/* ----- Component ----- */

export function EditorCockpit({
  pathway, sections, docMap, lang, market, langInfo, taLabel,
  onOpenSection, onNav, onAuthor, onValidate,
}: EditorCockpitProps): React.ReactElement {

  const data: CockpitData = useMemo(() => {
    const rows: SectionRow[] = sections.map(s => ({ s, c: sectionCtx(s, docMap, lang) }));
    const total = rows.length;
    const authored = rows.filter(r => !r.c.empty).length;
    const withEvidence = rows.filter(r => r.c.cites > 0).length;
    const inReview = rows.filter(r => r.c.status === 'review' || r.c.status === 'complete').length;
    const approved = rows.filter(r => r.c.status === 'complete').length;
    const hardBlockers = rows.filter(r => r.c.errFlags > 0 || r.c.blocker);
    const emptyRows = rows.filter(r => r.c.empty);
    const reviewReady = rows.filter(r => !r.c.empty && r.c.errFlags === 0 && r.c.status === 'draft');
    const pct = (n: number): number => total ? Math.round(n / total * 100) : 0;
    const overall = Math.round(
      pct(authored) * 0.4 + pct(withEvidence) * 0.15 + pct(inReview) * 0.25 + pathway.readiness * 0.2,
    );

    const phasePct: Record<string, number> = {
      plan: 100,
      author: pct(authored),
      evidence: authored ? Math.round(withEvidence / authored * 100) : 0,
      review: pct(inReview),
      validate: hardBlockers.length
        ? Math.max(10, 100 - hardBlockers.length * 12)
        : (authored ? 70 : 0),
      assemble: Math.min(pathway.readiness, pct(approved) + 10),
      dispatch: 0,
      respond: 0,
      maintain: 0,
    };

    const phaseState = (id: string): 'done' | 'active' | 'todo' => {
      const p = phasePct[id];
      if (id === 'plan') return 'done';
      if (p >= 100) return 'done';
      if (p > 0) return 'active';
      return 'todo';
    };

    const actions: NextAction[] = [];
    hardBlockers.slice(0, 2).forEach(r =>
      actions.push({
        id: 'b' + r.s.id, kind: 'blocker', icon: 'alertTriangle',
        label: 'Resolve ' + (r.c.errFlags > 0 ? 'contradiction' : 'blocker') + ' in ' + r.s.num,
        sub: r.s.label, go: () => onOpenSection(r.s.id),
      }),
    );
    emptyRows.slice(0, 2).forEach(r =>
      actions.push({
        id: 'd' + r.s.id, kind: 'draft', icon: 'sparkles',
        label: 'Draft ' + r.s.num + ' with AnA',
        sub: r.s.label, go: () => onOpenSection(r.s.id),
      }),
    );
    reviewReady.slice(0, 1).forEach(r =>
      actions.push({
        id: 'p' + r.s.id, kind: 'promote', icon: 'shieldCheck',
        label: 'Promote ' + r.s.num + ' to review',
        sub: r.s.label, go: () => onOpenSection(r.s.id),
      }),
    );
    if (authored >= Math.ceil(total * 0.6)) {
      actions.push({
        id: 'compile', kind: 'assemble', icon: 'layoutPanels',
        label: 'Compile & validate the eCTD package',
        sub: 'Submission Center', go: () => onNav('submission-center'),
      });
    }
    if (withEvidence < authored) {
      actions.push({
        id: 'ev', kind: 'evidence', icon: 'vault',
        label: 'Link evidence to authored sections',
        sub: 'Vault (DMS)', go: () => onNav('vault'),
      });
    }

    return {
      total, authored, withEvidence, inReview, approved,
      hardBlockers, emptyRows, overall, phasePct, phaseState,
      actions: actions.slice(0, 5), rows,
    };
  }, [pathway, sections, docMap, lang, onOpenSection, onNav]);

  /* Module readiness (per volume) */
  const modules: ModuleInfo[] = pathway.tree.map(v => {
    const items = v.items;
    const done = items.filter(s => s.status === 'complete').length;
    const pct = Math.round(done / items.length * 100);
    return { vol: v.vol, total: items.length, done, pct, first: items[0] };
  });

  /* Proactive signals */
  const signals: Signal[] = ([
    { sev: 'critical', icon: 'alertTriangle', text: pathway.dueline + ' -- ' + (100 - data.overall) + '% of readiness still open' },
    data.hardBlockers.length > 0
      ? { sev: 'critical', icon: 'alertTriangle', text: data.hardBlockers.length + ' section' + (data.hardBlockers.length > 1 ? 's' : '') + ' blocked by claim/evidence conflicts' }
      : null,
    { sev: 'warn', icon: 'history', text: data.emptyRows.length + ' section' + (data.emptyRows.length > 1 ? 's' : '') + ' not yet drafted' },
    { sev: 'info', icon: 'info', text: 'AnA can draft, validate & promote any section on demand' },
  ] as (Signal | null)[]).filter((s): s is Signal => s !== null);

  /* SVG readiness ring */
  const ring = (pct: number): React.ReactElement => {
    const r = 26;
    const c = 2 * Math.PI * r;
    const off = c * (1 - pct / 100);
    return (
      <svg className="rcp-ring" viewBox="0 0 64 64" width="64" height="64">
        <circle cx="32" cy="32" r={r} className="rcp-ring-bg" />
        <circle cx="32" cy="32" r={r} className="rcp-ring-fg" strokeDasharray={c} strokeDashoffset={off} />
        <text x="32" y="36" textAnchor="middle" className="rcp-ring-t">{pct}%</text>
      </svg>
    );
  };

  return (
    <div className="rcp">
      <div className="rcp-scroll">
        {/* header */}
        <header className="rcp-head">
          <div className="rcp-head-l">
            <div className="rcp-kind">
              <span className="rcp-k">{pathway.kind}</span>
              <span className="rcp-ta">{taLabel}</span>
            </div>
            <h1 className="rcp-title">{pathway.program}</h1>
            <div className="rcp-meta">
              <span>{I.globe} {market.agency} {'  '} {market.region}</span>
              <span>{I.user} {pathway.owner}</span>
              <span>{pathway.dueline}</span>
            </div>
          </div>
          <div className="rcp-head-r">
            {ring(data.overall)}
            <div className="rcp-head-stat"><b>{data.authored}/{data.total}</b> sections drafted</div>
            <button className="btn primary" onClick={onAuthor}>{I.sparkles} Build with AnA</button>
            <a className="btn ghost" href="ana.html" title="Back to AnA chat" style={{ textDecoration: 'none' }}>
              {I.messageSquare} AnA home
            </a>
          </div>
        </header>

        {/* phase spine */}
        <div className="rcp-spine">
          {PHASES.map((p, i) => {
            const st = data.phaseState(p.id);
            const pct = data.phasePct[p.id];
            return (
              <button
                key={p.id}
                className="rcp-phase"
                data-state={st}
                onClick={() => {
                  if (p.local === 'studio') onAuthor();
                  else if (p.local === 'preflight') onValidate();
                  else if (p.surface) onNav(p.surface);
                }}
              >
                <div className="rcp-phase-top">
                  <span className="rcp-phase-ic">{I[p.icon] || I.dot}</span>
                  <span className="rcp-phase-n">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <div className="rcp-phase-l">{p.label}</div>
                <div className="rcp-phase-b">{p.blurb}</div>
                <div className="rcp-phase-bar"><span style={{ width: pct + '%' }} /></div>
                <div className="rcp-phase-state">
                  {st === 'done' ? 'Complete' : st === 'active' ? pct + '%' : 'Not started'}
                </div>
              </button>
            );
          })}
        </div>

        {/* three-column working set */}
        <div className="rcp-cols">
          <section className="rcp-card">
            <h3>{I.alertTriangle} What's blocking the filing</h3>
            {data.hardBlockers.length === 0 && data.emptyRows.length === 0
              ? <div className="rcp-empty">Nothing blocking -- every section is drafted and clear.</div>
              : (
                <div className="rcp-list">
                  {data.hardBlockers.slice(0, 4).map(r => (
                    <button key={r.s.id} className="rcp-row" data-sev="err" onClick={() => onOpenSection(r.s.id)}>
                      <span className="rcp-row-num">{r.s.num}</span>
                      <span className="rcp-row-l">
                        <b>{r.s.label}</b>
                        <em>{r.c.errFlags > 0 ? 'Claim/evidence conflict' : 'Marked as a filing blocker'}</em>
                      </span>
                      <span className="rcp-row-go">{I.arrowRight}</span>
                    </button>
                  ))}
                  {data.emptyRows.slice(0, 4).map(r => (
                    <button key={r.s.id} className="rcp-row" data-sev="warn" onClick={() => onOpenSection(r.s.id)}>
                      <span className="rcp-row-num">{r.s.num}</span>
                      <span className="rcp-row-l">
                        <b>{r.s.label}</b>
                        <em>Not yet drafted</em>
                      </span>
                      <span className="rcp-row-go">{I.arrowRight}</span>
                    </button>
                  ))}
                </div>
              )}
          </section>

          <section className="rcp-card">
            <h3>{I.sparkles} Next best actions</h3>
            <div className="rcp-list">
              {data.actions.map(a => (
                <button key={a.id} className="rcp-act" onClick={a.go}>
                  <span className="rcp-act-ic">{I[a.icon] || I.dot}</span>
                  <span className="rcp-act-l">
                    <b>{a.label}</b>
                    <em>{a.sub}</em>
                  </span>
                  <span className="rcp-row-go">{I.arrowRight}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rcp-card">
            <h3>{I.zap} Proactive signals</h3>
            <div className="rcp-list">
              {signals.map((s, i) => (
                <div key={i} className="rcp-signal" data-sev={s.sev}>
                  <span className="rcp-signal-ic">{I[s.icon] || I.dot}</span>
                  <span>{s.text}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* module readiness */}
        <section className="rcp-card rcp-modules">
          <h3>{I.layoutPanels} Module readiness</h3>
          <div className="rcp-modgrid">
            {modules.map(m => (
              <button key={m.vol} className="rcp-mod" onClick={() => onOpenSection(m.first.id)}>
                <div className="rcp-mod-h">
                  <span className="rcp-mod-l">{m.vol}</span>
                  <span className="rcp-mod-ct">{m.done}/{m.total}</span>
                </div>
                <div className="rcp-mod-bar">
                  <span style={{ width: m.pct + '%' }} data-full={m.pct >= 100 || undefined} />
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

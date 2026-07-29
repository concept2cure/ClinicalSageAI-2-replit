import React, { useState, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag, liveGet } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Fixture data — 5-state Submission Center lifecycle ── */

interface LifecycleState {
  k: string;
  l: string;
  tone: string;
}

const CRO_LIFECYCLE: LifecycleState[] = [
  { k: 'draft', l: 'Draft', tone: 'idle' },
  { k: 'assembling', l: 'Assembling', tone: 'ai' },
  { k: 'validated', l: 'Validated', tone: 'warn' },
  { k: 'frozen', l: 'Frozen', tone: 'ok' },
  { k: 'dispatched', l: 'Dispatched', tone: 'ok' },
];

const CRO_TYPE: Record<string, { l: string; tone: string }> = {
  biotech: { l: 'Biotech', tone: 'ok' },
  pharma: { l: 'Pharma', tone: 'warn' },
  medtech: { l: 'Med Device', tone: 'ai' },
};

const SOW_TONE: Record<string, string> = {
  'on-track': 'ok',
  'at-risk': 'warn',
  'renewal-due': 'idle',
};

/* ── Sponsor fixture types ── */

interface CroStudy {
  code: string;
  phase: string;
  ind: string;
  status: string;
  n: string;
}

interface CroSub {
  id: string;
  type: string;
  region: string;
  state: string;
  gate: string;
  due: string;
}

interface CroSponsor {
  id: string;
  name: string;
  type: string;
  lead: string;
  sow: string;
  sowNote: string;
  studies: CroStudy[];
  subs: CroSub[];
}

const CRO_SPONSORS: CroSponsor[] = [
  {
    id: 'helix', name: 'Helix Therapeutics', type: 'biotech', lead: 'M. Webb',
    sow: 'on-track', sowNote: 'MSA + 2 active SOWs - renews Q1 2027',
    studies: [
      { code: 'HLX-301', phase: 'Phase 3', ind: 'anti-RTKX solid tumors', status: 'Enrolling', n: '412 / 480' },
      { code: 'HLX-208', phase: 'Phase 2', ind: 'RTKX+ NSCLC', status: 'Data lock', n: '186 / 186' },
    ],
    subs: [
      { id: 'BLA 761204', type: 'BLA', region: 'FDA - CBER', state: 'assembling', gate: '2 gates open', due: 'Q4 2026' },
    ],
  },
  {
    id: 'aurora', name: 'Aurora MedTech', type: 'medtech', lead: 'J. Chen',
    sow: 'on-track', sowNote: 'Master SOW - 510(k) + post-market surveillance',
    studies: [
      { code: 'AUR-CGM-PIV', phase: 'Pivotal', ind: 'iCGM accuracy (MARD)', status: 'Complete', n: '320 / 320' },
      { code: 'AUR-HF', phase: 'Human factors', ind: 'Use-error validation', status: 'Complete', n: '45 / 45' },
      { code: 'AUR-RWE', phase: 'RWE', ind: 'Post-market registry', status: 'Ongoing', n: '1,240 / —' },
    ],
    subs: [
      { id: 'K-Aurora-CGM', type: '510(k)', region: 'FDA - CDRH', state: 'validated', gate: 'gate clear', due: 'Aug 2026' },
      { id: 'CER-Aurora', type: 'CER', region: 'EU MDR', state: 'draft', gate: '—', due: 'Q1 2027' },
    ],
  },
  {
    id: 'meridian', name: 'Meridian Pharma', type: 'pharma', lead: 'A. Muller',
    sow: 'at-risk', sowNote: 'SOW-7 change order pending — scope creep flagged',
    studies: [
      { code: 'MRD-401', phase: 'Phase 3', ind: '2L oncology', status: 'Enrolling', n: '640 / 900' },
      { code: 'MRD-PK', phase: 'Phase 1', ind: 'PK / PD bridging', status: 'Complete', n: '48 / 48' },
    ],
    subs: [
      { id: 'NDA 215780', type: 'NDA', region: 'FDA - OND', state: 'draft', gate: '—', due: 'Q3 2027' },
    ],
  },
  {
    id: 'cohort', name: 'Cohort Bio', type: 'biotech', lead: 'R. Nair',
    sow: 'on-track', sowNote: 'Single SOW - first-in-human program',
    studies: [
      { code: 'CHT-FIH', phase: 'Phase 1', ind: 'First-in-human (SAD/MAD)', status: 'Startup', n: '0 / 32' },
    ],
    subs: [
      { id: 'IND 178432', type: 'IND', region: 'FDA', state: 'frozen', gate: 'gate clear', due: 'Pre-IND cleared' },
    ],
  },
  {
    id: 'linea', name: 'Linea Diagnostics', type: 'medtech', lead: 'A. Muller',
    sow: 'renewal-due', sowNote: 'MSA renewal due in 30 days',
    studies: [
      { code: 'LIN-CDx', phase: 'Clinical perf.', ind: 'Companion Dx (Annex XIII)', status: 'Ongoing', n: '210 / 300' },
      { code: 'LIN-AV', phase: 'Analytical', ind: 'Analytical validation', status: 'Complete', n: '—' },
    ],
    subs: [
      { id: 'IVDR-TF-Linea', type: 'IVDR', region: 'EU IVDR - NB', state: 'dispatched', gate: 'gate clear', due: 'NB submitted' },
    ],
  },
];

/* ── CRO Sponsor Portfolio ── */

export function CroPortfolio({ onAsk }: SurfaceViewProps) {
  const [sponsors, setSponsors] = useState<CroSponsor[]>(CRO_SPONSORS);
  const [selId, setSel] = useState('helix');
  const [sample, setSample] = useState(true);

  /* live ?? fixture — adopt the org's seeded sponsor roster when the store
     returns the full CroSponsor shape (roster fields + nested studies/subs),
     else keep the codebase fixture so the console is never empty. Never
     fabricates. */
  useEffect(() => {
    let cancelled = false;
    liveGet<{ data?: CroSponsor[] }>('/api/cro-portfolio', { data: [] }).then((res) => {
      if (cancelled) return;
      const list = res.data?.data;
      if (
        !res.sample &&
        Array.isArray(list) &&
        list.length > 0 &&
        list[0]?.id &&
        list[0]?.name &&
        Array.isArray(list[0]?.studies) &&
        Array.isArray(list[0]?.subs)
      ) {
        setSponsors(list);
        setSel((cur) => (list.some((s) => s.id === cur) ? cur : list[0].id));
        setSample(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sel = sponsors.find((s) => s.id === selId) || sponsors[0];

  const allSubs = sponsors.flatMap((s) => s.subs);
  const allStudies = sponsors.flatMap((s) => s.studies);
  const pipe = CRO_LIFECYCLE.map((st) => ({
    ...st,
    n: allSubs.filter((x) => x.state === st.k).length,
  }));
  const health = [
    { l: 'Sponsor clients', n: sponsors.length, m: 'org-isolated tenants', t: '' },
    { l: 'Active studies', n: allStudies.filter((s) => s.status !== 'Complete').length, m: `of ${allStudies.length} total`, t: '' },
    { l: 'Submissions in flight', n: allSubs.filter((s) => s.state !== 'dispatched').length, m: 'pre-dispatch', t: 'ai' },
    { l: 'SOWs needing attention', n: sponsors.filter((s) => s.sow !== 'on-track').length, m: 'change-order / renewal', t: 'warn' },
  ];

  return (
    <div className="page-inner">
      <SampleTag sample={sample} />
      <div className="ph">
        <div>
          <div className="ph-eyebrow">CRO {I.dot} Multi-sponsor</div>
          <h1 className="ph-title">Sponsor Portfolio</h1>
          <div className="ph-sub">
            Every sponsor client rolled up in one console — each org-isolated.
            Drill into a sponsor to work their filing; each submission runs the
            same Submission Center lifecycle on its own pathway.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn ghost"
            onClick={() =>
              onAsk(
                'Which sponsor submissions are at risk of missing their dispatch window?',
              )
            }
          >
            {I.sparkles} Ask AnA
          </button>
          <button className="btn primary">{I.plus} Onboard sponsor</button>
        </div>
      </div>

      <div className="metrics">
        {health.map((h, i) => (
          <div key={i} className="metric" data-tone={h.t || ''}>
            <div className="metric-l">{h.l}</div>
            <div className="metric-n">{h.n}</div>
            <div
              className="dmod-chip"
              style={{
                marginTop: 6,
                background: 'transparent',
                padding: 0,
                color: 'var(--text-400)',
              }}
            >
              {h.m}
            </div>
          </div>
        ))}
      </div>

      {/* shared 5-state lifecycle rollup across all sponsor submissions */}
      <div className="cro-pipe-wrap">
        <div className="cro-pipe-hd">
          <span>Submission lifecycle — portfolio-wide</span>
          <span className="cro-pipe-note">
            Shared Submission Center - {allSubs.length} active submissions
          </span>
        </div>
        <div className="cro-pipe">
          {pipe.map((p, i) => (
            <React.Fragment key={p.k}>
              <div className="cro-pipe-cell">
                <div className={`cro-pipe-n tone-${p.tone}`}>{p.n}</div>
                <div className="cro-pipe-l">{p.l}</div>
              </div>
              {i < pipe.length - 1 && (
                <span className="cro-pipe-arr">{I.arrowRight}</span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="cro-split">
        {/* sponsor roster */}
        <div className="cro-roster">
          <div className="cro-roster-hd">
            Sponsor clients <span>{sponsors.length}</span>
          </div>
          {sponsors.map((s) => {
            const t = CRO_TYPE[s.type] || CRO_TYPE.biotech;
            return (
              <button
                key={s.id}
                className="cro-spn"
                data-on={s.id === selId || undefined}
                onClick={() => setSel(s.id)}
              >
                <div className="cro-spn-top">
                  <span className="cro-spn-name">{s.name}</span>
                  <span className={`rd-chip tone-${t.tone}`}>{t.l}</span>
                </div>
                <div className="cro-spn-meta">
                  <span>
                    {s.studies.length}{' '}
                    {s.studies.length === 1 ? 'study' : 'studies'}
                  </span>
                  <span className="cro-dot">-</span>
                  <span>
                    {s.subs.length}{' '}
                    {s.subs.length === 1 ? 'submission' : 'submissions'}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span
                    className={`cro-sow tone-${SOW_TONE[s.sow] || 'idle'}`}
                    title={s.sowNote}
                  >
                    {s.sow.replace('-', ' ')}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* selected sponsor detail */}
        <div className="cro-detail">
          <div className="cro-detail-hd">
            <div>
              <div className="cro-detail-name">
                {sel.name}{' '}
                <span
                  className={`rd-chip tone-${(CRO_TYPE[sel.type] || CRO_TYPE.biotech).tone}`}
                >
                  {(CRO_TYPE[sel.type] || CRO_TYPE.biotech).l}
                </span>
              </div>
              <div className="cro-detail-sub">
                Engagement lead {sel.lead} - org-isolated workspace
              </div>
            </div>
            <button className="btn ghost">
              Open programs {I.arrowRight}
            </button>
          </div>

          <div
            className={`cro-sow-banner tone-${SOW_TONE[sel.sow] || 'idle'}`}
          >
            <span className="ico">
              {sel.sow === 'on-track' ? I.check : I.alertTriangle}
            </span>
            <span>
              <strong>SOW - {sel.sow.replace('-', ' ')}</strong> —{' '}
              {sel.sowNote}
            </span>
          </div>

          <div className="cro-sec-l">
            Studies <span>croStudies</span>
          </div>
          <div className="ctable" style={{ marginBottom: 18 }}>
            <div
              className="ct-head"
              style={{ gridTemplateColumns: '110px 1fr 110px 110px' }}
            >
              <div>Protocol</div>
              <div>Indication / design</div>
              <div>Status</div>
              <div>Enrolled</div>
            </div>
            {sel.studies.map((st, i) => (
              <div
                key={i}
                className="ct-row"
                style={{
                  gridTemplateColumns: '110px 1fr 110px 110px',
                  cursor: 'default',
                }}
              >
                <div className="ct-strong">{st.code}</div>
                <div style={{ fontSize: 11.5 }}>
                  {st.ind}
                  <div style={{ color: 'var(--text-400)', fontSize: 10.5 }}>
                    {st.phase}
                  </div>
                </div>
                <div style={{ fontSize: 11 }}>
                  <span
                    className={`rd-chip tone-${
                      st.status === 'Complete'
                        ? 'ok'
                        : st.status === 'Startup'
                          ? 'idle'
                          : 'ai'
                    }`}
                  >
                    {st.status}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-300)' }}>
                  {st.n}
                </div>
              </div>
            ))}
          </div>

          <div className="cro-sec-l">
            Regulatory submissions{' '}
            <span>croRegulatorySubmissions - shared lifecycle</span>
          </div>
          <div className="ctable">
            <div
              className="ct-head"
              style={{
                gridTemplateColumns: '130px 90px 1fr 110px 110px',
              }}
            >
              <div>Submission</div>
              <div>Pathway</div>
              <div>Lifecycle state</div>
              <div>Dispatch gate</div>
              <div>Target</div>
            </div>
            {sel.subs.map((sb, i) => {
              const lc =
                CRO_LIFECYCLE.find((x) => x.k === sb.state) ||
                CRO_LIFECYCLE[0];
              return (
                <div
                  key={i}
                  className="ct-row"
                  style={{
                    gridTemplateColumns: '130px 90px 1fr 110px 110px',
                    cursor: 'default',
                  }}
                >
                  <div className="ct-strong">
                    {sb.id}
                    <div
                      style={{
                        color: 'var(--text-400)',
                        fontSize: 10.5,
                        fontWeight: 400,
                      }}
                    >
                      {sb.region}
                    </div>
                  </div>
                  <div style={{ fontSize: 11 }}>
                    <span className="rd-chip tone-idle">{sb.type}</span>
                  </div>
                  <div>
                    <div className="cro-lc">
                      <span className={`cro-lc-dot tone-${lc.tone}`} />
                      <span style={{ fontSize: 11.5 }}>{lc.l}</span>
                    </div>
                    <div className="cro-lc-track">
                      {CRO_LIFECYCLE.map((x, xi) => {
                        const cur = CRO_LIFECYCLE.findIndex(
                          (y) => y.k === sb.state,
                        );
                        return (
                          <span
                            key={xi}
                            className="cro-lc-seg"
                            data-done={xi <= cur || undefined}
                            data-cur={xi === cur || undefined}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color:
                        sb.gate === 'gate clear'
                          ? 'var(--success)'
                          : sb.gate === '—'
                            ? 'var(--text-400)'
                            : 'var(--warning)',
                    }}
                  >
                    {sb.gate}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-400)' }}>
                    {sb.due}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="cro-foot-note">
            {I.shield} Each sponsor's data is isolated by{' '}
            <code>organizationId</code>; submissions inherit the sponsor's
            pathway and run the same freeze/dispatch gates (Part-11
            e-signature - deterministic readiness).
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { C2CForm, type C2CFormConfig } from '../C2CForm';
import { C2CToast, useToast } from '../toast';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../surfaceActions';
import '../styles/project-home-v2.css';

/* ── Display metadata — 5-state Submission Center lifecycle + chip vocabularies ── */

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

/* ── Live read rows — exactly what GET /api/cro-portfolio returns ──
   Assembled server-side from the REAL, org-scoped CRO engagement store
   (cro_clients + cro_studies + cro_regulatory_submissions + cro_milestones +
   cro_team_assignments — the tables the /api/cro CRUD routes write; see
   server/services/cro/cro-portfolio-view-assembler.ts). lead / sowNote /
   phase / gate / due are honest-null where the store has no fact — rendered
   null-safe, never fabricated.

   sow / studies / subs are the three the render DEREFERENCES (.replace,
   .length, .map) rather than just printing, so they are declared optional: a
   sponsor row that arrives without them — narrowed projection, older
   assembler, half-migrated client — must not take the whole console down. */

interface CroStudy {
  code: string;
  phase: string | null;
  ind: string;
  status: string;
  n: string;
}

interface CroSub {
  id: string;
  type: string;
  region: string;
  state: string;
  gate: string | null;
  due: string | null;
}

interface CroSponsor {
  id: string;
  name: string;
  type: string;
  lead: string | null;
  sow?: string;
  sowNote: string | null;
  studies?: CroStudy[];
  subs?: CroSub[];
}

/* ── CRO Sponsor Portfolio ── */

export function CroPortfolio({ onAsk, onNav }: SurfaceViewProps) {
  /* Fixture-free (real-data standard): the org's real sponsor roster, an honest
     empty state, or an honest error — no codebase fixture, no "Sample data". */
  const [rosterEpoch, setRosterEpoch] = useState(0);
  const live = useLiveRows<CroSponsor>('/api/cro-portfolio', ['/api/cro-portfolio', rosterEpoch]);
  const sponsors = live.rows;

  /* ── "Onboard sponsor" opened nothing ─────────────────────────────────────
     `<button className="btn primary">{I.plus} Onboard sponsor</button>` — the
     primary call to action on the CRO's own portfolio, with no onClick. A CRO
     could not add a sponsor anywhere in the product.

     POST /api/cro/clients exists and is mounted (server/routes/cro.ts:209,
     register-advanced-platform-routes.ts). It requires `name` and
     `companyType`; the rest of cro_clients is optional, so the form asks for
     the two the route validates plus the contact fields a sponsor record is
     useless without. The roster is re-read from the server afterwards rather
     than patched locally — the row appears because it was stored. */
  const [toast, fireToast] = useToast();
  const [onboarding, setOnboarding] = useState(false);

  const SPONSOR_FORM: C2CFormConfig = {
    eyebrow: 'CRO portfolio · new sponsor',
    title: 'Onboard a sponsor',
    governed:
      'A sponsor is an org-isolated workspace. The record is created under your organization and is visible only to it.',
    submitLabel: 'Create sponsor',
    fields: [
      { key: 'name', label: 'Sponsor name', type: 'text', required: true },
      {
        key: 'companyType',
        label: 'Company type',
        type: 'select',
        options: ['biotech', 'pharma', 'medical_device', 'diagnostic'],
        required: true,
        half: true,
      },
      { key: 'industrySegment', label: 'Industry segment', type: 'text', placeholder: 'e.g. oncology', half: true },
      { key: 'primaryContact', label: 'Primary contact', type: 'text', half: true },
      { key: 'contactEmail', label: 'Contact email', type: 'text', half: true },
      { key: 'regulatoryContact', label: 'Regulatory contact', type: 'text', half: true },
      { key: 'regulatoryEmail', label: 'Regulatory email', type: 'text', half: true },
    ],
  };

  const createSponsor = async (v: Record<string, string>) => {
    setOnboarding(false);
    try {
      const res = await apiRequest('POST', '/api/cro/clients', {
        name: (v.name || '').trim(),
        companyType: v.companyType,
        industrySegment: (v.industrySegment || '').trim() || undefined,
        primaryContact: (v.primaryContact || '').trim() || undefined,
        contactEmail: (v.contactEmail || '').trim() || undefined,
        regulatoryContact: (v.regulatoryContact || '').trim() || undefined,
        regulatoryEmail: (v.regulatoryEmail || '').trim() || undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        fireToast(
          'Sponsor not created — ' + ((body as { error?: string } | null)?.error ?? `HTTP ${res.status}`) + '.',
          'error',
        );
        return;
      }
      fireToast(`Sponsor "${(v.name || '').trim()}" created.`);
      setRosterEpoch((n) => n + 1);
    } catch (e) {
      fireToast(
        'Sponsor not created — ' + (e instanceof Error ? e.message : String(e)) + '. Nothing was stored.',
        'error',
      );
    }
  };
  const [selId, setSel] = useState<string | null>(null);

  const sel = sponsors.find((s) => s.id === selId) ?? sponsors[0];

  /* AnA can select a sponsor by name — the same row click a person makes — so a
     drive can land on a specific sponsor before its engagements are discussed.
     Resolved against the REAL roster with honest misses; held (retry) while it
     loads, re-attempted on the ready signal below. Selecting is view-state only. */
  useSurfaceActionHandlers('cro-portfolio', {
    'cro-portfolio.select-sponsor': (params) => {
      const raw = String(params.sponsor ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a sponsor.' };
      if (live.loading) return { ok: false, reason: 'The sponsor roster is still loading.', retry: true };
      if (live.error) return { ok: false, reason: 'The sponsor roster did not load, so there are no sponsors to select from.' };
      if (sponsors.length === 0) return { ok: false, reason: 'No sponsors are recorded in this organization yet.' };
      const needle = raw.toLowerCase();
      const exact = sponsors.filter((s) => s.name.toLowerCase() === needle);
      const hits = exact.length ? exact : sponsors.filter((s) => s.name.toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No sponsor named "${raw}".` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} sponsors — name one exactly.` };
      const s = hits[0];
      if (selId === s.id) return { ok: true, detail: `Already on ${s.name}` };
      setSel(s.id);
      return { ok: true, detail: `Selected ${s.name}` };
    },
  });
  useEffect(() => {
    if (!live.loading && !live.error) notifySurfaceActionReady('cro-portfolio');
  }, [live.loading, live.error]);

  /* A sponsor with no `subs` / `studies` at all used to flatMap to a list of
     undefined rows, and the very next filter read `.state` off one of them. */
  const allSubs = sponsors.flatMap((s) => s.subs ?? []);
  const allStudies = sponsors.flatMap((s) => s.studies ?? []);
  /* Same for the selected sponsor's two tables, which count and map their lists
     — absent lists render as the tables' existing "none recorded yet" rows. */
  const selStudies = sel?.studies ?? [];
  const selSubs = sel?.subs ?? [];
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

  /* What AnA can see of this screen. The header button asks her "which sponsor
     submissions are at risk of missing their dispatch window?" — a question she
     could not answer, because she was told the screen was called
     "cro-portfolio" and nothing about which sponsors are on it.

     A FAILED read publishes the failure: an empty roster and an unreachable one
     are indistinguishable from here, and naming a CRO's sponsor count from a
     failed fetch is a claim about their book of business. */
  const anaContext = useMemo(() => {
    if (live.loading) {
      return { summary: 'The sponsor portfolio is still loading; nothing on screen is final yet.' };
    }
    if (live.error) {
      return {
        summary:
          'The sponsor portfolio could not be read, so this screen is showing no sponsors because of a ' +
          'failure, not because there are none.',
        availableActions: ['Retry the sponsor portfolio read'],
      };
    }
    return {
      summary:
        `CRO sponsor portfolio: ${sponsors.length} sponsor client(s), ${allStudies.length} study(ies), ` +
        `${allSubs.length} submission(s) — ${allSubs.filter((s) => s.state !== 'dispatched').length} still ` +
        `pre-dispatch, ${sponsors.filter((s) => s.sow !== 'on-track').length} SOW(s) needing attention` +
        (sel ? `. Sponsor "${sel.name}" is open.` : '.'),
      facts: {
        sponsorCount: sponsors.length,
        studyCount: allStudies.length,
        submissionCount: allSubs.length,
        pipelineByState: Object.fromEntries(pipe.map((p) => [p.k, p.n])),
        sponsors: sponsors.slice(0, 12).map((s) => ({
          id: s.id, name: s.name, type: s.type,
          // `lead` is a CRO staff member's real name (assembled from
          // users.name via cro_team_assignments) — a person's identity, which
          // stays OUT of the every-turn prompt channel like `sowNote` below.
          // Its presence travels; the name stays on screen.
          hasLead: Boolean(s.lead),
          // `sowNote` is a user-authored free-text note (cro_clients.notes) —
          // out of the every-turn prompt channel, like every other free-text
          // field in this subsystem; its presence travels, the prose stays on
          // screen (the tooltip at the row still shows it).
          sowState: s.sow ?? null, hasSowNote: Boolean(s.sowNote),
          studies: (s.studies ?? []).length, submissions: (s.subs ?? []).length,
        })),
        selectedSponsor: sel
          ? {
              id: sel.id, name: sel.name, type: sel.type, hasLead: Boolean(sel.lead),
              sowState: sel.sow ?? null, hasSowNote: Boolean(sel.sowNote),
              studies: selStudies.map((st) => ({
                code: st.code, phase: st.phase, ind: st.ind, status: st.status, enrolment: st.n,
              })),
              submissions: selSubs.map((sb) => ({
                id: sb.id, type: sb.type, region: sb.region, state: sb.state,
                gate: sb.gate, due: sb.due,
              })),
            }
          : null,
      },
      availableActions: [
        'Select a sponsor to open its studies and submissions',
        'Read a sponsor submission\u2019s lifecycle state, gate and dispatch due date',
        'Onboard a new sponsor client',
      ],
    };
  }, [live.loading, live.error, sponsors, allStudies, allSubs, pipe, sel, selStudies, selSubs]);
  usePublishSurfaceContext('cro-portfolio', anaContext);

  return (
    <div className="page-inner">
      <div className="ph">
        <div>
          <div className="ph-eyebrow">CRO {I.dot} Multi-sponsor</div>
          <h1 className="ph-title">Sponsor portfolio</h1>
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
          <button
            className="btn primary"
            onClick={() => setOnboarding(true)}
            data-testid="cro-onboard-sponsor"
          >
            {I.plus} Onboard sponsor
          </button>
        </div>
      </div>

      {live.loading ? (
        <div className="scaf-note" style={{ padding: '18px 10px' }}>
          Loading the sponsor portfolio…
        </div>
      ) : live.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the sponsor portfolio"
          hint="The sponsor-client roster didn't respond. These are your organization's CRO engagements — sign in and retry, or check the service is reachable."
        />
      ) : sponsors.length === 0 || !sel ? (
        <EmptyState
          icon={I.building}
          title="No sponsor clients yet"
          hint={
            <>
              Onboard a sponsor to see their studies and regulatory submissions
              rolled up here. Clients are created via{' '}
              <span className="mono">Add a client</span>; their studies,
              submissions and milestones populate this console as the engagement
              runs.
            </>
          }
        />
      ) : (
        <>
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
                /* Counted, not printed — a row whose child lists never came
                   back has nothing to count rather than no row. */
                const nStudies = (s.studies ?? []).length;
                const nSubs = (s.subs ?? []).length;
                return (
                  <button
                    key={s.id}
                    className="cro-spn"
                    data-on={s.id === sel.id || undefined}
                    onClick={() => setSel(s.id)}
                  >
                    <div className="cro-spn-top">
                      <span className="cro-spn-name">{s.name}</span>
                      <span className={`rd-chip tone-${t.tone}`}>{t.l}</span>
                    </div>
                    <div className="cro-spn-meta">
                      <span>
                        {nStudies} {nStudies === 1 ? 'study' : 'studies'}
                      </span>
                      <span className="cro-dot">-</span>
                      <span>
                        {nSubs} {nSubs === 1 ? 'submission' : 'submissions'}
                      </span>
                      <span style={{ flex: 1 }} />
                      {/* No SOW status on the row -> no chip. The chip's tone
                          and label are both the status; an empty one reads as
                          an engagement state the sponsor does not have. */}
                      {s.sow && (
                        <span
                          className={`cro-sow tone-${SOW_TONE[s.sow] || 'idle'}`}
                          title={s.sowNote ?? undefined}
                        >
                          {s.sow.replace('-', ' ')}
                        </span>
                      )}
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
                    Engagement lead {sel.lead ?? '—'} - org-isolated workspace
                  </div>
                </div>
                {/* Was a dead button labelled "Open programs", implying a
                    view scoped to this sponsor. No route can serve that:
                    GET /api/c2c/projects has no sponsor filter. It goes to the
                    real programme index and says so, rather than promising a
                    sponsor-scoped screen that does not exist. */}
                <button
                  className="btn ghost"
                  onClick={() => onNav && onNav('projects')}
                  title="Open the organisation's programme portfolio"
                  data-testid="cro-open-programs"
                >
                  Open programme portfolio {I.arrowRight}
                </button>
              </div>

              {/* Every part of this banner — tone, icon, label — states the
                  SOW status, and the icon states it as a warning by default.
                  A sponsor that arrived without one has no status to state, so
                  the banner is omitted rather than shown asserting risk. */}
              {sel.sow && (
                <div
                  className={`cro-sow-banner tone-${SOW_TONE[sel.sow] || 'idle'}`}
                >
                  <span className="ico">
                    {sel.sow === 'on-track' ? I.check : I.alertTriangle}
                  </span>
                  <span>
                    <strong>SOW - {sel.sow.replace('-', ' ')}</strong>
                    {sel.sowNote ? <> — {sel.sowNote}</> : null}
                  </span>
                </div>
              )}

              <div className="cro-sec-l">
                Studies <span>cro_studies</span>
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
                {selStudies.length === 0 && (
                  <div
                    className="ct-row"
                    style={{ gridTemplateColumns: '1fr', cursor: 'default' }}
                  >
                    <div style={{ fontSize: 11.5, color: 'var(--text-400)' }}>
                      No studies recorded for this sponsor yet.
                    </div>
                  </div>
                )}
                {selStudies.map((st, i) => (
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
                        {st.phase ?? '—'}
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
                <span>cro_regulatory_submissions - shared lifecycle</span>
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
                {selSubs.length === 0 && (
                  <div
                    className="ct-row"
                    style={{ gridTemplateColumns: '1fr', cursor: 'default' }}
                  >
                    <div style={{ fontSize: 11.5, color: 'var(--text-400)' }}>
                      No regulatory submissions recorded for this sponsor yet.
                    </div>
                  </div>
                )}
                {selSubs.map((sb, i) => {
                  const lc =
                    CRO_LIFECYCLE.find((x) => x.k === sb.state) ||
                    CRO_LIFECYCLE[0];
                  const gate = sb.gate ?? '—';
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
                            gate === 'gate clear'
                              ? 'var(--success)'
                              : gate === '—'
                                ? 'var(--text-400)'
                                : 'var(--warning)',
                        }}
                      >
                        {gate}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-400)' }}>
                        {sb.due ?? '—'}
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
        </>
      )}

      {onboarding && (
        <C2CForm
          config={SPONSOR_FORM}
          onCancel={() => setOnboarding(false)}
          onSubmit={createSponsor}
        />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}

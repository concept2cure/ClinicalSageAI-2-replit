/**
 * Biopharma project surfaces -- kit app/Project3.jsx ported.
 *
 * Contains 3 surfaces:
 *   - BiopharmaProject  (registry id `biopharma`)
 *   - CsrWorkflow       (registry id `csr-workflow`)
 *   - RegulatoryWorkspace (registry id `regulatory-workspace`, full: true)
 */
import React, { useEffect, useState } from 'react';
import { I } from '../icons';
import { SampleTag, useLiveData, useLiveList, EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { isClinicalRegulatoryGraphEnabled } from '../clinicalRegulatoryGraphFlag';
import {
  APPLICABILITY_LABEL,
  OUTCOME_LABEL,
  SEVERITY_TONE,
  VERIFICATION_LABEL,
  VERIFICATION_TONE,
  isStudyAttributable,
  withDenominator,
  type CoverageView,
  type FindingSearchView,
  type RegulatoryFindingView,
  type RegulatoryOutcomeView,
} from '../fixtures/clinical-regulatory-evidence';
import {
  STATUS_TONE,
  BIO_PROGRAM,
  BIO_PHASES,
  BIO_MODULES,
  BIO_BLA,
} from '../fixtures/project3-data';
import type {
  CsrProgram,
  CsrSection,
  RwTreeItem,
  RwIntelItem,
} from '../fixtures/project3-data';
import '../styles/project-home-v2.css';

/* ── Inline helpers ── */

function PageHead({ eyebrow, title, sub, actions }: {
  eyebrow: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="ph">
      <div>
        <div className="ph-eyebrow">{eyebrow}</div>
        <h1 className="ph-title">{title}</h1>
        {sub && <div className="ph-sub">{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}

function GateCell({ ok, k, v }: { ok?: boolean; k: string; v: string }) {
  return (
    <div className="gate-cell" data-ok={ok}>
      <span className="gate-ico">{ok ? I.check : I.alertTriangle}</span>
      <div>
        <div className="gate-k">{k}</div>
        <div className="gate-v">{v}</div>
      </div>
    </div>
  );
}

/* ════ Biopharma — BLA / CTD surface ════

   ⚠️ BUILD GAP — NOT yet fixture-free (reported, not fabricated).

   Unlike CsrWorkflow and RegulatoryWorkspace below (both now render real,
   org-scoped data), NONE of this surface's four panels has a backend that
   returns its display contract, so there is no real data to render and no
   honest way to retire the fixtures here without first building the routes:

     · Header      BIO_PROGRAM  — no fetch. Closest real route is the programs
                                  LIST GET /api/biopharma (server/routes/biopharma/
                                  programs.ts:47), a different shape, not called here.
     · Phase strip BIO_PHASES   — no fetch, no backend anywhere. There is no
                                  per-phase lifecycle-progress endpoint.
     · CTD modules BIO_MODULES  — useLiveList('/api/biopharma/ctd', …) but that
                                  router (server/routes/biopharma/ctd.ts) exposes
                                  ONLY GET /structure and GET /build-state/:projectId —
                                  no root GET and nothing returning the M1–M5
                                  {code,label,pct,status,docs} summary. The fetch
                                  404s every mount and always falls back to the fixture.
     · BLA bench   BIO_BLA      — no read for the per-attribute similarity/
                                  comparability/immunogenicity tables. /api/biopharma/bla
                                  (bla-workbench.ts) is POST-compute + GET /assessments
                                  (metadata list), a different shape.

   Per the GA guardrail, this is STOPPED and reported as a backend build gap
   rather than fabricated or gutted into permanent empty states. The SampleTag +
   BIO_* fixtures stay ONLY until a shape-matching org-scoped read exists; a
   follow-up then removes them exactly as the two surfaces below were done. */

export function BiopharmaProject({ onAsk, onNav }: SurfaceViewProps) {
  const p = BIO_PROGRAM;
  const bla = BIO_BLA;
  const [tab, setTab] = useState('similarity');
  const liveModules = useLiveList<(typeof BIO_MODULES)[number]>('/api/biopharma/ctd', BIO_MODULES);

  return (
    <div className="page-inner">
      <SampleTag sample={liveModules.sample} />
      <PageHead
        eyebrow="Project · submission"
        title="Biopharma — BLA / CTD"
        sub={`${p.title} · ${p.code} · ${p.due}`}
        actions={
          <>
            <button className="btn ghost" onClick={() => onAsk('What is gating the BLA filing?')}>
              {I.sparkles} Ask AnA
            </button>
            <button className="btn primary" onClick={() => onNav && onNav('document-authoring')}>
              {I.layers} Open CTD editor
            </button>
          </>
        }
      />

      <div className="phases" style={{ gridTemplateColumns: 'repeat(10,1fr)' }}>
        {BIO_PHASES.map((ph, i) => (
          <div key={ph.id} className={`phase ${ph.status}`}>
            <div className="phase-l" style={{ minHeight: 38, fontSize: 10.5 }}>{i + 1}. {ph.label}</div>
            <div className="phase-bar"><div className="phase-bar-f" style={{ width: ph.pct + '%' }} /></div>
            <div className="phase-pct">
              <span>{ph.pct}%</span>
              <span className="kdot" data-tone={STATUS_TONE[ph.status]} />
            </div>
          </div>
        ))}
      </div>

      <div className="split2" style={{ gridTemplateColumns: '1.1fr 1fr', alignItems: 'start' }}>
        <div className="sec">
          <div className="sec-hdr">
            <div className="sec-title">CTD modules</div>
            <div className="sec-sub">233 documents</div>
          </div>
          <div className="cmc-blueprint" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            {liveModules.data.map((m) => (
              <button key={m.code} className="cmc-card" style={{ textAlign: 'left' }} onClick={() => onNav && onNav('document-authoring')}>
                <div className="cmc-card-top">
                  <span className="mono cmc-code">{m.code}</span>
                  <span className={`rd-chip tone-${STATUS_TONE[m.status]}`}>{m.status}</span>
                </div>
                <div className="cmc-card-l">{m.label}</div>
                <div className="cmc-bar"><div className="cmc-bar-f" style={{ width: m.pct + '%' }} /></div>
                <div className="cmc-card-foot"><span>{m.pct}% mapped</span><span>{m.docs} docs</span></div>
              </button>
            ))}
          </div>
        </div>

        <div className="sec">
          <div className="sec-hdr">
            <div className="sec-title">BLA biologics workbench</div>
            <div className="sec-sub">351(a) analytical package</div>
          </div>
          <div className="tabs">
            {([['similarity', 'Analytical similarity'], ['comparability', 'Comparability'], ['immunogenicity', 'Immunogenicity']] as const).map(([x, l]) => (
              <button key={x} className={`tab${tab === x ? ' on' : ''}`} onClick={() => setTab(x)}>{l}</button>
            ))}
          </div>
          <div className="tab-body">
            {tab === 'similarity' && (
              <div className="ctable">
                <div className="ct-head" style={{ gridTemplateColumns: '1.1fr 1fr 1fr 70px' }}>
                  <div>Attribute</div><div>Method</div><div>Result</div><div></div>
                </div>
                {bla.similarity.map((r, i) => (
                  <div key={i} className="ct-row" style={{ gridTemplateColumns: '1.1fr 1fr 1fr 70px' }}>
                    <div className="ct-strong">{r.attr}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-400)' }}>{r.method}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-300)' }}>{r.result}</div>
                    <div><span className={`rd-chip tone-${r.verdict}`}>{r.verdict === 'ok' ? 'Pass' : 'Review'}</span></div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'comparability' && (
              <div className="ctable">
                <div className="ct-head" style={{ gridTemplateColumns: '1fr 1fr 110px' }}>
                  <div>Change</div><div>Scope</div><div>Verdict</div>
                </div>
                {bla.comparability.map((r, i) => (
                  <div key={i} className="ct-row" style={{ gridTemplateColumns: '1fr 1fr 110px' }}>
                    <div className="ct-strong">{r.lot}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-400)' }}>{r.scope}</div>
                    <div><span className={`rd-chip tone-${r.tone}`}>{r.status}</span></div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'immunogenicity' && (
              <div className="gate-grid">
                <GateCell ok k="ADA incidence" v={bla.immunogenicity.adaRate} />
                <GateCell ok k="NAb incidence" v={bla.immunogenicity.nabRate} />
                <GateCell ok k="Assay" v={bla.immunogenicity.assay} />
                <GateCell ok k="Clinical impact" v={bla.immunogenicity.impact} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════ CSR Workflow — ICH E3 surface ════ */

/** GET /api/csr-workflow/board payload (server csr-workflow-routes.ts), the
 *  inner `data` object after the { success, data } envelope is unwrapped. */
interface CsrBoard {
  program: CsrProgram | null;
  sections: CsrSection[];
  meta?: Record<string, unknown>;
  generatedAt?: string;
}

/**
 * The ICH E3 board's grid template. The base four columns are unchanged; the two
 * regulatory dimensions are appended only when the Clinical-Regulatory
 * Intelligence Graph is enabled, so flag-off renders byte-identically to before.
 */
const CSR_COLS_BASE = '70px 1fr 100px 60px';
const CSR_COLS_GRAPH = '62px 1fr 96px 150px 168px 34px';

/**
 * Coverage strip — §8.1 denominators for the study, above the board.
 *
 * Every cell shows a raw count, never a percentage: "18 verified" alongside "31
 * structured" lets a reader compute the ratio and see the base it came from. A
 * lone "58% verified" would hide whether the denominator was 31 or 3.
 */
function CoverageStrip({ coverage }: { coverage: CoverageView }) {
  const cells: [string, number, boolean][] = [
    ['Scanned', coverage.scanned, false],
    ['Eligible', coverage.eligible, false],
    ['Structured', coverage.structured, false],
    ['Verified', coverage.verified, true],
    ['Cited', coverage.cited, false],
  ];
  return (
    <div className="pj-card" style={{ marginBottom: 18, maxWidth: 760 }}>
      <div className="pj-card-h">
        <span className="t">Corpus coverage for this study</span>
        <span className="s">clinical-regulatory-evidence · coverage-service</span>
      </div>
      <div className="pj-card-b">
        <div className="crl-strip">
          {cells.map(([k, n, isVerified]) => (
            <div key={k} className="crl-strip-cell">
              <div className={'crl-strip-n' + (isVerified ? ' is-verified' : '')}>{n}</div>
              <div className="crl-strip-k">{k}</div>
            </div>
          ))}
        </div>
        <div className="crl-note" style={{ marginTop: 10 }}>
          {coverage.exclusionNote ??
            `Denominators are reported, not inferred. ${withDenominator(
              coverage.verified,
              coverage.structured,
            )} structured observations are human-verified; the rest are excluded from every displayed effect estimate.`}
        </div>
      </div>
    </div>
  );
}

/**
 * FDA findings on the selected section, plus the verified outcome and the
 * traceability path.
 *
 * The two rules this panel exists to hold:
 *   · a finding that is not study-level says so and is NOT attributed to the CSR;
 *   · no verified outcome renders as "Not verified" — never as a blank that
 *     reads as "fine", and never as an outcome inferred from trial status.
 */
function RegulatoryPanel({
  findings,
  outcome,
  coverage,
  onAsk,
}: {
  findings: RegulatoryFindingView[];
  outcome: RegulatoryOutcomeView | null;
  coverage: CoverageView | null;
  onAsk: (t: string) => void;
}) {
  return (
    <div className="sp-2col" style={{ gridTemplateColumns: '1.35fr 1fr', marginTop: 20 }}>
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">FDA findings on this study</span>
          <span className="s">
            {findings.length} finding{findings.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="pj-card-b">
          {findings.length === 0 ? (
            <div className="scaf-note">
              No FDA findings are linked to this study in the evidence graph. That is the honest
              state of the corpus, not a clean bill of health — findings appear here only once an
              official letter has been ingested and mapped to this application.
            </div>
          ) : (
            <div className="sp-list">
              {findings.map((f) => (
                <div key={f.findingId} className="crl-row">
                  <span className="crl-row-top">
                    <span className={'rd-chip tone-' + SEVERITY_TONE[f.severity]}>{f.severity}</span>
                    <span className="crl-meta">
                      {f.discipline.replace(/_/g, ' ')} · {f.category}
                    </span>
                    <span className={'rd-chip tone-' + VERIFICATION_TONE[f.verification]}>
                      {VERIFICATION_LABEL[f.verification]}
                    </span>
                  </span>
                  <span className="crl-row-text">{f.finding}</span>
                  {f.source.excerpt && <blockquote className="crl-quote">{f.source.excerpt}</blockquote>}
                  {f.mappings.length > 0 && (
                    <span className="crl-row-foot">
                      {f.mappings.map((m, i) => (
                        <span
                          key={`${m.kind}-${i}`}
                          className={'rd-chip tone-idle' + (m.status === 'inferred' ? ' crl-inferred' : '')}
                        >
                          {m.value} · {m.status === 'explicit' ? 'source-explicit' : 'inferred'}
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="crl-row-foot">
                    <span className="mono crl-meta">
                      {f.source.applicationType} {f.source.applicationNumber}
                      {f.source.page != null ? ` · letter p. ${f.source.page}` : ''}
                    </span>
                    <button
                      type="button"
                      className="sp-go"
                      onClick={() => onAsk(`Trace the evidence behind FDA finding ${f.findingId}.`)}
                    >
                      {I.route}
                    </button>
                  </span>
                  {!isStudyAttributable(f) && (
                    <span className="crl-note">
                      {APPLICABILITY_LABEL[f.applicability]} — not attributed to this clinical study.
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="pj-card" style={{ marginBottom: 14 }}>
          <div className="pj-card-h">
            <span className="t">Regulatory outcome</span>
          </div>
          <div className="pj-card-b">
            {!outcome ? (
              <>
                <div className="tl-spec-grid">
                  <div className="tl-spec-row">
                    <span className="tl-spec-k">Outcome</span>
                    <span className="tl-spec-v crl-outcome-none">Not verified</span>
                  </div>
                </div>
                <div className="crl-note" style={{ marginTop: 10 }}>
                  No verified regulatory outcome is recorded for this application. Trial completion
                  is never read as regulatory success, so nothing is inferred here.
                </div>
              </>
            ) : (
              <>
                <div className="tl-spec-grid">
                  <div className="tl-spec-row">
                    <span className="tl-spec-k">Application</span>
                    <span className="tl-spec-v mono">
                      {outcome.applicationType} {outcome.applicationNumber}
                    </span>
                  </div>
                  <div className="tl-spec-row">
                    <span className="tl-spec-k">Letter date</span>
                    <span className="tl-spec-v mono">{outcome.letterDate ?? 'not recorded'}</span>
                  </div>
                  <div className="tl-spec-row">
                    <span className="tl-spec-k">Outcome</span>
                    <span
                      className={
                        'tl-spec-v' + (outcome.outcome === 'crl' ? ' crl-outcome-crl' : '')
                      }
                    >
                      {OUTCOME_LABEL[outcome.outcome]}
                    </span>
                  </div>
                  <div className="tl-spec-row">
                    <span className="tl-spec-k">Resubmission</span>
                    <span className="tl-spec-v">{outcome.resubmissionState ?? 'Unresolved'}</span>
                  </div>
                  <div className="tl-spec-row">
                    <span className="tl-spec-k">Study link</span>
                    <span className="tl-spec-v">
                      {outcome.studyLink?.nctId
                        ? `${outcome.studyLink.nctId} · ${outcome.studyLink.status}`
                        : 'No linked study'}
                    </span>
                  </div>
                </div>
                <div className="crl-note" style={{ marginTop: 10 }}>
                  Outcome is recorded from the verified letter and resubmission record. Trial
                  completion is never read as regulatory success.
                </div>
              </>
            )}
          </div>
        </div>

        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Traceability path</span>
          </div>
          <div className="pj-card-b">
            <div style={{ fontSize: 12, lineHeight: 1.9, color: 'var(--text-200)' }}>
              Proposed endpoint
              <br />↓ comparable CSR designs · {coverage?.structured ?? 0}
              <br />↓ structured observed effects · {coverage?.verified ?? 0}
              <br />↓ FDA findings · {findings.length}
              <br />↓ applicability and differences
              <br />↓ recommendation
              <br />↓ assumptions, contradictions, sources
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CsrWorkflow({ onAsk }: SurfaceViewProps) {
  // Live ICH E3 CSR build board (GET /api/csr-workflow/board → { success,
  // data: { program, sections, ... } }). Fixture-free (GA real-data standard):
  // the route is org-scoped and honest — a null `program` means the org has no
  // CSR build job yet (the sections still come back as the real ICH E3 catalog,
  // not started), and any unreachable/failed read is an honest error. No
  // CSR_PROGRAM / CSR_SECTIONS stand-in, no "Sample data" pill.
  const boardRes = useLiveData<CsrBoard>('/api/csr-workflow/board');
  const board = boardRes.data;
  const program: CsrProgram | null = board?.program ?? null;
  const sections: CsrSection[] = Array.isArray(board?.sections) ? board!.sections : [];

  /* ── Clinical-Regulatory Intelligence Graph (flag-gated) ──
     Read as a SEPARATE fetch from the CSR board rather than widening the board
     DTO. Two reasons: the board route stays untouched and keeps its own
     contract, and evidence that fails to load degrades the two added columns
     alone instead of taking the whole ICH E3 board down with it. */
  const graphOn = isClinicalRegulatoryGraphEnabled();
  const findingsRes = useLiveData<FindingSearchView>(
    graphOn ? '/api/clinical-regulatory-evidence/findings?limit=25' : null,
  );
  const findings: RegulatoryFindingView[] = findingsRes.data?.findings ?? [];
  const coverage: CoverageView | null = findingsRes.data?.coverage ?? null;

  // Verify the regulatory outcome for the application whose CRL findings are on
  // the board (each finding carries its source application). The card names the
  // exact application it resolves to, so a single pick is never misleading; with
  // no findings there is no application to query and the card stays "Not verified"
  // — never inferred from trial completion (§4.2).
  const primaryApplicationNumber =
    findings.find((f) => f.source?.applicationNumber)?.source.applicationNumber ?? null;
  const outcomeRes = useLiveData<RegulatoryOutcomeView>(
    graphOn && primaryApplicationNumber
      ? `/api/clinical-regulatory-evidence/outcome?applicationNumber=${encodeURIComponent(primaryApplicationNumber)}`
      : null,
  );
  const outcome: RegulatoryOutcomeView | null = outcomeRes.data ?? null;

  /** Findings mapped to an ICH E3 section, for the per-row counts. */
  const findingsBySection = React.useMemo(() => {
    const bySection = new Map<string, RegulatoryFindingView[]>();
    for (const f of findings) {
      // Only study-level findings are attributed to a section. Application-,
      // facility-, CMC- and labeling-level findings are shown in the panel below
      // but deliberately never counted against a CSR section (§6.2).
      if (!isStudyAttributable(f)) continue;
      for (const m of f.mappings) {
        if (m.kind !== 'ich_e3') continue;
        const key = m.value.replace(/^§/, '');
        const list = bySection.get(key) ?? [];
        list.push(f);
        bySection.set(key, list);
      }
    }
    return bySection;
  }, [findings]);

  const cols = graphOn ? CSR_COLS_GRAPH : CSR_COLS_BASE;

  return (
    <div className="page-inner">
      <PageHead
        eyebrow="Project · clinical"
        title="CSR workflow"
        sub={
          boardRes.loading
            ? 'Loading…'
            : program
            ? `${program.title} · ${program.code} · ${program.readiness}% ready`
            : 'ICH E3 · no active CSR build job yet'
        }
        actions={
          <button className="btn primary" onClick={() => onAsk('Draft CSR §11 efficacy evaluation')}>
            {I.sparkles} Draft section
          </button>
        }
      />

      {boardRes.loading ? (
        <div className="scaf-note" style={{ marginTop: 16, maxWidth: 760 }}>
          Loading CSR workflow…
        </div>
      ) : boardRes.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the CSR workflow board"
          hint="This is your organization's live ICH E3 build state — sign in and retry, or check the csr-workflow service is reachable."
        />
      ) : sections.length === 0 ? (
        <EmptyState
          icon={I.layers}
          title="No ICH E3 sections to show"
          hint="The CSR workflow board returned no sections for this organization yet."
        />
      ) : (
        <>
          {!program && (
            <div className="scaf-note" style={{ marginTop: 4, marginBottom: 14, maxWidth: 760 }}>
              No active CSR build job for this organization yet — the ICH E3 section
              board below is the canonical structure, not started. Start a CSR build to
              populate real drafting status and readiness.
            </div>
          )}

          {graphOn && coverage && <CoverageStrip coverage={coverage} />}

          <div className="ctable" style={{ maxWidth: graphOn ? 1100 : 760 }}>
        <div className="ct-head" style={{ gridTemplateColumns: cols }}>
          <div>§</div><div>ICH E3 section</div><div>Status</div>
          {graphOn && <div className="crl-dim-head">Regulatory outcome</div>}
          {graphOn && <div className="crl-dim-head">FDA findings</div>}
          <div></div>
        </div>
        {sections.map((s, i) => {
          const secFindings = findingsBySection.get(String(s.num)) ?? [];
          const byDiscipline = secFindings.reduce<Record<string, number>>((acc, f) => {
            acc[f.discipline] = (acc[f.discipline] ?? 0) + 1;
            return acc;
          }, {});
          return (
            <button
              key={i}
              className="ct-row"
              style={{ gridTemplateColumns: cols }}
              data-blocker={s.blocker || undefined}
              onClick={() => onAsk(`Open CSR §${s.num} in the editor`)}
            >
              <div className="mono" style={{ color: 'var(--accent-200)' }}>{s.num}</div>
              <div className="vn">
                {s.blocker && <span className="esig" style={{ color: 'var(--error)' }}>{I.alertTriangle}</span>}
                <span className="ct-strong">{s.label}</span>
              </div>
              <div><span className={`rd-chip tone-${STATUS_TONE[s.status]}`}>{s.status}</span></div>
              {graphOn && (
                <div>
                  {/* No verified outcome ⇒ "Not verified". Never a blank that
                      reads as fine, never an outcome inferred from status. */}
                  {outcome ? (
                    <span className={outcome.outcome === 'crl' ? 'crl-outcome-crl' : 'crl-outcome-none'}>
                      {OUTCOME_LABEL[outcome.outcome]}
                    </span>
                  ) : (
                    <span className="crl-outcome-none">Not verified</span>
                  )}
                </div>
              )}
              {graphOn && (
                <div className="crl-findcounts">
                  {secFindings.length === 0 ? (
                    <span className="crl-outcome-none">—</span>
                  ) : (
                    Object.entries(byDiscipline).map(([d, n]) => (
                      <span key={d} className="rd-chip tone-warn">
                        {n} {d.replace(/_/g, ' ')}
                      </span>
                    ))
                  )}
                </div>
              )}
              <div style={{ color: 'var(--text-400)' }}>{I.arrowRight}</div>
            </button>
          );
        })}
      </div>

      {graphOn && (
        <RegulatoryPanel
          findings={findings}
          outcome={outcome}
          coverage={coverage}
          onAsk={onAsk}
        />
      )}

          <div className="scaf-note" style={{ marginTop: 16, maxWidth: 760 }}>
            §11 Efficacy evaluation is the gating section — open it in the document editor to draft from the SAP and TLF shells with provenance.
          </div>
        </>
      )}
    </div>
  );
}

/* ════ Regulatory Workspace — generic 3-pane substrate (full: true) ════ */

/** GET /api/regulatory-workspace payload (server regulatory-workspace-routes.ts),
 *  the inner `data` object after the { success, data } envelope is unwrapped. */
interface RwPayload {
  projectId?: number | null;
  projectName?: string | null;
  tree: RwTreeItem[];
  intel: RwIntelItem[];
}

export function RegulatoryWorkspace({ onAsk }: SurfaceViewProps) {
  // Live CTD authoring substrate (GET /api/regulatory-workspace → { success,
  // data: { projectId, projectName, tree, intel } }). Fixture-free (GA real-data
  // standard): the route is org-scoped and returns an honest-empty shape
  // (tree:[] / intel:[]) when the org has no project with tracked CTD sections.
  // No RW_TREE / RW_INTEL stand-in, no "Sample data" pill — real rows, an honest
  // empty state, or an honest error.
  const wsRes = useLiveData<RwPayload>('/api/regulatory-workspace');
  const tree: RwTreeItem[] = Array.isArray(wsRes.data?.tree) ? wsRes.data!.tree : [];
  const intel: RwIntelItem[] = Array.isArray(wsRes.data?.intel) ? wsRes.data!.intel : [];

  // Active section anchors to the first real tree row once it loads; re-anchors
  // if the current selection is no longer present.
  const [active, setActive] = useState<string>('');
  useEffect(() => {
    if (tree.length > 0 && !tree.some((s) => s.id === active)) {
      setActive(tree[0].id);
    }
  }, [tree, active]);

  // Honest states before the three-pane editor: loading, a failed read, or an
  // org with no tracked CTD sections yet — never a fixture tree.
  if (wsRes.loading) {
    return (
      <div className="page-inner">
        <div className="scaf-note" style={{ marginTop: 16, maxWidth: 760 }}>
          Loading regulatory workspace…
        </div>
      </div>
    );
  }
  if (wsRes.error) {
    return (
      <div className="page-inner">
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the regulatory workspace"
          hint="This is your organization's tracked CTD section tree — sign in and retry, or check the regulatory-workspace service is reachable."
        />
      </div>
    );
  }
  if (tree.length === 0) {
    return (
      <div className="page-inner">
        <EmptyState
          icon={I.layers}
          title="No tracked CTD sections yet"
          hint="This organization has no project with tracked CTD authoring sections. Once sections are created and tracked, the three-pane workspace — section tree, canvas and intelligence — populates from real data."
        />
      </div>
    );
  }

  const sec = tree.find((s) => s.id === active) || tree[0];

  return (
    <div className="ed">
      <aside className="ed-tree">
        <div className="ed-tree-h">
          <div className="ed-tree-t">Sections</div>
          <div className="ed-tree-m">
            {wsRes.data?.projectName
              ? `Generic authoring substrate · ${wsRes.data.projectName}`
              : 'Generic authoring substrate'}
          </div>
        </div>
        <div className="ed-tree-scroll">
          <div className="ed-vol">
            {tree.map((s) => (
              <button
                key={s.id}
                className="ed-tree-row"
                data-active={active === s.id || undefined}
                onClick={() => setActive(s.id)}
              >
                <span className="ed-num">{s.num}</span>
                <span className="ed-lbl">{s.label}</span>
                <span className="ed-dot" data-s={s.status} />
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="ed-doc">
        <header className="ed-doc-h">
          <div className="ed-crumbs">
            <span>Regulatory workspace</span>
            <span className="sep">›</span>
            <span className="here">{sec.num} {sec.label}</span>
          </div>
          <button className="btn primary" style={{ height: 30 }} onClick={() => onAsk(`Open ${sec.num} in the document editor`)}>
            {I.penLine} Open in editor
          </button>
        </header>
        <div className="ed-doc-scroll">
          <div className="ed-doc-inner">
            <div className="ed-mast">
              <div className="ed-mast-num">§{sec.num}</div>
              <h1 className="ed-mast-t">{sec.label}</h1>
              <div className="ed-mast-meta">Canvas · tree · intelligence — the substrate documents and editors specialize.</div>
            </div>
            <p className="ed-p" style={{ color: 'var(--text-300)' }}>
              This is the canonical three-pane workspace: the section tree (left), the editable canvas (here), and the intelligence panel (right). Document authoring, 510(k) and CSR all specialize this same shell — selecting a section routes into the full editor with provenance, flags and comments.
            </p>
            <div className="ed-foot">
              <button className="btn ghost" onClick={() => onAsk('Draft this section')}>
                {I.sparkles} Draft with AnA
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside className="ed-comments">
        <div className="ed-comments-h">Intelligence</div>
        {intel.map((x, i) => (
          <div key={i} className="gate-cell" style={{ alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div className="gate-k">{x.k}</div>
              <div className="gate-v" style={{ fontSize: 12 }}>{x.v}</div>
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}

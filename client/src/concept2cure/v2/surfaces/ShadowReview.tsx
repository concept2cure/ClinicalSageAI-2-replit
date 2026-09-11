import React, { useEffect, useState, useMemo } from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import { PedigreeBadge } from '../intelligence/Intelligence';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../surfaceActions';
import '../styles/project-home-v2.css';
import {
  SHADOW_LENSES, shadowLens, SR_SEV, SR_DIM,
} from '../fixtures/shadow-review-data';
import type { SeverityMeta } from '../fixtures/shadow-review-data';

/* -- Helpers --

   A gate score is `number | null`: the score the run RECORDED, or null when it
   recorded none. Null is the third state — not zero, not "low risk" — so every
   helper below takes the null and every caller has to answer for it. */
type GateScore = number | null;

function riskBand(v: GateScore): string { return v === null ? 'unscored' : v >= 0.66 ? 'high' : v >= 0.33 ? 'med' : 'low'; }
function riskWord(v: GateScore): string { return v === null ? 'not scored' : v >= 0.66 ? 'high risk' : v >= 0.33 ? 'moderate risk' : 'low risk'; }
function riskPct(v: GateScore): string { return v === null ? 'not scored' : Math.round(v * 100) + '%'; }

/* Live read row: one reviewer lens, the gate scores its latest COMPLETE run
   recorded, and that run's findings — exactly what GET /api/shadow-review
   returns (shadow-review-view-assembler). detail/basis/recommendation/leafRef
   are nullable columns — rendered null-safe, never fabricated. dimension and
   severity are free text off the wire (the store does not narrow them to the
   display unions).

   WO-16C finding 99: rtfRiskScore/crlRiskScore are read here rather than
   recomputed from `findings`. The recompute (a verbatim client copy of the
   service's `aggregateRisk`) returned 0 for a gate with no findings in its
   dimensions, but on the server that 0 is only a floor — runShadowReview
   persists max(model self-report, aggregate). The card therefore showed "0%
   low risk" for runs whose recorded score was far higher and which
   SubmissionCenter printed at that higher value. They are nullable: a run that
   recorded no score for a gate renders the third state, never 0%. */
interface ShadowFindingRow {
  dimension: string;
  severity: string;
  title: string;
  detail: string | null;
  basis: string | null;
  recommendation: string | null;
  leafRef: string | null;
}
interface ShadowLensRow {
  lens: string;
  runId?: number | null;
  rtfRiskScore?: number | null;
  crlRiskScore?: number | null;
  findings: ShadowFindingRow[];
}

/* ================================================================
   ShadowReview -- AnA simulates the reviewer who will read your
   submission BEFORE you file. Scores the two gates that actually
   kill a filing (RTF / CRL) and hands you the fix list.
   Registers as SURFACE_VIEWS['shadow-review'] (full: true).
   ================================================================ */

export function ShadowReview({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  const lenses = SHADOW_LENSES;

  const [lensId, setLensId] = useState('fda_filing');
  const lens = shadowLens(lensId);

  /* Real, org-scoped simulated-reviewer worklist. GET /api/shadow-review
     returns one row per reviewer lens that has been run — { lens, findings[] }
     — assembled from the real shadow-review store (shadow_review_runs +
     shadow_review_findings, the tables runShadowReview persists). No fixture
     fallback: real rows, an honest empty, or an honest error. */
  const live = useLiveRows<ShadowLensRow>('/api/shadow-review');

  /* AnA can switch reviewer lens — the same click a person makes. Switching TO
     a lens that has not been run is itself the honest, intended behaviour (the
     surface's whole point is distinguishing "not run" from "run, zero
     findings"), so the handler does not require the target lens to have a row;
     it only refuses while the worklist read itself is not ready. */
  useSurfaceActionHandlers('shadow-review', {
    'shadow-review.select-lens': (params) => {
      const raw = String(params.lens ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a reviewer lens by its id or label.' };
      if (live.loading) return { ok: false, reason: 'The shadow-review worklist is still loading.', retry: true };
      if (live.error) return { ok: false, reason: 'The shadow-review store did not load, so there is no worklist to switch lenses on.' };
      const needle = raw.toLowerCase();
      const byId = lenses.filter((l) => l.id.toLowerCase() === needle);
      const hits = byId.length ? byId : lenses.filter((l) => l.label.toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No reviewer lens matching "${raw}".` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} lenses — name one exactly.` };
      const l = hits[0];
      if (lensId === l.id) return { ok: true, detail: `Already on the ${l.label} lens` };
      setLensId(l.id);
      return { ok: true, detail: `Switched to the ${l.label} lens` };
    },
  });
  useEffect(() => {
    if (!live.loading && !live.error) notifySurfaceActionReady('shadow-review');
  }, [live.loading, live.error]);

  const rowByLens = useMemo(() => {
    const map: Record<string, ShadowLensRow> = {};
    for (const r of live.rows) {
      if (r && r.lens && Array.isArray(r.findings)) map[r.lens] = r;
    }
    return map;
  }, [live.rows]);

  // Distinguish "this lens was run (row present, possibly zero findings)" from
  // "this lens has not been run" — an honest empty beats a fabricated clean pass.
  const lensRan = Object.prototype.hasOwnProperty.call(rowByLens, lensId);

  const findings = useMemo(() => {
    const f = rowByLens[lensId]?.findings || [];
    // Severity is free text off the wire; rank unknowns last so a bad value
    // never throws on the sort.
    return f.slice().sort((a, b) => (SR_SEV[a.severity]?.rank ?? 99) - (SR_SEV[b.severity]?.rank ?? 99));
  }, [lensId, rowByLens]);

  /* The gate scores the RUN recorded — read, never re-derived. A score off the
     wire that is absent or not a finite number is null (the third state), not
     zero: 0% is a verdict, and only the run may issue it. */
  const gateScore = (v: unknown): GateScore =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null;
  const rtf: GateScore = lensRan ? gateScore(rowByLens[lensId]?.rtfRiskScore) : null;
  const crl: GateScore = lensRan ? gateScore(rowByLens[lensId]?.crlRiskScore) : null;
  const runId = lensRan ? rowByLens[lensId]?.runId ?? null : null;
  const scored = rtf !== null || crl !== null;
  const criticals = findings.filter((f) => f.severity === 'critical').length;
  const majors = findings.filter((f) => f.severity === 'major').length;

  /* What AnA can see of this screen.
     `lensRan` is the fact that carries this surface. A lens with no row has NOT
     been run; a lens with a row and zero findings passed. Both draw an empty
     finding list, and telling AnA "no findings" for the first would have her
     report a clean reviewer verdict on a review that never happened — on the
     surface whose whole purpose is predicting an RTF or CRL before filing. So
     the two are published as different states, and the risk scores are withheld
     entirely for a lens that has not run. */
  const anaContext = useMemo(() => {
    if (live.loading) {
      return { summary: 'The shadow-review worklist is still loading; nothing on screen is final yet.' };
    }
    if (live.error) {
      return {
        summary:
          'The shadow-review store could not be read, so this screen is showing no reviewer findings ' +
          'because of a failure. That is NOT a clean review and must not be reported as one.',
        availableActions: ['Retry the shadow-review read'],
      };
    }
    const lensLabel = lens?.label ?? lensId;
    if (!lensRan) {
      return {
        summary:
          `Shadow review: the "${lensLabel}" reviewer lens has NOT been run against this submission, so ` +
          'there are no findings and no RTF or CRL risk score on screen. This is an absence of review, ' +
          'not a clean result.',
        facts: {
          selectedLens: lensId,
          lensHasRun: false,
          lensesRun: Object.keys(rowByLens),
        },
        availableActions: ['Run the selected reviewer lens', 'Switch to a lens that has already been run'],
      };
    }
    return {
      summary:
        `Shadow review under the "${lensLabel}" reviewer lens: ${findings.length} finding(s) — ` +
        `${criticals} critical, ${majors} major. ` +
        (scored
          ? `Refuse-to-file risk ${riskPct(rtf)}, complete-response risk ${riskPct(crl)} — the 0-1 scores this ` +
            'run itself recorded, NOT a count of the findings on screen.'
          : 'This run recorded no gate score, so there is no refuse-to-file or complete-response risk on ' +
            'screen. That is a missing score, not a score of zero, and must not be reported as a clean gate.'),
      facts: {
        selectedLens: lensId,
        lensHasRun: true,
        lensesRun: Object.keys(rowByLens),
        runId: rowByLens[lensId]?.runId ?? null,
        findingCount: findings.length,
        criticalFindings: criticals,
        majorFindings: majors,
        // null = the run recorded no score for this gate. Never report it as 0.
        refuseToFileRisk: rtf,
        completeResponseRisk: crl,
        gateScoresRecorded: scored,
        gateScoreSource: scored
          ? 'shadow_review_runs.rtf_risk_score / crl_risk_score — the score this run recorded'
          : 'none recorded by this run',
        findings: findings.slice(0, 12).map((f) => ({
          dimension: f.dimension, severity: f.severity, title: f.title,
          detail: f.detail, basis: f.basis, recommendation: f.recommendation, leafRef: f.leafRef,
        })),
      },
      availableActions: [
        'Switch reviewer lens',
        'Open a finding to read its basis and the recommended fix',
        'Re-run the lens after addressing findings',
      ],
    };
  }, [live.loading, live.error, lens, lensId, lensRan, rowByLens, findings, criticals, majors, rtf, crl, scored]);
  usePublishSurfaceContext('shadow-review', anaContext);

  /* AnA's answer-first verdict -- reviewer voice, honest, one clear next step.
     Speaks to the connected submission; no fabricated sequence identity (the
     read contract does not return one). */
  const worst = (rtf ?? -1) >= (crl ?? -1) ? 'rtf' : 'crl';
  /* An elevated RECORDED score with no blocking finding is not a clean review —
     the run's own score is the verdict, and the reviewer model may score a gate
     high (an empty leaf set, say) while raising no individual finding. */
  const elevated = (rtf ?? 0) >= 0.33 || (crl ?? 0) >= 0.33;
  const lead = criticals > 0
    ? {
        tone: 'urgent' as const,
        h: <>{criticals} finding{criticals > 1 ? 's' : ''} would <b>stop your {lens.agency} filing at the {worst === 'rtf' ? lens.gates.rtf : lens.gates.crl}</b>. I ran the {lens.label} over your submission and this is what they would raise first.</>,
        b: <>A single critical saturates the gate — fix these before you dispatch. Everything a reviewer flags here is cheaper to close now than in a {lens.gates.crl}.</>,
      }
    : majors > 0
      ? {
          tone: 'calm' as const,
          h: <>Your submission is <b>fileable, with {majors} substantive point{majors > 1 ? 's' : ''}</b> a {lens.agency} reviewer would raise. RTF risk {riskPct(rtf)}, {lens.gates.crl.split(' ')[0]} risk {riskPct(crl)}.</>,
          b: <>None are filing-blockers, but each is a likely question in the review cycle. Address them in the dossier now and you shorten the back-and-forth after you file.</>,
        }
      : {
          tone: (!scored || elevated ? 'calm' : 'good') as 'calm' | 'good',
          h: <>The {lens.label} recorded no blocking findings on your connected sequence. RTF risk {riskPct(rtf)}, {lens.gates.crl.split(' ')[0]} risk {riskPct(crl)}.</>,
          b: !scored
            ? <>This run recorded no score for either gate, so nothing here clears them. An absent score is not a low one — re-run this reviewer to get a scored result before you treat the sequence as fileable.</>
            : elevated
              ? <>The reviewer raised no critical or major finding, but this run still recorded an elevated gate risk. That score is the run's own verdict, not a count of the list below — treat the gate as open, not clear.</>
              : <>This is a clean simulated review. It is not a guarantee — but a reviewer opening this sequence would not hit an administrative or substantive wall.</>,
        };

  const showResults = !live.loading && !live.error && !live.empty && lensRan;

  return (
    <div className="sr">
      <div className="sr-head">
        <div className="sr-eyebrow">
          <span className="sr-kicker">AnA — shadow review — simulated {lens.agency} reviewer</span>
        </div>
        <h1 className="sr-title">What would a reviewer flag before you file?</h1>
        <div className="sr-sub">Agencies run AI on their side of the desk — this runs the reviewer's lens on yours, before they do.</div>
      </div>

      {/* Lens selector -- the 5 real reviewer lenses (canonical catalog) */}
      <div className="sr-lenses">
        {lenses.map((l) => (
          <button key={l.id} className={'sr-lens' + (l.id === lensId ? ' on' : '')} onClick={() => setLensId(l.id)}>
            <span className="sr-lens-agency">{l.agency}</span>
            <span className="sr-lens-label">{l.label}</span>
          </button>
        ))}
      </div>

      {/* Answer-first lead -- AnA reporting the review (only with real findings) */}
      {showResults && (
        <div className={'sr-lead tone-' + lead.tone}>
          <div className="sr-lead-ic">{I.eye || I.shieldCheck}</div>
          <div>
            <p className="sr-lead-h">{lead.h}</p>
            <p className="sr-lead-b">{lead.b}</p>
            <p className="sr-lead-basis">{lens.blurb}</p>
          </div>
        </div>
      )}

      <div className="sr-body">
        {/* Four-state body: loading -> error -> empty -> real */}
        {live.loading ? (
          <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading the simulated-reviewer worklist…</div>
        ) : live.error ? (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load the shadow review"
            hint="The simulated-reviewer worklist didn't respond. These are your organization's shadow-review findings — sign in and retry, or check the service is reachable."
          />
        ) : live.empty ? (
          <EmptyState
            icon={I.eye || I.fileText}
            title="No shadow review has been run yet"
            hint={<>Connect an assembled sequence and run a simulated reviewer to see what an {lens.agency} reviewer would flag before you file.</>}
          />
        ) : !lensRan ? (
          <EmptyState
            icon={I.eye || I.fileText}
            title={`The ${lens.label} hasn't been run yet`}
            hint="Another reviewer lens has findings for your organization, but this one hasn't been run on a connected sequence. Switch lenses above, or run this reviewer to populate it."
          />
        ) : (
          <>
            {/* The two gates that kill a filing */}
            <div className="sr-gates">
              {([
                { k: 'rtf', v: rtf, name: lens.gates.rtf, sub: 'Administrative gate — will they accept the filing?' },
                { k: 'crl', v: crl, name: lens.gates.crl, sub: 'Substantive gate — will they approve after review?' },
              ] as const).map((g) => (
                <div key={g.k} className={'sr-gate band-' + riskBand(g.v)}>
                  <div className="sr-gate-top">
                    <span className="sr-gate-name">{g.name}</span>
                    {/* A gate the run did not score shows no percentage and no
                        fill: an unrecorded score is not a score of zero. */}
                    <span className="sr-gate-pct">{g.v === null ? '—' : Math.round(g.v * 100) + '%'}</span>
                  </div>
                  <div className="sr-gate-track">
                    {g.v !== null && <div className="sr-gate-fill" style={{ width: Math.round(g.v * 100) + '%' }} />}
                  </div>
                  <div className="sr-gate-word">{riskWord(g.v)}</div>
                  <div className="sr-gate-sub">{g.sub}</div>
                  {g.v === null && (
                    <div className="sr-gate-sub">
                      This run recorded no score for this gate{runId ? ` (run #${runId})` : ''}, so none is shown. Re-run the reviewer to score it.
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* The findings -- the reviewer's list */}
            <div className="sr-findings">
              <div className="sr-findings-hd">
                <span className="sr-findings-t">{findings.length} finding{findings.length === 1 ? '' : 's'}</span>
                <span className="sr-findings-s">critical to info — what the reviewer raises, and how to close it</span>
              </div>
              {findings.map((f, i) => {
                const sev: SeverityMeta = SR_SEV[f.severity] || SR_SEV.info;
                return (
                  <div key={i} className={'sr-finding tone-' + sev.tone}>
                    <div className="sr-finding-top">
                      <span className={'sr-sev tone-' + sev.tone}>{sev.label}</span>
                      <span className="sr-dim">{SR_DIM[f.dimension] || f.dimension}</span>
                      <span className="sr-finding-title">{f.title}</span>
                      {f.leafRef && f.leafRef !== '—' && <span className="mono sr-leaf">{f.leafRef}</span>}
                    </div>
                    {f.detail && <div className="sr-finding-detail">{f.detail}</div>}
                    <div className="sr-finding-foot">
                      {f.basis && <span className="sr-basis"><b>Basis</b> {f.basis}</span>}
                      {f.recommendation && (
                        <button className="sr-fix" onClick={() => ask('Fix the shadow-review finding "' + f.title + '" (' + (SR_DIM[f.dimension] || f.dimension) + ', ' + sev.label + ') in §' + (f.leafRef || 'the dossier') + ': ' + f.recommendation)}>
                          {I.sparkles} {f.recommendation}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {!findings.length && <div className="sr-empty">No findings for this lens.</div>}
            </div>
          </>
        )}

        <div className="sr-foot">
          <PedigreeBadge level="model_assisted" />
          <PedigreeBadge level="deterministic_registry" />
          <span className="sr-foot-note">Findings are model-assisted — produced by the platform’s governed regulatory-review model, not by a human reviewer. The RTF/CRL percentages are the scores the run itself recorded: the reviewer model’s own gate risk, floored by a deterministic aggregation over its findings (a single critical saturates the gate). A gate the run did not score shows “not scored”, never 0%. Connect a sequence to run the live reviewer against it.</span>
          <div className="sr-actions">
            {/* FLAG (mock action): asks AnA to run the reviewer rather than calling
                POST /sequences/:seqId/shadow-review directly — the real endpoint
                exists; wire in the actions pass, do not half-wire here. */}
            <button className="sr-run" onClick={() => ask('Re-run the ' + lens.label + ' shadow review on the connected sequence and update the RTF/CRL risk.')}>
              {I.refresh || I.play} Re-run this reviewer
            </button>
            <button className="sr-run alt" onClick={() => onNav('ectd-coauthor')}>
              Open the sequence in eCTD co-author
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

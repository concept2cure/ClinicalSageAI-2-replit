/**
 * FDA CRL library (registry id `crl-library`) — the one new surface in the
 * Clinical-Regulatory Intelligence Graph workstream.
 *
 * A SEARCHABLE VIEW OVER THE SHARED EVIDENCE GRAPH. Not a separate corpus, not a
 * separate retrieval path, not a separate agent — the same findings the CSR
 * workflow, study design and AnA read, reached through the same facade. If this
 * surface ever grows its own backend, the convergence this workstream exists to
 * achieve has been lost.
 *
 * Modelled on PrecedentEngine.tsx: `sp-head` + eyebrow naming the route, a
 * filter card whose query commits on Search, the coverage row, then a
 * `1.15fr 1fr` list + detail split.
 *
 * ── The honesty rules this surface renders ─────────────────────────────────
 *
 * These are work-order requirements made visible. An implementation that drops
 * one is wrong even when it looks right:
 *
 *   · Counts carry denominators — "18 of 31", never a bare percentage.
 *   · Explicit and inferred mappings render differently and come from different
 *     columns. An inferred mapping is never shown as FDA's own words.
 *   · Verification state is visible per finding, all seven states.
 *   · Contradictory evidence is retrieved and shown separately, never averaged.
 *   · Application-, facility-, CMC- and labeling-level findings are NOT
 *     attributed to a clinical study, and say so.
 *   · A finding with an unresolved extraction conflict is flagged and excluded
 *     from retrieval until a human resolves it.
 *   · Four honest states — loading, error, empty corpus, results. No fixture.
 *
 * The AnA rail stays open here: `crl-library` is registered without
 * `ownsConversation`, which keeps it on the SurfaceView union's plain arm — the
 * one whose `component` is `ComponentType<SurfaceViewProps>` — so this surface
 * is handed the shell's `onAsk` and the shell draws the rail that answers it.
 * The point of looking at a letter is being able to ask about it.
 */
import React, { useEffect, useMemo, useState } from 'react';

import { I } from '../icons';
import { EmptyState, useLiveData } from '../dataConnect';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../surfaceActions';
import type { SurfaceViewProps } from '../surfaceViews';
import { AnswerLead } from '../AnswerLead';
import {
  APPLICABILITY_LABEL,
  SEVERITY_TONE,
  VERIFICATION_LABEL,
  VERIFICATION_TONE,
  isStudyAttributable,
  withDenominator,
  type FindingSearchView,
  type MappingView,
  type RegulatoryFindingView,
} from '../fixtures/clinical-regulatory-evidence';
import { usePublishSurfaceContext } from '../surfaceContext';
import '../styles/project-home-v2.css';

interface CrlQuery {
  applicationType: string;
  text: string;
  discipline: string;
  ctdSection: string;
  verification: string;
}

const EMPTY_QUERY: CrlQuery = {
  applicationType: '',
  text: '',
  discipline: '',
  ctdSection: '',
  verification: '',
};

const APPLICATION_TYPES = ['', 'NDA', 'BLA', 'ANDA', '510(k)', 'PMA', 'De Novo'];
const DISCIPLINES: [string, string][] = [
  ['', 'Any discipline'],
  ['clinical', 'Clinical'],
  ['statistical', 'Statistical'],
  ['safety', 'Safety'],
  ['clinical_pharmacology', 'Clinical pharmacology'],
  ['cmc', 'CMC'],
  ['microbiology', 'Microbiology'],
  ['device', 'Device'],
  ['labeling', 'Labeling'],
  ['facility', 'Facility / inspection'],
  ['administrative', 'Administrative'],
];
const VERIFICATIONS: [string, string][] = [
  ['', 'Any verification state'],
  ['source_verified', 'Verified only'],
  ['extracted_unreviewed', 'Extracted, not reviewed'],
  ['inferred_mapping', 'Inferred mapping'],
  ['potential_study_link', 'Potential study link'],
  ['stale_recalculate', 'Stale — recalculate'],
];

/** Build the §8.1 constraint query string. Blank filters are omitted, not sent empty. */
function buildPath(q: CrlQuery): string {
  const p = new URLSearchParams();
  if (q.applicationType) p.set('applicationType', q.applicationType);
  if (q.text.trim()) p.set('text', q.text.trim());
  if (q.discipline) p.set('discipline', q.discipline);
  if (q.ctdSection.trim()) p.set('ctdSection', q.ctdSection.trim());
  if (q.verification) p.set('verification', q.verification);
  const qs = p.toString();
  return '/api/clinical-regulatory-evidence/findings' + (qs ? '?' + qs : '');
}

/**
 * A mapping chip. Explicit renders solid and states it is source-explicit;
 * inferred renders dim and italic and says "inferred". The two are visually
 * non-interchangeable on purpose — this is the §7.2 rule in pixels.
 */
function MappingChip({ m }: { m: MappingView }) {
  const kind =
    m.kind === 'ctd'
      ? 'CTD'
      : m.kind === 'ich_e3'
        ? 'ICH E3'
        : m.kind === 'design_node'
          ? 'Design node'
          : 'Deficiency';
  return (
    <span
      className={'rd-chip ' + (m.status === 'explicit' ? 'tone-idle' : 'tone-idle crl-inferred')}
      title={
        m.status === 'explicit'
          ? 'Stated explicitly in the source document'
          : 'Inferred by semantic mapping — FDA did not state this explicitly'
      }
    >
      {kind} {m.value} · {m.status === 'explicit' ? 'source-explicit' : 'inferred'}
    </span>
  );
}

/** One row in the findings list. */
function FindingRow({
  f,
  selected,
  onSelect,
}: {
  f: RegulatoryFindingView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className="sp-row crl-row"
      data-selected={selected || undefined}
      onClick={onSelect}
      type="button"
    >
      <span className="crl-row-top">
        <span className="mono crl-app">
          {f.source.applicationType} {f.source.applicationNumber}
        </span>
        <span className="crl-meta">
          {f.source.letterDate ?? 'undated'} · {f.discipline.replace(/_/g, ' ')}
        </span>
        <span className={'rd-chip tone-' + SEVERITY_TONE[f.severity]}>{f.severity}</span>
      </span>
      <span className="crl-row-text">{f.finding}</span>
      <span className="crl-row-foot">
        <span className={'rd-chip tone-' + VERIFICATION_TONE[f.verification]}>
          {VERIFICATION_LABEL[f.verification]}
        </span>
        {!isStudyAttributable(f) && (
          <span className="crl-note">
            {APPLICABILITY_LABEL[f.applicability]} — not attributed to any clinical study.
          </span>
        )}
        {f.conflict && (
          <span className="rd-chip tone-err" title="Deterministic parse and model extraction disagree">
            Extraction conflict
          </span>
        )}
      </span>
    </button>
  );
}

/** The detail pane: excerpt, locator, requested action, mappings, ingestion + audit. */
function FindingDetail({ f }: { f: RegulatoryFindingView }) {
  return (
    <>
      <div className="pj-card" style={{ marginBottom: 14 }}>
        <div className="pj-card-h">
          <span className="t mono crl-app">
            {f.source.applicationType} {f.source.applicationNumber}
          </span>
          {f.source.officialUrl ? (
            <a
              className="pj-card-h-go"
              href={f.source.officialUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              Open source {I.externalLink}
            </a>
          ) : (
            <span className="crl-note">No official URL recorded for this source</span>
          )}
        </div>
        <div className="pj-card-b">
          {/* Verbatim excerpt only. A paraphrase attributed to a regulator would
              be a fabrication, so a missing span says so rather than filling in. */}
          {f.source.excerpt ? (
            <blockquote className="crl-quote">{f.source.excerpt}</blockquote>
          ) : (
            <div className="scaf-note">
              No verbatim excerpt could be extracted for this finding. The finding text above is
              the extracted summary — open the official source to read the passage.
            </div>
          )}

          <div className="tl-spec-grid">
            <div className="tl-spec-row">
              <span className="tl-spec-k">Source location</span>
              <span className="tl-spec-v mono">
                {f.source.page != null ? `p. ${f.source.page}` : 'page not recorded'}
                {f.source.locator ? ` · ${f.source.locator}` : ''}
              </span>
            </div>
            <div className="tl-spec-row">
              <span className="tl-spec-k">Requested action</span>
              <span className="tl-spec-v">{f.requestedAction ?? 'None stated in the letter'}</span>
            </div>
            <div className="tl-spec-row">
              <span className="tl-spec-k">Applicability</span>
              <span className="tl-spec-v">{APPLICABILITY_LABEL[f.applicability]}</span>
            </div>
            <div className="tl-spec-row">
              <span className="tl-spec-k">Epistemic status</span>
              <span className="tl-spec-v">
                {f.epistemicStatus === 'explicit' ? 'Explicit' : 'Inferred'}
              </span>
            </div>
            <div className="tl-spec-row">
              <span className="tl-spec-k">Human review</span>
              <span className="tl-spec-v">
                {f.reviewedAt ? `Verified ${f.reviewedAt}` : VERIFICATION_LABEL[f.verification]}
              </span>
            </div>
          </div>

          {f.mappings.length > 0 && (
            <div className="crl-chips">
              {f.mappings.map((m, i) => (
                <MappingChip key={`${m.kind}-${m.value}-${i}`} m={m} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Ingestion &amp; audit</span>
        </div>
        <div className="pj-card-b">
          <div className="tl-spec-grid">
            <div className="tl-spec-row">
              <span className="tl-spec-k">Checksum</span>
              <span className="tl-spec-v mono">{f.source.checksum ?? 'not recorded'}</span>
            </div>
            <div className="tl-spec-row">
              <span className="tl-spec-k">Version</span>
              <span className="tl-spec-v mono">
                {f.source.version != null ? `v${f.source.version}` : 'not recorded'}
              </span>
            </div>
          </div>
          {f.conflict && (
            <div className="scaf-note crl-conflict">
              The deterministic parse and the model extraction disagree on this finding. It is
              flagged for review and excluded from retrieval, indexing and export until resolved.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function CrlLibrary({ onAsk }: SurfaceViewProps) {
  const [q, setQ] = useState<CrlQuery>(EMPTY_QUERY);
  /** Committed on Search — editing the form does not refetch. */
  const [applied, setApplied] = useState<CrlQuery>(EMPTY_QUERY);
  const [selId, setSelId] = useState<string | null>(null);

  const path = useMemo(() => buildPath(applied), [applied]);
  const res = useLiveData<FindingSearchView>(path);

  const findings = res.data?.findings ?? [];
  const coverage = res.data?.coverage ?? null;
  const insufficient = res.data?.insufficientEvidence;
  const sel = findings.find((f) => f.findingId === selId) ?? findings[0] ?? null;

  /* AnA can open any deficiency finding by its id — the same row click a person
     makes — so a drive can land on a specific finding's detail. Resolved against
     the REAL search results with honest misses; held (retry) while the search
     loads, re-attempted on the ready signal below. */
  useSurfaceActionHandlers('crl-library', {
    'crl-library.select-finding': (params) => {
      const raw = String(params.finding ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a finding by its id.' };
      // Gate on res.loading/res.error alone: during a refetch useLiveData keeps
      // the PRIOR query's `findings`, so resolving then would select against
      // stale results. Held (retry) re-attempts on the ready signal once the new
      // search lands.
      if (res.loading) {
        return { ok: false, reason: 'The CRL findings are still loading.', retry: true };
      }
      if (res.error) {
        return { ok: false, reason: 'The CRL search did not respond, so there are no findings to open.' };
      }
      if (findings.length === 0) return { ok: false, reason: 'No findings in these results to open.' };
      const needle = raw.toLowerCase();
      const exact = findings.filter((f) => f.findingId.toLowerCase() === needle);
      const hits = exact.length ? exact : findings.filter((f) => f.findingId.toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No finding matching "${raw}" in these results.` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} findings — name one exactly.` };
      const f = hits[0];
      if (selId === f.findingId) return { ok: true, detail: `Already on ${f.findingId}` };
      setSelId(f.findingId);
      return { ok: true, detail: `Opened ${f.findingId}` };
    },
  });
  useEffect(() => {
    if (!res.loading && !res.error) notifySurfaceActionReady('crl-library');
  }, [res.loading, res.error]);

  const set = <K extends keyof CrlQuery>(k: K, v: CrlQuery[K]) => setQ({ ...q, [k]: v });

  /* What AnA can see of this screen.
     Published BEFORE the loading/error early returns below, because a hook that
     only runs on the success path is a hook that goes silent exactly when the
     user most needs to ask what happened — and React would refuse the
     conditional call anyway.

     A FAILED read publishes the failure. `findings` is [] both when the corpus
     genuinely has nothing for these constraints and when the evidence graph did
     not answer, and "no findings match" over an outage is a claim about the
     regulatory record that no one made. The verification state travels with
     every finding for the same reason it is on screen: an extracted, unreviewed
     finding must not be quoted back as established fact. */
  const anaContext = useMemo(() => {
    // Gate on res.loading / res.error ALONE, not `&& !res.data`: useLiveData
    // KEEPS the previous query's data while a new fetch is in flight, and this
    // surface rebuilds `path` from `applied` on every Search — so during a
    // refetch `res.data` is the PRIOR query's payload while `filters` below is
    // the NEW query. Falling through would publish the old counts as though they
    // answered the new filters (and a prior genuine zero as a false "no findings
    // for these constraints"). A search in progress is not an answer.
    if (res.loading) {
      return { summary: 'The regulatory evidence graph is still being searched; nothing on screen is final yet.' };
    }
    if (res.error) {
      return {
        summary:
          'The regulatory evidence graph could not be reached, so this screen is showing no findings ' +
          'because of a failure, not because the corpus has none for these constraints.',
        availableActions: ['Retry the search once the evidence service responds'],
      };
    }
    const filters = Object.entries(applied).filter(([, v]) => v);
    return {
      summary:
        `FDA CRL library: ${findings.length} regulatory finding(s) match` +
        (filters.length
          ? ` the filters ${filters.map(([k, v]) => `${k}="${v}"`).join(', ')}`
          : ' with no filters applied') +
        (coverage ? `, drawn from ${coverage.eligible} of ${coverage.scanned} letters scanned` : '') +
        (sel ? `. "${sel.findingId}" is open in the detail pane` : '') +
        (insufficient ? `. The corpus reports insufficient evidence: ${insufficient.reason}` : ''),
      facts: {
        matchedFindings: findings.length,
        appliedFilters: Object.fromEntries(filters),
        coverage: coverage ? { eligible: coverage.eligible, scanned: coverage.scanned } : null,
        insufficientEvidence: insufficient
          ? { reason: insufficient.reason, usable: insufficient.usable, total: insufficient.total }
          : null,
        // Enough to name a finding back to the user, not the whole result set.
        findings: findings.slice(0, 10).map((f) => ({
          findingId: f.findingId, severity: f.severity, discipline: f.discipline,
          category: f.category, verification: f.verification, conflict: f.conflict,
          applicability: f.applicability, epistemicStatus: f.epistemicStatus,
        })),
        selected: sel
          ? {
              findingId: sel.findingId, severity: sel.severity, discipline: sel.discipline,
              category: sel.category, finding: sel.finding, requestedAction: sel.requestedAction,
              verification: sel.verification, conflict: sel.conflict,
              reviewedAt: sel.reviewedAt,
              mappedTo: (sel.mappings ?? []).map((m) => ({ kind: m.kind, value: m.value, status: m.status })),
            }
          : null,
      },
      availableActions: [
        'Search the corpus by application type, free text, discipline, CTD section or verification state',
        'Open a finding to read its requested action, mappings and source reference',
        'Clear the filters and search the whole corpus',
      ],
    };
  }, [res.loading, res.error, res.data, findings, coverage, insufficient, sel, applied]);
  usePublishSurfaceContext('crl-library', anaContext);

  /* ── Loading and error: two of the four honest states ── */
  if (res.loading && !res.data) {
    return (
      <div className="sp" style={{ maxWidth: 1160 }}>
        <div style={{ padding: 24 }}>
          <EmptyState title="Searching the regulatory evidence graph…" icon={I.clock} />
        </div>
      </div>
    );
  }
  if (res.error && !res.data) {
    return (
      <div className="sp" style={{ maxWidth: 1160 }}>
        <div style={{ padding: 24 }}>
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't reach the regulatory evidence graph"
            hint="The shared evidence service didn't respond. Findings are read live from the
                  official-source corpus — sign in and retry. Nothing is shown from a cached sample."
          />
        </div>
      </div>
    );
  }

  const hasResults = findings.length > 0;

  return (
    <div className="sp" style={{ maxWidth: 1160 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Specialist — clinical & regulatory evidence</div>
          <h1 className="sp-title">FDA CRL library</h1>
          <p className="sp-state">
            Search official complete response letters by finding, discipline, category, CTD or ICH
            E3 mapping, and verification status. This is a view over the shared evidence graph — the
            same findings the CSR workflow, study design and AnA read. There is no separate CRL
            corpus, retrieval path or agent.
          </p>
        </div>
      </div>

      <AnswerLead
        tone={hasResults ? 'calm' : 'good'}
        eyebrow="What the corpus can tell you"
        headline={
          hasResults ? (
            <>
              {findings.length} finding{findings.length === 1 ? '' : 's'} match these constraints
              {coverage ? (
                <>
                  {' '}
                  — drawn from {withDenominator(coverage.eligible, coverage.scanned)} letters
                  eligible on these filters
                </>
              ) : null}
              .
            </>
          ) : (
            <>No regulatory findings are available for these constraints yet.</>
          )
        }
        body={
          hasResults ? (
            <>
              Findings are ranked only <b>after</b> every metadata constraint is applied, so
              similarity never widens the set. Supportive and contradictory evidence are retrieved
              separately — nothing here is averaged into a single score.
            </>
          ) : (
            <>
              Historical FDA precedent is only as good as what has been ingested and verified. When
              the corpus has nothing that matches, that is the answer — no estimate is produced from
              an empty set.
            </>
          )
        }
        reassure="Every displayed finding resolves to an official source and page. Anything inferred is labelled as inferred."
        action={{
          label: 'Ask AnA about these findings',
          onClick: () =>
            onAsk(
              'Compare our design to the FDA findings currently shown in the CRL library, and tell me how they differ from our study.',
            ),
        }}
      />

      {/* ── §8.1 constraint set. Committed on Search. ── */}
      <div className="pj-card" style={{ marginBottom: 14 }}>
        <div
          className="pj-card-b"
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}
        >
          <label className="pe-f">
            <span>Application type</span>
            <select
              value={q.applicationType}
              onChange={(e) => set('applicationType', e.target.value)}
            >
              {APPLICATION_TYPES.map((t) => (
                <option key={t || 'any'} value={t}>
                  {t || 'Any type'}
                </option>
              ))}
            </select>
          </label>
          <label className="pe-f" style={{ flex: 1.4 }}>
            <span>Finding text</span>
            <input
              value={q.text}
              placeholder="e.g. clinically meaningful endpoint"
              onChange={(e) => set('text', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setApplied(q);
              }}
            />
          </label>
          <label className="pe-f">
            <span>Discipline</span>
            <select value={q.discipline} onChange={(e) => set('discipline', e.target.value)}>
              {DISCIPLINES.map(([v, l]) => (
                <option key={v || 'any'} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="pe-f" style={{ maxWidth: 110 }}>
            <span>CTD section</span>
            <input
              value={q.ctdSection}
              placeholder="2.7.3"
              onChange={(e) => set('ctdSection', e.target.value)}
            />
          </label>
          <label className="pe-f">
            <span>Verification</span>
            <select value={q.verification} onChange={(e) => set('verification', e.target.value)}>
              {VERIFICATIONS.map(([v, l]) => (
                <option key={v || 'any'} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <button
            className="sp-primary"
            style={{ padding: '8px 16px' }}
            onClick={() => setApplied(q)}
            disabled={res.loading}
            type="button"
          >
            {I.search} {res.loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {/* ── Coverage row. Every count with its denominator (§8.1). ── */}
      {coverage && (
        <div className="pj-card crl-coverage" style={{ marginBottom: 14 }}>
          <div className="pj-card-b crl-coverage-b">
            <span className="crl-coverage-k">Coverage</span>
            <span>{coverage.scanned} letters scanned</span>
            <span className="crl-sep" aria-hidden="true">·</span>
            <span>{withDenominator(coverage.eligible, coverage.scanned)} eligible on these filters</span>
            <span className="crl-sep" aria-hidden="true">·</span>
            <span>
              {withDenominator(coverage.structured, coverage.eligible)} with structured findings
            </span>
            <span className="crl-sep" aria-hidden="true">·</span>
            <span className="crl-verified">
              {withDenominator(coverage.verified, coverage.structured)} verified
            </span>
            <span className="crl-sep" aria-hidden="true">·</span>
            <span className="crl-note">
              Public FDA evidence only — no tenant-private source is in this result.
            </span>
            {coverage.freshness && (
              <>
                <span className="crl-sep" aria-hidden="true">·</span>
                <span className="crl-note">Corpus snapshot {coverage.freshness}</span>
              </>
            )}
          </div>
          {coverage.exclusionNote && (
            <div className="pj-card-b crl-exclusion">{coverage.exclusionNote}</div>
          )}
        </div>
      )}

      {/* ── Results, or the honest empty state. ── */}
      {!hasResults ? (
        <EmptyState
          icon={I.gavel}
          title={
            insufficient && insufficient.total === 0
              ? 'No regulatory evidence has been ingested yet'
              : 'No findings match these constraints'
          }
          hint={
            insufficient && insufficient.total === 0
              ? insufficient.reason
              : 'Every constraint is applied before ranking, so a narrow filter set returns nothing rather than a loosely-related result. Widen the filters, or clear the verification constraint to include findings that have been extracted but not yet human-reviewed.'
          }
        />
      ) : (
        <div className="sp-2col" style={{ gridTemplateColumns: '1.15fr 1fr' }}>
          <div className="pj-card">
            <div className="pj-card-h">
              <span className="t">Findings</span>
              <span className="s">
                {coverage
                  ? `${withDenominator(coverage.verified, coverage.structured)} verified · ranked after metadata constraints`
                  : 'ranked after metadata constraints'}
              </span>
            </div>
            <div className="pj-card-b" style={{ padding: 8 }}>
              <div className="sp-list">
                {findings.map((f) => (
                  <FindingRow
                    key={f.findingId}
                    f={f}
                    selected={sel?.findingId === f.findingId}
                    onSelect={() => setSelId(f.findingId)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>{sel && <FindingDetail f={sel} />}</div>
        </div>
      )}
    </div>
  );
}

export default CrlLibrary;

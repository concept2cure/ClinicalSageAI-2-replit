/**
 * Deterministic-intelligence UI layer — kit app/intelligence.jsx ported.
 *
 * The keystone is PedigreeBadge; then one calm, citation-forward rendering
 * pattern (DetResultCard) reused across all 142 tools, the CitationChips
 * affordance, the ValidationSummaryPanel, and the read-only Capability Index
 * surface (registry id `intelligence-catalog`). These components are the
 * SHARED renderers — AnA chat and every deterministic surface reuse them;
 * never redefine them (kit non-negotiable).
 */
import React from 'react';

/* The surface's own stylesheet.

   It existed, fully written and correctly scoped — 83 rules, every one under
   `.c2c-v2` — and no file in the repository imported it, on this branch or on
   the base. A stylesheet nobody imports is never handed to the bundler, so 49
   of the classes this file renders (`cap-card`, `cap-demo`, `cap-tool-row`,
   `cap-ped`, …) resolved to nothing and `intelligence-catalog` shipped as
   unstyled stacked divs. `scripts/ci/check-orphaned-stylesheets.mjs` is what
   surfaced it.

   This is the only one of the seventeen orphans that can simply be imported.
   The rest are between 96% and 100% UNSCOPED — `research-v2.css` alone carries
   410 bare selectors including a global `[data-tone="ai"]` that would repaint
   every element with a `data-tone` anywhere in the app. Those need scoping
   first, which is a change with visual consequences and belongs in its own PR.
   This one is already scoped, so it costs one line. */
import '../styles/intelligence-v2.css';
import { I } from '../icons';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import {
  // Reference config only: the tool catalog (what AnA can run) and the pedigree
  // /trust vocabulary. INTEL_DEMOS, INTEL_VALIDATION and INTEL_STATS are no
  // longer imported — the first two were sample RESULTS (see the note where the
  // worked-example strip used to be) and the third was a hand-maintained count
  // of the catalog, now derived from it.
  INTEL_CATALOG,
  INTEL_PEDIGREE,
  INTEL_TRUST_LABEL,
  type DetResult,
  type ValidationSummary,
} from '../fixtures/intelligence';

/* ── PedigreeBadge — inline trust pill on every AnA result ── */
export function PedigreeBadge({ level, showTrust }: { level: string; showTrust?: boolean }) {
  const meta = (INTEL_PEDIGREE as Record<string, { label: string; icon: string; trust: string; guide: string }>)[level];
  if (!meta) return null;
  const trust = (INTEL_TRUST_LABEL as Record<string, string>)[meta.trust] ?? meta.trust;
  return (
    <span
      className="ped"
      data-l={level}
      title={meta.guide}
      role="img"
      aria-label={`Determinism pedigree: ${meta.label}. ${trust}. ${meta.guide}`}
    >
      {I[meta.icon]}
      {meta.label}
      {showTrust ? <span className="ped-trust">· {trust}</span> : null}
    </span>
  );
}

/* ── CitationChips — visible, scannable, "this is sourced" ── */
export function CitationChips({ items, lead = 'Citations' }: { items?: string[]; lead?: string }) {
  if (!items || !items.length) return null;
  return (
    <div className="cit-row">
      <span className="cit-lead">{lead}</span>
      {items.map((c, i) => (
        <span key={i} className="cit" title={`Governing reference: ${c}`}>
          {I.bookOpen ?? I.fileText}
          {c}
        </span>
      ))}
    </div>
  );
}

const SEV_ICON: Record<string, string> = {
  critical: 'shieldAlert',
  error: 'alertTriangle',
  warning: 'alertTriangle',
  ok: 'check',
  notice: 'info',
  info: 'info',
  reject: 'shieldAlert',
};
/* severity rank so errors/critical always sort to the top */
const SEV_RANK: Record<string, number> = { critical: 0, reject: 0, error: 1, warning: 2, notice: 3, info: 3, ok: 4 };

/* ── DetResultCard — the shared deterministic-result rendering pattern. ── */
export function DetResultCard({ r }: { r?: DetResult | null }) {
  if (!r) return null;
  const findings = (r.findings ?? []).slice().sort((a, b) => (SEV_RANK[a.sev] ?? 9) - (SEV_RANK[b.sev] ?? 9));
  return (
    <div className="det">
      <div className="det-h">
        <span className="det-tool">{r.tool}</span>
        <span className="det-domain">{r.domain}</span>
        <PedigreeBadge level={r.pedigree} />
      </div>
      {r.verdict && (
        <div className="det-verdict">
          <span className="det-verdict-v" data-tone={r.verdict.tone}>
            {r.verdict.value}
          </span>
          <span className="det-verdict-l">{r.verdict.label}</span>
        </div>
      )}
      <div className="det-b">
        {findings.length > 0 && (
          <div>
            <div className="det-sec-l">Findings</div>
            {findings.map((f, i) => (
              <div key={i} className="det-find" data-sev={f.sev}>
                {I[SEV_ICON[f.sev] ?? 'info']}
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        )}
        {Array.isArray(r.rationale) && r.rationale.length > 0 && (
          <div>
            <div className="det-sec-l">Rationale</div>
            <ol className="det-rat">
              {r.rationale.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ol>
          </div>
        )}
        {Array.isArray(r.recommendations) && r.recommendations.length > 0 && (
          <div>
            <div className="det-sec-l">Recommended next actions</div>
            <div className="det-recs">
              {r.recommendations.map((x, i) => (
                <div key={i} className="det-rec">
                  <span className="n">{i + 1}</span>
                  <span>{x}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {Array.isArray(r.warnings) && r.warnings.length > 0 && (
          <div className="det-warns">
            {I.alertTriangle} {r.warnings.join(' ')}
          </div>
        )}
      </div>
      <div className="det-f">
        <CitationChips items={r.citations} />
      </div>
    </div>
  );
}

/* ── ValidationSummaryPanel — pass/fail findings against a standard ── */
export function ValidationSummaryPanel({ v }: { v?: ValidationSummary | null }) {
  if (!v) return null;
  const total = (v.groups ?? []).reduce((a, g) => a + g.rows.length, 0);
  return (
    <div className="vsp">
      <div className="vsp-h">
        <span className="vsp-t">{v.title}</span>
        <span className="vsp-std">{v.standard}</span>
        <span className="vsp-verdict" data-ok={v.valid}>
          {v.valid ? I.check : I.alertTriangle}
          {v.valid ? 'Conformant' : 'Findings to resolve'}
        </span>
        {v.pedigree ? <PedigreeBadge level={v.pedigree} /> : null}
      </div>
      {total === 0 ? (
        <div className="vsp-empty">No findings — the package conforms to {v.standard}.</div>
      ) : (
        (v.groups ?? []).map(
          (g, gi) =>
            g.rows.length > 0 && (
              <div key={gi} className="vsp-grp">
                <div className="vsp-grp-l">
                  {g.label} · {g.rows.length}
                </div>
                {g.rows.map((row, ri) => (
                  <div key={ri} className="vsp-row" data-sev={row.sev}>
                    {I[SEV_ICON[row.sev] ?? 'info']}
                    <span className="vsp-rule">{row.rule}</span>
                    {row.domain ? <span className="vsp-dom">{row.domain}</span> : null}
                    <span className="vsp-msg">{row.msg}</span>
                  </div>
                ))}
              </div>
            )
        )
      )}
    </div>
  );
}

/* ── Capability Index surface — read-only "what AnA knows" reference. ── */
export function CapabilityIndex({ onAsk }: { onAsk: (text: string) => void }) {
  const [query, setQuery] = React.useState('');
  const term = query.trim().toLowerCase();
  const runTool = (name: string) => onAsk(`Run ${name} for this program`);

  /* Counted from the catalog rendered below, not asserted.
     The strapline used to read its numbers from a separate INTEL_STATS constant
     ({ waves: 4, domains: 24, tools: 142 }). Two sources for one fact drift the
     moment a tool is added, and a page that claims 142 while listing 138 is
     wrong in the direction that matters. */
  const S = React.useMemo(() => {
    const domains = INTEL_CATALOG.reduce((n, w) => n + w.domains.length, 0);
    const tools = INTEL_CATALOG.reduce(
      (n, w) => n + w.domains.reduce((m, d) => m + d.tools.length, 0),
      0,
    );
    return { waves: INTEL_CATALOG.length, domains, tools };
  }, []);

  /* One filtered structure for the render AND the published context — a second
     filter implementation would drift from what the screen actually shows. */
  const filteredWaves = React.useMemo(
    () =>
      INTEL_CATALOG.map((w) => ({
        w,
        domains: w.domains
          .map((d) => ({
            ...d,
            tools: term ? d.tools.filter((t) => t.includes(term) || d.name.toLowerCase().includes(term)) : d.tools,
          }))
          .filter((d) => !term || d.name.toLowerCase().includes(term) || d.tools.length > 0),
      })),
    [term],
  );

  /* WHAT ANA SEES HERE. Static catalog + a live filter — no reads, so there is
     no loading or error state to speak from. The "Run" tiles only hand words
     into the conversation; the disclaimer says so, because "AnA ran a tool by
     itself" is the claim this surface must never support. */
  const anaContext = React.useMemo(() => {
    const visibleDomains = filteredWaves.reduce((n, x) => n + x.domains.length, 0);
    const visibleTools = filteredWaves.reduce(
      (n, x) => n + x.domains.reduce((m, d) => m + d.tools.length, 0),
      0,
    );
    return {
      summary:
        `AnA capability catalog — ${S.waves} waves, ${S.domains} domains, ${S.tools} deterministic tools.` +
        (term ? ` Filtered by "${query.trim()}" — ${visibleDomains} domains / ${visibleTools} tools visible.` : ''),
      facts: {
        waves: S.waves,
        domains: S.domains,
        tools: S.tools,
        // A whitespace-only query filters nothing, so it is published as no filter.
        filter: query.trim() || null,
        visibleDomains,
        visibleTools,
        disclaimer:
          'Each tile\'s "Run" hands a request into the conversation as the user\'s own words — AnA never fires one uninvited.',
      },
      availableActions: ['Filter the catalog by name'],
    };
  }, [S, term, query, filteredWaves]);
  /* Catalog filtering only — running a tool stays the person's request. The
     detail counts come from `filteredWaves`, the SAME memo the render and the
     published context read, so the number AnA reports is the number on screen
     (one render behind, which the wording accounts for). */
  useSurfaceActionHandlers('intelligence-catalog', {
    'intelligence-catalog.filter': (params) => {
      const next = String(params.query ?? '');
      if (query === next) return { ok: true, detail: next ? `Already filtered by "${next}"` : 'Filter already cleared' };
      setQuery(next);
      if (!next.trim()) return { ok: true, detail: 'Cleared the catalog filter — every capability is listed again' };
      // Scored through the SAME predicate `filteredWaves` uses, against the
      // catalog rather than the current (pre-setState) filtered structure.
      const t = next.trim().toLowerCase();
      const hitDomains = INTEL_CATALOG.reduce(
        (n, w) =>
          n +
          w.domains.filter(
            (d) => d.name.toLowerCase().includes(t) || d.tools.some((tool) => tool.includes(t)),
          ).length,
        0,
      );
      return {
        ok: true,
        detail: hitDomains
          ? `Filtered the catalog by "${next.trim()}" — ${hitDomains} domain(s) match`
          : `Filtered the catalog by "${next.trim()}" — nothing matches, so the catalog reads empty`,
      };
    },
  });

  usePublishSurfaceContext('intelligence-catalog', anaContext);

  return (
    <div className="cap">
      <div className="cap-hero">
        <div className="cap-eyebrow">AnA · deterministic intelligence</div>
        <h1 className="cap-title">Capability index</h1>
        <p className="cap-sub">
          AnA carries {S.tools} deterministic, registry-grade tools across {S.domains} regulatory-science
          domains. Each is a pure function — no model, no network — returning citation-backed,
          submission-defensible output. Identical input always yields identical output. This is the
          highest-trust content AnA can produce; every result carries a determinism pedigree.
        </p>
      </div>

      {/* Pedigree legend — the trust vocabulary */}
      <div className="cap-legend">
        <span className="cap-legend-l">Pedigree</span>
        {Object.keys(INTEL_PEDIGREE).map((k) => (
          <PedigreeBadge key={k} level={k} showTrust />
        ))}
      </div>

      {/* The worked-example strip is gone.
          It rendered a DetResultCard and a ValidationSummaryPanel filled from
          the INTEL_DEMOS / INTEL_VALIDATION fixtures — a TTC calculation, a
          Naranjo causality read, and a CDISC conformance report against a
          package called "BX204-301" with named reject and warning rules —
          behind a "Sample data" pill. It was there to illustrate the output
          format, and as illustration it was honest about itself. But it is
          still a fabricated regulatory result rendered on an authenticated
          screen in a regulated product: a reader who screenshots the CDISC
          panel has a conformance report for a study that does not exist, and
          the pill does not travel with the image. The format is better shown by
          a real tool result, which is what every deterministic surface and AnA
          answer already renders through these same two components. */}

      {/* The catalog — every domain and tool, filterable */}
      <div className="ev-search cap-filter">
        <span className="ico">{I.search}</span>
        <input
          aria-label="Filter domains and tools" placeholder="Filter domains and tools…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="cap-gap" />

      {filteredWaves.map(({ w, domains }, wi) => {
        if (term && domains.length === 0) return null;
        return (
          <div key={wi} className="cap-wave">
            <h2 className="cap-wave-h">{w.wave}</h2>
            <p className="cap-wave-sub">{w.sub}</p>
            <div className="cap-grid">
              {domains.map((d, di) => (
                <div key={di} className="cap-card">
                  <div className="cap-card-h">
                    <span className="cap-card-ic">{I[d.icon] ?? I.sparkles}</span>
                    <span className="cap-card-t">{d.name}</span>
                    <span className="cap-card-n">{d.tools.length}</span>
                  </div>
                  <div className="cap-tools">
                    {d.tools.map((t, ti) => (
                      <button
                        key={ti}
                        type="button"
                        className="cap-tool"
                        title={`Ask AnA to run ${t}`}
                        onClick={() => runTool(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

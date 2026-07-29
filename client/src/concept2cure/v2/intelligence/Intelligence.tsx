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
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import {
  INTEL_CATALOG,
  INTEL_DEMOS,
  INTEL_PEDIGREE,
  INTEL_STATS,
  INTEL_TRUST_LABEL,
  INTEL_VALIDATION,
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
  const S = INTEL_STATS;
  const [demoKey, setDemoKey] = React.useState('ttc');
  const [query, setQuery] = React.useState('');
  const demo = INTEL_DEMOS[demoKey];
  const term = query.trim().toLowerCase();
  const runTool = (name: string) => onAsk(`Run ${name} for this program`);

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

      {/* Worked-example strip — one calm result pattern, reused across all tools */}
      <div className="cap-demo">
        <div className="cap-demo-h">
          A deterministic result, rendered <SampleTag sample />
        </div>
        <div className="cap-demo-sub">
          One governed pattern binds every tool: a verdict, severity-graded findings, rationale, next
          actions, and a citations block. Pick an example.
        </div>
        <div className="cap-demo-picks">
          {(
            [
              ['ttc', 'TTC · ICH M7'],
              ['estimand', 'Estimand · ICH E9(R1)'],
              ['naranjo', 'Causality · Naranjo'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              className="ana-sugg cap-demo-pick"
              data-on={demoKey === k || undefined}
              onClick={() => setDemoKey(k)}
            >
              {I.zap}
              {l}
            </button>
          ))}
        </div>
        <div className="cap-demo-cols">
          <DetResultCard r={demo} />
          <ValidationSummaryPanel v={INTEL_VALIDATION.cdisc} />
        </div>
      </div>

      {/* The catalog — 24 domains / 142 tools, filterable */}
      <div className="ev-search cap-filter">
        <span className="ico">{I.search}</span>
        <input
          placeholder="Filter domains and tools…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="cap-gap" />

      {INTEL_CATALOG.map((w, wi) => {
        const domains = w.domains
          .map((d) => ({
            ...d,
            tools: term ? d.tools.filter((t) => t.includes(term) || d.name.toLowerCase().includes(term)) : d.tools,
          }))
          .filter((d) => !term || d.name.toLowerCase().includes(term) || d.tools.length > 0);
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

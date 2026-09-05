/**
 * Investigator's Brochure -- ICH E6(R2) §7 IB section tree with per-section
 * completeness/verdict.
 *
 * Registry id: `investigator-brochure`
 *
 * Surfaces GET /api/investigator-brochure: the ICH E6(R2) §7 IB section registry
 * with a deterministic per-section verdict (rendered | partial | missing) and the
 * inputs each open section still needs. The backend ASSEMBLES this from the org's
 * REAL upstream evidence stores (nonclinical_studies, clinical_ops.studies /
 * clinical_studies, adverse_events / risk_management_plans, cmc_module3_sections)
 * via server/services/authoring/investigator-brochure-view-assembler — no
 * `c2c_investigator_brochure` blob, no fixture. Fixture-free (useLiveRows): renders
 * the real persisted rows, an honest error state, or an honest empty state. A domain
 * the org has no evidence for is honestly `missing`; an org with no upstream evidence
 * at all yields the deterministic ICH E6(R2) §7 skeleton — always real content,
 * never fabricated and never a codebase fixture.
 */
import React from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import '../styles/project-home-v2.css';

/** The per-section display contract GET /api/investigator-brochure returns
 *  (server/services/authoring/investigator-brochure-view-assembler.ts → IBSectionRow):
 *  the real ICH E6(R2) §7 section registry with a deterministic per-section verdict. */
interface IBSectionRow {
  number: string;
  title: string;
  required: boolean;
  status: 'rendered' | 'partial' | 'missing';
  gaps: string[];
  description: string;
  /** 0 = top-level IB chapter / front matter, 1 = sub-section (e.g. 4.1). */
  depth: number;
}

/* ── verdict → tone / label ── */
const STATUS_TONE: Record<IBSectionRow['status'], string> = {
  rendered: 'ok',
  partial: 'warn',
  missing: 'err',
};
const STATUS_LABEL: Record<IBSectionRow['status'], string> = {
  rendered: 'Ready',
  partial: 'Partial',
  missing: 'Missing inputs',
};

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

/* ════ Investigator's Brochure surface ════ */

export function InvestigatorBrochure({ onAsk }: SurfaceViewProps) {
  /* Fixture-free — the real persisted IB section tree, an honest error state, or
     an honest empty state. The backend returns the deterministic ICH E6(R2) §7
     skeleton (each data-bearing section marked `missing`) when no program is
     provisioned, so `rows` is real content, never a codebase fixture. */
  const { rows, loading, error, empty } = useLiveRows<IBSectionRow>(
    '/api/investigator-brochure',
  );

  const required = rows.filter((s) => s.required);
  const readyRequired = required.filter((s) => s.status === 'rendered').length;
  const completeness = required.length
    ? Math.round((readyRequired / required.length) * 100)
    : 0;
  const openCount = rows.filter((s) => s.status !== 'rendered').length;

  /* What AnA can see of this screen. The Ask button hands her "draft the OPEN
     sections" — which requires knowing which ones are open and what each is
     missing. Every gap the backend recorded travels with the section, because
     "why is 4.2 partial?" is answerable only from those strings.

     A FAILED read publishes the failure: a 0% completeness figure derived from
     an unreachable store is a filing-readiness claim nobody computed. */
  const anaContext = React.useMemo(() => {
    if (loading) {
      return { summary: 'The Investigator\u2019s Brochure section structure is still loading; nothing on screen is final yet.' };
    }
    if (error) {
      return {
        summary:
          'The Investigator\u2019s Brochure structure could not be read, so this screen is showing no ' +
          'sections because of a failure, not because none exist.',
        availableActions: ['Retry the IB structure read'],
      };
    }
    return {
      summary:
        `Investigator's Brochure (ICH E6(R2) \u00a77): ${rows.length} section(s), ` +
        `${required.length} required — ${readyRequired} rendered, so required-section completeness is ` +
        `${completeness}%. ${openCount} section(s) are not yet rendered.` +
        (empty ? ' No program is provisioned, so this is the deterministic ICH skeleton with every data-bearing section marked missing.' : ''),
      facts: {
        totalSections: rows.length,
        requiredSections: required.length,
        renderedRequired: readyRequired,
        completenessPercent: completeness,
        openSections: openCount,
        isDeterministicSkeleton: empty,
        sections: rows.slice(0, 24).map((sec) => ({
          number: sec.number, title: sec.title, required: sec.required,
          status: sec.status, gaps: sec.gaps ?? [], depth: sec.depth,
        })),
      },
      availableActions: [
        'Draft an open IB section from the linked M2.4 / M2.5 / M2.7 summaries and integrated safety',
        'Read a section\u2019s recorded gaps and what it still needs',
      ],
    };
  }, [loading, error, empty, rows, required.length, readyRequired, completeness, openCount]);
  usePublishSurfaceContext('investigator-brochure', anaContext);

  return (
    <div className="page-inner">
      <PageHead
        eyebrow="Program · IND authoring"
        title="Investigator's Brochure"
        sub="ICH E6(R2) §7 section structure with per-section readiness."
        actions={
          <button className="btn ghost" onClick={() => onAsk('Draft the open Investigator\'s Brochure sections from the linked M2.4 / M2.5 / M2.7 summaries and integrated safety.')}>
            {I.sparkles} Ask AnA
          </button>
        }
      />

      {loading ? (
        <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading IB section structure…</div>
      ) : error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the Investigator's Brochure structure"
          hint="The IB section service didn't respond. This tree is the ICH E6(R2) §7 section registry with each section's live readiness verdict for your organization — sign in and retry, or check that the IB authoring service is reachable."
        />
      ) : empty ? (
        <EmptyState
          icon={I.fileText}
          title="No Investigator's Brochure sections returned"
          hint="The IB section registry came back empty. Once the M2.4 nonclinical overview, M2.5/M2.7 clinical summaries, and integrated safety inputs are linked, the ICH E6(R2) §7 sections populate here with per-section readiness."
        />
      ) : (
        <>
          {/* Completeness rollup */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
              margin: '4px 0 18px', padding: '12px 16px',
              border: '1px solid var(--c2c-border, #e3e6ea)', borderRadius: 10,
              background: 'var(--c2c-surface, #fff)',
            }}
          >
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{completeness}%</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>required sections ready</div>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ height: 8, borderRadius: 6, background: 'var(--c2c-track, #eceff2)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${completeness}%`, background: 'var(--c2c-ok, #2f9e6f)' }} />
              </div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {readyRequired}/{required.length} required · {openCount} section{openCount === 1 ? '' : 's'} open
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((s) => (
              <div
                key={s.number}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '10px 14px', borderRadius: 8,
                  border: '1px solid var(--c2c-border, #e3e6ea)',
                  background: 'var(--c2c-surface, #fff)',
                  marginLeft: s.depth * 22,
                }}
              >
                <span
                  className="pg-mono"
                  style={{ minWidth: 34, fontSize: 12, opacity: 0.7, paddingTop: 2 }}
                >
                  {s.number}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: s.depth === 0 ? 600 : 500, fontSize: s.depth === 0 ? 14 : 13 }}>
                      {s.title}
                    </span>
                    {!s.required && (
                      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, opacity: 0.55 }}>
                        optional
                      </span>
                    )}
                    <span className={`rd-chip tone-${STATUS_TONE[s.status]}`} style={{ marginLeft: 'auto' }}>
                      {STATUS_LABEL[s.status]}
                    </span>
                  </div>
                  {s.description && (
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 3 }}>{s.description}</div>
                  )}
                  {Array.isArray(s.gaps) && s.gaps.length > 0 && (
                    <div style={{ fontSize: 12, marginTop: 6, color: 'var(--c2c-warn-ink, #8a5a00)' }}>
                      Needs: {s.gaps.join(' · ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="scaf-note" style={{ marginTop: 18, maxWidth: 760 }}>
        Section readiness is a deterministic verdict from the IB gap engine: a section is <b>Ready</b> when every input it needs (product properties, nonclinical M2.4/M2.6, clinical M2.5/M2.7, integrated safety) is present, <b>Partial</b> when some are, and <b>Missing inputs</b> when none are yet linked. AnA drafts the open sections from the linked summaries — it never invents results.
      </div>
    </div>
  );
}

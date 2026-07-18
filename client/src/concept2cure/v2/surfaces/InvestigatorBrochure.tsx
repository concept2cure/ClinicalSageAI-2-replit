/**
 * Investigator's Brochure -- ICH E6(R2) §7 IB section tree with per-section
 * completeness/verdict.
 *
 * Registry id: `investigator-brochure`
 *
 * Surfaces the backend IB builder (server/services/authoring/ib-builder) through
 * GET /api/investigator-brochure: the IB section registry with a deterministic
 * per-section verdict (rendered | partial | missing) and the inputs each open
 * section still needs. live ?? fixture via the dataConnect primitives — the org's
 * IB program is adopted only on a shape match, otherwise the codebase fixture
 * renders (so the surface is never blank and never fabricates content). The
 * <SampleTag> tells the truth about which is on screen.
 */
import React from 'react';
import { I } from '../icons';
import { SampleTag, useLiveList } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { IB_SECTIONS, IB_PRODUCT_NAME, type IBSectionRow } from '../fixtures/investigator-brochure-data';
import '../styles/project-home-v2.css';

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

function PageHead({ eyebrow, title, sub, actions, sample }: {
  eyebrow: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
  sample?: boolean;
}) {
  return (
    <div className="ph">
      <div>
        <div className="ph-eyebrow">{eyebrow}{sample !== undefined && <> <SampleTag sample={sample} /></>}</div>
        <h1 className="ph-title">{title}</h1>
        {sub && <div className="ph-sub">{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}

/* ════ Investigator's Brochure surface ════ */

export function InvestigatorBrochure({ onAsk }: SurfaceViewProps) {
  /* live ?? fixture — adopt the org's IB section tree when the read returns the
     full row shape ({ number, title, required, status, gaps, description,
     depth }), else keep the codebase fixture so the tree is never empty (fixture
     also renders while the fetch is in flight). Never fabricates. */
  const { data: sections, sample } = useLiveList<IBSectionRow>(
    '/api/investigator-brochure',
    IB_SECTIONS,
  );

  const rows = Array.isArray(sections) ? sections : [];
  const required = rows.filter((s) => s.required);
  const readyRequired = required.filter((s) => s.status === 'rendered').length;
  const completeness = required.length
    ? Math.round((readyRequired / required.length) * 100)
    : 0;
  const openCount = rows.filter((s) => s.status !== 'rendered').length;

  return (
    <div className="page-inner">
      <PageHead
        eyebrow="Program · IND authoring"
        title="Investigator's Brochure"
        sub={`ICH E6(R2) §7 section structure with per-section readiness${sample ? ` · sample program ${IB_PRODUCT_NAME}` : ''}.`}
        sample={sample}
        actions={
          <button className="btn ghost" onClick={() => onAsk('Draft the open Investigator\'s Brochure sections from the linked M2.4 / M2.5 / M2.7 summaries and integrated safety.')}>
            {I.sparkles} Ask AnA
          </button>
        }
      />

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

      {rows.length === 0 ? (
        <div
          className="scaf-note"
          style={{ maxWidth: 640 }}
        >
          No Investigator's Brochure program is provisioned for this organization yet. Once the M2.4 nonclinical overview, M2.5/M2.7 clinical summaries, and integrated safety inputs are linked, the ICH E6(R2) §7 sections populate here with per-section readiness.
        </div>
      ) : (
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
      )}

      <div className="scaf-note" style={{ marginTop: 18, maxWidth: 760 }}>
        Section readiness is a deterministic verdict from the IB gap engine: a section is <b>Ready</b> when every input it needs (product properties, nonclinical M2.4/M2.6, clinical M2.5/M2.7, integrated safety) is present, <b>Partial</b> when some are, and <b>Missing inputs</b> when none are yet linked. AnA drafts the open sections from the linked summaries — it never invents results.
      </div>
    </div>
  );
}

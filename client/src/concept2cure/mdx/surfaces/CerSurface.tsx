/**
 * CER surface (basic) — signals + literature corpus + export plan.
 * Ported from Surfaces.jsx > CERSurface.
 *
 * Note: the 7-tab CerWorkbench (Equivalence / GSPR / Lit corpus / Signals /
 * PMS / Generator) is not present in this kit drop. When CerWorkbench.jsx +
 * data-presub.jsx land in a later drop, swap this surface for the workbench.
 */

import * as React from 'react';
import { I } from '../icons';
import { CER_EXPORT, CER_LITERATURE, CER_SIGNALS } from '../data/cer';
import type { Program } from '../data/programs';
import { useK510EstarSections } from '../hooks/useK510';
import { useProgramExtras } from '../hooks/useProgramExtras';

export interface CerSurfaceProps {
  /** Active CER program from App.tsx. Sections and title come from here. */
  program: Program | null;
  onAskAna: (text: string) => void;
}

export function CerSurface({ program, onAskAna }: CerSurfaceProps) {
  const [includedOnly, setIncludedOnly] = React.useState(false);

  /* CER sections live in the same cerv2_510k_sections table used by 510(k)
     and PMA — the legacy table name spans all three pathways. */
  const sectionsState = useK510EstarSections(program?.id ?? null);
  const sourceSections = sectionsState.rows ?? CER_EXPORT.map((s, i) => ({
    id: i + 1,
    label: s.label,
    status: s.status as never,
    blocker: false,
  }));

  /* Live safety signals (FAERS / MAUDE / Eudamed / Spontaneous / Literature)
     and year-bucketed literature corpus — both per-program. Falls back to
     the kit fixture during initial fetch + on error. The kit's CerSignal
     count is "n=" style (numeric), and live safety_signals doesn't carry
     that directly; the endpoint approximates by source-grouped AE counts. */
  const extras = useProgramExtras(program?.id ?? null);
  const sourceSignals = extras.safetySignals ?? CER_SIGNALS;
  const sourceLiterature = extras.literature && extras.literature.length > 0
    ? extras.literature
    : CER_LITERATURE;
  const maxHits = Math.max(1, ...sourceLiterature.map((l) => l.hits));
  const visibleSignals = includedOnly
    ? sourceSignals.filter(s => s.status === 'included')
    : sourceSignals;
  const literatureTotal = extras.literatureTotal > 0
    ? extras.literatureTotal
    : sourceLiterature.reduce((s, l) => s + l.hits, 0);
  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">
            Clinical Evaluation Report · {program ? program.title : 'IV-415 Companion Diagnostic'}
          </div>
          <div className="section-sub">
            EU MDR Article 61 · {program ? program.dueLabel : 'Notified body review Q1 2026'}
          </div>
        </div>
        <button
          className="section-more"
          onClick={() =>
            onAskAna(
              'Generate the CER draft for IV-415 — pull from the included safety signals, ' +
                'the literature corpus, and the equivalence matrix. Mark gaps in narrative form.',
            )
          }
        >
          Generate draft {I.sparkles}
        </button>
      </div>

      <div className="col2">
        <div>
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Safety signals</div>
                <div className="s">
                  {sourceSignals.length} signal{sourceSignals.length === 1 ? '' : 's'} ·{' '}
                  {sourceSignals.filter(s => s.status === 'included').length} included ·{' '}
                  {sourceSignals.filter(s => s.status === 'excluded').length} excluded ·{' '}
                  {sourceSignals.filter(s => s.status === 'review').length} under review
                </div>
              </div>
              <div className="actions">
                <button
                  className={`tb-btn${includedOnly ? ' active' : ''}`}
                  title={includedOnly ? 'Show all signals' : 'Show included only'}
                  onClick={() => setIncludedOnly(v => !v)}
                >
                  {I.filter}
                </button>
                <button
                  className="tb-btn"
                  title="Run a fresh signal scan with AnA"
                  onClick={() =>
                    onAskAna(
                      'Run a fresh signal scan across FAERS, MAUDE, Eudamed and the literature corpus. ' +
                        'Flag anything that should be re-included or escalated.',
                    )
                  }
                >
                  {I.zap}
                </button>
              </div>
            </div>
            {extras.safetySignals !== null && extras.safetySignals.length === 0 ? (
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  fontSize: 12,
                  color: 'var(--text-300)',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-200)', marginBottom: 4 }}>
                  No safety signals reported yet
                </div>
                Signals appear here once your pharmacovigilance feed is connected and adverse events
                from FAERS · MAUDE · Eudamed · literature start landing.
              </div>
            ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Source</th>
                  <th>Event</th>
                  <th>N</th>
                  <th>Severity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleSignals.map(s => (
                  <tr key={s.id}>
                    <td>
                      <span className="k-num">{s.id}</span>
                    </td>
                    <td style={{ color: 'var(--text-400)', fontSize: 11 }}>{s.source}</td>
                    <td>
                      <div className="k-name" style={{ fontWeight: 400, fontSize: 12 }}>
                        {s.event}
                      </div>
                      <div className="k-holder">{('assess' in s ? s.assess : '') || ''}</div>
                    </td>
                    <td
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        color: 'var(--text-200)',
                      }}
                    >
                      {s.count}
                    </td>
                    <td>
                      <span className={`status-pill ${s.severity}`}>{s.severity}</span>
                    </td>
                    <td>
                      <span className={`status-pill ${s.status}`}>{s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>

          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Literature corpus</div>
                <div className="s">
                  {literatureTotal.toLocaleString()} hits · PubMed · FDA · ClinicalTrials.gov · {sourceLiterature.length}-year window
                </div>
              </div>
              <div className="actions">
                <button
                  className="tb-btn"
                  title="Refine literature search with AnA"
                  onClick={() =>
                    onAskAna(
                      'Refine the literature search for IV-415 — tighten the inclusion window, ' +
                        'expand to MeSH synonyms, and flag any cohort studies missing from the corpus.',
                    )
                  }
                >
                  {I.search}
                </button>
              </div>
            </div>
            <div style={{ padding: '12px 0' }}>
              {extras.literature !== null && literatureTotal === 0 ? (
                <div
                  style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    fontSize: 12,
                    color: 'var(--text-300)',
                  }}
                >
                  <div style={{ fontWeight: 600, color: 'var(--text-200)', marginBottom: 4 }}>
                    No literature corpus indexed yet
                  </div>
                  Run a literature search via PubMed · FDA · ClinicalTrials.gov to populate the
                  6-year window.
                </div>
              ) : sourceLiterature.map(l => (
                <div key={l.year} className="litbar">
                  <span className="yr">{l.year}</span>
                  <div className="bar">
                    <div className="bar-fill" style={{ width: `${(l.hits / maxHits) * 100}%` }} />
                  </div>
                  <span className="ct">{l.hits.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">CER sections</div>
                <div className="s">Article 61 template · {sourceSections.length} sections</div>
              </div>
              <div className="actions">
                <button
                  className="tb-btn"
                  title="Export CER section status as CSV"
                  onClick={() => {
                    const headers = ['Section', 'Status'];
                    const rows = sourceSections.map(s => [s.label, String(s.status)]);
                    const csv = [headers, ...rows]
                      .map(line => line.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
                      .join('\r\n');
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `cer-sections-${new Date().toISOString().slice(0, 10)}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  }}
                >
                  {I.download}
                </button>
              </div>
            </div>
            <div className="estar">
              {sourceSections.map((s, i) => (
                <div key={s.id} className="estar-row">
                  <div className="estar-num">{String(i + 1).padStart(2, '0')}</div>
                  <div className="estar-label">{s.label}</div>
                  <span className={`status-pill ${s.status}`}>{s.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Generation plan</div>
                <div className="s">AnA will draft from included signals + literature</div>
              </div>
            </div>
            <div
              className="panel-body pad"
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  fontSize: 12,
                  color: 'var(--text-200)',
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: 'var(--accent-100)', flexShrink: 0 }}>{I.sparkles}</span>
                <span>
                  Generate <b>Clinical data summary</b> from 4 included signals and 412 literature
                  hits (2025)
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  fontSize: 12,
                  color: 'var(--text-200)',
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: 'var(--accent-100)', flexShrink: 0 }}>{I.sparkles}</span>
                <span>
                  Draft <b>Safety and risk-benefit</b> with adjudicated lead-dislodgement cases
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  fontSize: 12,
                  color: 'var(--text-200)',
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: 'var(--accent-100)', flexShrink: 0 }}>{I.sparkles}</span>
                <span>
                  Complete <b>PMS plan</b> using FAERS signal trajectory
                </span>
              </div>
              <button
                style={{
                  marginTop: 6,
                  padding: '8px 14px',
                  background: 'var(--accent-100)',
                  color: 'var(--text-000)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 12,
                  fontWeight: 500,
                  alignSelf: 'flex-start',
                }}
              >
                Draft with AnA
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * IVD diagnostics workbench surface — IVDR pathway.
 *
 * 7-stage strip · Annex VIII classification · analytical validation tracker ·
 * clinical evidence 2×2 · GSPR (Annex I) compliance matrix. Mirrors
 * K510Surface: three+ live fetches that fall back to the data/ivd.ts fixtures
 * during load and on error, all wrapped in PathwayPanes so the IVD dossier gets
 * the same audit / notified-body correspondence / approvals / files tabs.
 */

import * as React from 'react';
import { I } from '../icons';
import {
  IVD_CLASSIFICATIONS,
  IVD_CLINICAL,
  IVD_GSPR,
  IVD_STAGES,
  IVD_VALIDATIONS,
  type IvdParamStatus,
} from '../data/ivd';
import type { Program } from '../data/programs';
import {
  useIvdClassifications,
  useIvdClinicalEvidence,
  useIvdGsprMatrix,
  useIvdValidations,
} from '../hooks/useIvd';
import { AskAnaChip } from './AskAnaChip';
import { PathwayPanes } from './pathway/PathwayPanes';
import { EstarFilingPanel } from './EstarFilingPanel';
import { OfficialEstarPanel, officialEstarTypeFor } from './OfficialEstarPanel';
import { useSampleRows } from '../lib/useSampleRows';
import { useCdxPairings, useCliaCategorizations } from '../hooks/useCdxClia';
import { DataGate } from '../components/DataGate';
import type { EditorSectionRef } from '../../v2/editorTarget';

export interface IvdSurfaceProps {
  program: Program | null;
  onAskAna: (text: string) => void;
  /** Open the one document editor; a section ref deep-links to that section. */
  onOpenEditor?: (section?: EditorSectionRef) => void;
}

const PARAM_PILL: Record<IvdParamStatus, string> = {
  pass: 'complete',
  fail: 'empty',
  pending: 'draft',
};

function pct(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1)}%`;
}

export function IvdSurface({ program, onAskAna, onOpenEditor }: IvdSurfaceProps) {
  const activeStageIdx = program ? Math.min(program.stageIdx, IVD_STAGES.length - 1) : 3;
  const programStatus = program ? program.status : 'active';
  const programId = program?.id ?? null;

  /* Live IVDR data — org-scoped lists + program-scoped GSPR matrix. Each
     falls back to the kit fixture on load/error so the surface is usable
     even before any IVDR record exists for the tenant. */
  /* All four panels now follow the programme named in the header. They
     previously read the whole organisation while the header named one
     device, so a user could attribute another assay's Class C
     determination, LoD or sensitivity to the device in front of them. */
  const classifications = useIvdClassifications(programId);
  const validations = useIvdValidations(programId);
  const clinical = useIvdClinicalEvidence(programId);
  const gspr = useIvdGsprMatrix(programId);

  const sourceClass = useSampleRows(classifications.rows, IVD_CLASSIFICATIONS);
  const sourceValid = useSampleRows(validations.rows, IVD_VALIDATIONS);
  const sourceClinical = useSampleRows(clinical.rows, IVD_CLINICAL);
  const sourceGspr = useSampleRows(gspr.rows, IVD_GSPR);

  /* Companion diagnostics and CLIA — the two IVD differentiators the
     platform review names, built and previously reachable only through
     AnA. Both follow the selected programme, like every other panel
     here, and render through DataGate so an empty programme reads empty
     rather than borrowing another assay's pairings. No sample fixtures:
     an invented CDx approval or waiver grant is a regulatory claim. */
  const cdx = useCdxPairings(programId);
  const clia = useCliaCategorizations(programId);

  const usingFixture = !classifications.rows && !validations.rows && !clinical.rows;

  const gsprTotals = sourceGspr.reduce(
    (acc, c) => ({
      total: acc.total + c.total,
      compliant: acc.compliant + c.compliant,
      open: acc.open + c.partiallyCompliant + c.nonCompliant + c.notAssessed,
    }),
    { total: 0, compliant: 0, open: 0 },
  );
  const overallPercent =
    gspr.overallPercent ??
    (gsprTotals.total > 0 ? Math.round((gsprTotals.compliant / gsprTotals.total) * 100) : 0);

  const subjectName = program ? program.title : sourceClass[0]?.device ?? 'IVD device';

  const workspace = (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">
            IVDR pathway · {subjectName}
          </div>
          <div className="section-sub">
            Stage {activeStageIdx + 1} of {IVD_STAGES.length} — {IVD_STAGES[activeStageIdx]?.label} ·{' '}
            {program ? program.dueLabel : 'Notified body review'}
          </div>
        </div>
        <button
          className="section-more"
          onClick={() =>
            onAskAna(
              `Assemble the IVDR technical file for ${program?.code ?? 'this IVD'} — Annex II/III structure: ` +
                `device description, GSPR checklist, analytical + clinical performance, and the declaration of ` +
                `conformity. Note any GSPR requirements still open.`,
            )
          }
        >
          Assemble technical file {I.fileText}
        </button>
      </div>

      <div className="stage-strip">
        {IVD_STAGES.map((s, i) => {
          const stateClass =
            i < activeStageIdx
              ? 'complete'
              : i === activeStageIdx
              ? programStatus === 'blocked'
                ? 'blocked'
                : 'active'
              : 'idle';
          return (
            <div key={s.id} className={`stage-node ${stateClass}`}>
              <div className="stage-dot">{i < activeStageIdx ? I.check : i + 1}</div>
              <div className="stage-label">{s.label}</div>
              <div className="stage-meta">{s.meta}</div>
            </div>
          );
        })}
      </div>

      {/* Honest fixture notice: distinct from live tenant data. Same posture as
          K510's predicate banner — never present example records as the
          tenant's own without saying so. */}
      {usingFixture && (
        <div
          className="banner-warn"
          role="status"
        >
          <span className="banner-ic">{I.alertCircle}</span>
          <span>
            Showing the canonical IVDR example so you can preview the workflow. Your tenant's
            classifications, validations and clinical evidence appear here once recorded via the IVDR module.
          </span>
        </div>
      )}

      <div className="col2">
        <div>
          {/* Annex VIII classification */}
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Classification · Annex VIII</div>
                <div className="s">
                  {sourceClass.length} device{sourceClass.length === 1 ? '' : 's'} · class A–D risk rules
                </div>
              </div>
              <div className="actions">
                <button
                  className="tb-btn"
                  title="Classify a device with AnA"
                  onClick={() =>
                    onAskAna(
                      `Classify ${subjectName} under IVDR Annex VIII. Walk the rule set, state the resulting ` +
                        `class (A–D), and list the conformity-assessment obligations that follow.`,
                    )
                  }
                >
                  {I.sparkles}
                </button>
              </div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Intended purpose</th>
                  <th>Class</th>
                  <th>Rule</th>
                </tr>
              </thead>
              <tbody>
                {sourceClass.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="k-name">{c.device}</div>
                      <div className="k-holder">
                        {[c.cdx && 'CDx', c.selfTest && 'Self-test', c.nearPatient && 'Near-patient']
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-300)' }}>{c.intendedPurpose}</td>
                    <td>
                      <span className={`status-pill ${c.classification === 'D' || c.classification === 'C' ? 'review' : 'complete'}`}>
                        Class {c.classification}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-300)' }}>
                      {c.rule ?? '—'}
                      {onAskAna && (
                        <AskAnaChip
                          onAsk={() => onAskAna(`Explain the IVDR Annex VIII rule that puts ${c.device} in Class ${c.classification}.`)}
                          label={`Ask AnA about ${c.device}`}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Clinical evidence 2×2 */}
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Clinical performance · 2×2 contingency</div>
                <div className="s">
                  {sourceClinical.length} stud{sourceClinical.length === 1 ? 'y' : 'ies'} · sensitivity · specificity · PPV · NPV
                </div>
              </div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Study</th>
                  <th>TP/FP/TN/FN</th>
                  <th>Sens.</th>
                  <th>Spec.</th>
                  <th>PPV</th>
                  <th>NPV</th>
                </tr>
              </thead>
              <tbody>
                {sourceClinical.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="k-name">{e.study}</div>
                      <span className={`status-pill ${e.status === 'complete' ? 'complete' : 'review'}`}>{e.status}</span>
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-300)' }}>
                      {e.tp}/{e.fp}/{e.tn}/{e.fn}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{pct(e.sensitivity)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{pct(e.specificity)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-300)' }}>{pct(e.ppv)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-300)' }}>{pct(e.npv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          {/* Analytical validation tracker */}
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Analytical validation</div>
                <div className="s">LoD · LoQ · precision (CV) · pass/fail</div>
              </div>
              <div className="actions">
                <button
                  className="tb-btn"
                  title="Draft the analytical performance section"
                  onClick={() =>
                    onAskAna(
                      `Summarize the analytical performance for ${subjectName} — LoD, LoQ, precision (repeatability ` +
                        `and reproducibility CV), and interference — and flag any parameter without an acceptance criterion.`,
                    )
                  }
                >
                  {I.play}
                </button>
              </div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Analyte</th>
                  <th>LoD</th>
                  <th>LoQ</th>
                  <th>CV%</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sourceValid.map((v) => (
                  <tr key={v.id}>
                    <td><div className="k-name">{v.analyte}</div></td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-300)' }}>{v.lod ?? '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-300)' }}>{v.loq ?? '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{v.precisionCV ?? '—'}</td>
                    <td><span className={`status-pill ${PARAM_PILL[v.status]}`}>{v.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* GSPR (Annex I) compliance matrix */}
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">GSPR compliance · Annex I</div>
                <div className="s">
                  {overallPercent}% compliant · {gsprTotals.open} requirement{gsprTotals.open === 1 ? '' : 's'} open
                </div>
              </div>
              <div className="actions">
                <button
                  className="tb-btn"
                  title="Close out open GSPR requirements with AnA"
                  onClick={() =>
                    onAskAna(
                      `Review the IVDR GSPR (Annex I) checklist for ${program?.code ?? 'this IVD'}. List every requirement ` +
                        `that is not yet compliant, the evidence each needs, and propose how to close the gaps.`,
                    )
                  }
                >
                  {I.shieldCheck}
                </button>
              </div>
            </div>
            <div className="estar">
              {sourceGspr.map((c) => {
                const chPct = c.total > 0 ? Math.round((c.compliant / c.total) * 100) : 0;
                return (
                  <div key={c.key} className="estar-row" style={{ cursor: 'default' }}>
                    <div className="estar-num">{c.key}</div>
                    <div className="estar-label">
                      {c.label}
                      <div className="s" style={{ marginTop: 2 }}>
                        {c.compliant}/{c.total} compliant
                        {c.nonCompliant > 0 ? ` · ${c.nonCompliant} non-compliant` : ''}
                        {c.notAssessed > 0 ? ` · ${c.notAssessed} not assessed` : ''}
                      </div>
                    </div>
                    <span className={`status-pill ${chPct >= 80 ? 'complete' : chPct >= 50 ? 'review' : 'draft'}`}>
                      {chPct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Companion diagnostics */}
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Companion diagnostics</div>
                <div className="s">Drug–diagnostic pairings · FDA/EMA approval · biomarker</div>
              </div>
            </div>
            <DataGate
              state={cdx.rows}
              label="companion diagnostic pairings"
              onRetry={cdx.refresh}
              emptyHint="Pair this diagnostic with a drug programme to coordinate CDx co-development."
            >
              {(rows) => (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Drug</th>
                      <th>Biomarker</th>
                      <th>Indication</th>
                      <th>Status</th>
                      <th>FDA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div className="k-name">{r.drugName}</div>
                          <div className="k-holder">{r.sponsor}</div>
                        </td>
                        <td style={{ color: 'var(--text-300)' }}>{r.biomarker}</td>
                        <td style={{ color: 'var(--text-300)' }}>{r.indication}</td>
                        <td>
                          <span className={`status-pill ${r.approvalStatus === 'approved' ? 'complete' : 'review'}`}>
                            {r.approvalStatus}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-300)' }}>{r.fdaApprovalDate ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DataGate>
          </div>

          {/* CLIA categorization */}
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">CLIA categorization</div>
                <div className="s">Complexity · CLIA waiver lifecycle · CMS letter</div>
              </div>
            </div>
            <DataGate
              state={clia.rows}
              label="CLIA categorizations"
              onRetry={clia.refresh}
              emptyHint="Categorize this test's CLIA complexity to plan a waiver strategy."
              regulation="Serves the CLIA complexity categorization"
            >
              {(rows) => (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Test</th>
                      <th>Analyte</th>
                      <th>Complexity</th>
                      <th>Waiver</th>
                      <th>CMS letter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="k-name">{r.testName}</td>
                        <td style={{ color: 'var(--text-300)' }}>{r.analyte}</td>
                        <td>
                          <span className={`status-pill ${r.complexity === 'waived' ? 'complete' : r.complexity === 'moderate' ? 'review' : 'draft'}`}>
                            {r.complexity}
                          </span>
                        </td>
                        <td>
                          {/* revoked is called out, never shown as granted —
                              a revoked waiver means operating outside the
                              certificate. */}
                          <span
                            className={`status-pill ${
                              r.waiver === 'granted' ? 'complete'
                                : r.waiver === 'revoked' ? 'draft'
                                : r.waiver === 'applied' ? 'review'
                                : ''
                            }`}
                          >
                            {r.waiver}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-300)' }}>{r.cmsLetterRef ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DataGate>
          </div>
        </div>
      </div>

      {/* The official FDA IVD eSTAR PDF — readiness gate, the governed field
          preview and the one Generate control. The family is the IVD eSTAR by
          construction here; the pathway follows the program's regulatory path. */}
      <OfficialEstarPanel program={program} type={officialEstarTypeFor(program)} variant="ivd" />

      {/* eSTAR filing journey — register → assess → produce-gate → track,
          org-scoped from the session. The IVD eSTAR shares this flow. */}
      <EstarFilingPanel />
    </>
  );

  return (
    <PathwayPanes
      pathway="ivd"
      workspace={workspace}
      onAskAna={onAskAna}
      onOpenEditor={onOpenEditor}
      programId={programId}
    />
  );
}

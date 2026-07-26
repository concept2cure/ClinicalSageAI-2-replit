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
import { useSampleRows, useSampleValue } from '../lib/useSampleRows';

export interface IvdSurfaceProps {
  program: Program | null;
  onAskAna: (text: string) => void;
  onOpenEditor?: (id: string | number) => void;
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
  const classifications = useIvdClassifications();
  const validations = useIvdValidations();
  const clinical = useIvdClinicalEvidence();
  const gspr = useIvdGsprMatrix(programId);

  const sourceClass = useSampleRows(classifications.rows, IVD_CLASSIFICATIONS);
  const sourceValid = useSampleRows(validations.rows, IVD_VALIDATIONS);
  const sourceClinical = useSampleRows(clinical.rows, IVD_CLINICAL);
  const sourceGspr = useSampleRows(gspr.rows, IVD_GSPR);

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
          style={{
            margin: '12px 0',
            padding: '10px 14px',
            background: 'var(--bg-050)',
            border: '1px solid var(--border-100)',
            borderLeft: '3px solid var(--accent-100)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--text-200)',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
          role="status"
        >
          <span style={{ color: 'var(--accent-100)' }}>{I.alertCircle}</span>
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
        </div>
      </div>
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

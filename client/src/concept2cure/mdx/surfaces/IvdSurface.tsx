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
import { IVD_STAGES, type IvdParamStatus } from '../data/ivd';
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
import { OfficialEstarPanel, officialEstarTypeFor, officialEstarVariantFor } from './OfficialEstarPanel';
import { readyRows, toDataState } from '../lib/dataState';
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

  /* Live or nothing. These four panels used to fall back to IVD_CLASSIFICATIONS,
     IVD_VALIDATIONS, IVD_CLINICAL and IVD_GSPR under sample mode — an invented
     Annex VIII class determination, an invented limit of detection, an invented
     sensitivity and specificity, and an invented conformity assessment against
     Annex I. This surface already refuses that for its CDx and CLIA panels, on
     the stated grounds that "an invented CDx approval or waiver grant is a
     regulatory claim"; a Class C determination and an LoD are the same kind of
     claim, and the three above fed a headline "% compliant".

     The notice that marked them was raised on
     `!classifications.rows && !validations.rows && !clinical.rows` — ALL three
     missing — so a tenant whose classifications loaded and whose validations
     failed saw invented analytical performance with nothing said at all. That
     partial case goes with the fixtures, and each panel now states its own
     reading through DataGate. */
  const classState = toDataState(classifications.rows, classifications.loading, classifications.error, {
    idleReason: 'Classifications are held per program.',
  });
  const validState = toDataState(validations.rows, validations.loading, validations.error, {
    idleReason: 'Analytical performance is held per program.',
  });
  const clinicalState = toDataState(clinical.rows, clinical.loading, clinical.error, {
    idleReason: 'Clinical performance is held per program.',
  });
  const gsprState = toDataState(gspr.rows, gspr.loading, gspr.error, {
    idleReason: 'The GSPR matrix is held per program.',
  });

  const sourceClass = readyRows(classState);
  const sourceValid = readyRows(validState);
  const sourceClinical = readyRows(clinicalState);
  const sourceGspr = readyRows(gsprState);

  /* Companion diagnostics and CLIA — the two IVD differentiators the
     platform review names, built and previously reachable only through
     AnA. Both follow the selected programme, like every other panel
     here, and render through DataGate so an empty programme reads empty
     rather than borrowing another assay's pairings. No sample fixtures:
     an invented CDx approval or waiver grant is a regulatory claim. */
  const cdx = useCdxPairings(programId);
  const clia = useCliaCategorizations(programId);

  const gsprTotals = sourceGspr.reduce(
    (acc, c) => ({
      total: acc.total + c.total,
      compliant: acc.compliant + c.compliant,
      open: acc.open + c.partiallyCompliant + c.nonCompliant + c.notAssessed,
    }),
    { total: 0, compliant: 0, open: 0 },
  );
  /* `?? 0` was safe while a fixture guaranteed rows. It is not safe now: an
     unread matrix has a total of 0, and rendering that as "0% compliant" states
     a conformity finding about a device nobody has assessed. Null means the
     figure is not available, and the header says so rather than publishing the
     most alarming value the arithmetic can produce. */
  const overallPercent =
    gspr.overallPercent ??
    (gsprTotals.total > 0 ? Math.round((gsprTotals.compliant / gsprTotals.total) * 100) : null);

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
                  title="Classify a device with AnA" aria-label="Classify a device with AnA"
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
            <DataGate
              state={classState}
              label="device classifications"
              onRetry={classifications.refresh}
              emptyHint="Classify this device under Annex VIII to populate the table."
              regulation="Serves the IVDR Annex VIII classification record"
            >
              {(rows) => (
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
                    {rows.map((c) => (
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
              )}
            </DataGate>
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
            <DataGate
              state={clinicalState}
              label="clinical performance studies"
              onRetry={clinical.refresh}
              emptyHint="Record a clinical performance study to populate the contingency table."
              regulation="Serves the IVDR Annex XIII performance evaluation"
            >
              {(rows) => (
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
                    {rows.map((e) => (
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
              )}
            </DataGate>
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
                  title="Draft the analytical performance section" aria-label="Draft the analytical performance section"
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
            <DataGate
              state={validState}
              label="analytical validations"
              onRetry={validations.refresh}
              emptyHint="Log an analytical performance study (LoD, precision, interference) to populate this table."
              regulation="Serves the IVDR Annex XIII analytical performance record"
            >
              {(rows) => (
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
                    {rows.map((v) => (
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
              )}
            </DataGate>
          </div>

          {/* GSPR (Annex I) compliance matrix */}
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">GSPR compliance · Annex I</div>
                <div className="s">
                  {overallPercent === null
                    ? 'Not yet assessed'
                    : `${overallPercent}% compliant · ${gsprTotals.open} requirement${
                        gsprTotals.open === 1 ? '' : 's'
                      } open`}
                </div>
              </div>
              <div className="actions">
                <button
                  className="tb-btn"
                  title="Close out open GSPR requirements with AnA" aria-label="Close out open GSPR requirements with AnA"
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
            <DataGate
              state={gsprState}
              label="GSPR chapters"
              onRetry={gspr.refresh}
              emptyHint="Start the GSPR matrix for this device to populate the chapter breakdown."
              regulation="Serves the IVDR Annex I general safety and performance requirements"
            >
              {(rows) => (
                <div className="estar">
                  {rows.map((c) => {
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
              )}
            </DataGate>
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

      {/*
        The official FDA eSTAR PDF — readiness gate, the governed field preview
        and the one Generate control.

        BOTH halves follow the program, neither is hardcoded. The literal
        variant="ivd" here was wrong for the same reason a literal type="pma" was
        wrong on the PMA surface: which surface is on screen is a NAVIGATION
        choice (MdxSurfaceHost switches on nav === 'device-diagnostics'), not a
        property of the selected program. Nothing stops an operator selecting a
        non-IVD device program and opening the Diagnostics tab, and the panel
        then produced their device on the IVD eSTAR — a different FDA template,
        with a different field map, for a submission that is not an IVD. The
        comment that used to sit here claimed the IVD family was "by
        construction"; there is no such construction.
      */}
      <OfficialEstarPanel
        program={program}
        type={officialEstarTypeFor(program)}
        variant={officialEstarVariantFor(program)}
      />

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

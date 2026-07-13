import React, { useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Inline fixture types ── */

interface RciAffect {
  dev: string;
  what: string;
  sub: string;
}

interface RciChange {
  id: string;
  src: string;
  kind: string;
  when: string;
  sev: string;
  live: boolean;
  title: string;
  summary: string;
  affects: RciAffect[];
  action: string;
  doc: string;
  owner: string;
  due: string;
}

/* ── Inline fixture data (kit window globals) ── */

const RCI_CHANGES: RciChange[] = [
  { id: 'QMSR', src: 'FDA · final rule', kind: 'regulation', when: 'Effective 2 Feb 2026', sev: 'high', live: true,
    title: 'QMSR — 21 CFR 820 harmonized to ISO 13485:2016',
    summary: 'FDA replaces the Quality System Regulation with the Quality Management System Regulation, incorporating ISO 13485 by reference. Terminology, records (DHF→Medical Device File), and management-review expectations change.',
    affects: [
      { dev: 'Quality system (all devices)', what: 'QMS docs re-mapped to ISO 13485 clauses; DHF→MDF terminology', sub: 'Org-wide' },
      { dev: 'BX-204 CGM', what: 'Design & Development File terminology in the 510(k) DHF', sub: '510(k) OR-902' },
    ],
    action: 'QMSR transition plan + gap analysis', doc: 'QMSR gap analysis & transition plan', owner: 'Quality', due: 'Effective now' },
  { id: 'AIACT', src: 'EU · regulation', kind: 'regulation', when: 'High-risk obligations Aug 2026', sev: 'high', live: true,
    title: 'EU AI Act — high-risk AI system obligations (medical devices)',
    summary: 'AI-enabled devices that are MDR/IVDR Class IIa+ are high-risk AI systems. Adds data-governance, transparency, human-oversight, and post-market-monitoring obligations layered on MDR — with conflicts to harmonize against ISO 14971.',
    affects: [{ dev: 'BX-204 predictive-low algorithm', what: 'AI Act technical documentation + ISO 14971 alignment', sub: 'EU MDR CE' }],
    action: 'AI Act dual-compliance assessment', doc: 'AI Act ↔ MDR harmonization dossier', owner: 'Reg', due: 'Aug 2026' },
  { id: 'CYBER', src: 'FDA · final guidance', kind: 'guidance', when: 'Jun 2025', sev: 'med', live: true,
    title: 'Cybersecurity in Premarket Submissions — SBOM required',
    summary: 'Connected devices must include a Software Bill of Materials, threat model, and security testing in the premarket submission. Applies to BX-204 (BLE connectivity).',
    affects: [{ dev: 'BX-204 CGM (BLE)', what: 'Add SBOM + threat model + pen-test report to eSTAR §15', sub: '510(k) OR-902' }],
    action: 'Cybersecurity documentation package', doc: 'SBOM + threat model + security testing', owner: 'Software', due: 'Before filing' },
  { id: '62304', src: 'IEC · standard revision', kind: 'standard', when: 'Ed 2 — transition', sev: 'med', live: false,
    title: 'IEC 62304 Edition 2 — software lifecycle',
    summary: 'Edition 2 broadens scope and revises safety-classification and legacy-software provisions. Affects all software-containing devices once harmonized.',
    affects: [{ dev: 'BX-204 firmware + app', what: 'Re-baseline software safety classification & lifecycle records', sub: '510(k) §15' }],
    action: 'Standard transition gap analysis', doc: 'IEC 62304 Ed 2 transition plan', owner: 'Software', due: 'Monitor' },
  { id: '10993', src: 'ISO · standard revision', kind: 'standard', when: '10993-1 revision', sev: 'low', live: false,
    title: 'ISO 10993-1 — biological evaluation revision',
    summary: 'Revised risk-based biocompatibility framework. Relevant to extended-wear skin contact (BX-204 14-day) and the open HZ-04 evaluation.',
    affects: [{ dev: 'BX-204 adhesive (14-day skin contact)', what: 'Re-confirm ISO 10993-11 endpoints under revised framework', sub: 'Risk file HZ-04' }],
    action: 'Biocompatibility re-assessment', doc: 'ISO 10993-1 gap memo', owner: 'Reg', due: 'Monitor' },
];

const _RCI_SEV: Record<string, string> = { high: 'err', med: 'warn', low: 'ok' };
const _RCI_SEVL: Record<string, string> = { high: 'Action required', med: 'Review', low: 'Monitor' };

/* ════ RegChange -- regulatory change intelligence surface ════ */

export function RegChange({ onAsk }: SurfaceViewProps) {
  const [open, setOpen] = useState<string | null>(RCI_CHANGES[0].id);
  const affecting = RCI_CHANGES.filter(c => c.affects.length).length;
  const actionReq = RCI_CHANGES.filter(c => c.sev === 'high').length;
  const live = RCI_CHANGES.filter(c => c.live).length;
  const ask = onAsk;

  return (
    <div className="reg-wrap">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Platform {I.dot} intelligence</div>
          <h1 className="reg-title">Regulatory change intelligence</h1>
          <p className="reg-sub">Horizon scan of FDA guidance, ISO/IEC standard revisions, and EU MDR/IVDR &amp; AI-Act changes &mdash; each assessed for impact against your portfolio and resolved to an action document. Not a feed: a worklist.</p>
        </div>
        {ask && <button className="reg-cta" onClick={() => ask('Scan regulatory changes affecting the BX-204 portfolio and draft the impact assessments')}>{I.sparkles} Scan with AnA</button>}
      </div>

      <div className="reg-kpis">
        <div className="reg-kpi"><div className="reg-kpi-v">{RCI_CHANGES.length}</div><div className="reg-kpi-l">Changes tracked</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">{affecting}</div><div className="reg-kpi-l">Affect your portfolio</div></div>
        <div className="reg-kpi" data-tone="err"><div className="reg-kpi-v">{actionReq}</div><div className="reg-kpi-l">Action required</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">{live}</div><div className="reg-kpi-l">In force / imminent</div></div>
      </div>

      <div className="rci-feed">
        {RCI_CHANGES.map(c => {
          const isOpen = open === c.id;
          return (
            <div key={c.id} className="rci-card" data-open={isOpen || undefined}>
              <button className="rci-top" onClick={() => setOpen(isOpen ? null : c.id)}>
                <span className={`rci-kind ${c.kind}`}>{c.kind}</span>
                <span className="rci-mid">
                  <span className="rci-title">{c.title}</span>
                  <span className="rci-meta">{c.src} {I.dot} {c.when}</span>
                </span>
                <span className={`reg-pill ${_RCI_SEV[c.sev]}`}>{_RCI_SEVL[c.sev]}</span>
                <span className="rci-chev">{isOpen ? I.chevDown : (I.chevRight || I.right)}</span>
              </button>
              {isOpen && (
                <div className="rci-body">
                  <p className="rci-summary">{c.summary}</p>
                  <div className="rci-impact-h">{I.network} Portfolio impact</div>
                  {c.affects.map((a, i) => (
                    <div key={i} className="rci-impact">
                      <div className="rci-imp-dev">{a.dev}<span className="rci-imp-sub">{a.sub}</span></div>
                      <div className="rci-imp-what">{a.what}</div>
                    </div>
                  ))}
                  <div className="rci-foot">
                    <div className="rci-doc">{I.fileText} Generates <b>{c.doc}</b> {I.dot} {c.owner} {I.dot} {c.due}</div>
                    <div className="rci-acts">
                      {ask && <button className="rci-act pri" onClick={() => ask(`Draft the ${c.doc} for ${c.title} — assess impact on the BX-204 portfolio`)}>{I.sparkles} Assess &amp; draft</button>}
                      {ask && <button className="rci-act" onClick={() => ask(`Show the full text and citations for ${c.title}`)}>Open source</button>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { SampleTag } from '../dataConnect';
import '../styles/project-home-v2.css';

/* -- Inline fixture types -- */

interface CoverageRow {
  region: string;
  payer: string;
  basis: string;
  code: string;
  status: string;
  note: string;
}

interface DossierSection {
  n: string;
  label: string;
  owner: string;
  st: string;
  pct: number;
  blocker?: boolean;
}

interface CodingRow {
  code: string;
  desc: string;
  kind: string;
  status: string;
  note: string;
}

/* -- Inline fixture data (kit-identical) -- */

const MA_COVERAGE: CoverageRow[] = [
  { region: 'United States', payer: 'CMS -- Medicare', basis: 'NCD / LCD', code: 'HCPCS E2103', status: 'covered', note: 'Therapeutic CGM covered; DME benefit category.' },
  { region: 'United States', payer: 'Commercial (UNH · Aetna · Cigna)', basis: 'Medical policy', code: 'CPT 95249', status: 'covered', note: 'Coverage with prior auth; A1c + insulin-use criteria.' },
  { region: 'United States', payer: 'Medicaid (state)', basis: 'State plan', code: '--', status: 'partial', note: 'Coverage varies by state; 32 of 50 cover therapeutic CGM.' },
  { region: 'United Kingdom', payer: 'NHS -- NICE', basis: 'HTA appraisal', code: '--', status: 'review', note: 'NICE TA in progress; positioned vs Libre 3 on cost-comparability.' },
  { region: 'Germany', payer: 'G-BA / GKV', basis: 'NUB / DiGA', code: '--', status: 'review', note: 'Benefit assessment pending; PMCF data supports.' },
  { region: 'France', payer: 'HAS / CNEDiMTS', basis: 'HTA appraisal', code: '--', status: 'planned', note: 'LPPR listing application planned post-CE.' },
  { region: 'Japan', payer: 'MHLW / Chuikyo', basis: 'Reimbursement pricing', code: '--', status: 'planned', note: 'C2 functional category sought after Shonin.' },
];

const MA_DOSSIER: DossierSection[] = [
  { n: '1', label: 'Executive value proposition', owner: 'HEOR', st: 'complete', pct: 100 },
  { n: '2', label: 'Disease & unmet-need background', owner: 'Med affairs', st: 'complete', pct: 100 },
  { n: '3', label: 'Clinical evidence summary (MARD, outcomes)', owner: 'Clinical', st: 'review', pct: 80 },
  { n: '4', label: 'Economic model -- budget impact', owner: 'HEOR', st: 'draft', pct: 55, blocker: true },
  { n: '5', label: 'Cost-effectiveness (ICER vs SMBG / Libre 3)', owner: 'HEOR', st: 'draft', pct: 40 },
  { n: '6', label: 'Comparative effectiveness table', owner: 'HEOR', st: 'review', pct: 75 },
];

const MA_CODING: CodingRow[] = [
  { code: 'HCPCS E2103', desc: 'Non-adjunctive CGM receiver/monitor', kind: 'Existing', status: 'mapped', note: 'Therapeutic CGM DME code applies.' },
  { code: 'CPT 95249', desc: 'CGM patient-owned -- startup/training', kind: 'Existing', status: 'mapped', note: 'Used for patient-owned device setup.' },
  { code: 'CPT 0XXXT', desc: 'Category III -- predictive-low algorithm', kind: 'New PLA/Cat-III', status: 'pursue', note: 'AnA recommends a Cat-III code application for the predictive feature.' },
];

/* -- Helpers -- */

function maPill(s: string): string {
  return (
    ({
      covered: 'ok',
      mapped: 'ok',
      complete: 'ok',
      review: 'review',
      partial: 'warn',
      draft: 'warn',
      pursue: 'warn',
      planned: 'idle',
    } as Record<string, string>)[s] || 'idle'
  );
}

/* ════ MarketAccess -- market access & reimbursement surface ════ */

export function MarketAccess({ onAsk }: SurfaceViewProps) {
  const [tab, setTab] = useState('coverage');
  const ask = (q: string) => onAsk && onAsk(q);

  const covered = MA_COVERAGE.filter((c) => c.status === 'covered').length;
  const kpis = [
    { v: String(MA_COVERAGE.length), l: 'Markets / payers' },
    { v: String(covered), l: 'Covered', tone: 'ok' },
    { v: String(MA_COVERAGE.filter((c) => c.status === 'review').length), l: 'In HTA review', tone: 'warn' },
    { v: '1', l: 'Value dossier' },
  ];
  const tabs: [string, string][] = [
    ['coverage', 'Coverage status'],
    ['dossier', 'Value dossier'],
    ['coding', 'Coding strategy'],
    ['strategy', 'Access strategy'],
  ];

  return (
    <div className="reg ma">
      <div className="reg-head">
        <div>
          <div className="reg-kicker">Platform · commercial</div>
          <h1 className="reg-title">Market access &amp; reimbursement <SampleTag sample={true} /></h1>
          <p className="reg-sub">
            Payer coverage, value dossiers and coding strategy -- the bridge from
            a cleared device to a reimbursed one. Grounds the market-access
            advisory, CMS coverage lookup, and value-dossier composer.
          </p>
        </div>
        <button
          className="reg-cta"
          onClick={() =>
            ask('Build a US + EU market-access plan for the BX-204 CGM')
          }
        >
          {I.sparkles} Plan with AnA
        </button>
      </div>

      <div className="reg-kpis">
        {kpis.map((k, i) => (
          <div key={i} className="reg-kpi">
            <div className="reg-kpi-v" data-tone={k.tone}>
              {k.v}
            </div>
            <div className="reg-kpi-l">{k.l}</div>
          </div>
        ))}
      </div>

      <div className="reg-tabs">
        {tabs.map(([id, l]) => (
          <button
            key={id}
            className={'reg-tab' + (tab === id ? ' on' : '')}
            onClick={() => setTab(id)}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'coverage' && (
        <div className="reg-panel">
          <table className="reg-tbl">
            <thead>
              <tr>
                <th>Market / payer</th>
                <th>Basis</th>
                <th>Code</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {MA_COVERAGE.map((c, i) => (
                <tr key={i}>
                  <td>
                    <div className="reg-mk">{c.region}</div>
                    <div className="reg-sub2">
                      {c.payer} · {c.note}
                    </div>
                  </td>
                  <td>{c.basis}</td>
                  <td className="mono">{c.code}</td>
                  <td>
                    <span className={'reg-pill ' + maPill(c.status)}>
                      {c.status}
                    </span>
                  </td>
                  <td className="reg-row-act">
                    <button
                      className="reg-ask"
                      onClick={() =>
                        ask(
                          `What evidence does ${c.payer} require for CGM coverage?`,
                        )
                      }
                    >
                      {I.sparkles} Evidence
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'dossier' && (
        <div className="reg-panel">
          <div className="ma-dossier-h">
            <div>
              <b>Global value dossier · BX-204</b>
              <span className="reg-sub2"> AMCP format · payer-ready</span>
            </div>
            <button
              className="reg-ask"
              onClick={() =>
                ask(
                  'Draft the budget-impact model section of the value dossier',
                )
              }
            >
              {I.sparkles} Draft section
            </button>
          </div>
          {MA_DOSSIER.map((s, i) => (
            <div
              key={i}
              className="ma-doc-row"
              data-blocker={s.blocker || undefined}
            >
              <span className="ma-doc-n">{s.n}</span>
              <div className="ma-doc-b">
                <div className="ma-doc-l">
                  {s.label}
                  {s.blocker && (
                    <span className="ma-blk">
                      {I.alertTriangle} gates submission
                    </span>
                  )}
                </div>
                <div className="ma-doc-track">
                  <span style={{ width: s.pct + '%' }} />
                </div>
              </div>
              <span className="reg-sub2">{s.owner}</span>
              <span className={'reg-pill ' + maPill(s.st)}>{s.st}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'coding' && (
        <div className="reg-panel">
          <table className="reg-tbl">
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Type</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {MA_CODING.map((c, i) => (
                <tr key={i}>
                  <td className="mono reg-mk">{c.code}</td>
                  <td>
                    {c.desc}
                    <div className="reg-sub2">{c.note}</div>
                  </td>
                  <td>{c.kind}</td>
                  <td>
                    <span className={'reg-pill ' + maPill(c.status)}>
                      {c.status}
                    </span>
                  </td>
                  <td className="reg-row-act">
                    {c.status === 'pursue' && (
                      <button
                        className="reg-ask"
                        onClick={() =>
                          ask(
                            `Draft a Category III / PLA code application for ${c.desc}`,
                          )
                        }
                      >
                        {I.sparkles} Application
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'strategy' && (
        <div className="reg-panel reg-panel-pad">
          <div className="ma-strat">
            <p>
              AnA's access sequencing for BX-204, positioned against Libre 3 on
              cost-comparability:
            </p>
            <ul>
              <li>
                <b>US first</b> -- leverage existing therapeutic-CGM coverage
                (HCPCS E2103); fastest path to revenue, no new NCD needed.
              </li>
              <li>
                <b>Pursue a Category III code</b> for the predictive-low
                algorithm to differentiate and support a premium pad.
              </li>
              <li>
                <b>UK / NICE</b> -- submit a cost-comparison case vs Libre 3;
                the ~30% list gap is the lever payers expect.
              </li>
              <li>
                <b>Germany / France</b> -- sequence post-CE; PMCF outcomes feed
                the G-BA / HAS dossiers.
              </li>
            </ul>
            <button
              className="reg-ask"
              onClick={() =>
                ask(
                  'Generate the full global market-access strategy document for BX-204',
                )
              }
            >
              {I.sparkles} Generate strategy document
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

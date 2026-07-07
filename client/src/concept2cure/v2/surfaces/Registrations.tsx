import React, { useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Inline fixture types ── */

interface RegMarketRow {
  mkt: string;
  auth: string;
  flag: string;
  proc: string;
  id: string;
  status: string;
  granted: string;
  expiry: string;
  next: string;
  days: number | null;
}

interface RegApproval {
  mkt: string;
  proc: string;
  day: number;
  total: number;
  milestone: string;
  tone: string;
}

interface RegVariation {
  mkt: string;
  type: string;
  cls: string;
  status: string;
  due: string;
  tone: string;
}

interface RegCommitment {
  mkt: string;
  body: string;
  commitment: string;
  due: string;
  status: string;
  tone: string;
}

interface RegStrategy {
  strat: string;
  why: string;
  mkts: string;
}

interface RegDossierDoc {
  n: string;
  st: string;
  sec: string;
  blocker?: boolean;
}

interface RegDossierCert {
  n: string;
  id: string;
  granted: string;
}

interface RegDossier {
  filing: string;
  docs: RegDossierDoc[];
  cert: RegDossierCert | null;
}

/* ── Inline fixture data (kit window globals) ── */

const REG_MARKETS: RegMarketRow[] = [
  { mkt: 'United States', auth: 'FDA · CDRH', flag: 'US', proc: '510(k)', id: 'K-pending', status: 'under-review', granted: '—', expiry: '—', next: 'AI-Hold response due', days: 6 },
  { mkt: 'European Union', auth: 'EU · BSI (NB 2797)', flag: 'EU', proc: 'MDR CE · Annex IX', id: '—', status: 'under-review', granted: '—', expiry: '—', next: 'NB Day-120 questions', days: 64 },
  { mkt: 'United Kingdom', auth: 'MHRA · UKCA', flag: 'UK', proc: 'UKCA (NI bridge)', id: '—', status: 'planned', granted: '—', expiry: '—', next: 'File after CE mark', days: null },
  { mkt: 'Canada', auth: 'Health Canada', flag: 'CA', proc: 'MDL · Class III', id: '—', status: 'planned', granted: '—', expiry: '—', next: 'MDSAP cert prerequisite', days: null },
  { mkt: 'Japan', auth: 'PMDA · MHLW', flag: 'JP', proc: 'Todokede (Class II)', id: '—', status: 'planned', granted: '—', expiry: '—', next: 'Appoint MAH', days: null },
  { mkt: 'Australia', auth: 'TGA', flag: 'AU', proc: 'ARTG · Class IIb', id: '—', status: 'planned', granted: '—', expiry: '—', next: 'Reliance on CE', days: null },
];

const REG_LIVE: RegMarketRow[] = [
  { mkt: 'United States', auth: 'FDA · CDRH', flag: 'US', proc: '510(k)', id: 'K221847-equiv · OR-801', status: 'approved', granted: '2024-03-12', expiry: '—', next: 'Annual registration · Oct', days: 130 },
  { mkt: 'European Union', auth: 'EU · BSI', flag: 'EU', proc: 'MDR CE', id: 'CE 2797/OR-801', status: 'approved', granted: '2024-07-30', expiry: '2029-07-29', next: 'PSUR due Jul', days: 38 },
  { mkt: 'Canada', auth: 'Health Canada', flag: 'CA', proc: 'MDL', id: 'MDL 108422', status: 'approved', granted: '2024-09-02', expiry: '2025-09-01', next: 'Licence renewal', days: 71 },
];

const REG_APPROVALS: RegApproval[] = [
  { mkt: 'United States', proc: '510(k) substantial equivalence', day: 91, total: 90, milestone: 'Interactive review · AI-Hold open', tone: 'warn' },
  { mkt: 'European Union', proc: 'MDR Annex IX conformity', day: 120, total: 210, milestone: 'Day-120 List of Questions issued', tone: 'ai' },
];

const REG_VARIATIONS: RegVariation[] = [
  { mkt: 'European Union', type: 'PSUR (Periodic Safety Update)', cls: 'OR-801', status: 'due', due: 'in 38 days', tone: 'warn' },
  { mkt: 'Canada', type: 'Licence renewal (annual)', cls: 'OR-801', status: 'due', due: 'in 71 days', tone: 'warn' },
  { mkt: 'United States', type: 'Annual registration & listing', cls: 'OR-801', status: 'on-track', due: 'in 130 days', tone: 'ok' },
  { mkt: 'European Union', type: 'Significant change notification', cls: 'BX-204 14-day wear', status: 'assess', due: 'gate: design freeze', tone: 'ai' },
];

const REG_COMMITMENTS: RegCommitment[] = [
  { mkt: 'United States', body: 'FDA', commitment: 'Post-approval stratified-accuracy study (age bands)', due: '2026-12-31', status: 'open', tone: 'warn' },
  { mkt: 'European Union', body: 'BSI', commitment: 'PMCF survey — 14-day wear real-world performance', due: '2026-09-30', status: 'open', tone: 'ai' },
  { mkt: 'European Union', body: 'BSI', commitment: 'Annual CER update (Class III)', due: '2027-07-30', status: 'scheduled', tone: 'neutral' },
];

const REG_STRATEGY: RegStrategy[] = [
  { strat: 'CE mark first, then UKCA + reliance markets', why: 'BSI conformity unlocks UK (NI bridge), AU (TGA reliance), and supports MDSAP for Canada.', mkts: 'EU → UK · AU · CA' },
  { strat: 'PMDA via registered MAH', why: 'Class II Todokede is the fastest Japan route once a Marketing Authorization Holder is appointed.', mkts: 'JP' },
  { strat: 'Defer NMPA', why: 'China type-testing + local clinical adds 12–18 months; sequence after core markets clear.', mkts: 'CN' },
];

const REG_DOSSIERS: Record<string, RegDossier> = {
  'OR-801·United States': { filing: 'eSTAR 510(k) · K-OR801', docs: [
    { n: 'eSTAR submission package', st: 'submitted', sec: '19 sections' },
    { n: '510(k) Summary', st: 'submitted', sec: '§807.92' },
    { n: 'Indications for Use (FDA 3881)', st: 'submitted', sec: 'Form' },
    { n: 'SE comparison & discussion', st: 'submitted', sec: '§11' },
  ], cert: { n: 'FDA clearance letter · OR-801', id: 'K-OR801', granted: '2024-03-12' } },
  'OR-801·European Union': { filing: 'MDR Technical Documentation · Annex II/III', docs: [
    { n: 'Clinical Evaluation Report', st: 'approved', sec: 'MEDDEV 2.7/1 r4' },
    { n: 'GSPR conformity matrix', st: 'approved', sec: 'Annex I · 23 GSPRs' },
    { n: 'Risk management file', st: 'approved', sec: 'ISO 14971' },
    { n: 'Declaration of Conformity', st: 'approved', sec: 'Art 19' },
  ], cert: { n: 'CE certificate · BSI 2797', id: 'CE 2797/OR-801', granted: '2024-07-30' } },
  'OR-801·Canada': { filing: 'MDL application · Class III', docs: [
    { n: 'Device licence application', st: 'approved', sec: 'MDL' },
    { n: 'MDSAP certificate', st: 'approved', sec: 'ISO 13485' },
    { n: 'Labelling (bilingual)', st: 'approved', sec: 'EN/FR' },
  ], cert: { n: 'Health Canada MDL', id: 'MDL 108422', granted: '2024-09-02' } },
  'BX-204·United States': { filing: 'eSTAR 510(k) · in review', docs: [
    { n: 'eSTAR submission package', st: 'submitted', sec: '19 sections' },
    { n: 'SE determination (§11)', st: 'in-review', sec: 'AI-Hold open' },
    { n: 'Clinical performance — stratified accuracy', st: 'draft', sec: '§11.4 · blocker', blocker: true },
    { n: 'Biocompatibility (ISO 10993-11)', st: 'in-review', sec: '14-day wear' },
  ], cert: null },
  'BX-204·European Union': { filing: 'MDR Technical Documentation · in NB review', docs: [
    { n: 'Clinical Evaluation Report', st: 'in-review', sec: 'Day-120 Qs' },
    { n: 'GSPR conformity matrix', st: 'submitted', sec: 'Annex I' },
    { n: 'PMS / PMCF plan', st: 'draft', sec: 'Annex XIV' },
  ], cert: null },
};

const _rgStatusPill: Record<string, string> = { approved: 'ok', 'under-review': 'warn', planned: 'neutral' };
const _rgStatusLabel: Record<string, string> = { approved: 'Approved', 'under-review': 'Under review', planned: 'Planned' };
const _rgDocPill: Record<string, string> = { approved: 'ok', submitted: 'ai', 'in-review': 'warn', draft: 'neutral' };

/* ── RegRow sub-component (expandable dossier) ── */

interface RegRowProps {
  r: RegMarketRow;
  prod: string;
  onAsk: ((text: string) => void) | undefined;
}

function RegRow({ r, prod, onAsk }: RegRowProps) {
  const [open, setOpen] = useState(false);
  const dossier = REG_DOSSIERS[prod + '·' + r.mkt];
  return (
    <>
      <tr className={'reg-row' + (dossier ? ' has-doss' : '') + (open ? ' open' : '')} onClick={() => dossier && setOpen(o => !o)}>
        <td><div className="reg-mkt">{dossier && <span className="reg-caret">{open ? I.chevDown : (I.chevRight || I.right)}</span>}<span className="reg-flag">{r.flag}</span><div><div className="reg-mkt-n">{r.mkt}</div><div className="reg-mkt-a">{r.auth}</div></div></div></td>
        <td className="reg-proc">{r.proc}</td>
        <td><span className="reg-id">{r.id}</span></td>
        <td><span className={`reg-pill ${_rgStatusPill[r.status] || 'neutral'}`}>{_rgStatusLabel[r.status] || r.status}</span></td>
        <td className="reg-date">{r.granted}</td>
        <td className="reg-date">{r.expiry}</td>
        <td><div className="reg-next"><span>{r.next}</span>{r.days != null && <span className={`reg-next-d ${r.days <= 14 ? 'warn' : ''}`}>{r.days}d</span>}</div></td>
      </tr>
      {open && dossier && (
        <tr className="reg-doss-row"><td colSpan={7}>
          <div className="reg-doss">
            <div className="reg-doss-h"><span className="reg-doss-l">{I.folder} {dossier.filing}</span><span className="reg-doss-c">{dossier.docs.length} documents</span></div>
            <div className="reg-doss-list">
              {dossier.docs.map((d, j) => (
                <button key={j} className={'reg-doc' + (d.blocker ? ' blk' : '')} onClick={(e) => { e.stopPropagation(); onAsk && onAsk(`Open "${d.n}" from the ${r.mkt} ${prod} dossier`); }}>
                  <span className="reg-doc-ic">{I.fileText}</span>
                  <span className="reg-doc-n">{d.n}</span>
                  <span className="reg-doc-sec">{d.sec}</span>
                  <span className={`reg-pill ${_rgDocPill[d.st] || 'neutral'}`}>{d.st}</span>
                  <span className="reg-doc-go">{I.arrowRight || I.right}</span>
                </button>
              ))}
            </div>
            {dossier.cert
              ? <button className="reg-cert" onClick={(e) => { e.stopPropagation(); onAsk && onAsk(`Open the authorization document ${dossier.cert!.id} for ${r.mkt}`); }}>{I.shieldCheck || I.check}<span><b>{dossier.cert.n}</b> {I.dot} {dossier.cert.id} {I.dot} granted {dossier.cert.granted}</span><span className="reg-doc-go">{I.download || I.arrowRight}</span></button>
              : <div className="reg-cert pending">{I.clock} Authorization document issues once the agency review clock closes.</div>}
          </div>
        </td></tr>
      )}
    </>
  );
}

/* ════ Registrations -- global registration lifecycle surface ════ */

export function Registrations({ onAsk }: SurfaceViewProps) {
  const [tab, setTab] = useState('reg');
  const all = [...REG_LIVE, ...REG_MARKETS];
  const approved = all.filter(r => r.status === 'approved').length;
  const review = all.filter(r => r.status === 'under-review').length;
  const openCommit = REG_COMMITMENTS.filter(c => c.status === 'open').length;
  const tabs: [string, string][] = [['reg', 'Registrations'], ['clock', 'Approvals tracker'], ['vary', 'Renewals & variations'], ['commit', 'HA commitments'], ['strategy', 'Submission strategy']];

  const ask = (q: string) => onAsk && onAsk(q);

  return (
    <div className="page-host reg">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Lifecycle {I.dot} cross-market</div>
          <h1 className="reg-title">Registrations</h1>
          <p className="reg-sub">Authorization status across markets, agency review clocks, renewals &amp; variations, and health-authority commitments &mdash; one registration ledger for every market you file in.</p>
        </div>
        <button className="reg-ask" onClick={() => ask('Build a global registration & sequencing plan for BX-204')}>{I.sparkles} Plan markets with AnA</button>
      </div>

      <div className="reg-kpis">
        <div className="reg-kpi"><div className="reg-kpi-v">{all.length}</div><div className="reg-kpi-l">Markets {I.dot} 2 products</div></div>
        <div className="reg-kpi" data-tone="ok"><div className="reg-kpi-v">{approved}</div><div className="reg-kpi-l">Approved / cleared</div></div>
        <div className="reg-kpi" data-tone="warn"><div className="reg-kpi-v">{review}</div><div className="reg-kpi-l">Under review {I.dot} on clocks</div></div>
        <div className="reg-kpi" data-tone="ai"><div className="reg-kpi-v">{openCommit}</div><div className="reg-kpi-l">Open HA commitments</div></div>
      </div>

      <div className="reg-tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={`reg-tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'reg' && (
        <div className="reg-card">
          <table className="reg-tbl">
            <thead><tr><th>Market</th><th>Procedure</th><th>Registration</th><th>Status</th><th>Granted</th><th>Expiry</th><th>Next action</th></tr></thead>
            <tbody>
              <tr className="reg-group"><td colSpan={7}>OR-801 &mdash; on market</td></tr>
              {REG_LIVE.map((r, i) => <RegRow key={'l' + i} r={r} prod="OR-801" onAsk={onAsk} />)}
              <tr className="reg-group"><td colSpan={7}>BX-204 &mdash; in registration</td></tr>
              {REG_MARKETS.map((r, i) => <RegRow key={'m' + i} r={r} prod="BX-204" onAsk={onAsk} />)}
            </tbody>
          </table>
          <div className="reg-standards">
            <span className="reg-std-l">Submission data standards</span>
            <span className="reg-std ok">{I.check} eSTAR (FDA CDRH) &mdash; shipped</span>
            <span className="reg-std ok">{I.check} eCTD compile {I.dot} validate {I.dot} export &mdash; shipped</span>
            <span className="reg-std gap">{I.alertTriangle} EUDAMED M2M &mdash; not in the platform yet {I.dot} flagged</span>
            <span className="reg-std gap">{I.alertTriangle} EU IDMP / xEVMPD &mdash; not in the platform yet {I.dot} flagged</span>
          </div>
        </div>
      )}

      {tab === 'clock' && (
        <div className="reg-card reg-pad">
          <div className="reg-sec-l">Agency review clocks</div>
          {REG_APPROVALS.map((a, i) => (
            <div key={i} className="reg-clock">
              <div className="reg-clock-top"><span className="reg-clock-m">{a.mkt}</span><span className="reg-clock-p">{a.proc}</span><span className={`reg-pill ${a.tone}`}>Day {a.day} / {a.total}</span></div>
              <div className="reg-clock-bar"><div className={`reg-clock-fill ${a.tone}`} style={{ width: Math.min(100, (a.day / a.total) * 100) + '%' }} /></div>
              <div className="reg-clock-ms">{a.milestone}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'vary' && (
        <div className="reg-card">
          <table className="reg-tbl">
            <thead><tr><th>Market</th><th>Type</th><th>Product</th><th>Status</th><th>Due</th><th></th></tr></thead>
            <tbody>
              {REG_VARIATIONS.map((v, i) => (
                <tr key={i}>
                  <td className="reg-proc">{v.mkt}</td>
                  <td className="reg-mkt-n">{v.type}</td>
                  <td className="reg-date">{v.cls}</td>
                  <td><span className={`reg-pill ${v.tone}`}>{v.status}</span></td>
                  <td className="reg-date">{v.due}</td>
                  <td><button className="reg-link" onClick={() => ask(`Prepare the ${v.type} for ${v.mkt} (${v.cls})`)}>{I.sparkles} Prepare</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'commit' && (
        <div className="reg-card">
          <table className="reg-tbl">
            <thead><tr><th>Market</th><th>Body</th><th>Commitment</th><th>Due</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {REG_COMMITMENTS.map((c, i) => (
                <tr key={i}>
                  <td className="reg-proc">{c.mkt}</td>
                  <td className="reg-date">{c.body}</td>
                  <td className="reg-mkt-n">{c.commitment}</td>
                  <td className="reg-date">{c.due}</td>
                  <td><span className={`reg-pill ${c.tone}`}>{c.status}</span></td>
                  <td><button className="reg-link" onClick={() => ask(`Track and draft the commitment: ${c.commitment} (${c.mkt})`)}>{I.arrowRight} Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'strategy' && (
        <div className="reg-card reg-pad">
          <div className="reg-sec-l">Submission strategy &amp; reliance pathways</div>
          {REG_STRATEGY.map((s, i) => (
            <div key={i} className="reg-strat">
              <div className="reg-strat-h"><span className="reg-strat-t">{s.strat}</span><span className="reg-strat-m">{s.mkts}</span></div>
              <div className="reg-strat-w">{s.why}</div>
            </div>
          ))}
          <div className="reg-note">{I.sparkles} AnA sequences markets to reuse one evidence package across reliance pathways &mdash; minimizing redundant testing while covering every market's delta.</div>
        </div>
      )}
    </div>
  );
}

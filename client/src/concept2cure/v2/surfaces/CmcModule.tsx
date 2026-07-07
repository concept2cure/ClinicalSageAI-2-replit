import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';

/* ═══════════════════════════════════════════════════════════════════
   CMC -- Module 3 operating system. Ports the full cmc/ module:
   Overview with GOVERNED section approvals (21 CFR §11 e-sign),
   Specifications with full create / edit / approve, a working
   Change-impact SIMULATOR, Stability with a real shelf-life
   PROJECTION, Batch records, Blueprint, Global, Program records
   and the CMC copilot.

   Overrides the thin SURFACE_VIEWS['cmc'] with this full module.
   ═══════════════════════════════════════════════════════════════════ */

/* ── Inline fixture types ── */

interface CmcNavItem { id: string; label: string; icon: string; }
interface CmcPortfolio { sub: string; product: string; region: string; type: string; rpi: number; ir: number; }
interface CmcSection { key: string; path: string; st: string; audit?: string; _new?: boolean; }
interface CmcSpecRow { id: number; attr: string; material: string; method: string; release: string; shelf: string; ich: string; st: string; noMethod?: boolean; audit?: string; _new?: boolean; }
interface CmcStabData { attr: string; cond: string; limit: number; unit: string; points: { m: number; v: number }[]; }
interface CmcBatch { id: string; stage: string; yield: number; dev: number; st: string; _new?: boolean; }
interface CmcBlueprint { s: string; l: string; ready: boolean; need?: string; }
interface CmcGlobal { region: string; ready: number; gaps: string[]; }
interface CmcCorrespondence { ag: string; kind: string; subj: string; due: string; tone: string; }
interface CmcChangeType { id: string; label: string; risk: string; }
interface CmcChangeResult { type: CmcChangeType; markets: string[]; desc: string; paths: { m: string; label: string; path: string[] }[]; }

/* ── Inline fixture data (kit window globals) ── */

const CMC_NAV: CmcNavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'beaker' },
  { id: 'specs', label: 'Specifications', icon: 'clipboardList' },
  { id: 'stability', label: 'Stability', icon: 'barChart' },
  { id: 'batch', label: 'Batch records', icon: 'grid' },
  { id: 'change', label: 'Change simulator', icon: 'gitBranch' },
  { id: 'blueprint', label: 'Blueprint', icon: 'template' },
  { id: 'global', label: 'Global', icon: 'globe' },
  { id: 'pathway', label: 'Program records', icon: 'scroll' },
  { id: 'copilot', label: 'Copilot', icon: 'sparkles' },
];

const CMC_SUGGEST: Record<string, string[]> = {
  overview: ['Run the ICH compliance check and show every gap', 'Generate the drug-substance control strategy', 'What is blocking my shelf-life claim?'],
  specs: ['Justify the release and shelf-life limits for aggregation', 'Flag any specification without a validated method', 'Compare release vs shelf-life limits across DS and DP'],
  stability: ['Project shelf life from the long-term data with an ICH Q1E fit', 'Show every study trending toward a limit', 'Draft the stability summary for §3.2.S.7'],
  batch: ['Summarize deviations across the last 10 batches', 'Show batches still pending release', 'Trend yield across drug-product batches'],
  copilot: ['Explain ICH Q6B expectations for charge-variant specs', 'Draft a method-validation justification for sub-visible particles', 'What evidence supports a 24-month shelf-life claim?'],
};

const CMC_PORT: CmcPortfolio[] = [
  { sub: 'BLA 761xxx', product: 'BX-204', region: 'US', type: 'BLA', rpi: 82, ir: 1 },
  { sub: 'MAA EU', product: 'BX-204', region: 'EU', type: 'MAA', rpi: 74, ir: 1 },
  { sub: 'NDA 212345', product: 'BX-204', region: 'US', type: 'NDA', rpi: 71, ir: 0 },
  { sub: 'J-NDA', product: 'BX-204', region: 'JP', type: 'J-NDA', rpi: 66, ir: 0 },
];

const CMC_SECTIONS_SEED: CmcSection[] = [
  { key: '3.2.S.1', path: 'General information', st: 'approved' },
  { key: '3.2.S.2', path: 'Manufacture', st: 'approved' },
  { key: '3.2.S.3', path: 'Characterisation', st: 'review' },
  { key: '3.2.S.4', path: 'Control of drug substance', st: 'review' },
  { key: '3.2.S.7', path: 'Stability', st: 'draft' },
  { key: '3.2.P.3', path: 'Manufacture (DP)', st: 'review' },
  { key: '3.2.P.5', path: 'Control of drug product', st: 'draft' },
  { key: '3.2.P.8', path: 'Stability (DP)', st: 'draft' },
];

const CMC_SPECROWS_SEED: CmcSpecRow[] = [
  { id: 1, attr: 'Appearance', material: 'Drug substance', method: 'Visual', release: 'Clear to opalescent', shelf: 'Clear to opalescent', ich: 'ICH Q6B', st: 'approved' },
  { id: 2, attr: 'Protein content', material: 'Drug substance', method: 'UV A280', release: '95-105% label', shelf: '90-110% label', ich: 'ICH Q6B', st: 'approved' },
  { id: 3, attr: 'Aggregates (HMWS)', material: 'Drug substance', method: 'SE-HPLC', release: '<= 2.0%', shelf: '<= 3.0%', ich: 'ICH Q6B', st: 'review' },
  { id: 4, attr: 'Charge variants', material: 'Drug substance', method: 'icIEF', release: 'Main >= 60%', shelf: 'Main >= 55%', ich: 'ICH Q6B', st: 'draft' },
  { id: 5, attr: 'Bioburden', material: 'Drug product', method: 'USP <61>', release: '<= 10 CFU/10 mL', shelf: '--', ich: 'ICH Q6A', st: 'review' },
  { id: 6, attr: 'Sub-visible particles', material: 'Drug product', method: 'USP <787>', release: 'Meets <787>', shelf: 'Meets <787>', ich: 'ICH Q6A', st: 'draft', noMethod: true },
];

const CMC_STAB_SEED: CmcStabData = {
  attr: 'Aggregates (HMWS) -- SE-HPLC', cond: '25 C / 60% RH (long-term)', limit: 3.0, unit: '%',
  points: [{ m: 0, v: 1.2 }, { m: 3, v: 1.4 }, { m: 6, v: 1.6 }, { m: 9, v: 1.7 }, { m: 12, v: 1.9 }, { m: 18, v: 2.2 }],
};

const CMC_BATCHES_SEED: CmcBatch[] = [
  { id: 'BX204-DS-2401', stage: 'Drug substance', yield: 94, dev: 0, st: 'released' },
  { id: 'BX204-DS-2402', stage: 'Drug substance', yield: 91, dev: 1, st: 'pending' },
  { id: 'BX204-DP-2405', stage: 'Drug product', yield: 97, dev: 0, st: 'released' },
  { id: 'BX204-DP-2406', stage: 'Drug product', yield: 88, dev: 2, st: 'pending' },
];

const CMC_BP: CmcBlueprint[] = [
  { s: '3.2.S.2.2', l: 'Description of manufacturing process', ready: true },
  { s: '3.2.S.4.1', l: 'Specification (drug substance)', ready: true },
  { s: '3.2.S.7.1', l: 'Stability summary and conclusion', ready: true },
  { s: '3.2.P.3.3', l: 'Description of manufacturing process (DP)', ready: false, need: 'batch records incomplete' },
  { s: '3.2.P.5.1', l: 'Specification (drug product)', ready: true },
];

const CMC_GLOBAL: CmcGlobal[] = [
  { region: 'FDA', ready: 82, gaps: ['3.2.S.4 method validation'] },
  { region: 'EMA', ready: 74, gaps: ['Nitrosamine risk assessment', 'GMP certificate (EU site)'] },
  { region: 'PMDA', ready: 66, gaps: ['Japan-specific release tests', 'MF registration'] },
];

const CMC_CORR: CmcCorrespondence[] = [
  { ag: 'FDA', kind: 'Information Request', subj: '§3.2.S.4.4 comparability acceptance criteria', due: 'due 12d', tone: 'warn' },
  { ag: 'EMA', kind: 'Day-120 LoQ', subj: 'Nitrosamine risk assessment', due: 'due 30d', tone: 'warn' },
  { ag: 'PMDA', kind: 'Consultation', subj: 'Japan release-test bridging', due: 'scheduled', tone: 'info' },
];

const CMC_CHANGE_TYPES: CmcChangeType[] = [
  { id: 'api_supplier_change', label: 'API supplier change', risk: 'high' },
  { id: 'process_scale_up', label: 'Process scale-up', risk: 'med' },
  { id: 'excipient_replacement', label: 'Excipient replacement', risk: 'high' },
  { id: 'analytical_method_change', label: 'Analytical method change', risk: 'med' },
  { id: 'facility_change', label: 'Facility change', risk: 'high' },
  { id: 'equipment_change', label: 'Equipment change', risk: 'low' },
  { id: 'process_parameter_change', label: 'Process parameter change', risk: 'med' },
  { id: 'specification_change', label: 'Specification change', risk: 'med' },
  { id: 'packaging_change', label: 'Packaging change', risk: 'low' },
];

const CMC_MARKETS: [string, string][] = [['fda', 'FDA'], ['ema', 'EMA'], ['pmda', 'PMDA'], ['nmpa', 'NMPA'], ['health_canada', 'Health Canada'], ['uk_mhra', 'UK MHRA']];

/* ── Inline helpers ── */

function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const fire = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2400); };
  return [msg, fire];
}
function C2CToast({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="de-toast"><span className="ico">{I.checkCircle}</span>{msg}</div>;
}

function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const lines = md.split('\n'); let html = ''; let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (/^#{1,6}\s/.test(ln)) { const lv = ln.match(/^#+/)![0].length; html += `<h${lv}>${inline(ln.replace(/^#+\s/, ''))}</h${lv}>`; i++; continue; }
    if (/^---\s*$/.test(ln)) { html += '<hr/>'; i++; continue; }
    if (/^\|/.test(ln)) { const rows: string[] = []; while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      const cells = (r: string) => r.split('|').slice(1, -1).map(c => c.trim());
      let t = '<table><thead><tr>'; cells(rows[0]).forEach(c => t += `<th>${inline(c)}</th>`); t += '</tr></thead><tbody>';
      for (let r = 2; r < rows.length; r++) { t += '<tr>'; cells(rows[r]).forEach(c => t += `<td>${inline(c)}</td>`); t += '</tr>'; } t += '</tbody></table>'; html += t; continue; }
    if (/^[-*]\s/.test(ln)) { let ul = '<ul>'; while (i < lines.length && /^[-*]\s/.test(lines[i])) { ul += `<li>${inline(lines[i].replace(/^[-*]\s/, ''))}</li>`; i++; } ul += '</ul>'; html += ul; continue; }
    if (ln.trim() === '') { i++; continue; }
    html += `<p>${inline(ln)}</p>`; i++;
  }
  return html;
}

/* ── Governed §11.50 e-sign form config ── */
function signForm(target: string): C2CFormConfig {
  return {
    eyebrow: '21 CFR §11.50 -- e-signature', title: 'Sign to approve', sub: target, submitLabel: 'Sign & approve',
    governed: 'Your signature is recorded with the approval\'s audit entry; the approved version is locked.',
    fields: [
      { key: 'meaning', label: 'Meaning of signature', type: 'select', options: ['Approval', 'Author', 'Reviewer', 'Responsibility'], default: 'Approval', required: true },
      { key: 'reason', label: 'Reason', type: 'textarea', placeholder: 'Reason for this approval...', required: true },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'Re-enter your password', required: true, half: true },
      { key: 'totp', label: 'Authenticator', type: 'text', placeholder: '6-digit code', half: true },
    ],
  };
}
function auditId(): string { return 'AUD-' + (Math.floor(Math.random() * 9000) + 1000); }

/* ── Cross-surface navigation helpers ── */
function cmcNav(onNav: ((id: string) => void) | undefined, id: string) { try { localStorage.setItem('c2c_open_surface', id); } catch (_e) { /* noop */ } onNav && onNav(id); }
function cmcCtx(label: string) { try { if ((window as any).C2C) (window as any).C2C.setContext({ entityType: 'cmc', entityId: label, entityLabel: label }); } catch (_e) { /* noop */ } }
function cmcTask(label: string) { cmcCtx(label); try { if ((window as any).C2C) (window as any).C2C.open('task'); } catch (_e) { /* noop */ } }
function cmcCollab(label: string) { cmcCtx(label); try { if ((window as any).C2C) (window as any).C2C.open('collab'); } catch (_e) { /* noop */ } }

/* ── Shared subcomponents ── */

function CmConnectBar({ nav }: { nav?: (id: string) => void }) {
  return (
    <div className="cm-connect">
      <span className="cm-connect-l">This work flows into</span>
      <button onClick={() => cmcNav(nav, 'dossier')}>{I.folder} Module 3 dossier</button>
      <button onClick={() => cmcNav(nav, 'document-authoring')}>{I.penLine} Document editor</button>
      <button onClick={() => cmcNav(nav, 'vault')}>{I.vault} Vault</button>
      <button onClick={() => cmcNav(nav, 'projects')}>{I.folder} Project</button>
      <button onClick={() => cmcTask('CMC -- Module 3')}>{I.checkSquare} Tasking</button>
      <button onClick={() => cmcCollab('CMC -- Module 3')}>{I.messageSquare} Collaborate</button>
    </div>
  );
}

function CmPush({ label, nav, bar }: { label: string; nav?: (id: string) => void; bar?: boolean }) {
  return (
    <span className={bar ? 'cm-push cm-pushbar' : 'cm-push'}>
      <span className="lbl">Push to</span>
      <button onClick={() => { cmcCtx(label); cmcNav(nav, 'dossier'); }} title="Push into Module 3 documentation">{I.gitBranch} Module 3 doc</button>
      <button onClick={() => { cmcCtx(label); cmcNav(nav, 'vault'); }} title="Save to Vault">{I.vault} Vault</button>
      <button onClick={() => cmcTask(label)} title="Create a task">{I.checkSquare} Task</button>
      <button onClick={() => cmcCollab(label)} title="Collaborate">{I.messageSquare} Discuss</button>
    </span>
  );
}

interface CmHeadProps {
  title: string;
  meta: string;
  ask?: (text: string) => void;
  suggest?: string[];
  actions?: React.ReactNode;
}
function CmHead({ title, meta, ask, suggest, actions }: CmHeadProps) {
  return (
    <>
      <div className="cm-head">
        <div><div className="cm-kicker">CMC -- Module 3 operating system</div><h1 className="cm-title">{title}</h1><div className="cm-meta">{meta}</div></div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}{ask && <button className="reg-cta" onClick={() => ask((suggest && suggest[0]) || 'Help me with Module 3')}>{I.sparkles} Ask AnA</button>}</div>
      </div>
      {suggest && <div className="sp-starters" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>{suggest.map((s, i) => (<button key={i} className="sp-starter" onClick={() => ask && ask(s)}><span className="sk">{I.sparkles}</span><span>{s}</span></button>))}</div>}
    </>
  );
}

function Kpi({ l, v, s, tone }: { l: string; v: React.ReactNode; s?: string; tone?: string }) {
  return <div className="reg-kpi" data-tone={tone}><div className="reg-kpi-v">{v}</div><div className="reg-kpi-l">{l}{s ? ' -- ' + s : ''}</div></div>;
}

/* ═══════════ Overview -- portfolio + governed section approvals ═══════════ */

function CmOverview({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  const [secs, setSecs] = useState<CmcSection[]>(CMC_SECTIONS_SEED.map((s) => ({ ...s })));
  const [sign, setSign] = useState<CmcSection | null>(null);
  const [toast, fireToast] = useToast();
  const port = CMC_PORT;
  const avgRpi = Math.round(port.reduce((a, r) => a + r.rpi, 0) / port.length);
  const irOverdue = port.reduce((a, r) => a + r.ir, 0);
  const approved = secs.filter((s) => s.st === 'approved').length;
  const readyPct = Math.round(100 * approved / secs.length);
  const readyTone = readyPct >= 80 ? 'ok' : readyPct >= 50 ? 'warn' : 'err';
  const stTone = (s: string) => s === 'approved' ? 'ok' : s === 'review' ? 'warn' : 'dim';
  const doSign = () => { if (!sign) return; setSecs((ss) => ss.map((x) => x.key === sign.key ? { ...x, st: 'approved', audit: auditId(), _new: true } : x)); const a = auditId(); setSign(null); fireToast('Section ' + sign.key + ' approved -- §11.50 -- ' + a); };
  const lowSub = [...port].sort((a, b) => a.rpi - b.rpi)[0];
  const inReview = secs.filter((s) => s.st === 'review');
  const drafts = secs.filter((s) => s.st === 'draft');
  const nextSec = inReview[0] || drafts[0];
  const irSubs = port.filter((p) => p.ir > 0);
  const cmLead = (
    <AnswerLead
      tone={irOverdue ? 'urgent' : 'calm'}
      eyebrow={'Is your CMC package ready across all ' + port.length + ' submissions'}
      headline={<>Your Module 3 averages <b>RPI {avgRpi}</b> -- the <b>{lowSub.sub}</b> at {lowSub.rpi} is what's holding the portfolio back.</>}
      body={irOverdue
        ? <>You have <b>{irOverdue} information {irOverdue === 1 ? 'request' : 'requests'} overdue</b> ({irSubs.map((p) => p.sub).join(', ')}) -- agencies read a late IR response as a readiness signal. {nextSec ? <>And §{nextSec.key} ({nextSec.path}) is still in {nextSec.st}, one of {inReview.length + drafts.length} sections not yet approved.</> : null}</>
        : <>{approved} of {secs.length} sections are approved. §{nextSec ? nextSec.key : ''} ({nextSec ? nextSec.path : ''}) is the next one to move -- clear it and {lowSub.sub} climbs with it.</>}
      reassure={irOverdue ? "Answer the IRs first -- they're time-boxed. I'll draft the responses and route the sign-offs with you." : "You're building steadily. I'll help you move the next section to approved."}
      action={{ label: irOverdue ? 'Draft the overdue IR responses' : 'Advance the next section', onClick: () => ask(irOverdue ? ('Draft responses to the overdue CMC information requests for ' + irSubs.map((p) => p.sub).join(' and ')) : ('Prepare §' + (nextSec ? nextSec.key : '') + ' ' + (nextSec ? nextSec.path : '') + ' for approval')),
        alt: { label: 'Open change simulator', onClick: () => (window as any).__cmSetTab && (window as any).__cmSetTab('change') } }}
      secondary="Or work the portfolio and build state below."
    />
  );
  return (
    <div className="cm-body">
      <CmHead title="Module 3 overview" meta={`${port.length} submissions -- RPI ${avgRpi} average`} ask={ask} suggest={CMC_SUGGEST.overview} />
      {cmLead}
      <div className="cm-kpis">
        <Kpi l="Submissions" v={port.length} />
        <Kpi l="RPI average" v={avgRpi} s="preparedness" />
        <Kpi l="IR overdue" v={irOverdue} tone={irOverdue ? 'warn' : undefined} />
        <Kpi l="Sections approved" v={approved + '/' + secs.length} tone={readyTone} />
      </div>
      <div className="pj-card" style={{ marginBottom: 16 }}>
        <div className="pj-card-h"><span className="t">Portfolio</span><span className="s">{port.length} submissions</span></div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          <table className="reg-tbl"><thead><tr><th>Submission</th><th>Product</th><th>Region</th><th>Type</th><th>RPI</th><th>IR overdue</th></tr></thead>
          <tbody>{port.map((r, i) => (<tr key={i}><td style={{ fontWeight: 600 }}>{r.sub}</td><td>{r.product}</td><td>{r.region}</td><td><span className="reg-pill neutral">{r.type}</span></td><td>{r.rpi}</td><td>{r.ir}</td></tr>))}</tbody></table>
        </div>
      </div>
      <div className="pj-card" style={{ marginBottom: 16 }}>
        <div className="pj-card-h"><span className="t">Module 3 build state</span><span className="s">§3.2.S -- §3.2.P</span></div>
        <div className="pj-card-b">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div className="cm-projbar" style={{ flex: 1 }}><span className="fill" style={{ width: readyPct + '%', background: readyTone === 'ok' ? 'var(--success)' : readyTone === 'warn' ? 'var(--accent-100)' : 'var(--warning)' }} /></div>
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>{readyPct}%</b>
            <span className={'rd-chip tone-' + (readyPct >= 80 ? 'ok' : 'warn')}>{readyPct >= 80 ? 'Export ready' : 'Not export ready'}</span>
          </div>
          <div className="cm-meta">{approved} of {secs.length} sections approved -- {secs.filter((s) => s.st === 'draft').length} draft -- 1 open contradiction (host-cell protein)</div>
        </div>
      </div>
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Section approvals</span><span className="s">governed -- 21 CFR §11</span></div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          <table className="reg-tbl"><thead><tr><th>Section</th><th>Path</th><th>State</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
          <tbody>{secs.map((s) => (
            <tr key={s.key} className={s._new ? 'de-row-new' : undefined}><td className="mono" style={{ fontWeight: 600 }}>{s.key}</td><td>{s.path}</td>
              <td><span className={'rd-chip tone-' + stTone(s.st)}>{s.st}</span></td>
              <td style={{ textAlign: 'right' }}>{s.st === 'approved' ? <span className="cm-meta">{I.check} {s.audit || 'approved'}</span> : <button className="nda-open" onClick={() => setSign(s)}>{I.lock} Approve section</button>}</td>
            </tr>))}</tbody></table>
        </div>
        <div className="pj-card-b" style={{ paddingTop: 0 }}><CmPush label={'Approved Module 3 sections'} nav={nav} bar /></div>
      </div>
      {sign && <C2CForm config={signForm('Section ' + sign.key + ' -- ' + sign.path)} onCancel={() => setSign(null)} onSubmit={doSign} />}
      <C2CToast msg={toast} />
    </div>
  );
}

/* ═══════════ Specifications -- create / edit / approve ═══════════ */

function CmSpecs({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  const [rows, setRows] = useState<CmcSpecRow[]>(CMC_SPECROWS_SEED.map((r) => ({ ...r })));
  const [edit, setEdit] = useState<CmcSpecRow | 'new' | null>(null);
  const [sign, setSign] = useState<CmcSpecRow | null>(null);
  const [toast, fireToast] = useToast();
  const stTone = (s: string) => s === 'approved' ? 'ok' : s === 'review' ? 'warn' : s === 'reject' ? 'err' : 'dim';
  const FORM = (row: CmcSpecRow | null): C2CFormConfig => ({
    eyebrow: 'CMC -- 3.2.S.4.1', title: row ? 'Edit specification' : 'New specification', sub: 'Release and shelf-life limits for a drug substance or drug product',
    submitLabel: row ? 'Save changes' : 'Create specification', fields: [
      { key: 'attr', label: 'Quality attribute', type: 'text', required: true, default: row ? row.attr : '', placeholder: 'e.g. Charge variants' },
      { key: 'material', label: 'Material', type: 'select', options: ['Drug substance', 'Drug product'], required: true, default: row ? row.material : 'Drug substance', half: true },
      { key: 'method', label: 'Analytical method', type: 'text', default: row ? row.method : '', placeholder: 'e.g. SE-HPLC', half: true },
      { key: 'release', label: 'Release limit', type: 'text', default: row ? row.release : '', placeholder: 'e.g. <= 2.0%', half: true },
      { key: 'shelf', label: 'Shelf-life limit', type: 'text', default: row ? row.shelf : '', placeholder: 'e.g. <= 3.0%', half: true },
      { key: 'ich', label: 'ICH reference', type: 'text', default: row ? row.ich : 'ICH Q6B', half: true },
      { key: 'st', label: 'Status', type: 'seg', options: ['draft', 'review'], default: row && row.st !== 'approved' ? row.st : 'draft', half: true },
      { key: 'justification', label: 'Justification', type: 'textarea', placeholder: 'Rationale for the limits and method' },
    ],
  });
  const save = (v: Record<string, string>) => {
    if (edit && edit !== 'new') { setRows((rs) => rs.map((x) => x.id === (edit as CmcSpecRow).id ? { ...x, attr: v.attr, material: v.material, method: v.method, release: v.release, shelf: v.shelf, ich: v.ich, st: v.st, noMethod: !v.method, _new: true } : x)); fireToast('Specification updated -- ' + v.attr); }
    else { setRows((rs) => [{ id: Date.now(), attr: v.attr, material: v.material, method: v.method || '', release: v.release, shelf: v.shelf, ich: v.ich, st: v.st, noMethod: !v.method, _new: true }, ...rs]); fireToast('Specification created -- ' + v.attr); }
    setEdit(null);
  };
  const doSign = () => { if (!sign) return; setRows((rs) => rs.map((x) => x.id === sign.id ? { ...x, st: 'approved', audit: auditId(), _new: true } : x)); const a = auditId(); setSign(null); fireToast('Specification approved -- §11.50 -- ' + a); };
  const noMethodCount = rows.filter((r) => r.noMethod).length;
  return (
    <div className="cm-body">
      <CmHead title="Specifications" meta="Release and shelf-life limits -- drug substance and drug product" ask={ask} suggest={CMC_SUGGEST.specs}
        actions={<button className="nda-open" onClick={() => setEdit('new')}>{I.plus} New specification</button>} />
      {noMethodCount > 0 && <div className="pj-con" style={{ marginBottom: 14 }}><span className="ico">{I.alertTriangle}</span><div><div className="pj-con-t">{noMethodCount} specification without a validated method</div><div className="pj-con-d">A specification cannot be approved until its analytical method is validated (ICH Q2). Add the method, or ask AnA to draft the validation justification.</div></div></div>}
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Specification table</span><span className="s">{rows.length} attributes</span></div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          <table className="reg-tbl"><thead><tr><th>Attribute</th><th>Material</th><th>Method</th><th>Release</th><th>Shelf life</th><th>ICH</th><th>Status</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className={r._new ? 'de-row-new' : undefined}>
              <td style={{ fontWeight: 600 }}>{r.attr}</td><td>{r.material}</td>
              <td>{r.method || <span className="sp-tone-warn">no method</span>}</td>
              <td>{r.release || '--'}</td><td>{r.shelf || '--'}</td><td className="mono">{r.ich}</td>
              <td><span className={'rd-chip tone-' + stTone(r.st)}>{r.st}</span></td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="nda-open" onClick={() => setEdit(r)}>{I.penLine} Edit</button>
                {r.st !== 'approved' && <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => setSign(r)} disabled={r.noMethod} title={r.noMethod ? 'Validate the method before approval' : ''}>{I.lock} Approve</button>}
              </td>
            </tr>))}</tbody></table>
        </div>
        <div className="pj-card-b" style={{ paddingTop: 0 }}><CmPush label={'Approved specifications -> §3.2.S.4.1'} nav={nav} bar /></div>
      </div>
      {edit && <C2CForm config={FORM(edit === 'new' ? null : edit)} onCancel={() => setEdit(null)} onSubmit={save} />}
      {sign && <C2CForm config={signForm(sign.attr + ' -- ' + sign.material)} onCancel={() => setSign(null)} onSubmit={doSign} />}
      <C2CToast msg={toast} />
    </div>
  );
}

/* ═══════════ Stability -- working shelf-life projection (linear fit) ═══════════ */

function linFit(pts: { m: number; v: number }[]) {
  const n = pts.length; const sx = pts.reduce((a, p) => a + p.m, 0), sy = pts.reduce((a, p) => a + p.v, 0);
  const sxx = pts.reduce((a, p) => a + p.m * p.m, 0), sxy = pts.reduce((a, p) => a + p.m * p.v, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx); const intc = (sy - slope * sx) / n;
  return { slope, intc };
}

interface StabProj { slope: number; intc: number; monthsToLimit: number; shelf: number; lastM: number; rising: boolean; pts: { m: number; v: number }[]; }

function StabChart({ proj, data, maxM }: { proj: StabProj; data: CmcStabData; maxM: number }) {
  const W = 560, H = 180, pad = 34; const maxV = Math.max(data.limit * 1.15, ...proj.pts.map((p) => p.v));
  const x = (m: number) => pad + (m / maxM) * (W - pad - 10); const y = (v: number) => H - pad - (v / maxV) * (H - pad - 14);
  const fitX2 = maxM, fitY1 = proj.intc, fitY2 = proj.intc + proj.slope * maxM;
  const limitY = y(data.limit);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} data-om-raster>
      <line x1={pad} y1={H - pad} x2={W - 10} y2={H - pad} stroke="var(--border-strong)" />
      <line x1={pad} y1={14} x2={pad} y2={H - pad} stroke="var(--border-strong)" />
      <line x1={pad} y1={limitY} x2={W - 10} y2={limitY} stroke="var(--error)" strokeDasharray="4 3" />
      <text x={W - 12} y={limitY - 4} textAnchor="end" fontSize="9" fill="var(--error)">limit {data.limit}{data.unit}</text>
      <line x1={x(0)} y1={y(fitY1)} x2={x(fitX2)} y2={y(fitY2)} stroke="var(--accent-100)" strokeWidth="1.5" strokeDasharray="5 3" />
      <polyline fill="none" stroke="var(--text-200)" strokeWidth="2" points={proj.pts.map((p) => x(p.m) + ',' + y(p.v)).join(' ')} />
      {proj.pts.map((p, i) => (<circle key={i} cx={x(p.m)} cy={y(p.v)} r="3" fill="var(--text-100)" />))}
      {isFinite(proj.monthsToLimit) && proj.monthsToLimit <= maxM && <circle cx={x(proj.monthsToLimit)} cy={limitY} r="4" fill="var(--error)" />}
      <text x={pad} y={H - 6} fontSize="9" fill="var(--text-400)">0</text>
      <text x={W - 10} y={H - 6} textAnchor="end" fontSize="9" fill="var(--text-400)">{maxM} mo</text>
    </svg>
  );
}

function CmStability({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  const [data, setData] = useState<CmcStabData>(CMC_STAB_SEED);
  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();
  const proj = useMemo<StabProj>(() => {
    const pts = [...data.points].sort((a, b) => a.m - b.m); const { slope, intc } = linFit(pts);
    const monthsToLimit = slope > 0 ? (data.limit - intc) / slope : Infinity;
    const shelf = isFinite(monthsToLimit) ? Math.floor(Math.min(monthsToLimit, 60)) : 60;
    const lastM = pts[pts.length - 1].m;
    const rising = slope > 0.02;
    return { slope, intc, monthsToLimit, shelf, lastM, rising, pts };
  }, [data]);
  const addPt = (v: Record<string, string>) => { const m = +v.m, val = parseFloat(v.v); if (isNaN(m) || isNaN(val)) return; setData((d) => ({ ...d, points: [...d.points.filter((p) => p.m !== m), { m, v: val }] })); setForm(false); fireToast('Timepoint added -- ' + m + 'm = ' + val + data.unit + ' -- shelf life recomputed'); };
  const maxM = Math.max(36, Math.ceil((isFinite(proj.monthsToLimit) ? proj.monthsToLimit : 36) / 6) * 6);
  return (
    <div className="cm-body">
      <CmHead title="Stability program" meta="ICH Q1A(R2) / Q1E -- shelf-life projection from long-term data" ask={ask} suggest={CMC_SUGGEST.stability}
        actions={<button className="nda-open" onClick={() => setForm(true)}>{I.plus} Add timepoint</button>} />
      <div className="cm-kpis">
        <Kpi l="Projected shelf life" v={isFinite(proj.monthsToLimit) ? proj.shelf + ' mo' : '>=60 mo'} tone={proj.shelf >= 24 ? 'ok' : 'warn'} />
        <Kpi l="Time to limit" v={isFinite(proj.monthsToLimit) ? Math.round(proj.monthsToLimit) + ' mo' : '--'} />
        <Kpi l="Trend" v={proj.rising ? 'Rising' : 'Stable'} tone={proj.rising ? 'warn' : 'ok'} />
        <Kpi l="Tested to" v={proj.lastM + ' mo'} />
      </div>
      <div className="pj-card" style={{ marginBottom: 16 }}>
        <div className="pj-card-h"><span className="t">{data.attr}</span><span className="s">{data.cond} -- limit {data.limit}{data.unit}</span></div>
        <div className="pj-card-b">
          <StabChart proj={proj} data={data} maxM={maxM} />
          <div className="cm-meta" style={{ marginTop: 10 }}>
            {proj.rising
              ? <>Linear fit rises {(proj.slope).toFixed(3)}{data.unit}/mo -- projected to reach the {data.limit}{data.unit} limit at <b>{Math.round(proj.monthsToLimit)} months</b>. Supports a <b>{proj.shelf}-month</b> shelf-life claim with margin.</>
              : <>Trend is flat -- no approach to the {data.limit}{data.unit} limit within the tested range. Supports the maximum claim on this attribute.</>}
          </div>
          <div className="sp-foot"><button className="sp-ask" onClick={() => ask('Draft the §3.2.S.7 stability summary with the ICH Q1E shelf-life justification for ' + data.attr)}>{I.sparkles} Draft §3.2.S.7 summary</button></div>
          <CmPush label={'§3.2.S.7 stability summary -- ' + data.attr} nav={nav} bar />
        </div>
      </div>
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Timepoints</span><span className="s">{proj.pts.length} results</span></div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          <table className="reg-tbl"><thead><tr><th>Month</th><th>Result ({data.unit})</th><th>Margin to limit</th></tr></thead>
          <tbody>{proj.pts.map((p, i) => (<tr key={i}><td className="mono">{p.m}</td><td className="mono">{p.v.toFixed(2)}</td><td className={data.limit - p.v < 0.5 ? 'sp-tone-warn' : ''}>{(data.limit - p.v).toFixed(2)}{data.unit}</td></tr>))}</tbody></table>
        </div>
      </div>
      {form && <C2CForm config={{ eyebrow: 'Stability -- timepoint', title: 'Add a stability result', governed: 'Stability results are governed quality data (ICH Q1A) and update the shelf-life projection.', submitLabel: 'Add result', fields: [
        { key: 'm', label: 'Timepoint (months)', type: 'number', min: 0, required: true, half: true },
        { key: 'v', label: 'Result (' + data.unit + ')', type: 'number', required: true, half: true },
      ] }} onCancel={() => setForm(false)} onSubmit={addPt} />}
      <C2CToast msg={toast} />
    </div>
  );
}

/* ═══════════ Batch records -- release eligibility ═══════════ */

function CmBatch({ ask }: { ask: (text: string) => void }) {
  const [rows, setRows] = useState<CmcBatch[]>(CMC_BATCHES_SEED.map((r) => ({ ...r })));
  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();
  const eligible = (r: CmcBatch) => r.dev === 0 && r.yield >= 90;
  const pending = rows.filter((r) => r.st === 'pending').length;
  const devs = rows.reduce((a, r) => a + r.dev, 0);
  const avgY = Math.round(rows.reduce((a, r) => a + r.yield, 0) / rows.length);
  const add = (v: Record<string, string>) => { setRows((rs) => [{ id: v.id, stage: v.stage, yield: +v.yield || 0, dev: +v.dev || 0, st: 'pending', _new: true }, ...rs]); setForm(false); fireToast('Batch logged -- ' + v.id); };
  const release = (id: string) => { setRows((rs) => rs.map((x) => x.id === id ? { ...x, st: 'released', _new: true } : x)); fireToast('Batch released -- ' + id); };
  return (
    <div className="cm-body">
      <CmHead title="Batch records" meta="Manufacture, yield, deviations and disposition" ask={ask} suggest={CMC_SUGGEST.batch}
        actions={<button className="nda-open" onClick={() => setForm(true)}>{I.plus} Log batch</button>} />
      <div className="cm-kpis">
        <Kpi l="Batches" v={rows.length} />
        <Kpi l="Pending release" v={pending} tone={pending ? 'warn' : 'ok'} />
        <Kpi l="Open deviations" v={devs} tone={devs ? 'warn' : 'ok'} />
        <Kpi l="Avg yield" v={avgY + '%'} />
      </div>
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Batch disposition</span><span className="s">release when deviations = 0 and yield >= 90%</span></div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          <table className="reg-tbl"><thead><tr><th>Batch</th><th>Stage</th><th>Yield</th><th>Deviations</th><th>Eligible</th><th>Status</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className={r._new ? 'de-row-new' : undefined}>
              <td className="mono" style={{ fontWeight: 600 }}>{r.id}</td><td>{r.stage}</td>
              <td className={r.yield < 90 ? 'sp-tone-warn' : ''}>{r.yield}%</td>
              <td className={r.dev ? 'sp-tone-warn' : ''}>{r.dev}</td>
              <td>{eligible(r) ? <span className="rd-chip tone-ok">yes</span> : <span className="rd-chip tone-warn">no</span>}</td>
              <td><span className={'rd-chip tone-' + (r.st === 'released' ? 'ok' : 'warn')}>{r.st}</span></td>
              <td style={{ textAlign: 'right' }}>{r.st === 'pending' && <button className="nda-open" onClick={() => release(r.id)} disabled={!eligible(r)} title={!eligible(r) ? 'Resolve deviations / low yield first' : ''}>{I.check} Release</button>}</td>
            </tr>))}</tbody></table>
        </div>
      </div>
      {form && <C2CForm config={{ eyebrow: 'Batch -- new', title: 'Log a batch record', governed: 'Batch records are governed GMP data; disposition is computed from deviations and yield.', submitLabel: 'Log batch', fields: [
        { key: 'id', label: 'Batch number', type: 'text', placeholder: 'e.g. BX204-DP-2407', required: true },
        { key: 'stage', label: 'Stage', type: 'select', options: ['Drug substance', 'Drug product'], required: true, half: true },
        { key: 'yield', label: 'Yield (%)', type: 'number', min: 0, max: 100, required: true, half: true },
        { key: 'dev', label: 'Open deviations', type: 'number', min: 0, default: '0' },
      ] }} onCancel={() => setForm(false)} onSubmit={add} />}
      <C2CToast msg={toast} />
    </div>
  );
}

/* ═══════════ Change simulator -- computes the filing path ═══════════ */

function filingPath(changeType: string, risk: string, mkt: string): string[] {
  const high = risk === 'high', med = risk === 'med';
  const map: Record<string, string[]> = {
    fda: high ? ['Prior-Approval Supplement (PAS)', 'Reviewed before implementation'] : med ? ['CBE-30', 'Implement 30 days after filing'] : ['Annual Report', 'Report in next annual report'],
    ema: high ? ['Type II variation', 'Assessed by CHMP/RMS'] : med ? ['Type IB variation', 'Tell-wait 30 days'] : ['Type IA (IN)', 'Immediate notification'],
    pmda: high ? ['Partial change application (PCA)', 'Prior approval required'] : med ? ['Minor change notification', '30-day notification'] : ['Minor change notification', 'Notification'],
    nmpa: high ? ['Supplemental application', 'Prior approval'] : ['Filing / record-keeping', 'Record-keeping change'],
    health_canada: high ? ['Level I (PAS-equivalent)', 'Prior approval'] : med ? ['Level II (notifiable)', 'Notify'] : ['Level III/IV', 'Annual notification'],
    uk_mhra: high ? ['Type II variation', 'Prior approval'] : med ? ['Type IB', 'Tell-wait'] : ['Type IA', 'Notify'],
  };
  return map[mkt] || ['Assess locally', 'Region rule not modelled'];
}

function CmChange({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  const [type, setType] = useState('api_supplier_change');
  const [markets, setMarkets] = useState(['fda', 'ema']);
  const [desc, setDesc] = useState('');
  const [result, setResult] = useState<CmcChangeResult | null>(null);
  const toggle = (id: string) => setMarkets((m) => m.includes(id) ? m.filter((x) => x !== id) : [...m, id]);
  const ct = CMC_CHANGE_TYPES.find((c) => c.id === type)!;
  const simulate = () => { if (!desc.trim() || !markets.length) return; setResult({ type: ct, markets: [...markets], desc: desc.trim(), paths: markets.map((m) => ({ m, label: CMC_MARKETS.find((x) => x[0] === m)![1], path: filingPath(type, ct.risk, m) })) }); };
  const riskTone = ct.risk === 'high' ? 'err' : ct.risk === 'med' ? 'warn' : 'ok';

  const memoMd = (r: CmcChangeResult) => {
    const compBy = r.type.risk === 'high' ? 'A prospective comparability protocol (ICH Q5E) with pre-defined acceptance criteria and side-by-side characterization of the pre- and post-change material is required before implementation.'
      : r.type.risk === 'med' ? 'A comparability assessment (ICH Q5E) covering critical quality attributes is required; a reduced protocol may suffice where the change is well-understood.'
      : 'A risk-based comparability check against release and stability data is sufficient; full protocol not expected.';
    const rec = r.type.risk === 'high' ? 'Do not implement until the highest-tier filing in scope is approved. Sequence the comparability work first.'
      : r.type.risk === 'med' ? 'Prepare the moderate-change filing(s) and implement per each market\'s reporting category; some markets allow do-and-tell.'
      : 'Implement under the annual/notification category; document in the next periodic report.';
    let s = `# Regulatory Change Impact Assessment\n\n*${r.type.label} -- ${r.markets.map((m) => m.toUpperCase()).join(', ')} -- ${r.type.risk} impact*\n\n`;
    s += `## 1. Change Description\n\n${r.desc}\n\n## 2. Classification\n\n- **Change type**: ${r.type.label}\n- **Assessed risk**: ${r.type.risk}\n- **Frameworks applied**: SUPAC, ICH Q12 (post-approval change management), ICH Q5E (comparability)\n\n## 3. Filing Path by Market\n\n| Market | Reporting category | Regulatory basis |\n|---|---|---|\n`;
    r.paths.forEach((p) => { s += `| ${p.label} | ${p.path[0]} | ${p.path[1]} |\n`; });
    s += `\n## 4. Comparability Requirement\n\n${compBy}\n\n## 5. Supporting Data Expected\n\n- Side-by-side release testing (pre/post change) against the approved specification\n- Stability commitment on the first post-change ${r.type.risk === 'low' ? 'batch' : 'batches'} (ICH Q1A)\n- Updated §3.2.S / §3.2.P sections and, where applicable, method (re)validation\n\n## 6. Recommendation\n\n${rec}\n\n---\n*Generated from the CMC change model (SUPAC / ICH Q12 rules). Route through change control and e-signature before implementation.*\n`;
    return s;
  };

  return (
    <div className="cm-body">
      <CmHead title="Change simulator" meta="Model a CMC change -> filing path across markets -- SUPAC / ICH Q12" ask={ask} />
      <div className="pj-card">
        <div className="pj-card-b">
          <div className="de-field"><label className="de-label">Change type</label>
            <select className="de-select" value={type} onChange={(e) => { setType(e.target.value); setResult(null); }}>{CMC_CHANGE_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          </div>
          <div className="de-field"><label className="de-label">Describe the change<span className="req">*</span></label>
            <textarea className="de-textarea" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. switch the drug-substance supplier from A to B; comparable process, new site" />
          </div>
          <div className="de-field"><label className="de-label">Markets</label>
            <div className="cm-mkt">{CMC_MARKETS.map(([id, l]) => (<button key={id} type="button" className="cm-mkt-opt" data-on={markets.includes(id) || undefined} onClick={() => toggle(id)}>{markets.includes(id) ? I.check : I.plus}{l}</button>))}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <button className="reg-cta" onClick={simulate} disabled={!desc.trim() || !markets.length}>{I.zap} Simulate change</button>
            <span className={'rd-chip tone-' + riskTone}>{ct.risk} impact</span>
          </div>
        </div>
      </div>
      {result && (
        <div className="cm-change-out">
          <div className="cm-doc">
            <div className="cm-doc-bar">
              <div><span className="cm-doc-kind">Regulatory Change Impact Assessment</span><span className="cm-doc-prov">SUPAC -- ICH Q12 -- draft</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="bs-da" onClick={() => ask('Refine the change-control assessment and draft the comparability protocol for: ' + result.desc)}>{I.sparkles} Refine with AnA</button>
                <button className="bs-da primary" onClick={() => { try { localStorage.setItem('c2c_biostat_doc', JSON.stringify({ title: 'Regulatory Change Impact Assessment', md: memoMd(result) })); } catch (_e) { /* noop */ } nav && nav('document-authoring'); }}>{I.penLine} Open in editor</button>
              </div>
            </div>
            <div className="cm-doc-page"><div className="cm-doc-render" dangerouslySetInnerHTML={{ __html: mdToHtml(memoMd(result)) }} /></div>
          </div>
          <CmPush label={'Change-control package -- ' + result.type.label} nav={nav} bar />
        </div>
      )}
    </div>
  );
}

/* ═══════════ Blueprint -- Global -- Program records -- Copilot ═══════════ */

function CmBlueprint({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  const [gen, setGen] = useState<Record<string, number>>({});
  const [toast, fire] = useToast();
  const anyGen = Object.keys(gen).length > 0;
  return (
    <div className="cm-body">
      <CmHead title="Blueprint generator" meta="Compose CTD §3.2 sections from the quality data" ask={ask} suggest={CMC_SUGGEST.overview} />
      <div className="pj-card"><div className="pj-card-h"><span className="t">§3.2 sections</span><span className="s">{CMC_BP.filter((b) => b.ready).length} ready to generate</span></div>
        <div className="pj-card-b">{CMC_BP.map((b) => (
          <div key={b.s} className="cm-gen">
            <span className="mono" style={{ color: 'var(--accent-200)', fontWeight: 600, minWidth: 66 }}>{b.s}</span>
            <div className="cm-gen-b"><div className="cm-gen-t">{b.l}</div><div className="cm-gen-s">{gen[b.s] ? 'Draft generated -- open in the editor to review' : b.ready ? 'Source data complete' : 'Blocked -- ' + b.need}</div></div>
            {gen[b.s] ? <span className="rd-chip tone-ok">generated</span> : <button className="nda-open" disabled={!b.ready} onClick={() => { setGen((g) => ({ ...g, [b.s]: 1 })); fire('Generated ' + b.s + ' from the quality data'); }}>{I.sparkles} Generate</button>}
          </div>))}
        </div>
        {anyGen && <div className="pj-card-b" style={{ paddingTop: 0 }}><CmPush label={'Generated §3.2 sections'} nav={nav} bar /></div>}
      </div>
      <C2CToast msg={toast} />
    </div>
  );
}

function CmGlobal({ ask }: { ask: (text: string) => void }) {
  return (
    <div className="cm-body">
      <CmHead title="Global compliance" meta="FDA -- EMA -- PMDA Module 3 readiness and regional gaps" ask={ask} />
      <div className="cm-kpis" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>{CMC_GLOBAL.map((g) => (<div key={g.region} className="reg-kpi"><div className="reg-kpi-v" data-tone={g.ready >= 80 ? undefined : 'warn'}>{g.ready}%</div><div className="reg-kpi-l">{g.region} readiness</div></div>))}</div>
      <div className="pj-card"><div className="pj-card-h"><span className="t">Regional gaps</span><span className="s">blocking each market</span></div>
        <div className="pj-card-b"><div className="sp-list">{CMC_GLOBAL.flatMap((g) => g.gaps.map((gap, i) => (
          <div key={g.region + i} className="sp-row"><span className="sp-tag2">{g.region}</span><div className="sp-row-b"><div className="sp-row-t">{gap}</div></div><button className="sp-addbtn" onClick={() => ask('Close the ' + g.region + ' gap: ' + gap)}>{I.sparkles} Resolve</button></div>
        )))}</div></div>
      </div>
    </div>
  );
}

function CmPathway({ ask }: { ask: (text: string) => void }) {
  return (
    <div className="cm-body">
      <CmHead title="Program records" meta="Agency correspondence, approval gates and the audit chain" ask={ask} />
      <div className="pj-card" style={{ marginBottom: 16 }}><div className="pj-card-h"><span className="t">Open agency correspondence</span><span className="s">triage by deadline</span></div>
        <div className="pj-card-b"><div className="sp-queue">{CMC_CORR.map((c, i) => (
          <button key={i} className="sp-q" data-tone={c.tone} onClick={() => ask('Draft a response to the ' + c.ag + ' ' + c.kind + ' on ' + c.subj)}>
            <span className="sp-q-ic">{I.globe}</span><span className="sp-q-b"><span className="sp-q-t">{c.ag} -- {c.kind}</span><span className="sp-q-s">{c.subj} -- {c.due}</span></span><span className="sp-q-a">Respond {I.right}</span>
          </button>))}</div>
        </div>
      </div>
      <div className="pj-card"><div className="pj-card-h"><span className="t">Audit chain</span><span className="s">last 24 hours</span></div>
        <div className="pj-card-b"><div className="sp-list">
          <div className="sp-row"><span className="sp-tag2">SIGN</span><div className="sp-row-b"><div className="sp-row-t">§3.2.S.2 Manufacture approved</div><div className="sp-row-s">J. Chen -- §11.50 -- AUD-4471 -- 2h ago</div></div></div>
          <div className="sp-row"><span className="sp-tag2">EDIT</span><div className="sp-row-b"><div className="sp-row-t">Aggregates spec release limit updated</div><div className="sp-row-s">M. Wei -- 5h ago</div></div></div>
          <div className="sp-row"><span className="sp-tag2">DATA</span><div className="sp-row-b"><div className="sp-row-t">18-month stability result added</div><div className="sp-row-s">System -- SEND-linked -- 9h ago</div></div></div>
        </div></div>
      </div>
    </div>
  );
}

function CmCopilot({ ask }: { ask: (text: string) => void }) {
  return (
    <div className="cm-body">
      <CmHead title="CMC copilot" meta="Ask the Module 3 expert -- grounded in ICH Q-series and your quality data" ask={ask} />
      <div className="pj-card"><div className="pj-card-b">
        {CMC_SUGGEST.copilot.concat(['Reconcile drug-substance specs across CSR-201 and §3.2.S.4.1', 'Which markets need a prior-approval supplement for the scale-up?']).map((q, i) => (
          <button key={i} className="cm-copilot-q" onClick={() => ask(q)}><span className="ico">{I.sparkles}</span><span className="t">{q}</span></button>
        ))}
      </div></div>
    </div>
  );
}

/* ═══════════ CmcModule shell — sub-tab router ═══════════ */

const CMC_SURF: Record<string, React.ComponentType<{ ask: (text: string) => void; nav?: (id: string) => void }>> = {
  overview: CmOverview,
  specs: CmSpecs,
  stability: CmStability,
  batch: CmBatch,
  change: CmChange,
  blueprint: CmBlueprint,
  global: CmGlobal,
  pathway: CmPathway,
  copilot: CmCopilot,
};

export function CmcModule({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  const [tab, setTab] = useState('overview');
  (window as any).__cmSetTab = setTab;
  const Surf = CMC_SURF[tab] || CmOverview;
  return (
    <div className="cm">
      <div className="cm-sub">
        {CMC_NAV.map((n) => (<button key={n.id} className="cm-subtab" data-on={tab === n.id || undefined} onClick={() => setTab(n.id)}>{I[n.icon] || I.grid}{n.label}</button>))}
      </div>
      <CmConnectBar nav={onNav} />
      <Surf ask={ask} nav={onNav} />
    </div>
  );
}

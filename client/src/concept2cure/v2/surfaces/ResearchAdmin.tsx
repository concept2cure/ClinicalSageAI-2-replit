import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  PDEV_CITI, PDEV_COMMITTEES, PDEV_COVERAGE, PDEV_GRANTS, PDEV_PORTFOLIO_ANALYTICS,
} from '../fixtures/protocol-data';
import '../styles/project-home-v2.css';

/* ═══════════════════════════════════════════════════════════════════
   Research Administration (Capabilities C2C-14, C2C-15, C2C-16, C2C-01/02)
   One workspace, five sections:
     - Committees -- IRB / IACUC / IBC roster, composition, meetings,
       convene -> quorum, the live voting POLL, finalize determination
     - Coverage analysis -- Medicare NCD 310.1 qualifying-trial + billing grid
     - Grant finder -- funding profile + ranked opportunities (fit score)
     - Training -- CITI personnel x training matrix + expiring report
     - Portfolio -- continuing-review expiration analytics

   Source: docs/RESEARCH_ADMIN_UI_REQUIREMENTS_2026-06-29.md
   Registers as SURFACE_VIEWS['research-admin'].

   NOTE: Section data (PDEV_COMMITTEES, PDEV_COVERAGE, PDEV_GRANTS,
   PDEV_CITI, PDEV_PORTFOLIO_ANALYTICS) is imported from the typed
   fixtures/protocol-data module (ported from the kit's window globals).
   ═══════════════════════════════════════════════════════════════════ */

/* ── Types ── */

interface SectionDef {
  id: string;
  label: string;
  icon: string;
}

interface VoteOption {
  id: string;
  label: string;
  t: string;
}

interface CommitteeMember {
  id: string;
  name: string;
  role: string;
  kind?: string;
  affiliated?: boolean;
  citi: string;
}

interface MeetingData {
  title: string;
  date: string;
  committee: string;
  present: string[];
  quorumRequired: number;
  agenda: { protocol: string; risk: string; votes: Record<string, string | null> }[];
}

interface CoverageItem {
  id: string;
  item: string;
  soc: boolean;
  sponsorPaid: boolean;
  designation: string;
  ncd: string;
  icd10?: string;
  valid?: boolean;
}

interface CoverageAnalysis {
  qualifying: {
    determination: string;
    therapeuticIntent: boolean;
    enrollsMedicare: boolean;
    principalPurpose: boolean;
    deemed: boolean;
    rationale: string;
  };
  items: CoverageItem[];
  disclaimer: string;
}

interface GrantOpportunity {
  id: string;
  title: string;
  agency: string;
  mech: string;
  ceiling: string;
  deadlineDays: number;
  fit: number;
  eligible: boolean;
  reasons: string[];
}

interface GovAction {
  title: string;
  intent: string;
  basis: string;
  esign?: boolean;
}

/* ── Constants ── */

const SECTIONS: SectionDef[] = [
  { id: 'committees', label: 'Committees', icon: 'user' },
  { id: 'coverage', label: 'Coverage analysis', icon: 'creditCard' },
  { id: 'grants', label: 'Grant finder', icon: 'sparkles' },
  { id: 'training', label: 'Training (CITI)', icon: 'book' },
  { id: 'portfolio', label: 'Portfolio', icon: 'barChart' },
];

const VOTE_OPTS: VoteOption[] = [
  { id: 'approve', label: 'Approve', t: 'ok' },
  { id: 'approve_with_modifications', label: 'Approve w/ mods', t: 'warn' },
  { id: 'disapprove', label: 'Disapprove', t: 'err' },
  { id: 'abstain', label: 'Abstain', t: 'idle' },
  { id: 'recuse', label: 'Recuse', t: 'idle' },
];

/* ── Inline icon helper (replaces kit PG.Ic) ── */
function Ic({ n }: { n: string }) {
  const icon = (I as Record<string, React.ReactElement>)[n];
  return icon ? <span className="ico">{icon}</span> : null;
}

/* ── Capitalize helper (replaces kit PG.labelize) ── */
function labelize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ── Inline citation (replaces kit PG.Citation) ── */
function Citation({ basis, children }: { basis: string; children?: React.ReactNode }) {
  return <div className="ra-citation" title={basis}>{I.info} {children || basis}</div>;
}

/* ── Findings list (replaces kit PG.FindingsList) ── */
function FindingsList({ findings, dense }: { findings: any[]; dense?: boolean }) {
  if (!findings || !findings.length) return <div className="ra-empty-sec">No findings</div>;
  return (
    <div className={`ra-findings${dense ? ' dense' : ''}`}>
      {findings.map((f: any, i: number) => (
        <div key={i} className="ra-finding" data-tone={f.tone || f.severity || 'idle'}>
          {f.icon && <Ic n={f.icon} />}
          <span>{f.text || f.title || String(f)}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Governed action dialog (replaces kit PG.GovernedActionDialog) ── */
function GovernedActionDialog({ open, onClose, onConfirm, title, intent, basis, esign }: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title?: string; intent?: string; basis?: string; esign?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="tb-detail-bd" onClick={onClose}>
      <div className="tb-detail" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="tb-detail-h">
          <div><h3>{title || 'Governed action'}</h3></div>
          <button className="tb-detail-x" onClick={onClose}>{I.close}</button>
        </div>
        {intent && <p style={{ fontSize: 12.5, color: 'var(--text-300)', margin: '8px 0' }}>{intent}</p>}
        {basis && <Citation basis={basis}>{basis}</Citation>}
        {esign && <div style={{ fontSize: 11, color: 'var(--text-400)', marginTop: 8 }}>Requires e-signature (21 CFR Part 11)</div>}
        <div className="tb-detail-f" style={{ marginTop: 14 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { onConfirm(); onClose(); }}>{I.check} Confirm</button>
        </div>
      </div>
    </div>
  );
}

/* ════ Committees ════ */

function Committees({ onGov }: { onGov: (cfg: GovAction) => void }) {
  const C = PDEV_COMMITTEES;
  if (!C) return <div className="ra-sec"><div className="ra-empty-sec">Committee data not loaded (PDEV_COMMITTEES)</div></div>;
  const [type, setType] = useState<string>(C.active);
  const members: CommitteeMember[] = C.members[type] || [];
  const meeting: MeetingData | undefined = C.openMeeting;
  const showMeeting = type === 'irb';
  return (
    <div className="ra-sec">
      <div className="ra-ctype">
        {(C.types || []).map((t: any) => (
          <button key={t.id} className={'ra-ctype-btn' + (type === t.id ? ' on' : '')} onClick={() => setType(t.id)} title={t.full}>
            {t.label}<span className="ra-ctype-full"> {t.full}</span>
          </button>
        ))}
      </div>
      <div className="ra-grid2">
        {/* Roster + composition */}
        <div className="ra-card">
          <div className="ra-card-h"><h3>Roster</h3><span className="pd-pane-s">{members.length} members</span></div>
          <div className="ra-roster">
            {members.map(m => (
              <div key={m.id} className="ra-member">
                <span className="ra-mem-av">{m.name.split(' ').slice(-1)[0][0]}</span>
                <div className="ra-mem-body">
                  <div className="ra-mem-name">{m.name}</div>
                  <div className="ra-mem-role">{m.role}</div>
                </div>
                <div className="ra-mem-tags">
                  {m.kind === 'nonscientist' && <span className="pd-chip">Nonscientist</span>}
                  {m.kind === 'veterinarian' && <span className="pd-chip">Veterinarian</span>}
                  {!m.affiliated && <span className="pd-chip">Non-affiliated</span>}
                  <span className="ra-citi" data-s={m.citi} title="CITI training">CITI {m.citi}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="ra-comp">
            <div className="ra-comp-h">Composition check</div>
            <FindingsList findings={C.composition?.[type] || []} dense={true} />
          </div>
        </div>
        {/* Meeting + poll */}
        {showMeeting && meeting
          ? <MeetingPoll C={C} meeting={meeting} onGov={onGov} />
          : (
            <div className="ra-card">
              <div className="ra-card-h"><h3>Meetings</h3></div>
              <div className="pg-empty">Convene an {type.toUpperCase()} meeting to open the voting workspace. FCR requires a quorum; any member may call for full committee review.</div>
            </div>
          )}
      </div>
    </div>
  );
}

/* ════ Meeting poll ════ */

function MeetingPoll({ C, meeting, onGov }: { C: any; meeting: MeetingData; onGov: (cfg: GovAction) => void }) {
  const allMembers: CommitteeMember[] = C.members[meeting.committee] || [];
  const present = meeting.present;
  const item = meeting.agenda[0];
  const [votes, setVotes] = useState<Record<string, string | null>>(() => ({ ...item.votes }));
  const setVote = (mid: string, v: string) => setVotes(p => ({ ...p, [mid]: v }));
  /* Quorum: majority present incl >=1 nonscientist present, recused do not count */
  const presentMembers = allMembers.filter(m => present.includes(m.id));
  const eligible = presentMembers.filter(m => votes[m.id] !== 'recuse');
  const nonsciPresent = eligible.some(m => m.kind === 'nonscientist');
  const quorumMet = eligible.length >= meeting.quorumRequired && nonsciPresent;
  const tally = useMemo(() => {
    const t: Record<string, number> = {};
    VOTE_OPTS.forEach(o => t[o.id] = 0);
    Object.values(votes).forEach(v => { if (v) t[v] = (t[v] || 0) + 1; });
    return t;
  }, [votes]);
  const cast = present.filter(id => votes[id]).length;
  const approveCt = tally.approve + tally.approve_with_modifications;
  const majority = approveCt > eligible.length / 2;
  const determination = !quorumMet ? 'Quorum not met'
    : (tally.approve_with_modifications >= tally.approve && majority ? 'Approve with modifications'
      : majority ? 'Approved'
        : tally.disapprove > approveCt ? 'Disapproved' : 'No majority');
  const detTone = determination === 'Approved' ? 'ok' : determination.startsWith('Approve') ? 'warn' : determination === 'Disapproved' ? 'err' : 'idle';
  const canFinalize = quorumMet && cast >= eligible.length && determination !== 'No majority';

  return (
    <div className="ra-card ra-meeting">
      <div className="ra-card-h">
        <div>
          <h3>{meeting.title}</h3>
          <span className="pd-pane-s">{meeting.date} -- initial review</span>
        </div>
        <span className="ra-quorum" data-met={quorumMet}>
          <Ic n={quorumMet ? 'checkCircle' : 'alertTriangle'} />
          {quorumMet ? 'Quorum met' : 'Quorum not met'} -- {eligible.length}/{meeting.quorumRequired}
        </span>
      </div>
      <div className="ra-agenda-item">
        <div className="ra-ai-protocol">{item.protocol}</div>
        <span className="pg-badge" data-tone="warn">{item.risk}</span>
      </div>
      {/* The poll */}
      <div className="ra-poll">
        {presentMembers.map(m => (
          <div key={m.id} className="ra-vote-row">
            <div className="ra-vote-who">
              <span className="ra-mem-av sm">{m.name.split(' ').slice(-1)[0][0]}</span>
              <span className="ra-vote-name">{m.name}</span>
              {m.kind === 'nonscientist' && <span className="pd-chip xs">NS</span>}
            </div>
            <div className="ra-vote-opts">
              {VOTE_OPTS.map(o => (
                <button key={o.id} className={'ra-vote-btn' + (votes[m.id] === o.id ? ' on' : '')} data-tone={o.t} onClick={() => setVote(m.id, o.id)} title={o.label}>{o.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {/* Tally + determination */}
      <div className="ra-tally">
        {VOTE_OPTS.filter(o => tally[o.id] > 0).map(o => (
          <span key={o.id} className="ra-tally-chip" data-tone={o.t}>{o.label} {tally[o.id]}</span>
        ))}
      </div>
      <div className="ra-determination" data-tone={detTone}>
        <div>
          <div className="ra-det-l">Determination</div>
          <div className="ra-det-v">{determination}</div>
        </div>
        <button className="btn primary" disabled={!canFinalize}
          onClick={() => onGov({ title: 'Finalize determination', intent: 'Record the convened-board determination: ' + determination + '. Requires quorum, approve privilege and current CITI training.', basis: '45 CFR 46.108(b) / PHS Policy IV.C.2 -- majority vote of quorum present', esign: true })}>
          {I.scroll} Finalize determination
        </button>
      </div>
      <Citation basis="Recused members are excluded from quorum (PHS Policy / Common Rule). Quorum must be maintained for the vote.">Quorum excludes recused members</Citation>
    </div>
  );
}

/* ════ Coverage analysis ════ */

function Coverage({ onGov }: { onGov: (cfg: GovAction) => void }) {
  const data = PDEV_COVERAGE;
  if (!data) return <div className="ra-sec"><div className="ra-empty-sec">Coverage data not loaded (PDEV_COVERAGE)</div></div>;
  const A: CoverageAnalysis = data.analysis;
  const [items, setItems] = useState<CoverageItem[]>(A.items);
  const classified = items.filter(i => i.designation !== 'Unclassified').length;
  const allClassified = classified === items.length;
  const q = A.qualifying;
  const setItemDesignation = (id: string, designation: string) => setItems(p => p.map(i => i.id === id ? { ...i, designation, valid: true } : i));
  const desigTone = (d: string) => d === 'Routine cost' ? 'ok' : d === 'Sponsor-paid' ? 'ai' : d === 'Unclassified' ? 'err' : 'idle';

  return (
    <div className="ra-sec">
      <div className="ra-cov-qual" data-q={q.determination.startsWith('Qualifying')}>
        <div className="ra-cov-qh">
          <div>
            <div className="ra-det-l">Qualifying-trial determination</div>
            <div className="ra-cov-det">{q.determination}</div>
          </div>
          <Citation basis="NCD 310.1 -- Routine Costs in Clinical Trials">NCD 310.1</Citation>
        </div>
        <div className="ra-cov-crit">
          {([['Therapeutic intent', q.therapeuticIntent], ['Enrolls Medicare beneficiaries', q.enrollsMedicare], ['Principal purpose = clinical benefit', q.principalPurpose], ['Deemed status', q.deemed]] as [string, boolean][]).map(([l, v], i) => (
            <span key={i} className="ra-cov-cr" data-on={v}><span className="ra-cov-ck">{v ? 'Y' : '--'}</span> {l}</span>
          ))}
        </div>
        <div className="ra-cov-rat">{q.rationale}</div>
      </div>
      <div className="ra-card">
        <div className="ra-card-h">
          <h3>Billing grid</h3>
          <span className="pd-pane-s">{classified}/{items.length} items classified</span>
        </div>
        <table className="ra-billing">
          <thead><tr><th>Item</th><th>SOC</th><th>Sponsor-paid</th><th>Designation</th><th>Basis</th><th>ICD-10</th></tr></thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id} className={i.designation === 'Unclassified' ? 'unclassified' : ''}>
                <td>{i.item}</td>
                <td><span className="ra-yn" data-y={i.soc}>{i.soc ? 'Yes' : 'No'}</span></td>
                <td><span className="ra-yn" data-y={i.sponsorPaid}>{i.sponsorPaid ? 'Yes' : 'No'}</span></td>
                <td><span className="pg-badge" data-tone={desigTone(i.designation)}>{i.designation}</span></td>
                <td className="ra-billing-ncd">{i.ncd}</td>
                <td>{i.icd10
                  ? <span className="pg-mono">{i.icd10}</span>
                  : <button className="ra-classify-btn" onClick={() => setItemDesignation(i.id, 'Routine cost')}>Classify</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ra-cov-foot">
          <div className="ra-disclaimer">{I.info} {A.disclaimer}</div>
          <button className="btn primary" disabled={!allClassified}
            onClick={() => onGov({ title: 'Finalize coverage analysis', intent: 'Finalize the Medicare coverage analysis. Every protocol item must be classified.', basis: 'NCD 310.1 / FCA risk -- advisory determination', esign: true })}>
            {I.fileCheck} {allClassified ? 'Finalize analysis' : 'Classify all items to finalize'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════ Grant finder ════ */

function Grants() {
  const G = PDEV_GRANTS;
  if (!G) return <div className="ra-sec"><div className="ra-empty-sec">Grant data not loaded (PDEV_GRANTS)</div></div>;
  const [q, setQ] = useState('');
  const opps: GrantOpportunity[] = (G.opportunities || []).filter((o: GrantOpportunity) => !q || o.title.toLowerCase().includes(q.toLowerCase()) || o.agency.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="ra-sec">
      <div className="ra-grid-prof">
        <div className="ra-card ra-profile">
          <div className="ra-card-h"><h3>Funding profile</h3></div>
          <ProfRow k="Keywords" items={G.profile?.keywords || []} />
          <ProfRow k="Agencies" items={G.profile?.agencies || []} />
          <ProfRow k="Mechanisms" items={G.profile?.mechanisms || []} />
          <div className="pd-kv"><span className="pd-kv-k">Institution</span><span className="pd-kv-v">{G.profile?.institutionType}</span></div>
          <div className="pd-kv"><span className="pd-kv-k">Award range</span><span className="pd-kv-v pg-mono">${(G.profile?.awardMin || 0) / 1000}K--${(G.profile?.awardMax || 0) / 1e6}M</span></div>
        </div>
        <div className="ra-discover">
          <div className="ra-search"><Ic n="search" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search opportunities..." /></div>
          {opps.map(o => (
            <div key={o.id} className={'ra-opp' + (o.eligible ? '' : ' inelig')}>
              <div className="ra-opp-fit" data-tier={o.fit >= 85 ? 'hi' : o.fit >= 65 ? 'mid' : 'lo'}>
                <span className="ra-opp-fit-n">{o.fit}</span><span className="ra-opp-fit-l">fit</span>
              </div>
              <div className="ra-opp-body">
                <div className="ra-opp-top">
                  <span className="ra-opp-title">{o.title}</span>
                  <span className="pd-chip">{o.mech}</span>
                </div>
                <div className="ra-opp-meta">
                  <span>{o.agency}</span><span className="pd-dot" /><span>{o.ceiling}</span>
                  <span className="pd-dot" />
                  <span className="ra-opp-deadline" data-soon={o.deadlineDays <= 21}>{o.deadlineDays}d to deadline</span>
                  {!o.eligible && <span className="pg-badge" data-tone="err">Ineligible</span>}
                </div>
                <div className="ra-opp-reasons">{o.reasons.map((r, i) => <span key={i} className="ra-reason"><span className="ra-reason-dot" />{r}</span>)}</div>
              </div>
              <button className="btn ghost">{I.checkSquare} Record</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfRow({ k, items }: { k: string; items: string[] }) {
  return (
    <div className="ra-prof-row">
      <span className="pd-kv-k">{k}</span>
      <div className="ra-prof-tags">{items.map((it, i) => <span key={i} className="pd-chip">{it}</span>)}</div>
    </div>
  );
}

/* ════ CITI training matrix ════ */

function Training() {
  const T = PDEV_CITI;
  if (!T) return <div className="ra-sec"><div className="ra-empty-sec">CITI training data not loaded (PDEV_CITI)</div></div>;
  const cellTone: Record<string, string> = { current: 'ok', expiring: 'warn', expired: 'err', missing: 'err', 'n/a': 'idle' };
  return (
    <div className="ra-sec">
      <div className="ra-grid2">
        <div className="ra-card">
          <div className="ra-card-h"><h3>Training matrix</h3><span className="pd-pane-s">{(T.personnel || []).length} personnel</span></div>
          <div className="ra-matrix-wrap">
            <table className="ra-matrix">
              <thead><tr>
                <th className="ra-mx-cnr">Personnel</th>
                {(T.trainings || []).map((t: string, i: number) => <th key={i} className="ra-mx-th"><span>{t}</span></th>)}
              </tr></thead>
              <tbody>
                {(T.personnel || []).map((p: any) => (
                  <tr key={p.id}>
                    <th className="ra-mx-rh"><span className="ra-mx-name">{p.name}</span><span className="ra-mx-role">{p.role}</span></th>
                    {(p.cells || []).map((c: string, i: number) => (
                      <td key={i} className="ra-mx-cell" data-tone={cellTone[c] || 'idle'} title={(T.trainings || [])[i] + ': ' + c}>{c === 'n/a' ? '--' : labelize(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="ra-card">
          <div className="ra-card-h"><h3>Expiring soon</h3><span className="pd-pane-s">{(T.expiring || []).length} within 30 days</span></div>
          <div className="ra-expiring">
            {(T.expiring || []).map((e: any, i: number) => (
              <div key={i} className="ra-exp-row">
                <span className="ra-exp-days" data-soon={e.days <= 14}>{e.days}d</span>
                <div>
                  <div className="ra-exp-name">{e.name}</div>
                  <div className="ra-exp-tr">{e.training}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════ Portfolio analytics ════ */

function Portfolio() {
  const P = PDEV_PORTFOLIO_ANALYTICS;
  if (!P) return <div className="ra-sec"><div className="ra-empty-sec">Portfolio data not loaded (PDEV_PORTFOLIO_ANALYTICS)</div></div>;
  const buckets = [
    { id: 'expired', label: 'Expired', t: 'err' },
    { id: 'due_30', label: 'Due <=30d', t: 'warn' },
    { id: 'due_90', label: 'Due <=90d', t: 'ai' },
    { id: 'current', label: 'Current', t: 'ok' },
  ] as const;
  const urgTone: Record<string, string> = { expired: 'err', due_30: 'warn', due_90: 'ai', upcoming: 'idle' };

  return (
    <div className="ra-sec">
      <div className="ra-buckets">
        {buckets.map(b => (
          <div key={b.id} className="ra-bucket" data-tone={b.t}>
            <div className="ra-bucket-n">{P.buckets[b.id] || 0}</div>
            <div className="ra-bucket-l">{b.label}</div>
          </div>
        ))}
      </div>
      <div className="ra-card">
        <div className="ra-card-h"><h3>Needs attention</h3><span className="pd-pane-s">Continuing-review queue, prioritized</span></div>
        <div className="ra-attention">
          {(P.needsAttention || []).map((n: any, i: number) => (
            <div key={i} className="ra-att-row">
              <span className="ra-att-urg" data-tone={urgTone[n.urgency] || 'idle'} />
              <div className="ra-att-body">
                <div className="ra-att-top"><span className="ra-att-prot">{n.protocol}</span><span className="pd-chip">{n.committee}</span></div>
                <div className="ra-att-issue">{n.issue}</div>
              </div>
              {n.citation !== '--' && <Citation basis={n.citation} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════ Shell ════ */

export function ResearchAdmin({ onAsk }: SurfaceViewProps) {
  const [sec, setSec] = useState('committees');
  const [gov, setGov] = useState<GovAction | null>(null);
  const onGov = (cfg: GovAction) => setGov(cfg);
  const body = (() => {
    switch (sec) {
      case 'coverage': return <Coverage onGov={onGov} />;
      case 'grants': return <Grants />;
      case 'training': return <Training />;
      case 'portfolio': return <Portfolio />;
      default: return <Committees onGov={onGov} />;
    }
  })();
  return (
    <div className="ra-wrap">
      <SampleTag sample={true} />
      <div className="ra-head">
        <div>
          <h1 className="ra-title">Research administration</h1>
          <div className="ra-sub">Committee governance, coverage analysis, funding and compliance -- for the research organization</div>
        </div>
        <button className="btn ghost" onClick={() => onAsk && onAsk('Summarize what needs my attention across committees, coverage and continuing review.')}>{I.sparkles} Ask AnA</button>
      </div>
      <div className="ra-tabs">
        {SECTIONS.map(s => (
          <button key={s.id} className={'ra-tab' + (sec === s.id ? ' on' : '')} onClick={() => setSec(s.id)}>
            <Ic n={s.icon} /> {s.label}
          </button>
        ))}
      </div>
      <div className="ra-body">{body}</div>
      <GovernedActionDialog
        open={!!gov}
        onClose={() => setGov(null)}
        onConfirm={() => {}}
        title={gov?.title}
        intent={gov?.intent}
        basis={gov?.basis}
        esign={gov?.esign}
      />
    </div>
  );
}

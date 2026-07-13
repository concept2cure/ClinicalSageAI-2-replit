import React, { useState, useMemo } from 'react';
import { I } from '../icons';

/* ── Helpers ── */
export const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const initials = (n: string) =>
  n.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
export const confBand = (c: number) => (c >= 0.85 ? 'hi' : c >= 0.7 ? 'med' : 'lo');

/* ── Team roster ── */
export interface TeamMember { name: string; role: string }
export const RCE_TEAM: TeamMember[] = [
  { name: 'Jordan Chen', role: 'Reg lead' },
  { name: 'Ana Muller', role: 'Medical' },
  { name: 'Marcus Webb', role: 'CMC' },
  { name: 'Raj Nair', role: 'Biostatistics' },
  { name: 'Priya Shah', role: 'Quality' },
];

/* ── Presence data ── */
export interface PresenceEntry {
  id: string; name: string; role: string; color: string;
  self?: boolean; ana?: boolean; at: string;
}
export const RCE_PRESENCE: PresenceEntry[] = [
  { id: 'jc', name: 'Jordan Chen', role: 'Reg Affairs · you', color: 'var(--accent-100)', self: true, at: 'editing' },
  { id: 'mw', name: 'Marcus Wei', role: 'Clinical · §2.5.4 2nd signer', color: 'var(--success)', at: 'viewing' },
  { id: 'er', name: 'Elena Ruiz', role: 'Biostatistics', color: 'var(--warning)', at: 'commenting' },
  { id: 'ana', name: 'AnA', role: 'Regulatory copilot', color: 'var(--ai)', ana: true, at: 'idle' },
];

/* ── PresenceCluster ── */
export function PresenceCluster() {
  const [open, setOpen] = useState(false);
  const atLabel: Record<string, string> = { editing: 'editing now', viewing: 'viewing', commenting: 'commenting', idle: 'standing by' };
  return (
    <div className="rce-presence" onMouseLeave={() => setOpen(false)}>
      <button className="rce-presence-stack" onClick={() => setOpen(o => !o)} title="People in this document">
        {RCE_PRESENCE.map(p => (
          <span key={p.id} className="rce-pres-av" data-ana={p.ana || undefined} style={{ background: p.color }} data-at={p.at}>
            {p.ana ? '✻' : initials(p.name)}
          </span>
        ))}
        <span className="rce-pres-n">{RCE_PRESENCE.length}</span>
      </button>
      {open && (
        <div className="rce-presence-pop">
          <div className="rce-pres-h">In this section</div>
          {RCE_PRESENCE.map(p => (
            <div key={p.id} className="rce-pres-row">
              <span className="rce-pres-av sm" data-ana={p.ana || undefined} style={{ background: p.color }}>{p.ana ? '✻' : initials(p.name)}</span>
              <div className="rce-pres-meta"><div className="rce-pres-name">{p.name}{p.self && <span className="rce-pres-you">you</span>}</div><div className="rce-pres-role">{p.role}</div></div>
              <span className="rce-pres-at" data-at={p.at}>{atLabel[p.at]}</span>
            </div>
          ))}
          <div className="rce-pres-foot">{I.info} Live presence syncs across co-authors</div>
        </div>
      )}
    </div>
  );
}

/* ── Outline ── */
export function Outline({ html, onJump }: { html: string; onJump: (i: number) => void }) {
  const data = useMemo(() => {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    const heads = [...d.querySelectorAll('h1,h2,h3,h4')].map(h => ({ level: +h.tagName[1], text: (h.textContent || '').trim() }));
    const text = (d.textContent || '').trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    return { heads, words, read: Math.max(1, Math.round(words / 200)), paras: d.querySelectorAll('p').length, tables: d.querySelectorAll('table').length, cites: d.querySelectorAll('.cite').length };
  }, [html]);
  return (
    <div className="rce-outline">
      <div className="rce-ol-stats">
        <div className="rce-ol-stat"><b>{data.words.toLocaleString()}</b><span>words</span></div>
        <div className="rce-ol-stat"><b>{data.read}</b><span>min read</span></div>
        <div className="rce-ol-stat"><b>{data.paras}</b><span>paras</span></div>
        <div className="rce-ol-stat"><b>{data.tables}</b><span>tables</span></div>
        <div className="rce-ol-stat"><b>{data.cites}</b><span>cites</span></div>
      </div>
      <div className="rce-ol-h">Outline</div>
      {data.heads.length === 0
        ? <div className="rce-ol-empty">No headings yet. Use the Style menu (Heading 1 / Heading 2) to structure this section — your headings appear here for one-click navigation.</div>
        : <div className="rce-ol-list">{data.heads.map((h, i) => (
            <button key={i} className="rce-ol-item" data-l={h.level} onClick={() => onJump(i)} title={h.text}>{h.text || 'Untitled heading'}</button>
          ))}</div>}
    </div>
  );
}

/* ── TablePicker ── */
export function TablePicker({ onInsert, onClose }: { onInsert: (r: number, c: number) => void; onClose: () => void }) {
  const [hov, setHov] = useState({ r: 0, c: 0 });
  const R = 5, C = 6;
  return (
    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--bg-000)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, zIndex: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', userSelect: 'none' }} onMouseLeave={() => setHov({ r: 0, c: 0 })}>
      <div style={{ fontSize: 10, color: 'var(--text-400)', marginBottom: 7, textAlign: 'center', minWidth: 132 }}>
        {hov.r > 0 && hov.c > 0 ? hov.r + ' × ' + hov.c + ' table' : 'Insert table'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + C + ',22px)', gap: 3 }}>
        {Array.from({ length: R * C }, (_, i) => {
          const r = Math.floor(i / C) + 1, c = (i % C) + 1;
          return <div key={i} onMouseEnter={() => setHov({ r, c })} onClick={() => { onInsert(r, c); onClose(); }}
            style={{ width: 20, height: 20, border: '1px solid', borderRadius: 3, cursor: 'pointer', transition: 'all .08s',
              borderColor: r <= hov.r && c <= hov.c ? 'var(--accent-100)' : 'var(--border)',
              background: r <= hov.r && c <= hov.c ? 'oklch(0.95 0.05 255)' : 'var(--bg-100)' }} />;
        })}
      </div>
    </div>
  );
}

/* ── MarginCommentPins ── */
interface CommentRef { resolved?: boolean; author?: string }
export function MarginCommentPins({ comments, onOpen }: { comments: CommentRef[]; onOpen: () => void }) {
  const open = (comments || []).filter(c => !c.resolved);
  if (!open.length) return null;
  return (
    <button onClick={onOpen} className="chip" style={{ cursor: 'pointer', background: 'var(--accent-000)', borderColor: 'var(--accent-100)', color: 'var(--accent-100)', gap: 4 }}>
      {open.slice(0, 3).map((c, i) => (
        <span key={i} style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-100)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: -4 }}>
          {(c.author || '?')[0].toUpperCase()}
        </span>
      ))}
      <span style={{ marginLeft: 6 }}>{open.length} comment{open.length === 1 ? '' : 's'}</span>
    </button>
  );
}

/* ── buildSeedMessages ── */
export interface SeedSection { num: string; label: string; conf: number }
export interface SeedPathway { code: string }
export function buildSeedMessages(sec: SeedSection | null, pathway: SeedPathway, mode: string) {
  if (!sec || !sec.num) return [];
  const sn = sec.num, sl = sec.label, code = pathway.code || 'NDA 212345';
  const anaAct = (window as any).anaAct;
  return [
    { role: 'user', body: 'Draft §' + sn + ' ' + sl + ' from the linked evidence.' },
    { delib: { kind: 'thinking', label: 'Planning §' + sn + ' — scanning 5 linked sources', sub: 'Thinking', status: 'done' } },
    { delib: { kind: 'tool', label: 'Evidence retrieval — CSR-201 §7.1, TPP v3.2, Statistical analysis plan', sub: 'Tool · RAG', status: 'done' } },
    { delib: { kind: 'tool', label: 'Regulatory precedent — 3 approved §' + sn + ' sections (FDA 2022–2024)', sub: 'Tool · Precedent DB', status: 'done' } },
    { delib: { kind: 'thinking', label: 'Structuring narrative — efficacy → safety → benefit-risk', sub: 'Author · ' + mode, status: 'done' } },
    { card: { title: 'Section drafted', rows: [
      { k: 'Inserted into', v: sn + ' · ' + sl },
      { k: 'Words', v: '2,140' },
      { k: 'Citations', v: '4 sources linked' },
      { k: 'Engine', v: mode },
      { k: 'Audit', v: 'AUD-8847', mono: true },
    ] } },
    { role: 'ana', body: 'Done — §' + sn + ' is drafted. I cited CSR-201, the TPP, and the statistical analysis plan. The narrative follows efficacy → safety → benefit-risk per the approved precedent structure. Review the tracked changes on the right.' },
    { role: 'user', body: 'Check FDA consistency for §' + sn },
    { delib: { kind: 'tool', label: 'FDA guidance cross-check — 21 CFR 314.50, ICH M4E(R2)', sub: 'Tool · Compliance', status: 'done' } },
    { card: { title: 'FDA consistency check', rows: [
      { k: 'Guidance alignment', v: '93%' },
      { k: 'Terminology flags', v: '2 minor' },
      { k: 'Missing elements', v: 'Dose rationale (recommended)' },
      { k: '21 CFR 314.50', v: 'Compliant' },
    ] } },
    { role: 'ana', body: 'Two minor flags: "response rate" should be "confirmed objective response rate (ORR)" per RECIST v1.1, and the CI should specify Clopper-Pearson. Both applied as tracked changes. I also recommend adding a dose rationale paragraph — want me to draft it?' },
    { role: 'user', body: 'Yes, draft the dose rationale and then export the full section as Word and PDF.' },
    { delib: { kind: 'thinking', label: 'Drafting dose rationale — PK overview, exposure-response, Phase I data', sub: 'Author · ' + mode, status: 'done' } },
    { delib: { kind: 'tool', label: 'Generating native .docx — Georgia 11pt, FDA headers, tracked changes preserved', sub: 'Tool · run_python_script', status: 'done' } },
    { delib: { kind: 'tool', label: 'Generating PDF — print-ready with margin notes and audit watermark', sub: 'Tool · render_pdf', status: 'done' } },
    { card: { title: 'Dose rationale added + exports ready', rows: [
      { k: 'Paragraph', v: '§' + sn + '.3 Dose rationale' },
      { k: 'Words added', v: '340' },
      { k: 'Total section', v: '2,480 words' },
      { k: 'Exports', v: 'DOCX + PDF' },
    ] } },
    { artifact: { name: code + ' §' + sn + ' ' + sl + '.docx', meta: 'Document · Word (DOCX) · 2,480 words · Track changes preserved', onDownload: () => anaAct && anaAct({ work: 'Preparing download…', label: 'DOCX downloaded', detail: code + ' §' + sn, tone: 'ok' }) } },
    { artifact: { name: code + ' §' + sn + ' ' + sl + '.pdf', meta: 'Document · PDF · Print-ready with audit watermark', onDownload: () => anaAct && anaAct({ work: 'Preparing download…', label: 'PDF downloaded', detail: code + ' §' + sn, tone: 'ok' }) } },
    { role: 'ana', body: 'Both files are ready. The DOCX preserves all tracked changes and citations — open it in Word or back here in the editor. The PDF is print-ready with the audit watermark. You can continue editing in the document canvas on the left; everything stays in sync.' },
  ];
}

/* ── Tb — toolbar button helper ── */
export function Tb({ icon, label, on, onClick, title, disabled, cls }: {
  icon?: string; label?: string; on?: boolean; onClick?: () => void;
  title?: string; disabled?: boolean; cls?: string;
}) {
  return (
    <button className={cls || 'tbtn'} data-on={on || undefined} disabled={disabled || undefined} title={title || label} onMouseDown={e => e.preventDefault()} onClick={onClick}>
      {icon ? (I as Record<string, React.ReactNode>)[icon] : null}{label ? <span>{label}</span> : null}
    </button>
  );
}

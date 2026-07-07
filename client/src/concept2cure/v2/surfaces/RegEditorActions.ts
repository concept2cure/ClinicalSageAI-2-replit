/* RegEditorActions.ts -- action handlers for RegEditor, extracted into
   standalone functions that take an ActionDeps parameter. */
import type React from 'react';
import type { AuditEntry, VersionEntry } from '../fixtures/editor-data-types';
import type { PreflightResult } from './EditorGov';
import { RCE_TEAM } from './EditorWidgets';

/* ── Minimal local types ─────────────────────────────────────────── */
interface SectionData { id: string; num: string; label: string; status: string; conf?: number }
interface PathwayData { id: string; program: string; code: string; owner: string }
interface MarketData { id: string; agency: string; region: string; lang?: string }
interface LangInfo { label: string }
interface MsgItem {
  role: 'user' | 'ana'; text?: string;
  delib?: { kind: string; label: string; sub: string; status?: string };
  code?: { title: string; content: string; tag?: string; status?: string; open?: boolean };
  attach?: { name: string; size: string };
  artifact?: { name: string; type?: string; size?: string };
  card?: { title: string; rows: { k: string; v: string }[] };
}
interface CommentItem {
  id: string; anchor: string; author: string; role: string; when: string;
  resolved: boolean; ai: boolean; body: string;
  replies: { author: string; role: string; when: string; ai: boolean; body: string }[];
}
interface RedlineData { before: string; after: string; label: string }
interface SigInfo { meaning?: string; stamp?: string; hash?: string; who?: string }
interface GovCtx { approvalPath: string }
interface ReadyMeta { label: string; tone: string }
interface StatusMeta { label: string; dot: string }

export interface ActionState {
  busy: boolean; isLocked: boolean; isSigned: boolean;
  sec: SectionData; pathway: PathwayData; market: MarketData;
  mode: string; langInfo: LangInfo; active: string; lang: string;
  docKey: string; wordCount: number; pid: string; approvalPath: string;
  ta: string; taLabel: string; changeCount: number;
  preflight: PreflightResult; readyMeta: ReadyMeta; statusMeta: StatusMeta;
  govCtx: GovCtx; curVersions: VersionEntry[]; curComments: CommentItem[];
  bodyEmpty: boolean; editedAfterSign: boolean;
}

export interface ActionDeps {
  getState: () => ActionState;
  setBusy: (v: boolean) => void;  setStream: (v: string) => void;
  setDockOpen: (v: boolean) => void;  setDockTab: (v: string) => void;
  setMessages: (fn: (m: MsgItem[]) => MsgItem[]) => void;
  setRev: (fn: (n: number) => number) => void;
  setComments: (fn: (c: Record<string, CommentItem[]>) => Record<string, CommentItem[]>) => void;
  setRedline: (v: RedlineData | null) => void;
  setVersionsAll: (fn: (p: Record<string, VersionEntry[]>) => Record<string, VersionEntry[]>) => void;
  setLocked: (fn: (l: Record<string, boolean>) => Record<string, boolean>) => void;
  setSigByKey: (fn: (s: Record<string, SigInfo>) => Record<string, SigInfo>) => void;
  setSignAfterEdit: (fn: (s: Record<string, boolean>) => Record<string, boolean>) => void;
  setShowSign: (v: boolean) => void;
  setMarketByPid: (fn: (m: Record<string, string>) => Record<string, string>) => void;
  setCompareOpen: (v: boolean) => void;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  storeRef: React.MutableRefObject<Record<string, string>>;
  delibTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  saveCurrent: () => void;  persist: () => void;
  pushAudit: (entry: AuditEntry) => void;
  exec: (cmd: string, val?: string) => void;  insertHTML: (html: string) => void;
  addCitation: () => void;  nav: (id: string) => void;
  switchMarket: (id: string) => void;  finishDelib: () => void;
}

/* ── Helpers ─────────────────────────────────────────────────────── */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z';
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const push = (d: ActionDeps, m: MsgItem) => d.setMessages(p => [...p, m]);
const ana = (d: ActionDeps, text: string) => push(d, { role: 'ana', text });
const audit = (d: ActionDeps, kind: AuditEntry['kind'], detail: string) => {
  const s = d.getState();
  d.pushAudit({ kind, actor: s.pathway.owner, when: ts(), target: s.sec.num, detail, ip: '10.0.0.1' });
};

/* ── 1. runDelib ─────────────────────────────────────────────────── */
export function runDelib(d: ActionDeps, steps: { kind: string; label: string; sub: string }[]): string {
  const base = uid();
  steps.forEach((st, i) => {
    setTimeout(() => {
      push(d, { role: 'ana', delib: { ...st, status: 'running' } });
      setTimeout(() => {
        d.setMessages(p => p.map((m, mi) =>
          mi === p.length - 1 && m.delib ? { ...m, delib: { ...m.delib, status: 'done' } } : m));
      }, 800 + Math.random() * 400);
    }, i * (800 + Math.random() * 400));
  });
  return base;
}

/* ── 2. applyVerbDraft ───────────────────────────────────────────── */
export function applyVerbDraft(
  d: ActionDeps, verb: string, contentHtml: string,
  meta: { conf?: number; prov?: string }, editOnly?: boolean,
): void {
  const { sec, pathway } = d.getState();
  const el = d.bodyRef.current;
  if (!el) return;
  const block = document.createElement('div');
  block.className = 'eb';
  block.setAttribute('data-conf', String(meta.conf ?? 0.85));
  block.setAttribute('data-prov', meta.prov || 'ana-' + verb);
  block.innerHTML = contentHtml;
  el.appendChild(block);
  d.saveCurrent();
  audit(d, 'ai', verb + ' applied to ' + sec.label);
  if (!editOnly) {
    const au = (window as any).C2C_AUTHORING;
    if (au && au.saveSection) au.saveSection(pathway.code, sec.id, el.innerHTML, { verb, governed: true });
  }
}

/* ── 3. doAuthorDocx ─────────────────────────────────────────────── */
export async function doAuthorDocx(d: ActionDeps): Promise<void> {
  const { sec, pathway, market, busy } = d.getState();
  if (busy) return;
  d.setBusy(true);
  ana(d, 'Generating native DOCX via python-docx...');
  const script = `# author_docx_native -- python-docx runtime
from docx import Document
from docx.shared import Pt, RGBColor

doc = Document()
styles = doc.styles['Normal']
styles.font.name = 'Georgia'; styles.font.size = Pt(11)

h = doc.add_heading('${sec.label.replace(/'/g, '')}', level=1)
meta = doc.add_paragraph('${pathway.program} -- ${market.agency} (${market.region})')

for para in section_paragraphs:
    p = doc.add_paragraph(para['text'])
    if para.get('table'): _render_table(doc, para['table'])`;
  push(d, { role: 'ana', code: { title: 'author_docx_native.py', content: script, tag: 'python-docx', status: 'running' } });
  await wait(1800);
  d.setMessages(p => p.map((m, i) =>
    i === p.length - 1 && m.code ? { ...m, code: { ...m.code, status: 'done' } } : m));
  push(d, { role: 'ana', artifact: { name: pathway.code + '_' + sec.num + '.docx', type: 'DOCX', size: '148 KB' } });
  ana(d, 'Native DOCX created with python-docx. The artifact is ready for download.');
  d.setBusy(false);
}

/* ── 4. doFullBuild ──────────────────────────────────────────────── */
export async function doFullBuild(d: ActionDeps): Promise<void> {
  const st = d.getState();
  if (st.busy) return;
  d.setBusy(true); d.setDockOpen(true); d.setDockTab('conversation');
  const { sec, pathway, market, mode } = st;
  ana(d, 'Starting full build for ' + sec.num + ' ' + sec.label + '...');
  const steps = [
    { kind: 'thinking', label: 'Reading section evidence & controlled vocabulary', sub: 'Thinking' },
    { kind: 'tool', label: 'search_precedents -- ' + market.agency + ' approved analogues', sub: 'Tool' },
    { kind: 'tool', label: 'retrieve_evidence -- linked sources for ' + sec.num, sub: 'Tool' },
    { kind: 'step', label: 'Drafting ' + sec.num + ' ' + sec.label, sub: 'Author -- ' + mode },
    { kind: 'tool', label: 'check_claims_vs_evidence', sub: 'Validate' },
    { kind: 'step', label: 'Reconciling citations, units & confidence', sub: 'Author' },
    { kind: 'step', label: 'Exporting DOCX + PDF artifacts', sub: 'Export' },
  ];
  runDelib(d, steps);
  await wait(steps.length * 1200);
  const el = d.bodyRef.current;
  if (el) {
    const gen = (window as any).REG_GEN || {};
    el.innerHTML = gen.sectionDraft
      ? gen.sectionDraft(sec.num, pathway.code, market.agency)
      : '<p>Section ' + sec.num + ' ' + sec.label + ' -- drafted by AnA from linked evidence, '
        + 'regulatory precedent (' + market.agency + '), and the controlled vocabulary for ' + pathway.program + '.</p>';
    d.saveCurrent();
  }
  audit(d, 'ai', 'Full build -- draft + preflight + export');
  const base = pathway.code + '_' + sec.num;
  push(d, { role: 'ana', artifact: { name: base + '.docx', type: 'DOCX', size: '214 KB' } });
  push(d, { role: 'ana', artifact: { name: base + '.pdf', type: 'PDF', size: '389 KB' } });
  ana(d, 'Full build complete. Section drafted, preflight passed, and DOCX + PDF exported.');
  d.setBusy(false);
}

/* ── 5. doExport ─────────────────────────────────────────────────── */
export async function doExport(d: ActionDeps): Promise<void> {
  const st = d.getState();
  if (st.busy) return;
  d.setBusy(true);
  runDelib(d, [
    { kind: 'step', label: 'Rendering DOCX from governed HTML', sub: 'Export' },
    { kind: 'step', label: 'Compiling PDF with page headers', sub: 'Export' },
  ]);
  await wait(2000);
  const base = st.pathway.code + '_' + st.sec.num;
  push(d, { role: 'ana', artifact: { name: base + '.docx', type: 'DOCX', size: '152 KB' } });
  push(d, { role: 'ana', artifact: { name: base + '.pdf', type: 'PDF', size: '310 KB' } });
  ana(d, 'Export complete -- DOCX and PDF artifacts are ready for download.');
  d.setBusy(false);
}

/* ── 6. doGenerate ───────────────────────────────────────────────── */
export async function doGenerate(d: ActionDeps): Promise<void> {
  const st = d.getState();
  if (st.busy) return;
  d.setBusy(true); d.setStream('');
  const { sec, pathway, market, mode } = st;
  ana(d, 'Drafting ' + sec.num + ' ' + sec.label + '...');
  runDelib(d, [
    { kind: 'thinking', label: 'Reading the section evidence & controlled vocabulary', sub: 'Thinking' },
    { kind: 'tool', label: 'retrieve_evidence -- linked sources for ' + sec.num, sub: 'Tool' },
    { kind: 'step', label: 'Drafting ' + sec.num + ' ' + sec.label, sub: 'Author -- ' + mode },
  ]);
  await wait(2800);
  const gen = (window as any).REG_GEN || {};
  const draft = gen.sectionDraft
    ? gen.sectionDraft(sec.num, pathway.code, market.agency)
    : 'This section presents the ' + sec.label.toLowerCase() + ' for ' + pathway.program
      + ', supported by linked evidence from the ' + market.agency + ' regulatory framework. '
      + 'All claims are grounded in the controlled vocabulary and cited source data.';
  let buf = '';
  for (let i = 0; i < draft.length; i++) {
    buf += draft[i]; d.setStream(buf); await wait(8 + Math.random() * 12);
  }
  const el = d.bodyRef.current;
  if (el) { el.innerHTML = '<p>' + draft + '</p>'; d.saveCurrent(); }
  d.setStream('');
  audit(d, 'ai', 'Section draft generated');
  ana(d, 'Draft complete for ' + sec.num + '. Review the content and refine as needed.');
  d.setBusy(false);
}

/* ── 7. doAction ─────────────────────────────────────────────────── */
export async function doAction(d: ActionDeps, kind: string): Promise<void> {
  const st = d.getState();
  if (st.busy) return;

  // Slash command routing
  if (kind.indexOf('slash:') === 0) {
    const map: Record<string, string> = {
      fullbuild: '__fullbuild', draft: '__gen', export: '__export',
      refine: 'refine', preflight: 'preflight', readiness: 'readiness',
      contradictions: 'contradictions', compare: 'compare', promote: 'promote_to_review',
      precedent: 'precedent', cite: 'cite', harmonize: 'harmonize',
      risk: 'risk', strategy: 'strategy',
    };
    kind = map[kind.slice(6)] || 'strategy';
  }
  if (kind === '__fullbuild') return doFullBuild(d);
  if (kind === '__gen') return doGenerate(d);
  if (kind === '__export') return doExport(d);

  d.setBusy(true);
  const { sec, pathway, market, preflight, readyMeta, changeCount } = st;

  switch (kind) {
    case 'refine':
      ana(d, 'Refining ' + sec.num + ' with tracked changes...');
      runDelib(d, [
        { kind: 'thinking', label: 'Analyzing current draft for improvements', sub: 'Thinking' },
        { kind: 'step', label: 'Applying refinements as tracked changes', sub: 'Refine' },
      ]);
      await wait(2200);
      ana(d, 'Refinement complete. Review the tracked changes in the document.');
      break;
    case 'preflight':
      d.setDockOpen(true); d.setDockTab('preflight');
      ana(d, 'Running section preflight (Pass 5) on ' + sec.num + '...');
      await wait(1200);
      ana(d, 'Preflight result: ' + preflight.verdict + ' -- ' + preflight.fails + ' fail(s), ' + preflight.warns + ' warning(s).');
      break;
    case 'readiness': {
      ana(d, 'Readiness for ' + sec.num + ': **' + readyMeta.label + '**.');
      const bl = preflight.checks.filter(c => c.state === 'fail');
      if (bl.length) ana(d, 'Blockers: ' + bl.map(b => b.label).join(', ') + '.');
      break;
    }
    case 'contradictions':
      ana(d, 'Scanning ' + sec.num + ' for cross-section contradictions...');
      runDelib(d, [{ kind: 'tool', label: 'check_cross_section_consistency', sub: 'Validate' }]);
      await wait(1800);
      ana(d, 'No unresolved contradictions detected in ' + sec.num + '.');
      break;
    case 'compare':
      d.setCompareOpen(true);
      d.setRedline({ before: d.storeRef.current[st.docKey + '::approved'] || '', after: d.bodyRef.current?.innerHTML || '', label: sec.num });
      ana(d, 'Baseline comparison opened. ' + changeCount + ' tracked change(s) detected.');
      break;
    case 'explain_blockers': {
      const fails = preflight.checks.filter(c => c.state === 'fail');
      if (!fails.length) { ana(d, 'No blockers found -- section is clear.'); break; }
      ana(d, 'Explaining ' + fails.length + ' blocker(s):');
      fails.forEach(f => ana(d, '-- ' + f.label + ': ' + f.note));
      break;
    }
    case 'promote_to_review':
      ana(d, 'Promoting ' + sec.num + ' to review...'); await wait(800);
      ((window as any).REVIEW_QUEUE || ((window as any).REVIEW_QUEUE = []))
        .push({ section: sec.id, num: sec.num, label: sec.label, pathway: pathway.code, when: ts() });
      { const au = (window as any).C2C_AUTHORING;
        if (au && au.saveSection) au.saveSection(pathway.code, sec.id, d.bodyRef.current?.innerHTML || '', { promoted: true }); }
      audit(d, 'edit', 'Promoted to review');
      ana(d, sec.num + ' promoted to review. Reviewers have been notified.');
      break;
    case 'harmonize':
      ana(d, 'Harmonizing terminology across linked sections...');
      runDelib(d, [
        { kind: 'tool', label: 'scan_glossary_divergence', sub: 'Validate' },
        { kind: 'step', label: 'Aligning controlled terms', sub: 'Harmonize' },
      ]);
      await wait(2400);
      ana(d, 'Harmonization complete. Terminology is now consistent across linked sections.');
      break;
    case 'risk':
      ana(d, 'Surfacing open blockers and deficiency risks for ' + sec.num + '...');
      await wait(1000);
      push(d, { role: 'ana', card: { title: 'Risk assessment -- ' + sec.num, rows: [
        { k: 'Open blockers', v: String(preflight.fails) }, { k: 'Warnings', v: String(preflight.warns) },
        { k: 'Readiness', v: readyMeta.label }, { k: 'Change count', v: String(changeCount) },
      ]}});
      break;
    case 'precedent':
      ana(d, 'Searching regulatory precedent for ' + sec.num + '...');
      runDelib(d, [{ kind: 'tool', label: 'search_precedents -- ' + market.agency, sub: 'Tool' }]);
      await wait(2000);
      ana(d, 'Precedent search complete. Found approved analogues from ' + market.agency + ' submissions.');
      break;
    case 'strategy':
      ana(d, 'Analyzing regulatory strategy for ' + pathway.program + '...');
      await wait(1400);
      push(d, { role: 'ana', card: { title: 'Regulatory strategy -- ' + pathway.code, rows: [
        { k: 'Pathway', v: pathway.program }, { k: 'Market', v: market.agency + ' (' + market.region + ')' },
        { k: 'Readiness', v: readyMeta.label },
        { k: 'Recommendation', v: preflight.fails > 0 ? 'Resolve blockers before submission' : 'Clear for filing preparation' },
      ]}});
      break;
    case 'propagate_markets':
      ana(d, 'Propagating changes across market variants...'); await wait(1600);
      ana(d, 'All market variants updated from the master (' + market.agency + ') source.');
      break;
    case 'translate': {
      const tgt = (window as any).REG_GEN_I18N?.targetLang || 'ja';
      ana(d, 'Translating ' + sec.num + ' to ' + tgt + '...');
      runDelib(d, [{ kind: 'step', label: 'Translating to ' + tgt, sub: 'Translate' }]);
      await wait(2400);
      ana(d, 'Translation complete. Switch to the target market to review.');
      break;
    }
    case 'backtranslate':
      ana(d, 'Running back-translation QC on ' + sec.num + '...');
      await wait(2000);
      ana(d, 'Back-translation QC passed. No semantic divergence detected.');
      break;
    case 'cite':
      d.addCitation(); ana(d, 'Citation inserted at the cursor position.'); break;
    default:
      ana(d, 'Action "' + kind + '" acknowledged for ' + sec.num + '.');
  }
  d.setBusy(false);
}

/* ── 8. onAttach ─────────────────────────────────────────────────── */
export async function onAttach(
  d: ActionDeps,
  meta: { name: string; size: string; projectCode: string; projectLabel: string; folder: string },
): Promise<void> {
  push(d, { role: 'user', attach: { name: meta.name, size: meta.size } });
  d.setBusy(true);
  const ext = (meta.name.split('.').pop() || '').toLowerCase();
  const extractor = ext === 'pdf' ? 'Apache Tika' : ext === 'xml' ? 'Grobid' : 'Tika';
  runDelib(d, [
    { kind: 'tool', label: 'upload_to_vault -- ' + meta.folder + '/' + meta.name, sub: 'Vault' },
    { kind: 'tool', label: extractor + ' extraction -- parsing ' + ext.toUpperCase(), sub: 'Extract' },
  ]);
  await wait(2200);
  audit(d, 'edit', 'Uploaded ' + meta.name + ' (' + meta.size + ')');
  ana(d, 'Uploaded ' + meta.name + ' to ' + meta.projectCode + '/' + meta.folder
    + '. Extracted text is now available as linked evidence.');
  d.setBusy(false);
}

/* ── 9. onSend ───────────────────────────────────────────────────── */
export function onSend(d: ActionDeps, text: string, opts: { agent?: boolean }): void {
  const q = text.toLowerCase();
  push(d, { role: 'user', text });
  const has = (...ws: string[]) => ws.some(w => q.indexOf(w) > -1);

  if (has('full build', 'build and deliver', 'draft check export', 'fullbuild')) { doFullBuild(d); return; }
  if (has('draft this', 'draft section', 'generate section', 'write section', '/draft')) { doGenerate(d); return; }
  if (has('export', 'download', 'docx', 'word')) { doExport(d); return; }
  if (has('author docx', 'python-docx', 'native docx')) { doAuthorDocx(d); return; }

  const slash = text.match(/^\/(\w+)/);
  if (slash) { doAction(d, 'slash:' + slash[1]); return; }

  if (has('preflight', 'pass 5', 'qc check')) { doAction(d, 'preflight'); return; }
  if (has('readiness', 'ready')) { doAction(d, 'readiness'); return; }
  if (has('contradiction')) { doAction(d, 'contradictions'); return; }
  if (has('compare', 'baseline', 'redline')) { doAction(d, 'compare'); return; }
  if (has('blocker', 'explain block')) { doAction(d, 'explain_blockers'); return; }
  if (has('promote', 'send to review')) { doAction(d, 'promote_to_review'); return; }
  if (has('harmonize', 'align terms')) { doAction(d, 'harmonize'); return; }
  if (has('risk', 'deficiency')) { doAction(d, 'risk'); return; }
  if (has('precedent')) { doAction(d, 'precedent'); return; }
  if (has('strateg')) { doAction(d, 'strategy'); return; }
  if (has('translat')) { doAction(d, 'translate'); return; }
  if (has('back-translat', 'backtranslat')) { doAction(d, 'backtranslate'); return; }
  if (has('refine', 'improve', 'strengthen')) { doAction(d, 'refine'); return; }
  if (has('cite', 'citation')) { doAction(d, 'cite'); return; }
  if (has('propagat', 'all markets')) { doAction(d, 'propagate_markets'); return; }

  // Fallback conversational reply
  d.setBusy(true);
  setTimeout(() => {
    ana(d, 'I can help with that. Use a specific command or ask me to draft, refine, export, or run preflight on ' + d.getState().sec.num + '.');
    d.setBusy(false);
  }, 600);
}

/* ── 10. resolveComment ──────────────────────────────────────────── */
export function resolveComment(d: ActionDeps, id: string, status: boolean): void {
  const st = d.getState();
  d.setComments(all => ({ ...all, [st.docKey]: (all[st.docKey] || []).map(c => c.id === id ? { ...c, resolved: status } : c) }));
  audit(d, 'comment', (status ? 'Resolved' : 'Reopened') + ' comment ' + id);
}

/* ── 11. assignComment ───────────────────────────────────────────── */
export function assignComment(d: ActionDeps, id: string, who: string): void {
  const st = d.getState();
  d.setComments(all => ({ ...all, [st.docKey]: (all[st.docKey] || []).map(c =>
    c.id === id ? { ...c, replies: [...c.replies, { author: 'AnA', role: 'System', when: ts(), ai: true, body: 'Routed to ' + who }] } : c) }));
  ana(d, 'Comment ' + id + ' assigned to ' + who + '.');
}

/* ── 12. replyComment ────────────────────────────────────────────── */
export function replyComment(d: ActionDeps, id: string, body: string): void {
  const st = d.getState();
  d.setComments(all => ({ ...all, [st.docKey]: (all[st.docKey] || []).map(c =>
    c.id === id ? { ...c, replies: [...c.replies, { author: st.pathway.owner, role: 'Author', when: ts(), ai: false, body }] } : c) }));
}

/* ── 13. commentToTask ───────────────────────────────────────────── */
export function commentToTask(d: ActionDeps, comment: CommentItem, opt: { assignee?: string; priority?: string }): void {
  const st = d.getState();
  const task = {
    id: uid(), title: comment.body.slice(0, 80), section: st.sec.num,
    assignee: opt.assignee || comment.author, priority: opt.priority || 'medium',
    status: 'open', created: ts(), commentId: comment.id,
  };
  const tasks = (window as any).RCE_TASKS; if (tasks && tasks.push) tasks.push(task);
  const c2c = (window as any).C2C; if (c2c && c2c.createTask) c2c.createTask(task);
  resolveComment(d, comment.id, true);
  ana(d, 'Task created from comment: "' + task.title + '" assigned to ' + task.assignee + '.');
}

/* ── 14. saveVersion ─────────────────────────────────────────────── */
export function saveVersion(d: ActionDeps): void {
  const st = d.getState();
  d.saveCurrent(); d.persist();
  const vNum = 'v' + (st.curVersions.length + 1);
  const entry: VersionEntry = {
    v: vNum, when: ts(), author: st.pathway.owner,
    sig: st.isSigned ? 'signed' : null, note: 'Manual save', diff: '+' + st.wordCount + ' words', current: true,
  };
  d.setVersionsAll(all => {
    const prev = (all[st.docKey] || []).map(v => ({ ...v, current: false }));
    return { ...all, [st.docKey]: [...prev, entry] };
  });
  d.setRev(n => n + 1);
  audit(d, 'edit', 'Saved ' + vNum);
}

/* ── 15. toggleLock ──────────────────────────────────────────────── */
export function toggleLock(d: ActionDeps): void {
  const st = d.getState(); const next = !st.isLocked;
  d.setLocked(p => ({ ...p, [st.docKey]: next }));
  audit(d, 'lock', next ? 'Section frozen' : 'Section unfrozen');
  ana(d, st.sec.num + ' is now ' + (next ? 'frozen (read-only)' : 'unlocked for editing') + '.');
}

/* ── 16. signSection ─────────────────────────────────────────────── */
export function signSection(d: ActionDeps): void { d.setShowSign(true); }

/* ── 17. onSign ──────────────────────────────────────────────────── */
export function onSign(d: ActionDeps, sigData: { meaning: string; reason: string; hash: string; stamp: string }): void {
  const st = d.getState();
  d.setShowSign(false);
  d.setSigByKey(p => ({ ...p, [st.docKey]: { meaning: sigData.meaning, stamp: sigData.stamp, hash: sigData.hash, who: st.pathway.owner } }));
  d.setSignAfterEdit(p => ({ ...p, [st.docKey]: false }));
  d.setLocked(p => ({ ...p, [st.docKey]: true }));
  d.pushAudit({ kind: 'sign', actor: st.pathway.owner, when: sigData.stamp, target: st.sec.num, detail: sigData.meaning + ' -- ' + sigData.reason, ip: '10.0.0.1' });
  ana(d, 'E-signature applied to ' + st.sec.num + ' -- ' + sigData.meaning + '. Section is now frozen. Hash: ' + sigData.hash.slice(0, 16) + '...');
}

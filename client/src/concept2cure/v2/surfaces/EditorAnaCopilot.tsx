import React, { useState, useRef, useEffect, useMemo } from 'react';
import { I } from '../icons';
import { connected, SampleTag } from '../dataConnect';
import { AnaVerbBar, RegistryContextHeader, StreamingRenderer } from './AnaVerbs';
import { EsignModal } from '../../_shared/components/EsignModal';
import { GLOBAL_REGISTRY } from './RegistryBridge';
import { getSectionContext } from '../fixtures/editor-health-data';
import { REG_LANGS, type LangCode } from '../fixtures/editor-data-types';
import { REG_PATHWAYS } from '../fixtures/editor-pathways';

/* ----------------------------------------------------------------
   AnA Co-Author copilot panel -- the conversational co-authoring
   surface used inside the document editor. Renders context strip,
   verb bar, conversation thread (deliberation, code, attachments,
   artifacts, cards, plain messages), quick actions drawer, file
   upload, and the compose area.
   ---------------------------------------------------------------- */

/* -- Interfaces -- */

interface CodeBlockData {
  title: string; content: string; tag?: string;
  status?: 'running' | 'done' | 'error'; open?: boolean;
}

interface DelibData { kind: string; label: string; sub: string; status?: string; }
interface AttachData { name: string; size: string; }
interface ArtifactData { name: string; type?: string; size?: string; }
interface CardData { title: string; rows: { k: string; v: string }[]; }

interface Message {
  role: 'user' | 'ana'; text?: string; delib?: DelibData;
  code?: CodeBlockData; attach?: AttachData; artifact?: ArtifactData; card?: CardData;
}

interface Section { id: string; num: string; label: string; status?: string; conf?: number; }
interface Pathway { id: string; program?: string; code?: string; }
interface Market { agency: string; region: string; lang?: string; }
interface PendingFile { name: string; size: string; }
interface PathwayDef { code: string; kind?: string; tree?: { vol: string }[]; }

interface AttachPayload {
  name: string; size: string;
  projectCode: string; projectLabel: string; folder: string;
}

interface AnaCopilotProps {
  pathway: Pathway; section: Section; busy: boolean;
  onGenerate?: () => void; onAction?: (id: string) => void;
  onVerbApply?: (verb: string, html?: string, meta?: { conf?: number; prov?: string }, editOnly?: boolean) => void;
  onAttach?: (payload: AttachPayload) => void;
  messages: Message[]; onSend: (text: string, opts: { agent: boolean }) => void;
  mode: string; setMode: React.Dispatch<React.SetStateAction<string>>;
  market: Market; markets?: Market[]; lang?: string;
  langInfo?: { label: string }; taLabel?: string; pid?: string; defaultFolder?: string;
}

/* ----------------------------------------------------------------
   CodeBlock -- collapsible code/script block inside the thread
   ---------------------------------------------------------------- */

export function CodeBlock({ block }: { block: CodeBlockData }) {
  const [open, setOpen] = useState(block.open !== false);
  return (
    <div className="rce-code" data-status={block.status}>
      <button className="rce-code-h" onClick={() => setOpen(o => !o)}>
        <span className="rce-code-chev" data-open={open || undefined}>{I.chevRight}</span>
        <span className="rce-code-ic">{I.terminal}</span>
        <span className="rce-code-t">{block.title}</span>
        <span className="rce-code-tag">{block.tag || 'Script'}</span>
        {block.status === 'running' && <span className="rce-delib-spin" />}
        {block.status === 'done' && <span className="rce-delib-ok">{I.check}</span>}
      </button>
      {open && <pre className="rce-code-pre"><code>{block.content}</code></pre>}
    </div>
  );
}

/* ----------------------------------------------------------------
   AnaCopilot -- the full co-author panel
   ---------------------------------------------------------------- */

export function AnaCopilot({
  pathway, section, busy, onGenerate, onAction, onVerbApply, onAttach,
  messages, onSend, mode, setMode, market, markets, lang, langInfo,
  taLabel, pid, defaultFolder,
}: AnaCopilotProps) {
  const [draft, setDraft] = useState('');
  const [agent, setAgent] = useState(false);
  const [actsOpen, setActsOpen] = useState(false);
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [activeVerb, setActiveVerb] = useState<string | null>(null);
  const [govAction, setGovAction] = useState<string | null>(null);

  const regType = useMemo(
    () => GLOBAL_REGISTRY.find(e => e.pathwayKey === pathway.id),
    [pathway.id],
  );
  const subTypeId = regType ? regType.id : null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const send = (txt?: string | null) => {
    const t = (txt != null ? txt : draft).trim();
    if (!t) return;
    onSend(t, { agent });
    setDraft('');
  };

  /* Section context */
  const secCtxObj = getSectionContext(section.num);
  const secCtxLabel = secCtxObj.type;

  /* Other-market lookup */
  const other = (markets || []).find(m => m.lang !== lang);
  const otherLang = other
    ? (REG_LANGS[other.lang as LangCode] || { label: other.lang }).label
    : null;

  /* Project picker for uploads */
  const PW: Record<string, PathwayDef> = REG_PATHWAYS;
  const projOpts = Object.keys(PW).map(id => ({
    id, code: PW[id].code, label: PW[id].code + ' · ' + (PW[id].kind || 'document'),
  }));
  const [upProj, setUpProj] = useState(pid || (projOpts[0] && projOpts[0].id) || '');
  const [upFolder, setUpFolder] = useState(defaultFolder || '');
  const folderList = ((PW[upProj] || {}).tree || [])
    .map(v => v.vol).filter((v, i, a) => v && a.indexOf(v) === i);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const fl = ((PW[pid || ''] || {}).tree || []).map(v => v.vol).filter(Boolean);
    setUpProj(pid || '');
    setUpFolder(defaultFolder || fl[0] || '');
    setPending({ name: f.name, size: Math.max(1, Math.round((f.size || 12000) / 1024)) + ' KB' });
    e.target.value = '';
  };

  const confirmUpload = () => {
    if (!pending) return;
    const p = projOpts.find(o => o.id === upProj) || { code: upProj, label: upProj };
    onAttach && onAttach({
      name: pending.name, size: pending.size,
      projectCode: p.code || upProj, projectLabel: p.label || upProj, folder: upFolder || 'General',
    });
    setPending(null);
  };

  /* Suggestions */
  const SUGGEST: { t: string; ic: string }[] = (() => {
    const ctx = getSectionContext(section.num);
    if (ctx.actions && ctx.actions.length > 0) {
      return ctx.actions.slice(0, 4).map(a => ({ t: a.label + ' — §' + section.num, ic: a.ic || 'sparkles' }));
    }
    return [
      { t: 'Full build — draft, check and deliver DOCX + PDF', ic: 'zap' },
      { t: 'Draft ' + section.num + ' from the linked evidence', ic: 'sparkles' },
      { t: 'Export as Word + PDF', ic: 'fileDown' },
      { t: 'Check FDA consistency — §' + section.num, ic: 'shieldCheck' },
    ];
  })();

  const isConnected = connected();

  return (
    <div className="rce-ana">
      {/* Identity bar */}
      <div className="rce-ana-id">
        <span className="rce-ana-mark">{'✻'}</span>
        <div>
          <div className="nm">AnA {'·'} Co-Author</div>
          <div className="sub">{secCtxLabel} {'·'} {'§'}{section.num} {section.label}</div>
        </div>
        <SampleTag sample={!isConnected} />
        <button className="rce-ana-acts-toggle" data-on={actsOpen || undefined} title="Quick actions"
          onClick={() => setActsOpen(o => !o)}>{I.grid}</button>
      </div>

      {/* Section context strip */}
      <div className="rce-ana-ctx">
        <div className="rce-ana-ctx-row">
          <span className="rce-ana-ctx-k">Section</span>
          <span className="rce-ana-ctx-v">{section.num} {section.label}</span>
        </div>
        <div className="rce-ana-ctx-row">
          <span className="rce-ana-ctx-k">Stage</span>
          <span className="rce-ana-ctx-v">{section.status || 'Draft'}</span>
        </div>
        <div className="rce-ana-ctx-row">
          <span className="rce-ana-ctx-k">Readiness</span>
          <span className="rce-ana-ctx-v">{Math.round((section.conf || 0.5) * 100)}%</span>
        </div>
        <div className="rce-ana-ctx-row">
          <span className="rce-ana-ctx-k">Evidence</span>
          <span className="rce-ana-ctx-v">
            {secCtxObj
              ? secCtxObj.evidence.length + ' source' + (secCtxObj.evidence.length === 1 ? '' : 's') + ' expected'
              : '—'}
          </span>
        </div>
        <div className="rce-ana-ctx-row">
          <span className="rce-ana-ctx-k">Market</span>
          <span className="rce-ana-ctx-v">{market.agency} {'·'} {market.region}</span>
        </div>
      </div>

      {/* Registry context header */}
      {subTypeId && <RegistryContextHeader submissionTypeId={subTypeId} />}

      {/* Verb bar */}
      <AnaVerbBar submissionTypeId={subTypeId || undefined} sectionId={section.id}
        sectionLabel={section.num + ' ' + section.label} activeVerb={activeVerb || undefined}
        onVerb={(v: string) => setActiveVerb(cur => (cur === v ? null : v))} />

      {/* Conversation thread */}
      <div className="rce-ana-thread" ref={scrollRef}>
        {activeVerb && (
          <StreamingRenderer active verb={activeVerb} submissionTypeId={subTypeId || undefined}
            sectionLabel={section.num + ' ' + section.label} sectionKey={section.id}
            onAccept={(html) => { onVerbApply && onVerbApply(activeVerb, html, undefined, false); setActiveVerb(null); }}
            onEdit={(html) => { onVerbApply && onVerbApply(activeVerb, html, undefined, true); setActiveVerb(null); }}
            onDiscard={() => setActiveVerb(null)} />
        )}
        {messages.length === 0 && (
          <div className="rce-ana-suggest">
            {SUGGEST.map((s, i) => (
              <button key={i} className="rce-ana-sug" onClick={() => send(s.t)}>
                {I[s.ic] || I.sparkles}<span>{s.t}</span>
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => {
          if (m.delib) {
            return (
              <div key={i} className="rce-delib" data-kind={m.delib.kind}>
                <span className="rce-delib-ic">
                  {m.delib.kind === 'thinking' ? I.sparkles : m.delib.kind === 'tool' ? I.tool || I.sliders : I.check}
                </span>
                <span className="rce-delib-l">{m.delib.label}</span>
                <span className="rce-delib-s">{m.delib.sub}</span>
                {m.delib.status === 'running' && <span className="rce-delib-spin" />}
                {m.delib.status === 'done' && <span className="rce-delib-ok">{I.check}</span>}
              </div>
            );
          }
          if (m.code) return <CodeBlock key={i} block={m.code} />;
          if (m.attach) {
            return (
              <div key={i} className="rce-attach">
                <span className="rce-attach-ic">{I.paperclip}</span>
                <span className="rce-attach-n">{m.attach.name}</span>
                <span className="rce-attach-s">{m.attach.size}</span>
              </div>
            );
          }
          if (m.artifact) {
            return (
              <div key={i} className="rce-artifact">
                <button className="rce-artifact-btn">
                  {I.fileDown}
                  <span className="rce-artifact-n">{m.artifact.name}</span>
                  {m.artifact.type && <span className="rce-artifact-t">{m.artifact.type}</span>}
                  {m.artifact.size && <span className="rce-artifact-s">{m.artifact.size}</span>}
                </button>
              </div>
            );
          }
          if (m.card) {
            return (
              <div key={i} className="rce-card">
                <div className="rce-card-h">{m.card.title}</div>
                {m.card.rows.map((r, ri) => (
                  <div key={ri} className="rce-card-row">
                    <span className="rce-card-k">{r.k}</span><span className="rce-card-v">{r.v}</span>
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div key={i} className={'rce-msg' + (m.role === 'ana' ? ' rce-msg-ana' : ' rce-msg-user')} data-role={m.role}>
              {m.role === 'ana' && <span className="rce-msg-mark">{'✻'}</span>}
              <div className="rce-msg-body"><span>{m.text}</span></div>
            </div>
          );
        })}

        {busy && (
          <div className="rce-msg rce-msg-ana rce-msg-busy">
            <span className="rce-msg-mark">{'✻'}</span>
            <span className="rce-delib-spin" />
          </div>
        )}
      </div>

      {/* Quick actions drawer */}
      {actsOpen && (
        <div className="rce-ana-acts">
          <div className="rce-ana-acts-g">
            <div className="rce-ana-acts-gt">Refine and improve</div>
            <button onClick={() => { onAction && onAction('rewrite'); setActsOpen(false); }}>
              {I.penLine}<span>Rewrite section</span></button>
            <button onClick={() => { onAction && onAction('expand'); setActsOpen(false); }}>
              {I.maximize || I.expand}<span>Expand detail</span></button>
            <button onClick={() => { onAction && onAction('condense'); setActsOpen(false); }}>
              {I.minimize || I.shrink}<span>Condense</span></button>
            <button onClick={() => { onAction && onAction('tone'); setActsOpen(false); }}>
              {I.type}<span>Adjust tone</span></button>
          </div>
          <div className="rce-ana-acts-g">
            <div className="rce-ana-acts-gt">Review and promotion</div>
            <button onClick={() => { onAction && onAction('preflight'); setActsOpen(false); }}>
              {I.shieldCheck}<span>Preflight check</span></button>
            <button onClick={() => { onAction && onAction('export'); setActsOpen(false); }}>
              {I.fileDown}<span>Export DOCX + PDF</span></button>
            <button onClick={() => { onAction && onAction('promote'); setActsOpen(false); }}>
              {I.arrowUp}<span>Promote to review</span></button>
            {otherLang && (
              <button onClick={() => { onAction && onAction('translate'); setActsOpen(false); }}>
                {I.globe}<span>Translate to {otherLang}</span></button>
            )}
          </div>
        </div>
      )}

      {/* File upload pending overlay */}
      {pending && (
        <div className="rce-ana-upload">
          <div className="rce-ana-upload-h">
            {I.paperclip}
            <span className="rce-ana-upload-n">{pending.name}</span>
            <span className="rce-ana-upload-s">{pending.size}</span>
          </div>
          <div className="rce-ana-upload-row">
            <label>Project</label>
            <select value={upProj} onChange={e => setUpProj(e.target.value)}>
              {projOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div className="rce-ana-upload-row">
            <label>Folder</label>
            <select value={upFolder} onChange={e => setUpFolder(e.target.value)}>
              {folderList.map(f => <option key={f} value={f}>{f}</option>)}
              <option value="">General</option>
            </select>
          </div>
          <div className="rce-ana-upload-actions">
            <button className="rce-ana-upload-ok" onClick={confirmUpload}>Attach</button>
            <button className="rce-ana-upload-cancel" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Governed action — real 21 CFR Part 11 modal (was the non-compliant
          v2/surfaces/GovernedActionModal, retired). The shared modal enforces
          password re-auth (§11.200), a signature-meaning enum (§11.50), and
          a real reason-for-change (min 8 chars). onSign fires only after
          re-auth succeeds; the parent's onAction runs then, and the manifest
          keeps a real signed timestamp for the confirmation view. */}
      <EsignModal
        open={!!govAction}
        action={govAction || 'Confirm governed action'}
        target={`§${section.num}${section.label ? ' · ' + section.label : ''}`}
        targetMeta={subTypeId ? subTypeId : undefined}
        onClose={() => setGovAction(null)}
        onSign={async ({ meaning, reason }) => {
          if (govAction) onAction && onAction(govAction);
          return { meaning, reason, signedAt: new Date().toISOString() };
        }}
      />

      {/* Compose area */}
      <div className="rce-ana-comp">
        <textarea rows={2} value={draft}
          placeholder={agent ? 'Tell AnA what to do for ' + section.num + '...' : 'Message AnA about ' + section.num + '...'}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <div className="rce-ana-crow">
          <button className="rce-ana-attach" title="Attach a document for AnA to read"
            onClick={() => fileRef.current && fileRef.current.click()}>{I.paperclip}</button>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFile}
            accept=".pdf,.docx,.doc,.txt,.csv,.xlsx,.xml,.json" />
          <button className="rce-ana-mode" data-agent={agent || undefined}
            onClick={() => setAgent(a => !a)} title={agent ? 'Agent' : 'Ask'}>
            {agent ? I.wand : I.sparkles}<span>{agent ? 'Agent' : 'Ask'}</span></button>
          <button className="rce-ana-mode" title="Switch engine"
            onClick={() => setMode(m => m === 'Maximum' ? 'Balanced' : m === 'Balanced' ? 'Instant' : 'Maximum')}>
            {I.zap}<span>{mode}</span></button>
          <span className="rce-ana-hint">{'↵'} send</span>
          <button className="rce-ana-send" disabled={!draft.trim()} onClick={() => send()}>{I.arrowUp}</button>
        </div>
      </div>
    </div>
  );
}

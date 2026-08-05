import React, { useState, useEffect, useRef } from 'react';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { useAnaChat, type AnaChatMessage } from '../../components/ana/useAnaChat';
import { DocTypeChip, DocumentContextCard } from './AnaDocContext';
import type { SurfaceViewProps, OwnedSurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import {
  CT_LINKMAP, CT_LINKIC, CT_ARTIC, CT_STATUS_LABEL,
} from '../fixtures/conversation-thread-data';
import type { CtTurn, CtArtifact } from '../fixtures/conversation-thread-data';

/* Adapt one real AnA turn (useAnaChat → /api/ana-ri/stream) into the CtTurn
   shape this surface renders — the model's answer, its extended-thinking, and
   the grounding sources it actually used. Never a fabricated tool trace or a
   Math.random()-"audited" artifact; unpopulated fields are simply omitted. */
function toTurn(m: AnaChatMessage): CtTurn {
  if (m.role === 'user') return { role: 'user', text: m.text };
  const grounding = (m.groundingSources || []).map((s) => ({ src: s, ok: true }));
  return {
    role: 'ana',
    answer: m.text || undefined,
    thinking: m.thinking || undefined,
    grounding: grounding.length ? grounding : undefined,
  };
}

/* ---- AnA turn (thinking + tools + proposal + answer + grounding) ---- */

interface AnaTurnProps {
  turn: CtTurn;
  onApply: () => void;
  onRefine: () => void;
  onNav?: (id: string) => void;
  onViewArtifact?: (id: string) => void;
}

function AnaTurn({ turn, onApply, onRefine, onNav, onViewArtifact }: AnaTurnProps) {
  const [openThink, setOpenThink] = useState(false);
  return (
    <div className="ct-turn ct-ana">
      <div className="ct-ana-av">{'✻'}</div>
      <div className="ct-ana-body">
        {turn.doc && (
          <div style={{ marginBottom: 6 }}><DocTypeChip doc={turn.doc} /></div>
        )}
        {turn.doc && (turn.doc.confidence || 1) < 0.4 && (
          <DocumentContextCard doc={turn.doc} defaultOpen={false} />
        )}
        {turn.thinking && (
          <button className={'ct-think' + (openThink ? ' on' : '')} onClick={() => setOpenThink(o => !o)}>
            <span className="ct-think-h">{I.sparkles} Thought for a moment {I.chevDown}</span>
            {openThink && <span className="ct-think-b">{turn.thinking}</span>}
          </button>
        )}
        {(turn.tools || []).map((tl, i) => (
          <div key={i} className="ct-tool">
            <span className="ct-tool-ic">{I.tool || I.sliders}</span>
            <span className="ct-tool-n">{tl.name}</span>
            <span className="ct-tool-a">{tl.arg}</span>
            <span className="ct-tool-r">{I.check} {tl.result}</span>
          </div>
        ))}
        {turn.proposal && (
          <div className="ct-prop" data-status={turn.proposal.status}>
            <div className="ct-prop-h">
              <span className="ct-prop-ic">{I.penLine}</span>
              <span className="ct-prop-t">{turn.proposal.title}</span>
              <span className="ct-prop-delta">{turn.proposal.delta}</span>
            </div>
            <div className="ct-prop-diff">
              <div className="ct-diff-row ct-diff-del"><span>-</span><p>{turn.proposal.before}</p></div>
              <div className="ct-diff-row ct-diff-add"><span>+</span><p>{turn.proposal.after}</p></div>
            </div>
            {turn.proposal.status === 'pending' ? (
              <div className="ct-prop-actions">
                <button className="ct-prop-accept" onClick={onApply}>{I.check} Accept and write to section {turn.proposal.section}</button>
                <button className="ct-prop-refine" onClick={onRefine}>{I.penLine} Refine</button>
                <button className="ct-prop-discard">Discard</button>
                <span className="ct-prop-gov">{I.lock} Governed -- immutable version + audit entry on persist</span>
              </div>
            ) : (
              <div className="ct-prop-applied">
                {I.checkCircle || I.check} Applied in preview to section {turn.proposal.section} / {turn.proposal.ver || 'v0.9'} -- sign-off + audit pending
                <button className="ct-prop-open" onClick={() => onNav && onNav('document-authoring')}>{I.externalLink} Open in editor</button>
              </div>
            )}
          </div>
        )}
        {turn.answer && <div className="ct-ana-text">{turn.answer}</div>}
        {turn.artifactRef && (
          <button className="ct-art-chip" onClick={() => onViewArtifact && onViewArtifact(turn.artifactRef!.id)}>
            <span className="ct-art-chip-ic">{I.sparkles}</span>
            <span className="ct-art-chip-b"><b>Generated artifact</b> / {turn.artifactRef.type}</span>
            <span className="ct-art-chip-go">{I.arrowRight || I.right}</span>
          </button>
        )}
        {turn.links && (
          <div className="ct-refs">
            {turn.links.map((l, i) => (
              <button key={i} className="ct-ref" data-kind={l.kind} onClick={() => onNav && onNav(CT_LINKMAP[l.kind] || 'document-authoring')} title={'Open in ' + (CT_LINKMAP[l.kind] || 'editor')}>
                <span className="ct-ref-ic">{(I as any)[CT_LINKIC[l.kind]] || I.fileText}</span>
                <span className="ct-ref-l">{l.label}</span>
                <span className="ct-ref-go">{I.arrowUpRight || I.externalLink}</span>
              </button>
            ))}
          </div>
        )}
        {turn.grounding && (
          <div className="ct-ground">
            <span className="ct-ground-l">Grounded in</span>
            {turn.grounding.map((g, i) => (<span key={i} className="ct-ground-chip" data-ok={g.ok}>{g.ok ? I.check : I.alertTriangle} {g.src}</span>))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Artifact card ---- */

interface ArtifactCardProps {
  art: CtArtifact;
  expanded: boolean;
  onToggle: () => void;
  onNav?: (id: string) => void;
  onAdvance: () => void;
  onDownload: () => void;
}

function ArtifactCard({ art, expanded, onToggle, onNav, onAdvance, onDownload }: ArtifactCardProps) {
  return (
    <div className="ct-art" data-status={art.status} data-open={expanded || undefined}>
      <button className="ct-art-head" onClick={onToggle}>
        <span className="ct-art-ic">{(I as any)[CT_ARTIC[art.kind]] || I.fileText}</span>
        <span className="ct-art-head-b">
          <span className="ct-art-type">{art.type}</span>
          <span className="ct-art-title">{art.title}</span>
        </span>
        <span className={`ct-art-status ${art.status}`}>{CT_STATUS_LABEL[art.status] || art.status}</span>
        <span className="ct-art-chev">{I.chevDown}</span>
      </button>
      {expanded && (
        <div className="ct-art-body">
          {art.rows && (
            <div className="ct-art-rows">
              {art.rows.map((r, i) => (
                <div key={i} className="ct-art-row">
                  <span className="ct-art-row-k">{r.k}</span>
                  <span className="ct-art-row-v">{r.v}</span>
                  {typeof r.conf === 'number' && <span className="ct-art-conf" title="Confidence">{Math.round(r.conf * 100)}%</span>}
                </div>
              ))}
            </div>
          )}
          {art.preds && (
            <div className="ct-art-preds">
              {art.preds.map((p, i) => (
                <div key={i} className="ct-art-pred">
                  <span className="ct-art-pred-k">{p.k}</span>
                  <span className="ct-art-pred-n">{p.name}{p.role && <span className={`ct-pred-role ${p.role}`}>{p.role}</span>}</span>
                  {p.safety !== 'clean' && <span className="ct-pred-flag">{I.alertTriangle} {p.safety}</span>}
                  <span className="ct-art-pred-m">{p.match}%</span>
                </div>
              ))}
            </div>
          )}
          {art.outline && (
            <div className="ct-outline">
              {art.outline.map((s, i) => (
                <div key={i} className={'ct-outline-row' + (s.required ? '' : ' optional')} data-st={s.st}>
                  <span className="ct-outline-dot" />
                  {s.code && <span className="ct-outline-code">{s.code}</span>}
                  <span className="ct-outline-h">{s.code ? s.heading.replace(new RegExp('^' + s.code.replace(/[.]/g, '\\.') + '\\s*'), '') : s.heading}</span>
                  {s.targetWords && <span className="ct-outline-w">~{s.targetWords[0]}-{s.targetWords[1]}w</span>}
                  {!s.required && <span className="ct-outline-opt">optional</span>}
                  <span className="ct-outline-st">{s.st}</span>
                </div>
              ))}
            </div>
          )}
          {art.sections && (
            <div className="ct-art-secs">
              {art.sections.map((s, i) => (
                <div key={i} className="ct-art-sec">
                  <span className="ct-art-sec-n">section {s.n}</span>
                  <span className="ct-art-sec-l">{s.label}</span>
                  <span className={`ct-art-secst ${s.st}`}>{s.st}</span>
                </div>
              ))}
            </div>
          )}
          {art.note && <div className="ct-art-note">{art.note}</div>}
          <div className="ct-art-prov">
            <div className="ct-art-prov-l">Provenance</div>
            <div className="ct-art-prov-g">
              <span>Generated by <b>{art.prov.by}</b> / {art.prov.model}</span>
              <span>From: {art.prov.inputs}</span>
              <span>Evidence: {art.prov.evidence.join(' / ')}</span>
              {/* Rendered only when a real, server-issued audit id exists. It
                  used to render unconditionally against a client-fabricated
                  string, putting a padlock next to an identifier that traced to
                  nothing. */}
              {art.prov.audit
                ? <span className="ct-art-audit">{I.lock} Audit {art.prov.audit}</span>
                : <span className="ct-art-audit">Not yet written to the governed record</span>}
            </div>
          </div>
          <div className="ct-art-actions">
            <button className="ct-art-edit" onClick={() => onNav && onNav('document-authoring')}>{I.penLine} Edit</button>
            <button className="ct-art-dl" onClick={onDownload}>{I.download} .docx</button>
            {art.status !== 'approved' && <button className="ct-art-adv" onClick={onAdvance}>{I.arrowRight || I.check} {art.status === 'draft' ? 'Route to review' : 'Approve'}</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Artifact panel ---- */

interface ArtifactPanelProps {
  artifacts: CtArtifact[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onNav?: (id: string) => void;
  onAdvance: (id: string, isDownload?: boolean) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

function ArtifactPanel({ artifacts, openId, setOpenId, onNav, onAdvance, collapsed, setCollapsed }: ArtifactPanelProps) {
  if (collapsed) {
    return (
      <button className="ct-art-rail" onClick={() => setCollapsed(false)} title="Show artifacts">
        <span className="ct-art-rail-ic">{I.layers}</span>
        <span className="ct-art-rail-n">{artifacts.length}</span>
        <span className="ct-art-rail-l">Artifacts</span>
      </button>
    );
  }
  return (
    <aside className="ct-artifacts">
      <div className="ct-art-panel-h">
        <span className="ct-art-panel-t">{I.layers} Artifacts <span className="ct-art-panel-n">{artifacts.length}</span></span>
        <button className="ct-art-panel-x" onClick={() => setCollapsed(true)} title="Collapse">{I.chevronRight || I.right}</button>
      </div>
      <div className="ct-art-panel-sub">Governed outputs -- AnA builds, you approve and e-sign</div>
      <div className="ct-art-list">
        {artifacts.length === 0 && <div className="ct-art-empty">Artifacts AnA generates in this conversation appear here -- classification reports, predicate analyses, eSTAR sections -- each versioned, traceable, and exportable.</div>}
        {artifacts.map(a => (
          <ArtifactCard key={a.id} art={a} expanded={openId === a.id} onToggle={() => setOpenId(openId === a.id ? null : a.id)}
            onNav={onNav} onAdvance={() => onAdvance(a.id)} onDownload={() => onAdvance(a.id, true)} />
        ))}
      </div>
    </aside>
  );
}

/* ---- Conversation thread (main export) ---- */

export function ConversationThread({ onNav }: OwnedSurfaceViewProps) {
  // A real thread id is placed on window.C2C_CONVO by whatever opens an existing
  // conversation; the default is a fresh conversation.
  const sel = ((window as any).C2C_CONVO || { id: 'new' }) as { id: string; seed?: string | null };
  const isNew = sel.id === 'new';

  // The conversation runs on the REAL streaming assistant (POST /api/ana-ri/stream
  // via useAnaChat): an existing thread hydrates its real persisted history, new
  // messages stream token-by-token, and every turn is DB-persisted. Nothing is
  // simulated — the previous canned run510k/ctRespond composer and its
  // Math.random()-"audited" fabricated artifacts are gone.
  const anaChat = useAnaChat({ initialThreadId: isNew ? null : sel.id, screenName: 'conversation-thread' });
  const [loadErr, setLoadErr] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const turns: CtTurn[] = anaChat.messages.map(toTurn);
  const busy = anaChat.isStreaming;
  // Governed-artifact generation from the stream (generatedDraft → a versioned,
  // audited artifact) is a tracked follow-up; until it lands the panel shows its
  // honest empty state rather than a fabricated artifact.
  const artifacts: CtArtifact[] = [];

  const firstUser = turns.find((t) => t.role === 'user');
  const title = isNew
    ? 'New conversation'
    : firstUser?.text
      ? firstUser.text.slice(0, 60)
      : anaChat.isLoadingThread
        ? 'Loading…'
        : 'Conversation';

  useEffect(() => {
    if (!isNew) {
      setLoadErr(false);
      Promise.resolve(anaChat.loadThread(sel.id)).catch(() => setLoadErr(true));
    } else if (sel.seed) {
      void anaChat.send(sel.seed);
      (window as any).C2C_CONVO = { ...sel, seed: null };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [turns.length, busy]);

  const send = () => {
    const t = draft.trim();
    if (!t || busy) return;
    setDraft('');
    void anaChat.send(t);
  };

  const loadingHistory = !isNew && anaChat.isLoadingThread && turns.length === 0;

  return (
    <div className="ct-wrap">
      <div className="ct-head">
        <button className="ct-back" onClick={() => onNav && onNav('project-home')}>{I.left} Project</button>
        <div className="ct-head-mid">
          <div className="ct-head-t">{title}</div>
          <div className="ct-head-m">{I.messageSquare} Conversation</div>
        </div>
        <div className="ct-head-r">
          <span className="ct-head-model">{I.zap} AnA</span>
        </div>
      </div>

      <div className="ct-main">
        <div className="ct-conv">
          <div className="ct-scroll" ref={scrollRef}>
            <div className="ct-col">
              {loadingHistory && (
                <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading conversation…</div>
              )}
              {loadErr && turns.length === 0 && (
                <EmptyState
                  tone="error"
                  icon={I.alertTriangle}
                  title="Couldn't load this conversation"
                  hint="This conversation didn't load. It's read from your organization's governed chat store — sign in and retry, or start a new one below."
                />
              )}
              {turns.length === 0 && !loadingHistory && !loadErr && (
                <div className="ct-empty">
                  <div className="ct-empty-mk">{'✻'}</div>
                  <h2>Talk to AnA</h2>
                  <p>Ask a question, or ask AnA to do the work. AnA thinks, pulls from the evidence, and streams a grounded answer -- every turn is saved to your governed conversation store.</p>
                  <div className="ct-empty-chips">
                    {['File a 510(k) for our glucose monitoring patch', 'Is the section 2.5.4 efficacy claim defensible?', 'What blocks the Module 3 freeze?'].map((q, i) => (
                      <button key={i} className="ct-empty-chip" onClick={() => { void anaChat.send(q); }}>{q}</button>
                    ))}
                  </div>
                </div>
              )}
              {turns.map((t, i) => t.role === 'user'
                ? (<div key={i} className="ct-turn ct-user"><div className="ct-user-b">{t.text}</div></div>)
                : (<AnaTurn key={i} turn={t} onApply={() => undefined} onRefine={() => { void anaChat.send('Refine that -- keep it tighter and more declarative.'); }} onNav={onNav} onViewArtifact={() => undefined} />)
              )}
              {busy && (
                <div className="ct-turn ct-ana"><div className="ct-ana-av">{'✻'}</div><div className="ct-ana-body"><div className="ct-typing"><span /><span /><span /></div></div></div>
              )}
            </div>
          </div>

          <div className="ct-composer-wrap">
            <div className="ct-composer">
              <button className="ct-comp-attach" title="Attach a document for AnA to use">{I.paperclip}</button>
              <textarea rows={1} placeholder="Reply to AnA -- ask, or request a draft..." value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <button className="ct-comp-send" disabled={!draft.trim() || busy} onClick={send}>{I.arrowUp}</button>
            </div>
            <div className="ct-comp-foot">{I.lock} Governed -- AnA proposes; you accept. Accepted changes are captured as immutable, 21 CFR Part 11-audited versions when persisted.</div>
          </div>
        </div>

        <ArtifactPanel artifacts={artifacts} openId={openId} setOpenId={setOpenId} onNav={onNav}
          onAdvance={() => undefined} collapsed={panelCollapsed} setCollapsed={setPanelCollapsed} />
      </div>
    </div>
  );
}

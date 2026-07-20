import React, { useState, useEffect, useRef } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import { DocTypeChip, DocumentContextCard } from './AnaDocContext';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import {
  CT_LINKMAP, CT_LINKIC, CT_ARTIC, CT_STATUS_LABEL,
  CT_ARTIFACT_BUILDERS, ctRespond, buildPrimedDoc,
} from '../fixtures/conversation-thread-data';
import type { CtTurn, CtArtifact } from '../fixtures/conversation-thread-data';

/* ── Live conversation read-model — GET /api/conversation-thread/:threadId
   (server/routes/conversation-thread-routes.ts). REAL backend: reads the
   org-scoped chat store (ai_threads / chat_threads + chat_messages) through the
   request-scoped Drizzle client. It fills only what the store persists and
   nulls/empties the rest — honest omission, never fabricated:
     title     real (ai_threads.title, or the first user message)
     when      real ISO-8601 (updated_at || created_at)
     turns     real chat_messages — user → { role:'user', text },
               assistant → { role:'ana', answer }
     section   always null  (not persisted on the thread)
     artifacts always []    (no message→artifact provenance is stored)
     work      always []    (per-conversation work rollup is not modeled)
   Real turns therefore carry no thinking/tools/proposal/links/grounding/
   artifactRef; those appear only on locally-simulated turns (mock composer). ── */
interface ConversationThreadView {
  title: string;
  section: string | null;
  when: string;
  turns: CtTurn[];
  artifacts: CtArtifact[];
  work: unknown[];
}

/* Stable empty seeds for the composer-mutated turn/artifact stores while the live
   read is loading or errored. useLiveData returns a fresh null every render until it
   resolves; seeding local state from a module-level constant (not a fresh []) keeps
   the re-seed effect from thrashing into a render loop. */
const CT_EMPTY_TURNS: CtTurn[] = [];
const CT_EMPTY_ARTIFACTS: CtArtifact[] = [];

/** Real ISO-8601 `when` → short honest date label; '' when absent/unparseable. */
function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
              <span className="ct-art-audit">{I.lock} Audit {art.prov.audit}</span>
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

export function ConversationThread({ onAsk, onNav }: SurfaceViewProps) {
  // Default to a new conversation (no fixture id). A real thread id is placed on
  // window.C2C_CONVO by whatever opens an existing conversation.
  const sel = ((window as any).C2C_CONVO || { id: 'new' }) as { id: string; seed?: string | null };
  const isNew = sel.id === 'new';

  // DATA slice — re-anchored to the REAL read-model. New conversations don't fetch
  // (nothing is persisted yet); an existing thread loads its real turns, an honest
  // empty, or an honest error. Never a fixture.
  const convo = useLiveData<ConversationThreadView>(
    isNew ? null : `/api/conversation-thread/${encodeURIComponent(sel.id)}`,
  );

  // Local, composer-mutated copies seeded from the live read. Stable module-level
  // seeds while loading/errored (see CT_EMPTY_* note) so the re-seed effect can't loop.
  const seedTurns: CtTurn[] = !isNew && convo.data ? convo.data.turns : CT_EMPTY_TURNS;
  const seedArtifacts: CtArtifact[] = !isNew && convo.data ? convo.data.artifacts : CT_EMPTY_ARTIFACTS;
  const [turns, setTurns] = useState<CtTurn[]>(seedTurns);
  const [artifacts, setArtifacts] = useState<CtArtifact[]>(seedArtifacts);
  const seedRef = useRef(seedTurns);
  useEffect(() => {
    // Re-seed once when the live read resolves (or the conversation changes): the
    // seed reference flips from the stable empty constant to the fetched arrays.
    if (seedTurns !== seedRef.current) {
      seedRef.current = seedTurns;
      setTurns(seedTurns.map(t => ({ ...t })));
      setArtifacts(seedArtifacts.map(a => ({ ...a })));
    }
  }, [seedTurns, seedArtifacts]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const title = isNew ? 'New conversation' : (convo.data?.title || (convo.loading ? 'Loading…' : 'Conversation'));
  // Backend does not persist a section on the thread — always null (honest omission).
  const section = convo.data?.section ?? null;
  const whenLabel = fmtWhen(convo.data?.when);

  useEffect(() => {
    if (isNew && sel.seed) { kickoff(sel.seed); (window as any).C2C_CONVO = { ...sel, seed: null }; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [turns, busy]);

  // ───────────────────────────────────────────────────────────────────────────
  // MOCK ACTIONS — flagged for the actions pass; do not treat as wired.
  // Everything the composer "does" below is simulated locally: run510k / runUser /
  // kickoff stream canned turns via setTimeout, ctRespond returns a canned answer,
  // and the artifact builders (CT_ARTIFACT_BUILDERS / buildPrimedDoc / pushArtifact)
  // fabricate artifacts carrying Math.random()-derived "audit" ids. applyProposal
  // and advanceArtifact are optimistic local-state flips — no API call, no write,
  // no version, no audit entry. Real endpoints for this already exist
  // (server/routes/chat/send-message.ts, server/routes/conversation-os.ts); the
  // actions pass should wire the composer to the real AnA stream + governed-write
  // path. User-visible copy here has been softened so nothing claims a
  // persistence/audit event that has not actually occurred.
  // ───────────────────────────────────────────────────────────────────────────
  const applyProposal = (ti: number) => setTurns(ts => ts.map((t, i) => i === ti && t.proposal ? { ...t, proposal: { ...t.proposal, status: 'applied', ver: 'v0.9' } } : t));
  const viewArtifact = (id: string) => { setPanelCollapsed(false); setOpenId(id); };
  const advanceArtifact = (id: string, isDownload?: boolean) => {
    if (isDownload) return;
    setArtifacts(as => as.map(a => a.id === id ? { ...a, status: a.status === 'draft' ? 'in-review' : 'approved' } : a));
  };

  function pushArtifact(builderKey: string): CtArtifact | null {
    const builder = CT_ARTIFACT_BUILDERS[builderKey];
    const art = builder ? builder() : null;
    if (art) { setArtifacts(as => [...as, art]); setOpenId(art.id); }
    return art;
  }

  function run510k(userText: string) {
    setTurns(ts => [...ts, { role: 'user', text: userText }]);
    setBusy(true);
    const steps = [
      { delay: 1100, turn: { role: 'ana',
          thinking: 'This reads as a Class II non-invasive CGM. I will classify it against the FDA product-classification database and the EU MDR rules, then find predicates.',
          tools: [{ name: 'classify_device', arg: 'wearable CGM patch / intended use', result: 'product code QBJ / Class II / 510(k)' }],
          answer: 'Your device appears to be a Class II continuous glucose monitor (product code QBJ). I have produced the classification report -- Class II in the US via 510(k), Class IIb under EU MDR Rule 11.',
          grounding: [{ src: 'FDA product classification DB', ok: true }, { src: 'EU MDR Annex VIII', ok: true }] } as CtTurn, art: 'classification' },
      { delay: 1400, turn: { role: 'ana',
          thinking: 'Now the predicate basis. Search the 510(k) database, score on intended-use + technological match, and screen the recall chain so we do not build on a recalled predicate.',
          tools: [{ name: 'search_predicates', arg: 'CGM / product code QBJ', result: '6 candidates / 2 strong' }, { name: 'screen_recalls', arg: 'predicate chain', result: '1 flagged (Class II recall)' }],
          answer: 'I found 6 predicate candidates and selected 2 (Dexcom G7 primary, FreeStyle Libre 3 reference). The recall screen excluded the Medtronic Enlite -- it has a Class II recall on record. See the predicate intelligence report.',
          grounding: [{ src: 'openFDA 510(k)', ok: true }, { src: 'MAUDE + recall DB', ok: true }] } as CtTurn, art: 'predicate' },
      { delay: 1500, turn: { role: 'ana',
          thinking: 'With classification and predicates set, I can pre-populate the eSTAR from the project data -- device description, intended use, SE comparison, standards, labeling.',
          tools: [{ name: 'build_estar', arg: 'nIVD v7.0 / 19 sections', result: '19 sections pre-populated' }],
          answer: 'Your eSTAR is assembled -- 19 sections pre-populated from the classification, predicates, and device description. Clinical performance (section 19) is the open item. Each section is a governed artifact you can edit, review, and e-sign.',
          links: [{ label: '510(k) eSTAR -- open in editor', kind: 'doc' }, { label: 'Predicate intelligence', kind: 'evidence' }],
          grounding: [{ src: 'FDA eSTAR nIVD v7.0', ok: true }, { src: 'Project artifacts', ok: true }] } as CtTurn, art: 'estar' },
    ];
    let acc = 0;
    steps.forEach((s, idx) => {
      acc += s.delay;
      setTimeout(() => {
        const art = pushArtifact(s.art);
        setTurns(ts => [...ts, { ...s.turn, artifactRef: art ? { id: art.id, type: art.type } : null }]);
        if (idx === steps.length - 1) setBusy(false);
      }, acc);
    });
  }

  function kickoff(text: string) {
    if (/510|glucose|cgm|classif|predicate|patch|device/i.test(text)) { run510k(text); return; }
    runUser(text);
  }

  function runUser(text: string) {
    const t = (text || '').trim(); if (!t) return;
    if (/510|classif|predicate|estar/i.test(t) && /file|build|start|draft|prepare/i.test(t)) { run510k(t); return; }
    setTurns(ts => [...ts, { role: 'user', text: t }]);
    setBusy(true);
    const detectDocumentTemplate = (window as any).detectDocumentTemplate;
    const tpl = detectDocumentTemplate ? detectDocumentTemplate(t) : null;
    let primedRef: { id: string; type: string } | null = null;
    if (tpl && (tpl.confidence || 0) >= 0.4 && (tpl.sections || []).length) {
      const art = buildPrimedDoc(tpl);
      setArtifacts(as => [...as, art]); setOpenId(art.id); setPanelCollapsed(false);
      primedRef = { id: art.id, type: art.type };
    }
    setTimeout(() => { setTurns(ts => [...ts, { ...ctRespond(t), doc: tpl || undefined, artifactRef: primedRef }]); setBusy(false); }, 1100);
  }

  const send = () => { const t = draft.trim(); if (!t || busy) return; setDraft(''); runUser(t); };

  return (
    <div className="ct-wrap">
      <div className="ct-head">
        <button className="ct-back" onClick={() => onNav && onNav('project-home')}>{I.left} Project</button>
        <div className="ct-head-mid">
          <div className="ct-head-t">{title}</div>
          <div className="ct-head-m">{I.messageSquare} Conversation{whenLabel ? ` · ${whenLabel}` : ''}{section ? ` · builds section ${section}` : ''}</div>
        </div>
        <div className="ct-head-r">
          <span className="ct-head-model">{I.zap} Maximum</span>
          {section && <button className="ct-head-open" onClick={() => onNav && onNav('document-authoring')}>{I.externalLink} View section {section} in editor</button>}
        </div>
      </div>

      <div className="ct-main">
        <div className="ct-conv">
          <div className="ct-scroll" ref={scrollRef}>
            <div className="ct-col">
              {!isNew && convo.loading && turns.length === 0 && (
                <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading conversation…</div>
              )}
              {!isNew && convo.error && turns.length === 0 && (
                <EmptyState
                  tone="error"
                  icon={I.alertTriangle}
                  title="Couldn't load this conversation"
                  hint="This conversation didn't load. It's read from your organization's governed chat store — sign in and retry, or start a new one below."
                />
              )}
              {turns.length === 0 && (isNew || (!convo.loading && !convo.error)) && (
                <div className="ct-empty">
                  <div className="ct-empty-mk">{'✻'}</div>
                  <h2>Talk to AnA</h2>
                  <p>Ask a question, or ask AnA to do the work. AnA thinks, pulls from the evidence, and its outputs appear as governed artifacts on the right -- ready to review, edit, approve, and export.</p>
                  <div className="ct-empty-chips">
                    {['File a 510(k) for our glucose monitoring patch', 'Is the section 2.5.4 efficacy claim defensible?', 'What blocks the Module 3 freeze?'].map((q, i) => (
                      <button key={i} className="ct-empty-chip" onClick={() => kickoff(q)}>{q}</button>
                    ))}
                  </div>
                </div>
              )}
              {turns.map((t, i) => t.role === 'user'
                ? (<div key={i} className="ct-turn ct-user"><div className="ct-user-b">{t.text}</div></div>)
                : (<AnaTurn key={i} turn={t} onApply={() => applyProposal(i)} onRefine={() => runUser('Refine that -- keep it tighter and more declarative.')} onNav={onNav} onViewArtifact={viewArtifact} />)
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
          onAdvance={advanceArtifact} collapsed={panelCollapsed} setCollapsed={setPanelCollapsed} />
      </div>
    </div>
  );
}

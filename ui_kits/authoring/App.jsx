/* global React, ReactDOM, I,
    AUTH_AGENCIES, AUTH_DOC_TYPES, AUTH_OUTLINES, AUTH_EVIDENCE, AUTH_REVIEWERS,
    AUTH_PROGRAMS, AUTH_SECTION_BODY, AUTH_SEED_THREAD, AUTH_REWRITES, AUTH_DEFAULT,
    AUTH_SKILLS,
    OutlineTree, Artifact, Workbench, Conversation, AuthShell, outlineHelpers */
const { useState, useEffect, useMemo, useCallback, useRef } = React;

/* ───────── Resolve the outline for (docType × agency) with fallback. */
function resolveOutline(docType, agency) {
  if (AUTH_OUTLINES[`${docType}:${agency}`]) return AUTH_OUTLINES[`${docType}:${agency}`];
  if (AUTH_OUTLINES[`${docType}:ich`])       return AUTH_OUTLINES[`${docType}:ich`];
  if (AUTH_OUTLINES[`${docType}:fda`])       return AUTH_OUTLINES[`${docType}:fda`];
  return [{ id: 'pending', path: '—', label: '— rule pack pending —', mandatory: false, status: 'todo' }];
}

function findNode(outline, id) {
  for (const n of outline) {
    if (n.id === id) return n;
    if (n.children) {
      const f = findNode(n.children, id);
      if (f) return f;
    }
  }
  return null;
}

function firstLeaf(outline) {
  for (const n of outline) {
    if (n.children) {
      const f = firstLeaf(n.children);
      if (f) return f;
    } else return n;
  }
  return null;
}

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/* ───────── Tweaks panel ───────── */
function TweaksPanel({ open, onClose, view, setView, agency, setAgency, docType, setDocType, evidenceMode, setEvidenceMode, focus, setFocus }) {
  if (!open) return null;
  return (
    <div className="au-tweaks">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 6 }}>
        <h6 style={{ margin: 0 }}>Tweaks</h6>
        <button className="au-tb-btn" style={{ padding: 4 }} onClick={onClose}>{I.close}</button>
      </div>
      <div className="row">
        <label>Mode</label>
        <div className="seg">
          <button data-active={view==='conversation' || undefined} onClick={() => setView('conversation')}>Conversation</button>
          <button data-active={view==='workbench'    || undefined} onClick={() => setView('workbench')}>Workbench</button>
        </div>
      </div>
      <div className="row">
        <label>Document type</label>
        <select value={docType} onChange={(e) => setDocType(e.target.value)}>
          {AUTH_DOC_TYPES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>
      <div className="row">
        <label>Agency</label>
        <select value={agency} onChange={(e) => setAgency(e.target.value)}>
          {AUTH_AGENCIES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>
      <div className="row">
        <label>Evidence</label>
        <div className="seg">
          <button data-active={evidenceMode==='off'      || undefined} onClick={() => setEvidenceMode('off')}>Off</button>
          <button data-active={evidenceMode==='footnote' || undefined} onClick={() => setEvidenceMode('footnote')}>Footnote</button>
          <button data-active={evidenceMode==='margin'   || undefined} onClick={() => setEvidenceMode('margin')}>Margin</button>
        </div>
      </div>
      <div className="row">
        <label>Focus</label>
        <div className="seg">
          <button data-active={!focus || undefined}                    onClick={() => setFocus(false)}>Off</button>
          <button data-active={focus  || undefined}                    onClick={() => setFocus(true)}>On</button>
        </div>
      </div>
    </div>
  );
}

/* ───────── App ───────── */
function App() {
  const [programIdx,  setProgramIdx]   = useState(AUTH_DEFAULT.programIdx);
  const [docType,     setDocType]      = useState(AUTH_DEFAULT.docType);
  const [agency,      setAgency]       = useState(AUTH_DEFAULT.agency);
  const [view,        setView]         = useState('conversation'); // 'conversation' | 'workbench' — Conversation default so users land on the document editor, not the dashboard
  const [focus,       setFocus]        = useState(false);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [evidenceMode, setEvidenceMode] = useState('footnote');    // 'off' | 'footnote' | 'margin'
  const [activeId,    setActiveId]     = useState(AUTH_DEFAULT.openSectionId);
  const [composer,    setComposer]     = useState('');
  const [pending,     setPending]      = useState(false);
  const [messages,    setMessages]     = useState(AUTH_SEED_THREAD);
  const [inspectorTab, setInspectorTab] = useState('ana');
  const [tweaksOpen,  setTweaksOpen]   = useState(false);

  // Streaming engine — works across both modes; same as ectd_coauthor pattern.
  const [streamingId, setStreamingId] = useState(null);
  const [streamText,  setStreamText]  = useState('');
  const [streamTarget,setStreamTarget]= useState(null); // { id, fullText, onDone }
  const bodyCache = useRef({ ...AUTH_SECTION_BODY });

  // Re-resolve outline when (docType × agency) changes.
  const outline = useMemo(() => resolveOutline(docType, agency), [docType, agency]);

  // If the chosen section doesn't exist in the new outline, jump to first leaf.
  useEffect(() => {
    if (!findNode(outline, activeId)) {
      const leaf = firstLeaf(outline);
      if (leaf) setActiveId(leaf.id);
    }
  }, [outline, activeId]);

  const program     = AUTH_PROGRAMS[programIdx];
  const sectionMeta = findNode(outline, activeId) || firstLeaf(outline) || { label: '—', path: '—' };
  const section     = bodyCache.current[activeId] || null;
  const agencyObj   = AUTH_AGENCIES.find(a => a.id === agency);
  const docTypeObj  = AUTH_DOC_TYPES.find(d => d.id === docType);
  const ownerName   = sectionMeta.owner ? (AUTH_REVIEWERS.find(r => r.id === sectionMeta.owner) || {}).name : null;

  /* ───── Streaming rewrite engine ───── */
  useEffect(() => {
    if (!streamTarget) return;
    const { id, fullText, onDone } = streamTarget;
    setStreamingId(id);
    setStreamText('');
    let i = 0;
    let timer = null;
    const step = Math.max(1, Math.round(fullText.length / 220));
    const tick = () => {
      i = Math.min(fullText.length, i + step);
      setStreamText(fullText.slice(0, i));
      if (i >= fullText.length) {
        setTimeout(() => {
          // Commit to section body cache (so the paragraph stays strengthened).
          const sec = bodyCache.current[activeId];
          if (sec) {
            const para = sec.paragraphs.find(p => p.id === id);
            if (para) {
              para.text = fullText;
              if (para.prov) {
                para.prov = { ...para.prov, confidence: Math.min(0.98, (para.prov.confidence || 0.8) + 0.04), foot: 'Strengthened · ' + timeNow() };
              }
            }
          }
          setStreamingId(null);
          setStreamText('');
          setStreamTarget(null);
          onDone && onDone();
        }, 280);
        return;
      }
      timer = setTimeout(tick, 16);
    };
    timer = setTimeout(tick, 16);
    return () => { if (timer) clearTimeout(timer); };
  }, [streamTarget, activeId]);

  const kickStream = (id, fullText, onDone) => setStreamTarget({ id, fullText, onDone });

  /* ───── Chat actions ───── */
  const onSend = (text) => {
    if (!text) return;
    setMessages(m => [...m, { role: 'user', text }]);
    setComposer('');
    setPending(true);
    setTimeout(() => {
      setPending(false);
      setMessages(m => [...m, { role: 'ai', blocks: [
        { kind: 'p', text: `Understood. I'll reflect that in §${sectionMeta.path}.` },
        { kind: 'tool', label: 'Pack', value: `${docTypeObj.label} × ${agencyObj.label}` },
        { kind: 'tool', label: 'Updated', value: `${sectionMeta.path} · ${sectionMeta.label}` },
      ]}]);
    }, 900);
  };

  const onPickSkill = (skill) => {
    setMessages(m => [...m, { role: 'user', text: skill.label + ' — for §' + sectionMeta.path }]);
    setPending(true);
    setTimeout(() => {
      setPending(false);
      setMessages(m => [...m, { role: 'ai', blocks: [
        { kind: 'tool', label: skill.label, value: skill.hint },
        { kind: 'tool', label: 'Pack',      value: `${docTypeObj.label} × ${agencyObj.label}` },
        { kind: 'p',    text: skill.id === 'validate.pack'
            ? `Validated against ${agencyObj.label} ${docTypeObj.label} pack. 3 mandatory sections still empty; 1 has a confidence below 0.85.`
            : `Done. ${skill.label} applied against ${sectionMeta.label}.` },
      ]}]);
    }, 800);
  };

  /* ───── Outline navigation ───── */
  const onPickSection = (id) => {
    setActiveId(id);
    const node = findNode(outline, id);
    setMessages(m => [...m, { role: 'ai', blocks: [
      { kind: 'tool', label: 'Loaded', value: `${node ? node.path : id} · ${node ? node.label : 'section'}` },
    ]}]);
  };

  /* ───── Draft with AnA from empty state / row button ───── */
  const onDraftWithAna = (id) => {
    const node = findNode(outline, id || activeId);
    if (!node) return;
    setActiveId(node.id);
    setView('conversation');
    setMessages(m => [...m, { role: 'user', text: `Draft §${node.path} ${node.label} against my current corpus.` }]);
    setPending(true);
    setTimeout(() => {
      setPending(false);
      setMessages(m => [...m, { role: 'ai', blocks: [
        { kind: 'tool', label: 'Pack',     value: `${docTypeObj.label} × ${agencyObj.label}` },
        { kind: 'tool', label: 'Pulled',   value: 'Project corpus · 4 sources · RIM precedent search' },
        { kind: 'tool', label: 'Drafting', value: `${node.path} · ${node.label}` },
        { kind: 'chip', title: `§${node.path} ${node.label}`, meta: 'AnA drafted · pending reviewer · v0.1' },
      ]}]);
    }, 1100);
  };

  /* ───── Selection toolbar action ───── */
  const [selection, setSelection] = useState(null);
  useEffect(() => {
    const clear = () => setSelection(null);
    document.addEventListener('scroll', clear, true);
    return () => document.removeEventListener('scroll', clear, true);
  }, []);

  const onAction = (action) => {
    if (!selection) return;
    const { paragraphId, text } = selection;
    setSelection(null);
    window.getSelection && window.getSelection().removeAllRanges();

    const preLabel = `Selected · "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`;

    if (action === 'strengthen' || action === 'tighten') {
      const rewrite = AUTH_REWRITES[paragraphId];
      const label = action === 'tighten' ? 'Tighten' : 'Strengthen';
      setMessages(m => [...m, { role: 'user', pre: preLabel, text: `${label} this paragraph against the strongest regulatory precedent.` }]);
      setPending(true);
      if (!rewrite) {
        setTimeout(() => {
          setPending(false);
          setMessages(m => [...m, { role: 'ai', blocks: [
            { kind: 'p', text: 'No rewrite template registered for this paragraph in the demo corpus — the live AnA would synthesize one from the active rule pack and your vault.' },
          ]}]);
        }, 700);
        return;
      }
      setTimeout(() => {
        setPending(false);
        setMessages(m => [...m, { role: 'ai', blocks: [
          { kind: 'tool', label: 'Precedent', value: 'FDA 2023 bridging guidance · RIM 0.91' },
          { kind: 'tool', label: 'Pack',      value: `${docTypeObj.label} × ${agencyObj.label}` },
          { kind: 'stream', target: `§${sectionMeta.path} · ${paragraphId}`, hint: 'rewriting in-place' },
        ]}]);
        setTimeout(() => kickStream(paragraphId, rewrite, () => {
          setMessages(m => [...m, { role: 'ai', blocks: [
            { kind: 'p', text: `Done. ${label.toLowerCase()}ed paragraph cites the precedent. Confidence rose.` },
          ]}]);
        }), 600);
      }, 600);
      return;
    }

    if (action === 'precedent') {
      setMessages(m => [...m, { role: 'user', pre: preLabel, text: 'Find regulatory precedent for this claim.' }]);
      setPending(true);
      setTimeout(() => {
        setPending(false);
        setMessages(m => [...m, { role: 'ai', blocks: [
          { kind: 'tool', label: 'RIM search', value: '3 matches across FDA, EMA, PMDA' },
          { kind: 'p', text: `Top match: FDA 2023 oncology bridging guidance (RIM 0.91). Second: EMEA/H/C/005612 §4.3 (0.87). Third: PMDA Y-203 (0.76).` },
        ]}]);
      }, 800);
      return;
    }

    if (action === 'cite') {
      setMessages(m => [...m, { role: 'user', pre: preLabel, text: 'Attach a citation to this selection.' }]);
      setPending(true);
      setTimeout(() => {
        setPending(false);
        setMessages(m => [...m, { role: 'ai', blocks: [
          { kind: 'tool', label: 'Vault', value: '12 candidate evidence items · 4 RIM precedents' },
          { kind: 'p',    text: 'Top suggestions in the Evidence inspector. Click a card to anchor it to the selection.' },
        ]}]);
      }, 700);
      return;
    }

    if (action === 'regenerate') {
      const rewrite = AUTH_REWRITES[paragraphId];
      setMessages(m => [...m, { role: 'user', pre: preLabel, text: 'Regenerate this paragraph using current source data.' }]);
      setPending(true);
      setTimeout(() => {
        setPending(false);
        setMessages(m => [...m, { role: 'ai', blocks: [
          { kind: 'tool', label: 'Pulled',  value: 'Source refreshed · 4 sources · 2 newer than last draft' },
          { kind: 'tool', label: 'Diff',    value: 'Will show side-by-side before commit' },
          { kind: 'stream', target: `§${sectionMeta.path} · ${paragraphId}`, hint: 'regenerating in-place' },
        ]}]);
        if (rewrite) {
          setTimeout(() => kickStream(paragraphId, rewrite, () => {
            setMessages(m => [...m, { role: 'ai', blocks: [
              { kind: 'p', text: 'Regeneration ready. Use the version history (top bar) to compare against the previous draft, or accept the regeneration to commit it to the audit ledger.' },
            ]}]);
          }), 600);
        } else {
          setMessages(m => [...m, { role: 'ai', blocks: [
            { kind: 'p', text: 'No source delta detected for this paragraph — the prior draft already reflects the latest data.' },
          ]}]);
        }
      }, 700);
      return;
    }

    if (action === 'comment') {
      setMessages(m => [...m, { role: 'user', pre: preLabel, text: 'Add a comment thread on this selection.' }]);
      setMessages(m => [...m, { role: 'ai', blocks: [
        { kind: 'tool',  label: 'Comment',  value: `Pinned to §${sectionMeta.path} · ${paragraphId}` },
        { kind: 'p',     text: 'Mention a reviewer with @ in the dock composer, or click the pinned chip in the right margin to reply, resolve, or reopen.' },
      ]}]);
      return;
    }

    if (action === 'review') {
      setMessages(m => [...m, { role: 'user', pre: preLabel, text: 'Send this section to a reviewer.' }]);
      setMessages(m => [...m, { role: 'ai', blocks: [
        { kind: 'tool', label: 'Task created', value: `Review §${sectionMeta.path} · assigned · notified` },
        { kind: 'p',    text: 'Who should review? @-mention them in the composer, or I\u2019ll route to the section owner. A review task is now on their board with this selection attached.' },
      ]}]);
      return;
    }

    if (action === 'approve') {
      setMessages(m => [...m, { role: 'user', pre: preLabel, text: 'Route this section for approval.' }]);
      setMessages(m => [...m, { role: 'ai', blocks: [
        { kind: 'tool', label: 'Approval chain', value: `§${sectionMeta.path} → Reg lead → QA · e-signature required` },
        { kind: 'p',    text: 'Routed for e-signature approval. The approver signs through the 21 CFR Part 11 gate; the audit chain records the meaning and reason.' },
      ]}]);
      return;
    }

    if (action === 'flag') {
      setMessages(m => [...m, { role: 'user', pre: preLabel, text: 'Flag for reviewer attention.' }]);
      setMessages(m => [...m, { role: 'ai', blocks: [
        { kind: 'tool', label: 'Flagged', value: `${sectionMeta.path} for ${ownerName || 'reviewer'}` },
      ]}]);
    }
  };

  /* ───── Chat props (shared between modes) ───── */
  const chatProps = {
    title: view === 'workbench' ? 'Ask AnA' : 'Intelligence',
    hint:  view === 'workbench' ? `§${sectionMeta.path}` : `AnA 1.0 RI`,
    messages, pending,
    value: composer, onChange: setComposer, onSend,
    showSkills: messages.length <= AUTH_SEED_THREAD.length + 2,
    onPickSkill,
  };

  /* ───── Edit-mode protocol (Tweaks toolbar) ───── */
  useEffect(() => {
    const onMsg = (e) => {
      if (e.data && e.data.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data && e.data.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  /* ───────── Render ───────── */
  return (
    <div className="au-shell"
         data-mode={view}
         data-focus={focus || undefined}
         data-tree={treeCollapsed ? 'collapsed' : undefined}
         data-screen-label="Authoring · Universal">
      <AuthShell.TopBar
        program={program}
        docType={docType}
        agency={agency}
        view={view}
        focus={focus}
        treeCollapsed={treeCollapsed}
        version={AUTH_DEFAULT.version}
        lastSaved={'2 sec ago'}
        streaming={!!streamingId}
        evidenceMode={evidenceMode}
        onEvidenceMode={setEvidenceMode}
        onDocType={setDocType}
        onAgency={setAgency}
        onView={setView}
        onToggleTree={() => setTreeCollapsed(c => !c)}
        onToggleFocus={() => setFocus(f => !f)}
      />

      <OutlineTree
        outline={outline}
        activeId={activeId}
        onPick={onPickSection}
        version={AUTH_DEFAULT.version}
        state={AUTH_DEFAULT.state}
      />

      <div className="au-primary">
        {view === 'conversation' ? (
          <>
            <Conversation.Chat {...chatProps}/>
            <Artifact
              section={section}
              sectionMeta={sectionMeta}
              program={program}
              version={AUTH_DEFAULT.version}
              lastSaved={'2 sec ago'}
              agencyId={agency}
              agencyLabel={agencyObj.label}
              ownerName={ownerName}
              streamingId={streamingId}
              streamText={streamText}
              evidenceMode={evidenceMode}
              onSelect={setSelection}
              onDraftWithAna={() => onDraftWithAna(activeId)}
            />
          </>
        ) : (
          <>
            <div style={{ overflowY: 'auto', minWidth: 0, minHeight: 0 }}>
              <Workbench.WorkbenchTable
                outline={outline}
                docType={docTypeObj}
                agencyLabel={agencyObj.label}
                activeId={activeId}
                onPick={onPickSection}
                onDraft={onDraftWithAna}
              />
              <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 28px 28px' }}>
                <div className="au-wb-card">
                  <div className="au-wb-card-head">
                    <span className="path">§{sectionMeta.path}</span>
                    <span className="title">{sectionMeta.label}</span>
                    <span className="spacer"/>
                    <button className="au-tb-btn" title="Open in conversation" onClick={() => setView('conversation')}>
                      {I.conversation} Draft with AnA
                    </button>
                    <button className="au-tb-btn primary">{I.send} Send for review</button>
                  </div>
                  <div className="au-wb-meta-strip">
                    <div className="col"><div className="lbl">Status</div><div className="val">{({approved:'Approved', review:'In review', drafted:'Drafted', locked:'Locked', todo:'Not started'})[sectionMeta.status || 'todo']}</div></div>
                    <div className="col"><div className="lbl">Owner</div><div className="val">{ownerName || 'Unassigned'}</div></div>
                    <div className="col"><div className="lbl">Agency</div><div className="val">{agencyObj.label}</div></div>
                    <div className="col"><div className="lbl">Citations</div><div className="val">{section ? (section.paragraphs.reduce((a, p) => a + ((p.citations||[]).length), 0)) : 0}</div></div>
                  </div>

                  {section
                    ? (
                      <div className="au-doc" data-evidence={evidenceMode} style={{ maxWidth: 'none', padding: 0 }}>
                        {section.paragraphs.map(p => (
                          <window.AuthParagraphInline key={p.id}
                            p={p}
                            streaming={p.id === streamingId}
                            streamText={streamText}
                            evidenceMode={evidenceMode}
                            onSelect={setSelection}/>
                        ))}
                      </div>
                    )
                    : (
                      <div className="au-empty" style={{ padding: '36px 24px' }}>
                        <p style={{ fontFamily:'var(--font-sans)', fontSize: 11, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-400)', margin:0 }}>{agencyObj.label} pack</p>
                        <h2 style={{ fontFamily:'var(--font-serif)', fontSize: 22, margin: '6px 0 4px' }}>Nothing drafted yet</h2>
                        <p>Use AnA to seed §{sectionMeta.path} from your evidence corpus, or open the rule-pack template to start manually.</p>
                        <button className="au-tb-btn primary" style={{ marginTop: 12 }} onClick={() => onDraftWithAna(activeId)}>
                          {I.sparkle} Draft with AnA
                        </button>
                      </div>
                    )
                  }
                </div>
              </div>
            </div>
            <Workbench.Inspector
              tab={inspectorTab}
              setTab={setInspectorTab}
              sectionMeta={sectionMeta}
              evidence={AUTH_EVIDENCE}
              reviewers={AUTH_REVIEWERS}
              Chat={Conversation.Chat}
              chatProps={chatProps}
            />
          </>
        )}
      </div>

      <Conversation.SelectionToolbar selection={selection} onAction={onAction}/>

      <TweaksPanel
        open={tweaksOpen}
        onClose={() => { setTweaksOpen(false); window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); }}
        view={view} setView={setView}
        agency={agency} setAgency={setAgency}
        docType={docType} setDocType={setDocType}
        evidenceMode={evidenceMode} setEvidenceMode={setEvidenceMode}
        focus={focus} setFocus={setFocus}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);

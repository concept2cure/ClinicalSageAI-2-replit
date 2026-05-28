/* global React, I, Tree, ArtifactDoc, SelectionToolbar, ARTIFACTS */
const { useState, useEffect, useRef } = React;

/* ───────── TopBar ───────── */
function TopBar({ focus, setFocus, treeCollapsed, setTreeCollapsed, art }) {
  return (
    <header className="topbar">
      <div className="topbar-logo">
        <img src="../../assets/concept2cure-icon.svg" alt=""/>
        <b>Concept2Cure<span>.RI</span></b>
      </div>
      <div className="topbar-divider"/>
      <button className="topbar-btn" onClick={() => setTreeCollapsed(!treeCollapsed)} title="Toggle tree">
        {I.panelLeft}
      </button>
      <div className="topbar-crumbs">
        <span>NDA 212345</span>
        <span className="sep">/</span>
        <span>{art.module.replace(/^Module \d+ — /, '').split(' ').slice(0, 3).join(' ')}</span>
        <span className="sep">/</span>
        <b>{art.path} {art.title}</b>
      </div>
      <div className="topbar-spacer"/>
      <div className="topbar-status">
        <span className="dot"/>
        <span>Autosaved · {art.version} · {art.lastEdited}</span>
      </div>
      <button className="topbar-btn" title="Share">{I.share}</button>
      <button className="topbar-btn" title="Export">{I.download}</button>
      <button className="topbar-btn" onClick={() => setFocus(!focus)} title="Focus mode">
        {I.focus}
      </button>
      <button className="topbar-btn primary">Submit for review</button>
    </header>
  );
}

/* ───────── Intelligence ───────── */
function Intelligence({ messages, onSend, pending }) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, pending]);

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft('');
  };

  return (
    <section className="intel">
      <div className="intel-head">
        <b>Intelligence</b>
        <span className="hint">AnA 1.0 RI · c2c-Opus 4.7</span>
      </div>
      <div className="intel-scroll" ref={scrollRef}>
        <div className="intel-thread">
          {messages.map((m, i) => (
            m.role === 'user' ? (
              <div key={i} className="msg-user">
                {m.pre && <div className="msg-pre">{m.pre}</div>}
                {m.text}
              </div>
            ) : (
              <div key={i} className="msg-ai">
                <div className="avatar-ai">A</div>
                <div className="body">
                  {m.blocks.map((b, j) => {
                    if (b.kind === 'p')     return <p key={j}>{b.text}</p>;
                    if (b.kind === 'tool')  return <div key={j} className="tool">{I.check}<span><b>{b.label}</b> {b.value} <span className="tick">✓</span></span></div>;
                    if (b.kind === 'stream') return <div key={j} className="tool"><span className="spin"/><span><b>Streaming</b> {b.target} <span className="hint">{b.hint}</span></span></div>;
                    if (b.kind === 'chip')  return (
                      <button key={j} className="artifact-chip">
                        <span className="ico">{I.file}</span>
                        <span>
                          <span className="title">{b.title}</span><br/>
                          <span className="meta">{b.meta}</span>
                        </span>
                      </button>
                    );
                    return null;
                  })}
                </div>
              </div>
            )
          ))}
          {pending && (
            <div className="msg-ai">
              <div className="avatar-ai">A</div>
              <div className="body">
                <div className="typing"><span/><span/><span/></div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="intel-footer">
        <div className="composer">
          <textarea
            rows={1}
            placeholder="Ask AnA about this section, or draft more…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <div className="composer-row">
            <div style={{display:'flex', gap:4}}>
              <button className="chip" title="Attach">{I.attach}</button>
              <button className="chip" title="Tools">{I.tools} Tools</button>
              <button className="chip">c2c-Opus 4.7 {I.down}</button>
            </div>
            <button className="composer-send" disabled={!draft.trim()} onClick={send}>
              {I.arrowUp}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────── Artifact ───────── */
function Artifact({ path, streaming, streamText, onSelect, art }) {
  const [tab, setTab] = useState('doc');
  return (
    <section className="artifact">
      <div className="artifact-head">
        <span className="title">Section {art.path} — {art.title}</span>
        <span className="meta">{art.version} · edited {art.lastEdited} · {art.lastEditedBy}</span>
        <span className="spacer"/>
        <div className="artifact-tabs">
          <button className="artifact-tab" data-active={tab==='doc' || undefined} onClick={() => setTab('doc')}>Document</button>
          <button className="artifact-tab" data-active={tab==='xml' || undefined} onClick={() => setTab('xml')}>eCTD XML</button>
          <button className="artifact-tab" data-active={tab==='diff' || undefined} onClick={() => setTab('diff')}>Changes</button>
        </div>
        <button className="topbar-btn" title="Revert">{I.revert}</button>
        <button className="topbar-btn" title="More">{I.dots}</button>
      </div>
      <div className="artifact-doc" onMouseDown={() => onSelect(null)}>
        <ArtifactDoc path={path} streaming={streaming} streamText={streamText} onSelect={onSelect}/>
      </div>
    </section>
  );
}

/* ───────── Tighten action — rewrite templates per block ───────── */
/* A tiny "model" that produces a stronger version of a paragraph's text.
   Data-driven so the demo works on 2.5, 2.3, 3.2.S. */
const REWRITES = {
  p3: 'Efficacy was evaluated in BX204-201, a pivotal, multicenter, open-label, single-arm Phase II trial enrolling 184 adults with RTK-X–positive advanced or metastatic solid tumors refractory to ≥1 prior systemic therapy. The primary endpoint was confirmed objective response rate (ORR) assessed by blinded independent central review using RECIST v1.1, with response durations and progression-free survival as key secondary endpoints.',
  p4: 'The confirmed ORR of 38.6% (95% CI 31.5–46.0) exceeded the pre-specified threshold of 25%, derived from an indication-matched pooled historical control of 412 patients across five sponsor-independent datasets (2019–2023). The magnitude and consistency of effect across pre-specified subgroups — prior lines of therapy, ECOG 0 vs 1, and RTK-X IHC 2+ vs 3+ — together with the FDA 2023 bridging guidance and EMA precedent EMEA/H/C/005612, support the benefit-risk case for accelerated approval.',
  p1: 'BX-204 is a humanized IgG1κ monoclonal antibody with picomolar affinity for the extracellular domain of receptor tyrosine kinase X (RTK-X), engineered with Fc-silencing mutations (L234A/L235A) to abrogate effector function and developed for the treatment of adults with advanced or metastatic RTK-X–overexpressing solid tumors.',
  p2: 'In the Phase I first-in-human study BX204-101 (n=42), BX-204 was tolerated across seven dose levels with no dose-limiting toxicities observed; the recommended Phase II dose was established at 12 mg/kg administered intravenously every three weeks, supported by a two-compartment population-pharmacokinetic model validated against an external oncology cohort.',
  q1: 'BX-204 drug substance is a recombinant humanized IgG1κ monoclonal antibody (150 kDa, ~1,320 amino acids) produced by fed-batch mammalian cell culture in a qualified CHO-K1 host cell line, purified via a three-step chromatography train (Protein A affinity, mixed-mode cation exchange, anion-exchange polishing), with two orthogonal viral clearance operations (low-pH viral inactivation and 20 nm viral filtration) delivering a cumulative log reduction value exceeding 18 for model viruses.',
  q2: 'Long-term stability studies at 2–8 °C support a proposed shelf life of 24 months, based on 18 months of primary stability data from three registration-stability lots showing no meaningful change in any critical quality attribute, corroborated by accelerated data at 25 °C / 60% RH consistent with ICH Q1E projections.',
  q3: 'The drug product is presented as a sterile, preservative-free liquid for intravenous administration, supplied in single-dose 6-mL Type-I clear glass vials at a target concentration of 20 mg/mL BX-204, nominal fill volume 5.0 mL, closed with a 20-mm chlorobutyl stopper coated with ETFE and sealed with an aluminum flip-off overseal; container-closure integrity is demonstrated by helium leak and microbial ingress methods per USP <1207>.',
  s1: 'Nonproprietary name: BX-204. International Nonproprietary Name (INN): rotuxizumab (recommended INN list 92). Chemical Abstracts Service Registry Number: 2387451-22-9. Proprietary name: proposed; under review with the FDA Office of Surveillance and Epidemiology. Molecular formula: C6508H10024N1732O2029S44.',
  s2: 'BX-204 drug substance is manufactured at the Concept2Cure Bio Raleigh, NC facility (FEI 3012847) using a 2,000-L single-use fed-batch bioreactor; the master cell bank (MCB) and working cell bank (WCB) have been fully characterized per ICH Q5A(R2) and Q5D, including identity, viability, genetic stability across the limit of in-vitro cell age, and adventitious agent screening.',
  s3: 'Process performance qualification (PPQ) is proposed across three consecutive at-scale conformance runs; two of three runs are complete with all critical quality attributes (aggregate, charge variant distribution, glycan profile, potency) within pre-established acceptance criteria derived from the 95/99 confidence/coverage tolerance interval of the clinical manufacturing history.',
};

/* ───────── App ───────── */
function App() {
  const [activePath, setActivePath] = useState('2.5');
  const [focus, setFocus] = useState(false);
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  // Streaming: when set, Paragraph with matching id renders streamText + caret
  const [streamingId, setStreamingId] = useState(null);
  const [streamText, setStreamText] = useState('');
  // The stable target that drives the animation — only changes when a new stream is kicked off
  const [streamTarget, setStreamTarget] = useState(null); // { id, fullText, onDone }

  const [selection, setSelection] = useState(null);
  const [pending, setPending] = useState(false);

  const art = ARTIFACTS[activePath] || ARTIFACTS['2.5'];

  // ───── Streaming rewrite engine (rAF-driven, survives re-renders) ─────
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
          // Commit rewrite
          Object.values(ARTIFACTS).forEach(a => {
            a.blocks.forEach(b => {
              if (b.id === id) {
                b.spans = [{ t: fullText }];
                b.confidence = Math.min(0.98, (b.confidence || 0.8) + 0.04);
                b.prov = { ...b.prov, foot: 'Rewritten · strengthened · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
              }
            });
          });
          setStreamingId(null);
          setStreamText('');
          setStreamTarget(null);
          onDone && onDone();
        }, 300);
        return;
      }
      timer = setTimeout(tick, 16);
    };
    timer = setTimeout(tick, 16);
    return () => { if (timer) clearTimeout(timer); };
  }, [streamTarget]);

  const kickStream = (blockId, fullText, onDone) => {
    setStreamTarget({ id: blockId, fullText, onDone });
  };

  // Seed chat thread — first-load story, but it grows as user interacts
  const [messages, setMessages] = useState([
    { role: 'user', text: 'Draft Section 2.5 for NDA 212345. Cross-reference the Phase II CSR and anchor the efficacy argument on the FDA 2023 bridging guidance.' },
    { role: 'ai', blocks: [
      { kind: 'p',    text: "I'll draft §2.5 against the current corpus. Pulling sources first." },
      { kind: 'tool', label: 'Pulled',   value: 'Protocol-001, CSR-099, CSR-201, SAP v3' },
      { kind: 'tool', label: 'Matched',  value: 'FDA 2023 bridging guidance · RIM precedent 0.87' },
      { kind: 'tool', label: 'Matched',  value: 'EMA precedent EMEA/H/C/005612' },
      { kind: 'p',    text: 'Drafted §2.5.1, §2.5.4, and the efficacy summary table. The right pane is live — hover any paragraph for provenance, or select text to ask me to strengthen or tighten it.' },
      { kind: 'chip', title: 'Section 2.5 — Clinical overview', meta: '4 sections · 11 citations · v0.4 draft' },
    ] },
  ]);

  // ───── User sends a chat message ─────
  const onSend = (text) => {
    setMessages(m => [...m, { role: 'user', text }]);
    setPending(true);
    setTimeout(() => {
      setPending(false);
      setMessages(m => [...m, { role: 'ai', blocks: [
        { kind: 'p', text: "Understood. I'll reflect that in the artifact now." },
        { kind: 'tool', label: 'Updated', value: `${art.path} · ${art.title}` },
      ]}]);
    }, 900);
  };

  // ───── Selection toolbar action ─────
  const onAction = (action) => {
    if (!selection) return;
    const { blockId, text } = selection;
    setSelection(null);
    window.getSelection && window.getSelection().removeAllRanges();

    if (action === 'tighten' || action === 'ask') {
      const rewrite = REWRITES[blockId];
      if (!rewrite) return;
      const label = action === 'tighten' ? 'Tighten' : 'Strengthen';
      setMessages(m => [...m, {
        role: 'user',
        pre: `Selected · “${text.slice(0, 60)}${text.length > 60 ? '…' : ''}”`,
        text: `${label} this paragraph against the strongest regulatory precedent.`,
      }]);
      setPending(true);

      setTimeout(() => {
        setPending(false);
        setMessages(m => [...m, { role: 'ai', blocks: [
          { kind: 'tool', label: 'Precedent', value: 'FDA 2023 bridging guidance · RIM match 0.91' },
          { kind: 'tool', label: 'Cross-check', value: 'CSR-201 §7.1, SAP §9.4' },
          { kind: 'stream', target: `§${art.path} paragraph`, hint: 'rewriting in-place' },
        ]}]);
        // Start streaming after tool messages render
        setTimeout(() => {
          kickStream(blockId, rewrite, () => {
            setMessages(m => [...m, { role: 'ai', blocks: [
              { kind: 'p', text: `Done. The rewritten paragraph cites the precedent explicitly and firms the quantitative claims. Confidence rose to ${(Math.min(0.98, ((ARTIFACTS[art.path].blocks.find(b => b.id === blockId) || {}).confidence || 0.9)).toFixed(2))}.` },
            ]}]);
          });
        }, 600);
      }, 700);
    }

    if (action === 'precedent') {
      setMessages(m => [...m, {
        role: 'user',
        pre: `Selected · “${text.slice(0, 60)}${text.length > 60 ? '…' : ''}”`,
        text: 'Find regulatory precedent for this claim.',
      }]);
      setPending(true);
      setTimeout(() => {
        setPending(false);
        setMessages(m => [...m, { role: 'ai', blocks: [
          { kind: 'tool', label: 'RIM search', value: '3 matches across FDA / EMA / PMDA' },
          { kind: 'p', text: 'Top match: FDA 2023 draft guidance on oncology bridging studies (RIM precedent 0.91). Second: EMEA/H/C/005612 Assessment Report §4.3 (0.83). Third: PMDA consultation response Y-203 (0.76).' },
        ]}]);
      }, 900);
    }

    if (action === 'flag') {
      setMessages(m => [...m, { role: 'ai', blocks: [
        { kind: 'tool', label: 'Flagged', value: `§${art.path} for reviewer attention` },
      ]}]);
    }
  };

  // ───── Tree navigation ─────
  const onTreeNav = (path) => {
    if (!ARTIFACTS[path]) return;
    setActivePath(path);
    setSelection(null);
    setMessages(m => [...m, { role: 'ai', blocks: [
      { kind: 'tool', label: 'Loaded', value: `${path} · ${ARTIFACTS[path].title}` },
    ]}]);
  };

  // Clear selection on outside click / scroll
  useEffect(() => {
    const clear = () => setSelection(null);
    document.addEventListener('scroll', clear, true);
    return () => document.removeEventListener('scroll', clear, true);
  }, []);

  return (
    <div className="shell" data-focus={focus || undefined} data-tree-collapsed={treeCollapsed || undefined}>
      <TopBar focus={focus} setFocus={setFocus} treeCollapsed={treeCollapsed} setTreeCollapsed={setTreeCollapsed} art={art}/>
      <Tree activePath={activePath} setActivePath={onTreeNav}/>
      <Intelligence messages={messages} onSend={onSend} pending={pending}/>
      <Artifact path={activePath} streaming={streamingId} streamText={streamText} onSelect={setSelection} art={art}/>
      <SelectionToolbar selection={selection} onAction={onAction}/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);

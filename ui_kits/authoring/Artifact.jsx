/* global React, I, AUTH_SECTION_BODY, AUTH_EVIDENCE, AUTH_GATES, AUTH_GATE_CATEGORIES */
const { useState, useRef, useEffect, useMemo } = React;

const evMap = () => Object.fromEntries(AUTH_EVIDENCE.map(e => [e.id, e]));

function confClass(c) {
  if (c >= 0.92) return 'high';
  if (c >= 0.82) return 'med';
  return 'low';
}

/* Split a paragraph's text into runs, wrapping any span that matches a
   compliance-gate finding in a <mark> with the gate's metadata.
   Findings are matched first-occurrence, longest-first to avoid overlap. */
function renderWithGates(text, gates, onGateActivate, activeGateId) {
  if (!gates || !gates.length) return text;
  const findings = [...gates].sort((a, b) => (b.match || '').length - (a.match || '').length);
  const segments = [{ kind: 'text', text }];
  for (const g of findings) {
    if (!g.match) continue;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (s.kind !== 'text') continue;
      const idx = s.text.indexOf(g.match);
      if (idx === -1) continue;
      const before = s.text.slice(0, idx);
      const after  = s.text.slice(idx + g.match.length);
      const replacement = [
        before && { kind: 'text', text: before },
        { kind: 'gate', text: g.match, gate: g },
        after && { kind: 'text', text: after },
      ].filter(Boolean);
      segments.splice(i, 1, ...replacement);
      break;
    }
  }
  return segments.map((s, i) => {
    if (s.kind === 'text') return s.text;
    return (
      <mark
        key={i}
        className={`au-gate au-gate-${s.gate.sev}`}
        data-active={activeGateId === s.gate.id || undefined}
        onMouseDown={(e) => { e.stopPropagation(); }}
        onClick={(e) => { e.stopPropagation(); onGateActivate(s.gate); }}
      >
        {s.text}
      </mark>
    );
  });
}

/* Render a paragraph with optional citation chips at the end and a hover
   provenance popover. Streaming sections render `streamText` + caret.
   Compliance-gate marks render inline when AUTH_GATES has findings for this id. */
function Paragraph({ p, streaming, streamText, evidenceMode, onSelect, onGateActivate, activeGateId, gatesEnabled }) {
  const [hover, setHover] = useState(false);
  const ref = useRef(null);
  const evRecords = (p.citations || []).map(c => evMap()[c.ev]).filter(Boolean);
  const text = streaming ? streamText : p.text;
  const gates = (gatesEnabled && !streaming && AUTH_GATES[p.id]) || null;

  const handleMouseUp = () => {
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed) { onSelect(null); return; }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) { onSelect(null); return; }
    if (!ref.current || !ref.current.contains(range.commonAncestorContainer)) { onSelect(null); return; }
    onSelect({ paragraphId: p.id, text: sel.toString(), rect });
  };

  if (p.tag === 'h2') {
    return <h2 id={'sec-' + p.id}>{p.text}</h2>;
  }

  return (
    <p
      ref={ref}
      className="au-para"
      data-streaming={streaming || undefined}
      onMouseUp={handleMouseUp}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Provenance tag (top-left when hovered) */}
      {p.prov && (
        <span className="prov-tag">
          <span className={'conf ' + confClass(p.prov.confidence)}>{Math.round(p.prov.confidence*100)}%</span>
          <span>·</span>
          <span>{p.prov.auditId}</span>
        </span>
      )}

      {/* Body text — may contain inline compliance-gate marks */}
      {gates ? renderWithGates(text, gates, onGateActivate, activeGateId) : text}
      {streaming && <span className="caret"/>}

      {/* Inline citation chips (footnote mode) */}
      {!streaming && evRecords.length > 0 && evidenceMode === 'footnote' && evRecords.map((e, i) => (
        <span key={e.id} className="au-cite-chip" title={`${e.kind} · ${e.title}`}>
          <span className="num">[{i+1}]</span>
          <span style={{ color:'var(--text-300)' }}>{e.kind}</span>
        </span>
      ))}

      {/* Margin-rail card (margin mode) */}
      {!streaming && p.prov && evidenceMode === 'margin' && (
        <span className="margin-card">
          <span className="src">{p.prov.source.split(',')[0]}</span>
          <span className="row"><span>Model</span><span>{p.prov.model}</span></span>
          <span className="row"><span>Confidence</span><span className={'conf ' + confClass(p.prov.confidence)}>{Math.round(p.prov.confidence*100)}%</span></span>
        </span>
      )}

      {/* Provenance popover (when hovered, all modes) */}
      {hover && p.prov && (
        <span className="au-prov-pop" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
          <h6>Provenance · {p.id}</h6>
          <span className="row"><span className="k">Source</span><span className="v">{p.prov.source}</span></span>
          <span className="row"><span className="k">Model</span><span className="v">{p.prov.model}</span></span>
          <span className="row"><span className="k">Confidence</span><span className={'v conf ' + confClass(p.prov.confidence)}>{Math.round(p.prov.confidence*100)}%</span></span>
          <span className="row"><span className="k">Audit ID</span><span className="v" style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{p.prov.auditId}</span></span>
          <span className="foot">{p.prov.foot}</span>
        </span>
      )}
    </p>
  );
}

/* ───────── Artifact head: title + tabs + state strip ───────── */
function ArtifactHead({ section, sectionMeta, program, version, lastSaved, tab, setTab, gatesEnabled, setGatesEnabled, gateCounts }) {
  const total = (gateCounts && (gateCounts.err + gateCounts.warn + gateCounts.info)) || 0;
  return (
    <>
    <div className="au-art-head">
      <div>
        <div className="title">{section.heading || sectionMeta.label}</div>
        <div className="meta">
          {sectionMeta.path} · {sectionMeta.label} · {program.code} · {version} · edited {lastSaved}
        </div>
      </div>
      <div style={{ flex: 1 }}/>
      {gateCounts && total > 0 && (
        <button
          className="au-gate-pill"
          data-enabled={gatesEnabled || undefined}
          onClick={() => setGatesEnabled && setGatesEnabled(!gatesEnabled)}
          title={gatesEnabled ? 'Compliance gates · click to hide' : 'Compliance gates · click to show'}
        >
          <span className="au-gate-pill-mark">{I.shieldOk}</span>
          {gateCounts.err > 0  && <span className="au-gate-count au-gate-count-err"><span className="au-gate-dot"/>{gateCounts.err}</span>}
          {gateCounts.warn > 0 && <span className="au-gate-count au-gate-count-warn"><span className="au-gate-dot"/>{gateCounts.warn}</span>}
          {gateCounts.info > 0 && <span className="au-gate-count au-gate-count-info"><span className="au-gate-dot"/>{gateCounts.info}</span>}
        </button>
      )}
      <div className="au-art-tabs">
        <button className="au-art-tab" data-active={tab==='doc' || undefined}  onClick={() => setTab('doc')}>Document</button>
        <button className="au-art-tab" data-active={tab==='xml' || undefined}  onClick={() => setTab('xml')}>eCTD XML</button>
        <button className="au-art-tab" data-active={tab==='diff' || undefined} onClick={() => setTab('diff')}>Changes</button>
      </div>
      <button className="au-tb-btn" title="Revert">{I.revert}</button>
      <button className="au-tb-btn" title="More">{I.dots}</button>
    </div>
    {tab === 'doc' && (
      <div className="au-format-bar">
        <div className="group">
          <select className="style-select" defaultValue="body" title="Style">
            <option value="title">Title</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="body">Body</option>
            <option value="cap">Caption</option>
          </select>
        </div>
        <div className="group">
          <button className="fmt-b" title="Bold · ⌘B">B</button>
          <button className="fmt-i" title="Italic · ⌘I">I</button>
          <button className="fmt-u" title="Underline · ⌘U">U</button>
          <button title="Strikethrough">S</button>
        </div>
        <div className="group">
          <button title="Bullet list">•</button>
          <button title="Numbered list">1.</button>
          <button title="Decrease indent">⇤</button>
          <button title="Increase indent">⇥</button>
        </div>
        <div className="group">
          <button title="Insert table">⊞</button>
          <button title="Insert figure">▭</button>
          <button title="Insert citation">{I.cite}</button>
          <button title="Insert footnote">¹</button>
          <button title="Insert link">{I.link}</button>
        </div>
        <div className="group">
          <button title="Track changes">{I.diff}</button>
          <button title="Comments">{I.fileText}</button>
          <button title="Find and replace">{I.search}</button>
        </div>
      </div>
    )}
    </>
  );
}

/* ───────── State strip (workbench mode only — owner / status / due / agency) ───────── */
function StateBar({ sectionMeta, agencyId, agencyLabel, owner, ownerName, status, dueAt }) {
  const statusLabel = (
    status === 'approved' ? 'Approved' :
    status === 'review'   ? 'In review' :
    status === 'drafted'  ? 'Drafted' :
    status === 'locked'   ? 'Locked' :
                            'Not started'
  );
  return (
    <div className="au-art-state-bar">
      <div className="group">
        <span className="label">Status</span>
        <span className={`au-status-pill ${status || 'todo'}`}><span className="dot"/>{statusLabel}</span>
      </div>
      <div className="group"><span className="label">Owner</span><span className="value">{ownerName || (owner || 'Unassigned')}</span></div>
      <div className="group"><span className="label">Agency</span><span className="value">{agencyLabel}</span></div>
      <div className="group"><span className="label">Due</span><span className="value">{dueAt || 'No date set'}</span></div>
      <div style={{ flex: 1 }}/>
      <div className="group"><span className="label">Mandatory</span><span className="value">{sectionMeta.mandatory ? 'Yes' : 'No'}</span></div>
    </div>
  );
}

/* ───────── Empty state for sections without a body fixture ───────── */
function ArtifactEmpty({ sectionMeta, agencyLabel, onDraftWithAna }) {
  return (
    <div className="au-empty">
      <p style={{ fontFamily:'var(--font-sans)', fontSize: 12, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-400)', margin:0 }}>{agencyLabel} pack</p>
      <h2 style={{ fontFamily:'var(--font-serif)', fontSize: 22, margin: '6px 0 4px', color:'var(--text-100)' }}>{sectionMeta.label}</h2>
      <p>Nothing drafted yet. Open this section in the rule pack to populate slots, or ask AnA to draft it from your evidence corpus.</p>
      <button className="au-tb-btn primary" style={{ marginTop: 12 }} onClick={onDraftWithAna}>
        {I.sparkle} Draft with AnA
      </button>
    </div>
  );
}

/* ───────── Main Artifact pane ───────── */
function Artifact({
  section,         // body for the active section, may be null
  sectionMeta,    // outline node — label, path, mandatory, status, owner
  program,
  version, lastSaved,
  agencyId, agencyLabel,
  ownerName,
  streamingId, streamText,
  evidenceMode,
  onSelect,
  onDraftWithAna,
  reviewerInitial,
}) {
  const [tab, setTab] = useState('doc');
  const [gatesEnabled, setGatesEnabled] = useState(true);
  const [activeGate, setActiveGate] = useState(null);

  /* All gate findings present in the active section. */
  const sectionGates = useMemo(() => {
    if (!section) return [];
    const all = [];
    for (const p of section.paragraphs) {
      const list = (AUTH_GATES && AUTH_GATES[p.id]) || [];
      for (const g of list) all.push({ ...g, paragraphId: p.id });
    }
    return all;
  }, [section]);
  const errCount  = sectionGates.filter(g => g.sev === 'err').length;
  const warnCount = sectionGates.filter(g => g.sev === 'warn').length;
  const infoCount = sectionGates.filter(g => g.sev === 'info').length;

  if (!section) {
    return (
      <section className="au-artifact">
        <ArtifactHead section={{heading:sectionMeta.label}} sectionMeta={sectionMeta} program={program} version={version} lastSaved={lastSaved} tab={tab} setTab={setTab}
                      gatesEnabled={gatesEnabled} setGatesEnabled={setGatesEnabled}
                      gateCounts={{ err: 0, warn: 0, info: 0 }}/>
        <StateBar sectionMeta={sectionMeta} agencyId={agencyId} agencyLabel={agencyLabel}
                  owner={sectionMeta.owner} ownerName={ownerName} status={sectionMeta.status} dueAt={null}/>
        <div className="au-doc-scroll">
          <ArtifactEmpty sectionMeta={sectionMeta} agencyLabel={agencyLabel} onDraftWithAna={onDraftWithAna}/>
        </div>
      </section>
    );
  }
  return (
    <section className="au-artifact" onMouseDown={() => setActiveGate(null)}>
      <ArtifactHead section={section} sectionMeta={sectionMeta} program={program} version={version} lastSaved={lastSaved} tab={tab} setTab={setTab}
                    gatesEnabled={gatesEnabled} setGatesEnabled={setGatesEnabled}
                    gateCounts={{ err: errCount, warn: warnCount, info: infoCount }}/>
      <StateBar sectionMeta={sectionMeta} agencyId={agencyId} agencyLabel={agencyLabel}
                owner={sectionMeta.owner} ownerName={ownerName} status={sectionMeta.status} dueAt={null}/>
      <div className="au-doc-scroll">
        <div className="au-doc" data-evidence={evidenceMode}>
          <h1>{section.heading}</h1>
          <div className="doc-meta">{section.subheading} · §{sectionMeta.path}</div>
          {section.paragraphs.map(p => (
            <Paragraph
              key={p.id}
              p={p}
              streaming={p.id === streamingId}
              streamText={streamText}
              evidenceMode={evidenceMode}
              onSelect={onSelect}
              gatesEnabled={gatesEnabled}
              onGateActivate={setActiveGate}
              activeGateId={activeGate && activeGate.id}
            />
          ))}
        </div>
      </div>
      {activeGate && (
        <GatePopover
          gate={activeGate}
          onClose={() => setActiveGate(null)}
          onApply={() => {
            // In v2 this dispatches a governed action via the AnA dock; the
            // section text is patched and the audit row written. In the kit
            // we just close the popover after acknowledging.
            console.log('[gate · apply fix]', activeGate.id);
            setActiveGate(null);
          }}
        />
      )}
    </section>
  );
}

/* ───────── Compliance-gate popover ───────── */
function GatePopover({ gate, onClose, onApply }) {
  return (
    <div className="au-gate-pop" onMouseDown={(e) => e.stopPropagation()}>
      <div className="au-gate-pop-head">
        <span className={`au-gate-sev au-gate-sev-${gate.sev}`}>
          {gate.sev === 'err' ? 'Error' : gate.sev === 'warn' ? 'Warning' : 'Info'}
        </span>
        <span className="au-gate-pop-cat">{(AUTH_GATE_CATEGORIES && AUTH_GATE_CATEGORIES[gate.category]) || gate.category}</span>
        <button className="au-gate-pop-close" onClick={onClose} title="Close">{I.close}</button>
      </div>
      <div className="au-gate-pop-title">{gate.title}</div>
      <div className="au-gate-pop-desc">{gate.desc}</div>
      {gate.fix && (
        <>
          <div className="au-gate-pop-fix-label">Suggested fix</div>
          <div className="au-gate-pop-fix">{gate.fix}</div>
          <div className="au-gate-pop-btns">
            <button className="au-gate-pop-apply" onClick={onApply}>{I.check} Apply fix · writes audit row</button>
            <button className="au-gate-pop-secondary" onClick={onClose}>Dismiss</button>
          </div>
        </>
      )}
      {!gate.fix && (
        <div className="au-gate-pop-btns">
          <button className="au-gate-pop-secondary" onClick={onClose}>Close</button>
        </div>
      )}
    </div>
  );
}

window.Artifact = Artifact;
window.AuthParagraphInline = Paragraph;

/* global React, ARTIFACTS */
/* (hooks destructured in App.jsx — use React.* directly here to avoid scope collisions) */

/* ---------- Confidence gutter color ---------- */
function confClass(c) {
  if (c >= 0.9) return 'hi';
  if (c >= 0.8) return 'med';
  return 'lo';
}

/* ---------- Provenance popover (inline span, valid HTML) ---------- */
function Provenance({ prov, confidence }) {
  return (
    <span className="prov" role="tooltip">
      <span className="prov-row"><span className="prov-lbl">Source</span><span className="prov-val">{prov.source}</span></span>
      <span className="prov-row"><span className="prov-lbl">Model</span><span className="prov-val">{prov.model}</span></span>
      <span className="prov-row"><span className="prov-lbl">Confidence</span><span className="prov-val">{confidence.toFixed(2)}</span></span>
      <span className="prov-row"><span className="prov-lbl">Audit ID</span><span className="prov-val">{prov.audit}</span></span>
      <span className="prov-foot">{prov.foot}</span>
    </span>
  );
}

/* ---------- Paragraph — supports live streaming overlay ---------- */
function Paragraph({ block, streaming, streamText, onSelect }) {
  // During streaming rewrite: render streamText instead of original spans; show caret.
  const isStreaming = streaming === block.id;
  const handleMouseUp = () => {
    const sel = window.getSelection();
    const text = sel && sel.toString().trim();
    if (!text || text.length < 4) { onSelect(null); return; }
    // Only allow selections inside this paragraph
    const node = sel.anchorNode;
    if (!node) return;
    const start = node.nodeType === 1 ? node : node.parentElement;
    const p = start && start.closest && start.closest('[data-block-id]');
    if (!p || p.getAttribute('data-block-id') !== block.id) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    onSelect({ blockId: block.id, text, rect });
  };

  return (
    <p className="doc-p" data-block-id={block.id} data-conf={confClass(block.confidence)} onMouseUp={handleMouseUp}>
      <span className="doc-gutter" aria-hidden="true"/>
      {isStreaming ? (
        <>
          <span className="doc-streaming-text">{streamText}</span>
          <span className="doc-streaming"/>
        </>
      ) : (
        block.spans.map((s, i) => (
          s.cite
            ? <a key={i} className="doc-cite" href="#" onClick={(e) => e.preventDefault()}>{s.cite}</a>
            : <React.Fragment key={i}>{s.t}</React.Fragment>
        ))
      )}
      <Provenance prov={block.prov} confidence={block.confidence}/>
    </p>
  );
}

/* ---------- Table block ---------- */
function TableBlock({ block }) {
  return (
    <table className="doc-table">
      <thead><tr>{block.head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
      <tbody>
        {block.rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              typeof c === 'object' && c.pill
                ? <td key={j}><span className={`pill ${c.pill}`}>{c.text}</span></td>
                : <td key={j} className={/\d/.test(c) ? 'num' : ''}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------- ArtifactDoc: data-driven render ---------- */
function ArtifactDoc({ path, streaming, streamText, onSelect }) {
  const art = ARTIFACTS[path] || ARTIFACTS['2.5'];
  return (
    <div className="doc-inner stagger" key={path /* re-trigger stagger on swap */}>
      <div className="doc-masthead">
        <div className="grid">
          {art.masthead.map((m, i) => (
            <div key={i}>
              <div className="lbl">{m.lbl}</div>
              <div className="val">{m.val}</div>
            </div>
          ))}
        </div>
        <div style={{textAlign:'right'}}>
          <div className="lbl">21 CFR Part 11</div>
          <div className="val">Signed · {art.lastEditedBy}</div>
        </div>
      </div>

      <div className="doc-num">SECTION {art.path}</div>
      <h1 className="doc-h1">{art.title}</h1>

      {art.blocks.map((block, i) => {
        if (block.kind === 'h2')    return <h2 key={i} className="doc-h2">{block.text}</h2>;
        if (block.kind === 'table') return <TableBlock key={i} block={block}/>;
        return <Paragraph key={block.id} block={block} streaming={streaming} streamText={streamText} onSelect={onSelect}/>;
      })}
    </div>
  );
}

/* ---------- Selection toolbar — absolute-positioned above selection ---------- */
function SelectionToolbar({ selection, onAction }) {
  if (!selection) return null;
  const style = {
    position: 'fixed',
    top: Math.max(8, selection.rect.top - 46) + 'px',
    left: (selection.rect.left + selection.rect.width / 2) + 'px',
    transform: 'translateX(-50%)',
  };
  return (
    <div className="sel-toolbar" style={style} onMouseDown={(e) => e.preventDefault()}>
      <button onClick={() => onAction('ask')}>{window.I.sparkle} Ask AnA</button>
      <span className="sep"/>
      <button onClick={() => onAction('precedent')}>{window.I.shield} Find precedent</button>
      <span className="sep"/>
      <button onClick={() => onAction('tighten')}>Tighten</button>
      <span className="sep"/>
      <button onClick={() => onAction('flag')}>Flag</button>
    </div>
  );
}

Object.assign(window, { ArtifactDoc, SelectionToolbar, confClass });

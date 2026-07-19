/**
 * Document Authoring -- kit app/Project2.jsx `DocAuthoring` ported.
 *
 * Registry id: `document-authoring` (full: true)
 *
 * Full-bleed 3-pane editor: document tree (left), editable canvas (center),
 * comments rail (right). Confidence gutters, provenance rows, streaming
 * generation, and per-block flags.
 */
import React, { useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { SampleTag, useLive } from '../dataConnect';
import type { DocBlock, DocProgram, DocTreeVolume, DocComment } from '../fixtures/project2-data';
import {
  DOC_PROGRAM,
  DOC_TREE,
  DOC_BLOCKS_INIT,
  DOC_COMMENTS,
  DRAFT_TEXT,
  STATUS_TONE,
} from '../fixtures/project2-data';
import '../styles/project-home-v2.css';

/* ── Inline helpers ── */

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`rd-chip tone-${tone}`}>{children}</span>;
}

/* ════ Document Authoring surface ════ */

export function DocumentAuthoring({ onAsk }: SurfaceViewProps) {
  const [active, setActive] = useState('m25');
  const [showComments, setShowComments] = useState(false);
  const band = (c: number) => (c >= 0.9 ? 'hi' : c >= 0.75 ? 'med' : 'lo');

  const [blocks, setBlocks] = useState<DocBlock[]>(DOC_BLOCKS_INIT);
  const [stream, setStream] = useState('');
  const [busy, setBusy] = useState(false);

  // Live authoring workspace — GET /api/document-authoring/workspace → { success,
  // data: { program, tree, blocks, comments, activeDocumentId, meta } }. useLive
  // puts the whole body on `.data`, so the workspace is at `.data.data`. program,
  // tree, and comments fail closed to their project2-data fixtures. The center
  // canvas blocks stay the DOC_BLOCKS_INIT fixture ALWAYS — the backend returns
  // [] because no governed per-block confidence/provenance store exists for eCTD
  // content (fabricating it is forbidden), so the canvas is always shown sample.
  const ws = useLive<{
    data?: { program?: DocProgram; tree?: DocTreeVolume[]; comments?: DocComment[] };
  }>('/api/document-authoring/workspace', {
    data: { program: DOC_PROGRAM, tree: DOC_TREE, comments: DOC_COMMENTS },
  });
  const wsData = ws.data?.data;
  const treeLive =
    !ws.sample &&
    Array.isArray(wsData?.tree) &&
    wsData!.tree!.length > 0 &&
    typeof wsData!.tree![0]?.vol === 'string';
  const tree: DocTreeVolume[] = treeLive ? wsData!.tree! : DOC_TREE;
  const prog: DocProgram = !ws.sample && wsData?.program ? wsData.program : DOC_PROGRAM;
  const commentsLive = !ws.sample && Array.isArray(wsData?.comments);
  const comments: DocComment[] = commentsLive ? wsData!.comments! : DOC_COMMENTS;
  const treeSample = !treeLive;
  const commentsSample = !commentsLive;

  const generate = () => {
    if (busy) return;
    setBusy(true);
    setStream('');
    let i = 0;
    const tick = () => {
      i = Math.min(DRAFT_TEXT.length, i + 3);
      setStream(DRAFT_TEXT.slice(0, i));
      if (i < DRAFT_TEXT.length) {
        setTimeout(tick, 16);
      } else {
        setTimeout(() => {
          setBlocks((b) => [
            ...b,
            {
              id: 'g' + Date.now(),
              kind: 'p',
              conf: 0.86,
              spans: [{ t: DRAFT_TEXT }],
              prov: {
                source: 'Drafted by AnA from §2.5.1–§2.5.5 + linked evidence',
                model: 'Maximum',
                audit: 'AUD-' + (Math.floor(Math.random() * 9000) + 1000),
              },
            },
          ]);
          setStream('');
          setBusy(false);
        }, 250);
      }
    };
    tick();
  };

  return (
    <div className="ed" data-comments={showComments || undefined}>
      <aside className="ed-tree">
        <div className="ed-tree-h">
          <div className="ed-tree-t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Document tree<SampleTag sample={treeSample} /></div>
          <div className="ed-tree-m">{prog.readiness != null ? prog.readiness + '% ready' : 'Readiness pending'}{prog.due ? ' · ' + prog.due.replace('FDA filing · ', '') : ''}</div>
        </div>
        <div className="ed-tree-scroll">
          {tree.map((v) => (
            <div key={v.vol} className="ed-vol">
              <div className="ed-vol-l">{v.vol}</div>
              {v.items.map((s) => (
                <button
                  key={s.id}
                  className="ed-tree-row"
                  data-active={active === s.id || undefined}
                  data-blocker={s.blocker || undefined}
                  onClick={() => setActive(s.id)}
                >
                  <span className="ed-num">{s.num}</span>
                  <span className="ed-lbl">{s.label}</span>
                  <span className="ed-dot" data-s={s.status} />
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <section className="ed-doc">
        <header className="ed-doc-h">
          <div className="ed-crumbs">
            <span>{prog.code}</span>
            <span className="sep">›</span>
            <span className="here">{prog.section}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn ghost" style={{ height: 30 }} onClick={() => setShowComments(!showComments)}>
              {I.checkCircle} Comments {comments.length}
            </button>
            <button className="btn primary" style={{ height: 30 }} onClick={generate} disabled={busy}>
              {I.sparkles} {busy ? 'Generating...' : 'Draft with AnA'}
            </button>
            <button className="btn ghost" style={{ height: 30 }}>{I.lock} Lock</button>
          </div>
        </header>

        <div className="ed-doc-scroll">
          <div className="ed-doc-inner">
            <div className="ed-mast">
              <div className="ed-mast-num">§2.5</div>
              <h1 className="ed-mast-t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Clinical overview<SampleTag sample /></h1>
              <div className="ed-mast-meta">{prog.title ?? 'Untitled'} · sample drafted content</div>
            </div>

            {blocks.map((b) =>
              b.kind === 'h2' ? (
                <h2 key={b.id} className="ed-h2">{b.text}</h2>
              ) : (
                <div key={b.id} className="ed-block" data-conf={band(b.conf!)}>
                  <span className="ed-gutter" />
                  <p className="ed-p">
                    {b.spans!.map((s, i) =>
                      s.cite ? (
                        <a key={i} className="ed-cite" onClick={(e) => e.preventDefault()}>{s.cite}</a>
                      ) : (
                        <React.Fragment key={i}>{s.t}</React.Fragment>
                      )
                    )}
                  </p>
                  {b.flag && (
                    <div className="ed-flag" data-sev={b.flag.sev}>
                      <span className="ico">{I.alertTriangle}</span>
                      <span>{b.flag.msg}</span>
                    </div>
                  )}
                  <span className="ed-prov">
                    <span className="ed-prov-r"><span className="k">Source</span><span className="v">{b.prov!.source}</span></span>
                    <span className="ed-prov-r"><span className="k">Model</span><span className="v">{b.prov!.model}</span></span>
                    <span className="ed-prov-r"><span className="k">Confidence</span><span className="v">{b.conf!.toFixed(2)}</span></span>
                    <span className="ed-prov-r"><span className="k">Audit</span><span className="v">{b.prov!.audit}</span></span>
                  </span>
                </div>
              )
            )}

            {stream && (
              <div className="ed-block" data-conf="med">
                <span className="ed-gutter" />
                <p className="ed-p">{stream}<span className="ed-caret" /></p>
                <span className="ed-genlbl">* AnA is drafting from the section evidence...</span>
              </div>
            )}

            <div className="ed-foot">
              <button className="btn primary" onClick={generate} disabled={busy}>
                {I.sparkles} {busy ? 'Generating...' : 'Draft next section'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {showComments && (
        <aside className="ed-comments">
          <div className="ed-comments-h" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Comments<SampleTag sample={commentsSample} /></div>
          {comments.map((c) => (
            <div key={c.id} className="cmt" data-ai={c.ai || undefined}>
              <div className="cmt-meta">
                <span className="cmt-av">{c.ai ? '*' : c.author.split(' ').map((x) => x[0]).join('')}</span>
                <b>{c.author}</b>
                <span className="cmt-role">{c.role}</span>
                <span className="cmt-when">· {c.when}</span>
              </div>
              <div className="cmt-body">{c.body}</div>
              {c.ai && (
                <div className="cmt-actions">
                  <button className="btn primary" style={{ height: 26 }}>Apply</button>
                  <button className="btn ghost" style={{ height: 26 }}>Dismiss</button>
                </div>
              )}
            </div>
          ))}
        </aside>
      )}
    </div>
  );
}

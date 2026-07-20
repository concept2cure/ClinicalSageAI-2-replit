/**
 * Document Authoring -- kit app/Project2.jsx `DocAuthoring` ported.
 *
 * Registry id: `document-authoring` (full: true)
 *
 * Full-bleed 3-pane editor: document tree (left), editable canvas (center),
 * comments rail (right).
 *
 * Data: program / tree / comments come from the real workspace read-model
 * (GET /api/document-authoring/workspace), fixture-fallback with an honest
 * SampleTag. Drafting goes to the LIVE AnA (onAsk → /api/ana-ri/stream), which
 * produces a governed, immutably-versioned, audited artifact — no fabricated
 * content and no Math.random() audit id. The center canvas renders real
 * governed blocks; a canvas-shaped block+confidence read-model (joining the
 * persisted source_citations/concept2cure_artifacts provenance) is the tracked
 * follow-up, so until it lands the canvas shows an honest "draft this section"
 * state rather than a fixture.
 */
import React, { useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { SampleTag, useLive } from '../dataConnect';
import type { DocBlock, DocProgram, DocTreeVolume, DocComment } from '../fixtures/project2-data';
import { DOC_PROGRAM, DOC_TREE, DOC_COMMENTS } from '../fixtures/project2-data';
import '../styles/project-home-v2.css';

/* ════ Document Authoring surface ════ */

export function DocumentAuthoring({ onAsk }: SurfaceViewProps) {
  const ask = (q: string) => onAsk && onAsk(q);
  const [active, setActive] = useState('m25');
  const [showComments, setShowComments] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const band = (c: number) => (c >= 0.9 ? 'hi' : c >= 0.75 ? 'med' : 'lo');

  // Live authoring workspace — GET /api/document-authoring/workspace → { success,
  // data: { program, tree, blocks, comments, activeDocumentId, meta } }. useLive
  // puts the whole body on `.data`, so the workspace is at `.data.data`. program,
  // tree, and comments fail closed to their project2-data fixtures. The center
  // canvas blocks come back [] by design (no governed per-block confidence/
  // provenance READ model exists yet — that data is persisted but not read back
  // in block shape), so the canvas shows an honest state, never a fixture.
  const ws = useLive<{
    data?: { program?: DocProgram; tree?: DocTreeVolume[]; comments?: DocComment[]; blocks?: DocBlock[] };
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
  const comments: DocComment[] = (commentsLive ? wsData!.comments! : DOC_COMMENTS).filter(
    (c) => !dismissed.includes(c.id),
  );
  const treeSample = !treeLive;
  const commentsSample = !commentsLive;

  // Real governed blocks for the active section, when the read-model returns
  // them. Empty today (see note above) → honest "draft this section" canvas.
  const blocks: DocBlock[] = Array.isArray(wsData?.blocks) && !ws.sample ? wsData!.blocks! : [];

  // Draft with the LIVE AnA. onAsk streams a real grounded draft from
  // /api/ana-ri/stream and the server persists it as a governed, versioned,
  // audited concept2cure artifact — nothing is fabricated into the page.
  const draft = () =>
    ask(
      `Draft ${prog.section || 'this section'} for ${prog.code || 'this program'} from the linked evidence and the approved prior sections — every claim provenance-linked to its governed source.`,
    );

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
            <button className="btn primary" style={{ height: 30 }} onClick={draft}>
              {I.sparkles} Draft with AnA
            </button>
            <button className="btn ghost" style={{ height: 30 }} onClick={() => ask(`Lock ${prog.section} for ${prog.code} — record the e-signature and freeze the approved version.`)}>{I.lock} Lock</button>
          </div>
        </header>

        <div className="ed-doc-scroll">
          <div className="ed-doc-inner">
            <div className="ed-mast">
              <div className="ed-mast-num">§2.5</div>
              <h1 className="ed-mast-t">Clinical overview</h1>
              <div className="ed-mast-meta">{prog.title ?? 'Untitled'}</div>
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

            {blocks.length === 0 && (
              <div className="ed-empty" style={{ padding: '28px 4px', color: 'var(--text-400)' }}>
                <p className="ed-p" style={{ marginBottom: 14 }}>
                  No governed drafted content is loaded for this section yet. Draft it with AnA — every draft is
                  produced from the linked evidence and persisted as an immutable, 21 CFR Part 11-audited version.
                  Nothing here is simulated.
                </p>
              </div>
            )}

            <div className="ed-foot">
              <button className="btn primary" onClick={draft}>
                {I.sparkles} Draft {blocks.length === 0 ? 'this' : 'the next'} section with AnA
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
                  <button className="btn primary" style={{ height: 26 }} onClick={() => ask(`Apply this suggestion to ${prog.section}: ${c.body}`)}>Apply</button>
                  <button className="btn ghost" style={{ height: 26 }} onClick={() => setDismissed((d) => [...d, c.id])}>Dismiss</button>
                </div>
              )}
            </div>
          ))}
        </aside>
      )}
    </div>
  );
}

/**
 * Document Authoring -- kit app/Project2.jsx `DocAuthoring` ported.
 *
 * Registry id: `document-authoring` (full: true, hideAna: true)
 *
 * Full-bleed 3-pane editor: document tree (left), content canvas (center),
 * comments rail (right).
 *
 * Real-data standard (regulated GA product): the three panes that CAN be
 * sourced honestly — the program header, the document tree, and the active
 * document's review comments — render live, org-scoped data from
 * GET /api/document-authoring/workspace, which the server derives from the
 * governed `documents` / `projects` / `document_comments` tables (drizzle).
 * The center canvas renders per-block CONFIDENCE / PROVENANCE / audit-id /
 * citation content for which NO governed store exists — the backend returns
 * `blocks: []` and explains why in `meta.blocksReason`. Fabricating those
 * numbers on regulatory content is exactly what the honesty rule forbids, so
 * the canvas shows an honest empty state, never the old project2-data fixture.
 * Loading and a failed load are surfaced honestly too.
 */
import React, { useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { useLiveData, EmptyState } from '../dataConnect';
import '../styles/project-home-v2.css';

/* ── Live display shapes (mirror the server read-model in
   server/routes/document-authoring-workspace.routes.ts). Every program field is
   nullable — the backend returns null rather than fabricating a value when the
   source row is absent — and every field is rendered null-safe below. ── */

interface DocProgramView {
  title: string | null;
  code: string | null;
  section: string | null;
  readiness: number | null;
  due: string | null;
}

interface DocTreeItemView {
  id: string;
  num: string;
  label: string;
  status: string; // surface vocab: complete | review | draft
  active?: boolean;
}

interface DocTreeVolumeView {
  vol: string;
  items: DocTreeItemView[];
}

interface DocCommentView {
  id: string;
  block: string;
  author: string;
  role: string;
  when: string;
  // The backend has no AI-authorship marker on document_comments and never
  // guesses one, so this is always false today; kept as a real column.
  ai: boolean;
  body: string;
}

interface DocWorkspaceView {
  program: DocProgramView;
  tree: DocTreeVolumeView[];
  // No governed per-block confidence/provenance/citation store exists; the
  // backend returns []. Never rendered from a fixture (see canvas below).
  blocks: unknown[];
  comments: DocCommentView[];
  activeDocumentId: string | null;
}

/* ════ Document Authoring surface ════ */

export function DocumentAuthoring({ onAsk }: SurfaceViewProps) {
  const [activeSel, setActiveSel] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);

  // Live authoring workspace — GET /api/document-authoring/workspace →
  // { success, data: { program, tree, blocks, comments, activeDocumentId } }.
  // useLiveData unwraps the { data } envelope, so `ws.data` is the workspace
  // object directly (not `.data.data`): real data, an honest empty, or an
  // honest failed load — never a fixture.
  const ws = useLiveData<DocWorkspaceView>('/api/document-authoring/workspace');

  if (ws.loading) {
    return (
      <div style={{ padding: '48px 24px' }}>
        <div className="scaf-note">Loading the authoring workspace…</div>
      </div>
    );
  }
  if (ws.error || !ws.data) {
    return (
      <div style={{ padding: '48px 24px' }}>
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the authoring workspace"
          hint="The document-authoring workspace didn't respond. It's derived from your organization's governed documents, sections, and review comments — sign in and retry, or check the service is reachable."
        />
      </div>
    );
  }

  const data = ws.data;
  const { program: prog, tree, comments } = data;
  const active = activeSel ?? data.activeDocumentId;
  const draftPrompt = 'Draft ' + (prog.section ?? 'this section') + ' from the linked section evidence.';

  return (
    <div className="ed" data-comments={showComments || undefined}>
      <aside className="ed-tree">
        <div className="ed-tree-h">
          <div className="ed-tree-t">Document tree</div>
          <div className="ed-tree-m">
            {prog.readiness != null ? prog.readiness + '% ready' : 'Readiness pending'}
            {prog.due ? ' · ' + prog.due : ''}
          </div>
        </div>
        <div className="ed-tree-scroll">
          {tree.length === 0 ? (
            <EmptyState
              icon={I.fileText}
              title="No documents yet"
              hint="Documents authored for this organization appear here, grouped into CTD-module volumes."
            />
          ) : (
            tree.map((v) => (
              <div key={v.vol} className="ed-vol">
                <div className="ed-vol-l">{v.vol}</div>
                {v.items.map((s) => (
                  <button
                    key={s.id}
                    className="ed-tree-row"
                    data-active={active === s.id || undefined}
                    onClick={() => setActiveSel(s.id)}
                  >
                    <span className="ed-num">{s.num}</span>
                    <span className="ed-lbl">{s.label}</span>
                    <span className="ed-dot" data-s={s.status} />
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="ed-doc">
        <header className="ed-doc-h">
          <div className="ed-crumbs">
            <span>{prog.code ?? 'eCTD'}</span>
            <span className="sep">›</span>
            <span className="here">{prog.section ?? 'Untitled section'}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn ghost" style={{ height: 30 }} onClick={() => setShowComments(!showComments)}>
              {I.checkCircle} Comments {comments.length}
            </button>
            {/* Hands off to the real assistant (onAsk) — the former button ran a
                setTimeout fake-stream that injected a fabricated block with a
                Math.random() audit id and a hardcoded confidence. */}
            <button className="btn primary" style={{ height: 30 }} onClick={() => onAsk(draftPrompt)}>
              {I.sparkles} Draft with AnA
            </button>
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={() => onAsk('Lock ' + (prog.section ?? 'this section') + ' for review')}
            >
              {I.lock} Lock
            </button>
          </div>
        </header>

        <div className="ed-doc-scroll">
          <div className="ed-doc-inner">
            <div className="ed-mast">
              <div className="ed-mast-num">{prog.code ?? 'eCTD'}</div>
              <h1 className="ed-mast-t">{prog.section ?? 'Untitled section'}</h1>
              <div className="ed-mast-meta">{prog.title ?? 'Untitled'}</div>
            </div>

            {/* Center canvas content — no governed per-block confidence /
                provenance / citation store exists (the workspace route returns
                blocks: [] with meta.blocksReason). Honest empty, never the old
                DOC_BLOCKS_INIT fixture: fabricating audit ids or confidence on
                regulatory content is forbidden. */}
            <EmptyState
              icon={I.fileText}
              title="No governed section content yet"
              hint="AnA-drafted section content with per-paragraph confidence, provenance, and citation flags isn't kept in a governed store yet, so nothing is shown here rather than fabricated. Use the Draft with AnA action to draft this section with the assistant."
            />
          </div>
        </div>
      </section>

      {showComments && (
        <aside className="ed-comments">
          <div className="ed-comments-h">Comments</div>
          {comments.length === 0 ? (
            <EmptyState
              icon={I.checkCircle}
              title="No comments yet"
              hint="Review comments on the active document appear here."
            />
          ) : (
            comments.map((c) => (
              <div key={c.id} className="cmt" data-ai={c.ai || undefined}>
                <div className="cmt-meta">
                  <span className="cmt-av">{c.ai ? '*' : c.author.split(' ').map((x) => x[0]).join('')}</span>
                  <b>{c.author}</b>
                  <span className="cmt-role">{c.role}</span>
                  <span className="cmt-when">· {c.when}</span>
                </div>
                <div className="cmt-body">{c.body}</div>
              </div>
            ))
          )}
        </aside>
      )}
    </div>
  );
}

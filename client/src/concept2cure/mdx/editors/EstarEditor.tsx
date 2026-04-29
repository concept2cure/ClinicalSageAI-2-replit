/**
 * 510(k) module editor — Cursor-style 3-pane workbench.
 * Left: section tree. Center: document. Right: Claude rail.
 *
 * Ported verbatim from design-system/ui_kits/mdx/EstarEditor.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import { ANA_MODES, type AnaMode } from '../data/nav';
import {
  EDITOR_COMMENTS,
  EDITOR_CONTENT_11,
  EDITOR_PROGRAM,
  EDITOR_QUICK,
  EDITOR_SECTIONS,
  EDITOR_SEED_MESSAGES,
  EDITOR_VALIDATION_11,
  type EditorBlock,
  type EditorBlockParagraph,
  type EditorBlockTable,
  type EditorComment,
  type EditorContent,
  type EditorMessage,
  type EditorValidation,
} from '../data/editor';

// ─── Helpers ─────────────────────────────────────────────────────────────

function confBand(c: number): 'hi' | 'med' | 'lo' {
  if (c >= 0.9) return 'hi';
  if (c >= 0.75) return 'med';
  return 'lo';
}

function StatusDot({ s }: { s: string }) {
  return <span className="ed-dot" data-s={s} aria-label={s} title={s} />;
}

// ─── Sections tree ───────────────────────────────────────────────────────

interface EditorTreeProps {
  activeId: number;
  onPick: (id: number) => void;
  search: string;
  setSearch: (q: string) => void;
}

function EditorTree({ activeId, onPick, search, setSearch }: EditorTreeProps) {
  const q = search.trim().toLowerCase();
  const filtered = q
    ? EDITOR_SECTIONS.map(v => ({
        ...v,
        items: v.items.filter(
          s => s.label.toLowerCase().includes(q) || s.num.toLowerCase().includes(q),
        ),
      })).filter(v => v.items.length > 0)
    : EDITOR_SECTIONS;

  const stats = React.useMemo(() => {
    const all = EDITOR_SECTIONS.flatMap(v => v.items);
    return {
      total:    all.filter(s => s.status !== 'na').length,
      complete: all.filter(s => s.status === 'complete').length,
      blocker:  all.filter(s => s.blocker).length,
    };
  }, []);

  return (
    <aside className="ed-tree" aria-label="Section navigator">
      <div className="ed-tree-head">
        <div className="ed-tree-title">eSTAR sections</div>
        <div className="ed-tree-meta">
          {stats.complete} of {stats.total} complete
          {stats.blocker > 0 && <span className="ed-tree-block"> · {stats.blocker} blocker</span>}
        </div>
      </div>

      <div className="ed-tree-search">
        <span className="ico">{I.search}</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter sections"
          aria-label="Filter sections"
        />
      </div>

      <div className="ed-tree-scroll">
        {filtered.map(vol => (
          <div key={vol.volume} className="ed-tree-volume">
            <div className="ed-tree-vlabel">{vol.volume}</div>
            {vol.items.map(s => (
              <button
                key={s.id}
                className="ed-tree-row"
                data-active={s.id === activeId || undefined}
                data-blocker={s.blocker || undefined}
                onClick={() => onPick(s.id)}
              >
                <span className="ed-tree-num">{s.num}</span>
                <span className="ed-tree-label">{s.label}</span>
                {s.blocker && (
                  <span className="ed-tree-flag" title="Blocker">
                    {I.alertCircle}
                  </span>
                )}
                <StatusDot s={s.status} />
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="ed-tree-foot">
        <div className="ed-tree-foot-prog">
          <div className="ed-tree-foot-bar">
            <div
              className="ed-tree-foot-fill"
              style={{ width: `${(stats.complete / stats.total) * 100}%` }}
            />
          </div>
          <div className="ed-tree-foot-lbl">
            <span>{Math.round((stats.complete / stats.total) * 100)}%</span>
            <span>·</span>
            <span>filing in {EDITOR_PROGRAM.dueLabel.replace('FDA filing · ', '')}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Validation popover ──────────────────────────────────────────────────

function ValidationPopover({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: EditorValidation[];
}) {
  if (!open) return null;
  const errs = items.filter(v => v.severity === 'err').length;
  const warns = items.filter(v => v.severity === 'warn').length;
  return (
    <div className="ed-val-pop" role="dialog" aria-label="Validation">
      <div className="ed-val-head">
        <div className="ed-val-title">
          Validation — §{EDITOR_CONTENT_11.num.replace('§', '')}
        </div>
        <button className="ed-close" onClick={onClose} aria-label="Close">
          {I.close}
        </button>
      </div>
      <div className="ed-val-summary">
        <span className="ed-val-chip err">{errs} blocker</span>
        <span className="ed-val-chip warn">{warns} issue</span>
        <span className="ed-val-chip ok">
          {items.filter(v => v.severity === 'ok').length} pass
        </span>
      </div>
      <div className="ed-val-list">
        {items.map(v => (
          <div key={v.id} className="ed-val-row" data-sev={v.severity}>
            <span className="ed-val-rule">{v.rule}</span>
            <span className="ed-val-msg">{v.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Document blocks ─────────────────────────────────────────────────────

function ProvenanceTip({ block }: { block: EditorBlockParagraph | EditorBlockTable }) {
  if (!block.prov) return null;
  return (
    <span className="ed-prov" role="tooltip">
      <span className="ed-prov-row">
        <span className="ed-prov-lbl">Source</span>
        <span className="ed-prov-val">{block.prov.source}</span>
      </span>
      <span className="ed-prov-row">
        <span className="ed-prov-lbl">Model</span>
        <span className="ed-prov-val">{block.prov.model}</span>
      </span>
      {block.confidence != null && (
        <span className="ed-prov-row">
          <span className="ed-prov-lbl">Confidence</span>
          <span className="ed-prov-val">{block.confidence.toFixed(2)}</span>
        </span>
      )}
      <span className="ed-prov-row">
        <span className="ed-prov-lbl">Audit</span>
        <span className="ed-prov-val">{block.prov.audit}</span>
      </span>
      <span className="ed-prov-foot">{block.prov.foot}</span>
    </span>
  );
}

function Flags({ flags }: { flags: EditorBlockParagraph['flags'] }) {
  if (!flags || !flags.length) return null;
  return (
    <div className="ed-flags">
      {flags.map((f, i) => (
        <div key={i} className="ed-flag" data-sev={f.severity}>
          <span className="ed-flag-ico">{I.alertCircle}</span>
          <span className="ed-flag-rule">{f.kind}</span>
          <span className="ed-flag-msg">{f.msg}</span>
        </div>
      ))}
    </div>
  );
}

interface BlockParagraphProps {
  block: EditorBlockParagraph;
  comments: EditorComment[];
  onPinComment: (c: EditorComment) => void;
  activePin: string | null;
  setActivePin: (id: string | null) => void;
}

function BlockParagraph({
  block,
  comments,
  onPinComment,
  activePin,
  setActivePin,
}: BlockParagraphProps) {
  const cBand = confBand(block.confidence);
  const pinned = comments.filter(c => c.blockId === block.id && !c.resolved);
  return (
    <div
      className="ed-block"
      data-kind="p"
      data-conf={cBand}
      data-active={activePin === block.id || undefined}
      onMouseEnter={() => setActivePin(block.id)}
      onMouseLeave={() => setActivePin(null)}
    >
      <span className="ed-gutter" aria-hidden="true" />
      <p className="ed-p">
        {block.spans.map((s, i) =>
          s.cite ? (
            <a key={i} className="ed-cite" href="#" onClick={e => e.preventDefault()}>
              {s.cite}
            </a>
          ) : (
            <React.Fragment key={i}>{s.t}</React.Fragment>
          ),
        )}
      </p>
      <Flags flags={block.flags} />
      {pinned.length > 0 && (
        <button
          className="ed-pin"
          onClick={() => onPinComment(pinned[0])}
          title={`${pinned.length} comment${pinned.length > 1 ? 's' : ''}`}
        >
          <span className="ed-pin-ico">{I.chat}</span>
          <span className="ed-pin-n">{pinned.length}</span>
        </button>
      )}
      <ProvenanceTip block={block} />
    </div>
  );
}

function BlockTable({ block }: { block: EditorBlockTable }) {
  return (
    <div className="ed-block" data-kind="table" data-conf={confBand(block.confidence)}>
      <span className="ed-gutter" aria-hidden="true" />
      <table className="ed-table">
        <thead>
          <tr>
            {block.headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => {
                if (j === r.length - 1) {
                  return (
                    <td key={j}>
                      <span className={`ed-verdict ${c}`}>{c}</span>
                    </td>
                  );
                }
                return <td key={j}>{c}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ProvenanceTip block={block} />
    </div>
  );
}

// ─── Document pane ───────────────────────────────────────────────────────

interface DocumentPaneProps {
  content: EditorContent;
  comments: EditorComment[];
  onPinComment: (c: EditorComment) => void;
  activePin: string | null;
  setActivePin: (id: string | null) => void;
  onAsk: (text: string, opts?: { tool?: string }) => void;
  validation: EditorValidation[];
  valOpen: boolean;
  setValOpen: (v: boolean) => void;
}

function DocumentPane({
  content,
  comments,
  onPinComment,
  activePin,
  setActivePin,
  onAsk,
  validation,
  valOpen,
  setValOpen,
}: DocumentPaneProps) {
  const errs = validation.filter(v => v.severity === 'err').length;
  const warns = validation.filter(v => v.severity === 'warn').length;
  const valTone = errs > 0 ? 'err' : warns > 0 ? 'warn' : 'ok';

  return (
    <section className="ed-doc" aria-label="Document editor">
      <header className="ed-doc-head">
        <div className="ed-doc-crumbs">
          <span>{EDITOR_PROGRAM.code}</span>
          <span className="sep">{I.right}</span>
          <span>{EDITOR_PROGRAM.title}</span>
          <span className="sep">{I.right}</span>
          <span className="here">
            {content.num} {content.label}
          </span>
        </div>
        <div className="ed-doc-actions">
          <button
            className="ed-val-badge"
            data-tone={valTone}
            onClick={() => setValOpen(!valOpen)}
            title="Validation"
          >
            <span className="ico">{I.shieldCheck}</span>
            {errs > 0 && <span className="n">{errs} blocker</span>}
            {errs === 0 && warns > 0 && <span className="n">{warns} issue</span>}
            {errs === 0 && warns === 0 && <span className="n">Valid</span>}
          </button>
          <button className="ed-btn ghost" title="History">
            {I.clock}
          </button>
          <button className="ed-btn ghost" title="Comments">
            {I.chat}
          </button>
          <button className="ed-btn primary">Lock section</button>
          <ValidationPopover open={valOpen} onClose={() => setValOpen(false)} items={validation} />
        </div>
      </header>

      <div className="ed-doc-scroll">
        <div className="ed-doc-inner">
          <div className="ed-masthead">
            <div className="ed-masthead-num">{content.num}</div>
            <h1 className="ed-masthead-title">{content.label}</h1>
            <div className="ed-masthead-grid">
              {content.masthead.map((m, i) => (
                <div key={i}>
                  <div className="ed-masthead-lbl">{m.lbl}</div>
                  <div className="ed-masthead-val">{m.val}</div>
                </div>
              ))}
            </div>
          </div>

          {content.blocks.map((b: EditorBlock) => {
            if (b.kind === 'h2') return <h2 key={b.id} className="ed-h2">{b.text}</h2>;
            if (b.kind === 'table') return <BlockTable key={b.id} block={b} />;
            return (
              <BlockParagraph
                key={b.id}
                block={b}
                comments={comments}
                onPinComment={onPinComment}
                activePin={activePin}
                setActivePin={setActivePin}
              />
            );
          })}

          <div className="ed-doc-foot">
            <div className="ed-doc-foot-stats">
              <span>{content.blocks.filter(b => b.kind === 'p').length} paragraphs</span>
              <span>·</span>
              <span>
                {EDITOR_SECTIONS.find(v => v.items.some(s => s.id === 11))!
                  .items.find(s => s.id === 11)!
                  .words.toLocaleString()}{' '}
                words
              </span>
              <span>·</span>
              <span>auto-saved 30s ago</span>
            </div>
            <button
              className="ed-btn subtle"
              onClick={() => onAsk('Keep drafting from the conclusion')}
            >
              <span className="ico">{I.sparkles}</span>
              Continue with Claude
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Claude rail ─────────────────────────────────────────────────────────

interface ClaudeRailProps {
  mode: AnaMode['id'];
  setMode: (m: AnaMode['id']) => void;
  messages: EditorMessage[];
  comments: EditorComment[];
  onResolveComment: (id: string) => void;
  onApplySuggest: (c: EditorComment) => void;
  pinnedComment: EditorComment | null;
  setPinnedComment: (c: EditorComment | null) => void;
  onAsk: (text: string, opts?: { tool?: string }) => void;
}

function ClaudeRail({
  mode,
  setMode,
  messages,
  comments,
  onResolveComment,
  onApplySuggest,
  pinnedComment,
  setPinnedComment,
  onAsk,
}: ClaudeRailProps) {
  const [input, setInput] = React.useState('');
  const [tab, setTab] = React.useState<'chat' | 'comments'>(pinnedComment ? 'comments' : 'chat');
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (pinnedComment) setTab('comments');
  }, [pinnedComment]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, tab]);

  const send = () => {
    if (!input.trim()) return;
    onAsk(input.trim());
    setInput('');
  };

  const activeMode = ANA_MODES.find(m => m.id === mode)!;

  return (
    <aside className="ed-claude" aria-label="Claude">
      <div className="ed-claude-head">
        <div className="ed-claude-tabs">
          <button className="ed-claude-tab" data-on={tab === 'chat'} onClick={() => setTab('chat')}>
            Chat
          </button>
          <button
            className="ed-claude-tab"
            data-on={tab === 'comments'}
            onClick={() => setTab('comments')}
          >
            Comments
            {comments.filter(c => !c.resolved).length > 0 && (
              <span className="ed-claude-tab-n">
                {comments.filter(c => !c.resolved).length}
              </span>
            )}
          </button>
        </div>
        <select
          className="ed-mode"
          value={mode}
          onChange={e => setMode(e.target.value as AnaMode['id'])}
          title="Claude model"
        >
          {ANA_MODES.map(m => (
            <option key={m.id} value={m.id}>
              {m.model}
            </option>
          ))}
        </select>
      </div>

      {tab === 'chat' && (
        <>
          <div className="ed-claude-scroll" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className="ed-msg" data-role={m.role}>
                {m.role === 'ana' && (
                  <div className="ed-msg-meta">
                    <span className="ed-msg-avatar" aria-hidden="true">
                      {I.sparkles}
                    </span>
                    <span className="ed-msg-who">Claude</span>
                    {m.mode && (
                      <span className="ed-msg-model">
                        · {ANA_MODES.find(x => x.id === m.mode)?.model || m.mode}
                      </span>
                    )}
                    <span className="ed-msg-when">{m.when}</span>
                  </div>
                )}
                <div className="ed-msg-body">{m.body}</div>
              </div>
            ))}
          </div>

          <div className="ed-claude-quick">
            {EDITOR_QUICK.map(q => (
              <button key={q.id} className="ed-quick" onClick={() => onAsk(q.label, { tool: q.tool })}>
                {q.label}
              </button>
            ))}
          </div>

          <div className="ed-claude-input">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={`Ask Claude about §11 in ${activeMode.label}…`}
              rows={2}
            />
            <div className="ed-claude-input-foot">
              <span className="ed-claude-input-hint">
                {activeMode.model} · {activeMode.desc}
              </span>
              <button className="ed-send" onClick={send} title="Send" aria-label="Send">
                {I.send}
              </button>
            </div>
          </div>
        </>
      )}

      {tab === 'comments' && (
        <div className="ed-claude-scroll">
          {comments.map(c => (
            <div
              key={c.id}
              className="ed-comment"
              data-ai={c.ai || undefined}
              data-resolved={c.resolved || undefined}
              data-pinned={pinnedComment?.id === c.id || undefined}
            >
              <div className="ed-comment-meta">
                <span className="ed-comment-author">
                  {c.ai && <span className="ed-comment-avatar ai">{I.sparkles}</span>}
                  {!c.ai && (
                    <span className="ed-comment-avatar">
                      {c.author
                        .split(' ')
                        .map(x => x[0])
                        .join('')
                        .slice(0, 2)}
                    </span>
                  )}
                  {c.author}
                </span>
                <span className="ed-comment-role">{c.role}</span>
                <span className="ed-comment-when">· {c.when}</span>
                <span className="ed-comment-block">
                  · on{' '}
                  <a
                    href="#"
                    onClick={e => {
                      e.preventDefault();
                      setPinnedComment(c);
                    }}
                  >
                    {c.blockId}
                  </a>
                </span>
              </div>
              <div className="ed-comment-body">{c.body}</div>
              {c.suggest && (
                <div className="ed-comment-suggest">
                  <div className="ed-comment-suggest-lbl">Suggested edit</div>
                  <div className="ed-comment-suggest-body">{c.suggest.text}</div>
                  <div className="ed-comment-suggest-actions">
                    <button className="ed-btn primary small" onClick={() => onApplySuggest(c)}>
                      Apply
                    </button>
                    <button className="ed-btn ghost small" onClick={() => onResolveComment(c.id)}>
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
              {!c.suggest && !c.resolved && (
                <div className="ed-comment-actions">
                  <button className="ed-btn ghost small" onClick={() => onResolveComment(c.id)}>
                    Resolve
                  </button>
                  <button className="ed-btn ghost small">Reply</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

// ─── Editor surface ──────────────────────────────────────────────────────

export interface EstarEditorProps {
  initialMode?: AnaMode['id'];
}

export function EstarEditor({ initialMode = 'deep-research' }: EstarEditorProps) {
  const [activeId, setActiveId] = React.useState(11);
  const [search, setSearch] = React.useState('');
  const [mode, setMode] = React.useState<AnaMode['id']>(initialMode);
  const [messages, setMessages] = React.useState<EditorMessage[]>(EDITOR_SEED_MESSAGES);
  const [comments, setComments] = React.useState<EditorComment[]>(EDITOR_COMMENTS);
  const [activePin, setActivePin] = React.useState<string | null>(null);
  const [pinnedComment, setPinnedComment] = React.useState<EditorComment | null>(null);
  const [valOpen, setValOpen] = React.useState(false);
  const [content, setContent] = React.useState<EditorContent>(EDITOR_CONTENT_11);

  const onAsk = (text: string, opts: { tool?: string } = {}) => {
    if (!text) return;
    const activeMode = ANA_MODES.find(m => m.id === mode)!;
    setMessages(ms => [
      ...ms,
      { role: 'user', body: text, when: 'just now', mode },
      {
        role: 'ana',
        body: opts.tool
          ? `Running \`${opts.tool}\` on §${content.num.replace('§', '')} in ${activeMode.label} mode…`
          : `Thinking in ${activeMode.label} mode. (UI stub — real response streams here via the gateway.)`,
        when: 'just now',
        mode,
      },
    ]);
  };

  const onResolveComment = (id: string) => {
    setComments(cs => cs.map(c => (c.id === id ? { ...c, resolved: true } : c)));
    setPinnedComment(p => (p?.id === id ? null : p));
  };

  const onApplySuggest = (comment: EditorComment) => {
    if (!comment.suggest) return;
    setContent(c => ({
      ...c,
      blocks: c.blocks.map(b =>
        b.id === comment.suggest!.blockId
          ? { ...b, kind: 'p' as const, spans: [{ t: comment.suggest!.text }], flags: null, confidence: 0.9, prov: (b as EditorBlockParagraph).prov }
          : b,
      ),
    }));
    onResolveComment(comment.id);
    setMessages(ms => [
      ...ms,
      {
        role: 'ana',
        mode,
        when: 'just now',
        body: `Applied rewrite to ${comment.suggest!.blockId}. Redline logged as AUD-8858 · biocompat flag cleared.`,
      },
    ]);
  };

  // activeId is currently pinned to 11 since this kit only ships §11 content.
  void activeId;

  return (
    <div className="ed-workbench" data-screen-label="MDX · 510(k) editor">
      <EditorTree
        activeId={activeId}
        onPick={setActiveId}
        search={search}
        setSearch={setSearch}
      />
      <DocumentPane
        content={content}
        comments={comments}
        onPinComment={setPinnedComment}
        activePin={activePin}
        setActivePin={setActivePin}
        onAsk={onAsk}
        validation={EDITOR_VALIDATION_11}
        valOpen={valOpen}
        setValOpen={setValOpen}
      />
      <ClaudeRail
        mode={mode}
        setMode={setMode}
        messages={messages}
        comments={comments}
        onResolveComment={onResolveComment}
        onApplySuggest={onApplySuggest}
        pinnedComment={pinnedComment}
        setPinnedComment={setPinnedComment}
        onAsk={onAsk}
      />
    </div>
  );
}

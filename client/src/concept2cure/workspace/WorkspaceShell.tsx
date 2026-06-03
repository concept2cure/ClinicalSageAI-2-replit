/**
 * WorkspaceShell — the AnA-conversation-first three-zone shell.
 *
 * Ported from `design-system/ui_kits/workspace/Shell.jsx`. Mirrors the kit's
 * NavRail · AnaPanel · WorkPane structure 1:1 (class names, layout, behavior),
 * with two adaptations required by the kit's own install brief
 * (`ui_kits/workspace/INSTALL_CLAUDE_CODE.md`):
 *
 *   1. The brief says "do not port this kit's Surfaces*.jsx" — the work pane
 *      mounts the existing live surface .tsx components (AnalyticsSurface,
 *      MemorySurface, PostmarketSurface) rather than the kit's mock JSX.
 *   2. The brief says "do not call any model API from the client" — the
 *      composer surfaces user messages locally; the model reply path is left
 *      open for a follow-up commit that wires it to the existing AnA gateway
 *      (server/routes/ana-*). No canned-reply mock ships.
 *
 * Mounted at /concept2cure/workspace (additive — does NOT replace the live
 * /concept2cure/mdx route in this commit). A follow-up commit can flip the
 * canonical MDX route to this shell once the deployed shell is verified.
 */

import * as React from 'react';
import { I } from '../mdx/icons';
import { AnalyticsSurface } from '../mdx/surfaces/AnalyticsSurface';
import { MemorySurface } from '../mdx/surfaces/MemorySurface';
import { PostmarketSurface } from '../mdx/surfaces/PostmarketSurface';
import {
  NAV_GROUPS,
  NAV_ITEMS,
  BUILT,
  SURFACE_META,
  ANA_MODES,
  SUGGESTIONS,
  ANA_CONTEXT,
} from './data';
import type { AnaMode } from '../mdx/data/nav';

/* ───────────────────────── 1 · NAV RAIL ───────────────────────── */

interface NavRailProps {
  active: string | null;
  onNavigate: (id: string) => void;
  collapsed: boolean;
  setCollapsed: (fn: (c: boolean) => boolean) => void;
  onHome: () => void;
}

function NavRail({ active, onNavigate, collapsed, setCollapsed, onHome }: NavRailProps) {
  return (
    <nav className="rail" aria-label="Primary navigation">
      <div className="rail-top">
        <button className="rail-logo" onClick={onHome} title="Home" type="button">
          <span className="rail-logo-text">
            Concept2Cure<span>.RI</span>
          </span>
        </button>
        <button
          className="rail-collapse"
          onClick={() => setCollapsed((c) => !c)}
          title="Toggle sidebar"
          type="button"
        >
          {I.panelLeft}
        </button>
      </div>

      <button className="rail-new" onClick={onHome} type="button">
        <span className="ico">{I.plus}</span>
        <span className="lbl">New conversation</span>
      </button>

      <div className="rail-scroll">
        {NAV_GROUPS.map((g) => {
          const items = NAV_ITEMS.filter((i) => i.group === g.id);
          if (!items.length) return null;
          return (
            <React.Fragment key={g.id}>
              {g.label && <div className="rail-section">{g.label}</div>}
              {items.map((it) => {
                const Icon = (I as Record<string, React.ReactNode>)[it.icon] ?? I.circle;
                return (
                  <button
                    key={it.id}
                    className="nav-item"
                    aria-current={active === it.id || undefined}
                    onClick={() => onNavigate(it.id)}
                    title={collapsed ? it.label : undefined}
                    type="button"
                  >
                    <span className="ico">{Icon}</span>
                    <span className="lbl">{it.label}</span>
                  </button>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>

      <button className="rail-account" title="Account" type="button">
        <span className="avatar">JC</span>
        <span className="who">
          <span className="name">Jordan Chen</span>
          <span className="plan">Enterprise · Reg Affairs</span>
        </span>
        <span className="chev">{I.down}</span>
      </button>
    </nav>
  );
}

/* ───────────────────────── Composer ───────────────────────── */

interface ComposerProps {
  onSend: (text: string) => void;
  mode: AnaMode['id'];
  setMode: (id: AnaMode['id']) => void;
  placeholder: string;
}

function Composer({ onSend, mode, setMode, placeholder }: ComposerProps) {
  const [draft, setDraft] = React.useState('');
  const [menu, setMenu] = React.useState(false);
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  const cur = ANA_MODES.find((m) => m.id === mode) ?? ANA_MODES[0];

  const grow = () => {
    const t = taRef.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 160) + 'px';
  };

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft('');
    requestAnimationFrame(() => {
      if (taRef.current) taRef.current.style.height = 'auto';
    });
  };

  return (
    <div className="composer" style={{ position: 'relative' }}>
      <textarea
        ref={taRef}
        rows={1}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          grow();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="composer-bar">
        <button className="composer-ico" title="Attach" type="button">{I.attach}</button>
        <button className="composer-ico" title="Tools" type="button">{I.tools}</button>
        <button
          className="composer-mode"
          onClick={() => setMenu((m) => !m)}
          title="Reasoning mode"
          type="button"
        >
          <span className="dot" />
          {cur.label}
          {I.down}
        </button>
        <span className="composer-spacer" />
        <button
          className="composer-send"
          disabled={!draft.trim()}
          onClick={send}
          title="Send"
          type="button"
        >
          {I.arrowUp}
        </button>
      </div>
      {menu && (
        <div className="mode-menu" onMouseLeave={() => setMenu(false)}>
          {ANA_MODES.map((m) => (
            <button
              key={m.id}
              className="mode-opt"
              data-on={mode === m.id || undefined}
              onClick={() => {
                setMode(m.id);
                setMenu(false);
              }}
              type="button"
            >
              <span className="l">
                {m.label}
                <span className="mdl">Claude {m.model}</span>
              </span>
              <span className="d">{m.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── 2 · AnA CONVERSATION ───────────────────────── */

interface AnaMessage {
  role: 'user' | 'ana';
  text: string;
}

interface AnaPanelProps {
  surface: string | null;
  messages: AnaMessage[];
  onSend: (text: string) => void;
  mode: AnaMode['id'];
  setMode: (id: AnaMode['id']) => void;
  onNewThread: () => void;
}

function AnaPanel({ surface, messages, onSend, mode, setMode, onNewThread }: AnaPanelProps) {
  const cur = ANA_MODES.find((m) => m.id === mode) ?? ANA_MODES[0];
  const threadRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const t = threadRef.current;
    if (t) t.scrollTop = t.scrollHeight;
  }, [messages.length]);

  const sugg = SUGGESTIONS[surface ?? 'home'] ?? SUGGESTIONS.home;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const isHome = !surface && messages.length === 0;
  const context = surface ? ANA_CONTEXT[surface] : null;

  return (
    <section className="ana" aria-label="AnA conversation">
      <div className="ana-top">
        <span className="ana-mark">✻</span>
        <div className="ana-id">
          <div className="name">AnA 1.0 RI</div>
          <div className="model">Claude {cur.model}</div>
        </div>
        <button className="ana-top-btn" title="History" type="button">{I.clock}</button>
        <button className="ana-top-btn" title="New thread" onClick={onNewThread} type="button">
          {I.plus}
        </button>
      </div>

      {isHome ? (
        <div className="ana-home">
          <div className="ana-home-inner">
            <div className="greet">
              <span className="star">✻</span> {greeting}, Jordan
            </div>
            <Composer
              onSend={onSend}
              mode={mode}
              setMode={setMode}
              placeholder="How can AnA help with your portfolio today?"
            />
            <div className="suggest-row">
              {sugg.map((s, i) => (
                <button
                  key={i}
                  className="suggest-pill"
                  onClick={() => onSend(s)}
                  type="button"
                >
                  <span className="ico">{I.sparkles}</span>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="ana-thread" ref={threadRef}>
            <div className="ana-thread-inner">
              {context && (
                <div className="ana-context-card">
                  <span className="mk">✻</span>
                  <span className="tx">{context}</span>
                </div>
              )}
              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="msg-user">
                    <div className="bubble">{m.text}</div>
                  </div>
                ) : (
                  <div key={i} className="msg-ana">
                    <span className="av">✻</span>
                    <div className="ana-body">
                      <div className="ana-name">AnA · Claude {cur.model}</div>
                      <div className="ana-prose">{m.text}</div>
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="ana-foot">
            <div className="ana-foot-inner">
              <Composer
                onSend={onSend}
                mode={mode}
                setMode={setMode}
                placeholder="Reply to AnA, or ask about this surface…"
              />
              <div className="composer-hint">
                Routes via the AnA gateway · Claude {cur.model} · context held in Claude memory
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/* ───────────────────────── 3 · WORK PANE ───────────────────────── */

/**
 * renderSurface mounts the existing live `.tsx` surface components — the
 * kit's install brief is explicit that this shell does NOT port the kit's
 * own `Surfaces*.jsx` (those are the design spec). Pathway-host surfaces
 * (k510/pma/cer/etc.) are not in this batch's BUILT set; they fall through
 * to the in-design pane and are wired in a follow-up.
 */
function renderSurface(surface: string, onAskAna: (text: string) => void): React.ReactNode {
  switch (surface) {
    case 'analytics':
      return <AnalyticsSurface onAskAna={onAskAna} />;
    case 'memory':
      return <MemorySurface onAskAna={onAskAna} />;
    case 'postmarket':
      return <PostmarketSurface onAskAna={onAskAna} />;
    default:
      return null;
  }
}

interface WorkPaneProps {
  surface: string;
  onClose: () => void;
  onAskAna: (text: string) => void;
}

function WorkPane({ surface, onClose, onAskAna }: WorkPaneProps) {
  const meta = SURFACE_META[surface] ?? { title: surface, kicker: '' };
  const built = BUILT.has(surface);
  return (
    <section className="work" aria-label={meta.title}>
      <div className="work-top">
        <div className="work-title-row">
          {meta.kicker && <span className="work-kicker">{meta.kicker}</span>}
          <span className="work-title">{meta.title}</span>
        </div>
        <div className="work-actions">
          {built && (
            <button className="work-btn" type="button">
              <span>{I.download}</span>
              Export
            </button>
          )}
          <button className="work-btn icon" title="Filter" type="button">
            {I.filter}
          </button>
          <button
            className="work-btn icon"
            title="Close work pane"
            onClick={onClose}
            type="button"
          >
            {I.close}
          </button>
        </div>
      </div>
      <div className="work-scroll">
        <div className="work-canvas">
          {built ? (
            renderSurface(surface, onAskAna)
          ) : (
            <div className="indesign">
              <div className="box">
                <div className="ic">{I.sliders}</div>
                <h2>{meta.title} is in design</h2>
                <p>
                  This surface is shipped in the implementation but its canonical kit lands in
                  a later batch. Analytics, Claude memory, and Post-market vigilance are live —
                  open one from the rail.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Shell root ───────────────────────── */

export function WorkspaceShell() {
  const [active, setActive] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<AnaMessage[]>([]);
  const [mode, setMode] = React.useState<AnaMode['id']>('standard');
  const [collapsed, setCollapsed] = React.useState(false);

  /** Per the install brief, do NOT call any model API from the client.
   *  Surface the user message locally; the model reply path is wired by a
   *  follow-up commit that connects to server/routes/ana-* via the existing
   *  useAnaChat hook. No canned-reply mock ships. */
  const onSend = (text: string) => {
    setMessages((prev) => [...prev, { role: 'user', text }]);
  };

  const onNavigate = (id: string) => {
    setActive(id);
    setMessages([]);
  };

  const onHome = () => {
    setActive(null);
    setMessages([]);
  };

  const onNewThread = () => setMessages([]);

  return (
    <div
      className="app"
      data-rail={collapsed ? 'collapsed' : 'expanded'}
      data-surface={active ? 'open' : 'closed'}
    >
      <NavRail
        active={active}
        onNavigate={onNavigate}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        onHome={onHome}
      />
      <div className="stage">
        <AnaPanel
          surface={active}
          messages={messages}
          onSend={onSend}
          mode={mode}
          setMode={setMode}
          onNewThread={onNewThread}
        />
        {active && <WorkPane surface={active} onClose={onHome} onAskAna={onSend} />}
      </div>
    </div>
  );
}

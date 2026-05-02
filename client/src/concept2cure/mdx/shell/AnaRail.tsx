/**
 * AnA rail (right edge). Default: 32px seam. Click → 400px panel.
 * ⌘\ toggles. Ported from Shell.jsx > AnaRail.
 *
 * Per the design-system non-negotiables: the AnA `✻` (U+273B) sparkle is the
 * only emoji-class glyph allowed in the UI.
 */

import * as React from 'react';
import { I } from '../icons';
import { ANA_MODES, MDX_SUGGESTIONS, type AnaMode } from '../data/nav';
import type { Program } from '../data/programs';

export interface AnaMessage {
  role: 'ana' | 'user';
  body: string;
  when: string;
  mode: AnaMode['id'];
}

export interface AnaRailProps {
  open: boolean;
  setOpen: (v: boolean) => void;
  activeNav: string;
  program: Program | null;
  mode: AnaMode['id'];
  setMode: (m: AnaMode['id']) => void;
  messages: AnaMessage[];
  onSend: (text: string) => void;
  /**
   * Optional MDX context snapshot — when present the rail renders a
   * compact alerts strip + onboarding milestone hint above the
   * suggestion list. The snapshot is the same payload that backs AnA's
   * server-side system prompt, so the rail and the chat see the same
   * universe.
   */
  alerts?: Array<{
    id: string;
    kind: string;
    severity: 'info' | 'warn' | 'critical';
    message: string;
    suggestedSurface?: string;
    suggestedTool?: string;
  }>;
  milestone?: { id: string; label: string; nextStep: string } | null;
  onAlertClick?: (alertId: string) => void;
}

export function AnaRail({
  open,
  setOpen,
  activeNav,
  program,
  mode,
  setMode,
  messages,
  onSend,
  alerts,
  milestone,
  onAlertClick,
}: AnaRailProps) {
  const [draft, setDraft] = React.useState('');
  const suggestions = MDX_SUGGESTIONS[activeNav] || MDX_SUGGESTIONS.overview;
  const modelName = ANA_MODES.find(m => m.id === mode)?.model ?? '';

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft('');
  };

  if (!open) {
    return (
      <aside className="ana-seam" aria-label="AnA assistant (collapsed)">
        <button
          className="ana-seam-btn"
          onClick={() => setOpen(true)}
          title="Open AnA · ⌘\\"
        >
          <span className="ana-seam-mark">✻</span>
          <span className="ana-seam-label">AnA</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="ana-rail" aria-label="AnA assistant">
      <div className="ana-rail-hdr">
        <div className="ana-id">
          <span className="ana-id-mark">✻</span>
          <div className="ana-id-text">
            <div className="ana-id-name">AnA 1.0 RI</div>
            <div className="ana-id-model">Claude {modelName}</div>
          </div>
        </div>
        <div className="ana-rail-actions">
          <button className="tb-btn" title="History">{I.clock}</button>
          <button className="tb-btn" title="New thread">{I.plus}</button>
          <button
            className="tb-btn"
            onClick={() => setOpen(false)}
            title="Collapse · ⌘\\"
          >
            {I.panelRight ?? I.panelLeft}
          </button>
        </div>
      </div>

      <div className="ana-mode-row">
        {ANA_MODES.map(m => (
          <button
            key={m.id}
            className={`ana-mode-btn${mode === m.id ? ' on' : ''}`}
            onClick={() => setMode(m.id)}
            title={`${m.desc} · Claude ${m.model}`}
          >
            <span className="lbl">{m.label}</span>
            <span className="sub">{m.model}</span>
          </button>
        ))}
      </div>

      <div className="ana-rail-body">
        {program && (
          <div className="ana-context">
            <div className="lbl">Context</div>
            <div className="val">
              {program.code} · {program.title}
            </div>
            <div className="sub">
              {program.stage} · {program.readiness}% ready
            </div>
          </div>
        )}

        {milestone && (
          <div className="ana-milestone">
            <div className="lbl">Where you are</div>
            <div className="val">{milestone.label}</div>
            <div className="sub">{milestone.nextStep}</div>
          </div>
        )}

        {alerts && alerts.length > 0 && (
          <>
            <div className="ana-section-label">Proactive ({alerts.length})</div>
            {alerts.slice(0, 6).map(a => (
              <button
                key={a.id}
                className={`ana-alert sev-${a.severity}`}
                onClick={() => onAlertClick?.(a.id)}
                title={a.message}
              >
                <span className="ana-alert-glyph" aria-hidden="true">
                  {a.severity === 'critical' ? '!!' : a.severity === 'warn' ? '!' : '·'}
                </span>
                <span className="ana-alert-body">
                  <span className="ana-alert-kind">{a.kind}</span>
                  <span className="ana-alert-msg">{a.message}</span>
                </span>
              </button>
            ))}
            {alerts.length > 6 && (
              <div className="ana-alert-more">and {alerts.length - 6} more</div>
            )}
          </>
        )}

        <div className="ana-section-label">Suggested for this surface</div>
        {suggestions.map((s, i) => (
          <button key={i} className="ana-suggestion" onClick={() => onSend(s)}>
            <span className="ico">{I.sparkles}</span>
            <span>{s}</span>
          </button>
        ))}

        <div className="ana-section-label" style={{ marginTop: 8 }}>
          Thread
        </div>
        {messages.length === 0 && (
          <div className="ana-empty">
            No messages yet. Use ⌘K for quick asks, or type below.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ana-msg ${m.role}`}>
            <div className="who">
              {m.role === 'ana'
                ? `AnA · ${ANA_MODES.find(x => x.id === m.mode)?.model || modelName}`
                : 'You'}{' '}
              · {m.when}
            </div>
            <div className="body">{m.body}</div>
          </div>
        ))}
      </div>

      <div className="ana-rail-foot">
        <div className="ana-composer">
          <textarea
            rows={1}
            placeholder="Ask AnA about this workspace…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            className="ana-send"
            disabled={!draft.trim()}
            title="Send"
            onClick={send}
          >
            {I.arrowUp}
          </button>
        </div>
        <div className="ana-foot-meta">
          Routes via AI gateway · Claude {modelName}
        </div>
      </div>
    </aside>
  );
}

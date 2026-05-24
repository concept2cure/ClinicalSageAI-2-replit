/**
 * PDEV AnA dock — right column. Context block pinned to the active
 * program + active activity, surface-specific suggestion chips, draft
 * composer.
 *
 * Phase 7.0 + 7.1 wires the dock visually only — the composer's send
 * action invokes the parent's onAskAna callback, which the App layer
 * routes to the existing AnA gateway. Streaming chat history surfaces
 * in the AnA conversation history (Phase 8); this dock just collects
 * the prompt with PDEV context attached.
 *
 * Port of design-system/ui_kits/pdev/Shell.jsx > PdevAnaDock.
 */

import * as React from 'react';
import { PdevIcon } from '../icons';
import { PDEV_SUGGESTIONS } from '../data/enums';
import type { PdevProgramView, PdevActivityView } from '../data/types';

/** Minimal transcript message for the dock. Mapped from useAnaChat in
 *  PdevApp; mirrors the MDX AnaRail `ana-msg` shape. */
export interface PdevAnaDockMessage {
  role: 'user' | 'ana';
  body: string;
  /** Relative time chip (e.g. "just now"). */
  when: string;
  /** True while tokens are still arriving — renders a streaming caret. */
  streaming?: boolean;
}

interface AnaDockProps {
  open: boolean;
  setOpen: (next: boolean) => void;
  program: PdevProgramView['program'] | null;
  /** Effective readiness for the program (latest snapshot overall). */
  readinessScore: number | null;
  /** Top blocker derived from the program view; null when none. */
  topBlocker: string | null;
  activeNav: string;
  /** When a single activity is selected in a workstream / detail view,
   *  the dock pins it as context for AnA. */
  activity: PdevActivityView | null;
  /** Send a draft prompt to AnA. The dock only collects the text; the
   *  app layer wires it to the AnA gateway. */
  onSend: (text: string) => void;
  /** Streaming flag from the AnA gateway round-trip. When true the
   *  composer locks and the footer status flips to "AnA is thinking…"
   *  so the user has immediate feedback that the prompt was accepted. */
  isStreaming?: boolean;
  /** Conversation transcript for this dock session. When empty, the
   *  suggestion chips show instead. Provisional inline treatment pending
   *  a canonical viewport design in ui_kits/pdev. */
  messages?: PdevAnaDockMessage[];
}

export function PdevAnaDock({
  open,
  setOpen,
  program,
  readinessScore,
  topBlocker,
  activeNav,
  activity,
  onSend,
  isStreaming = false,
  messages = [],
}: AnaDockProps) {
  const [draft, setDraft] = React.useState('');
  const suggestions = PDEV_SUGGESTIONS[activeNav] ?? PDEV_SUGGESTIONS.overview;
  const hasTranscript = messages.length > 0;
  const transcriptRef = React.useRef<HTMLDivElement>(null);

  // Keep the transcript pinned to the latest message as tokens stream in.
  React.useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (!open) {
    return (
      <aside className="pdev-ana-seam">
        <button
          className="pdev-ana-seam-btn"
          onClick={() => setOpen(true)}
          title="Open AnA · ⌘\\"
          type="button"
        >
          <span className="pdev-ana-mark">✻</span>
          <span className="pdev-ana-seam-label">AnA</span>
        </button>
      </aside>
    );
  }

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setDraft('');
  };

  return (
    <aside className="pdev-ana">
      <div className="pdev-ana-hdr">
        <div className="pdev-ana-id">
          <span className="pdev-ana-mark">✻</span>
          <div className="pdev-ana-id-text">
            <div className="pdev-ana-id-name">AnA 1.0 RI</div>
            <div className="pdev-ana-id-model">Claude Opus 4.5</div>
          </div>
        </div>
        <button
          className="pdev-tb-btn"
          onClick={() => setOpen(false)}
          title="Collapse · ⌘\\"
          type="button"
          aria-label="Collapse AnA dock"
        >
          <PdevIcon name="panelRight" />
        </button>
      </div>

      {program && (
        <div className="pdev-ana-context">
          <div className="lbl">Context</div>
          <div className="val">
            {program.code} · {program.productName.split(' · ')[0]}
          </div>
          <div className="sub">
            {readinessScore !== null && (
              <>Readiness {Math.round(readinessScore)}%</>
            )}
            {readinessScore !== null && program.targetSubmissionDate && ' · '}
            {program.targetSubmissionDate &&
              `target IND ${program.targetSubmissionDate.slice(0, 10)}`}
          </div>
          {activity && (
            <div className="pdev-ana-context-activity">
              <span className="ico">
                <PdevIcon name="zap" />
              </span>
              <span>{activity.registry.title}</span>
            </div>
          )}
          {topBlocker && (
            <div className="pdev-ana-context-blocker">
              <span className="ico">
                <PdevIcon name="alertCircle" />
              </span>
              <span>{topBlocker}</span>
            </div>
          )}
        </div>
      )}

      {!hasTranscript && (
        <>
          <div className="pdev-ana-section-label">Suggested for this surface</div>
          {suggestions.slice(0, 3).map((s, i) => (
            <button
              key={i}
              className="pdev-ana-suggestion"
              onClick={() => setDraft(s)}
              type="button"
            >
              <span className="ico">
                <PdevIcon name="sparkles" />
              </span>
              <span>{s}</span>
            </button>
          ))}
        </>
      )}

      {hasTranscript ? (
        <div className="pdev-ana-transcript" ref={transcriptRef}>
          {messages.map((m, i) => (
            <div key={i} className={`pdev-ana-msg ${m.role}`}>
              <div className="pdev-ana-msg-who">{m.role === 'ana' ? 'AnA' : 'You'} · {m.when}</div>
              <div className="pdev-ana-msg-body">
                {m.body}
                {m.streaming && <span className="pdev-ana-caret" aria-hidden="true" />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="pdev-ana-spacer" />
      )}

      <div className="pdev-ana-foot">
        <div className="pdev-ana-composer">
          <textarea
            rows={2}
            placeholder={isStreaming ? 'AnA is thinking…' : 'Ask AnA about this program…'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            aria-label="Ask AnA"
            disabled={isStreaming}
          />
          <button
            className="pdev-ana-send"
            disabled={!draft.trim() || isStreaming}
            onClick={handleSend}
            type="button"
            aria-label="Send"
          >
            <PdevIcon name="arrowUp" />
          </button>
        </div>
        <div className="pdev-ana-foot-meta">
          {isStreaming
            ? 'Streaming · response will appear in Conversations'
            : 'Routes via AnA gateway · Opus 4.5'}
        </div>
      </div>
    </aside>
  );
}

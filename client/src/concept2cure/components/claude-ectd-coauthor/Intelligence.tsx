/**
 * Intelligence — center pane chat thread with tool-use breadcrumbs and
 * artifact chips, plus a streaming composer footer.
 *
 * Mirror of docs/design/concept2cure-design-system/project/ui_kits/
 * ectd_coauthor/App.jsx (Intelligence function, lines 38–125).
 *
 * Production wiring: messages and onSend are owned by the parent shell
 * so the same hook can drive both Phase 2 chat and Phase 3 intelligence.
 */
import { useEffect, useRef, useState } from 'react';

import { Ico } from './icons';
import styles from './styles.module.css';

export interface ToolBlock {
  kind: 'tool';
  label: string;
  value: string;
}

export interface StreamBlock {
  kind: 'stream';
  target: string;
  hint: string;
}

export interface ParaBlock {
  kind: 'p';
  text: string;
}

export interface ChipBlock {
  kind: 'chip';
  title: string;
  meta: string;
}

export type IntelligenceBlock = ToolBlock | StreamBlock | ParaBlock | ChipBlock;

export interface IntelligenceMessage {
  role: 'user' | 'ai';
  /** Optional pre-pill above a user message (e.g. "Selected · …"). */
  pre?: string;
  /** Plain text — only for role: 'user'. */
  text?: string;
  /** Structured blocks — only for role: 'ai'. */
  blocks?: IntelligenceBlock[];
}

export interface IntelligenceProps {
  messages: IntelligenceMessage[];
  onSend: (text: string) => void;
  pending: boolean;
  /** Top-right hint label (defaults to bundle copy). */
  modelLabel?: string;
}

export function Intelligence({
  messages,
  onSend,
  pending,
  modelLabel = 'AnA 1.0 RI · c2c-Opus 4.7',
}: IntelligenceProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, pending]);

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft('');
  };

  return (
    <section className={styles.intel}>
      <div className={styles.intelHead}>
        <b>Intelligence</b>
        <span className={styles.hint}>{modelLabel}</span>
      </div>

      <div className={styles.intelScroll} ref={scrollRef}>
        <div className={styles.intelThread}>
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className={styles.msgUser}>
                {m.pre && <div className={styles.msgPre}>{m.pre}</div>}
                {m.text}
              </div>
            ) : (
              <div key={i} className={styles.msgAi}>
                <div className={styles.avatarAi}>A</div>
                <div className={styles.body}>
                  {(m.blocks ?? []).map((b, j) => {
                    if (b.kind === 'p') return <p key={j}>{b.text}</p>;
                    if (b.kind === 'tool') {
                      return (
                        <div key={j} className={styles.tool}>
                          <Ico name="check" />
                          <span>
                            <b>{b.label}</b> {b.value} <span className={styles.tick}>✓</span>
                          </span>
                        </div>
                      );
                    }
                    if (b.kind === 'stream') {
                      return (
                        <div key={j} className={styles.tool}>
                          <span className={styles.spin} />
                          <span>
                            <b>Streaming</b> {b.target}{' '}
                            <span className={styles.hint}>{b.hint}</span>
                          </span>
                        </div>
                      );
                    }
                    if (b.kind === 'chip') {
                      return (
                        <button type="button" key={j} className={styles.artifactChip}>
                          <span className={styles.ico}>
                            <Ico name="file" />
                          </span>
                          <span>
                            <span className={styles.title}>{b.title}</span>
                            <br />
                            <span className={styles.meta}>{b.meta}</span>
                          </span>
                        </button>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            ),
          )}
          {pending && (
            <div className={styles.msgAi}>
              <div className={styles.avatarAi}>A</div>
              <div className={styles.body}>
                <div className={styles.typing}>
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.intelFooter}>
        <div className={styles.composer}>
          <textarea
            rows={1}
            placeholder="Ask AnA about this section, or draft more…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className={styles.composerRow}>
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" className={styles.chip} title="Attach">
                <Ico name="attach" />
              </button>
              <button type="button" className={styles.chip} title="Tools">
                <Ico name="tools" /> Tools
              </button>
              <button type="button" className={styles.chip}>
                c2c-Opus 4.7 <Ico name="down" />
              </button>
            </div>
            <button
              type="button"
              className={styles.composerSend}
              disabled={!draft.trim()}
              onClick={send}
            >
              <Ico name="arrowUp" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

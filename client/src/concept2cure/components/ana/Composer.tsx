/**
 * Composer — faithful port of the bundle's Composer + stop-state affordance.
 *
 * Bundle shape:
 *   [textarea]
 *   ├── [attach] [tools] [AnA 1.0 RI ▾]    [send ▲]
 *
 * Functional additions (user-approved; bundle-consistent styling):
 *   - While streaming, the send button flips to a stop button. Same 32×32
 *     circle, same accent fill, same :hover — the only difference is the
 *     icon and title. No new visual element.
 *   - Textarea auto-grows with content up to 8 lines, then scrolls — the
 *     same Anthropic UX of a comfortable multi-line composer.
 *
 * Ported from docs/design/concept2cure-design-system/project/ui_kits/
 * ana_ri/App.jsx (lines 71–91).
 */
import { useEffect, useRef } from 'react';

import { I } from './icons';
import styles from './styles.module.css';

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  placeholder?: string;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming = false,
  placeholder = 'How can AnA help you today?',
}: ComposerProps) {
  const AttachIco = I.attach;
  const ToolsIco = I.tools;
  const DownIco = I.down;
  const ArrowUpIco = I.arrowUp;
  const StopIco = I.stop;
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow: reset to single-line height, then expand to scrollHeight,
  // capped at ~8 lines. After the cap the browser shows a scrollbar.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineHeight = 22; // matches CSS line-height
    const max = lineHeight * 8;
    const next = Math.min(ta.scrollHeight, max);
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > max ? 'auto' : 'hidden';
  }, [value]);

  const sendDisabled = !value.trim() && !isStreaming;

  return (
    <div className={styles.composer}>
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isStreaming) onSend();
          } else if (e.key === 'Escape' && isStreaming && onStop) {
            // Escape during streaming = stop generation (Anthropic shortcut)
            e.preventDefault();
            onStop();
          }
        }}
        rows={1}
      />
      <div className={styles.composerActions}>
        <div className={styles.left}>
          <button className={styles.composerIcon} title="Attach" type="button">
            <AttachIco size={16} />
          </button>
          <button className={styles.composerIcon} title="Tools" type="button">
            <ToolsIco size={16} />
          </button>
          <button className={styles.composerChip} type="button">
            AnA 1.0 RI
            <DownIco size={12} />
          </button>
        </div>
        <button
          className={styles.composerSend}
          onClick={() => {
            if (isStreaming) {
              onStop?.();
            } else {
              onSend();
            }
          }}
          disabled={sendDisabled}
          title={isStreaming ? 'Stop' : 'Send'}
          aria-label={isStreaming ? 'Stop generating' : 'Send message'}
          type="button"
        >
          {isStreaming ? (
            <StopIco size={12} fill="currentColor" />
          ) : (
            <ArrowUpIco size={16} />
          )}
        </button>
      </div>
    </div>
  );
}

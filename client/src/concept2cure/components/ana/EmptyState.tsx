/**
 * EmptyState — faithful port of the bundle's EmptyState.
 *
 * Centered serif greeting + composer + suggestion pill row + agency strip.
 * Matches docs/design/concept2cure-design-system/project/ui_kits/ana_ri/
 * App.jsx (lines 94–122).
 *
 * Host integration: `greeting` and `suggestions` props let the host override
 * the default greeting line and the default pill list (the bundle hardcodes
 * both; production passes context-specific text from ZenApp).
 */
import { useState } from 'react';

import { I } from './icons';
import { Composer } from './Composer';
import styles from './styles.module.css';

const AGENCIES = ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'ICH'] as const;

const DEFAULT_SUGGESTIONS: ReadonlyArray<{ Ico: typeof I.file; label: string }> = [
  { Ico: I.file, label: 'Draft CTD Section 2.5' },
  { Ico: I.search, label: 'Find 510(k) predicates' },
  { Ico: I.flask, label: 'Review biostat SAP' },
  { Ico: I.clip, label: 'Submission readiness' },
  { Ico: I.globe, label: 'Cross-agency precedent' },
];

export interface EmptySuggestion {
  label: string;
  /** Optional icon — falls back to the default file icon. */
  iconKey?: 'file' | 'search' | 'flask' | 'clip' | 'globe' | 'book' | 'chat' | 'folder' | 'sparkles';
}

export interface EmptyStateProps {
  greetingName: string;
  onSend: (text: string) => void;
  isStreaming?: boolean;
  onStop?: () => void;
  /** Override the default "Good morning, {name}" line. Bundle shows the default. */
  greeting?: string;
  /** Override the default suggestion pill list. */
  suggestions?: ReadonlyArray<EmptySuggestion>;
}

function resolveIcon(key?: EmptySuggestion['iconKey']): typeof I.file {
  switch (key) {
    case 'search': return I.search;
    case 'flask': return I.flask;
    case 'clip': return I.clip;
    case 'globe': return I.globe;
    case 'book': return I.book;
    case 'chat': return I.chat;
    case 'folder': return I.folder;
    case 'sparkles': return I.sparkles;
    case 'file':
    default: return I.file;
  }
}

export function EmptyState({
  greetingName,
  onSend,
  isStreaming,
  onStop,
  greeting,
  suggestions,
}: EmptyStateProps) {
  const [draft, setDraft] = useState('');

  const send = (text?: string) => {
    const out = text || draft;
    if (!out.trim()) return;
    onSend(out);
    if (!text) setDraft('');
  };

  const hour = new Date().getHours();
  const part = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const defaultGreeting = `Good ${part}, ${greetingName}`;

  const pills = suggestions && suggestions.length > 0
    ? suggestions.map(s => ({ Ico: resolveIcon(s.iconKey), label: s.label }))
    : DEFAULT_SUGGESTIONS;

  return (
    <div className={styles.empty}>
      <div className={styles.emptyInner}>
        <div className={styles.greet}>
          <span className={styles.star}>✻</span> {greeting || defaultGreeting}
        </div>
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => send()}
          onStop={onStop}
          isStreaming={isStreaming}
        />
        <div className={styles.suggest}>
          {pills.map(({ Ico, label }) => (
            <button
              key={label}
              className={styles.suggestPill}
              onClick={() => send(label)}
              type="button"
            >
              <span className={styles.ico}>
                <Ico size={14} />
              </span>
              {label}
            </button>
          ))}
        </div>
        <div className={styles.agencyStrip}>
          {AGENCIES.map(a => (
            <div key={a} className={styles.al}>
              {a}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * EmptyState — faithful port of the bundle's EmptyState.
 *
 * Centered serif greeting + composer + suggestion pill row + agency strip.
 * Matches docs/design/concept2cure-design-system/project/ui_kits/ana_ri/
 * App.jsx (lines 94–122).
 */
import { useState } from 'react';

import { I } from './icons';
import { Composer } from './Composer';
import styles from './styles.module.css';

const AGENCIES = ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'ICH'] as const;

export interface EmptyStateProps {
  greetingName: string;
  onSend: (text: string) => void;
  isStreaming?: boolean;
  onStop?: () => void;
}

export function EmptyState({ greetingName, onSend, isStreaming, onStop }: EmptyStateProps) {
  const [draft, setDraft] = useState('');

  const send = (text?: string) => {
    const out = text || draft;
    if (!out.trim()) return;
    onSend(out);
    if (!text) setDraft('');
  };

  const suggestions = [
    { Ico: I.file, label: 'Draft CTD Section 2.5' },
    { Ico: I.search, label: 'Find 510(k) predicates' },
    { Ico: I.flask, label: 'Review biostat SAP' },
    { Ico: I.clip, label: 'Submission readiness' },
    { Ico: I.globe, label: 'Cross-agency precedent' },
  ];

  const hour = new Date().getHours();
  const part = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  return (
    <div className={styles.empty}>
      <div className={styles.emptyInner}>
        <div className={styles.greet}>
          <span className={styles.star}>✻</span> Good {part}, {greetingName}
        </div>
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => send()}
          onStop={onStop}
          isStreaming={isStreaming}
        />
        <div className={styles.suggest}>
          {suggestions.map(({ Ico, label }) => (
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

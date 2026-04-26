/**
 * Mirror of docs/design/concept2cure-design-system/project/ui_kits/home/Extras.jsx
 * (AnaCard section). "See all tasks" opens the command palette, matching bundle.
 *
 * Production wiring: when the host passes `items` (e.g. from useHomeBriefing
 * pulling real RIM next-actions), they replace the bundle fixture. The
 * `lastSyncLabel` prop swaps the static "3 minutes ago" with a live timestamp.
 */
import { useState } from 'react';
import { HomeIcon } from './icons';
import { BRIEFING_BY_SCOPE, type Scope, type BriefingItem } from './data';
import styles from './styles.module.css';

interface Props {
  scope: Scope;
  onOpenPalette?: () => void;
  /** Override the bundle's static briefing fixture with live items. */
  items?: BriefingItem[];
  /** Override the static "3 minutes ago" subtitle. */
  lastSyncLabel?: string;
}

export function AnaCard({ scope, onOpenPalette, items, lastSyncLabel }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const briefing = items && items.length > 0 ? items : BRIEFING_BY_SCOPE[scope] ?? [];

  return (
    <div className={styles.anaCard} role="region" aria-label="AnA briefing">
      <div className={styles.anaHead}>
        <div className={styles.anaAvatar}>A</div>
        <div className={styles.anaTitle}>
          AnA · morning briefing{' '}
          <span className={styles.when}>· {lastSyncLabel || '3 minutes ago'}</span>
        </div>
        <button
          type="button"
          className={styles.anaDismiss}
          onClick={() => setDismissed(true)}
          title="Dismiss"
        >
          <HomeIcon name="close" size={14} />
        </button>
      </div>
      <div className={styles.anaBody}>
        <strong>{briefing.length} things need you today.</strong> I've scanned your projects, reviews and agency feeds — here's what's time-sensitive, ordered by impact.
      </div>
      <div className={styles.anaItems}>
        {briefing.map((it, i) => (
          <button type="button" key={i} className={styles.anaItem}>
            <span className={styles.anaNum}>{it.num}</span>
            <span>{it.t}</span>
            <span className={styles.anaMeta}>{it.meta}</span>
          </button>
        ))}
      </div>
      <div className={styles.anaActions}>
        <button type="button" className={`${styles.anaBtn} ${styles.primary}`}>
          Start with #1 <HomeIcon name="arrowRight" size={14} />
        </button>
        <button
          type="button"
          className={`${styles.anaBtn} ${styles.ghost}`}
          onClick={onOpenPalette}
        >
          See all tasks
        </button>
      </div>
    </div>
  );
}

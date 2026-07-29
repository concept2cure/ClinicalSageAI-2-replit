/**
 * Mirror of docs/design/concept2cure-design-system/project/ui_kits/home/Extras.jsx
 * (AnaCard section). "See all tasks" opens the command palette, matching bundle.
 *
 * Production wiring: the host passes `items` from useHomeBriefing (real RIM
 * next-actions). When there are none, the card shows a truthful "all caught
 * up" state — it never falls back to demo briefing rows. The `lastSyncLabel`
 * prop swaps the static subtitle with a live timestamp.
 */
import { useState } from 'react';
import { HomeIcon } from './icons';
import { type BriefingItem } from './data';
import styles from './styles.module.css';

interface Props {
  onOpenPalette?: () => void;
  /** Live briefing items from useHomeBriefing. Empty when nothing is pending. */
  items?: BriefingItem[];
  /** Live "last synced" subtitle. */
  lastSyncLabel?: string;
  /** Click handler for an individual briefing row. */
  onItemClick?: (item: BriefingItem, index: number) => void;
  /** "Start with #1" — host opens the first briefing item. */
  onStartFirst?: (item: BriefingItem | null) => void;
}

export function AnaCard({
  onOpenPalette,
  items,
  lastSyncLabel,
  onItemClick,
  onStartFirst,
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const briefing = items ?? [];
  const firstItem = briefing[0] ?? null;
  const hasItems = briefing.length > 0;

  return (
    <div className={styles.anaCard} role="region" aria-label="AnA briefing">
      <div className={styles.anaHead}>
        <div className={styles.anaAvatar}>A</div>
        <div className={styles.anaTitle}>
          AnA · morning briefing
          {lastSyncLabel && <span className={styles.when}> · {lastSyncLabel}</span>}
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
        {hasItems ? (
          <>
            <strong>
              {briefing.length} {briefing.length === 1 ? 'thing needs' : 'things need'} you today.
            </strong>{' '}
            I've scanned your projects, reviews and agency feeds — here's what's time-sensitive, ordered by impact.
          </>
        ) : (
          <>You're all caught up — nothing time-sensitive across your projects, reviews and agency feeds right now.</>
        )}
      </div>
      {hasItems && (
        <div className={styles.anaItems}>
          {briefing.map((it, i) => (
            <button
              type="button"
              key={i}
              className={styles.anaItem}
              onClick={() => onItemClick?.(it, i)}
            >
              <span className={styles.anaNum}>{it.num}</span>
              <span>{it.t}</span>
              <span className={styles.anaMeta}>{it.meta}</span>
            </button>
          ))}
        </div>
      )}
      <div className={styles.anaActions}>
        {hasItems && (
          <button
            type="button"
            className={`${styles.anaBtn} ${styles.primary}`}
            disabled={!firstItem}
            onClick={() => onStartFirst?.(firstItem)}
          >
            Start with #1 <HomeIcon name="arrowRight" size={14} />
          </button>
        )}
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

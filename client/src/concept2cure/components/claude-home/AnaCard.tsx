import { HomeIcon } from './icons';
import { BRIEFING_BY_SCOPE, type Scope } from './data';
import { useState } from 'react';
import styles from './styles.module.css';

interface Props {
  scope: Scope;
  onStart?: () => void;
  onSeeAll?: () => void;
}

export function AnaCard({ scope, onStart, onSeeAll }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const items = BRIEFING_BY_SCOPE[scope] ?? [];

  return (
    <div className={styles.anaCard} role="region" aria-label="AnA briefing">
      <div className={styles.anaHead}>
        <div className={styles.anaAvatar}>A</div>
        <div className={styles.anaTitle}>
          AnA · morning briefing <span className={styles.when}>· 3 minutes ago</span>
        </div>
        <button
          type="button"
          className={styles.anaDismiss}
          onClick={() => setDismissed(true)}
          aria-label="Dismiss briefing"
        >
          <HomeIcon name="close" size={14} />
        </button>
      </div>
      <div className={styles.anaBody}>
        <strong>{items.length} things need you today.</strong> I've scanned your projects,
        reviews and agency feeds — here's what's time-sensitive, ordered by impact.
      </div>
      <div className={styles.anaItems}>
        {items.map(it => (
          <button type="button" key={it.num} className={styles.anaItem}>
            <span className={styles.anaNum}>{it.num}</span>
            <span>{it.t}</span>
            <span className={styles.anaMeta}>{it.meta}</span>
          </button>
        ))}
      </div>
      <div className={styles.anaActions}>
        <button
          type="button"
          className={`${styles.anaBtn} ${styles.primary}`}
          onClick={onStart}
        >
          Start with #1 <HomeIcon name="arrowRight" size={14} />
        </button>
        <button
          type="button"
          className={`${styles.anaBtn} ${styles.ghost}`}
          onClick={onSeeAll}
        >
          See all tasks
        </button>
      </div>
    </div>
  );
}

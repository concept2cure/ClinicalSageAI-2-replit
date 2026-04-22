/**
 * TopBar — faithful port of the bundle's TopBar.
 *
 * Model switcher (AnA 1.0 RI) centered left, share + more icons right.
 * No deviations; matches docs/design/concept2cure-design-system/project/
 * ui_kits/ana_ri/App.jsx.
 */
import { I } from './icons';
import styles from './styles.module.css';
import type { AnaView } from './Sidebar';

const VIEW_TITLES: Partial<Record<AnaView, string>> = {
  projects: 'Projects',
  artifacts: 'Artifacts',
};

export interface TopBarProps {
  view: AnaView;
}

export function TopBar({ view }: TopBarProps) {
  const title = VIEW_TITLES[view];
  const DownIco = I.down;
  const ShareIco = I.share;
  const DotsIco = I.dots;

  return (
    <header className={styles.topbar}>
      <button className={styles.topbarModel} type="button">
        {title ? (
          <span style={{ fontWeight: 600 }}>{title}</span>
        ) : (
          <>
            <span className={styles.aiDot} />
            AnA 1.0 RI
            <DownIco size={14} />
          </>
        )}
      </button>
      <div className={styles.topbarActions}>
        <button className={styles.iconBtn} title="Share" type="button">
          <ShareIco size={16} />
        </button>
        <button className={styles.iconBtn} title="More" type="button">
          <DotsIco size={16} />
        </button>
      </div>
    </header>
  );
}

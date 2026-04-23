/**
 * TopBar — port of the bundle's TopBar with two functional buttons:
 *
 *  - Share / Download → exports the current chat as a markdown document.
 *    Critical for regulatory work where AnA conversations need to land in
 *    an audit trail or meeting record.
 *  - More → reserved for future menu (keyboard shortcuts, settings).
 *
 * Bundle structure preserved; matches docs/design/concept2cure-design-system/
 * project/ui_kits/ana_ri/App.jsx.
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
  /** Show the Share/Download button (only meaningful in chat view). */
  canExport?: boolean;
  /** Triggered when the user clicks Share — receives the conversation. */
  onExport?: () => void;
}

export function TopBar({ view, canExport, onExport }: TopBarProps) {
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
        {canExport && (
          <button
            className={styles.iconBtn}
            title="Download conversation as markdown"
            aria-label="Download conversation"
            type="button"
            onClick={onExport}
            disabled={!onExport}
          >
            <ShareIco size={16} />
          </button>
        )}
        <button className={styles.iconBtn} title="More" type="button">
          <DotsIco size={16} />
        </button>
      </div>
    </header>
  );
}

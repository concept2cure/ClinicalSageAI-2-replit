/**
 * TopBar — application/section breadcrumbs, status pill, and chrome actions.
 *
 * Mirror of docs/design/concept2cure-design-system/project/ui_kits/
 * ectd_coauthor/App.jsx (TopBar function, lines 5–36).
 */
import { Ico } from './icons';
import type { ArtifactSection } from './data';
import styles from './styles.module.css';

import brandIcon from '../../../assets/concept2cure-icon.svg';

export interface TopBarProps {
  art: ArtifactSection;
  /** Application-level breadcrumb (e.g. "NDA 212345"). */
  applicationLabel?: string;
  treeCollapsed: boolean;
  setTreeCollapsed: (v: boolean) => void;
  focus: boolean;
  setFocus: (v: boolean) => void;
  onSubmitForReview?: () => void;
  onShare?: () => void;
  onExport?: () => void;
}

export function TopBar({
  art,
  applicationLabel = 'NDA 212345',
  treeCollapsed,
  setTreeCollapsed,
  focus,
  setFocus,
  onSubmitForReview,
  onShare,
  onExport,
}: TopBarProps) {
  const moduleShort = art.module
    .replace(/^Module \d+ — /, '')
    .split(' ')
    .slice(0, 3)
    .join(' ');

  return (
    <header className={styles.topbar}>
      <div className={styles.topbarLogo}>
        <img src={brandIcon} alt="" />
        <b>
          Concept2Cure<span>.RI</span>
        </b>
      </div>
      <div className={styles.topbarDivider} />
      <button
        type="button"
        className={styles.topbarBtn}
        onClick={() => setTreeCollapsed(!treeCollapsed)}
        title="Toggle tree"
      >
        <Ico name="panelLeft" />
      </button>
      <div className={styles.topbarCrumbs}>
        <span>{applicationLabel}</span>
        <span className={styles.sep}>/</span>
        <span>{moduleShort}</span>
        <span className={styles.sep}>/</span>
        <b>
          {art.path} {art.title}
        </b>
      </div>
      <div className={styles.topbarSpacer} />
      <div className={styles.topbarStatus}>
        <span className={styles.dot} />
        <span>
          Autosaved · {art.version} · {art.lastEdited}
        </span>
      </div>
      <button type="button" className={styles.topbarBtn} title="Share" onClick={onShare}>
        <Ico name="share" />
      </button>
      <button type="button" className={styles.topbarBtn} title="Export" onClick={onExport}>
        <Ico name="download" />
      </button>
      <button
        type="button"
        className={styles.topbarBtn}
        onClick={() => setFocus(!focus)}
        title="Focus mode"
      >
        <Ico name="focus" />
      </button>
      <button
        type="button"
        className={`${styles.topbarBtn} ${styles.primary}`}
        onClick={onSubmitForReview}
      >
        Submit for review
      </button>
    </header>
  );
}

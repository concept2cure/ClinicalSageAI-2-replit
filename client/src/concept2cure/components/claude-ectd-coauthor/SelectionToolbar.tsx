/**
 * SelectionToolbar — floating toolbar shown above the current text selection.
 *
 * Mirror of docs/design/concept2cure-design-system/project/ui_kits/
 * ectd_coauthor/ArtifactDoc.jsx (lines 115–134).
 */
import { Ico } from './icons';
import type { SelectionInfo } from './ArtifactDoc';
import styles from './styles.module.css';

export type SelectionAction = 'ask' | 'precedent' | 'tighten' | 'flag';

export interface SelectionToolbarProps {
  selection: SelectionInfo | null;
  onAction: (action: SelectionAction) => void;
}

export function SelectionToolbar({ selection, onAction }: SelectionToolbarProps) {
  if (!selection) return null;
  const style: React.CSSProperties = {
    position: 'fixed',
    top: `${Math.max(8, selection.rect.top - 46)}px`,
    left: `${selection.rect.left + selection.rect.width / 2}px`,
    transform: 'translateX(-50%)',
  };
  return (
    <div
      className={styles.selToolbar}
      style={style}
      onMouseDown={e => e.preventDefault()}
    >
      <button type="button" onClick={() => onAction('ask')}>
        <Ico name="sparkle" /> Ask AnA
      </button>
      <span className={styles.sep} />
      <button type="button" onClick={() => onAction('precedent')}>
        <Ico name="shield" /> Find precedent
      </button>
      <span className={styles.sep} />
      <button type="button" onClick={() => onAction('tighten')}>Tighten</button>
      <span className={styles.sep} />
      <button type="button" onClick={() => onAction('flag')}>Flag</button>
    </div>
  );
}

/**
 * Tree — eCTD Module 1–5 navigator with status dots.
 *
 * Mirror of docs/design/concept2cure-design-system/project/ui_kits/
 * ectd_coauthor/Tree.jsx. Visual structure 1:1 with the bundle; data
 * shape exposed as a prop so callers can swap the bundle fixture for
 * live eCTD structure loaded from /api/authoring/...
 */
import { useState } from 'react';

import { Ico } from './icons';
import { TREE as DEFAULT_TREE, type EctdTreeModule } from './data';
import styles from './styles.module.css';

export interface TreeProps {
  activePath: string;
  setActivePath: (path: string) => void;
  /** Override the bundle fixture with live eCTD structure. */
  modules?: EctdTreeModule[];
  /** Footer stats (readiness, blocking, last RIM sync). */
  readinessPct?: number;
  blockingCount?: number;
  lastRimSync?: string;
  /** Title shown in the head row (defaults to bundle copy). */
  title?: string;
}

export function Tree({
  activePath,
  setActivePath,
  modules,
  readinessPct,
  blockingCount,
  lastRimSync,
  title,
}: TreeProps) {
  const tree = modules && modules.length > 0 ? modules : DEFAULT_TREE;
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(tree.map(m => [m.num, m.open])),
  );
  const toggle = (n: string) => setOpen(o => ({ ...o, [n]: !o[n] }));

  const headTitle = title ?? 'eCTD · NDA 212345';
  const fmtReadiness = readinessPct != null ? `${readinessPct}%` : '87%';
  const fmtBlocking = blockingCount != null ? String(blockingCount) : '3';
  const fmtSync = lastRimSync ?? '4 min ago';

  return (
    <aside className={styles.tree}>
      <div className={styles.treeHead}>
        <b>{headTitle}</b>
        <button
          type="button"
          className={styles.topbarBtn}
          title="History"
          style={{ padding: '2px 4px' }}
        >
          <Ico name="history" />
        </button>
      </div>

      <div className={styles.treeSearch}>
        <Ico name="search" />
        <input placeholder="Find section…" />
      </div>

      {tree.map(m => (
        <div key={m.num} className={styles.treeModule}>
          <button
            type="button"
            className={styles.treeRow}
            data-active={activePath === m.num || undefined}
            onClick={() => toggle(m.num)}
          >
            <span className={styles.treeCaret} data-open={open[m.num] || undefined}>
              <Ico name="chevron" />
            </span>
            <span className={styles.treeNum}>M{m.num}</span>
            <span className={styles.treeLabel}>{m.label}</span>
            <span className={styles.treeStatus} data-s={m.status} />
          </button>
          {open[m.num] && (
            <div className={styles.treeChildren}>
              {m.children.map(c => (
                <button
                  type="button"
                  key={c.num}
                  className={styles.treeRow}
                  data-active={activePath === c.num || undefined}
                  onClick={() => setActivePath(c.num)}
                >
                  <span className={styles.treeNum}>{c.num}</span>
                  <span className={styles.treeLabel}>{c.label}</span>
                  <span className={styles.treeStatus} data-s={c.status} />
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className={styles.treeFoot}>
        <div className={styles.treeFootRow}>
          <span>Submission readiness</span>
          <b>{fmtReadiness}</b>
        </div>
        <div className={styles.treeFootRow}>
          <span>Sections blocking</span>
          <b>{fmtBlocking}</b>
        </div>
        <div className={styles.treeFootRow}>
          <span>Last RIM sync</span>
          <b>{fmtSync}</b>
        </div>
      </div>
    </aside>
  );
}

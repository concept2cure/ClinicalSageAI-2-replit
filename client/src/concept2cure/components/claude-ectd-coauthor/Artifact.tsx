/**
 * Artifact — right pane wrapper: section heading, tabs (Document/eCTD XML/
 * Changes), and the document body.
 *
 * Mirror of docs/design/concept2cure-design-system/project/ui_kits/
 * ectd_coauthor/App.jsx (Artifact function, lines 127–149).
 */
import { useState } from 'react';

import { Ico } from './icons';
import { ArtifactDoc, type SelectionInfo } from './ArtifactDoc';
import type { ArtifactSection } from './data';
import styles from './styles.module.css';

export interface ArtifactProps {
  art: ArtifactSection;
  path: string;
  streaming: string | null;
  streamText: string;
  onSelect: (sel: SelectionInfo | null) => void;
  artifacts?: Record<string, ArtifactSection>;
  onRevert?: () => void;
}

type Tab = 'doc' | 'xml' | 'diff';

export function Artifact({
  art,
  path,
  streaming,
  streamText,
  onSelect,
  artifacts,
  onRevert,
}: ArtifactProps) {
  const [tab, setTab] = useState<Tab>('doc');

  return (
    <section className={styles.artifact}>
      <div className={styles.artifactHead}>
        <span className={styles.title}>
          Section {art.path} — {art.title}
        </span>
        <span className={styles.meta}>
          {art.version} · edited {art.lastEdited} · {art.lastEditedBy}
        </span>
        <span className={styles.spacer} />
        <div className={styles.artifactTabs}>
          <button
            type="button"
            className={styles.artifactTab}
            data-active={tab === 'doc' || undefined}
            onClick={() => setTab('doc')}
          >
            Document
          </button>
          <button
            type="button"
            className={styles.artifactTab}
            data-active={tab === 'xml' || undefined}
            onClick={() => setTab('xml')}
          >
            eCTD XML
          </button>
          <button
            type="button"
            className={styles.artifactTab}
            data-active={tab === 'diff' || undefined}
            onClick={() => setTab('diff')}
          >
            Changes
          </button>
        </div>
        <button type="button" className={styles.topbarBtn} title="Revert" onClick={onRevert}>
          <Ico name="revert" />
        </button>
        <button type="button" className={styles.topbarBtn} title="More">
          <Ico name="dots" />
        </button>
      </div>
      <div className={styles.artifactDoc} onMouseDown={() => onSelect(null)}>
        <ArtifactDoc
          path={path}
          streaming={streaming}
          streamText={streamText}
          onSelect={onSelect}
          artifacts={artifacts}
        />
      </div>
    </section>
  );
}

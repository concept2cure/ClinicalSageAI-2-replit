/**
 * PathwayPanes — the per-pathway sub-tab bar shared by every pathway surface.
 * Ported from `design-system/ui_kits/mdx/PathwayPanes.jsx` (PathwayTabBar +
 * pane switch). In the kit, Audit / Correspondence / Approvals / Files are
 * tabs here rather than standalone rail destinations.
 *
 * Slices shipped so far: Approvals tab (live) and Files tab (kit's
 * FilesTreePane, Dossier branch backed by /document-preview, siblings as
 * placeholder folders). Audit and Correspondence remain placeholders until
 * their dedicated panes ship.
 */

import * as React from 'react';
import { useApprovals } from '../../hooks/useApprovals';
import { ApprovalsPane, type ApprovalTarget } from './ApprovalsPane';
import { FilesTreePane } from './FilesTreePane';

export type PathwayKind = 'k510' | 'pma' | 'cer';

type TabId = 'workspace' | 'audit' | 'correspondence' | 'approvals' | 'files';

const CORR_LABEL: Record<PathwayKind, string> = {
  k510: 'RTA / AI-Hold',
  pma: 'Day-100',
  cer: 'NB Q&A',
};

const WORKSPACE_SUB: Record<PathwayKind, string> = {
  k510: 'Predicate · SE · eSTAR',
  pma: 'Phases · modules',
  cer: 'Signals · literature',
};

interface TabDef {
  id: TabId;
  label: string;
  sub: string;
  count?: number;
  badge?: boolean;
}

interface PathwayTabBarProps {
  tab: TabId;
  setTab: (t: TabId) => void;
  tabs: TabDef[];
}

function PathwayTabBar({ tab, setTab, tabs }: PathwayTabBarProps) {
  return (
    <div className="pwt-bar" role="tablist" aria-label="Pathway sub-tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          className={`pwt-btn ${tab === t.id ? 'active' : ''}`}
          onClick={() => setTab(t.id)}
        >
          <span className="pwt-label">{t.label}</span>
          {typeof t.count === 'number' && (
            <span className={`pwt-count ${t.badge ? 'badge' : ''}`}>{t.count}</span>
          )}
          <span className="pwt-sub">{t.sub}</span>
        </button>
      ))}
    </div>
  );
}

export interface PathwayPanesProps {
  pathway: PathwayKind;
  /** Existing surface content, rendered as the Workspace tab. */
  workspace: React.ReactNode;
  /** Active program identifier (numeric id, UUID, or code). Required for the
   *  Files tab to source the Dossier branch from /document-preview. */
  programIdent?: string | null;
  /** Open a dossier section from an approval row or files-tree body.md. */
  onOpenSection?: (target: ApprovalTarget) => void;
}

export function PathwayPanes({
  pathway,
  workspace,
  programIdent = null,
  onOpenSection,
}: PathwayPanesProps) {
  const [tab, setTab] = React.useState<TabId>('workspace');
  const { approvals, loading, error, refresh } = useApprovals();

  const pendingCount = approvals.filter((a) => a.status === 'pending').length;

  const tabs: TabDef[] = [
    { id: 'workspace', label: 'Workspace', sub: WORKSPACE_SUB[pathway] },
    { id: 'audit', label: 'Audit trail', sub: '21 CFR Part 11' },
    { id: 'correspondence', label: CORR_LABEL[pathway], sub: 'Agency / NB queries' },
    { id: 'approvals', label: 'Approvals', sub: 'Pending e-sign', count: pendingCount, badge: pendingCount > 0 },
    { id: 'files', label: 'Files', sub: 'Full filesystem' },
  ];

  return (
    <>
      <PathwayTabBar tab={tab} setTab={setTab} tabs={tabs} />

      {tab === 'workspace' && workspace}

      {tab === 'approvals' && (
        <ApprovalsPane
          approvals={approvals}
          loading={loading}
          error={error}
          onRefresh={refresh}
          onOpenSection={onOpenSection}
        />
      )}

      {tab === 'files' && (
        <FilesTreePane
          pathway={pathway}
          programIdent={programIdent}
          onOpenSection={onOpenSection}
        />
      )}

      {(tab === 'audit' || tab === 'correspondence') && (
        <div className="audit-empty">
          This tab ships in a following pathway-tabs slice.
        </div>
      )}
    </>
  );
}

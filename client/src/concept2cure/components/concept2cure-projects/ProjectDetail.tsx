/**
 * ProjectDetail — header + tabs + tab body for one project.
 * Mirror of design-system/ui_kits/home/Projects.jsx
 * (ProjectDetail, lines 273–449).
 *
 * Per HANDOFF section 14: governed-action hooks wired here:
 *   - useClaim  → "Claim project" in ⋯ menu
 *   - useTransition → status pill click in header
 *   - useSign   → forwarded to ProjectConfigPanel compliance tab
 *   - useLock   → forwarded to ProjectConfigPanel settings danger zone
 */
import { useEffect, useState } from 'react';
import { I } from './icons';
import { useProjectsMutations } from './data';
import { downloadJsonSnapshot } from './data/useProjectsMutations';
import { useClaim, useTransition, useSign, useLock } from '../../_shared/hooks/useC2cAction';
import { ProjectMoreMenu } from './ProjectMoreMenu';
import { ChatsTab } from './tabs/ChatsTab';
import { MemoryTab } from './tabs/MemoryTab';
import { InstructionsTab } from './tabs/InstructionsTab';
import { FilesTab } from './tabs/FilesTab';
import { LinkedTab } from './tabs/LinkedTab';
import { ActivityTab } from './tabs/ActivityTab';
import { ProjectConfigPanel } from './panels/ProjectConfigPanel';
import { ProjectArchiveModal } from './modals/ProjectArchiveModal';
import { ProjectInternalSearch } from './modals/ProjectInternalSearch';
import { ReasonModal } from './modals/ReasonModal';
import type { Project, DetailTab, ArchiveMode } from './types';

interface Props {
  project: Project;
  onBack: () => void;
  /** Called when the project is archived or deleted so the host
   *  refetches the list and the user lands back on it. */
  onProjectMutated?: () => void;
  /** Deep-link an IND program into a PDEV surface. Absent when the host
   *  has no PDEV route mounted (e.g. ENABLE_PDEV_SURFACE off). */
  onOpenPdev?: (programId: string, nav: string) => void;
}

const PDEV_TILES: Array<{ nav: string; icon: keyof typeof I; label: string }> = [
  { nav: 'overview',         icon: 'barChart', label: 'Program overview' },
  { nav: 'ind_assembly',     icon: 'fileText', label: 'IND assembly' },
  { nav: 'fda_interactions', icon: 'chat',     label: 'FDA interactions' },
];

export function ProjectDetail({ project, onBack, onProjectMutated, onOpenPdev }: Props) {
  const [configOpen, setConfigOpen] = useState(false);
  const [archiveMode, setArchiveMode] = useState<ArchiveMode | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tab, setTab] = useState<DetailTab>('chats');
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const { updateProject, archiveProject, deleteProject, exportProject, duplicateProject, transferProject } =
    useProjectsMutations({ onSuccess: onProjectMutated });

  // ── Governed-action hooks (HANDOFF section 14) ────────────────────────────
  const claimAction      = useClaim();
  const transitionAction = useTransition();
  const signAction       = useSign();
  const lockAction       = useLock();

  const handleClaim = async () => {
    try {
      await claimAction.trigger({
        target: `program:${project.id}`,
        reason: `Claiming project "${project.name}"`,
      });
      onProjectMutated?.();
    } catch { /* error surfaced via claimAction.error */ }
  };

  const handleTransition = async (nextStatus: string) => {
    try {
      await transitionAction.trigger({
        target: `program:${project.id}`,
        reason: `Transitioning "${project.name}" to ${nextStatus}`,
        payload: { status: nextStatus },
      });
      onProjectMutated?.();
    } catch { /* error surfaced via transitionAction.error */ }
  };

  const handleSign = async (reason: string, reauth?: { password?: string; totp?: string }) => {
    try {
      await signAction.trigger({
        target: `program:${project.id}`,
        reason,
        reauth,
      });
      onProjectMutated?.();
    } catch { /* error surfaced via signAction.error */ }
  };

  const handleLockConfirm = async (reason: string) => {
    try {
      await lockAction.trigger({ target: `program:${project.id}`, reason });
      onProjectMutated?.();
    } catch { /* error surfaced via lockAction.error */ }
    setLockModalOpen(false);
  };

  const handleExportProject = async () => {
    try {
      const snapshot = await exportProject(project.id);
      downloadJsonSnapshot(
        `${project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-export`,
        snapshot,
      );
    } catch { /* host can retry */ }
  };

  const handleTransferConfirm = async (reason: string, targetEmail?: string) => {
    if (!targetEmail) return;
    try {
      await transferProject({ id: project.id, targetEmail, reason });
    } catch { /* error surfaced via transferProject */ }
    setTransferModalOpen(false);
  };

  // ⌘F / Ctrl+F → project-internal search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const TABS: Array<{ id: DetailTab; label: string; count: number | null }> = [
    { id: 'chats',        label: 'Chats',        count: project.chats.length },
    { id: 'memory',       label: 'Memory',       count: null },
    { id: 'instructions', label: 'Instructions', count: null },
    { id: 'files',        label: 'Files',        count: null },
    { id: 'linked',       label: 'Linked',       count: null },
    { id: 'activity',     label: 'Activity',     count: null },
  ];

  return (
    <div className="prj-root" data-screen-label={`01 Projects · ${project.name}`}>
      <button type="button" className="prj-back" onClick={onBack}>
        <span className="prj-back-ico">{I.arrowLeft}</span>
        <span>All projects</span>
      </button>

      <header className="prj-head">
        <h1 className="prj-title">{project.name}</h1>
        {/* Status pill — click cycles to the next logical status (HANDOFF section 14 useTransition). */}
        <button
          type="button"
          className="prj-status-pill"
          data-status={project.status}
          disabled={transitionAction.pending}
          title="Click to advance status"
          onClick={() => {
            const next: Record<string, string> = {
              draft: 'active',
              active: 'in_review',
              in_review: 'submitted',
              submitted: 'active',
              archived: 'active',
            };
            const nextStatus = next[project.status] ?? 'active';
            handleTransition(nextStatus);
          }}
        >
          {transitionAction.pending ? 'Updating…' : project.status.replace('_', ' ')}
        </button>
        <div className="prj-head-r">
          <button
            type="button"
            className="prj-icon-btn"
            title="Search this project (⌘F)"
            onClick={() => setSearchOpen(true)}
          >
            {I.search}
          </button>
          <button
            type="button"
            className="prj-icon-btn"
            title="Configure project"
            onClick={() => setConfigOpen(true)}
            data-testid="open-config"
          >
            {I.settings}
          </button>
          <ProjectMoreMenu
            onArchive={() => setArchiveMode('archive')}
            onDelete={() => setArchiveMode('delete')}
            onDuplicate={async () => {
              await duplicateProject(project.id);
            }}
            onExport={handleExportProject}
            onClaim={handleClaim}
          />
          <button
            type="button"
            className="prj-icon-btn"
            title={project.starred ? 'Unstar' : 'Star'}
            data-on={project.starred}
            onClick={async () => {
              try {
                await updateProject({
                  id: project.id,
                  metadata: { starred: !project.starred },
                });
              } catch { /* host refetch will reconcile */ }
            }}
          >
            {I.star}
          </button>
        </div>
      </header>
      <p className="prj-desc">{project.desc}</p>

      {onOpenPdev && project.submissionType === 'IND' && (
        <section className="prj-pdev" aria-label="Pharmaceutical development">
          <span className="prj-pdev-label">Pharmaceutical development</span>
          <div className="prj-pdev-tiles">
            {PDEV_TILES.map(t => (
              <button
                type="button"
                key={t.nav}
                className="prj-pdev-tile"
                onClick={() => onOpenPdev(project.id, t.nav)}
              >
                <span className="prj-pdev-tile-ico">{I[t.icon]}</span>
                <span>{t.label}</span>
                <span className="prj-pdev-tile-arrow">{I.arrowRight}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <nav className="prj-tabs" role="tablist">
        {TABS.map(t => (
          <button
            type="button"
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className="prj-tab"
            data-active={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            <span>{t.label}</span>
            {t.count != null && <span className="prj-tab-count">{t.count}</span>}
          </button>
        ))}
      </nav>

      {tab === 'chats' && (
        <ChatsTab project={project} onSwitchTab={setTab} onProjectMutated={onProjectMutated} />
      )}
      {tab === 'memory' && <MemoryTab project={project} onSwitchTab={setTab} />}
      {tab === 'instructions' && (
        <InstructionsTab
          project={project}
          onSaveInstructions={async (text, active) => {
            try {
              await updateProject({
                id: project.id,
                metadata: {
                  instructions: text,
                  instructionsActive: active,
                },
              });
            } catch { /* host can re-open to retry */ }
          }}
        />
      )}
      {tab === 'files' && <FilesTab project={project} onProjectMutated={onProjectMutated} />}
      {tab === 'linked' && <LinkedTab project={project} />}
      {tab === 'activity' && <ActivityTab project={project} />}

      <ProjectInternalSearch
        open={searchOpen}
        project={project}
        onClose={() => setSearchOpen(false)}
        onJump={t => { setSearchOpen(false); setTab(t); }}
      />

      <ProjectConfigPanel
        project={project}
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        onArchive={() => setArchiveMode('archive')}
        onDelete={() => setArchiveMode('delete')}
        onTransfer={() => setTransferModalOpen(true)}
        onExportProject={handleExportProject}
        onOpenInstructionsTab={() => { setConfigOpen(false); setTab('instructions'); }}
        onSign={handleSign}
        onLock={() => setLockModalOpen(true)}
        onSave={async form => {
          // Persist to the backend; ignore failure silently — the host
          // can show a toast if it cares. The panel closes regardless
          // (user can re-open to retry).
          try {
            await updateProject({
              id: project.id,
              name: form.name,
              description: form.description,
              status: form.status,
              metadata: {
                product: form.product,
                sponsor: form.sponsor,
                targetAgency: form.targetAgency,
                targetSubmissionDate: form.targetDate || null,
                submissionType: form.submissionType,
              },
            });
          } catch { /* silent — see comment above */ }
        }}
      />

      <ProjectArchiveModal
        open={!!archiveMode}
        project={project}
        mode={archiveMode}
        onClose={() => setArchiveMode(null)}
        onConfirm={async () => {
          const mode = archiveMode;
          setArchiveMode(null);
          try {
            if (mode === 'delete')   await deleteProject(project.id);
            if (mode === 'archive')  await archiveProject(project.id);
            if (mode === 'restore') {
              await updateProject({ id: project.id, status: 'active' });
            }
          } catch { /* fall through — host refetch will pick up actual state */ }
          if (mode === 'archive' || mode === 'delete') onBack();
        }}
      />

      <ReasonModal
        open={lockModalOpen}
        title={`Lock project "${project.name}"`}
        description="Locking prevents further changes. The action is recorded in the audit log."
        cta="Lock project"
        onClose={() => setLockModalOpen(false)}
        onConfirm={handleLockConfirm}
      />

      <ReasonModal
        open={transferModalOpen}
        title={`Transfer ownership of "${project.name}"`}
        description="Enter the new owner's email and a reason. Both are recorded in the audit log."
        emailLabel="New owner email"
        cta="Transfer"
        onClose={() => setTransferModalOpen(false)}
        onConfirm={handleTransferConfirm}
      />
    </div>
  );
}

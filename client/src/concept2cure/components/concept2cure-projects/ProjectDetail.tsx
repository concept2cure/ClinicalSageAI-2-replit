/**
 * ProjectDetail — header + tabs + tab body for one project.
 * Mirror of design-system/ui_kits/home/Projects.jsx
 * (ProjectDetail, lines 273–449).
 */
import { useEffect, useState } from 'react';
import { I } from './icons';
import { PACT_EVENTS, PLNK_LINKS, useProjectsMutations } from './data';
import { downloadJsonSnapshot } from './data/useProjectsMutations';
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
  const { updateProject, archiveProject, deleteProject, exportProject, duplicateProject, transferProject } =
    useProjectsMutations({ onSuccess: onProjectMutated });

  const handleExportProject = async () => {
    try {
      const snapshot = await exportProject(project.id);
      downloadJsonSnapshot(
        `${project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-export`,
        snapshot,
      );
    } catch { /* host can retry */ }
  };

  const handleTransfer = async () => {
    const targetEmail = window.prompt(
      `Transfer ownership of "${project.name}".\n\nEnter the email of the new owner:`,
    );
    if (!targetEmail) return;
    const reason = window.prompt(
      'Reason for transfer (10+ characters, recorded in audit log):',
    );
    if (!reason || reason.trim().length < 10) {
      window.alert('Transfer cancelled — reason must be at least 10 characters.');
      return;
    }
    try {
      await transferProject({
        id: project.id,
        targetEmail: targetEmail.trim(),
        reason: reason.trim(),
      });
    } catch (err) {
      window.alert(`Transfer failed: ${err instanceof Error ? err.message : String(err)}`);
    }
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
    { id: 'files',        label: 'Files',        count: project.files.length },
    { id: 'linked',       label: 'Linked',       count: (PLNK_LINKS[project.id] || []).length || null },
    { id: 'activity',     label: 'Activity',     count: (PACT_EVENTS[project.id] || []).length || null },
  ];

  return (
    <div className="prj-root" data-screen-label={`01 Projects · ${project.name}`}>
      <button type="button" className="prj-back" onClick={onBack}>
        <span className="prj-back-ico">{I.arrowLeft}</span>
        <span>All projects</span>
      </button>

      <header className="prj-head">
        <h1 className="prj-title">{project.name}</h1>
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
        onTransfer={handleTransfer}
        onExportProject={handleExportProject}
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
    </div>
  );
}

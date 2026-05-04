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
}

export function ProjectDetail({ project, onBack, onProjectMutated }: Props) {
  const [configOpen, setConfigOpen] = useState(false);
  const [archiveMode, setArchiveMode] = useState<ArchiveMode | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tab, setTab] = useState<DetailTab>('chats');
  const { updateProject, archiveProject, deleteProject, exportProject, duplicateProject } =
    useProjectsMutations({ onSuccess: onProjectMutated });

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
            onExport={async () => {
              const snapshot = await exportProject(project.id);
              downloadJsonSnapshot(
                `${project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-export`,
                snapshot,
              );
            }}
          />
          <button
            type="button"
            className="prj-icon-btn"
            title="Star"
            data-on={project.starred}
          >
            {I.star}
          </button>
        </div>
      </header>
      <p className="prj-desc">{project.desc}</p>

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

      {tab === 'chats' && <ChatsTab project={project} />}
      {tab === 'memory' && <MemoryTab project={project} />}
      {tab === 'instructions' && <InstructionsTab project={project} />}
      {tab === 'files' && <FilesTab project={project} />}
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

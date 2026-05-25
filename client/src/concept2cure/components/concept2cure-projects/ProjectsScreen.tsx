/**
 * ProjectsScreen — top-level wrapper that owns list↔detail state plus
 * the global ⌘K switcher, notifications panel, and new-project dialog.
 * Mirror of design-system/ui_kits/home/Projects.jsx
 * (ProjectsScreen, lines 1297–1349).
 */
import { useEffect, useState } from 'react';
import { useProjectsApi } from './data';
import { ProjectsList } from './ProjectsList';
import { ProjectDetail } from './ProjectDetail';
import { ProjectQuickSwitcher } from './modals/ProjectQuickSwitcher';
import { ProjectNotifications } from './modals/ProjectNotifications';
import { NewProjectDialog } from './modals/NewProjectDialog';

interface Props {
  /** Deep-link an IND program into a PDEV surface (overview / ind_assembly / fda_interactions). */
  onOpenPdev?: (programId: string, nav: string) => void;
}

export function ProjectsScreen({ onOpenPdev }: Props = {}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);

  // Live API with prototype-seed fallback so the surface always renders
  // (offline, empty tenant, or auth lapse). Per HANDOFF item 12.
  const { projects, refetch } = useProjectsApi();
  const project = openId ? projects.find(p => p.id === openId) ?? null : null;

  // ⌘K → switcher (when on the list)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSwitcherOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {project ? (
        <ProjectDetail
          project={project}
          onBack={() => setOpenId(null)}
          onProjectMutated={refetch}
          onOpenPdev={onOpenPdev}
        />
      ) : (
        <ProjectsList
          onOpen={setOpenId}
          onCreate={() => setCreating(true)}
          onOpenSwitcher={() => setSwitcherOpen(true)}
          onOpenNotifications={() => setNotifsOpen(true)}
        />
      )}

      <ProjectQuickSwitcher
        open={switcherOpen}
        projects={projects}
        onPick={id => { setSwitcherOpen(false); setOpenId(id); }}
        onClose={() => setSwitcherOpen(false)}
        onCreate={() => { setSwitcherOpen(false); setCreating(true); }}
      />

      <ProjectNotifications
        open={notifsOpen}
        projects={projects}
        onClose={() => setNotifsOpen(false)}
        onOpenProject={id => { setNotifsOpen(false); setOpenId(id); }}
      />

      {creating && (
        <NewProjectDialog
          onClose={() => setCreating(false)}
          onCreated={id => { setCreating(false); setOpenId(id); }}
          onApiCreated={refetch}
        />
      )}
    </>
  );
}

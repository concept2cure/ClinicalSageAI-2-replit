/**
 * ProjectsList — list view (header + filter rail + bulk bar + rows).
 * Mirror of design-system/ui_kits/home/Projects.jsx (lines 141–268).
 */
import { useState } from 'react';
import { I } from './icons';
import { useProjectsApi, useProjectsMutations } from './data';
import { downloadJsonSnapshot } from './data/useProjectsMutations';
import type { ProjectsFilters, ArchiveMode } from './types';
import { ProjectsListFilters } from './ProjectsListFilters';
import { ProjectsListBulkBar } from './ProjectsListBulkBar';
import { ProjectsListEmpty } from './ProjectsListEmpty';
import { ProjectArchiveModal } from './modals/ProjectArchiveModal';

interface Props {
  onOpen: (id: string) => void;
  onCreate: () => void;
  onOpenSwitcher: () => void;
  onOpenNotifications: () => void;
}

const EMPTY_FILTERS: ProjectsFilters = {
  type: [], status: [], agency: [], owner: [], activity: [],
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  in_review: 'In review',
  submitted: 'Submitted',
  draft: 'Draft',
  archived: 'Archived',
};

export function ProjectsList({
  onOpen, onCreate, onOpenSwitcher, onOpenNotifications,
}: Props) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ProjectsFilters>(EMPTY_FILTERS);
  const [savedView, setSavedView] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [archiveTarget, setArchiveTarget] = useState<{
    project: { id: string; name: string; chats: []; files: [] };
    mode: ArchiveMode;
  } | null>(null);

  // Live projects with prototype-seed fallback. The hook returns the seed
  // when the API errors or has no rows, so the surface always renders.
  const { projects: allProjects, refetch } = useProjectsApi();
  const { archiveProject, deleteProject, exportProject } = useProjectsMutations({ onSuccess: refetch });

  const matches = (p: typeof allProjects[number]) => {
    if (query) {
      const hay = (p.name + ' ' + p.desc + ' ' + (p.product || '') + ' ' + (p.sponsor || '')).toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    if (filters.type.length && !filters.type.includes(p.submissionTypeLabel)) return false;
    if (filters.status.length) {
      const sLabel = STATUS_LABELS[p.status] || '';
      if (!filters.status.includes(sLabel)) return false;
    }
    if (filters.agency.length && !filters.agency.includes(p.targetAgency as string)) return false;
    return true;
  };

  const filtered = allProjects.filter(matches);

  function applySavedView(v: { id: string; filters: Partial<ProjectsFilters> }) {
    if (savedView === v.id) {
      setSavedView(null);
      setFilters(EMPTY_FILTERS);
      return;
    }
    setSavedView(v.id);
    setFilters({ ...EMPTY_FILTERS, ...v.filters });
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setSavedView(null);
  }

  return (
    <div className="prj-list-root" data-screen-label="01 Projects · list">
      <header className="prj-list-head">
        <div>
          <h1 className="prj-list-title">Projects</h1>
          <p className="prj-list-sub">
            Persistent workspaces with chats, memory, instructions and shared files.
          </p>
        </div>
        <div className="prj-list-head-r">
          <button type="button" className="prj-icon-btn" title="Notifications" onClick={onOpenNotifications}>
            {I.bell}
            <span className="prj-bell-dot" aria-hidden="true" />
          </button>
          <button type="button" className="prj-icon-btn" title="Quick switch (⌘K)" onClick={onOpenSwitcher}>
            {I.search}
          </button>
          <button type="button" className="prj-btn primary" onClick={onCreate}>
            <span>{I.plus}</span><span>New project</span>
          </button>
        </div>
      </header>

      {allProjects.length > 0 && (
        <ProjectsListFilters
          filters={filters}
          onChange={setFilters}
          savedView={savedView}
          onSavedView={applySavedView}
          query={query}
          onQuery={setQuery}
        />
      )}

      <ProjectsListBulkBar
        count={selected.length}
        onClear={() => setSelected([])}
        onArchive={() => {
          setArchiveTarget({
            project: { name: `${selected.length} projects`, id: 'bulk', chats: [], files: [] },
            mode: 'archive',
          });
        }}
        onExport={async () => {
          if (selected.length === 0) return;
          const snapshots = await Promise.all(selected.map(id => exportProject(id)));
          downloadJsonSnapshot(
            `projects-export-${selected.length}-${new Date().toISOString().slice(0, 10)}`,
            { exportedAt: new Date().toISOString(), projectCount: selected.length, projects: snapshots },
          );
        }}
        onTransfer={() => { /* Transfer wire pending workspace-picker kit */ }}
        onDelete={() => {
          setArchiveTarget({
            project: { name: `${selected.length} projects`, id: 'bulk', chats: [], files: [] },
            mode: 'delete',
          });
        }}
      />

      {allProjects.length === 0 && (
        <ProjectsListEmpty kind="no-projects" onCreate={onCreate} />
      )}
      {allProjects.length > 0 && filtered.length === 0 && (
        <ProjectsListEmpty kind="no-results" onClear={clearFilters} />
      )}

      <div className="prj-list-rows">
        {filtered.map(p => {
          const checked = selected.includes(p.id);
          const completedPhases = p.phases.filter(x => x.status === 'completed').length;
          const totalPhases = p.phases.length;
          const progressPct = totalPhases === 0
            ? 0
            : Math.round((completedPhases / totalPhases) * 100);
          return (
            <div key={p.id} className={`prj-list-row-wrap ${checked ? 'is-checked' : ''}`}>
              <label className="prj-list-row-check" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={e =>
                    setSelected(s =>
                      e.target.checked ? [...s, p.id] : s.filter(x => x !== p.id),
                    )
                  }
                />
              </label>
              <button type="button" className="prj-list-row" onClick={() => onOpen(p.id)}>
                <div className="prj-list-row-l">
                  <div className="prj-list-row-name">
                    {p.name}
                    {p.starred && (
                      <span className="prj-list-star" aria-label="Starred">{I.star}</span>
                    )}
                  </div>
                  <div className="prj-list-row-desc">{p.desc}</div>
                </div>
                <div className="prj-list-row-r">
                  {p.phases && totalPhases > 0 && (
                    <div
                      className="prj-list-mini"
                      aria-label={`Submission progress — ${progressPct}%`}
                    >
                      <div className="prj-list-mini-track">
                        <div className="prj-list-mini-fill" style={{ width: `${progressPct}%` }} />
                      </div>
                      <span className="prj-list-mini-lbl">
                        {p.submissionTypeLabel} · {completedPhases}/{totalPhases}
                      </span>
                    </div>
                  )}
                  <span className="prj-list-count">
                    {p.chats.length} chat{p.chats.length === 1 ? '' : 's'}
                  </span>
                  <span className="prj-list-files">
                    {p.files.length} file{p.files.length === 1 ? '' : 's'}
                  </span>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      <ProjectArchiveModal
        open={!!archiveTarget}
        project={archiveTarget?.project}
        mode={archiveTarget?.mode}
        onClose={() => setArchiveTarget(null)}
        onConfirm={async () => {
          // Bulk-apply the chosen mode across every selected id. Errors
          // are tolerated row-by-row so one server-side conflict
          // doesn't strand the rest. The host refetch picks up the
          // actual outcome.
          const mode = archiveTarget?.mode;
          const ids = [...selected];
          setArchiveTarget(null);
          setSelected([]);
          if (!mode || ids.length === 0) return;
          for (const id of ids) {
            try {
              if (mode === 'archive') await archiveProject(id);
              if (mode === 'delete')  await deleteProject(id);
            } catch { /* per-row failures don't block the loop */ }
          }
        }}
      />
    </div>
  );
}

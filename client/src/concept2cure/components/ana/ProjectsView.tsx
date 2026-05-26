/**
 * ProjectsView — faithful port of the bundle's ProjectsView.
 *
 * Grid of project cards. Matches docs/design/concept2cure-design-system/
 * project/ui_kits/ana_ri/App.jsx (lines 159–190).
 */
import { I } from './icons';
import styles from './styles.module.css';

export interface AnaProject {
  id: string;
  title: string;
  description: string;
  meta: string;
}

export interface ProjectsViewProps {
  projects: AnaProject[];
  onSelect: (id: string) => void;
  onNew?: () => void;
}

export function ProjectsView({ projects, onSelect, onNew }: ProjectsViewProps) {
  const FolderIco = I.folder;
  const PlusIco = I.plus;

  return (
    <div className={styles.projects}>
      <div className={styles.projectsHead}>
        <div>
          <h1>Projects</h1>
          <div className="sub" style={{ color: 'var(--ink-muted, var(--text-300))', fontSize: 13 }}>
            Persistent workspaces with shared context and files.
          </div>
        </div>
        {onNew && (
          <button
            className={styles.composerChip}
            style={{ padding: '6px 12px' }}
            onClick={onNew}
            type="button"
          >
            <PlusIco size={12} />
            New project
          </button>
        )}
      </div>
      {projects.length === 0 && (
        <div className={styles.sbEmpty} style={{ padding: '8px 0' }}>
          No projects yet. Create one to start a workspace.
        </div>
      )}
      <div className={styles.projectsGrid}>
        {projects.map(p => (
          <button
            key={p.id}
            className={styles.projectCard}
            onClick={() => onSelect(p.id)}
            type="button"
          >
            <div className={styles.pcIco}>
              <FolderIco size={14} />
            </div>
            <div className={styles.pcTtl}>{p.title}</div>
            <div className={styles.pcDesc}>{p.description}</div>
            <div className={styles.pcMeta}>
              <span>{p.meta}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * ProjectDetail — single project view. Phase 10 implementation of
 * ui_kits/projects/App.jsx. Assembles header, workstreams, AnA thread,
 * recent drafts, and aside (team + evidence + activity).
 *
 * Data: all fetched live from /api/c2c/projects/:id/*.
 */

import * as React from 'react';
import { ProjectHeader } from './components/ProjectHeader';
import { ProjectWorkstreams } from './components/ProjectWorkstreams';
import { ProjectThread } from './components/ProjectThread';
import { ProjectDrafts } from './components/ProjectDrafts';
import { ProjectAside } from './components/ProjectAside';
import './project.css';

/* ─── types ──────────────────────────────────────────────────── */

interface Project {
  id: string;
  code: string | null;
  name: string;
  program_type: string | null;
  status: string | null;
  lead_indication: string | null;
  sponsor_name: string | null;
  filing_date: string | null;
  pdufa_date: string | null;
  completion_percentage: number | null;
  target_agencies: string[] | null;
}

interface Workstream {
  module: string;
  total: number;
  approved: number;
  review: number;
  drafted: number;
  todo: number;
  completion_pct: number;
  last_updated: string | null;
}

interface Draft {
  id: number;
  document_id: string;
  section_key: string;
  label: string | null;
  status: string;
  draft_source: string | null;
  owner_id: number | null;
  updated_at: string | null;
  doc_type: string | null;
  document_title: string | null;
}

interface Member {
  user_id: number;
  name: string;
  email: string;
  role: string;
  added_at: string | null;
}

interface Evidence {
  id: number;
  evidence_kind: string;
  title: string;
  meta: string | null;
  pinned_at: string | null;
}

interface Activity {
  id: string;
  action: string;
  resource_type: string | null;
  occurred_at: string | null;
  actor_id: number | null;
  details: Record<string, unknown> | null;
}

/* ─── data fetching ──────────────────────────────────────────── */

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const data = await res.json() as { data?: T } | T;
  return (data as { data?: T }).data ?? (data as T);
}

function useProjectData(projectId: string) {
  const [project,     setProject]     = React.useState<Project | null>(null);
  const [workstreams, setWorkstreams] = React.useState<Workstream[]>([]);
  const [drafts,      setDrafts]      = React.useState<Draft[]>([]);
  const [team,        setTeam]        = React.useState<Member[]>([]);
  const [evidence,    setEvidence]    = React.useState<Evidence[]>([]);
  const [activity,    setActivity]    = React.useState<Activity[]>([]);
  const [loading,     setLoading]     = React.useState(true);
  const [error,       setError]       = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setError(null);

    const base = `/api/c2c/projects/${encodeURIComponent(projectId)}`;
    Promise.all([
      fetchJson<Project>(base),
      fetchJson<Workstream[]>(`${base}/workstreams`),
      fetchJson<Draft[]>(`${base}/drafts`),
      fetchJson<Member[]>(`${base}/team`),
      fetchJson<Evidence[]>(`${base}/evidence`),
      fetchJson<Activity[]>(`${base}/activity`),
    ]).then(([proj, ws, dr, tm, ev, act]) => {
      setProject(proj);
      setWorkstreams(ws);
      setDrafts(dr);
      setTeam(tm);
      setEvidence(ev);
      setActivity(act);
      setLoading(false);
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to load project');
      setLoading(false);
    });
  }, [projectId]);

  return { project, workstreams, drafts, team, evidence, activity, loading, error };
}

/* ─── component ──────────────────────────────────────────────── */

interface ProjectDetailProps {
  projectId: string;
  onBack?: () => void;
  onOpenDraft?: (draft: Draft) => void;
  onOpenWorkstream?: (module: string) => void;
}

export function ProjectDetail({
  projectId,
  onBack,
  onOpenDraft,
  onOpenWorkstream,
}: ProjectDetailProps) {
  const { project, workstreams, drafts, team, evidence, activity, loading, error } = useProjectData(projectId);

  if (loading) {
    return (
      <div className="pj-shell">
        <div style={{ padding: 32, color: 'var(--text-400)' }}>Loading project…</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="pj-shell">
        <div style={{ padding: 32, color: 'var(--red-100)' }}>
          {error ?? 'Project not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="pj-shell" data-screen-label={`Project · ${project.code ?? project.name}`}>
      <header className="pj-topbar">
        <div className="pj-crumbs">
          {onBack && (
            <button className="pj-tb-btn" onClick={onBack} style={{ marginRight: 4 }}>
              ← Projects
            </button>
          )}
          <span className="sep">›</span>
          <span className="here">{project.code ?? project.program_type} · {project.name}</span>
        </div>
        <div className="pj-spacer" />
      </header>

      <div className="pj-body">
        <div className="pj-main">
          <div className="pj-main-inner">
            <ProjectHeader project={project} workstreams={workstreams} />

            <div className="pj-sec">
              <div className="pj-sec-head">
                <h2>Workstreams</h2>
                <span className="meta">{workstreams.length} modules · click to open</span>
              </div>
              <ProjectWorkstreams
                workstreams={workstreams}
                documentId={project.id}
                onOpen={onOpenWorkstream}
              />
            </div>

            <div className="pj-sec">
              <div className="pj-sec-head">
                <h2>Conversation with AnA</h2>
                <span className="meta">Project-grounded</span>
                <span className="spacer" />
              </div>
              <ProjectThread projectId={projectId} projectName={project.name} />
            </div>

            <div className="pj-sec">
              <div className="pj-sec-head">
                <h2>Recent drafts</h2>
                <span className="meta">{drafts.length} sections</span>
                <span className="spacer" />
              </div>
              <ProjectDrafts
                drafts={drafts}
                projectId={projectId}
                onOpen={onOpenDraft}
              />
            </div>
          </div>
        </div>

        <aside className="pj-aside">
          <ProjectAside team={team} evidence={evidence} activity={activity} />
        </aside>
      </div>
    </div>
  );
}

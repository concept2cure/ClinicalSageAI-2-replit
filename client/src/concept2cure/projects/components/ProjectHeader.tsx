// ProjectHeader — port of ui_kits/projects/App.jsx Header.

import * as React from 'react';

interface Project {
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
}

interface ProjectHeaderProps {
  project: Project;
  workstreams: Workstream[];
}

function statusKind(status: string | null): string {
  if (!status) return 'dim';
  const s = status.toLowerCase();
  if (s.includes('review'))   return 'review';
  if (s.includes('approv'))   return 'ok';
  if (s.includes('block'))    return 'err';
  if (s.includes('active'))   return 'ok';
  return 'dim';
}

export function ProjectHeader({ project, workstreams }: ProjectHeaderProps) {
  const ready = project.completion_percentage ?? 0;
  const teamCount = 0; // fed from ProjectAside

  const pdufaDays = React.useMemo(() => {
    if (!project.pdufa_date) return null;
    const diff = Math.round((new Date(project.pdufa_date).getTime() - Date.now()) / 86_400_000);
    return diff > 0 ? diff : null;
  }, [project.pdufa_date]);

  return (
    <div className="pj-head">
      <div className="pj-head-row1">
        <span className="code">{project.code ?? project.program_type}</span>
        <h1>{project.name}</h1>
        <span className={`pill ${statusKind(project.status)}`}>
          <span className="dot"/>{project.status ?? 'Active'}
        </span>
      </div>
      <div className="sub">
        {project.lead_indication}
        {project.sponsor_name ? ` · ${project.sponsor_name}` : ''}
        {project.filing_date  ? ` · filed ${project.filing_date}` : ''}
        {project.pdufa_date   ? ` · PDUFA ${project.pdufa_date}` : ''}
      </div>
      <div className="pj-head-meta">
        <div className="col">
          <div className="lbl">Readiness</div>
          <div className="pct">{ready}%</div>
          <div className="bar"><div className="fill" style={{ width: `${ready}%` }}/></div>
        </div>
        <div className="col">
          <div className="lbl">Pathway</div>
          <div className="val">
            {project.program_type}
            {project.target_agencies?.length ? ` · ${project.target_agencies.join(', ')}` : ''}
          </div>
        </div>
        <div className="col">
          <div className="lbl">Workstreams</div>
          <div className="val">{workstreams.length} modules</div>
        </div>
        {pdufaDays !== null && (
          <div className="col">
            <div className="lbl">Next milestone</div>
            <div className="val warn">PDUFA · {pdufaDays} days</div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The project's work areas, as direct doors on the project's page.
 *
 * Each opens an existing work area on the open project (the shell's project
 * channel), never a new app or a document. Until 2026-10-31 they sat on Plan
 * behind a "Choose work" select and a "Start selected work" button, and CMC was
 * offered only to a small-molecule US IND, so a client looking at a biologic
 * IND could not find Biostatistics or CMC from the project at all. They are now
 * doors in the project's About card, beside every step (ProjectHome.tsx).
 *
 * Which doors a project gets follows its track, never a guess: a device or
 * diagnostic filing has no study protocol workspace or Module 3; risk-based
 * monitoring is offered to a device filing only when the project records it.
 * CMC / Module 3 is offered to every medicinal product: its own screen says
 * what it composes (a small-molecule US IND) and refuses the rest by name, and
 * its registers work for any product.
 */
import React from 'react';
import { APP_REGISTRY } from '@shared/regulatory/app-registry';
import { apiRequest, assertApiResponseOk } from '@/lib/queryClient';
import { getSurfaceMeta } from '../registryModel';
import { I } from '../icons';
import { C2CForm } from '../C2CForm';
import { useLiveData, type ShapeGuard } from '../dataConnect';
import { C2CToast, useToast } from '../toast';

/** What the project's record says about its track. */
export interface WorkAreaTrack {
  /** A device or diagnostic filing (ProjectHome `deviceFiling`). */
  deviceFiling: boolean;
  /** The project records risk-based monitoring (`riskBasedMonitoring`). */
  riskBasedMonitoring: boolean;
  /** CMC / Module 3 composes Module 3 for this project (a small-molecule US IND). */
  cmcComposes: boolean;
}

export interface WorkArea { id: string; label: string; describe: string }

/** The work areas a project's track has, in the order the work is done. */
export function workAreasFor(track: WorkAreaTrack): WorkArea[] {
  const medicinal = !track.deviceFiling;
  return [
    medicinal && { id: APP_REGISTRY.study_protocol_design.moduleId!, label: APP_REGISTRY.study_protocol_design.label,
      describe: 'Design the clinical trial and its protocol: objectives, population, assessments and statistics.' },
    { id: 'biostatistics', label: getSurfaceMeta('biostatistics').label,
      describe: 'Plan the statistical methods and run the study-design calculations.' },
    medicinal && { id: 'cmc', label: getSurfaceMeta('cmc').label,
      describe: track.cmcComposes
        ? 'Compose Module 3 for this small-molecule US IND from the project’s quality records.'
        : 'Keep this product’s quality records. The CMC screen says which filings it composes Module 3 for.' },
    (medicinal || track.riskBasedMonitoring) && { id: 'rbm', label: getSurfaceMeta('rbm').label,
      describe: 'Assess study risks, quality signals and monitoring actions.' },
  ].filter((area): area is WorkArea => Boolean(area));
}

/* ── Work projects (S12; founder decisions P-83, P-109) ──────────────────────────────────────────────────────────
   A work project (CMC, a study's biostatistics, its risk-based monitoring…) produces the evidence the filing is
   written from. It is a child of this project's anchor row: read through the project hierarchy
   (GET /api/project-hierarchy/:id/children), admitted as the project page is, and added through the one project
   intake (POST /api/c2c/projects with its parent and kind). Listed here, in the card that holds the project's work
   areas; added with D0's form. */

/** P-83's kinds, in the words a person reads (server: program-project-anchor.ts WORK_KINDS). */
export const WORK_KIND_LABEL: Record<string, string> = {
  cmc: 'CMC', biostatistics: 'Biostatistics', rbm: 'Risk-based monitoring', data_management: 'Data management',
  clin_pharm: 'Clinical pharmacology', nonclinical: 'Nonclinical',
};

export interface WorkProjectRow { id: number; name: string; workKind: string | null; ownerName: string | null }
interface WorkProjectsRead { children: WorkProjectRow[] }
/* The read's `{ success, data }` envelope is unwrapped by useLiveData before this guard. */
const isWorkProjectsRead: ShapeGuard<WorkProjectsRead> = (value): value is WorkProjectsRead => {
  const children = (value as { children?: unknown } | null)?.children;
  return Array.isArray(children) && children.every((c) => c && typeof (c as WorkProjectRow).id === 'number' && typeof (c as WorkProjectRow).name === 'string');
};

/** The project's work projects and, for a person who may change the project, "Add a work project". Nothing is drawn
 *  until the project's verified integer id is known (the team read's), so no project is guessed. */
export function ProjectWorkProjects({ programId, anchorProjectId, canChange }: {
  programId: string; anchorProjectId: number | null; canChange: boolean;
}) {
  const [version, setVersion] = React.useState(0);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [toast, notify] = useToast();
  const path = anchorProjectId !== null
    ? `/api/project-hierarchy/${anchorProjectId}/children?programId=${encodeURIComponent(programId)}` : null;
  const read = useLiveData<WorkProjectsRead>(path, [path, version], isWorkProjectsRead);
  if (anchorProjectId === null) return null;
  const rows = read.data?.children ?? null;
  const add = async (v: Record<string, string>) => {
    setBusy(true);
    try {
      const res = await apiRequest('POST', '/api/c2c/projects', { parentProjectId: anchorProjectId, name: v.name, workKind: v.workKind });
      if (!res.ok) await assertApiResponseOk(res);
      const body = await res.json() as { data?: { created?: boolean } };
      notify(body.data?.created === false ? `"${v.name.trim()}" is already a work project here.` : `Work project "${v.name.trim()}" added.`);
      setAdding(false);
      setVersion((n) => n + 1);
    } catch (e) {
      notify(`The work project was not added: ${e instanceof Error ? e.message : 'the request failed'}.`, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pj-work-projects" data-testid="pj-work-projects">
      <div className="pj-work-projects-h">
        <h4>Work projects</h4>
        {canChange && <button type="button" className="btn ghost small" disabled={busy} onClick={() => setAdding(true)}>{I.plus} Add a work project</button>}
      </div>
      {read.loading && !rows ? <p role="status" className="pj-card-note">Reading this project's work projects…</p>
        : read.error || !rows ? <p role="alert" className="pj-card-note">This project's work projects could not be read.</p>
          : rows.length === 0 ? <p className="pj-card-note">None yet. A work project (CMC, a study's biostatistics, its monitoring) holds the work this filing is written from.</p>
            : (
              <ul className="pj-work-projects-l">
                {rows.map((row) => (
                  <li key={row.id}><span className="pj-work-project-n">{row.name}</span>
                    <span className="pj-card-note">{[row.workKind ? WORK_KIND_LABEL[row.workKind] ?? row.workKind : null, row.ownerName].filter(Boolean).join(' · ')}</span></li>
                ))}
              </ul>
            )}
      {adding && (
        <C2CForm
          config={{
            eyebrow: 'Project · work projects',
            title: 'Add a work project',
            sub: 'Work that produces what this filing is written from, kept as its own project under this one.',
            governed: 'Recorded in the audit trail.',
            submitLabel: 'Add work project',
            fields: [
              { key: 'workKind', label: 'Kind of work', type: 'select', required: true, default: 'cmc',
                options: Object.entries(WORK_KIND_LABEL).map(([value, label]) => ({ value, label })) },
              { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Drug substance CMC' },
            ],
          }}
          onCancel={() => setAdding(false)}
          onSubmit={(v) => void add(v)}
        />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}

interface Props {
  programId: string | null;
  /** Null until the project's read says its track: the areas wait for it, a child row (Reports) does not. */
  track: WorkAreaTrack | null;
  available: (id: string) => boolean;
  onNav: (id: string) => void;
  /** Rows after the work areas, in the same card (the Reports row, ProjectHome `ProjectReportsDoor`). */
  children?: React.ReactNode;
  /** The project's work projects (S12), after the work areas and their rows. */
  workProjects?: React.ReactNode;
}

/** The Work areas card in Project knowledge (D3-2a, D3.md §4.8 item 4): each area a row with its icon, its label and
 *  a chevron, its description in the title. The card's heading names the group; the navigation keeps its name. */
export function ProjectCoreWork({ programId, track, available, onNav, children, workProjects }: Props) {
  const areas = track ? workAreasFor(track).filter((area) => available(area.id)) : [];
  if (!programId || (!areas.length && !children && !workProjects)) return null;
  return (
    <nav className="pj-card pj-work-areas" aria-label="This project’s work areas" data-testid="pj-work-areas">
      <div className="pj-card-h"><h3>Work areas</h3></div>
      {areas.map((area) => (
        <button key={area.id} type="button" className="pj-work-area" title={area.describe}
          onClick={() => { if (available(area.id)) onNav(area.id); }}>
          <span className="pj-work-area-ic" aria-hidden="true">{I[getSurfaceMeta(area.id).icon as keyof typeof I] ?? I.grid}</span>
          <span className="pj-work-area-l">{area.label}</span>
          {I.right}
        </button>
      ))}
      {children}
      {workProjects}
    </nav>
  );
}

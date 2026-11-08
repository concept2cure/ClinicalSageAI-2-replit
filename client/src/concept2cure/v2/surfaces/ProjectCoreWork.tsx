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
import { getSurfaceMeta } from '../registryModel';
import { I } from '../icons';

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

interface Props {
  programId: string | null;
  /** Null until the project's read says its track: the areas wait for it, a child row (Reports) does not. */
  track: WorkAreaTrack | null;
  available: (id: string) => boolean;
  onNav: (id: string) => void;
  /** Rows after the work areas, in the same card (the Reports row, ProjectHome `ProjectReportsDoor`). */
  children?: React.ReactNode;
}

/** The Work areas card in Project knowledge (D3-2a, D3.md §4.8 item 4): each area a row with its icon, its label and
 *  a chevron, its description in the title. The card's heading names the group; the navigation keeps its name. */
export function ProjectCoreWork({ programId, track, available, onNav, children }: Props) {
  const areas = track ? workAreasFor(track).filter((area) => available(area.id)) : [];
  if (!programId || (!areas.length && !children)) return null;
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
    </nav>
  );
}

import React from 'react';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { ProjectSkills } from '../ProjectSkills';
import { DossierReadinessCard, type DossierState } from './ProjectDossier';

/* The project page's side column: the dossier's readiness, the skills AnA
   follows here, and the cards the numeric project-home read-model serves. */
export function ProjectSide({ pid, dossier, onAsk }: { pid: string | null; dossier: DossierState; onAsk?: (text: string) => void }) {
  return (
    <aside className="pj-side">
      {/* Dossier readiness — a status figure, so it lives with the other
          status cards in the aside rather than between the conversation and
          the work (the constitution's no-KPI-hero rule for project landing).
          Always present: the home filing's figure from the dossier read,
          each added market on its own line, or why there is no figure. No
          ring is drawn for no figure — an empty ring reads as 0%. */}
      <DossierReadinessCard read={dossier} />
      {/* The skills AnA follows in this project: deployed here, off here,
          and written for it (ProjectSkills.tsx). */}
      {pid && <ProjectSkills projectRef={pid} onAsk={onAsk} />}
      {/* Memory / instructions / intelligence — served only by the numeric
          project-home read-model (project_intelligence_profiles), not reachable
          from this UUID-scoped surface. Honest empty, never a fabricated body. */}
      <section className="pj-card">
        <div className="pj-card-h"><h3>Memory</h3></div>
        <EmptyState
          icon={I.penLine}
          title="No project memory yet"
          hint="AnA's persisted regulatory-strategy memory, open blockers, and decisions-on-record for this project will appear here once enriched."
        />
      </section>

      <section className="pj-card">
        <div className="pj-card-h"><h3>Instructions</h3></div>
        <EmptyState
          icon={I.penLine}
          title="No custom instructions yet"
          hint="Authoring instructions saved on this project's intelligence profile will appear here."
        />
      </section>

    </aside>
  );
}

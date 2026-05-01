/**
 * useActiveProgram — canonical resolver for the active regulatory program.
 *
 * Every MDX surface that fetches data from the backend must go through this
 * hook. It resolves a single source of truth for the program identifier and
 * normalizes the path for fixture, ProjectContext, and URL-deeplink modes.
 *
 * Resolution order (first match wins):
 *
 *   1. ProjectContext active project (when MDX is mounted under
 *      /concept2cure/project/:projectId via ZenApp)
 *   2. URL `:projectId` route param (when entered directly to MDX)
 *   3. Fixture program keyed by activeNav (k510 → bx204, pma → cv330,
 *      cer → iv415) — used when MDX is hit standalone for demos
 *   4. null — surface should render the empty state
 *
 * Surfaces consume the typed handle:
 *
 *   const program = useActiveProgram();
 *   if (!program.id) return <DataState state="empty" />;
 *   const { data } = useQuery(['predicates', program.id], …);
 *
 * The `isFixture` flag tells consumers when they're rendering fixtures so
 * they can hide governed-action affordances that would be meaningless on
 * non-persisted data.
 */

import { useMemo } from 'react';
import { useRoute } from 'wouter';
import { useProject } from '../../context/ProjectContext';
import { MDX_PROGRAMS, type Program, type ProgramPathway } from '../data/programs';
import type { SubmissionType } from '../../types';

export interface ActiveProgram {
  /** Canonical program id used for backend calls. String to match the
   *  ProjectContext shape (Project.id is `proj_*`). Backend services that
   *  expect a numeric program_id resolve via the project's metadata. */
  id: string | null;
  /** Display code, e.g. 'OR-801', 'CV-330'. Falls back to the first chunk
   *  of the project id when no program code is on file. */
  code: string;
  /** Display name. */
  name: string;
  /** Pathway code for workstream routing. */
  pathway: ProgramPathway | null;
  /** Submission type as the backend uses it (510K | PMA | CER | ...). */
  submissionType: SubmissionType | null;
  /** True when the program comes from MDX_PROGRAMS fixtures rather than a
   *  real ProjectContext or URL match. Surfaces should disable governed
   *  actions in this mode. */
  isFixture: boolean;
  /** Original Program fixture, when available, for surfaces that still
   *  read fixture-only fields (lead, dueLabel, etc.) until the backend
   *  shape matches. */
  fixture: Program | null;
}

const NULL_PROGRAM: ActiveProgram = {
  id: null,
  code: '',
  name: '',
  pathway: null,
  submissionType: null,
  isFixture: false,
  fixture: null,
};

const NAV_TO_FIXTURE_INDEX: Record<string, number> = {
  k510: 0,
  pma: 2,
  cer: 3,
  'project-home': 0,
  // Workstream-agnostic surfaces fall through to no fixture.
};

const PATHWAY_TO_SUBMISSION: Record<ProgramPathway, SubmissionType | null> = {
  k510: '510K',
  pma: 'PMA',
  // CER is an EU-MDR workstream, not a submission type proper. Surfaces
  // that need a submission type for grounding can fall back to 'IVDR' or
  // null; the pathway field remains 'cer' for routing.
  cer: null,
};

export interface UseActiveProgramOptions {
  /** Current active workstream tab. Used only as a fallback to pick a
   *  fixture program when neither ProjectContext nor URL resolve. */
  activeNav?: string;
}

export function useActiveProgram(opts: UseActiveProgramOptions = {}): ActiveProgram {
  const { activeNav } = opts;

  // ProjectContext is wrapped around ProtectedZenApp, so it's available
  // whenever MDX renders inside the main app shell. The standalone /mdx
  // route mounts without it — useProject() throws there, so we guard.
  let activeProject: ReturnType<typeof useProject>['activeProject'] | null = null;
  try {
    activeProject = useProject().activeProject;
  } catch {
    activeProject = null;
  }

  const [, urlParams] = useRoute<{ projectId?: string }>('/concept2cure/project/:projectId/:rest*');

  return useMemo<ActiveProgram>(() => {
    // 1. ProjectContext.
    if (activeProject) {
      const submissionType = activeProject.submissionType ?? null;
      return {
        id: activeProject.id,
        code: deriveCode(activeProject.product, activeProject.id),
        name: activeProject.name,
        pathway: submissionToPathway(submissionType),
        submissionType,
        isFixture: false,
        fixture: null,
      };
    }

    // 2. URL deep-link (standalone /concept2cure/project/:id without provider).
    if (urlParams?.projectId) {
      return {
        id: urlParams.projectId,
        code: deriveCode(undefined, urlParams.projectId),
        name: 'Project ' + urlParams.projectId,
        pathway: null,
        submissionType: null,
        isFixture: false,
        fixture: null,
      };
    }

    // 3. Fixture fallback.
    if (activeNav && NAV_TO_FIXTURE_INDEX[activeNav] !== undefined) {
      const fixture = MDX_PROGRAMS[NAV_TO_FIXTURE_INDEX[activeNav]];
      if (fixture) {
        return {
          id: fixture.id,
          code: fixture.code,
          name: fixture.title,
          pathway: fixture.pathway,
          submissionType: PATHWAY_TO_SUBMISSION[fixture.pathway] ?? null,
          isFixture: true,
          fixture,
        };
      }
    }

    return NULL_PROGRAM;
  }, [activeProject, urlParams?.projectId, activeNav]);
}

// ─── Helpers ──────────────────────────────────────────────────────────

function deriveCode(product: string | undefined, fallbackId: string): string {
  if (product) return product;
  // Strip 'proj_' prefix for display when no product code is on file.
  return fallbackId.replace(/^proj_/, '').slice(0, 8).toUpperCase();
}

function submissionToPathway(t: SubmissionType | null): ProgramPathway | null {
  switch (t) {
    case '510K':   return 'k510';
    case 'PMA':    return 'pma';
    case 'IVDR':   return 'cer';  // IVDR programs surface in the CER workstream
    default:       return null;
  }
}

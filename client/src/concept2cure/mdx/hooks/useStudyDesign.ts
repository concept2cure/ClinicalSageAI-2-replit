/**
 * useStudyDesign — protocol & study-design records for a project.
 *
 * The study-design module (`/api/study-design`, CDISC PRM) authors the
 * protocol / SAP / SoA / CRF layer, but its records carried no project
 * key and were consumed only by the v2 kit — a device team in MDX could
 * not see its own protocol next to its study conduct and monitoring.
 *
 * A schema change added `program_id` (the canonical `regulatory_programs`
 * project key) to the design table and a `?program_id=` filter to the
 * list route; this hook consumes that filter so the design records flow
 * into the MDX Clinical studies workstream, connected to the same project
 * as everything else.
 *
 * The route returns a bare `{ designs }` (not the `{ data }` envelope),
 * so this reads `body.designs`. Every result is a `DataState`: no project
 * → idle; a project with no linked design → honest empty.
 */

import { useFetchJson } from './useFetchJson';
import { toDataState, type DataState } from '../lib/dataState';

export interface StudyDesignRow {
  studyId: string;
  programId: string | null;
  title: string;
  phase: string;
  indication: string;
  status: string;
  updatedAt: string | null;
}

interface Payload {
  designs: StudyDesignRow[];
}

export interface UseStudyDesignResult {
  designs: DataState<StudyDesignRow[]>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * @param programId The project's `regulatory_programs.id` (UUID), or null
 *                  when no project is in context — study design is
 *                  project-scoped here, so without one there is nothing to
 *                  fetch.
 */
export function useStudyDesign(programId: string | null): UseStudyDesignResult {
  const url = programId
    ? `/api/study-design?program_id=${encodeURIComponent(programId)}`
    : null;
  const { data, loading, error, refresh } = useFetchJson<Payload>(url);

  return {
    designs: toDataState(data?.designs ?? null, loading, error, {
      idleReason: 'The protocol and study design are held per program or study.',
    }),
    loading,
    error,
    refresh,
  };
}

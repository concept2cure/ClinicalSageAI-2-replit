// Biopharma programs hook — reads from /api/biopharma/programs.
// The fixture shape below is the shape contract; real data comes from the API.

import { useState, useEffect } from 'react';
import { getAuthHeaders } from '../../../utils/authToken';

export interface BiopharmaProgram {
  id:                   string;
  code:                 string | null;
  name:                 string;
  program_type:         string;
  status:               string | null;
  sponsor_name:         string | null;
  lead_indication:      string | null;
  target_agencies:      string[] | null;
  filing_date:          string | null;
  pdufa_date:           string | null;
  completion_percentage: number | null;
  updated_at:           string | null;
  section_counts: {
    todo: number;
    drafted: number;
    review: number;
    approved: number;
    locked: number;
    total: number;
  } | null;
}

export function useBiopharmaPrograms(pathway?: string): {
  programs: BiopharmaProgram[];
  loading: boolean;
  error: string | null;
} {
  const [programs, setPrograms] = useState<BiopharmaProgram[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const qs = pathway ? `?pathway=${encodeURIComponent(pathway)}` : '';
    fetch(`/api/biopharma/programs${qs}`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { programs: BiopharmaProgram[] }) => {
        if (!cancelled) {
          setPrograms(data.programs ?? []);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.error('[useBiopharmaPrograms]', err);
          setPrograms([]);
          setLoading(false);
          setError('Could not load programs');
        }
      });

    return () => { cancelled = true; };
  }, [pathway]);

  return { programs, loading, error };
}

export function useBiopharmaProgram(id: string | null): {
  program: BiopharmaProgram | null;
  loading: boolean;
} {
  const [program, setProgram] = useState<BiopharmaProgram | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/biopharma/programs/${encodeURIComponent(id)}`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: BiopharmaProgram) => {
        if (!cancelled) { setProgram(data); setLoading(false); }
      })
      .catch(err => {
        if (!cancelled) { console.error('[useBiopharmaProgram]', err); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [id]);

  return { program, loading };
}

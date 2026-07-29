/**
 * useAuthoringIntelligence — Fetches real readiness + contradiction data
 * for the active section/project context.
 *
 * Feeds into AuthoringContextPack so AnA and SectionWorkspace get real data.
 *
 * @module concept2cure/hooks/useAuthoringIntelligence
 */

import { useEffect, useState, useCallback } from 'react';
import { getAuthHeaders as getCanonicalAuthHeaders } from '@/utils/authToken';
import type { ReadinessSnapshot, ContradictionEntry } from '../../../../shared/types/authoring-context';

interface AuthoringIntelligence {
  readiness: ReadinessSnapshot | undefined;
  contradictions: ContradictionEntry[] | undefined;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

// Delegates to the canonical builder so both the bearer and the
// x-organization-id tenant header are sent — the previous version omitted the
// tenant header entirely on /api/authoring-actions.
function getAuthHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...getCanonicalAuthHeaders(),
  };
}

export function useAuthoringIntelligence(
  projectId: string | undefined,
  sectionCode: string | null | undefined
): AuthoringIntelligence {
  const [readiness, setReadiness] = useState<ReadinessSnapshot | undefined>();
  const [contradictions, setContradictions] = useState<ContradictionEntry[] | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!projectId || !sectionCode) {
      setReadiness(undefined);
      setContradictions(undefined);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/authoring-actions/section-context/${projectId}/${sectionCode}`,
        { headers: getAuthHeaders() }
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (data.readiness) {
        setReadiness(data.readiness);
      }
      if (data.contradictions) {
        setContradictions(data.contradictions);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch authoring intelligence';
      setError(msg);
      // Don't clear existing data on error — keep stale data
    } finally {
      setIsLoading(false);
    }
  }, [projectId, sectionCode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    readiness,
    contradictions,
    isLoading,
    error,
    refetch: fetchData,
  };
}

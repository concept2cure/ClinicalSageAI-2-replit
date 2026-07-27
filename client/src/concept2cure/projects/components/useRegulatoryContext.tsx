/**
 * Fetches the contextual regulatory plan for a project — MDX-PM-01.
 *
 * Kept in its OWN hook, deliberately NOT added to the Promise.all in
 * useProjectData. That aggregate rejects the whole cockpit if any one request
 * fails, so folding this in would mean a server without the endpoint — or a
 * database without the work-package tables — blanks the entire project page and
 * shows "Failed to load project". A contextual enhancement must never be able to
 * take down the surface it enhances.
 *
 * So every failure here resolves to `null`, which the renderer treats exactly as
 * it treats a non-MDX project: nothing extra is shown. The failure is logged, not
 * surfaced, because there is no action a user can take about it and a red banner
 * on a working page is noise.
 *
 * @module client/src/concept2cure/projects/components/useRegulatoryContext
 */

import * as React from 'react';

export interface PlanTaskRollup {
  total: number;
  complete: number;
  blocked: number;
}

export interface PersistedPackageView {
  id: string;
  status: string;
  statusReason: string | null;
  ownerUserId: number | null;
  targetDate: string | null;
  completedAt: string | null;
  clientVisibility: string;
}

export interface PlanItemView {
  archetypeId: string | null;
  label: string;
  lifecyclePhase: string | null;
  purpose: string | null;
  applicability: string;
  appliesWhen: string | null;
  applicabilityBasis: string | null;
  studyArchetypes: string[];
  deliverables: string[];
  decisions: string[];
  references: string[];
  filings: string[];
  unsettledInputs: string[];
  persisted: PersistedPackageView | null;
  tasks: PlanTaskRollup;
  offPlan: boolean;
}

export interface PlanSectionView {
  id: string;
  label: string;
  description: string;
}

export interface ProjectRegulatoryPlanData {
  context: {
    vertical: string;
    specialization: string;
    specializationSource: string;
    primaryIndustry: string;
    needsDeclaration: string[];
    terminology: Record<string, string>;
  };
  sections: PlanSectionView[];
  packages: PlanItemView[];
  registryLimit: string | null;
  registryVersion: string;
  awaitingDeclaration: boolean;
}

export function useRegulatoryContext(projectId: string): ProjectRegulatoryPlanData | null {
  const [plan, setPlan] = React.useState<ProjectRegulatoryPlanData | null>(null);

  React.useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    // Clear on id change, so a stale plan from the previous project cannot show
    // against the new one while this request is in flight.
    setPlan(null);

    fetch(
      `/api/c2c/projects/${encodeURIComponent(projectId)}/regulatory-context`,
      { credentials: 'include' },
    )
      .then(res => (res.ok ? res.json() : null))
      .then((body: { data?: ProjectRegulatoryPlanData } | null) => {
        if (cancelled) return;
        setPlan(body?.data ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.warn('[projects] regulatory context unavailable', err);
        setPlan(null);
      });

    return () => { cancelled = true; };
  }, [projectId]);

  return plan;
}

/**
 * useOnboarding — live data adapter for the migration importer surface.
 *
 * Calls `GET /api/mdx/onboarding/:tenantId`. Endpoint not yet wired;
 * surface falls back to fixture.
 */

import { useFetchJson } from './useFetchJson';
import {
  ONB_ARTIFACTS,
  ONB_KPIS,
  ONB_STEPS,
  ONB_VALIDATIONS,
} from '../data/onboarding';

type StepRow = (typeof ONB_STEPS)[number];
type ArtifactRow = (typeof ONB_ARTIFACTS)[number];
type ValidationRow = (typeof ONB_VALIDATIONS)[number];
type KpiRow = (typeof ONB_KPIS)[number];

interface OnboardingPayload {
  data: {
    steps: StepRow[];
    artifacts: ArtifactRow[];
    validations: ValidationRow[];
    kpis: KpiRow[];
    currentStep: string;
  };
}

export interface UseOnboardingResult {
  steps: StepRow[] | null;
  artifacts: ArtifactRow[] | null;
  validations: ValidationRow[] | null;
  kpis: KpiRow[] | null;
  currentStep: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useOnboarding(tenantId: string | null): UseOnboardingResult {
  const url = tenantId
    ? `/api/mdx/onboarding/${encodeURIComponent(tenantId)}`
    : null;
  const { data, loading, error, refresh } =
    useFetchJson<OnboardingPayload>(url);
  return {
    steps: data?.data.steps ?? null,
    artifacts: data?.data.artifacts ?? null,
    validations: data?.data.validations ?? null,
    kpis: data?.data.kpis ?? null,
    currentStep: data?.data.currentStep ?? null,
    loading,
    error,
    refresh,
  };
}

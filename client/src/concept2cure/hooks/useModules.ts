/**
 * useModules — Unified module access + eCTD compile hooks
 *
 * Convenience wrapper over useLicenseGating that provides:
 *   - `canAccess(moduleId)` — boolean check for any module
 *   - `isEctdEnabled` / `isIndEnabled` / etc — named booleans
 *   - `compileEctd` — mutation to trigger eCTD compilation
 *   - `ectdStatus` — query for eCTD readiness dashboard
 *   - `ectdHistory` — compilation history
 *
 * @module concept2cure/hooks/useModules
 * @version 1.0.0
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLicenseGating } from './useLicense';
import { apiRequest } from '@/lib/queryClient';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ModuleCompilationStatus {
  moduleCode: string;
  moduleName: string;
  totalSections: number;
  completedSections: number;
  requiredSections: number;
  requiredCompleted: number;
  status: 'complete' | 'partial' | 'missing';
}

export interface CompilationResult {
  id: string;
  projectId: number;
  status: 'pending' | 'compiling' | 'validating' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  modules: ModuleCompilationStatus[];
  xmlBackbone?: string;
  validationResults?: Array<{
    rule: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    sectionCode?: string;
    fix?: string;
  }>;
  submissionReady: boolean;
  errors: string[];
  warnings: string[];
}

export interface EctdReadiness {
  projectId: number;
  overallReadiness: number;
  submissionReady: boolean;
  modules: Array<{
    moduleCode: string;
    moduleName: string;
    totalSections: number;
    requiredSections: number;
    completedRequired: number;
    completionPct: number;
    ready: boolean;
  }>;
  totalSections: number;
  totalRequired: number;
  totalCompleted: number;
  lastUpdated: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE IDS — canonical list for feature gating
// ═══════════════════════════════════════════════════════════════════════════════

export const MODULE_IDS = {
  CORE: 'core',
  ECTD_COAUTHOR: 'ectd-coauthor', // [BATCH 4] standalone mode removed, ID retained for backend feature gating
  IND_FILING: 'ind-filing',
  DOC_CANVAS: 'doc-canvas',
  ANALYTICS_HUB: 'analytics-hub',
  COMPLIANCE_MONITOR: 'compliance-monitor',
  STRATEGIC_ADVISOR: 'strategic-advisor',
  CMC: 'cmc-module',
  MED_DEVICE: 'med-device',
  VAULT: 'vault',
  IVDR: 'ivdr-module',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HOOK: useModules()
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Primary module-gating hook for the C2C platform.
 *
 * Usage:
 * ```tsx
 * const { isEctdEnabled, isIndEnabled, canAccess, tier } = useModules();
 *
 * if (!isEctdEnabled) return <UpgradeBanner module="eCTD Co-Author" />;
 * ```
 */
export function useModules() {
  const { isLoading, tier, industryMode, enabledModuleIds, canAccessModule, canAccessLayoutMode } =
    useLicenseGating();

  // Named convenience booleans
  const isEctdEnabled = useMemo(() => canAccessModule(MODULE_IDS.ECTD_COAUTHOR), [canAccessModule]);
  const isIndEnabled = useMemo(() => canAccessModule(MODULE_IDS.IND_FILING), [canAccessModule]);
  const isDocCanvasEnabled = useMemo(
    () => canAccessModule(MODULE_IDS.DOC_CANVAS),
    [canAccessModule]
  );
  const isAnalyticsEnabled = useMemo(
    () => canAccessModule(MODULE_IDS.ANALYTICS_HUB),
    [canAccessModule]
  );
  const isComplianceEnabled = useMemo(
    () => canAccessModule(MODULE_IDS.COMPLIANCE_MONITOR),
    [canAccessModule]
  );
  const isCmcEnabled = useMemo(() => canAccessModule(MODULE_IDS.CMC), [canAccessModule]);
  const isMedDeviceEnabled = useMemo(
    () => canAccessModule(MODULE_IDS.MED_DEVICE),
    [canAccessModule]
  );
  const isVaultEnabled = useMemo(() => canAccessModule(MODULE_IDS.VAULT), [canAccessModule]);
  const isIvdrEnabled = useMemo(() => canAccessModule(MODULE_IDS.IVDR), [canAccessModule]);

  return {
    isLoading,
    tier,
    industryMode,
    enabledModuleIds,

    // Named booleans
    isEctdEnabled,
    isIndEnabled,
    isDocCanvasEnabled,
    isAnalyticsEnabled,
    isComplianceEnabled,
    isCmcEnabled,
    isMedDeviceEnabled,
    isVaultEnabled,
    isIvdrEnabled,

    // Generic access check
    canAccess: canAccessModule,
    canAccessLayout: canAccessLayoutMode,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// eCTD COMPILE HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Trigger eCTD compilation for a project.
 *
 * Usage:
 * ```tsx
 * const { mutate: compile, isPending, data } = useEctdCompile(projectId);
 * compile({ submissionType: 'initial', region: 'FDA' });
 * ```
 */
export function useEctdCompile(projectId: number | string) {
  const queryClient = useQueryClient();
  const pid =
    typeof projectId === 'string'
      ? parseInt(String(projectId).replace(/^proj_/, ''), 10)
      : projectId;

  return useMutation({
    mutationFn: async (
      opts: { submissionType?: string; region?: string; modules?: string[] } = {}
    ) => {
      const res = await apiRequest('POST', `/api/ectd-compile/${pid}/compile`, {
        submissionType: opts.submissionType || 'initial',
        region: opts.region || 'FDA',
        modules: opts.modules,
      });
      return res.json() as Promise<CompilationResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ectd-status', pid] });
      queryClient.invalidateQueries({ queryKey: ['ectd-history', pid] });
    },
  });
}

/**
 * Get eCTD compilation readiness for a project.
 */
export function useEctdStatus(projectId: number | string) {
  const pid =
    typeof projectId === 'string'
      ? parseInt(String(projectId).replace(/^proj_/, ''), 10)
      : projectId;

  return useQuery({
    queryKey: ['ectd-status', pid],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/ectd-compile/${pid}/status`);
      return res.json() as Promise<EctdReadiness>;
    },
    enabled: !!pid,
    staleTime: 30_000,
  });
}

/**
 * Get eCTD compilation history for a project.
 */
export function useEctdHistory(projectId: number | string) {
  const pid =
    typeof projectId === 'string'
      ? parseInt(String(projectId).replace(/^proj_/, ''), 10)
      : projectId;

  return useQuery({
    queryKey: ['ectd-history', pid],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/ectd-compile/${pid}/history`);
      return res.json() as Promise<{ projectId: number; compilations: any[] }>;
    },
    enabled: !!pid,
    staleTime: 60_000,
  });
}

/**
 * Run eCTD pre-compile validation without compiling.
 */
export function useEctdValidate(projectId: number | string) {
  const pid =
    typeof projectId === 'string'
      ? parseInt(String(projectId).replace(/^proj_/, ''), 10)
      : projectId;

  return useMutation({
    mutationFn: async (opts: { region?: string } = {}) => {
      const res = await apiRequest('POST', `/api/ectd-compile/${pid}/validate`, {
        region: opts.region || 'FDA',
      });
      return res.json();
    },
  });
}

export default useModules;

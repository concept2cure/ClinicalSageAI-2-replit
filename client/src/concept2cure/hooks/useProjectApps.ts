/**
 * useProjectApps — Manage apps connected to a project.
 *
 * Claude.ai parity: Projects can have "connected apps" that become
 * project-aware, using all project data (knowledge, instructions, documents)
 * to inform their behavior. When connected, the app's role is initialized
 * in project memory so AnA and the app share context.
 *
 * @module concept2cure/hooks/useProjectApps
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from './queryKeys';
import { useToast } from '@/hooks/use-toast';

// ─── App Catalog ────────────────────────────────────────────────────────────

export type AppCategory = 'strategy' | 'builder' | 'studio' | 'intelligence';

export interface AppDefinition {
  id: string;
  name: string;
  description: string;
  category: AppCategory;
  icon: string; // lucide icon name
  tracks: string[]; // submission types this app is relevant for
  memoryRole: string; // role description injected into project memory when connected
}

export const CATEGORY_META: Record<AppCategory, { label: string; color: string }> = {
  strategy: { label: 'Strategy', color: '#1c1917' },    // stone-900
  builder: { label: 'Builders', color: '#44403c' },     // stone-700
  studio: { label: 'Studio', color: '#57534e' },        // stone-600
  intelligence: { label: 'Intelligence', color: '#78716c' }, // stone-500
};

export const APP_CATALOG: AppDefinition[] = [
  {
    id: 'deep-research',
    name: 'Deep Research',
    description: 'Search ClinicalTrials.gov, PubMed, FDA, EMA and synthesize evidence',
    category: 'strategy',
    icon: 'Search',
    tracks: ['IND', 'NDA', 'BLA', 'MAA', '510K', 'PMA', 'DE_NOVO', 'EUA', 'IVDR'],
    memoryRole: 'Deep Research is connected to this project. It can search across ClinicalTrials.gov, PubMed, FDA databases, EMA databases, and synthesize evidence relevant to the project\'s submission type and therapeutic area.',
  },
  {
    id: 'precedent-intelligence',
    name: 'Precedent Intelligence',
    description: 'Regulatory precedent analysis, CRL/RTF patterns, and approval history',
    category: 'strategy',
    icon: 'Scale',
    tracks: ['IND', 'NDA', 'BLA', 'MAA', '510K', 'PMA', 'DE_NOVO', 'EUA', 'IVDR'],
    memoryRole: 'Precedent Intelligence is connected. It provides regulatory precedent analysis including Complete Response Letter patterns, Refuse-to-File signals, approval history for similar products, and reviewer tendencies.',
  },
  {
    id: 'medical-device',
    name: 'Medical Device & Diagnostics',
    description: 'Unified workspace for 510(k), PMA, De Novo, CER, and IVDR — predicate analysis, clinical evidence, submission assembly',
    category: 'builder',
    icon: 'Heart',
    tracks: ['510K', 'PMA', 'DE_NOVO', 'EUA', 'IVDR'],
    memoryRole: 'Medical Device & Diagnostics workspace is connected. It unifies 510(k) predicate comparison and substantial equivalence, PMA clinical evidence and panel prep, De Novo classification, and EU MDR/IVDR Clinical Evaluation Reports — adapting to the active project\'s submission type.',
  },
  {
    id: 'safety-narrative',
    name: 'Safety Narrative',
    description: 'Safety narrative builder for clinical study reports and submissions',
    category: 'builder',
    icon: 'ShieldCheck',
    tracks: ['IND', 'NDA', 'BLA', 'MAA', 'PMA'],
    memoryRole: 'Safety Narrative is connected. It generates safety narratives for clinical study reports, analyzing adverse events, serious adverse events, and safety signals with MedDRA coding and regulatory-compliant language.',
  },
  {
    id: 'biostatistics',
    name: 'Biostatistics',
    description: 'Statistical analysis, power calculations, endpoint design, SAP generation',
    category: 'studio',
    icon: 'BarChart3',
    tracks: ['IND', 'NDA', 'BLA', 'MAA', 'PMA'],
    memoryRole: 'Biostatistics studio is connected. It provides statistical analysis planning, sample size calculations, power analysis, endpoint selection rationale, multiplicity adjustment strategies, and statistical analysis plan generation.',
  },
  {
    id: 'csr-intelligence',
    name: 'CSR Intelligence',
    description: 'Clinical Study Report authoring and analysis per ICH E3 guidelines',
    category: 'builder',
    icon: 'BookOpen',
    tracks: ['IND', 'NDA', 'BLA', 'MAA'],
    memoryRole: 'CSR Intelligence is connected. It assists with Clinical Study Report authoring and analysis following ICH E3 structure, including study design, patient disposition, efficacy results, safety results, and cross-study comparison.',
  },
  {
    id: 'cmc',
    name: 'CMC Module',
    description: 'Chemistry, Manufacturing, and Controls documentation (CTD Module 3)',
    category: 'builder',
    icon: 'FlaskConical',
    tracks: ['IND', 'NDA', 'BLA', 'MAA'],
    memoryRole: 'CMC Module is connected. It manages Chemistry, Manufacturing, and Controls documentation for CTD Module 3 including drug substance, drug product, specifications, stability data, and manufacturing process descriptions.',
  },
  {
    id: 'device-strategy',
    name: 'Device Strategy & FDA Engagement',
    description: 'Device classification, pathway selection, predicate search, and FDA Pre-Sub planning',
    category: 'strategy',
    icon: 'Compass',
    tracks: ['510K', 'PMA', 'DE_NOVO', 'EUA', 'IVDR'],
    memoryRole: 'Device Strategy & FDA Engagement is connected. It supports device classification (Class I/II/III), regulatory pathway selection (510(k), De Novo, PMA, HDE, Exempt), FDA product code lookup, predicate device search and substantial equivalence analysis, and FDA Pre-Submission (Q-Sub) package preparation including feedback questions and meeting prep.',
  },
  {
    id: 'device-engineering',
    name: 'Device Engineering',
    description: 'ISO 14971 risk management, IEC 62304 software & cybersecurity, IEC 62366 human factors, and ISO 10993 biocompatibility',
    category: 'builder',
    icon: 'ShieldAlert',
    tracks: ['510K', 'PMA', 'DE_NOVO', 'EUA', 'IVDR'],
    memoryRole: 'Device Engineering is connected. It covers the four core engineering disciplines for medical devices: ISO 14971 risk management (hazard analysis, FMEA, risk control matrix, RMR), IEC 62304 software lifecycle and FDA cybersecurity premarket guidance (Class A/B/C, threat modeling, SBOM), IEC 62366-1 human factors and usability engineering (use specification, task analysis, summative validation), and ISO 10993 biocompatibility (endpoint test selection, Biological Evaluation Report).',
  },
  {
    id: 'compliance-monitor',
    name: 'Compliance Monitor',
    description: 'Real-time regulatory compliance checking and gap analysis',
    category: 'intelligence',
    icon: 'ShieldCheck',
    tracks: ['IND', 'NDA', 'BLA', 'MAA', '510K', 'PMA', 'DE_NOVO', 'EUA', 'IVDR'],
    memoryRole: 'Compliance Monitor is connected. It performs real-time regulatory compliance checking, identifies documentation gaps, flags inconsistencies across submission sections, and tracks adherence to ICH/FDA/EMA guidelines.',
  },
  {
    id: 'evidence-engine',
    name: 'Evidence Engine',
    description: 'Clinical evidence synthesis, literature review, and data extraction',
    category: 'intelligence',
    icon: 'Database',
    tracks: ['IND', 'NDA', 'BLA', 'MAA', '510K', 'PMA', 'DE_NOVO', 'EUA', 'IVDR'],
    memoryRole: 'Evidence Engine is connected. It manages clinical evidence synthesis, systematic literature reviews, data extraction from published studies, and evidence quality assessment using GRADE methodology.',
  },
];

// ─── Connected App State ─────────────────────────────────────────────────────

export interface ConnectedApp {
  appId: string;
  connectedAt: string;
  status: 'active' | 'paused';
}

interface UseProjectAppsReturn {
  connectedApps: ConnectedApp[];
  availableApps: AppDefinition[];
  /** Available apps grouped by category (only categories with apps) */
  availableByCategory: Array<{ category: AppCategory; label: string; color: string; apps: AppDefinition[] }>;
  isLoading: boolean;
  /** ID of app currently being connected (for loading indicator) */
  connectingAppId: string | null;
  connectApp: (appId: string) => Promise<void>;
  disconnectApp: (appId: string) => Promise<void>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useProjectApps(
  projectId: string | null,
  submissionType?: string
): UseProjectAppsReturn {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [connectingAppId, setConnectingAppId] = useState<string | null>(null);

  // ── Query: load connected apps ──
  const { data: connectedApps = [], isLoading } = useQuery<ConnectedApp[]>({
    queryKey: queryKeys.projects.apps(projectId ?? ''),
    queryFn: async () => {
      if (!projectId) return [];
      try {
        const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/apps`);
        const payload = await res.json().catch(() => ({}));
        const apps = payload?.data?.apps ?? payload?.data ?? payload?.apps ?? [];
        const result = Array.isArray(apps) ? apps : [];
        // Sync to localStorage as backup
        if (result.length > 0) {
          localStorage.setItem(`c2c_project_apps_${projectId}`, JSON.stringify(result));
        }
        return result;
      } catch {
        // Fallback to localStorage
        const stored = localStorage.getItem(`c2c_project_apps_${projectId}`);
        if (stored) {
          try { return JSON.parse(stored); } catch { return []; }
        }
        return [];
      }
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // ── Filter available apps by submission type relevance ──
  const availableApps = useMemo(() => {
    return APP_CATALOG.filter(app => {
      const isConnected = connectedApps.some(ca => ca.appId === app.id);
      if (isConnected) return false;
      if (!submissionType) return true;
      return app.tracks.includes(submissionType);
    });
  }, [connectedApps, submissionType]);

  // ── Group available apps by category ──
  const availableByCategory = useMemo(() => {
    const groups: Record<AppCategory, AppDefinition[]> = {
      strategy: [],
      builder: [],
      studio: [],
      intelligence: [],
    };
    for (const app of availableApps) {
      groups[app.category].push(app);
    }
    return (Object.keys(groups) as AppCategory[])
      .filter(cat => groups[cat].length > 0)
      .map(cat => ({
        category: cat,
        label: CATEGORY_META[cat].label,
        color: CATEGORY_META[cat].color,
        apps: groups[cat],
      }));
  }, [availableApps]);

  // ── Mutation: connect app ──
  const connectMutation = useMutation({
    mutationFn: async (appId: string) => {
      if (!projectId) throw new Error('No project');
      const appDef = APP_CATALOG.find(a => a.id === appId);
      const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/apps`, {
        appId,
        memoryRole: appDef?.memoryRole,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || 'Failed to connect app');
      }
      return { appId, appDef };
    },
    onMutate: async (appId) => {
      setConnectingAppId(appId);
      // Cancel outgoing fetches
      await queryClient.cancelQueries({ queryKey: queryKeys.projects.apps(projectId ?? '') });
      // Snapshot previous
      const previous = queryClient.getQueryData<ConnectedApp[]>(queryKeys.projects.apps(projectId ?? ''));
      // Optimistic update
      const newApp: ConnectedApp = { appId, connectedAt: new Date().toISOString(), status: 'active' };
      queryClient.setQueryData<ConnectedApp[]>(
        queryKeys.projects.apps(projectId ?? ''),
        old => [...(old ?? []), newApp],
      );
      return { previous };
    },
    onError: (_err, _appId, context) => {
      // Rollback
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.projects.apps(projectId ?? ''), context.previous);
      }
      toast({ title: 'Connection failed', description: 'Could not connect the app. Try again.', variant: 'destructive' });
    },
    onSuccess: ({ appDef }) => {
      toast({ title: `${appDef?.name ?? 'App'} connected`, description: 'Now project-aware and initialized in memory.' });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.apps(projectId ?? '') });
      queryClient.invalidateQueries({ queryKey: ['project-intelligence'] });
      queryClient.invalidateQueries({ queryKey: ['project-knowledge'] });
    },
    onSettled: () => {
      setConnectingAppId(null);
    },
  });

  // ── Mutation: disconnect app ──
  const disconnectMutation = useMutation({
    mutationFn: async (appId: string) => {
      if (!projectId) throw new Error('No project');
      const res = await apiRequest('DELETE', `/api/concept2cure/projects/${projectId}/apps/${appId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || 'Failed to disconnect app');
      }
      return appId;
    },
    onMutate: async (appId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projects.apps(projectId ?? '') });
      const previous = queryClient.getQueryData<ConnectedApp[]>(queryKeys.projects.apps(projectId ?? ''));
      queryClient.setQueryData<ConnectedApp[]>(
        queryKeys.projects.apps(projectId ?? ''),
        old => (old ?? []).filter(a => a.appId !== appId),
      );
      return { previous };
    },
    onError: (_err, _appId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.projects.apps(projectId ?? ''), context.previous);
      }
      toast({ title: 'Disconnect failed', description: 'Could not remove the app. Try again.', variant: 'destructive' });
    },
    onSuccess: (appId) => {
      const appDef = APP_CATALOG.find(a => a.id === appId);
      toast({ title: `${appDef?.name ?? 'App'} disconnected`, description: 'Removed from project context.' });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.apps(projectId ?? '') });
      queryClient.invalidateQueries({ queryKey: ['project-intelligence'] });
      queryClient.invalidateQueries({ queryKey: ['project-knowledge'] });
    },
  });

  const connectApp = useCallback(async (appId: string) => {
    await connectMutation.mutateAsync(appId);
  }, [connectMutation]);

  const disconnectApp = useCallback(async (appId: string) => {
    await disconnectMutation.mutateAsync(appId);
  }, [disconnectMutation]);

  return {
    connectedApps,
    availableApps,
    availableByCategory,
    isLoading,
    connectingAppId,
    connectApp,
    disconnectApp,
  };
}

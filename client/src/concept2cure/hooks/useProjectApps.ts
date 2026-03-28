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

import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

// ─── App Catalog ────────────────────────────────────────────────────────────

export interface AppDefinition {
  id: string;
  name: string;
  description: string;
  category: 'strategy' | 'builder' | 'studio' | 'intelligence';
  icon: string; // lucide icon name
  tracks: string[]; // submission types this app is relevant for
  memoryRole: string; // role description injected into project memory when connected
}

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
    id: '510k-workspace',
    name: '510(k) Workspace',
    description: 'Predicate comparison, substantial equivalence testing, submission package',
    category: 'builder',
    icon: 'FileText',
    tracks: ['510K', 'DE_NOVO'],
    memoryRole: '510(k) Workspace is connected. It manages predicate device comparison, substantial equivalence determination, performance testing strategy, and the full 510(k) submission package assembly.',
  },
  {
    id: 'pma-workspace',
    name: 'PMA Workspace',
    description: 'Premarket approval application workspace with panel prep',
    category: 'builder',
    icon: 'Heart',
    tracks: ['PMA'],
    memoryRole: 'PMA Workspace is connected. It handles premarket approval application development, clinical data organization, manufacturing information, and advisory panel preparation materials.',
  },
  {
    id: 'cer-generator',
    name: 'CER Generator',
    description: 'Clinical evaluation report builder for EU MDR/IVDR compliance',
    category: 'builder',
    icon: 'Microscope',
    tracks: ['IVDR', '510K', 'PMA', 'DE_NOVO', 'EUA'],
    memoryRole: 'CER Generator is connected. It produces EU MDR/IVDR-compliant Clinical Evaluation Reports including literature search, clinical data appraisal, benefit-risk analysis, and PMCF planning.',
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
    id: 'csr-builder',
    name: 'CSR Builder',
    description: 'Clinical Study Report authoring per ICH E3 guidelines',
    category: 'builder',
    icon: 'BookOpen',
    tracks: ['IND', 'NDA', 'BLA', 'MAA'],
    memoryRole: 'CSR Builder is connected. It assists with Clinical Study Report authoring following ICH E3 structure, including study design, patient disposition, efficacy results, safety results, and study conclusions.',
  },
  {
    id: 'cmc-platform',
    name: 'CMC Platform',
    description: 'Chemistry, Manufacturing, and Controls documentation (CTD Module 3)',
    category: 'builder',
    icon: 'FlaskConical',
    tracks: ['IND', 'NDA', 'BLA', 'MAA'],
    memoryRole: 'CMC Platform is connected. It manages Chemistry, Manufacturing, and Controls documentation for CTD Module 3 including drug substance, drug product, specifications, stability data, and manufacturing process descriptions.',
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
  isLoading: boolean;
  connectApp: (appId: string) => Promise<void>;
  disconnectApp: (appId: string) => Promise<void>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useProjectApps(
  projectId: string | null,
  submissionType?: string
): UseProjectAppsReturn {
  const queryClient = useQueryClient();
  const [connectedApps, setConnectedApps] = useState<ConnectedApp[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load connected apps when project changes
  useEffect(() => {
    if (!projectId) {
      setConnectedApps([]);
      return;
    }

    const load = async () => {
      setIsLoading(true);
      try {
        const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/apps`);
        const payload = await res.json().catch(() => ({}));
        const apps = payload?.data ?? payload?.apps ?? [];
        setConnectedApps(Array.isArray(apps) ? apps : []);
      } catch {
        // Fallback to localStorage
        const stored = localStorage.getItem(`c2c_project_apps_${projectId}`);
        if (stored) {
          try { setConnectedApps(JSON.parse(stored)); } catch { setConnectedApps([]); }
        }
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [projectId]);

  // Persist to localStorage as backup
  useEffect(() => {
    if (projectId && connectedApps.length > 0) {
      localStorage.setItem(`c2c_project_apps_${projectId}`, JSON.stringify(connectedApps));
    }
  }, [projectId, connectedApps]);

  // Filter available apps by submission type relevance
  const availableApps = APP_CATALOG.filter(app => {
    const isConnected = connectedApps.some(ca => ca.appId === app.id);
    if (isConnected) return false;
    if (!submissionType) return true;
    return app.tracks.includes(submissionType);
  });

  const connectApp = useCallback(async (appId: string) => {
    if (!projectId) return;

    const newApp: ConnectedApp = {
      appId,
      connectedAt: new Date().toISOString(),
      status: 'active',
    };

    // Optimistic update
    setConnectedApps(prev => [...prev, newApp]);

    try {
      const appDef = APP_CATALOG.find(a => a.id === appId);
      await apiRequest('POST', `/api/concept2cure/projects/${projectId}/apps`, {
        appId,
        memoryRole: appDef?.memoryRole,
      });
      // Invalidate project intelligence to reflect new memory entry
      queryClient.invalidateQueries({ queryKey: ['project-intelligence'] });
      queryClient.invalidateQueries({ queryKey: ['project-knowledge'] });
    } catch {
      // API failed but keep local state — localStorage backup handles persistence
    }
  }, [projectId, queryClient]);

  const disconnectApp = useCallback(async (appId: string) => {
    if (!projectId) return;

    // Optimistic update
    setConnectedApps(prev => prev.filter(a => a.appId !== appId));

    try {
      await apiRequest('DELETE', `/api/concept2cure/projects/${projectId}/apps/${appId}`);
      queryClient.invalidateQueries({ queryKey: ['project-intelligence'] });
      queryClient.invalidateQueries({ queryKey: ['project-knowledge'] });
    } catch {
      // API failed but keep local state
    }
  }, [projectId, queryClient]);

  return {
    connectedApps,
    availableApps,
    isLoading,
    connectApp,
    disconnectApp,
  };
}

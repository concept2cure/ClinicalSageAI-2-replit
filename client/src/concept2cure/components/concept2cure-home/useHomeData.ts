/**
 * useHomeData — fetches real dashboard metrics and recent activity for
 * Concept2CureHome. Runs three parallel requests on mount:
 *  - GET /api/concept2cure/projects        → active project count
 *  - GET /api/concept2cure/projects/all/artifacts-summary → artifact counts
 *  - GET /api/chat/threads?limit=5         → recent AnA conversations
 *
 * All requests are fire-and-forget — failures degrade gracefully to null,
 * leaving the home page's static fallback data visible.
 *
 * @module client/src/concept2cure/components/concept2cure-home/useHomeData
 */

import { useEffect, useState } from 'react';

import { getAuthHeaders } from '@/utils/authToken';

export interface HomeMetrics {
  /** Number of active projects in this org */
  projectCount: number | null;
  /** Total artifact count across all projects */
  artifactTotal: number | null;
  /** Artifacts in draft state */
  artifactDraft: number | null;
}

export interface RecentThread {
  id: string;
  title: string;
  updatedAt: string;
}

export interface HomeProject {
  id: string;
  name: string;
  code?: string;
  pathway?: string;
}

export interface HomeData {
  metrics: HomeMetrics;
  recentThreads: RecentThread[];
  projects: HomeProject[];
  loading: boolean;
}

async function apiFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function useHomeData(): HomeData {
  const [metrics, setMetrics] = useState<HomeMetrics>({
    projectCount: null,
    artifactTotal: null,
    artifactDraft: null,
  });
  const [recentThreads, setRecentThreads] = useState<RecentThread[]>([]);
  const [projects, setProjects] = useState<HomeProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [projectsRes, artifactsRes, threadsRes] = await Promise.allSettled([
        apiFetch<{ data?: any[] }>('/api/concept2cure/projects'),
        apiFetch<{ data?: { total?: number; draft?: number } }>('/api/concept2cure/projects/all/artifacts-summary'),
        apiFetch<{ threads?: Array<{ id: string; title?: string; updatedAt?: string; lastMessage?: string }> }>('/api/chat/threads?limit=5'),
      ]);

      if (cancelled) return;

      // Projects: count + the first 6 entries (id + name + code/pathway)
      let projectCount: number | null = null;
      let projectList: HomeProject[] = [];
      if (projectsRes.status === 'fulfilled' && projectsRes.value) {
        const raw = (projectsRes.value as any)?.data;
        const arr = Array.isArray(raw)
          ? raw
          : Array.isArray(projectsRes.value)
            ? (projectsRes.value as any[])
            : [];
        projectCount = arr.length;
        projectList = arr.slice(0, 6).map((p: any) => ({
          id: String(p.id ?? p.projectId ?? ''),
          name: String(p.name ?? p.title ?? p.code ?? 'Untitled project'),
          code: p.code ? String(p.code) : undefined,
          pathway: p.pathway ? String(p.pathway) : undefined,
        })).filter(p => p.id);
      }

      // Artifact counts
      let artifactTotal: number | null = null;
      let artifactDraft: number | null = null;
      if (artifactsRes.status === 'fulfilled' && artifactsRes.value) {
        const d = (artifactsRes.value as any)?.data || artifactsRes.value;
        if (typeof d?.total === 'number') artifactTotal = d.total;
        if (typeof d?.draft === 'number') artifactDraft = d.draft;
      }

      // Recent threads
      let threads: RecentThread[] = [];
      if (threadsRes.status === 'fulfilled' && threadsRes.value) {
        const raw = (threadsRes.value as any)?.threads || threadsRes.value;
        if (Array.isArray(raw)) {
          threads = raw.slice(0, 5).map((t: any) => ({
            id: String(t.id || t.threadId || ''),
            title: t.title || t.lastMessage || 'AnA conversation',
            updatedAt: t.updatedAt || t.updated_at || new Date().toISOString(),
          }));
        }
      }

      setMetrics({ projectCount, artifactTotal, artifactDraft });
      setRecentThreads(threads);
      setProjects(projectList);
      setLoading(false);
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  return { metrics, recentThreads, projects, loading };
}

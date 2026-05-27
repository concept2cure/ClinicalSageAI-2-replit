import { useEffect, useState } from 'react';
import { getAuthHeaders } from '@/utils/authToken';

export interface ProjectFile {
  name: string;
  author: string;
  when: string;
  size: number;
  lines: number;
  kind: string;
}

interface ApiArtifact {
  id: string;
  projectId: string;
  title: string;
  type: string;
  category?: string;
  content?: string;
  version: number;
  status: string;
  ctdSection?: string | null;
  createdAt: string;
  updatedAt: string;
}

function relTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (!isFinite(d)) return 'recently';
  const m = Math.floor(d / 60_000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function mapArtifact(a: ApiArtifact): ProjectFile {
  const content = a.content ?? '';
  return {
    name: a.title,
    author: '—',
    when: a.updatedAt ? relTime(a.updatedAt) : 'recently',
    size: content.length,
    lines: content ? content.split('\n').length : 0,
    kind: a.category || a.type || 'document',
  };
}

export function useProjectFiles(projectId: string): {
  files: ProjectFile[];
  loading: boolean;
  refetch: () => void;
} {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/concept2cure/projects/${projectId}/artifacts`, {
          headers: getAuthHeaders(),
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ApiArtifact[];
        const artifacts = Array.isArray(body) ? body : [];
        if (!cancelled) {
          setFiles(artifacts.map(mapArtifact));
        }
      } catch {
        if (!cancelled) setFiles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [projectId, tick]);

  return { files, loading, refetch: () => setTick(t => t + 1) };
}

import { useEffect, useState } from 'react';
import { getAuthHeaders } from '@/utils/authToken';
import type { ActivityEvent } from '../types';

interface ApiActivityItem {
  id: string;
  type: string;
  activityType: string;
  entityType: string;
  entityId: string;
  description: string;
  details?: Record<string, unknown>;
  userName: string | null;
  timestamp: string;
}

function mapEntityTypeToKind(entityType: string): ActivityEvent['kind'] {
  if (entityType === 'document') return 'file';
  if (entityType === 'memory') return 'memory';
  if (entityType === 'instructions') return 'instr';
  return 'lifecycle';
}

function extractTarget(item: ApiActivityItem): string {
  if (item.description) return item.description;
  return item.entityId || '—';
}

function adaptItem(item: ApiActivityItem): ActivityEvent {
  return {
    ts: item.timestamp,
    kind: mapEntityTypeToKind(item.entityType),
    actor: item.userName || 'System',
    role: 'Contributor',
    action: `${item.activityType} ${item.entityType}`.trim(),
    target: extractTarget(item),
    ip: '—',
    e: false,
    sig: '—',
  };
}

export interface UseProjectActivityReturn {
  events: ActivityEvent[];
  loading: boolean;
}

export function useProjectActivity(projectId: string): UseProjectActivityReturn {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(
          `/api/concept2cure/projects/${encodeURIComponent(projectId)}/activity?limit=50`,
          {
            headers: getAuthHeaders(),
            credentials: 'include',
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ApiActivityItem[] | { data?: ApiActivityItem[] };
        const raw: ApiActivityItem[] = Array.isArray(body)
          ? body
          : Array.isArray((body as { data?: ApiActivityItem[] }).data)
            ? (body as { data: ApiActivityItem[] }).data
            : [];

        if (!cancelled) {
          setEvents(raw.map(adaptItem));
        }
      } catch {
        if (!cancelled) {
          setEvents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { events, loading };
}

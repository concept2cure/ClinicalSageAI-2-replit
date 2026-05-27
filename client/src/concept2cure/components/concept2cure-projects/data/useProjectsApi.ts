/**
 * useProjectsApi — live projects feed for the Phase 3 surface.
 *
 * Fetches /api/concept2cure/projects (the existing v2 endpoint, see
 * server/routes/concept2cure.ts ~L1746). The endpoint returns a different
 * shape than the prototype seed (see PR_PROJECTS in data/projects.ts):
 *
 *   API shape (per concept2cure.ts response.map):
 *     { id: 'proj_<n>', name, submissionType, description, status,
 *       sponsor?, product?, region?, targetAgency?, conversations[],
 *       organizationId, ownership, createdAt, updatedAt, sharing }
 *
 *   Prototype Project shape (data/projects.ts):
 *     { id, name, desc, starred, chats, memory, instructions, files,
 *       submissionType, submissionTypeLabel, product,
 *       sponsor, targetAgency, targetDate, status, phases, daysToTarget }
 *     (capacityPct dropped per HANDOFF item 13)
 *
 * The adapter below maps API → Project, supplying empty arrays / null
 * defaults where the API has no equivalent. Per HANDOFF.md item 12,
 * chats/files become separate paginated queries when wiring real data;
 * for now the list-row counts come from `conversations.length` and the
 * detail tabs continue to read from the seed until those queries land.
 *
 * Per HANDOFF.md item 3, submissionType slug normalization comes from
 * NPD_TYPES; we don't string-mangle the API's submissionType string.
 *
 * Fallback semantics: when the API errors or returns an empty array
 * (offline / not authed / new tenant), the hook returns the prototype
 * seed (PR_PROJECTS) so the surface always renders something. This is
 * intentional for the demo — production callers can override via
 * `seedFallback: false` once the seed is no longer wanted.
 */
import { useEffect, useState } from 'react';
import { getAuthHeaders } from '@/utils/authToken';
import { PR_PROJECTS } from './projects';
import { buildPhases } from './phases';
import type { Preset } from './phases';
import type { Project, SubmissionType, ProjectStatus, Agency } from '../types';

interface ApiProject {
  id: string;
  name: string;
  submissionType?: string;
  description?: string;
  status?: string;
  sponsor?: string;
  product?: string;
  region?: string;
  targetAgency?: string;
  conversations?: Array<{ id: string; title?: string; updatedAt?: string }>;
  createdAt?: string;
  updatedAt?: string;
}

interface ApiResponse {
  data?: ApiProject[] | unknown;
}

const SUBMISSION_TYPE_TO_LABEL: Record<string, string> = {
  '510K': '510(k)',
  IND: 'IND',
  NDA: 'NDA',
  BLA: 'BLA',
  PMA: 'PMA',
  MAA: 'MAA',
  EUA: 'EUA',
  IVDR: 'IVDR',
  CER: 'EU MDR CER',
  DE_NOVO: 'De Novo',
};

const SUBMISSION_TYPE_TO_PRESET: Record<string, Preset> = {
  '510K': '510K',
  PMA:    '510K',
  IND:    'IND',
  NDA:    'NDA',
  BLA:    'NDA',
  MAA:    'NDA',
  CER:    'CER',
  IVDR:   'CER',
};

function normalizeStatus(raw: string | undefined): ProjectStatus {
  if (!raw) return 'draft';
  const s = raw.toLowerCase();
  if (s === 'active') return 'active';
  if (s === 'in_review' || s === 'in review') return 'in_review';
  if (s === 'submitted') return 'submitted';
  if (s === 'archived') return 'archived';
  if (s === 'planning') return 'draft'; // HANDOFF item 2
  return 'draft';
}

function adaptApiProject(p: ApiProject): Project {
  const submissionType = (p.submissionType?.toUpperCase() || '510K') as SubmissionType;
  const label = SUBMISSION_TYPE_TO_LABEL[submissionType] || p.submissionType || '510(k)';
  const preset = SUBMISSION_TYPE_TO_PRESET[submissionType] || '510K';

  // Convert API conversations[] to denormalized chat count rows (HANDOFF item 12).
  const chats = (p.conversations || []).slice(0, 6).map(c => ({
    id: c.id,
    title: c.title || 'Conversation',
    last: c.updatedAt ? relTime(c.updatedAt) : 'recently',
  }));

  return {
    id: p.id,
    name: p.name,
    desc: p.description || '',
    starred: false,
    chats,
    memory: { enabled: false, summary: '', updated: '' },
    instructions: '',
    files: [],
    submissionType,
    submissionTypeLabel: label,
    product: p.product || '',
    sponsor: p.sponsor || '',
    targetAgency: (p.targetAgency || 'FDA') as Agency,
    targetDate: '',
    status: normalizeStatus(p.status),
    phases: buildPhases(preset, 0),
    daysToTarget: null,
  };
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

export interface UseProjectsApiOptions {
  /**
   * When true (default) and the API returns no rows or errors, the hook
   * returns the prototype seed (PR_PROJECTS) so the surface renders.
   * Set false in production once seed is no longer desired.
   */
  seedFallback?: boolean;
}

export interface UseProjectsApiReturn {
  projects: Project[];
  /** True while the first fetch is in flight. */
  loading: boolean;
  /** True when the data on display is the prototype seed, not API data. */
  usingSeed: boolean;
  /** Forces a refetch. */
  refetch: () => void;
}

export function useProjectsApi(opts: UseProjectsApiOptions = {}): UseProjectsApiReturn {
  const seedFallback = opts.seedFallback !== false;
  const [projects, setProjects] = useState<Project[]>(seedFallback ? PR_PROJECTS : []);
  const [loading, setLoading] = useState(true);
  const [usingSeed, setUsingSeed] = useState(seedFallback);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch('/api/concept2cure/projects', {
          headers: getAuthHeaders(),
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ApiResponse;
        const raw = Array.isArray(body)
          ? (body as ApiProject[])
          : Array.isArray(body.data)
            ? (body.data as ApiProject[])
            : [];

        if (cancelled) return;

        if (raw.length === 0 && seedFallback) {
          setProjects(PR_PROJECTS);
          setUsingSeed(true);
        } else {
          setProjects(raw.map(adaptApiProject));
          setUsingSeed(false);
        }
      } catch {
        if (cancelled) return;
        if (seedFallback) {
          setProjects(PR_PROJECTS);
          setUsingSeed(true);
        } else {
          setProjects([]);
          setUsingSeed(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tick, seedFallback]);

  return {
    projects,
    loading,
    usingSeed,
    refetch: () => setTick(t => t + 1),
  };
}

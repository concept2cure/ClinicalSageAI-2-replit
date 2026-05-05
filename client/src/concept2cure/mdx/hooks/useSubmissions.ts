/**
 * useSubmissions — fetches /api/submission-ops/packages and adapts each
 * c2cSubmissionPackages row into the kit's Submission shape.
 *
 * The list response carries the basics (id, family, title, status, target).
 * The kit's Submission also wants a transmit gate (errs/warns/ok) and an
 * activity log; both live behind per-package endpoints
 * (/packages/:id/readiness and /packages/:id/milestones). Doing N+1 fetches
 * on initial render is wasteful — instead this hook fetches the list once,
 * and useSubmissionDetail() fetches gate + log for the selected row only.
 */

import { useEffect, useState } from 'react';
import type {
  Submission,
  SubmissionLogEntry,
  SubmissionStage,
} from '../data/workbench';

interface ServerPackage {
  id: number;
  packageId: string;
  orgId: number;
  projectId: number;
  packageFamily: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
}

interface ListPayload {
  data: ServerPackage[];
}

const FAMILY_TO_PATHWAY: Record<string, Submission['pathway']> = {
  '510k':    '510(k)',
  '510(k)':  '510(k)',
  'pma':     'PMA',
  'cer':     'CER',
  'ivdr_td': 'EU MDR',
  'eu_mdr':  'EU MDR',
  'ind':     'IND',
};

/* status → stage mapping. The schema has only active/completed/cancelled.
   Lifting to the kit's 7 stages requires structured stage info, which we
   read from metadata.stage when present and fall back to derived. */
function deriveStage(status: string, metadata: Record<string, unknown> | null): Submission['stage'] {
  const fromMeta = typeof metadata?.stage === 'string' ? metadata.stage : null;
  if (fromMeta) {
    const valid: Submission['stage'][] = ['package', 'validate', 'sign', 'transmit', 'ack', 'review', 'decision'];
    if ((valid as readonly string[]).includes(fromMeta)) return fromMeta as Submission['stage'];
  }
  if (status === 'completed') return 'decision';
  if (status === 'cancelled') return 'package';
  return 'package';
}

function deriveStatus(
  status: string,
  metadata: Record<string, unknown> | null,
): Submission['status'] {
  if (status === 'completed') return 'complete';
  if (status === 'cancelled') return 'blocked';
  /* metadata.blocker = true is how server-side gates flag a stalled package. */
  if (metadata?.blocker === true) return 'blocked';
  return 'active';
}

function formatTarget(targetIso: string | null, status: Submission['status']): string {
  if (status === 'complete') return '—';
  if (!targetIso) return 'No target';
  const ms = new Date(targetIso).getTime() - Date.now();
  if (Number.isNaN(ms)) return targetIso.slice(0, 10);
  const days = Math.round(ms / 86_400_000);
  if (days < 0) return `${-days} days overdue`;
  if (days <= 60) return `${days} days`;
  const target = new Date(targetIso);
  const q = Math.floor(target.getMonth() / 3) + 1;
  return `Q${q} ${target.getFullYear()}`;
}

function deriveTone(stage: Submission['stage'], status: Submission['status']): Submission['tone'] {
  if (status === 'complete') return 'ok';
  if (status === 'blocked') return 'err';
  if (stage === 'transmit' || stage === 'ack') return 'warn';
  return 'default';
}

function adaptPackage(p: ServerPackage): Submission {
  const status = deriveStatus(p.status, p.metadata);
  const stage  = deriveStage(p.status, p.metadata);
  const pathway = FAMILY_TO_PATHWAY[p.packageFamily.toLowerCase()] ?? p.packageFamily;
  const code = (p.metadata && typeof p.metadata.programCode === 'string'
    ? (p.metadata.programCode as string)
    : null) ?? `pkg-${p.id}`;
  /* Rich fields the package row itself doesn't carry — read from metadata
     when present, otherwise sensible defaults. The detail hook will
     populate gate + log on selection. */
  const gateErrs  = typeof p.metadata?.gateErrs  === 'number' ? (p.metadata.gateErrs  as number) : 0;
  const gateWarns = typeof p.metadata?.gateWarns === 'number' ? (p.metadata.gateWarns as number) : 0;
  const gateOk    = typeof p.metadata?.gateOk    === 'number' ? (p.metadata.gateOk    as number) : 0;
  const fileCount = typeof p.metadata?.fileCount === 'number' ? (p.metadata.fileCount as number) : 0;
  const bytes     = typeof p.metadata?.bytes     === 'string' ? (p.metadata.bytes     as string) : '—';
  const transmitAt = typeof p.metadata?.transmitAt === 'string' ? (p.metadata.transmitAt as string) : null;

  return {
    id:       p.packageId,
    prog:     code,
    pathway,
    stage,
    status,
    title:    p.title,
    target:   pathway.startsWith('EU') ? 'NB · TÜV' : 'FDA · ESG',
    bytes,
    files:    fileCount,
    cover:    p.metadata?.cover === 'signed' ? 'signed' : 'draft',
    esig:     p.metadata?.esig === true,
    transmitAt,
    targetAt: formatTarget(p.targetDate, status),
    tone:     deriveTone(stage, status),
    gate:     { errs: gateErrs, warns: gateWarns, ok: gateOk },
    log:      [],
  };
}

export interface UseSubmissionsResult {
  submissions: Submission[] | null;
  loading: boolean;
  error: string | null;
}

export function useSubmissions(): UseSubmissionsResult {
  const [state, setState] = useState<UseSubmissionsResult>({
    submissions: null,
    loading: false,
    error: null,
  });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch('/api/submission-ops/packages', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ListPayload;
      })
      .then((p) => {
        if (cancelled) return;
        const submissions = p.data.map(adaptPackage);
        setState({ submissions, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          submissions: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load submissions',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

/* ─── Per-package detail (gate + activity log) ─────────────────────── */

interface ReadinessPayload {
  errs?: number;  warns?: number;  ok?: number;
  errors?: number; warnings?: number; passed?: number;
}

interface MilestonePayload {
  data?: Array<{ id: number; title: string; status: string; createdAt: string; ownerName: string | null }>;
  milestones?: Array<{ id: number; title: string; status: string; createdAt: string; ownerName: string | null }>;
}

export interface UseSubmissionDetailResult {
  gate: Submission['gate'] | null;
  log: SubmissionLogEntry[] | null;
  loading: boolean;
  error: string | null;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return new Date(iso).toLocaleDateString();
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function useSubmissionDetail(packageId: string | null): UseSubmissionDetailResult {
  const [state, setState] = useState<UseSubmissionDetailResult>({
    gate: null,
    log: null,
    loading: false,
    error: null,
  });
  useEffect(() => {
    if (!packageId) {
      setState({ gate: null, log: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ gate: null, log: null, loading: true, error: null });

    Promise.allSettled([
      fetch(`/api/submission-ops/packages/${encodeURIComponent(packageId)}/readiness`, {
        credentials: 'include',
      }),
      fetch(`/api/submission-ops/packages/${encodeURIComponent(packageId)}/milestones`, {
        credentials: 'include',
      }),
    ])
      .then(async ([readinessRes, milestonesRes]) => {
        if (cancelled) return;
        let gate: Submission['gate'] | null = null;
        if (readinessRes.status === 'fulfilled' && readinessRes.value.ok) {
          const j = (await readinessRes.value.json()) as ReadinessPayload;
          gate = {
            errs:  j.errs  ?? j.errors   ?? 0,
            warns: j.warns ?? j.warnings ?? 0,
            ok:    j.ok    ?? j.passed   ?? 0,
          };
        }
        let log: SubmissionLogEntry[] | null = null;
        if (milestonesRes.status === 'fulfilled' && milestonesRes.value.ok) {
          const j = (await milestonesRes.value.json()) as MilestonePayload;
          const rows = j.data ?? j.milestones ?? [];
          log = rows
            .slice(0, 10)
            .map((r) => ({
              when: formatRelative(r.createdAt),
              who:  r.ownerName ?? 'System',
              what: r.title + (r.status ? ` · ${r.status}` : ''),
            }));
        }
        setState({ gate, log, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          gate: null,
          log: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load detail',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [packageId]);
  return state;
}

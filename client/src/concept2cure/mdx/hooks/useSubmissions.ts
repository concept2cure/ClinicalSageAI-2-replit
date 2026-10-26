/**
 * useSubmissions — fetches /api/submission-ops/packages and adapts each
 * c2cSubmissionPackages row into the kit's Submission shape.
 *
 * The list response carries the basics (id, family, title, status, target date).
 * The kit's Submission also wants a transmit gate (errs/warns/ok) and an
 * activity log; both live behind per-package endpoints
 * (/packages/:id/readiness and /packages/:id/milestones). Doing N+1 fetches
 * on initial render is wasteful — instead this hook fetches the list once,
 * and useSubmissionDetail() fetches gate + log for the selected row only.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  SUBMISSION_PIPELINE,
  type Submission,
  type SubmissionBundle,
  type SubmissionLogEntry,
} from '../data/workbench';
import { useFetchJson, buildAuthHeaders } from './useFetchJson';
import { firstArray, isRecord, shapeMismatch } from '../lib/payloadShape';
import { formatBytes } from '@/lib/utils';
import { FAMILY_TO_SUBMISSION_PATHWAY } from '../../../../../shared/constants/mdx';

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


/* The kit's 7 stages need structured stage info, which is read from
   metadata.stage when present.
   Slice 0 (map row `device-submission`): when it was absent the stage was
   inferred from the status ('completed' → 'decision', anything else →
   'package'). Nothing writes metadata.stage on a package, so the pipeline
   counted every open package under "Package" and every completed one under
   "Decision · Cleared · approved", neither recorded. No stage on the record
   is no stage. */
function deriveStage(metadata: Record<string, unknown> | null): Submission['stage'] {
  const fromMeta = typeof metadata?.stage === 'string' ? metadata.stage : null;
  const valid = SUBMISSION_PIPELINE.map((s) => s.id);
  return fromMeta && valid.includes(fromMeta) ? fromMeta : null;
}

/* Slice 0 (map row `device-submission`): 'cancelled' read 'blocked', which
   offered "What's blocking", and 'locked' (set when the package is published,
   POST /packages/:id/publish) fell through to 'active'. Each is its own. */
function deriveStatus(
  status: string,
  metadata: Record<string, unknown> | null,
): Submission['status'] {
  if (status === 'completed') return 'complete';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'locked') return 'locked';
  /* metadata.blocker = true is how server-side gates flag a stalled package. */
  if (metadata?.blocker === true) return 'blocked';
  return 'active';
}

/* The bundle the assemble route records: the zip's SHA-256 and size. Only a
   descriptor carrying both is a bundle. */
function readBundle(metadata: Record<string, unknown> | null): SubmissionBundle | null {
  const b = metadata?.bundle;
  if (!isRecord(b) || typeof b.sha256 !== 'string') return null;
  if (typeof b.sizeBytes !== 'number' || !Number.isFinite(b.sizeBytes) || b.sizeBytes < 0) return null;
  return {
    sha256: b.sha256,
    size: formatBytes(b.sizeBytes, 1),
    assembledAt: typeof b.assembledAt === 'string' ? b.assembledAt : null,
  };
}

function formatTarget(targetIso: string | null, status: Submission['status']): string {
  if (status === 'complete' || status === 'cancelled') return '—';
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
  const stage  = deriveStage(p.metadata);
  /* `packageFamily` is declared `string`, and the shape guard on the list only
     proves the envelope is a list of objects — a package row that predates the
     family column, or comes back from a narrowed SELECT, carries none, and the
     lookup below dereferenced it and took the whole submission centre down on
     an otherwise well-formed 200. No family means no pathway to claim. */
  const family = typeof p.packageFamily === 'string' ? p.packageFamily : '';
  const pathway = (FAMILY_TO_SUBMISSION_PATHWAY[family.toLowerCase()] ?? family) as Submission['pathway'];
  const code = (p.metadata && typeof p.metadata.programCode === 'string'
    ? (p.metadata.programCode as string)
    : null) ?? `pkg-${p.id}`;
  /* Rich fields the package row itself doesn't carry — read from metadata
     when present. The detail hook populates gate + log on selection. */
  /* Slice 0 (map row `device-submission`): the row's gate came from
     `metadata.gateErrs` / `gateWarns` / `gateOk`, defaulting each to 0, so a
     package showed a clean 0 / 0 / 0 gate nobody read. Nothing writes those
     keys on a package (the AnA tool that names them merges into a regulatory
     program's metadata), so the list carries no gate: it is the readiness
     read, on selection. `fileCount`, `bytes` and `cover` went for the same
     reason; the assembled bundle is read instead. */
  const transmitAt = typeof p.metadata?.transmitAt === 'string' ? (p.metadata.transmitAt as string) : null;

  return {
    id:       p.packageId,
    prog:     code,
    pathway,
    stage,
    status,
    title:    p.title,
    /* Slice 0 (map row `device-submission`): `target` was derived from the
       family alone ("NB · TÜV" for every EU package, "FDA · ESG" for every
       other), and `esig` from the free-form `metadata.esig` flag, which no
       signature record backs. Neither is computed any more. */
    bundle:   readBundle(p.metadata),
    transmitAt,
    targetAt: formatTarget(p.targetDate, status),
    tone:     deriveTone(stage, status),
    gate:     null,
    log:      [],
  };
}

export interface UseSubmissionsResult {
  submissions: Submission[] | null;
  loading: boolean;
  error: string | null;
  /** Re-runs the list read. A failed read has to offer a way back. */
  refresh: () => void;
}

const PACKAGES_PATH = '/api/submission-ops/packages';

/**
 * List submission packages from /api/submission-ops/packages and adapt
 * each c2cSubmissionPackages row into the kit's Submission shape. The
 * list call carries the basics (id, family, title, status, target date);
 * gate counts and activity log come from useSubmissionDetail() on
 * row selection.
 */
export function useSubmissions(): UseSubmissionsResult {
  const { data, loading, error, refresh } = useFetchJson<ListPayload>(PACKAGES_PATH);
  /*
   * `data ? data.data.map(...)` — `data` only says a body came back, and the
   * `ListPayload` annotation is a cast, not something the route is held to. Any
   * 200 that isn't `{ data: [...] }` threw at `.map` inside useMemo and took the
   * pipeline down mid-render. Reporting it keeps "we couldn't read the package
   * list" distinct from "you have no packages in flight", which on this surface
   * is the difference between a broken page and an empty pipeline.
   */
  const rows = Array.isArray(data?.data) ? data.data : null;
  const failed = error ?? (data != null && rows === null ? shapeMismatch(PACKAGES_PATH) : null);
  const submissions = useMemo(() => (rows ? rows.map(adaptPackage) : null), [rows]);
  return { submissions, loading, error: failed, refresh };
}

/* ─── Per-package detail (gate + activity log) ─────────────────────── */

interface ReadinessPayload {
  errs?: number;  warns?: number;  ok?: number;
  errors?: number; warnings?: number; passed?: number;
  /** The engine's PackageReadiness; only its sections are read here. */
  data?: { sections?: Array<{ totalArtifacts?: number }> };
}

/* The first candidate that is a finite count, or null. */
function count(...candidates: unknown[]): number | null {
  for (const c of candidates) if (typeof c === 'number' && Number.isFinite(c) && c >= 0) return c;
  return null;
}

/* How many artifacts the readiness read covered: the sum of its sections'
   totalArtifacts, or null when the body does not say. */
function artifactsAssessed(j: ReadinessPayload): number | null {
  const sections = j.data?.sections;
  if (!Array.isArray(sections)) return null;
  let n = 0;
  for (const s of sections) {
    const t = count(isRecord(s) ? s.totalArtifacts : undefined);
    if (t === null) return null;
    n += t;
  }
  return n;
}

/* A milestone row as the route actually emits it. `c2c_milestones` carries no
   owner_name — only created_by_id — so `ownerName` is absent on every live row
   and `createdByName` is the name the route resolves that id to (null when the
   milestone has no creator, or the user record is gone). Both stay optional:
   an unresolved actor is an empty actor, never an invented one. */
interface MilestoneRow {
  id: number;
  title: string;
  status?: string;
  createdAt: string;
  ownerName?: string | null;
  createdByName?: string | null;
}

interface MilestonePayload {
  data?: MilestoneRow[];
  milestones?: MilestoneRow[];
}

/* The actor of a milestone, or '' when the server resolved none. Returning ''
   rather than a stand-in name is the point: the Activity strip renders '—' for
   an empty actor (Workbench.tsx), which reads as "not recorded" — where the
   previous 'System' read as a fact about who acted. */
export function milestoneActor(r: Pick<MilestoneRow, 'ownerName' | 'createdByName'>): string {
  const named = r.createdByName ?? r.ownerName ?? '';
  return typeof named === 'string' ? named.trim() : '';
}

export interface UseSubmissionDetailResult {
  gate: Submission['gate'] | null;
  /** How many artifacts the readiness read covered, or null when it does not
   *  say. 0 is the package with nothing in it to assess. */
  gateArtifacts: number | null;
  log: SubmissionLogEntry[] | null;
  loading: boolean;
  error: string | null;
  /** Why the readiness read gave no gate, when it settled without one. Kept
   *  apart from `error` (both reads failing) so the surface can tell "not read
   *  yet" from "could not be read" for the gate alone. */
  gateError: string | null;
  /** The same for the milestones read: why it gave no activity log. */
  logError: string | null;
}

const IDLE_DETAIL: UseSubmissionDetailResult = {
  gate: null,
  gateArtifacts: null,
  log: null,
  loading: false,
  error: null,
  gateError: null,
  logError: null,
};

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

/**
 * Lazy fetch of per-package gate + activity log for the selected
 * submission row. Fires both /readiness and /milestones in parallel
 * via Promise.allSettled — a single failed endpoint degrades that
 * field to null without blocking the other.
 *
 * Pass `null` for `packageId` to disable the fetch (idle state).
 */
export function useSubmissionDetail(packageId: string | null): UseSubmissionDetailResult {
  const [state, setState] = useState<UseSubmissionDetailResult>(IDLE_DETAIL);
  useEffect(() => {
    if (!packageId) {
      setState(IDLE_DETAIL);
      return;
    }
    let cancelled = false;
    setState({ ...IDLE_DETAIL, loading: true });

    /* `credentials: 'include'` is not authentication in this app. The global
       /api gate reads `req.headers.authorization` and has no cookie fallback
       (server/middleware/auth.ts, `extractBearerToken`), and
       `/api/submission-ops` is not on PUBLIC_API_ALLOWLIST — so these two
       reads sent no token and 401'd. The boundary runs in mode 'warn' outside
       production and 'enforce' in it, which is why this worked on a laptop and
       failed for every user.

       The failure was silent and worse than a blank screen: a 401 is not
       `res.ok`, so both branches below left `gate` and `log` as null, and the
       surface rendered a package with no readiness gate and no milestones —
       indistinguishable from a package that genuinely has neither. */
    Promise.allSettled([
      fetch(`/api/submission-ops/packages/${encodeURIComponent(packageId)}/readiness`, {
        credentials: 'include',
        headers: buildAuthHeaders(),
      }),
      fetch(`/api/submission-ops/packages/${encodeURIComponent(packageId)}/milestones`, {
        credentials: 'include',
        headers: buildAuthHeaders(),
      }),
    ])
      .then(async ([readinessRes, milestonesRes]) => {
        if (cancelled) return;
        let gate: Submission['gate'] | null = null;
        let gateArtifacts: number | null = null;
        let gateError: string | null = null;
        if (readinessRes.status === 'fulfilled' && readinessRes.value.ok) {
          const j = ((await readinessRes.value.json()) ?? {}) as ReadinessPayload;
          /* Slice 0 (map row `device-submission`): each count defaulted to 0
             (`j.errs ?? j.errors ?? 0`), so a 200 carrying none became a clean
             0 / 0 / 0 gate. A gate is three counts the read answered. */
          const errs = count(j.errs, j.errors);
          const warns = count(j.warns, j.warnings);
          const ok = count(j.ok, j.passed);
          if (errs !== null && warns !== null && ok !== null) {
            gate = { errs, warns, ok };
            gateArtifacts = artifactsAssessed(j);
          } else {
            gateError = 'The readiness read returned no gate counts';
          }
        } else {
          gateError = readinessRes.status === 'fulfilled'
            ? `The readiness read was refused (HTTP ${readinessRes.value.status})`
            : 'The readiness read failed';
        }
        let log: SubmissionLogEntry[] | null = null;
        let logError: string | null = null;
        if (milestonesRes.status === 'fulfilled' && milestonesRes.value.ok) {
          const j = ((await milestonesRes.value.json()) ?? {}) as MilestonePayload;
          /* `j.data ?? j.milestones ?? []` stepped past null and undefined but
             not past a `data` field holding an object, which then failed at
             `.slice`. Only a real list becomes an activity log.
             Slice 0: and a body holding no list is a failed read, not an empty
             log (it fell back to []). */
          const rows = firstArray<MilestoneRow>(j.data, j.milestones);
          if (rows) {
            log = rows
              .slice(0, 10)
              .map((r) => ({
                when: formatRelative(r.createdAt),
                who:  milestoneActor(r),
                what: r.title + (r.status ? ` · ${r.status}` : ''),
              }));
          } else {
            logError = shapeMismatch('the activity log');
          }
        } else {
          /* Slice 0 (map row `device-submission`): a failed milestones read
             left `log` null with no reason, and the surface fell back to the
             list row's empty log: "no activity". */
          logError = milestonesRes.status === 'fulfilled'
            ? `The activity log read was refused (HTTP ${milestonesRes.value.status})`
            : 'The activity log read failed';
        }
        setState({ gate, gateArtifacts, log, loading: false, error: null, gateError, logError });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load detail';
        setState({
          ...IDLE_DETAIL,
          error: message,
          gateError: message,
          logError: message,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [packageId]);
  return state;
}

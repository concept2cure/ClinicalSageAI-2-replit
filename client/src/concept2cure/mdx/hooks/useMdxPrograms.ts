/**
 * useMdxPrograms — fetches /api/regulatory-programs and adapts each row to
 * the kit's `Program` shape (data/programs.ts) so MDX surfaces consume real
 * client data with no shape rework at the call site.
 *
 * Same pattern as useLiveSections:
 *  - cancellable fetch, refresh callback, loading/error state
 *  - typed result against the kit shape
 *  - falls back to null arrays during load so callers can render fixtures
 *    on initial render without flashing empty state
 *
 * Adaptation logic lives entirely in this file (no server-side synthesis):
 *  - pathway derived from regulatoryPath (preferred) or programType
 *  - kit status derived from backend status + phase
 *  - stageIdx derived from phase (with progress-percent fallback)
 *  - dueLabel/dueTone computed from days-to-target
 *  - owners initials computed from teamMembers[].name (lead initials fallback)
 *  - non-MDX program types (IND/NDA/BLA) are filtered out — they belong to
 *    other workstreams and won't render in the MDX Overview surface.
 */

import { useMemo } from 'react';
import type { DueTone, Program, ProgramPathway, ProgramStatus } from '../data/programs';
import { useFetchJson } from './useFetchJson';
import {
  REGULATORY_PATH_TO_PATHWAY,
  PROGRAM_TYPE_TO_PATHWAY,
  PHASE_TO_STAGE_IDX,
  STAGE_LABELS,
} from '../../../../../shared/constants/mdx';

interface ServerProgramRow {
  id: string;
  name: string;
  code: string;
  description: string | null;
  programType: string;
  productType: string;
  deviceClass: string | null;
  regulatoryPath: string | null;
  primaryAgency: string;
  productName: string;
  status: string;
  phase: string | null;
  priority: string | null;
  targetSubmissionDate: string | null;
  progressPercent: number | null;
  completedMilestones: number | null;
  totalMilestones: number | null;
  leadUserId: number | null;
  leadUserName: string | null;
  teamMembers: Array<{ name?: string; userId?: number; role?: string }> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface ListPayload {
  data: ServerProgramRow[];
}

function deriveKitPathway(programType: string, regulatoryPath: string | null): ProgramPathway | null {
  if (regulatoryPath && REGULATORY_PATH_TO_PATHWAY[regulatoryPath.toLowerCase()]) {
    return REGULATORY_PATH_TO_PATHWAY[regulatoryPath.toLowerCase()] as ProgramPathway;
  }
  const upper = (programType ?? '').toUpperCase();
  return (PROGRAM_TYPE_TO_PATHWAY[upper] ?? null) as ProgramPathway | null;
}

function deriveKitStatus(status: string | null, phase: string | null): ProgramStatus {
  const s = (status ?? '').toLowerCase();
  if (s === 'approved' || s === 'submitted') return 'complete';
  if (s === 'rejected')                      return 'blocked';
  if (s === 'draft' || phase === 'planning')  return 'idle';
  return 'active';
}

function deriveStageIdx(phase: string | null, progressPercent: number | null): number {
  const phaseKey = (phase ?? '').toLowerCase();
  if (PHASE_TO_STAGE_IDX[phaseKey] !== undefined) return PHASE_TO_STAGE_IDX[phaseKey];
  const pct = progressPercent ?? 0;
  if (pct >= 91) return 6;
  if (pct >= 71) return 5;
  if (pct >= 41) return 3;
  if (pct >= 16) return 2;
  return 1;
}

function deriveStageLabel(idx: number): string {
  return STAGE_LABELS[Math.max(0, Math.min(idx, STAGE_LABELS.length - 1))];
}

function formatDueLabel(targetIso: string | null, status: ProgramStatus): { label: string; tone: DueTone } {
  if (status === 'complete') {
    return { label: 'Complete', tone: 'ok' };
  }
  if (!targetIso) {
    return { label: 'No target set', tone: 'ok' };
  }
  const target = new Date(targetIso);
  const ms = target.getTime() - Date.now();
  const days = Math.round(ms / 86_400_000);
  const iso = target.toISOString().slice(0, 10);

  if (days < 0)    return { label: `Overdue · ${iso}`,        tone: 'err' };
  if (days <= 14)  return { label: `Filing · ${days} days`,   tone: 'err' };
  if (days <= 60)  return { label: `Filing · ${days} days`,   tone: 'warn' };
  if (days <= 180) return { label: `Filing · ${iso}`,         tone: 'ok' };
  const quarter = Math.floor(target.getMonth() / 3) + 1;
  return { label: `Filing · Q${quarter} ${target.getFullYear()}`, tone: 'ok' };
}

function formatLastActivity(updatedIso: string): string {
  const updated = new Date(updatedIso);
  const ms = Date.now() - updated.getTime();
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.round(d / 7);
  return `${w}w ago`;
}

function nameToInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function deriveOwners(
  teamMembers: ServerProgramRow['teamMembers'],
  leadName: string | null,
): string[] {
  const fromTeam = (teamMembers ?? [])
    .map((m) => (m.name ? nameToInitials(m.name) : ''))
    .filter(Boolean);
  if (fromTeam.length > 0) return fromTeam;
  if (leadName) return [nameToInitials(leadName)];
  return [];
}

function deriveCode(row: ServerProgramRow): string {
  const cls = row.deviceClass ? `Class ${row.deviceClass}` : null;
  const type = row.programType === 'DE_NOVO' ? 'De Novo' : row.programType;
  return [cls, type].filter(Boolean).join(' · ') || row.programType;
}

function rowToKit(row: ServerProgramRow): Program | null {
  const pathway = deriveKitPathway(row.programType, row.regulatoryPath);
  if (!pathway) return null;

  const status = deriveKitStatus(row.status, row.phase);
  const stageIdx = status === 'complete' ? 7 : deriveStageIdx(row.phase, row.progressPercent);
  const stage = deriveStageLabel(stageIdx);
  const due = formatDueLabel(row.targetSubmissionDate, status);

  const blockerFromMeta = typeof row.metadata?.blocker === 'string'
    ? (row.metadata.blocker as string)
    : null;
  const nextBlocker = status === 'blocked'
    ? (blockerFromMeta ?? 'Resolution pending')
    : blockerFromMeta;

  return {
    id:           row.id,
    title:        row.productName || row.name,
    code:         deriveCode(row),
    pathway,
    stage,
    stageIdx,
    readiness:    row.progressPercent ?? 0,
    status,
    lead:         row.leadUserName ?? '',
    owners:       deriveOwners(row.teamMembers, row.leadUserName),
    nextBlocker,
    dueLabel:     due.label,
    dueTone:      due.tone,
    lastActivity: formatLastActivity(row.updatedAt),
    meta:         row.description ?? '',
  };
}

export interface UseMdxProgramsResult {
  /** Adapted programs in kit shape, or null while loading / on error. */
  programs: Program[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useMdxPrograms(): UseMdxProgramsResult {
  const { data, loading, error, refresh } = useFetchJson<ListPayload>('/api/regulatory-programs');
  const programs = useMemo(
    () => (data ? data.data.map(rowToKit).filter((p): p is Program => p !== null) : null),
    [data],
  );
  return { programs, loading, error, refresh };
}

/* ─── Per-program detail (raw server shape, unadapted) ──────────────────
   Surfaces that need the rich team-member list / lead user name / metadata
   read from this hook directly. The kit Program shape (returned by
   useMdxPrograms) reduces team data to initials, which is enough for cards
   but not for governance panels. */

export interface ProgramTeamMember {
  name?: string;
  userId?: number;
  role?: string;
}

export interface ProgramDetail {
  id: string;
  name: string;
  code: string;
  productName: string;
  programType: string;
  regulatoryPath: string | null;
  status: string;
  phase: string | null;
  progressPercent: number;
  targetSubmissionDate: string | null;
  leadUserId: number | null;
  leadUserName: string | null;
  teamMembers: ProgramTeamMember[] | null;
  metadata: Record<string, unknown> | null;
  updatedAt: string;
}

interface ProgramDetailPayload {
  data: ProgramDetail;
}

export function useProgramDetail(programId: string | null): {
  detail: ProgramDetail | null;
  loading: boolean;
  error: string | null;
} {
  const url = programId ? `/api/regulatory-programs/${encodeURIComponent(programId)}` : null;
  const { data, loading, error } = useFetchJson<ProgramDetailPayload>(url);
  return { detail: data?.data ?? null, loading, error };
}

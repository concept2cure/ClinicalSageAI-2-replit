/**
 * A dossier section's Part-11 history, from the server.
 *
 * Reads GET /api/c2c/documents/:id/sections/:key/versions — the rows the
 * c2c_snapshot_section_version trigger writes on every content change, each
 * carrying its author and reason for change. This replaces the in-memory list
 * the dossier store used to append to from the browser: an "Edit" event
 * attributed to "You · Reg Lead", with a Math.random id, pushed before — and
 * regardless of whether — the governed PATCH succeeded.
 */
import { useMemo } from 'react';
import type { AuditEvent } from '../types';
import { useFetchJson } from './useFetchJson';
import { shapeMismatch } from '../lib/payloadShape';

interface ServerSectionVersion {
  id: string;
  version: number;
  authorId: number;
  authorName: string | null;
  authorKind: string;
  reason: string;
  occurredAt: string;
}

export interface UseSectionVersionsResult {
  /** null until read; [] when the section has no recorded versions. */
  events: AuditEvent[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSectionVersions(
  documentId: string | null,
  sectionKey: string | number | null,
): UseSectionVersionsResult {
  const url =
    documentId && sectionKey !== null && sectionKey !== ''
      ? `/api/c2c/documents/${encodeURIComponent(documentId)}/sections/${encodeURIComponent(String(sectionKey))}/versions`
      : null;
  const { data, loading, error, refresh } = useFetchJson<{ data?: ServerSectionVersion[] }>(url);
  const rows = Array.isArray(data?.data) ? data!.data : null;
  const events = useMemo<AuditEvent[] | null>(
    () =>
      rows
        ? rows.map((v) => ({
            id: v.id,
            when: v.occurredAt,
            kind: 'section.edit' as const,
            actor: v.authorName ?? `User #${v.authorId}`,
            target: `v${v.version}`,
            target_id: sectionKey ?? undefined,
            diff: `v${v.version} · ${v.reason}`,
          }))
        : null,
    [rows, sectionKey],
  );
  const failed = error ?? (data != null && rows === null && url ? shapeMismatch(url) : null);
  return { events, loading, error: failed, refresh };
}

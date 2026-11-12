/**
 * What a project uses from the data catalog, and the acts on it (split from DataRoomSourcesPanel.tsx, 2026-11-11):
 * a data-room capture or a Vault document, recorded on the project's own evidence routes.
 */
import React, { useEffect, useState } from 'react';
import { I } from '../icons';
import { apiCall, apiErrorText } from '../apiCall';
import { SourceAssemblyAction } from './SourceAssemblyDialog';
import { GRADE_TONE, type SourceGrade } from './DataRoomGrade';

/** What "Use in this project" reads of a capture. */
interface UsableSource { id: number; title?: string | null; isCurrent?: boolean }

/** A data-room capture this project uses, as GET /api/c2c/projects/:id/evidence records it (c2c_project_pinned_evidence). */
export interface ProjectUse {
  id: number; title: string; pinnedAt: string;
  /** A Vault document the project uses (evidence kind vault_doc), with what the Vault records of it now. */
  vault?: { documentId: string; projectId: string | null; projectName: string | null; isCurrent: boolean } | null;
  source: { sourceId: number; projectId: string | null; projectName: string | null; isCurrent: boolean; grade: SourceGrade['grade'] | null; gradeScore: number | null } | null;
}
/** What this project uses, and the acts on it. Each use is audited on the project (c2c.project.evidence.pin / unpin). */
export interface ProjectUses {
  loading: boolean; error: string | null; list: ProjectUse[];
  /** The use recording a capture, by source id. */
  useOf: (sourceId: number) => ProjectUse | undefined;
  /** The use recording a Vault document, by document id. */
  useOfVault: (documentId: string) => ProjectUse | undefined;
  busy: number | string | null; actError: string | null;
  use: (source: { id: number; title?: string | null }) => Promise<void>;
  useVault: (doc: { documentId: string; title: string }) => Promise<void>;
  remove: (use: ProjectUse) => Promise<void>;
}

function readUses(body: unknown): ProjectUse[] | null {
  const rows = (body as { evidence?: unknown } | null)?.evidence;
  if (!Array.isArray(rows)) return null;
  /* A Vault document counts only when the server answered what it is now: a pin made elsewhere with another
     reference is not a use from the catalog. */
  const used = (r: Record<string, any>) => r.evidence_kind === 'data_room' || (r.evidence_kind === 'vault_doc' && Boolean(r.vault));
  return rows.filter((r): r is Record<string, any> => Boolean(r) && used(r as Record<string, any>)).map(r => ({
    id: Number(r.id), title: String(r.title ?? ''), pinnedAt: String(r.pinned_at ?? ''),
    vault: r.vault ? { documentId: String(r.vault.documentId), projectId: r.vault.projectId ?? null,
      projectName: r.vault.projectName ?? null, isCurrent: r.vault.isCurrent !== false } : null,
    source: r.data_room ? {
      sourceId: Number(r.data_room.sourceId), projectId: r.data_room.projectId ?? null, projectName: r.data_room.projectName ?? null,
      isCurrent: r.data_room.isCurrent !== false, grade: r.data_room.grade ?? null, gradeScore: r.data_room.gradeScore ?? null,
    } : null,
  }));
}

/** The project's subscribed data (S2): read, used and removed through the project's own evidence routes. */
export function useProjectUses(programId: string, current: () => boolean): ProjectUses {
  const [list, setList] = useState<ProjectUse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | string | null>(null);
  const [actError, setActError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const url = `/api/c2c/projects/${encodeURIComponent(programId)}/evidence`;
  useEffect(() => {
    let live = true;
    setLoading(true);
    void apiCall('GET', url).then(result => {
      if (!live || !current()) return;
      const rows = result.ok ? readUses(result.body) : null;
      setList(rows ?? []);
      setError(rows ? null : apiErrorText(result, 'What this project uses could not be read.'));
      setLoading(false);
    });
    return () => { live = false; };
  }, [url, epoch, current]);
  const act = async (key: number | string, run: () => Promise<{ ok: boolean; status: number; body: unknown; networkError: boolean }>, failed: string) => {
    setBusy(key); setActError(null);
    try {
      const result = await run();
      if (!current()) return;
      if (!result.ok) setActError(apiErrorText(result as never, failed));
      setEpoch(v => v + 1);
    } finally { if (current()) setBusy(null); }
  };
  return {
    loading, error, list, busy, actError,
    useOf: sourceId => list.find(u => u.source?.sourceId === sourceId),
    useOfVault: documentId => list.find(u => u.vault?.documentId === documentId),
    useVault: doc => act(doc.documentId, () => apiCall('POST', url, {
      evidenceKind: 'vault_doc', evidenceRef: doc.documentId, title: doc.title,
      reason: 'Used in this project from the data catalog',
    }), 'It could not be added to this project. Nothing was recorded.'),
    use: source => act(source.id, () => apiCall('POST', url, {
      evidenceKind: 'data_room', evidenceRef: String(source.id), title: source.title || `Source ${source.id}`,
      reason: 'Used in this project from the data catalog',
    }), 'It could not be added to this project. Nothing was recorded.'),
    remove: u => act(u.vault?.documentId ?? u.source?.sourceId ?? -u.id, () => apiCall('DELETE', `${url}/${encodeURIComponent(String(u.id))}`),
      'It could not be removed from this project.'),
  };
}

/** Use in this project, or Remove: one button, the person's act, recorded on the project. */
export function UseAction({ source, uses }: { source: UsableSource; uses?: ProjectUses }) {
  if (!uses) return null;
  return <>
    <UseButton source={source} uses={uses} />
    {uses.actError && uses.busy === null && <p className="pf-sel-m" role="alert">{uses.actError}</p>}
  </>;
}

function UseButton({ source, uses }: { source: UsableSource; uses: ProjectUses }) {
  const used = uses.useOf(source.id);
  const busy = uses.busy === source.id;
  if (used) {
    return <span className="pf-actions">
      <span className="rd-chip tone-ok">Used in this project</span>
      <button type="button" className="btn ghost" disabled={busy} onClick={() => void uses.remove(used)}>{busy ? 'Removing…' : 'Remove'}</button>
    </span>;
  }
  const blocked = source.isCurrent === false ? 'A later capture replaced this file. Use the current one.' : null;
  return <button type="button" className="btn ghost" disabled={busy || Boolean(blocked) || uses.loading} title={blocked ?? undefined}
    onClick={() => void uses.use(source)}>{I.plus ?? null} {busy ? 'Adding…' : 'Use in this project'}</button>;
}

/** What this project uses, first: each subscribed capture with its project, grade and currency, and Remove beside it. */
export function UsedInProject({ uses, programId, onNav }: { uses: ProjectUses; programId: string; onNav?: (id: string) => void }) {
  if (uses.loading) return null;
  if (uses.error) return <p className="pf-sel-m" role="alert">{uses.error}</p>;
  if (uses.list.length === 0) return null;
  const own = uses.list.filter(u => u.source && u.source.projectId === programId && u.source.isCurrent);
  return <div className="pf-list" data-testid="data-room-used" role="group" aria-label="Used in this project">
    <p className="pf-count"><b>Used in this project</b> · {uses.list.length}</p>
    {uses.list.map(u => <div key={u.id} className="pf-sel">
      <span className="pf-sel-t">{u.title}</span>
      <span className="pf-sel-m" style={{ display: 'block' }}>
        {u.source?.grade ? <span className={`rd-chip tone-${GRADE_TONE[u.source.grade]}`}>Grade {u.source.grade} · {u.source.gradeScore}</span> : null}
        {' '}{originOfUse(u, programId)}
        {u.pinnedAt ? ` · added ${new Date(u.pinnedAt).toLocaleDateString()}` : ''}
      </span>
      <button type="button" className="btn ghost" disabled={uses.busy !== null} onClick={() => void uses.remove(u)}>Remove</button>
    </div>)}
    {own.length > 0 && <SourceAssemblyAction programId={programId} onNav={onNav} titles={own.map(u => u.title)}
      sources={own.slice(0, 10).map(u => ({ kind: 'data-room' as const, sourceId: (u.source as NonNullable<ProjectUse['source']>).sourceId }))} />}
    {uses.actError && <p className="pf-sel-m" role="alert">{uses.actError}</p>}
  </div>;
}

/** Where a used item is and whether it is still the current one, from what the server answered. */
function originOfUse(u: ProjectUse, programId: string): string {
  if (u.vault) {
    const where = u.vault.projectId === programId ? 'In this project’s Vault' : `From the Vault of ${u.vault.projectName ?? 'another project'}`;
    return `${where}${u.vault.isCurrent ? '' : ' · superseded: a later version replaced it'}`;
  }
  if (!u.source) return 'This capture can no longer be read.';
  const where = u.source.projectId === programId ? 'Captured in this project' : `From ${u.source.projectName ?? 'another project'}`;
  return `${where}${u.source.isCurrent ? '' : ' · superseded: a later capture replaced it'}`;
}

/** Use in this project, or Remove, for a Vault document of the catalog. */
export function UseVaultAction({ doc, uses }: { doc: { documentId: string; title: string }; uses?: ProjectUses }) {
  if (!uses) return null;
  const used = uses.useOfVault(doc.documentId);
  const busy = uses.busy === doc.documentId;
  return <>
    {used
      ? <span className="pf-actions">
        <span className="rd-chip tone-ok">Used in this project</span>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => void uses.remove(used)}>{busy ? 'Removing…' : 'Remove'}</button>
      </span>
      : <button type="button" className="btn ghost" disabled={busy || uses.loading} onClick={() => void uses.useVault(doc)}>{I.plus ?? null} {busy ? 'Adding…' : 'Use in this project'}</button>}
    {uses.actError && uses.busy === null && <p className="pf-sel-m" role="alert">{uses.actError}</p>}
  </>;
}

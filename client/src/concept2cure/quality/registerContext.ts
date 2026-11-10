/**
 * What a quality-record register reads beside its own rows, for the columns and
 * forms that name another record: today the organisation's controlled documents,
 * for a supplier's quality agreement (2026-10-29).
 *
 * Read only when the register's configuration asks for it. Unread and failed
 * are kept apart, so a column never shows "none" over a read that did not land.
 *
 * @module client/src/concept2cure/quality/registerContext
 */
import { useMemo, useSyncExternalStore } from 'react';
import { useFetchJson } from '../mdx/hooks/useFetchJson';
import { shellProgramId, useShellProject, type ShellProject } from '../v2/shellProject';
import { listOf } from './qmsList';
import { adaptDoc, type ServerDoc } from './qmsDocumentRecord';

export interface ControlledDocPick { id: number; docNumber: string; title: string; status: string }

export interface RegisterContext {
  /** The organisation's controlled documents, or null while unread or after a failed read. */
  documents: ControlledDocPick[] | null;
  documentsFailed: boolean;
}

export function useRegisterContext(needs: { documents?: boolean } | undefined): RegisterContext {
  const read = useFetchJson<unknown>(needs?.documents ? '/api/mdx/qms/documents' : null);
  const documents = useMemo(() => {
    const rows = needs?.documents ? listOf<ServerDoc>(read.data) : null;
    return rows ? rows.map(adaptDoc).map((d) => ({ id: d.id, docNumber: d.docNumber, title: d.title, status: d.status })) : null;
  }, [needs?.documents, read.data]);
  const documentsFailed = !!needs?.documents && !read.loading && (read.error != null || (read.data != null && documents === null));
  // One object per read state: the register's AnA-context effect depends on it.
  return useMemo(() => ({ documents, documentsFailed }), [documents, documentsFailed]);
}

/** How a document id reads in a register: its number when read, never a guess when not. */
export function documentLabel(ctx: RegisterContext, id: number | null | undefined): string {
  if (id == null) return '—';
  const doc = ctx.documents?.find((d) => d.id === id);
  if (doc) return doc.docNumber;
  if (ctx.documents) return `document #${id} (not in the register)`;
  return ctx.documentsFailed ? `document #${id} (register not read)` : '…';
}

/* ─── The scope Quality reads (C14, QP3) ──────────────────────────────────────
   Opened with a project open, Quality shows that project's controlled documents, changes, CAPAs and nonconformances:
   the registers whose rows name a project (`program_id`, admitted by the server as a write's project is). The
   person may widen it to the whole organisation (`?quality=organisation`, so a reload or a copied link keeps it).
   Deviations, suppliers, internal audits, management reviews, periodic review and training have no project; they
   are the organisation's either way, and say so while a project is open. Until 2026-11-10 Quality read the whole
   organisation whichever project was open, while the project page counted that project's records. */
export const QUALITY_SCOPE_PARAM = 'quality';
const scopeListeners = new Set<() => void>();
const readWide = (): boolean => {
  try { return new URLSearchParams(window.location.search).get(QUALITY_SCOPE_PARAM) === 'organisation'; } catch { return false; }
};
const subscribeWide = (listener: () => void) => {
  scopeListeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => { scopeListeners.delete(listener); window.removeEventListener('popstate', listener); };
};

/** Widen Quality to the whole organisation, or narrow it back to the open project. */
export function setQualityWide(wide: boolean): void {
  try {
    const url = new URL(window.location.href);
    if (wide) url.searchParams.set(QUALITY_SCOPE_PARAM, 'organisation');
    else url.searchParams.delete(QUALITY_SCOPE_PARAM);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch { /* a URL that cannot be rewritten keeps its scope; the listeners still hear the choice */ }
  scopeListeners.forEach((listener) => listener());
}

export interface QualityScope {
  /** The project the project-kept registers read, or null for the whole organisation. */
  programId: string | null;
  /** The open project's name, whether or not the person widened the view; null with no project open. */
  projectName: string | null;
  /** True when a project is open and the person chose the whole organisation. */
  wide: boolean;
}

const nameOf = (p: ShellProject | null): string | null =>
  !p ? null : p.code && p.title ? `${p.code} · ${p.title}` : (p.title ?? p.product ?? p.code ?? 'the open project');

export function useQualityScope(): QualityScope {
  const project = useShellProject();
  const wide = useSyncExternalStore(subscribeWide, readWide, () => false);
  const id = shellProgramId(project);
  return { programId: id && !wide ? id : null, projectName: id ? nameOf(project) : null, wide: !!id && wide };
}

/** A list path read for the scope: with `program_id` when a project is in scope. */
export const scopedPath = (path: string, programId: string | null): string =>
  programId ? `${path}${path.includes('?') ? '&' : '?'}program_id=${encodeURIComponent(programId)}` : path;

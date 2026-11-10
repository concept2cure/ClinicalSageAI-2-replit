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
import { useMemo, useRef, useSyncExternalStore } from 'react';
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

/* ─── The scope Quality reads (C14, QP3; P-122) ────────────────────────────────
   Quality reads the whole organisation, with a project open or not (P-122, 2026-11-10). A person may narrow the
   registers whose rows name a project (controlled documents, changes, CAPAs and nonconformances: `program_id`,
   admitted by the server as a write's project is) to the open project (`?quality=project`, so a reload or a copied
   link keeps it). Deviations, suppliers, internal audits, management reviews, periodic review and training have no
   project; they are the organisation's either way, and say so while the registers are narrowed.
   From C14 (`e39cc0d59`, 2026-11-10 08:42) until P-122 the project's records were the default, and a person with a
   project open (the shell keeps one open for the session, shellProject.ts) saw that project's registers only: an
   empty SOP register, since controlled documents are the organisation's. C14's reason stands: the header says whose
   records it lists, and AnA is told. A link written under C14 (`?quality=organisation`) reads the organisation, as
   the default now does. */
export const QUALITY_SCOPE_PARAM = 'quality';
const scopeListeners = new Set<() => void>();
const readNarrowed = (): boolean => {
  try { return new URLSearchParams(window.location.search).get(QUALITY_SCOPE_PARAM) === 'project'; } catch { return false; }
};
const subscribeScope = (listener: () => void) => {
  scopeListeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => { scopeListeners.delete(listener); window.removeEventListener('popstate', listener); };
};

/** Read the whole organisation (the default), or narrow the registers to the open project. */
export function setQualityWide(wide: boolean): void {
  try {
    const url = new URL(window.location.href);
    if (wide) url.searchParams.delete(QUALITY_SCOPE_PARAM);
    else url.searchParams.set(QUALITY_SCOPE_PARAM, 'project');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch { /* a URL that cannot be rewritten keeps its scope; the listeners still hear the choice */ }
  scopeListeners.forEach((listener) => listener());
}

export interface QualityScope {
  /** The project the project-kept registers read, or null for the whole organisation (the default). */
  programId: string | null;
  /** The open project's name, whether or not the person narrowed the view; null with no project open. */
  projectName: string | null;
  /** True when a project is open and the registers read the whole organisation: the default, unless narrowed. */
  wide: boolean;
}

const nameOf = (p: ShellProject | null): string | null =>
  !p ? null : p.code && p.title ? `${p.code} · ${p.title}` : (p.title ?? p.product ?? p.code ?? 'the open project');

export function useQualityScope(): QualityScope {
  const project = useShellProject();
  const narrowed = useSyncExternalStore(subscribeScope, readNarrowed, () => false);
  const id = shellProgramId(project);
  return { programId: id && narrowed ? id : null, projectName: id ? nameOf(project) : null, wide: !!id && !narrowed };
}

/** A list path read for the scope: with `program_id` when a project is in scope. */
export const scopedPath = (path: string, programId: string | null): string =>
  programId ? `${path}${path.includes('?') ? '&' : '?'}program_id=${encodeURIComponent(programId)}` : path;

/**
 * A read's data only while it is the answer to `path`. useFetchJson keeps its last answer while a new path loads, so
 * after "Show the whole organisation", or another project, the previous scope's rows stood as the new scope's until
 * the new read landed (Quality review, 2026-11-10). An answer belongs to the path it arrived for.
 */
export function useAnswerOf<T>(path: string, data: T | null | undefined): T | null {
  const owner = useRef<{ data: unknown; path: string } | null>(null);
  if (data != null && owner.current?.data !== data) owner.current = { data, path };
  return data != null && owner.current?.data === data && owner.current.path === path ? data : null;
}

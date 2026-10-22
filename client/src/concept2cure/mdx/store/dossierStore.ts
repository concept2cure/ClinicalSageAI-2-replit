/**
 * dossierStore — in-memory file system backing every dossier surface.
 *
 * Ported from `ui_kits/mdx/dossier-store.jsx`. The kit shipped
 * this as an IIFE that published `DossierStore` / `useFileNode` / `useSection`
 * on `window`; here it is a real ES module with the same public surface.
 *
 * Mental model:
 *   A program has a Files tree. The dossier is a structured view over the tree:
 *
 *     Files/Dossier/<program>/§N <label>/
 *       body.md            ← what the DossierDrawer edits
 *       meta.json          ← status, signers, version
 *       attachments/<file>
 *
 *   Edits to body.md push a `section.edit` event onto the audit trail; uploads
 *   push `attach` events. The drawer's Activity tab subscribes to the same
 *   store, so the cross-surface round-trip is automatic.
 *
 * It holds only what the backend returns for the program (useDossierHydration).
 * The kit's example dossier and the sample mode that installed it were removed
 * on 2026-10-14.
 */

import * as React from 'react';
import type {
  AuditEvent,
  DossierAttachment,
  DossierDirEntry,
  DossierNode,
  DossierSectionMeta,
} from '../types';

type PathwayId = string;

interface RootSpec {
  label: string;
  numFmt: (n: string | number) => string;
}

/* Folder names for each pathway's dossier root. These used to be
   '510(k) — K-251401', 'PMA — P250048', 'CER — IV-415 Companion' and
   'IVDR — IVD-318 Technical File', with programs BX-204 / CV-330 / IV-415 /
   IVD-318. A K-number and a P-number are identifiers FDA assigns to a
   submission; these were invented, and they named the folder that LIVE
   sections hydrate into, so every tenant's real dossier was shown filed
   under an FDA submission it never made. The root now names the pathway
   only. A real submission number belongs to the tenant's tracked filing. */
const ROOTS: Record<string, RootSpec> = {
  k510: { label: '510(k) dossier',        numFmt: (n) => `§${String(n).padStart(2, '0')}` },
  pma:  { label: 'PMA dossier',           numFmt: (n) => String(n) },
  cer:  { label: 'CER dossier',           numFmt: (n) => `§${n}` },
  ivd:  { label: 'IVDR technical file',   numFmt: (n) => `§${n}` },
};

function rootFor(pathway: PathwayId): string {
  const r = ROOTS[pathway] || ROOTS.k510;
  return `Files/Dossier/${r.label}`;
}

function sectionPath(pathway: PathwayId, sectionId: string | number, label?: string): string {
  const r = ROOTS[pathway] || ROOTS.k510;
  const num = r.numFmt(sectionId);
  let cleanLabel = label || '';
  cleanLabel = cleanLabel.replace(/^eSTAR\s+§?\d+\s*[—-]\s*/i, '');
  cleanLabel = cleanLabel.replace(/^§\d+\s*[—-]\s*/i, '');
  cleanLabel = cleanLabel.replace(/^PMA\s+Module\s+[\d.]+\s*[—-]\s*/i, '');
  return `${rootFor(pathway)}/${num} ${cleanLabel}`;
}

/* REMOVED 2026-10-14: the seed bodies and attachments. They were the kit's
   example dossier — section prose for an invented "IV-415" and a pivotal trial
   nobody ran, attachments with file names and sizes, and editors ("Jordan
   Chen", "Sara Okafor") on fixed 2026-04 dates — installed under sample mode.
   Sample mode is gone; a dossier holds the program's own sections or nothing. */

/* ─────────────── Store ─────────────── */

const fs = new Map<string, DossierNode>();
const subscribers = new Map<string, Set<() => void>>();
const globalSubs = new Set<() => void>();


function notify(path: string): void {
  (subscribers.get(path) || new Set<() => void>()).forEach((cb) => { try { cb(); } catch (e) { console.error(e); } });
  globalSubs.forEach((cb) => { try { cb(); } catch (e) { console.error(e); } });
}

function read(path: string): DossierNode | undefined { return fs.get(path); }

function subscribe(path: string, cb: () => void): () => void {
  if (!subscribers.has(path)) subscribers.set(path, new Set());
  subscribers.get(path)!.add(cb);
  return () => { subscribers.get(path)?.delete(cb); };
}
function subscribeAll(cb: () => void): () => void {
  globalSubs.add(cb);
  return () => { globalSubs.delete(cb); };
}

/* ─────────────── Section file API ─────────────── */

function sectionFolder(pathway: PathwayId, sectionId: string | number, label?: string): string {
  return sectionPath(pathway, sectionId, label);
}

function readSectionBody(pathway: PathwayId, sectionId: string | number, label?: string): string {
  return fs.get(`${sectionFolder(pathway, sectionId, label)}/body.md`)?.body || '';
}

function readSectionMeta(pathway: PathwayId, sectionId: string | number, label?: string): DossierSectionMeta {
  return fs.get(`${sectionFolder(pathway, sectionId, label)}/meta.json`)?.meta || {};
}

function readSectionAttachments(pathway: PathwayId, sectionId: string | number, label?: string): DossierAttachment[] {
  return fs.get(`${sectionFolder(pathway, sectionId, label)}/attachments`)?.files || [];
}

interface WriteOpts { when?: string; who?: string; role?: string; silent?: boolean }

function writeSectionBody(
  pathway: PathwayId,
  sectionId: string | number,
  label: string | undefined,
  body: string,
  opts: WriteOpts = {},
): void {
  const folder = sectionFolder(pathway, sectionId, label);
  const path = `${folder}/body.md`;
  const prev = fs.get(path);
  fs.set(path, { kind: 'file', body, size: body.length, when: opts.when || new Date().toISOString(), who: opts.who || 'You' });

  const metaPath = `${folder}/meta.json`;
  const meta = fs.get(metaPath)?.meta || {};
  fs.set(metaPath, {
    kind: 'file',
    /* No version bump here: a version is what the server's snapshot trigger
       assigns on a successful save. Incrementing it locally claimed a version
       that a failed PATCH never created. */
    meta: { ...meta, lastEdited: opts.when || new Date().toISOString(), ...(opts.who ? { lastEditor: opts.who } : {}) },
  });

  /* This pushed a `section.edit` row into an in-memory audit list — actor
     "You", role "Reg Lead" (hardcoded), id from Math.random — before, and
     regardless of whether, the governed PATCH succeeded, and the drawer's
     Activity tab rendered it as the section's history. The attach path had
     exactly this removed (see attachFile). The history now comes from the
     server's c2c_document_section_versions rows (hooks/useSectionVersions);
     this store records content, not events. */
  notify(path);
  notify(metaPath);
  notify(`audit:${pathway}`);
}

interface AttachInput { name: string; size?: number; kind?: string; source?: string }

function attachFile(
  pathway: PathwayId,
  sectionId: string | number,
  label: string | undefined,
  file: AttachInput,
  opts: WriteOpts = {},
): void {
  const folder = sectionFolder(pathway, sectionId, label);
  const path = `${folder}/attachments`;
  const cur = fs.get(path)?.files || [];
  const newFile: DossierAttachment = {
    name:   file.name,
    size:   file.size || 0,
    kind:   file.kind || guessKind(file.name),
    who:    opts.who || 'You',
    when:   opts.when || new Date().toISOString(),
    source: file.source || 'Sources/uploads/',
    live:   !opts.silent,
  };
  fs.set(path, { kind: 'dir', files: [newFile, ...cur] });

  /* NO client-authored audit event here.
     This used to push a `kind: 'attach'` row into `liveAuditEvents` — the same
     array the dossier's Part 11 activity feed renders — with actor 'You' and a
     hardcoded role of 'Reg Lead', for a file that at the time was never
     transmitted anywhere. A browser cannot witness a governed event: it does
     not know the actor's real role, it cannot see its own source address, and
     it has nothing to chain the entry to. What it produced was an audit line
     that looked exactly like a real one and recorded something that had not
     happened.
     The attachment is a real upload now (PathwayPanes onAttach → POST
     /api/vault/ingest), and the server writes the audit row in the same
     transaction as the document. That entry arrives through /api/mdx/audit
     like every other one. This function keeps the local list current so the
     tab updates without a round trip; it no longer claims to record history. */

  notify(path);
  notify(`audit:${pathway}`);
}

/* liveEventsForPathway and activityForSection are removed with the list they
   read. The browser no longer authors audit events at all; a section's history
   is the server's (hooks/useSectionVersions). */

/* ─────────────── Helpers ─────────────── */

function approxDiff(prev: string, next: string): string {
  const a = prev.split('\n');
  const b = next.split('\n');
  const setA = new Set(a);
  const setB = new Set(b);
  let add = 0;
  let rem = 0;
  b.forEach((l) => { if (!setA.has(l)) add += l.length; });
  a.forEach((l) => { if (!setB.has(l)) rem += l.length; });
  return `+${Math.max(1, Math.round(add / 8))} / −${Math.max(0, Math.round(rem / 8))}`;
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function guessKind(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'doc';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return ext === 'csv' ? 'csv' : 'xls';
  if (['png', 'jpg', 'jpeg', 'svg', 'gif'].includes(ext)) return 'img';
  if (['json', 'xml', 'js', 'ts', 'py'].includes(ext)) return 'code';
  return 'file';
}

function listDir(prefix: string): DossierDirEntry[] {
  const entries: DossierDirEntry[] = [];
  const seen = new Set<string>();
  fs.forEach((_node, path) => {
    if (!path.startsWith(prefix + '/')) return;
    const rest = path.slice(prefix.length + 1);
    const head = rest.split('/')[0];
    if (!seen.has(head)) {
      seen.add(head);
      const fullPath = `${prefix}/${head}`;
      entries.push({ name: head, path: fullPath, isDir: rest.includes('/'), node: fs.get(fullPath) });
    }
  });
  return entries.sort((a, b) => (Number(b.isDir) - Number(a.isDir)) || a.name.localeCompare(b.name));
}

/* ─────────────── Backend hydration ─────────────── */
/* Install the program's real c2c_documents sections for a pathway. Invoked
   when the backend returns sections (see useDossierHydration); otherwise the
   pathway is cleared. Writes through the same sectionFolder() path scheme the
   tree + drawer read, so both follow with no component change. */

const backendDocId = new Map<PathwayId, string>();

export interface HydrateSection {
  key: string | number;
  label: string;
  status?: string;
  version?: number;
  owner?: string;
  when?: string;
  body?: string;
  attachments?: DossierAttachment[];
}

function clearPathway(pathway: PathwayId): void {
  const prefix = rootFor(pathway) + '/';
  Array.from(fs.keys()).forEach((k) => { if (k.startsWith(prefix)) fs.delete(k); });
}

function hydratePathway(pathway: PathwayId, docId: string | null, sections: HydrateSection[]): void {
  clearPathway(pathway);
  if (!sections.length) {
    backendDocId.delete(pathway);
    return;
  }
  if (docId) backendDocId.set(pathway, docId); else backendDocId.delete(pathway);
  const touched: string[] = [];
  sections.forEach((s) => {
    const folder = sectionFolder(pathway, s.key, s.label);
    const body = s.body ?? '';
    const bodyPath = `${folder}/body.md`;
    const metaPath = `${folder}/meta.json`;
    const attPath = `${folder}/attachments`;
    fs.set(bodyPath, { kind: 'file', body, size: body.length, when: s.when, who: s.owner });
    fs.set(metaPath, { kind: 'file', meta: {
      sectionId: s.key, label: s.label, status: s.status || 'draft',
      version: s.version || 1, lastEdited: s.when, lastEditor: s.owner || '—',
      signers: [], blocker: null,
    } });
    fs.set(attPath, { kind: 'dir', files: s.attachments || [] });
    touched.push(bodyPath, metaPath, attPath);
  });
  // notify() hits both the path subscribers (an open drawer's useSection) and the
  // global subscribers; the tree itself remounts via a version key in PathwayPanes.
  touched.forEach((p) => notify(p));
}

function getBackendDocId(pathway: PathwayId): string | undefined {
  return backendDocId.get(pathway);
}

function clearAllPathways(): void {
  Object.keys(ROOTS).forEach(clearPathway);
  backendDocId.clear();
}

/* ─────────────── Public API ─────────────── */

export const DossierStore = {
  rootFor,
  sectionFolder,
  readSectionBody,
  readSectionMeta,
  readSectionAttachments,
  writeSectionBody,
  attachFile,
  subscribe,
  subscribeAll,
  fmtSize,
  guessKind,
  fs,
  listDir,
  clearPathway,
  hydratePathway,
  getBackendDocId,
  clearAllPathways,
};

/** Subscribe a component to a single node path; re-renders on write. */
export function useFileNode(path: string): DossierNode | undefined {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => subscribe(path, force), [path]);
  return read(path);
}

export interface SectionView {
  body: string;
  meta: DossierSectionMeta;
  attachments: DossierAttachment[];
  folder: string;
}

/** Subscribe a component to a section's body / meta / attachments. */
export function useSection(pathway: PathwayId, sectionId: string | number, label?: string): SectionView {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    const folder = sectionFolder(pathway, sectionId, label);
    const u1 = subscribe(`${folder}/body.md`, force);
    const u2 = subscribe(`${folder}/meta.json`, force);
    const u3 = subscribe(`${folder}/attachments`, force);
    return () => { u1(); u2(); u3(); };
  }, [pathway, sectionId, label]);
  return {
    body:        readSectionBody(pathway, sectionId, label),
    meta:        readSectionMeta(pathway, sectionId, label),
    attachments: readSectionAttachments(pathway, sectionId, label),
    folder:      sectionFolder(pathway, sectionId, label),
  };
}

// No module-load seed: live, empty, loading, denied and failed customer
// workspaces all begin empty, and only useDossierHydration writes to them.

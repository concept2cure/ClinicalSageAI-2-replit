/**
 * Document Authoring — the editable regulatory-document canvas.
 *
 * Registry id: `document-authoring` (full: true, ownsConversation: true)
 *
 * Full-bleed 3-pane editor: document tree (left), editable content canvas
 * (center), and a review rail (right) that flips between AnA, the section's
 * revision history, its comment thread and the sources it is drafted from.
 *
 * REAL WIRING (regulated GA product): this surface is driven end-to-end by the
 * governed authoring store at `/api/authoring` (server/routes/authoring.router.ts,
 * tables authoring_documents / authoring_sections / doc_revisions /
 * authoring_comments / authoring_citations):
 *
 *   • tree     — the project's governed filing outline from
 *                GET /api/c2c/documents/:id/outline (rule-pack sections merged
 *                with live status), bound to the authored sections that hold
 *                the text by code. GET /api/authoring/docs?status= lists the
 *                documents, and GET /api/authoring/docs/:docId/sections their
 *                sections.
 *   • canvas   — the selected section's `content` is edited in place and saved
 *                with PATCH /api/authoring/sections/:sectionId. The server
 *                snapshots the prior content into doc_revisions on every
 *                content change (revision_created:true), so every save is an
 *                auditable revision — no client-side fabrication of version ids.
 *   • history  — GET /api/authoring/sections/:sectionId/history lists the real
 *                revisions (author + timestamp from the server); Revert POSTs
 *                /revert {rev_id}, which itself snapshots current content first.
 *   • comments — GET /api/authoring/documents/:docId/comments reads the thread;
 *                Add comment POSTs /api/authoring/sections/:sectionId/comment.
 *
 * HONESTY: every pane renders live org-scoped data, an honest empty, or an
 * honest failed-load — never a fixture. Writes are awaited; a success toast
 * fires only after the server confirms, and on failure nothing local is
 * mutated. Author attribution shown in history/comments is the server's
 * (JWT-sourced created_by), never guessed. "Draft with AnA" streams from the
 * real assistant rather than injecting fabricated content.
 *
 * ── Where "Draft with AnA" used to go ────────────────────────────────────────
 * Nowhere. This surface is registered `ownsConversation: true` (was
 * `hideAna: true`), so the shell does not draw its AnA rail here — and the
 * editor cannot give that column back: `.ed` is `220px minmax(420px,1fr)` and
 * gains a third 300px track whenever a rail mode is open, a hard 940px minimum
 * that with the shell's 380px rail needs 1376px before the doc column reaches
 * its own floor. Yet three affordances — "Draft with AnA", DocCanvas's
 * §-drafting and cite-this-claim, and "Ask what changed" on a drifted source —
 * called the shell's `onAsk`. The question went into the rail this screen never
 * renders, `ask()` persisted `anaOpen: true`, and the answer appeared later on
 * whichever surface next drew a rail.
 *
 * The editor answers in place now. The right rail gains a fourth mode beside
 * history / comments / sources, backed by this surface's own named
 * conversation (`useAnaChat`, screen `document-authoring`) and grounded on the
 * open document and section via `authoringContext`. Every ask on this surface
 * opens that pane, so the request and its answer are visible beside the text
 * they are about — and a governed command comes back as the real §11.50
 * sign-off instead of disappearing.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { useAnaChat } from '../../components/ana/useAnaChat';
import { SignoffList } from '../SignoffList';
import type { PendingSignoff } from '../../components/ana/useGovernedAction';
import type { AuthoringContextPack } from '@shared/types/authoring-context';
import { apiRequest } from '@/lib/queryClient';
import { AuthoringFilingBar } from './AuthoringFilingBar';
import { AuthoringPlaceIntoFiling } from './AuthoringPlaceIntoFiling';
import { AuthoringCollab } from './AuthoringCollab';
import { AuthoringCreateExport } from './AuthoringCreateExport';
import { DocCanvas } from './EditorCanvas';
import { describeRulePackProvenance } from '@shared/rule-pack-provenance';

import { useFilingOutline, findSectionForNode, nodeHasDraft } from '../useFilingOutline';
import {
  EDITOR_TARGET_DOC_LABELS,
  clearEditorTarget,
  describeEditorTarget,
  matchEditorTargetSection,
  peekEditorTarget,
  type EditorTarget,
} from '../editorTarget';
import { isFeatureEnabled } from '@/flags/featureFlags';
import '../styles/project-home-v2.css';

/* ── Server row shapes (mirror server/routes/authoring.router.ts) ── */

interface AuthDoc {
  id: string;
  title: string;
  module: string | null;
  product_code: string | null;
  status: string;
  updated_at: string | null;
  section_count: number | string | null;
}

interface AuthSection {
  id: string;
  doc_id: string;
  code: string;
  title: string;
  content: string | null;
  order_index: number | null;
  comment_count: number | string | null;
  revision_count: number | string | null;
  citation_count: number | string | null;
  updated_at: string | null;
}

interface AuthRevision {
  id: string;
  section_id: string;
  content: string | null;
  created_at: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
}

interface AuthComment {
  id: string;
  section_id: string | null;
  body: string;
  status: string | null;
  author_name: string | null;
  section_code: string | null;
  section_title: string | null;
  created_at: string | null;
}

/**
 * A recorded citation of a canonical source, as the server reports it
 * (server/services/clinical-regulatory-evidence/source-usage.service.ts).
 *
 * `state` is the citation's standing against the source's content TODAY:
 *   current      the checksum recorded at cite time still matches
 *   changed      the source's content moved after this section cited it
 *   unverified   no checksum was recorded — nothing to compare, nothing claimed
 *   unresolved   the source no longer resolves for this tenant
 * Never inferred here; it is computed server-side from stored checksums.
 */
interface SectionSource {
  citationId: string;
  citedAt: string | null;
  citationText: string | null;
  citedChecksum: string | null;
  state: 'current' | 'changed' | 'unverified' | 'unresolved';
  source: {
    id: number;
    title: string | null;
    checksum: string | null;
    extractionStatus: string | null;
    mimeType: string | null;
  } | null;
}

/** A source in the project's Data Room, for the "add a source" picker. */
interface ProjectSource {
  id: number;
  title: string | null;
  extractionStatus: string | null;
}

/** How each citation state reads to an author. */
function sourceStateLabel(s: SectionSource): { text: string; tone: 'ok' | 'warn' | 'muted'; hint: string } {
  switch (s.state) {
    case 'current':
      return {
        text: 'Content unchanged since cited',
        tone: 'ok',
        hint: 'The checksum recorded when this section cited the source still matches the source today.',
      };
    case 'changed':
      return {
        text: 'Source changed since cited',
        tone: 'warn',
        hint:
          'This section was drafted from earlier content. Nothing has been rewritten — re-read the source and decide whether it changes what this section says.',
      };
    case 'unresolved':
      return {
        text: 'Source no longer available',
        tone: 'warn',
        hint: 'The citation is recorded but the source does not resolve in this organization — it may have been deleted.',
      };
    default:
      return {
        text: 'Not checked against content',
        tone: 'muted',
        hint: 'No checksum was recorded for this citation, so no claim is made about whether the source has changed.',
      };
  }
}

/* ── Small toast (local per-surface pattern, matches sibling surfaces) ── */
function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fire = useCallback((m: string) => {
    setMsg(m);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(''), 4200);
  }, []);
  return [msg, fire];
}
function C2CToast({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="de-toast"><span className="ico">{I.checkCircle}</span>{msg}</div>;
}

/* ── Helpers ── */

/** GET via apiRequest without throwing — honest {ok,status,body}. */
async function readJson<T = any>(path: string): Promise<{ ok: boolean; status: number; body: T | null }> {
  try {
    const res = await apiRequest('GET', path);
    const body = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: null };
  }
}

function num(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Coarse relative time from an ISO timestamp; '' when absent. */
function relTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days} d ago`;
  if (hrs > 0) return `${hrs} h ago`;
  if (mins > 0) return `${mins} min ago`;
  return 'just now';
}

const STATUSES = ['draft', 'in_review', 'approved'];

/* ════ Document Authoring surface ════ */

/** The REAL Part 11 sign-off prompts AnA returned for governed commands issued
 *  from the editor's pane, each resolving through GovernedActionSignoff
 *  (POST /api/ana-ri/governed-action) to the server's confirmation. */
function AuthoringSignoffs({ signoffs }: { signoffs: PendingSignoff[] }) {
  return (
    <SignoffList
      signoffs={signoffs}
      style={{ display: 'grid', gap: 8, marginTop: 8 }}
      doneClassName="cmt-body"
    />
  );
}

export function DocumentAuthoring({ onNav }: OwnedSurfaceViewProps) {
  // `module` is no longer a filter the user drives — the filing outline is. It
  // survives only as the value AuthoringCreateExport needs when creating a new
  // document, and it now follows the selected section instead of a dropdown
  // that defaulted every filing type to "M3".
  const [module, setModule] = useState('M3');
  const [status, setStatus] = useState('draft');

  /* ── The project's governed filing outline ──
     The tree this canvas navigates by. A project's structure is fixed at
     creation: the wizard writes program_type + primary_agency, and
     scaffoldProjectDocuments() inserts the matching rule pack's whole section
     tree. A BLA is 71 nested sections, a 510(k) is A/B/C/D/E, a CER is A0–A8.
     Until now none of it reached here — the canvas showed a Module × status
     dropdown pair, defaulted to M3, identical for every filing type. */
  const projectIdForOutline = (() => {
    const p = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
    return p && typeof p.id === 'string' ? p.id : null;
  })();
  const filing = useFilingOutline(projectIdForOutline);

  // Documents for the current filter.
  const [docs, setDocs] = useState<AuthDoc[]>([]);
  const [docsState, setDocsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  // Sections of the active document.
  const [sections, setSections] = useState<AuthSection[]>([]);
  const [sectionsState, setSectionsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // The editable buffer for the active section, plus the last-saved baseline.
  const [draft, setDraft] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Right rail: AnA, revision history, comments, or the section's sources.
  const [rail, setRail] = useState<'ana' | 'history' | 'comments' | 'sources' | null>(null);
  const [revisions, setRevisions] = useState<AuthRevision[]>([]);
  // 'error' is a distinct state on purpose: an empty list because the read
  // failed and an empty list because there are no revisions are the same value
  // and opposite facts.
  const [revisionsState, setRevisionsState] = useState<'ready' | 'error'>('ready');
  const [comments, setComments] = useState<AuthComment[]>([]);
  const [newComment, setNewComment] = useState('');

  // What the active section is drafted from, plus the project's Data Room for the
  // picker. Both are live reads; neither has a fixture fallback.
  const [sources, setSources] = useState<SectionSource[]>([]);
  const [sourcesState, setSourcesState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [projectSources, setProjectSources] = useState<ProjectSource[]>([]);
  const [picking, setPicking] = useState(false);

  const [toast, fireToast] = useToast();

  /* ── Editor deep-link target (window.C2C_EDITOR_TARGET) ──
     Set by a workbench click ("Open §11 in editor", a CER Generator row) via
     v2/editorTarget.ts, the same set-navigate-consume idiom as C2C_CONVO.
     Peeked in the initializer (pure — safe under StrictMode double-render),
     CLEARED on mount: the channel is one-shot, so a target that isn't honoured
     now can never ambush a later, unrelated visit to the editor. */
  const [editorTarget] = useState<EditorTarget | null>(() => peekEditorTarget());
  /** The honest miss: why the deep-link did not open what it named. Rendered
   *  as a dismissible notice over the DEFAULT view — never a silent
   *  wrong-document open. */
  const [targetNotice, setTargetNotice] = useState<string | null>(null);
  /** The section the deep-link resolved, consumed by loadSections so the
   *  refetch that follows a document switch selects the target section
   *  instead of the document's first. Doc-scoped: a stale in-flight load of a
   *  DIFFERENT document must neither consume it nor act on it. */
  const targetSectionRef = useRef<{ docId: string; sectionId: string } | null>(null);
  useEffect(() => {
    clearEditorTarget();
  }, []);

  const activeDoc = docs.find((d) => d.id === activeDocId) ?? null;
  const activeSection = sections.find((s) => s.id === activeSectionId) ?? null;
  const dirty = activeSection != null && draft !== savedContent;

  /* ── The editor's own conversation ──
     Grounded on what is open: `authoringContext` is the contract the server's
     orchestrator uses to resolve project / document / section instead of
     guessing from the message text, so "tighten this" means this section. */
  const [anaDraft, setAnaDraft] = useState('');
  const anaScrollRef = useRef<HTMLDivElement>(null);
  const authoringContext = useMemo<AuthoringContextPack | null>(
    () =>
      projectIdForOutline
        ? {
            projectId: projectIdForOutline,
            workflowStage: 'section-workspace',
            artifactId: activeDocId ?? undefined,
            artifactStatus: activeDoc?.status ?? undefined,
            moduleCode: activeDoc?.module ?? undefined,
            sectionCode: activeSection?.code ?? undefined,
            sectionTitle: activeSection?.title ?? undefined,
          }
        : null,
    [
      projectIdForOutline,
      activeDocId,
      activeDoc?.status,
      activeDoc?.module,
      activeSection?.code,
      activeSection?.title,
    ],
  );
  /* With no project open there is no AuthoringContextPack to build (it requires
     a projectId), so the document/section identity still travels as module
     context rather than being dropped. */
  const moduleContext = useMemo(
    () => ({
      surface: 'document-authoring',
      documentId: activeDocId,
      documentTitle: activeDoc?.title ?? null,
      sectionId: activeSectionId,
      sectionCode: activeSection?.code ?? null,
      sectionTitle: activeSection?.title ?? null,
    }),
    [activeDocId, activeDoc?.title, activeSectionId, activeSection?.code, activeSection?.title],
  );
  const ana = useAnaChat({
    screenName: 'document-authoring',
    projectId: projectIdForOutline,
    authoringContext,
    moduleContext,
  });

  /* Every ask on this surface goes here. It OPENS the pane first — the whole
     defect was a question with no visible destination, so a silent send would
     only move the silence. */
  const askAna = useCallback(
    (text: string) => {
      const clean = (text ?? '').trim();
      if (!clean) return;
      setRail('ana');
      void ana.send(clean);
    },
    [ana],
  );

  useEffect(() => {
    if (rail !== 'ana') return;
    const el = anaScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rail, ana.messages.length, ana.isStreaming]);

  /* ── Load documents for the current module/status ── */
  const loadDocs = useCallback(async () => {
    setDocsState('loading');
    // Scope to the open project when one is set on the runtime channel
    // (window.C2C_PROJECT — the same convention every project-aware surface
    // reads). A string id is a regulatory_programs UUID; absent or non-string →
    // org-wide, so the editor still works with no project open.
    const proj = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
    const programId = proj && typeof proj.id === 'string' ? proj.id : null;
    // No `module` filter. Every filter on this route is optional server-side,
    // and pinning one hid the rest of the dossier behind a dropdown — the
    // outline is what selects a section now, so the document list must span
    // all modules for it to select into.
    const url =
      `/api/authoring/docs?status=${encodeURIComponent(status)}` +
      (programId ? `&programId=${encodeURIComponent(programId)}` : '');
    const { ok, body } = await readJson<{ documents?: AuthDoc[] }>(url);
    if (!ok || !body) { setDocsState('error'); setDocs([]); return; }
    const list = Array.isArray(body.documents) ? body.documents : [];
    setDocs(list);
    setDocsState('ready');
    // Keep the active doc if it survives the new filter; else pick the first.
    setActiveDocId((cur) => (cur && list.some((d) => d.id === cur) ? cur : list[0]?.id ?? null));
  }, [status]);

  useEffect(() => { void loadDocs(); }, [loadDocs]);

  /* ── Load sections when the active document changes ── */
  const loadSections = useCallback(async (docId: string) => {
    setSectionsState('loading');
    const { ok, body } = await readJson<{ sections?: AuthSection[] }>(
      `/api/authoring/docs/${encodeURIComponent(docId)}/sections`,
    );
    if (!ok || !body) { setSectionsState('error'); setSections([]); return; }
    const list = Array.isArray(body.sections) ? body.sections : [];
    setSections(list);
    setSectionsState('ready');
    // A deep-link resolution may have named the section this load should land
    // on. Selected HERE, after setSections, so the buffer-sync effect below
    // reads the section's real content — selecting it before the list arrived
    // would sync an empty buffer over a section that has text. Consumed only
    // by a load of the document it names: a stale in-flight load of another
    // document must not swallow the target.
    const target = targetSectionRef.current;
    const landTarget =
      target != null && target.docId === docId && list.some((s) => s.id === target.sectionId);
    if (target != null && target.docId === docId) targetSectionRef.current = null;
    setActiveSectionId((cur) => {
      if (landTarget) return target!.sectionId;
      return cur && list.some((s) => s.id === cur) ? cur : list[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    if (!activeDocId) { setSections([]); setSectionsState('idle'); setActiveSectionId(null); return; }
    void loadSections(activeDocId);
  }, [activeDocId, loadSections]);

  /* ── Sync the editable buffer to the active section ── */
  useEffect(() => {
    const content = activeSection?.content ?? '';
    setDraft(content);
    setSavedContent(content);
  }, [activeSectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Honour the deep-link target ──
     One attempt per mount, once the document list is ready and the governed
     outline has settled. FAIL CLOSED at every step: a target scoped to a
     different program, a target whose family contradicts this project's
     governed dossier, or a section no document in scope holds, all land on
     the DEFAULT view with a notice that says so — resolving a near-miss into
     the wrong document would be worse than an honest miss.

     One-shot via refs rather than by nulling the state inside the effect:
     a dep-change cleanup would cancel the in-flight search the moment the
     state write re-ran the effect. `aliveRef` guards only real unmount. */
  const targetAttemptedRef = useRef(false);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);
  const [treeScrollNonce, setTreeScrollNonce] = useState(0);
  useEffect(() => {
    if (targetAttemptedRef.current) return;
    if (!editorTarget || docsState === 'loading' || filing.loading) return;
    targetAttemptedRef.current = true;
    const t = editorTarget;
    // A hand-off that named no section carried only program scope, which
    // window.C2C_PROJECT already delivered. Nothing more was claimed.
    if (!t.sectionCode && !t.sectionLabel) return;
    const family = EDITOR_TARGET_DOC_LABELS[t.docType];
    const wanted = describeEditorTarget(t);
    if (docsState === 'error') {
      // The tree pane already reports the failed read; this says what it cost.
      setTargetNotice(
        `Couldn’t open ${wanted} — the document list failed to load, so nothing was resolved. ` +
          'Retry once documents load.',
      );
      return;
    }
    if (t.programId && t.programId !== projectIdForOutline) {
      setTargetNotice(
        `Couldn’t open ${wanted} — it belongs to ${t.programTitle ?? 'a different program'}, ` +
          'which is not the project this editor is scoped to. Open that project and retry. ' +
          'Showing the editor’s default view instead.',
      );
      return;
    }
    if (filing.document && filing.document.doc_type !== t.docType) {
      setTargetNotice(
        `Couldn’t open ${wanted} — this project’s governed dossier is ` +
          `${filing.document.doc_type.toUpperCase()}, not ${family}. ` +
          'Showing the editor’s default view instead.',
      );
      return;
    }
    void (async () => {
      // The docs list is program-scoped (or the org's current filter); a
      // program's dossier is one or a few documents, so the search is bounded
      // defensively rather than paged.
      for (const d of docs.slice(0, 8)) {
        const { ok, body } = await readJson<{ sections?: AuthSection[] }>(
          `/api/authoring/docs/${encodeURIComponent(d.id)}/sections`,
        );
        if (!aliveRef.current) return;
        if (!ok || !body) continue;
        const match = matchEditorTargetSection(
          Array.isArray(body.sections) ? body.sections : [],
          t,
        );
        if (match) {
          // Route the selection through loadSections (via targetSectionRef) so
          // the section is selected only once its list — and therefore its
          // content — is in state. Selecting directly here could sync an empty
          // buffer over a section that has text.
          targetSectionRef.current = { docId: d.id, sectionId: match.id };
          if (d.id === activeDocId) void loadSections(d.id);
          else setActiveDocId(d.id);
          setTreeScrollNonce((n) => n + 1);
          fireToast(`Opened ${match.code} · ${match.title} — from the ${family} workspace.`);
          return;
        }
      }
      if (!aliveRef.current) return;
      setTargetNotice(
        `Couldn’t find ${wanted} in the ${family} documents in scope ` +
          `(status filter: ${status.replace('_', ' ')}). Showing the editor’s default view — ` +
          'the section may not be drafted here yet, or may sit under another status.',
      );
    })();
  }, [
    editorTarget,
    docsState,
    docs,
    filing.loading,
    filing.document,
    projectIdForOutline,
    status,
    activeDocId,
    loadSections,
    fireToast,
  ]);

  /* Bring the deep-linked section's tree row into view once it is active.
     Re-runs as the tree fills in; a no-op when nothing is active yet. */
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!treeScrollNonce) return;
    const row = rootRef.current?.querySelector<HTMLElement>('.ed-tree-row[data-active]');
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
  }, [treeScrollNonce, activeSectionId, sections]);

  /* ── Load the right-rail data for the active section on demand ── */
  const loadHistory = useCallback(async (sectionId: string) => {
    // `ok` is honoured because a read FAILURE must never be rendered as an
    // assertion about the record. This destructured only `body`, so a 500 —
    // which this endpoint returned on every single call while its join was
    // `u.id = r.created_by::uuid` (integer = uuid, 42883 at parse time) —
    // produced an empty array and the rail said "No prior revisions". An
    // author who had saved five times was told her edits were never versioned,
    // and a reviewer was told the section had never changed.
    const { ok, body } = await readJson<{ revisions?: AuthRevision[] }>(
      `/api/authoring/sections/${encodeURIComponent(sectionId)}/history`,
    );
    if (!ok) {
      setRevisionsState('error');
      setRevisions([]);
      return;
    }
    setRevisionsState('ready');
    setRevisions(Array.isArray(body?.revisions) ? body!.revisions! : []);
  }, []);

  const loadComments = useCallback(async (docId: string) => {
    const { body } = await readJson<{ comments?: AuthComment[] }>(
      `/api/authoring/documents/${encodeURIComponent(docId)}/comments`,
    );
    setComments(Array.isArray(body?.comments) ? body!.comments! : []);
  }, []);

  /* ── The sources this section is drafted from ──
     Live read, honest failure. An error is reported as an error rather than as
     an empty list: "we could not load what this section cites" and "this section
     cites nothing" are different facts, and on a regulated surface conflating
     them is the more dangerous mistake. */
  const loadSources = useCallback(async (sectionId: string) => {
    setSourcesState('loading');
    const { ok, body } = await readJson<{ sources?: SectionSource[] }>(
      `/api/authoring/sections/${encodeURIComponent(sectionId)}/sources`,
    );
    if (!ok || !body) { setSourcesState('error'); setSources([]); return; }
    setSources(Array.isArray(body.sources) ? body.sources : []);
    setSourcesState('ready');
  }, []);

  /* ── The project's Data Room, for the picker ──
     The project comes from window.C2C_PROJECT, the same runtime channel the
     sibling surfaces use. With no project in context there is nothing to offer,
     and the picker says so instead of listing every source in the org. */
  const loadProjectSources = useCallback(async () => {
    const p = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
    const pid = p?.id == null ? null : String(p.id);
    if (!pid) { setProjectSources([]); return; }
    const { ok, body } = await readJson<{ sources?: ProjectSource[] }>(
      `/api/c2c/projects/${encodeURIComponent(pid)}/sources`,
    );
    setProjectSources(ok && Array.isArray(body?.sources) ? body!.sources! : []);
  }, []);

  useEffect(() => {
    if (rail === 'history' && activeSectionId) void loadHistory(activeSectionId);
    if (rail === 'comments' && activeDocId) void loadComments(activeDocId);
    if (rail === 'sources' && activeSectionId) {
      void loadSources(activeSectionId);
      void loadProjectSources();
    }
  }, [rail, activeSectionId, activeDocId, loadHistory, loadComments, loadSources, loadProjectSources]);

  /* ── Record that this section is drafted from a source ── */
  const citeSource = useCallback(async (sourceId: number) => {
    if (!activeSectionId) return;
    try {
      const res = await apiRequest('POST', `/api/authoring/sections/${activeSectionId}/cite-source`, {
        source_id: sourceId,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        fireToast('Couldn’t record the source — ' + ((json as any)?.error ?? `HTTP ${res.status}`) + '. Nothing was saved.');
        return;
      }
      fireToast(
        (json as any)?.created
          ? 'Source recorded — this section now cites it, with the source’s current checksum.'
          : 'Source re-resolved against its current content.',
      );
      setPicking(false);
      void loadSources(activeSectionId);
    } catch (e) {
      fireToast('Couldn’t record the source — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  }, [activeSectionId, fireToast, loadSources]);

  /* ── Stop citing a source ── */
  const uncite = useCallback(async (sourceId: number) => {
    if (!activeSectionId) return;
    const res = await apiRequest('DELETE', `/api/authoring/sections/${activeSectionId}/cite-source/${sourceId}`);
    if (!res.ok) {
      fireToast('Couldn’t remove the citation — a frozen citation is immutable. Nothing was changed.');
      return;
    }
    fireToast('Citation removed.');
    void loadSources(activeSectionId);
  }, [activeSectionId, fireToast, loadSources]);

  /* ── Re-read the source and record what it says now ──
     The server re-resolves against the stored source; it does not invent a hash.
     A citation whose source is gone, or which is frozen, is refused with a reason. */
  const reresolve = useCallback(async (citationId: string) => {
    if (!activeSectionId) return;
    const res = await apiRequest('POST', `/api/authoring/sections/${activeSectionId}/refresh-token`, {
      cite_id: citationId,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      fireToast((json as any)?.message ?? 'Couldn’t re-read the source. Nothing was changed.');
      return;
    }
    fireToast((json as any)?.message ?? 'Source re-read.');
    void loadSources(activeSectionId);
  }, [activeSectionId, fireToast, loadSources]);

  /* ── Save the section content (real, awaited, auto-revisioned) ── */
  const save = useCallback(async () => {
    if (!activeSection || !dirty || saving) return;
    setSaving(true);
    try {
      const res = await apiRequest('PATCH', `/api/authoring/sections/${activeSection.id}`, {
        content: draft,
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) { fireToast('Not saved — your session isn’t authenticated. Sign in and retry.'); return; }
      if (!res.ok) {
        fireToast('Couldn’t save the section — ' + ((json as any)?.error ?? `HTTP ${res.status}`) + '. Nothing was persisted.');
        return;
      }
      const adopted = (json as { section?: AuthSection })?.section;
      const persisted = adopted?.content ?? draft;
      setSavedContent(persisted);
      setDraft(persisted);
      // Adopt the server row (revision counter, updated_at) into the tree.
      setSections((ss) => ss.map((s) => (s.id === activeSection.id ? { ...s, ...(adopted ?? {}), content: persisted } : s)));
      fireToast('Section saved — a revision was recorded (' + activeSection.code + ').');
      // Keep the history rail fresh if it's open.
      if (rail === 'history') void loadHistory(activeSection.id);
    } catch (e) {
      fireToast('Couldn’t save the section — ' + (e instanceof Error ? e.message : String(e)) + '.');
    } finally {
      setSaving(false);
    }
  }, [activeSection, dirty, saving, draft, rail, loadHistory, fireToast]);

  /* ── Rich editor (DocCanvas) — gated behind ENABLE_RICH_SECTION_EDITOR
     (default OFF, so the textarea below is the shipping default). When on, the
     canvas auto-saves the HTML it emits through the SAME governed, auto-revisioned
     PATCH the textarea uses. Throwing on failure lets DocCanvas show its error
     save-state instead of silently implying a save that did not happen. ── */
  const richEditor = isFeatureEnabled('ENABLE_RICH_SECTION_EDITOR');
  const saveHtml = useCallback(async (html: string) => {
    if (!activeSection) return;
    const res = await apiRequest('PATCH', `/api/authoring/sections/${activeSection.id}`, {
      content: html,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      fireToast('Couldn’t save the section — ' + ((json as any)?.error ?? `HTTP ${res.status}`) + '. Nothing was persisted.');
      throw new Error('save failed');
    }
    const adopted = (json as { section?: AuthSection })?.section;
    const persisted = adopted?.content ?? html;
    setSavedContent(persisted);
    setDraft(persisted);
    setSections((ss) => ss.map((s) => (s.id === activeSection.id ? { ...s, ...(adopted ?? {}), content: persisted } : s)));
    if (rail === 'history') void loadHistory(activeSection.id);
  }, [activeSection, rail, loadHistory, fireToast]);

  /* ── Revert to a prior revision (server snapshots current first) ── */
  const revert = useCallback(async (revId: string) => {
    if (!activeSection) return;
    try {
      const res = await apiRequest('POST', `/api/authoring/sections/${activeSection.id}/revert`, { rev_id: revId });
      const json = await res.json().catch(() => null);
      if (res.status === 401) { fireToast('Not reverted — your session isn’t authenticated.'); return; }
      if (!res.ok) { fireToast('Couldn’t revert — ' + ((json as any)?.error ?? `HTTP ${res.status}`) + '.'); return; }
      const adopted = (json as { section?: AuthSection })?.section;
      const content = adopted?.content ?? '';
      setDraft(content);
      setSavedContent(content);
      setSections((ss) => ss.map((s) => (s.id === activeSection.id ? { ...s, ...(adopted ?? {}), content } : s)));
      fireToast('Section reverted to the selected revision.');
      void loadHistory(activeSection.id);
    } catch (e) {
      fireToast('Couldn’t revert — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  }, [activeSection, loadHistory, fireToast]);

  /* ── Add a comment on the active section ── */
  const addComment = useCallback(async () => {
    if (!activeSection || !activeDocId || !newComment.trim()) return;
    try {
      const res = await apiRequest('POST', `/api/authoring/sections/${activeSection.id}/comment`, {
        body: newComment.trim(),
        doc_id: activeDocId,
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) { fireToast('Comment not posted — your session isn’t authenticated.'); return; }
      if (!res.ok) { fireToast('Couldn’t post the comment — ' + ((json as any)?.error ?? `HTTP ${res.status}`) + '.'); return; }
      setNewComment('');
      fireToast('Comment added.');
      void loadComments(activeDocId);
    } catch (e) {
      fireToast('Couldn’t post the comment — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  }, [activeSection, activeDocId, newComment, loadComments, fireToast]);

  const draftPrompt = activeSection
    ? `Draft ${activeSection.code} ${activeSection.title} from the linked section evidence.`
    : 'Draft this section from the linked section evidence.';

  // What the filing outline was built FROM, in the words the filer sees.
  // Null only when there is no governed document, in which case there is no
  // outline to qualify either.
  const provenance = filing.document
    ? describeRulePackProvenance(filing.document.provenance)
    : null;

  return (
    <div className="ed" ref={rootRef} data-comments={rail != null || undefined}>
      {/* ── Left: document + section tree ── */}
      <aside className="ed-tree">
        <div className="ed-tree-h">
          <div className="ed-tree-t">
            {filing.document ? filing.document.title : 'Document tree'}
          </div>
          <div className="ed-tree-m">
            {filing.document
              ? `${filing.document.doc_type.toUpperCase()} · ${filing.document.agency.toUpperCase()} · ${filing.flat.length} sections`
              : `${docs.length} document${docs.length === 1 ? '' : 's'} · ${status.replace('_', ' ')}`}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {/* The Module select is gone. It defaulted every filing type to
                "M3" and hid the rest of the dossier behind a dropdown; the
                filing outline below is the navigation now. Status stays — it
                is a view filter, not a definition of the tree. */}
            <select className="c2c-input" style={{ height: 28, flex: 1 }} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
        </div>

        {/* ── What the outline below was built FROM ──
            Until this shipped, a tree transcribed from 21 CFR 814.20(b) and a
            tree constructed by reasoning about a regulation with no enumerated
            annex rendered identically, so a filer could not tell which one
            they were drafting against. The provenance columns recorded the
            difference; this is where it becomes visible. */}
        {provenance && filing.tree.length > 0 && (
          <div className="ed-basis">
            <div className="ed-basis-h">
              <span className="ed-basis-chip" data-tone={provenance.tone}>
                {provenance.headline}
              </span>
              <span className="ed-basis-l">outline basis</span>
            </div>
            <p className="ed-basis-d">{provenance.detail}</p>
          </div>
        )}

        {/* ── The governed filing outline, when this project has one ──
            Derived from (doc_type × agency) via c2c_rule_packs, so a BLA shows
            its 71 nested sections and a 510(k) shows A/B/C/D/E. Nodes bind to
            the authored section that holds the text by code. */}
        {filing.tree.length > 0 && (
          <div className="ed-tree-scroll" style={{ flex: '0 0 auto', maxHeight: '46%', borderBottom: '1px solid var(--border)' }}>
            {filing.flat.map((node) => {
              const bound = findSectionForNode(sections, node.key);
              const isActive = bound != null && bound.id === activeSectionId;
              return (
                <button
                  key={node.key}
                  className="ed-tree-row"
                  data-active={isActive || undefined}
                  style={{ paddingLeft: 10 + node.depth * 12, opacity: bound ? 1 : 0.62 }}
                  title={
                    bound
                      ? `${node.label} — open`
                      : `${node.label} — not started in this document yet`
                  }
                  onClick={() => {
                    if (bound) {
                      setActiveSectionId(bound.id);
                      // Keep the create/export module in step with where the
                      // author actually is, instead of a stale dropdown value.
                      const m = /^(\d)/.exec(node.key)?.[1];
                      if (m) setModule(`M${m}`);
                    } else {
                      fireToast(`${node.key} ${node.label} — no draft yet in this document.`);
                    }
                  }}
                >
                  <span className="ed-num">{node.key}</span>
                  <span className="ed-lbl" style={{ fontWeight: node.depth === 0 ? 600 : 400 }}>
                    {node.label}
                  </span>
                  {node.mandatory && !bound && (
                    <span className="rd-chip tone-idle" style={{ marginLeft: 'auto' }} title="Required by the rule pack">
                      required
                    </span>
                  )}
                  {/* Asked of BOTH stores. node.has_content reads the governed
                      c2c_document_sections; this editor writes authoring_sections,
                      so on its own the dot could never light for anything drafted
                      here. See nodeHasDraft. */}
                  {nodeHasDraft(node, bound) && (
                    <span className="ed-dot" data-s="ok" title={node.status} />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Why there is no outline, said plainly rather than as a blank pane.
            A project with no governed document is usually not a fault: program
            types ivd/device/ide/biologic/anda have no rule pack, and the
            scaffolder skips them deliberately. */}
        {filing.reason === 'no-governed-document' && (
          <div className="scaf-note" style={{ padding: '10px 12px', fontSize: 12 }}>
            This project has no governed filing document, so there is no section
            outline to show. Projects created before scaffolding — and program
            types with no rule pack — fall here.
          </div>
        )}

        <div className="ed-tree-scroll">
          {docsState === 'loading' ? (
            <div className="scaf-note" style={{ padding: 16 }}>Loading documents…</div>
          ) : docsState === 'error' ? (
            <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load documents"
              hint="GET /api/authoring/docs didn’t respond. Sign in to your tenant and retry." />
          ) : docs.length === 0 ? (
            <EmptyState icon={I.fileText} title="No documents here"
              hint={`No ${status.replace('_', ' ')} documents in this project. Switch the status filter above.`} />
          ) : (
            docs.map((d) => {
              const open = d.id === activeDocId;
              return (
                <div key={d.id} className="ed-vol">
                  <button
                    className="ed-tree-row"
                    data-active={open || undefined}
                    onClick={() => setActiveDocId(d.id)}
                    style={{ fontWeight: 600 }}
                  >
                    <span className="ed-num">{d.module ?? '—'}</span>
                    <span className="ed-lbl">{d.title}</span>
                    <span className="rd-chip tone-idle" style={{ marginLeft: 'auto' }}>{num(d.section_count)}</span>
                  </button>
                  {open && (
                    sectionsState === 'loading' ? (
                      <div className="scaf-note" style={{ padding: '6px 12px' }}>Loading sections…</div>
                    ) : sectionsState === 'error' ? (
                      <div className="scaf-note" style={{ padding: '6px 12px', color: 'var(--c2c-err,#b42318)' }}>Couldn’t load sections.</div>
                    ) : sections.length === 0 ? (
                      <div className="scaf-note" style={{ padding: '6px 12px' }}>No sections yet in this document.</div>
                    ) : (
                      sections.map((s) => (
                        <button
                          key={s.id}
                          className="ed-tree-row"
                          data-active={activeSectionId === s.id || undefined}
                          onClick={() => setActiveSectionId(s.id)}
                          style={{ paddingLeft: 22 }}
                        >
                          <span className="ed-num">{s.code}</span>
                          <span className="ed-lbl">{s.title}</span>
                          {num(s.comment_count) > 0 && <span className="ed-dot" data-s="review" title={`${num(s.comment_count)} comments`} />}
                        </button>
                      ))
                    )
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Center: editable canvas ── */}
      <section className="ed-doc">
        <header className="ed-doc-h">
          <div className="ed-crumbs">
            <span>{activeDoc?.module ?? 'eCTD'}</span>
            <span className="sep">›</span>
            <span>{activeDoc?.title ?? 'No document'}</span>
            {activeSection && <><span className="sep">›</span><span className="here">{activeSection.code}</span></>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <AuthoringCreateExport
              docId={activeDoc?.id ?? null}
              docTitle={activeDoc?.title ?? null}
              module={module}
              fireToast={fireToast}
              onDocCreated={(d) => {
                // Adopt the server's document: refetch the tree and open it.
                void loadDocs().then(() => setActiveDocId(d.id));
              }}
              onSectionCreated={(s) => {
                if (activeDocId) void loadSections(activeDocId).then(() => setActiveSectionId(s.id));
              }}
            />
            <button className="btn ghost" style={{ height: 30 }} onClick={() => setRail(rail === 'ana' ? null : 'ana')} data-active={rail === 'ana' || undefined}>
              {I.sparkles} AnA{ana.messages.length > 0 ? ' ' + ana.messages.length : ''}
            </button>
            <button className="btn ghost" style={{ height: 30 }} onClick={() => setRail(rail === 'comments' ? null : 'comments')} data-active={rail === 'comments' || undefined}>
              {I.checkCircle} Comments{activeSection && num(activeSection.comment_count) > 0 ? ' ' + num(activeSection.comment_count) : ''}
            </button>
            <button className="btn ghost" style={{ height: 30 }} onClick={() => setRail(rail === 'history' ? null : 'history')} data-active={rail === 'history' || undefined}>
              {I.clock} History{activeSection && num(activeSection.revision_count) > 0 ? ' ' + num(activeSection.revision_count) : ''}
            </button>
            <button className="btn ghost" style={{ height: 30 }} onClick={() => setRail(rail === 'sources' ? null : 'sources')} data-active={rail === 'sources' || undefined}>
              {I.fileText} Sources{activeSection && num(activeSection.citation_count) > 0 ? ' ' + num(activeSection.citation_count) : ''}
            </button>
            <button className="btn primary" style={{ height: 30 }} onClick={save} disabled={!dirty || saving}>
              {I.check} {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
            </button>
            <button className="btn ghost" style={{ height: 30 }} onClick={() => askAna(draftPrompt)}>
              {I.sparkles} Draft with AnA
            </button>
            {activeDoc && (
              <AuthoringCollab documentId={activeDoc.id} sectionId={activeSectionId} fireToast={fireToast} />
            )}
            {activeDoc && (
              <AuthoringFilingBar
                docId={activeDoc.id}
                docTitle={activeDoc.title}
                docStatus={activeDoc.status}
                onChanged={() => { void loadDocs(); if (activeDocId) void loadSections(activeDocId); }}
                fireToast={fireToast}
              />
            )}
            {/* The authoring → filing seam: place the OPEN document into an
                eCTD sequence of the canonical submission core. Beside the
                freeze/e-sign bar because it is the same family of act — the
                document leaving the editor for the governed record. */}
            {activeDoc && (
              <AuthoringPlaceIntoFiling
                docId={activeDoc.id}
                docTitle={activeDoc.title}
                activeSectionCode={activeSection?.code ?? null}
                dirty={dirty}
                onNav={onNav}
                fireToast={fireToast}
              />
            )}
          </div>
        </header>

        {/* ── The deep-link's honest miss ──
            A workbench click named a section this canvas could not open. The
            DEFAULT view renders underneath — stated, dismissible, and never a
            silently-wrong document. */}
        {targetNotice && (
          <div
            className="scaf-note"
            role="status"
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'baseline',
              padding: '8px 16px',
              fontSize: 12,
              borderBottom: '1px solid var(--c2c-line,#e4e7ec)',
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>{targetNotice}</span>
            <button className="nda-open" onClick={() => setTargetNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        <div className="ed-doc-scroll">
          <div className="ed-doc-inner">
            {!activeSection ? (
              <div style={{ paddingTop: 48 }}>
                <EmptyState icon={I.fileText}
                  title={activeDoc ? 'Select a section to edit' : 'Select a document'}
                  hint={activeDoc
                    ? 'Choose a section from the tree to open its content in the editor. Every save records an auditable revision.'
                    : 'Choose a document from the tree to open its sections.'} />
              </div>
            ) : (
              <>
                <div className="ed-mast">
                  <div className="ed-mast-num">{activeSection.code}</div>
                  <h1 className="ed-mast-t">{activeSection.title}</h1>
                  <div className="ed-mast-meta">
                    {activeDoc?.title ?? ''}
                    {num(activeSection.revision_count) > 0 ? ` · ${num(activeSection.revision_count)} revisions` : ''}
                    {num(activeSection.citation_count) > 0 ? ` · ${num(activeSection.citation_count)} citations` : ''}
                    {dirty ? ' · unsaved changes' : activeSection.updated_at ? ` · saved ${relTime(activeSection.updated_at)}` : ''}
                  </div>
                </div>
                {richEditor ? (
                  <div style={{ minHeight: 460, border: '1px solid var(--c2c-line,#e4e7ec)', borderRadius: 10, overflow: 'hidden' }}>
                    <DocCanvas
                      key={activeSection.id}
                      sec={{ id: activeSection.id, num: activeSection.code, title: activeSection.title }}
                      blocks={[{ p: draft }]}
                      onAsk={askAna}
                      onSave={saveHtml}
                      /* The text this section's lineage was recorded against —
                         the last SAVED content, not the in-flight draft. With
                         it, "Data Origins" refuses to answer once the canvas
                         has drifted from what lineage describes, rather than
                         reporting the provenance of the wrong words. */
                      lineageCanonicalText={savedContent}
                    />
                  </div>
                ) : (
                  <textarea
                    className="ed-canvas"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); void save(); } }}
                    placeholder="Write the section content here. Cmd/Ctrl-S saves and records a revision."
                    spellCheck
                    style={{
                      width: '100%', minHeight: 460, resize: 'vertical', border: '1px solid var(--c2c-line,#e4e7ec)',
                      borderRadius: 10, padding: '18px 20px', fontSize: 15, lineHeight: 1.7,
                      fontFamily: 'Georgia, "Times New Roman", serif', color: 'var(--c2c-ink,#101828)',
                      background: 'var(--c2c-surface,#fff)', outline: 'none',
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Right: AnA — this surface's own conversation ──
          The editor holds the AnA rail's column (see the header note), so this
          is where an ask on this surface is answered. Real streamed turns from
          /api/ana-ri/stream grounded on the open document and section; nothing
          is composed locally, and a governed command renders its real §11.50
          sign-off here rather than in a rail this screen does not draw. */}
      {rail === 'ana' && (
        <aside className="ed-comments" aria-label="AnA — document authoring">
          <div className="ed-comments-h">
            AnA{activeSection ? ` · ${activeSection.code}` : activeDoc ? ` · ${activeDoc.title}` : ''}
          </div>
          <div
            ref={anaScrollRef}
            style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 12px', display: 'grid', gap: 12, alignContent: 'start' }}
          >
            {ana.messages.length === 0 ? (
              <EmptyState
                icon={I.sparkles}
                title="Ask AnA about this section"
                hint={
                  activeSection
                    ? `Draft, tighten or cite ${activeSection.code}. AnA answers here, grounded on the saved document — it proposes; you accept and save, and every save records an auditable revision.`
                    : 'Select a section, then ask AnA to draft, tighten or cite it. AnA answers here, grounded on the saved document.'
                }
              />
            ) : (
              ana.messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="cmt">
                    <div className="cmt-meta"><b>You</b></div>
                    <div className="cmt-body">{m.text}</div>
                  </div>
                ) : (
                  <div key={i} className="cmt">
                    <div className="cmt-meta"><b>AnA</b></div>
                    {/* Until the first token lands the server's status phase
                        stands in — never an invented sentence. */}
                    <div className="cmt-body" style={{ whiteSpace: 'pre-wrap' }}>
                      {m.text || (m.streaming ? m.statusPhase || 'Thinking…' : '')}
                    </div>
                    {Array.isArray(m.executedActions) && m.executedActions.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {m.executedActions.map((a, ai) => (
                          <span key={ai} className="rd-chip tone-ok" title={a.error || a.label}>{a.label}</span>
                        ))}
                      </div>
                    )}
                    {Array.isArray(m.pendingSignoffs) && m.pendingSignoffs.length > 0 && (
                      <AuthoringSignoffs signoffs={m.pendingSignoffs} />
                    )}
                  </div>
                ),
              )
            )}
          </div>
          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--c2c-line,#e4e7ec)' }}>
            <textarea
              className="c2c-input"
              value={anaDraft}
              onChange={(e) => setAnaDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const t = anaDraft.trim();
                  if (!t || ana.isStreaming) return;
                  setAnaDraft('');
                  askAna(t);
                }
              }}
              placeholder={activeSection ? `Ask about ${activeSection.code}…` : 'Ask AnA…'}
              style={{ width: '100%', minHeight: 56, resize: 'vertical', fontSize: 13 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                {I.lock} AnA proposes; you accept and save.
              </span>
              <button
                className="btn primary"
                style={{ height: 28 }}
                disabled={!anaDraft.trim() || ana.isStreaming}
                onClick={() => {
                  const t = anaDraft.trim();
                  if (!t) return;
                  setAnaDraft('');
                  askAna(t);
                }}
              >
                {ana.isStreaming ? 'Answering…' : 'Send'}
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ── Right: history / comments rail ── */}
      {rail === 'history' && (
        <aside className="ed-comments">
          <div className="ed-comments-h">Revision history</div>
          {!activeSection ? (
            <EmptyState icon={I.clock} title="No section selected" hint="Select a section to see its revision history." />
          ) : revisionsState === 'error' ? (
            <EmptyState icon={I.alertTriangle} title="Revision history unavailable"
              hint="The history could not be loaded. This is a failure to read the record — it does not mean the section has no revisions." />
          ) : revisions.length === 0 ? (
            <EmptyState icon={I.clock} title="No prior revisions"
              hint="Each save records the new content here under its author, so you can compare and revert." />
          ) : (
            revisions.map((r) => (
              <div key={r.id} className="cmt">
                <div className="cmt-meta">
                  <span className="cmt-av">{(r.created_by_name ?? '·').split(' ').map((x) => x[0]).join('').slice(0, 2)}</span>
                  <b>{r.created_by_name ?? r.created_by_email ?? 'Unknown author'}</b>
                  <span className="cmt-when">· {relTime(r.created_at)}</span>
                  <button className="nda-open" style={{ marginLeft: 'auto' }} onClick={() => revert(r.id)}>{I.rotateCcw} Revert</button>
                </div>
                <div className="cmt-body" style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden' }}>
                  {(r.content ?? '').slice(0, 400) || <span style={{ opacity: 0.6 }}>(empty)</span>}
                </div>
              </div>
            ))
          )}
        </aside>
      )}

      {/* ── Right: what this section is drafted from ──
          The source context that had to be held in the author's head. Every row
          is a citation someone recorded, with its standing against the source's
          content today computed server-side from stored checksums — nothing here
          is inferred from the draft text. */}
      {rail === 'sources' && (
        <aside className="ed-comments">
          <div className="ed-comments-h">Drafted from</div>
          {!activeSection ? (
            <EmptyState icon={I.fileText} title="No section selected"
              hint="Select a section to see the sources it is drafted from." />
          ) : sourcesState === 'loading' ? (
            <div className="scaf-note" style={{ padding: 12 }}>Loading this section’s sources…</div>
          ) : sourcesState === 'error' ? (
            <EmptyState icon={I.alertTriangle} title="Couldn’t load this section’s sources"
              hint="The read failed, so nothing is shown — this is not the same as the section citing nothing. Sign in and retry, or check the service is reachable." />
          ) : (
            <>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--c2c-line,#e4e7ec)' }}>
                {!picking ? (
                  <button className="btn ghost" style={{ height: 28, fontSize: 12 }} onClick={() => setPicking(true)}>
                    {I.plus} Record a source
                  </button>
                ) : projectSources.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    No project sources available. Add documents to the project’s data room first, or
                    open this document from its project so the data room is in context.
                    <button className="nda-open" style={{ marginLeft: 8 }} onClick={() => setPicking(false)}>Close</button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 11.5, opacity: 0.75 }}>
                      Choose a source from this project’s data room. Its current checksum is recorded
                      with the citation.
                    </span>
                    {projectSources.map((ps) => (
                      <button
                        key={ps.id}
                        className="nda-open"
                        style={{ textAlign: 'left' }}
                        disabled={ps.extractionStatus !== 'extracted'}
                        title={
                          ps.extractionStatus === 'extracted'
                            ? 'Record this section as drafted from this source'
                            : 'This source has no readable text, so it cannot ground a draft'
                        }
                        onClick={() => void citeSource(ps.id)}
                      >
                        {ps.title || `Source ${ps.id}`}
                        {ps.extractionStatus !== 'extracted' ? ' — text not readable' : ''}
                      </button>
                    ))}
                    <button className="nda-open" onClick={() => setPicking(false)}>Cancel</button>
                  </div>
                )}
              </div>

              {sources.length === 0 ? (
                <EmptyState icon={I.fileText} title="No sources recorded for this section"
                  hint="Record the documents this section is written from. Each citation stores the source’s content identity, so if the source later changes this section is flagged rather than quietly left behind." />
              ) : (
                sources.map((s) => {
                  const st = sourceStateLabel(s);
                  return (
                    <div key={s.citationId} className="cmt">
                      <div className="cmt-meta">
                        <b style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.source?.title ?? `Source ${s.citationId.slice(0, 8)}`}
                        </b>
                        <span className="cmt-when">· cited {relTime(s.citedAt)}</span>
                      </div>
                      <div className="cmt-body" style={{ display: 'grid', gap: 4 }}>
                        <span className={st.tone === 'ok' ? 'sp-tone-ok' : st.tone === 'warn' ? 'sp-tone-warn' : undefined}
                          style={{ fontSize: 12 }} title={st.hint}>
                          {st.text}
                        </span>
                        {s.citationText && <span style={{ fontSize: 12, opacity: 0.85 }}>{s.citationText}</span>}
                        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="nda-open" onClick={() => void reresolve(s.citationId)}>
                            {I.rotateCcw} Re-read source
                          </button>
                          {s.source && (
                            <button className="nda-open" onClick={() => void uncite(s.source!.id)}>
                              Remove
                            </button>
                          )}
                          {s.state === 'changed' && (
                            <button className="nda-open" onClick={() => askAna(
                              `The source "${s.source?.title ?? 'this document'}" changed after section ${activeSection.code} was drafted from it. Read the current source and tell me what in this section no longer matches. Do not rewrite it yet.`,
                            )}>
                              {I.sparkles} Ask what changed
                            </button>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </aside>
      )}

      {rail === 'comments' && (
        <aside className="ed-comments">
          <div className="ed-comments-h">Comments</div>
          {activeSection && (
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--c2c-line,#e4e7ec)' }}>
              <textarea
                className="c2c-input" value={newComment} onChange={(e) => setNewComment(e.target.value)}
                placeholder={`Comment on ${activeSection.code}…`}
                style={{ width: '100%', minHeight: 56, resize: 'vertical', fontSize: 13 }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <button className="btn primary" style={{ height: 28 }} onClick={addComment} disabled={!newComment.trim()}>{I.plus} Add comment</button>
              </div>
            </div>
          )}
          {comments.length === 0 ? (
            <EmptyState icon={I.checkCircle} title="No comments yet" hint="Review comments on this document appear here." />
          ) : (
            comments.map((c) => (
              <div key={c.id} className="cmt">
                <div className="cmt-meta">
                  <span className="cmt-av">{(c.author_name ?? '·').split(' ').map((x) => x[0]).join('').slice(0, 2)}</span>
                  <b>{c.author_name ?? 'Unknown'}</b>
                  {c.section_code && <span className="cmt-role">{c.section_code}</span>}
                  <span className="cmt-when">· {relTime(c.created_at)}</span>
                  {c.status && c.status !== 'open' && <span className="rd-chip tone-ok" style={{ marginLeft: 'auto' }}>{c.status}</span>}
                </div>
                <div className="cmt-body">{c.body}</div>
              </div>
            ))
          )}
        </aside>
      )}

      <C2CToast msg={toast} />
    </div>
  );
}

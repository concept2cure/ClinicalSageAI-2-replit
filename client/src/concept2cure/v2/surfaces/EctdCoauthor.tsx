/**
 * eCTD Co-Author — fixture-free (GA real-data standard).
 *
 * System-aware 3-pane artifact architecture: eCTD tree drawer (M1--5),
 * intelligence (AnA) pane, and the live section artifact.
 *
 * Every rendered value is REAL org-scoped data or an honest empty/error state:
 *   • the eCTD backbone tree is the org's REAL coauthor documents
 *     (GET /api/coauthor/documents), bucketed into ICH M4 modules M1--5 by each
 *     document's moduleNumber — never a codebase tree;
 *   • the artifact IS the ONE canonical editor (v2/editor/RichSectionEditor)
 *     over the selected document's persisted content
 *     (coauthor_documents.content, HTML), saving through the store's own
 *     PUT /api/coauthor/documents/:id. A surface named "Co-Author" rendered
 *     that content read-only through dangerouslySetInnerHTML until this — its
 *     own empty state told the author to go draft "in the authoring editor",
 *     an admission the surface could not do its job. Save is explicit
 *     (Cmd/Ctrl-S or the footer control); every keystroke is device-cached and
 *     offered back on return, and stale validation/compliance reports are
 *     cleared on save because they described the previous content;
 *   • structural validation (POST …/validate) and ICH M4 compliance
 *     (GET …/compliance) are computed on the server from that document and its
 *     sections;
 *   • the AnA pane runs the real streaming assistant (/api/ana-ri/stream) on
 *     this surface, grounded to the selected document — it never drafts or
 *     reports tool calls on its own.
 *
 * No fixture, no "Sample data" pill, no fabricated provenance/audit id, no
 * local stand-in. An org with no documents sees an honest empty affordance.
 *
 * ── The pane that could not answer ───────────────────────────────────────────
 * This surface is registered `ownsConversation: true`, so the shell does not
 * draw its AnA rail here. The pane nevertheless forwarded every question to
 * that rail through `onAsk` and kept a local `thread` array that only ever
 * received `role: 'user'` — `setThread` is called once in the whole file and
 * appends nothing else. So the renderer's `m.role === 'ai'` branch was
 * unreachable by construction, the empty state promised the question "opens in
 * AnA, where the answer is generated and traced" while nothing opened, and the
 * answer streamed into a column this screen never draws — surfacing later,
 * unbidden, on the next surface that does.
 *
 * The pane runs its own named conversation now (`useAnaChat`, screen
 * `ectd-coauthor`), the third of the surface docks recorded in
 * tests/ui/one-shell.test.ts. The user's turn and AnA's answer land in the pane
 * they were typed into, and a governed command comes back as the real §11.50
 * sign-off rather than vanishing.
 */
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { I } from '../icons';
import { connected, liveGetOrNull, liveMutateOrNull, EmptyState } from '../dataConnect';
import { RichSectionEditor, type RichSectionEditorHandle } from '../editor/RichSectionEditor';
import { useAnaChat } from '../../components/ana/useAnaChat';
import { useChatUpload, attachmentReadLabel } from '../../hooks/useChatUpload';
import { SignoffList } from '../SignoffList';
import type { PendingSignoff } from '../../components/ana/useGovernedAction';
import { AnswerLead } from '../AnswerLead';
import { assessmentState, mayReassure } from '../assessmentState';
import {
  advertisedScreenActions,
  notifySurfaceActionReady,
  useSurfaceActionHandlers,
} from '../surfaceActions';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import '../styles/ectd-v2.css';

/* ---- Render-contract types ---- */

/** A row from GET /api/coauthor/documents (coauthor_documents). */
interface CoauthorDoc {
  id: number;
  title: string;
  content?: string | null;
  status: string;
  moduleNumber?: string | null;
  moduleName?: string | null;
  completionPercentage?: number | null;
  regulatoryComplianceScore?: number | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
}

interface ValidationFinding {
  type: string;
  severity: string;
  module?: string;
  sectionId?: string;
  message: string;
}

interface ValidationResult {
  isValid: boolean;
  errorCount: number;
  warningCount: number;
  totalSections: number;
  validatedAt: string;
  findings: ValidationFinding[];
}

interface ComplianceCheck {
  ruleId: string;
  description: string;
  status: string;
  module?: string;
}

interface ComplianceResult {
  standard: string;
  complianceScore: number;
  totalChecks: number;
  compliantCount: number;
  nonCompliantCount: number;
  checkedAt: string;
  checks: ComplianceCheck[];
}

/* ---- eCTD backbone labels (ICH M4 module titles — standard structure config,
   not org data; these mirror the server's ECTD_MODULE_STRUCTURE titles). ---- */

const ECTD_MODULE_LABELS: Record<string, string> = {
  '1': 'Administrative Information and Prescribing Information',
  '2': 'Common Technical Document Summaries',
  '3': 'Quality',
  '4': 'Nonclinical Study Reports',
  '5': 'Clinical Study Reports',
};
const MODULE_ORDER = ['1', '2', '3', '4', '5'];

/** Top-level eCTD module a document sits in, from its moduleNumber ("2.5" → "2",
 *  "3.2.P" → "3"). Documents without a module land in an "unassigned" bucket. */
function moduleOf(d: CoauthorDoc): string {
  const m = (d.moduleNumber || '').split('.')[0];
  return m || '—';
}

/** Real document status → the CSS status token (ec-tstatus[data-s]). Maps the
 *  persisted coauthor status vocabulary (draft/in-progress/review/approved/
 *  finalized) onto the backbone's dot styles. */
function statusToken(s: string | null | undefined): string {
  const v = (s || '').toLowerCase();
  if (v === 'approved' || v === 'finalized') return 'approved';
  if (v === 'review' || v === 'in-progress' || v === 'in_progress') return 'review';
  if (v === 'draft') return 'draft';
  return 'todo';
}

/* ---- Validation / compliance actions ----

   Both call the real coauthor endpoints and return null (never a fixture) when
   the endpoint is unreachable or returns no payload — a failed governed check
   must not be indistinguishable from a passing one.

   These previously fell back to a hardcoded `local()` result — invented eCTD
   findings and an invented ICH M4 compliance score, rendered identically to a
   real server response — and runValidateAction was additionally gated on the
   ghost `window.C2C_API` (assigned nowhere in the repo), so it returned null
   before ever issuing a request. Both are now on the sanctioned fetch
   convention (liveMutateOrNull / liveGetOrNull, dataConnect's "real-data
   standard"). The UI renders an explicit unavailable state on null. */

function runValidateAction(docId: number): Promise<ValidationResult | null> {
  return liveMutateOrNull<{ validation?: ValidationResult }>(
    'POST', '/api/coauthor/documents/' + docId + '/validate', {},
  )
    .then((r) => r.data?.validation || null)
    .catch(() => null);
}

function runComplianceAction(docId: number): Promise<ComplianceResult | null> {
  return liveGetOrNull<{ compliance?: ComplianceResult }>(
    '/api/coauthor/documents/' + docId + '/compliance',
  )
    .then((r) => r.data?.compliance || null)
    .catch(() => null);
}

/** The REAL Part 11 sign-off prompts AnA returned for governed commands issued
 *  from this pane, each resolving through GovernedActionSignoff
 *  (POST /api/ana-ri/governed-action) to the server's confirmation. Rendered
 *  here because a §11.50 gate that has nowhere to draw is a gate that silently
 *  does not exist — the exact failure this surface is being fixed for. */
function EctdSignoffs({ signoffs }: { signoffs: PendingSignoff[] }) {
  return (
    <SignoffList
      signoffs={signoffs}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}
      doneClassName="ec-empty"
    />
  );
}

/** The project currently in context, the same runtime channel every
 *  project-aware surface reads. Grounds the pane's conversation on the open
 *  program instead of answering blind. */
function readProjectId(): string | undefined {
  try {
    const p = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
    return p && p.id != null ? String(p.id) : undefined;
  } catch {
    return undefined;
  }
}

/* ---- Component ---- */

export function EctdCoauthor({ liveDrive }: OwnedSurfaceViewProps) {
  const live = connected();

  const [docs, setDocs] = useState<CoauthorDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  // The mounted editor's unsaved-buffer flag (its onDirtyChange). The canvas is
  // keyed by document id, so any switch is an unmount that destroys the buffer
  // — this flag is what lets an AnA-driven switch refuse instead of discard.
  const [editorDirty, setEditorDirty] = useState(false);
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});
  // Tree search — a real client-side filter over the loaded documents
  // (title / eCTD section number), never a dead input.
  const [treeQuery, setTreeQuery] = useState('');
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [focus, setFocus] = useState(false);
  const [tab, setTab] = useState<'document' | 'validation' | 'compliance'>('document');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  // Distinguishes "ran and the endpoint gave us nothing" from "not run yet".
  // Without this the panels would show their idle prompt after a failed call,
  // which reads as "no problems found".
  const [validationUnavailable, setValidationUnavailable] = useState(false);
  const [complianceUnavailable, setComplianceUnavailable] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Fixture-free read: adopt the org's REAL coauthor documents. A failed fetch
     is an honest error; a successful zero-row load is an honest empty — never a
     codebase fixture. Each row already carries its content/status/module, so
     the selected artifact renders straight from the list without a second
     round-trip. */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    liveGetOrNull<{ documents: CoauthorDoc[] }>('/api/coauthor/documents').then((res) => {
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }
      const list = Array.isArray(res.data?.documents) ? res.data!.documents : [];
      setDocs(list);
      // Open every module that actually holds a document.
      const open: Record<string, boolean> = {};
      for (const d of list) open[moduleOf(d)] = true;
      setOpenModules(open);
      if (list.length > 0) {
        setActiveId((cur) => (cur != null && list.some((d) => d.id === cur) ? cur : list[0].id));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeDoc = useMemo(() => docs.find((d) => d.id === activeId) || null, [docs, activeId]);
  const activeRef = activeDoc ? activeDoc.moduleNumber || activeDoc.title : '';

  /* The pane's own named conversation — the REAL streaming assistant, grounded
     on the document the user has open so "tighten this" means this section. */
  const moduleContext = useMemo(() => {
    const base: Record<string, unknown> = {
      surface: 'ectd-coauthor',
      coauthorDocumentId: activeDoc?.id ?? null,
      moduleNumber: activeDoc?.moduleNumber ?? null,
      documentTitle: activeDoc?.title ?? null,
    };
    /* The screen's OPERABLE vocabulary from the shared surface-action registry,
       folded exactly as the shell folds it for railed surfaces (V2App) — this
       surface owns its conversation, so its own chat must advertise what the
       rail would have. Omitted entirely when empty, never an empty claim. */
    const screenActions = advertisedScreenActions('ectd-coauthor');
    return screenActions.length > 0 ? { ...base, screen_actions: screenActions } : base;
  }, [activeDoc?.id, activeDoc?.moduleNumber, activeDoc?.title]);
  const anaChat = useAnaChat({
    screenName: 'ectd-coauthor',
    projectId: readProjectId(),
    moduleContext,
    /* Live Drive bridge — same opt-in and shell-level apply machine as the
       rail's turns (see SurfaceViewProps.liveDrive). */
    liveDrive: liveDrive?.on,
    onDriveEvent: liveDrive?.onDriveEvent,
    onArtifactSaved: liveDrive?.onWorkSaved,
  });
  const turns = anaChat.messages;

  /* Validation + compliance are per-document — clear stale results when the
     active document changes so another document's report is never shown. */
  useEffect(() => {
    setValidation(null);
    setCompliance(null);
    setValidationUnavailable(false);
    setComplianceUnavailable(false);
    // The dirty flag belongs to the editor mount that is going away; the new
    // mount re-reports its own state through onDirtyChange.
    setEditorDirty(false);
  }, [activeId]);

  /* ── The one save path (canonical editor → this store's own PUT) ──
     Awaited and adopted: the tree, readiness and the next validation run all
     read the server's row, never a local echo. Throwing on a refused write is
     the contract the editor's footer renders truthfully ("Save failed — kept
     on this device"). A save also clears the validation/compliance reports:
     they were computed from the PREVIOUS content, and a stale "Valid" over
     new text is a false claim. */
  const editorRef = useRef<RichSectionEditorHandle | null>(null);
  const saveContent = useCallback(
    async (serialized: string) => {
      if (!activeDoc) throw new Error('No document open');
      const r = await liveMutateOrNull<{ document?: CoauthorDoc }>(
        'PUT',
        '/api/coauthor/documents/' + activeDoc.id,
        { content: serialized },
      );
      const saved = r.data?.document;
      if (!saved) {
        throw new Error(r.error || 'The server did not confirm the write.');
      }
      setDocs((ds) => ds.map((d) => (d.id === activeDoc.id ? { ...d, ...saved } : d)));
      setValidation(null);
      setCompliance(null);
      setValidationUnavailable(false);
      setComplianceUnavailable(false);
    },
    [activeDoc],
  );

  /* eCTD backbone: real documents bucketed into ICH M4 modules, M1..M5 first
     then any unassigned. */
  const treeModules = useMemo(() => {
    const byMod = new Map<string, CoauthorDoc[]>();
    for (const d of docs) {
      const m = moduleOf(d);
      if (!byMod.has(m)) byMod.set(m, []);
      byMod.get(m)!.push(d);
    }
    const keys = [
      ...MODULE_ORDER.filter((k) => byMod.has(k)),
      ...Array.from(byMod.keys()).filter((k) => !MODULE_ORDER.includes(k)),
    ];
    return keys.map((k) => ({
      m: k,
      title: ECTD_MODULE_LABELS[k] || 'Unassigned',
      docs: byMod.get(k)!,
    }));
  }, [docs]);

  /* The tree the sidebar renders: all modules, or — while searching — only the
     modules holding a document whose title or section number matches. */
  const treeFilter = treeQuery.trim().toLowerCase();
  const visibleModules = useMemo(() => {
    if (!treeFilter) return treeModules;
    return treeModules
      .map((mod) => ({
        ...mod,
        docs: mod.docs.filter(
          (d) =>
            (d.title || '').toLowerCase().includes(treeFilter) ||
            (d.moduleNumber || '').toLowerCase().includes(treeFilter),
        ),
      }))
      .filter((mod) => mod.docs.length > 0);
  }, [treeModules, treeFilter]);

  /* ── AnA's hands on this screen — the surface-action bus ──────────────────
     Registered under this surface's own surfaceViews id ('ectd-coauthor', an
     identity mapping in the registry). Both handlers drive the SAME state the
     human's own controls drive — setTreeQuery for the search; the tree row's
     setActiveId/setTab pair for opening — never a second path. search-tree
     keeps deliberately NO loading guard: the query is pure view state over
     whatever the read delivers (vault.search's rule), and zero matches is a
     truthful outcome the tree already renders honestly. open-document DOES
     guard: the canvas is keyed by document id, so a switch is an unmount —
     unsaved edits refuse (AnA never discards typing), a running governed
     check refuses, and a still-loading read holds for the ready signal below
     instead of failing. */
  useSurfaceActionHandlers('ectd-coauthor', {
    'ectd-coauthor.search-tree': (params) => {
      const query = (params.query ?? '').trim();
      if (!query) return { ok: false, reason: 'No search term given.' };
      if (error) return { ok: false, reason: 'The eCTD documents could not be read.' };
      setTreeQuery(query);
      return { ok: true, detail: `Filtering the eCTD tree for "${query}"` };
    },
    'ectd-coauthor.open-tab': (params) => {
      const target =
        params.tab === 'validation'
          ? ('validation' as const)
          : params.tab === 'compliance'
            ? ('compliance' as const)
            : ('document' as const);
      if (tab === target) return { ok: true, detail: `Already on the ${target} tab` };
      if (target !== 'document' && editorDirty && activeDoc) {
        return {
          ok: false,
          reason:
            `There are unsaved edits in §${activeDoc.moduleNumber || '—'} ${activeDoc.title} — ` +
            'the editor unmounts on a tab switch; save first (Cmd/Ctrl-S).',
        };
      }
      /* View only, deliberately: the human tab buttons auto-run a missing
         validation/compliance check on switch — a server check AnA must not
         start uninvited. She opens the tab; the panel's idle state and the
         detail say the run is still a human click. */
      setTab(target);
      const unrun =
        activeDoc &&
        ((target === 'validation' && !validation) || (target === 'compliance' && !compliance));
      return {
        ok: true,
        detail:
          `Opened the ${target} tab` +
          (unrun ? ` — no ${target} report has been run yet; running one stays a human click` : ''),
      };
    },
    'ectd-coauthor.open-document': (params) => {
      const raw = (params.document ?? '').trim();
      if (!raw) return { ok: false, reason: 'No document named.' };
      if (editorDirty && activeDoc) {
        return {
          ok: false,
          reason:
            `There are unsaved edits in §${activeDoc.moduleNumber || '—'} ${activeDoc.title} — ` +
            "save them first (Cmd/Ctrl-S or the editor's Save).",
        };
      }
      if (busy !== '') {
        return {
          ok: false,
          reason: `A ${busy} check is running against the open document — let it finish first.`,
        };
      }
      if (loading) return { ok: false, reason: 'The eCTD documents are still loading.', retry: true };
      if (error) return { ok: false, reason: 'The eCTD documents could not be read.' };
      /* Resolution over the flat rows on the tree filter's own fields (title /
         module number): normalized exact first, then containment — multiple
         containment hits are an honest refusal, never a guess. */
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      const want = norm(raw);
      const exact = docs.filter(
        (d) => norm(d.title) === want || (d.moduleNumber || '').toLowerCase() === want,
      );
      const pool =
        exact.length > 0
          ? exact
          : docs.filter(
              (d) =>
                norm(d.title).includes(want) ||
                (d.moduleNumber || '').toLowerCase().includes(want),
            );
      if (pool.length === 0) return { ok: false, reason: `No eCTD document matching "${raw}".` };
      if (pool.length > 1) {
        return { ok: false, reason: `"${raw}" matches ${pool.length} documents — name one exactly.` };
      }
      const match = pool[0];
      if (match.id === activeId) return { ok: true, detail: 'Already open' };
      setActiveId(match.id);
      setTab('document');
      setOpenModules((m) => ({ ...m, [moduleOf(match)]: true }));
      return { ok: true, detail: `Opened §${match.moduleNumber || '—'} ${match.title}` };
    },
  });
  /* The bus's ready signal: search-tree itself never answers not-ready, but a
     directive stashed across the navigate→mount gap still gets its re-attempt
     the moment the read settles. Safe to fire on every settle; a no-op when
     nothing is pending. */
  useEffect(() => {
    if (!loading) notifySurfaceActionReady('ectd-coauthor');
  }, [loading]);

  /* KPIs derived from the REAL rows only (never hardcoded). Readiness weights
     approved/finalized fully and review/in-progress at half. */
  const total = docs.length;
  const approvedCount = docs.filter((d) => statusToken(d.status) === 'approved').length;
  const reviewCount = docs.filter((d) => statusToken(d.status) === 'review').length;
  const readiness = total ? Math.round(((approvedCount + reviewCount * 0.5) / total) * 100) : 0;

  /* ── What the backbone footer is entitled to say ───────────────────────────
     `total`, `approvedCount` and `readiness` are only measurements once the
     read has settled AND returned rows. `docs` is still its initial `[]` for
     the whole of `loading === true` and for the entire error branch (the
     documents fetch handler returns after `setError` without ever calling
     `setDocs`), so all three collapse to 0 in states where the true figures are
     unknown — and `readiness`'s `: 0` above is a fallback, not a finding of
     "0% ready".

     This is the same `loading` / `error` state the tree body and the document
     tab already gate on; no new signal is invented. `assessmentRan` is the
     non-zero denominator — the only condition under which the readiness
     expression divides by something real. Findings are the documents not yet
     approved, so a backbone whose documents are ALL approved still reaches
     `assessed-clear`, and reads 100%. */
  const backboneState = assessmentState({
    loading,
    unreadable: Boolean(error),
    scopeExists: total > 0,
    findingCount: total - approvedCount,
    assessmentRan: total > 0,
  });

  const toggleModule = (m: string) => setOpenModules((prev) => ({ ...prev, [m]: !prev[m] }));

  const runValidate = () => {
    if (!activeDoc) return;
    setBusy('validate');
    setTab('validation');
    runValidateAction(activeDoc.id).then((v) => {
      setValidation(v);
      setValidationUnavailable(v === null);
      setBusy('');
    });
  };
  const runCompliance = () => {
    if (!activeDoc) return;
    setBusy('compliance');
    setTab('compliance');
    runComplianceAction(activeDoc.id).then((c) => {
      setCompliance(c);
      setComplianceUnavailable(c === null);
      setBusy('');
    });
  };

  /* ── "Sources" was a paperclip that could not be clicked ──────────────────
     It rendered as `<span className="ec-chip">{I.paperclip} Sources</span>` —
     a paperclip icon and an action word, in a composer, with no handler and no
     file input anywhere on the surface. On the eCTD co-authoring screen, where
     citing a source document is the entire job.

     Wired to `useChatUpload`, the same /api/chat/upload path the shell composer
     and ProjectHome use: the file is OCR'd and its text written into this
     project's memory, so AnA can cite from it rather than being told a filename
     it cannot open. */
  const attachRef = useRef<HTMLInputElement>(null);
  const {
    attachments: ecAttachments,
    addFiles: ecAddFiles,
    removeAttachment: ecRemoveAttachment,
    clear: ecClearAttachments,
    statusMessage: ecStatusMessage,
  } = useChatUpload({ projectId: readProjectId() ?? null });
  const ecReady = ecAttachments.filter((a) => a.status === 'ready');
  const ecUploading = ecAttachments.filter((a) => a.status === 'uploading');

  const send = () => {
    const q = draft.trim();
    // An attachment alone is a legitimate turn ("read this"), and an in-flight
    // upload must block send or AnA answers about bytes the server has not
    // finished reading.
    if (anaChat.isStreaming || ecUploading.length > 0) return;
    if (!q && ecReady.length === 0) return;
    // Answered HERE, in the pane it was typed into. The turn streams from
    // /api/ana-ri/stream with this document as module context; nothing is
    // manufactured locally and no completed tool chip is invented.
    const names = ecReady.map((a) => a.name);
    const line = names.length ? `Attached: ${names.join(', ')}` : '';
    const scoped = q ? q + (activeRef ? ' (eCTD §' + activeRef + ')' : '') : '';
    const body = scoped && line ? `${scoped}\n\n${line}` : scoped || line;
    setDraft('');
    ecClearAttachments();
    void anaChat.send(body);
  };

  /* Keep the newest turn in view as tokens arrive. */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, anaChat.isStreaming]);

  const artTitle = activeDoc ? activeDoc.title : 'eCTD Co-Author';
  const artMeta = activeDoc
    ? '§' + (activeDoc.moduleNumber || '—') + ' -- ' + (activeDoc.moduleName || ECTD_MODULE_LABELS[moduleOf(activeDoc)] || 'eCTD document')
    : 'No document selected';

  return (
    <div className="ec-shell" data-tree-collapsed={treeCollapsed} data-focus={focus}>
      {/* Top bar */}
      <div className="ec-topbar">
        <button className="ec-topbtn" onClick={() => setTreeCollapsed((v) => !v)} title="Toggle eCTD tree">{I.sidebar || I.menu || I.layers}</button>
        <div className="ec-crumbs">
          {activeDoc ? (
            <>
              <b>{activeDoc.moduleName || ('Module ' + moduleOf(activeDoc))}</b>
              <span className="sep" aria-hidden="true">/</span>{activeDoc.status}
              <span className="sep" aria-hidden="true">/</span><b>&sect;{activeDoc.moduleNumber || '—'} {activeDoc.title}</b>
            </>
          ) : (
            <b>eCTD Co-Author</b>
          )}
        </div>
        <div className="ec-spacer"></div>
        {activeDoc && <span className="ec-autosave">{I.check} {activeDoc.status}</span>}
        <button className="ec-topbtn" onClick={() => setFocus((v) => !v)} title="Focus mode">{focus ? (I.minimize || I.x) : (I.maximize || I.expand || I.layers)}</button>
        <button className="ec-topbtn primary" onClick={runValidate} disabled={!activeDoc}>{I.shieldCheck || I.shield} Validate</button>
      </div>

      {/* eCTD tree */}
      <aside className="ec-tree">
        <div className="ec-tree-head"><b>eCTD backbone</b><span className="mono">M1--5</span></div>
        <div className="ec-tree-search">{I.search}<input aria-label="Find a section" placeholder="Find section..." value={treeQuery} onChange={(e) => setTreeQuery(e.target.value)} /></div>
        {loading ? (
          <div className="ec-empty">Loading eCTD documents…</div>
        ) : error ? (
          <div className="ec-empty sp-tone-warn">Couldn't load eCTD documents.</div>
        ) : docs.length === 0 ? (
          <div className="ec-empty">No eCTD documents yet.</div>
        ) : visibleModules.length === 0 ? (
          <div className="ec-empty">No sections match "{treeQuery.trim()}". Clear the search to see the full backbone.</div>
        ) : (
          visibleModules.map((mod) => (
            <div key={mod.m} className="ec-tree-mod">
              <button className="ec-tree-row" onClick={() => toggleModule(mod.m)}>
                <span className="ec-caret" data-open={treeFilter ? true : !!openModules[mod.m]}>{I.chevronRight || '›'}</span>
                <span className="ec-tnum">M{mod.m}</span>
                <span className="ec-tlabel">{mod.title}</span>
              </button>
              {(treeFilter ? true : openModules[mod.m]) && (
                <div className="ec-tree-children">
                  {mod.docs.map((d) => (
                    <button key={d.id} className="ec-tree-row" data-active={activeId === d.id} onClick={() => { setActiveId(d.id); setTab('document'); }}>
                      <span className="ec-tnum">{d.moduleNumber || '—'}</span>
                      <span className="ec-tlabel">{d.title}</span>
                      <span className="ec-tstatus" data-s={statusToken(d.status)} title={d.status}></span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        {/* ── The strip that measured a dossier nobody had read ─────────────
            These three rows were a SIBLING of the tree body's
            loading / error / empty ternary above, not a branch of it, so they
            rendered on every pass. While the tree body directly above said
            "Loading eCTD documents…" or "Couldn't load eCTD documents.", this
            footer printed "Documents 0 -- Approved 0 -- eCTD readiness 0%" in the
            vocabulary of a measurement: a specific, computed readiness figure
            for a backbone that had not been read, and a confirmed zero
            document count when the count was unknown.

            Each state now says which one it is. The counts return the moment
            the read settles with rows — the gate withholds the figures while
            they are unknown, it does not suppress them. */}
        <div className="ec-tree-foot">
          {backboneState === 'loading' ? (
            <div className="ec-tree-foot-row"><span>eCTD backbone</span><b>Reading…</b></div>
          ) : backboneState === 'unreadable' ? (
            <div className="ec-tree-foot-row"><span>eCTD backbone</span><b className="sp-tone-warn">Not read</b></div>
          ) : (
            <>
              {/* A settled read that returned nothing DOES establish these two:
                  the org has no co-author documents. Readiness does not follow
                  from them — it was measured against nothing. */}
              <div className="ec-tree-foot-row"><span>Documents</span><b>{total}</b></div>
              <div className="ec-tree-foot-row"><span>Approved</span><b>{approvedCount}</b></div>
              <div className="ec-tree-foot-row"><span>eCTD readiness</span><b>{backboneState === 'not-assessed' ? 'Not assessed' : readiness + '%'}</b></div>
              {mayReassure(backboneState, readiness) && (
                <div className="ec-tree-foot-row"><span>eCTD backbone</span><b>All documents approved</b></div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Intelligence (AnA) */}
      <section className="ec-intel">
        <div className="ec-intel-head"><b>AnA</b><span className="hint">co-authoring &sect;{activeRef || '—'} -- {live ? 'live' : 'bound to dossier'}</span></div>
        <div className="ec-intel-scroll" ref={scrollRef}>
          <div className="ec-thread">
            {turns.length === 0 && (
              <div className="ec-empty">
                Ask about {activeRef ? '§' + activeRef : 'this dossier'} — AnA answers here,
                grounded on the document you have open. Every turn is saved to your
                organization's governed conversation store.
              </div>
            )}
            {turns.map((m, i) => m.role === 'user' ? (
              <div key={i} className="ec-msg-user">{m.text}</div>
            ) : (
              <div key={i} className="ec-msg-ai">
                <span className="ec-avatar">AnA</span>
                <div className="ec-body">
                  {/* While the reply streams the server's status phase stands in
                      until the first token lands — never a fabricated sentence. */}
                  <p>{m.text || (m.streaming ? m.statusPhase || 'Thinking…' : '')}</p>
                  {Array.isArray(m.executedActions) && m.executedActions.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {m.executedActions.map((a, ai) => (
                        <span key={ai} className="ec-chip" title={a.error || a.label}>
                          {a.error ? (I.alertTriangle || I.x) : I.check} {a.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {Array.isArray(m.pendingSignoffs) && m.pendingSignoffs.length > 0 && (
                    <EctdSignoffs signoffs={m.pendingSignoffs} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="ec-intel-foot">
          <div className="ec-composer">
            {/* Was aria-label="Filter capabilities" — a copy-paste from another
                pane. A screen-reader user was told this composer was a filter. */}
            <textarea rows={1} aria-label="Ask AnA about this section" placeholder={'Ask AnA to draft, tighten, or cite ' + (activeRef ? '§' + activeRef : 'a section') + '...'} value={draft}
              onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            {ecAttachments.length > 0 && (
              <div className="ec-atts">
                {ecAttachments.map((a) => (
                  <span key={a.id} className="ec-att-chip" data-status={a.status}>
                    {I.paperclip} {a.name}
                    {a.status === 'uploading' && <em> · reading…</em>}
                    {a.status === 'ready' && <em> · {attachmentReadLabel(a.extractionMethod, a.extractionWords) ?? 'read'}</em>}
                    {a.status === 'error' && <em> · {a.error ?? 'failed'}</em>}
                    <button type="button" className="ec-att-x" aria-label={`Remove ${a.name}`} onClick={() => ecRemoveAttachment(a.id)}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="ec-composer-row">
              <input
                ref={attachRef}
                type="file"
                multiple
                className="ana-hidden-input"
                aria-label="Attach a source document for AnA to cite"
                onChange={(e) => { ecAddFiles(e.target.files); if (attachRef.current) attachRef.current.value = ''; }}
                data-testid="ec-attach-input"
              />
              <button
                type="button"
                className="ec-chip"
                onClick={() => attachRef.current?.click()}
                title="Attach a source document for AnA to read and cite"
                data-testid="ec-attach-button"
              >
                {I.paperclip || I.plus} Sources
              </button>
              <button
                className="ec-send"
                aria-label="Send message to AnA"
                disabled={anaChat.isStreaming || ecUploading.length > 0 || (!draft.trim() && ecReady.length === 0)}
                onClick={send}
              >
                {I.arrowUp || I.arrowRight || '→'}
              </button>
            </div>
            <span className="sr-only" aria-live="polite">{ecStatusMessage}</span>
          </div>
        </div>
      </section>

      {/* Artifact -- the hero */}
      <section className="ec-artifact">
        <div className="ec-art-head">
          <span className="ec-art-title">{artTitle}</span>
          <span className="ec-art-meta">{artMeta}</span>
          <span className="ec-spacer"></span>
          <div className="ec-art-tabs">
            {(['document', 'validation', 'compliance'] as const).map((k) => (
              <button key={k} className="ec-art-tab" data-active={tab === k} onClick={() => { setTab(k); if (activeDoc) { if (k === 'compliance' && !compliance) runCompliance(); if (k === 'validation' && !validation) runValidate(); } }}>{k.charAt(0).toUpperCase() + k.slice(1)}</button>
            ))}
          </div>
        </div>

        {tab === 'document' && (
          <div className="ec-art-doc">
            <div className="ec-doc-inner">
              {loading ? (
                <div className="ec-empty">Loading eCTD documents…</div>
              ) : error ? (
                <EmptyState
                  tone="error"
                  icon={I.alertTriangle}
                  title="Couldn't load eCTD documents"
                  hint="These are your organization's co-author documents — sign in and retry, or check the service is reachable."
                />
              ) : !activeDoc ? (
                <EmptyState
                  icon={I.fileText || I.file}
                  title="No eCTD documents yet"
                  hint={
                    <>
                      Create a co-author document to draft it against the eCTD backbone — it is persisted as a governed document — or ask AnA to start one.
                    </>
                  }
                />
              ) : (
                <>
                  <AnswerLead
                    tone="calm"
                    eyebrow={'What §' + (activeDoc.moduleNumber || '—') + ' needs before it can promote'}
                    headline={<><b>&sect;{activeDoc.moduleNumber || '—'} {activeDoc.title}</b> is <b>{activeDoc.status}</b>. The dossier is <b>{readiness}%</b> eCTD-ready across {total} document{total === 1 ? '' : 's'}.</>}
                    body={<>Run eCTD structural validation and ICH M4 compliance against the live backbone as you write — both are computed on the server from this document and its sections.</>}
                    reassure="I keep each check traced to the persisted document and re-run eCTD structure and ICH M4 as it changes."
                    action={{ label: 'Run eCTD validation', onClick: runValidate }}
                    secondary="Or keep drafting — the artifact reflects the saved document."
                  />
                  <h1 className="ec-doc-h1">{activeDoc.title}</h1>
                  <div className="ec-doc-num">&sect;{activeDoc.moduleNumber || '—'}{activeDoc.moduleName ? ' -- ' + activeDoc.moduleName : ''}</div>
                  {/* The canonical editor over the persisted document. An
                      empty document is the editor's placeholder plus its
                      Draft-with-AnA affordance — not a dead end telling the
                      author to go find a different editor. */}
                  <div
                    style={{
                      minHeight: 420,
                      border: '1px solid var(--c2c-line,#e4e7ec)',
                      borderRadius: 10,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <RichSectionEditor
                      key={activeDoc.id}
                      ref={editorRef}
                      value={activeDoc.content ?? ''}
                      format="html"
                      onSave={saveContent}
                      onDirtyChange={setEditorDirty}
                      autosaveMs={null}
                      storageKey={'coauthor:' + activeDoc.id}
                      ariaLabel={'§' + (activeDoc.moduleNumber || '—') + ' ' + activeDoc.title}
                      placeholder={
                        'Write §' +
                        (activeDoc.moduleNumber || 'this section') +
                        ' here. Cmd/Ctrl-S saves the document; validation and compliance re-run against what is saved.'
                      }
                      onAsk={(p) => {
                        void anaChat.send(p);
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'validation' && (
          <div className="ec-art-panel">
            <div className="ec-doc-inner">
              <div className="ec-panel-head">
                <div><div className="ec-panel-t">eCTD structural validation</div><div className="ec-panel-s">ICH M4 eCTD structural rules {live ? '-- live' : ''}</div></div>
                <button className="ec-topbtn primary" onClick={runValidate} disabled={!activeDoc}>{busy === 'validate' ? 'Validating...' : <>{I.refresh || I.check} Re-validate</>}</button>
              </div>
              {!activeDoc ? (
                <div className="ec-empty">Select an eCTD document to validate its structure against the backbone.</div>
              ) : (
                <>
                  {!validation && !validationUnavailable && busy !== 'validate' && <div className="ec-empty">Run validation to check module structure, cross-references and section status against the eCTD backbone.</div>}
                  {validationUnavailable && busy !== 'validate' && (
                    <div className="ec-empty sp-tone-warn">
                      The validation service did not return a result. No findings are shown because none were produced — this is not a clean result.
                    </div>
                  )}
                  {busy === 'validate' && <div className="ec-empty">Validating {activeDoc.title} against ICH M4 structure...</div>}
                  {validation && (
                    <>
                      <div className="ec-vstat" data-valid={validation.isValid}>
                        <span className={'ec-vbadge ' + (validation.isValid ? 'ok' : 'err')}>{validation.isValid ? 'Valid' : validation.errorCount + ' error' + (validation.errorCount === 1 ? '' : 's')}</span>
                        <span className="mono">{validation.errorCount} error -- {validation.warningCount} warning -- {validation.totalSections} sections</span>
                      </div>
                      <div className="ec-findings">
                        {validation.findings.map((f, i) => (
                          <div key={i} className="ec-finding" data-sev={f.severity}>
                            <span className="ec-fsev">{f.severity === 'error' ? (I.alertTriangle || I.x) : (I.info || I.alertCircle)}</span>
                            <div><div className="ec-ftype mono">{f.type}{f.sectionId ? ' -- §' + f.sectionId : ''}{f.module ? ' -- M' + f.module : ''}</div><div className="ec-fmsg">{f.message}</div></div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'compliance' && (
          <div className="ec-art-panel">
            <div className="ec-doc-inner">
              <div className="ec-panel-head">
                <div><div className="ec-panel-t">ICH M4 compliance</div><div className="ec-panel-s">Checked against ICH M4 {live ? '-- live' : ''}</div></div>
                <button className="ec-topbtn primary" onClick={runCompliance} disabled={!activeDoc}>{busy === 'compliance' ? 'Checking...' : <>{I.refresh || I.check} Re-check</>}</button>
              </div>
              {!activeDoc ? (
                <div className="ec-empty">Select an eCTD document to check its ICH M4 compliance.</div>
              ) : (
                <>
                  {!compliance && !complianceUnavailable && busy !== 'compliance' && <div className="ec-empty">Run the ICH M4 compliance check across the organisation of the CTD.</div>}
                  {complianceUnavailable && busy !== 'compliance' && (
                    <div className="ec-empty sp-tone-warn">
                      The compliance service did not return a result. No score is shown because none was computed — this is not a passing score.
                    </div>
                  )}
                  {busy === 'compliance' && <div className="ec-empty">Checking ICH M4 organisation...</div>}
                  {compliance && (
                    <>
                      <div className="ec-cscore">
                        <div className="ec-cscore-num">{compliance.complianceScore}<span className="u">%</span></div>
                        <div><div className="ec-cscore-l">{compliance.standard} compliance</div><div className="ec-cscore-s mono">{compliance.compliantCount}/{compliance.totalChecks} checks compliant -- {compliance.nonCompliantCount} to resolve</div></div>
                      </div>
                      <div className="ec-checks">
                        {compliance.checks.map((c, i) => (
                          <div key={i} className="ec-check" data-ok={c.status === 'compliant'}>
                            <span className="ec-check-dot">{c.status === 'compliant' ? I.check : (I.x)}</span>
                            <span className="ec-check-id mono">{c.ruleId}</span>
                            <span className="ec-check-desc">{c.description}</span>
                            {c.module && <span className="ec-check-mod mono">M{c.module}</span>}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Document Authoring — the editable regulatory-document canvas.
 *
 * Registry id: `document-authoring` (full: true, hideAna: true)
 *
 * Full-bleed 3-pane editor: document tree (left), editable content canvas
 * (center), and a review rail (right) that flips between the section's
 * revision history and its comment thread.
 *
 * REAL WIRING (regulated GA product): this surface is driven end-to-end by the
 * governed authoring store at `/api/authoring` (server/routes/authoring.router.ts,
 * tables authoring_documents / authoring_sections / doc_revisions /
 * authoring_comments / authoring_citations):
 *
 *   • tree     — GET /api/authoring/docs?module=&status= → documents, and per
 *                selected document GET /api/authoring/docs/:docId/sections.
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
 * (JWT-sourced created_by), never guessed. "Draft with AnA" hands off to the
 * real assistant (onAsk) rather than injecting fabricated content.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { AuthoringFilingBar } from './AuthoringFilingBar';
import { AuthoringCollab } from './AuthoringCollab';
import { AuthoringCreateExport } from './AuthoringCreateExport';
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

const MODULES = ['M1', 'M2', 'M3', 'M4', 'M5'];
const STATUSES = ['draft', 'in_review', 'approved'];

/* ════ Document Authoring surface ════ */

export function DocumentAuthoring({ onAsk }: SurfaceViewProps) {
  const [module, setModule] = useState('M3');
  const [status, setStatus] = useState('draft');

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

  // Right rail: revision history, comments, or the section's sources.
  const [rail, setRail] = useState<'history' | 'comments' | 'sources' | null>(null);
  const [revisions, setRevisions] = useState<AuthRevision[]>([]);
  const [comments, setComments] = useState<AuthComment[]>([]);
  const [newComment, setNewComment] = useState('');

  // What the active section is drafted from, plus the project's Data Room for the
  // picker. Both are live reads; neither has a fixture fallback.
  const [sources, setSources] = useState<SectionSource[]>([]);
  const [sourcesState, setSourcesState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [projectSources, setProjectSources] = useState<ProjectSource[]>([]);
  const [picking, setPicking] = useState(false);

  const [toast, fireToast] = useToast();

  const activeDoc = docs.find((d) => d.id === activeDocId) ?? null;
  const activeSection = sections.find((s) => s.id === activeSectionId) ?? null;
  const dirty = activeSection != null && draft !== savedContent;

  /* ── Load documents for the current module/status ── */
  const loadDocs = useCallback(async () => {
    setDocsState('loading');
    const { ok, body } = await readJson<{ documents?: AuthDoc[] }>(
      `/api/authoring/docs?module=${encodeURIComponent(module)}&status=${encodeURIComponent(status)}`,
    );
    if (!ok || !body) { setDocsState('error'); setDocs([]); return; }
    const list = Array.isArray(body.documents) ? body.documents : [];
    setDocs(list);
    setDocsState('ready');
    // Keep the active doc if it survives the new filter; else pick the first.
    setActiveDocId((cur) => (cur && list.some((d) => d.id === cur) ? cur : list[0]?.id ?? null));
  }, [module, status]);

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
    setActiveSectionId((cur) => (cur && list.some((s) => s.id === cur) ? cur : list[0]?.id ?? null));
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

  /* ── Load the right-rail data for the active section on demand ── */
  const loadHistory = useCallback(async (sectionId: string) => {
    const { body } = await readJson<{ revisions?: AuthRevision[] }>(
      `/api/authoring/sections/${encodeURIComponent(sectionId)}/history`,
    );
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

  return (
    <div className="ed" data-comments={rail != null || undefined}>
      {/* ── Left: document + section tree ── */}
      <aside className="ed-tree">
        <div className="ed-tree-h">
          <div className="ed-tree-t">Document tree</div>
          <div className="ed-tree-m">{docs.length} document{docs.length === 1 ? '' : 's'} · {module} · {status.replace('_', ' ')}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <select className="c2c-input" style={{ height: 28, flex: 1 }} value={module} onChange={(e) => setModule(e.target.value)}>
              {MODULES.map((m) => <option key={m} value={m}>Module {m.slice(1)}</option>)}
            </select>
            <select className="c2c-input" style={{ height: 28, flex: 1 }} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
        </div>
        <div className="ed-tree-scroll">
          {docsState === 'loading' ? (
            <div className="scaf-note" style={{ padding: 16 }}>Loading documents…</div>
          ) : docsState === 'error' ? (
            <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load documents"
              hint="GET /api/authoring/docs didn’t respond. Sign in to your tenant and retry." />
          ) : docs.length === 0 ? (
            <EmptyState icon={I.fileText} title="No documents here"
              hint={`No ${status.replace('_', ' ')} documents in Module ${module.slice(1)}. Switch the module or status filter above.`} />
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
                    <span className="rd-chip tone-dim" style={{ marginLeft: 'auto' }}>{num(d.section_count)}</span>
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
            <button className="btn ghost" style={{ height: 30 }} onClick={() => onAsk(draftPrompt)}>
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
          </div>
        </header>

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
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Right: history / comments rail ── */}
      {rail === 'history' && (
        <aside className="ed-comments">
          <div className="ed-comments-h">Revision history</div>
          {!activeSection ? (
            <EmptyState icon={I.clock} title="No section selected" hint="Select a section to see its revision history." />
          ) : revisions.length === 0 ? (
            <EmptyState icon={I.clock} title="No prior revisions"
              hint="Each save snapshots the previous content here, so you can compare and revert." />
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
                            <button className="nda-open" onClick={() => onAsk(
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

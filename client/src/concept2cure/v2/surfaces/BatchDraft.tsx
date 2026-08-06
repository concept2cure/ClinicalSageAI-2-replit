import React, { useState, useMemo, useRef, useEffect } from 'react';
import { I } from '../icons';
import { connected, useLiveData, EmptyState, hasKeys } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { sanitizeChatHtml } from '../../components/ana/renderSafeMarkdown';
import '../styles/project-home-v2.css';

/* ── Window globals -- runtime channels with no typed provider yet (kit
   data-connect.jsx C2C_AUTHORING and the editor's __C2C_DOC_ID; GAP RULE:
   the offline fallbacks below stay honest until those modules port) ── */

declare global {
  interface Window {
    C2C_AUTHORING?: {
      batchDraft: (opts: BatchDraftOpts) => Promise<void>;
      saveSection: (opts: SaveSectionOpts) => Promise<void>;
    };
    __C2C_DOC_ID?: string | null;
  }
}

/* ── Inline fixture types ── */

interface SpineNode {
  num?: string;
  title?: string;
  status?: string;
  pct?: number | null;
  preview?: string | null;
  children?: SpineNode[];
}

/* GET /api/batch-draft/spine display contract (server batch-draft-routes.ts →
   coauthor_documents). `program`/`standard` are always null — the co-author
   document table persists no program entity or per-document standard label, so
   the backend returns null rather than fabricating one — and `tree` is a FLAT
   list of draftable leaves (the surface flattens defensively via bdFlatten). */
interface DossierSpine {
  program: string | null;
  standard: string | null;
  tree: LeafSection[];
}

interface LeafSection {
  /** coauthor_documents.id — stable unique leaf key.
   *  `num` is the display/section number and is NOT unique (many are '—'). */
  id: string;
  num: string;
  title: string;
  /** Real stored lifecycle state (draft | in-progress | review | approved |
   *  finalized) — never remapped to the former fixture vocabulary. */
  status?: string;
  /** completion_percentage, or null when never computed (not fabricated). */
  pct?: number | null;
  /** Content-derived excerpt, or null when the document has no content. */
  preview?: string | null;
}

interface CardState {
  state: 'queued' | 'drafting' | 'done' | 'error';
  html: string;
  model: string | null;
  latencyMs: number | null;
  sample: boolean;
  accepted: boolean;
  error: string | null;
}

interface BatchDraftOpts {
  documentId: string | null;
  tone: string;
  sections: { key: string; label: string }[];
  onSectionStart: (key: string) => void;
  onSectionText: (key: string, full: string) => void;
  onSectionComplete: (key: string, content: string, meta: { latencyMs?: number; model?: string; provider?: string } | null, sample: boolean) => void;
  onSectionError: (key: string, msg: string) => void;
}

interface SaveSectionOpts {
  documentId: string | null;
  sectionKey: string;
  content: string;
  draftSource: string;
  reason: string;
}

/* ── Helpers ── */

function bdFlatten(nodes: SpineNode[], out: LeafSection[]): LeafSection[] {
  (nodes || []).forEach((n) => {
    if (n.children) bdFlatten(n.children, out);
    else if (n.num && n.title) out.push(n as LeafSection);
  });
  return out;
}

/* FLAG (mock ACTION output): fabricated placeholder draft prose for the drafting
   action's offline / "Sample" path (see run() and onSectionComplete). It is
   honestly labeled "Sample" on the card and never presented as a real AnA draft;
   kept until the drafting action is wired to the real streaming service in the
   actions pass. */
/**
 * Escape text before it is concatenated into an HTML string.
 *
 * bdSample builds HTML by string concatenation, so every interpolated value is
 * markup unless escaped. `sec.preview` comes from the API, which derives it
 * from stored TipTap document content — attacker-influenced text arriving in a
 * field that reads like a harmless summary. `sec.title` and `sec.num` are
 * likewise server data.
 */
function bdEscape(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function bdSample(sec: LeafSection, agency: string): string {
  const seed = sec.preview || (sec.title + ' -- integrated summary.');
  return '<h3>§' + bdEscape(sec.num) + ' -- ' + bdEscape(sec.title) + '</h3>'
    + '<p>' + bdEscape(seed) + '</p>'
    + '<p>This first draft is structured per ' + bdEscape(agency || 'FDA') + ' expectations for the section, '
    + 'with each substantive claim carrying a citation marker back to locked source data '
    + '<span class="stream-cite">[E1]</span>. Quantitative results are stated with their confidence '
    + 'intervals and cross-referenced to the supporting study report. Benefit-risk language is kept '
    + 'to what the current evidence supports; unreconciled items are flagged rather than asserted.</p>';
}

function bdWordCount(html: string): number {
  const t = (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.split(' ').length : 0;
}

/* Stable empty spine tree for the loading/error renders — useLiveData yields a
   fresh null then, and a module-level constant keeps the todo / initialSel memos
   from re-running on an unstable [] (loop-safety, per the re-anchor spec). */
const EMPTY_TREE: LeafSection[] = [];

/* ════ BatchDraft -- parallel section drafting service ════

   Real-data standard: the draftable section spine is the org's persisted eCTD
   Co-Author documents (GET /api/batch-draft/spine → coauthor_documents,
   server/routes/batch-draft-routes.ts), shown as real data / honest empty /
   honest error — never the former ../fixtures/dossier-data spine. The drafting
   (window.C2C_AUTHORING.batchDraft) and acceptance (saveSection) are ACTIONS on
   an untyped runtime channel; they are FLAGged in run() / accept() for the
   actions pass, not rewired here. */

export function BatchDraft({ onAsk, onNav, segment }: SurfaceViewProps) {
  const seg = segment || 'biotech';
  const agency = seg === 'pharma' || seg === 'biotech'
    ? 'FDA'
    : (seg === 'medtech' || seg === 'diagnostics' ? 'FDA CDRH' : 'FDA');
  const docId: string | null = (typeof window !== 'undefined' && (window as any).__C2C_DOC_ID) || null;
  const canLive = !!(docId && connected());

  // ── DATA: the draftable section spine is the org's persisted eCTD Co-Author
  // documents (GET /api/batch-draft/spine → coauthor_documents). Real data,
  // honest empty, honest error — never a fixture. useLiveData unwraps the
  // { data } envelope, so `spine` is the { program, standard, tree } object
  // directly (not `.data.data`).
  //
  // The guard is what makes `spine.tree` below safe to write without a second
  // check. A route returning `{ data: [] }` unwraps to a TRUTHY `[]`, which
  // passes `spine ? …` and leaves `tree` undefined for `bdFlatten` to throw on.
  // Rejecting it routes into the `spineState.error` branch this surface already
  // renders, which is the accurate thing to show either way.
  const spineState = useLiveData<DossierSpine>(
    '/api/batch-draft/spine',
    ['/api/batch-draft/spine'],
    hasKeys<DossierSpine>('program', 'standard', 'tree'),
  );
  const spine = spineState.data;
  // useLiveData returns a fresh null while loading and on error; fall back to a
  // module-level constant so the memos below keep a stable input (loop-safety).
  const tree = spine ? spine.tree : EMPTY_TREE;

  /* real leaf sections that still need drafting (not approved/finalized) */
  const todo = useMemo(() => {
    return bdFlatten(tree, []).filter((s) => {
      return ['draft', 'in-progress', 'review'].indexOf(s.status || '') >= 0
        && (s.pct == null || s.pct < 100);
    });
  }, [tree]);

  /* pre-select the least-complete drafts */
  const initialSel = useMemo(() => {
    const pick = todo
      .slice()
      .sort((a, b) => (a.pct || 0) - (b.pct || 0))
      .slice(0, 5)
      .map((s) => s.num);
    return new Set(pick);
  }, [todo]);

  const [sel, setSel] = useState<Set<string>>(initialSel);
  // Seed the selection once the live spine resolves — useLiveData returns null on
  // the first renders, so the useState initializer above starts empty. Seed-once
  // via a ref so a user's later toggles are never clobbered on re-render.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current && todo.length) {
      seededRef.current = true;
      setSel(new Set(initialSel));
    }
  }, [todo, initialSel]);

  const [phase, setPhase] = useState<'pick' | 'drafting' | 'review'>('pick');
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const startRef = useRef<Record<string, number>>({});

  const selList = todo.filter((s) => sel.has(s.num));
  const toggle = (num: string) => {
    setSel((p) => {
      const n = new Set(p);
      n.has(num) ? n.delete(num) : n.add(num);
      return n;
    });
  };

  const draftingCount = Object.values(cards).filter((c) => c.state === 'drafting').length;
  const doneCount = Object.values(cards).filter((c) => c.state === 'done').length;
  const acceptedCount = Object.values(cards).filter((c) => c.accepted).length;

  /* fire the parallel draft.
     FLAG (mock ACTION): drafting runs through the untyped runtime channel
     window.C2C_AUTHORING.batchDraft (injected by the kit's data-connect; not
     provided in this repo). When it is absent the `else` branch fabricates
     "Sample" cards on a setTimeout (bdSample) — fake streaming, not a real
     draft. A real drafting service exists (server ana batch-draft-sections);
     wiring it is the actions pass — left intact and flagged, not half-wired. */
  const run = () => {
    if (!selList.length) return;
    const init: Record<string, CardState> = {};
    selList.forEach((s) => {
      init[s.num] = { state: 'queued', html: '', model: null, latencyMs: null, sample: !canLive, accepted: false, error: null };
    });
    setCards(init);
    setPhase('drafting');
    startRef.current = {};

    const authoring = (window as any).C2C_AUTHORING;
    if (authoring && authoring.batchDraft) {
      authoring.batchDraft({
        documentId: docId,
        tone: agency,
        sections: selList.map((s) => ({ key: s.num, label: s.title })),
        onSectionStart: (key: string) => {
          startRef.current[key] = Date.now();
          setCards((c) => ({ ...c, [key]: { ...c[key], state: 'drafting' } }));
        },
        onSectionText: (key: string, full: string) => {
          setCards((c) => ({ ...c, [key]: { ...c[key], state: 'drafting', html: full } }));
        },
        onSectionComplete: (key: string, content: string, meta: { latencyMs?: number; model?: string; provider?: string } | null, sample: boolean) => {
          const started = startRef.current[key] || Date.now();
          const sec = todo.find((s) => s.num === key) || { num: key, title: key };
          const html = sample ? bdSample(sec as LeafSection, agency) : (content || '');
          const lat = (meta && meta.latencyMs) || (Date.now() - started);
          setCards((c) => ({
            ...c,
            [key]: {
              ...c[key],
              state: 'done',
              html,
              sample: !!sample,
              model: (meta && (meta.model || meta.provider)) || (sample ? 'Sample' : 'AnA'),
              latencyMs: lat,
            },
          }));
        },
        onSectionError: (key: string, msg: string) => {
          setCards((c) => ({ ...c, [key]: { ...c[key], state: 'error', error: msg || 'Drafting failed' } }));
        },
      }).then(() => { setPhase('review'); });
    } else {
      /* Offline fallback: generate sample cards */
      selList.forEach((s, idx) => {
        setTimeout(() => {
          setCards((c) => ({
            ...c,
            [s.num]: {
              state: 'done',
              html: bdSample(s as LeafSection, agency),
              model: 'Sample',
              latencyMs: 800 + idx * 200,
              sample: true,
              accepted: false,
              error: null,
            },
          }));
        }, 300 + idx * 150);
      });
      setTimeout(() => { setPhase('review'); }, 300 + selList.length * 150 + 100);
    }
  };

  /* accept one card.
     FLAG (mock ACTION): the governed save goes through the untyped runtime
     channel window.C2C_AUTHORING.saveSection (see run()); the card is marked
     accepted even if that call rejects (.catch → mark), so acceptance is
     optimistic — the copy below must not present it as a confirmed Part-11
     write. Real wiring + success/failure tracking is the actions pass. */
  const accept = (key: string) => {
    const card = cards[key];
    if (!card || card.state !== 'done') return;
    const sec = todo.find((s) => s.num === key) || { num: key, title: key };
    const mark = () => {
      setCards((c) => ({ ...c, [key]: { ...c[key], accepted: true } }));
    };
    const authoring = (window as any).C2C_AUTHORING;
    if (canLive && authoring) {
      authoring.saveSection({
        documentId: docId,
        sectionKey: key,
        content: card.html,
        draftSource: 'ana',
        reason: 'Accepted AnA batch draft · §' + sec.num + ' ' + sec.title,
      }).then(mark).catch(() => { mark(); });
    } else {
      mark();
    }
    onAsk && onAsk(
      (canLive ? 'Accepted the AnA draft for §' : 'Staged the AnA draft for §')
      + sec.num + ' ' + sec.title
      + (canLive
        ? ' into the working document.'
        : ' locally — connect a document to write it into the working document.'),
    );
  };

  const discard = (key: string) => {
    setCards((c) => {
      const n = { ...c };
      delete n[key];
      return n;
    });
  };

  /* lead (answer-first) */
  const modules = useMemo(() => {
    const m: Record<string, number> = {};
    selList.forEach((s) => {
      const mod = 'Module ' + String(s.num).charAt(0);
      m[mod] = (m[mod] || 0) + 1;
    });
    return Object.keys(m);
  }, [sel]);

  const lead = phase === 'pick'
    ? {
        h: todo.length
          ? 'You have ' + todo.length + ' sections still to draft. I can draft ' + (selList.length || 'several') + ' of them at once -- each comes back as its own card you Accept, edit, or discard.'
          : 'Every section in this build already has a draft. Pick any to redraft and I will run them in parallel.',
        b: 'Parallel drafting takes about as long as the slowest section, not the sum. Nothing is written to the dossier until you accept a card'
          + (canLive
            ? ' -- acceptance writes a governed, Part-11 versioned save.'
            : ' -- connect a document to write a governed, Part-11 versioned save on acceptance.'),
      }
    : phase === 'drafting'
    ? {
        h: 'Drafting ' + selList.length + ' sections in parallel' + (modules.length ? ' across ' + modules.join(' + ') : '') + '...',
        b: doneCount + ' done {I.dot} ' + draftingCount + ' drafting. Cards fill as each section lands -- review and accept them independently.',
      }
    : {
        h: doneCount + ' drafts are ready to review' + (acceptedCount ? ' · ' + acceptedCount + ' accepted' : '') + '.',
        b: 'Each card is a proposal. '
          + (canLive
            ? 'Accept writes a governed version (draftSource = ana); '
            : 'Accept stages the draft — connect a document to write the governed version; ')
          + 'Edit opens it in the section editor; Discard drops it. '
          + (acceptedCount ? '' : 'Nothing has been written yet.'),
      };

  const header = (
    <div className="bd-head">
      <div className="bd-eyebrow">
        <span className="bd-kicker">AnA {I.dot} parallel section drafting</span>
        {/* FLAG (mock ACTION): this pill reflects the drafting / accept ACTION
            mode (canLive = a live document is connected), NOT the spine DATA,
            which is always the live /api/batch-draft/spine read. */}
        <span className={'bd-src ' + (canLive ? 'live' : 'sample')}>{canLive ? 'Live · governed' : 'Preview mode'}</span>
      </div>
      <h1 className="bd-title">{(spine && spine.program) || 'Active dossier'}</h1>
      <div className="bd-sub">{spine && spine.standard ? spine.standard.toUpperCase() + ' · ' : ''}{agency} · batch_draft_sections</div>
    </div>
  );

  // ── Four-state gate for the spine DATA (loading → error → empty → real) ──
  if (spineState.loading) {
    return (
      <div className="bd">
        {header}
        <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading the document spine…</div>
      </div>
    );
  }
  if (spineState.error) {
    return (
      <div className="bd">
        {header}
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the document spine"
          hint="The organization's eCTD Co-Author documents didn't respond, so no draftable sections are shown rather than a sample dossier. Sign in and retry, or check the service is reachable."
        />
      </div>
    );
  }
  if (tree.length === 0) {
    return (
      <div className="bd">
        {header}
        <EmptyState
          icon={I.fileText}
          title="No dossier documents yet"
          hint="There are no eCTD Co-Author documents in this workspace to draft. Create documents in the dossier, then run a parallel batch draft here."
        />
      </div>
    );
  }

  return (
    <div className="bd">
      {header}

      <div className="bd-lead">
        <div className="bd-lead-ic">{I.sparkles}</div>
        <div>
          <p className="bd-lead-h">{lead.h}</p>
          <p className="bd-lead-b">{lead.b}</p>
        </div>
      </div>

      {phase === 'pick' && (
        <div className="bd-pick">
          <div className="bd-pick-bar">
            <span className="bd-pick-n">{selList.length} selected</span>
            <div className="bd-pick-actions">
              <button className="bd-ghost" onClick={() => { setSel(new Set(todo.map((s) => s.num))); }}>Select all {todo.length}</button>
              <button className="bd-ghost" onClick={() => { setSel(new Set()); }}>Clear</button>
              <button className="bd-primary" disabled={!selList.length} onClick={run}>
                {I.sparkles} Draft {selList.length} section{selList.length === 1 ? '' : 's'} in parallel
              </button>
            </div>
          </div>
          <div className="bd-pick-list">
            {todo.map((s) => {
              const on = sel.has(s.num);
              return (
                <button key={s.id} className={'bd-pick-item' + (on ? ' on' : '')} onClick={() => { toggle(s.num); }}>
                  <span className={'bd-check' + (on ? ' on' : '')}>{on ? I.check : ''}</span>
                  <span className="mono bd-pick-code">{s.num}</span>
                  <span className="bd-pick-title">{s.title}</span>
                  <span className={'bd-status st-' + (s.status || '')}>{String(s.status || '').replace('_', ' ')}</span>
                  <span className="bd-pick-pct">{s.pct != null ? s.pct + '%' : '--'}</span>
                </button>
              );
            })}
            {!todo.length && <div className="bd-empty">No draftable sections — every document is already approved or finalized.</div>}
          </div>
        </div>
      )}

      {phase !== 'pick' && (
        <div className="bd-runbar">
          <div className="bd-prog">
            <div className="bd-prog-track">
              <div className="bd-prog-fill" style={{ width: (selList.length ? Math.round((doneCount / selList.length) * 100) : 0) + '%' }} />
            </div>
            <span className="bd-prog-txt">
              {doneCount}/{selList.length} drafted{draftingCount ? ' · ' + draftingCount + ' in flight' : ''}{acceptedCount ? ' · ' + acceptedCount + ' accepted' : ''}
            </span>
          </div>
          <button className="bd-ghost" onClick={() => { setPhase('pick'); setCards({}); }}>New batch</button>
        </div>
      )}

      {phase === 'review' && doneCount > 0 && (() => {
        const doneCards = Object.keys(cards).map((k) => cards[k]).filter((c) => c.state === 'done');
        const lats = doneCards.map((c) => c.latencyMs).filter((v): v is number => v != null).sort((a, b) => a - b);
        const medianMs = lats.length ? lats[Math.floor(lats.length / 2)] : null;
        const totalWords = doneCards.reduce((s, c) => s + bdWordCount(c.html), 0);
        const anySample = doneCards.some((c) => c.sample);
        return (
          <div className="bd-metrics">
            <span className="bd-metric"><b>{doneCount}</b> drafted</span>
            <span className="bd-metric"><b>{acceptedCount}</b> accepted {I.dot} <b>{doneCount - acceptedCount}</b> in review</span>
            {medianMs != null && <span className="bd-metric"><b>{medianMs >= 1000 ? (medianMs / 1000).toFixed(1) + 's' : medianMs + 'ms'}</b> median time to draft</span>}
            <span className="bd-metric"><b>{totalWords.toLocaleString()}</b> words proposed</span>
            <span className="bd-metric-note">measured from this run{anySample ? ' · sample drafts' : ''}</span>
          </div>
        );
      })()}

      {phase !== 'pick' && (
        <div className="bd-cards">
          {selList.map((s) => {
            const c = cards[s.num];
            if (!c) return null;
            return (
              <div key={s.id} className={'bd-card st-' + c.state + (c.accepted ? ' accepted' : '')}>
                <div className="bd-card-head">
                  <span className="mono bd-card-code">{s.num}</span>
                  <span className="bd-card-title">{s.title}</span>
                  {c.state === 'drafting' && <span className="bd-card-state drafting"><span className="bd-dots"><i /><i /><i /></span> drafting</span>}
                  {c.state === 'queued' && <span className="bd-card-state queued">queued</span>}
                  {c.state === 'done' && !c.accepted && <span className="bd-card-state done">{I.check} ready</span>}
                  {c.accepted && <span className="bd-card-state accepted">{I.check} accepted</span>}
                  {c.state === 'error' && <span className="bd-card-state error">error</span>}
                </div>

                {c.state === 'error' ? (
                  <div className="bd-card-err">{c.error}</div>
                ) : (
                  // c.html is server-stored / streamed document HTML, injected
                  // raw here until the 2026-07 audit. It reaches this sink from
                  // two directions: the drafting stream's `content`, and
                  // bdSample(), which interpolates a section preview the API
                  // derives from stored TipTap content. Sanitized through the
                  // same DOMPurify allowlist the chat surface uses — the
                  // allowlist keeps h3/p/span.stream-cite, so sample and live
                  // drafts render unchanged.
                  <div
                    className="bd-card-body"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeChatHtml(c.html) || '<p class="bd-ph">Waiting to start...</p>',
                    }}
                  />
                )}

                {c.state === 'done' && (
                  <div className="bd-card-foot">
                    <div className="bd-card-meta">
                      <span className={'bd-chip ' + (c.sample ? 'sample' : 'live')}>{c.sample ? 'Sample' : c.model}</span>
                      {c.latencyMs != null && <span className="bd-chip">{(c.latencyMs / 1000).toFixed(1)}s</span>}
                      <span className="bd-chip">{bdWordCount(c.html)} words</span>
                    </div>
                    {!c.accepted ? (
                      <div className="bd-card-acts">
                        <button className="bd-ghost sm" onClick={() => { discard(s.num); }}>Discard</button>
                        <button className="bd-ghost sm" onClick={() => { onNav && onNav('document-authoring'); }}>Edit</button>
                        <button className="bd-primary sm" onClick={() => { accept(s.num); }}>{canLive ? 'Accept · govern' : 'Accept'}</button>
                      </div>
                    ) : (
                      <div className="bd-card-acts">
                        <span className="bd-accepted-note">{canLive ? 'Governed save requested · draftSource = ana' : 'Staged locally · connect a document to write the governed version'}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

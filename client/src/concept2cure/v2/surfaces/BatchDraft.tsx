import React, { useState, useMemo, useRef, useEffect } from 'react';
import { I } from '../icons';
import { connected, useLiveData, EmptyState, hasKeys } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import { AuthoredHtml } from '../editor/AuthoredHtml';
import '../styles/project-home-v2.css';

/* ── There is exactly one way to produce a draft on this surface ────────────
   POST /api/claude/batch, via run(). Two other paths used to exist beside
   it and both are gone:

   • window.C2C_AUTHORING.batchDraft — a runtime channel this repository never
     assigns, so the branch that dispatched to it was unreachable in every
     build. It carried a `sample: boolean` back into onSectionComplete, which
     is the only thing that gave the fabrication below a second caller.
   • bdSample() — a generator that invented regulatory prose ("structured per
     FDA expectations… each substantive claim carrying a citation marker back
     to locked source data [E1]") on a setTimeout whenever the drafting service
     was unreachable, chip-labelled "Sample".

   The label was not the problem. Inventing a citation marker to a source that
   was never consulted is fixture data in a governed path, and an unreachable
   drafting service has to read as unreachable — CLAUDE.md, "fail closed, never
   fabricate… honest empty states". So the offline path now refuses to draft
   and says why, instead of filling the review screen with prose nobody wrote.

   With no producer of sample cards left, CardState carries no `sample` flag
   and the accept() guard is one condition rather than two. */

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
  /** The regulatory framework this org's accepted drafts were written against,
   *  recorded on the document by the acceptance route. Null until a draft has
   *  been accepted, and null again when the org's documents disagree — the
   *  server never guesses a single value out of a mixed dossier. Optional on
   *  the wire so a client ahead of the server degrades to "not recorded"
   *  instead of failing the shape guard. */
  framework?: string | null;
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
  /** Acceptance is CONFIRMED, not requested. Set only after the write this card
   *  triggered came back successful. */
  accepted: boolean;
  /** An acceptance write is in flight; the button is disabled while true. */
  saving: boolean;
  /** Version the replaced content was preserved as; null when the section was
   *  empty and there was nothing to preserve. */
  savedVersion: number | null;
  /** Why the acceptance write failed, so the card can say so instead of
   *  silently staying un-accepted. */
  saveError: string | null;
  error: string | null;
}

/** A card that has not been drafted yet — every field explicit, so adding a
 *  field to CardState cannot leave one of the four creation sites behind. */
function bdCard(partial: Partial<CardState> & Pick<CardState, 'state'>): CardState {
  return {
    html: '',
    model: null,
    latencyMs: null,
    accepted: false,
    saving: false,
    savedVersion: null,
    saveError: null,
    error: null,
    ...partial,
  };
}

/* ── Helpers ── */

function bdFlatten(nodes: SpineNode[], out: LeafSection[]): LeafSection[] {
  (nodes || []).forEach((n) => {
    if (n.children) bdFlatten(n.children, out);
    else if (n.num && n.title) out.push(n as LeafSection);
  });
  return out;
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
   honest error — never the former ../fixtures/dossier-data spine.

   Drafting is POST /api/claude/batch (run) and acceptance is
   POST /api/batch-draft/documents/:id/accept (accept) — both real, both against
   the identifiers this surface actually holds, and both the only implementation
   of their capability here. When the drafting service is unreachable the
   surface produces NOTHING and says so; there is no offline prose generator to
   fall back to. */

export function BatchDraft({ onAsk, onNav, segment }: SurfaceViewProps) {
  const seg = segment || 'biotech';
  const agency = seg === 'pharma' || seg === 'biotech'
    ? 'FDA'
    : (seg === 'medtech' || seg === 'diagnostics' ? 'FDA CDRH' : 'FDA');
  /* Acceptance writes to the section's OWN document (leaf.id), so it no longer
     depends on a connected editor document. `canLive` now means exactly what
     the copy claims: the service is reachable, so drafting is real and an
     accepted draft is written and versioned. */
  const canLive = connected();

  /* The regulatory framework the drafts are authored against.
     Starts EMPTY and is then SEEDED from the spine (below) when the org's
     documents record one — never guessed. A wrong framework produces confident,
     plausible regulatory prose written to the wrong expectations, which is
     harder to catch in review than a blank field, so the only two acceptable
     sources are "the user stated it" and "a previously accepted draft on these
     documents recorded it". Values are exactly DocumentDraftRequest['framework']
     (AnaDocumentDraftingService.ts:244). */
  const [framework, setFramework] = useState('');
  const FRAMEWORKS: Array<[string, string]> = [
    ['ich_clinical', 'ICH / CTD clinical'],
    ['fda_510k', 'FDA 510(k)'],
    ['fda_pma', 'FDA PMA'],
    ['eu_mdr', 'EU MDR'],
    ['cer_clinical_evaluation', 'Clinical Evaluation Report'],
    ['general_regulatory', 'General regulatory'],
  ];
  const frameworkLabel = FRAMEWORKS.find(([v]) => v === framework)?.[1] ?? '';

  /* Bumped after an accepted draft changes a document, so the NEXT batch is
     picked from a fresh spine. Deliberately not bumped at acceptance time: a
     refetch flips spineState.loading, and the loading gate below would replace
     the review screen the user is still working in with a spinner. */
  const [reloadKey, setReloadKey] = useState(0);
  const spineDirtyRef = useRef(false);

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
    ['/api/batch-draft/spine', reloadKey],
    // `framework` is deliberately NOT required here. It is a newer field, and a
    // client deployed ahead of the server would otherwise fail this guard and
    // render the honest-error state for a spine that is perfectly usable.
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

  /* pre-select the least-complete drafts.
     KEYED BY `s.id`, NOT `s.num`. `num` is the display section number and is
     NOT unique — every document with no eCTD number renders as '—', so a
     num-keyed selection made all of them one item: ticking one ticked them all,
     they shared a single draft card, and acceptance would have written one
     section's prose into whichever document `find` happened to return first.
     That was survivable while acceptance was a no-op. It is not survivable now
     that accepting writes to a real document, so the identity used everywhere
     below is the coauthor_documents id. */
  const initialSel = useMemo(() => {
    const pick = todo
      .slice()
      .sort((a, b) => (a.pct || 0) - (b.pct || 0))
      .slice(0, 5)
      .map((s) => s.id);
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

  /* Seed the framework from what the org's documents actually record, once.
     The server sends a value ONLY when every document that carries one agrees,
     and only ever from a framework a previous accepted draft was written
     against — so this is a remembered fact, not an inference. Seed-once via a
     ref so a later change by the user is never clobbered by a spine refetch,
     and only for a value the picker really offers (a framework the server
     recognises but this build has no option for would otherwise select nothing
     while `framework` read as set, disabling the Draft button with no way to
     fix it). */
  const fwSeededRef = useRef(false);
  useEffect(() => {
    if (fwSeededRef.current || !spine) return;
    const stored = typeof spine.framework === 'string' ? spine.framework : '';
    if (!stored) return;
    fwSeededRef.current = true;
    if (FRAMEWORKS.some(([v]) => v === stored)) setFramework(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spine]);
  /* True when the picker is showing a value the documents recorded rather than
     one the user just chose — the copy below attributes it. */
  const frameworkFromDocuments = fwSeededRef.current
    && !!spine && spine.framework === framework && !!framework;

  const [phase, setPhase] = useState<'pick' | 'drafting' | 'review'>('pick');
  const [cards, setCards] = useState<Record<string, CardState>>({});
  /* Which card is open for editing, if any. "Edit" used to navigate away to
     document-authoring, which abandoned the draft on the card: the text lives
     in `cards[id].html` until Accept POSTs it, and that surface has no idea it
     exists. So the edit happens where the text is. */
  const [editingCard, setEditingCard] = useState<string | null>(null);
  /* Timers: the offline sample path used to schedule one per section plus a
     final one that moved to 'review', and cancelling them on unmount was its
     own bug fix (a pending timer firing into a torn-down jsdom killed a CI run
     in which every test passed). That path is gone — nothing on this surface
     is scheduled on a timer any more, so there is nothing left to leak. */

  const selList = todo.filter((s) => sel.has(s.id));
  // The service refuses more than 20 requests per batch; refuse it here with a
  // reason instead of sending a request that will 400.
  const overBatchCap = selList.length > 20;
  /** @param id coauthor_documents.id — see initialSel on why not `num`. */
  const toggle = (id: string) => {
    setSel((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const draftingCount = Object.values(cards).filter((c) => c.state === 'drafting').length;
  const doneCount = Object.values(cards).filter((c) => c.state === 'done').length;
  const acceptedCount = Object.values(cards).filter((c) => c.accepted).length;

  /**
   * Batch drafting — POST /api/claude/batch. The only drafting path.
   *
   * This is the whole of `run()` now. It used to be one of three branches: this
   * one, a dispatch through `window.C2C_AUTHORING.batchDraft` (a runtime
   * channel this repo never assigns, so it was dead in every build), and an
   * offline fallback that fabricated prose on a setTimeout.
   *
   * The service is real and purpose-built — ana-intelligence.ts:360, "Batch
   * draft multiple document sections", capped at 20 requests with server-side
   * concurrency, mounted behind authenticateToken + weeklyRequestLimit.
   *
   * WHY A FRAMEWORK PICKER RATHER THAN A DERIVED VALUE. DocumentDraftRequest
   * REQUIRES `framework`, and it decides the regulatory expectations the prose
   * is authored against. The only nearby value on this surface was `agency`,
   * derived from `segment` — a browser-local view toggle defaulting to
   * 'biotech' that this codebase elsewhere warns can be wrong for the tenant.
   * Nothing on the document carries a filing type either: coauthor_documents
   * has no submission/filing/region column, and ectd_modules none, so
   * `submissionType` cannot be supplied from the spine today.
   *
   * Inferring the framework from a UI preference would produce confident,
   * plausible regulatory prose written to the WRONG expectations — harder to
   * catch than a blank card. So the framework is chosen explicitly and shown
   * on screen before anything is spent. When the document does start carrying a filing type, that becomes
   * the default here and this picker becomes the override.
   */
  const run = async () => {
    /* Every condition that makes drafting impossible refuses here and produces
       nothing. There is no second path to fall through to any more: when the
       drafting service is unreachable this surface draws no cards, because a
       card is a proposal and there is nothing to propose. The picker below
       states each of these reasons before the button is pressed. */
    if (!selList.length || overBatchCap || !connected() || !framework) return;

    const init: Record<string, CardState> = {};
    selList.forEach((s) => {
      init[s.id] = bdCard({ state: 'drafting' });
    });
    setCards(init);
    setPhase('drafting');
    const started = Date.now();

    try {
      const res = await apiRequest('POST', '/api/claude/batch', {
        // The endpoint caps a batch at 20; the picker is capped to match so the
        // request is refused here with a reason rather than 400ing server-side.
        requests: selList.map((s) => ({
          framework,
          sectionType: '§' + s.num + ' ' + s.title,
          instructions:
            'Draft §' + s.num + ' (' + s.title + ') for this submission. ' +
            'Structure it to the expectations of the selected framework, state quantitative results with their ' +
            'confidence intervals, carry a citation marker back to source data for each substantive claim, and ' +
            'flag anything the current evidence does not support rather than asserting it.',
          existingContent: s.preview || undefined,
        })),
        concurrency: 3,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        // `body.error` was read first, so an envelope shaped
        // { error: 'MODEL_UNAVAILABLE', message: '<a real sentence>' } put the enum
        // token on every card. serverMessage prefers the sentence and refuses
        // codes and infrastructure text; the domain fallback keeps the status.
        const msg = serverMessage(body) ?? 'Drafting failed (HTTP ' + res.status + ').';
        setCards((c) => {
          const next = { ...c };
          selList.forEach((s) => { next[s.id] = { ...next[s.id], state: 'error', error: msg }; });
          return next;
        });
        setPhase('review');
        return;
      }
      const results = ((body as { data?: { results?: unknown[] } } | null)?.data?.results ?? []) as Array<{
        content?: string; model?: string; latencyMs?: number; error?: string;
      }>;
      setCards((c) => {
        const next = { ...c };
        selList.forEach((s, i) => {
          const r = results[i];
          next[s.id] = r && r.content
            ? { ...next[s.id], state: 'done', html: r.content, model: r.model || 'AnA', latencyMs: r.latencyMs ?? (Date.now() - started) }
            // The per-result `error` is server text too, so it goes through the
            // same filter: a provider code or a driver message is not card copy.
            : { ...next[s.id], state: 'error', error: serverMessage(r) ?? 'No draft returned for this section.' };
        });
        return next;
      });
    } catch (e) {
      // Only ApiRequestError carries an already-reduced message; any other throw
      // here is the browser's own "Failed to fetch", which the cards used to show.
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      const msg =
        known && (e as Error).message ? (e as Error).message : 'Could not reach the drafting service.';
      setCards((c) => {
        const next = { ...c };
        selList.forEach((s) => { next[s.id] = { ...next[s.id], state: 'error', error: msg }; });
        return next;
      });
    } finally {
      setPhase('review');
    }
  };

  /**
   * Accept one card — POST /api/batch-draft/documents/:id/accept.
   *
   * This used to dispatch through window.C2C_AUTHORING.saveSection, a runtime
   * channel this repo never provides, and marked the card accepted even when
   * that call rejected. So every "accepted" draft was thrown away on unmount —
   * and once drafting became real, what was thrown away was real generated
   * regulatory prose.
   *
   * The route writes the draft into the section's own document, preserves the
   * content it replaces as a version, and records the change in audit_events,
   * all in one transaction. The card is marked accepted ONLY when that returns
   * successfully; a failure says so on the card instead of quietly looking done.
   *
   * @param key coauthor_documents.id — the identifier the route takes.
   */
  const accept = async (key: string) => {
    const card = cards[key];
    if (!card || card.state !== 'done' || card.accepted || card.saving) return;
    const sec = todo.find((s) => s.id === key);
    if (!sec) return;
    const label = '§' + sec.num + ' ' + sec.title;

    /* ── Fail-closed guard ───────────────────────────────────────────────────
       Acceptance used to set `accepted: true` and tell the user the draft was
       "staged locally" whenever it could not write. Nothing was staged:
       `accepted` is a component boolean that disappears on navigation, so the
       card read "accepted", the counter above it read "N accepted", and there
       was nothing anywhere. `accepted` now means one thing — the write came
       back successful — so the second flag that used to distinguish the two
       meanings is gone with the state it distinguished.

       There is no reachable state that renders an Accept control while
       disconnected, so this is a guard rather than a path: it records WHY it
       cannot proceed instead of marking the card accepted. */
    if (!connected()) {
      setCards((c) => ({
        ...c,
        [key]: {
          ...c[key],
          accepted: false,
          saveError:
            'you are not connected to the drafting service, so nothing can be written to the document. Sign in and accept ' +
            label + ' again.',
        },
      }));
      return;
    }

    setCards((c) => ({ ...c, [key]: { ...c[key], saving: true, saveError: null } }));
    try {
      const res = await apiRequest('POST', '/api/batch-draft/documents/' + sec.id + '/accept', {
        content: card.html,
        framework: framework || undefined,
        model: card.model || undefined,
      });
      const body = await res.json().catch(() => null);
      const payload = body as { success?: boolean; error?: string; data?: { supersededVersion?: number | null } } | null;
      if (!res.ok || !payload || payload.success !== true) {
        // Same defect as the batch call above: `payload.error` won over the
        // sentence beside it, so a refusal code reached the card's save banner.
        const msg = serverMessage(body) ?? 'Save failed (HTTP ' + res.status + ').';
        setCards((c) => ({ ...c, [key]: { ...c[key], saving: false, saveError: msg } }));
        return;
      }
      const superseded = payload.data?.supersededVersion ?? null;
      spineDirtyRef.current = true;
      setCards((c) => ({
        ...c,
        [key]: { ...c[key], saving: false, accepted: true, savedVersion: superseded, saveError: null },
      }));
      onAsk && onAsk(
        'Saved the AnA draft for ' + label + ' into its document'
        + (superseded != null
          ? ' — the content it replaced is kept as version ' + superseded + '.'
          : ' (the section was empty, so nothing was superseded).'),
      );
    } catch (e) {
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      const msg =
        known && (e as Error).message ? (e as Error).message : 'Could not reach the document service.';
      setCards((c) => ({ ...c, [key]: { ...c[key], saving: false, saveError: msg } }));
    }
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
          ? 'You have ' + todo.length + ' sections still to draft. I can draft ' + (selList.length || 'several') + ' of them at once — each comes back as its own card you Accept, edit, or discard.'
          : 'Every section in this build already has a draft. Pick any to redraft and I will run them in parallel.',
        b: canLive
          ? 'Parallel drafting takes about as long as the slowest section, not the sum. Nothing is written to the dossier until you accept a card — accepting writes it into that section’s document, keeps the content it replaced as a version, and records the change in the audit trail.'
          : 'The drafting service is unreachable, so nothing can be drafted here right now. Sign in and retry — no placeholder prose is produced in its place.',
      }
    : phase === 'drafting'
    ? {
        h: 'Drafting ' + selList.length + ' sections in parallel' + (modules.length ? ' across ' + modules.join(' + ') : '') + '...',
        b: doneCount + ' done {I.dot} ' + draftingCount + ' drafting. Cards fill as each section lands — review and accept them independently.',
      }
    : {
        h: doneCount + ' drafts are ready to review' + (acceptedCount ? ' · ' + acceptedCount + ' accepted' : '') + '.',
        b: 'Each card is a proposal. Accept writes it into the section’s document '
          + 'and versions what it replaced; Edit opens it in the section editor; Discard drops it. '
          + (acceptedCount ? '' : 'Nothing has been written yet.'),
      };

  const header = (
    <div className="bd-head">
      <div className="bd-eyebrow">
        <span className="bd-kicker">AnA {I.dot} parallel section drafting</span>
        {/* Reflects the drafting / accept ACTION mode (canLive = the service is
            reachable, so drafts are real and accepting writes them), NOT the
            spine DATA, which is always the live /api/batch-draft/spine read.

            It used to read "Preview mode", which named a mode that produced
            fabricated prose. There is no preview mode: unreachable is
            unreachable, and the chip now says that. */}
        <span className={'bd-src ' + (canLive ? 'live' : 'offline')}>{canLive ? 'Live · versioned on accept' : 'Drafting service unreachable'}</span>
      </div>
      <h1 className="bd-title">{(spine && spine.program) || 'Active dossier'}</h1>
      <div className="bd-sub">{spine && spine.standard ? spine.standard.toUpperCase() + ' · ' : ''}{agency} · batch_draft_sections</div>
    </div>
  );

  /* WHAT ANA SEES HERE. Published above the four-state gate — hooks cannot sit
     below a conditional return, and one publish must cover every branch.
     Loading/error/empty publish as themselves: a failed spine read is a
     failure, not an empty spine, and no count is published that the gated
     screens do not show. */
  const anaContext = useMemo(() => {
    if (spineState.loading) {
      return { summary: 'Batch draft — loading the document spine; nothing draftable is on screen yet.' };
    }
    if (spineState.error) {
      return {
        summary:
          'Batch draft — the eCTD Co-Author document spine did not load, so no draftable sections are shown — a failure, not an empty spine.',
      };
    }
    if (tree.length === 0) {
      return { summary: 'Batch draft — no eCTD Co-Author documents in this workspace yet, so there is nothing to draft.' };
    }
    const base =
      phase === 'review'
        ? 'Batch draft (review) — ' + doneCount + ' draft(s) ready to review, ' + acceptedCount + ' accepted and written to their documents.'
        : phase === 'drafting'
          ? 'Batch draft (drafting) — ' + selList.length + ' section(s) drafting in parallel, ' + doneCount + ' returned so far.'
          : 'Batch draft (pick) — ' + todo.length + ' draftable section(s), ' + selList.length + ' selected'
            + (frameworkLabel ? ', drafting against ' + frameworkLabel : ', no framework chosen yet')
            + (overBatchCap ? '; over the 20-per-batch cap' : '') + '.';
    return {
      // canLive false = the surface's own claim: nothing can be drafted right now.
      summary: canLive ? base : base + ' The drafting service is unreachable, so nothing can be drafted right now.',
      facts: {
        draftableSections: todo.length,
        selectedSections: selList.length,
        overBatchCap,
        framework: frameworkLabel || null,
        phase,
        draftingServiceReachable: canLive,
        ...(phase === 'review' ? { draftsReady: doneCount, draftsAccepted: acceptedCount } : {}),
      },
      availableActions: [
        'Pick up to 20 draftable sections and the regulatory framework they are drafted against',
        'Review each returned draft card — edit or discard it before anything is written',
        'Running a batch (spends drafting budget) and accepting a draft into a document (a versioned, audited write) are governed — AnA proposes them in conversation, never through screen controls.',
      ],
    };
  }, [spineState.loading, spineState.error, tree, todo.length, selList.length, overBatchCap, frameworkLabel, phase, canLive, doneCount, acceptedCount]);
  usePublishSurfaceContext('batch-draft', anaContext);

  // ── Four-state gate for the spine DATA (loading → error → empty → real) ──
  if (spineState.loading) {
    return (
      <div className="bd">
        {header}
        <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading the document spine…</div>
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
          hint="The organization's eCTD Co-Author documents didn't respond, so no draftable sections are shown rather than a stand-in dossier. Sign in and retry, or check the service is reachable."
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
              <button className="bd-ghost" onClick={() => { setSel(new Set(todo.map((s) => s.id))); }}>Select all {todo.length}</button>
              <button className="bd-ghost" onClick={() => { setSel(new Set()); }}>Clear</button>
              {/* Remembered or stated — never inferred. It is preset only from
                  a framework a previously accepted draft recorded on these
                  documents (and only when they all agree); otherwise it stays
                  blank, because a guess shown as a fact would author the prose
                  to the wrong regulatory expectations. */}
              <select
                className="bd-fw"
                value={framework}
                onChange={(e) => setFramework(e.target.value)}
                aria-label="Regulatory framework to draft against"
              >
                <option value="">Framework…</option>
                {FRAMEWORKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {/* Disabled when the service is unreachable, where it used to run
                  the offline generator. A control that cannot do the thing it
                  names is disabled with the reason stated beside it, not
                  redirected to a different, invented thing. */}
              <button
                className="bd-primary"
                disabled={!selList.length || overBatchCap || !canLive || !framework}
                onClick={() => { void run(); }}
                title={
                  overBatchCap ? 'Select 20 sections or fewer — the drafting service takes 20 per batch.'
                    : !canLive ? 'The drafting service is unreachable, so no sections can be drafted.'
                      : !framework ? 'Choose the regulatory framework these sections are drafted against.'
                        : undefined
                }
              >
                {I.sparkles} Draft {selList.length} section{selList.length === 1 ? '' : 's'} in parallel
              </button>
            </div>
          </div>
          {!canLive ? (
            <div className="bd-fw-note" role="alert">Not connected to the drafting service, so no sections can be drafted here. Sign in and retry — nothing is drafted in its place.</div>
          ) : overBatchCap ? (
            <div className="bd-fw-note">Select 20 sections or fewer — the drafting service takes 20 per batch.</div>
          ) : !framework ? (
            <div className="bd-fw-note">Choose a regulatory framework — the drafts are written to its expectations, and no accepted draft on these documents has recorded a filing type to carry forward.</div>
          ) : (
            <div className="bd-fw-note">
              Drafting {selList.length} section{selList.length === 1 ? '' : 's'} against <b>{frameworkLabel}</b> expectations
              {frameworkFromDocuments ? ' — carried forward from the last draft accepted on these documents. Change it if this filing is different.' : '.'}
            </div>
          )}
          <div className="bd-pick-list">
            {todo.map((s) => {
              const on = sel.has(s.id);
              return (
                <button key={s.id} className={'bd-pick-item' + (on ? ' on' : '')} onClick={() => { toggle(s.id); }}>
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
          {/* Refetch the spine here rather than at acceptance time: this is the
              one moment the review screen is being torn down anyway, so the
              loading gate below cannot interrupt work in progress. */}
          <button
            className="bd-ghost"
            onClick={() => {
              setPhase('pick');
              setCards({});
              if (spineDirtyRef.current) { spineDirtyRef.current = false; setReloadKey((k) => k + 1); }
            }}
          >
            New batch
          </button>
        </div>
      )}

      {phase === 'review' && doneCount > 0 && (() => {
        const doneCards = Object.keys(cards).map((k) => cards[k]).filter((c) => c.state === 'done');
        const lats = doneCards.map((c) => c.latencyMs).filter((v): v is number => v != null).sort((a, b) => a - b);
        const medianMs = lats.length ? lats[Math.floor(lats.length / 2)] : null;
        const totalWords = doneCards.reduce((s, c) => s + bdWordCount(c.html), 0);
        return (
          <div className="bd-metrics">
            <span className="bd-metric"><b>{doneCount}</b> drafted</span>
            <span className="bd-metric"><b>{acceptedCount}</b> accepted {I.dot} <b>{doneCount - acceptedCount}</b> in review</span>
            {medianMs != null && <span className="bd-metric"><b>{medianMs >= 1000 ? (medianMs / 1000).toFixed(1) + 's' : medianMs + 'ms'}</b> median time to draft</span>}
            <span className="bd-metric"><b>{totalWords.toLocaleString()}</b> words proposed</span>
            <span className="bd-metric-note">measured from this run</span>
          </div>
        );
      })()}

      {phase !== 'pick' && (
        <div className="bd-cards">
          {selList.map((s) => {
            const c = cards[s.id];
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
                  // the drafting service's `content` and the user's own edits
                  // in the textarea below. Sanitized through the
                  // same DOMPurify allowlist the chat surface uses — the
                  // allowlist keeps h3/p/span.stream-cite, so a drafted
                  // section renders unchanged.
                  editingCard === s.id ? (
                    /* Edited as the HTML it is. Accept already sends
                       `card.html` verbatim, so what is typed here is exactly
                       what gets POSTed and snapshotted into
                       coauthor_document_versions — no separate edit path, no
                       second store, nothing lost between here and the write. */
                    <textarea
                      className="bd-card-body bd-card-edit"
                      value={c.html}
                      onChange={(e) =>
                        setCards((prev) => ({ ...prev, [s.id]: { ...prev[s.id], html: e.target.value } }))
                      }
                      aria-label={`Edit the draft for ${s.title || s.num || s.id}`}
                      data-testid="bd-card-edit"
                    />
                  ) : c.html ? (
                    /* AuthoredHtml, not sanitizeChatHtml: a draft derived from
                       stored TipTap content can carry a governed figure
                       reference, and the chat allowlist strips it — the card
                       would show a different draft from the one Accept posts.
                       Same audited sanitiser module, authoring variant. */
                    <AuthoredHtml className="bd-card-body" html={c.html} />
                  ) : (
                    <div
                      className="bd-card-body"
                      dangerouslySetInnerHTML={{ __html: '<p class="bd-ph">Waiting to start...</p>' }}
                    />
                  )
                )}

                {c.state === 'done' && (
                  <div className="bd-card-foot">
                    <div className="bd-card-meta">
                      <span className="bd-chip live">{c.model}</span>
                      {c.latencyMs != null && <span className="bd-chip">{(c.latencyMs / 1000).toFixed(1)}s</span>}
                      <span className="bd-chip">{bdWordCount(c.html)} words</span>
                    </div>
                    {!c.accepted ? (
                      <div className="bd-card-acts">
                        {c.saveError && <span className="bd-accepted-note err">Not saved — {c.saveError}</span>}
                        <button className="bd-ghost sm" disabled={c.saving} onClick={() => { discard(s.id); }}>Discard</button>
                        <button
                          className="bd-ghost sm"
                          onClick={() => setEditingCard((cur) => (cur === s.id ? null : s.id))}
                          data-testid="bd-card-edit-toggle"
                        >
                          {editingCard === s.id ? 'Done editing' : 'Edit'}
                        </button>
                        {/* Accept is offered only when it can write. It used
                            to be offered on a fabricated "Sample" card too,
                            where it set `accepted: true` and reported the draft
                            "staged locally" — `accepted` is a component boolean
                            that disappears on navigation, so the card read
                            "accepted", the counter above read "N accepted", and
                            there was nothing anywhere. The control is removed rather than
                            disabled, and the reason is visible text on the card
                            rather than a title attribute a disabled button will
                            not announce. */}
                        {!canLive ? (
                          <span className="bd-accepted-note">
                            Not connected to the drafting service, so nothing can be written to the document.
                          </span>
                        ) : (
                          <button
                            className="bd-primary sm"
                            disabled={c.saving}
                            onClick={() => { void accept(s.id); }}
                          >
                            {c.saving ? 'Saving…' : c.saveError ? 'Retry save' : 'Accept · save to document'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="bd-card-acts">
                        <span className="bd-accepted-note">
                          {/* `accepted` is now set only after a confirmed
                              write, so there is no third state to word: it
                              used to read "Staged locally", which described
                              nothing that had happened. */}
                          {c.savedVersion != null
                            ? 'Saved to the document · previous content kept as version ' + c.savedVersion
                            : 'Saved to the document · the section was empty, nothing superseded'}
                        </span>
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

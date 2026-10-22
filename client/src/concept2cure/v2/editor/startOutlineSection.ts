/**
 * Starting a section from the governed filing outline (FILING_SPINE.md F4).
 *
 * Clicking a node of the outline that has no section in the open document used
 * to toast "no draft yet in this document" and stop there, so the outline named
 * every required part of the filing and offered no way to begin one. A click on
 * such a node now creates that section in this document, bound to the node by
 * its code, and opens it in the editor with the cursor in it.
 *
 * - One create path. This posts to `POST /api/authoring/sections`, the route
 *   "New section" (`surfaces/AuthoringCreateExport.tsx` createSection) and the
 *   open-in-editor handoff (`authoringHandoff.ts`) already use. The server owns
 *   the parent's lock, the position the code belongs at, the genesis revision
 *   and the CREATE audit row (`services/authoring/authoring-documents.ts`).
 * - A person's act. Only the outline row's click calls this; nothing AnA runs
 *   reaches it.
 * - Honest. A refusal (frozen document, no edit access, the code already
 *   started by someone else) is shown in the server's own words. A frozen or
 *   approved document offers no start at all.
 * - The right document only. The outline is the project's governed filing
 *   (`useFilingOutline`), and a project holds many authoring documents of which
 *   exactly one is the filing's editing copy (`authoring_documents.c2c_document_id`,
 *   services/authoring/authoring-documents.ts resolveBinding). Only that copy's
 *   sections reach the filing (commit-section-to-filing.ts matches by code), so
 *   a start is offered only there. In an AnA draft or any other working
 *   document the row says which document holds the filing and posts nothing.
 *   When the document list does not say what a document is bound to, nothing
 *   is offered either: unknown is not "yes".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, ApiRequestError, redactInternals } from '@/lib/queryClient';

/** The outline node being started: its code and its label. */
export interface OutlineNodeRef {
  key: string;
  label: string;
}

export type StartSectionOutcome =
  | { ok: true; section: { id: string; code: string; title: string } }
  | { ok: false; message: string; conflict: boolean };

/** Create the node's section in `docId`. Never throws. */
export async function postOutlineSection(
  docId: string,
  node: OutlineNodeRef,
): Promise<StartSectionOutcome> {
  try {
    const res = await apiRequest('POST', '/api/authoring/sections', {
      doc_id: docId,
      code: node.key,
      title: node.label,
      content: '',
    });
    // apiRequest returns a 401 instead of throwing it.
    if (res.status === 401) {
      return { ok: false, conflict: false, message: `${node.key} was not started — your session isn’t authenticated.` };
    }
    const json = (await res.json().catch(() => null)) as
      | { section?: { id?: unknown; code?: unknown; title?: unknown } }
      | null;
    const s = json?.section;
    if (!res.ok || s?.id == null) {
      return { ok: false, conflict: false, message: `${node.key} was not started — the server returned no section. Nothing was created.` };
    }
    return {
      ok: true,
      section: {
        id: String(s.id),
        code: typeof s.code === 'string' ? s.code : node.key,
        title: typeof s.title === 'string' ? s.title : node.label,
      },
    };
  } catch (err) {
    // A non-2xx arrives here as ApiRequestError whose message is already the
    // server's own sentence with internals filtered out (extractApiError).
    if (err instanceof ApiRequestError) {
      return { ok: false, conflict: err.status === 409, message: `${node.key} was not started — ${err.message}` };
    }
    const why = redactInternals(err instanceof Error ? err.message : '', 'the server could not be reached');
    return { ok: false, conflict: false, message: `${node.key} was not started — ${why}.` };
  }
}

/** Whether a start can be offered on a node, and if not, why, in words. */
export type StartOffer = { ok: true } | { ok: false; why: string };

/** The open document, as far as the start needs it. */
export interface StartDocRef {
  id: string;
  title: string;
  status: string;
  /**
   * The governed filing this document is the editing copy of. `undefined`
   * means the list did not say (a server that does not return the column),
   * which is treated as unknown and offers nothing; `null` means unbound.
   */
  c2c_document_id?: string | null;
}

/** The governed filing the outline was read from. */
export interface FilingRef {
  id: string;
  title: string;
}

/** The server's duplicate test (section-placement.ts placeNewSection). */
const codeKey = (c: string | null | undefined) => String(c ?? '').trim().toUpperCase();

/**
 * Decide whether a click on an unstarted node may create its section in `doc`.
 * Pure, so the row's words and the click's guard can never disagree.
 */
export function startOffer(args: {
  nodeKey: string;
  doc: StartDocRef | null;
  filing: FilingRef | null;
  /** Every document the workbench lists, to name the filing's editing copy. */
  docs: readonly StartDocRef[];
  sections: readonly { code?: string | null }[];
}): StartOffer {
  const { nodeKey, doc, filing, docs, sections } = args;
  if (!doc) return { ok: false, why: 'Open a document first — a section belongs to a document.' };
  const status = String(doc.status ?? '').toUpperCase();
  if (status === 'FROZEN' || status === 'APPROVED') {
    return { ok: false, why: `This document is ${status.toLowerCase()}, so no section can be added.` };
  }
  if (!filing) {
    return { ok: false, why: 'The filing this outline belongs to was not read, so no section is started from it.' };
  }
  if (doc.c2c_document_id === undefined) {
    return {
      ok: false,
      why: `Whether this document is the editing copy of ${filing.title} is not known, so no section is started from its outline.`,
    };
  }
  if (doc.c2c_document_id !== filing.id) {
    const copy = docs.find(d => d.c2c_document_id === filing.id);
    return {
      ok: false,
      why:
        `This outline belongs to ${filing.title}, and this document is not its editing copy, ` +
        'so a section started here would not reach the filing. ' +
        (copy ? `Open “${copy.title}” to start it.` : `Open the document that holds ${filing.title} to start it.`),
    };
  }
  // The server refuses a code that differs only in case or spaces as a
  // duplicate, while the filing reads codes exactly, so such a section neither
  // fills this node nor lets a second one be added. Said, not posted.
  const near = sections.find(s => codeKey(s.code) === codeKey(nodeKey) && s.code !== nodeKey);
  if (near) {
    return {
      ok: false,
      why:
        `This document already has a section coded “${near.code}”. The filing reads codes exactly, ` +
        `so it does not fill ${nodeKey}, and a second one cannot be added.`,
    };
  }
  return { ok: true };
}

/** The outline row's tooltip for a node with no section in this document. */
export function unstartedNodeTitle(label: string, offer: StartOffer, starting: boolean): string {
  if (starting) return `${label} — starting this section…`;
  return `${label} — not started in this document yet. ${offer.ok ? 'Select to start it.' : offer.why}`;
}

/** The row's accessible name: a keyboard or screen-reader user hears that it creates. */
export function unstartedNodeAriaLabel(
  node: { key: string; label: string; mandatory?: boolean },
  offer: StartOffer,
  starting: boolean,
): string {
  const head = `${node.key} ${node.label}, ${node.mandatory ? 'required, ' : ''}not started`;
  if (starting) return `${head}. Starting this section.`;
  return offer.ok ? `${head}. Start this section in this document.` : `${head}. ${offer.why}`;
}

/**
 * The outline row's props for a node with no section in this document: the
 * tooltip, and an accessible name that says the row creates a section (or why
 * it cannot), its disabled state and its busy state.
 */
export function unstartedRowProps(
  start: Pick<OutlineStart, 'offerFor' | 'startingKey'>,
  node: { key: string; label: string; mandatory?: boolean },
): { title: string; 'aria-label': string; 'aria-disabled'?: true; 'aria-busy'?: true } {
  const offer = start.offerFor(node.key);
  const starting = start.startingKey === node.key;
  return {
    title: unstartedNodeTitle(node.label, offer, starting),
    'aria-label': unstartedNodeAriaLabel(node, offer, starting),
    ...(offer.ok ? {} : { 'aria-disabled': true as const }),
    ...(starting ? { 'aria-busy': true as const } : {}),
  };
}

type SectionTarget = { kind: 'section'; id: string; module?: string };

interface StartDeps {
  activeDoc: StartDocRef | null;
  filing: FilingRef | null;
  docs: readonly StartDocRef[];
  sections: readonly { code?: string | null }[];
  /** Re-read this document's sections; the new one lands in the list. */
  loadSections: (docId: string) => Promise<void>;
  /** The workbench's guarded navigation (holds unsaved work). */
  requestLeave: (target: SectionTarget) => boolean;
  fireToast: (msg: string, kind?: 'error') => void;
  activeSectionId: string | null;
  /** The pane the editor renders into, for moving focus into it. */
  docPane: () => HTMLElement | null;
}

/** Put the cursor in the editor once it has mounted in `pane`. */
function focusEditorWhenMounted(pane: () => HTMLElement | null): () => void {
  let tries = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attempt = () => {
    const el = pane()?.querySelector<HTMLElement>('[contenteditable="true"]');
    if (el) {
      el.focus();
      return;
    }
    if (++tries < 40) timer = setTimeout(attempt, 50);
  };
  attempt();
  return () => clearTimeout(timer);
}

/**
 * The click handler for a node with no section in the open document, carrying
 * what the row needs to describe it.
 */
export type OutlineStart = ((node: OutlineNodeRef) => Promise<void>) & {
  /** Whether that node can be started here, and why not. */
  offerFor: (nodeKey: string) => StartOffer;
  /** The node whose create is running, for the row's busy state. */
  startingKey: string | null;
};

/** The outline's "start this section" act. */
export function useStartOutlineSection(deps: StartDeps): OutlineStart {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const inFlight = useRef<string | null>(null);
  const [startingKey, setStartingKey] = useState<string | null>(null);
  const pendingFocus = useRef<string | null>(null);

  const { activeSectionId } = deps;
  useEffect(() => {
    if (!activeSectionId || pendingFocus.current !== activeSectionId) return;
    pendingFocus.current = null;
    return focusEditorWhenMounted(() => depsRef.current.docPane());
  }, [activeSectionId]);

  const offerFor = useCallback((nodeKey: string): StartOffer => {
    const { activeDoc, filing, docs, sections } = depsRef.current;
    return startOffer({ nodeKey, doc: activeDoc, filing, docs, sections });
  }, []);

  const start = useCallback(async (node: OutlineNodeRef) => {
    const { activeDoc, fireToast } = depsRef.current;
    const offer = offerFor(node.key);
    if (!offer.ok) {
      fireToast(`${node.key} ${node.label} was not started. ${offer.why}`, 'error');
      return;
    }
    if (inFlight.current) {
      if (inFlight.current !== node.key) {
        fireToast(`Starting ${inFlight.current} — select ${node.key} again when it opens.`);
      }
      return;
    }
    const docId = (activeDoc as StartDocRef).id;
    inFlight.current = node.key;
    setStartingKey(node.key);
    try {
      const outcome = await postOutlineSection(docId, node);
      // The person may have moved to another document while the create ran;
      // re-reading or opening would then act on the wrong one.
      const stillHere = depsRef.current.activeDoc?.id === docId;
      if (!outcome.ok) {
        fireToast(outcome.message, 'error');
        // Someone else started it: re-read so the node binds to their section.
        if (outcome.conflict && stillHere) await depsRef.current.loadSections(docId);
        return;
      }
      const { id, code, title } = outcome.section;
      if (!stillHere) {
        fireToast(`Section started · ${code} ${title}, in the document you left. It was not opened.`);
        return;
      }
      // Armed before the re-read: that read may itself select the new section
      // (a document with no sections yet opens its first one).
      pendingFocus.current = id;
      await depsRef.current.loadSections(docId);
      const m = /^(\d)/.exec(code)?.[1];
      const opened = depsRef.current.requestLeave({ kind: 'section', id, module: m ? `M${m}` : undefined });
      fireToast(
        `Section started · ${code} ${title} (initial revision recorded)` +
          (opened ? '.' : '. Your unsaved text in the open section is held until you choose.'),
      );
    } finally {
      inFlight.current = null;
      setStartingKey(null);
    }
  }, [offerFor]);

  return useMemo(
    () => Object.assign((node: OutlineNodeRef) => start(node), { offerFor, startingKey }),
    [start, offerFor, startingKey],
  );
}

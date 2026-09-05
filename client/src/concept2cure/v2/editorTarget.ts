/**
 * The editor deep-link channel — how a surface opens THE document editor on a
 * specific section instead of on whatever the editor would show by default.
 *
 * ── Why a window channel ─────────────────────────────────────────────────────
 * This is the shell's established hand-off idiom, not a new state system.
 * `window.C2C_PROJECT` carries the open project into every project-aware
 * surface, and `window.C2C_CONVO` seeds ConversationThread ("set the global,
 * navigate, consume on mount" — V2App.startShellConversation). The router is
 * wouter on `location.pathname`, so a `#fragment` never reaches a surface —
 * MdxSurfaceHost documented exactly that failure before this module existed.
 *
 * ── Why one module owns both ends ────────────────────────────────────────────
 * tests/ci/no-ghost-globals.contract.test.ts exists because this codebase has
 * shipped channels with a writer and no reader (localStorage['c2c_biostat_doc'])
 * and readers with no writer (window.C2C_API). Both halves of this channel —
 * the setter senders call and the peek/consume the editor calls — live here,
 * in one file, so neither can be deleted without the other going dark in the
 * same diff.
 *
 * ── One-shot, and stale-safe ─────────────────────────────────────────────────
 * A target describes ONE click. The editor clears the channel on mount
 * (consume), and `peekEditorTarget` refuses entries older than
 * EDITOR_TARGET_TTL_MS, so a target that never got consumed — a navigation
 * that failed, a tab restored hours later — cannot ambush an unrelated visit
 * to the editor. That is the same hazard `convoEpoch` guards on the
 * conversation channel, handled at the data instead of the mount.
 *
 * @module client/src/concept2cure/v2/editorTarget
 */

/** The document families a sender can name — the mdx `ProgramPathway`
 *  vocabulary, which is also the governed `c2c_documents.doc_type` value for
 *  each family (server/services/c2c/document-class.ts). One vocabulary on
 *  purpose: the editor compares the target against the project's governed
 *  dossier type before resolving, and a second spelling would break that
 *  check silently.
 *
 *  It is deliberately NOT the whole `PROGRAM_TO_DOC_TYPE` image (ind, nda,
 *  bla, maa, mdr …): those families have no mdx workspace to send from, and a
 *  spelling nothing writes is a vocabulary entry that can only ever be wrong.
 *  A sender that holds a section but cannot name a family in THIS vocabulary
 *  says so by passing `docType: null` — see below. */
export const EDITOR_TARGET_DOC_TYPES = ['k510', 'pma', 'cer', 'ivdr'] as const;
export type EditorTargetDocType = (typeof EDITOR_TARGET_DOC_TYPES)[number];

/** How each family reads on screen, for toasts and honest-miss notices. */
export const EDITOR_TARGET_DOC_LABELS: Readonly<Record<EditorTargetDocType, string>> = {
  k510: '510(k)',
  pma: 'PMA',
  cer: 'CER',
  ivdr: 'IVD',
};

/** What a sender knows about the section it is opening. `code` is the section
 *  identifier in the sender's own numbering (an eSTAR row number, an outline
 *  key); `label` is the human title, used both for matching by title and for
 *  saying honestly what could not be found. */
export interface EditorSectionRef {
  code?: string | number | null;
  label?: string | null;
}

export interface EditorTarget {
  /** The document family the target belongs to, or null when the sender holds
   *  a real section but cannot name a family in this vocabulary — the Vault's
   *  governed dossiers are `ind`/`nda`/`bla`/… as often as they are device
   *  pathways. null is the HONEST value, not a missing one: the editor skips
   *  the family guard it cannot evaluate and still resolves the section by
   *  code/label within the named program, exactly as it already does for a
   *  navigation-directive hand-off (DocumentAuthoring's `sectionOpenTarget`).
   *  A target must never invent a family: `filing.document.doc_type !== docType`
   *  is a REFUSAL, so a guessed family turns a resolvable section into a
   *  "belongs to a different dossier" miss. */
  docType: EditorTargetDocType | null;
  /** A SPECIFIC authoring document, by id — the strongest claim a sender can
   *  make, used when the sender holds the exact document (the correspondence
   *  card's linked response draft) rather than a section it must search for.
   *  Resolved before any code/label search: the doc is either in the editor's
   *  list or the miss is stated. */
  docId: string | null;
  sectionCode: string | null;
  sectionLabel: string | null;
  /** regulatory_programs UUID the section belongs to, when the sender had one.
   *  The editor refuses to resolve a target into a different program's
   *  documents — a near-miss open is worse than an honest miss. */
  programId: string | null;
  programTitle: string | null;
  /** Epoch ms the target was written. Entries older than the TTL are dead. */
  setAt: number;
}

/** How long a target stays honourable. Set → navigate → mount is immediate;
 *  two minutes is generous headroom for a slow chunk load without letting a
 *  stranded target survive into a genuinely separate visit. */
export const EDITOR_TARGET_TTL_MS = 2 * 60 * 1000;

declare global {
  interface Window {
    /** The editor deep-link target. Owned by this module — write through
     *  `setEditorTarget`, read through `peek/consumeEditorTarget`. */
    C2C_EDITOR_TARGET?: EditorTarget;
  }
}

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

/** Publish a target for the editor's next mount. Replaces, never merges —
 *  the same rule window.C2C_PROJECT writes follow. */
export function setEditorTarget(
  target: { docType: EditorTargetDocType | null } & EditorSectionRef & {
    docId?: string | null;
    programId?: string | null;
    programTitle?: string | null;
  },
): void {
  if (typeof window === 'undefined') return;
  window.C2C_EDITOR_TARGET = {
    docType: target.docType ?? null,
    docId: str(target.docId),
    sectionCode: str(target.code),
    sectionLabel: str(target.label),
    programId: str(target.programId),
    programTitle: str(target.programTitle),
    setAt: Date.now(),
  };
}

/** Drop any pending target. Senders call this on a plain "open the editor"
 *  navigation so an older section target cannot ride along with a click that
 *  never named one. */
export function clearEditorTarget(): void {
  if (typeof window === 'undefined') return;
  try {
    delete window.C2C_EDITOR_TARGET;
  } catch {
    window.C2C_EDITOR_TARGET = undefined;
  }
}

/**
 * Read the pending target without clearing it — safe to call from a render
 * path (a `useState` initializer). Returns null for anything it cannot vouch
 * for: a missing entry, a malformed shape, an unknown docType, or a stale /
 * future-stamped `setAt`. Never throws.
 */
export function peekEditorTarget(now: number = Date.now()): EditorTarget | null {
  if (typeof window === 'undefined') return null;
  const raw = window.C2C_EDITOR_TARGET;
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Partial<EditorTarget>;
  // A named family must be one this vocabulary knows; an ABSENT family (null /
  // undefined) is a legitimate target that simply claims less. Garbage — a
  // number, an unknown spelling — is still refused outright.
  if (t.docType != null &&
      (typeof t.docType !== 'string' ||
       !(EDITOR_TARGET_DOC_TYPES as readonly string[]).includes(t.docType))) {
    return null;
  }
  if (typeof t.setAt !== 'number' || !Number.isFinite(t.setAt)) return null;
  // Stale (unconsumed from an earlier visit) or stamped in the future (a
  // clock that cannot be trusted) — either way, no claim is honoured.
  if (now - t.setAt > EDITOR_TARGET_TTL_MS || t.setAt - now > EDITOR_TARGET_TTL_MS) return null;
  return {
    docType: (t.docType ?? null) as EditorTargetDocType | null,
    docId: str(t.docId),
    sectionCode: str(t.sectionCode),
    sectionLabel: str(t.sectionLabel),
    programId: str(t.programId),
    programTitle: str(t.programTitle),
    setAt: t.setAt,
  };
}

/** Read AND clear. The channel is one-shot: whatever was pending — valid,
 *  stale, or garbage — is gone after this call. */
export function consumeEditorTarget(now: number = Date.now()): EditorTarget | null {
  const target = peekEditorTarget(now);
  clearEditorTarget();
  return target;
}

/** Case/spacing/punctuation-insensitive title form, for matching by label. */
const normalizeLabel = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Find the authored section a target names, or null.
 *
 * Codes first — exact (caseless) then numeric, because senders number their
 * rows ("11") while authored codes may carry formatting ("011"). Label match
 * is the fallback, since the workbench row lists (cerv2 sections) and the
 * authoring store share no key — titles are the only identity that travels.
 * A section with a null/empty code never matches a code, mirroring
 * `findSectionForNode`: collapsing null onto a real key opens the wrong
 * section, the one failure mode worse than a miss.
 */
export function matchEditorTargetSection<
  T extends { code?: string | null; title?: string | null },
>(sections: readonly T[], target: Pick<EditorTarget, 'sectionCode' | 'sectionLabel'>): T | null {
  const code = target.sectionCode?.trim() ?? '';
  if (code) {
    const exact = sections.find(
      (s) => typeof s.code === 'string' && s.code.trim().length > 0 &&
        s.code.trim().toLowerCase() === code.toLowerCase(),
    );
    if (exact) return exact;
    const wanted = Number(code);
    if (Number.isFinite(wanted)) {
      const numeric = sections.find(
        (s) => typeof s.code === 'string' && s.code.trim().length > 0 &&
          Number(s.code.trim()) === wanted,
      );
      if (numeric) return numeric;
    }
  }
  const label = target.sectionLabel ? normalizeLabel(target.sectionLabel) : '';
  if (label) {
    const byTitle = sections.find(
      (s) => typeof s.title === 'string' && normalizeLabel(s.title) === label,
    );
    if (byTitle) return byTitle;
  }
  return null;
}

/** The target's section, in the words a notice can use. */
export function describeEditorTarget(
  target: Pick<EditorTarget, 'sectionCode' | 'sectionLabel'>,
): string {
  if (target.sectionLabel && target.sectionCode) {
    return `“${target.sectionLabel}” (section ${target.sectionCode})`;
  }
  if (target.sectionLabel) return `“${target.sectionLabel}”`;
  if (target.sectionCode) return `section ${target.sectionCode}`;
  return 'the requested section';
}

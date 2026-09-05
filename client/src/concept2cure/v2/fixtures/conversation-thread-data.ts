/* Conversation thread display contract — the types `ConversationThread` renders
   and the small icon/label maps that go with them.

   The header used to read "fixture data … thread scenarios, artifact builders,
   and the live responder stub", and that was accurate: this module carried
   scripted conversations and hand-written artifacts. None of them had a caller
   and all of them are gone (see the note above CT_ARTIC). What is left is a
   contract and two lookup tables — no data, nothing to render, nothing to reach
   for by mistake. The file keeps its path so no import moves; it is no longer
   a fixture in anything but directory name. */

/* Type-only, so this module still has no runtime dependency on the chat hook,
   the governed-action hook or the activity component — all three imports are
   erased at compile time. They are the REAL types rather than structural
   mirrors on purpose: a mirror of `PendingSignoff` is a second definition of
   what a Part 11 signature carries, free to drift from the one
   `GovernedActionSignoff` actually consumes; a mirror of `AnaActivityProps`
   would be a second shape for the work record, free to drift from the one
   <AnaActivity /> renders. */
import type { AnaChatAction } from '../../components/ana/useAnaChat';
import type { PendingSignoff } from '../../components/ana/useGovernedAction';
import type { AnaActivityProps } from '../AnaActivity';

/* ---- Types ---- */

/* `CtToolCall` ({ name, arg, result }) was declared here and rendered by
   `AnaTurn` as a `.ct-tool` row. `toTurn` never set `tools`, so the row never
   appeared once — the same dead-renderer class this surface has already had
   twice (the proposal block, the dropped sign-offs). The turn's real tool
   calls are `AnaToolCall`s, carried on `activity` below and rendered by
   <AnaActivity />, the one tool-transparency renderer. Deleted rather than
   wired, so a second shape for the same record is not left within reach. */

export interface CtLink {
  label: string;
  kind: string;
}

export interface CtGrounding {
  src: string;
  ok: boolean;
}

export interface CtTurn {
  role: string;
  text?: string;
  answer?: string;
  links?: CtLink[];
  grounding?: CtGrounding[];
  doc?: any;
  /**
   * Governed actions the turn executed, and signatures it is WAITING for.
   *
   * These were dropped. `toTurn` mapped text, thinking and grounding and
   * discarded `executedActions` and `pendingSignoffs`, so a turn that needed a
   * 21 CFR 11.50 signature rendered as an ordinary answer with no prompt — the
   * mutation waiting on a signature nobody was asked for.
   *
   * That was survivable while `conversation-thread` was reached only by the
   * Home composer. It is not now: `ownsConversation` surfaces hand ⌘K questions
   * here, so this is a destination for asks that can carry governed actions.
   */
  executedActions?: AnaChatAction[];
  pendingSignoffs?: PendingSignoff[];
  /**
   * The turn's real activity record, rendered by <AnaActivity />.
   *
   * The same mapping the shell rail uses (`adaptChatMessage` in V2App.tsx):
   * the phase AnA is in, the lens she read the question through, the document
   * type she detected, every deterministic tool she called with its round and
   * status, her extended reasoning, and the deliverable's title. `toTurn`
   * used to carry `thinking` alone and drop the rest, so a multi-tool,
   * multi-round run rendered on this surface as three animated dots. Omitted
   * entirely for a settled turn that did nothing reportable — never an empty
   * or decorated record.
   */
  activity?: AnaActivityProps;
}

export interface CtArtRow {
  k: string;
  v: string;
  conf: number | null;
}

export interface CtArtPred {
  k: string;
  name: string;
  match: number;
  role: string | null;
  safety: string;
}

export interface CtArtOutlineRow {
  code: string;
  heading: string;
  required: boolean;
  targetWords?: [number, number];
  st: string;
}

export interface CtArtSection {
  n: string;
  label: string;
  st: string;
}

export interface CtArtProv {
  by: string;
  /* `model` and `inputs` are optional because a REAL artifact frequently does
     not carry them. They were required while the only artifacts were the
     hand-written fixtures, which of course always had a value to give; the
     drafts the stream actually produces record who authored them and what they
     were grounded in, and nothing about the model or the input set. A required
     field that a real record cannot fill is a field that gets filled with a
     plausible-looking guess. */
  model?: string;
  inputs?: string;
  evidence: string[];
  /** Server-issued audit id. Absent when the artifact was not governed-written. */
  audit?: string;
}

export interface CtArtifact {
  id: string;
  kind: string;
  type: string;
  title: string;
  /** One of the governed statuses the server keeps on
   *  `concept2cure_artifacts.status` (draft / review / approved / locked), or
   *  `'unsaved'` for a draft the server reported no stored version for. */
  status: string;
  when?: string;
  prov: CtArtProv;
  rows?: CtArtRow[];
  preds?: CtArtPred[];
  sections?: CtArtSection[];
  outline?: CtArtOutlineRow[];
  note?: string;
  /**
   * Durable governed identity, present only once the server emitted
   * `artifact_version_saved` for this draft — i.e. once a row exists in
   * `concept2cure_artifacts`. Its absence is the whole reason the workflow
   * controls can be honestly disabled instead of failing at the API.
   */
  artifactId?: string;
  version?: number;
  /** The draft body. What `POST /api/concept2cure/artifacts/export-docx` renders. */
  content?: string;
}

/* ---- Link maps ---- */

export const CT_LINKMAP: Record<string, string> = {
  doc: 'document-authoring', file: 'vault', task: 'task-board',
  module: 'dossier-map', evidence: 'evidence-search',
  review: 'review', submission: 'submission-center',
};

export const CT_LINKIC: Record<string, string> = {
  doc: 'fileText', file: 'vault', task: 'checkSquare',
  module: 'network', evidence: 'search',
  review: 'checkCircle', submission: 'rocket',
};

/* ── The fabricated artifact source is gone ──────────────────────────────────
   `buildClassification` / `buildPredicate` / `buildEstar`, `CT_ARTIFACT_BUILDERS`,
   `ctRespond` and `CONVO_THREADS` used to live here: hand-written classification
   reports, predicate tables, eSTAR section lists and whole scripted
   conversations, one of them carrying a hard-coded Part 11 audit id
   ('AUD-2F4K9A') that traced to nothing.

   None of it had a caller — `ConversationThread` imports the maps and the types
   from this module and nothing else. It was left behind as the obvious thing to
   reach for the next time the artifact panel needed content, which is precisely
   the fabricated-governance failure the house rule forbids. The panel now reads
   the conversation's REAL drafts (`AnaChatMessage.generatedDraft`, written to
   concept2cure_artifacts by the server), so the decoys are deleted rather than
   left within reach. */

/* ---- Artifact icon + status maps ---- */

/* `classification` / `predicate` / `estar` were the three deleted builders'
   kinds and had nothing left to key. A conversation produces documents. */
export const CT_ARTIC: Record<string, string> = {
  document: 'fileText', doc: 'fileText',
};

/* Keyed by the server's own status values (see the VALID_TRANSITIONS map on
   PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId/status), plus
   `unsaved` — the honest label for a draft that exists on screen and nowhere
   else. */
export const CT_STATUS_LABEL: Record<string, string> = {
  unsaved: 'Not in the record', draft: 'Draft', review: 'In review',
  'in-review': 'In review', approved: 'Approved', locked: 'Locked',
  submitted: 'Submitted', pending_structure: 'Pending structure',
};

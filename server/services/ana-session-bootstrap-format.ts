/**
 * AnA session bootstrap — pure ranking + formatting core (no DB, no I/O).
 *
 * Split from ana-session-bootstrap.ts so the selection/formatting logic is
 * directly unit-testable without dragging in the database. The DB loaders live
 * in ana-session-bootstrap.ts and call these.
 */

export interface BootstrapAtom {
  title: string;
  content: string;
  category?: string | null;
  importance?: string | null;
  isVerified?: boolean | null;
  confidence?: number | null;
  createdAt?: Date | string | null;
}

export interface OutcomeLesson {
  capabilityKey: string;
  outcome: string;
  documentType?: string | null;
  lessonsLearned?: string | null;
}

/**
 * Decide whether to auto-rehydrate session context for a chat turn. Pure so the
 * gating is testable without the route. Fires only at session start (no prior
 * messages in the thread), when an org is present, and unless explicitly
 * disabled — so prior context loads once per session without re-injecting every
 * turn.
 */
export function shouldAutoBootstrap(opts: {
  priorMessageCount: number;
  organizationId?: number | null;
  disabled?: boolean;
}): boolean {
  if (opts.disabled) return false;
  if (!opts.organizationId) return false;
  return opts.priorMessageCount === 0;
}

const IMPORTANCE_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** Numeric desirability of an atom for cold-start injection (higher = keep). */
export function bootstrapAtomScore(a: BootstrapAtom): number {
  const importance = IMPORTANCE_WEIGHT[(a.importance ?? '').toLowerCase()] ?? 1.5;
  const verified = a.isVerified ? 1.5 : 0;
  const confidence = typeof a.confidence === 'number' ? a.confidence : 0.5;
  return importance + verified + confidence;
}

/**
 * Rank atoms for cold-start injection by importance / verification / confidence,
 * breaking ties by recency, and return the top `limit`. Pure and deterministic.
 */
export function rankBootstrapAtoms(atoms: BootstrapAtom[], limit: number): BootstrapAtom[] {
  const toTime = (v: Date | string | null | undefined): number => {
    if (!v) return 0;
    const t = v instanceof Date ? v.getTime() : Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  };
  return [...atoms]
    .sort((a, b) => {
      const s = bootstrapAtomScore(b) - bootstrapAtomScore(a);
      if (s !== 0) return s;
      return toTime(b.createdAt) - toTime(a.createdAt);
    })
    .slice(0, Math.max(0, limit));
}

function clip(s: string, max: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

const SESSION_MEMORY_HEADING = '## Session memory — picking up where we left off';
const MEMORY_CHAR_LIMIT = 4500;
const MEMORY_OMISSION_NOTICE = '_Some session memory records were omitted to fit the prompt budget. This history is incomplete._';
const memoryText = (value: string): string => (value ?? '').replace(/\s+/g, ' ').trim();

/** Keep whole ranked records, including their labels and section headings.
 * Reserve the omission notice before admission, so it cannot displace a
 * qualifier after a record has been selected. File previews have their own
 * existing limits and do not consume this memory-only budget. */
function admitMemorySections(sections: Array<{ heading: string; records: string[] }>) {
  const total = sections.reduce((size, section) => size + (section.records.length
    ? section.heading.length + 1 + section.records.reduce((n, record) => n + record.length + 1, 0)
    : 0), SESSION_MEMORY_HEADING.length);
  const omitted = total > MEMORY_CHAR_LIMIT;
  let used = SESSION_MEMORY_HEADING.length + (omitted ? MEMORY_OMISSION_NOTICE.length + 1 : 0);
  const admitted = sections.map(({ heading, records }) => {
    const lines: string[] = [];
    for (const record of records) {
      const cost = record.length + 1 + (lines.length ? 0 : heading.length + 1);
      if (used + cost > MEMORY_CHAR_LIMIT) continue;
      if (!lines.length) lines.push(heading);
      lines.push(record);
      used += cost;
    }
    return lines;
  });
  return { sections: admitted, omitted };
}

/** Compact per-file recall line: where a vault document is and what it is for. */
export interface VaultFileDigest {
  fileName: string;
  documentTitle: string;
  programName?: string | null;
  folderId?: string | null;
  ctdSection?: string | null;
  placementStatus: string;
  /** extracted | extraction_failed | cataloged | uncataloged */
  catalogStatus: string;
  documentKind?: string | null;
  purpose?: string | null;
  /** suggested | confirmed | corrected (S4); absent or null reads as not confirmed. */
  catalogState?: string | null;
}

/** A chat-uploaded file the client attached in some past conversation. */
export interface ChatUploadRecallDigest {
  fileName: string;
  fileId: string | null;
  uploadedAt?: string | null;
}

/**
 * A bounded sample of the org's vault files together with the scope-wide
 * numbers it was drawn from.
 *
 * The recall block lists the twelve most recent files under a heading that
 * reads as the complete set. For an org with more than twelve it was not:
 * the withheld ones were the OLDEST, which are exactly the files a client
 * expects AnA to still know about and the ones she would otherwise answer
 * "there is no such document" about. The sample is fine; presenting it as
 * the whole is not, so the scope travels with it.
 */
export interface VaultFileScope {
  files: VaultFileDigest[];
  actorFiltered?: boolean;
  sourceAccessNotice?: string;
  /** Live documents in the org — not `files.length`. */
  total: number;
  /** How many the sample leaves out. */
  withheld: number;
  notYetStudied: number;
  extractionFailed: number;
  unfiled: number;
}

/** Chat uploads for recall, and whether the limit hid any. */
export interface ChatUploadScope {
  uploads: ChatUploadRecallDigest[];
  hasMore: boolean;
  actorFiltered?: boolean;
  total?: number;
  withheld?: number;
  sourceAccessNotice?: string;
}

export interface SessionBootstrapParts {
  workingMemorySummary?: string | null;
  projectAtoms: BootstrapAtom[];
  clientAtoms: BootstrapAtom[];
  outcomeLessons: OutcomeLesson[];
  /** Project-vault files on record (document catalog); omitted when the catalog is off. */
  vaultFiles?: VaultFileScope;
  /** Files the client attached in past conversations — reachable, not yet filed. */
  chatUploads?: ChatUploadScope;
  atomLimit?: number;
}

/**
 * The sentence that stops a sample being read as a total.
 *
 * Returns '' only when the listing IS the scope and nothing in it needs
 * attention — i.e. when there is genuinely nothing the lines above do not
 * already say. Every other case names a number, because "12 files" and
 * "12 of 40 files, 19 never studied" lead to different behaviour and the
 * block used to render both identically.
 */
export function formatVaultScopeLine(scope: VaultFileScope): string {
  const parts: string[] = [];
  const scopeLabel = scope.actorFiltered ? 'in your accessible source scope' : 'on record';
  if (scope.withheld > 0) {
    parts.push(
      `Showing ${scope.files.length} of ${scope.total} files ${scopeLabel} — ` +
        `${scope.withheld} older one(s) are NOT listed above. Never answer "no such document" ` +
        `from this list alone: use list_project_documents or search_project_documents first.`,
    );
  } else {
    parts.push(scope.actorFiltered
      ? `${scope.total} file(s) in your accessible source scope at this recall check.`
      : `${scope.total} file(s) on record — this is all of them.`);
  }
  const flags: string[] = [];
  if (scope.notYetStudied > 0) flags.push(`${scope.notYetStudied} not yet studied`);
  if (scope.unfiled > 0) flags.push(`${scope.unfiled} unfiled`);
  if (scope.extractionFailed > 0) flags.push(`${scope.extractionFailed} with failed extraction`);
  if (flags.length) parts.push(`${flags.join(', ')} (across all of them, not just the ones above).`);
  return parts.join(' ');
}

/**
 * Whose description this is (S4). AnA's own suggestion is recalled as hers and
 * unconfirmed, so she does not repeat it to the user as an established fact.
 */
function catalogProvenance(state: string | null | undefined): string {
  if (state === 'confirmed') return ' (confirmed by a person)';
  if (state === 'corrected') return ' (corrected by a person)';
  return ' (your suggestion, not yet confirmed by a person)';
}

/** One recall line per file — location first, then what it is (or, honestly, that it awaits study). */
export function formatVaultFileLine(f: VaultFileDigest): string {
  const filed = [f.folderId, f.ctdSection].filter(Boolean).join(' · ');
  // A suggested folder is a proposal no person has confirmed; said so (S4).
  const location =
    f.placementStatus === 'unfiled'
      ? 'unfiled — needs review'
      : f.placementStatus === 'suggested'
        ? `${filed ? `${filed}, ` : ''}filing suggested, not yet confirmed by a person`
        : filed || f.placementStatus;
  const name = clip(f.documentTitle || f.fileName, 90);
  const where = `${f.programName ? `${clip(f.programName, 40)} / ` : ''}${location}`;
  if (f.catalogStatus === 'cataloged') {
    const what = [f.documentKind, f.purpose].filter(Boolean).map(s => clip(String(s), 160)).join(' — ');
    return `- **${name}** (${where}): ${what || 'cataloged'}${catalogProvenance(f.catalogState)}. ` +
      'Automatic scope: legacy value-presence check; label/context verification is not recorded; scientific qualification is unassessed.';
  }
  if (f.catalogStatus === 'extraction_failed') {
    return `- **${name}** (${where}): extraction FAILED — the content is not readable yet; say so if asked.`;
  }
  return `- **${name}** (${where}): not yet studied — read it in full and catalog it when it becomes relevant.`;
}

/**
 * Format the bootstrap context block injected at session start. Pure: takes
 * already-loaded parts and renders compact markdown. Returns '' when there is
 * genuinely nothing to recall (so callers can omit the block entirely).
 */
export function formatSessionBootstrap(parts: SessionBootstrapParts): string {
  const atomLimit = parts.atomLimit ?? 6;
  const working = memoryText(parts.workingMemorySummary ?? '');
  const project = rankBootstrapAtoms(parts.projectAtoms, atomLimit);
  const client = rankBootstrapAtoms(parts.clientAtoms, Math.max(2, Math.floor(atomLimit / 2)));
  const lessons = parts.outcomeLessons.filter(l => l.lessonsLearned && l.lessonsLearned.trim()).slice(0, 5);
  const atomLine = (a: BootstrapAtom) => `- **${memoryText(a.title)}**${a.category ? ` _(${a.category})_` : ''}: ${memoryText(a.content)}`;
  const memory = admitMemorySections([
    { heading: '### Where we left off', records: working ? [working] : [] },
    { heading: '### Project memory (most important)', records: project.map(atomLine) },
    { heading: '### Client memory (most important)', records: client.map(atomLine) },
    { heading: '### What I learned on past work here', records: lessons.map(l => {
      const tag = l.documentType ? `${l.capabilityKey}/${l.documentType}` : l.capabilityKey;
      return `- (${tag}, ${l.outcome}) ${memoryText(l.lessonsLearned!)}`;
    }) },
  ]);
  const lines: string[] = memory.omitted ? [MEMORY_OMISSION_NOTICE] : [];
  lines.push(...memory.sections.slice(0, 3).flat());

  const vault = parts.vaultFiles;
  const files = (vault?.files ?? []).slice(0, 12);
  if (files.length || vault?.actorFiltered) {
    lines.push(vault?.actorFiltered ? '### Project files in your accessible source scope' : '### Project files on record');
    for (const f of files) lines.push(formatVaultFileLine(f));
    /* The scope line before the how-to: what is missing from this list changes
       whether the reader should consult the tools at all. */
    if (vault) lines.push(`_${formatVaultScopeLine(vault)}_`);
    if (vault?.sourceAccessNotice) lines.push(`_${vault.sourceAccessNotice}_`);
    lines.push(
      '_Use list_project_documents for the full folder; read_project_document to study a file (all of it)._'
    );
  }

  const uploads = (parts.chatUploads?.uploads ?? []).slice(0, 8);
  if (uploads.length || parts.chatUploads?.actorFiltered) {
    /* A chat upload is reachable but has no vault row, so it carries no filed
       location and no comprehension record — saying only "these exist" would
       invite the same "I can't see it" answer the catalog exists to end. Each
       line carries the id that reopens it and the fact that filing is what
       gives it a durable record. */
    lines.push(parts.chatUploads?.actorFiltered ? '### Past chat files in your accessible source scope' : '### Files the client sent in past conversations');
    for (const u of uploads) {
      lines.push(
        `- **${clip(u.fileName, 90)}**${u.fileId ? ` (${u.fileId})` : ''} — attached earlier, not filed into the vault.`
      );
    }
    if (parts.chatUploads?.hasMore) {
      lines.push(
        `_More than these ${uploads.length} were attached — list_project_documents returns the rest._`
      );
    }
    if (parts.chatUploads?.actorFiltered) {
      lines.push(parts.chatUploads.total === undefined
        ? `_Showing ${uploads.length} chat file(s) from your accessible source scope; the scope total was not measured at this recall check._`
        : `_${parts.chatUploads.total} chat file(s) in your accessible source scope at this recall check._`);
      if (parts.chatUploads.sourceAccessNotice) lines.push(`_${parts.chatUploads.sourceAccessNotice}_`);
    }
    /* The retrieval corpus holds ONE bounded-prefix atom per chat upload, so
       "it is searchable" is true of its opening and false of the rest. Filing
       it runs the canonical vault ingest, which chunks and page-numbers all of
       it — the difference matters before she answers from a search. */
    lines.push(
      '_Only the OPENING of each is in the retrieval index. Reopen one with read_uploaded_document; ' +
        'file_chat_upload_to_vault files it and indexes all of it, page by page._'
    );
  }

  lines.push(...(memory.sections[3] ?? []));

  if (lines.length === 0) return '';
  return [SESSION_MEMORY_HEADING, ...lines].join('\n');
}

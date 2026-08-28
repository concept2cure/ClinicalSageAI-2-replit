/**
 * Citations — the storage contract, and how one becomes a number.
 *
 * ── The problem ─────────────────────────────────────────────────────────────
 * A CTD module is an argument built on sources: published literature, study
 * reports, prior submissions, the sponsor's own governed artifacts. The editor
 * had no citation of any kind. The ribbon's "Cite" control sent the selected
 * sentence to the assistant pane and created nothing; no in-text marker, no
 * stored link from a claim to the source that supports it, and no reference
 * list anywhere in the filed document.
 *
 * ── The one design rule ─────────────────────────────────────────────────────
 * A citation stores THE SOURCE'S IDENTITY AND NEVER ITS PRINTED NUMBER. "[3]"
 * is a rendering of where a source currently sits in this document's reference
 * list, not a name for it. Store the source id; derive the number from position
 * at render time. Then inserting a citation earlier in the document renumbers
 * everything after it correctly with nobody touching stored content — that is
 * the entire value of the feature, and it is the assertion the tests turn on.
 *
 * It is the same principle as the footnote marker being derived from position
 * (server/export/authoring-blocks-to-html.ts) and as a cross-reference storing
 * the target section's id rather than its number (./cross-references.ts). This
 * is the third instance of one shape, deliberately built to look like its two
 * siblings rather than to invent a new idiom.
 *
 * ── The stored form ─────────────────────────────────────────────────────────
 *     <a data-cite="<source id>" data-cite-locator="p. 42, Table 3">Smith 2019</a>
 *
 * `data-cite` is the source's identity in the platform's canonical source
 * registry (`cre_evidence_sources.id`, as text — the same identity the section→
 * source link in `authoring_citations` records under
 * source = 'cre_evidence_source'). No parallel store was invented for this.
 *
 * `data-cite-locator` is AUTHORED CONTENT, not a derived value: "p. 42" is
 * something a writer decided and no renderer can recompute. It is stored, and
 * it prints inside the marker — `[3, p. 42]`.
 *
 * The element's TEXT is a cache of the source's NAME. Note what it is not: it
 * is not the printed number. The cross-reference cache is the target's number
 * because a section's number is at least stable between renumberings; a
 * citation's number changes whenever ANY citation is inserted earlier in the
 * document, so caching it would churn the stored bytes of untouched sections
 * and would hand a plain-text consumer an authoritative-looking ordinal that is
 * wrong more often than right. The cache holds words instead, for the two
 * reasons a cache exists here at all:
 *   - the editor's round-trip fidelity gate compares stored text against parsed
 *     text, and a node contributing no text would drop every section holding a
 *     citation into raw source mode;
 *   - a consumer that knows nothing of citations (a plain-text extraction, a
 *     search index) sees the source's name rather than a gap.
 * Both governed renderers IGNORE it. A number is never printed from a cache.
 *
 * ── The failure state ───────────────────────────────────────────────────────
 * A citation whose source cannot be resolved — deleted, owned by another
 * tenant, or holding nothing printable — renders as CITATION_MISSING_TEXT, in
 * place, in the editor and in the filed document, and takes NO number and NO
 * reference-list entry. Never a plausible-looking wrong number; never silence.
 * The text names no identifier: an internal id is not something a filed
 * document may carry.
 */

/** Carries the source's identity. Its presence is what makes an `a` a citation. */
export const CITATION_SOURCE_ATTR = 'data-cite';
/** Carries the author's pinpoint within the source ("p. 42", "Table 3"). */
export const CITATION_LOCATOR_ATTR = 'data-cite-locator';

/**
 * What a source is, as far as a citation is concerned.
 *
 * Every field but `id` is optional and every field is a fact the source
 * registry already holds — nothing here is derived, inferred or invented. A
 * source that carries none of the printable fields has no name, and a citation
 * of it is UNRESOLVED rather than printed as an empty bracket.
 */
export interface CitationSource {
  /** `cre_evidence_sources.id`, as text. Never printed. */
  id: string;
  title?: string | null;
  /** The organization that issued the source. */
  sponsor?: string | null;
  /** Publication or document date; only its year is printed. */
  date?: string | null;
  /** The source's own identifier — NCT number, application number, DOI. */
  identifier?: string | null;
  /** The registry's source_type token. Printed only through KNOWN_SOURCE_TYPES. */
  sourceType?: string | null;
}

/** Resolves a source id against the sources available to the document being
 *  rendered. Returns null/undefined when the id names nothing available — the
 *  dangling case, which must be reported rather than papered over. */
export type CitationLookup = (sourceId: string) => CitationSource | null | undefined;

/**
 * What a citation prints when its source cannot be resolved.
 *
 * Deliberately not a number, not the editor's cached name, and not an
 * identifier. A reviewer reading a filed page must be able to see that a
 * citation could not be resolved; a medical writer must be able to find it.
 */
export const CITATION_MISSING_TEXT =
  '[Citation unresolved — the cited source is not available to this document]';

/** The heading the reference list is filed under, in both formats. */
export const REFERENCE_LIST_HEADING = 'References';

/**
 * Source-type tokens that have a reviewer-readable name.
 *
 * A token this map does not know is OMITTED from the reference entry rather
 * than printed. `fda_crl` is a column value in a database; it is not a phrase
 * that belongs in a document a government reviewer reads, and the entry still
 * identifies the source by title, sponsor, date and identifier without it.
 */
const KNOWN_SOURCE_TYPES: Record<string, string> = {
  csr: 'Clinical study report',
  protocol: 'Protocol',
  sap: 'Statistical analysis plan',
  publication: 'Publication',
  trial_registry: 'Trial registry record',
  fda_crl: 'FDA complete response letter',
  fda_review_memo: 'FDA review memorandum',
  fda_approval_package: 'FDA approval package',
  client_document: 'Sponsor document',
};

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

/** The four-digit year of a date the registry holds, or ''. Nothing is guessed
 *  from a value that does not begin with a year. */
function yearOf(date: string): string {
  const m = /^(\d{4})/.exec(date);
  return m ? m[1] : '';
}

/**
 * The source's short name — what the editor caches as the citation's text and
 * what a picker offers. Empty when the source has nothing printable, which is
 * the condition that makes a citation of it unresolved.
 */
export function citationSourceName(source: CitationSource): string {
  return clean(source.title) || clean(source.identifier);
}

/**
 * One reference-list entry, without its number.
 *
 * Assembled only from fields the registry holds. No house style is imposed
 * beyond ordering — the platform does not know whether this filing wants
 * Vancouver or AMA, and inventing author lists or journal abbreviations it does
 * not have would be fabrication on the one page a reviewer uses to check the
 * argument's foundations.
 */
export function citationReferenceText(source: CitationSource): string {
  const name = citationSourceName(source);
  if (!name) return '';
  const parts = [name];
  const sponsor = clean(source.sponsor);
  if (sponsor) parts.push(sponsor);
  const type = KNOWN_SOURCE_TYPES[clean(source.sourceType).toLowerCase()];
  if (type) parts.push(type);
  const year = yearOf(clean(source.date));
  if (year) parts.push(year);
  const identifier = clean(source.identifier);
  // Not repeated when it is already standing in as the name.
  if (identifier && identifier !== name) parts.push(identifier);
  return parts.join('. ') + '.';
}

/** The in-text marker. The number comes from the registry; the locator is the
 *  author's own pinpoint and is stored, so it is printed as written. */
export function citationMarkerText(number: number, locator?: string | null): string {
  const pin = clean(locator);
  return pin ? `[${number}, ${pin}]` : `[${number}]`;
}

/** Anchor id for a reference-list entry in exported HTML, and the fragment an
 *  in-text marker links to. Keyed on the SOURCE, not on the number: the number
 *  is a rendering and the link must survive renumbering. */
export function citationAnchorId(sourceId: string): string {
  return `cite-${String(sourceId).replace(/[^A-Za-z0-9_-]/g, '')}`;
}

/**
 * Word bookmark name for a reference-list entry.
 *
 * Word's rules: letters, digits and underscores only, must start with a letter,
 * at most 40 characters. Two sources must never collide onto one bookmark —
 * that would send a reviewer from one citation to another source's entry — so
 * anything that does not fit gets a hashed suffix rather than a truncation.
 * The same discipline, and the same hash, as crossReferenceBookmarkId.
 */
export function citationBookmarkId(sourceId: string): string {
  const raw = String(sourceId);
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, '');
  if (cleaned.length > 0 && cleaned.length <= 36) return `Cite_${cleaned}`;
  // FNV-1a, 32-bit, hex — deterministic and export-reproducible.
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `Cite_${cleaned.slice(0, 24)}_${h.toString(16).padStart(8, '0')}`;
}

export interface ResolvedCitation {
  /** True only when the source resolved AND had something to print. */
  found: boolean;
  source: CitationSource | null;
}

/**
 * Resolve one source id. The single entry point every consumer uses, so the
 * editor, the DOCX branch and the HTML/PDF branch cannot disagree about which
 * citations are broken.
 *
 * A source that exists but has neither a title nor an identifier counts as
 * UNRESOLVED: it has no printable name, and inventing one is the fabrication
 * this refuses.
 */
export function resolveCitation(
  sourceId: string | null | undefined,
  lookup: CitationLookup | null | undefined,
): ResolvedCitation {
  const id = clean(sourceId);
  const source = id && lookup ? lookup(id) ?? null : null;
  if (!source) return { found: false, source: null };
  if (!citationSourceName(source)) return { found: false, source };
  return { found: true, source };
}

/** One numbered entry of the assembled reference list. */
export interface CitationEntry {
  number: number;
  source: CitationSource;
  /** The entry line, without its number. */
  text: string;
}

/**
 * Assigns numbers to sources as they are first cited, and hands back the
 * reference list at the end.
 *
 * ── Why a registry and not a stored number ──────────────────────────────────
 * The number IS the position. It is computed here, in one pass over the
 * document in reading order, and never read from stored content. Insert a
 * citation in the first paragraph of the first section and every marker after
 * it moves by one, with no section's stored bytes changed and no revision
 * minted for a change nobody made to anyone's words.
 *
 * ── De-duplication ──────────────────────────────────────────────────────────
 * A source cited fifteen times has ONE number and ONE entry, exactly as the
 * footnote collector gives identical note text one letter. The registry is
 * keyed on the source's identity, so the fifteenth citation returns the number
 * the first one was given.
 *
 * ── Scope ───────────────────────────────────────────────────────────────────
 * ONE registry per exported DOCUMENT, not per section — a submission carries
 * one reference list, and two sections citing the same report must print the
 * same number. That is why it is threaded into both renderers by the caller,
 * for the same reason `footnoteSink` and `crossRefs` are: the answer belongs to
 * the document, and a renderer that invented it would be inventing part of a
 * filed record.
 *
 * ── The unresolved case ─────────────────────────────────────────────────────
 * An unresolved source CONSUMES NO NUMBER and gets NO entry. Numbering it would
 * put a gap in the reference list — "[4]" with no fourth entry — which is worse
 * than the missing citation it was trying to describe.
 */
export interface CitationRegistry {
  /** Number this citation, in reading order. */
  cite(sourceId: string | null | undefined): { found: true; number: number } | { found: false };
  /** The reference list: every source actually cited, once, in first-appearance
   *  order. A source nobody cited is not here, because it was never offered. */
  entries(): CitationEntry[];
}

export function makeCitationRegistry(
  lookup: CitationLookup | null | undefined,
): CitationRegistry {
  const numbered = new Map<string, CitationEntry>();
  return {
    cite(sourceId) {
      const id = clean(sourceId);
      if (!id) return { found: false };
      const hit = numbered.get(id);
      if (hit) return { found: true, number: hit.number };
      const resolved = resolveCitation(id, lookup);
      if (!resolved.found || !resolved.source) return { found: false };
      const entry: CitationEntry = {
        number: numbered.size + 1,
        source: resolved.source,
        text: citationReferenceText(resolved.source),
      };
      numbered.set(id, entry);
      return { found: true, number: entry.number };
    },
    entries() {
      return [...numbered.values()].sort((a, b) => a.number - b.number);
    },
  };
}

/** Build a lookup over the sources available to one document. */
export function citationLookupFor(
  sources: readonly CitationSource[],
): CitationLookup {
  const byId = new Map<string, CitationSource>();
  for (const s of sources) if (s && s.id != null) byId.set(String(s.id), s);
  return (sourceId: string) => byId.get(String(sourceId)) ?? null;
}

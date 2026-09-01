/**
 * What version of a document is this? — determined from observed evidence, or
 * explicitly recorded as undetermined.
 *
 * THE GAP (ledger L21). `cre_evidence_sources.version` has existed since the
 * spine migration and no ingest path has ever passed it. Every row carries
 * NULL, so "which version of the protocol does this fact rest on" has no
 * answer, and the `SourceRef.version` a finding renders is permanently blank.
 *
 * WHY THIS IS NOT `version = chainPosition + 1`. The column is TEXT and holds
 * the version the DOCUMENT DECLARES — "3.2", "Amendment 1" — not this system's
 * count of how many times a file with that name has been uploaded. Those are
 * different facts and they routinely disagree: a sponsor's first upload into a
 * new project is very often revision 4 of a protocol that lived in email for a
 * year. Writing `1` there would put a number in a provenance column that a
 * reader cannot tell apart from a version read off the title page, which is
 * strictly worse than the NULL it replaced. Same for a timestamp, and same for
 * the string "latest".
 *
 * So this module only ever reports a version it can point at the text of. When
 * it cannot, it says so — and saying so is itself recorded, because a bare NULL
 * conflates two different states:
 *
 *   no `versionDeclaration` in provenance  → nothing ever looked. (Every row
 *                                            written before this module, and
 *                                            every path that has no document to
 *                                            look at — see the note on the CSR
 *                                            and CRL ingests below.)
 *   `versionDeclaration.declared === false` → evidence WAS examined and the
 *                                            document declares no version.
 *
 * A reviewer asking "is this blank because the protocol is unversioned, or
 * because nobody checked" gets an answer from the row.
 *
 * DELIBERATELY NOT WIRED INTO THE CSR AND CRL INGESTS. Those adapt an already-
 * structured record; they are handed no document text and no filename, so there
 * is no evidence to examine and `declared: false` would overstate what happened.
 * A bare NULL — "no determination was made" — is the truthful state there.
 *
 * @module server/services/clinical-regulatory-evidence/source-version
 */

/** Which evidence the declaration was read from. */
export type VersionBasis = 'document_text_declaration' | 'filename_declaration';

/** Why no version was recorded, when evidence WAS examined. */
export type VersionUndeclaredReason =
  /** Nothing in the examined evidence declares a version. */
  | 'no_declaration_found'
  /** Two or more DIFFERENT versions are declared. Picking one would be a guess. */
  | 'ambiguous_declarations';

export type VersionEvidenceKind = 'document_text' | 'filename';

/** The provenance record. Shape is stable — it is written into a JSONB column
 *  that outlives this code, and read by anyone auditing a citation. */
export type VersionDeclaration =
  | {
      declared: true;
      version: string;
      basis: VersionBasis;
      /** The exact phrase the label was read from, so the derivation is
       *  checkable without re-running this code. */
      evidence: string;
      examined: VersionEvidenceKind[];
    }
  | {
      declared: false;
      version: null;
      basis: null;
      reason: VersionUndeclaredReason;
      /** Every distinct label seen, when the reason is ambiguity. A reviewer
       *  resolving it by hand needs to see what the conflict was. */
      candidates?: string[];
      examined: VersionEvidenceKind[];
    };

export interface SourceVersionDetermination {
  /** Goes straight into `cre_evidence_sources.version`. NULL unless a version
   *  was actually observed — never synthesised. */
  version: string | null;
  /** Goes into `provenance.versionDeclaration`. */
  declaration: VersionDeclaration;
}

/**
 * A version declaration in prose: an explicit keyword, then the label.
 *
 * The keyword is REQUIRED. Matching a bare dotted number would pull section
 * numbers, dates and dose strings out of a title page and record them as
 * versions.
 *
 * The trailing guard is `(?!\w)`, not `(?![\w.])`: a sentence-final
 * "…superseding Version 1.0." must still be SEEN, because it is the second
 * declaration that makes the document ambiguous. Not seeing it is how a
 * conflicted document gets recorded as confidently versioned.
 */
const TEXT_DECLARATION =
  /\b(?:version|revision|amendment)\b[ \t]*(?:no\.?|number|#)?[ \t]*:?[ \t]*v?(\d+(?:\.\d+){0,3}[a-z]?)(?!\w)/gi;

/**
 * The same, in a filename — plus the bare `v` prefix, which only ever means
 * "version" when a digit follows it immediately (`Protocol_v3.2.pdf`).
 *
 * The trailing `(?![a-z0-9])` is what makes this decline rather than guess:
 * `report_v2final.docx` has no clean label boundary, so it matches nothing
 * instead of recording "2".
 */
const FILENAME_DECLARATION =
  /(?:^|[^a-z0-9])(?:v|ver|version|rev|revision|amendment)[ _.\-]?(\d+(?:[._]\d+){0,3}[a-z]?)(?![a-z0-9])/gi;

/**
 * How much of the document to read.
 *
 * A version declaration lives on the title page. Scanning the whole body would
 * sweep up every "as defined in Version 1.0 of the SAP" cross-reference and turn
 * an answerable question into a permanent ambiguity.
 */
const TITLE_PAGE_CHARS = 4000;

/** `3_2` and `3.2` are the same label written two ways; `3.2` and `3.20` are not. */
function canonical(label: string): string {
  return label.replace(/_/g, '.').toLowerCase();
}

interface Hit { label: string; phrase: string }

function scan(text: string, re: RegExp): Hit[] {
  const hits: Hit[] = [];
  const rx = new RegExp(re.source, re.flags);
  for (let m = rx.exec(text); m !== null; m = rx.exec(text)) {
    hits.push({ label: m[1], phrase: m[0].trim() });
  }
  return hits;
}

/** One distinct label → that label. None, or more than one → nothing. */
function verdict(hits: Hit[]): { label: string; phrase: string } | 'none' | 'ambiguous' {
  if (hits.length === 0) return 'none';
  const distinct = new Map<string, Hit>();
  for (const h of hits) if (!distinct.has(canonical(h.label))) distinct.set(canonical(h.label), h);
  if (distinct.size > 1) return 'ambiguous';
  const only = [...distinct.values()][0];
  return { label: only.label, phrase: only.phrase };
}

function distinctLabels(hits: Hit[]): string[] {
  return [...new Set(hits.map((h) => canonical(h.label)))];
}

/**
 * Determine the version of a document from what is actually observable at
 * ingest.
 *
 * PRECEDENCE, and why it is not a guess: the document's own text outranks its
 * filename. A filename is whatever the person saving it typed; a version stated
 * on the title page is the document asserting its own identity. The rule is
 * fixed and the basis is recorded, so a reviewer can see which one was used
 * rather than having to reconstruct it.
 *
 * Ambiguity in the stronger evidence STOPS the determination — it does not fall
 * through to the weaker one. If a document declares two versions on its own
 * title page, resolving that from the filename is picking a winner, and this
 * function does not pick winners.
 */
export function determineSourceVersion(input: {
  /** Extracted document text, when extraction produced real content. Pass null
   *  when it did not — a filename placeholder is not document text. */
  documentText?: string | null;
  fileName?: string | null;
}): SourceVersionDetermination {
  const examined: VersionEvidenceKind[] = [];

  const text = (input.documentText ?? '').trim();
  if (text.length > 0) {
    examined.push('document_text');
    const hits = scan(text.slice(0, TITLE_PAGE_CHARS), TEXT_DECLARATION);
    const v = verdict(hits);
    if (v === 'ambiguous') {
      return {
        version: null,
        declaration: {
          declared: false, version: null, basis: null,
          reason: 'ambiguous_declarations', candidates: distinctLabels(hits), examined,
        },
      };
    }
    if (v !== 'none') {
      return {
        version: v.label,
        declaration: {
          declared: true, version: v.label,
          basis: 'document_text_declaration', evidence: v.phrase, examined,
        },
      };
    }
  }

  const name = (input.fileName ?? '').trim();
  if (name.length > 0) {
    examined.push('filename');
    const hits = scan(name, FILENAME_DECLARATION);
    const v = verdict(hits);
    if (v === 'ambiguous') {
      return {
        version: null,
        declaration: {
          declared: false, version: null, basis: null,
          reason: 'ambiguous_declarations', candidates: distinctLabels(hits), examined,
        },
      };
    }
    if (v !== 'none') {
      return {
        version: v.label,
        declaration: {
          declared: true, version: v.label,
          basis: 'filename_declaration', evidence: v.phrase, examined,
        },
      };
    }
  }

  return {
    version: null,
    declaration: {
      declared: false, version: null, basis: null,
      reason: 'no_declaration_found', examined,
    },
  };
}

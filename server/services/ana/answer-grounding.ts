/**
 * Answer grounding — the self-verification round of AnA's chat loop.
 *
 * The existing enforcement checks (checkEvidenceDiscipline, validateResponseStructure,
 * validateEvidence) audit the answer's *language*: whether claims carry evidence
 * labels and avoid overclaim phrasing. None of them compare the answer against the
 * tool output AnA actually gathered this turn.
 *
 * This module closes that gap deterministically — no extra model call. It pulls the
 * verifiable, specific claims out of the answer — registry/literature/submission
 * identifiers (trial ids: NCT/ISRCTN/EudraCT; literature: PMID/DOI; FDA submissions:
 * 510(k)/PMA/De Novo) and quoted source text — and checks each one against the
 * evidence corpus (the concatenated tool results). A claim that does not appear in
 * the evidence is flagged as unsupported — a direct fabrication signal. When no
 * tools ran, there is nothing to verify and the check is a no-op (ratio 1).
 *
 * The verdict is advisory: it is surfaced to the client, not used to block or rewrite
 * the answer.
 */

export interface UnsupportedClaim {
  kind:
    // Trial registries
    | 'nct'
    | 'isrctn'
    | 'eudract'
    // Literature identifiers
    | 'pmid'
    | 'doi'
    // FDA submission numbers
    | 'fda_510k'
    | 'fda_pma'
    | 'fda_denovo'
    // Quoted source text
    | 'quote';
  text: string;
}

export interface GroundingResult {
  /** Number of verifiable claims extracted and checked. */
  checked: number;
  /** How many were found in the evidence corpus. */
  grounded: number;
  /** Claims not found in the evidence. */
  unsupported: UnsupportedClaim[];
  /** grounded / checked; 1 when nothing was checkable. */
  ratio: number;
}

/** Normalize for tolerant substring matching: lowercase, punctuation → space. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

type IdKind = Exclude<UnsupportedClaim['kind'], 'quote'>;

// Whole-token identifiers. Each of these is a specific, registry-issued
// identifier that cannot be legitimately recalled — it must come from the tool
// evidence — so one that does not appear verbatim is a direct fabrication
// signal. The token itself is distinctive enough to match and check as-is:
//   - trial registries: US (NCT), UK/international (ISRCTN), EU (EudraCT)
//   - literature: DOI
//   - FDA submissions: 510(k) K######, PMA P######, De Novo DEN######
//     (an invented predicate-device number is the classic medtech fabrication)
const TOKEN_ID_PATTERNS: ReadonlyArray<{ kind: IdKind; re: RegExp }> = [
  { kind: 'nct', re: /NCT\d{8}/gi },
  { kind: 'isrctn', re: /ISRCTN\d{8}/gi },
  { kind: 'eudract', re: /\b\d{4}-\d{6}-\d{2}\b/g },
  { kind: 'doi', re: /\b10\.\d{4,9}\/[^\s"”'<>)\]]+/gi },
  { kind: 'fda_510k', re: /\bK\d{6}\b/g },
  { kind: 'fda_pma', re: /\bP\d{6}\b/g },
  { kind: 'fda_denovo', re: /\bDEN\d{6}\b/gi },
];

// Labeled-number identifiers. The bare number is not distinctive on its own, so
// it is extracted only when it carries its label, then the number is checked
// against the evidence (a literature tool returns the PMID in its result).
const LABELED_ID_PATTERNS: ReadonlyArray<{ kind: IdKind; re: RegExp }> = [
  { kind: 'pmid', re: /\bPMID:?\s*(\d{7,8})\b/gi },
];

// Trailing sentence punctuation captured alongside a token (notably on a DOI at
// the end of a sentence) — trimmed before the verbatim check so "…/jama.2020.1."
// grounds against the same DOI in the evidence.
const TRAILING_PUNCT_RE = /[.,;:]+$/;

// Double-quoted spans (straight or smart quotes), 20–200 chars of inner text.
const QUOTE_RE = /["“]([^"”\n]{20,200})["”]/g;

/**
 * Verify that the specific, checkable claims in `answer` appear in `evidence`
 * (the tool output gathered this turn). Returns a no-op result when either side
 * is empty — absence of tools means there is nothing to ground against.
 */
export function verifyAnswerGrounding(answer: string, evidence: string): GroundingResult {
  const result: GroundingResult = { checked: 0, grounded: 0, unsupported: [], ratio: 1 };
  if (!answer || !evidence || !evidence.trim()) return result;

  const evidenceUpper = evidence.toUpperCase();
  const evidenceNorm = norm(evidence);

  // Registry / literature / submission identifiers — a classic fabrication.
  // Each must appear verbatim in the evidence. De-duped across kinds so the same
  // id is only counted once. The reported text keeps its original form; the
  // match is case-insensitive (compare uppercased on both sides).
  const seenIds = new Set<string>();
  const checkId = (kind: IdKind, captured: string): void => {
    const text = captured.replace(TRAILING_PUNCT_RE, '');
    if (!text) return;
    const idUpper = text.toUpperCase();
    const key = `${kind}:${idUpper}`;
    if (seenIds.has(key)) return;
    seenIds.add(key);
    result.checked++;
    if (evidenceUpper.includes(idUpper)) result.grounded++;
    else result.unsupported.push({ kind, text });
  };
  for (const { kind, re } of TOKEN_ID_PATTERNS) {
    re.lastIndex = 0;
    for (const raw of answer.match(re) || []) checkId(kind, raw);
  }
  for (const { kind, re } of LABELED_ID_PATTERNS) {
    re.lastIndex = 0;
    let lm: RegExpExecArray | null;
    while ((lm = re.exec(answer)) !== null) checkId(kind, lm[1]);
  }

  // Quoted source text — if AnA quotes the document, the quote should be in the
  // evidence. Skip short or label-like quotes to avoid false positives.
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  QUOTE_RE.lastIndex = 0;
  while ((m = QUOTE_RE.exec(answer)) !== null) {
    const raw = m[1].trim();
    const q = norm(raw);
    if (q.length < 12 || !q.includes(' ')) continue; // too short / single token
    if (seen.has(q)) continue;
    seen.add(q);
    result.checked++;
    if (evidenceNorm.includes(q)) result.grounded++;
    else result.unsupported.push({ kind: 'quote', text: raw.length > 80 ? raw.slice(0, 79) + '…' : raw });
  }

  result.ratio = result.checked === 0 ? 1 : result.grounded / result.checked;
  return result;
}

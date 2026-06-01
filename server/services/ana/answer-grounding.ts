/**
 * Answer grounding — the self-verification round of AnA's chat loop.
 *
 * The existing enforcement checks (checkEvidenceDiscipline, validateResponseStructure,
 * validateEvidence) audit the answer's *language*: whether claims carry evidence
 * labels and avoid overclaim phrasing. None of them compare the answer against the
 * tool output AnA actually gathered this turn.
 *
 * This module closes that gap deterministically — no extra model call. It pulls the
 * verifiable, specific claims out of the answer (trial identifiers and quoted source
 * text) and checks each one against the evidence corpus (the concatenated tool
 * results). A claim that does not appear in the evidence is flagged as unsupported —
 * a direct fabrication signal. When no tools ran, there is nothing to verify and the
 * check is a no-op (ratio 1).
 *
 * The verdict is advisory: it is surfaced to the client, not used to block or rewrite
 * the answer.
 */

export interface UnsupportedClaim {
  kind: 'nct' | 'quote';
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

const NCT_RE = /NCT\d{8}/gi;
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

  // Trial identifiers — a classic fabrication. Must appear verbatim.
  const ncts = new Set((answer.match(NCT_RE) || []).map(s => s.toUpperCase()));
  for (const nct of ncts) {
    result.checked++;
    if (evidenceUpper.includes(nct)) result.grounded++;
    else result.unsupported.push({ kind: 'nct', text: nct });
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

/**
 * CSR Intelligence Library — deterministic extraction of structured fields from
 * clinical study report text.
 *
 * This replaces the former stub with a real, deterministic implementation. It is
 * pure (no network, no LLM, no randomness): given the same text it always
 * returns the same entities, which makes extraction reproducible and testable.
 *
 * Honesty contract: it only reports what it can find in the text. Every field is
 * nullable and absent when not present. It never guesses a sample size, a
 * p-value, or a design it did not read. Each extracted entity carries the
 * verbatim source span so a human can verify it.
 *
 * Scope: this is pattern-based extraction suitable for grounding and triage —
 * not a substitute for a curated CSR knowledge base. It is intentionally
 * conservative (precision over recall).
 */

export type CsrEntityType =
  | 'sample_size'
  | 'phase'
  | 'p_value'
  | 'endpoint'
  | 'design'
  | 'randomization'
  | 'blinding'
  | 'duration';

export interface CsrEntity {
  type: CsrEntityType;
  /** Normalized value (number for sample_size/p_value, string otherwise). */
  value: string | number;
  /** The verbatim text span the value was extracted from, for verification. */
  evidence: string;
}

export interface CsrExtraction {
  entities: CsrEntity[];
  sampleSize: number | null;
  phase: string | null;
  pValues: number[];
  design: string | null;
  randomization: string | null;
  blinding: string | null;
  durationWeeks: number | null;
}

export interface CsrValidationIssue {
  severity: 'error' | 'warning' | 'info';
  section: string;
  message: string;
}

export interface CsrValidationResult {
  valid: boolean;
  /** ICH E3 sections present / missing among the canonical expected set. */
  presentSections: string[];
  missingSections: string[];
  issues: CsrValidationIssue[];
  recommendations: string[];
}

const WEEKS_PER_MONTH = 4.345;
const WEEKS_PER_YEAR = 52;

/** Canonical top-level ICH E3 section titles a complete CSR is expected to carry. */
const ICH_E3_SECTIONS = [
  'synopsis',
  'introduction',
  'study objectives',
  'investigational plan',
  'study patients',
  'efficacy evaluation',
  'safety evaluation',
  'discussion',
  'conclusions',
];

function firstMatch(text: string, re: RegExp): RegExpMatchArray | null {
  re.lastIndex = 0;
  return re.exec(text);
}

function extractSampleSize(text: string): { value: number; evidence: string } | null {
  // "sample size of 450", "N = 450", "450 patients/subjects were randomized/enrolled"
  const patterns: RegExp[] = [
    /sample\s+size\s+of\s+(\d{2,6})/i,
    /\bN\s*=\s*(\d{2,6})/i,
    /(\d{2,6})\s+(?:patients|subjects|participants)\s+were\s+(?:randomi[sz]ed|enrolled|included)/i,
    /(?:randomi[sz]ed|enrolled)\s+(\d{2,6})\s+(?:patients|subjects|participants)/i,
  ];
  for (const re of patterns) {
    const m = firstMatch(text, re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return { value: n, evidence: m[0] };
    }
  }
  return null;
}

function extractPhase(text: string): { value: string; evidence: string } | null {
  const m = firstMatch(text, /phase\s+(?:I{1,3}V?|[1-4])(?:\s*[/-]\s*(?:I{1,3}V?|[1-4]))?/i);
  if (!m) return null;
  const roman: Record<string, string> = { I: '1', II: '2', III: '3', IV: '4' };
  const normalized = m[0]
    .replace(/phase\s+/i, 'Phase ')
    .replace(/\b(IV|III|II|I)\b/g, r => roman[r] ?? r);
  return { value: normalized, evidence: m[0] };
}

function extractPValues(text: string): Array<{ value: number; evidence: string }> {
  const out: Array<{ value: number; evidence: string }> = [];
  const re = /p\s*(?:<|=|≤|<=)\s*(0?\.\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = Number(m[1]);
    if (Number.isFinite(v) && v >= 0 && v <= 1) out.push({ value: v, evidence: m[0] });
  }
  return out;
}

function extractDesign(text: string): { value: string; evidence: string } | null {
  const m = firstMatch(
    text,
    /(randomi[sz]ed[,\s]+(?:double|single|triple)?\s*[- ]?blind(?:ed)?[,\s]+(?:placebo[- ]controlled|active[- ]controlled)?(?:\s*,?\s*parallel(?:[- ]group)?)?)/i
  );
  if (m) return { value: m[0].replace(/\s+/g, ' ').trim(), evidence: m[0] };
  const m2 = firstMatch(text, /(crossover|parallel[- ]group|dose[- ]escalation|adaptive)\s+design/i);
  if (m2) return { value: m2[0].trim(), evidence: m2[0] };
  return null;
}

function extractRandomization(text: string): { value: string; evidence: string } | null {
  const m = firstMatch(text, /randomi[sz]ed\s+(?:in\s+a\s+)?(\d+\s*:\s*\d+)\s*(?:ratio|allocation)?/i);
  if (m) return { value: m[1].replace(/\s/g, ''), evidence: m[0] };
  if (/randomi[sz]ed/i.test(text)) {
    const m2 = firstMatch(text, /randomi[sz]ed/i);
    if (m2) return { value: 'randomized', evidence: m2[0] };
  }
  return null;
}

function extractBlinding(text: string): { value: string; evidence: string } | null {
  const m = firstMatch(text, /(double|single|triple)[- ]blind(?:ed)?/i);
  if (m) return { value: `${m[1].toLowerCase()}-blind`, evidence: m[0] };
  if (/open[- ]label/i.test(text)) {
    const m2 = firstMatch(text, /open[- ]label/i);
    if (m2) return { value: 'open-label', evidence: m2[0] };
  }
  return null;
}

function extractDurationWeeks(text: string): { value: number; evidence: string } | null {
  const m = firstMatch(text, /(\d{1,3})\s*[- ]?(week|month|year)s?\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  const weeks =
    unit === 'week' ? n : unit === 'month' ? Math.round(n * WEEKS_PER_MONTH) : n * WEEKS_PER_YEAR;
  return { value: weeks, evidence: m[0] };
}

/**
 * Extract structured entities from CSR text. Deterministic and conservative —
 * returns only what the patterns positively match.
 */
export function extractCsrEntities(text: string): CsrExtraction {
  const empty: CsrExtraction = {
    entities: [],
    sampleSize: null,
    phase: null,
    pValues: [],
    design: null,
    randomization: null,
    blinding: null,
    durationWeeks: null,
  };
  if (!text || typeof text !== 'string') return empty;

  const entities: CsrEntity[] = [];
  const result: CsrExtraction = { ...empty, entities };

  const ss = extractSampleSize(text);
  if (ss) {
    result.sampleSize = ss.value;
    entities.push({ type: 'sample_size', value: ss.value, evidence: ss.evidence });
  }

  const phase = extractPhase(text);
  if (phase) {
    result.phase = phase.value;
    entities.push({ type: 'phase', value: phase.value, evidence: phase.evidence });
  }

  const ps = extractPValues(text);
  for (const p of ps) {
    result.pValues.push(p.value);
    entities.push({ type: 'p_value', value: p.value, evidence: p.evidence });
  }

  const design = extractDesign(text);
  if (design) {
    result.design = design.value;
    entities.push({ type: 'design', value: design.value, evidence: design.evidence });
  }

  const rand = extractRandomization(text);
  if (rand) {
    result.randomization = rand.value;
    entities.push({ type: 'randomization', value: rand.value, evidence: rand.evidence });
  }

  const blind = extractBlinding(text);
  if (blind) {
    result.blinding = blind.value;
    entities.push({ type: 'blinding', value: blind.value, evidence: blind.evidence });
  }

  const dur = extractDurationWeeks(text);
  if (dur) {
    result.durationWeeks = dur.value;
    entities.push({ type: 'duration', value: dur.value, evidence: dur.evidence });
  }

  return result;
}

/**
 * Validate CSR text against the canonical ICH E3 top-level section set. Reports
 * which expected sections are present/missing — it does not judge content
 * quality, only structural completeness.
 */
export function validateCsrStructure(text: string): CsrValidationResult {
  const lower = (text ?? '').toLowerCase();
  const present: string[] = [];
  const missing: string[] = [];
  for (const section of ICH_E3_SECTIONS) {
    if (lower.includes(section)) present.push(section);
    else missing.push(section);
  }

  const issues: CsrValidationIssue[] = missing.map(section => ({
    severity: 'warning',
    section,
    message: `Expected ICH E3 section not found: "${section}".`,
  }));

  const recommendations: string[] = [];
  if (missing.length > 0) {
    recommendations.push(
      `Add or label the ${missing.length} missing ICH E3 section(s) so the report is structurally complete.`
    );
  }

  return {
    valid: missing.length === 0,
    presentSections: present,
    missingSections: missing,
    issues,
    recommendations,
  };
}

/**
 * Library object — preserves the historical method names (processContent,
 * extractEntities, validate) so any caller of the old stub keeps working, now
 * backed by real deterministic extraction.
 */
export const csrIntelligenceLibrary = {
  async processContent(
    _extractedContent: unknown,
    processedText: string,
    _options: Record<string, unknown> = {}
  ): Promise<{
    success: boolean;
    message: string;
    extraction: CsrExtraction;
    entities: CsrEntity[];
    insights: string[];
  }> {
    const extraction = extractCsrEntities(processedText ?? '');
    const insights: string[] = [];
    if (extraction.sampleSize !== null)
      insights.push(`Sample size detected: ${extraction.sampleSize}.`);
    if (extraction.phase) insights.push(`Phase detected: ${extraction.phase}.`);
    if (extraction.pValues.length)
      insights.push(`${extraction.pValues.length} reported p-value(s) detected.`);
    return {
      success: extraction.entities.length > 0,
      message:
        extraction.entities.length > 0
          ? `Extracted ${extraction.entities.length} entit${extraction.entities.length === 1 ? 'y' : 'ies'}.`
          : 'No structured entities found in the provided text.',
      extraction,
      entities: extraction.entities,
      insights,
    };
  },

  async extractEntities(
    text: string,
    _options: Record<string, unknown> = {}
  ): Promise<{ entities: CsrEntity[]; summary: CsrExtraction }> {
    const extraction = extractCsrEntities(text ?? '');
    return { entities: extraction.entities, summary: extraction };
  },

  async validate(
    content: string,
    _guidelines: Record<string, unknown> = {}
  ): Promise<CsrValidationResult> {
    return validateCsrStructure(content ?? '');
  },
};

export default csrIntelligenceLibrary;

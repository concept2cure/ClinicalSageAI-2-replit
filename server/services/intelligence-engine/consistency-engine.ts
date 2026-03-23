/**
 * Module 2 — Cross-Section Consistency Engine
 *
 * Extracts key assertions from document sections and compares them
 * for contradictions, divergences, and summary mismatches.
 * Deterministic: pattern matching + normalized comparison.
 */

import type {
  SectionAssertion,
  InconsistencyFlag,
  ConsistencyReport,
} from './types';

// ─── Assertion Extraction Patterns ───────────────────────────────────────────

/** Patterns that indicate an assertion is being made */
const ASSERTION_PATTERNS = [
  /(?:the\s+)?(?:primary|secondary|key)\s+(?:endpoint|outcome|finding|result)\s+(?:is|was|showed|demonstrated)\s+(.{10,120})/gi,
  /(?:results?\s+)?(?:show(?:ed)?|demonstrat(?:e[ds]?|ing)|indicat(?:e[ds]?|ing)|confirm(?:ed|s)?|reveal(?:ed|s)?)\s+(?:that\s+)?(.{10,120})/gi,
  /(?:the\s+)?(?:study|trial|analysis|assessment|data)\s+(?:found|concluded|established|showed)\s+(?:that\s+)?(.{10,120})/gi,
  /(?:safety|efficacy|tolerability)\s+(?:was|were|is)\s+(.{10,80})/gi,
  /(?:adverse\s+events?|AEs?)\s+(?:were|was|included?|occurred)\s+(.{10,100})/gi,
  /(?:incidence|rate|frequency)\s+(?:of\s+)?(?:\w+\s+){0,3}(?:was|were|is)\s+(.{5,80})/gi,
  /(?:no|significant|meaningful)\s+(?:difference|change|improvement|decline)\s+(?:was\s+)?(?:observed|noted|found|detected)\s+(.{0,80})/gi,
  /(?:the\s+)?(?:median|mean|overall)\s+(?:PFS|OS|DFS|survival|response\s+rate|ORR)\s+(?:was|were|is)\s+(.{5,80})/gi,
];

/** Numerical value extraction for direct comparison */
const NUMERIC_ASSERTION_PATTERN =
  /(\b(?:median|mean|overall|primary|secondary)\b[^.]{0,40}?)(\d+\.?\d*)\s*(%|mg|kg|months?|weeks?|days?|years?|mm|cm)/gi;

// ─── Normalization ───────────────────────────────────────────────────────────

/**
 * Normalize assertion text for comparison.
 * Lowercases, strips extra whitespace, removes filler words.
 */
function normalizeAssertion(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b(the|a|an|this|that|these|those|was|were|is|are|has|have|had)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract numeric values with their context for direct comparison.
 */
function extractNumericFacts(text: string): Array<{ context: string; value: number; unit: string }> {
  const facts: Array<{ context: string; value: number; unit: string }> = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(NUMERIC_ASSERTION_PATTERN.source, 'gi');

  while ((match = regex.exec(text)) !== null) {
    facts.push({
      context: normalizeAssertion(match[1]),
      value: parseFloat(match[2]),
      unit: match[3].toLowerCase(),
    });
  }

  return facts;
}

// ─── Core Engine ─────────────────────────────────────────────────────────────

/**
 * Extract assertions from a single section.
 */
export function extractAssertions(
  sectionId: string,
  sectionName: string,
  content: string
): SectionAssertion[] {
  const assertions: SectionAssertion[] = [];
  const seen = new Set<string>();

  for (const pattern of ASSERTION_PATTERNS) {
    // Reset lastIndex for global regex
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const fullMatch = match[0].trim();
      const normalized = normalizeAssertion(fullMatch);

      // Deduplicate within section
      if (normalized.length > 10 && !seen.has(normalized)) {
        seen.add(normalized);
        assertions.push({
          sectionId,
          sectionName,
          assertion: fullMatch.slice(0, 300),
          normalized,
        });
      }
    }
  }

  return assertions;
}

/**
 * Compare two assertions for inconsistency.
 * Returns null if no inconsistency detected.
 */
function compareAssertions(
  a: SectionAssertion,
  b: SectionAssertion
): InconsistencyFlag | null {
  if (a.sectionId === b.sectionId) return null;

  // Check for numerical contradictions in same-context facts
  const factsA = extractNumericFacts(a.assertion);
  const factsB = extractNumericFacts(b.assertion);

  for (const fa of factsA) {
    for (const fb of factsB) {
      // Same context but different values
      if (
        fa.unit === fb.unit &&
        fa.context.length > 5 &&
        fb.context.length > 5 &&
        similarContext(fa.context, fb.context) &&
        fa.value !== fb.value
      ) {
        const diff = Math.abs(fa.value - fb.value);
        const avgVal = (Math.abs(fa.value) + Math.abs(fb.value)) / 2 || 1;
        const percentDiff = (diff / avgVal) * 100;

        if (percentDiff > 5) {
          return {
            assertionA: a,
            assertionB: b,
            type: percentDiff > 20 ? 'contradiction' : 'divergence',
            severity: percentDiff > 20 ? 'high' : 'medium',
            description: `Numeric discrepancy: "${fa.context}" is ${fa.value}${fa.unit} in ${a.sectionName} but ${fb.value}${fb.unit} in ${b.sectionName} (${percentDiff.toFixed(1)}% difference)`,
          };
        }
      }
    }
  }

  // Check for semantic contradictions via negation patterns
  const contradictionPairs = [
    [/\bno\s+significant\b/i, /\bsignificant\b/i],
    [/\bnot?\s+(?:observed|detected|found)\b/i, /\b(?:observed|detected|found)\b/i],
    [/\bsuperior\b/i, /\bnon[- ]?inferior\b/i],
    [/\bno\s+(?:difference|change)\b/i, /\b(?:significant|meaningful)\s+(?:difference|change)\b/i],
    [/\bwell[- ]tolerated\b/i, /\bsafety\s+concern/i],
    [/\bdecreas(?:e[ds]?|ing)\b/i, /\bincreas(?:e[ds]?|ing)\b/i],
  ] as const;

  for (const [patternNeg, patternPos] of contradictionPairs) {
    const aHasNeg = patternNeg.test(a.assertion);
    const bHasPos = patternPos.test(b.assertion) && !patternNeg.test(b.assertion);
    const aHasPos = patternPos.test(a.assertion) && !patternNeg.test(a.assertion);
    const bHasNeg = patternNeg.test(b.assertion);

    // Same topic context check
    if ((aHasNeg && bHasPos) || (aHasPos && bHasNeg)) {
      if (topicOverlap(a.normalized, b.normalized)) {
        return {
          assertionA: a,
          assertionB: b,
          type: 'contradiction',
          severity: 'high',
          description: `Contradictory statements between ${a.sectionName} and ${b.sectionName}: "${a.assertion.slice(0, 100)}" vs "${b.assertion.slice(0, 100)}"`,
        };
      }
    }
  }

  return null;
}

/**
 * Check if two contexts refer to the same metric/topic.
 */
function similarContext(a: string, b: string): boolean {
  const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2));
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  const smaller = Math.min(wordsA.size, wordsB.size) || 1;
  return overlap / smaller > 0.4;
}

/**
 * Check if two normalized assertions share enough topic words.
 */
function topicOverlap(a: string, b: string): boolean {
  const topicWords = new Set([
    'efficacy', 'safety', 'survival', 'response', 'endpoint',
    'adverse', 'event', 'pfs', 'os', 'orr', 'dose', 'treatment',
    'tolerability', 'mortality', 'morbidity', 'incidence', 'rate',
    'primary', 'secondary', 'outcome',
  ]);

  const wordsA = a.split(' ').filter(w => topicWords.has(w));
  const wordsB = b.split(' ').filter(w => topicWords.has(w));

  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const setA = new Set(wordsA);
  return wordsB.some(w => setA.has(w));
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface DocumentSection {
  id: string;
  name: string;
  content: string;
}

/**
 * Analyze multiple sections for cross-section consistency.
 * Returns all detected inconsistencies with severity ratings.
 */
export function analyzeConsistency(sections: DocumentSection[]): ConsistencyReport {
  // Step 1: Extract assertions from each section
  const allAssertions: SectionAssertion[] = [];
  for (const section of sections) {
    const sectionAssertions = extractAssertions(section.id, section.name, section.content);
    allAssertions.push(...sectionAssertions);
  }

  // Step 2: Cross-compare all assertion pairs
  const inconsistencies: InconsistencyFlag[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < allAssertions.length; i++) {
    for (let j = i + 1; j < allAssertions.length; j++) {
      const flag = compareAssertions(allAssertions[i], allAssertions[j]);
      if (flag) {
        // Deduplicate by section pair + type
        const key = `${flag.assertionA.sectionId}:${flag.assertionB.sectionId}:${flag.type}:${flag.description.slice(0, 50)}`;
        if (!seen.has(key)) {
          seen.add(key);
          inconsistencies.push(flag);
        }
      }
    }
  }

  // Step 3: Calculate consistency score
  const totalComparisons = Math.max(
    (allAssertions.length * (allAssertions.length - 1)) / 2,
    1
  );
  const highSeverityCount = inconsistencies.filter(i => i.severity === 'high').length;
  const mediumSeverityCount = inconsistencies.filter(i => i.severity === 'medium').length;

  // Weighted penalty: high = 10 points, medium = 5 points, low = 2 points
  const penalty = highSeverityCount * 10 + mediumSeverityCount * 5;
  const consistencyScore = Math.max(0, Math.min(100, 100 - penalty));

  return {
    assertions: allAssertions,
    inconsistencies,
    consistencyScore,
  };
}

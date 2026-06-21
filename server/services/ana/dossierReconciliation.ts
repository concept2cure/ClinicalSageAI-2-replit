/**
 * Dossier numerical reconciliation — flags the same labeled figure disagreeing
 * across documents/modules of a submission (e.g. enrolled N in the protocol vs
 * the CSR vs Module 2.7.3). This is a recurring reviewer finding and the
 * per-document `check_numerical_integrity` cannot see it because it only looks
 * within one artifact.
 *
 * Conservative by design: it extracts only figures that appear next to a curated
 * regulatory label (high precision, few false positives) and reports a
 * discrepancy when one label resolves to more than one distinct value across the
 * supplied documents. Deterministic — no model, no network.
 *
 * @module server/services/ana/dossierReconciliation
 */

export interface DossierDocument {
  /** Stable identifier (artifact id, module code, file name). */
  id: string;
  /** Optional human title for reporting. */
  title?: string;
  /** Plain-text content to scan. */
  text: string;
}

export interface ExtractedFact {
  docId: string;
  docTitle?: string;
  /** Normalized label key, e.g. 'enrolled_n', 'alpha', 'hazard_ratio'. */
  label: string;
  /** Normalized numeric value (counts as integers; rates/probabilities as fractions). */
  value: number;
  /** The matched text window, for traceability. */
  snippet: string;
}

export interface ReconciliationDiscrepancy {
  label: string;
  /** The distinct values found (rounded for comparison), ascending. */
  distinctValues: number[];
  /** Every place the label was found, so a reviewer can click through. */
  occurrences: Array<{ docId: string; docTitle?: string; value: number; snippet: string }>;
}

export interface ReconciliationResult {
  documentsChecked: number;
  factsExtracted: number;
  /** Labels that resolved to >1 distinct value across documents. */
  discrepancies: ReconciliationDiscrepancy[];
  /** Labels that were consistent everywhere they appeared (for assurance). */
  consistentLabels: string[];
  facts: ExtractedFact[];
}

interface LabelPattern {
  label: string;
  regex: RegExp;
  /** Transform the captured string into a normalized number. */
  normalize: (raw: string, full: string) => number | null;
  /** Round for cross-document equality comparison. */
  compareDp: number;
}

const toInt = (raw: string): number | null => {
  const n = Number(raw.replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const toFrac = (raw: string): number | null => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/**
 * Curated, high-precision label lexicon. Each pattern must place the captured
 * number immediately beside an unambiguous regulatory label so prose figures
 * are not swept up. Patterns are case-insensitive and global.
 */
const LABEL_PATTERNS: LabelPattern[] = [
  {
    label: 'enrolled_n',
    regex: /(?:enroll(?:ed|ment of)|randomi[sz]ed|accrued)\s+(?:a\s+total\s+of\s+)?([\d,]{1,9})\s+(?:patients|subjects|participants)/gi,
    normalize: toInt,
    compareDp: 0,
  },
  {
    label: 'sample_size_n',
    regex: /(?:sample\s+size|target\s+(?:enrol+ment|N)|total\s+N)\s*(?:of|=|:|\bis\b)?\s*([\d,]{1,9})\b/gi,
    normalize: toInt,
    compareDp: 0,
  },
  {
    label: 'sites',
    regex: /([\d,]{1,6})\s+(?:investigational\s+)?(?:sites|centers|centres)\b/gi,
    normalize: toInt,
    compareDp: 0,
  },
  {
    label: 'events',
    regex: /([\d,]{1,7})\s+(?:primary\s+)?(?:events|deaths)\b/gi,
    normalize: toInt,
    compareDp: 0,
  },
  {
    label: 'alpha',
    regex: /(?:alpha|type\s*I\s*error(?:\s*rate)?|significance\s+level)\s*(?:of|=|:|\bis\b)?\s*(0?\.\d{1,4})/gi,
    normalize: toFrac,
    compareDp: 4,
  },
  {
    label: 'power',
    regex: /power\s*(?:of|=|:|\bis\b)?\s*((?:0?\.\d{1,4})|(?:\d{1,3})\s*%)/gi,
    normalize: (raw: string) => {
      const pct = /%/.test(raw);
      const n = Number(raw.replace(/[%\s]/g, ''));
      if (!Number.isFinite(n)) return null;
      return pct ? n / 100 : n > 1 ? n / 100 : n;
    },
    compareDp: 3,
  },
  {
    label: 'hazard_ratio',
    regex: /(?:hazard\s+ratio|\bHR\b)\s*(?:of|=|:|\bwas\b|\bis\b)?\s*(\d?\.\d{1,4})/gi,
    normalize: toFrac,
    compareDp: 3,
  },
  {
    label: 'primary_p_value',
    regex: /\bp\s*(?:-?\s*value)?\s*[=<]\s*(0?\.\d{1,5})/gi,
    normalize: toFrac,
    compareDp: 5,
  },
];

/** Round to dp decimal places for stable equality comparison. */
function roundDp(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Scan a set of documents for labeled figures and report any label that
 * disagrees across documents. Deterministic.
 */
export function reconcileDossierNumbers(
  documents: DossierDocument[],
): ReconciliationResult {
  if (!Array.isArray(documents)) {
    throw new Error('documents must be an array of { id, text }');
  }
  const facts: ExtractedFact[] = [];

  for (const doc of documents) {
    if (!doc || typeof doc.id !== 'string' || typeof doc.text !== 'string') {
      throw new Error('each document must have a string id and string text');
    }
    for (const pat of LABEL_PATTERNS) {
      pat.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pat.regex.exec(doc.text)) !== null) {
        const value = pat.normalize(m[1], m[0]);
        if (value === null) continue;
        const start = Math.max(0, m.index - 12);
        const snippet = doc.text.slice(start, m.index + m[0].length + 8).replace(/\s+/g, ' ').trim();
        facts.push({ docId: doc.id, docTitle: doc.title, label: pat.label, value, snippet });
      }
    }
  }

  // Group by label and detect cross-document divergence.
  const byLabel = new Map<string, ExtractedFact[]>();
  const dpByLabel = new Map(LABEL_PATTERNS.map(p => [p.label, p.compareDp]));
  for (const f of facts) {
    const arr = byLabel.get(f.label) ?? [];
    arr.push(f);
    byLabel.set(f.label, arr);
  }

  const discrepancies: ReconciliationDiscrepancy[] = [];
  const consistentLabels: string[] = [];
  for (const [label, group] of byLabel) {
    const dp = dpByLabel.get(label) ?? 4;
    const distinct = Array.from(new Set(group.map(g => roundDp(g.value, dp)))).sort((a, b) => a - b);
    if (distinct.length > 1) {
      discrepancies.push({
        label,
        distinctValues: distinct,
        occurrences: group.map(g => ({ docId: g.docId, docTitle: g.docTitle, value: g.value, snippet: g.snippet })),
      });
    } else if (group.length > 0) {
      consistentLabels.push(label);
    }
  }

  discrepancies.sort((a, b) => a.label.localeCompare(b.label));
  consistentLabels.sort();

  return {
    documentsChecked: documents.length,
    factsExtracted: facts.length,
    discrepancies,
    consistentLabels,
    facts,
  };
}

/**
 * Tests for safetyNarrativeBatch — the pure orchestration core of E5 (guided
 * ICH E3 §16 safety-narrative batch authoring + QC).
 *
 * Covers the deterministic logic the predecessor's checkpoint left untested:
 *   - line-listing parser (CSV / TSV / JSON; valid, malformed, empty rows),
 *   - required_strings derivation from case facts,
 *   - the QC verdict (missing required fields + honesty guard: a sample or
 *     still-incomplete narrative is flagged NON-SEALABLE),
 *   - server-missing-fields reconciliation,
 *   - chat-message composition that drives the draft → author → verify chain.
 *
 * Plain assertions, no DOM (this module is UI-free) — matching the sibling
 * unit tests in this directory.
 */

import { describe, it, expect } from 'vitest';
import {
  SAFETY_NARRATIVE_TOOLS,
  REQUIRED_NARRATIVE_FIELDS,
  computeNarrativeQc,
  applyServerMissingFields,
  deriveRequiredStrings,
  detectFormat,
  parseLineListing,
  composeSingleNarrativeMessage,
  composeBatchNarrativeMessage,
  caseToToolInput,
  type SafetyNarrativeCase,
} from '../safetyNarrativeBatch';

/** A fully-populated, sealable case used as a baseline across tests. */
const completeCase = (over: Partial<SafetyNarrativeCase> = {}): SafetyNarrativeCase => ({
  subjectId: 'S-001',
  studyId: 'STU-9',
  studyDrug: 'DRUG-X',
  medicalHistory: ['hypertension'],
  event: {
    term: 'headache',
    severity: 'moderate',
    seriousnessCriteria: ['hospitalization'],
    actionTaken: 'dose reduced',
    outcome: 'recovered',
    causality: 'possibly related',
  },
  ...over,
});

describe('SAFETY_NARRATIVE_TOOLS', () => {
  it('pins exactly the three already-built server tools, in chain order', () => {
    expect([...SAFETY_NARRATIVE_TOOLS]).toEqual([
      'draft_safety_narrative',
      'author_docx_native',
      'verify_docx_against_source',
    ]);
  });
});

describe('computeNarrativeQc — QC checklist + honesty guard', () => {
  it('marks a fully-populated, non-sample case sealable with no missing fields', () => {
    const qc = computeNarrativeQc(completeCase());
    expect(qc.checklist).toHaveLength(REQUIRED_NARRATIVE_FIELDS.length);
    expect(qc.missingFields).toEqual([]);
    expect(qc.isSample).toBe(false);
    expect(qc.sealable).toBe(true);
    expect(qc.blockReason).toBeUndefined();
    expect(qc.checklist.every((i) => i.present)).toBe(true);
  });

  it('lists each absent ICH E3 §16 required field as missing and blocks sealing', () => {
    const qc = computeNarrativeQc({ subjectId: 'S-2', event: { term: 'rash' } });
    // Only event.term is present; everything else is missing.
    expect(qc.missingFields).toEqual([
      'medicalHistory',
      'studyDrug',
      'event.severity',
      'event.seriousnessCriteria',
      'event.actionTaken',
      'event.outcome',
      'event.causality',
    ]);
    expect(qc.sealable).toBe(false);
    expect(qc.blockReason).toMatch(/Clear 7 missing required fields/);
  });

  it('uses singular phrasing when exactly one field is missing', () => {
    const qc = computeNarrativeQc(completeCase({ event: { ...completeCase().event, causality: '' } }));
    expect(qc.missingFields).toEqual(['event.causality']);
    expect(qc.blockReason).toBe('Clear 1 missing required field before sign-off.');
  });

  it('honesty guard: a complete SAMPLE case is flagged and NON-SEALABLE', () => {
    const qc = computeNarrativeQc(completeCase({ isSample: true }));
    expect(qc.missingFields).toEqual([]); // nothing missing…
    expect(qc.isSample).toBe(true);
    expect(qc.sealable).toBe(false); // …yet still non-sealable
    expect(qc.blockReason).toMatch(/Sample case/);
  });

  it('treats a blank string and an empty array as missing (mirrors the server gate)', () => {
    const qc = computeNarrativeQc(
      completeCase({ medicalHistory: [], studyDrug: '   ', event: { term: 'x', severity: '', seriousnessCriteria: [], actionTaken: 'a', outcome: 'o', causality: 'c' } }),
    );
    expect(qc.missingFields).toEqual(['medicalHistory', 'studyDrug', 'event.severity', 'event.seriousnessCriteria']);
  });
});

describe('applyServerMissingFields — reconcile post-draft server verdict', () => {
  it('rebuilds the verdict from the server-authoritative missing list', () => {
    const qc = applyServerMissingFields(completeCase(), ['event.outcome']);
    expect(qc.missingFields).toEqual(['event.outcome']);
    expect(qc.checklist.find((i) => i.field === 'event.outcome')?.present).toBe(false);
    expect(qc.checklist.find((i) => i.field === 'studyDrug')?.present).toBe(true);
    expect(qc.sealable).toBe(false);
  });

  it('keeps a sample non-sealable even when the server reports nothing missing', () => {
    const qc = applyServerMissingFields(completeCase({ isSample: true }), []);
    expect(qc.missingFields).toEqual([]);
    expect(qc.sealable).toBe(false);
    expect(qc.blockReason).toMatch(/Sample case/);
  });
});

describe('deriveRequiredStrings — required_strings for verify_docx_against_source', () => {
  it('pulls the load-bearing identifiers and clinical values in stable order', () => {
    const out = deriveRequiredStrings(completeCase());
    expect(out).toEqual([
      'S-001',
      'STU-9',
      'DRUG-X',
      'hypertension',
      'headache',
      'moderate',
      'hospitalization',
      'dose reduced',
      'recovered',
      'possibly related',
    ]);
  });

  it('de-duplicates and trims, dropping blanks', () => {
    const out = deriveRequiredStrings(
      completeCase({ subjectId: '  S-001  ', studyDrug: 'headache', event: { term: 'headache' }, medicalHistory: [], studyId: '' }),
    );
    // "headache" appears as both studyDrug and event.term but only once.
    expect(out.filter((s) => s === 'headache')).toHaveLength(1);
    expect(out).toContain('S-001');
    expect(out).not.toContain('');
  });

  it('never includes free-prose notes (only discrete verbatim facts)', () => {
    const out = deriveRequiredStrings(
      completeCase({ event: { ...completeCase().event, notes: 'narrative prose that may be paraphrased' } }),
    );
    expect(out).not.toContain('narrative prose that may be paraphrased');
  });
});

describe('detectFormat', () => {
  it('detects json, tsv, csv, and unknown', () => {
    expect(detectFormat('[{"subject_id":"S"}]')).toBe('json');
    expect(detectFormat('{"subject_id":"S"}')).toBe('json');
    expect(detectFormat('subject_id\tterm\nS-1\trash')).toBe('tsv');
    expect(detectFormat('subject_id,term\nS-1,rash')).toBe('csv');
    expect(detectFormat('just a sentence')).toBe('unknown');
    expect(detectFormat('   ')).toBe('unknown');
  });
});

describe('parseLineListing — CSV', () => {
  it('parses a valid CSV with aliased headers and list splitting', () => {
    const csv = [
      'subject_id,study_drug,term,severity,seriousness,outcome,causality,history',
      'S-001,DRUG-X,headache,moderate,hospitalization;disability,recovered,possibly related,hypertension;asthma',
    ].join('\n');
    const r = parseLineListing(csv);
    expect(r.format).toBe('csv');
    expect(r.errors).toEqual([]);
    expect(r.cases).toHaveLength(1);
    const c = r.cases[0];
    expect(c.subjectId).toBe('S-001');
    expect(c.studyDrug).toBe('DRUG-X');
    expect(c.event.term).toBe('headache');
    expect(c.event.seriousnessCriteria).toEqual(['hospitalization', 'disability']);
    expect(c.medicalHistory).toEqual(['hypertension', 'asthma']);
  });

  it('honors double-quote quoting around delimiters', () => {
    const csv = 'subject_id,term,notes\nS-1,"chest pain","onset, then resolved"';
    const r = parseLineListing(csv);
    expect(r.cases[0].event.term).toBe('chest pain');
    expect(r.cases[0].event.notes).toBe('onset, then resolved');
  });

  it('reports a malformed row missing the subject id rather than silently dropping it', () => {
    const csv = 'subject_id,term\nS-1,rash\n,fever';
    const r = parseLineListing(csv);
    expect(r.cases).toHaveLength(1);
    expect(r.errors).toEqual([{ rowNumber: 2, error: 'Row is missing a subject id.' }]);
  });

  it('reports a malformed row missing the event term', () => {
    const csv = 'subject_id,term\nS-1,';
    const r = parseLineListing(csv);
    expect(r.cases).toHaveLength(0);
    expect(r.errors[0].error).toBe('Subject S-1 is missing an event term.');
  });

  it('flags a row missing both required facts', () => {
    const csv = 'subject_id,term\n,';
    const r = parseLineListing(csv);
    expect(r.errors[0].error).toBe('Row is missing both subject id and event term.');
  });

  it('skips blank lines and ignores unrecognized columns', () => {
    const csv = 'subject_id,unknown_col,term\n\nS-1,junk,rash\n';
    const r = parseLineListing(csv);
    expect(r.cases).toHaveLength(1);
    expect(r.cases[0].event.term).toBe('rash');
    expect((r.cases[0] as Record<string, unknown>).unknown_col).toBeUndefined();
  });
});

describe('parseLineListing — TSV / JSON / empty', () => {
  it('parses tab-separated values', () => {
    const tsv = 'subject_id\tterm\tcausality\nS-7\tnausea\tunlikely';
    const r = parseLineListing(tsv);
    expect(r.format).toBe('tsv');
    expect(r.cases[0].subjectId).toBe('S-7');
    expect(r.cases[0].event.causality).toBe('unlikely');
  });

  it('parses a JSON array, accepting both flat and nested-event objects', () => {
    const json = JSON.stringify([
      { subject_id: 'S-1', term: 'rash', severity: 'mild' },
      { subjectId: 'S-2', event: { term: 'fever', outcome: 'recovered' } },
    ]);
    const r = parseLineListing(json);
    expect(r.format).toBe('json');
    expect(r.cases).toHaveLength(2);
    expect(r.cases[0].event.severity).toBe('mild');
    expect(r.cases[1].event.term).toBe('fever');
    expect(r.cases[1].event.outcome).toBe('recovered');
  });

  it('parses a single JSON object (not an array)', () => {
    const r = parseLineListing('{"subject_id":"S-1","term":"rash"}');
    expect(r.cases).toHaveLength(1);
    expect(r.cases[0].subjectId).toBe('S-1');
  });

  it('reports invalid JSON as a malformed row', () => {
    const r = parseLineListing('{not valid json');
    // Leading brace => json format, but unparseable.
    expect(r.format).toBe('json');
    expect(r.cases).toHaveLength(0);
    expect(r.errors[0].error).toBe('File is not valid JSON.');
  });

  it('flags a JSON entry that is not a case object', () => {
    const r = parseLineListing('["not-an-object"]');
    expect(r.errors[0].error).toBe('Entry is not a case object.');
  });

  it('returns empty results for empty / unknown input', () => {
    const empty = parseLineListing('');
    expect(empty.format).toBe('unknown');
    expect(empty.cases).toEqual([]);
    expect(empty.rows).toEqual([]);
    expect(empty.errors).toEqual([]);

    const headerOnly = parseLineListing('subject_id,term\n');
    expect(headerOnly.cases).toEqual([]);
    expect(headerOnly.errors).toEqual([]);
  });

  it('propagates isSample to every parsed case (batch honesty flag)', () => {
    const r = parseLineListing('subject_id,term\nS-1,rash', { isSample: true });
    expect(r.cases[0].isSample).toBe(true);
    expect(computeNarrativeQc(r.cases[0]).sealable).toBe(false);
  });
});

describe('caseToToolInput', () => {
  it('snake_cases keys and drops empty values / arrays', () => {
    const input = caseToToolInput(completeCase({ dose: '', concomitantMeds: [] }));
    expect(input.subject_id).toBe('S-001');
    expect(input.study_drug).toBe('DRUG-X');
    expect(input).not.toHaveProperty('dose');
    expect(input).not.toHaveProperty('concomitant_meds');
    const ev = input.event as Record<string, unknown>;
    expect(ev.action_taken).toBe('dose reduced');
  });
});

describe('composeSingleNarrativeMessage', () => {
  it('instructs the full draft → author → verify chain with derived required_strings', () => {
    const msg = composeSingleNarrativeMessage(completeCase());
    expect(msg).toContain('draft_safety_narrative');
    expect(msg).toContain('author_docx_native');
    expect(msg).toContain('verify_docx_against_source');
    expect(msg).toContain('Do not invent clinical detail');
    expect(msg).toContain('"S-001"'); // required_strings carried verbatim
    expect(msg).not.toContain('SAMPLE data'); // non-sample case
  });

  it('adds a non-sealable sample banner for sample cases', () => {
    const msg = composeSingleNarrativeMessage(completeCase({ isSample: true }));
    expect(msg).toContain('SAMPLE data');
    expect(msg).toContain('non-sealable');
  });
});

describe('composeBatchNarrativeMessage', () => {
  it('asks for the chain per-case plus a per-case QC summary', () => {
    const msg = composeBatchNarrativeMessage([completeCase(), completeCase({ subjectId: 'S-002' })]);
    expect(msg).toContain('2 cases');
    expect(msg).toContain('draft_safety_narrative');
    expect(msg).toContain('per-case QC summary');
    expect(msg).toContain('Never invent clinical detail');
  });

  it('labels the whole batch non-sealable when any case is a sample', () => {
    const msg = composeBatchNarrativeMessage([completeCase({ isSample: true })]);
    expect(msg).toContain('SAMPLE cases');
    expect(msg).toContain('non-sealable');
  });
});

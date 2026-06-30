/**
 * safetyNarrativeBatch — pure orchestration core for E5 (Guided ICH E3 §16
 * safety-narrative batch authoring + QC).
 *
 * This module holds the deterministic, UI-free logic that the Safety Narrative
 * affordance and its batch mode lean on:
 *
 *   1. A small, well-tested parser for an uploaded line listing (CSV / TSV /
 *      JSON of per-case fields), turning each row into a SafetyNarrativeCase.
 *   2. Derivation of `verify_docx_against_source`'s `required_strings` from the
 *      supplied case facts, so the authored DOCX is immediately checked for
 *      verbatim fidelity to the CIOMS / E2B source values.
 *   3. The honesty guard: a narrative built from a sample case, or one still
 *      missing ICH E3 §16 required fields, is FLAGGED and NON-SEALABLE. We never
 *      invent clinical detail and never let an incomplete narrative be signed.
 *   4. Composition of the structured chat message that drives the
 *      author → verify loop through the existing stream path. The three server
 *      tools (draft_safety_narrative, author_docx_native,
 *      verify_docx_against_source) are ORCHESTRATED here, never reimplemented.
 *
 * Nothing in this module renders or talks to the network — it is exercised by
 * focused unit tests and consumed by SafetyNarrativeAffordance + the QC panel.
 *
 * @module client/src/concept2cure/components/ana/safetyNarrativeBatch
 */

/** The three server tools this feature chains. Pinned as additive focus. */
export const SAFETY_NARRATIVE_TOOLS = [
  'draft_safety_narrative',
  'author_docx_native',
  'verify_docx_against_source',
] as const;

/**
 * ICH E3 §16 required fields the safety-narrative writer reports as "missing"
 * when absent. Mirrors the server's `composeSafetyNarrative` completeness gate
 * (server/services/ana/safety-narrative.ts) so the client QC checklist lists
 * exactly what the writer would flag — the single source of truth for QC.
 */
export const REQUIRED_NARRATIVE_FIELDS = [
  'medicalHistory',
  'studyDrug',
  'event.term',
  'event.severity',
  'event.seriousnessCriteria',
  'event.actionTaken',
  'event.outcome',
  'event.causality',
] as const;

/** Human-readable label for each QC field, for the checklist UI. */
export const NARRATIVE_FIELD_LABELS: Record<string, string> = {
  medicalHistory: 'Relevant medical history',
  studyDrug: 'Study drug / investigational product',
  'event.term': 'Event term',
  'event.severity': 'Severity / CTCAE grade',
  'event.seriousnessCriteria': 'Seriousness criteria',
  'event.actionTaken': 'Action taken with study drug',
  'event.outcome': 'Outcome',
  'event.causality': 'Investigator causality',
};

/** The adverse-event facts of a single case (mirrors the server input shape). */
export interface SafetyNarrativeEventFacts {
  term: string;
  onsetDate?: string;
  dayOnStudy?: string;
  severity?: string;
  seriousnessCriteria?: string[];
  causality?: string;
  actionTaken?: string;
  treatment?: string;
  dechallenge?: string;
  rechallenge?: string;
  outcome?: string;
  notes?: string;
}

/** A single safety-narrative case (mirrors `draft_safety_narrative` input). */
export interface SafetyNarrativeCase {
  subjectId: string;
  age?: string;
  sex?: string;
  studyId?: string;
  treatmentArm?: string;
  studyDrug?: string;
  dose?: string;
  firstDoseDate?: string;
  medicalHistory?: string[];
  concomitantMeds?: string[];
  event: SafetyNarrativeEventFacts;
  /**
   * True when this case is illustrative sample data, not a real CRF/E2B case.
   * A sample-derived narrative is flagged and NON-SEALABLE (honesty contract).
   */
  isSample?: boolean;
}

/** A single QC checklist item the writer clears before sign-off. */
export interface QcChecklistItem {
  field: string;
  label: string;
  present: boolean;
}

/** The QC verdict for one narrative — what the writer must clear to seal. */
export interface NarrativeQcResult {
  /** All ICH E3 §16 required fields, each marked present/missing. */
  checklist: QcChecklistItem[];
  /** The subset of fields still missing (drives the alert list). */
  missingFields: string[];
  /** True when the underlying case is illustrative sample data. */
  isSample: boolean;
  /**
   * Sealable only when nothing is missing AND the case is not a sample. A
   * non-sealable narrative cannot be promoted to a signed version (Part 11).
   */
  sealable: boolean;
  /** Plain, factual reason the narrative is not yet sealable, if so. */
  blockReason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field helpers
// ─────────────────────────────────────────────────────────────────────────────

const nonEmpty = (v: unknown): boolean =>
  typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : v != null;

/**
 * Whether a given ICH E3 §16 required field is present on a case. Mirrors the
 * server gate exactly (an empty array / blank string counts as missing).
 */
function fieldPresent(c: SafetyNarrativeCase, field: string): boolean {
  switch (field) {
    case 'medicalHistory':
      return nonEmpty(c.medicalHistory);
    case 'studyDrug':
      return nonEmpty(c.studyDrug);
    case 'event.term':
      return nonEmpty(c.event?.term);
    case 'event.severity':
      return nonEmpty(c.event?.severity);
    case 'event.seriousnessCriteria':
      return nonEmpty(c.event?.seriousnessCriteria);
    case 'event.actionTaken':
      return nonEmpty(c.event?.actionTaken);
    case 'event.outcome':
      return nonEmpty(c.event?.outcome);
    case 'event.causality':
      return nonEmpty(c.event?.causality);
    default:
      return false;
  }
}

/**
 * Build the QC verdict for a case BEFORE drafting — so the writer sees the
 * checklist of missing required fields up front and knows whether the result
 * could ever be sealed. The server tool returns the authoritative
 * `missingFields` post-draft; this client-side check uses the identical gate so
 * the surfaced checklist matches what the writer will get back.
 */
export function computeNarrativeQc(c: SafetyNarrativeCase): NarrativeQcResult {
  const checklist: QcChecklistItem[] = REQUIRED_NARRATIVE_FIELDS.map((field) => ({
    field,
    label: NARRATIVE_FIELD_LABELS[field] ?? field,
    present: fieldPresent(c, field),
  }));
  const missingFields = checklist.filter((i) => !i.present).map((i) => i.field);
  const isSample = Boolean(c.isSample);
  const sealable = missingFields.length === 0 && !isSample;
  let blockReason: string | undefined;
  if (isSample) {
    blockReason = 'Sample case — narrative is illustrative and cannot be sealed.';
  } else if (missingFields.length > 0) {
    blockReason = `Clear ${missingFields.length} missing required field${
      missingFields.length === 1 ? '' : 's'
    } before sign-off.`;
  }
  return { checklist, missingFields, isSample, sealable, blockReason };
}

/**
 * Map the server tool's authoritative `missingFields` (returned post-draft) onto
 * a case's QC verdict, so the in-chat checklist reflects what the writer
 * actually got back rather than only the pre-draft estimate. Sample/sealable
 * semantics are preserved.
 */
export function applyServerMissingFields(
  c: SafetyNarrativeCase,
  serverMissingFields: string[],
): NarrativeQcResult {
  const missingSet = new Set(serverMissingFields);
  const checklist: QcChecklistItem[] = REQUIRED_NARRATIVE_FIELDS.map((field) => ({
    field,
    label: NARRATIVE_FIELD_LABELS[field] ?? field,
    present: !missingSet.has(field),
  }));
  const missingFields = checklist.filter((i) => !i.present).map((i) => i.field);
  const isSample = Boolean(c.isSample);
  const sealable = missingFields.length === 0 && !isSample;
  let blockReason: string | undefined;
  if (isSample) {
    blockReason = 'Sample case — narrative is illustrative and cannot be sealed.';
  } else if (missingFields.length > 0) {
    blockReason = `Clear ${missingFields.length} missing required field${
      missingFields.length === 1 ? '' : 's'
    } before sign-off.`;
  }
  return { checklist, missingFields, isSample, sealable, blockReason };
}

// ─────────────────────────────────────────────────────────────────────────────
// required_strings derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive `verify_docx_against_source`'s `required_strings` from the supplied
 * case facts. These are the verbatim CIOMS / E2B source values the authored
 * DOCX MUST reproduce — so the verify step gives the writer immediate fidelity
 * confirmation that the narrative carried the source facts through unchanged.
 *
 * We pull the load-bearing identifiers and clinical values (subject id, study
 * id, study drug, event term, dates, outcome, causality, severity, etc.). We
 * deliberately DO NOT include free-prose notes — only discrete facts that must
 * appear character-for-character. Strings are de-duplicated and trimmed; blanks
 * are dropped. Order is stable (declaration order) for deterministic tests.
 */
export function deriveRequiredStrings(c: SafetyNarrativeCase): string[] {
  const out: string[] = [];
  const push = (v?: string | null) => {
    if (typeof v === 'string') {
      const t = v.trim();
      if (t) out.push(t);
    }
  };
  push(c.subjectId);
  push(c.studyId);
  push(c.treatmentArm);
  push(c.studyDrug);
  push(c.dose);
  push(c.firstDoseDate);
  for (const m of c.medicalHistory ?? []) push(m);
  for (const m of c.concomitantMeds ?? []) push(m);
  push(c.event?.term);
  push(c.event?.onsetDate);
  push(c.event?.dayOnStudy);
  push(c.event?.severity);
  for (const s of c.event?.seriousnessCriteria ?? []) push(s);
  push(c.event?.actionTaken);
  push(c.event?.treatment);
  push(c.event?.outcome);
  push(c.event?.causality);
  // De-duplicate while preserving first-seen order.
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s) ? false : (seen.add(s), true)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Line-listing parser (CSV / TSV / JSON)
// ─────────────────────────────────────────────────────────────────────────────

/** One parsed row plus its outcome — valid rows carry a case, bad rows an error. */
export interface ParsedRow {
  /** 1-based source row number (header is row 0), for error reporting. */
  rowNumber: number;
  case?: SafetyNarrativeCase;
  error?: string;
}

export interface LineListingParseResult {
  cases: SafetyNarrativeCase[];
  /** Every row's outcome, in source order (valid + malformed). */
  rows: ParsedRow[];
  /** Rows that could not be parsed into a case. */
  errors: { rowNumber: number; error: string }[];
  /** Detected format. */
  format: 'csv' | 'tsv' | 'json' | 'unknown';
}

/** Split one delimited line, honoring simple double-quote quoting. */
function splitDelimited(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Normalize a header cell to a canonical field key. */
function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Header alias → canonical case field. Tolerant of common column names. */
const HEADER_ALIASES: Record<string, string> = {
  subject_id: 'subjectId',
  subject: 'subjectId',
  patient_id: 'subjectId',
  usubjid: 'subjectId',
  age: 'age',
  sex: 'sex',
  gender: 'sex',
  study_id: 'studyId',
  study: 'studyId',
  protocol: 'studyId',
  treatment_arm: 'treatmentArm',
  arm: 'treatmentArm',
  study_drug: 'studyDrug',
  drug: 'studyDrug',
  ip: 'studyDrug',
  dose: 'dose',
  first_dose_date: 'firstDoseDate',
  first_dose: 'firstDoseDate',
  medical_history: 'medicalHistory',
  history: 'medicalHistory',
  concomitant_meds: 'concomitantMeds',
  conmeds: 'concomitantMeds',
  term: 'event.term',
  event: 'event.term',
  event_term: 'event.term',
  ae: 'event.term',
  ae_term: 'event.term',
  onset_date: 'event.onsetDate',
  onset: 'event.onsetDate',
  day_on_study: 'event.dayOnStudy',
  study_day: 'event.dayOnStudy',
  severity: 'event.severity',
  grade: 'event.severity',
  seriousness_criteria: 'event.seriousnessCriteria',
  seriousness: 'event.seriousnessCriteria',
  serious: 'event.seriousnessCriteria',
  causality: 'event.causality',
  relatedness: 'event.causality',
  action_taken: 'event.actionTaken',
  action: 'event.actionTaken',
  treatment: 'event.treatment',
  dechallenge: 'event.dechallenge',
  rechallenge: 'event.rechallenge',
  outcome: 'event.outcome',
  notes: 'event.notes',
};

/** Fields that carry a list — split on ';' (or ',' inside an already-quoted cell). */
const LIST_FIELDS = new Set(['medicalHistory', 'concomitantMeds', 'event.seriousnessCriteria']);

const splitList = (v: string): string[] =>
  v
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Assign a canonical field value onto a (possibly nested-`event.`) case path. */
function assignField(target: Record<string, unknown>, ev: Record<string, unknown>, key: string, raw: string): void {
  const value = raw.trim();
  if (!value) return;
  if (key.startsWith('event.')) {
    const sub = key.slice('event.'.length);
    ev[sub] = LIST_FIELDS.has(key) ? splitList(value) : value;
  } else {
    target[key] = LIST_FIELDS.has(key) ? splitList(value) : value;
  }
}

/**
 * Turn a raw record (already keyed by canonical field) into a validated
 * SafetyNarrativeCase. A row is malformed if it lacks the two hard-required
 * facts the server enforces: subject id and event term.
 */
function recordToCase(
  base: Record<string, unknown>,
  ev: Record<string, unknown>,
  isSample: boolean,
): { case?: SafetyNarrativeCase; error?: string } {
  const subjectId = typeof base.subjectId === 'string' ? base.subjectId.trim() : '';
  const term = typeof ev.term === 'string' ? ev.term.trim() : '';
  if (!subjectId && !term) {
    return { error: 'Row is missing both subject id and event term.' };
  }
  if (!subjectId) return { error: 'Row is missing a subject id.' };
  if (!term) return { error: `Subject ${subjectId} is missing an event term.` };
  const c: SafetyNarrativeCase = {
    subjectId,
    age: base.age as string | undefined,
    sex: base.sex as string | undefined,
    studyId: base.studyId as string | undefined,
    treatmentArm: base.treatmentArm as string | undefined,
    studyDrug: base.studyDrug as string | undefined,
    dose: base.dose as string | undefined,
    firstDoseDate: base.firstDoseDate as string | undefined,
    medicalHistory: base.medicalHistory as string[] | undefined,
    concomitantMeds: base.concomitantMeds as string[] | undefined,
    event: {
      term,
      onsetDate: ev.onsetDate as string | undefined,
      dayOnStudy: ev.dayOnStudy as string | undefined,
      severity: ev.severity as string | undefined,
      seriousnessCriteria: ev.seriousnessCriteria as string[] | undefined,
      causality: ev.causality as string | undefined,
      actionTaken: ev.actionTaken as string | undefined,
      treatment: ev.treatment as string | undefined,
      dechallenge: ev.dechallenge as string | undefined,
      rechallenge: ev.rechallenge as string | undefined,
      outcome: ev.outcome as string | undefined,
      notes: ev.notes as string | undefined,
    },
    isSample: isSample || undefined,
  };
  return { case: c };
}

/** Coerce one JSON object into a record keyed by canonical case fields. */
function jsonObjectToRecords(obj: Record<string, unknown>): {
  base: Record<string, unknown>;
  ev: Record<string, unknown>;
} {
  const base: Record<string, unknown> = {};
  const ev: Record<string, unknown> = {};
  // Accept either a flat object (with `event.*`/aliases) or a nested `event` object.
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'event' && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [ek, evv] of Object.entries(v as Record<string, unknown>)) {
        const canon = HEADER_ALIASES[`event.${normalizeHeader(ek)}`.replace('event.event.', 'event.')] ?? `event.${ek}`;
        const sub = canon.startsWith('event.') ? canon.slice('event.'.length) : ek;
        ev[sub] = evv;
      }
      continue;
    }
    const canon = HEADER_ALIASES[normalizeHeader(k)] ?? k;
    if (canon.startsWith('event.')) ev[canon.slice('event.'.length)] = v;
    else base[canon] = v;
  }
  return { base, ev };
}

/** Detect the line-listing format from the raw text. */
export function detectFormat(text: string): 'csv' | 'tsv' | 'json' | 'unknown' {
  const t = text.trim();
  if (!t) return 'unknown';
  if (t.startsWith('[') || t.startsWith('{')) return 'json';
  const firstLine = t.split(/\r?\n/, 1)[0] ?? '';
  if (firstLine.includes('\t')) return 'tsv';
  if (firstLine.includes(',')) return 'csv';
  return 'unknown';
}

/**
 * Parse an uploaded line listing into a set of SafetyNarrativeCases. Accepts:
 *   - CSV / TSV with a header row of (aliased) column names.
 *   - JSON: an array of case objects, or a single case object.
 *
 * Small and deliberately permissive on columns (unknown columns are ignored),
 * but STRICT on the two facts the server requires (subject id + event term):
 * a row missing either is reported as a malformed row rather than silently
 * dropped — so the writer sees exactly which cases the listing failed on.
 *
 * `isSample` marks the whole batch as illustrative; every produced case is then
 * non-sealable (honesty contract).
 */
export function parseLineListing(text: string, opts?: { isSample?: boolean }): LineListingParseResult {
  const isSample = Boolean(opts?.isSample);
  const format = detectFormat(text);
  const rows: ParsedRow[] = [];

  if (format === 'unknown') {
    return { cases: [], rows: [], errors: [], format };
  }

  if (format === 'json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        cases: [],
        rows: [{ rowNumber: 1, error: 'File is not valid JSON.' }],
        errors: [{ rowNumber: 1, error: 'File is not valid JSON.' }],
        format,
      };
    }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    list.forEach((item, idx) => {
      const rowNumber = idx + 1;
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        rows.push({ rowNumber, error: 'Entry is not a case object.' });
        return;
      }
      const { base, ev } = jsonObjectToRecords(item as Record<string, unknown>);
      const r = recordToCase(base, ev, isSample);
      rows.push({ rowNumber, ...r });
    });
  } else {
    const delim = format === 'tsv' ? '\t' : ',';
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return { cases: [], rows: [], errors: [], format };
    }
    const headerCells = splitDelimited(lines[0], delim).map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? '');
    lines.slice(1).forEach((line, idx) => {
      const rowNumber = idx + 1; // 1-based among data rows
      const cells = splitDelimited(line, delim);
      const base: Record<string, unknown> = {};
      const ev: Record<string, unknown> = {};
      headerCells.forEach((field, col) => {
        if (!field) return; // unrecognized column
        const raw = cells[col] ?? '';
        if (raw.trim()) assignField(base, ev, field, raw);
      });
      const r = recordToCase(base, ev, isSample);
      rows.push({ rowNumber, ...r });
    });
  }

  const cases = rows.filter((r): r is ParsedRow & { case: SafetyNarrativeCase } => !!r.case).map((r) => r.case);
  const errors = rows.filter((r) => r.error).map((r) => ({ rowNumber: r.rowNumber, error: r.error as string }));
  return { cases, rows, errors, format };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat-message composition (drives the author → verify chain)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compose the structured chat message that drives the safety-narrative chain
 * for ONE case through the normal stream path. The message:
 *   - hands the server the exact case facts (so draft_safety_narrative drafts
 *     strictly from them and reports missing required fields),
 *   - instructs the author → verify loop, and
 *   - supplies the derived `required_strings` so verify_docx_against_source
 *     confirms the DOCX reproduced the source facts verbatim.
 *
 * The actual tool execution + SSE handling is the existing pipeline's job; this
 * only frames the turn. Pinning is supplied separately via SAFETY_NARRATIVE_TOOLS.
 */
export function composeSingleNarrativeMessage(c: SafetyNarrativeCase): string {
  const requiredStrings = deriveRequiredStrings(c);
  const facts = JSON.stringify(caseToToolInput(c), null, 2);
  const sampleBanner = c.isSample
    ? '\nThis is SAMPLE data — clearly label the narrative as a non-sealable sample and do not present it as a real case.'
    : '';
  return [
    'Draft an ICH E3 §16 patient safety narrative for the following case, then author it as a house-styled DOCX and verify the DOCX reproduces the source facts verbatim.',
    '',
    'Steps:',
    '1. Call draft_safety_narrative with these exact case facts — draft only from them, and report any missing required fields for QC. Do not invent clinical detail.',
    '2. Call author_docx_native to render the narrative as a DOCX.',
    `3. Call verify_docx_against_source with required_strings = ${JSON.stringify(requiredStrings)} so the authored document is confirmed to reproduce the source facts exactly.`,
    '',
    'Case facts:',
    '```json',
    facts,
    '```',
    sampleBanner,
  ].join('\n');
}

/**
 * Compose the structured chat message for a BATCH of cases — one turn that asks
 * the assistant to run the draft → author → verify chain for each case and
 * report a per-case QC summary. Batch fan-out across the SSE stream is the
 * server's job; see the INTEGRATION note in SafetyNarrativeAffordance.
 */
export function composeBatchNarrativeMessage(cases: SafetyNarrativeCase[]): string {
  const isSample = cases.some((c) => c.isSample);
  const payload = cases.map((c) => ({
    facts: caseToToolInput(c),
    required_strings: deriveRequiredStrings(c),
  }));
  return [
    `Batch-author ICH E3 §16 patient safety narratives for the following ${cases.length} case${
      cases.length === 1 ? '' : 's'
    }.`,
    '',
    'For EACH case, run the chain: draft_safety_narrative (strictly from the supplied facts; report missing required fields) → author_docx_native → verify_docx_against_source with that case\'s required_strings. Never invent clinical detail.',
    isSample
      ? 'These are SAMPLE cases — every narrative must be clearly labelled non-sealable sample output.'
      : '',
    '',
    'Then give a per-case QC summary: subject id, missing required fields (if any), and verification verdict.',
    '',
    'Cases:',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/** Map a client case to the server tool's snake_cased input shape. */
export function caseToToolInput(c: SafetyNarrativeCase): Record<string, unknown> {
  const clean = (o: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(o).filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0) && v !== ''),
    );
  return clean({
    subject_id: c.subjectId,
    age: c.age,
    sex: c.sex,
    study_id: c.studyId,
    treatment_arm: c.treatmentArm,
    study_drug: c.studyDrug,
    dose: c.dose,
    first_dose_date: c.firstDoseDate,
    medical_history: c.medicalHistory,
    concomitant_meds: c.concomitantMeds,
    event: clean({
      term: c.event?.term,
      onset_date: c.event?.onsetDate,
      day_on_study: c.event?.dayOnStudy,
      severity: c.event?.severity,
      seriousness_criteria: c.event?.seriousnessCriteria,
      causality: c.event?.causality,
      action_taken: c.event?.actionTaken,
      treatment: c.event?.treatment,
      dechallenge: c.event?.dechallenge,
      rechallenge: c.event?.rechallenge,
      outcome: c.event?.outcome,
      notes: c.event?.notes,
    }),
  });
}

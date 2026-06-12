/**
 * Deterministic small-molecule developability read.
 *
 * Applies the standard, well-established drug-likeness rule sets — Lipinski's
 * rule of five and Veber's oral-bioavailability criteria — to curated
 * physicochemical descriptors (sourced from ChEMBL). This is a transparent,
 * threshold-based screen, not a prediction: every flag states the rule, the
 * observed value, and the threshold, so a medicinal chemist can audit it.
 *
 * These rules describe *oral small-molecule* drug-likeness; they do not apply to
 * biologics, PROTACs, peptides, or intentionally beyond-rule-of-five chemotypes,
 * and a violation is a discussion point, not a disqualification (many approved
 * oral drugs break one rule). The read is framed accordingly.
 *
 * @module server/services/chem/developability
 */

export interface DevelopabilityInput {
  molecularWeight?: number | null;
  alogp?: number | null;
  psa?: number | null;
  hba?: number | null;
  hbd?: number | null;
  rotatableBonds?: number | null;
  ro5Violations?: number | null;
  qed?: number | null;
}

export type DevelopabilityStatus = 'pass' | 'flag' | 'unknown';

export interface DevelopabilityFlag {
  rule: string;
  property: string;
  value: number | null;
  threshold: string;
  status: DevelopabilityStatus;
  note: string;
}

export interface DevelopabilityReport {
  flags: DevelopabilityFlag[];
  /** Count of properties that breached their threshold. */
  flagCount: number;
  /** Overall, audience-facing read. */
  summary: string;
  scope: string;
}

const SCOPE_NOTE =
  'Oral small-molecule heuristics (Lipinski Ro5, Veber). Not applicable to biologics, peptides, ' +
  'PROTACs, or deliberately beyond-Ro5 chemotypes; a single violation is a discussion point, not a fail.';

function evaluate(
  rule: string,
  property: string,
  value: number | null | undefined,
  predicate: (v: number) => boolean,
  threshold: string,
  passNote: string,
  flagNote: string
): DevelopabilityFlag {
  if (value == null) {
    return { rule, property, value: null, threshold, status: 'unknown', note: 'No value available.' };
  }
  const ok = predicate(value);
  return {
    rule,
    property,
    value,
    threshold,
    status: ok ? 'pass' : 'flag',
    note: ok ? passNote : flagNote,
  };
}

/**
 * Produce a developability read from curated descriptors. Missing descriptors
 * yield `unknown` flags rather than false passes.
 */
export function assessDevelopability(input: DevelopabilityInput): DevelopabilityReport {
  const flags: DevelopabilityFlag[] = [
    evaluate(
      'Lipinski Ro5',
      'Molecular weight',
      input.molecularWeight,
      v => v <= 500,
      '≤ 500 g/mol',
      'Within the Ro5 MW range.',
      'Above 500 g/mol — may reduce passive permeability / oral absorption.'
    ),
    evaluate(
      'Lipinski Ro5',
      'cLogP (ALogP)',
      input.alogp,
      v => v <= 5,
      '≤ 5',
      'Lipophilicity within range.',
      'cLogP above 5 — elevated lipophilicity (solubility / off-target / metabolic risk).'
    ),
    evaluate(
      'Lipinski Ro5',
      'H-bond donors',
      input.hbd,
      v => v <= 5,
      '≤ 5',
      'Donor count within range.',
      'More than 5 H-bond donors — permeability risk.'
    ),
    evaluate(
      'Lipinski Ro5',
      'H-bond acceptors',
      input.hba,
      v => v <= 10,
      '≤ 10',
      'Acceptor count within range.',
      'More than 10 H-bond acceptors — permeability risk.'
    ),
    evaluate(
      'Veber',
      'Polar surface area',
      input.psa,
      v => v <= 140,
      '≤ 140 Å²',
      'PSA consistent with good oral absorption.',
      'PSA above 140 Å² — reduced oral bioavailability (Veber).'
    ),
    evaluate(
      'Veber',
      'Rotatable bonds',
      input.rotatableBonds,
      v => v <= 10,
      '≤ 10',
      'Flexibility within Veber range.',
      'More than 10 rotatable bonds — reduced oral bioavailability (Veber).'
    ),
  ];

  const flagCount = flags.filter(f => f.status === 'flag').length;
  const ro5 = input.ro5Violations;
  const qedNote =
    input.qed != null ? ` QED (drug-likeness) ${input.qed.toFixed(2)}/1.00.` : '';
  const ro5Note =
    ro5 != null ? ` ChEMBL reports ${ro5} rule-of-five violation${ro5 === 1 ? '' : 's'}.` : '';

  let summary: string;
  if (flags.every(f => f.status === 'unknown')) {
    summary = 'Insufficient descriptors to assess developability — no curated physicochemical data available.';
  } else if (flagCount === 0) {
    summary = `No oral-developability flags across the rules evaluated.${ro5Note}${qedNote}`;
  } else {
    summary = `${flagCount} developability flag${flagCount === 1 ? '' : 's'} raised — see per-property detail.${ro5Note}${qedNote}`;
  }

  return { flags, flagCount, summary, scope: SCOPE_NOTE };
}

/**
 * @fileoverview Is this drug substance a small molecule, a biologic, or not yet established?
 * @module server/services/cmc/substance-modality
 *
 * ## Why one implementation
 *
 * Two things need this verdict and must never disagree about it:
 *
 *   1. **§3.2.A.2 (Adventitious Agents Safety Evaluation)** — whether the
 *      section applies at all, and whether an all-clear may be stated.
 *   2. **The composition boundary** (`composition-scope.ts`) — whether this
 *      platform composes Module 3 for the substance at all. ICH Q6B, Q5A(R2)
 *      and Q5C are not modelled here and Q3A was being applied to biologics,
 *      so a biologic's Module 3 is authored, not composed.
 *
 * A second copy of the rule would let one say "chemical synthesis" while the
 * other filed an adventitious-agents all-clear.
 *
 * The logic is the one §3.2.A.2 already shipped (and had widened on 2026-09-08
 * in the fail-closed direction), lifted here unchanged. Its shape:
 *
 *   • an EXPLICIT `modality` / `molecularType` wins, either way;
 *   • otherwise any biological signal — a recorded origin, cell line, source
 *     organism, viral-safety or TSE statement, or a biologic token in the
 *     name, route or process description — reads as `biologic`. A false
 *     positive costs a section asking for viral-safety data that may not be
 *     needed; a false negative files an adventitious-agents all-clear for a
 *     cell-culture product;
 *   • a substance with no biological signal and a RECORDED chemical process
 *     reads as `small_molecule`;
 *   • a substance with nothing recorded either way is `unknown`. That is not
 *     a statement that it is chemically synthesised — it is a statement that
 *     the question has not been answered, and both callers must treat it as
 *     such.
 */

/** What the record establishes about the substance. */
export type SubstanceModality = 'small_molecule' | 'biologic' | 'unknown';

/** The drug-substance fields the verdict reads, as the canonical payload spells them. */
export interface ModalityFields {
  name?: unknown;
  manufacturingRoute?: unknown;
  processDescription?: unknown;
  biologicalOrigin?: unknown;
  cellLine?: unknown;
  sourceOrganism?: unknown;
  viralSafetyEvaluation?: unknown;
  tseStatus?: unknown;
  /** The preferred explicit signal: 'small_molecule' | 'biologic'. */
  modality?: unknown;
  molecularType?: unknown;
}

export interface ModalityVerdict {
  modality: SubstanceModality;
  /** Why, in the words a refusal or a section narrative can use. */
  basis: string;
  /** True when `modality` / `molecularType` stated it outright. */
  explicit: boolean;
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

/** `small_molecule`, `synthetic` or `chemical`, stated outright. */
export function statesSmallMolecule(modality: unknown): boolean {
  return /^(small[-_ ]?molecule|synthetic|chemical)$/i.test(str(modality).trim());
}

/** `biologic` / `biological`, stated outright on either field. */
export function statesBiologic(modality: unknown, molecularType: unknown): boolean {
  return /^biologic(al)?$/i.test(str(modality).trim()) || /^biologic(al)?$/i.test(str(molecularType).trim());
}

/**
 * A biologic token in the free text, by word boundary.
 *
 * Concrete tokens only, so a chemical substance whose name or process
 * incidentally says 'tissue' or 'plasma' ('tissue paper packaging', 'plasma
 * etching') does not fire. Expression systems are matched as they are usually
 * written down — "CHO cell culture" asks for cell CULTURE, not cell line — and
 * the INN stems are included because a substance named "belantezumab" is a
 * monoclonal antibody by its name alone.
 */
export function biologicHeuristic(fields: ModalityFields): boolean {
  const name = str(fields.name);
  const route = str(fields.manufacturingRoute);
  const processDesc = str(fields.processDescription);
  const free = `${route} ${processDesc} ${name}`;
  return (
    /\b(biologic|recombinant|monoclonal|vaccine|fermentation|mammalian|hybridoma|bioreactor|transgenic|plasmid|viral\s*vector)\b/i.test(
      free,
    ) ||
    /\bmAb\b|\bcell[\s-]*(line|culture|bank)\b|\b(human|animal)\s*tissue\b|\bplasma[-\s]derived\b/i.test(free) ||
    /\b(cho|hek\s*293|sf9|vero|per\.?c6|e\.?\s?coli|pichia|saccharomyces|baculovirus)\b/i.test(
      `${route} ${processDesc}`,
    ) ||
    /(mab|cept|kinra|ase|tide|parin)\b/i.test(name.trim().split(/\s+/).pop() || '')
  );
}

/** Which recorded field made this a biologic, for the basis sentence. */
function biologicalSignal(fields: ModalityFields): string | null {
  if (str(fields.biologicalOrigin).trim()) return 'a recorded biological origin';
  if (str(fields.cellLine).trim()) return 'a recorded cell line';
  if (str(fields.sourceOrganism).trim()) return 'a recorded source organism';
  if (str(fields.viralSafetyEvaluation).trim()) return 'a recorded viral-safety evaluation';
  if (str(fields.tseStatus).trim()) return 'a recorded TSE/BSE status';
  if (biologicHeuristic(fields)) return 'a biologic term in its name, route or process description';
  return null;
}

/**
 * The substance's modality, as its record establishes it.
 *
 * Pure. `unknown` is a real answer and the callers' fail-closed branch.
 */
export function classifySubstanceModality(fields: ModalityFields): ModalityVerdict {
  if (statesBiologic(fields.modality, fields.molecularType)) {
    return { modality: 'biologic', basis: 'the record states its modality as biologic', explicit: true };
  }

  const explicitSmallMolecule = statesSmallMolecule(fields.modality);
  if (!explicitSmallMolecule) {
    const signal = biologicalSignal(fields);
    if (signal) {
      return { modality: 'biologic', basis: `the record carries ${signal}`, explicit: false };
    }
  }

  if (explicitSmallMolecule) {
    return { modality: 'small_molecule', basis: 'the record states its modality as a small molecule', explicit: true };
  }

  /* A recorded chemical process, and nothing suggesting biology. Same rule
     §3.2.A.2 uses to decide it may state an all-clear. */
  const stated = str(fields.manufacturingRoute).trim() || str(fields.processDescription).trim();
  if (stated) {
    return {
      modality: 'small_molecule',
      basis: 'the record states a manufacturing route with no biological origin',
      explicit: false,
    };
  }

  return {
    modality: 'unknown',
    basis: 'the record states neither a manufacturing route nor a biological origin',
    explicit: false,
  };
}

export default { classifySubstanceModality, statesSmallMolecule, statesBiologic, biologicHeuristic };

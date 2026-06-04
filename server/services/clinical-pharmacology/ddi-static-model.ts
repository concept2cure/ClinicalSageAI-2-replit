/**
 * @fileoverview Drug-interaction (DDI) static-model risk assessor.
 * @module server/services/clinical-pharmacology/ddi-static-model
 *
 * Applies the FDA in-vitro DDI guidance basic/static models to decide whether a
 * drug, as a CYP/transporter perpetrator, needs a dedicated clinical DDI study:
 *
 *   - Reversible (direct) inhibition, systemic:  R1  = 1 + Imax,u/Ki         (flag ≥ 1.02)
 *   - Reversible inhibition of gut CYP3A:        R1g = 1 + Igut/Ki           (flag ≥ 11)
 *   - Time-dependent inhibition (TDI):           R2  = (kobs+kdeg)/kdeg      (flag ≥ 1.25)
 *                                                kobs = kinact·Imax,u/(KI+Imax,u)
 *   - Induction (basic model):                   R3  = 1/(1 + d·Emax·Imax,u/(EC50+Imax,u)) (flag ≤ 0.8)
 *   - Transporters:                              gut Igut/IC50 (flag ≥ 10);  systemic Iu/IC50 (flag ≥ 0.1)
 *
 * Each mechanism is evaluated only when its inputs are supplied; any flagged
 * mechanism triggers a clinical-study recommendation. Concentrations and
 * constants for a given mechanism must share units (e.g. µM); the engine does
 * not convert units.
 *
 * Pure module — no database, no network. Callable by ANA.
 *
 * @compliance FDA "In Vitro Drug Interaction Studies" guidance (2020); FDA
 *   "Clinical Drug Interaction Studies" guidance (2020).
 */

export interface TransporterInput {
  name: string;
  ic50: number;
  /** Gut transporter (P-gp/BCRP): compare Igut/IC50 ≥ 10. */
  gut?: boolean;
  /** Intestinal luminal concentration (dose/250 mL) for gut transporters. */
  igut?: number;
  /** Unbound systemic/inlet concentration for hepatic/renal transporters. */
  unboundConcentration?: number;
}

export interface DdiStaticInput {
  /** Unbound maximum plasma concentration (Imax,u). */
  imaxUnbound?: number;
  /** Reversible inhibition constant Ki (systemic). */
  ki?: number;
  /** Molar dose, for gut concentration Igut = dose / 0.25 L. */
  doseMol?: number;
  /** Explicit gut concentration Igut (overrides doseMol). */
  igut?: number;
  /** Ki for gut CYP3A (defaults to ki when omitted). */
  kiGut?: number;
  /** TDI maximal inactivation rate kinact. */
  kinact?: number;
  /** TDI concentration for half-maximal inactivation KI. */
  kI?: number;
  /** Enzyme degradation rate constant kdeg. */
  kdeg?: number;
  /** Induction maximal effect Emax (fold). */
  emax?: number;
  /** Induction EC50. */
  ec50?: number;
  /** Induction calibration factor d (default 1). */
  inductionD?: number;
  transporters?: TransporterInput[];
}

export interface MechanismResult {
  mechanism: string;
  value: number;
  threshold: string;
  flagged: boolean;
}

export interface DdiStaticResult {
  mechanisms: MechanismResult[];
  flaggedMechanisms: string[];
  clinicalStudyRecommended: boolean;
  rationale: string;
}

function round(value: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/** Run the static DDI models for whichever mechanisms have inputs. */
export function assessDdiRisk(input: DdiStaticInput): DdiStaticResult {
  const mechanisms: MechanismResult[] = [];

  // R1 — reversible inhibition (systemic)
  if (input.imaxUnbound != null && input.ki != null && input.ki > 0) {
    const r1 = 1 + input.imaxUnbound / input.ki;
    mechanisms.push({ mechanism: 'R1 reversible inhibition (systemic)', value: round(r1), threshold: '≥ 1.02', flagged: r1 >= 1.02 });
  }

  // R1,gut — reversible inhibition of gut CYP3A
  const kiGut = input.kiGut ?? input.ki;
  const igut = input.igut ?? (input.doseMol != null ? input.doseMol / 0.25 : undefined);
  if (igut != null && kiGut != null && kiGut > 0) {
    const r1g = 1 + igut / kiGut;
    mechanisms.push({ mechanism: 'R1,gut reversible inhibition (intestinal CYP3A)', value: round(r1g), threshold: '≥ 11', flagged: r1g >= 11 });
  }

  // R2 — time-dependent inhibition
  if (
    input.kinact != null &&
    input.kI != null &&
    input.kdeg != null &&
    input.kdeg > 0 &&
    input.imaxUnbound != null
  ) {
    const kobs = (input.kinact * input.imaxUnbound) / (input.kI + input.imaxUnbound);
    const r2 = (kobs + input.kdeg) / input.kdeg;
    mechanisms.push({ mechanism: 'R2 time-dependent inhibition', value: round(r2), threshold: '≥ 1.25', flagged: r2 >= 1.25 });
  }

  // R3 — induction (basic model)
  if (input.emax != null && input.ec50 != null && input.imaxUnbound != null) {
    const d = input.inductionD ?? 1;
    const r3 = 1 / (1 + (d * input.emax * input.imaxUnbound) / (input.ec50 + input.imaxUnbound));
    mechanisms.push({ mechanism: 'R3 induction', value: round(r3), threshold: '≤ 0.8', flagged: r3 <= 0.8 });
  }

  // Transporters
  for (const t of input.transporters ?? []) {
    if (!(t.ic50 > 0)) continue;
    if (t.gut) {
      if (t.igut != null) {
        const ratio = t.igut / t.ic50;
        mechanisms.push({ mechanism: `${t.name} (gut) Igut/IC50`, value: round(ratio), threshold: '≥ 10', flagged: ratio >= 10 });
      }
    } else if (t.unboundConcentration != null) {
      const ratio = t.unboundConcentration / t.ic50;
      mechanisms.push({ mechanism: `${t.name} Iu/IC50`, value: round(ratio), threshold: '≥ 0.1', flagged: ratio >= 0.1 });
    }
  }

  const flaggedMechanisms = mechanisms.filter(m => m.flagged).map(m => m.mechanism);
  const clinicalStudyRecommended = flaggedMechanisms.length > 0;

  const rationale = clinicalStudyRecommended
    ? `Static models exceed the regulatory cut-off for ${flaggedMechanisms.length} mechanism(s): ${flaggedMechanisms.join('; ')}. A dedicated clinical DDI study (or a verified PBPK analysis) is recommended per FDA DDI guidance.`
    : mechanisms.length > 0
      ? `No static-model mechanism exceeds its cut-off across the ${mechanisms.length} evaluated; a clinical DDI study is not indicated on these in-vitro data.`
      : 'No DDI inputs were supplied; nothing to evaluate.';

  return { mechanisms, flaggedMechanisms, clinicalStudyRecommended, rationale };
}

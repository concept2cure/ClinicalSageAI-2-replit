import { format } from 'date-fns';
import { getRegionProfile, RegionProfile } from './regionProfiles';

type Method = {
  id: string;
  code: string;
  title: string;
  technique: string;
  matrix: string;
  analyte: string;
  range?: string;
  precision_target?: string;
  accuracy_target?: string;
};
type Gap = { rule_id: string; severity: 'ERROR' | 'WARNING' | 'INFO'; title: string; why?: string };

/** Helper for decimals if you later stringify numbers per region */
const fmt = (val: string | number, profile: RegionProfile) => {
  if (typeof val !== 'number') return val;
  const s = val.toString();
  return profile.numeric.decimalSeparator === ',' ? s.replace('.', ',') : s;
};

export function buildValidationPlanMD(m: Method, gaps: Gap[], region = 'FDA') {
  const profile = getRegionProfile(region);
  const today = format(new Date(), 'yyyy-MM-dd');

  const acc = m.accuracy_target || '98–102% (assay) or per impurity justification';
  const prec = m.precision_target || '≤2.0% RSD (repeatability), ≤3.0% RSD (intermediate)';
  const rng = m.range || 'Assay: 80–120% of label claim; Impurities: LOQ to 120% of spec';

  const term = profile.terminology;
  const comp = profile.compendia;

  const gapNotes =
    gaps.length === 0
      ? '- None'
      : gaps
          .map(g => `- **${g.rule_id} (${g.severity})** — ${g.title}${g.why ? `: ${g.why}` : ''}`)
          .join('\n');

  /** Markdown tables with editor placeholders {{...}} for later fill-in */
  const tblLinearity = `
### Linearity & Range — Calibration Data
| Level | Nominal (units) | Response | %Bias |
|---|---:|---:|---:|
| L1 | {{LIN.L1.NOM}} | {{LIN.L1.RESP}} | {{LIN.L1.BIAS}} |
| L2 | {{LIN.L2.NOM}} | {{LIN.L2.RESP}} | {{LIN.L2.BIAS}} |
| L3 | {{LIN.L3.NOM}} | {{LIN.L3.RESP}} | {{LIN.L3.BIAS}} |
| L4 | {{LIN.L4.NOM}} | {{LIN.L4.RESP}} | {{LIN.L4.BIAS}} |
| L5 | {{LIN.L5.NOM}} | {{LIN.L5.RESP}} | {{LIN.L5.BIAS}} |

**Regression metrics**  
- Slope: {{LIN.SLOPE}}  
- Intercept: {{LIN.INTERCEPT}}  
- R²: {{LIN.R2}}  
- Lack-of-fit p-value: {{LIN.LOF_P}}  
`;

  const tblAccuracy = `
### Accuracy — %Recovery (3×3)
| Level (% of target) | Target %Recovery | Rep 1 | Rep 2 | Rep 3 | Mean | %Bias | Accept? |
|---:|---:|---:|---:|---:|---:|---:|:---:|
| Low ({{ACC.LOW.LVL}})  | ${acc} | {{ACC.LOW.R1}} | {{ACC.LOW.R2}} | {{ACC.LOW.R3}} | {{ACC.LOW.MEAN}} | {{ACC.LOW.BIAS}} | {{ACC.LOW.PASS}} |
| Mid ({{ACC.MID.LVL}})  | ${acc} | {{ACC.MID.R1}} | {{ACC.MID.R2}} | {{ACC.MID.R3}} | {{ACC.MID.MEAN}} | {{ACC.MID.BIAS}} | {{ACC.MID.PASS}} |
| High ({{ACC.HIGH.LVL}}) | ${acc} | {{ACC.HIGH.R1}}| {{ACC.HIGH.R2}}| {{ACC.HIGH.R3}}| {{ACC.HIGH.MEAN}}| {{ACC.HIGH.BIAS}}| {{ACC.HIGH.PASS}} |
`;

  const tblPrecision = `
### Precision
**Repeatability (n=6 at a single level)**  
| Replicate | Result |
|---:|---:|
| 1 | {{PREC.REP1}} |
| 2 | {{PREC.REP2}} |
| 3 | {{PREC.REP3}} |
| 4 | {{PREC.REP4}} |
| 5 | {{PREC.REP5}} |
| 6 | {{PREC.REP6}} |
- Mean: {{PREC.MEAN}} • SD: {{PREC.SD}} • RSD: {{PREC.RSD}} (Target: ${prec})

**Intermediate Precision (Analyst × Day × Instrument)**  
| Day | Analyst | Instrument | Result | Notes |
|---:|---|---|---:|---|
| 1 | {{IP.A1}} | {{IP.I1}} | {{IP.D1.R}} | {{IP.D1.N}} |
| 2 | {{IP.A2}} | {{IP.I2}} | {{IP.D2.R}} | {{IP.D2.N}} |
| 3 | {{IP.A3}} | {{IP.I3}} | {{IP.D3.R}} | {{IP.D3.N}} |
- Overall RSD: {{IP.RSD}} (Target: ${prec})
`;

  const tblLODLOQ = `
### LOD / LOQ
| Parameter | Approach | Value | Units | Meets Target? |
|---|---|---:|---|:---:|
| LOD | {{LOD.APPROACH}} | {{LOD.VALUE}} | {{LOD.UNIT}} | {{LOD.PASS}} |
| LOQ | {{LOQ.APPROACH}} | {{LOQ.VALUE}} | {{LOQ.UNIT}} | {{LOQ.PASS}} |
- LOQ precision at level: {{LOQ.PRECISION}} (Target acceptable)  
- Impurities: LOQ ≤ 50% of spec → {{LOQ.VS_SPEC}}
`;

  const tblRobust = `
### ${term.robustness} (Q14) — Screening DOE
| Run | Flow (mL/min) | Temp (°C) | pH | %B | Column Lot | Response | Pass/Fail |
|---:|---:|---:|---:|---:|---|---:|:---:|
| 1 | {{ROB.FLOW1}} | {{ROB.TEMP1}} | {{ROB.PH1}} | {{ROB.B1}} | {{ROB.COL1}} | {{ROB.RESP1}} | {{ROB.PASS1}} |
| 2 | {{ROB.FLOW2}} | {{ROB.TEMP2}} | {{ROB.PH2}} | {{ROB.B2}} | {{ROB.COL2}} | {{ROB.RESP2}} | {{ROB.PASS2}} |
| 3 | {{ROB.FLOW3}} | {{ROB.TEMP3}} | {{ROB.PH3}} | {{ROB.B3}} | {{ROB.COL3}} | {{ROB.RESP3}} | {{ROB.PASS3}} |
| 4 | {{ROB.FLOW4}} | {{ROB.TEMP4}} | {{ROB.PH4}} | {{ROB.B4}} | {{ROB.COL4}} | {{ROB.RESP4}} | {{ROB.PASS4}} |
- Effects ranking: {{ROB.EFFECTS}} • Critical factors: {{ROB.CRIT}}
`;

  const tblSST = `
### ${term.systemSuitability}
| Parameter | Target | Limit | Observed | Pass/Fail |
|---|---:|---:|---:|:---:|
| Tailing factor | {{SST.TAIL.TARGET}} | {{SST.TAIL.LIMIT}} | {{SST.TAIL.OBS}} | {{SST.TAIL.PASS}} |
| Plate count (N) | {{SST.PLATE.TARGET}} | {{SST.PLATE.LIMIT}} | {{SST.PLATE.OBS}} | {{SST.PLATE.PASS}} |
| Resolution (Rs) | {{SST.RS.TARGET}} | {{SST.RS.LIMIT}} | {{SST.RS.OBS}} | {{SST.RS.PASS}} |
| %RSD (n injections) | {{SST.RSD.TARGET}} | {{SST.RSD.LIMIT}} | {{SST.RSD.OBS}} | {{SST.RSD.PASS}} |
_(Ref: ${comp.chromatography})_
`;

  return `<!-- METHOD_ID: ${m.id} -->
# Analytical Method Validation Plan — ${m.code}

**Method Title:** ${m.title}  
**Technique:** ${m.technique}  
**Matrix:** ${m.matrix}  
**Analyte(s):** ${m.analyte}  
**Region:** ${profile.name}  
**Date:** ${today}

---

## 1. Purpose & Scope
Establish that method **${m.code}** is suitable for its intended purpose for ${m.matrix.toLowerCase()} ${m.analyte.toLowerCase()} using ${m.technique}.  
This plan aligns with **ICH Q2(R2)** (Validation of Analytical Procedures) and **ICH Q14** (Analytical Procedure Development). Regional references: ${comp.chromatography}${
    profile.notes?.length ? `; Notes: ${profile.notes.join(' • ')}` : ''
  }.

## 2. References
- ICH Q2(R2) — Validation of Analytical Procedures  
- ICH Q14 — Analytical Procedure Development  
- ${comp.chromatography}  
- Relevant SOPs and monographs

## 3. Analytical Target Profile (ATP)
- ${term.specificity}: No interference from matrix/degradants at analyte RT or ion m/z.  
- ${term.accuracy} target: ${acc}  
- ${term.precision} target: ${prec}  
- Range: ${rng}  
- LOQ/LOD: LOQ ≤ 50% of impurity specification (where applicable).  
- ${term.systemSuitability}: Define acceptance (tailing, plates, Rs); trend each run.

## 4. Materials & Equipment
- Standards, reagents, columns, instruments (IDs & calibration).  
- Qualification status recorded before runs.

## 5. Validation Experiments
### Specificity
- Placebo, spiked samples, forced-degradation (acid/base/oxidative/thermal/photolytic).  
- Peak purity/ion ratio checks; degradation products do not interfere with quantitation.  
- **Planned:** {{SPEC.PLAN}} • Evidence: {{SPEC.EVIDENCE}}

${tblLinearity}

${tblAccuracy}

${tblPrecision}

${tblLODLOQ}

${tblRobust}

${tblSST}

## 6. Statistics & Reporting
- Accuracy: compute mean, CI, %bias; flag outliers per SOP.  
- Precision: RSD targets as defined in ATP.  
- Linearity: regression diagnostics (R², LOF); include residual plots.  
- Robustness: screen factors; confirm if critical.  
- Rounding/significant figures per SOP; decimals use "${profile.numeric.decimalSeparator}".

## 7. Data Integrity
ALCOA+ compliance; audit trail review; electronic signatures (21 CFR Part 11).

## 8. Acceptance & Deviations
All characteristics must meet ATP targets. Deviations recorded with impact assessment and CAPA if applicable.

## 9. Lifecycle & Change Control
Post-approval changes via change control with comparability protocols; define when revalidation is required.

### Notes from current gaps
${gapNotes}

---
*Generated from method metadata, region profile, and open gaps on ${today}.*
`;
}

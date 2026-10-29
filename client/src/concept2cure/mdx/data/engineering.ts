/**
 * Engineering surface types — DHF (Design History File), Design Controls
 * Traceability (21 CFR 820.30), and ISO 14971 risk records — and the risk
 * matrix axes.
 *
 * ── 2026-10-14 ───────────────────────────────────────────────────────────────
 * This file held the kit's example engineering file: nine DHF deliverables
 * with owners and versions, a trace matrix, a risk file, change requests and
 * issues (ENG_DHF / ENG_TRACE / ENG_RISKS / ENG_ECRS / ENG_ISSUES), rendered
 * under sample mode. They are deleted with sample mode; the row types they
 * used to be inferred from are declared below.
 *
 * ENG_RISK_ACCEPT is deleted too. It was labelled "encodes the org's risk
 * policy" and coloured every matrix cell acceptable / ALARP / unacceptable —
 * but it was the kit's policy, not the organization's. ISO 14971 §4.2 makes
 * the acceptability criteria the manufacturer's to define in its risk
 * management plan; a matrix that colours a cell "unacceptable" on someone
 * else's criteria is a verdict nobody made. The cells are drawn without a
 * verdict until the plan's criteria are on record.
 */

/* ISO 14971 risk records — hazard × hazardous situation × harm with P1 × P2
   probabilities and severity. The matrix is the heart of the surface.
   Severity is the FDA standard 5-level scale; P1/P2 are 5-level. */
export const ENG_RISK_SEVERITY = [
  { id: 'S1', label: 'Negligible' },
  { id: 'S2', label: 'Minor' },
  { id: 'S3', label: 'Serious' },
  { id: 'S4', label: 'Critical' },
  { id: 'S5', label: 'Catastrophic' },
];
export const ENG_RISK_PROB = [
  { id: 'P1', label: 'Improbable'  },
  { id: 'P2', label: 'Remote'      },
  { id: 'P3', label: 'Occasional'  },
  { id: 'P4', label: 'Probable'    },
  { id: 'P5', label: 'Frequent'    },
];

/** One section of one of the project's documents (c2c_document_sections; P-60). */
export interface DhfRow {
  id: string;
  num: string;
  label: string;
  ver: string;
  owner: string;
  updated: string;
  status: string;
  meta: string;
  /** The section's document (c2c_documents.id) and its title. */
  documentId?: string;
  document?: string;
}

export interface TraceRow {
  id: string;
  need: string;
  input: string;
  output: string;
  verif: string;
  valid: string;
  risk: string;
  state: string;
}

export interface RiskRow {
  id: string;
  hazard: string;
  situation: string;
  harm: string;
  severity: string;
  probBefore: string;
  controlClass: string;
  control: string;
  verif: string;
  probAfter: string;
  residual: string;
  state: string;
  owner: string;
}

export interface EcrRow {
  id: string;
  title: string;
  impact: string;
  opened: string;
  state: string;
  owner: string;
  riskChange: string;
  linked: string;
}

export interface IssueRow {
  id: string;
  title: string;
  severity: string;
  age: string;
  owner: string;
  state: string;
  linked: string;
}

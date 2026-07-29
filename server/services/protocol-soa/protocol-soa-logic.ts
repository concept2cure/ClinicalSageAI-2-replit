/**
 * Protocol Schedule-of-Assessments deterministic logic (Capability C2C-21)
 *
 * Pure, DB-free, LLM-free: build the assessments × visits matrix from rows/columns/
 * cells, and validate it for common SoA defects. Grounded in ICH E6(R2) / ICH M11
 * (the protocol must specify the schedule of assessments).
 *
 * @module server/services/protocol-soa/protocol-soa-logic
 */

export const ICH_M11_SOA = 'ICH M11 / ICH E6(R2) — schedule of activities (assessments by visit)';

export interface SoaAssessment { id: number; name: string; category?: string; orderIndex?: number }
export interface SoaVisit { id: number; visitName: string; timepoint?: string | null; orderIndex?: number }
export interface SoaCell { assessmentId: number; visitId: number; required?: boolean }

export interface SoaMatrixRow {
  assessmentId: number;
  name: string;
  category: string;
  /** One entry per visit (same order as the matrix columns): present + required. */
  cells: Array<{ visitId: number; present: boolean; required: boolean }>;
  /** Number of visits this assessment is performed at. */
  visitCount: number;
}

export interface SoaMatrix {
  columns: Array<{ visitId: number; visitName: string; timepoint: string | null }>;
  rows: SoaMatrixRow[];
  totalCells: number;
}

/** Build the SoA matrix (assessments × visits) from rows, columns, and the marked cells. Pure. */
export function buildSoaMatrix(assessments: SoaAssessment[], visits: SoaVisit[], cells: SoaCell[]): SoaMatrix {
  const cols = [...visits].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)).map((v) => ({ visitId: v.id, visitName: v.visitName, timepoint: v.timepoint ?? null }));
  const marks = new Map<string, boolean>(); // `${assessmentId}:${visitId}` → required
  for (const c of cells) marks.set(`${c.assessmentId}:${c.visitId}`, c.required ?? true);

  let totalCells = 0;
  const rows: SoaMatrixRow[] = [...assessments]
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
    .map((a) => {
      const cellArr = cols.map((col) => {
        const key = `${a.id}:${col.visitId}`;
        const present = marks.has(key);
        if (present) totalCells += 1;
        return { visitId: col.visitId, present, required: present ? marks.get(key)! : false };
      });
      return { assessmentId: a.id, name: a.name, category: a.category ?? 'other', cells: cellArr, visitCount: cellArr.filter((c) => c.present).length };
    });

  return { columns: cols, rows, totalCells };
}

export interface SoaFinding { severity: 'critical' | 'warning' | 'info'; message: string }
export interface SoaValidation {
  valid: boolean;
  findings: SoaFinding[];
  emptyVisits: number[];
  unscheduledAssessments: number[];
  basis: string;
}

/**
 * Validate an SoA matrix: every visit should have at least one assessment, every
 * assessment should be scheduled at ≥1 visit, and there should be an eligibility/
 * screening assessment somewhere. Pure — `critical` findings indicate a grid that
 * cannot be considered complete.
 */
export function validateSoa(matrix: SoaMatrix, assessments: SoaAssessment[]): SoaValidation {
  const findings: SoaFinding[] = [];

  if (matrix.columns.length === 0) findings.push({ severity: 'critical', message: 'No visits defined for the schedule of assessments.' });
  if (matrix.rows.length === 0) findings.push({ severity: 'critical', message: 'No assessments defined for the schedule of assessments.' });

  // Visits with no assessment marked.
  const emptyVisits: number[] = matrix.columns
    .filter((col) => !matrix.rows.some((r) => r.cells.find((c) => c.visitId === col.visitId)?.present))
    .map((col) => col.visitId);
  for (const col of matrix.columns) {
    if (emptyVisits.includes(col.visitId)) findings.push({ severity: 'warning', message: `Visit "${col.visitName}" has no scheduled assessments.` });
  }

  // Assessments scheduled at no visit.
  const unscheduledAssessments = matrix.rows.filter((r) => r.visitCount === 0).map((r) => r.assessmentId);
  for (const r of matrix.rows) {
    if (r.visitCount === 0) findings.push({ severity: 'warning', message: `Assessment "${r.name}" is not scheduled at any visit.` });
  }

  // Eligibility/screening coverage.
  if (matrix.rows.length > 0 && !assessments.some((a) => a.category === 'eligibility')) {
    findings.push({ severity: 'info', message: 'No eligibility/screening assessment categorized — confirm screening is captured.' });
  }

  const valid = !findings.some((f) => f.severity === 'critical');
  return { valid, findings, emptyVisits, unscheduledAssessments, basis: ICH_M11_SOA };
}

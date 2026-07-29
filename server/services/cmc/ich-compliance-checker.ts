/**
 * Deterministic ICH compliance checker for a CMC project.
 *
 * Pulls inputs from the project's actual stored data (quality_specifications,
 * analytical_methods, stability_studies, drug_substances,
 * manufacturing_processes, cmc_source_objects, cmc_module3_sections) and
 * delegates to the pure rules module for per-guideline evaluation.
 *
 * Covers Q1A(R2), Q2(R1), Q3A(R2)/Q3B(R2), Q3D(R2), Q6A/Q6B, Q8(R2),
 * Q9, Q10 — i.e. the guidelines most commonly cited at FDA RTF.
 *
 * @module server/services/cmc/ich-compliance-checker
 */

import { getPool } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import {
  checkQ1A, checkQ2, checkQ3AandQ3B, checkQ3D,
  checkQ6AandQ6B, checkQ8, checkQ9, checkQ10,
  type IchGuideline, type CheckStatus, type IchCheckFinding, type ProjectInputs,
} from './ich-compliance-rules';

export type { IchGuideline, CheckStatus, IchCheckFinding, ProjectInputs } from './ich-compliance-rules';
export {
  checkQ1A, checkQ2, checkQ3AandQ3B, checkQ3D,
  checkQ6AandQ6B, checkQ8, checkQ9, checkQ10,
} from './ich-compliance-rules';

const log = createScopedLogger('cmc-ich-compliance');

export interface IchComplianceReport {
  projectId: string;
  organizationId: number;
  overallStatus: 'compliant' | 'warnings' | 'non_compliant';
  guidelineStatus: Record<IchGuideline, CheckStatus>;
  findings: IchCheckFinding[];
  counts: { pass: number; warning: number; fail: number; not_applicable: number };
  evaluatedAt: string;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function runIchComplianceCheck(
  orgId: number,
  projectId: string,
): Promise<IchComplianceReport> {
  const inputs = await gatherInputs(orgId, projectId);

  const findings: IchCheckFinding[] = [
    ...checkQ1A(inputs),
    ...checkQ2(inputs),
    ...checkQ3AandQ3B(inputs),
    ...checkQ3D(inputs),
    ...checkQ6AandQ6B(inputs),
    ...checkQ8(inputs),
    ...checkQ9(inputs),
    ...checkQ10(inputs),
  ];

  const counts = { pass: 0, warning: 0, fail: 0, not_applicable: 0 };
  for (const f of findings) counts[f.status]++;

  const guidelineStatus: Record<IchGuideline, CheckStatus> = {
    'Q1A(R2)': 'not_applicable',
    'Q2(R1)':  'not_applicable',
    'Q3A(R2)': 'not_applicable',
    'Q3B(R2)': 'not_applicable',
    'Q3D(R2)': 'not_applicable',
    'Q6A':     'not_applicable',
    'Q6B':     'not_applicable',
    'Q8(R2)':  'not_applicable',
    'Q9':      'not_applicable',
    'Q10':     'not_applicable',
  };
  const severityRank: Record<CheckStatus, number> = {
    fail: 3, warning: 2, pass: 1, not_applicable: 0,
  };
  for (const f of findings) {
    if (severityRank[f.status] > severityRank[guidelineStatus[f.guideline]]) {
      guidelineStatus[f.guideline] = f.status;
    }
  }

  let overallStatus: 'compliant' | 'warnings' | 'non_compliant' = 'compliant';
  if (counts.fail > 0) overallStatus = 'non_compliant';
  else if (counts.warning > 0) overallStatus = 'warnings';

  log.info('ICH compliance check complete', {
    projectId,
    overallStatus,
    findingCount: findings.length,
    counts,
  });

  return {
    projectId,
    organizationId: orgId,
    overallStatus,
    guidelineStatus,
    findings,
    counts,
    evaluatedAt: new Date().toISOString(),
  };
}

// ─── Input gathering — DB-bound ──────────────────────────────────────────────

async function gatherInputs(orgId: number, projectId: string): Promise<ProjectInputs> {
  const pool = getPool();
  const projectIdParam = String(projectId);

  const safe = async (sql: string, params: unknown[]) => {
    try {
      const { rows } = await pool.query(sql, params);
      return rows;
    } catch (err) {
      log.warn('Input query failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  };

  const [specs, methods, stability, drugSubs, processes, sourceObjects, sections] =
    await Promise.all([
      safe(`SELECT material_type AS "materialType", material_name AS "materialName",
                   test_parameters AS "testParameters",
                   acceptance_criteria AS "acceptanceCriteria",
                   justification
            FROM quality_specifications WHERE project_id = $1::text::uuid`,
        [projectIdParam]),
      safe(`SELECT method_name AS "methodName", method_type AS "methodType",
                   purpose, validation_status AS "validationStatus",
                   specificity_data AS "specificityData",
                   linearity_data AS "linearityData",
                   accuracy_data AS "accuracyData",
                   precision_data AS "precisionData",
                   robustness_data AS "robustnessData"
            FROM analytical_methods WHERE project_id = $1::text::uuid`,
        [projectIdParam]),
      safe(`SELECT study_name AS "studyName", study_type AS "studyType",
                   storage_condition AS "storageCondition", duration, status, results
            FROM stability_studies WHERE project_id = $1::text::uuid`,
        [projectIdParam]),
      safe(`SELECT substance_name AS "substanceName", impurities,
                   characterization_data AS "characterizationData"
            FROM drug_substances WHERE project_id = $1::text::uuid`,
        [projectIdParam]),
      safe(`SELECT process_name AS "processName", process_type AS "processType",
                   process_steps AS "processSteps",
                   critical_process_parameters AS "criticalProcessParameters",
                   process_controls AS "processControls",
                   validation_status AS "validationStatus"
            FROM manufacturing_processes WHERE project_id = $1::text::uuid`,
        [projectIdParam]),
      safe(`SELECT source_type AS "sourceType",
                   source_payload AS "sourcePayload",
                   source_key AS "sourceKey"
            FROM cmc_source_objects
            WHERE organization_id = $1 AND project_id::text = $2`,
        [orgId, projectIdParam]),
      safe(`SELECT section_key AS "sectionKey",
                   approval_state AS "approvalState",
                   stale,
                   narrative_text AS "narrativeText"
            FROM cmc_module3_sections
            WHERE organization_id = $1 AND project_id::text = $2`,
        [orgId, projectIdParam]),
    ]);

  return { specs, methods, stability, drugSubs, processes, sourceObjects, sections };
}

/**
 * @fileoverview Minimal Phase-1 IND fixtures for the submission-package
 * orchestrator E2E smoke test.
 * @module tests/integration/orchestrator-e2e-ind-fixtures
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS
 * ─────────────────────────────────────────────────────────────────────────────
 * A single exported builder, `buildMinimalIndOrchestratorInputs(orgId, userId)`,
 * that returns a deterministic Phase-1 IND `OrchestratorInputs` payload
 * exercising the full Move-1 → Move-6 pipeline:
 *
 *     m3.compose → m3.refine (skipped, useAI omitted) → m3.appendices
 *       → m3.regional → csr.tabulate (skipped, no CSR) → m2.3.qos
 *       → m2.4.nonclinical → m2.5.clinical (skipped, no CSR)
 *       → m2.7.clinical (skipped, no CSR) → csr.draft-narrative (skipped)
 *       → m1.admin → package.assemble → package.validate
 *
 * Two `CanonicalSource` entries (drug_substance + drug_product) drive Module 3
 * composition. Three `NonclinicalStudy` entries (pharmacology / PK / tox)
 * drive Module 2.4. The CSR arrays are intentionally empty: a Phase-1 IND has
 * no completed clinical study reports, which exercises the orchestrator's
 * "no CSR" skip paths for csr.tabulate, m2.5.clinical, m2.7.clinical, and
 * csr.draft-narrative — paths that would otherwise be silently uncovered.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RATIONALE — WHY "MINIMAL HAPPY PATH"
 * ─────────────────────────────────────────────────────────────────────────────
 * These fixtures are INTENTIONALLY MINIMAL. They exist to exercise the
 * orchestrator's state machine and step transitions end-to-end:
 *
 *   - Every step is reached (running → complete | skipped).
 *   - Dependency ordering holds (downstream steps see upstream outputs).
 *   - The run rolls up to a deterministic terminal status (`complete`
 *     when skipValidation=true is set by the test, or whatever the validator
 *     returns when it is not).
 *   - Status transitions are persisted (the test asserts against the
 *     final `run.steps[]` array).
 *
 * They are NOT meant to:
 *
 *   - Exercise the depth of any individual builder (e.g. every M2.3 narrative
 *     branch, every CSR table column, every regional rule). Those are the
 *     responsibility of the per-builder unit tests under
 *     server/__tests__/services/ and tests/unit/.
 *   - Represent realistic customer data. The payloads are anonymized stubs
 *     with the minimum field set each builder requires to produce a non-empty
 *     output. Numbers, dose levels, study identifiers, and indication strings
 *     are illustrative only.
 *   - Substitute for a QA-grade smoke against real submission data. That is
 *     a separate test (and outside this brief).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM
 * ─────────────────────────────────────────────────────────────────────────────
 * No `Math.random()`, no `Date.now()`, no `crypto.randomUUID()`. Every value
 * is a literal. Running the builder twice with the same args produces a
 * byte-identical payload — required by the orchestrator's input-hash logic
 * (sha256 over JSON-serialized inputs) so a re-run does not appear `stale`.
 */

import type { OrchestratorInputs } from '../../server/services/submission-package-orchestrator';
import type { CanonicalSource } from '../../server/services/module3Composer';
import type { NonclinicalStudy } from '../../server/services/m2-summary-builders';

/**
 * Build a minimal, deterministic Phase-1 IND `OrchestratorInputs` payload.
 *
 * @param orgId  Tenant scope. Required by the Move-1 tenant gate
 *               (runOrchestrator throws if non-positive). Test callers should
 *               supply a stable placeholder (e.g. 1) — the orchestrator does
 *               not require the org to exist in the DB when persistRun's
 *               errors are mocked or absorbed.
 * @param userId Actor id. Required by Move-5 (m3.refine) and Move-6
 *               (csr.draft-narrative) for Part-11 attribution. Unused by
 *               this fixture because useAI / enableCSRNarrative are both
 *               omitted, but supplied for symmetry with the production
 *               OrchestratorInputs shape and for forward compatibility if
 *               a future test variant flips those flags on.
 */
export function buildMinimalIndOrchestratorInputs(
  orgId: number,
  userId: number,
): OrchestratorInputs {
  // ── Module 3 sources ─────────────────────────────────────────────────────
  // Two sources is the minimum that lets composeFullModule3 emit at least
  // one S-section, one P-section, and the structural 3.1 / 3.3 sections
  // (both require drug_substance + drug_product). The payloads carry just
  // the required fields per MODULE3_SECTION_RULES — no impurity profile, no
  // stability, no container/closure — so most subsections will have gaps,
  // which is the realistic Phase-1 IND shape.
  const drugSubstanceSource: CanonicalSource = {
    id: 'fixture-ds-001',
    sourceType: 'drug_substance',
    sourcePayload: {
      name: 'Compound-IND-Test',
      manufacturer: 'Test Manufacturing Site, Inc.',
      structuralElucidation: 'NMR, MS, IR confirmed',
      physicochemicalProperties: 'White crystalline solid, MW 412.5',
    },
    organizationId: orgId,
  };

  const drugProductSource: CanonicalSource = {
    id: 'fixture-dp-001',
    sourceType: 'drug_product',
    sourcePayload: {
      dosageFormDescription: 'Immediate-release film-coated tablet',
      composition: 'Compound-IND-Test, lactose monohydrate, MCC, magnesium stearate',
      strength: '10 mg',
    },
    organizationId: orgId,
  };

  // ── Module 4 nonclinical studies ────────────────────────────────────────
  // The three study types here cover the FDA Phase-1 IND minimum
  // expectations: a primary pharmacology study, a single-dose PK study,
  // and a repeat-dose toxicology study. Just enough for
  // buildM24NonclinicalOverview to emit a non-empty narrative + tables;
  // none of the optional fields (noael, glpStatus, doseLevels) are
  // exercised exhaustively.
  const pharmacologyStudy: NonclinicalStudy = {
    studyId: 'NC-PHARM-001',
    studyType: 'pharmacology',
    species: 'mouse',
    duration: 'single-dose',
    doseLevels: ['1 mg/kg', '10 mg/kg', '100 mg/kg'],
    primaryFinding: 'Dose-dependent target engagement at 10 mg/kg and above',
    glpStatus: 'non-GLP',
    reportSection: 'm4.2.1',
  };

  const pkStudy: NonclinicalStudy = {
    studyId: 'NC-PK-001',
    studyType: 'pharmacokinetics',
    species: 'rat',
    duration: 'single-dose',
    doseLevels: ['1 mg/kg', '10 mg/kg', '100 mg/kg'],
    primaryFinding: 'Linear PK across tested range, t1/2 approximately 4 hours',
    glpStatus: 'non-GLP',
    reportSection: 'm4.2.2',
  };

  const toxicologyStudy: NonclinicalStudy = {
    studyId: 'NC-TOX-001',
    studyType: 'toxicology',
    species: 'rat',
    duration: '28 days',
    doseLevels: ['10 mg/kg/day', '50 mg/kg/day', '250 mg/kg/day'],
    primaryFinding: 'No adverse findings up to 50 mg/kg/day',
    noael: '50 mg/kg/day',
    glpStatus: 'GLP',
    reportSection: 'm4.2.3',
  };

  // ── OrchestratorInputs assembly ─────────────────────────────────────────
  // Phase-1 IND deliberately has:
  //   - empty csrInputs   → m2.5.clinical, m2.7.clinical skip (no CSR data)
  //   - empty clinicalStudyData → csr.tabulate skips
  //   - useAI omitted     → m3.refine skips
  //   - enableCSRNarrative omitted → csr.draft-narrative skips
  // This is the path that pre-IND submissions actually take; exercising
  // it as the smoke baseline catches regressions where a `skipped` step
  // gets accidentally promoted to `failed` because a builder was called
  // with an empty input it does not handle.
  return {
    organizationId: orgId,
    submissionId: 'fixture-ind-submission-001',
    applicationNumber: 'IND-TEST-001',
    sequenceNumber: '0000',
    region: 'US',
    submissionType: 'IND',
    cmcSources: [drugSubstanceSource, drugProductSource],
    nonclinicalStudies: [pharmacologyStudy, pkStudy, toxicologyStudy],
    clinicalStudyData: [],
    csrInputs: [],
    drugSubstanceName: 'Compound-IND-Test',
    drugProductName: 'Compound-IND-Test 10 mg tablets',
    indication: 'investigational indication (Phase 1 first-in-human)',
    userId,
    // useAI, enableCSRNarrative, projectId, skipValidation intentionally
    // omitted. Tests can spread the result and add `skipValidation: true`
    // (or any other field) to vary the run without rebuilding the fixture.
  };
}

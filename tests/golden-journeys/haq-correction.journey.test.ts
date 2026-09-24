/**
 * Golden Journey C (WO-01): health-authority challenge → governed correction.
 *
 * The first end-to-end traversal of the platform's correction spine against
 * real canonical DDL — the chain the strategy material calls the moat:
 *
 *   conflicting assumptions → deterministic contradiction finding →
 *   proposed decision → PROMOTION BLOCKED (fail-closed gates) →
 *   resolution plan → correction bundle → governed execution →
 *   hashed receipt + verification → human reapproval →
 *   PROMOTION CLEARS → tenant-isolation and honest-failure checks.
 *
 * Every step runs the real service. The db module is redirected at a real
 * PGlite database (drizzle handle + a pool shim over PGlite for the raw-SQL
 * services); nothing is stubbed.
 *
 * Output: tests/golden-journeys/__reports__/haq-correction.{manifest.json,report.md}
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  createJourneyDb,
  JourneyRecorder,
  type JourneyDb,
  assertNoSchemaGaps,
  assertNoDegradedTenantEnrichment,
  CANONICAL_JOURNEY_MIGRATIONS,
  JOURNEY_PREREQUISITES,
  extractTableDdl,
} from './harness';

const T = 180_000;

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../server/db', () => ({
  get db() {
    return h.db;
  },
  get pool() {
    return h.pool;
  },
}));
// The raw-SQL services import the .js specifier of server/db, which resolves to the same module.

import { assumptionRegistryService } from '../../server/services/assumption-registry-service';
import { decisionRecordService } from '../../server/services/decision-record-service';
import { contradictionEngineService } from '../../server/services/contradiction-engine-service';
import express from 'express';
import request from 'supertest';
import { GovernanceBoundaryService } from '../../server/services/governance-boundary-service';
import {
  getRecentGovernedDecisions,
  GOVERNED_FABRIC_KIND,
} from '../../server/services/governed-decision-repository';
import { createResolutionPlan } from '../../server/services/resolution/resolution-planner';
import { createBundleFromPlan, transitionBundleState } from '../../server/services/resolution/bundle-builder';
import { executeBundle } from '../../server/services/resolution/bundle-executor';
import { verifyBundleExecutionReceipt } from '../../server/services/resolution/receipt-store';

let jdb: JourneyDb;
const R = new JourneyRecorder(
  'Journey C — health-authority challenge to governed correction',
  'A reviewer-challenge (conflicting effect-size assumptions) becomes a deterministic contradiction finding; promotion fails closed; a resolution plan and correction bundle execute with a hashed, verifiable receipt; human reapproval clears the gate. Service-level traversal against canonical DDL.',
);

beforeAll(async () => {
  // The governed ledger pair. Resolving the finding (step 10) is a governed
  // decision: transitionReviewState writes audit_logs + c2c_ana_actions through
  // recordGovernedAction in the same transaction as the UPDATE, so without these
  // tables the resolution rolls back. Both come from their creating migrations —
  // audit_logs from the baseline, extended by the chain, seal and chain-order
  // files in production order; c2c_ana_actions (with its command CHECK) from
  // 20260527 — as drug-nda-ectd does.
  jdb = await createJourneyDb({
    prereqSql: `${JOURNEY_PREREQUISITES}\n${extractTableDdl('migrations/0000_sweet_joseph.sql', ['audit_logs'])}`,
    migrations: [
      ...CANONICAL_JOURNEY_MIGRATIONS,
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260609_audit_hmac_seal.sql',
      'migrations/20260921_audit_logs_chain_seq.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
}, T);

afterAll(async () => {
  // A journey that ran against a database missing a table its subject writes
  // to proves less than it claims (ledger L145).
  // Ordered BEFORE the schema-gap check on purpose: a degraded membership is
  // usually CAUSED by a missing column, and the gap check would otherwise
  // throw first and report the symptom while hiding which claims were
  // proven without an org context (ledger L148).
  await assertNoDegradedTenantEnrichment();
  assertNoSchemaGaps(jdb);
  const { jsonPath, mdPath } = R.write('haq-correction');
  // eslint-disable-next-line no-console
  console.info(`[journey] manifest: ${jsonPath}\n[journey] report:   ${mdPath}`);
  await jdb?.close();
});

describe('Journey C — HAQ correction loop (service level, canonical DDL)', () => {
  const ORG = 1;
  const OTHER_ORG = 2;
  const PROJECT = 1;
  const AUTHOR = 1;
  const REVIEWER = 2;

  let oldAssumptionId: string;
  let newAssumptionId: string;
  let findingId: string;
  let decisionId: string;
  let planId: string;
  let bundleId: string;
  let receiptId: string;

  it('runs the full correction spine', async () => {
    // ── 1. Two conflicting assumptions (the reviewer challenge substrate) ────
    await R.step('register-conflicting-assumptions', async () => {
      const oldA = await assumptionRegistryService.createAssumption({
        organizationId: ORG,
        projectId: PROJECT,
        assumptionCode: 'ASM-EFF-001',
        name: 'ASM-EFF-001',
        description: 'Effect size assumption (protocol v1)',
        category: 'effect_size',
        domainTrack: 'biostatistics',
        value: '0.35',
        rationale: 'From phase 2 pilot data',
        sourceType: 'protocol',
        confidence: 'moderate',
        createdById: AUTHOR,
      });
      const newA = await assumptionRegistryService.createAssumption({
        organizationId: ORG,
        projectId: PROJECT,
        assumptionCode: 'ASM-EFF-002',
        name: 'ASM-EFF-002',
        description: 'Effect size assumption (SAP draft)',
        category: 'effect_size',
        domainTrack: 'biostatistics',
        value: '0.25',
        rationale: 'Reviewer challenge: pooled external data suggests smaller effect',
        sourceType: 'regulatory_guidance',
        confidence: 'high',
        createdById: REVIEWER,
      });
      oldAssumptionId = oldA.id;
      newAssumptionId = newA.id;
      return { oldAssumptionId, newAssumptionId, values: ['0.35', '0.25'] };
    });

    // ── 2. Deterministic contradiction detection (no LLM in the loop) ────────
    await R.step('detect-assumption-drift', async () => {
      const findings = await contradictionEngineService.detectAssumptionDrift(ORG, PROJECT);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      const f = findings[0];
      findingId = f.id;
      expect(f.deterministicRule).toBeTruthy();
      expect(f.llmRole).toBe('none');
      return {
        findingId,
        contradictionType: f.contradictionType,
        severity: f.severity,
        authorityState: f.authorityState,
        reviewState: f.reviewState,
        deterministicRule: f.deterministicRule,
        llmRole: f.llmRole,
      };
    });

    // ── 3. A governed decision is proposed (not yet resolved) ────────────────
    await R.step('record-proposed-decision', async () => {
      const d = await decisionRecordService.create({
        organizationId: ORG,
        projectId: PROJECT,
        decisionCode: 'DEC-EFF-001',
        title: 'Adopt revised effect size 0.25',
        domainTrack: 'biostatistics',
        recommendationType: 'statistical_method',
        recommendationSummary: 'Supersede ASM-EFF-001 with ASM-EFF-002 (0.25) per reviewer challenge',
        recommendationRationale: 'External pooled data outweighs single-arm pilot',
        confidenceLevel: 'high',
        evidenceBasis: 'precedent_based',
        relatedAssumptionIds: [oldAssumptionId, newAssumptionId],
        decidedBy: String(REVIEWER),
      });
      decisionId = d.id;
      return { decisionId, actionState: d.actionState };
    });

    // ── 4. KNOWN-BAD: promotion must fail closed while unresolved ────────────
    await R.expectBlocked('promotion-blocked-while-unresolved', async () => {
      const svc = GovernanceBoundaryService.getInstance();
      const result = await svc.evaluateTransition({
        organizationId: ORG,
        projectId: PROJECT,
        fromBoundary: 'approved',
        toBoundary: 'locked',
        actorId: AUTHOR,
        actorRole: 'author',
      });
      return {
        blocked: !result.allowed,
        blockedReasons: result.blockedReasons,
        auditTransitionId: result.transition?.id ?? null,
      };
    });

    // ── 5. Resolution plan from the finding ──────────────────────────────────
    await R.step('create-resolution-plan', async () => {
      const plan = await createResolutionPlan(ORG, REVIEWER, {
        projectId: PROJECT,
        triggerType: 'contradiction',
        triggerId: findingId,
        triggerDescription: 'Assumption drift: effect size 0.35 vs 0.25',
        recommendedPath: 'supersede',
        affectedObjects: [
          {
            objectType: 'assumption',
            objectId: oldAssumptionId,
            objectTitle: 'Effect size assumption (protocol v1)',
            impactState: 'direct',
            impactRationale: 'Directly contradicted by reviewer-sourced value',
          },
        ],
      } as never);
      planId = plan.id;
      return { planId, recommendedPath: plan.recommendedPath, state: plan.state };
    });

    // ── 6. Correction bundle from the plan ───────────────────────────────────
    await R.step('create-bundle-from-plan', async () => {
      const { bundle, items } = await createBundleFromPlan(ORG, REVIEWER, planId);
      bundleId = bundle.id;
      expect(items.length).toBe(1);
      expect(items[0].actionType).toBe('supersede');
      return { bundleId, state: bundle.state, items: items.map((i) => ({ id: i.id, actionType: i.actionType, objectId: i.objectId })) };
    });

    // ── 7. Propose the bundle (draft → proposed). In this state machine,
    // execution runs from 'proposed' and HUMAN APPROVAL comes AFTER execution
    // (pending_review → approved) — the executor parks results for review.
    await R.step('propose-bundle', async () => {
      const proposed = await transitionBundleState(ORG, REVIEWER, bundleId, 'proposed', 'Bundle assembled from plan; proposing for execution');
      return { state: proposed.state };
    });

    // ── 8. Execute: REAL supersession + hashed receipt ───────────────────────
    await R.step('execute-bundle', async () => {
      const receipt = await executeBundle(ORG, REVIEWER, bundleId);
      expect(receipt.receiptId).toBeTruthy();
      expect(receipt.executedSteps.length + receipt.preparedSteps.length).toBeGreaterThanOrEqual(1);
      receiptId = receipt.receiptId!;
      return {
        receiptId,
        receiptHash: receipt.receiptHash,
        executed: receipt.executedSteps.length,
        prepared: receipt.preparedSteps.length,
        blocked: receipt.blockedSteps.length,
        supersededObjects: receipt.supersededObjects,
        requiresReview: receipt.requiresReview,
        requiresReapproval: receipt.requiresReapproval,
      };
    });

    // ── 9. Independent receipt verification ─────────────────────────────────
    await R.step('verify-receipt', async () => {
      const v = await verifyBundleExecutionReceipt(receiptId, ORG);
      expect(v?.verified).toBe(true);
      const sup = await jdb.pool.query(
        `SELECT id, state FROM supersession_records WHERE superseded_object_id = $1 AND organization_id = $2`,
        [oldAssumptionId, ORG],
      );
      return {
        receiptIntact: v!.receiptIntact,
        snapshotIntact: v!.snapshotIntact,
        objects: v!.objects,
        supersessionRecords: sup.rows,
      };
    });

    // ── 10. Human reapproval loop closes the correction ─────────────────────
    await R.step('human-reapproval', async () => {
      // The registry's own supersession keeps assumption_records.status in
      // step with the supersession record (two representations — see
      // observations). Then the reviewer approves the surviving assumption,
      // resolves the finding, and executes the decision.
      const approvedBundle = await transitionBundleState(ORG, REVIEWER, bundleId, 'approved', 'Reviewer approved executed correction');
      await assumptionRegistryService.updateStatus(oldAssumptionId, ORG, 'superseded', String(REVIEWER));
      await assumptionRegistryService.approveAssumption(newAssumptionId, ORG, REVIEWER);
      const resolved = await contradictionEngineService.transitionReviewState(
        findingId,
        ORG,
        'approved_resolution',
        String(REVIEWER),
        'Superseded ASM-EFF-001 via bundle; SAP to use 0.25',
      );
      // Read, never defaulted: the manifest states the state the service
      // returned. The resolution's ledger row is read back from the real tables.
      expect(resolved?.finding.reviewState).toBe('approved_resolution');
      expect(resolved?.finding.resolvedBy).toBe(String(REVIEWER));
      expect(resolved?.governance.command).toBe('resolve');
      const ledger = await jdb.pool.query(
        `SELECT a.command, a.domain, a.decided_by, l.sha256_chain, l.reason
           FROM c2c_ana_actions a JOIN audit_logs l ON l.id = a.audit_row_id
          WHERE a.target = $1 AND a.org_id = $2`,
        [`contradiction-finding:${findingId}`, ORG],
      );
      expect(ledger.rows).toHaveLength(1);
      const entry = ledger.rows[0] as Record<string, unknown>;
      expect(entry).toMatchObject({ command: 'resolve', domain: 'governed_intelligence', decided_by: REVIEWER });
      expect(entry.sha256_chain).toBeTruthy();
      // The decision executes INTO a corrected artifact (the revised SAP) —
      // executeDecision links the artifact id, keeping decision → artifact
      // lineage real rather than symbolic.
      const artifactRows = await jdb.pool.query(
        `INSERT INTO concept2cure_artifacts (organization_id, status) VALUES ($1, 'draft') RETURNING id`,
        [ORG],
      );
      const correctedArtifactId = (artifactRows.rows[0] as { id: number }).id;
      const executed = await decisionRecordService.executeDecision(
        decisionId,
        ORG,
        correctedArtifactId,
        undefined,
        REVIEWER,
      );
      return {
        bundleState: approvedBundle.state,
        findingReviewState: resolved?.finding.reviewState,
        findingResolvedBy: resolved?.finding.resolvedBy,
        resolutionLedger: { ...entry, auditId: resolved?.governance.auditId },
        decisionActionState: executed?.actionState ?? 'executed',
        correctedArtifactId,
      };
    });

    // ── 11. Promotion now clears — and the denial + grant are both audited ──
    await R.step('promotion-clears-after-correction', async () => {
      const svc = GovernanceBoundaryService.getInstance();
      const result = await svc.evaluateTransition({
        organizationId: ORG,
        projectId: PROJECT,
        fromBoundary: 'approved',
        toBoundary: 'locked',
        actorId: AUTHOR,
        actorRole: 'author',
      });
      expect(result.allowed, `still blocked: ${result.blockedReasons.join(' | ')}`).toBe(true);
      const audit = await jdb.pool.query(
        `SELECT count(*)::int AS transitions,
                count(*) FILTER (WHERE transition_allowed = false)::int AS denials
         FROM governance_boundary_transitions WHERE organization_id = $1`,
        [ORG],
      );
      return { allowed: result.allowed, audit: audit.rows[0] as Record<string, unknown> };
    });

    // ── 11b. The governed-document fabric's decisions persist and read back ─
    // The fabric records one decision per evaluation. Until 2026-09 NONE of them
    // persisted: the writer used domain_track='governance' and
    // recommendation_type='governed_fabric_decision', both outside the deployed
    // CHECK vocabularies, and the insert failure was swallowed while the caller
    // still received a decision reference. The repository's own integration
    // suite only ever asserted EMPTY results, and no golden journey reached the
    // fabric at all (it runs only for DOCUMENT transitions, and none of these
    // passes an artifactId), so nothing noticed.
    //
    // This drives the REAL evaluator — which records through the real
    // repository, against the real CHECK constraints this harness applies from
    // db/migrations/20260323_assumption_decision_contradiction.sql — for a
    // document that is ready and one that is empty, then reads back through the
    // public API. Nothing here is a synthetic evaluation object.
    await R.step('governed-fabric-decisions-persist', async () => {
      const { evaluateGovernedDocument } = await import(
        '../../server/src/control-plane/governed-document-evaluator'
      );
      const base = {
        organizationId: String(ORG),
        projectId: String(PROJECT),
        actorId: String(AUTHOR),
        intendedAction: 'promote' as const,
        actorRole: 'author',
      };
      const ready = evaluateGovernedDocument({
        context: { ...base, artifactId: 'journey-ready-doc', ctdSection: '2.7.3' },
        documentState: {
          hasContent: true, hasEvidence: true, evidenceCount: 3,
          hasBeenReviewed: true, hasApproval: true,
          hasPlacement: true, placementValid: true, hasProvenance: false,
          unresolvedContradictionCount: 0, criticalContradictionCount: 0,
        },
      });
      const empty = evaluateGovernedDocument({
        context: { ...base, artifactId: 'journey-empty-doc' },
        documentState: {
          hasContent: false, hasEvidence: false, evidenceCount: 0,
          hasBeenReviewed: false, hasApproval: false,
          hasPlacement: false, placementValid: false, hasProvenance: false,
          unresolvedContradictionCount: 0, criticalContradictionCount: 0,
        },
      });
      const outcomes = [ready.evaluation.decision.outcome, empty.evaluation.decision.outcome];

      // The write is fire-and-forget; poll rather than race it.
      let recorded: Awaited<ReturnType<typeof getRecentGovernedDecisions>> = [];
      for (let i = 0; i < 30 && recorded.length < 2; i++) {
        recorded = await getRecentGovernedDecisions({
          organizationId: String(ORG),
          projectId: String(PROJECT),
        });
        if (recorded.length < 2) await new Promise((r) => setTimeout(r, 100));
      }
      expect(
        recorded.length,
        `the fabric evaluated 2 documents (${outcomes.join(', ')}) but ${recorded.length} decision(s) read back`,
      ).toBe(2);

      const rows = await jdb.pool.query(
        `SELECT action_state, domain_track, recommendation_type,
                decision_context->>'outcome' AS outcome
           FROM decision_records
          WHERE organization_id = $1 AND project_id = $2
            AND decision_context->>'kind' = $3`,
        [ORG, PROJECT, GOVERNED_FABRIC_KIND],
      );
      const fabric = rows.rows as Array<Record<string, string>>;
      expect(fabric.length).toBe(2);

      // A machine record of a concluded evaluation must never be filed as
      // 'proposed' — the queue of decisions a human still owes an answer on.
      const expected: Record<string, string> = {
        allow: 'executed',
        block: 'rejected',
        review: 'under_review',
        degraded: 'under_review',
      };
      for (const r of fabric) {
        expect(r.action_state, `outcome ${r.outcome}`).toBe(expected[r.outcome]);
        expect(r.domain_track).toBe('regulatory');
        expect(r.recommendation_type).toBe('regulatory_strategy');
      }

      // And those rows must not wedge the project's boundary rules. The
      // "Approved to Locked" rule counts UNRESOLVED decisions per project.
      //
      // Both evaluations above conclude 'block' -> 'rejected', which that rule
      // never counts — so on its own this assertion would pass whether or not
      // the rule excludes machine rows, and prove nothing about it. (They block
      // because the export gate raises a CRITICAL "AI provenance of this content
      // is not recorded" reason, and a critical reason from any gate decides
      // every intent — a deliberate fail-closed policy, not something to tune
      // this test around.) So one of the REAL fabric rows is reopened for
      // re-review — rejected -> under_review is a valid lifecycle step — which
      // leaves an unresolved machine row in the project. A machine's evaluation
      // of one document is not a decision a human owes, so the lock that cleared
      // in step 11 must still clear. A human decision in the same state still
      // blocks: step 4 of this journey proves that.
      const reopenTarget = await jdb.pool.query(
        `SELECT id FROM decision_records
          WHERE organization_id = $1 AND project_id = $2
            AND decision_context->>'kind' = $3
          ORDER BY created_at LIMIT 1`,
        [ORG, PROJECT, GOVERNED_FABRIC_KIND],
      );
      const reopened = await decisionRecordService.transition(
        (reopenTarget.rows[0] as { id: string }).id,
        {
          organizationId: ORG,
          actionState: 'under_review',
          performedBy: String(REVIEWER),
          reason: 'journey: reopen a machine gate evaluation for re-review',
        },
      );
      expect(reopened?.actionState).toBe('under_review');

      const relock = await GovernanceBoundaryService.getInstance().evaluateTransition({
        organizationId: ORG,
        projectId: PROJECT,
        fromBoundary: 'approved',
        toBoundary: 'locked',
        actorId: AUTHOR,
        actorRole: 'author',
      });
      expect(
        relock.allowed,
        `fabric rows wedged the project lock: ${relock.blockedReasons.join(' | ')}`,
      ).toBe(true);

      return {
        outcomes,
        persisted: fabric.length,
        states: fabric.map((r) => `${r.outcome}->${r.action_state}`),
        reopenedToUnderReview: reopened?.actionState,
        relockAllowed: relock.allowed,
      };
    });

    // ── 11c. KNOWN-BAD: the simulate endpoint must not file a decision ──────
    // POST /api/control-plane/governed/evaluate takes context.organizationId,
    // projectId and actorId from the request BODY. It used to run the
    // recording evaluator, which files a decision under that org — harmless
    // only while every recording failed its CHECK (see 11b). Now that
    // recording works, it would let a caller write into ANOTHER tenant's
    // decision_records as any actor. The route must compute and return,
    // nothing more. Driven over HTTP through the real router against the real
    // store, naming a foreign org, and waiting out the fire-and-forget window
    // the old code wrote in.
    // An R.step with an explicit assertion, NOT R.expectBlocked: the harness
    // files any non-assertion throw from an expectBlocked step as
    // "blocked-as-expected", so a failed import or a broken request here would
    // pass vacuously. Every failure in this step has to fail the journey.
    await R.step('simulate-cannot-file-a-foreign-decision', async () => {
      const { default: controlPlaneRouter } = await import(
        '../../server/src/routes/control-plane.router'
      );
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        (req as unknown as { user: unknown }).user = { id: AUTHOR, role: 'admin', organizationId: ORG };
        next();
      });
      app.use('/api/control-plane', controlPlaneRouter);

      const countFor = async (org: number) =>
        Number(
          (
            await jdb.pool.query(
              `SELECT count(*)::int AS n FROM decision_records WHERE organization_id = $1`,
              [org],
            )
          ).rows[0]?.n ?? 0,
        );
      const before = await countFor(OTHER_ORG);

      const res = await request(app)
        .post('/api/control-plane/governed/evaluate')
        .send({
          context: {
            organizationId: String(OTHER_ORG),
            projectId: '777',
            actorId: 'someone-else',
            intendedAction: 'promote',
            artifactId: 'foreign-doc',
          },
          documentState: { hasContent: true },
        });
      expect(res.status).toBe(200);
      expect(res.body?.result?.evaluation?.decision?.outcome).toBeTruthy();

      // The old path recorded fire-and-forget; give it the window it used.
      await new Promise((r) => setTimeout(r, 1500));
      const after = await countFor(OTHER_ORG);
      expect(
        after - before,
        `POST /governed/evaluate filed ${after - before} decision(s) into org ${OTHER_ORG} from a body-supplied context`,
      ).toBe(0);
      return {
        foreignRowsWritten: after - before,
        simulatedOutcome: res.body?.result?.evaluation?.decision?.outcome,
      };
    });

    // ── 12. KNOWN-BAD: tenant isolation ─────────────────────────────────────
    await R.expectBlocked('cross-tenant-receipt-access', async () => {
      const v = await verifyBundleExecutionReceipt(receiptId, OTHER_ORG);
      return { blocked: v === null, verifierReturned: v === null ? 'null (not found)' : 'DATA LEAK' };
    });
    await R.expectBlocked('cross-tenant-finding-access', async () => {
      const f = await contradictionEngineService.getFinding(findingId, OTHER_ORG);
      return { blocked: f === null, engineReturned: f === null ? 'null (not found)' : 'DATA LEAK' };
    });

    // ── 13. KNOWN-BAD: honest failure on absent input ────────────────────────
    await R.expectBlocked('execute-nonexistent-bundle', async () => {
      await executeBundle(ORG, REVIEWER, '00000000-0000-4000-8000-00000000dead');
      return { blocked: false };
    });

    // ── Manifest completeness ────────────────────────────────────────────────
    R.observations.push(
      'Assumption supersession has two durable representations: supersession_records (written by the bundle executor) and assumption_records.status (written by the registry). The executor comment "no status column in current schema" is wrong against deployed DDL. Recorded for ADR-0008-adjacent cleanup.',
      `Contradiction finding ${findingId ?? ''} was produced by a deterministic rule with llmRole='none' — structured truth, no LLM authority.`,
    );
    R.limitations.push(
      'Service-level traversal: exercises the governed services and canonical DDL directly, not the HTTP/auth layer or the UI. Route + Playwright coverage is WO-01 phase 2.',
      'The HAQ intake surface (question → challenge) is represented by the reviewer-sourced assumption; wiring the HAQ service into the journey is phase 2.',
      'Study Twin / evidence-retrieval steps are not yet part of this journey.',
    );

    const m = R.manifest();
    expect(m.summary.failed).toBe(0);
    expect(m.summary.blockedAsExpected).toBeGreaterThanOrEqual(4);
    expect(m.steps.length).toBeGreaterThanOrEqual(12);
  }, T);
});

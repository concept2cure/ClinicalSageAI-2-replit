/**
 * WO-16C finding #70 — every node of every decision-lineage graph carried a
 * Part 11 verdict nothing computed, and two nodes carried an actor and a time
 * nothing recorded.
 *
 * Three fabrications, all emitted into the file a customer downloads under the
 * heading "Decision Lineage Report — eCTD Audit Trail":
 *
 *   1. `regulatory.cfr11Compliant: true` was a literal at all five
 *      node-construction sites. No code anywhere in the repo computed it, yet
 *      it printed as `<cfr11-compliant>true</cfr11-compliant>`, as the CSV
 *      column "CFR 11 Compliant" = Yes, and as a "21 CFR §11" badge on 100% of
 *      nodes in the DecisionLineage surface.
 *   2. An approval still in `pending` — `completed_at` is NULL for exactly
 *      those rows — was stamped `performedAt = new Date()`, i.e. the moment the
 *      export was generated, and `performedBy = assignedTo[0]`: the person the
 *      step is WAITING ON reported as the person who performed it.
 *   3. An `audit_logs` row whose `user_id` is NULL (nullable column; every
 *      decision recorded through POST /record with a non-numeric performedBy
 *      lands that way, because auditService coerces a non-numeric actor to
 *      NULL) was reported as `performedBy: 'system'` — an actor that does not
 *      exist, substituted for one the record does not name.
 *
 * Failure is injected at the DEPENDENCY: `db` is a programmable drizzle-shaped
 * stub that returns rows with exactly the NULLs the schema permits — a pending
 * approval with `completedAt: null, completedBy: null`, and an audit row with
 * `userId: null`. The service under test runs for real over them; nothing about
 * the graph builder or the exporters is mocked.
 *
 * RED on the pre-fix head: the pending approval came back with
 * `performedAt` inside the test window and `performedBy: 'reviewer-assigned-1'`,
 * the null-actor audit row came back `performedBy: 'system'`, and every node
 * carried `regulatory.cfr11Compliant === true`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  documentWorkflows,
  workflowApprovals,
  workflowHistory,
  documentAuditLogs,
} from '../../../../shared/schema/unified_workflow';
import { auditLogs } from '../../../../shared/schema';

// ─── Programmable drizzle-shaped db stub, keyed by table identity ────────────

const rowsByTable = new Map<unknown, unknown[]>();

function setRows(table: unknown, rows: unknown[]) {
  rowsByTable.set(table, rows);
}

function makeSelectChain() {
  let activeTable: unknown = null;
  const chain: any = {
    from(t: unknown) {
      activeTable = t;
      return chain;
    },
    where() {
      return chain;
    },
    orderBy() {
      return chain;
    },
    limit() {
      return Promise.resolve(rowsByTable.get(activeTable) ?? []);
    },
    then(resolve: (rows: unknown[]) => void) {
      resolve(rowsByTable.get(activeTable) ?? []);
    },
  };
  return chain;
}

vi.mock('../../../db', () => ({
  db: { select: () => makeSelectChain() },
}));

const loggedEntries: Array<Record<string, unknown>> = [];

vi.mock('../../auditService', () => ({
  default: {
    verifyChain: async () => ({
      ran: true,
      valid: true,
      entriesVerified: 3,
      verifiedAt: '2026-09-11T08:00:00.000Z',
    }),
    logAction: async (entry: Record<string, unknown>) => {
      loggedEntries.push(entry);
    },
  },
}));

// Namespace import on purpose: `assessPart11Record` does not exist on the
// pre-fix head, and a named import of a missing export fails the whole module
// at link time instead of letting each assertion report its own defect.
import * as lineage from '../DecisionLineageService';

const decisionLineageService = lineage.decisionLineageService;

// ─── The rows. Every NULL below is one the live schema permits. ──────────────

/** completed_at / completed_by are nullable and are NULL for a pending step. */
const PENDING_APPROVAL = {
  id: 11,
  workflowId: 5,
  stepId: 1,
  stepOrder: 1,
  status: 'pending',
  assignedTo: ['reviewer-assigned-1', 'reviewer-assigned-2'],
  assignmentType: 'any',
  requiredActions: ['review'],
  completedBy: null,
  completedAt: null,
  comments: null,
};

const SIGNED_APPROVAL = {
  id: 12,
  workflowId: 5,
  stepId: 2,
  stepOrder: 2,
  status: 'approved',
  assignedTo: ['reviewer-assigned-3'],
  assignmentType: 'any',
  requiredActions: ['review'],
  completedBy: 'qa-lead-88',
  completedAt: new Date('2026-05-02T09:30:00.000Z'),
  comments: 'Approved with no findings',
};

/** audit_logs.user_id is nullable — NULL for every non-numeric actor. */
const UNATTRIBUTED_DECISION_ROW = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  tenantId: 7,
  userId: null,
  action: 'decision:approve',
  tableName: 'artifact',
  recordId: '42',
  newValues: { decisionId: 'DEC-1', performedBy: 'jane.doe@sponsor.example' },
  createdAt: new Date('2026-05-03T11:00:00.000Z'),
};

function seedRows() {
  rowsByTable.clear();
  setRows(documentWorkflows, [{ id: 5, documentId: 42, organizationId: 7 }]);
  setRows(workflowApprovals, [PENDING_APPROVAL, SIGNED_APPROVAL]);
  setRows(workflowHistory, [
    {
      id: 21,
      workflowId: 5,
      action: 'workflow_started',
      performedBy: 'author-12',
      createdAt: new Date('2026-05-01T08:00:00.000Z'),
      details: {},
    },
  ]);
  setRows(documentAuditLogs, [
    {
      id: 31,
      documentId: 42,
      action: 'status_changed',
      performedBy: 'author-12',
      performedAt: new Date('2026-05-01T08:05:00.000Z'),
      details: { fromStatus: 'draft', toStatus: 'review' },
    },
  ]);
  setRows(auditLogs, [UNATTRIBUTED_DECISION_ROW]);
}

beforeEach(() => {
  seedRows();
  loggedEntries.length = 0;
});

const graph = () => decisionLineageService.getLineageGraph('artifact', 42, 7);

describe('decision-lineage nodes: a pending approval is not reported as performed', () => {
  it('leaves performedAt null rather than stamping the moment the graph was built', async () => {
    const before = Date.now();
    const g = await graph();
    const after = Date.now();

    const pending = g.nodes.find(n => n.id === 'approval-11');
    expect(pending, 'the pending approval must still be in the graph').toBeDefined();
    expect(pending!.action).toBe('awaiting_decision');
    expect(pending!.performedAt).toBeNull();

    // Belt and braces: no node anywhere carries a timestamp minted during this
    // call, which is what "the report's own build time" looks like from here.
    for (const n of g.nodes) {
      if (n.performedAt === null) continue;
      const t = Date.parse(n.performedAt);
      expect(
        t >= before && t <= after,
        `${n.id} carries a timestamp minted while the graph was being built`,
      ).toBe(false);
    }
  });

  it('does not report the assignee as the performer', async () => {
    const pending = (await graph()).nodes.find(n => n.id === 'approval-11')!;

    expect(pending.performedBy).toBeNull();
    expect(pending.performedBy).not.toBe('reviewer-assigned-1');
    // The assignment is real and stays visible — as an assignment.
    expect(pending.details.assignedTo).toEqual(['reviewer-assigned-1', 'reviewer-assigned-2']);
  });

  it('reports the recorded completer, not the assignee, for a decided approval', async () => {
    const signed = (await graph()).nodes.find(n => n.id === 'approval-12')!;

    expect(signed.performedBy).toBe('qa-lead-88');
    expect(signed.performedAt).toBe('2026-05-02T09:30:00.000Z');
  });
});

describe('decision-lineage nodes: an unattributed audit row names no actor', () => {
  it('never substitutes the literal "system" for a NULL user_id in the graph', async () => {
    const node = (await graph()).nodes.find(n => n.id === `audit-${UNATTRIBUTED_DECISION_ROW.id}`);

    expect(node, 'the decision: audit row must still be in the graph').toBeDefined();
    expect(node!.performedBy).toBeNull();
    expect(node!.performedBy).not.toBe('system');
  });

  it('never substitutes "system" in queryDecisions either', async () => {
    const nodes = await decisionLineageService.queryDecisions({ organizationId: 7, limit: 10 });

    expect(nodes).toHaveLength(1);
    expect(nodes[0].performedBy).toBeNull();
    expect(nodes.some(n => n.performedBy === 'system')).toBe(false);
  });

  it('keeps the actor the caller named where the audit column cannot hold it', async () => {
    await decisionLineageService.recordDecision({
      organizationId: 7,
      entityType: 'artifact',
      entityId: 42,
      action: 'approve',
      performedBy: 'jane.doe@sponsor.example',
    });

    const details = loggedEntries[0].details as Record<string, unknown>;
    expect(details.performedBy).toBe('jane.doe@sponsor.example');
  });
});

describe('decision-lineage nodes: no node asserts Part 11 conformance nothing checked', () => {
  it('carries no cfr11Compliant field at all', async () => {
    const g = await graph();

    expect(g.nodes.length).toBeGreaterThan(0);
    for (const n of g.nodes) {
      expect(
        (n.regulatory as Record<string, unknown>).cfr11Compliant,
        `${n.id} still carries a hardcoded Part 11 verdict`,
      ).toBeUndefined();
    }
  });

  it('reports instead which required record elements each node actually carries', async () => {
    const g = await graph();

    const pending = g.nodes.find(n => n.id === 'approval-11')!;
    expect(pending.regulatory.part11RecordCheck.status).toBe('INCOMPLETE');
    expect(pending.regulatory.part11RecordCheck.missing).toEqual([
      'attributed-actor',
      'recorded-timestamp',
      'applied-signature',
    ]);

    /*
     * WO-16C #70 follow-up, from an adversarial review of the #70 fix.
     *
     * An approved approval must NOT read COMPLETE. `workflow_approvals` has no
     * signature column at all — status, assignedTo, completedBy, completedAt,
     * comments — so the `signatureStatus: 'signed'` the service derives is an
     * approval status relabelled, and this service never reads the real
     * signature store. Counting it as the §11.50 element PRESENT is a
     * signature manifestation nothing recorded: the same fabrication the fix
     * narrowed, surviving inside the field that replaced it.
     *
     * The signature element is therefore never ASSESSED here, and a record
     * whose other elements are present but whose signature was not checked is
     * PARTIAL, not COMPLETE.
     */
    const signed = g.nodes.find(n => n.id === 'approval-12')!;
    expect(signed.regulatory.part11RecordCheck.status).toBe('PARTIAL');
    expect(signed.regulatory.part11RecordCheck.missing).toEqual([]);
    expect(signed.regulatory.part11RecordCheck.notAssessed).toEqual(['applied-signature']);

    const unattributed = g.nodes.find(n => n.id === `audit-${UNATTRIBUTED_DECISION_ROW.id}`)!;
    expect(unattributed.regulatory.part11RecordCheck.status).toBe('INCOMPLETE');
    expect(unattributed.regulatory.part11RecordCheck.missing).toContain('attributed-actor');
  });

  it('assessPart11Record is a pure function of the record, with no default pass', () => {
    const assessPart11Record = lineage.assessPart11Record;
    expect(
      assessPart11Record({
        performedBy: null,
        performedAt: null,
        requiresSignature: false,
      }),
    ).toEqual({ status: 'INCOMPLETE', missing: ['attributed-actor', 'recorded-timestamp'], notAssessed: [] });

    expect(
      assessPart11Record({
        performedBy: 'user-1',
        performedAt: '2026-05-01T00:00:00.000Z',
        requiresSignature: true,
        signatureStatus: 'rejected',
      }),
    ).toEqual({ status: 'INCOMPLETE', missing: ['applied-signature'], notAssessed: [] });

    /*
     * WO-16C #70 follow-up. A record that REQUIRES a signature and that this
     * service did not check does not prove one: no signature store is read
     * here. The element is unchecked, so the record is PARTIAL — never
     * COMPLETE, which would assert a §11.50 manifestation nothing recorded.
     *
     * Second follow-up review: `'signed'` is no longer a member of
     * `SignatureStatus` at all, so the claim cannot be expressed. The two
     * remaining ways to reach this branch — an explicit `not_assessed`, and a
     * record that carries no status — both come back PARTIAL.
     */
    expect(
      assessPart11Record({
        performedBy: 'user-1',
        performedAt: '2026-05-01T00:00:00.000Z',
        requiresSignature: true,
        signatureStatus: 'not_assessed',
      }),
    ).toEqual({ status: 'PARTIAL', missing: [], notAssessed: ['applied-signature'] });

    expect(
      assessPart11Record({
        performedBy: 'user-1',
        performedAt: '2026-05-01T00:00:00.000Z',
        requiresSignature: true,
      }),
    ).toEqual({ status: 'PARTIAL', missing: [], notAssessed: ['applied-signature'] });

    // Nothing required, everything present: the only way to COMPLETE.
    expect(
      assessPart11Record({
        performedBy: 'user-1',
        performedAt: '2026-05-01T00:00:00.000Z',
        requiresSignature: false,
      }),
    ).toEqual({ status: 'COMPLETE', missing: [], notAssessed: [] });
  });
});

describe('decision-lineage exports: the downloaded audit file repeats none of it', () => {
  it('CSV prints the honest absence, not a substituted actor or time', async () => {
    const { data } = await decisionLineageService.exportLineage('artifact', 42, 'csv', 7);

    expect(data).not.toContain('CFR 11 Compliant');
    expect(data).not.toContain('"system"');
    // The Performed By / Performed At cells of the pending row say nothing was
    // recorded. The assignment is still in the row — as the assignment it is.
    expect(data).toContain('"awaiting_decision","not attributed","not recorded"');
    expect(data).not.toContain('"awaiting_decision","reviewer-assigned-1"');
    expect(data).toContain('""assignedTo"":[""reviewer-assigned-1"",""reviewer-assigned-2""]');
    expect(data).toContain('Part 11 Record Elements');
    // WO-16C #70 follow-up: the signature element is not checked here, so a
    // pending approval is missing the actor and the time and carries the
    // signature as unchecked — never as absent-or-satisfied.
    expect(data).toContain('INCOMPLETE (missing: attributed-actor; recorded-timestamp');
    expect(data).toContain('not assessed here: applied-signature');
  });

  it('XML marks the absent fields as absent rather than filling them', async () => {
    const { data } = await decisionLineageService.exportLineage('artifact', 42, 'xml', 7);

    expect(data).not.toContain('<cfr11-compliant>');
    expect(data).not.toContain('<performed-by>system</performed-by>');
    expect(data).not.toContain('<performed-by>reviewer-assigned-1</performed-by>');
    expect(data).toContain('<performed-by attributed="false" />');
    expect(data).toContain('<performed-at recorded="false" />');
    expect(data).toContain('<part11-record-elements status="INCOMPLETE"');
    // An approved approval is PARTIAL: nothing missing, signature unchecked.
    expect(data).toContain(
      '<part11-record-elements status="PARTIAL" missing="" not-assessed="applied-signature" />',
    );
    // A record needing no signature and carrying actor + time is legitimately
    // COMPLETE; what must not appear is a COMPLETE on one that required a
    // signature this service never checked.
    expect(data).not.toMatch(/status="COMPLETE"[^>]*not-assessed="applied-signature"/);
  });

  it('JSON carries null, not a stand-in a machine reader would trust', async () => {
    const { data } = await decisionLineageService.exportLineage('artifact', 42, 'json', 7);
    const parsed = JSON.parse(data) as {
      nodes: Array<{ id: string; performedBy: string | null; performedAt: string | null }>;
    };

    const pending = parsed.nodes.find(n => n.id === 'approval-11')!;
    expect(pending.performedBy).toBeNull();
    expect(pending.performedAt).toBeNull();
    expect(data).not.toContain('"cfr11Compliant"');
  });
});

describe('decision-lineage nodes: GxP relevance and signature status are read, never assumed', () => {
  /*
   * WO-16C #70, second follow-up review.
   *
   * Two fields survived the first fix with a value nothing recorded.
   *
   *   `regulatory.gxpRelevant` was the literal `true` at ALL FIVE node
   *   constructors. Three of the four source tables have no such column —
   *   `workflow_approvals`, `workflow_history` and `document_audit_logs` each
   *   carry id/action/actor/time/details and nothing else — so the flag was
   *   asserted for every row from them. The compliance report at
   *   GET /api/decision-lineage/compliance-report counts it:
   *   `gxpRelevantRecords: allDecisions.filter(d => d.regulatory.gxpRelevant).length`,
   *   which therefore always equalled `totalDecisionRecords`. A statistic that
   *   can only ever print one value measures nothing.
   *
   *   `regulatory.signatureStatus` reported `'signed'` for every approved
   *   approval. `workflow_approvals` has no signature column, and this service
   *   reads no signature store; the value was `status === 'approved'`
   *   relabelled as a §11.50 manifestation. The same report counted it as
   *   `signaturesSigned`.
   */
  it('leaves gxpRelevant null for rows from tables that do not record it', async () => {
    const g = await graph();

    for (const id of ['approval-11', 'approval-12', 'history-21', 'docaudit-31']) {
      const n = g.nodes.find(x => x.id === id)!;
      expect(n, `${id} must be in the graph`).toBeDefined();
      expect(
        n.regulatory.gxpRelevant,
        `${id} comes from a table with no GxP-relevance column, so nothing can assert one`,
      ).toBeNull();
    }
  });

  it('reads gxpRelevant from the audit record where the record carries it', async () => {
    // recordDecision writes the caller's flag into `details`, which auditService
    // stores in new_values. Both values round-trip; a row without the key is null.
    setRows(auditLogs, [
      { ...UNATTRIBUTED_DECISION_ROW, id: 'row-gxp-true', newValues: { decisionId: 'D1', gxpRelevant: true } },
      { ...UNATTRIBUTED_DECISION_ROW, id: 'row-gxp-false', newValues: { decisionId: 'D2', gxpRelevant: false } },
      { ...UNATTRIBUTED_DECISION_ROW, id: 'row-gxp-absent', newValues: { decisionId: 'D3' } },
    ]);
    const g = await graph();

    expect(g.nodes.find(n => n.id === 'audit-row-gxp-true')!.regulatory.gxpRelevant).toBe(true);
    expect(g.nodes.find(n => n.id === 'audit-row-gxp-false')!.regulatory.gxpRelevant).toBe(false);
    expect(g.nodes.find(n => n.id === 'audit-row-gxp-absent')!.regulatory.gxpRelevant).toBeNull();
  });

  it('never reports an approved approval as signed', async () => {
    const g = await graph();

    const signed = g.nodes.find(n => n.id === 'approval-12')!;
    expect(signed.regulatory.signatureStatus).not.toBe('signed');
    expect(signed.regulatory.signatureStatus).toBe('not_assessed');

    // The two statuses that ARE positive statements about the signature keep
    // saying so: a step nobody has acted on carries no signature, and a
    // rejected one was not signed.
    expect(g.nodes.find(n => n.id === 'approval-11')!.regulatory.signatureStatus).toBe('pending');
  });

  it('the exports print the absence rather than a Yes or a signature', async () => {
    const csv = (await decisionLineageService.exportLineage('artifact', 42, 'csv', 7)).data;
    const xml = (await decisionLineageService.exportLineage('artifact', 42, 'xml', 7)).data;

    // Every row of this fixture comes from a table with no GxP-relevance
    // column, so the "GxP Relevant" cell — column 8 — says so on every row. It
    // used to read "Yes" on every row instead, for the same reason.
    const dataRows = csv.split('\n').filter(l => l.startsWith('"'));
    expect(dataRows.length).toBeGreaterThan(0);
    for (const row of dataRows) {
      expect(row.split('","')[7], `GxP cell of ${row.slice(0, 24)}`).toBe('not recorded in source');
    }
    expect(csv).toContain('"not assessed here"');
    expect(csv).not.toContain('"signed"');

    expect(xml).not.toContain('<gxp-relevant>true</gxp-relevant>');
    expect(xml).toContain('<gxp-relevant recorded="false" />');
    expect(xml).toContain('<signature-status>not_assessed</signature-status>');
    expect(xml).not.toContain('<signature-status>signed</signature-status>');
  });
});

/**
 * Wave-3 domain seed — governed decision lineage (BX-204 · BLA 761123).
 *
 * Three governed artifacts, each with its immutable, Part-11 hash-chained
 * decision trail, mirroring the v2 DecisionLineage fixture verbatim:
 *   · §2.5 Clinical Overview — revision loop then approved-pending-signature
 *   · §1.1 Form FDA 356h    — clean chain, locked & e-signed
 *   · §3.2.S.4 CMC          — delegation + open comparability decision
 * The helpers (lnHash / node / graph / sig) are ported from the fixture so the
 * recordHash, edges, and roll-up metadata are byte-identical to what the
 * surface renders. Read by GET /api/decision-lineage. to_regclass guarded,
 * org-scoped, idempotent (ON CONFLICT DO NOTHING).
 */

/* ── Fixture helpers (verbatim port of decision-lineage-data.ts) ── */

function lnHash(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return 'sha256:' + h.toString(16).padStart(8, '0') + '...' + ((h * 2654435761) >>> 0).toString(16).slice(0, 6);
}

function node(o) {
  return {
    recordHash: lnHash(o.id + o.action + o.performedAt),
    details: {},
    parentIds: [],
    childIds: [],
    ...o,
  };
}

function graph(rootEntityType, rootEntityId, artifactLabel, nodes) {
  const edges = [];
  nodes.forEach((n) => {
    (n.parentIds || []).forEach((p) => {
      const rel =
        n.nodeType === 'decision'
          ? 'led_to'
          : n.action === 'locked'
            ? 'resulted_in'
            : n.nodeType === 'evidence_link'
              ? 'grounded_by'
              : 'preceded';
      edges.push({ from: p, to: n.id, relationship: rel });
    });
  });
  const decisions = nodes.filter((n) => n.nodeType === 'decision');
  return {
    rootEntityType,
    rootEntityId,
    artifactLabel,
    nodes,
    edges,
    metadata: {
      generatedAt: '2026-07-05T07:12:00Z',
      totalDecisions: decisions.length,
      totalApprovals: decisions.filter((n) => /approv|accept/i.test(n.action)).length,
      totalRejections: decisions.filter((n) => /reject|revision|return/i.test(n.action)).length,
      totalDelegations: nodes.filter((n) => n.nodeType === 'delegation').length,
      chainVerified: true,
      complianceFrameworks: ['FDA 21 CFR Part 11', 'EU Annex 11', 'ICH E6(R2)', 'PMDA ERES'],
    },
  };
}

const _gxp = { gxpRelevant: true, requiresSignature: false, cfr11Compliant: true };
const sig = (status) => ({ gxpRelevant: true, requiresSignature: true, signatureStatus: status, cfr11Compliant: true });

/* ── Artifact 1: §2.5 Clinical Overview (BX-204 BLA 761123) — in review ── */
const g25 = graph('artifact', 4025, 'BX-204 · §2.5 Clinical Overview (BLA 761123)', [
  node({ id: 'n1', nodeType: 'document_state', entityType: 'artifact', entityId: 4025, action: 'created',
    performedBy: 'J. Chen', performedByRole: 'Regulatory Affairs', performedAt: '2026-05-18T09:10:00Z',
    details: { status: 'draft', module: 'CTD 2.5', standard: 'ICH M4E(R2)' }, childIds: ['n2'], regulatory: _gxp }),
  node({ id: 'n2', nodeType: 'evidence_link', entityType: 'artifact', entityId: 4025, action: 'linked_evidence',
    performedBy: 'A. Muller', performedByRole: 'Medical Writer', performedAt: '2026-05-22T14:30:00Z',
    details: { evidence: 'CSR BX204-201 (locked)', location: 'Module 5.3.5.1', claim: 'ORR 42.1% (95% CI 35.8-48.6)' }, parentIds: ['n1'], childIds: ['n3'], regulatory: _gxp }),
  node({ id: 'n3', nodeType: 'workflow_step', entityType: 'artifact', entityId: 4025, action: 'submitted_for_review',
    performedBy: 'A. Muller', performedByRole: 'Medical Writer', performedAt: '2026-06-02T11:05:00Z',
    details: { fromStatus: 'draft', toStatus: 'review', reviewers: ['S. Okafor (Reg Lead)'] }, parentIds: ['n2'], childIds: ['n4'], regulatory: _gxp }),
  node({ id: 'n4', nodeType: 'decision', entityType: 'artifact', entityId: 4025, action: 'revision_requested',
    performedBy: 'S. Okafor', performedByRole: 'Regulatory Lead', performedAt: '2026-06-09T16:40:00Z',
    details: { reason: '§2.5.4 benefit-risk uses "establishes" -- soften to match the E9(R1) estimand; reconcile ORR CI wording with §2.7.3.', decision: 'return for revision' }, parentIds: ['n3'], childIds: ['n5'], regulatory: sig('signed') }),
  node({ id: 'n5', nodeType: 'document_state', entityType: 'artifact', entityId: 4025, action: 'revised',
    performedBy: 'A. Muller', performedByRole: 'Medical Writer', performedAt: '2026-06-24T10:20:00Z',
    details: { status: 'review', changes: '3 tracked changes accepted; benefit-risk language softened; §2.7.3 cross-ref aligned.' }, parentIds: ['n4'], childIds: ['n6'], regulatory: _gxp }),
  node({ id: 'n6', nodeType: 'decision', entityType: 'artifact', entityId: 4025, action: 'approved_pending_signature',
    performedBy: 'S. Okafor', performedByRole: 'Regulatory Lead', performedAt: '2026-07-01T13:15:00Z',
    details: { fromStatus: 'review', toStatus: 'approved', note: 'Approved for lock; awaiting QP electronic signature (§11.50).' }, parentIds: ['n5'], childIds: [], regulatory: sig('pending') }),
]);

/* ── Artifact 2: §1.1 Form FDA 356h (BX-204) — final/locked, clean chain ── */
const g11 = graph('artifact', 4011, 'BX-204 · §1.1 Form FDA 356h (BLA 761123)', [
  node({ id: 'm1', nodeType: 'document_state', entityType: 'artifact', entityId: 4011, action: 'created',
    performedBy: 'J. Chen', performedByRole: 'Regulatory Affairs', performedAt: '2026-04-30T08:00:00Z',
    details: { status: 'draft', form: 'FDA 356h', purpose: 'Application to market a biologic -- BX-204, accelerated approval.' }, childIds: ['m2'], regulatory: _gxp }),
  node({ id: 'm2', nodeType: 'decision', entityType: 'artifact', entityId: 4011, action: 'approved',
    performedBy: 'S. Okafor', performedByRole: 'Regulatory Lead', performedAt: '2026-05-06T15:30:00Z',
    details: { fromStatus: 'review', toStatus: 'approved' }, parentIds: ['m1'], childIds: ['m3'], regulatory: sig('signed') }),
  node({ id: 'm3', nodeType: 'document_state', entityType: 'artifact', entityId: 4011, action: 'locked',
    performedBy: 'S. Okafor', performedByRole: 'Regulatory Lead', performedAt: '2026-05-06T15:31:00Z',
    details: { status: 'locked', version: 'v3.0', esignature: '21 CFR §11.50 signature manifestation attached' }, parentIds: ['m2'], childIds: [], regulatory: sig('signed') }),
]);

/* ── Artifact 3: §3.2.S.4 Control of drug substance (BX-204 CMC) — review ── */
const g324 = graph('artifact', 4324, 'BX-204 · §3.2.S.4 Control of drug substance (CMC)', [
  node({ id: 'c1', nodeType: 'document_state', entityType: 'artifact', entityId: 4324, action: 'created',
    performedBy: 'M. Webb', performedByRole: 'CMC Lead', performedAt: '2026-05-11T09:45:00Z',
    details: { status: 'draft', module: 'CTD 3.2.S.4', scope: 'Specifications: identity, purity, potency, impurities.' }, childIds: ['c2'], regulatory: _gxp }),
  node({ id: 'c2', nodeType: 'delegation', entityType: 'artifact', entityId: 4324, action: 'delegated_review',
    performedBy: 'M. Webb', performedByRole: 'CMC Lead', performedAt: '2026-06-15T12:00:00Z',
    details: { to: 'R. Ivanova (Analytical SME)', reason: 'Comparability acceptance criteria vs 3 post-change lots need analytical adjudication.' }, parentIds: ['c1'], childIds: ['c3'], regulatory: _gxp }),
  node({ id: 'c3', nodeType: 'workflow_step', entityType: 'artifact', entityId: 4324, action: 'submitted_for_review',
    performedBy: 'R. Ivanova', performedByRole: 'Analytical SME', performedAt: '2026-06-28T10:10:00Z',
    details: { fromStatus: 'draft', toStatus: 'review', open: 'Comparability acceptance criteria unreconciled vs 3 post-change lots.' }, parentIds: ['c2'], childIds: [], regulatory: _gxp }),
]);

const GRAPHS = [g25, g11, g324];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_decision_lineage') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_decision_lineage not found — run migrations first, skipping');
    return;
  }
  let inserted = 0;
  for (let i = 0; i < GRAPHS.length; i++) {
    const g = GRAPHS[i];
    const r = await client.query(
      `INSERT INTO c2c_decision_lineage (
         id, organization_id, root_entity_type, root_entity_id, artifact_label,
         sort_order, nodes, edges, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
       ON CONFLICT (organization_id, id) DO NOTHING`,
      [
        String(g.rootEntityId), org.id, g.rootEntityType, g.rootEntityId, g.artifactLabel,
        i, JSON.stringify(g.nodes), JSON.stringify(g.edges), JSON.stringify(g.metadata),
      ],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ decision lineage: ${inserted} governed-artifact decision trails seeded`);
}

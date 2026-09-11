/**
 * WO-16C finding #71 — every decision-lineage export asserted conformance with
 * five named regulatory frameworks that nothing evaluates.
 *
 * `getLineageGraph` stamped `metadata.complianceFrameworks` with a five-element
 * string literal — FDA 21 CFR Part 11, EU Annex 11, ICH E6(R2) GCP, PMDA ERES
 * Guidelines, GAMP 5 — computed from nothing and conditioned on nothing, while
 * every other field in the same object came from a real query. All three export
 * formats then printed it into the file a customer downloads for an audit
 * package: CSV as `# Compliance: <five names>`, XML inside a comment block
 * headed "eCTD Audit Trail" plus a `<compliance-frameworks>` element, JSON
 * under `metadata.complianceFrameworks`.
 *
 * WO-16B had already corrected the sibling compliance report on the same router
 * (commit a668d73e2): ICH E6(R2) and GAMP 5 say NOT_ASSESSED there because no
 * check evaluates them, and the other three follow the chain verifier's three
 * states. So the exported file and the report from the same subsystem
 * contradicted each other, and the file was the one a reviewer keeps.
 *
 * There is no dependency to fail here — the list was a constant — so the red
 * case is the constant itself: a graph whose chain verifier could not run still
 * exported an unconditional assertion of all five.
 */
import { describe, expect, it } from 'vitest';
import {
  assessComplianceFrameworks,
  decisionLineageService,
  type LineageGraph,
} from '../DecisionLineageService';

const NEVER_ASSESSED = ['ICH E6(R2) GCP', 'GAMP 5'];
const CHAIN_DEPENDENT = ['FDA 21 CFR Part 11', 'EU Annex 11', 'PMDA ERES Guidelines'];

function graphWith(chainVerification: LineageGraph['metadata']['chainVerification']): LineageGraph {
  return {
    rootEntityType: 'submission',
    rootEntityId: 9,
    nodes: [],
    edges: [],
    metadata: {
      generatedAt: '2026-09-11T08:00:00.000Z',
      totalDecisions: 0,
      totalApprovals: 0,
      totalRejections: 0,
      totalDelegations: 0,
      chainVerified: chainVerification === 'verified',
      chainVerification,
      chainVerificationReason:
        chainVerification === 'unverifiable' ? 'relation "audit.tamper_proof_log" does not exist' : undefined,
      complianceFrameworks: assessComplianceFrameworks(chainVerification),
    },
  };
}

const exporter = decisionLineageService as unknown as {
  exportCSV(g: LineageGraph): { data: string };
  exportXML(g: LineageGraph): { data: string };
  exportJSON(g: LineageGraph): { data: string };
};

const statusOf = (g: LineageGraph, name: string) =>
  g.metadata.complianceFrameworks.find(f => f.framework === name)?.status;

describe('assessComplianceFrameworks: a framework nothing evaluates is never reported as met', () => {
  it('marks the two frameworks no check evaluates NOT_ASSESSED, in every chain state', () => {
    for (const state of ['verified', 'failed', 'unverifiable'] as const) {
      const g = graphWith(state);
      for (const name of NEVER_ASSESSED) {
        expect(statusOf(g, name), `${name} in state ${state}`).toBe('NOT_ASSESSED');
      }
    }
  });

  it('follows the chain verifier for the three the chain actually supports', () => {
    expect(CHAIN_DEPENDENT.map(n => statusOf(graphWith('verified'), n))).toEqual([
      'COMPLIANT',
      'COMPLIANT',
      'COMPLIANT',
    ]);
    expect(CHAIN_DEPENDENT.map(n => statusOf(graphWith('failed'), n))).toEqual([
      'REVIEW_REQUIRED',
      'REVIEW_REQUIRED',
      'REVIEW_REQUIRED',
    ]);
    // The WO-16B distinction: a verifier that could not run is not a failure.
    expect(CHAIN_DEPENDENT.map(n => statusOf(graphWith('unverifiable'), n))).toEqual([
      'UNVERIFIABLE',
      'UNVERIFIABLE',
      'UNVERIFIABLE',
    ]);
  });

  it('agrees with the compliance report on that router, framework for framework', () => {
    // routes/decision-lineage.ts emits exactly these five, in this order.
    expect(graphWith('verified').metadata.complianceFrameworks.map(f => f.framework)).toEqual([
      'FDA 21 CFR Part 11',
      'EU Annex 11',
      'ICH E6(R2) GCP',
      'PMDA ERES Guidelines',
      'GAMP 5',
    ]);
  });
});

describe('decision-lineage exports: the downloaded file carries the status, not a bare list', () => {
  it('CSV never prints the five names as an unqualified compliance claim', () => {
    const csv = exporter.exportCSV(graphWith('unverifiable')).data;

    expect(csv).not.toContain('# Compliance: FDA 21 CFR Part 11, EU Annex 11, ICH E6(R2) GCP');
    expect(csv).toContain('ICH E6(R2) GCP = NOT_ASSESSED');
    expect(csv).toContain('FDA 21 CFR Part 11 = UNVERIFIABLE');
  });

  it('XML attaches a status to every framework element and to the chain line', () => {
    const xml = exporter.exportXML(graphWith('unverifiable')).data;

    expect(xml).toContain('<framework name="GAMP 5" status="NOT_ASSESSED"');
    expect(xml).toContain('<framework name="EU Annex 11" status="UNVERIFIABLE"');
    // The boolean said "UNVERIFIED" for a verifier that never ran, which reads
    // as a finding about the chain rather than about the check.
    expect(xml).toContain('<chain-verification>unverifiable</chain-verification>');
    expect(xml).not.toMatch(/Compliance: FDA 21 CFR Part 11, EU Annex 11/);
  });

  it('JSON carries objects a machine reader cannot mistake for a conformance list', () => {
    const parsed = JSON.parse(exporter.exportJSON(graphWith('failed')).data);

    expect(parsed.metadata.complianceFrameworks[0]).toMatchObject({
      framework: 'FDA 21 CFR Part 11',
      status: 'REVIEW_REQUIRED',
    });
    expect(parsed.metadata.complianceFrameworks.every((f: unknown) => typeof f === 'object')).toBe(true);
  });

  it('a verified chain still does not promote the two nothing evaluates', () => {
    const csv = exporter.exportCSV(graphWith('verified')).data;

    expect(csv).toContain('FDA 21 CFR Part 11 = COMPLIANT');
    expect(csv).toContain('GAMP 5 = NOT_ASSESSED');
  });
});

import type { WorkbenchData } from './workbench-store';

export type RegulatoryCheck = {
  checkId: string;
  status: 'pass' | 'fail';
  severity: 'low' | 'medium' | 'high';
  message: string;
  entityType?: 'evidence' | 'claim' | 'standard' | 'outcome';
  entityId?: string;
};

const fail = (
  checkId: string,
  severity: RegulatoryCheck['severity'],
  message: string,
  entityType?: RegulatoryCheck['entityType'],
  entityId?: string
): RegulatoryCheck => ({
  checkId,
  status: 'fail',
  severity,
  message,
  entityType,
  entityId,
});

const pass = (checkId: string, message: string): RegulatoryCheck => ({
  checkId,
  status: 'pass',
  severity: 'low',
  message,
});

export const runRegulatoryChecks = (data: WorkbenchData): RegulatoryCheck[] => {
  const results: RegulatoryCheck[] = [];

  const inboxItems = data.evidence.filter(item => item.status === 'inbox');
  if (inboxItems.length) {
    results.push(
      fail(
        'evidence-inbox-unclassified',
        'medium',
        `${inboxItems.length} evidence items are still unclassified`
      )
    );
  } else {
    results.push(pass('evidence-inbox-unclassified', 'All evidence items are classified'));
  }

  const unlinkedEvidence = data.evidence.filter(
    item => item.linkedClaims + item.linkedStandards + item.linkedOutcomes === 0
  );
  if (unlinkedEvidence.length) {
    results.push(
      fail(
        'evidence-unlinked',
        'low',
        `${unlinkedEvidence.length} evidence items have no links`
      )
    );
  } else {
    results.push(pass('evidence-unlinked', 'All evidence items are linked'));
  }

  data.claims.forEach(claim => {
    if ((claim.linkedEvidence || 0) === 0) {
      results.push(
        fail(
          `claim-${claim.id}-evidence`,
          claim.risk === 'high' ? 'high' : 'medium',
          `Claim missing evidence: ${claim.text}`,
          'claim',
          claim.id
        )
      );
    }
  });

  if (!results.some(item => item.checkId.startsWith('claim-'))) {
    results.push(pass('claims-coverage', 'All claims have linked evidence'));
  }

  data.standards.forEach(standard => {
    if ((standard.linkedEvidence || 0) === 0) {
      results.push(
        fail(
          `standard-${standard.id}-evidence`,
          'medium',
          `Standard missing evidence: ${standard.name}`,
          'standard',
          standard.id
        )
      );
    }
  });

  if (!results.some(item => item.checkId.startsWith('standard-'))) {
    results.push(pass('standards-coverage', 'All standards have linked evidence'));
  }

  data.outcomes.forEach(outcome => {
    if ((outcome.linkedEvidence || 0) === 0) {
      results.push(
        fail(
          `outcome-${outcome.id}-evidence`,
          'medium',
          `Outcome missing evidence: ${outcome.name}`,
          'outcome',
          outcome.id
        )
      );
    }
  });

  if (!results.some(item => item.checkId.startsWith('outcome-'))) {
    results.push(pass('outcomes-coverage', 'All outcomes have linked evidence'));
  }

  return results;
};

import type { WorkbenchData } from './workbench-store';

export type ReadinessTile = {
  id: 'evidence' | 'claims' | 'standards' | 'outcomes';
  label: string;
  score: number;
  blockers: string[];
};

export type ReadinessSummary = {
  overallScore: number;
  tiles: ReadinessTile[];
};

const percent = (value: number, total: number) => (total === 0 ? 0 : Math.round((value / total) * 100));

const countBy = <T>(items: T[], predicate: (item: T) => boolean) =>
  items.reduce((acc, item) => (predicate(item) ? acc + 1 : acc), 0);

export const computeReadiness = (data: WorkbenchData): ReadinessSummary => {
  const evidenceInboxCount = countBy(data.evidence, item => item.status === 'inbox');
  const evidenceClassifiedCount = data.evidence.length - evidenceInboxCount;
  const evidenceCoverage = percent(evidenceClassifiedCount, data.evidence.length);

  const claimsLinkedCount = countBy(data.claims, claim => (claim.linkedEvidence || 0) > 0);
  const claimsCoverage = percent(claimsLinkedCount, data.claims.length);

  const standardsLinkedCount = countBy(data.standards, item => (item.linkedEvidence || 0) > 0);
  const standardsCoverage = percent(standardsLinkedCount, data.standards.length);

  const outcomesLinkedCount = countBy(data.outcomes, item => (item.linkedEvidence || 0) > 0);
  const outcomesCoverage = percent(outcomesLinkedCount, data.outcomes.length);

  const tiles: ReadinessTile[] = [
    {
      id: 'evidence',
      label: 'Evidence Coverage',
      score: evidenceCoverage,
      blockers: [
        evidenceInboxCount
          ? `${evidenceInboxCount} evidence items need classification`
          : 'All evidence items classified',
      ],
    },
    {
      id: 'claims',
      label: 'Claims Coverage',
      score: claimsCoverage,
      blockers: [
        claimsLinkedCount !== data.claims.length
          ? `${data.claims.length - claimsLinkedCount} claims unlinked`
          : 'All claims linked',
      ],
    },
    {
      id: 'standards',
      label: 'Standards Coverage',
      score: standardsCoverage,
      blockers: [
        standardsLinkedCount !== data.standards.length
          ? `${data.standards.length - standardsLinkedCount} standards gaps`
          : 'All standards satisfied',
      ],
    },
    {
      id: 'outcomes',
      label: 'Outcomes Substantiation',
      score: outcomesCoverage,
      blockers: [
        outcomesLinkedCount !== data.outcomes.length
          ? `${data.outcomes.length - outcomesLinkedCount} outcomes missing evidence`
          : 'All outcomes substantiated',
      ],
    },
  ];

  const overallScore = Math.round(
    (evidenceCoverage + claimsCoverage + standardsCoverage + outcomesCoverage) / 4
  );

  return { overallScore, tiles };
};

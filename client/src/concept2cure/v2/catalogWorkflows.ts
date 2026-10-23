import { LAUNCH_APPS } from '@shared/constants/launch-scope';
import { isMdxProjectFeature } from '@shared/constants/mdx-project-features';

/** Presentation of the existing work-area composition, never a scope or access decision. */
interface WorkflowGuidance {
  when: string;
  start: string;
  next: string;
}

const GUIDANCE: Readonly<Record<string, WorkflowGuidance>> = {
  projects: {
    when: 'You are starting a program or organizing its filing work, people and tasks.',
    start: 'Create or select a project and record its product, filing type and target markets.',
    next: 'Inside the project, follow Evidence → Author → Review → Submit → Respond.',
  },
  vault: {
    when: 'You need to collect, organize, find or share source evidence and document versions.',
    start: 'Use the project’s Evidence tab for its files and data room; use Vault to work across projects.',
    next: 'Use the traceable source material in your working documents and reviews.',
  },
  authoring: {
    when: 'You are drafting or revising a protocol, regulatory section or other working document.',
    start: 'Open the project’s Author tab, or ask AnA to draft and open the document in the canvas.',
    next: 'Send the document for review and approval before placing the filing copy in a submission.',
  },
  'submission-center': {
    when: 'You are assembling approved documents into a filing or preparing its next sequence.',
    start: 'Use the project’s Submit tab to select the filing and work on its sequence.',
    next: 'Validate, review Submission Readiness and complete the required approvals; track dispatch receipts and agency responses.',
  },
  qms: {
    when: 'You are managing controlled procedures and quality documents.',
    start: 'Open Quality to work with the controlled document and its review or approval.',
    next: 'Use the controlled version and retain its approval and audit history.',
  },
  cmc: {
    when: 'You are composing small-molecule Module 3 for a US IND.',
    start: 'Open CMC / Module 3 and select the project and source material for the composition.',
    next: 'Review the generated sections and place approved filing copies in Submission Center.',
  },
  reporting: {
    when: 'You need a report or analysis of program records, quality activity or filing work.',
    start: 'Open Reporting & analytics and select the report and relevant records.',
    next: 'Review the report’s evidence, gaps and blockers before using or sharing it.',
  },
};

type FeatureRow = { id: string; name?: string; desc: string };
interface CatalogGroup<T> { group: string; note: string; apps: T[] }
export interface CatalogFeature<T> { row: T; groupIndex: number; category: string }
interface WorkflowSection<T> extends WorkflowGuidance {
  id: string;
  label: string;
  features: CatalogFeature<T>[];
}

/** Keep original group indices for governed switches after search and regrouping. */
export function groupCatalogWorkflows<T extends FeatureRow>(groups: readonly CatalogGroup<T>[], query: string) {
  const needle = query.trim().toLocaleLowerCase();
  const entries = groups.flatMap((group, groupIndex) =>
    group.apps.map((row) => ({ row, groupIndex, category: group.group })),
  );
  const areaFor = (id: string) => LAUNCH_APPS.find(area => GUIDANCE[area.id] && (area.surfaces.includes(id) || area.modules.includes(id)));
  const mdxTerms = 'MDX solutions medical devices diagnostics project workflows';
  const matches = (feature: CatalogFeature<T>) =>
    `${feature.row.name ?? feature.row.id} ${feature.row.id} ${feature.row.desc} ${feature.category} ${isMdxProjectFeature(feature.row.id) ? mdxTerms : ''}`.toLocaleLowerCase().includes(needle);
  const workflows: WorkflowSection<T>[] = LAUNCH_APPS.flatMap(area => {
    const guidance = GUIDANCE[area.id];
    if (!guidance) return [];
    const areaMatches = `${area.label} ${guidance.when} ${guidance.start} ${guidance.next}`.toLocaleLowerCase().includes(needle);
    const features = entries.filter(entry => areaFor(entry.row.id)?.id === area.id && (areaMatches || matches(entry)));
    return features.length ? [{ id: area.id, label: area.label, ...guidance, features }] : [];
  });
  const additional = groups.flatMap((group, groupIndex) => {
    const features = entries.filter(entry => entry.groupIndex === groupIndex && !areaFor(entry.row.id) &&
      ('additional capabilities'.includes(needle) || matches(entry)));
    return features.length ? [{ label: group.group, features }] : [];
  });
  return { workflows, additional, matchingFeatures: workflows.reduce((n, area) => n + area.features.length, 0) +
    additional.reduce((n, group) => n + group.features.length, 0) };
}

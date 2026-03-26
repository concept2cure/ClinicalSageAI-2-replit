/**
 * Shared Memory Contract
 *
 * Normalizes working-memory summaries into a stable cross-agent contract so
 * orchestrators/agents can read the same state representation.
 */

export interface SharedMemoryContract {
  objective: string;
  lockedFacts: string[];
  decisions: string[];
  openQuestions: string[];
  nextActions: string[];
  createdArtifacts: string[];
  exclusions: string[];
}

const EMPTY_CONTRACT: SharedMemoryContract = {
  objective: '',
  lockedFacts: [],
  decisions: [],
  openQuestions: [],
  nextActions: [],
  createdArtifacts: [],
  exclusions: [],
};

function extractSection(summary: string, heading: string): string[] {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionRegex = new RegExp(
    `\\*\\*${escapedHeading}\\*\\*:\\s*([\\s\\S]*?)(?=\\n\\n\\*\\*|$)`,
    'i'
  );
  const match = summary.match(sectionRegex);
  if (!match) return [];

  return match[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.replace(/^- /, '').trim())
    .filter(Boolean);
}

export function parseSharedMemoryContract(summary?: string | null): SharedMemoryContract {
  if (!summary || !summary.trim()) return { ...EMPTY_CONTRACT };

  const objectiveMatch = summary.match(/\*\*Objective\*\*:\s*(.+)/i);

  return {
    objective: objectiveMatch?.[1]?.trim() || '',
    lockedFacts: extractSection(summary, 'Locked Facts'),
    decisions: extractSection(summary, 'Decisions Made'),
    openQuestions: extractSection(summary, 'Open Questions'),
    nextActions: extractSection(summary, 'Next Actions'),
    createdArtifacts: extractSection(summary, 'Created Artifacts'),
    exclusions: extractSection(summary, 'Deferred/Excluded'),
  };
}

export function renderSharedMemoryForPrompt(contract: SharedMemoryContract): string {
  const lines: string[] = [];
  lines.push('## SHARED MEMORY CONTRACT');
  lines.push(`Objective: ${contract.objective || 'Not set'}`);

  const addList = (title: string, values: string[]) => {
    if (values.length === 0) return;
    lines.push(`${title}:`);
    for (const item of values) lines.push(`- ${item}`);
  };

  addList('Locked Facts', contract.lockedFacts);
  addList('Decisions', contract.decisions);
  addList('Open Questions', contract.openQuestions);
  addList('Next Actions', contract.nextActions);
  addList('Created Artifacts', contract.createdArtifacts);
  addList('Exclusions', contract.exclusions);

  return lines.join('\n');
}


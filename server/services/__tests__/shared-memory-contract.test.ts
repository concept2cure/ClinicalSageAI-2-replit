import { describe, expect, test } from 'vitest';
import {
  parseSharedMemoryContract,
  renderSharedMemoryForPrompt,
} from '../shared-memory-contract';

describe('shared-memory-contract', () => {
  test('parses formatted working-memory summary into normalized contract', () => {
    const summary = `**Objective**: Prepare IND risk memo

**Locked Facts**:
- Study is Phase 2
- Endpoint is PFS

**Decisions Made**:
- Keep primary endpoint as PFS

**Open Questions**:
- Need EMA comparator guidance`;

    const contract = parseSharedMemoryContract(summary);
    expect(contract.objective).toContain('Prepare IND risk memo');
    expect(contract.lockedFacts).toHaveLength(2);
    expect(contract.decisions[0]).toContain('Keep primary endpoint');
    expect(contract.openQuestions[0]).toContain('EMA comparator');
  });

  test('renders normalized memory into prompt-safe contract block', () => {
    const prompt = renderSharedMemoryForPrompt({
      objective: 'Draft briefing book',
      lockedFacts: ['FDA Type B meeting requested'],
      decisions: ['Use rolling submission framing'],
      openQuestions: [],
      nextActions: ['Prepare CMC package'],
      createdArtifacts: ['artifact-123'],
      exclusions: ['No Japan filing in this phase'],
    });

    expect(prompt).toContain('## SHARED MEMORY CONTRACT');
    expect(prompt).toContain('Objective: Draft briefing book');
    expect(prompt).toContain('- FDA Type B meeting requested');
  });
});


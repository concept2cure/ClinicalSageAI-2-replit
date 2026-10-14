import { describe, expect, it } from 'vitest';
import { emptyDiscovery } from '@shared/types/onboarding-discovery';
import { changedDiscoveryFields, hydrateDiscoveryDraft } from '../discoveryDraft';
describe('a discovery read that arrives after typing', () => {
  it('preserves edited goals while restoring untouched therapeutic and project context', () => {
    const initial = emptyDiscovery(); const draft = emptyDiscovery(); const saved = emptyDiscovery();
    draft.company.goals = 'New goal typed before loading finished';
    saved.company.goals = 'Old goal'; saved.company.therapeuticAreas = ['Oncology']; saved.project.name = 'Recorded project';
    const edited = new Set(changedDiscoveryFields(initial, draft));
    const result = hydrateDiscoveryDraft(draft, saved, edited);
    expect(result.company.goals).toBe(draft.company.goals);
    expect(result.company.therapeuticAreas).toEqual(['Oncology']);
    expect(result.project.name).toBe('Recorded project');
    expect(saved.company.goals).toBe('Old goal');
  });
  it('does not reintroduce hidden device answers when the person has chosen a diagnostic', () => {
    const draft = emptyDiscovery(); draft.project.productType = 'ivd'; draft.project.assayContext = 'New diagnostic comparator';
    const saved = emptyDiscovery(); saved.project.productType = 'device'; saved.project.predicateDevice = 'Old predicate';
    const result = hydrateDiscoveryDraft(draft, saved, new Set(['project.productType', 'project.assayContext']));
    expect(result.project.productType).toBe('ivd');
    expect(result.project.predicateDevice).toBe('');
    expect(result.project.assayContext).toBe('New diagnostic comparator');
  });
});

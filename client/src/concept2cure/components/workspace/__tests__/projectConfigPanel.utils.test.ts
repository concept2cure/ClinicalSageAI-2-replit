import { describe, it, expect } from 'vitest';
import {
  buildProjectSharePath,
  formatModuleTypeLabel,
  hasExistingModuleLink,
  parseModuleInstanceId,
  parseNumericProjectId,
} from '../projectConfigPanel.utils';
import type { ProjectModule } from '@/concept2cure/hooks/useEnterprise';

describe('projectConfigPanel.utils', () => {
  it('parses numeric project ids safely', () => {
    expect(parseNumericProjectId('12')).toBe(12);
    expect(parseNumericProjectId(9)).toBe(9);
    expect(parseNumericProjectId('abc')).toBeUndefined();
    expect(parseNumericProjectId('0')).toBeUndefined();
  });

  it('parses module instance id as positive integer only', () => {
    expect(parseModuleInstanceId('42')).toBe(42);
    expect(parseModuleInstanceId('0')).toBeUndefined();
    expect(parseModuleInstanceId('3.14')).toBeUndefined();
    expect(parseModuleInstanceId('bad')).toBeUndefined();
  });

  it('detects duplicate links by module type and instance id', () => {
    const links: ProjectModule[] = [
      {
        id: 1,
        projectId: 1,
        organizationId: 7,
        clientWorkspaceId: 2,
        moduleType: 'cer',
        moduleInstanceId: 101,
        status: 'active',
        settings: null,
        metadata: null,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    expect(hasExistingModuleLink(links, 'cer', 101)).toBe(true);
    expect(hasExistingModuleLink(links, 'csr', 101)).toBe(false);
  });

  it('formats module labels for UI readability', () => {
    expect(formatModuleTypeLabel('regulatory_intelligence')).toBe('regulatory intelligence');
  });

  it('builds deterministic project share paths', () => {
    expect(buildProjectSharePath('p-100')).toBe('/concept2cure/project/p-100');
    expect(buildProjectSharePath('space id')).toBe('/concept2cure/project/space%20id');
  });
});

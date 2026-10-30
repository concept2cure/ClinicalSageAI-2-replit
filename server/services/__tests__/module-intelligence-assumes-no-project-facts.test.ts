/**
 * Module intelligence describes a project only by what its record says, and
 * hands AnA no effort figure nobody estimated.
 *
 * What the code used to do (until 2026-10-15): getMedicalDeviceIntelligence
 * read an unrecorded submission type as '510k' and printed the 510(k) context
 * block for it; getEctdCoauthorIntelligence read it as 'ind' ("IND
 * (Investigational New Drug, 21 CFR 312.23)") and an unrecorded phase as
 * 'Phase 1'. Every document type and workflow stage carried a hard-coded
 * estimatedHours / estimatedDays (59 of them, none sourced), which AnA's
 * prompt printed as "(40h est.)" / "(60d)". detectActiveModule read
 * `organization.industryMode` unguarded and defaulted to the eCTD module for
 * an organization whose industry is not recorded.
 */
import { describe, expect, it } from 'vitest';

import { detectActiveModule, getModuleIntelligence } from '../module-intelligence';
import type { ProjectSummary, UserIntelligence } from '../user-intelligence';

const project = (over: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: 1,
  name: 'Program',
  submissionType: null,
  status: 'active',
  progress: null,
  phase: null,
  therapeuticArea: null,
  role: 'owner',
  lastAccessedAt: null,
  ...over,
});

const intelligence = (over: Partial<UserIntelligence> = {}): UserIntelligence =>
  ({
    identity: null,
    organizationId: 3,
    organization: {
      id: 3,
      name: 'Example Bio',
      slug: 'example-bio',
      industryMode: 'biotech',
      tier: 'standard',
      maxUsers: 25,
      maxProjects: 40,
      enabledModules: [],
      settings: {},
    },
    projects: [],
    activeProject: null,
    currentSession: null,
    recentSessions: [],
    workQueue: [],
    recentActivity: [],
    conversationMemory: null,
    unread: [],
    timestamp: '2026-10-15T00:00:00.000Z',
    ...over,
  }) as unknown as UserIntelligence;

describe('the submission context printed for a project', () => {
  it('a device project with no recorded type is not described as a 510(k)', () => {
    const addon = getModuleIntelligence('510k-submission', project())!.systemPromptAddon;
    expect(addon).not.toContain('510(k) Premarket Notification');
    expect(addon).toContain('submission type is not recorded');
  });

  it('an eCTD project with no recorded type or phase is not described as a Phase 1 IND', () => {
    for (const p of [project(), null]) {
      const addon = getModuleIntelligence('ectd-coauthor', p)!.systemPromptAddon;
      expect(addon).not.toContain('Investigational New Drug');
      expect(addon).not.toContain('Phase 1');
      expect(addon).toContain('**Type**: not recorded');
      expect(addon).toContain('**Phase**: not recorded');
    }
  });

  it('prints the type and phase that are recorded', () => {
    const addon = getModuleIntelligence('nda-bla', project({ submissionType: 'NDA', phase: 'Phase 3' }))!
      .systemPromptAddon;
    expect(addon).toContain('New Drug Application, 21 CFR 314');
    expect(addon).toContain('**Phase**: Phase 3');
    const device = getModuleIntelligence('pma-submission', project({ submissionType: 'PMA' }))!.systemPromptAddon;
    expect(device).toContain('Premarket Approval (PMA)');
  });
});

describe('effort figures', () => {
  it('no module hands AnA an effort estimate nobody made', () => {
    for (const moduleId of ['510k-submission', 'ectd-coauthor', 'cmc-wizard', 'doc-canvas', 'vault']) {
      const intel = getModuleIntelligence(moduleId, project())!;
      for (const d of intel.documentTypes) expect(d.estimatedHours ?? null).toBeNull();
      for (const s of intel.workflowStages) expect(s.estimatedDays ?? null).toBeNull();
    }
  });
});

describe('detectActiveModule', () => {
  it('does not guess a module when the organization profile could not be read', () => {
    expect(detectActiveModule(intelligence({ organization: null, unread: ['organization profile'] }))).toBeNull();
  });

  it('does not default to the eCTD module for an organization whose industry is not recorded', () => {
    const base = intelligence();
    const unrecorded = intelligence({ organization: { ...base.organization!, industryMode: null } });
    expect(detectActiveModule(unrecorded)).toBeNull();
  });

  it('still routes by what is recorded', () => {
    expect(detectActiveModule(intelligence({ activeProject: project({ submissionType: 'IND' }) }))).toBe('ind-checklist');
    expect(detectActiveModule(intelligence())).toBe('submission-center');
    const base = intelligence();
    expect(
      detectActiveModule(intelligence({ organization: { ...base.organization!, industryMode: 'medtech' } })),
    ).toBe('device-510k');
  });
});

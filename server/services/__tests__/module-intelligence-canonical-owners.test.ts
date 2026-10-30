/** A3 reuses the existing intelligence, without changing an explicit legacy call
 * or making a foreign filing an FDA application through deficiency grouping. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getSubmissionTypeContext } from '../../../shared/regulatory/submission-type-bridge';
import { detectActiveModule, getModuleIntelligence } from '../module-intelligence';
import type { ProjectSummary, UserIntelligence, WorkSession } from '../user-intelligence';

const project = (submissionType: string | null): ProjectSummary => ({
  id: 1, name: 'Program', submissionType, status: 'active', progress: null,
  phase: null, therapeuticArea: null, role: 'owner', lastAccessedAt: null,
});

const session = (contextType: string): WorkSession => ({
  contextType, contextReference: null, contextTitle: null, projectId: null,
  projectName: null, startedAt: '2026-10-27T00:00:00Z', lastActivityAt: '2026-10-27T00:00:00Z',
  durationMinutes: null, messagesSent: 0, artifactsCreated: 0,
});

const intelligence = (submissionType: string | null, contextType?: string): UserIntelligence => ({
  organization: null,
  activeProject: project(submissionType),
  currentSession: contextType ? session(contextType) : null,
} as UserIntelligence);

const ownerCases = [
  ['ind-checklist', 'ind-filing', 'IND'],
  ['device-510k', '510k-submission', '510(k)'],
  ['device-pma', 'pma-submission', 'PMA'],
  ['device-cer', 'ce-marking', 'CER'],
  ['device-submission', 'medical-device', 'CA_MDL'],
  ['submission-center', 'ectd-coauthor', 'NDA'],
  ['cmc', 'cmc-wizard', 'IND'],
  ['document-authoring', 'doc-canvas', 'ICH_CSR'],
  ['protocol-dev', 'protocol-designer', 'ICH_PROTOCOL'],
] as const;

describe('canonical prompt owners reuse complete existing intelligence', () => {
  it.each(ownerCases)('%s retains every field of %s with its canonical identity', (canonical, legacy, type) => {
    const previous = getModuleIntelligence(legacy, project(type));
    expect(previous).not.toBeNull();
    expect(getModuleIntelligence(canonical, project(type))).toEqual({ ...previous, moduleId: canonical });
  });

  it.each(ownerCases)('%s retains the missing-facts output of %s', (canonical, legacy) => {
    const previous = getModuleIntelligence(legacy, null);
    expect(previous).not.toBeNull();
    expect(getModuleIntelligence(canonical, null)).toEqual({ ...previous, moduleId: canonical });
  });

  it('keeps the two CER roles in their existing owners and separate workflows', () => {
    const p = project('CER');
    const medical = getModuleIntelligence('ce-marking', p)!;
    const editor = getModuleIntelligence('cer-generator', p)!;
    expect(medical.moduleId).toBe('medical-device');
    expect(editor.moduleId).toBe('doc-canvas');
    expect(getModuleIntelligence('device-cer', p)).toEqual({ ...medical, moduleId: 'device-cer' });
    expect(getModuleIntelligence('document-authoring', p)).toEqual({ ...editor, moduleId: 'document-authoring' });
    expect(medical.workflowStages.map(stage => stage.id)).not.toEqual(editor.workflowStages.map(stage => stage.id));
  });

  it.each(['projects', 'tasks', 'unrelated', '__proto__'])('does not grant an unrelated %s a domain body', id => {
    expect(getModuleIntelligence(id, project('IND'))).toBeNull();
  });
});

// Captured before production edits. These whole-object digests cover the original
// prose, capabilities, templates, stages, references and evidence requirements.
const legacyBaselines = [
  ['510k-submission', null, 'b87c408d5b833cf612d3fa5f2741ab7ac8b1a51f4aec994328fd314af8e32a84'],
  ['ectd-coauthor', null, '07f4bbc736e0432d478333d6e2503f083ee79e47c70fe1e556da5412cb5aa3e6'],
  ['cmc-wizard', null, 'e8d1dcbbdd56cd72c772d143c4b584d3b06b1a6fb8f4e1e03416379fd899d7bb'],
  ['doc-canvas', null, 'e8ed4427462efc3fc9adfff777c6d11aa37176f96f228e8cca55fa34f35ccb46'],
  ['vault', null, '4ffc9822edd988877a48eeaf06734d559ed457bbce38625108d92089704d05fa'],
  ['510k-submission', '510(k)', 'ce590a181991f92df733516cde872239eee969e31cda2bbab4edd1da36b1d1e8'],
  ['pma-submission', 'PMA', 'e9769623efc1e66d928ae0ced68f1b6045c83d45a0a5dfc537e46f7d8d169525'],
  ['510k-submission', 'De Novo', 'b5838d0961be122ba5e338297091081719c01575faf943be71601183e5a67c92'],
  ['ind-filing', 'IND', '8ed7daa2db782f122ce1b2877b2848bdf6602a3fdf9d3f2c1696fde4dfd95d83'],
  ['nda-bla', 'NDA', '955d81c737cdeada1970f2b5510d42c9638eda2ee8003b05d49e8820364beaf1'],
  ['nda-bla', 'BLA', 'cf1d9c54a20a70361d75f123abe9d5483b8b432960efc05fd62a67e2c41ad1cc'],
] as const;

describe('legacy objects and US-specific content remain unchanged', () => {
  it.each(legacyBaselines)('%s / %s retains its pre-change object', (id, type, expected) => {
    const previous = getModuleIntelligence(id, type ? project(type) : null);
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe(expected);
  });

  it.each([
    ['ind-filing', 'ectd-coauthor'], ['nda-bla', 'ectd-coauthor'],
    ['pma-submission', 'medical-device'], ['ce-marking', 'medical-device'],
    ['csr-author', 'doc-canvas'], ['cer-generator', 'doc-canvas'], ['protocol-designer', 'doc-canvas'],
    ['team-workspace', 'vault'],
  ])('%s preserves its explicit legacy object identity', (id, expected) => {
    expect(getModuleIntelligence(id, null)?.moduleId).toBe(expected);
  });
});

describe('recorded project and session selection uses canonical owners', () => {
  it.each([
    ['IND', 'ind-checklist'], ['US_IND', 'ind-checklist'], ['us_ind', 'ind-checklist'],
    ['510(k)', 'device-510k'], ['US_510K', 'device-510k'], ['De Novo', 'device-510k'],
    ['US_DE_NOVO', 'device-510k'], ['PMA', 'device-pma'], ['US_PMA', 'device-pma'],
    ['NDA', 'submission-center'], ['BLA', 'submission-center'], ['ECTD', 'submission-center'],
    ['CER', 'device-cer'], ['EU_CER', 'device-cer'],
    ['ICH_CSR', 'document-authoring'], ['CSR', 'document-authoring'],
    ['ICH_PROTOCOL', 'protocol-dev'], ['protocol', 'protocol-dev'],
    ['EU_CTA', 'submission-center'], ['CTA', 'submission-center'], ['CA_CTA', 'submission-center'],
    ['EU_MAA', 'submission-center'], ['MAA', 'submission-center'], ['CA_NDS', 'submission-center'],
    ['CA_MDL', 'device-submission'], ['CA_IVD_LICENCE', 'device-submission'],
    ['JP_SHONIN', 'device-submission'], ['JP_IVD_APPROVAL', 'device-submission'],
    ['EU_MDR_CLASS_IIA', 'device-submission'], ['EU_IVDR', 'device-submission'],
  ])('%s selects %s', (type, owner) => {
    expect(detectActiveModule(intelligence(type))).toBe(owner);
  });

  it.each([
    ['section_drafting', 'submission-center'], ['cmc_authoring', 'cmc'],
    ['document_creation', 'document-authoring'], ['document_review', 'vault'],
    ['data_analysis', 'evidence-engine'], ['safety_review', 'safety-signal'],
  ])('%s retains its session role under %s', (contextType, owner) => {
    expect(detectActiveModule(intelligence('PMA', contextType))).toBe(owner);
  });

  it.each([
    ['PMA', 'device-pma'], ['US_PMA', 'device-pma'], ['510(k)', 'device-510k'],
    ['De Novo', 'device-510k'], ['CER', 'device-cer'], [null, 'device-510k'],
    ['CA_MDL', 'device-submission'], ['JP_SHONIN', 'device-submission'],
    ['unrecognised', 'device-510k'], ['NDA', 'device-510k'],
  ])('device submission retains the recorded %s device owner %s', (type, owner) => {
    expect(detectActiveModule(intelligence(type, 'device_submission'))).toBe(owner);
  });

  it.each([null, '', 'unrecognised'])('does not invent a module from %s without an organization', type => {
    expect(detectActiveModule(intelligence(type))).toBeNull();
  });
});

const foreignDrugTypes = [
  'EU_CTA', 'CTA', 'UK_CTA', 'CA_CTA', 'CN_CTA', 'AU_CTN', 'KR_IND',
  'EU_MAA', 'MAA', 'CA_NDS', 'JP_MKT_APPROVAL', 'SG_NDA',
] as const;

describe('FDA-specific submission framing requires a recorded US registry context', () => {
  it.each(foreignDrugTypes)('%s retains its actual type without an FDA application parenthetical', type => {
    const context = getSubmissionTypeContext(type);
    expect(context).not.toBeNull();
    expect(context?.region).not.toBe('US');
    const addon = getModuleIntelligence('ectd-coauthor', project(type))!.systemPromptAddon;
    expect(addon).toContain(`**Type**: ${context!.displayName}`);
    expect(addon).not.toContain('(Investigational New Drug, 21 CFR 312.23)');
    expect(addon).not.toContain('(New Drug Application, 21 CFR 314)');
    expect(addon).not.toContain('(Biologics License Application, 42 USC 262)');
  });

  it.each(['CA_MDL', 'CA_IVD_LICENCE', 'JP_SHONIN', 'JP_IVD_APPROVAL', 'EU_MDR_CLASS_IIA', 'EU_IVDR'])('%s is not framed as an FDA PMA or 510(k)', type => {
    const context = getSubmissionTypeContext(type);
    expect(context).not.toBeNull();
    expect(context?.region).not.toBe('US');
    const addon = getModuleIntelligence('medical-device', project(type))!.systemPromptAddon;
    expect(addon).not.toContain('This is a **Premarket Approval (PMA)**');
    expect(addon).not.toContain('This is a **510(k) Premarket Notification**');
    expect(addon).not.toContain('This is a **De Novo Classification Request**');
    expect(addon).not.toContain('Review period: 180 FDA days');
  });

  it.each([null, '', 'unrecognised'])('does not frame unknown %s as an FDA application', type => {
    const p = project(type);
    const ectd = getModuleIntelligence('ectd-coauthor', p)!.systemPromptAddon;
    expect(ectd).not.toContain('(Investigational New Drug, 21 CFR 312.23)');
    expect(ectd).not.toContain('(New Drug Application, 21 CFR 314)');
    const medical = getModuleIntelligence('medical-device', p)!.systemPromptAddon;
    expect(medical).not.toContain('This is a **510(k) Premarket Notification**');
    expect(medical).not.toContain('This is a **Premarket Approval (PMA)**');
  });
});

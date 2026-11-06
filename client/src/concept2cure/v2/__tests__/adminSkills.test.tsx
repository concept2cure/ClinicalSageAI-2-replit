// @vitest-environment jsdom
/**
 * Admin and access → Skills: a failed read is an error, never an empty
 * library; turning a skill off asks for a reason and sends it; the question
 * test shows why each skill would load.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));

import { ApiRequestError } from '@/lib/queryClient';
import type { OrgSkillDto } from '@shared/ana/skills';
import { AdminSkills } from '../surfaces/AdminSkills';
import { SkillStudio } from '../SkillStudio';
import { authService, type AuthUser } from '@/services/portal/authService';

const STABILITY = {
  key: 'cmc.stability',
  name: 'Stability programs and shelf life',
  description: 'Designing stability studies and supporting a shelf-life claim.',
  parent: 'cmc',
  version: 1,
  contentHash: 'abcdef012345',
  review: { state: 'unreviewed', note: 'Not yet read against its sources.' },
  enabled: true,
  extendedBy: [],
  disciplines: ['cmc'],
  useCases: ['study-design'],
  segments: ['pharma', 'biotech'],
  therapeuticAreas: [],
  regions: [],
  submissionTypes: [],
  surfaces: [],
  documentTypes: [],
};

const JAPAN = {
  ...STABILITY,
  key: 'regulatory-strategy.global-planning.japan',
  name: 'Japan: PMDA and MHLW',
  description: 'Working a program through PMDA consultations and approval in Japan.',
  parent: 'regulatory-strategy.global-planning',
  disciplines: ['regulatory-strategy'],
  segments: [],
  regions: ['JP'],
};

const USAGE = {
  days: 30,
  turnsRead: 40,
  turnsWithSkills: 12,
  capped: false,
  skills: [{ key: 'cmc.stability', turns: 3, picked: 1, deployed: 0, lastUsedAt: '2026-10-20T10:00:00Z' }],
};

const SOURCE_AUDIT_ID = '10203040-1020-4030-8040-102030405060';
const SOURCED_SKILL: OrgSkillDto = {
  ...STABILITY,
  id: 42,
  bundleId: 'a-bundle',
  key: 'org.stability-review',
  name: 'Our stability review',
  instructions: '## Method\nEstimate shelf life from the supplied evidence.',
  triggers: ['shelf life'],
  tools: ['estimate_shelf_life'],
  disciplines: ['cmc'],
  useCases: ['study-design'],
  segments: ['pharma'],
  status: 'active',
  updatedAt: '2026-11-06T10:00:00Z',
  projectId: null,
  extendsSkillKey: null,
  extensionMode: null,
  sourceAuditEventId: SOURCE_AUDIT_ID,
  policyBindings: [{
    policyType: 'requires_approval',
    enforcement: 'mandatory',
    toolName: 'estimate_shelf_life',
    description: 'Ask for approval before calculating a shelf-life claim.',
  }],
};

const SOURCE_HISTORY = {
  auditEventId: SOURCE_AUDIT_ID,
  occurredAt: '2026-11-05T09:00:00Z',
  action: 'ana_skill.created',
  actorName: 'Alex Reviewer',
  reason: 'Record the stability team review requirement.',
  version: 1,
  instructions: SOURCED_SKILL.instructions,
  status: 'active',
};

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function routes(overrides: Record<string, () => unknown> = {}) {
  apiRequest.mockImplementation(async (method: string, path: string, body?: unknown) => {
    const key = `${method} ${path.split('?')[0]}`;
    if (overrides[key]) return overrides[key]();
    if (key === 'GET /api/ana-skills/library') return ok({ skills: [STABILITY, JAPAN], withheld: [] });
    if (key === 'GET /api/ana-skills/organization') return ok({ skills: [] });
    if (key === 'GET /api/ana-skills/usage') return ok(USAGE);
    if (key === 'GET /api/ana-skills/library/cmc.stability') {
      return ok({ skill: { ...STABILITY, instructions: '## Method\nRun `estimate_shelf_life`.', triggers: ['shelf life'], tools: ['estimate_shelf_life'], references: [{ kind: 'ich', id: 'Q1E', label: 'ICH Q1E: Evaluation of stability data' }], disabledReason: null } });
    }
    if (key === 'PUT /api/ana-skills/library/cmc.stability/enabled') return ok({ key: 'cmc.stability', changed: true, enabled: false, audited: true, body });
    if (key === 'POST /api/ana-skills/test') {
      return ok({ selection: { selected: [{ key: 'cmc.stability', name: STABILITY.name, source: 'library', version: 1, contentHash: 'abcdef012345', score: 4, reasons: ['asked about "shelf life"'], attached: [] }], passedOver: [], considered: 120 } });
    }
    throw new Error(`unexpected ${key}`);
  });
}

beforeEach(() => {
  apiRequest.mockReset();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('the Skills tab', () => {
  it('keeps saved skills inside their section so the flex layout cannot clip the ledger row', async () => {
    routes({ 'GET /api/ana-skills/organization': () => ok({ skills: [SOURCED_SKILL] }) });
    render(<AdminSkills />);
    const row = await screen.findByRole('button', { name: /Our stability review/ });
    const section = screen.getByRole('heading', { name: 'Your skills' }).closest('section');
    expect(section?.contains(row)).toBe(true);
    fireEvent.click(row);
    await screen.findByRole('dialog', { name: /Change "Our stability review"/ });
  });

  it('says a failed library read failed, and never shows it as an empty library', async () => {
    routes({ 'GET /api/ana-skills/library': () => { throw new ApiRequestError('boom', 500, {}); } });
    render(<AdminSkills />);
    await screen.findByText("Couldn't load the skill library");
    expect(screen.queryByText('No skill matches these filters.')).toBeNull();
  });

  it('turns a skill off only with a stated reason, and sends that reason', async () => {
    routes();
    render(<AdminSkills />);
    fireEvent.click(await screen.findByRole('button', { name: /Stability programs and shelf life/ }));
    await screen.findByText('Run `estimate_shelf_life`.', { exact: false });
    expect(screen.getByText('ICH Q1E: Evaluation of stability data')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Reason for change/), { target: { value: 'short' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Turn off/ }));
    await waitFor(() => expect(screen.getByText(/A reason of at least 8 characters is required/)).toBeTruthy());
    expect(apiRequest).not.toHaveBeenCalledWith('PUT', expect.anything(), expect.anything());
  });

  it('sends the change with the reason when one is stated', async () => {
    routes();
    render(<AdminSkills />);
    fireEvent.click(await screen.findByRole('button', { name: /Stability programs and shelf life/ }));
    await screen.findByText('Run `estimate_shelf_life`.', { exact: false });
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Reason for change/), { target: { value: 'Our CMC team uses its own SOP.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Turn off/ }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('PUT', '/api/ana-skills/library/cmc.stability/enabled', {
        enabled: false,
        reason: 'Our CMC team uses its own SOP.',
      }),
    );
  });

  it('shows which skills a question would load and why', async () => {
    routes();
    render(<AdminSkills />);
    fireEvent.change(await screen.findByLabelText('Question'), { target: { value: 'How do we justify our shelf life?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    await screen.findByText(/Because asked about "shelf life"/);
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/ana-skills/test', { message: 'How do we justify our shelf life?', submissionType: null });
  });
});

const PRIVATE_CORRECTION = 'PRIVATE-CORRECTION-CANARY: use the approved project evidence before interpreting this study.';
const RULE_SKILL: OrgSkillDto = { ...SOURCED_SKILL, name: 'Sourced dossier rule', version: 3, policyBindings: [],
  standingRule: { schemaVersion: 1, level: 'standing', state: 'active', scope: 'tenant', conflictKey: 'dossier-consistency',
    sourceAuditEventId: SOURCE_AUDIT_ID, sourceInteractionId: 'correction-42', supersedes: [], createdAt: '2026-11-06T10:00:00Z' } };
function studio(skill: OrgSkillDto | null = null, onSaved = vi.fn(), onAsk?: (message: string) => void) {
  routes({ 'GET /api/ana-skills/organization/42/history': () => ok({ history: [SOURCE_HISTORY] }) });
  const props = { target: { kind: 'org' as const, skill, base: null, mode: null }, onClose: vi.fn(), onSaved, onAsk };
  return { ...render(<SkillStudio {...props} />), props, onSaved };
}
function change(label: string | RegExp, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function completeRule(level = 'standing') {
  change('Name', 'Sourced dossier rule'); change('When to use it', 'Reviewing the current evidence before a dossier consistency check.');
  change('Method', '## Method\nRead the current project evidence before reviewing a dossier or making a consistency claim.');
  change('Rule level', level); change('Rule topic', 'dossier-consistency'); change('Correction to remember', PRIVATE_CORRECTION);
  change('Agency or context', 'FDA'); change('Document type', 'Dossier'); change('Intended future behavior', 'Use current project evidence before review.');
  change(/Reason for change/, 'Record the review team correction for future work.');
}
const saveStudio = () => fireEvent.click(screen.getByTestId('skill-studio-save'));

describe('sourced corrections and the visible rule ledger', () => {
  it('captures one atomic correction and rule, then shows its source, date, state and version', async () => {
    let saved = false;
    const created = { ...RULE_SKILL, version: 1 };
    routes({ 'GET /api/ana-skills/organization': () => ok({ skills: saved ? [created] : [] }),
      'GET /api/ana-skills/organization/42/history': () => ok({ history: [SOURCE_HISTORY] }),
      'POST /api/ana-skills/organization': () => { saved = true; return ok({ skill: created, audited: true }); } });
    render(<AdminSkills />); fireEvent.click(await screen.findByRole('button', { name: /New skill/ })); completeRule(); saveStudio();
    fireEvent.click(await screen.findByRole('button', { name: /Sourced dossier rule/ }));
    const ledger = await screen.findByRole('region', { name: 'Standing rule ledger' });
    expect(ledger.textContent).toContain('Standing instruction · active'); expect(ledger.textContent).toContain('Version1');
    expect(ledger.textContent).toContain(SOURCE_AUDIT_ID); expect(ledger.textContent).toContain('correction-42');
    expect(ledger.textContent).toContain('2026'); expect(ledger.textContent).not.toContain(PRIVATE_CORRECTION);
    const body = apiRequest.mock.calls.find(([method, path]) => method === 'POST' && path === '/api/ana-skills/organization')![2];
    expect(body).toMatchObject({ standingRule: { level: 'standing', state: 'active', conflictKey: 'dossier-consistency' },
      correction: { text: PRIVATE_CORRECTION, agency: 'FDA', documentType: 'Dossier' }, status: 'active' });
    expect(body).not.toHaveProperty('scope'); expect(body).not.toHaveProperty('userId');
  });
  it('routes an explicit project rule through the existing project endpoint', async () => {
    const view = studio(); completeRule(); change('Rule scope', 'project'); change('Project reference', '7');
    apiRequest.mockImplementation(async (method, path) => method === 'POST' && path === '/api/ana-skills/projects/7/skills'
      ? ok({ skill: { ...RULE_SKILL, projectId: 7, version: 1, standingRule: { ...RULE_SKILL.standingRule!, scope: 'project' } }, audited: true }) : ok({ history: [] }));
    saveStudio(); await waitFor(() => expect(view.onSaved).toHaveBeenCalled());
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/ana-skills/projects/7/skills', expect.objectContaining({ standingRule: { level: 'standing', state: 'active', conflictKey: 'dossier-consistency', supersedes: [] } }));
    expect(screen.queryByRole('option', { name: /private|personal user/i })).toBeNull();
  });
  it('promotes with the expected version and explicit mandatory approval binding', async () => {
    const view = studio(RULE_SKILL); change('Rule level', 'hard_gate'); change(/Reason for change/, 'Require an approval before dossier consistency checks.');
    apiRequest.mockResolvedValue(ok({ skill: { ...RULE_SKILL, version: 4, standingRule: { ...RULE_SKILL.standingRule!, level: 'hard_gate' } }, audited: true }));
    saveStudio(); await waitFor(() => expect(view.onSaved).toHaveBeenCalledWith('Sourced dossier rule saved, version 4.'));
    const body = apiRequest.mock.calls.find(([method]) => method === 'PUT')![2];
    expect(body).toMatchObject({ expectedVersion: 3, standingRule: { level: 'hard_gate', state: 'active' },
      policyBindings: [{ policyType: 'requires_approval', enforcement: 'mandatory', toolName: 'check_dossier_consistency' }] });
    expect(body).not.toHaveProperty('correction'); expect(body).not.toHaveProperty('sourceAuditEventId');
  });
  it('revokes explicitly without lowering the mandatory level or dropping its binding', async () => {
    const binding = { policyType: 'requires_approval' as const, enforcement: 'mandatory' as const, toolName: 'check_dossier_consistency', description: 'Ask before dossier consistency checks.' };
    const supersedes = [{ bundleId: 'previous-rule', version: 2 }];
    const hard: OrgSkillDto = { ...RULE_SKILL, policyBindings: [binding], standingRule: { ...RULE_SKILL.standingRule!, level: 'hard_gate', supersedes } };
    studio(hard); expect((screen.getByRole('option', { name: 'Soft preference' }) as HTMLOptionElement).disabled).toBe(true);
    expect(screen.queryByLabelText('Status')).toBeNull();
    expect((screen.getByLabelText('Replace exact rule versions') as HTMLTextAreaElement).value).toBe('previous-rule@2');
    expect((screen.getByLabelText('Replace exact rule versions') as HTMLTextAreaElement).readOnly).toBe(true);
    change('Replace exact rule versions', '');
    change('Rule state', 'revoked'); change(/Reason for change/, 'Retire this approval rule after team review.');
    apiRequest.mockResolvedValue(ok({ skill: { ...hard, version: 4, status: 'archived', standingRule: { ...hard.standingRule!, state: 'revoked' } }, audited: true }));
    saveStudio(); await waitFor(() => expect(apiRequest.mock.calls.some(([method]) => method === 'PUT')).toBe(true));
    const body = apiRequest.mock.calls.find(([method]) => method === 'PUT')![2];
    expect(body).toMatchObject({ expectedVersion: 3, status: 'archived',
      standingRule: { level: 'hard_gate', state: 'revoked', supersedes }, policyBindings: [binding] });
    expect(body).not.toHaveProperty('correction');
    expect(body).not.toHaveProperty('sourceAuditEventId');
  });
  it('keeps terminal rule records read-only', async () => {
    studio({ ...RULE_SKILL, status: 'archived', standingRule: { ...RULE_SKILL.standingRule!, state: 'revoked', revokedAt: '2026-11-06T12:00:00Z', revokedBy: 11 } });
    await screen.findByRole('region', { name: 'Standing rule ledger' });
    expect((screen.getByTestId('skill-studio-save') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Method') as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.getByText('This rule no longer applies to future work.')).toBeTruthy(); saveStudio();
    expect(apiRequest.mock.calls.some(([method]) => method === 'PUT')).toBe(false);
  });
});

describe('explicit rule conflict decisions and correction privacy', () => {
  it('keeps a structured conflict visible and replaces only versions the person explicitly selects', async () => {
    const view = studio(); completeRule(); let attempts = 0;
    apiRequest.mockImplementation(async () => {
      if (++attempts === 1) throw new ApiRequestError('private provider text', 409, { error: { code: 'RULE_CONFLICT', message: PRIVATE_CORRECTION,
        decisionPackage: { conflictKey: 'dossier-consistency', ruleRefs: [{ bundleId: 'older-rule', version: 2 }], resolution: PRIVATE_CORRECTION } } });
      return ok({ skill: { ...RULE_SKILL, version: 1 }, audited: true });
    });
    saveStudio(); const decision = await screen.findByRole('region', { name: 'Rule conflict decision' });
    expect(decision.textContent).toContain('older-rule · version 2'); expect(decision.textContent).not.toContain(PRIVATE_CORRECTION);
    expect(attempts).toBe(1); expect((screen.getByLabelText('Method') as HTMLTextAreaElement).value).toContain('current project evidence');
    fireEvent.click(within(decision).getByRole('button', { name: 'Use these exact versions for replacement' }));
    expect(attempts).toBe(1); saveStudio(); await waitFor(() => expect(view.onSaved).toHaveBeenCalled());
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')[1][2].standingRule.supersedes).toEqual([{ bundleId: 'older-rule', version: 2 }]);
  });
  it('keeps correction source text out of prompt tests and design-with-AnA messages', async () => {
    const ask = vi.fn(); studio(null, vi.fn(), ask); completeRule();
    apiRequest.mockResolvedValue(ok({ selection: { selected: [], passedOver: [], considered: 1 }, draftKey: 'draft' }));
    change(/Type a question/, 'Check the dossier method.'); fireEvent.click(screen.getByRole('button', { name: 'Try it' }));
    await screen.findByText('This skill would not load for that question. Add a trigger phrase that appears in it, or pick the skill in the conversation.');
    const tried = apiRequest.mock.calls.find(([, path]) => path === '/api/ana-skills/test')![2];
    expect(JSON.stringify(tried)).not.toContain(PRIVATE_CORRECTION); expect(tried.draft).not.toHaveProperty('correction');
    expect(tried.draft).not.toHaveProperty('standingRule'); expect(tried.draft).not.toHaveProperty('policyBindings');
    fireEvent.click(screen.getByRole('button', { name: 'Ask AnA to draft a skill' }));
    expect(ask).toHaveBeenCalled(); expect(ask.mock.calls[0][0]).not.toContain(PRIVATE_CORRECTION);
  });
  it('adds a typed rule to an existing method with its exact version and a recorded correction source', async () => {
    const ordinary = { ...RULE_SKILL, standingRule: null, sourceAuditEventId: null };
    const view = studio(ordinary); completeRule(); change('Correction source', 'audit'); change('Correction audit event', SOURCE_AUDIT_ID);
    apiRequest.mockResolvedValue(ok({ skill: { ...RULE_SKILL, version: 4 }, audited: true })); saveStudio();
    await waitFor(() => expect(view.onSaved).toHaveBeenCalled());
    const body = apiRequest.mock.calls.find(([method]) => method === 'PUT')![2];
    expect(body).toMatchObject({ expectedVersion: 3, sourceAuditEventId: SOURCE_AUDIT_ID });
    expect(body).not.toHaveProperty('correction');
  });
  it('keeps stale-version and malformed conflict failures contained without retrying or overwriting', async () => {
    studio(RULE_SKILL); change(/Reason for change/, 'Clarify the saved review method.');
    apiRequest.mockRejectedValue(new ApiRequestError(PRIVATE_CORRECTION, 409, { error: { code: 'RULE_CONFLICT', message: PRIVATE_CORRECTION,
      decisionPackage: { conflictKey: 'dossier-consistency', ruleRefs: [{ bundleId: '<private-source>', version: -1 }] } } }));
    saveStudio(); await screen.findByText('The rule version or authority changed. Reopen the current ledger before making an explicit change.');
    expect(screen.queryByRole('region', { name: 'Rule conflict decision' })).toBeNull();
    expect(screen.getByRole('alert').textContent).not.toContain(PRIVATE_CORRECTION);
    expect(apiRequest.mock.calls.filter(([method]) => method === 'PUT')).toHaveLength(1);
    expect(apiRequest.mock.calls.find(([method]) => method === 'PUT')![2].expectedVersion).toBe(3);
  });
  it('suppresses late saves and clears source fields after a session change', async () => {
    let revision = 1;
    let actor = { id: '11', organizationId: '2' } as AuthUser;
    vi.spyOn(authService, 'getUser').mockImplementation(() => actor);
    vi.spyOn(authService, 'captureSessionReadGuard').mockImplementation(() => { const captured = revision;
      return { sameRevision: () => captured === revision, current: () => captured === revision, credentialsCurrent: () => captured === revision }; });
    const view = studio(); completeRule(); let settle!: (value: unknown) => void;
    apiRequest.mockImplementation(() => new Promise(resolve => { settle = resolve; })); saveStudio();
    actor = { id: '11', organizationId: '3' } as AuthUser; revision++;
    view.rerender(<SkillStudio {...view.props} />); await screen.findByText('Session changed');
    expect(screen.queryByLabelText('Correction to remember')).toBeNull();
    await act(async () => settle(ok({ skill: { ...RULE_SKILL, version: 1 }, audited: true })));
    expect(view.onSaved).not.toHaveBeenCalled();
  });
  it('retires a draft when the selected skill version changes instead of overwriting newer work', async () => {
    const view = studio(RULE_SKILL); change('Method', '## Method\nThis unsaved method must not overwrite a newer saved rule version.');
    change(/Reason for change/, 'Clarify the existing current review method.');
    view.rerender(<SkillStudio {...view.props} target={{ ...view.props.target, skill: { ...RULE_SKILL, version: 4 } }} />);
    await screen.findByText('Skill changed'); expect(screen.queryByLabelText('Method')).toBeNull();
    expect(apiRequest.mock.calls.some(([method]) => method === 'PUT')).toBe(false);
  });
});

describe('how often AnA used each skill', () => {
  it('says how many turns followed skills, marks each skill’s use, and explains it in the drawer', async () => {
    routes();
    render(<AdminSkills />);
    expect((await screen.findByTestId('skills-usage-summary')).textContent).toContain('AnA answered 40 turns; 12 followed at least one skill');
    const stability = await screen.findByRole('button', { name: /Stability programs and shelf life/ });
    expect(stability.textContent).toContain('used 3×');
    expect(screen.getByRole('button', { name: /Japan: PMDA and MHLW/ }).textContent).toContain('not used');
    fireEvent.click(stability);
    expect((await screen.findByTestId('skill-usage')).textContent).toContain('Loaded in 3 turns in the last 30 days (1 picked in a conversation; the rest chosen by AnA)');
  });

  it('filters to the skills AnA did not use, and to those written for a market', async () => {
    routes();
    render(<AdminSkills />);
    await screen.findByTestId('skills-usage-summary');
    fireEvent.change(screen.getByLabelText('Use'), { target: { value: 'unused' } });
    expect(screen.queryByRole('button', { name: /Stability programs/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Japan: PMDA and MHLW/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Use'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Written for a market'), { target: { value: 'JP' } });
    expect(screen.queryByRole('button', { name: /Stability programs/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Japan: PMDA and MHLW/ })).toBeTruthy();
  });

  it('says use could not be read, and never shows every skill as unused', async () => {
    routes({ 'GET /api/ana-skills/usage': () => { throw new ApiRequestError('boom', 500, {}); } });
    render(<AdminSkills />);
    await screen.findByText(/Couldn't read how often AnA used each skill/);
    const stability = await screen.findByRole('button', { name: /Stability programs and shelf life/ });
    expect(stability.textContent).not.toContain('not used');
    expect((screen.getByLabelText('Use') as HTMLSelectElement).disabled).toBe(true);
  });
});

describe('sourced approval rules in the existing skill studio', () => {
  it('shows mandatory rules independently of prompt selection and links their source audit record', async () => {
    routes({
      'GET /api/ana-skills/organization': () => ok({ skills: [SOURCED_SKILL] }),
      'GET /api/ana-skills/organization/42/history': () => ok({ history: [SOURCE_HISTORY] }),
    });
    render(<AdminSkills />);
    fireEvent.click(await screen.findByRole('button', { name: /Our stability review/ }));
    const rules = await screen.findByRole('region', { name: 'Mandatory approval rules' });
    expect(within(rules).getByText('Ask for approval before calculating a shelf-life claim.')).toBeTruthy();
    expect(within(rules).getByText(/even when this skill is not selected or is turned off for prompts in a project/)).toBeTruthy();
    expect(within(rules).queryByRole('textbox')).toBeNull();
    const sourceLink = await within(rules).findByRole('link', { name: 'Source audit record' });
    const sourceId = sourceLink.getAttribute('href')!.slice(1);
    const sourceRow = document.getElementById(sourceId);
    expect(sourceRow?.textContent).toContain('Alex Reviewer');
    expect(sourceRow?.textContent).toContain('Record the stability team review requirement.');
  });

  it('keeps approval bindings and provenance out of an ordinary method edit instead of clearing or rewriting them', async () => {
    routes({
      'GET /api/ana-skills/organization': () => ok({ skills: [SOURCED_SKILL] }),
      'GET /api/ana-skills/organization/42/history': () => ok({ history: [SOURCE_HISTORY] }),
      'PUT /api/ana-skills/organization/42': () => ok({ skill: SOURCED_SKILL }),
    });
    render(<AdminSkills />);
    fireEvent.click(await screen.findByRole('button', { name: /Our stability review/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Method'), { target: { value: '## Method\nRead the supplied stability evidence before estimating shelf life.' } });
    fireEvent.change(within(dialog).getByLabelText(/Reason for change/), { target: { value: 'Clarify the evidence reading step.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save skill' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      'PUT',
      '/api/ana-skills/organization/42',
      expect.objectContaining({
        instructions: '## Method\nRead the supplied stability evidence before estimating shelf life.',
        reason: 'Clarify the evidence reading step.',
      }),
    ));
    const body = apiRequest.mock.calls.find(([method, path]) => method === 'PUT' && path === '/api/ana-skills/organization/42')![2];
    expect(body).not.toHaveProperty('policyBindings');
    expect(body).not.toHaveProperty('sourceAuditEventId');
  });

  it('distinguishes saved draft rules and retains their source reference when history cannot load', async () => {
    routes({
      'GET /api/ana-skills/organization': () => ok({ skills: [{ ...SOURCED_SKILL, status: 'draft' }] }),
      'GET /api/ana-skills/organization/42/history': () => { throw new ApiRequestError('unavailable', 500, {}); },
    });
    render(<AdminSkills />);
    fireEvent.click(await screen.findByRole('button', { name: /Our stability review/ }));
    const rules = await screen.findByRole('region', { name: 'Mandatory approval rules' });
    expect(within(rules).getByText(/These saved rules apply when this skill is active/)).toBeTruthy();
    expect(within(rules).getByText(`Source audit record: ${SOURCE_AUDIT_ID}`)).toBeTruthy();
    expect(within(rules).queryByRole('link')).toBeNull();
    await screen.findByText(/Couldn't load the versions/);
    expect(within(rules).queryByText(/outside the versions shown here/)).toBeNull();
  });
});

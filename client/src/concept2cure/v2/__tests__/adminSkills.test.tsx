// @vitest-environment jsdom
/**
 * Admin and access → Skills: a failed read is an error, never an empty
 * library; turning a skill off asks for a reason and sends it; the question
 * test shows why each skill would load.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));

import { ApiRequestError } from '@/lib/queryClient';
import type { OrgSkillDto } from '@shared/ana/skills';
import { AdminSkills } from '../surfaces/AdminSkills';

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
afterEach(cleanup);

describe('the Skills tab', () => {
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

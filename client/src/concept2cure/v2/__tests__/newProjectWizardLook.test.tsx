// @vitest-environment jsdom
/**
 * New project reads like Claude's "Create a project" (D2.md §2.3–§2.4, D2-2).
 *
 * The wizard opened under an orange "WORKSPACE" eyebrow, with orange "STEP 1 / 2 / 3"
 * kickers and an orange current disc, a tinted guidance box with AnA's spark over the
 * catalogue, a dashed "Team assignment isn't available yet" box at the end of step 2,
 * and a green spark box under a filled review table. This pins the quiet version, and
 * that nothing a removed element said is lost:
 *  - the step position is still stated in text ("Step N", for screen readers) and by
 *    `aria-current`, never by colour alone;
 *  - the step-1 note keeps its two sentences;
 *  - the Team members field is gone, and the review step says where people are added.
 *    The last test follows that sentence to the project page and proves the place it
 *    names exists and offers the sharing controls.
 *
 * jsdom applies no stylesheet, so the look itself is pinned by reading the `.npw-*`
 * block of project-home-v2.css as text, as projectHomeStageCss.test.tsx does.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ProjectSharingResponse } from '@shared/project-sharing';

const request = vi.hoisted(() => vi.fn());
const tenant = vi.hoisted(() => ({
  currentOrganization: { id: 7 },
  currentClientWorkspace: { id: '21', organizationId: '7' },
  setCurrentClientWorkspace: vi.fn(),
}));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: request }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() }), useAuthUser: () => actual.authService.getUser() };
});
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => tenant }));
vi.mock('../surfaces/AnaVerbs', async original => ({
  ...(await original<typeof import('../surfaces/AnaVerbs')>()),
  RegistryPicker: ({ onChange }: { onChange: (id: string) => void }) => <button onClick={() => onChange('510k')}>Pick filing</button>,
}));
vi.mock('../surfaces/RegistryBridge', async original => ({
  ...(await original<typeof import('../surfaces/RegistryBridge')>()),
  getSubmissionTypeContext: () => ({ id: 'us_510k', displayName: 'Traditional 510(k)', pathwayKey: '510k', agency: 'FDA', region: 'US' }),
}));

import { authService } from '@/services/portal/authService';
import { NewProjectWizard } from '../surfaces/Projects';
import { ProjectHome } from '../surfaces/ProjectHome';
import { clearShellProject } from '../shellProject';

const PID = 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05';
const ok = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data }) as Response;
const token = `x.${btoa(JSON.stringify({ userId: 12, organizationId: 7 }))}.x`;
const intake = { success: true, clients: [{ id: '21', name: 'Sponsor A', organizationId: '7', status: 'active' }],
  meta: { purpose: 'project-intake', organizationId: 7, actorUserId: 12 } };
const created = { data: { id: PID, title: 'Aurora CGM' },
  meta: { created: true, projectAnchorId: 51, organizationId: 7, actorUserId: 12, clientWorkspaceId: 21, clientWorkspaceName: 'Sponsor A' } };
const posts = () => request.mock.calls.filter(([method]) => method === 'POST');
const npw = () => document.querySelector('.npw') as HTMLElement;

async function toStep2() {
  fireEvent.click(screen.getByRole('button', { name: 'Pick filing' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Client workspace' })).toHaveProperty('value', '21'));
  fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), { target: { value: 'Aurora CGM' } });
}
async function toReview() {
  await toStep2();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { name: 'Review & create' });
}

beforeEach(() => {
  clearShellProject();
  authService.setToken(token, { id: '12', organizationId: '7', permissions: [] } as never, 'fixture-refresh', 3600);
  tenant.setCurrentClientWorkspace.mockReset();
  request.mockImplementation(async (method: string) => method === 'GET' ? ok(intake) : ok(created, 201));
});
afterEach(() => {
  cleanup(); request.mockReset(); authService.endSession(null); clearShellProject(); delete window.C2C_PROJECT;
});

describe('New project: the header and the step rail', () => {
  it('has no eyebrow, and one sub-line that says what the three steps do', () => {
    render(<NewProjectWizard onClose={vi.fn()} onNav={vi.fn()} />);
    expect(npw().querySelector('.ph-eyebrow')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'New project' })).toBeTruthy();
    expect(npw().querySelector('.npw-head .ph-sub')?.textContent).toBe(
      'Choose the filing, describe the project, then review what will be recorded. '
      + 'The filing decides the dossier outline the project is built against.');
  });

  it('states each step for screen readers only, and the current one with aria-current', () => {
    render(<NewProjectWizard onClose={vi.fn()} onNav={vi.fn()} />);
    const steps = Array.from(npw().querySelectorAll('.npw-step'));
    expect(steps).toHaveLength(3);
    steps.forEach((step, i) => {
      const kicker = step.querySelector('.sr-only');
      expect(kicker?.textContent).toBe(`Step ${i + 1}`);
      /* No visible kicker is left beside the name. */
      expect(step.querySelector('.npw-step-k')).toBeNull();
    });
    expect(steps.map(s => s.querySelector('.npw-step-t')?.textContent)).toEqual(['Choose filing type', 'Configure project', 'Review & create']);
    expect(steps[0].getAttribute('aria-current')).toBe('step');
  });

  it('keeps the step-1 note as text, without AnA’s spark', () => {
    render(<NewProjectWizard onClose={vi.fn()} onNav={vi.fn()} segment="medtech" />);
    const note = npw().querySelector('.npw-seg-note') as HTMLElement;
    expect(note.querySelector('.ico')).toBeNull();
    expect(note.querySelector('.npw-seg-t')?.textContent).toBe('Tailored for Medical Devices');
    expect(note.querySelector('.npw-seg-s')?.textContent).toMatch(/^The filings for your client type come first\./);
  });
});

describe('New project: Team members leaves the form, and the review says where people are added', () => {
  it('step 2 has no Team members field and no empty-state box', async () => {
    render(<NewProjectWizard onClose={vi.fn()} onNav={vi.fn()} />);
    await toStep2();
    expect(npw().textContent).not.toMatch(/Team members|Team assignment|add teammates/i);
    expect(npw().querySelector('.c2c-empty-state')).toBeNull();
  });

  it('step 3 says, under the list, what happens on create and where to add people; the body is unchanged', async () => {
    const onNav = vi.fn();
    render(<NewProjectWizard onClose={vi.fn()} onNav={onNav} />);
    await toReview();
    expect(npw().querySelector('.npw-next')).toBeNull();
    expect(npw().querySelector('.npw-form .ico')).toBeNull();
    const note = npw().querySelector('dl.npw-review + p.npw-review-note');
    expect(note?.textContent).toBe(
      'Your project is saved to the portfolio and opens in its workspace, where you can add documents and author sections with AnA. '
      + 'After it is created, share it with people in your organization from its Team section.');
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('project-home'));
    /* The creator-only list the server expects, exactly as before. */
    expect(posts()[0][2]).toMatchObject({ teamMembers: [], name: 'Aurora CGM', programType: '510k' });
  });

  it('the place the review names exists: the project page has a Team section that grants sharing', async () => {
    render(<NewProjectWizard onClose={vi.fn()} onNav={vi.fn()} />);
    await toReview();
    expect(npw().querySelector('.npw-review-note')?.textContent).toContain('from its Team section');
    cleanup();

    const team = { program_id: PID, project_id: 51, team: [{ entry_id: 'user:12', user_id: 12, role: null,
      name: 'Coordinator', email: null, label: 'Coordinator', identity: 'active_member',
      responsibilities: ['project_owner'], sharing_role: 'owner', sources: ['project_owner', 'project_creator'] }] };
    const sharing: ProjectSharingResponse = { projectId: 'proj_51', programId: PID, organizationId: 7, actorUserId: 12,
      clientWorkspaceId: 21, visibility: 'private', legacyFallbackApplied: false, canManage: true,
      candidates: [{ userId: 12, label: 'Coordinator' }, { userId: 13, label: 'Sponsor A colleague' }],
      members: [{ userId: 12, role: 'owner', status: 'active', addedById: null, addedAt: null, explicit: false,
        implicitSources: ['project_owner', 'project_creator'], canSetRole: false, canRevoke: false }] };
    request.mockImplementation(async (_method: string, path: string) => {
      if (path === `/api/c2c/projects/${PID}`) return ok({ success: true, data: { id: PID, name: 'Aurora CGM' } });
      if (path === `/api/c2c/projects/${PID}/team`) return ok({ success: true, data: team });
      if (path === `/api/concept2cure/projects/51/sharing?programId=${PID}`) return ok({ success: true, data: sharing });
      return ok({ success: true, data: {} });
    });
    window.C2C_PROJECT = { id: PID, title: 'Aurora CGM' };
    render(<ProjectHome surface={{ id: 'project-home' } as never} segment="medtech" onNav={vi.fn()} onAsk={vi.fn()} />);
    /* Since D3-3 the Team section is the Team card in Project knowledge, on every step; its "Manage" opens the Team
       drawer, which holds the sharing controls. */
    const card = await screen.findByRole('region', { name: 'Team' });
    fireEvent.click(await within(card).findByRole('button', { name: /^Manage/ }));
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByLabelText('Organization member')).toBeTruthy();
    expect(within(drawer).getByRole('button', { name: 'Grant sharing' })).toBeTruthy();
  });
});

/* ── The look, read from the stylesheet ─────────────────────────────────────── */

const SHEET = readFileSync(resolve(__dirname, '../styles/project-home-v2.css'), 'utf8');
const START = SHEET.indexOf('/* ── New project wizard');
const END = SHEET.indexOf('/* ── Project home dashboard');
const BLOCK = SHEET.slice(START, END).replace(/\/\*[\s\S]*?\*\//g, '');
/** Every rule in the block as [selector, declarations], media queries flattened and
 *  selector lists split, so a selector's declarations are found wherever it is listed. */
const RULES: Array<[string, string]> = Array.from(BLOCK.replace(/@media[^{]*\{/g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g))
  .flatMap(m => m[1].split(/,(?![^(]*\))/).map(s => [s.trim().replace(/\s+/g, ' '), m[2]] as [string, string]));
const decl = (selector: string) => RULES.filter(([s]) => s === selector).map(([, d]) => d).join(';');

describe('New project: the .npw-* block of project-home-v2.css', () => {
  it('is found', () => {
    expect(START).toBeGreaterThan(-1);
    expect(END).toBeGreaterThan(START);
    expect(RULES.length).toBeGreaterThan(20);
  });

  it('draws no orange: the one primary button is D0’s, not this block’s', () => {
    expect(BLOCK).not.toMatch(/--accent/);
  });

  it('sizes every text from the D0 type scale, never below 12px', () => {
    const sizes = Array.from(BLOCK.matchAll(/font-size\s*:\s*([^;}]+)/g)).map(m => m[1].trim());
    expect(sizes.length).toBeGreaterThan(5);
    for (const size of sizes) expect(size, size).toMatch(/^var\(--fs-(caption|small|body|section)\)$/);
  });

  it('uses no muted ink below --text-300 (the quiet floor off --bg-000)', () => {
    expect(BLOCK).not.toMatch(/--text-[45]00/);
  });

  it('marks the current step in ink, a done step in --text-200, never in a status colour', () => {
    expect(decl('.c2c-v2 .npw-step[data-state="current"] .npw-step-btn')).toMatch(/border-bottom-color:\s*var\(--text-100\)/);
    expect(decl('.c2c-v2 .npw-step[data-state="current"] .npw-step-n')).toMatch(/background:\s*var\(--text-100\)/);
    expect(decl('.c2c-v2 .npw-step[data-state="current"] .npw-step-n')).toMatch(/color:\s*var\(--bg-000\)/);
    expect(decl('.c2c-v2 .npw-step[data-state="done"] .npw-step-n')).toMatch(/color:\s*var\(--text-200\)/);
    expect(BLOCK).not.toMatch(/--success|--warning|--error/);
  });

  it('turns the step-1 box into one quiet line, and retires the kicker and the green box', () => {
    const note = decl('.c2c-v2 .npw-seg-note');
    expect(note).toMatch(/background:\s*none/);
    expect(note).toMatch(/border:\s*0/);
    expect(RULES.some(([s]) => /\.npw-step-k\b|\.npw-next\b|\.npw-seg-note \.ico/.test(s))).toBe(false);
  });

  it('keeps `.npw-seg-t` a heading where step 2 uses it, outside the step-1 note', () => {
    /* ProjectDiscoveryHandoff.tsx heads its section with <h3 class="npw-seg-t">
       "Start from your saved discovery". With the rule only under .npw-seg-note,
       that h3 fell back to Tailwind's preflight: body size, weight 400. */
    const base = decl('.c2c-v2 .npw-seg-t');
    expect(base).toMatch(/font-weight:\s*600/);
    expect(base).toMatch(/color:\s*var\(--text-100\)/);
    expect(base).toMatch(/margin:\s*0/);
    expect(base).not.toMatch(/display:\s*inline/);
    /* The step-1 note's quiet inline form overrides it there. */
    expect(decl('.c2c-v2 .npw-seg-note .npw-seg-t')).toMatch(/display:\s*inline/);
  });

  it('frames the review once, at radius 12, with hairline rows and no fill', () => {
    expect(decl('.c2c-v2 .npw-review')).toMatch(/border-radius:\s*var\(--radius-xl\)/);
    expect(decl('.c2c-v2 .npw-review')).toMatch(/background:\s*var\(--bg-000\)/);
    expect(decl('.c2c-v2 .npw-review-row')).toMatch(/background:\s*none/);
    expect(decl('.c2c-v2 .npw-review-row')).toMatch(/border-top:\s*1px solid var\(--border-subtle\)/);
    expect(BLOCK).not.toMatch(/--bg-0?50\b|--bg-100\b/);
  });

  it('aligns the header, rail, body and footer on one gutter, the Projects page’s 1120px column', () => {
    const gutter = 'max(40px, calc((100% - 1120px) / 2))';
    for (const part of ['.npw-head', '.npw-steps', '.npw-inner', '.npw-foot']) {
      expect(decl(`.c2c-v2 ${part}`), part).toContain(gutter);
    }
    expect(decl('.c2c-v2 .npw-inner[data-measure="form"] > *')).toMatch(/max-width:\s*640px/);
  });

  it('gives form fields 36px, and gives touch its 44px back', () => {
    expect(decl('.c2c-v2 .npw .c2c-input')).toMatch(/min-height:\s*36px/);
    const coarse = BLOCK.match(/@media\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?\})\s*\}/)?.[1] ?? '';
    expect(coarse).toMatch(/\.c2c-v2 \.npw \.c2c-input[^{]*\{[^}]*min-height:\s*44px/);
  });

  it('keeps the shared field classes’ layout where other screens use them: the two-column grid is the wizard’s own', () => {
    /* ProjectSettings.tsx and DiscoveryQuestions.tsx reuse .npw-fields / .npw-grid. */
    expect(decl('.c2c-v2 .npw .npw-fields')).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(decl('.c2c-v2 .npw-fields')).toMatch(/auto-fit/);
  });
});

/* ── The registry picker, the wizard's filing step (D2-2b; D2.md §2.4 item 9, §2.6 items 1–2) ──────────────── */

const APP = readFileSync(resolve(__dirname, '../styles/app-v2.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** Every `.rpk-*` rule in app-v2.css as [selector, declarations], media queries flattened. */
const RPK: Array<[string, string]> = Array.from(APP.replace(/@media[^{]*\{/g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g))
  .flatMap(m => m[1].split(/,(?![^(]*\))/).map(s => [s.trim().replace(/\s+/g, ' '), m[2]] as [string, string]))
  .filter(([s]) => /\.rpk-/.test(s));
const rpk = (selector: string) => RPK.filter(([s]) => s === selector).map(([, d]) => d).join(';');

describe('New project: the registry picker reads as Claude\'s (D2-2b)', () => {
  it('draws no orange and no status colour anywhere in the picker', () => {
    expect(RPK.length).toBeGreaterThan(30);
    for (const [selector, declarations] of RPK) {
      expect(`${selector}{${declarations}}`).not.toMatch(/--accent|--ai\b|--success|--warning/);
    }
  });

  it('marks the chosen tab with an ink underline, and the chosen card with an ink ring', () => {
    expect(rpk('.c2c-v2 .rpk-tab[data-on]')).toMatch(/border-bottom-color:\s*var\(--text-100\)/);
    expect(rpk('.c2c-v2 .rpk-tab[data-on]')).toMatch(/color:\s*var\(--text-100\)/);
    expect(rpk('.c2c-v2 .rpk-type[data-on]')).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--text-100\)/);
    expect(rpk('.c2c-v2 .rpk-type[data-on]')).toMatch(/background:\s*var\(--bg-050\)/);
    expect(rpk('.c2c-v2 .rpk-fchip.on')).toMatch(/border-color:\s*var\(--text-100\)/);
  });

  it('gives a document type\'s agency, region, dossier and CTD chips one neutral style: they are facts, not statuses', () => {
    const neutral = rpk('.c2c-v2 .rpk-chip:is(.rpk-chip-agency,.rpk-chip-region,.rpk-chip-dossier,.rpk-chip-ctd)');
    expect(neutral).toMatch(/background:\s*var\(--bg-100\)/);
    expect(neutral).toMatch(/color:\s*var\(--text-200\)/);
    expect(rpk('.c2c-v2 .rpk-chip')).toMatch(/background:\s*var\(--bg-100\)/);
  });

  it('sizes no picker text below 12px and uses no muted ink below --text-300', () => {
    for (const [selector, declarations] of RPK) {
      for (const m of declarations.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)) expect(Number(m[1]), selector).toBeGreaterThanOrEqual(12);
      expect(`${selector}{${declarations}}`).not.toMatch(/--text-(400|500)/);
    }
  });

  it('lays the cards in one column at phone width, and the cards at radius 12', () => {
    expect(rpk('.c2c-v2 .rpk-type')).toMatch(/border-radius:\s*var\(--radius-xl\)/);
    expect(APP).toMatch(/@media \(max-width:720px\)\{\.c2c-v2 \.rpk-cat-grid\{grid-template-columns:1fr;\}\}/);
  });
});

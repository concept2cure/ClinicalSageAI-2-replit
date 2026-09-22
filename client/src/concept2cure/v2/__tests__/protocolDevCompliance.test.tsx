// @vitest-environment jsdom
/**
 * Protocol workspace — the Compliance tab.
 *
 * `docs/design/PROTOCOL_INTELLIGENCE.md`, direction three: the protocol
 * document is not compliant because its sections are filled in.
 * `protocol-rule-pack.ts` evaluates it against ICH M11 / E8(R1) / E9(R1) /
 * E6(R3), 21 CFR 312.23(a)(6) and 50.25, 45 CFR 46 Subparts B/C/D, EU CTR
 * Annex I and FDORA §3601, and this tab renders those findings.
 *
 * The assertions that matter most here are negative ones:
 *
 *   • THE HEADLINE IS THREE NUMBERS, NOT A PERCENTAGE. A percentage computed
 *     over rules that did not run is the defect this codebase has already been
 *     burned by (`requiredTotal === 0 ? 100` in protocol-development-logic.ts),
 *     so this file asserts that no `%` reaches the pane at all;
 *   • a `not-assessed` rule reads, in words, as "not assessed" — never as a
 *     pass, a tick or a green anything. An unassessed protocol is not a clean
 *     one.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProtocolWorkspace } from '../surfaces/ProtocolDev';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as Response;

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const BASE_DOC = {
  id: '41', title: 'A Phase III Study of BX-204', shortTitle: 'BX-204-301', kind: 'clinical',
  version: '0.7', status: 'draft', sponsor: 'Sponsor', pi: 'PI', updated: '2026-09-20',
  completeness: 68, openSection: 's1',
  sections: [{ id: 's1', num: '1', title: 'Background', status: 'draft', required: true }],
  content: {}, objectives: [], eligibility: { inclusion: [], exclusion: [] },
  soa: { visits: [], assessments: [], cells: {}, issues: [] }, risks: [], milestones: [],
  budget: { params: null, items: [], summary: null }, amendments: [], deviations: [],
  reviews: [], consent: [], completenessFindings: [], studyDesign: null,
};

/** As `pdev-view-assembler.ts` shapes `evaluateProtocolRules()`. ICH M11 is
 *  listed FIRST and carries no unmet finding, so a panel that keeps input order
 *  fails the ordering assertion below. */
const RULE_FINDINGS = {
  assessed: 3,
  unmet: 1,
  notAssessed: 2,
  findings: [
    {
      ruleId: 'M11-SYNOPSIS', standard: 'ICH M11', clause: '§1.2', title: 'Protocol synopsis recorded',
      status: 'met', sev: 'info',
      message: 'The protocol synopsis section is complete.',
      remediation: '',
    },
    {
      ruleId: 'M11-DIVERSITY', standard: 'ICH M11', clause: '§6.1', title: 'Diversity action plan named',
      status: 'not-assessed', sev: 'warning',
      message: 'No section names a diversity action plan and the protocol records no enrolment regions, so this rule could not be decided.',
      remediation: 'Record the enrolment regions, or add the diversity action plan section.',
    },
    {
      ruleId: 'E9R1-ESTIMAND', standard: 'ICH E9(R1)', clause: 'Section A.3', title: 'Estimand for the primary objective',
      status: 'unmet', sev: 'critical',
      message: 'The primary objective records no estimand attributes.',
      remediation: 'Record the population, variable, intercurrent-event strategy and summary measure.',
    },
    {
      ruleId: 'E9R1-ICE', standard: 'ICH E9(R1)', clause: 'Section A.3.2', title: 'Intercurrent-event strategy named',
      status: 'attention', sev: 'warning',
      message: 'A keyword scan of the statistical section found no strategy name. The section content was not inspected.',
      remediation: 'Name the strategy for each intercurrent event.',
    },
    {
      ruleId: 'CFR-5025', standard: '21 CFR 50.25', clause: '§50.25(a)', title: 'Basic elements of informed consent',
      status: 'not-assessed', sev: 'info',
      message: 'The consent register carries no elements, so the basic elements could not be checked.',
      remediation: 'Record the consent elements.',
    },
  ],
};

function route(doc: Record<string, unknown>) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/protocol-dev')) return ok({ success: true, data: [doc] });
    return ok({});
  });
}

const props = () => ({ surface: { id: 'protocol-dev', label: 'Protocol', navTier: 'project' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

async function openTab(doc: Record<string, unknown>) {
  route(doc);
  render(<Providers><ProtocolWorkspace {...props()} /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: /Compliance/ }));
}

/** This tab's own pane. The protocol's left-hand outline renders the DOCUMENT's
 *  completeness percentage on every tab, so every assertion here is scoped. */
const pane = () => screen.getByRole('region', { name: 'Compliance' });
const finding = (name: RegExp) => within(pane()).getByRole('group', { name });

beforeEach(() => { apiRequest.mockReset(); });
afterEach(() => cleanup());

describe('protocol-dev — Compliance tab', () => {
  it('headlines three numbers and renders NO percentage anywhere', async () => {
    await openTab({ ...BASE_DOC, ruleFindings: RULE_FINDINGS });
    expect(await screen.findByText(/Rules assessed/)).toBeTruthy();
    const p = pane();
    expect(within(p).getByText(/Rules assessed/)).toBeTruthy();
    expect(within(p).getByText(/Rules unmet/)).toBeTruthy();
    expect(within(p).getByText(/Rules not assessed/)).toBeTruthy();
    // The defect this rule exists to stop: a figure over checks that did not run.
    expect(p.textContent ?? '').not.toContain('%');
    expect(p.textContent ?? '').not.toMatch(/\d+\s*%/);
  });

  it('orders the standards that carry unmet findings first', async () => {
    await openTab({ ...BASE_DOC, ruleFindings: RULE_FINDINGS });
    await screen.findByText(/Rules assessed/);
    const order = Array.from(pane().querySelectorAll('[data-standard]'))
      .map((el) => el.getAttribute('data-standard'));
    expect(order[0]).toBe('ICH E9(R1)');
    expect(order).toContain('ICH M11');
    expect(order).toContain('21 CFR 50.25');
  });

  it('shows each finding’s clause, message and remediation', async () => {
    await openTab({ ...BASE_DOC, ruleFindings: RULE_FINDINGS });
    const row = finding(/Estimand for the primary objective/);
    expect(within(row).getByText(/Section A\.3/)).toBeTruthy();
    expect(within(row).getByText(/records no estimand attributes/)).toBeTruthy();
    expect(within(row).getByText(/Record the population, variable/)).toBeTruthy();
  });

  it('presents a not-assessed rule as "not assessed", never as a pass', async () => {
    await openTab({ ...BASE_DOC, ruleFindings: RULE_FINDINGS });
    const row = finding(/Diversity action plan named/);
    expect(within(row).getByText(/not assessed/i)).toBeTruthy();
    // Colour is never the only signal, and "not assessed" is never success.
    expect(row.textContent ?? '').not.toMatch(/passed|compliant|\bmet\b/i);
    expect(row.getAttribute('data-status')).toBe('not-assessed');
    const met = finding(/Protocol synopsis recorded/);
    expect(met.getAttribute('data-status')).toBe('met');
  });

  it('collapses a standard group without losing what it said', async () => {
    await openTab({ ...BASE_DOC, ruleFindings: RULE_FINDINGS });
    const toggle = await within(pane()).findByRole('button', { name: /ICH E9\(R1\)/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(pane()).queryByRole('group', { name: /Estimand for the primary objective/ })).toBeNull();
  });

  it('says so honestly when the rule pack found no applicable rule', async () => {
    await openTab({ ...BASE_DOC, ruleFindings: { findings: [], assessed: 0, unmet: 0, notAssessed: 0 } });
    expect(await within(pane()).findByText(/no rule in the pack applies/i)).toBeTruthy();
    expect(pane().textContent ?? '').not.toContain('%');
  });

  it('says so when the record carries no rule evaluation at all', async () => {
    await openTab(BASE_DOC);
    expect(await within(pane()).findByText(/carries no rule evaluation/i)).toBeTruthy();
  });
});

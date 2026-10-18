// @vitest-environment jsdom
/**
 * The NDA cockpit states REQUIRED-section completeness, and says "ready to file"
 * only when every required section is complete.
 *
 * What the surface used to do (until 2026-10-15): `overall` was the mean of the
 * module rows' `pct`, and the server computed each pct over the sections someone
 * had already authored, omitting modules with none. One approved Module 1 section
 * came back as a single row at 100%, so the KPI read "100% Application readiness",
 * the lead "You're 100% ready", AnA was told "CTD readiness 100%", and the module
 * "module complete" — and, once a completed review is recorded, the lead's clear
 * branch would have said "You're 100% ready to file". Even over honest rows (each
 * module measured against its required sections, unstarted modules at 0 of N) a
 * mean of module percentages is not the share of required sections complete:
 * 13, 0, 0, 0, 0 averages to 3%, while 1 of 23 required sections is 4%.
 *
 * The rows below are the shape the fixed assembler returns
 * (server/services/nda/nda-modules-view-assembler.ts) for one approved Module 1
 * section of an FDA NDA, whose canonical profile requires 8 + 6 + 4 + 3 + 2 = 23
 * sections (server/services/ectd/required-sections.ts).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
/* Forces the latent state: `assessmentRan` is hard-wired false on the surface
   because no completed-review record exists yet. This flips it the way that
   record will, so the clear branch can be held to the canonical measure now. */
const forced = vi.hoisted(() => ({ assessmentRan: false }));

vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'a@b.test', displayName: 'A' } }),
}));
vi.mock('../assessmentState', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../assessmentState')>();
  return {
    ...actual,
    assessmentState: (x: Parameters<typeof actual.assessmentState>[0]) =>
      actual.assessmentState(forced.assessmentRan ? { ...x, assessmentRan: true } : x),
  };
});

import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import type { SurfaceViewProps } from '../surfaceViews';
import { NdaCockpit } from '../surfaces/NdaCockpit';

const BASIS = '21 CFR 314.50; FDA eCTD Module 1 (region profile); ICH M4';

/** A measured module row; here every authored section is a complete one (docs = complete). */
function row(m: string, label: string, required: number, complete: number, gate: string | null) {
  return {
    m, label, required, complete, gate,
    docs: complete,
    pct: Math.round((complete / required) * 100),
    open: required - complete,
    basis: BASIS,
    notAssessed: null,
  };
}

const ONE_M1_SECTION = [
  row('1', 'Administrative & prescribing (Module 1)', 8, 1, '1.2 Cover Letter not started · 6 more open'),
  row('2', 'CTD summaries (Module 2)', 6, 0, '2.2 Introduction not started · 5 more open'),
  row('3', 'Quality / CMC (Module 3)', 4, 0, '3.2.S Drug Substance not started · 3 more open'),
  row('4', 'Nonclinical study reports (Module 4)', 3, 0, '4.2.1 Pharmacology not started · 2 more open'),
  row('5', 'Clinical study reports (Module 5)', 2, 0, '5.2 Tabular Listing of All Clinical Studies not started · 1 more open'),
];

const ALL_COMPLETE = ONE_M1_SECTION.map((r) => row(r.m, r.label, r.required, r.required, null));

const NOT_ASSESSED = ONE_M1_SECTION.map((r) => ({
  ...r, pct: null, required: null, complete: null, open: null, gate: null, basis: null,
  notAssessed: "No canonical required-section profile exists for an NDA with primary region 'eu'; completeness was not assessed.",
}));

const ONE_RISK = [{ id: 'rtf-1', sev: 'med', area: 'Module 3 · CMC', text: 'Stability data cover 6 months.', fix: 'File the 12-month data' }];

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

function mockApi(modules: unknown[], rtf: unknown[] = []) {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === '/api/nda-cockpit/modules') return res({ data: modules, meta: { count: modules.length, source: 'submissions' } });
    if (url === '/api/nda-cockpit/rtf') return res({ data: rtf, meta: { count: rtf.length } });
    if (url === '/api/biopharma/bla/assessments') return res({ assessments: [] });
    return res({ data: [], meta: { count: 0 } });
  });
}

let seen: SurfaceContext | null = null;
function Probe() {
  seen = useActiveSurfaceContext('nda-cockpit');
  return null;
}

function renderCockpit() {
  const props = {
    surface: { id: 'nda-cockpit', label: 'NDA cockpit' } as unknown as SurfaceViewProps['surface'],
    onAsk: vi.fn(),
    onNav: vi.fn(),
    segment: 'biopharma',
  };
  return render(<><NdaCockpit {...props} /><Probe /></>);
}

/** Every read settled: AnA's summary has left its loading sentence. */
const settled = () =>
  waitFor(() => {
    expect(seen?.summary).toBeTruthy();
    expect(seen!.summary).not.toMatch(/still loading/i);
  });

function kpi(label: RegExp) {
  return Array.from(document.querySelectorAll('.reg-kpi'))
    .map((k) => ({ label: k.querySelector('.reg-kpi-l')?.textContent ?? '', value: k.querySelector('.reg-kpi-v')?.textContent ?? '' }))
    .find((k) => label.test(k.label));
}

/** What the lead CLAIMS: headline, body and reassurance — not the eyebrow, which
 *  is the question "Are you ready to file this NDA…". */
function leadClaims(): string {
  return ['.al-h', '.al-b', '.al-re'].map((s) => document.querySelector(s)?.textContent ?? '').join(' ');
}

function moduleRow(m: string): string {
  const el = Array.from(document.querySelectorAll('.nda-mod')).find((b) => b.querySelector('.nda-mod-n')?.textContent === `M${m}`);
  return el?.textContent ?? '';
}

beforeEach(() => {
  seen = null;
  forced.assessmentRan = false;
  apiRequest.mockReset();
});
afterEach(cleanup);

describe('NdaCockpit — completeness is measured against the required sections', () => {
  it('the KPI names what it measures and reports required sections complete across the whole profile', async () => {
    mockApi(ONE_M1_SECTION);
    renderCockpit();
    await settled();
    const tile = kpi(/required CTD sections complete/i);
    expect(tile, 'the KPI must say it is required-section completeness').toBeTruthy();
    // 1 of 23 required sections — not the mean of the module percentages (3%), and never 100%.
    expect(tile!.value).toBe('4%');
    expect(kpi(/readiness/i), 'a completeness figure is not labelled readiness').toBeUndefined();
  });

  it('a module reads "N of M required sections complete"; an unstarted one says so; nothing reads "module complete"', async () => {
    mockApi(ONE_M1_SECTION);
    renderCockpit();
    await settled();
    expect(moduleRow('1')).toContain('1 of 8 required sections complete');
    expect(moduleRow('4')).toContain('0 of 3 required sections complete');
    expect(moduleRow('4')).toMatch(/not started/i);
    expect(document.body.textContent).not.toMatch(/module complete/i);
  });

  it('the lead names the figure — it never says "You\'re N% ready" from a completeness count', async () => {
    mockApi(ONE_M1_SECTION, ONE_RISK);
    renderCockpit();
    await settled();
    const lead = leadClaims();
    expect(lead).not.toMatch(/you'?re\s*\d+%\s*ready/i);
    expect(lead).toMatch(/4%\s*of the required CTD sections/i);
  });

  it('tells AnA the canonical count, not a readiness percentage', async () => {
    mockApi(ONE_M1_SECTION);
    renderCockpit();
    await settled();
    expect(seen!.facts).toMatchObject({
      requiredCtdSectionsComplete: 1,
      requiredCtdSectionsTotal: 23,
      requiredCtdSectionsCompletePct: 4,
    });
    expect(seen!.facts).not.toHaveProperty('ctdReadinessPct');
    expect(seen!.summary).toContain('1 of 23 required CTD sections complete');
  });

  it('renders no percentage when the application has no canonical required-section list, and says why', async () => {
    mockApi(NOT_ASSESSED);
    renderCockpit();
    await settled();
    expect(kpi(/required CTD sections complete/i)?.value).toBe('—');
    expect(moduleRow('1')).not.toMatch(/\d+%/);
    expect(document.body.textContent).toMatch(/no canonical required-section profile/i);
    expect(seen!.facts!.requiredCtdSectionsCompletePct).toBeNull();
  });
});

describe('NdaCockpit — "ready to file" is said only when it is true by the required-section measure', () => {
  it('a recorded clean review over 1 of 23 required sections does not say "ready to file"', async () => {
    forced.assessmentRan = true;
    mockApi(ONE_M1_SECTION);
    renderCockpit();
    await settled();
    expect(seen!.facts!.refuseToFileState).toBe('assessed-clear');
    expect(leadClaims()).not.toMatch(/ready to file/i);
    expect(leadClaims()).not.toMatch(/the package is fileable/i);
    expect(leadClaims()).not.toMatch(/\b100%/);
  });

  it('a recorded clean review over every required section complete may say it', async () => {
    forced.assessmentRan = true;
    mockApi(ALL_COMPLETE);
    renderCockpit();
    await settled();
    expect(seen!.facts!.refuseToFileState).toBe('assessed-clear');
    expect(leadClaims()).toMatch(/You're 100% ready to file/);
  });
});

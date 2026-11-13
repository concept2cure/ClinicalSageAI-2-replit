// @vitest-environment jsdom
/**
 * With no project open, the worked example fits the ORGANISATION — and when
 * nothing says what the organisation is, the screen says so instead of guessing.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `defaultPresetFor(project)` read `isDeviceFamily(project?.productType)`. The
 * rail opens this work area with NO project (P-107: "Biostatistics stays on the
 * rail … It is a work area over the project's data, not an app"), so `project`
 * was null, `isDeviceFamily(undefined)` was false, and EVERY organisation —
 * a medical-device or IVD tenant included — opened on `survival`: a Phase III
 * oncology overall-survival design, with its sized verdict and its generated
 * documents. The same function had already been fixed once for the
 * project-open case (2026-10-31: "an IVD project opened on an oncology survival
 * preset"); the project-LESS case, which is now the common one, was left.
 *
 * Alongside it, the note above the artifact told a project-less visitor to
 * "Choose your project's study design on the left" — there is no project, the
 * list is every design the ORGANISATION has recorded, and at phone width that
 * list is not on the left at all: it sits below the document.
 *
 * ── Where the truth comes from ───────────────────────────────────────────────
 * `organization_industry_profiles.primary_industry`, which `shared/schema.ts`
 * calls the authoritative source of a tenant's industry context, served by the
 * existing `GET /api/mdx/industry-profile` (already read by Onboarding.tsx) and
 * translated by the module that owns that vocabulary,
 * `mdx/lib/industryProfileMapping.governedToPicker`. No new route, no second
 * copy of the mapping.
 *
 * ── Fail closed ──────────────────────────────────────────────────────────────
 * An organisation that has recorded no profile (the route answers `null`), a
 * failed read, and every non-device industry all keep the general example. The
 * platform never infers "biotech" from an absent profile.
 *
 * ── No flash ─────────────────────────────────────────────────────────────────
 * The page already refuses to size a worked example while an open project's own
 * design is loading (2026-10-31: "the oncology example flashed, with its
 * verdict, before the project's own design replaced it"). The same hold covers
 * the organisation's profile read, so a diagnostics tenant is never shown the
 * oncology verdict for the moment before its own example arrives.
 *
 * RED before the fix: the IVD case selects "Pivotal OS (survival)", and the
 * project-less note reads "Choose your project's study design on the left".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Biostatistics } from '../surfaces/Biostatistics';

const Surface = Biostatistics as unknown as React.ComponentType<Record<string, unknown>>;
const PROFILE = '/api/mdx/industry-profile';

const setProject = (p: unknown) => { (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = p; };

/** Everything answers empty except the org industry profile, which answers
 *  `profile` — exactly what the route returns (`ok(res, row ?? null)`). */
function serverWithProfile(profile: unknown, opts: { profileFails?: boolean } = {}) {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === PROFILE) {
      if (opts.profileFails) return { ok: false, status: 500, json: async () => ({ success: false }) } as Response;
      return { ok: true, status: 200, json: async () => ({ success: true, data: profile }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
  });
}

const COMPUTE = '/api/ana-biostats/compute';
/** What the engine was asked to size, in order, by endpoint type. */
const sizedEndpoints = (): string[] => apiRequest.mock.calls
  .filter((c) => c[1] === COMPUTE)
  .map((c) => String((c[2] as { endpointType?: unknown } | undefined)?.endpointType));

/** The preset the page is sitting on, by its pressed chip. */
const pressedExample = (): string => {
  const pressed = Array.from(document.querySelectorAll('button.bs-preset[aria-pressed="true"]'));
  return pressed.length === 1 ? (pressed[0].textContent ?? '').trim() : `(${pressed.length} chips pressed)`;
};

/** Wait until the page sits on `label`. The survival chip is pressed on the
 *  first paint, before the organisation's profile has been read, so a test
 *  that only waits for "one chip pressed" passes at once and proves nothing. */
const opensOn = (label: string) => waitFor(() => expect(pressedExample()).toBe(label));

/** For the cases where the example must NOT move: the profile read has been
 *  made, answered, and React has committed whatever it was going to commit. */
async function profileReadSettled() {
  await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === PROFILE)).toBe(true));
  for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); });
}

/** With a project open the profile is never read, so settle on the read the
 *  page does make there: the project's own study designs. */
async function projectReadsSettled() {
  await waitFor(() => expect(apiRequest.mock.calls.some((c) => String(c[1]).startsWith('/api/biostat-bridge/designs?program_id='))).toBe(true));
  for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); });
}

const noteText = () => (document.querySelector('.bs-example-note')?.textContent ?? '').replace(/\s+/g, ' ').trim();

afterEach(() => { cleanup(); setProject(undefined); });
beforeEach(() => { apiRequest.mockReset(); setProject(undefined); });

describe('no project open — the organisation’s recorded industry chooses the example', () => {
  it('an IVD diagnostics organisation opens on the diagnostic-accuracy example, not Phase III oncology', async () => {
    serverWithProfile({ primaryIndustry: 'medical_device_diagnostics', mdxSpecialization: 'ivd_diagnostics' });
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await opensOn('Diagnostic accuracy');
  });

  it('a medical-device organisation opens on the same example a device project does', async () => {
    serverWithProfile({ primaryIndustry: 'medical_device_diagnostics', mdxSpecialization: 'medical_device' });
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await opensOn('Diagnostic accuracy');
  });

  it('a SaMD organisation is still a device organisation', async () => {
    serverWithProfile({ primaryIndustry: 'medical_device_diagnostics', mdxSpecialization: 'samd' });
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await opensOn('Diagnostic accuracy');
  });

  it('a biotech / pharma organisation keeps the survival example', async () => {
    serverWithProfile({ primaryIndustry: 'biotech_pharma', mdxSpecialization: null });
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await profileReadSettled();
    expect(pressedExample()).toBe('Pivotal OS (survival)');
  });

  it('a CRO is not assumed to be a device shop, and is not assumed not to be', async () => {
    serverWithProfile({ primaryIndustry: 'cro', mdxSpecialization: null });
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await profileReadSettled();
    expect(pressedExample()).toBe('Pivotal OS (survival)');
  });
});

describe('the general example is not sized first, then swapped', () => {
  it('a diagnostics organisation never sees the oncology design sized while its profile is being read', async () => {
    let answerProfile: (() => void) | null = null;
    const profileAnswered = new Promise<void>((resolve) => { answerProfile = resolve; });
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === PROFILE) {
        await profileAnswered;
        return { ok: true, status: 200, json: async () => ({ success: true, data: { primaryIndustry: 'medical_device_diagnostics', mdxSpecialization: 'ivd_diagnostics' } }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
    });
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === PROFILE)).toBe(true));
    // Well past the engine's 180 ms debounce: without the hold, the survival design is sized here.
    await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
    expect(sizedEndpoints()).toEqual([]);
    await act(async () => { answerProfile?.(); });
    await opensOn('Diagnostic accuracy');
    await waitFor(() => expect(sizedEndpoints().length).toBeGreaterThan(0));
    expect(sizedEndpoints()).not.toContain('time_to_event');
    expect(sizedEndpoints()[0]).toBe('sensitivity_specificity');
  });

  it('an organisation with nothing recorded is sized as soon as that is known', async () => {
    serverWithProfile(null);
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(sizedEndpoints()).toContain('time_to_event'));
  });

  it('a failed profile read does not leave the page waiting', async () => {
    serverWithProfile(null, { profileFails: true });
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(sizedEndpoints()).toContain('time_to_event'));
  });
});

describe('nothing recorded is not a statement about the tenant', () => {
  it('an organisation with no industry profile keeps the general example', async () => {
    serverWithProfile(null);
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await profileReadSettled();
    expect(pressedExample()).toBe('Pivotal OS (survival)');
  });

  it('a failed profile read is not read as biotech — it changes nothing', async () => {
    serverWithProfile(null, { profileFails: true });
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await profileReadSettled();
    expect(pressedExample()).toBe('Pivotal OS (survival)');
  });

  it('a profile carrying a value outside the governed vocabulary is ignored', async () => {
    serverWithProfile({ primaryIndustry: 'something_else', mdxSpecialization: 'ivd_diagnostics' });
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await profileReadSettled();
    expect(pressedExample()).toBe('Pivotal OS (survival)');
  });
});

describe('the note says what the example is, and what to do from here', () => {
  it('with no project it never points at “your project’s study design”', async () => {
    serverWithProfile({ primaryIndustry: 'biotech_pharma', mdxSpecialization: null });
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(noteText()).not.toBe(''));
    expect(noteText()).not.toMatch(/your project’s/);
    expect(noteText()).toMatch(/not your study/);
    expect(noteText()).toMatch(/Choose a design under Study design, or open a project/);
  });

  it('with a project open it points at that project’s design', async () => {
    setProject({ id: '3c7e1f4a-9b2d-4e6f-8a15-2d9c7b4e1f60', productType: 'drug' });
    serverWithProfile({ primaryIndustry: 'medical_device_diagnostics', mdxSpecialization: 'ivd_diagnostics' });
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(noteText()).not.toBe(''));
    expect(noteText()).toMatch(/your project’s design under Study design/);
  });

  it('names the list by its heading, not by a side of the screen it is not on at phone width', async () => {
    // At 390 px the document comes first and the list sits below it (.bs-main{ order:-1 }).
    for (const project of [undefined, { id: '3c7e1f4a-9b2d-4e6f-8a15-2d9c7b4e1f60', productType: 'drug' }]) {
      setProject(project);
      serverWithProfile({ primaryIndustry: 'biotech_pharma', mdxSpecialization: null });
      const view = render(<Surface onAsk={() => {}} onNav={() => {}} />);
      await waitFor(() => expect(noteText()).not.toBe(''));
      expect(noteText()).not.toMatch(/on the (left|right)/);
      expect(document.querySelector('section[aria-label="Study design"] h2')?.textContent).toBe('Study design');
      view.unmount();
    }
  });
});

describe('the empty documents list names the scope its own heading names', () => {
  const emptyHint = () => {
    const section = Array.from(document.querySelectorAll('h2')).find((h) => /^Statistical documents for this/.test(h.textContent ?? ''))?.closest('section, div');
    return { heading: Array.from(document.querySelectorAll('h2')).find((h) => /^Statistical documents for this/.test(h.textContent ?? ''))?.textContent ?? '', text: (section?.parentElement?.textContent ?? '').replace(/\s+/g, ' ') };
  };

  it('with no project it says "for this organization", as the heading does (it said "for this project")', async () => {
    serverWithProfile({ primaryIndustry: 'biotech_pharma', mdxSpecialization: null });
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(emptyHint().heading).toBe('Statistical documents for this organization'));
    await waitFor(() => expect(document.body.textContent).toContain('No governed statistical documents yet'));
    expect(document.body.textContent).toContain('Statistical documents persisted for this organization appear here');
    expect(document.body.textContent).not.toContain('Statistical documents persisted for this project appear here');
  });

  it('with a project open it says "for this project"', async () => {
    setProject({ id: '3c7e1f4a-9b2d-4e6f-8a15-2d9c7b4e1f60', productType: 'drug' });
    serverWithProfile(null);
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(emptyHint().heading).toBe('Statistical documents for this project'));
    await waitFor(() => expect(document.body.textContent).toContain('No governed statistical documents yet'));
    expect(document.body.textContent).toContain('Statistical documents persisted for this project appear here');
  });
});

describe('a project’s own product type still decides, and costs no extra read', () => {
  it('a drug project is not moved onto the device example by a device organisation', async () => {
    setProject({ id: '3c7e1f4a-9b2d-4e6f-8a15-2d9c7b4e1f60', productType: 'drug' });
    serverWithProfile({ primaryIndustry: 'medical_device_diagnostics', mdxSpecialization: 'ivd_diagnostics' });
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await projectReadsSettled();
    expect(pressedExample()).toBe('Pivotal OS (survival)');
  });

  it('an IVD project opens on the diagnostic example whatever the organisation records', async () => {
    setProject({ id: '3c7e1f4a-9b2d-4e6f-8a15-2d9c7b4e1f60', productType: 'ivd' });
    serverWithProfile({ primaryIndustry: 'biotech_pharma', mdxSpecialization: null });
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await opensOn('Diagnostic accuracy');
  });

  it('the organisation’s profile is not read at all while a project is open', async () => {
    setProject({ id: '3c7e1f4a-9b2d-4e6f-8a15-2d9c7b4e1f60', productType: 'ivd' });
    serverWithProfile({ primaryIndustry: 'biotech_pharma', mdxSpecialization: null });
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await projectReadsSettled();
    expect(apiRequest.mock.calls.filter((c) => c[1] === PROFILE)).toHaveLength(0);
  });
});

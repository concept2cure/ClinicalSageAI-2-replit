// @vitest-environment jsdom
/**
 * IndFormsPanel — proves the Module-1 forms panel drives the REAL stateless
 * forms engine (/api/ind-forms): lists the supported forms, builds a field map
 * with only the metadata actually entered (the server's missingRequired is the
 * verdict), downloads the streamed FDA PDF, and surfaces the role gate honestly.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const apiUpload = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
  apiUpload,
}));

/** The listing endpoint, with or without the open program's ident. */
const isListing = (url: string) => url.startsWith('/api/ind-forms/?') || url === '/api/ind-forms/';

import { IndFormsPanel } from '../surfaces/IndFormsPanel';
import type { FireToast } from '../toast';

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiUpload.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
    if (method === 'GET' && isListing(url)) return { ok: true, status: 200, json: async () => ({ forms: ['1571', '1572', '3674'] }) } as Response;
    if (method === 'POST' && url === '/api/ind-forms/1571/build') {
      return { ok: true, status: 200, json: async () => ({ formId: '1571', fields: { sponsorName: body.sponsorName }, missingRequired: ['drugName', 'indication'] }) } as Response;
    }
    if (method === 'POST' && url === '/api/ind-forms/1571/pdf') {
      // The fallback shape: no official edition installed, so the engine
      // returns a reconstruction and the headers say so honestly. The official
      // path for this same form is exercised further down.
      const h: Record<string, string> = {
        'X-Form-Field-Coverage': '1.000',
        'X-Form-Used-Official-Template': 'false',
        'X-Form-Reconstructed': 'true',
      };
      return { ok: true, status: 200, blob: async () => new Blob(['%PDF-1.7']), json: async () => null, headers: { get: (k: string) => h[k] ?? null } } as unknown as Response;
    }
    if (method === 'POST' && url === '/api/ind-forms/1571/artifact') {
      return { ok: true, status: 201, json: async () => ({ artifactId: 'artifact_indform_1571_x', formId: 'FDA_1571', projectId: 7, ready: false, missingRequired: ['drugName'], contentHash: 'abc' }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  delete (window as any).C2C_PROJECT;
});
afterEach(() => { delete (window as any).C2C_PROJECT; });

describe('IndFormsPanel — real FDA forms engine', () => {
  it('lists the supported forms from the engine', async () => {
    render(<IndFormsPanel note={vi.fn()} />);
    expect(await screen.findByText(/FDA 1571/)).toBeTruthy();
    expect(screen.getByText(/FDA 1572/)).toBeTruthy();
    expect(screen.getByText(/FDA 3674/)).toBeTruthy();
  });

  it('builds with only the entered metadata and renders the server missingRequired verdict', async () => {
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    // Enter only the sponsor — absent fields must NOT be sent.
    const tb = screen.getAllByRole('textbox');
    fireEvent.change(tb[0], { target: { value: 'ACME Bio' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Build & check/ })[0]);

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/ind-forms/1571/build');
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({ sponsorName: 'ACME Bio', studyPhase: 'Phase 1' });
      expect(call![2]).not.toHaveProperty('drugName');
      expect(call![2]).not.toHaveProperty('indication');
    });
    expect(await screen.findByText('2 required missing')).toBeTruthy();
    expect(note).toHaveBeenCalledWith(expect.stringMatching(/2 required field/));
  });

  it('downloads the streamed FDA PDF and reports the honest render kind + coverage', async () => {
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.click(screen.getAllByRole('button', { name: /PDF/ })[0]);
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === '/api/ind-forms/1571/pdf')).toBe(true));
    expect(URL.createObjectURL).toHaveBeenCalled();
    // The tester is told honestly that 1571 is a reconstruction, not the official
    // form, with the coverage — never a bare "rendered by the real engine".
    await waitFor(() => expect(note).toHaveBeenCalledWith(expect.stringMatching(/reconstruction — NOT the official/)));
    expect(note).toHaveBeenCalledWith(expect.stringMatching(/coverage 1\.000/));
  });

  it('surfaces the regulatory-author role gate honestly', async () => {
    apiRequest.mockImplementation(async () => ({ ok: false, status: 403, json: async () => ({ error: 'FORBIDDEN' }) } as Response));
    render(<IndFormsPanel note={vi.fn()} />);
    expect(await screen.findByText('Regulatory-author role required')).toBeTruthy();
  });

  it('saves a governed artifact to the open project’s dossier', async () => {
    (window as any).C2C_PROJECT = { id: 7 };
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.click(screen.getAllByRole('button', { name: /Save to dossier/ })[0]);
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/ind-forms/1571/artifact');
      expect(call).toBeTruthy();
      // The project id is threaded from C2C_PROJECT, never guessed.
      expect(call![2]).toMatchObject({ projectId: 7 });
    });
    await waitFor(() => expect(note).toHaveBeenCalledWith(expect.stringMatching(/saved to the dossier as a governed artifact/)));
  });

  /* "READY" IS ABOUT THE DATA. THE FORM IS A SECOND FACT.
   *
   * The artifact route computes both and returns both: `ready` answers "is the
   * project data complete" (it stores a field map, not a PDF), and
   * `sponsorMustComplete` answers "which required boxes does an official render
   * leave for the sponsor whatever the data". FDA 1571 is the live case — its
   * ind_type and phase_of_study boxes are deliberately unmapped, so a fully
   * populated 1571 artifact is data-complete AND arrives with two required
   * boxes to tick in Acrobat.
   *
   * The panel printed "(ready)" off `ready` alone, so that artifact was
   * announced as finished. */
  function mockArtifact(body: Record<string, unknown>) {
    (window as any).C2C_PROJECT = { id: 7 };
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && isListing(url)) return { ok: true, status: 200, json: async () => ({ forms: ['1571'] }) } as Response;
      if (method === 'POST' && url === '/api/ind-forms/1571/artifact') {
        return { ok: true, status: 201, json: async () => ({ artifactId: 'a1', formId: 'FDA_1571', projectId: 7, contentHash: 'abc', ...body }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  }

  async function clickSave(note: ReturnType<typeof vi.fn> & FireToast) {
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.click(screen.getAllByRole('button', { name: /Save to dossier/ })[0]);
    await waitFor(() => expect(note).toHaveBeenCalled());
    return String(note.mock.calls.at(-1)![0]);
  }

  it('does not call a data-complete artifact "ready" when boxes are left on the form', async () => {
    mockArtifact({ ready: true, missingRequired: [], sponsorMustComplete: ['ind_type', 'phase_of_study'] });
    const msg = await clickSave(vi.fn() as unknown as ReturnType<typeof vi.fn> & FireToast);
    expect(msg).toMatch(/2 required box\(es\) for you to complete/);
    expect(msg).not.toMatch(/\(ready\)/);
  });

  it('says "ready" only when the data is complete AND the form leaves nothing', async () => {
    mockArtifact({ ready: true, missingRequired: [], sponsorMustComplete: [] });
    const msg = await clickSave(vi.fn() as unknown as ReturnType<typeof vi.fn> & FireToast);
    expect(msg).toMatch(/\(ready\)/);
  });

  it('an absent sponsorMustComplete is "not reported", never "nothing left"', async () => {
    /* The route returns it on every 201, so absence is an older server. Reading
       it as [] is the same fail-open the field itself exists to close. */
    mockArtifact({ ready: true, missingRequired: [] });
    const msg = await clickSave(vi.fn() as unknown as ReturnType<typeof vi.fn> & FireToast);
    expect(msg).not.toMatch(/\(ready\)/);
    expect(msg).toMatch(/did not report which boxes are left on the form/);
  });

  it('a program UUID project takes the audited-unplaced path and the note says exactly that', async () => {
    const uuid = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';
    (window as any).C2C_PROJECT = { id: uuid };
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && isListing(url)) return { ok: true, status: 200, json: async () => ({ forms: ['1571'] }) } as Response;
      if (method === 'POST' && url === '/api/ind-forms/1571/artifact') {
        // The server's audited-unplaced degradation contract (no legacy project
        // row → no registry placement; the audit row IS the record).
        return {
          ok: true, status: 200,
          json: async () => ({ governed: false, audited: true, artifactId: null, formId: 'FDA_1571', projectId: null, programId: uuid, ready: false, missingRequired: ['drugName'], contentHash: 'abc' }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.click(screen.getAllByRole('button', { name: /Save to dossier/ })[0]);

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/ind-forms/1571/artifact');
      expect(call).toBeTruthy();
      // The UUID ident is threaded as projectIdent — never coerced to a number.
      expect(call![2]).toMatchObject({ projectIdent: uuid });
      expect(call![2]).not.toHaveProperty('projectId');
    });
    // The note reports the degradation honestly: audit-logged, NOT placed —
    // never "saved to the dossier".
    await waitFor(() => expect(note).toHaveBeenCalledWith(expect.stringMatching(/audit-logged .*not placed in the dossier registry/)));
    expect(note).not.toHaveBeenCalledWith(expect.stringMatching(/saved to the dossier/));
  });

  it('does NOT save (or guess a project) when no project is open', async () => {
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.click(screen.getAllByRole('button', { name: /Save to dossier/ })[0]);
    // Toned `'error'`: nothing was saved, so the note must not arrive under the
    // success tick. The panel's `note` prop is `FireToast`, not `(m: string) =>
    // void` — narrowing it there is what silently dropped the tone before.
    await waitFor(() =>
      expect(note).toHaveBeenCalledWith(expect.stringMatching(/Open a project first/), 'error'),
    );
    // No artifact call was made — the panel never invents a project id.
    expect(apiRequest.mock.calls.some((c) => c[1] === '/api/ind-forms/1571/artifact')).toBe(false);
  });

  /* WHICH HEADER ANSWERS "WHAT IS STILL BLANK ON MY FORM".
   *
   * The renderer publishes three, and they are three different facts:
   *   X-Form-Unmapped        — every box no reviewed mapping writes, REQUIRED
   *                            OR OPTIONAL.
   *   X-Form-Missing-Required— required fields the project record has no value
   *                            for.
   *   X-Form-Required-Blank  — the union, and the renderer's own documented
   *                            answer to "which required boxes are empty on the
   *                            bytes I just sent you". Set on EVERY path,
   *                            including when the list is empty.
   *
   * The toast read `X-Form-Unmapped`, which is wrong in both directions:
   * it counts optional boxes the sponsor need not touch, and it MISSES a
   * required box that a reviewed mapping writes but the project has no value
   * for — that box is blank on the page and absent from `unmapped`. The two
   * cases below are the two directions.
   */
  function renderHeaders(h: Record<string, string>) {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && isListing(url)) return { ok: true, status: 200, json: async () => ({ forms: ['1571'] }) } as Response;
      if (method === 'POST' && url === '/api/ind-forms/1571/pdf') {
        return { ok: true, status: 200, blob: async () => new Blob(['%PDF-1.7']), json: async () => null, headers: { get: (k: string) => h[k] ?? null } } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  }

  async function clickPdf(note: ReturnType<typeof vi.fn> & FireToast) {
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.click(screen.getAllByRole('button', { name: /PDF/ })[0]);
    await waitFor(() => expect(note).toHaveBeenCalled());
    return String(note.mock.calls.at(-1)![0]);
  }

  it('names the official template and the boxes still left blank on it', async () => {
    // 1571 fills through its XFA datasets packet, so the response is the real
    // FDA form — with boxes the platform deliberately did not write. Reporting
    // only "official template" would imply a finished form.
    renderHeaders({
      'X-Form-Field-Coverage': '0.500',
      'X-Form-Used-Official-Template': 'true',
      'X-Form-Reconstructed': 'false',
      'X-Form-Unmapped': 'ind_type,phase_of_study,us_agent_name',
      'X-Form-Required-Blank': 'ind_type,phase_of_study',
    });
    const note = vi.fn() as unknown as ReturnType<typeof vi.fn> & FireToast;
    const msg = await clickPdf(note);
    expect(msg).toMatch(/official FDA template/);
    // TWO required boxes are blank, not the three unmapped ones: `us_agent_name`
    // is unmapped and OPTIONAL, and the sponsor is not told to complete it.
    expect(msg).toMatch(/2 required box\(es\) blank on the form/);
    expect(msg).not.toMatch(/3 /);
    expect(msg).not.toMatch(/reconstruction/);
  });

  it('counts a required box the project has no value for, which `unmapped` never names', async () => {
    /* The other direction, and the one a sponsor is hurt by. `drug_name` IS
       mapped — a reviewed mapping writes it — so it is absent from
       X-Form-Unmapped; the project record simply holds nothing for it, so the
       box goes out EMPTY. Reading `unmapped` reported "nothing left for you"
       over a form with a blank required box on it. */
    renderHeaders({
      'X-Form-Field-Coverage': '0.900',
      'X-Form-Used-Official-Template': 'true',
      'X-Form-Reconstructed': 'false',
      'X-Form-Missing-Required': 'drug_name',
      'X-Form-Required-Blank': 'drug_name',
      // No X-Form-Unmapped at all: every box on this form has a mapping.
    });
    const note = vi.fn() as unknown as ReturnType<typeof vi.fn> & FireToast;
    const msg = await clickPdf(note);
    expect(msg).toMatch(/1 required box\(es\) blank on the form/);
    // And it says WHY, because the two causes need different actions from the
    // user: enter it in the project record, or complete it in Acrobat.
    expect(msg).toMatch(/1 because the project record has no value/);
  });

  it('says the server did not report, rather than implying a clean form', async () => {
    /* X-Form-Required-Blank is set unconditionally by this renderer, so an
       ABSENT header means an older server — not a form with nothing left to
       complete. Counting an absent header as zero is the fail-open. */
    renderHeaders({
      'X-Form-Field-Coverage': '1.000',
      'X-Form-Used-Official-Template': 'true',
      'X-Form-Reconstructed': 'false',
    });
    const note = vi.fn() as unknown as ReturnType<typeof vi.fn> & FireToast;
    const msg = await clickPdf(note);
    expect(msg).toMatch(/did not report which required boxes are still blank/);
  });

  it('an EMPTY X-Form-Required-Blank is "assessed, none" and claims nothing', async () => {
    renderHeaders({
      'X-Form-Field-Coverage': '1.000',
      'X-Form-Used-Official-Template': 'true',
      'X-Form-Reconstructed': 'false',
      'X-Form-Required-Blank': '',
    });
    const note = vi.fn() as unknown as ReturnType<typeof vi.fn> & FireToast;
    const msg = await clickPdf(note);
    expect(msg).not.toMatch(/required box\(es\) blank/);
    expect(msg).not.toMatch(/did not report/);
  });

  it('does not claim the PDF arrived when the browser blocked the download', async () => {
    // downloadBlob returns false when the object URL cannot be created. The
    // note used to be fired regardless, so a blocked download read as a
    // delivered form.
    URL.createObjectURL = vi.fn(() => { throw new Error('blocked'); });
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.click(screen.getAllByRole('button', { name: /PDF/ })[0]);
    await waitFor(() =>
      expect(note).toHaveBeenCalledWith(expect.stringMatching(/browser blocked the download/), 'error'),
    );
    expect(note).not.toHaveBeenCalledWith(expect.stringMatching(/^FDA 1571 PDF:/));
  });
});

/* ── WO-9 Click 2: the program record fills the forms, and the sponsor's
      completed form gets filed ─────────────────────────────────────────────
   The panel used to have every value typed into it, and it learned how a form
   had rendered only from the headers of a download that had already happened.
   Both are now read from the server: the program's recorded facts, and the plan
   for what each form will produce. */
const PROGRAM_UUID = '709edd20-9af6-41e7-a206-c00ecb4671b9';

const LISTING = {
  forms: ['FDA_1571', 'FDA_1572'],
  renderPlans: [
    {
      formId: 'FDA_1571', method: 'official-xfa-datasets', officialTemplate: true,
      edition: '2025-03-28', reviewedBy: null,
      platformWrites: ['sponsor_name', 'drug_name', 'ind_number'],
      sponsorCompletes: [
        { id: 'ind_type', label: 'IND Type' },
        { id: 'phase_of_study', label: 'Phase of Clinical Investigation' },
      ],
    },
    {
      formId: 'FDA_1572', method: 'official-acroform', officialTemplate: true,
      edition: '2025-04-13', reviewedBy: 'reviewer@example.com',
      platformWrites: ['investigator_name'], sponsorCompletes: [],
    },
  ],
  program: {
    id: PROGRAM_UUID, code: 'BX-512', name: 'Vorelinib · KIT-mutant GIST (IND)', programType: 'IND',
    sponsorName: 'Concept2Cure Therapeutics', productName: 'Vorelinib · BX-512',
    indication: 'KIT-mutant gastrointestinal stromal tumor · 4L+', applicationNumber: '000512',
    formMetadata: { sponsorName: 'Concept2Cure Therapeutics', drugName: 'Vorelinib · BX-512', indNumber: '000512' },
  },
  placements: [],
};

function mockProgramListing(overrides: Partial<typeof LISTING> = {}) {
  (window as any).C2C_PROJECT = { id: PROGRAM_UUID };
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && isListing(url)) {
      return { ok: true, status: 200, json: async () => ({ ...LISTING, ...overrides }) } as Response;
    }
    if (method === 'POST' && url.endsWith('/build')) {
      return { ok: true, status: 200, json: async () => ({ formId: 'FDA_1571', fields: {}, missingRequired: [] }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

describe('IndFormsPanel — the program record fills the forms', () => {
  it('asks the engine for the open program and shows the recorded facts, not input boxes', async () => {
    mockProgramListing();
    render(<IndFormsPanel note={vi.fn()} />);
    expect(await screen.findByText('Concept2Cure Therapeutics')).toBeTruthy();
    expect(screen.getByText('Vorelinib · BX-512')).toBeTruthy();
    expect(screen.getByText('000512')).toBeTruthy();
    expect(screen.getByText('IND number')).toBeTruthy();
    // The listing was scoped to the open program.
    const call = apiRequest.mock.calls.find((c) => c[0] === 'GET');
    expect(call![1]).toBe(`/api/ind-forms/?projectIdent=${PROGRAM_UUID}`);
    // The record-backed fields are no longer typed here — that is what stops a
    // filing's sponsor name depending on who typed it into which panel.
    expect(screen.queryByText('Sponsor name')).toBeNull();
    expect(screen.queryByText('Drug name')).toBeNull();
    // What the record has no column for is still entered here.
    expect(screen.getByText('Serial number')).toBeTruthy();
  });

  it('states what each form will produce BEFORE anything is rendered, and who reviewed the asset', async () => {
    mockProgramListing();
    render(<IndFormsPanel note={vi.fn()} />);
    expect(await screen.findByText(/official FDA form \(edition 2025-03-28\)/)).toBeTruthy();
    expect(screen.getByText(/sign it in Adobe Acrobat/)).toBeTruthy();
    expect(screen.getByText('2 box(es) left for you to complete on the form.')).toBeTruthy();
    // D3: backed is not the same as human-reviewed, and the panel says which.
    expect(screen.getByText('This asset has no named reviewer yet.')).toBeTruthy();
    expect(screen.getByText('Asset reviewed by reviewer@example.com.')).toBeTruthy();
  });

  it('a reconstruction is never described as the official form', async () => {
    mockProgramListing({
      forms: ['FDA_1574'],
      renderPlans: [{ formId: 'FDA_1574', method: 'reconstruction', officialTemplate: false, edition: null, reviewedBy: null, platformWrites: [], sponsorCompletes: [] }],
    } as never);
    render(<IndFormsPanel note={vi.fn()} />);
    expect(await screen.findByText(/labeled reconstruction — not the official FDA form/)).toBeTruthy();
    expect(screen.queryByText(/no named reviewer/)).toBeNull();
  });

  it('names the program on every build so the server fills from the record, and never echoes the record back', async () => {
    mockProgramListing();
    render(<IndFormsPanel note={vi.fn()} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.click(screen.getAllByRole('button', { name: /Build & check/ })[0]);
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => String(c[1]).endsWith('/build'));
      expect(call![2]).toMatchObject({ projectIdent: PROGRAM_UUID, studyPhase: 'Phase 1' });
      // The sponsor/drug/IND number are the server's to read; a copy held here
      // could go stale against the record and would be filed as though current.
      expect(call![2]).not.toHaveProperty('sponsorName');
      expect(call![2]).not.toHaveProperty('drugName');
      expect(call![2]).not.toHaveProperty('indNumber');
    });
  });

  it('with no program open it still works standalone and claims no record', async () => {
    delete (window as any).C2C_PROJECT;
    apiRequest.mockImplementation(async (method: string, url: string) =>
      (method === 'GET' && isListing(url)
        ? { ok: true, status: 200, json: async () => ({ forms: ['FDA_1571'], renderPlans: [], program: null, placements: [] }) }
        : { ok: true, status: 200, json: async () => ({}) }) as Response);
    render(<IndFormsPanel note={vi.fn()} />);
    await screen.findByText(/FDA 1571/);
    expect(apiRequest.mock.calls.find((c) => c[0] === 'GET')![1]).toBe('/api/ind-forms/');
    expect(screen.queryByText(/Read from the program record/)).toBeNull();
    expect(screen.getByText('Sponsor name')).toBeTruthy();
    // Nothing to file into without a program, so no attach control is offered.
    expect(screen.queryByRole('button', { name: /Attach completed form/ })).toBeNull();
  });
});

describe('IndFormsPanel — filing the sponsor’s completed form', () => {
  const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'signed-1571.pdf', { type: 'application/pdf' });

  it('files the completed form and reports where it landed', async () => {
    mockProgramListing();
    apiUpload.mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ formId: 'FDA_1571', leafId: 12, sectionCode: 'm1.1', sequenceNumber: '0000', sha256: 'a'.repeat(64), byteSize: 4, replaced: false }),
    } as Response);
    const note = vi.fn();
    const { container } = render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdf()] } });

    await waitFor(() => expect(apiUpload).toHaveBeenCalled());
    const [method, url, form] = apiUpload.mock.calls[0];
    expect(method).toBe('POST');
    expect(url).toBe('/api/ind-forms/FDA_1571/official-upload');
    expect((form as FormData).get('projectIdent')).toBe(PROGRAM_UUID);
    expect((form as FormData).get('file')).toBeTruthy();
    await waitFor(() =>
      expect(note).toHaveBeenCalledWith(expect.stringMatching(/filed at m1\.1 in sequence 0000/)),
    );
  });

  it('reports a refusal in the server’s own words and claims nothing was filed', async () => {
    mockProgramListing();
    apiUpload.mockResolvedValue({
      ok: false, status: 409,
      json: async () => ({ error: { code: 'BLANK_TEMPLATE', message: 'This is the blank official form, byte for byte. Complete and sign it in Adobe Acrobat, then attach the signed file.' } }),
    } as Response);
    const note = vi.fn();
    const { container } = render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [pdf()] } });
    await waitFor(() =>
      expect(note).toHaveBeenCalledWith(expect.stringMatching(/blank official form, byte for byte/), 'error'),
    );
    expect(note).not.toHaveBeenCalledWith(expect.stringMatching(/filed at/));
  });

  it('shows a form already filed, with the digest of the bytes the sponsor signed', async () => {
    mockProgramListing({
      placements: [{ formId: 'FDA_1571', leafId: 12, sectionCode: 'm1.1', sequenceNumber: '0000', fileName: 'form-fda-1571.pdf', sha256: 'abcdef0123456789'.repeat(4), byteSize: 2048 }],
    } as never);
    render(<IndFormsPanel note={vi.fn()} />);
    expect(await screen.findByText('completed form filed')).toBeTruthy();
    expect(screen.getByText(/m1\.1 · sequence 0000 · 2 KB · SHA-256 abcdef012345…/)).toBeTruthy();
    // A form already filed offers replacement, not a second filing.
    expect(screen.getAllByText(/Replace completed form/).length).toBeGreaterThan(0);
  });
});

describe('IndFormsPanel — the form is named once', () => {
  it('reads "FDA 1571", not "FDA FDA_1571" — the engine ids are canonical and were pasted after another "FDA"', async () => {
    mockProgramListing();
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.click(screen.getAllByRole('button', { name: /Build & check/ })[0]);
    await waitFor(() => expect(note).toHaveBeenCalledWith(expect.stringMatching(/^Form 1571 built/)));
    for (const [text] of note.mock.calls) expect(String(text)).not.toMatch(/FDA_/);
  });
});

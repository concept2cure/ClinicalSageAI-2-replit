// @vitest-environment jsdom
/**
 * EctdCompile — proves the eCTD assembly surface is wired to the real
 * /api/ectd-compile engine: reads module readiness, compiles across a region,
 * and renders the server's result (errors/warnings + downloadable backbone).
 * With no program open it shows an honest empty state, never a fixture.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { EctdCompile } from '../surfaces/EctdCompile';

function ok(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const STATUS = {
  projectId: 42, overallReadiness: 60, submissionReady: false, totalSections: 5, totalRequired: 2, totalCompleted: 1, lastUpdated: null,
  modules: [{ moduleCode: 'm3', moduleName: 'Module 3 — Quality', totalSections: 5, requiredSections: 2, completedRequired: 1, completionPct: 50, ready: false }],
};
const COMPILE = {
  id: 'c1', projectId: 42, status: 'completed', modules: [], xmlBackbone: '<ectd:backbone/>',
  validationResults: [{ rule: 'REQUIRED_SECTION_OK', severity: 'info', message: 'Section 3.2.S ok' }],
  submissionReady: true, errors: [], warnings: ['3.2.P.8 stability is short'],
};

const props = () => ({ surface: { id: 'ectd-compile', label: 'eCTD' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ectd-compile/42/status') return ok(STATUS);
    if (method === 'GET' && url === '/api/ectd-compile/42/history') return ok({ compilations: [] });
    if (method === 'POST' && url === '/api/ectd-compile/42/compile') return ok(COMPILE);
    return ok({});
  });
});

describe('EctdCompile — real eCTD assembly', () => {
  it('loads module readiness from the real status endpoint', async () => {
    (window as any).C2C_PROJECT = { id: 42, title: 'ABC-123', code: 'IND-42' };
    render(<EctdCompile {...props()} />);
    expect(await screen.findByText('Module 3 — Quality')).toBeTruthy();
    expect(screen.getByText(/60% · incomplete/)).toBeTruthy();
  });

  it('compiles across the region and renders the server result with a backbone download', async () => {
    (window as any).C2C_PROJECT = { id: 42, title: 'ABC-123' };
    render(<EctdCompile {...props()} />);
    await screen.findByText('Module 3 — Quality');

    fireEvent.click(screen.getByRole('button', { name: /Compile eCTD/ }));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/ectd-compile/42/compile');
      expect(call).toBeTruthy();
      expect(call![2] as any).toMatchObject({ submissionType: 'initial', region: 'FDA' });
    });
    expect(await screen.findByText(/Compilation complete/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Download eCTD backbone/ })).toBeTruthy();
  });

  it('shows an honest empty state when no program is open (no fixture)', () => {
    render(<EctdCompile {...props()} />);
    expect(screen.getByText(/Open a program to compile its eCTD/)).toBeTruthy();
    // No compile/status calls fire without a project.
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('a program UUID ident is sent to the server (which resolves it) — the numeric-only dead-end is gone', async () => {
    // window.C2C_PROJECT.id is a regulatory_programs UUID in the real shell.
    const uuid = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';
    const STATUS_PROGRAM = {
      projectId: null, projectIdent: uuid, programId: uuid, overallReadiness: 0,
      contentComplete: false, submissionReady: false, totalSections: 0, totalRequired: 22, totalCompleted: 0, lastUpdated: null,
      submissionBlockers: ['Required sections are not all complete.', 'This program has no linked section-tracking store'],
      modules: [{ moduleCode: 'm1', moduleName: 'Administrative Information', totalSections: 0, requiredSections: 7, completedRequired: 0, completionPct: 0, ready: false }],
    };
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === `/api/ectd-compile/${uuid}/status`) return ok(STATUS_PROGRAM);
      if (method === 'GET' && url === `/api/ectd-compile/${uuid}/history`) return ok({ compilations: [] });
      return ok({});
    });
    (window as any).C2C_PROJECT = { id: uuid, title: 'BX-204 CGM', code: 'BX-204' };
    render(<EctdCompile {...props()} />);

    // The server's readiness (not a client dead-end) renders.
    expect(await screen.findByText('Administrative Information')).toBeTruthy();
    expect(screen.queryByText(/no numeric project id/)).toBeNull();
    // The status/history reads addressed the UUID ident verbatim.
    expect(apiRequest.mock.calls.some((c) => c[1] === `/api/ectd-compile/${uuid}/status`)).toBe(true);
    expect(apiRequest.mock.calls.some((c) => c[1] === `/api/ectd-compile/${uuid}/history`)).toBe(true);
  });
});

describe('EctdCompile — what the surface may claim', () => {
  /** Route the three reads with a caller-supplied compile payload. */
  function mockWith(compile: Record<string, unknown>, status: Record<string, unknown> = STATUS) {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/ectd-compile/42/status') return ok(status);
      if (method === 'GET' && url === '/api/ectd-compile/42/history') return ok({ compilations: [] });
      if (method === 'POST' && url === '/api/ectd-compile/42/compile') return ok(compile);
      return ok({});
    });
  }

  beforeEach(() => { (window as any).C2C_PROJECT = { id: 42 }; });

  it('names what is still missing instead of a bare negative', async () => {
    mockWith({
      ...COMPILE,
      submissionReady: false,
      contentValidationPassed: true,
      leafFilesRendered: 0,
      submissionBlockers: [
        "No leaf files have been rendered for this compile: it is not linked to a canonical submission (submissions → eCTD sequence) with placed documents, so this backbone describes authored section content only and cannot be transmitted to an agency gateway. Leaf rendering runs from the submission spine — create the program's submission and place approved documents into its eCTD sequence.",
      ],
    });
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByText(/Compile eCTD/));

    expect(await screen.findByText('Not yet submittable:')).toBeTruthy();
    expect(screen.getByText(/No leaf files have been rendered for this compile/)).toBeTruthy();
  });

  it('warns that the downloadable backbone is not a sequence', async () => {
    // The download button is right there; the user has to know what they got.
    mockWith({ ...COMPILE, submissionReady: false, submissionBlockers: ['x'] });
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByText(/Compile eCTD/));

    await screen.findByText(/Download eCTD backbone XML/);
    expect(screen.getByText(/not a sequence to transmit/)).toBeTruthy();
  });

  it('reports the readiness number as content completeness, not readiness to submit', async () => {
    // The chip read "100% · submission-ready" over a package with no leaf files.
    mockWith(COMPILE, { ...STATUS, overallReadiness: 100, contentComplete: true, submissionReady: false });
    render(<EctdCompile {...props()} />);
    expect(await screen.findByText(/100% · content complete/)).toBeTruthy();
    expect(screen.queryByText(/submission-ready/)).toBeNull();
  });

  it('claims nothing extra in the compile toast', async () => {
    mockWith({ ...COMPILE, submissionReady: false, submissionBlockers: ['x'] });
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByText(/Compile eCTD/));
    await waitFor(() => expect(screen.getByText(/eCTD backbone compiled/)).toBeTruthy());
    expect(screen.queryByText(/— submission-ready/)).toBeNull();
  });
});

/* ── Click 4: the compiled package, as a reviewer would open it ─────────────── */

/** index.xml exactly as the packager writes it for BX-512's sequence 0000. */
const REAL_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="util/style/ectd-2-0.xsl"?>
<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">
<ectd:ectd xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3.org/1999/xlink" dtd-version="3.2">
  <m1-administrative-information-and-prescribing-information>
    <leaf operation="new" checksum="aa" checksum-type="md5" xlink:href="m1/us/us-regional.xml" xlink:type="simple" ID="leaf-m1-regional-backbone">
      <title>Module 1 regional backbone (us-regional.xml)</title>
    </leaf>
  </m1-administrative-information-and-prescribing-information>
  <m3-quality>
    <m3-2-body-of-data>
      <m3-2-s-drug-substance>
        <leaf operation="new" checksum="bb" checksum-type="md5" xlink:href="m3/3-2-s-4-2/control.pdf" xlink:type="simple" ID="leaf-3-2-s-4-2">
          <title>Control of Drug Substance (CTD 3.2.S.4)</title>
        </leaf>
      </m3-2-s-drug-substance>
    </m3-2-body-of-data>
  </m3-quality>
</ectd:ectd>`;

const REAL_REGIONAL = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fda-regional:fda-regional SYSTEM "../../util/dtd/us-regional-v3-3.dtd">
<fda-regional:fda-regional dtd-version="3.3" xmlns:fda-regional="http://www.ich.org/fda" xmlns:xlink="http://www.w3.org/1999/xlink">
  <admin><applicant-info/></admin>
  <m1-regional>
    <m1-1-forms>
      <leaf operation="new" checksum="cc" checksum-type="md5" xlink:href="1-1/form-fda-1571.pdf" xlink:type="simple" ID="leaf-m1-1">
        <title>Form FDA 1571 (sponsor-completed)</title>
      </leaf>
    </m1-1-forms>
  </m1-regional>
</fda-regional:fda-regional>`;

const PACKAGE = {
  sha256: 'f'.repeat(64),
  files: ['index-md5.txt', 'index.xml', 'm1/us/1-1/form-fda-1571.pdf', 'm1/us/us-regional.xml', 'm3/3-2-s-4-2/control.pdf', 'util/index-md5.txt'],
  regionalBackbone: { path: 'm1/us/us-regional.xml', xml: REAL_REGIONAL },
  indexMd5: 'd41d8cd98f00b204e9800998ecf8427e',
  pdfa: { pdfLeaves: 2, pdfaConverted: 0, allPdfA: false, notConverted: ['m1/us/1-1/form-fda-1571.pdf', 'm3/3-2-s-4-2/control.pdf'] },
};

const SPINE_STATUS = {
  ...STATUS, overallReadiness: 50, readinessBasis: 'placed', totalRequired: 2, totalCompleted: 1,
  sequence: { sequenceNumber: '0000', region: 'fda', leafCount: 2 },
};

function mockSpineCompile(compile: Record<string, unknown>, history: unknown[] = []) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ectd-compile/42/status') return ok(SPINE_STATUS);
    if (method === 'GET' && url === '/api/ectd-compile/42/history') return ok({ compilations: history });
    if (method === 'POST' && url === '/api/ectd-compile/42/compile') return ok(compile);
    return ok({});
  });
}
const SPINE_COMPILE = {
  ...COMPILE, xmlBackbone: REAL_INDEX, submissionId: 55, sequenceNumber: '0000', region: 'fda',
  leafFilesRendered: 2, recorded: true, package: PACKAGE, submissionReady: false, submissionBlockers: ['x'],
};

describe('EctdCompile — the compiled package', () => {
  beforeEach(() => { (window as any).C2C_PROJECT = { id: 42 }; });

  it('opens both backbones as a navigable leaf hierarchy — Module 1 from the regional file', async () => {
    mockSpineCompile(SPINE_COMPILE);
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Compile eCTD/ }));

    const tree = await screen.findByRole('region', { name: 'Leaf hierarchy' });
    // Headings are the backbone's own elements, nested; each leaf carries its title,
    // lifecycle operation and path, read from the XML — not restated from the request.
    expect(tree.textContent).toContain('m3-2-s-drug-substance');
    expect(tree.textContent).toContain('Control of Drug Substance (CTD 3.2.S.4)');
    expect(tree.textContent).toContain('m3/3-2-s-4-2/control.pdf');
    expect(tree.textContent).toContain('m1-1-forms');
    expect(tree.textContent).toContain('Form FDA 1571 (sponsor-completed)');
    // Headings open and close from the keyboard: they are native <summary> elements.
    expect(tree.querySelectorAll('details > summary').length).toBeGreaterThanOrEqual(5);
  });

  it('lists every file in the package and offers the regional backbone and the MD5 index', async () => {
    mockSpineCompile(SPINE_COMPILE);
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Compile eCTD/ }));
    expect(await screen.findByText('Files in this package (6)')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Download us-regional\.xml/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Download index-md5\.txt/ })).toBeTruthy();
  });

  it('states the PDF/A outcome and whether the compilation was recorded', async () => {
    mockSpineCompile(SPINE_COMPILE);
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Compile eCTD/ }));
    expect(await screen.findByText(/0 of 2 PDF leaves converted to PDF\/A/)).toBeTruthy();
    expect(screen.getByText(/Recorded — its leaf manifest is what the next sequence is diffed against/)).toBeTruthy();
  });

  it('names an FDA form shipped as FDA issued apart from the PDF/A count', async () => {
    mockSpineCompile({
      ...SPINE_COMPILE,
      package: {
        ...PACKAGE,
        pdfa: { pdfLeaves: 2, pdfaConverted: 1, allPdfA: true, notConverted: [], agencyFormsAsIssued: ['m1/us/1-1/form-fda-1571.pdf'] },
      },
    });
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Compile eCTD/ }));
    // The form is not counted as a PDF leaf that failed conversion, and it is not
    // silently folded into the converted count either: it is named on its own.
    expect(await screen.findByText(/1 of 1 PDF leaves converted to PDF\/A/)).toBeTruthy();
    const asIssued = screen.getByText(/shipped as FDA issued/);
    expect(asIssued.textContent).toContain('m1/us/1-1/form-fda-1571.pdf');
    expect(asIssued.textContent).toMatch(/security settings intact/);
  });

  it('an unrecorded compilation says it can anchor no lifecycle', async () => {
    mockSpineCompile({ ...SPINE_COMPILE, recorded: false });
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Compile eCTD/ }));
    expect(await screen.findByText(/Not recorded — the next sequence has nothing to be diffed against/)).toBeTruthy();
  });

  it('the region is the sequence\'s: shown, not chosen, and not sent', async () => {
    mockSpineCompile(SPINE_COMPILE);
    render(<EctdCompile {...props()} />);
    expect(await screen.findByText(/recorded on sequence 0000/)).toBeTruthy();
    expect(screen.queryByLabelText('Region')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Compile eCTD/ }));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/ectd-compile/42/compile');
      expect(call).toBeTruthy();
      expect(call![2]).not.toHaveProperty('region');
    });
  });

  it('readiness counted from placed documents says so, and never reads as approval', async () => {
    mockSpineCompile(SPINE_COMPILE);
    render(<EctdCompile {...props()} />);
    expect(await screen.findByText(/1 of 2 required sections placed/)).toBeTruthy();
    expect(screen.queryByText(/content complete/)).toBeNull();
  });

  it('history names the sequence each compilation covered and whether it anchors the next', async () => {
    mockSpineCompile(SPINE_COMPILE, [
      { id: 4, compilation_name: 'IND Compilation — BX-512', compilation_type: 'initial', status: 'completed', version: '1.0',
        compiled_at: '2026-09-22T10:00:00Z', created_at: '2026-09-22T10:00:00Z', sequence_number: '0000', has_manifest: true },
    ]);
    render(<EctdCompile {...props()} />);
    const row = (await screen.findByText('IND Compilation — BX-512')).closest('tr')!;
    expect(row.textContent).toContain('0000');
    expect(row.textContent).toMatch(/manifest recorded/);
  });
});

describe('EctdCompile — a follow-up sequence\'s lifecycle', () => {
  beforeEach(() => { (window as any).C2C_PROJECT = { id: 42 }; });

  it('a follow-up sequence shows every act against the filed state, and what was left out', async () => {
    mockSpineCompile({
      ...SPINE_COMPILE,
      sequenceNumber: '0001',
      lifecycle: {
        priorSequence: '0000',
        operations: [
          { operation: 'replace', ctdSection: '2.5', fileName: 'clinical-overview.pdf', href: 'm2/25-clin-over/clinical-overview.pdf',
            modifiedFile: '../0000/m2/25-clin-over/clinical-overview.pdf' },
          { operation: 'delete', ctdSection: '3.2.S.4', fileName: 'specification.pdf', href: '../0000/m3/32s4/specification.pdf',
            modifiedFile: '../0000/m3/32s4/specification.pdf' },
        ],
        leftOut: [{ sectionCode: '3.2.P', reason: 'declared append: the content is identical to the filed version, so there is nothing to append' }],
      },
    });
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Compile eCTD/ }));

    const life = await screen.findByRole('region', { name: 'Lifecycle' });
    expect(life.textContent).toMatch(/on file through sequence 0000/);
    const rows = Array.from(life.querySelectorAll('tbody tr')).map((r) => Array.from(r.querySelectorAll('td')).map((c) => c.textContent));
    expect(rows).toEqual([
      ['replace', '2.5', 'm2/25-clin-over/clinical-overview.pdf', '../0000/m2/25-clin-over/clinical-overview.pdf'],
      ['delete', '3.2.S.4', 'specification.pdf', '../0000/m3/32s4/specification.pdf'],
    ]);
    expect(life.textContent).toContain('3.2.P: declared append: the content is identical to the filed version');
  });

  it('a follow-up with no filed sequence on record says there is nothing on file to act on', async () => {
    mockSpineCompile({
      ...SPINE_COMPILE, sequenceNumber: '0001', lifecycle: { priorSequence: null, operations: [], leftOut: [] },
    });
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Compile eCTD/ }));
    const life = await screen.findByRole('region', { name: 'Lifecycle' });
    expect(life.textContent).toMatch(/No filed sequence is on record for this submission/);
  });

  it('an original sequence has no lifecycle to show', async () => {
    mockSpineCompile({ ...SPINE_COMPILE, lifecycle: { priorSequence: null, operations: [], leftOut: [] } });
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Compile eCTD/ }));
    await screen.findByRole('region', { name: 'Leaf hierarchy' });
    expect(screen.queryByRole('region', { name: 'Lifecycle' })).toBeNull();
  });
});

/* ── WO-9 Click 6: an agency-validator report, run outside, imported here ── */

const REPORT_TEXT = JSON.stringify({
  findings: [
    { ruleId: '1306', severity: 'High', message: 'modified-file does not resolve', location: '0001/index.xml' },
    { ruleId: '1734', severity: 'Medium', message: 'Leaf title is long', location: 'm2/25-clin-over/clinical-overview.pdf' },
  ],
});
const IMPORTED = {
  validator: 'lorenz-evalidator', source: 'imported', importedAt: '2026-09-23T10:00:00.000Z', importedBy: 3,
  importedByEmail: 'ra.lead@example.com', supersedes: [] as unknown[],
  fileName: 'evalidator-0001.json', reportSha256: 'e'.repeat(64),
  findings: [
    { ruleId: '1306', severity: 'error', message: 'modified-file does not resolve', leafHref: '0001/index.xml' },
    { ruleId: '1734', severity: 'warning', message: 'Leaf title is long', leafHref: 'm2/25-clin-over/clinical-overview.pdf' },
  ],
  errorCount: 1, warningCount: 1, infoCount: 0,
};
const ROW_0001 = {
  id: 31, compilation_name: 'BX-512 FDA sequence 0001', compilation_type: 'sequence', status: 'completed', version: '1.0',
  compiled_at: '2026-09-23T09:00:00.000Z', created_at: '2026-09-23T09:00:00.000Z', sequence_number: '0001', has_manifest: true,
};

describe('EctdCompile — an imported agency-validator report', () => {
  beforeEach(() => { (window as any).C2C_PROJECT = { id: 42 }; });

  it('shows an imported report with its compilation, and says this product did not run it', async () => {
    mockSpineCompile(SPINE_COMPILE, [{ ...ROW_0001, external_validation: IMPORTED }]);
    render(<EctdCompile {...props()} />);

    const report = await screen.findByRole('region', { name: 'eValidator report — sequence 0001' });
    expect(report.textContent).toMatch(/Run outside this product/);
    expect(report.textContent).toContain('evalidator-0001.json');
    const rows = Array.from(report.querySelectorAll('tbody tr')).map((r) => Array.from(r.querySelectorAll('td')).map((c) => c.textContent));
    expect(rows).toEqual([
      ['1306', 'error', 'modified-file does not resolve', '0001/index.xml'],
      ['1734', 'warning', 'Leaf title is long', 'm2/25-clin-over/clinical-overview.pdf'],
    ]);
    // In the history row, and heading the report.
    expect(screen.getAllByText('1 error · 1 warning')).toHaveLength(2);
  });

  it('names who imported it by account, and lists every report it replaced', async () => {
    const replaced = {
      importedAt: '2026-09-22T15:00:00.000Z', importedBy: 4, importedByEmail: 'qa.reviewer@example.com',
      fileName: 'evalidator-first.json', reportSha256: 'a'.repeat(64), errorCount: 2, warningCount: 0, infoCount: 0,
    };
    mockSpineCompile(SPINE_COMPILE, [{ ...ROW_0001, external_validation: { ...IMPORTED, supersedes: [replaced] } }]);
    render(<EctdCompile {...props()} />);

    const report = await screen.findByRole('region', { name: 'eValidator report — sequence 0001' });
    expect(report.textContent).toContain('ra.lead@example.com');
    const trail = within(report).getByRole('list', { name: 'Reports this one replaced' });
    expect(trail.textContent).toContain('qa.reviewer@example.com');
    expect(trail.textContent).toContain('2 errors · 0 warnings');
    expect(trail.textContent).toContain('evalidator-first.json');
  });

  it('replacing a report asks first, naming the report it replaces; cancelling opens nothing', async () => {
    const pick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    try {
      mockSpineCompile(SPINE_COMPILE, [{ ...ROW_0001, external_validation: IMPORTED }]);
      render(<EctdCompile {...props()} />);

      fireEvent.click(await screen.findByRole('button', { name: /Replace eValidator report: sequence 0001/ }));
      expect(pick).not.toHaveBeenCalled();
      const ask = screen.getByRole('group', { name: 'Replace the eValidator report for sequence 0001' });
      expect(ask.textContent).toContain('ra.lead@example.com');
      expect(ask.textContent).toContain('1 error · 1 warning');

      fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('group', { name: 'Replace the eValidator report for sequence 0001' })).toBeNull();
      expect(pick).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: /Replace eValidator report: sequence 0001/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Choose the replacement report' }));
      expect(pick).toHaveBeenCalledTimes(1);
    } finally {
      pick.mockRestore();
    }
  });

  it('imports a report against the compilation whose package it covered', async () => {
    let imported = false;
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
      if (method === 'GET' && url === '/api/ectd-compile/42/status') return ok(SPINE_STATUS);
      if (method === 'GET' && url === '/api/ectd-compile/42/history') {
        return ok({ compilations: [imported ? { ...ROW_0001, external_validation: IMPORTED } : ROW_0001] });
      }
      if (method === 'POST' && url === '/api/ectd-compile/42/validate' && body?.evalidatorReport) {
        imported = true;
        return ok({ imported: true, compilationId: 31, sequenceNumber: '0001', externalValidation: IMPORTED });
      }
      return ok({});
    });
    render(<EctdCompile {...props()} />);

    const trigger = await screen.findByRole('button', { name: /Import eValidator report: sequence 0001/ });
    expect(trigger).toBeTruthy();
    const picker = screen.getByLabelText('eValidator report file for sequence 0001') as HTMLInputElement;
    const file = new File([REPORT_TEXT], 'evalidator-0001.json', { type: 'application/json' });
    fireEvent.change(picker, { target: { files: [file] } });

    await screen.findByRole('region', { name: 'eValidator report — sequence 0001' });
    const post = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/ectd-compile/42/validate');
    expect(post?.[2]).toEqual({ evalidatorReport: { compilationId: 31, fileName: 'evalidator-0001.json', text: REPORT_TEXT } });
  });

  it('a refused report is shown in the server\'s words, and nothing is shown as imported', async () => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/ectd-compile/42/status') return ok(SPINE_STATUS);
      if (method === 'GET' && url === '/api/ectd-compile/42/history') return ok({ compilations: [ROW_0001] });
      if (method === 'POST' && url === '/api/ectd-compile/42/validate') {
        return ok({ error: { code: 'REPORT_UNREADABLE', message: 'This is not an eValidator report this product reads: got an object with keys [results].' } }, 422);
      }
      return ok({});
    });
    render(<EctdCompile {...props()} />);

    const picker = await screen.findByLabelText('eValidator report file for sequence 0001');
    fireEvent.change(picker, { target: { files: [new File(['{"results":[]}'], 'r.json', { type: 'application/json' })] } });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('This is not an eValidator report this product reads');
    expect(screen.queryByRole('region', { name: 'eValidator report — sequence 0001' })).toBeNull();
  });
});

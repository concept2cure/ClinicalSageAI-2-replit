/**
 * Fixtures shared by the EctdCompile surface tests: the server's status and
 * compile payloads, and the package the packager builds for BX-512. Split out
 * so each test file stays one concern (2026-09-29, W5/D7).
 */
import { vi } from 'vitest';

export function ok(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

export const STATUS = {
  projectId: 42, overallReadiness: 60, submissionReady: false, totalSections: 5, totalRequired: 2, totalCompleted: 1, lastUpdated: null,
  modules: [{ moduleCode: 'm3', moduleName: 'Module 3 — Quality', totalSections: 5, requiredSections: 2, completedRequired: 1, completionPct: 50, ready: false }],
};
export const COMPILE = {
  id: 'c1', projectId: 42, status: 'completed', modules: [], xmlBackbone: '<ectd:backbone/>',
  validationResults: [{ rule: 'REQUIRED_SECTION_OK', severity: 'info', message: 'Section 3.2.S ok' }],
  submissionReady: true, errors: [], warnings: ['3.2.P.8 stability is short'],
};

export const props = () => ({ surface: { id: 'ectd-compile', label: 'eCTD' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

/** index.xml exactly as the packager writes it for BX-512's sequence 0000. */
export const REAL_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
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

export const REAL_REGIONAL = `<?xml version="1.0" encoding="UTF-8"?>
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

export const PACKAGE = {
  sha256: 'f'.repeat(64),
  files: ['index-md5.txt', 'index.xml', 'm1/us/1-1/form-fda-1571.pdf', 'm1/us/us-regional.xml', 'm3/3-2-s-4-2/control.pdf', 'util/index-md5.txt'],
  regionalBackbone: { path: 'm1/us/us-regional.xml', xml: REAL_REGIONAL },
  indexMd5: 'd41d8cd98f00b204e9800998ecf8427e',
  pdfa: { pdfLeaves: 2, pdfaConverted: 0, allPdfA: false, notConverted: ['m1/us/1-1/form-fda-1571.pdf', 'm3/3-2-s-4-2/control.pdf'] },
};

export const SPINE_STATUS = {
  ...STATUS, overallReadiness: 50, readinessBasis: 'placed', totalRequired: 2, totalCompleted: 1,
  sequence: { sequenceNumber: '0000', region: 'fda', leafCount: 2 },
};

/** Serve the spine-backed status, history and compile the surface asks for. */
export function serveSpineCompile(
  apiRequest: ReturnType<typeof vi.fn>,
  compile: Record<string, unknown>,
  history: unknown[] = [],
): void {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ectd-compile/42/status') return ok(SPINE_STATUS);
    if (method === 'GET' && url === '/api/ectd-compile/42/history') return ok({ compilations: history });
    if (method === 'POST' && url === '/api/ectd-compile/42/compile') return ok(compile);
    return ok({});
  });
}

export const SPINE_COMPILE = {
  ...COMPILE, xmlBackbone: REAL_INDEX, submissionId: 55, sequenceNumber: '0000', region: 'fda',
  leafFilesRendered: 2, recorded: true, package: PACKAGE, submissionReady: false, submissionBlockers: ['x'],
};

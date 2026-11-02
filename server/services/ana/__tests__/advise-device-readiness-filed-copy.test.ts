/**
 * advise_device_readiness carries the filing's verdict on a filed copy that is
 * not the document's text (P-29.3; handed on by the MDX journey, 2026-11-02,
 * docs/evidence/MDX-JOURNEY/2026-11-02-slice-3-estar-exits-ask-the-filing/).
 *
 * MDX slice 3 taught every eSTAR exit to ask whether the filing holds the
 * document's text: loadProgramDeviceAssemblyInput sets `filedCopyDiverged`, and
 * assembleDeviceSubmission then produces nothing and names the section and the
 * remedy. assemble_device_submission passes the loaded input whole, so it says
 * so. advise_device_readiness rebuilt the input field by field and left
 * `filedCopyDiverged` out, so in project mode AnA could advise "official eSTAR"
 * over a rewritten filed copy that every exit refuses.
 *
 * Only the open-project lookup and the loader are doubles here; the engine, the
 * advisor and the handler are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROGRAM = '0a000000-0000-4000-8000-00000000000b';

const h = vi.hoisted(() => ({
  diverged: undefined as undefined | Array<{ key: string; section: { code: string } }>,
}));

vi.mock('../../../db.js', () => ({ getPool: () => ({ query: async () => ({ rows: [] }) }), pool: { query: async () => ({ rows: [] }) } }));
vi.mock('../../c2c/program-access.js', async (orig) => ({
  ...(await orig<typeof import('../../c2c/program-access.js')>()),
  resolveOpenProgram: async () => PROGRAM,
}));
vi.mock('../../pathway-engines/device-assembly/assemble-device-submission.js', async (orig) => {
  const real = await orig<typeof import('../../pathway-engines/device-assembly/assemble-device-submission.js')>();
  return {
    ...real,
    loadProgramDeviceAssemblyInput: async () => ({
      deviceContentSource: 'governed',
      assemblyInput: {
        pathway: '510k',
        variant: 'device',
        leaves: [
          { sectionCode: '1', title: 'Cover letter', substantive: true },
          { sectionCode: '2', title: 'Indications for use', substantive: true },
          { sectionCode: '3', title: 'Device description', substantive: true },
          { sectionCode: '4', title: 'Proposed labeling and instructions for use', substantive: true },
          { sectionCode: '5', title: 'Biocompatibility evaluation', substantive: true },
          { sectionCode: '6', title: 'Performance testing — bench', substantive: true },
          { sectionCode: '7', title: 'Substantial equivalence comparison to predicate', substantive: true },
          { sectionCode: '1b', title: 'CDRH cover sheet 3514', substantive: true },
          { sectionCode: '1c', title: 'MDUFA user fee cover sheet 3601', substantive: true },
          { sectionCode: '2b', title: 'Truthful and accurate statement', substantive: true },
          { sectionCode: '4b', title: 'Risk management file', substantive: true },
          { sectionCode: '8', title: '510(k) Summary', substantive: true },
        ],
        deviceFlags: { combinationProduct: false, softwareAiMl: false, cyberDevice: false, sterile: false, implantable: false, cliaWaived: false, clinicalData: false },
        presentTemplates: ['eSTAR-510k-non-ivd.pdf'],
        environment: 'production',
        requireTemplate: true,
        filedCopyDiverged: h.diverged,
      },
    }),
  };
});

import { getToolHandler } from '../AnaToolExecutor';

const OPEN = { organizationId: 7, userId: 3, projectId: 11 } as never;
const run = async (tool: string) => JSON.parse(await getToolHandler(tool)!({ pathway: '510k', variant: 'device' }, OPEN));

beforeEach(() => {
  h.diverged = undefined;
});

describe('advise_device_readiness reads the filing, as assemble_device_submission does', () => {
  it('a filed copy that is not the document\'s text: nothing producible, and the section and the remedy named', async () => {
    h.diverged = [{ key: 'E1', section: { code: 'E1' } }];
    const assembled = await run('assemble_device_submission');
    expect(assembled.result.artifactKind, 'the premise: the engine refuses a rewritten filed copy').toBe('none');

    const advice = await run('advise_device_readiness');
    expect(advice.canProduceOfficialEstar, 'the advice read a rewritten filed copy as producible').toBe(false);
    expect(advice.artifactKind).toBe('none');
    expect(advice.headline).toMatch(/^Not yet assemblable for this 510\(k\) \(device\)\. The filed copy of section E1 is not the document's text\./);
    expect(advice.headline).toMatch(/Re-file saved text/);
    expect(advice.blockers).toEqual(assembled.result.blockers);
  });

  it('when the filing agrees, or was not compared, the advice is unchanged', async () => {
    for (const diverged of [[], undefined]) {
      h.diverged = diverged;
      const advice = await run('advise_device_readiness');
      expect(advice.canProduceOfficialEstar).toBe(true);
      expect(advice.artifactKind).toBe('official-estar');
      expect(JSON.stringify(advice)).not.toMatch(/filed cop/);
    }
  });
});

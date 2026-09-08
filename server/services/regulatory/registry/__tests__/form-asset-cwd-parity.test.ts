/**
 * The coverage report and the renderer must read the SAME vendored template
 * file — the invariant `readFormManifest`'s doc-comment states twice ("the same
 * file, so this report and the renderer cannot disagree").
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Both sides resolved the templates directory independently, and both did it
 * relative to `process.cwd()`. That was two copies of one path (against the
 * zero-duplication rule) but it was at least CONSISTENT: off-root, both missed,
 * and the report agreed with the renderer that no official form was installed.
 *
 * The renderer was then fixed to resolve from its own module location, and this
 * file was not. Off-root the two now DISAGREE in the way the doc-comment
 * promises they cannot: the renderer serves the genuine FDA 1571/356h while the
 * report tells a product owner the official editions are not installed.
 *
 * The direction is conservative, so this is not a fail-open — but a written
 * invariant that is false is a defect on its own terms, and one resolver is the
 * only way it stays true.
 *
 * These cases change the working directory and nothing else. Nothing is mocked;
 * the real committed assets are read from both directories.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getDocumentCoverage } from '../registryCoverage';
import { describeRenderPlan } from '../../../ind-forms/ind-form-fill-service';

/** US_IND requires 1571 (dynamic XFA) and 1572 (static AcroForm) — one form on
 *  each of the two fill contracts, so a resolver defect cannot hide in one. */
const VIA_ENTRY = 'US_IND';

const savedEnv = process.env.IND_FORM_TEMPLATES_DIR;
beforeAll(() => { delete process.env.IND_FORM_TEMPLATES_DIR; });
afterAll(() => {
  if (savedEnv === undefined) delete process.env.IND_FORM_TEMPLATES_DIR;
  else process.env.IND_FORM_TEMPLATES_DIR = savedEnv;
});

function trustedFormNumbers(): string[] {
  const cov = getDocumentCoverage(VIA_ENTRY);
  if (!cov) throw new Error(`${VIA_ENTRY} missing from the registry`);
  return cov.requiredForms
    .filter((f) => f.officialAssetTrusted)
    .map((f) => f.formNumber ?? f.artifact)
    .sort();
}

describe('the coverage report reads the same installed assets as the renderer', () => {
  /** POSITIVE CONTROL — true before the repair and after it. */
  it('from the repository root, both report the official 1571 and 1572 as installed', async () => {
    expect(trustedFormNumbers()).toEqual(expect.arrayContaining(['1571', '1572']));
    expect((await describeRenderPlan('FDA_1571')).officialTemplate).toBe(true);
    expect((await describeRenderPlan('FDA_1572')).officialTemplate).toBe(true);
  }, 60_000);

  describe('from a directory that is not the repository root', () => {
    const original = process.cwd();
    beforeEach(() => { process.chdir(mkdtempSync(join(tmpdir(), 'c2c-cov-cwd-'))); });
    afterEach(() => { process.chdir(original); });

    it('still reports the official editions the renderer will actually serve', async () => {
      // The renderer's verdict, off-root, is unchanged: it fills both.
      expect((await describeRenderPlan('FDA_1571')).officialTemplate).toBe(true);
      expect((await describeRenderPlan('FDA_1572')).officialTemplate).toBe(true);
      // Before the repair this was `[]` — "no official FDA form is installed" —
      // for the exact assets the line above just filled from.
      expect(trustedFormNumbers()).toEqual(expect.arrayContaining(['1571', '1572']));
    }, 60_000);

    it('names a reviewer for the reviewed AcroForm edition, as it does from the root', () => {
      const cov = getDocumentCoverage(VIA_ENTRY)!;
      const acro = cov.requiredForms.find((f) => f.formNumber === '1572');
      expect(acro?.reviewer, 'the 1572 manifest names a reviewer wherever it is read from')
        .toEqual(expect.any(String));
    });
  });
});

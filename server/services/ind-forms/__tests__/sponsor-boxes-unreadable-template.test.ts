/**
 * "No boxes are left for you" must not be the answer for a template that could
 * not be READ.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `requiredBoxesLeftToSponsor` returns [] whenever `plan.officialTemplate` is
 * false. `describeRenderPlan` sets that false whenever BOTH `readTemplate` and
 * `readXfaTemplate` return null — and each of those swallows *every* failure in
 * one catch: a missing file, a missing or corrupt `.manifest.json`, a SHA-256
 * digest MISMATCH, an unreviewed manifest, an I/O error, a wrong
 * IND_FORM_TEMPLATES_DIR.
 *
 * So two very different facts collapsed into the same answer:
 *   - "this form has no official edition"        → [] is correct
 *   - "this form's official edition failed to verify" → [] is a fabrication
 *
 * The consequence is not cosmetic. `POST /api/ind-forms/:id/artifact` writes
 * `sponsorMustComplete` into `concept2cure_artifacts.metadata` AND into the
 * 21 CFR Part 11 audit row. A tampered or unreadable FDA_1571 asset therefore
 * recorded, durably and under signature, that nothing was left for the sponsor
 * to complete — for a form whose IND-type and phase boxes are blank on every
 * render.
 *
 * The function's own doc comment already asserted this could not happen: "An
 * unsupported form id THROWS rather than answering [] — 'no boxes are left for
 * you' about a form nobody can produce is the fabricated clean answer this whole
 * change exists to remove." It threw only for an unknown id, never for a read or
 * verification failure.
 *
 * A form with genuinely no vendored asset still returns [] — that is the
 * legitimate case the comment describes, and the positive control below pins it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REAL_DIR = join(process.cwd(), 'templates', 'forms', 'acroforms');
let dir = '';
const saved = process.env.IND_FORM_TEMPLATES_DIR;

async function boxesFor(formId: string): Promise<string[]> {
  const mod = await import('../ind-form-fill-service');
  return mod.requiredBoxesLeftToSponsor(formId);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sponsor-boxes-'));
  cpSync(REAL_DIR, dir, { recursive: true });
  process.env.IND_FORM_TEMPLATES_DIR = dir;
});

afterEach(() => {
  if (saved === undefined) delete process.env.IND_FORM_TEMPLATES_DIR;
  else process.env.IND_FORM_TEMPLATES_DIR = saved;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('requiredBoxesLeftToSponsor distinguishes "none" from "unknown"', () => {
  it('answers the real boxes while the asset verifies (control)', async () => {
    // Fails if the fixture stops being an official-template form, which would
    // make every case below vacuous.
    expect(await boxesFor('FDA_1571')).toEqual(
      expect.arrayContaining(['ind_type', 'phase_of_study']),
    );
  });

  it('REFUSES rather than answering [] when the asset fails its digest check', async () => {
    const mp = join(dir, 'FDA_1571.pdf.manifest.json');
    const m = JSON.parse(readFileSync(mp, 'utf8'));
    m.sha256 = '0'.repeat(64);
    writeFileSync(mp, JSON.stringify(m, null, 2));

    await expect(
      boxesFor('FDA_1571'),
      'a tampered official asset reported "nothing left for the sponsor" onto a Part 11 row',
    ).rejects.toThrow();
  });

  it('REFUSES when the manifest is unreadable', async () => {
    writeFileSync(join(dir, 'FDA_1571.pdf.manifest.json'), '{ not json');
    await expect(boxesFor('FDA_1571')).rejects.toThrow();
  });

  it('REFUSES when the asset is present but its bytes are not a usable template', async () => {
    writeFileSync(join(dir, 'FDA_1571.pdf'), 'not a pdf at all');
    await expect(boxesFor('FDA_1571')).rejects.toThrow();
  });

  it('still answers [] for a form with genuinely NO vendored asset', async () => {
    // The legitimate empty case, and the reason this cannot simply throw
    // whenever officialTemplate is false. FDA_3455 is supported and unvendored.
    rmSync(join(dir, 'FDA_3455.pdf'), { force: true });
    rmSync(join(dir, 'FDA_3455.pdf.manifest.json'), { force: true });
    expect(await boxesFor('FDA_3455')).toEqual([]);
  });

  it('still throws for an unsupported form id', async () => {
    await expect(boxesFor('FDA_NOT_A_FORM')).rejects.toThrow();
  });
});

/**
 * The coverage report must not call a form backed that the renderer will refuse.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `officialFormAssetTrusted` has two branches and only one of them checks
 * integrity.
 *
 * The XFA branch (`xfaFillable`) mirrors the renderer: it re-hashes the bytes on
 * disk against `manifest.sha256` and requires an https fda.gov `sourceUrl`. Its
 * own comment says it exists so "this report cannot claim a form the renderer
 * would refuse, nor deny one it would fill."
 *
 * The AcroForm branch does none of that. It tested only
 * `assetTrusted && fillSupported && fieldMap-non-empty && reviewedBy` — four
 * manifest ASSERTIONS, no verification. The renderer's `readTemplate`
 * (server/services/ind-forms/ind-form-fill-service.ts:176-202) requires seven
 * things: formId match, a non-empty `version`, `reviewedBy`, a parseable
 * `reviewedAt`, an https fda.gov `sourceUrl`, `sha256` equal to the hash of the
 * bytes on disk, and a fieldMap whose every value is a non-empty string.
 *
 * So a manifest that merely CLAIMS trust — with a stale hash, a swapped PDF, a
 * non-FDA source, a missing edition, or a blank field path — made
 * `formsFullyBacked` report true for US_IND, US_NDA and US_BLA while every one
 * of those forms rendered as a labeled DRAFT. The report asserted the package
 * carries the official FDA form; the package carried a reconstruction.
 *
 * That is the same defect this file's sibling test closed for readiness tiers:
 * a report measuring an assertion instead of the thing the product does.
 *
 * These cases run against a COPY of the real assets in a temp directory
 * (IND_FORM_TEMPLATES_DIR), so a tampered manifest never touches the committed
 * ones.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REAL_DIR = join(process.cwd(), 'templates', 'forms', 'acroforms');
/**
 * A form vendored as a STATIC AcroForm with a reviewer — so it takes the
 * AcroForm branch, not the XFA fallback — AND named in a registry entry's
 * requiredArtifacts, so it is reachable through the public coverage surface.
 * FDA_1572 satisfies both: assetTrusted, 8-entry fieldMap, and `form_1572` is
 * required by US_IND.
 */
const ACRO_FORM = 'FDA_1572';
const FORM_NUMBER = '1572';
const VIA_ENTRY = 'US_IND';

let dir = '';
const savedEnv = process.env.IND_FORM_TEMPLATES_DIR;

/**
 * Driven through the PUBLIC coverage surface — the number an operator reads —
 * rather than the private predicate. `readFormManifest` re-reads the manifest
 * on every call, so no cache busting is needed.
 *
 * Throws rather than returning a default when the record is absent: a helper
 * that silently reports `false` would make every "refuses" case below pass
 * whatever the code did, which is how the first draft of this file proved
 * nothing.
 */
async function trustedForRequiredForm(): Promise<boolean> {
  const { getDocumentCoverage } = await import('../registryCoverage');
  const cov = getDocumentCoverage(VIA_ENTRY);
  if (!cov) throw new Error(`${VIA_ENTRY} missing from the registry`);
  const rec = cov.requiredForms.find((f) => f.formNumber === FORM_NUMBER);
  if (!rec) throw new Error(`${VIA_ENTRY} does not require form ${FORM_NUMBER} — pick another fixture`);
  return rec.officialAssetTrusted;
}

function manifestPath(formId: string): string {
  return join(dir, `${formId}.pdf.manifest.json`);
}
function readManifest(formId: string): Record<string, unknown> {
  return JSON.parse(readFileSync(manifestPath(formId), 'utf8'));
}
function writeManifest(formId: string, m: Record<string, unknown>): void {
  writeFileSync(manifestPath(formId), JSON.stringify(m, null, 2));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'acroform-parity-'));
  cpSync(REAL_DIR, dir, { recursive: true });
  process.env.IND_FORM_TEMPLATES_DIR = dir;
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.IND_FORM_TEMPLATES_DIR;
  else process.env.IND_FORM_TEMPLATES_DIR = savedEnv;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('the AcroForm trust branch verifies, it does not take the manifest at its word', () => {
  it('has the fixture it needs', () => {
    expect(existsSync(join(dir, `${ACRO_FORM}.pdf`)), `${ACRO_FORM}.pdf not vendored`).toBe(true);
    const m = readManifest(ACRO_FORM);
    expect(m.assetTrusted, 'fixture must start trusted or the cases below prove nothing').toBe(true);
    expect(String(m.reviewedBy ?? '')).not.toBe('');
  });

  it('refuses a manifest whose sha256 no longer matches the bytes on disk', async () => {
    const before = await trustedForRequiredForm();
    expect(before, 'fixture is not trusted to begin with').toBe(true);

    const m = readManifest(ACRO_FORM);
    m.sha256 = '0'.repeat(64);
    writeManifest(ACRO_FORM, m);

    expect(
      await trustedForRequiredForm(),
      'the report still calls the form backed after its bytes stopped matching the manifest — the renderer would emit a labeled draft',
    ).toBe(false);
  });

  it('refuses a source that is not an https fda.gov URL', async () => {
    const m = readManifest(ACRO_FORM);
    m.sourceUrl = 'https://example.invalid/forms';
    writeManifest(ACRO_FORM, m);

    expect(
      await trustedForRequiredForm(),
      'a form from a non-FDA source is reported as the official FDA edition',
    ).toBe(false);
  });

  it('refuses a manifest with no edition recorded', async () => {
    const m = readManifest(ACRO_FORM);
    delete m.version;
    writeManifest(ACRO_FORM, m);
    expect(await trustedForRequiredForm(), 'the renderer requires a version; the report did not').toBe(false);
  });

  it('refuses a field map with a blank target path', async () => {
    const m = readManifest(ACRO_FORM);
    const fm = { ...(m.fieldMap as Record<string, string>) };
    const firstKey = Object.keys(fm)[0];
    fm[firstKey] = '';
    m.fieldMap = fm;
    writeManifest(ACRO_FORM, m);
    expect(
      await trustedForRequiredForm(),
      'a map entry pointing at no field would place nothing, yet the form read as backed',
    ).toBe(false);
  });

  it('still trusts the untouched, genuinely-backed asset', async () => {
    // The positive control. Every case above tampers with one thing; if the
    // repair simply denied everything this would fail.
    expect(await trustedForRequiredForm(), 'a valid vendored form lost its backing').toBe(true);
  });
});

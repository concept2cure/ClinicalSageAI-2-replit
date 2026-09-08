/**
 * WHERE THE VENDORED OFFICIAL FDA FORM TEMPLATES LIVE — the single resolver.
 *
 * Two things read these files and they must never disagree about which files
 * they are:
 *   - the renderer (`ind-form-fill-service`: readTemplate / readXfaTemplate /
 *     readTemplateManifest / describeRenderPlan), which decides whether a
 *     sponsor receives the genuine FDA PDF or a labeled draft;
 *   - the coverage report (`regulatory/registry/registryCoverage`), whose
 *     `officialAssetTrusted` tells a product owner whether the official edition
 *     is installed at all.
 *
 * They used to resolve the directory separately, and both did it relative to
 * `process.cwd()`. That was two copies of one path, and when only one of them
 * was fixed the report started denying, off-root, the very assets the renderer
 * was filling from — while its own doc-comment claimed twice that the two read
 * "the same file, so this report and the renderer cannot disagree". One
 * resolver, imported by both, is what makes that sentence true.
 *
 * @module server/services/ind-forms/template-locations
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The repository root, found by walking up from THIS MODULE to the nearest
 * package.json. Under tsx and vitest that walk starts in
 * server/services/ind-forms/ and lands on the repo root; in production the
 * esbuild bundle is <root>/dist/index.js and `dist` carries no package.json of
 * its own, so it lands on the same place. Resolved once — the vendored assets
 * are a deployment artifact, not runtime-mutable state.
 */
export const PACKAGE_ROOT: string = ((): string => {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    // Nothing above declares a package: keep the previous cwd-relative
    // behaviour rather than throwing while the module is still loading.
    if (parent === dir) return process.cwd();
    dir = parent;
  }
})();

/**
 * The templates directory, as an ABSOLUTE path.
 *
 * WHY THIS IS NOT `path.join('templates', 'forms', 'acroforms')`: that is a
 * RELATIVE path, and `fs.readFile` resolves it against process.cwd(). Started
 * from any directory but the repository root — a unit file with a different
 * WorkingDirectory, a container entrypoint, a caller that chdir'd — every
 * template read missed, `readTemplate` and `readXfaTemplate` returned null from
 * their `catch`, and ALL FIVE vendored forms silently downgraded: 1571 and 3674
 * to a drawn reconstruction, 1572/3454/356h to a labeled draft. No error was
 * raised anywhere, so the only symptom was a sponsor receiving a drawing of FDA
 * 1571 instead of the FDA file — decided by the working directory.
 *
 * `IND_FORM_TEMPLATES_DIR` still overrides, and a relative override is resolved
 * against the CWD: that is the ordinary reading of a path an operator typed into
 * the environment, and it is how the test suites install a synthetic edition.
 * A non-string or empty override is ignored rather than resolved — `path.resolve`
 * of an empty string is the CWD, which would silently reinstate exactly the
 * cwd-relative behaviour this function exists to end.
 */
export function indFormTemplatesDir(): string {
  const override = process.env.IND_FORM_TEMPLATES_DIR;
  if (typeof override === 'string' && override.trim().length > 0) return path.resolve(override);
  return path.join(PACKAGE_ROOT, 'templates', 'forms', 'acroforms');
}

/** The vendored blank PDF for a form id. Its manifest is this path + `.manifest.json`. */
export function indFormTemplatePath(formId: string): string {
  return path.join(indFormTemplatesDir(), `${formId}.pdf`);
}

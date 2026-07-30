/**
 * Onboard an OFFICIAL FDA fillable form into the IND templates dir.
 *
 * The official FDA PDFs are AES-encrypted; pdf-lib cannot decrypt them, so this
 * one-time offline step decrypts (via pikepdf) and emits, next to the template,
 * a reviewed manifest that server/services/ind-forms/ind-form-fill-service.ts
 * (readTemplate) verifies before EVER using the asset:
 *   - sourceUrl on fda.gov over https
 *   - sha256 of the decrypted bytes
 *   - reviewedBy + reviewedAt + version
 *   - fieldMap (canonical id -> official AcroForm field name) from the reviewed
 *     source of truth, server/services/ind-forms/official-field-maps.ts
 *
 * Governance is required: without a real FDA sourceUrl, reviewer, and version
 * the manifest will not pass readTemplate (fail-closed), so this script refuses
 * to write a manifest that would masquerade as reviewed.
 *
 * Usage (run with the repo's tsx):
 *   FDA_FORM_SOURCE_URL="https://www.fda.gov/media/72981/download" \
 *   FDA_FORM_REVIEWER="jane.doe" FDA_FORM_VERSION="FDA 1572 (0924)" \
 *   npx tsx scripts/ind-forms/onboard-fda-form.ts FDA_1572 /path/to/FDA1572_secured.pdf
 *
 * Requires: python3 with pikepdf (`pip install pikepdf`).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { OFFICIAL_FIELD_MAPS } from '../../server/services/ind-forms/official-field-maps';

function fail(msg: string): never {
  console.error(`onboard-fda-form: ${msg}`);
  process.exit(2);
}

const [, , formId, encryptedPath, outDirArg] = process.argv;
if (!formId || !encryptedPath) {
  fail('usage: tsx scripts/ind-forms/onboard-fda-form.ts <FORM_ID> <encrypted.pdf> [outDir]');
}

const fieldMap = OFFICIAL_FIELD_MAPS[formId];
if (!fieldMap) {
  fail(`no reviewed field map for ${formId} in official-field-maps.ts (AcroForm forms only)`);
}

const sourceUrl = process.env.FDA_FORM_SOURCE_URL ?? '';
const reviewedBy = process.env.FDA_FORM_REVIEWER ?? '';
const version = process.env.FDA_FORM_VERSION ?? '';
try {
  const u = new URL(sourceUrl);
  if (u.protocol !== 'https:' || !(u.hostname === 'fda.gov' || u.hostname.endsWith('.fda.gov'))) {
    fail('FDA_FORM_SOURCE_URL must be an https URL on fda.gov (governance: asset provenance)');
  }
} catch {
  fail('FDA_FORM_SOURCE_URL must be a valid https fda.gov URL');
}
if (!reviewedBy) fail('FDA_FORM_REVIEWER is required (governance: who reviewed the asset)');
if (!version) fail('FDA_FORM_VERSION is required (governance: FDA edition, e.g. "FDA 1572 (0924)")');

const outDir = outDirArg || path.join('templates', 'forms', 'acroforms');
mkdirSync(outDir, { recursive: true });
const outPdf = path.join(outDir, `${formId}.pdf`);

// Decrypt via pikepdf — Node/pdf-lib cannot decrypt AES.
const pyDecrypt = 'import pikepdf,sys; pikepdf.open(sys.argv[1]).save(sys.argv[2])';
const r = spawnSync('python3', ['-c', pyDecrypt, encryptedPath, outPdf], { stdio: 'inherit' });
if (r.status !== 0) {
  fail('pikepdf decrypt failed — install it with `pip install pikepdf`');
}

const bytes = readFileSync(outPdf);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const manifest = { formId, version, sourceUrl, sha256, reviewedBy, reviewedAt: new Date().toISOString(), fieldMap };
writeFileSync(`${outPdf}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Onboarded ${formId}:`);
console.log(`  template: ${outPdf}`);
console.log(`  manifest: ${outPdf}.manifest.json (sha256 ${sha256.slice(0, 12)}…, ${Object.keys(fieldMap).length} mapped fields)`);

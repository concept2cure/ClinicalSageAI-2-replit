/**
 * FDA form acquisition job — "pull the official forms from the FDA website".
 *
 * This is the network-enabled ingestion step required by
 * `docs/audits/FDA_FORMS_IMPLEMENTATION_AUDIT_2026-07-29.md` (findings F-01/F-02)
 * and by `docs/FDA_FORMS_FRAMEWORK.md`. For each reviewer-verified form in the
 * candidate catalog snapshot it:
 *   1. downloads the official PDF from its fda.gov URL,
 *   2. verifies the response is actually a PDF,
 *   3. computes the SHA-256,
 *   4. writes `templates/forms/acroforms/<FORM_ID>.pdf` and a sibling
 *      `<FORM_ID>.pdf.manifest.json` (the sidecar the IND PDF engine requires).
 *
 * FAIL-CLOSED CONTRACT (do not weaken):
 *   - It NEVER fabricates a checksum, a source, or a `reviewedBy`.
 *   - It refuses to fetch a form whose `directDownloadUrl` is unset or whose
 *     `verified` flag is false (unless `--allow-unverified`, which still writes
 *     an explicitly untrusted manifest).
 *   - It only writes an asset for a response whose bytes are a real PDF from an
 *     https fda.gov URL.
 *   - The written manifest is marked `assetTrusted: false` with an empty
 *     `fieldMap`: per the framework, a human must complete the canonical→AcroForm
 *     field map and reviewer sign-off before the renderer will use the asset over
 *     the watermarked draft. This job acquires; it does not bless.
 *   - On an egress/proxy denial it reports the blocked host (per the agent-proxy
 *     README) and exits non-zero WITHOUT writing partial output.
 *
 * Usage:
 *   tsx scripts/fetch-fda-forms.ts                 # reconcile + fetch verified forms
 *   tsx scripts/fetch-fda-forms.ts --reconcile-only
 *   tsx scripts/fetch-fda-forms.ts --allow-unverified   # dev only; writes untrusted manifests
 *
 * @module scripts/fetch-fda-forms
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  FDA_FORMS_CANDIDATE_SNAPSHOT,
  reconcileCandidateSnapshot,
  isSnapshotReviewed,
} from '../server/config/fdaFormsCatalogSnapshot.js';

const RECONCILE_ONLY = process.argv.includes('--reconcile-only');
const ALLOW_UNVERIFIED = process.argv.includes('--allow-unverified');

const OUT_DIR = process.env.IND_FORM_TEMPLATES_DIR
  ? path.resolve(process.env.IND_FORM_TEMPLATES_DIR)
  : path.resolve('templates/forms/acroforms');

const log = (s = '') => process.stdout.write(s + '\n');

function isFdaHttpsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'fda.gov' || u.hostname.endsWith('.fda.gov'));
  } catch {
    return false;
  }
}

/** Best-effort: route Node's fetch through the agent proxy when one is configured. */
async function installProxyDispatcher(): Promise<void> {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy) return;
  try {
    const undici = (await import('undici')) as typeof import('undici');
    undici.setGlobalDispatcher(new undici.ProxyAgent(proxy));
    log(`Using outbound proxy ${proxy}`);
  } catch {
    log('undici ProxyAgent unavailable; relying on native fetch proxy support (set NODE_USE_ENV_PROXY=1 on Node ≥22.21).');
  }
}

interface FetchOutcome {
  formId: string;
  status: 'written' | 'skipped' | 'failed';
  detail: string;
}

async function acquire(form: (typeof FDA_FORMS_CANDIDATE_SNAPSHOT)[number]): Promise<FetchOutcome> {
  if (!form.directDownloadUrl) {
    return { formId: form.formId, status: 'skipped', detail: 'no directDownloadUrl (reviewer must resolve the current PDF URL from the FDA catalog)' };
  }
  if (!isFdaHttpsUrl(form.directDownloadUrl)) {
    return { formId: form.formId, status: 'failed', detail: `directDownloadUrl is not an https fda.gov URL: ${form.directDownloadUrl}` };
  }
  if (!form.verified && !ALLOW_UNVERIFIED) {
    return { formId: form.formId, status: 'skipped', detail: 'verified=false (re-run with --allow-unverified to write an explicitly untrusted asset)' };
  }

  let res: Response;
  try {
    res = await fetch(form.directDownloadUrl, { redirect: 'follow', headers: { accept: 'application/pdf' } });
  } catch (err) {
    const host = new URL(form.directDownloadUrl).hostname;
    throw new EgressError(host, err instanceof Error ? err.message : String(err));
  }
  if (!res.ok) {
    if (res.status === 403 || res.status === 407) {
      throw new EgressError(new URL(form.directDownloadUrl).hostname, `HTTP ${res.status} from egress proxy`);
    }
    return { formId: form.formId, status: 'failed', detail: `HTTP ${res.status} fetching ${form.directDownloadUrl}` };
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  const isPdf = bytes.subarray(0, 5).toString('latin1') === '%PDF-';
  if (!isPdf) {
    return { formId: form.formId, status: 'failed', detail: `response was not a PDF (content-type ${res.headers.get('content-type') ?? 'unknown'}); the URL likely points at an HTML page, not the form asset` };
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await mkdir(OUT_DIR, { recursive: true });
  const pdfPath = path.join(OUT_DIR, `${form.formId}.pdf`);
  const manifestPath = `${pdfPath}.manifest.json`;
  await writeFile(pdfPath, bytes);
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        formId: form.formId,
        formNumber: form.formNumber,
        version: 'unverified',
        sourceUrl: form.directDownloadUrl,
        sha256,
        retrievedAt: new Date().toISOString(),
        reviewedBy: null,
        reviewedAt: null,
        assetTrusted: false,
        fieldMap: {},
        note: 'Acquired by scripts/fetch-fda-forms.ts. Not trusted for rendering until a reviewer completes fieldMap (canonical field IDs → AcroForm field names), sets reviewedBy/reviewedAt, and flips assetTrusted. Until then the IND PDF engine uses the watermarked draft path.',
      },
      null,
      2,
    ),
  );
  return { formId: form.formId, status: 'written', detail: `${bytes.length} bytes, sha256 ${sha256.slice(0, 16)}… → ${path.relative(process.cwd(), pdfPath)}` };
}

class EgressError extends Error {
  constructor(public host: string, public reason: string) {
    super(`egress to ${host} blocked: ${reason}`);
  }
}

async function main(): Promise<void> {
  log('── FDA catalog reconciliation (candidate snapshot vs. registry) ──');
  const rec = reconcileCandidateSnapshot();
  log(`  catalog entries : ${rec.catalogEntries}`);
  log(`  registry entries: ${rec.registryEntries}`);
  log(`  missing from registry     : ${rec.missingFromRegistry.map((m) => m.formNumber).join(', ') || 'none'}`);
  log(`  registry not in snapshot  : ${rec.registryEntriesNotInSnapshot.join(', ') || 'none'}`);
  log(`  duplicate catalog numbers : ${rec.duplicateCatalogNumbers.join(', ') || 'none'}`);
  log(`  invalid source URLs       : ${rec.invalidSourceUrls.join(', ') || 'none'}`);
  log(`  reconciled (number-level) : ${rec.reconciled}`);
  log(`  snapshot reviewer-verified: ${isSnapshotReviewed()}`);
  log('');
  log('  NOTE: reconciled=true here means registry↔candidate NUMBERS align. It does');
  log('  NOT mean the catalog is current or that official assets are installed.');
  log('  Release remains blocked until URLs are verified against the live FDA catalog');
  log('  and official AcroForm assets are installed with a complete, reviewed fieldMap.');
  log('');

  if (RECONCILE_ONLY) return;

  log('── Acquisition ───────────────────────────────────────────────────');
  await installProxyDispatcher();

  const outcomes: FetchOutcome[] = [];
  let egressBlocked: EgressError | null = null;
  for (const form of FDA_FORMS_CANDIDATE_SNAPSHOT) {
    try {
      outcomes.push(await acquire(form));
    } catch (err) {
      if (err instanceof EgressError) {
        egressBlocked = err;
        break;
      }
      throw err;
    }
  }

  for (const o of outcomes) {
    const icon = o.status === 'written' ? '✓' : o.status === 'skipped' ? '·' : '✗';
    log(`  ${icon} ${o.formId.padEnd(10)} ${o.status.padEnd(8)} ${o.detail}`);
  }
  log('');

  if (egressBlocked) {
    log('── BLOCKED ────────────────────────────────────────────────────────');
    log(`  Outbound egress to "${egressBlocked.host}" was denied (${egressBlocked.reason}).`);
    log('  This environment enforces a GxP egress boundary; FDA hosts are not on the');
    log('  allowlist. Per /root/.ccr/README.md, do not route around it — report it.');
    log('  Run this job from an environment whose egress policy permits fda.gov, or');
    log('  have a reviewer download the forms manually and install them under');
    log(`  ${path.relative(process.cwd(), OUT_DIR)}/ with matching .manifest.json sidecars.`);
    process.exitCode = 2;
    return;
  }

  const written = outcomes.filter((o) => o.status === 'written').length;
  const skipped = outcomes.filter((o) => o.status === 'skipped').length;
  const failed = outcomes.filter((o) => o.status === 'failed').length;
  log(`Acquired ${written} asset(s); ${skipped} skipped; ${failed} failed.`);
  if (written === 0) {
    log('No verified direct download URLs are set on the candidate snapshot yet, so');
    log('nothing was acquired. Add reviewer-verified `directDownloadUrl` values (from');
    log('https://www.fda.gov/about-fda/forms) to server/config/fdaFormsCatalogSnapshot.ts');
    log('and re-run in a network-enabled environment.');
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  log(`fetch-fda-forms failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});

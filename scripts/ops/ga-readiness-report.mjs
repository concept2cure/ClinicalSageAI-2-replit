#!/usr/bin/env node
/**
 * ga-readiness-report.mjs — machine-checkable status of every GA blocker in
 * docs/GA_OPS_PROCUREMENT_RUNBOOK_2026-08.md.
 *
 * The runbook is the prose; this is the probe. It answers, in one command and
 * without a database, "which GA blockers are still outstanding right now?" by
 * observing ONLY what it can see: files on disk, bytes in tracked source, and
 * the current process environment.
 *
 * Scope vs. the sibling script: `scripts/ops/submission-preflight.mjs` covers
 * the three licensed-artifact drop-points (eCTD DTDs, eSTAR templates, agency
 * validator URLs). This one covers the WHOLE GA blocker set — those artifacts
 * plus the eSTAR field maps, the eCTD v4.0 RPS schema, the enforcement flags,
 * the 13 gateway credential sets, the licensed coding dictionaries, the ICSR
 * gateway, the boot-posture secrets, and the CI coverage gate. Run both.
 *
 * Design contract (mirrors scripts/ops/pilot-go-no-go.mjs):
 *   • HONEST-BY-CONSTRUCTION. Every row states what was OBSERVED, not what was
 *     assumed. Nothing is ever reported ready on the strength of a comment, a
 *     doc, or an intention. A probe that cannot observe its subject reports
 *     `unknown`, never `ready`.
 *   • Secret VALUES are never printed — only which env vars are set, and for
 *     length-checked secrets their length.
 *   • Severity is declared per row. `blocker` rows drive the exit code;
 *     `advisory` rows surface posture but never block on their own.
 *   • Read-only: no network, no database, no writes.
 *
 * Usage:
 *   node scripts/ops/ga-readiness-report.mjs            # human-readable table
 *   node scripts/ops/ga-readiness-report.mjs --json     # machine-readable
 *   node scripts/ops/ga-readiness-report.mjs --all      # include ready rows in text mode
 *
 * Exit code: 0 when every `blocker` row is ready, 1 otherwise. Advisory rows
 * never change the exit code.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = process.env;

const JSON_MODE = process.argv.includes('--json');
const SHOW_ALL = process.argv.includes('--all');

/* ── observation helpers ─────────────────────────────────────────────────── */

/** Filenames in a directory; [] when absent. Never throws. */
function listDir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/** File contents, or null when unreadable. Never throws. */
function readFile(rel) {
  try {
    return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  } catch {
    return null;
  }
}

/** True when an env var is set to a non-blank value. */
function isSet(name) {
  return (env[name] ?? '').trim() !== '';
}

/** Which of these env vars are missing. */
function missingVars(names) {
  return names.filter((n) => !isSet(n));
}

/** Lowercased trimmed env value. */
function flag(name) {
  return (env[name] ?? '').trim().toLowerCase();
}

/* ── the expected artifact sets ──────────────────────────────────────────── */
/* Duplicated from the TS sources deliberately: this script must run with no
   build step. Each constant names the TS module it mirrors so drift is
   traceable; `tests/ops/submission-preflight.test.mjs` already pins the DTD +
   template lists against those sources. */

// server/services/ectd/dtd-bundler.ts — ICH_BACKBONE_DTD + REGIONAL_DTD
const REQUIRED_DTDS = [
  'ich-ectd-3-2.dtd',
  'us-regional-v3-3.dtd',
  'eu-regional.dtd',
  'jp-regional.dtd',
  'ca-regional.dtd',
];

// server/services/pathway-engines/estar/estar-template-registry.ts — ESTAR_TEMPLATE_MANIFEST
const ESTAR_DESCRIPTORS = [
  { id: '510k-device', file: 'eSTAR-510k-non-ivd.pdf' },
  { id: '510k-ivd', file: 'eSTAR-510k-ivd.pdf' },
  // De Novo and PMA are filed on the SAME two FDA PDFs as the 510(k): FDA ships
  // one nIVD and one IVD eSTAR, each carrying all three marketing pathways.
  // These four named eSTAR-denovo-*/eSTAR-pma-* until 2026-09-04, which asked
  // procurement for files FDA does not publish and reported the two pathways
  // blocked while they were producing.
  { id: 'de_novo-device', file: 'eSTAR-510k-non-ivd.pdf' },
  { id: 'de_novo-ivd', file: 'eSTAR-510k-ivd.pdf' },
  { id: 'pma-device', file: 'eSTAR-510k-non-ivd.pdf' },
  { id: 'pma-ivd', file: 'eSTAR-510k-ivd.pdf' },
  { id: 'q_sub-prestar', file: 'PreSTAR-q-sub.pdf' },
  { id: 'ide-prestar', file: 'PreSTAR-ide.pdf' },
  { id: '513g-prestar', file: 'PreSTAR-513g.pdf' },
];

// server/services/fda-recognized-standards/recognized-standards-dataset.ts —
// RECOGNIZED_STANDARDS_DEFAULT_DIR + RECOGNIZED_STANDARDS_DATASET_FILE.
const RECOGNIZED_STANDARDS_DIR = 'assets/fda-recognized-standards';
const RECOGNIZED_STANDARDS_FILE = 'fda-recognized-consensus-standards.json';

// server/services/submission-gateways/index.ts — REGISTRY, and each gateway's
// credential preflight (the vars whose absence throws CredentialError).
const GATEWAY_CREDENTIALS = [
  { key: 'fda:esg', label: 'FDA ESG (AS2/SFTP)', vars: ['FDA_ESG_URL', 'FDA_ESG_AS2_FROM', 'FDA_ESG_CERT_PATH', 'FDA_ESG_KEY_PATH', 'FDA_ESG_FDA_CERT_PATH'] },
  { key: 'ema:cesp', label: 'EMA CESP', vars: ['EMA_CESP_URL', 'EMA_CESP_CLIENT_ID', 'EMA_CESP_CLIENT_SECRET', 'EMA_CESP_ORG_ID'] },
  { key: 'ema:eudamed', label: 'EUDAMED', vars: ['EUDAMED_URL', 'EUDAMED_BEARER'] },
  { key: 'pmda:pmda_gateway', label: 'PMDA gateway', vars: ['PMDA_URL', 'PMDA_APPLICANT_ID', 'PMDA_CERT_PATH', 'PMDA_KEY_PATH', 'PMDA_HMAC_SECRET'] },
  { key: 'ca:hc_cesg', label: 'Health Canada CESG', vars: ['HC_CESG_URL', 'HC_CESG_COMPANY_ID', 'HC_CESG_CERT_PATH', 'HC_CESG_KEY_PATH', 'HC_CESG_HMAC_SECRET'] },
  { key: 'uk:mhra_gateway', label: 'MHRA gateway', vars: ['MHRA_URL', 'MHRA_API_KEY', 'MHRA_ORG_ID'] },
  { key: 'cn:nmpa_gateway', label: 'NMPA gateway', vars: ['NMPA_URL', 'NMPA_TOKEN', 'NMPA_COMPANY_ID'] },
  { key: 'au:tga_ebs', label: 'TGA eBS', vars: ['TGA_EBS_URL', 'TGA_EBS_API_KEY', 'TGA_EBS_SPONSOR_ID'] },
  { key: 'ch:swissmedic_egateway', label: 'Swissmedic eGov', vars: ['SWISSMEDIC_URL', 'SWISSMEDIC_API_KEY', 'SWISSMEDIC_HOLDER_ID'] },
  { key: 'br:anvisa_gateway', label: 'ANVISA gateway', vars: ['ANVISA_URL', 'ANVISA_TOKEN', 'ANVISA_COMPANY_ID'] },
  { key: 'in:cdsco_sugam', label: 'CDSCO SUGAM', vars: ['CDSCO_URL', 'CDSCO_API_KEY', 'CDSCO_SESSION_TOKEN', 'CDSCO_APPLICANT_ID'] },
  { key: 'kr:mfds_dbio', label: 'MFDS dBIO', vars: ['MFDS_URL', 'MFDS_COMPANY_ID', 'MFDS_CERT_PATH', 'MFDS_KEY_PATH', 'MFDS_HMAC_SECRET'] },
  { key: 'sg:hsa_prism', label: 'HSA PRISM', vars: ['HSA_URL', 'HSA_API_KEY', 'HSA_HMAC_SECRET', 'HSA_ORG_ID'] },
];

/* ── probes ──────────────────────────────────────────────────────────────── */

const rows = [];

/**
 * @param {object} r
 * @param {string} r.id            stable identifier (matches the runbook table)
 * @param {string} r.group         report section
 * @param {string} r.label         what the thing is
 * @param {'ready'|'blocked'|'unknown'} r.status
 * @param {'blocker'|'advisory'} r.severity
 * @param {string} r.observed      what this run actually saw
 * @param {string} r.gate          the code gate that enforces it (file + env flag)
 * @param {string} r.owner         who unblocks it
 * @param {string} [r.unblock]     the action that flips it to ready
 */
function record(r) {
  rows.push({ unblock: '', ...r });
}

// ── 1. Licensed agency artifacts ────────────────────────────────────────────

{
  const dir = env.ESTAR_TEMPLATE_DIR || path.join(repoRoot, 'assets/estar-templates');
  const present = new Set(listDir(dir).map((f) => f.toLowerCase()));
  const missing = ESTAR_DESCRIPTORS.filter((d) => !present.has(d.file.toLowerCase()));
  record({
    id: 'estar-templates',
    group: 'Licensed agency artifacts',
    label: 'Official FDA eSTAR / PreSTAR interactive PDFs',
    status: missing.length === 0 ? 'ready' : 'blocked',
    severity: 'blocker',
    observed: `${ESTAR_DESCRIPTORS.length - missing.length}/${ESTAR_DESCRIPTORS.length} vendored in ${dir}` +
      (missing.length ? ` — missing: ${missing.map((m) => m.file).join(', ')}` : ''),
    gate: 'server/services/pathway-engines/estar/estar-fill.ts resolveTemplateBytes + estar-template-registry.ts assessEstarTemplateReadiness (ESTAR_REQUIRE_TEMPLATE)',
    owner: 'Procurement / Regulatory Ops',
    unblock: 'Download the current eSTAR templates from FDA and drop them at the paths above.',
  });
}

{
  const src = readFile('server/services/pathway-engines/estar/estar-field-map.ts');
  if (src === null) {
    record({
      id: 'estar-field-maps',
      group: 'Licensed agency artifacts',
      label: 'eSTAR canonical → AcroForm field maps',
      status: 'unknown',
      severity: 'blocker',
      observed: 'estar-field-map.ts could not be read',
      gate: 'server/services/pathway-engines/estar/estar-fill.ts isFieldMapPopulated',
      owner: 'Engineering (Regulatory pathway)',
    });
  } else {
    // Look at the ESTAR_FIELD_MAPS literal only, and treat `'<id>': {}` — with
    // any inner whitespace — as empty. Comments elsewhere in the file cannot
    // affect this because we match on the descriptor key.
    const body = src.slice(src.indexOf('ESTAR_FIELD_MAPS'));
    const empty = ESTAR_DESCRIPTORS.filter((d) =>
      new RegExp(`['"]${d.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*:\\s*\\{\\s*\\}`).test(body),
    );
    record({
      id: 'estar-field-maps',
      group: 'Licensed agency artifacts',
      label: 'eSTAR canonical → AcroForm field maps',
      status: empty.length === 0 ? 'ready' : 'blocked',
      severity: 'blocker',
      observed: `${ESTAR_DESCRIPTORS.length - empty.length}/${ESTAR_DESCRIPTORS.length} descriptor maps populated` +
        (empty.length ? ` — empty: ${empty.map((d) => d.id).join(', ')}` : ''),
      gate: 'server/services/pathway-engines/estar/estar-field-map.ts ESTAR_FIELD_MAPS; enforced by estar-fill.ts (blockers) and GET /api/510k/estar/readiness',
      owner: 'Engineering (Regulatory pathway), after Procurement vendors the PDF',
      unblock: 'POST /api/510k/estar/scaffold-field-map, verify each key against the real AcroForm, then populate estar-field-map.ts.',
    });
  }
}

{
  const dir = env.ECTD_DTD_DIR || path.join(repoRoot, 'assets/ectd-dtd');
  const present = new Set(listDir(dir).map((f) => f.toLowerCase()));
  const missing = REQUIRED_DTDS.filter((f) => !present.has(f.toLowerCase()));
  record({
    id: 'ectd-dtds',
    group: 'Licensed agency artifacts',
    label: 'eCTD v3.2.2 DTDs (ICH backbone + 4 regional)',
    status: missing.length === 0 ? 'ready' : 'blocked',
    severity: 'blocker',
    observed: `${REQUIRED_DTDS.length - missing.length}/${REQUIRED_DTDS.length} vendored in ${dir}` +
      (missing.length ? ` — missing: ${missing.join(', ')}` : ''),
    gate: 'server/services/ectd/dtd-bundler.ts assessDtdReadiness (ECTD_REQUIRE_DTD); DOCTYPEs emitted by regional-packager.ts',
    owner: 'Procurement / Regulatory Ops (acquire) + Engineering (commit + checksums)',
    unblock: 'Acquire from ICH/FDA/EMA/PMDA/HC, commit verbatim, record SHA-256 in assets/ectd-dtd/checksums.txt.',
  });

  // The checksum manifest is only comment lines until a real acquisition lands.
  const manifest = readFile('assets/ectd-dtd/checksums.txt') ?? '';
  const entries = manifest
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  record({
    id: 'ectd-dtd-checksums',
    group: 'Licensed agency artifacts',
    label: 'eCTD DTD SHA-256 manifest (assets/ectd-dtd/checksums.txt)',
    status: entries.length >= REQUIRED_DTDS.length ? 'ready' : 'blocked',
    severity: 'blocker',
    observed: `${entries.length} non-comment manifest entr${entries.length === 1 ? 'y' : 'ies'} (expected ${REQUIRED_DTDS.length})`,
    gate: 'server/services/ectd/checksum-manifest.ts verifyChecksumManifest — the qualification harness (qualify.ts) fails on an unrecorded or tampered vendored file',
    owner: 'Engineering (same commit as the DTD drop)',
    unblock: 'cd assets/ectd-dtd && sha256sum *.dtd >> checksums.txt (replacing the placeholder block).',
  });
}

{
  // schema-bundler.ts requiredSchemasForVersion('v4.0') === [RPS_MESSAGE_XSD].
  // genericode.xsd is accepted-and-bundled but not required, so it is reported
  // alongside rather than counted as a blocker.
  const dir = env.ECTD_SCHEMA_DIR || path.join(repoRoot, 'assets/ectd-schema');
  const present = new Set(listDir(dir).map((f) => f.toLowerCase()));
  const hasRps = present.has('rps-message.xsd');
  record({
    id: 'ectd-v4-rps-schema',
    group: 'Licensed agency artifacts',
    label: 'eCTD v4.0 RPS message XSD (rps-message.xsd)',
    status: hasRps ? 'ready' : 'blocked',
    severity: 'blocker',
    observed: `rps-message.xsd ${hasRps ? 'vendored' : 'absent'} in ${dir}` +
      ` (genericode.xsd, optional: ${present.has('genericode.xsd') ? 'present' : 'absent'})`,
    gate: 'server/services/ectd/schema-bundler.ts requiredSchemasForVersion + assessSchemaReadiness (ECTD_REQUIRE_RPS_SCHEMA)',
    owner: 'Procurement (ICH implementation package licence)',
    unblock: 'Obtain the ICH eCTD v4.0 implementation package; drop rps-message.xsd in and record its SHA-256 in assets/ectd-schema/checksums.txt.',
  });
}

{
  // FDA recognized consensus standards. openFDA has no endpoint for this, so
  // the mapping can only come from a vendored FDA export. Observed by reading
  // the file the loader reads and validating the same two things the loader
  // treats as load-bearing: a provenance block and at least one record. The
  // probe deliberately does NOT re-implement the loader's full record
  // validation — it would drift. It reports presence and gross usability; the
  // loader is the authority, and its verdict is visible in the route response.
  const dir = env.FDA_RECOGNIZED_STANDARDS_DIR || path.join(repoRoot, RECOGNIZED_STANDARDS_DIR);
  const file = path.join(dir, RECOGNIZED_STANDARDS_FILE);

  let status = 'blocked';
  let observed;
  if (!fs.existsSync(file)) {
    observed = `${RECOGNIZED_STANDARDS_FILE} absent in ${dir} — no product-code → standards mapping is possible`;
  } else {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      const records = Array.isArray(parsed?.standards) ? parsed.standards : null;
      const listNo = parsed?.provenance?.recognitionListNumber;
      if (records === null) {
        observed = `${file} parsed but has no "standards" array`;
      } else if (records.length === 0) {
        observed = `${file} parsed but "standards" is empty`;
      } else if (typeof listNo !== 'string' || listNo.trim() === '') {
        observed = `${file} holds ${records.length} record(s) but no provenance.recognitionListNumber — the loader rejects an unprovenanced list`;
      } else {
        const codes = new Set();
        for (const r of records) {
          if (Array.isArray(r?.productCodes)) for (const c of r.productCodes) codes.add(String(c).toUpperCase());
        }
        status = 'ready';
        observed = `${records.length} recognition record(s) across ${codes.size} product code(s), FDA Recognition List ${listNo.trim()}, in ${dir}`;
      }
    } catch (err) {
      observed = `${file} is present but unreadable or not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  record({
    id: 'fda-recognized-standards',
    group: 'Licensed agency artifacts',
    label: 'FDA recognized consensus standards dataset (product code → standards)',
    status,
    // Advisory, not blocker: a 510(k) can be filed with standards identified by
    // hand. Absence costs the intake-time mapping competitors surface, not the
    // filing itself, and marking it `blocker` would dilute the set that gates
    // the deploy pipeline exit code.
    severity: 'advisory',
    observed,
    gate: "server/services/fda-recognized-standards/recognized-standards-dataset.ts loadRecognizedStandardsDataset — a missing or malformed dataset is reported ABSENT (never partially loaded); recognized-standards.service.ts returns available:false and GET /api/510k/device/standards passes that through labelled",
    owner: 'Procurement / Regulatory Ops (acquire + normalize the FDA export)',
    unblock:
      'Export the CDRH Recognized Consensus Standards database, normalize it into the documented shape with a provenance block, and drop it at the path above. Never infer a product-code association FDA does not publish — see assets/fda-recognized-standards/README.md.',
  });
}

// ── 2. Licensed engines and dictionaries ────────────────────────────────────

{
  const configured = isSet('EVALIDATOR_BINARY') || isSet('EVALIDATOR_ENDPOINT');
  const fallback = flag('EVALIDATOR_USE_FDA_CRITERIA_FALLBACK') === 'true';
  record({
    id: 'evalidator-licence',
    group: 'Licensed engines & dictionaries',
    label: 'Agency-grade eCTD validator (LORENZ eValidator)',
    status: configured ? 'ready' : 'blocked',
    severity: 'blocker',
    observed: configured
      ? 'EVALIDATOR_BINARY/EVALIDATOR_ENDPOINT set'
      : `neither EVALIDATOR_BINARY nor EVALIDATOR_ENDPOINT set; licence-free FDA-criteria fallback ${fallback ? 'ENABLED' : 'disabled'}`,
    gate: 'server/services/ectd/external-validator/gate.ts evaluateExternalValidationGate (ECTD_REQUIRE_EVALIDATOR); config.ts evalidatorBinary',
    owner: 'Procurement (licence) + Ops (deploy the engine)',
    unblock: 'Buy the licence, install the engine, set EVALIDATOR_BINARY/EVALIDATOR_ENDPOINT + EVALIDATOR_PROFILE_<REGION>.',
  });
}

for (const [id, label, varName, module] of [
  ['meddra-licence', 'MedDRA dictionary', 'MEDDRA_DICTIONARY_PATH', 'server/services/medical-coding/medical-coding-service.ts codeMeddra'],
  ['whodrug-licence', 'WHODrug dictionary', 'WHODRUG_DICTIONARY_PATH', 'server/services/medical-coding/medical-coding-service.ts codeWhodrug (line 302)'],
]) {
  const set = isSet(varName);
  const exists = set ? fs.existsSync(env[varName]) : false;
  record({
    id,
    group: 'Licensed engines & dictionaries',
    label: `${label} (licensed)`,
    status: set && exists ? 'ready' : 'blocked',
    severity: 'blocker',
    observed: !set ? `${varName} not set` : exists ? `${varName} set, file present` : `${varName} set but the path does not exist`,
    gate: `${module} — returns status:'license_required' and no code when unset`,
    owner: 'Procurement (MSSO / UMC subscription)',
    unblock: `Licence the dictionary, export it to the documented row shape, point ${varName} at it.`,
  });
}

// ── 3. Agency credentials ───────────────────────────────────────────────────

for (const gw of GATEWAY_CREDENTIALS) {
  const missing = missingVars(gw.vars);
  record({
    id: `gateway:${gw.key}`,
    group: 'Agency gateway credentials (production)',
    label: gw.label,
    status: missing.length === 0 ? 'ready' : 'blocked',
    // Only FDA ESG is on a GA critical path; the rest are per-market expansion.
    severity: gw.key === 'fda:esg' ? 'blocker' : 'advisory',
    observed: missing.length === 0 ? `all ${gw.vars.length} credential vars set` : `missing: ${missing.join(', ')}`,
    gate: 'server/services/submission-gateways/*.ts credential preflight → CredentialError; surfaced by gatewayConfigurationStatus()',
    owner: 'Regulatory Ops (agency account) + Ops (secrets manager)',
    unblock: 'Register with the agency, obtain the credentials, load them into the production secrets manager.',
  });
}

{
  const url = isSet('ICSR_GATEWAY_URL');
  const creds = isSet('ICSR_GATEWAY_PASSWORD') || isSet('ICSR_GATEWAY_CERT_PATH');
  record({
    id: 'icsr-gateway',
    group: 'Agency gateway credentials (production)',
    label: 'E2B(R3) ICSR gateway',
    status: 'blocked',
    severity: 'advisory',
    observed:
      `ICSR_GATEWAY_URL ${url ? 'set' : 'not set'}, credentials ${creds ? 'set' : 'not set'} — ` +
      'NOTE: credentials alone do not unblock this; the transport client itself is not implemented',
    gate: 'server/services/ind-lifecycle/icsr-gateway-transport.ts transmitIcsr — throws "transport client is not implemented" whenever a gateway IS configured',
    owner: 'Engineering (build the AS2/SFTP client) + Regulatory Ops (credentials)',
    unblock: 'Implement the ICSR transport client, THEN provision ICSR_GATEWAY_URL + password/cert.',
  });
}

// ── 4. Production enforcement flags ─────────────────────────────────────────

const ENFORCEMENT_FLAGS = [
  {
    id: 'flag-rls', label: 'RLS enforcement', varName: 'RLS_ENFORCE', wanted: 'on', severity: 'blocker',
    gate: 'server/db/rlsEnforcement.ts assertRlsEnforcementForProduction — production REFUSES TO BOOT on any other value',
    unblock: 'Set RLS_ENFORCE=on. The policies are already provisioned by migration 0021 and the two-tenant probe is green; this only flips them from compiled to filtering.',
  },
  {
    id: 'flag-estar-template', label: 'eSTAR template enforcement', varName: 'ESTAR_REQUIRE_TEMPLATE', wanted: 'true', severity: 'blocker',
    gate: 'server/services/pathway-engines/estar/estar-template-registry.ts estarTemplateRequiredFromEnv → assessEstarTemplateReadiness',
    unblock: 'Set ESTAR_REQUIRE_TEMPLATE=true ONLY after the eSTAR PDFs are vendored — set earlier and every production eSTAR build reports a blocker.',
  },
  {
    id: 'flag-dtd', label: 'eCTD DTD self-containment enforcement', varName: 'ECTD_REQUIRE_DTD', wanted: 'true', severity: 'blocker',
    gate: 'server/services/ectd/dtd-bundler.ts dtdRequiredFromEnv → assessDtdReadiness',
    unblock: 'Set ECTD_REQUIRE_DTD=true ONLY after the DTDs are vendored + checksummed — set earlier and every production eCTD package is blocked as not self-contained.',
  },
  {
    id: 'flag-evalidator', label: 'Agency-validator enforcement', varName: 'ECTD_REQUIRE_EVALIDATOR', wanted: 'true', severity: 'blocker',
    gate: 'server/services/ectd/external-validator/config.ts evalidatorRequiredFromEnv → gate.ts evaluateExternalValidationGate',
    unblock: 'Set ECTD_REQUIRE_EVALIDATOR=true ONLY after a licensed engine is configured — set earlier and every production dispatch is blocked on "validator did not run".',
  },
  {
    id: 'flag-pdfa', label: 'PDF/A submission-grade enforcement', varName: 'ECTD_REQUIRE_PDFA', wanted: 'true', severity: 'blocker',
    gate: 'server/services/ectd/pdfa-readiness.ts pdfaRequiredFromEnv → pre-transmit-check.ts',
    unblock: 'Set ECTD_REQUIRE_PDFA=true after Ghostscript + veraPDF are present in the deployment image (see the pdfa-pipeline deployment TODO).',
  },
  {
    id: 'flag-rps-schema', label: 'eCTD v4.0 RPS schema enforcement', varName: 'ECTD_REQUIRE_RPS_SCHEMA', wanted: 'true', severity: 'advisory',
    gate: 'server/services/ectd/schema-bundler.ts schemaRequiredFromEnv → assessSchemaReadiness',
    unblock: 'Set ECTD_REQUIRE_RPS_SCHEMA=true after rps-message.xsd is vendored. Only needed for an eCTD v4.0 sequence.',
  },
];

for (const f of ENFORCEMENT_FLAGS) {
  const actual = flag(f.varName);
  record({
    id: f.id,
    group: 'Production enforcement flags',
    label: `${f.label} (${f.varName}=${f.wanted})`,
    status: actual === f.wanted ? 'ready' : 'blocked',
    severity: f.severity,
    observed: actual === '' ? `${f.varName} not set` : `${f.varName}="${env[f.varName]}"`,
    gate: f.gate,
    owner: 'Ops (deploy env)',
    unblock: f.unblock,
  });
}

// ── 4b. Tenant entitlement switches ─────────────────────────────────────────
//
// These do NOT fit the ENFORCEMENT_FLAGS shape above, and forcing them into it
// would make the report lie. Those flags are ready only when set to an exact
// value, because unset means OFF. These three default to the SAFE posture in
// production when unset (see isSeatEnforcementOn / isStorageEnforcementOn /
// scimProvisioningBlocked), so "not set" is ready, and the interesting reading is
// the one where someone has explicitly turned a control off.
{
  const opposite = (varName, off, what, note) => {
    const raw = (env[varName] ?? '').trim().toLowerCase();
    const disabled = raw === off;
    record({
      id: `tenant-${varName.toLowerCase().replace(/_/g, '-')}`,
      group: 'Tenant entitlement switches',
      label: `${what} (${varName})`,
      status: disabled ? 'blocked' : 'ready',
      severity: 'advisory',
      observed: raw === ''
        ? `${varName} not set — production default applies (enforcing)`
        : `${varName}="${env[varName]}"`,
      gate: note.gate,
      owner: 'Ops (deploy env) + Commercial (who is over their limit)',
      unblock: note.unblock,
    });
  };

  opposite('SEAT_LIMIT_ENFORCEMENT', 'report', 'Seat licensing enforcement', {
    gate: 'server/services/seat-licensing.ts isSeatEnforcementOn — unset enforces in production',
    unblock:
      'Remove SEAT_LIMIT_ENFORCEMENT (or set it to "enforce") once over-seat tenants ' +
      'are reconciled with their contracts. While it reads "report", the (N+1)th ' +
      'member or invitation is counted and surfaced but never blocked.',
  });

  opposite('STORAGE_LIMIT_ENFORCEMENT', 'report', 'Storage quota enforcement', {
    gate: 'server/services/tenant/tenant-storage.ts isStorageEnforcementOn → middleware/storageQuotaGuard.ts',
    unblock:
      'Run `npm run report:tenant-storage` FIRST — it prints exactly which tenants ' +
      'would start receiving 413s. Unlike seats (default 0 = unlimited), max_storage ' +
      'defaults to 5 GB and nothing measured a tenant against it before this control ' +
      'existed, so enforcing blind can refuse a customer mid-submission. Remove the ' +
      'variable (or set "enforce") once that list is empty.',
  });

  opposite('SCIM_PROVISIONING_ON_SUSPENDED_TENANT', 'allow', 'SCIM provisioning on a suspended tenant', {
    gate: 'server/routes/scim.ts scimProvisioningBlocked — unset blocks CREATE/ACTIVATE, never DELETE/DEACTIVATE',
    unblock:
      'Set back to "block" (or remove it). While it reads "allow", an organization ' +
      'suspended for non-payment or a security incident can still have new users ' +
      'provisioned into it by its IdP. Deprovisioning is unaffected either way — that ' +
      'asymmetry is deliberate and must not be "fixed".',
  });
}

// ── 5. Boot-posture secrets ─────────────────────────────────────────────────

{
  const key = (env.AUDIT_HMAC_KEY ?? '').trim();
  const accepted = flag('AUDIT_SEAL_ACCEPT_UNSEALED') === 'true';
  const ok = key.length >= 32;
  record({
    id: 'audit-hmac-key',
    group: 'Boot-posture secrets',
    label: 'Audit HMAC seal key (AUDIT_HMAC_KEY, ≥32 chars)',
    status: ok ? 'ready' : 'blocked',
    severity: 'blocker',
    observed: key === ''
      ? `AUDIT_HMAC_KEY not set; AUDIT_SEAL_ACCEPT_UNSEALED=${accepted ? 'true (risk explicitly accepted)' : 'unset (production refuses to boot)'}`
      : `AUDIT_HMAC_KEY set, length ${key.length}`,
    gate: 'server/services/audit/auditSealPosture.ts assertAuditSealPostureForProduction — production refuses to boot without the key or the explicit accept flag',
    owner: 'Ops / Security (secrets manager)',
    unblock: 'Provision a high-entropy AUDIT_HMAC_KEY held outside the app database; clear AUDIT_SEAL_ACCEPT_UNSEALED.',
  });
}

{
  const key = (env.MFA_ENCRYPTION_KEY ?? '').trim();
  record({
    id: 'mfa-encryption-key',
    group: 'Boot-posture secrets',
    label: 'MFA secret encryption key (MFA_ENCRYPTION_KEY, ≥32 chars)',
    status: key.length >= 32 ? 'ready' : 'blocked',
    severity: 'blocker',
    observed: key === '' ? 'MFA_ENCRYPTION_KEY not set' : `MFA_ENCRYPTION_KEY set, length ${key.length}`,
    gate: 'server/config/environment.ts assertMfaKeyPosture — production refuses to boot',
    owner: 'Ops / Security (secrets manager)',
    unblock: 'Provision a dedicated MFA_ENCRYPTION_KEY distinct from JWT_SECRET.',
  });
}

{
  const missing = missingVars(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']);
  record({
    id: 'smtp-otp',
    group: 'Boot-posture secrets',
    label: 'SMTP transport for login OTP (mandatory 2FA)',
    status: missing.length === 0 ? 'ready' : 'blocked',
    severity: 'blocker',
    observed: missing.length === 0
      ? 'SMTP_HOST/USER/PASS all set — configured is NOT delivering; prove it with npm run pilot:verify-otp'
      : `missing: ${missing.join(', ')}`,
    gate: 'server/services/emailService.ts isEmailConfigured; server/startup/services.ts logs CRITICAL in production when unconfigured',
    owner: 'Ops',
    unblock: 'Configure SMTP, then run `npm run pilot:verify-otp -- <real-external-inbox>` and keep the output as evidence.',
  });
}

// ── 6. Observability & operational posture ──────────────────────────────────

record({
  id: 'sentry-dsn',
  group: 'Observability & operational posture',
  label: 'Error monitoring (SENTRY_DSN)',
  status: isSet('SENTRY_DSN') ? 'ready' : 'blocked',
  severity: 'advisory',
  observed: isSet('SENTRY_DSN') ? 'SENTRY_DSN set (confirm a test exception actually pages someone)' : 'SENTRY_DSN not set',
  gate: 'server/startup/env.ts validateEnvironment — warns in production; server/utils/sentry.ts is inert without it',
  owner: 'Ops',
  unblock: 'Set SENTRY_DSN (+ VITE_SENTRY_DSN for the client) and verify a deliberate exception reaches an on-call human.',
});

{
  const enabled = flag('ENABLE_CORPUS_INGESTION') === 'true';
  const indications = (env.CORPUS_INGESTION_INDICATIONS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  record({
    id: 'corpus-ingestion',
    group: 'Observability & operational posture',
    label: 'Precedent corpus ingestion sweep',
    status: enabled && indications.length > 0 ? 'ready' : 'blocked',
    severity: 'advisory',
    observed: !enabled
      ? 'ENABLE_CORPUS_INGESTION is not "true" — the sweep is a no-op'
      : indications.length === 0
        ? 'sweep enabled but CORPUS_INGESTION_INDICATIONS is empty — the plan is empty, so it ingests nothing'
        : `enabled with ${indications.length} indication(s)`,
    gate: 'server/jobs/corpusIngestionSweep.ts scheduleCorpusIngestionSweep (ENABLE_CORPUS_INGESTION) + buildIngestionPlan (CORPUS_INGESTION_INDICATIONS)',
    owner: 'Ops (schedule) + Product (choose the indication set)',
    unblock: 'Set ENABLE_CORPUS_INGESTION=true + CORPUS_INGESTION_INDICATIONS, or backfill with `tsx scripts/ingest-corpus.ts`; verify with `node scripts/verify-rag-corpus.mjs`.',
  });
}

{
  const pii = flag('AI_PII_ENFORCEMENT') || 'audit (default)';
  const grounded = flag('AI_GROUNDEDNESS_ENFORCE');
  const ok = pii === 'block' && (grounded === '1' || grounded === 'true');
  record({
    id: 'ai-governance-posture',
    group: 'Observability & operational posture',
    label: 'AI content-safety gates (AI_PII_ENFORCEMENT=block, AI_GROUNDEDNESS_ENFORCE=1)',
    status: ok ? 'ready' : 'blocked',
    severity: 'advisory',
    observed: `AI_PII_ENFORCEMENT="${pii}", AI_GROUNDEDNESS_ENFORCE="${grounded || '(unset)'}"`,
    gate: 'server/startup/ai-governance-posture.ts assertAiGovernancePostureForProduction (fails closed only under AI_GOVERNANCE_REQUIRE_ENFORCE=true)',
    owner: 'Ops + AI governance owner',
    unblock: 'Set both gates to enforcing before any real-PHI tenant; then set AI_GOVERNANCE_REQUIRE_ENFORCE=true so the posture is boot-checked.',
  });
}

// ── 7. CI posture ───────────────────────────────────────────────────────────

{
  const ci = readFile('.github/workflows/ci.yml');
  if (ci === null) {
    record({
      id: 'ci-coverage-gate',
      group: 'CI posture',
      label: 'Coverage thresholds enforced in CI',
      status: 'unknown',
      severity: 'advisory',
      observed: '.github/workflows/ci.yml could not be read',
      gate: '.github/workflows/ci.yml `coverage` job',
      owner: 'Engineering',
    });
  } else {
    const forcedZero = /--coverage\.thresholds\.lines=0/.test(ci);
    record({
      id: 'ci-coverage-gate',
      group: 'CI posture',
      label: 'Coverage thresholds enforced in CI',
      status: forcedZero ? 'blocked' : 'ready',
      severity: 'advisory',
      observed: forcedZero
        ? 'the coverage job overrides all four thresholds to 0 and runs continue-on-error — it measures, it never blocks'
        : 'no threshold override found in the coverage job',
      gate: '.github/workflows/ci.yml `coverage` job vs. the 70/60/70/70 target in vitest.config.ts',
      owner: 'Engineering',
      unblock: 'Raise real coverage to the vitest.config.ts target, then drop the --coverage.thresholds.*=0 overrides and continue-on-error.',
    });
  }
}

{
  // Evidence of a database backup/restore rehearsal.
  //
  // THIS ROW USED TO BE SATISFIED BY A FILE EXISTING. It searched three paths
  // for a markdown document and, finding one, flipped a GA BLOCKER to "ready" —
  // so an empty `docs/runbooks/disaster-recovery.md` would have reported the DR
  // rehearsal as done. A restore is proven by restoring, not by a document
  // saying it was.
  //
  // It also named the wrong paths. The runbook, the drill and its CI proof all
  // landed at names this list did not contain, so the report read "no DR runbook
  // at any expected path" — telling Ops to start work that was already done, and
  // costing exactly the GA time this report exists to save.
  //
  // Now it observes the three components separately and reports each. None of
  // them alone closes the row: what is established is that the MECHANISM works
  // against a disposable fixture in CI. What remains is a rehearsal against a
  // production-shaped database with its observations committed — which the
  // runbook itself is careful to say the drill does not provide ("single CI
  // observations, not production RPO/RTO commitments or an SLA").
  const RUNBOOK = 'docs/operations/database-disaster-recovery.md';
  const DRILL = 'scripts/ops/dr-restore-drill.sh';
  const PROOF_CI = '.github/workflows/database-dr-restore-proof.yml';
  const has = (rel) => fs.existsSync(path.join(repoRoot, rel));
  const present = [
    has(RUNBOOK) ? `runbook ${RUNBOOK}` : null,
    has(DRILL) ? `drill ${DRILL} (pg_dump --format=custom → pg_restore)` : null,
    has(PROOF_CI) ? `CI proof ${PROOF_CI}` : null,
  ].filter(Boolean);
  const mechanismProven = has(RUNBOOK) && has(DRILL) && has(PROOF_CI);
  record({
    id: 'backup-restore-rehearsal',
    group: 'CI posture',
    // Kept blocked deliberately: see the note above. Only a production-shaped
    // rehearsal closes it, and that is an operational act this probe cannot see.
    status: 'blocked',
    severity: 'blocker',
    label: 'Database backup / restore rehearsal (DR runbook + a proven restore)',
    observed: mechanismProven
      ? `restore MECHANISM is proven in CI against a disposable fixture — ${present.join('; ')}. `
        + 'Not yet observed: a rehearsal against a production-shaped database, with its '
        + 'RPO/RTO observations and date committed. The runbook says so itself.'
      : present.length > 0
        ? `partial: ${present.join('; ')}. Missing the rest of the drill chain.`
        : 'no DR runbook, drill or CI proof present; scripts/backup.sh archives SOURCE CODE only, not the database',
    gate: 'no code gate — this is an operational obligation. The CI proof covers the mechanism, not the production estate.',
    owner: 'Ops / DB owner',
    unblock: mechanismProven
      ? 'Run scripts/ops/dr-restore-drill.sh against a production-shaped restore target, then commit the observed RPO/RTO and the rehearsal date to the runbook.'
      : 'Run a real pg_dump + restore into a scratch database, record RPO/RTO, commit the runbook with the rehearsal date.',
  });
}

/* ── output ──────────────────────────────────────────────────────────────── */

const blockers = rows.filter((r) => r.severity === 'blocker');
const outstanding = blockers.filter((r) => r.status !== 'ready');
const advisories = rows.filter((r) => r.severity === 'advisory' && r.status !== 'ready');

const summary = {
  generatedAt: new Date().toISOString(),
  nodeEnv: env.NODE_ENV || '(unset)',
  total: rows.length,
  ready: rows.filter((r) => r.status === 'ready').length,
  blocked: rows.filter((r) => r.status === 'blocked').length,
  unknown: rows.filter((r) => r.status === 'unknown').length,
  blockersOutstanding: outstanding.length,
  advisoriesOutstanding: advisories.length,
};

if (JSON_MODE) {
  process.stdout.write(JSON.stringify({ summary, rows }, null, 2) + '\n');
} else {
  const mark = (s) => (s === 'ready' ? '[x]' : s === 'unknown' ? '[?]' : '[ ]');
  console.log('GA readiness report — blocker status from env + asset presence');
  console.log(`Generated ${summary.generatedAt}   NODE_ENV=${summary.nodeEnv}`);
  console.log('Runbook: docs/GA_OPS_PROCUREMENT_RUNBOOK_2026-08.md');
  console.log('='.repeat(76));

  let currentGroup = null;
  for (const r of rows) {
    if (!SHOW_ALL && r.status === 'ready') continue;
    if (r.group !== currentGroup) {
      currentGroup = r.group;
      console.log(`\n${currentGroup}`);
      console.log('-'.repeat(76));
    }
    const sev = r.severity === 'blocker' ? 'BLOCKER ' : 'advisory';
    console.log(`  ${mark(r.status)} ${sev}  ${r.label}`);
    console.log(`        observed: ${r.observed}`);
    console.log(`        gate:     ${r.gate}`);
    console.log(`        owner:    ${r.owner}`);
    if (r.unblock) console.log(`        unblock:  ${r.unblock}`);
  }

  console.log('\n' + '='.repeat(76));
  console.log(
    `${summary.ready}/${summary.total} ready · ${summary.blockersOutstanding} blocker(s) outstanding · ` +
      `${summary.advisoriesOutstanding} advisory item(s) outstanding`,
  );
  if (!SHOW_ALL) console.log('(ready rows hidden — pass --all to see them)');
  console.log(
    '\nThis probe observes disk + env only. A row reading "ready" means the artifact\n' +
      'or variable is PRESENT — it is not proof the artifact is correct, licensed, or\n' +
      'that a credential authenticates. Those are proven by the verification commands\n' +
      'in the runbook, not by this script.',
  );
}

process.exit(outstanding.length === 0 ? 0 : 1);

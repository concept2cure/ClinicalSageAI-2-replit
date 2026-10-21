#!/usr/bin/env node
/**
 * Every Compose stack that runs the app with NODE_ENV=production carries the
 * production boot contract (D1, docs/evidence/W2/2026-10-01-compose-boot-contract/).
 *
 * docker-compose.yml (the self-host install) and docker-compose.beta.yml run
 * the server with NODE_ENV=production, and say they carry its fail-closed boot
 * contract with compose's `${VAR:?}` syntax, so `docker compose up` stops on a
 * missing variable instead of leaving a container to crash-loop. Until
 * 2026-10-01 neither did. They lacked the signer mode and the AI placement
 * settings, so the server refused to start. They lacked APP_URL and
 * ALLOWED_ORIGINS. And they lacked SMTP, so even a booted stack could sign no
 * one in, because the emailed login code is the mandatory second factor.
 * Nothing compared them with the contract.
 *
 * The contract is not copied here. The required names are read from
 * deploy-aws.yml's preflight (its `for VAR in … ; do` list, plus APP_URL, which
 * the preflight checks on its own), the same list
 * scripts/ops/terraform-preflight-proof.mjs holds Terraform to. A variable
 * added there is required here on the next run. Added for Compose:
 *   - ALLOWED_ORIGINS. Production's CSRF origin check
 *     (server/middleware/enterprise-security.ts) admits only a hard-coded set
 *     of company domains otherwise, so sign-in from a self-host's own origin is a 403.
 *     Terraform sets it (terraform/stack/main.tf); the preflight does not check it.
 * Excused for Compose:
 *   - AWS_S3_BUCKET, when the stack's STORAGE_PROVIDER is not `s3`. Local disk is
 *     then accepted only with STORAGE_ACCEPT_LOCAL_DISK=true
 *     (server/services/storage/storage-posture.ts), which is required instead.
 *   - The preflight's refusal of *_ACCEPT_* overrides. They exist for these
 *     stacks.
 *   - COMPOSE_EXCUSED below: names the hosted task must carry that are not
 *     part of the server's boot contract. The preflight list grew past the boot
 *     contract on 2026-10-01 (DB_AUDIT_REQUIRED in 385e6fc58, the connector's
 *     three names in 42842480f), and requiring them here would have made every
 *     self-hosted install either fail its migrate or publish a connector it did
 *     not ask for. Each excusal says why. An excusal for a name the preflight no
 *     longer requires is itself a failure, so the list can only shrink with it.
 *     A stack that turns the connector on must carry its allowlist: production
 *     refuses every registration without one (decision P-2).
 *
 * For each required name, the service's environment must give it:
 *   - a literal value;
 *   - `${NAME:?message}`, so a missing value stops `docker compose up`; or
 *   - `${NAME:-default}` with a non-empty default.
 * A bare `${NAME}` or `${NAME:-}` lets the container start with it empty, which
 * is the crash-loop these stacks exist to prevent.
 *
 * Five values are pinned, as the preflight and Terraform's boot test pin them:
 * NODE_ENV=production, RLS_ENFORCE=on, AI_SENSITIVE_DATA_POLICY_MODE=enforce,
 * AUDIT_TRAIL_ENABLED=true and AUDIT_REQUIRE_ENFORCE=true. Their literal or
 * default must be that value. And CONCEPT2CURE_SIGNER_MODE=hmac requires
 * CONCEPT2CURE_SIGNER_ACCEPT_HMAC, because production refuses an HMAC signer
 * nobody has accepted (server/services/signature/signer-mode.ts).
 *
 * And each production app service must have its virus scanner (MR-08 stage 1,
 * checkScanner below). Production refuses every upload it cannot scan
 * (server/middleware/uploadSafety.ts) and refuses to boot without CLAMAV_HOST
 * (server/services/securityHealth.ts), so: CLAMAV_HOST is a literal naming a
 * service in the same file; that service has a healthcheck and the app waits
 * for it (depends_on … condition: service_healthy); its image is the one
 * Terraform runs (terraform/stack/variables.tf, scanner_image); its
 * CLAMD_CONF_StreamMaxLength is FILE_LIMITS.maxUploadBytes in MB
 * (server/config/platform-limits.ts); and its CLAMD_CONF_AlertExceedsMax is yes.
 * clamd has no authentication, so only the app may reach it: the scanner has no
 * ports, no expose, no profiles and no network_mode, shares a network with the
 * app, and shares none with an optional-profile service.
 * CLAMAV_HOST is never excused for Compose.
 *
 * And no production app service passes SECURITY_SELF_TEST_NONBLOCKING, in any
 * form: production refuses it at boot (server/startup/env.ts), because it let a
 * process boot past every critical security self-test failure (MR-08).
 *
 *   node scripts/ci/check-compose-boot-contract.mjs              # the repo's stacks
 *   node scripts/ci/check-compose-boot-contract.mjs --self-test  # shows it failing
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PREFLIGHT_FILE = '.github/workflows/deploy-aws.yml';
const SCANNER_IMAGE_FILE = 'terraform/stack/variables.tf';
const UPLOAD_LIMIT_FILE = 'server/config/platform-limits.ts';

const PINNED = {
  NODE_ENV: 'production',
  RLS_ENFORCE: 'on',
  AI_SENSITIVE_DATA_POLICY_MODE: 'enforce',
  AUDIT_TRAIL_ENABLED: 'true',
  AUDIT_REQUIRE_ENFORCE: 'true',
};
const COMPOSE_ADDED = ['ALLOWED_ORIGINS'];

/** Required by the AWS preflight, not by the server's boot; why Compose does not require each. */
export const COMPOSE_EXCUSED = {
  DB_AUDIT_REQUIRED:
    'read by deploy-migrate (scripts/db/database-audit.mjs), never by the server; the Compose database ' +
    'image (pgvector/pgvector:pg15) has no pgaudit, so its one enforcing value would fail every install',
  MCP_ENABLED:
    'the Claude connector is optional at boot (server/index.ts mounts it only when "true"); decision P-2 ' +
    'turns it on for the hosted deployment, and a self-hosted install opts in',
  MCP_PUBLIC_URL: 'falls back to APP_URL (server/mcp/config.ts), which is required',
  MCP_CLIENT_REDIRECT_ALLOWLIST: 'required when the stack turns the connector on (checkService)',
};

/** Excusals whose name the preflight no longer requires: each must be deleted. */
export function staleExcusals(required) {
  return Object.keys(COMPOSE_EXCUSED).filter(n => !required.includes(n));
}

/** The names deploy-aws.yml's preflight requires on the API task. */
export function preflightRequiredNames(workflowText) {
  const m = workflowText.match(/for VAR in ([\s\S]*?);\s*do/);
  if (!m)
    throw new Error(`${PREFLIGHT_FILE}: the preflight's "for VAR in … ; do" list was not found`);
  const names = m[1]
    .replace(/\\\s*\n/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!names.includes('RLS_ENFORCE') || names.some(n => !/^[A-Z][A-Z0-9_]*$/.test(n))) {
    throw new Error(
      `${PREFLIGHT_FILE}: the first "for VAR in" list is not the boot-contract list (${names.join(
        ' '
      )})`
    );
  }
  // The preflight checks APP_URL separately (environment or secrets, https).
  if (/APP_URL is missing from the task definition/.test(workflowText)) names.push('APP_URL');
  return [...new Set(names)];
}

/** How a Compose environment value resolves when the operator sets nothing. */
export function classify(raw) {
  if (raw === undefined || raw === null) return { kind: 'absent' };
  const value = String(raw);
  const whole = value.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-?])([\s\S]*))?\}$/);
  if (!whole) {
    return value.trim() === '' ? { kind: 'empty' } : { kind: 'literal', value };
  }
  const [, , op, rest = ''] = whole;
  if (op === ':?' || op === '?') return { kind: 'required' };
  if ((op === ':-' || op === '-') && rest !== '') return { kind: 'default', value: rest };
  return { kind: 'may-be-empty' };
}

function environmentOf(service) {
  const env = service?.environment;
  if (!env) return {};
  if (Array.isArray(env)) {
    return Object.fromEntries(
      env.map(e => {
        const i = String(e).indexOf('=');
        return i < 0 ? [e, undefined] : [String(e).slice(0, i), String(e).slice(i + 1)];
      })
    );
  }
  return env;
}

/** Problems with one service's environment against the contract. */
export function checkService(env, required) {
  const problems = [];
  const resolved = name => classify(env[name]);
  const effective = name => {
    const c = resolved(name);
    return c.kind === 'literal' || c.kind === 'default' ? c.value : undefined;
  };
  const storage = effective('STORAGE_PROVIDER');
  const names = new Set([...required, ...COMPOSE_ADDED]);
  for (const name of Object.keys(COMPOSE_EXCUSED)) names.delete(name);
  if (effective('MCP_ENABLED') === 'true') names.add('MCP_CLIENT_REDIRECT_ALLOWLIST');
  if (storage !== undefined && storage !== 's3') {
    names.delete('AWS_S3_BUCKET');
    names.add('STORAGE_ACCEPT_LOCAL_DISK');
  }
  if (effective('CONCEPT2CURE_SIGNER_MODE') === 'hmac')
    names.add('CONCEPT2CURE_SIGNER_ACCEPT_HMAC');

  for (const name of [...names].sort()) {
    const c = resolved(name);
    if (c.kind === 'absent') problems.push(`${name} is not passed to the app`);
    else if (c.kind === 'empty' || c.kind === 'may-be-empty') {
      problems.push(
        `${name} may be empty: use \${${name}:?…} so a missing value stops "docker compose up"`
      );
    }
  }
  for (const [name, want] of Object.entries(PINNED)) {
    const c = resolved(name);
    if (c.kind === 'absent') continue; // reported above
    if ((c.kind === 'literal' || c.kind === 'default') && c.value === want) continue;
    problems.push(
      `${name} must be exactly "${want}" (literal or \${${name}:-${want}}); got ${JSON.stringify(
        env[name]
      )}`
    );
  }
  // Production refuses it at boot (server/startup/env.ts): it would let a
  // process boot past a critical security self-test failure, a missing
  // scanner included. Present in any form, a literal or a default an operator
  // could flip, it has no place on a production service (MR-08).
  if (Object.prototype.hasOwnProperty.call(env, 'SECURITY_SELF_TEST_NONBLOCKING')) {
    problems.push(
      `SECURITY_SELF_TEST_NONBLOCKING must not be passed to a production app (server/startup/env.ts refuses it); got ${JSON.stringify(
        env.SECURITY_SELF_TEST_NONBLOCKING
      )}`
    );
  }
  if (
    effective('STORAGE_ACCEPT_LOCAL_DISK') !== undefined &&
    storage !== 's3' &&
    effective('STORAGE_ACCEPT_LOCAL_DISK') !== 'true'
  ) {
    problems.push('STORAGE_ACCEPT_LOCAL_DISK must be "true" when the vault is on local disk');
  }
  return problems;
}

/**
 * What the scanner beside a production app must be, read from the files that
 * define it so the two cannot drift: the image Terraform runs
 * (terraform/stack/variables.tf, `scanner_image`'s default) and the largest
 * upload the platform takes (server/config/platform-limits.ts), with the regex
 * terraform/stack/tests/boot_contract.tftest.hcl uses for the same number.
 */
export function scannerExpectation(root = ROOT) {
  const tf = readFileSync(resolve(root, SCANNER_IMAGE_FILE), 'utf8');
  const image = tf.match(/variable\s+"scanner_image"\s*\{[\s\S]*?\n\s*default\s*=\s*"([^"]+)"/)?.[1];
  if (!image) throw new Error(`${SCANNER_IMAGE_FILE}: scanner_image's default was not found`);
  const limits = readFileSync(resolve(root, UPLOAD_LIMIT_FILE), 'utf8');
  const mb = limits.match(/maxUploadBytes: ([0-9]+) \* 1024 \* 1024/)?.[1];
  if (!mb) throw new Error(`${UPLOAD_LIMIT_FILE}: "maxUploadBytes: <n> * 1024 * 1024" was not found`);
  return { image, streamMaxLength: `${mb}M` };
}

/** The networks a service joins: its `networks` (list or map), else compose's `default`. */
function networksOf(service) {
  const n = service?.networks;
  if (!n) return ['default'];
  return Array.isArray(n) ? n.map(String) : Object.keys(n);
}

/**
 * The network Docker actually creates for a compose key. Compose prefixes a
 * key with the project name unless the network sets `name:` (or is external,
 * when the key or `name:` is the real name). Two keys can be one bridge, so
 * reach is judged by real name, never by key.
 */
function realNetwork(doc, key) {
  const def = doc?.networks?.[key];
  if (def && typeof def === 'object') {
    if (def.name != null) return `name:${def.name}`;
    if (def.external) return `name:${key}`;
  }
  return `project:${key}`;
}

// /init rewrites these image-supplied configs. An empty tmpfs would hide them;
// Docker's anonymous volume copy-up keeps the exact pinned image defaults.
function copiedWritableVolume(volume) {
  return Boolean(volume) && volume.type === 'volume'
    && (volume.read_only ?? false) === false
    && (volume.volume?.nocopy ?? false) === false;
}

function scannerVolumeProblems(doc, scanner) {
  const problems = [];
  const volumes = Array.isArray(scanner.volumes) ? scanner.volumes : [];
  const config = volumes.filter(v => v?.target === '/etc/clamav');
  if (config.length !== 1 || !copiedWritableVolume(config[0]) || config[0].source !== undefined) {
    problems.push('scanner needs an anonymous copy-up config volume at /etc/clamav for the pinned /init');
  }
  const database = volumes.filter(v => v?.target === '/var/lib/clamav');
  const db = database[0];
  if (database.length !== 1 || !copiedWritableVolume(db) || typeof db.source !== 'string'
    || !Object.hasOwn(doc.volumes ?? {}, db.source)) {
    problems.push('scanner needs a declared named signature database volume at /var/lib/clamav');
  }
  if (volumes.some(v => !['/etc/clamav', '/var/lib/clamav'].includes(v?.target))) {
    problems.push('scanner has an unexpected writable mount outside config and signature database paths');
  }
  return problems;
}

function scannerTmpfsProblems(scanner) {
  const required = {
    '/run': ['rw', 'noexec', 'nosuid', 'size=16m', 'mode=0755'],
    '/tmp': ['rw', 'noexec', 'nosuid', 'size=1g', 'mode=1777'],
    '/var/log/clamav': ['rw', 'noexec', 'nosuid', 'size=16m', 'mode=0770', 'uid=100', 'gid=101'],
  };
  const mounts = Array.isArray(scanner.tmpfs) ? scanner.tmpfs.map(String) : [];
  const problems = [];
  for (const [target, options] of Object.entries(required)) {
    const matching = mounts.filter(m => m.split(':')[0] === target);
    const actual = new Set((matching[0] ?? '').split(':').slice(1).join(':').split(','));
    if (matching.length !== 1 || actual.size !== options.length || !options.every(option => actual.has(option))) {
      problems.push(`scanner required tmpfs ${target} must retain the pinned image's bounded writable runtime path`);
    }
  }
  if (mounts.some(m => !Object.hasOwn(required, m.split(':')[0]))) {
    problems.push('scanner has an unexpected writable tmpfs outside runtime, temporary and log paths');
  }
  return problems;
}

function scannerHardeningProblems(doc, scanner) {
  const problems = [...scannerVolumeProblems(doc, scanner), ...scannerTmpfsProblems(scanner)];
  if (scanner.read_only !== true) problems.push('scanner read_only must be true');
  const privilegeOptions = Array.isArray(scanner.security_opt)
    ? scanner.security_opt.filter(option => String(option).startsWith('no-new-privileges')) : [];
  if (privilegeOptions.length !== 1 || privilegeOptions[0] !== 'no-new-privileges:true') {
    problems.push('scanner security_opt must include no-new-privileges:true');
  }
  return problems;
}

/**
 * The virus scanner a production app service needs. Production refuses every
 * upload when it cannot scan (server/middleware/uploadSafety.ts) and, since
 * MR-08, refuses to boot without CLAMAV_HOST (server/services/securityHealth.ts),
 * so a production stack without a scanner is a stack that cannot take a file.
 * The service must be the one Terraform runs, configured as Terraform runs it.
 */
export function checkScanner(doc, serviceName, expect) {
  const problems = [];
  const services = doc?.services ?? {};
  const app = services[serviceName] ?? {};
  const host = classify(environmentOf(app).CLAMAV_HOST);
  if (host.kind === 'absent') {
    return [
      `CLAMAV_HOST is not passed to the app: production refuses every upload without a scanner; ` +
        `add a clamav service (${expect.image}) and CLAMAV_HOST: clamav`,
    ];
  }
  if (host.kind !== 'literal') {
    return [`CLAMAV_HOST must be a literal naming the scanner service in this file; got ${JSON.stringify(environmentOf(app).CLAMAV_HOST)}`];
  }
  const scannerName = host.value;
  const scanner = services[scannerName];
  if (!scanner || scannerName === serviceName) {
    return [`CLAMAV_HOST "${scannerName}" names no service in this file`];
  }
  problems.push(...scannerHardeningProblems(doc, scanner));
  // `extends` pulls keys from another file this gate does not read, so what it
  // checks would not be what Compose runs.
  for (const [role, name, svc] of [['app', serviceName, app], ['scanner', scannerName, scanner]]) {
    if (svc?.extends !== undefined) {
      problems.push(`${role} "${name}" uses extends, which this gate cannot resolve: write the service out in full`);
    }
  }
  const test = scanner?.healthcheck?.test;
  if (!test || (Array.isArray(test) && test.length === 0)) {
    problems.push(`scanner "${scannerName}" has no healthcheck.test, so nothing can wait for clamd to load its database`);
  }
  const deps = app.depends_on;
  if (Array.isArray(deps) || deps?.[scannerName]?.condition !== 'service_healthy') {
    problems.push(
      `depends_on must name "${scannerName}" with condition: service_healthy (the list form starts the app before clamd answers)`
    );
  }
  if (scanner?.image !== expect.image) {
    problems.push(
      `scanner "${scannerName}" image must be ${expect.image} (${SCANNER_IMAGE_FILE}); got ${JSON.stringify(scanner?.image)}`
    );
  }
  const senv = environmentOf(scanner);
  if (String(senv.CLAMD_CONF_StreamMaxLength) !== expect.streamMaxLength) {
    problems.push(
      `scanner "${scannerName}" CLAMD_CONF_StreamMaxLength must be ${expect.streamMaxLength} ` +
        `(FILE_LIMITS.maxUploadBytes, ${UPLOAD_LIMIT_FILE}); got ${JSON.stringify(senv.CLAMD_CONF_StreamMaxLength)}`
    );
  }
  if (String(senv.CLAMD_CONF_AlertExceedsMax) !== 'yes') {
    problems.push(
      `scanner "${scannerName}" CLAMD_CONF_AlertExceedsMax must be "yes" (a file it could not scan whole is reported, not passed); ` +
        `got ${JSON.stringify(senv.CLAMD_CONF_AlertExceedsMax)}`
    );
  }
  // Reach. clamd has no authentication: anything that can open its port can
  // send SHUTDOWN or feed it streams. So only the app reaches it: no host port,
  // no expose, never left out of a plain `up` by a profile, no network_mode
  // that bypasses compose networks, a network shared with the app, and no
  // optional-profile container (third-party images such as litellm or opa) on
  // any network it joins.
  if (scanner?.ports !== undefined) {
    problems.push(`scanner "${scannerName}" must publish no ports (clamd has no authentication); got ${JSON.stringify(scanner.ports)}`);
  }
  if (scanner?.expose !== undefined) {
    problems.push(`scanner "${scannerName}" must not expose ports; only the app reaches it, over a shared network; got ${JSON.stringify(scanner.expose)}`);
  }
  if (scanner?.profiles !== undefined) {
    problems.push(
      `scanner "${scannerName}" must not be under a profile: a plain "docker compose up" would start the app without it; got ${JSON.stringify(scanner.profiles)}`
    );
  }
  if (scanner?.network_mode !== undefined) {
    problems.push(`scanner "${scannerName}" must not set network_mode (it bypasses the compose networks); got ${JSON.stringify(scanner.network_mode)}`);
  } else {
    const real = svc => networksOf(svc).map(k => realNetwork(doc, k));
    const scannerNets = real(scanner);
    const appNets = app.network_mode !== undefined ? [] : real(app);
    if (!scannerNets.some(n => appNets.includes(n))) {
      problems.push(
        `scanner "${scannerName}" shares no network with the app (scanner: ${networksOf(scanner).join(', ')}; app: ${
          app.network_mode !== undefined ? `network_mode ${app.network_mode}` : networksOf(app).join(', ')
        })`
      );
    }
    // A service can also reach clamd without joining its network: by sharing
    // the network namespace of a service that is on it (service:<x>), of a
    // container this file cannot see (container:<id>), or of the host, which
    // routes to every bridge. Only `none` and Docker's default `bridge` cannot.
    const reaches = svc => {
      const mode = svc?.network_mode;
      if (mode === undefined) return networksOf(svc).filter(k => scannerNets.includes(realNetwork(doc, k)));
      const m = String(mode);
      if (m === 'none' || m === 'bridge') return [];
      if (m.startsWith('service:')) {
        const target = m.slice('service:'.length);
        if (target === scannerName || target === serviceName) return [`network_mode ${m}`];
        const via = services[target];
        return via && via.network_mode === undefined && real(via).some(n => scannerNets.includes(n))
          ? [`network_mode ${m}`]
          : [];
      }
      return [`network_mode ${m}`];
    };
    for (const [other, svc] of Object.entries(services)) {
      if (other === scannerName || svc?.profiles === undefined) continue;
      const shared = reaches(svc);
      if (shared.length) {
        problems.push(
          `scanner "${scannerName}" is reachable through ${shared.join(', ')}, where optional service "${other}" (profile ${[]
            .concat(svc.profiles)
            .join(', ')}) can reach it: give the scanner a network shared only with the app`
        );
      }
    }
  }
  return problems;
}

/** Every production app service in one Compose document. */
export function checkCompose(text, required, expect = scannerExpectation()) {
  // `merge: true`: Compose honours `<<: *anchor`, so the gate must read what
  // Compose reads. Without it a scanner's ports could arrive through a merge key
  // and parse as absent.
  const doc = YAML.parse(text, { merge: true }) ?? {};
  const out = [];
  for (const [name, service] of Object.entries(doc.services ?? {})) {
    const env = environmentOf(service);
    if (classify(env.NODE_ENV).value !== 'production') continue;
    for (const p of checkService(env, required)) out.push(`service "${name}": ${p}`);
    for (const p of checkScanner(doc, name, expect)) out.push(`service "${name}": ${p}`);
  }
  return out;
}

function composeFiles() {
  return readdirSync(ROOT)
    .filter(f => /^docker-compose(\.[\w-]+)?\.ya?ml$/.test(f))
    .sort();
}

function selfTest(required) {
  const base = {
    NODE_ENV: 'production',
    RLS_ENFORCE: '${RLS_ENFORCE:-on}',
    AI_SENSITIVE_DATA_POLICY_MODE: 'enforce',
    AUDIT_TRAIL_ENABLED: 'true',
    AUDIT_REQUIRE_ENFORCE: 'true',
    STORAGE_PROVIDER: '${STORAGE_PROVIDER:-local}',
    STORAGE_ACCEPT_LOCAL_DISK: 'true',
    CONCEPT2CURE_SIGNER_MODE: '${CONCEPT2CURE_SIGNER_MODE:-hmac}',
    CONCEPT2CURE_SIGNER_ACCEPT_HMAC: '${CONCEPT2CURE_SIGNER_ACCEPT_HMAC:?x}',
    ALLOWED_ORIGINS: '${ALLOWED_ORIGINS:?x}',
  };
  for (const n of required) if (!(n in base)) base[n] = `\${${n}:?x}`;
  delete base.AWS_S3_BUCKET;
  for (const n of Object.keys(COMPOSE_EXCUSED)) delete base[n];
  const cases = [
    ['a complete stack passes', base, []],
    ['SMTP_HOST absent', { ...base, SMTP_HOST: undefined }, ['SMTP_HOST is not passed']],
    [
      'a bare ${ANTHROPIC_API_KEY}',
      { ...base, ANTHROPIC_API_KEY: '${ANTHROPIC_API_KEY}' },
      ['ANTHROPIC_API_KEY may be empty'],
    ],
    ['an empty default', { ...base, SMTP_PASS: '${SMTP_PASS:-}' }, ['SMTP_PASS may be empty']],
    [
      'RLS_ENFORCE defaulting to off',
      { ...base, RLS_ENFORCE: '${RLS_ENFORCE:-off}' },
      ['RLS_ENFORCE must be exactly "on"'],
    ],
    [
      'hmac signer nobody accepted',
      { ...base, CONCEPT2CURE_SIGNER_ACCEPT_HMAC: undefined },
      ['CONCEPT2CURE_SIGNER_ACCEPT_HMAC is not passed'],
    ],
    [
      's3 vault with no bucket',
      { ...base, STORAGE_PROVIDER: 's3' },
      ['AWS_S3_BUCKET is not passed'],
    ],
    [
      'no ALLOWED_ORIGINS',
      { ...base, ALLOWED_ORIGINS: undefined },
      ['ALLOWED_ORIGINS is not passed'],
    ],
    [
      'the connector turned on with no allowlist',
      { ...base, MCP_ENABLED: 'true' },
      ['MCP_CLIENT_REDIRECT_ALLOWLIST is not passed'],
    ],
    [
      'SECURITY_SELF_TEST_NONBLOCKING set on the app',
      { ...base, SECURITY_SELF_TEST_NONBLOCKING: 'true' },
      ['SECURITY_SELF_TEST_NONBLOCKING must not be passed'],
    ],
    [
      'SECURITY_SELF_TEST_NONBLOCKING left for the operator to set',
      { ...base, SECURITY_SELF_TEST_NONBLOCKING: '${SECURITY_SELF_TEST_NONBLOCKING:-false}' },
      ['SECURITY_SELF_TEST_NONBLOCKING must not be passed'],
    ],
    [
      'the connector turned on with an allowlist',
      { ...base, MCP_ENABLED: '${MCP_ENABLED:-true}', MCP_CLIENT_REDIRECT_ALLOWLIST: '${MCP_CLIENT_REDIRECT_ALLOWLIST:?x}' },
      [],
    ],
  ];
  let failed = 0;
  for (const [label, env, expect] of cases) {
    const clean = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined));
    const got = checkService(clean, required);
    const ok =
      expect.length === 0 ? got.length === 0 : expect.every(e => got.some(g => g.includes(e)));
    if (!ok) failed++;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${label}${
        ok ? '' : `\n     expected ${JSON.stringify(expect)}, got ${JSON.stringify(got)}`
      }`
    );
  }
  const yamlCase = checkCompose(
    'services:\n  app:\n    environment:\n      - NODE_ENV=production\n',
    required
  );
  const yamlOk = yamlCase.some(p => p.includes('JWT_SECRET is not passed'));
  if (!yamlOk) failed++;
  console.log(`${yamlOk ? 'ok  ' : 'FAIL'} list-form environment is read`);
  // The scanner beside the app (checkScanner), each case a whole stack.
  const expectScanner = scannerExpectation();
  const stack = (edit = () => {}) => {
    const doc = {
      services: {
        clamav: {
          image: expectScanner.image,
          read_only: true,
          security_opt: ['no-new-privileges:true'],
          volumes: [
            { type: 'volume', target: '/etc/clamav' },
            { type: 'volume', source: 'clamav-db', target: '/var/lib/clamav' },
          ],
          tmpfs: [
            '/run:rw,noexec,nosuid,size=16m,mode=0755',
            '/tmp:rw,noexec,nosuid,size=1g,mode=1777',
            '/var/log/clamav:rw,noexec,nosuid,size=16m,mode=0770,uid=100,gid=101',
          ],
          environment: {
            CLAMD_CONF_StreamMaxLength: expectScanner.streamMaxLength,
            CLAMD_CONF_AlertExceedsMax: 'yes',
          },
          healthcheck: { test: ['CMD-SHELL', 'clamdcheck.sh'] },
          networks: ['scan'],
        },
        app: {
          depends_on: { clamav: { condition: 'service_healthy' } },
          environment: { ...base, CLAMAV_HOST: 'clamav', CLAMAV_PORT: '3310' },
          networks: ['main', 'scan'],
        },
        litellm: { image: 'ghcr.io/berriai/litellm:main-stable', profiles: ['llm'], networks: ['main'] },
      },
      networks: { main: { driver: 'bridge' }, scan: { driver: 'bridge' } },
      volumes: { 'clamav-db': {} },
    };
    edit(doc.services, doc);
    return YAML.stringify(doc);
  };
  const scannerCases = [
    ['a stack with its scanner passes', stack(), []],
    ['a scanner without a read-only root', stack(s => { delete s.clamav.read_only; }), ['read_only must be true']],
    ['a scanner with a string instead of read-only true', stack(s => { s.clamav.read_only = 'true'; }), ['read_only must be true']],
    ['a scanner without no-new-privileges', stack(s => { delete s.clamav.security_opt; }), ['no-new-privileges:true']],
    ['a scanner that disables no-new-privileges', stack(s => { s.clamav.security_opt = ['no-new-privileges:false']; }), ['no-new-privileges:true']],
    ['contradictory no-new-privileges options', stack(s => { s.clamav.security_opt.push('no-new-privileges:false'); }), ['no-new-privileges:true']],
    ['an empty config mount that hides image defaults', stack(s => { s.clamav.volumes[0].volume = { nocopy: true }; }), ['copy-up config volume']],
    ['a config mount reused across image recreation', stack(s => { s.clamav.volumes[0].source = 'old-config'; }), ['copy-up config volume']],
    ['a missing database volume', stack(s => { s.clamav.volumes.pop(); }), ['named signature database volume']],
    ['an undeclared database volume', stack((s, d) => { delete d.volumes; }), ['named signature database volume']],
    ['a scanner with an extra writable root mount', stack(s => { s.clamav.volumes.push({ type: 'volume', target: '/' }); }), ['unexpected writable mount']],
    ['missing runtime tmpfs mounts', stack(s => { delete s.clamav.tmpfs; }), ['required tmpfs']],
    ['an incorrectly owned log tmpfs', stack(s => { s.clamav.tmpfs[2] = '/var/log/clamav:rw,size=16m'; }), ['required tmpfs']],
    ['contradictory temporary filesystem options', stack(s => { s.clamav.tmpfs[1] += ',ro'; }), ['required tmpfs']],
    ['an extra writable tmpfs', stack(s => { s.clamav.tmpfs.push('/usr:rw'); }), ['unexpected writable tmpfs']],
    [
      'no clamav service',
      stack(s => {
        delete s.clamav;
        delete s.app.environment.CLAMAV_HOST;
        delete s.app.environment.CLAMAV_PORT;
        delete s.app.depends_on;
      }),
      ['CLAMAV_HOST is not passed to the app'],
    ],
    [
      'CLAMAV_HOST naming a missing service',
      stack(s => {
        s.app.environment.CLAMAV_HOST = 'scanner';
      }),
      ['CLAMAV_HOST "scanner" names no service'],
    ],
    [
      'CLAMAV_HOST that may resolve to anything',
      stack(s => {
        s.app.environment.CLAMAV_HOST = '${CLAMAV_HOST:-clamav}';
      }),
      ['CLAMAV_HOST must be a literal'],
    ],
    [
      'depends_on without service_healthy',
      stack(s => {
        s.app.depends_on = { clamav: { condition: 'service_started' } };
      }),
      ['depends_on must name "clamav" with condition: service_healthy'],
    ],
    [
      'list-form depends_on',
      stack(s => {
        s.app.depends_on = ['clamav'];
      }),
      ['depends_on must name "clamav" with condition: service_healthy'],
    ],
    [
      'a scanner with no healthcheck',
      stack(s => {
        delete s.clamav.healthcheck;
      }),
      ['has no healthcheck.test'],
    ],
    [
      'a different digest',
      stack(s => {
        s.clamav.image = expectScanner.image.replace(/@sha256:[0-9a-f]{4}/, '@sha256:0000');
      }),
      ['image must be'],
    ],
    [
      'a StreamMaxLength mismatch',
      stack(s => {
        s.clamav.environment.CLAMD_CONF_StreamMaxLength = '25M';
      }),
      ['CLAMD_CONF_StreamMaxLength must be'],
    ],
    [
      'AlertExceedsMax off',
      stack(s => {
        s.clamav.environment.CLAMD_CONF_AlertExceedsMax = 'no';
      }),
      ['CLAMD_CONF_AlertExceedsMax must be "yes"'],
    ],
    // clamd has no authentication: any client that reaches it can send
    // SHUTDOWN, or feed it a stream. Only the app may reach it.
    [
      'a scanner that publishes a host port',
      stack(s => {
        s.clamav.ports = ['127.0.0.1:3310:3310'];
      }),
      ['must publish no ports'],
    ],
    [
      'a scanner with expose',
      stack(s => {
        s.clamav.expose = ['3310'];
      }),
      ['must not expose'],
    ],
    [
      'a scanner under a profile',
      stack(s => {
        s.clamav.profiles = ['scan'];
      }),
      ['must not be under a profile'],
    ],
    [
      'a scanner with network_mode',
      stack(s => {
        s.clamav.network_mode = 'host';
        delete s.clamav.networks;
      }),
      ['must not set network_mode'],
    ],
    [
      'a scanner on no network the app is on',
      stack(s => {
        s.app.networks = ['main'];
      }),
      ['shares no network with the app'],
    ],
    [
      'a scanner on the default network while the app is not',
      stack(s => {
        delete s.clamav.networks;
      }),
      ['shares no network with the app'],
    ],
    [
      'a scanner on a network an optional-profile service joins',
      stack(s => {
        s.litellm.networks = ['main', 'scan'];
      }),
      ['"litellm" (profile llm) can reach it'],
    ],
    [
      "an optional service sharing the app's network namespace",
      stack(s => {
        delete s.litellm.networks;
        s.litellm.network_mode = 'service:app';
      }),
      ['"litellm" (profile llm) can reach it'],
    ],
    [
      "an optional service sharing the scanner's network namespace",
      stack(s => {
        delete s.litellm.networks;
        s.litellm.network_mode = 'service:clamav';
      }),
      ['"litellm" (profile llm) can reach it'],
    ],
    [
      'an optional service on the host network',
      stack(s => {
        delete s.litellm.networks;
        s.litellm.network_mode = 'host';
      }),
      ['"litellm" (profile llm) can reach it'],
    ],
    [
      'an optional service with no network passes',
      stack(s => {
        delete s.litellm.networks;
        s.litellm.network_mode = 'none';
      }),
      [],
    ],
    [
      "the scanner's network named as the shared bridge under another key",
      stack((s, doc) => {
        doc.networks = { main: { name: 'c2c' }, scan: { name: 'c2c' } };
      }),
      ['"litellm" (profile llm) can reach it'],
    ],
    [
      'a scanner whose host port arrives through a merge key',
      stack().replace(
        /^services:\n {2}clamav:\n/m,
        'x-scanner: &scanner\n  ports:\n    - 127.0.0.1:3310:3310\nservices:\n  clamav:\n    <<: *scanner\n'
      ),
      ['must publish no ports'],
    ],
    [
      'a scanner declared with extends',
      stack(s => {
        s.clamav.extends = { file: 'docker-compose.base.yml', service: 'clamav' };
      }),
      ['uses extends'],
    ],
  ];
  for (const [label, text, expect] of scannerCases) {
    const got = checkCompose(text, required, expectScanner);
    const ok =
      expect.length === 0 ? got.length === 0 : expect.every(e => got.some(g => g.includes(e)));
    if (!ok) failed++;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${label}${
        ok ? '' : `\n     expected ${JSON.stringify(expect)}, got ${JSON.stringify(got)}`
      }`
    );
  }
  const stale = staleExcusals(required.filter(n => n !== 'DB_AUDIT_REQUIRED'));
  const staleOk = stale.length === 1 && stale[0] === 'DB_AUDIT_REQUIRED';
  if (!staleOk) failed++;
  console.log(`${staleOk ? 'ok  ' : 'FAIL'} an excusal the preflight no longer needs is reported`);
  if (failed) {
    console.error(`[ci:compose-boot-contract] self-test: ${failed} case(s) failed`);
    process.exit(1);
  }
  console.log('[ci:compose-boot-contract] self-test: every case behaves');
}

function main() {
  const required = preflightRequiredNames(readFileSync(resolve(ROOT, PREFLIGHT_FILE), 'utf8'));
  if (process.argv.includes('--self-test')) return selfTest(required);
  const files = composeFiles();
  let total = 0;
  for (const n of staleExcusals(required)) {
    total++;
    console.error(`${PREFLIGHT_FILE}: no longer requires ${n}; delete its COMPOSE_EXCUSED entry`);
  }
  let stacks = 0;
  for (const f of files) {
    const text = readFileSync(resolve(ROOT, f), 'utf8');
    const doc = YAML.parse(text, { merge: true }) ?? {};
    const prod = Object.values(doc.services ?? {}).some(
      s => classify(environmentOf(s).NODE_ENV).value === 'production'
    );
    if (!prod) continue;
    stacks++;
    const problems = checkCompose(text, required);
    total += problems.length;
    for (const p of problems) console.error(`${f}: ${p}`);
  }
  if (total) {
    console.error(
      `[ci:compose-boot-contract] ${total} problem(s). The server refuses to boot, or boots and signs no one in, ` +
        `without these; the list is deploy-aws.yml's preflight (${required.length} names, ` +
        `${Object.keys(COMPOSE_EXCUSED).length} excused for Compose) plus ALLOWED_ORIGINS.`
    );
    process.exit(1);
  }
  console.log(
    `[ci:compose-boot-contract] OK — ${stacks} production Compose stack(s) carry the boot contract (${required.length} preflight names, ` +
      `${Object.keys(COMPOSE_EXCUSED).length} excused for Compose, + ALLOWED_ORIGINS) and the pinned virus scanner.`
  );
}

main();

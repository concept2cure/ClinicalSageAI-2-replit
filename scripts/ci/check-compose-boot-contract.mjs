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
 *   - DEPLOY_ONLY names: the preflight requires them for the deploy's own steps,
 *     and the server never reads them. DB_AUDIT_REQUIRED=pgaudit makes
 *     deploy-migrate refuse a database whose pgaudit is not recording
 *     (scripts/db/database-audit.mjs). These stacks run no deploy-migrate, their
 *     Postgres (pgvector/pgvector:pg15) cannot preload pgaudit, and 'pgaudit' is
 *     the only non-empty value it accepts, so it may be empty or absent here.
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
 *   node scripts/ci/check-compose-boot-contract.mjs              # the repo's stacks
 *   node scripts/ci/check-compose-boot-contract.mjs --self-test  # shows it failing
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PREFLIGHT_FILE = '.github/workflows/deploy-aws.yml';

const PINNED = {
  NODE_ENV: 'production',
  RLS_ENFORCE: 'on',
  AI_SENSITIVE_DATA_POLICY_MODE: 'enforce',
  AUDIT_TRAIL_ENABLED: 'true',
  AUDIT_REQUIRE_ENFORCE: 'true',
};
const COMPOSE_ADDED = ['ALLOWED_ORIGINS'];
/** Preflight names only the deploy reads, never the server (header, "Excused for Compose"). */
const DEPLOY_ONLY = ['DB_AUDIT_REQUIRED'];

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
  for (const name of DEPLOY_ONLY) names.delete(name);
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
  if (
    effective('STORAGE_ACCEPT_LOCAL_DISK') !== undefined &&
    storage !== 's3' &&
    effective('STORAGE_ACCEPT_LOCAL_DISK') !== 'true'
  ) {
    problems.push('STORAGE_ACCEPT_LOCAL_DISK must be "true" when the vault is on local disk');
  }
  return problems;
}

/** Every production app service in one Compose document. */
export function checkCompose(text, required) {
  const doc = YAML.parse(text) ?? {};
  const out = [];
  for (const [name, service] of Object.entries(doc.services ?? {})) {
    const env = environmentOf(service);
    if (classify(env.NODE_ENV).value !== 'production') continue;
    for (const p of checkService(env, required)) out.push(`service "${name}": ${p}`);
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
      'DB_AUDIT_REQUIRED, which only the deploy reads, empty',
      { ...base, DB_AUDIT_REQUIRED: '${DB_AUDIT_REQUIRED:-}' },
      [],
    ],
    ['DB_AUDIT_REQUIRED absent', { ...base, DB_AUDIT_REQUIRED: undefined }, []],
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
  let stacks = 0;
  for (const f of files) {
    const text = readFileSync(resolve(ROOT, f), 'utf8');
    const doc = YAML.parse(text) ?? {};
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
        `without these; the list is deploy-aws.yml's preflight (${required.length} names) plus ALLOWED_ORIGINS.`
    );
    process.exit(1);
  }
  console.log(
    `[ci:compose-boot-contract] OK — ${stacks} production Compose stack(s) carry the boot contract (${required.length} preflight names + ALLOWED_ORIGINS).`
  );
}

main();

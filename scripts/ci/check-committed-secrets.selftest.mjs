#!/usr/bin/env node
/**
 * Self-test for scripts/ci/check-committed-secrets.mjs (ci:committed-secrets).
 *
 * The gate reports OK on the current tree, so its failure branch never fires in
 * normal use — and a gate that has only ever been seen to pass has not been
 * tested (CLAUDE.md, working agreement).
 *
 * Each case builds a throwaway git repository in a temp directory, commits
 * fixture files to its index, points a patched copy of the gate at it (only the
 * `repoRoot` constant changes), runs it as a subprocess, and asserts its verdict.
 * The gate reads `git ls-files`, so the fixtures are tracked for real; nothing
 * touches this repository's index or working tree.
 *
 * The first cases are INF-22 as it was committed: a `neondb_owner` URI used as
 * the e2e seed's fallback when DATABASE_URL was unset, and the same credential in
 * a getting-started doc as a URL *and* as a bare `npg_` password. Then every
 * detection branch of the gate's pattern table that a real credential can
 * reach, each by a RED line that only that branch catches:
 *   - every URI scheme, plain and TLS/SRV forms: postgres, postgresql, mysql,
 *     mongodb, mongodb+srv, redis, rediss, amqp, amqps;
 *   - every provider prefix: AWS AKIA and ASIA (STS), GitHub ghp_, gho_, ghs_,
 *     ghu_ and github_pat_, Slack xoxa/xoxb/xoxp/xoxr/xoxs, Stripe sk_live_ and
 *     rk_live_, OpenAI sk-proj-, Anthropic sk-ant-, and private keys under the
 *     PKCS#8, RSA, EC and OPENSSH headers;
 *   - NON_LIVE_HOST and PLACEHOLDER as whole-string matches: live hosts whose
 *     first label IS a non-live name (db.<ref>.supabase.co,
 *     redis-NNNNN.….redislabs.com, database-1.….rds.amazonaws.com) or that
 *     contain one mid-host (prod-db…, report.test-replica…), and real passwords
 *     with a stand-in word inside them, or that open like a `$VAR` reference.
 * Then the shapes a sloppy gate would flag and this one must not (placeholders,
 * CI service hosts, Stripe test keys, a bare PEM marker, a gitignored local .env).
 *
 * Every case asserts the COMPLETE set of finding lines, each exactly
 * `  file:line  what  [rule]  abcd…(N chars)`: no finding missing, none extra,
 * and nothing of a secret shown beyond its first four characters and its
 * length. Independently, no 6-character run of a secret (past its first
 * character) may appear anywhere in the output, text or --json: the gate
 * writes to CI logs, and its own rule is "never echo the secret".
 *
 * The fixture credentials are generated at run time, never written out in this
 * file: once committed, this file is scanned by the gate it tests and by the
 * full-history gitleaks job. The last case commits this file's own source to a
 * fixture repository and requires the gate to stay quiet on it.
 *
 * KNOWN GAPS of the gate are probed on every run and REPORTED in the output, not
 * asserted: pinning a miss would make the bug a requirement, and failing on it
 * would make this selftest red until someone changes the gate. Each needs a
 * gate change (and the same change in .gitleaks.toml where the two share a
 * pattern — tests/ci/secret-history-scan.contract.test.ts holds them equal):
 *   - a private key committed as an ordinary multi-line PEM file (.pem, .key,
 *     id_rsa). The gate scans line by line, so its private-key rule fires only
 *     when key material shares the header's line (a JSON-escaped key). The
 *     gitleaks `private-key` default rule in the full-history CI job is what
 *     catches this shape today;
 *   - an OpenPGP armored private key. Its header ends `PRIVATE KEY BLOCK`, which
 *     the gate's `PGP ` header alternative does not match — that alternative is
 *     unreachable by a real key, so no RED case here exercises it;
 *   - a real password made of word characters that BEGINS with a stand-in word
 *     (admin2024Prod…, test…, user…, secret…): PLACEHOLDER's `word\w*`
 *     alternatives excuse it even against a live host, and .gitleaks.toml
 *     carries the same allowlist;
 *   - Slack `xoxe-` refresh tokens (the header promises "xox*") and GitHub
 *     `ghr_` refresh tokens: no prefix covers them.
 * When the gate closes one, the probe prints "now caught": move it into a RED case.
 *
 * SELFTEST_GATE_PATH points the selftest at another copy of the gate (a mutant),
 * to show the selftest fails when the gate's detection is weakened.
 *
 * Usage: node scripts/ci/check-committed-secrets.selftest.mjs   (exit 0 = every case held)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(SELF), '..', '..');
const TAG = '[ci:committed-secrets:selftest]';
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, 'scripts', 'ci', 'check-committed-secrets.mjs');

// ── Fixture credentials, generated so that no literal one appears in this file ──

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const LETTERS = ALNUM.slice(0, 52);
const UPPER_DIGIT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DIGIT = '0123456789';
const HEX = '0123456789abcdef';
const BASE64 = `${ALNUM}+/`;
/** Deterministic, credential-looking characters: same output on every run. */
function fake(n, seed, alphabet = ALNUM) {
  let x = seed >>> 0;
  let s = '';
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    s += alphabet[(x >>> 16) % alphabet.length];
  }
  return s;
}
const cat = (...parts) => parts.join('');
/** scheme://user:secret@host/rest, assembled so the source never holds the shape. */
const uri = (scheme, user, secret, host, rest = '') => cat(scheme, '://', user, ':', secret, '@', host, rest);
/** A PEM block as it sits inside a JSON, YAML or JS string: newlines as `\n` escapes. */
const pemEscaped = (kind, body) =>
  cat('-----BEGIN ', kind, 'PRIVATE KEY-----', '\\n', body, '\\n', '-----END ', kind, 'PRIVATE KEY-----', '\\n');

const NEON_HOST = 'ep-selftest-fixture-a1b2c3d4-pooler.c-3.us-east-1.aws.neon.tech';
const RDS_HOST = 'prod-db.cluster-c8x2k1.us-east-1.rds.amazonaws.com';
const NPG_SEED = cat('npg', '_', fake(16, 1)); // the e2e seed's fallback password
const NPG_DOC = cat('npg', '_', fake(16, 2)); // a DIFFERENT owner password, as INF-22 had
const PEM_HEADER = cat('-----BEGIN ', 'PRIVATE KEY-----');
const PEM_FOOTER = cat('-----END ', 'PRIVATE KEY-----');

const S = {
  aws: cat('AKIA', fake(16, 11, UPPER_DIGIT)),
  awsSts: cat('ASIA', fake(16, 51, UPPER_DIGIT)), // temporary credentials from sts:AssumeRole
  ghp: cat('ghp', '_', fake(36, 12)),
  gho: cat('gho', '_', fake(36, 52)), // OAuth app token, as `gh auth login` stores it
  ghs: cat('ghs', '_', fake(36, 53)), // GitHub App installation token
  ghu: cat('ghu', '_', fake(36, 54)), // GitHub App user-to-server token
  ghPat: cat('github', '_pat_', '11', fake(22, 13, UPPER_DIGIT), '_', fake(59, 14)),
  slack: cat('xox', 'b-', fake(12, 15, DIGIT), '-', fake(13, 16, DIGIT), '-', fake(24, 17)),
  slackUser: cat('xox', 'p-', fake(12, 55, DIGIT), '-', fake(12, 56, DIGIT), '-', fake(13, 57, DIGIT), '-', fake(32, 58, HEX)),
  slackWorkspace: cat('xox', 'a-', '2-', fake(12, 59, DIGIT), '-', fake(32, 60)),
  slackWorkspaceRefresh: cat('xox', 'r-', fake(40, 61)),
  slackSession: cat('xox', 's-', fake(12, 62, DIGIT), '-', fake(12, 63, DIGIT), '-', fake(64, 64, HEX)),
  stripeSk: cat('sk', '_live_', fake(24, 18)),
  stripeRk: cat('rk', '_live_', fake(24, 19)),
  openai: cat('sk', '-proj-', fake(48, 20)),
  anthropic: cat('sk', '-ant-', 'api03-', fake(40, 21)),
  // The gate captures the base64 AFTER the header, so these bodies are the secrets.
  pemBody: cat('MIIE', fake(60, 22, BASE64)), // PKCS#8, as in a GCP service-account file
  rsaBody: cat('MIIEpAIBAAKCAQEA', fake(64, 66, BASE64)), // PKCS#1, as a GitHub App key downloads
  ecBody: cat('MHcCAQEEI', fake(56, 67, BASE64)), // SEC1, as `openssl ecparam -genkey` writes it
  opensshBody: cat('b3BlbnNzaC1rZXktdjEAAAAA', fake(56, 68, BASE64)), // "openssh-key-v1", as ssh-keygen writes it
};
const pw = i => fake(15, 100 + i); // live-looking URI passwords (no provider prefix)

// ── Runner ───────────────────────────────────────────────────────────────────

/**
 * Hermetic git: no user/system config (a global excludesFile would change what
 * is tracked) and no inherited GIT_* variables (a pre-push hook exports GIT_DIR,
 * which would point `git ls-files` back at this repository).
 */
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
const gitEnv = { ...cleanEnv, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' };

const gateSource = fs.readFileSync(GATE, 'utf8');
const ROOT_LINE = /^const repoRoot = [^;\n]+;$/m;
if (!ROOT_LINE.test(gateSource)) {
  console.error(`${TAG} cannot point the gate at a fixture tree: ${GATE} no longer has a single-line \`const repoRoot = …;\`.`);
  process.exit(1);
}

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'committed-secrets-selftest-'));

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, env: gitEnv, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}:\n${r.stderr}`);
}

let caseNo = 0;
/** files: { relPath: content } written and `git add -A`ed (a .gitignore among them is honoured). */
function runGate(files, args = []) {
  const dir = path.join(base, `case-${++caseNo}`);
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, '-c', 'init.defaultBranch=main', 'init', '-q');
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(repo, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  git(repo, 'add', '-A');

  // The patched gate lives OUTSIDE the fixture repository, so it is never scanned.
  const gatePath = path.join(dir, 'gate.mjs');
  fs.writeFileSync(gatePath, gateSource.replace(ROOT_LINE, `const repoRoot = ${JSON.stringify(repo)};`));
  const r = spawnSync(process.execPath, [gatePath, ...args], { env: gitEnv, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout ?? '', out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** All the gate may show of a secret: its first four characters and its length. */
const shown = secret => `${secret.slice(0, 4)}…(${secret.length} chars)`;
const RULE = {
  uri: 'database/broker connection URI with an inline password  [connection-uri-with-password]',
  neon: 'Neon Postgres password  [neon-password]',
  aws: 'AWS access key id  [aws-access-key]',
  github: 'GitHub token  [github-token]',
  slack: 'Slack token  [slack-token]',
  stripe: 'Stripe live key  [stripe-live-key]',
  llm: 'LLM provider API key  [llm-api-key]',
  pem: 'private key block with key material  [private-key-block]',
};
/** One expected finding line, exactly as the gate prints it: `  file:line  what  [rule]  preview`. */
const hit = (file, line, rule, secret) => ({ text: `  ${file}:${line}  ${RULE[rule]}  ${shown(secret)}`, secret });
const FINDING_LINE = /^ {2}\S+:\d+ {2}/;
const count = n => `FAIL — ${n} possible committed credential(s)`;
const OK = '[ci:committed-secrets] OK';

/** The finding lines the gate produced, in the text format; --json findings are rendered into it. */
function findingLines(res, json) {
  if (!json) return res.out.split('\n').filter(l => FINDING_LINE.test(l));
  const { findings } = JSON.parse(res.stdout);
  return findings.map(f => `  ${f.file}:${f.line}  ${f.what}  [${f.rule}]  ${f.preview}`);
}

/** Index of the first 6-character run of `secret` (past its first character) found in `out`, or -1. */
function echoedAt(out, secret) {
  for (let i = 1; i + 6 <= secret.length; i++) if (out.includes(secret.slice(i, i + 6))) return i;
  return -1;
}

// ── Cases ────────────────────────────────────────────────────────────────────

const SEED_FILE = 'tests/e2e/seed-governed-workflow.cjs';
const SEED = [
  "const { Client } = require('pg');",
  '',
  '// Falls back to the shared database when DATABASE_URL is unset.',
  'const connectionString =',
  `  process.env.DATABASE_URL || '${uri('postgresql', 'neondb_owner', NPG_SEED, NEON_HOST, '/neondb?sslmode=require')}';`,
  '',
  'module.exports = { connectionString };',
  '',
].join('\n');

const DOC_FILE = 'docs/getting-started/AUTH_CREDENTIALS_LOCKED.md';
const DOC = [
  '# Authentication credentials (LOCKED)',
  '',
  '## Database',
  `DATABASE_URL=${uri('postgresql', 'neondb_owner', NPG_DOC, NEON_HOST, '/neondb?sslmode=require&channel_binding=require')}`,
  '- **Role:** `neondb_owner`',
  `- **Password:** \`${NPG_DOC}\``,
  '',
].join('\n');

const DB_FILE = 'server/config/database.ts';
const LIVE_URIS = [
  // Every scheme alternative, plain and TLS/SRV forms.
  uri('postgres', 'app', pw(1), RDS_HOST, ':5432/app'),
  uri('mysql', 'report', pw(2), 'report.test-replica.c9a1.eu-west-1.rds.amazonaws.com', ':3306/report'),
  uri('mongodb+srv', 'svc', pw(3), 'cluster0.ab1cd.mongodb.net', '/prod'),
  uri('rediss', 'default', pw(4), 'cache-01.upstash.io', ':6379'),
  uri('amqps', 'worker', pw(5), 'kangaroo.rmq.cloudamqp.com', '/vhost'),
  uri('mongodb', 'svc', pw(7), 'cluster0-shard-00-00.ab1cd.mongodb.net', ':27017/prod?ssl=true'),
  uri('amqp', 'worker', pw(8), 'hawk.rmq.cloudamqp.com', '/vhost'),
  // Live hosts whose first label IS a non-live name: Supabase's direct
  // connection, a Redis Cloud endpoint, and RDS's default instance identifier.
  uri('postgresql', 'postgres', pw(9), 'db.abcdefghijkl.supabase.co', ':5432/postgres'),
  uri('redis', 'default', pw(10), 'redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com', ':12345'),
  uri('mysql', 'admin', pw(11), 'database-1.c9a1xyz2.us-east-1.rds.amazonaws.com', ':3306/app'),
];
const LIVE_PWS = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11].map(pw);

// Real passwords that contain a stand-in, judged as a whole they are not one.
const PW_ADMIN_MID = cat(fake(4, 40), 'admin', fake(8, 41));
const PW_TEST_MID = cat(fake(4, 42), 'test', fake(8, 43));
const PW_DOLLAR = cat('$', fake(1, 44, LETTERS), fake(4, 45), '!', fake(9, 46)); // opens like $VAR, is not one

const cases = [
  {
    name: 'RED — INF-22 as committed: a neondb_owner URI as the e2e seed fallback',
    files: { [SEED_FILE]: SEED },
    expectExit: 1,
    hits: [hit(SEED_FILE, 5, 'uri', NPG_SEED), hit(SEED_FILE, 5, 'neon', NPG_SEED)],
  },
  {
    name: 'RED — INF-22 in the doc: the URL, and the bare npg_ password on its own line',
    files: { [DOC_FILE]: DOC },
    expectExit: 1,
    hits: [hit(DOC_FILE, 4, 'uri', NPG_DOC), hit(DOC_FILE, 4, 'neon', NPG_DOC), hit(DOC_FILE, 6, 'neon', NPG_DOC)],
  },
  {
    name: 'RED — a password URI to a live host: all nine schemes, and hosts that begin with, contain or end like a non-live name',
    // `db.…supabase.co`, `redis-….redislabs.com` and `database-1.…` BEGIN with a
    // non-live name; `prod-db…` contains "db", `….mongodb.net` contains "mongo",
    // `report.test-replica…` contains ".test": NON_LIVE_HOST must match whole
    // hosts and true suffixes, not prefixes or substrings.
    files: { [DB_FILE]: LIVE_URIS.map((u, i) => `export const URL_${i} = '${u}';`).join('\n') },
    expectExit: 1,
    hits: LIVE_PWS.map((p, i) => hit(DB_FILE, i + 1, 'uri', p)),
  },
  {
    name: 'RED — PLACEHOLDER judges the whole password: a stand-in word inside it, or a $VAR-like opening, does not excuse it',
    files: {
      'server/config/replica.ts': [
        `export const PRIMARY = '${uri('postgres', 'app', PW_ADMIN_MID, RDS_HOST, ':5432/app')}';`,
        `export const CACHE = '${uri('rediss', 'default', PW_TEST_MID, 'cache-01.upstash.io', ':6379')}';`,
        `export const REPLICA = '${uri('postgresql', 'app', PW_DOLLAR, 'replica-1.c9a1.eu-west-1.rds.amazonaws.com', ':5432/app')}';`,
      ].join('\n'),
    },
    expectExit: 1,
    hits: [
      hit('server/config/replica.ts', 1, 'uri', PW_ADMIN_MID),
      hit('server/config/replica.ts', 2, 'uri', PW_TEST_MID),
      hit('server/config/replica.ts', 3, 'uri', PW_DOLLAR),
    ],
  },
  {
    name: 'RED — one of each provider family: AWS, GitHub, Slack, Stripe live, LLM, PKCS#8 private key',
    files: {
      'deploy/aws.env': `AWS_REGION=us-east-1\nAWS_ACCESS_KEY_ID=${S.aws}\n`,
      'scripts/release.sh': `#!/bin/sh\nexport GITHUB_TOKEN=${S.ghp}\nexport GH_PAT=${S.ghPat}\n`,
      'server/integrations/slack.ts': `export const bot = '${S.slack}';\n`,
      'server/billing/stripe.ts': `export const live = '${S.stripeSk}';\nexport const restricted = '${S.stripeRk}';\n`,
      'server/ai/providers.ts': `export const oa = '${S.openai}';\nexport const an = '${S.anthropic}';\n`,
      'infra/gcp-service-account.json': [
        '{',
        // Spliced, like the S.* values: a literal service_account type line is
        // what Trivy's gcp-service-account rule matches, and it failed the
        // blocking filesystem scan on this fixture (2026-10-04).
        '  "type": "service_' + 'account",',
        `  "private_key": "${pemEscaped('', S.pemBody)}",`,
        '  "client_email": "svc@project.iam.gserviceaccount.com"',
        '}',
      ].join('\n'),
    },
    expectExit: 1,
    hits: [
      hit('deploy/aws.env', 2, 'aws', S.aws),
      hit('scripts/release.sh', 2, 'github', S.ghp),
      hit('scripts/release.sh', 3, 'github', S.ghPat),
      hit('server/integrations/slack.ts', 1, 'slack', S.slack),
      hit('server/billing/stripe.ts', 1, 'stripe', S.stripeSk),
      hit('server/billing/stripe.ts', 2, 'stripe', S.stripeRk),
      hit('server/ai/providers.ts', 1, 'llm', S.openai),
      hit('server/ai/providers.ts', 2, 'llm', S.anthropic),
      hit('infra/gcp-service-account.json', 3, 'pem', S.pemBody),
    ],
  },
  {
    name: 'RED — every variant inside a family: AWS ASIA, GitHub gho_/ghs_/ghu_, Slack xoxp/xoxa/xoxr/xoxs, RSA/EC/OPENSSH key headers',
    files: {
      'tests/fixtures/sts-assume-role.json': [
        '{',
        '  "Credentials": {',
        `    "AccessKeyId": "${S.awsSts}",`,
        '    "Expiration": "2026-09-30T12:00:00Z"',
        '  }',
        '}',
      ].join('\n'),
      'config/gh-hosts.yml': `github.com:\n    user: release-bot\n    oauth_token: ${S.gho}\n    git_protocol: https\n`,
      'scripts/publish-release.sh': `#!/bin/sh\ncurl -fsS -H "Authorization: token ${S.ghs}" https://api.github.com/repos/acme/app/releases\n`,
      'server/integrations/github-app.ts': `export const userToServer = '${S.ghu}';\n`,
      'server/integrations/slack-legacy.ts': [
        `export const user = '${S.slackUser}';`,
        `export const workspace = '${S.slackWorkspace}';`,
        `export const workspaceRefresh = '${S.slackWorkspaceRefresh}';`,
        `export const session = '${S.slackSession}';`,
      ].join('\n'),
      'config/github-app.json': `{\n  "appId": 123456,\n  "privateKey": "${pemEscaped('RSA ', S.rsaBody)}"\n}\n`,
      'config/jwt-signing.yaml': `algorithm: ES256\nprivate_key: "${pemEscaped('EC ', S.ecBody)}"\n`,
      'scripts/deploy/ssh-key.ts': `export const DEPLOY_KEY = '${pemEscaped('OPENSSH ', S.opensshBody)}';\n`,
    },
    expectExit: 1,
    hits: [
      hit('tests/fixtures/sts-assume-role.json', 3, 'aws', S.awsSts),
      hit('config/gh-hosts.yml', 3, 'github', S.gho),
      hit('scripts/publish-release.sh', 2, 'github', S.ghs),
      hit('server/integrations/github-app.ts', 1, 'github', S.ghu),
      hit('server/integrations/slack-legacy.ts', 1, 'slack', S.slackUser),
      hit('server/integrations/slack-legacy.ts', 2, 'slack', S.slackWorkspace),
      hit('server/integrations/slack-legacy.ts', 3, 'slack', S.slackWorkspaceRefresh),
      hit('server/integrations/slack-legacy.ts', 4, 'slack', S.slackSession),
      hit('config/github-app.json', 3, 'pem', S.rsaBody),
      hit('config/jwt-signing.yaml', 2, 'pem', S.ecBody),
      hit('scripts/deploy/ssh-key.ts', 1, 'pem', S.opensshBody),
    ],
  },
  {
    name: 'RED — a placeholder is judged on the secret, not the line ("example"/"placeholder" nearby do not excuse it)',
    files: {
      'docs/setup.md': `Example only (placeholder for your_user): ${uri('postgresql', 'your_user', NPG_SEED, NEON_HOST, '/neondb')}\n`,
    },
    expectExit: 1,
    hits: [hit('docs/setup.md', 1, 'uri', NPG_SEED), hit('docs/setup.md', 1, 'neon', NPG_SEED)],
  },
  {
    name: 'RED — the escape hatch is same-line only: a marker on the line above excuses nothing',
    files: {
      'tests/unit/vectors.test.ts': [
        '// ci-secret-scan-ignore: the next line is a test vector',
        `const VECTOR = '${uri('postgresql', 'neondb_owner', NPG_SEED, NEON_HOST, '/neondb')}';`,
      ].join('\n'),
    },
    expectExit: 1,
    hits: [hit('tests/unit/vectors.test.ts', 2, 'uri', NPG_SEED), hit('tests/unit/vectors.test.ts', 2, 'neon', NPG_SEED)],
  },
  {
    name: 'RED — only the scanner\'s own file is exempt: a sibling CI script, or a same-named file elsewhere, is scanned',
    files: {
      'scripts/ci/check-something-else.mjs': `const k = '${S.aws}';\n`,
      'tools/check-committed-secrets.mjs': `const k = '${S.aws}';\n`,
    },
    expectExit: 1,
    hits: [hit('scripts/ci/check-something-else.mjs', 1, 'aws', S.aws), hit('tools/check-committed-secrets.mjs', 1, 'aws', S.aws)],
  },
  {
    name: 'RED — --json carries each finding with file, line, rule and the same shape-only preview, and still exits 1',
    files: { [SEED_FILE]: SEED },
    args: ['--json'],
    expectExit: 1,
    hits: [hit(SEED_FILE, 5, 'uri', NPG_SEED), hit(SEED_FILE, 5, 'neon', NPG_SEED)],
  },
  {
    name: 'quiet — docs show the URL shape with stand-ins for the password, against live hosts',
    files: {
      'docs/deploy.md': [
        uri('postgresql', 'neondb_owner', '${DB_PASSWORD}', NEON_HOST, '/neondb'),
        uri('postgresql', 'neondb_owner', '<password>', NEON_HOST, '/neondb'),
        uri('postgres', 'app_service', 'your_password', NEON_HOST, '/neondb'),
        uri('postgres', 'app', 'changeme', RDS_HOST, '/app'),
        uri('postgres', 'app', '********', RDS_HOST, '/app'),
        uri('postgres', 'app', 'REDACTED', NEON_HOST, '/neondb'),
        uri('postgresql', 'postgres', '[YOUR-PASSWORD]', 'db.abcdefghijkl.supabase.co', ':5432/postgres'),
        uri('redis', 'default', '${REDIS_PASSWORD}', 'redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com', ':12345'),
        'Neon passwords look like `npg_…`; INF-22 was one of those.',
      ].join('\n'),
    },
    expectExit: 0,
    hits: [],
    mustSay: [OK],
  },
  {
    name: 'quiet — real-looking passwords aimed at hosts that cannot be live (CI service containers, reserved names)',
    files: {
      '.github/ci-services.env': [
        uri('postgres', 'postgres', pw(6), 'localhost', ':5432/test'),
        uri('postgresql', 'ci', pw(6), '127.0.0.1', ':5432/ci'),
        uri('postgres', 'app', pw(6), 'postgres', ':5432/app'),
        uri('redis', 'default', pw(6), 'redis', ':6379'),
        uri('mongodb', 'root', pw(6), 'mongo', ':27017'),
        uri('postgres', 'app', pw(6), 'db.example.com', '/app'),
        uri('amqp', 'guest', pw(6), 'rabbit.internal', ':5672'),
        uri('postgres', 'app', pw(6), 'host.docker.internal', ':5432/app'),
      ].join('\n'),
    },
    expectExit: 0,
    hits: [],
    mustSay: [OK],
  },
  {
    name: 'quiet — provider near-misses: Stripe test and publishable keys, a bare PEM marker, an empty PEM template',
    files: {
      'server/billing/stripe.test.ts': [
        `const testKey = '${cat('sk', '_test_', fake(24, 30))}';`,
        `const restrictedTest = '${cat('rk', '_test_', fake(24, 31))}';`,
        `const publishable = '${cat('pk', '_live_', fake(24, 32))}';`,
      ].join('\n'),
      'client/src/settings/SigningKeyField.tsx': [
        `<textarea placeholder="${PEM_HEADER}..." />`,
        `const TEMPLATE = '${PEM_HEADER}\\n...\\n${PEM_FOOTER}';`,
      ].join('\n'),
    },
    expectExit: 0,
    hits: [],
    mustSay: [OK],
  },
  {
    name: 'quiet — the escape hatch on the same line excuses a negative-test vector',
    files: {
      'tests/unit/vectors.test.ts': `const VECTOR = '${uri('postgresql', 'neondb_owner', NPG_SEED, NEON_HOST, '/neondb')}'; // ci-secret-scan-ignore: negative-test vector for the URI rule\n`,
    },
    expectExit: 0,
    hits: [],
    mustSay: [OK],
  },
  {
    name: 'quiet — a gitignored local .env holding the live URL is not a committed secret',
    files: {
      '.gitignore': '.env\nnode_modules/\n',
      '.env': `DATABASE_URL=${uri('postgresql', 'neondb_owner', NPG_SEED, NEON_HOST, '/neondb?sslmode=require')}\n`,
      '.env.example': `DATABASE_URL=${uri('postgresql', 'user', 'password', 'localhost', ':5432/app')}\n`,
    },
    expectExit: 0,
    hits: [],
    mustSay: [OK],
  },
  {
    name: 'quiet — this selftest\'s own source, committed, does not trip the gate it tests',
    files: { 'scripts/ci/check-committed-secrets.selftest.mjs': fs.readFileSync(SELF, 'utf8') },
    expectExit: 0,
    hits: [],
    mustSay: [OK],
  },
];

// ── Known gaps: probed and reported, never asserted (see the header) ─────────

const RSA_HEADER = cat('-----BEGIN ', 'RSA ', 'PRIVATE KEY-----');
const RSA_FOOTER = cat('-----END ', 'RSA ', 'PRIVATE KEY-----');
const PGP_HEADER = cat('-----BEGIN ', 'PGP ', 'PRIVATE KEY BLOCK-----');
const PGP_FOOTER = cat('-----END ', 'PGP ', 'PRIVATE KEY BLOCK-----');
const KNOWN_GAPS = [
  {
    what: 'a private key committed as an ordinary multi-line PEM file',
    file: 'deploy/server.key',
    content: [
      RSA_HEADER,
      cat('MIIEpAIBAAKCAQEA', fake(48, 80, BASE64)),
      ...[81, 82, 83, 84].map(seed => fake(64, seed, BASE64)),
      RSA_FOOTER,
      '',
    ].join('\n'),
  },
  {
    what: 'an OpenPGP armored private key (its header ends PRIVATE KEY BLOCK)',
    file: 'config/release-signing.json',
    content: `{\n  "armoredKey": "${cat(PGP_HEADER, '\\n\\n', 'lQOYB', fake(59, 90, BASE64), '\\n', fake(64, 91, BASE64), '\\n=', fake(4, 92, BASE64), '\\n', PGP_FOOTER, '\\n')}"\n}\n`,
  },
  {
    what: 'a live-host password of word characters that begins with a stand-in word (admin…)',
    file: 'server/config/reporting.ts',
    content: `export const REPORTING_DB = '${uri('postgres', 'app', cat('admin', '2024', 'Prod', fake(8, 93)), RDS_HOST, ':5432/app')}';\n`,
  },
  {
    what: 'a Slack xoxe- refresh token',
    file: 'server/integrations/slack-rotation.ts',
    content: `export const refreshToken = '${cat('xox', 'e-', '1-', fake(146, 94, UPPER_DIGIT))}';\n`,
  },
  {
    what: 'a GitHub ghr_ refresh token',
    file: 'server/integrations/github-oauth.ts',
    content: `export const refreshToken = '${cat('ghr', '_', fake(76, 95))}';\n`,
  },
];

// ── Run ──────────────────────────────────────────────────────────────────────

if (GATE !== path.join(repoRoot, 'scripts', 'ci', 'check-committed-secrets.mjs')) {
  console.log(`${TAG} testing ${GATE} (SELFTEST_GATE_PATH)`);
}

let failed = 0;
try {
  for (const c of cases) {
    const json = (c.args ?? []).includes('--json');
    const res = runGate(c.files, c.args ?? []);
    const problems = [];
    if (res.code !== c.expectExit) problems.push(`expected exit ${c.expectExit}, got ${res.code}`);
    const mustSay = [...(c.mustSay ?? []), ...(!json && c.hits.length ? [count(c.hits.length)] : [])];
    for (const s of mustSay) if (!res.out.includes(s)) problems.push(`output lacked: ${JSON.stringify(s)}`);

    // The complete set of findings, each line exact (file, line, rule, shape-only preview).
    let got = [];
    try {
      got = findingLines(res, json);
    } catch (err) {
      problems.push(`could not read the findings: ${err.message}`);
    }
    const unmatched = [...got];
    for (const { text } of c.hits) {
      const i = unmatched.indexOf(text);
      if (i === -1) problems.push(`missing finding: ${JSON.stringify(text)}`);
      else unmatched.splice(i, 1);
    }
    for (const text of unmatched) problems.push(`unexpected finding: ${JSON.stringify(text)}`);

    // The gate prints to CI logs: it must locate a secret without reproducing it.
    for (const secret of new Set(c.hits.map(h => h.secret))) {
      const i = echoedAt(res.out, secret);
      if (i !== -1) problems.push(`output reproduced characters ${i}–${i + 5} of a secret (${shown(secret)})`);
    }

    console.log(`  ${problems.length ? '✗' : '✓'} ${c.name}`);
    if (problems.length) {
      failed++;
      for (const p of problems) console.log(`      ${p}`);
      console.log(res.out.trimEnd().split('\n').map(l => `      | ${l}`).join('\n'));
    }
  }

  const probe = runGate(Object.fromEntries(KNOWN_GAPS.map(g => [g.file, g.content])));
  console.log('\n  Known gaps of the gate — reported, not asserted (see this file\'s header):');
  for (const g of KNOWN_GAPS) {
    const caught = probe.out.split('\n').some(l => l.startsWith(`  ${g.file}:`));
    console.log(caught ? `    + now caught: ${g.what} — move it into a RED case` : `    - not caught: ${g.what}`);
  }
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) did not hold.`);
  process.exit(1);
}
console.log(`\n${TAG} ${cases.length} passed — the gate fails on what it exists to catch.`);

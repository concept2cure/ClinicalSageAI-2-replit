#!/usr/bin/env node
/**
 * CI Guard: no live credentials committed to the tree.
 *
 * Why this exists as its own guard rather than as a Semgrep rule:
 * `.github/workflows/semgrep.yml` is deliberately `continue-on-error: true`
 * ("keep it non-blocking so pre-existing repo-wide findings surface in the
 * Security tab without gating every PR"). That is a reasonable call for a broad
 * ruleset with a triage backlog — but it means nothing in CI could ever *block*
 * a committed secret. This guard is deliberately narrow so it can be blocking
 * from day one: it looks only for credential material that has no legitimate
 * reason to appear in a tracked file, so it has no backlog to ratchet through.
 *
 * What prompted it: a live `neondb_owner` Postgres password sat in two tracked
 * files — `docs/getting-started/AUTH_CREDENTIALS_LOCKED.md` (as a URL *and* in
 * plaintext) and `tests/e2e/seed-governed-workflow.cjs` (as a fallback default
 * used whenever DATABASE_URL was unset). Two DIFFERENT passwords for the same
 * endpoint, both for the OWNER role — strictly above the non-superuser
 * `app_service` role the whole tenant-RLS program depends on. Nothing in CI
 * noticed, from 2026-01-23 until they were removed.
 *
 * Scope, kept tight on purpose:
 *   - connection URIs carrying an inline password (postgres/mysql/mongodb/redis/amqp)
 *   - provider secret prefixes that are unambiguous (Neon npg_, AWS AKIA,
 *     GitHub ghp_/gho_/ghs_/github_pat_, Slack xox*, Stripe live sk_live_/rk_live_,
 *     OpenAI sk-proj-/sk-ant-, private key PEM blocks)
 *
 * Placeholders are allowed, so docs can still SHOW the shape of a URL. A match
 * is ignored when its secret component is an obvious stand-in (see PLACEHOLDER).
 *
 * Escape hatch: put `ci-secret-scan-ignore` in a comment on the same line, with
 * a reason. Use it for fixtures and negative-test vectors, never for a real
 * credential that is "about to be rotated" — rotate it instead.
 *
 * Usage:
 *   node scripts/ci/check-committed-secrets.mjs          # scan tracked files
 *   node scripts/ci/check-committed-secrets.mjs --json
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const asJson = process.argv.includes('--json');

/** Secret shapes with no legitimate reason to be committed. */
const PATTERNS = [
  {
    id: 'connection-uri-with-password',
    // scheme://user:secret@host — the secret group is what we judge, and the
    // host group decides whether it could be live at all.
    re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqps?):\/\/[A-Za-z0-9._%-]+:([^@\s'"`]{6,})@([A-Za-z0-9._-]+)/g,
    what: 'database/broker connection URI with an inline password',
    hostGroup: 2,
  },
  { id: 'neon-password', re: /\b(npg_[A-Za-z0-9]{12,})\b/g, what: 'Neon Postgres password' },
  { id: 'aws-access-key', re: /\b((?:AKIA|ASIA)[0-9A-Z]{16})\b/g, what: 'AWS access key id' },
  {
    id: 'github-token',
    re: /\b((?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/g,
    what: 'GitHub token',
  },
  { id: 'slack-token', re: /\b(xox[abprs]-[A-Za-z0-9-]{10,})\b/g, what: 'Slack token' },
  { id: 'stripe-live-key', re: /\b((?:sk|rk)_live_[A-Za-z0-9]{16,})\b/g, what: 'Stripe live key' },
  {
    id: 'llm-api-key',
    re: /\b(sk-proj-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,})\b/g,
    what: 'LLM provider API key',
  },
  {
    id: 'private-key-block',
    // Require real key material after the header. A bare marker is how UI
    // `placeholder:` strings and prior scan-evidence artifacts show the SHAPE of
    // a key ("-----BEGIN PRIVATE KEY-----..."); those are not keys. Demanding
    // >=32 chars of contiguous base64 keeps the rule pointed at actual material.
    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\\rn"']*([A-Za-z0-9+/=]{32,})/g,
    what: 'private key block with key material',
  },
];

/**
 * Hosts that cannot be a live credential target: loopback, RFC 2606 reserved
 * example/test domains, and non-routable dev suffixes. A password aimed at one
 * of these is a fixture, a template, or a CI service container.
 */
const NON_LIVE_HOST =
  /^(?:localhost|127\.0\.0\.1|\[?::1\]?|0\.0\.0\.0|host\.docker\.internal|postgres|db|database|redis|mysql|mongo)$|\.(?:example\.(?:com|org|net)|example|invalid|test|local|localdomain|internal)$/i;

/**
 * Stand-ins that legitimately appear in docs, examples and .env templates.
 * Judged against the captured secret, not the whole line.
 */
const PLACEHOLDER =
  /^(?:\$\{?[A-Z_][A-Z0-9_]*\}?|<[^>]*>|\[[^\]]*\]|\.{3,}|x{3,}|\*{3,}|change[_-]?me[\w-]*|your[_-]?\w+|example\w*|placeholder\w*|redacted\w*|dummy\w*|fake\w*|sample\w*|test\w*|password\w*|pass(?:word)?123|secret\w*|s3cret|user\w*|admin\w*|postgres\w*|localhost|REPLACE\w*|TODO\w*)$/i;

const IGNORE_MARKER = 'ci-secret-scan-ignore';

/** Binary/vendored paths that are never worth scanning. */
const SKIP_DIR = /(^|\/)(node_modules|dist|build|coverage|\.git|attached_assets|\.next)(\/|$)/;
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.pdf', '.zip', '.gz',
  '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.lockb', '.wasm',
]);

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 });
  return out
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter(f => !SKIP_DIR.test(f) && !SKIP_EXT.has(path.extname(f).toLowerCase()));
}

const findings = [];

for (const rel of trackedFiles()) {
  const abs = path.join(repoRoot, rel);
  let text;
  try {
    const stat = fs.statSync(abs);
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024) continue;
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\0')) continue; // binary

  const lines = text.split('\n');
  for (const { id, re, what, hostGroup } of PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(IGNORE_MARKER)) continue;
      // This scanner's own pattern table necessarily contains the shapes.
      if (rel === 'scripts/ci/check-committed-secrets.mjs') continue;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const secret = m[1] ?? m[0];
        if (PLACEHOLDER.test(secret)) continue;
        if (hostGroup && NON_LIVE_HOST.test(m[hostGroup] ?? '')) continue;
        findings.push({
          file: rel,
          line: i + 1,
          rule: id,
          what,
          // Never echo the secret: shape only, enough to locate it.
          preview: `${secret.slice(0, 4)}…(${secret.length} chars)`,
        });
      }
    }
  }
}

if (asJson) {
  process.stdout.write(`${JSON.stringify({ findings }, null, 2)}\n`);
} else if (findings.length === 0) {
  console.log('[ci:committed-secrets] OK — no committed credential material found in tracked files.');
} else {
  console.error(
    `[ci:committed-secrets] FAIL — ${findings.length} possible committed credential(s):\n`,
  );
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.what}  [${f.rule}]  ${f.preview}`);
  }
  console.error(
    '\n  A committed credential must be ROTATED, not just deleted — removing it from the\n' +
      '  working tree leaves it in git history. Rotate at the provider, then take the value\n' +
      '  from the environment instead of a tracked file.\n' +
      '\n  If this is a fixture or a negative-test vector, add a same-line comment containing\n' +
      `  \`${IGNORE_MARKER}\` with a reason.\n`,
  );
}

process.exit(findings.length === 0 ? 0 : 1);

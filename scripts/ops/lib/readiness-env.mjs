/**
 * readiness-env.mjs — the one place a readiness probe decides whose environment
 * it is judging.
 *
 * ── The defect this exists to close ─────────────────────────────────────────
 * `ga-readiness-report.mjs` and `pilot-go-no-go.mjs` both opened with
 * `dotenv.config({ quiet: true })`. That merges the repository's gitignored
 * development `.env` into `process.env` BEFORE a single row is judged. Two
 * consequences, both measured on 2026-10-11 at 1c8e565f:
 *
 *   1. A launch BLOCKER read green off a developer's laptop. Row `flag-rls`
 *      ("RLS enforcement (RLS_ENFORCE=on)", severity blocker, owner "Ops
 *      (deploy env)") reported `ready` with `observed: RLS_ENFORCE="on"` —
 *      sourced from `.env`, not from any deployment. On the same tree
 *      `pilot-go-no-go` said of the same switch: "RLS_ENFORCE=on but no table
 *      FORCEs row security, so the switch currently filters nothing."
 *      The optimistic instrument is the one the launch definition of done
 *      names as its dashboard.
 *
 *   2. The headline number depended on where you stood. `dotenv.config()`
 *      resolves `.env` from `process.cwd()`, not the repository root, so the
 *      same script on the same commit answered 6 ready / 18 blockers from the
 *      repo root and 5 ready / 19 blockers from anywhere else.
 *
 * `ga-readiness-report.mjs`'s own design contract forbids exactly this:
 * "Every row states what was OBSERVED, not what was assumed. Nothing is ever
 * reported ready on the strength of a comment, a doc, or an intention."
 * A dev convenience file is an intention.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * A readiness probe judges the environment it is actually running in. It does
 * not read a local file by default. Local loading stays available — an
 * engineer checking their own box is a real use — but it is opt-in, resolved
 * from the repository root so the answer cannot move with the shell's cwd, and
 * LABELLED, so no reader mistakes a laptop for a deployment.
 *
 * Verification tools are deliberately untouched: `verify-audit-chain.mjs` and
 * `verify-otp-delivery.mjs` need credentials to perform an action, and loading
 * `.env` to connect is not the same act as judging readiness from it.
 *
 * @module scripts/ops/lib/readiness-env
 */
import fs from 'node:fs';
import path from 'node:path';

/** The flag that opts a probe into reading the repository's local `.env`. */
export const INCLUDE_LOCAL_ENV_FLAG = '--include-local-env';

/**
 * Decide, and record, whose environment this probe is judging.
 *
 * Returns `{ localEnvLoaded, envPath, keys }` so the caller can label its
 * output. `keys` lists the names a local file contributed — never the values,
 * matching the probes' secret-handling contract.
 */
export function loadReadinessEnv({ repoRoot, argv = process.argv } = {}) {
  if (!argv.includes(INCLUDE_LOCAL_ENV_FLAG)) {
    return { localEnvLoaded: false, envPath: null, keys: [] };
  }
  // Resolved from the repository root, never process.cwd(): a readiness
  // verdict that changes with the shell's working directory is not a verdict.
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return { localEnvLoaded: false, envPath, keys: [] };
  }
  const parsed = parseDotEnv(fs.readFileSync(envPath, 'utf8'));
  const keys = [];
  for (const [k, v] of Object.entries(parsed)) {
    // A real environment variable always wins over the file, which is dotenv's
    // own precedence and the only safe direction: an operator's explicit
    // setting must not be overwritten by a checked-out convenience file.
    if (process.env[k] === undefined) {
      process.env[k] = v;
      keys.push(k);
    }
  }
  return { localEnvLoaded: true, envPath, keys: keys.sort() };
}

/**
 * Minimal `.env` parser — KEY=VALUE, `#` comments, optional surrounding
 * quotes. Deliberately small: this replaces a dependency whose only job here
 * was the behaviour above, and a probe should not import a package to read
 * fifty lines of `KEY=VALUE`.
 */
export function parseDotEnv(text) {
  const out = {};
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * The line a probe prints so its reader knows whose box produced the verdict.
 * Stated on both paths: silence about the default would leave the honest case
 * indistinguishable from the old silent-merge behaviour.
 */
export function readinessEnvNotice(state) {
  if (state.localEnvLoaded) {
    return (
      `LOCAL ENV LOADED from ${state.envPath} (${state.keys.length} name(s) supplied: ` +
      `${state.keys.join(', ') || 'none'}). This verdict describes THIS MACHINE, ` +
      `not a deployment. Re-run without ${INCLUDE_LOCAL_ENV_FLAG} for the deployment-truth answer.`
    );
  }
  return `Judging the process environment only. Pass ${INCLUDE_LOCAL_ENV_FLAG} to include the repository's local .env (labelled, and never deployment truth).`;
}

export default { loadReadinessEnv, parseDotEnv, readinessEnvNotice, INCLUDE_LOCAL_ENV_FLAG };

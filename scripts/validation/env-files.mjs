/**
 * The environment the IQ runner qualifies, read from the same files in the same
 * order as the server (server/config/load-env-files.ts): `.env.local`, then
 * `.env`, the first file to define a key winning, and the process environment
 * over both. `npm run up` writes the provisioned database into `.env.local`; an
 * IQ that read `.env` alone qualified a different database from the one the
 * server and the OQ protocols then used.
 *
 * The file list is duplicated from the server module because this runs under
 * plain node, which cannot import the server's TypeScript. The two are held
 * equal by tests/validation-iq-env-files.test.ts.
 */
import fs from 'node:fs';
import path from 'node:path';

export const ENV_FILES = ['.env.local', '.env'];

/** Parse KEY=VALUE lines from a dotenv file without exporting them. */
export function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/** What the env files under `root` set, first file to define a key winning. */
export function readEnvFiles(root) {
  const out = {};
  for (const name of ENV_FILES) {
    for (const [key, value] of Object.entries(parseEnvFile(path.join(root, name)))) {
      if (!(key in out)) out[key] = value;
    }
  }
  return out;
}

/** The environment the server would see when started from `root`. */
export function resolveEnv(root, processEnv = process.env) {
  return { ...readEnvFiles(root), ...processEnv };
}

/** Evidence belongs to the actual run date unless an explicit historical run is selected. */
export function resolveRunDate(value = process.env.VALIDATION_RUN_DATE, now = new Date()) {
  const date = value ?? now.toISOString().slice(0, 10);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('VALIDATION_RUN_DATE must be a calendar-valid YYYY-MM-DD date.');
  }
  return date;
}

/** Presence evidence uses effective configuration and never carries credential values. */
export function configurationPresence(required, env) {
  const present = key => typeof env[key] === 'string' && env[key].trim().length > 0;
  const providerConfigured = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'KIMI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY']
    .some(key => present(key) && !/^sk-\.\.\./.test(env[key]));
  return { set: required.filter(present), unset: required.filter(key => !present(key)), providerConfigured };
}

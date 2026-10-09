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

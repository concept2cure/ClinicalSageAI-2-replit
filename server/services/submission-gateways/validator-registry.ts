/**
 * Extensible submission-validator registry.
 *
 * This module lists the validators that can contribute findings to a package's
 * pre-flight check and provides a GENERIC HTTP adapter for calling an external
 * validator service.
 *
 * IMPORTANT — honesty about external validators:
 *   The `internal` validator is the in-process eCTD structural validator
 *   (see ectd-structural-validator.ts) and is always available.
 *
 *   The agency validators (`fda_evalidator`, `ema_validator`, `pmda_precheck`)
 *   are the proprietary external tools (FDA eValidator / Lorenz, EMA technical
 *   validation, PMDA pre-check). We do NOT have those tools here. They are
 *   CONFIGURATION-GATED: each is `configured()` only when its `*_VALIDATOR_URL`
 *   env var is set. When unconfigured (the default, and the only state exercised
 *   in tests/CI) they contribute NO findings and report `ran:false` — never a
 *   false green.
 *
 * IMPORTANT — `runHttpValidator` is a GENERIC adapter contract, NOT a real
 *   vendor protocol. It POSTs the bundle zip to the configured `*_VALIDATOR_URL`
 *   and parses a documented generic JSON response into `EctdFinding[]`. It does
 *   NOT implement FDA eValidator's, Lorenz's, EMA's, or PMDA's actual request/
 *   response protocols. Wiring a real agency validator requires the vendor's
 *   tooling/credentials and conforming this adapter (or a vendor-specific one) to
 *   the vendor's actual contract. Until then, pre-flight reflects internal
 *   structural validation only.
 *
 * Generic adapter contract (documented):
 *   Request:  POST <*_VALIDATOR_URL>
 *             Content-Type: application/octet-stream
 *             Authorization: Bearer <*_VALIDATOR_TOKEN>   (optional)
 *             X-Bundle-Sha256: <sha256>                    (informational)
 *             X-Bundle-Format: <format>                    (informational)
 *             Body: the raw eCTD bundle zip bytes
 *   Response (2xx, application/json):
 *             { "findings": [
 *                 { "severity": "error"|"warning"|"info",
 *                   "ruleId"?: string,
 *                   "ruleTitle"?: string,
 *                   "message": string,
 *                   "filePath"?: string } ] }
 *   Any non-2xx status, non-JSON body, or missing `findings` array is treated as
 *   a validator ERROR (the caller records the validator as errored, never as a
 *   pass).
 */
import type { EctdFinding } from './ectd-structural-validator';

export interface ValidatorProvider {
  id: string;
  label: string;
  /** True when this validator can run in the current environment. */
  configured(): boolean;
}

/** The env var that gates each external validator, and its optional token env. */
interface ExternalValidatorConfig {
  urlEnv: string;
  tokenEnv: string;
}

const EXTERNAL_CONFIG: Record<string, ExternalValidatorConfig> = {
  fda_evalidator: { urlEnv: 'FDA_VALIDATOR_URL', tokenEnv: 'FDA_VALIDATOR_TOKEN' },
  ema_validator: { urlEnv: 'EMA_VALIDATOR_URL', tokenEnv: 'EMA_VALIDATOR_TOKEN' },
  pmda_precheck: { urlEnv: 'PMDA_VALIDATOR_URL', tokenEnv: 'PMDA_VALIDATOR_TOKEN' },
};

function externalConfigured(id: string): boolean {
  const cfg = EXTERNAL_CONFIG[id];
  return !!cfg && !!process.env[cfg.urlEnv];
}

/**
 * The validator registry. `internal` is always configured; the agency
 * validators are gated on their `*_VALIDATOR_URL` env var (see EXTERNAL_CONFIG).
 */
export const VALIDATOR_REGISTRY: ValidatorProvider[] = [
  { id: 'internal', label: 'Internal structural', configured: () => true },
  { id: 'fda_evalidator', label: 'FDA eValidator', configured: () => externalConfigured('fda_evalidator') },
  { id: 'ema_validator', label: 'EMA technical validation', configured: () => externalConfigured('ema_validator') },
  { id: 'pmda_precheck', label: 'PMDA pre-check', configured: () => externalConfigured('pmda_precheck') },
];

/** Map the registry to its current configuration status. */
export function listValidators(): { id: string; label: string; configured: boolean }[] {
  return VALIDATOR_REGISTRY.map((v) => ({ id: v.id, label: v.label, configured: v.configured() }));
}

function normalizeSeverity(value: unknown): 'error' | 'warning' | 'info' {
  return value === 'error' || value === 'warning' || value === 'info' ? value : 'info';
}

/**
 * Call a configured external validator over HTTP using the generic adapter
 * contract documented at the top of this file. Only call when the validator's
 * `configured()` is true.
 *
 * Throws a clear error on a missing URL, non-2xx status, or unparseable body so
 * the caller can record the validator as errored (NOT as a pass).
 */
export async function runHttpValidator(
  id: string,
  zip: Buffer,
  meta: { sha256: string; format: string },
): Promise<EctdFinding[]> {
  const cfg = EXTERNAL_CONFIG[id];
  if (!cfg) throw new Error(`Unknown external validator '${id}'`);
  const url = process.env[cfg.urlEnv];
  if (!url) throw new Error(`Validator '${id}' is not configured (${cfg.urlEnv} unset)`);
  const token = process.env[cfg.tokenEnv];

  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'X-Bundle-Sha256': meta.sha256,
    'X-Bundle-Format': meta.format,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      // Copy into a fresh Uint8Array so the typed body matches BodyInit cleanly.
      body: new Uint8Array(zip),
    });
  } catch (e) {
    throw new Error(
      `Validator '${id}' request failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!res.ok) {
    throw new Error(`Validator '${id}' returned HTTP ${res.status}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (e) {
    throw new Error(
      `Validator '${id}' returned an unparseable response: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const findings = (body as { findings?: unknown })?.findings;
  if (!Array.isArray(findings)) {
    throw new Error(`Validator '${id}' response is missing a 'findings' array`);
  }

  return findings.map((raw): EctdFinding => {
    const f = (raw ?? {}) as Record<string, unknown>;
    const ruleTitle = typeof f.ruleTitle === 'string' ? f.ruleTitle : undefined;
    const baseMessage = typeof f.message === 'string' ? f.message : '';
    return {
      severity: normalizeSeverity(f.severity),
      ruleId: typeof f.ruleId === 'string' ? f.ruleId : `${id.toUpperCase()}-FINDING`,
      message: ruleTitle && baseMessage ? `${ruleTitle}: ${baseMessage}` : ruleTitle || baseMessage,
      filePath: typeof f.filePath === 'string' ? f.filePath : undefined,
    };
  });
}

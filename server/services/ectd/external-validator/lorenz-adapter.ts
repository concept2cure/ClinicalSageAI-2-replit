/**
 * LORENZ eValidator adapter — the licensed, agency-grade engine target.
 *
 * `isConfigured()` is true only when `EVALIDATOR_BINARY`/`EVALIDATOR_ENDPOINT`
 * points at an existing engine. When configured, `validate()`:
 *   - CLI mode  (a filesystem path): spawns the engine with a configurable arg
 *     template (`EVALIDATOR_ARGS`, placeholders {packageDir} {profile} {report}),
 *     then reads + parses the report it writes;
 *   - endpoint mode (http/https): POSTs {packageDir, profile} and parses the
 *     response body.
 * Reports are parsed by a well-defined JSON contract (preferred) or a tolerant
 * LORENZ-style XML parser, into the shared ExternalValidationReport.
 *
 * HONEST FAIL-CLOSED: an un-configured engine is handled by the resolver (the
 * no-op is used instead). A configured engine that fails to run or whose report
 * cannot be parsed THROWS — never a fabricated pass. The dispatch gate treats a
 * throw / un-run validation as "not passed", so this can never silently clear a
 * package the agency validator hasn't actually approved.
 *
 * @module server/services/ectd/external-validator/lorenz-adapter
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { parseStringPromise } from 'xml2js';
import { evalidatorBinary, evalidatorProfile } from './config';
import {
  tallyFindings,
  type ExternalValidator,
  type ExternalValidationReport,
  type ExternalValidationFinding,
  type ValidationSeverity,
  type ValidateArgs,
} from './types';

/** Map an engine's severity token to our tri-state severity. */
export function normalizeSeverity(raw: string | undefined): ValidationSeverity {
  const s = String(raw ?? '').trim().toLowerCase();
  if (['error', 'err', 'high', 'fail', 'failure', 'critical'].includes(s)) return 'error';
  if (['warning', 'warn', 'medium', 'low'].includes(s)) return 'warning';
  return 'info';
}

/** The severity words a JSON report may use, and what each one counts as. */
const JSON_SEVERITY: ReadonlyMap<string, ValidationSeverity> = new Map([
  ...['error', 'err', 'high', 'fail', 'failure', 'failed', 'critical', 'fatal'].map((w) => [w, 'error'] as const),
  ...['warning', 'warn', 'medium', 'low'].map((w) => [w, 'warning'] as const),
  ...['info', 'information', 'informational', 'notice', 'pass', 'passed', 'ok'].map((w) => [w, 'info'] as const),
]);

/**
 * Parse a JSON eValidator report. Accepts either our native shape
 * ({validator?, profile?, findings:[{ruleId,severity,message,leafHref,criterion}]})
 * or a bare findings array. This is the recommended integration contract: point
 * the engine (or a thin wrapper) at JSON output.
 *
 * FAILS CLOSED (2026-09-23, W5/D7). Any other envelope, a row that is not an
 * object, or a severity outside JSON_SEVERITY THROWS, naming what it found. It
 * used to return [] for an unknown envelope and map an unknown severity to
 * 'info', and the adapter reported both as passed:true — a report this product
 * could not read, or an error it could not name, cleared the external gate.
 * A report in a shape not listed here is a report to add a reading for, from
 * the real file, never one to guess at.
 */
export function parseEvalidatorJsonReport(text: string): ExternalValidationFinding[] {
  const data = JSON.parse(text);
  let rows: unknown[];
  if (Array.isArray(data)) rows = data;
  else if (data && typeof data === 'object' && Array.isArray((data as { findings?: unknown }).findings)) {
    rows = (data as { findings: unknown[] }).findings;
  } else {
    const shape = data && typeof data === 'object'
      ? `an object with keys [${Object.keys(data).join(', ')}]${'findings' in data ? ' whose "findings" is not an array' : ''}`
      : `a JSON ${data === null ? 'null' : typeof data}`;
    throw new Error(
      `This is not an eValidator report this product reads: expected a findings array, or an object with a "findings" array; got ${shape}.`,
    );
  }
  return rows.map((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`eValidator report finding ${i + 1} is not an object.`);
    }
    const r = raw as Record<string, any>;
    const sevRaw = r.severity ?? r.type ?? r.level;
    if (sevRaw == null || String(sevRaw).trim() === '') {
      throw new Error(`eValidator report finding ${i + 1} has no severity, so it cannot be counted.`);
    }
    const severity = JSON_SEVERITY.get(String(sevRaw).trim().toLowerCase());
    if (!severity) {
      throw new Error(`eValidator report finding ${i + 1} has severity "${String(sevRaw)}", which this product does not map.`);
    }
    return {
      ruleId: String(r.ruleId ?? r.rule ?? r.number ?? r.code ?? r.id ?? 'UNKNOWN'),
      severity,
      message: String(r.message ?? r.description ?? r.text ?? ''),
      leafHref: r.leafHref ?? r.location ?? r.href ?? undefined,
      criterion: r.criterion ?? r.guidance ?? undefined,
    };
  });
}

/**
 * Tolerant parser for a LORENZ-style XML report. Recursively collects elements
 * that carry a severity-like attribute (severity/type/level) — the finding rows
 * — and reads rule id, message, and location from common attribute/child names,
 * case-insensitively. Robust to element-name and casing differences across
 * engine versions.
 */
export async function parseEvalidatorXmlReport(text: string): Promise<ExternalValidationFinding[]> {
  const doc = await parseStringPromise(text, { explicitArray: false, mergeAttrs: false, attrkey: '$', charkey: '_' });
  const findings: ExternalValidationFinding[] = [];
  const lc = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));

  const visit = (node: any): void => {
    if (node == null || typeof node !== 'string') {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (typeof node === 'object') {
        const attrs = node.$ ? lc(node.$) : {};
        const sevRaw = attrs.severity ?? attrs.type ?? attrs.level;
        if (sevRaw !== undefined) {
          const child = lc(node);
          const messageChild = child.message ?? child.description ?? child.text;
          findings.push({
            ruleId: String(attrs.number ?? attrs.ruleid ?? attrs.id ?? attrs.code ?? 'UNKNOWN'),
            severity: normalizeSeverity(String(sevRaw)),
            message: String(
              attrs.message ??
                (typeof messageChild === 'object' ? messageChild._ ?? '' : messageChild ?? node._ ?? ''),
            ).trim(),
            leafHref: attrs.location ?? attrs.href ?? attrs.file ?? undefined,
          });
        }
        for (const [k, v] of Object.entries(node)) {
          if (k === '$' || k === '_') continue;
          visit(v);
        }
      }
    }
  };
  visit(doc);
  return findings;
}

/** Parse a report by content sniff (XML vs JSON). */
export async function parseEvalidatorReport(text: string): Promise<ExternalValidationFinding[]> {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<')) return parseEvalidatorXmlReport(text);
  return parseEvalidatorJsonReport(text);
}

function runCli(bin: string, args: string[], timeoutMs = 120000): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err) => {
      // Many validators exit non-zero when findings exist; that is NOT a run
      // failure. We rely on the report file existing + parsing. Only a spawn
      // error (ENOENT etc.) rejects.
      if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') return reject(err);
      resolve();
    });
  });
}

export class LorenzEValidatorAdapter implements ExternalValidator {
  readonly name = 'lorenz-evalidator';

  async isConfigured(): Promise<boolean> {
    const bin = evalidatorBinary();
    if (!bin) return false;
    if (/^https?:\/\//i.test(bin)) return true;
    try {
      await fs.access(bin);
      return true;
    } catch {
      return false;
    }
  }

  async validate(args: ValidateArgs): Promise<ExternalValidationReport> {
    const bin = evalidatorBinary();
    if (!bin) {
      throw new Error('LORENZ eValidator is not configured (set EVALIDATOR_BINARY/EVALIDATOR_ENDPOINT).');
    }
    const profile = args.profile ?? evalidatorProfile(args.region) ?? args.region;
    let reportText: string;

    if (/^https?:\/\//i.test(bin)) {
      // Endpoint mode.
      const res = await fetch(bin, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packageDir: args.packageDir, region: args.region, profile }),
      });
      if (!res.ok) throw new Error(`LORENZ eValidator endpoint returned HTTP ${res.status}.`);
      reportText = await res.text();
    } else {
      // CLI mode: write the report to a temp file via a configurable arg template.
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'evalidator-'));
      const reportPath = path.join(dir, 'report.xml');
      try {
        const template = process.env.EVALIDATOR_ARGS
          ?? '--input {packageDir} --profile {profile} --report {report}';
        const argv = template
          .split(/\s+/)
          .filter(Boolean)
          .map((tok) => tok.replace('{packageDir}', args.packageDir).replace('{profile}', profile).replace('{report}', reportPath));
        await runCli(bin, argv);
        reportText = await fs.readFile(reportPath, 'utf8').catch(() => {
          throw new Error('LORENZ eValidator produced no report at the expected path.');
        });
      } finally {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    }

    const findings = await parseEvalidatorReport(reportText);
    const { errorCount, warningCount } = tallyFindings(findings);
    return {
      validator: this.name,
      profile,
      ranAt: new Date(),
      ran: true,
      findings,
      errorCount,
      warningCount,
      passed: errorCount === 0,
    };
  }
}

export default LorenzEValidatorAdapter;

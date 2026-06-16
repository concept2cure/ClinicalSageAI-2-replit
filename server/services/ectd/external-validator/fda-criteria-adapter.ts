/**
 * FDA-criteria validator adapter — a LICENSE-FREE, deterministic subset of FDA's
 * published *Specifications for eCTD Validation Criteria*, run over an unzipped
 * package directory (EVALIDATOR_INTEGRATION_SPEC.md, Adapters / Phase 4).
 *
 * PURPOSE: raise the validation floor when the commercial LORENZ engine is not
 * licensed — catch the highest-severity structural defects we can check ourselves
 * (missing backbone / MD5 index / regional backbone, empty leaf files, FDA file/
 * folder naming violations) before a package reaches the gateway.
 *
 * HONEST SCOPE — this is NOT a substitute for the agency validator. It implements
 * a curated subset only; passing it does not guarantee the agency will accept the
 * package. Every report carries a permanent advisory finding saying so, and the
 * adapter is OPT-IN (EVALIDATOR_USE_FDA_CRITERIA_FALLBACK=true) so it never
 * silently substitutes for LORENZ.
 *
 * @module server/services/ectd/external-validator/fda-criteria-adapter
 */

import { promises as fs } from 'fs';
import path from 'path';
import {
  tallyFindings,
  type ExternalValidator,
  type ExternalValidationReport,
  type ExternalValidationFinding,
  type ValidateArgs,
  type EctdRegion,
} from './types';

/** Opt-in: only act as a validator when explicitly enabled. */
export function fdaCriteriaFallbackEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.EVALIDATOR_USE_FDA_CRITERIA_FALLBACK ?? '').toLowerCase() === 'true';
}

const REGIONAL_BACKBONE: Record<EctdRegion, string> = {
  fda: 'us-regional.xml',
  ema: 'eu-regional.xml',
  pmda: 'jp-regional.xml',
};

/** FDA file/folder naming: lowercase letters, digits, hyphen, underscore, dot. */
const VALID_NAME = /^[a-z0-9._-]+$/;

interface WalkedFile {
  /** Package-relative POSIX path. */
  rel: string;
  /** Each path segment, for per-segment name checks. */
  segments: string[];
  sizeBytes: number;
}

async function walk(dir: string): Promise<WalkedFile[]> {
  const out: WalkedFile[] = [];
  async function recurse(abs: string, rel: string): Promise<void> {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const childAbs = path.join(abs, e.name);
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await recurse(childAbs, childRel);
      } else if (e.isFile()) {
        let sizeBytes = 0;
        try {
          sizeBytes = (await fs.stat(childAbs)).size;
        } catch {
          // unreadable → treated as 0; the empty-file rule will flag it
        }
        out.push({ rel: childRel, segments: childRel.split('/'), sizeBytes });
      }
    }
  }
  await recurse(dir, '');
  return out;
}

/**
 * Validate an unzipped eCTD package against the deterministic FDA-criteria subset.
 */
export async function validateFdaCriteria(args: ValidateArgs): Promise<ExternalValidationReport> {
  const files = await walk(args.packageDir);
  const relSet = new Set(files.map((f) => f.rel));
  const findings: ExternalValidationFinding[] = [];

  // Permanent honesty disclaimer (info — logged, never blocks).
  findings.push({
    ruleId: 'C2C-SUBSET-NOTICE',
    severity: 'info',
    message:
      'fda-criteria-subset: a license-free subset of FDA eCTD validation criteria. ' +
      'Passing it is NOT equivalent to passing the agency (LORENZ) validator.',
    criterion: 'EVALIDATOR_INTEGRATION_SPEC.md',
  });

  // 1. ICH backbone present.
  if (!relSet.has('index.xml')) {
    findings.push({ ruleId: 'FDA-BACKBONE-MISSING', severity: 'error', message: 'eCTD backbone index.xml is missing at the package root.', leafHref: 'index.xml', criterion: 'FDA eCTD validation criteria (backbone)' });
  }

  // 2. MD5 index present (either common location).
  if (!relSet.has('util/index-md5.txt') && !relSet.has('index-md5.txt')) {
    findings.push({ ruleId: 'FDA-MD5-INDEX-MISSING', severity: 'error', message: 'MD5 checksum index (util/index-md5.txt) is missing.', criterion: 'FDA eCTD validation criteria (integrity)' });
  }

  // 3. Regional backbone present for the region.
  const regional = REGIONAL_BACKBONE[args.region];
  const hasRegional = files.some((f) => f.segments[f.segments.length - 1] === regional);
  if (!hasRegional) {
    findings.push({ ruleId: 'FDA-REGIONAL-BACKBONE-MISSING', severity: 'error', message: `Regional backbone "${regional}" for region ${args.region.toUpperCase()} is missing.`, criterion: 'FDA eCTD validation criteria (regional M1)' });
  }

  // 4. No empty (0-byte) files — FDA rejects empty leaves.
  for (const f of files) {
    if (f.sizeBytes === 0) {
      findings.push({ ruleId: 'FDA-EMPTY-FILE', severity: 'error', message: `Empty (0-byte) file: ${f.rel}`, leafHref: f.rel, criterion: 'FDA eCTD validation criteria (no empty leaves)' });
    }
  }

  // 5. File/folder naming hygiene (lowercase, no spaces, restricted charset).
  for (const f of files) {
    for (const seg of f.segments) {
      if (!VALID_NAME.test(seg)) {
        findings.push({ ruleId: 'FDA-INVALID-NAME', severity: 'error', message: `Invalid file/folder name segment "${seg}" in "${f.rel}" (allowed: lowercase letters, digits, ., -, _).`, leafHref: f.rel, criterion: 'FDA eCTD file/folder naming' });
        break; // one finding per path is enough
      }
    }
  }

  const { errorCount, warningCount } = tallyFindings(findings);
  return {
    validator: 'fda-criteria-subset',
    profile: args.profile ?? `${args.region.toUpperCase()} eCTD (FDA criteria subset)`,
    ranAt: new Date(),
    ran: true,
    findings,
    errorCount,
    warningCount,
    passed: errorCount === 0,
  };
}

export class FdaCriteriaValidatorAdapter implements ExternalValidator {
  readonly name = 'fda-criteria-subset';

  async isConfigured(): Promise<boolean> {
    return fdaCriteriaFallbackEnabled();
  }

  async validate(args: ValidateArgs): Promise<ExternalValidationReport> {
    return validateFdaCriteria(args);
  }
}

export default FdaCriteriaValidatorAdapter;

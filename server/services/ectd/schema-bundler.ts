/**
 * eCTD XML-schema (XSD) bundling + readiness — the v4.0 analogue of dtd-bundler.
 *
 * eCTD v4.0 validation is schema-driven: the HL7 RPS message (`submissionUnit.xml`)
 * validates against the ICH RPS message schema, and the controlled-vocabulary
 * `.gc` files validate against the OASIS `genericode.xsd`. Like the licensed
 * DTDs, the ICH RPS schema is a licensed drop-in; a maintainer places the XSDs
 * into `assets/ectd-schema/` (or points `ECTD_SCHEMA_DIR` at them) and they are
 * bundled into the package under `util/schema/`.
 *
 * This is the code half: it lists the vendored schemas, knows which schema each
 * eCTD version needs, and evaluates a readiness gate so a production v4.0
 * package can fail closed when the RPS schema is missing — the same opt-in
 * pattern as the PDF/A and DTD gates. NEVER throws on a missing directory.
 *
 * @module server/services/ectd/schema-bundler
 */

import { promises as fs } from 'fs';
import * as path from 'path';

/** OASIS genericode schema — validates the controlled-vocabulary `.gc` files. */
export const GENERICODE_XSD = 'genericode.xsd';
/** ICH eCTD v4.0 / HL7 RPS message schema — validates `submissionUnit.xml`. */
export const RPS_MESSAGE_XSD = 'rps-message.xsd';

/** A vendored schema read from the drop-point directory. */
export interface VendoredSchema {
  fileName: string;
  bytes: Buffer;
}

/** The XSDs an eCTD version's package needs to be schema-validatable. */
export function requiredSchemasForVersion(version: 'v3.2.2' | 'v4.0'): string[] {
  // v3.2.2 is DTD-validated (see dtd-bundler); it has no required XSD.
  return version === 'v4.0' ? [RPS_MESSAGE_XSD] : [];
}

/** Resolve the schema drop-point directory (ECTD_SCHEMA_DIR or assets/ectd-schema). */
export function resolveSchemaDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.ECTD_SCHEMA_DIR || path.resolve(process.cwd(), 'assets/ectd-schema');
}

/**
 * List vendored `*.xsd` files in the drop-point directory. Returns [] when the
 * directory is absent or empty — never throws (graceful by design).
 */
export async function listVendoredSchemas(dir: string = resolveSchemaDir()): Promise<VendoredSchema[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: VendoredSchema[] = [];
  for (const name of names.sort()) {
    if (!name.toLowerCase().endsWith('.xsd')) continue;
    try {
      out.push({ fileName: name, bytes: await fs.readFile(path.join(dir, name)) });
    } catch {
      // Unreadable entry — skip; treated as absent by the readiness check.
    }
  }
  return out;
}

/** Absolute path to a vendored schema, or null when it is not present. */
export async function resolveSchemaPath(
  fileName: string,
  dir: string = resolveSchemaDir(),
): Promise<string | null> {
  const p = path.join(dir, fileName);
  try {
    await fs.access(p);
    return p;
  } catch {
    return null;
  }
}

export interface SchemaReadinessInput {
  version: 'v3.2.2' | 'v4.0';
  /** Schema filenames actually present in the drop-point. */
  present: string[];
  environment: 'staging' | 'production';
  /** Wire from ECTD_REQUIRE_RPS_SCHEMA; false ⇒ report-only (never blocks). */
  requireSchema: boolean;
}

export interface SchemaReadinessResult {
  required: string[];
  present: string[];
  missing: string[];
  schemaValidatable: boolean;
  cleared: boolean;
  blockers: string[];
}

/**
 * Evaluate schema self-containment for a version's package. Blocks only when a
 * schema is required AND the package is for production AND a required schema is
 * missing — the "do not ship a production v4.0 package you cannot schema-validate"
 * rule. Staging / requireSchema:false never block (report for visibility).
 */
export function assessSchemaReadiness(input: SchemaReadinessInput): SchemaReadinessResult {
  const required = requiredSchemasForVersion(input.version);
  const presentSet = new Set(input.present.map((p) => p.toLowerCase()));
  const missing = required.filter((r) => !presentSet.has(r.toLowerCase()));
  const schemaValidatable = missing.length === 0;
  const blockers: string[] = [];

  if (input.requireSchema && input.environment === 'production' && !schemaValidatable) {
    blockers.push(
      `${missing.length} required eCTD v4.0 schema(s) missing (${missing.join(', ')}). A production ` +
        `v4.0 submission must be schema-validatable. Place the ICH RPS message schema in ` +
        `assets/ectd-schema/ (or set ECTD_SCHEMA_DIR), or clear ECTD_REQUIRE_RPS_SCHEMA for ` +
        `non-submission builds. See assets/ectd-schema/README.md.`,
    );
  }

  return {
    required,
    present: input.present,
    missing,
    schemaValidatable,
    cleared: blockers.length === 0,
    blockers,
  };
}

/** Read the opt-in RPS-schema enforcement flag from the environment. */
export function schemaRequiredFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.ECTD_REQUIRE_RPS_SCHEMA ?? '').toLowerCase() === 'true';
}

export default {
  GENERICODE_XSD,
  RPS_MESSAGE_XSD,
  requiredSchemasForVersion,
  resolveSchemaDir,
  resolveSchemaPath,
  listVendoredSchemas,
  assessSchemaReadiness,
  schemaRequiredFromEnv,
};

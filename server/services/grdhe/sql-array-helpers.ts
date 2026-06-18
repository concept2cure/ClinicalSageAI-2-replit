/**
 * GRDHE SQL array helpers.
 *
 * SECURITY: these helpers build Postgres array literals from client-supplied
 * values using parameter binding (never string interpolation) plus strict
 * allow-list / identifier validation. They exist to keep the GRDHE service free
 * of any `sql.raw` array construction, which previously allowed SQL injection
 * via the data-residency configuration request body.
 */
import { sql } from 'drizzle-orm';

/**
 * Allow-list of valid data-residency regions. The data_region enum is defined
 * in the regulatory_harmonization schema; we mirror it here so that
 * client-supplied region values are validated before they reach SQL.
 */
const VALID_DATA_REGIONS: ReadonlySet<string> = new Set([
  'US_EAST', 'US_WEST', 'EU_WEST', 'EU_CENTRAL', 'UK_SOUTH',
  'JP_EAST', 'CA_CENTRAL', 'AU_EAST', 'GLOBAL',
]);

/** Field-level-encryption field names must be simple snake_case identifiers. */
const FIELD_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

/**
 * Build a fully parameterized Postgres array of data_region enum values.
 * Each element is bound as a parameter (never string-interpolated) and the
 * whole array is cast to the enum array type. Invalid regions throw.
 */
export function buildRegionArray(regions: readonly string[] | undefined) {
  const values = regions && regions.length > 0 ? regions : ['US_EAST'];
  for (const r of values) {
    if (!VALID_DATA_REGIONS.has(r)) {
      throw new Error(`Invalid data region: ${JSON.stringify(r)}`);
    }
  }
  const elements = sql.join(values.map((r) => sql`${r}`), sql`, `);
  return sql`ARRAY[${elements}]::regulatory_harmonization.data_region[]`;
}

/**
 * Build a fully parameterized Postgres text[] of field-level-encryption field
 * names. Each element is bound as a parameter and validated against a strict
 * identifier pattern. Invalid names throw.
 */
export function buildEncryptionFieldArray(fields: readonly string[] | undefined) {
  const values = fields && fields.length > 0
    ? fields
    : ['ssn', 'dob', 'medical_record_number', 'patient_name'];
  for (const f of values) {
    if (typeof f !== 'string' || !FIELD_NAME_PATTERN.test(f)) {
      throw new Error(`Invalid field-level encryption field name: ${JSON.stringify(f)}`);
    }
  }
  const elements = sql.join(values.map((f) => sql`${f}`), sql`, `);
  return sql`ARRAY[${elements}]::text[]`;
}

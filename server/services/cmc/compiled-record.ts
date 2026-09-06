/**
 * The compiler's own record of a Module 3 section, read ONE way.
 *
 * At compile time (POST /api/cmc/module3-os/compile, module3OperatingSystemRoutes.ts)
 * the composer's `completeness` and `missingInputs` are written into the same
 * row's `cmc_module3_sections.deterministic_json`. Four readers need them and
 * must agree: the final-export gate (refuses an approved section the compiler
 * did not establish), the section-approve route (refuses to approve one), the
 * section listing and the board (show the signer what those two will refuse).
 * One definition of "complete" here, so an approval can never accept what the
 * export gate will decline.
 */

/**
 * `deterministic_json` may arrive as a string (raw driver rows) or already
 * parsed (pooled/mocked clients), under either column spelling; both are read
 * the same way, and anything unreadable is treated as "nothing established" —
 * never as complete.
 */
export function parsedDeterministicJson(row: any): Record<string, unknown> {
  const raw = row?.deterministic_json ?? row?.deterministicJson;
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * A section's compiled record is complete only when the compiler scored it at
 * exactly 100 AND left no required input named missing. A record with no
 * completeness figure at all was never compiled through the composer and
 * cannot be called complete.
 */
export function compiledRecordIsComplete(json: Record<string, unknown>): boolean {
  const completeness = typeof json.completeness === 'number' ? json.completeness : null;
  const missing = Array.isArray(json.missingInputs) ? json.missingInputs : [];
  return completeness === 100 && missing.length === 0;
}

export interface CompiledRecordStatus {
  /** The compiler's score, or null when the row carries none (never scored). */
  completeness: number | null;
  /** The required inputs the compiler found missing, by name. */
  missingInputs: string[];
  /** `compiledRecordIsComplete` over the same record. */
  complete: boolean;
}

/** The two figures a surface shows, and the verdict the gates act on, from one row. */
export function readCompiledRecord(row: unknown): CompiledRecordStatus {
  const json = parsedDeterministicJson(row);
  const completeness = typeof json.completeness === 'number' ? json.completeness : null;
  const missingInputs = Array.isArray(json.missingInputs)
    ? json.missingInputs.filter((m): m is string => typeof m === 'string')
    : [];
  return { completeness, missingInputs, complete: compiledRecordIsComplete(json) };
}

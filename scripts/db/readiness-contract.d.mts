/**
 * Types for scripts/db/readiness-contract.mjs.
 *
 * `scripts/` is outside tsconfig's `include`, so the .mjs is never type-checked
 * itself — but server/db/__tests__/readiness-contract.test.ts imports it to pin
 * the lists against the TypeScript side, and under `noImplicitAny` an untyped
 * import is a hard TS7016. Hand-written to match the .mjs; keep in step.
 *
 * THE EXTENSION IS LOAD-BEARING — this file must stay `.d.mts` (see
 * migration-set.d.mts): TypeScript resolves a `.mjs` specifier only via
 * `.mts` / `.d.mts`, never `.d.ts`.
 */

export declare const REQUIRED_SCHEMAS: readonly string[];
export declare const REQUIRED_EXTENSIONS: readonly string[];
export declare const CRITICAL_TABLES: readonly string[];
export declare const SECURITY_CRITICAL_TABLES: readonly string[];
export declare const REQUIRED_NON_PUBLIC_TABLES: readonly { schema: string; name: string }[];
export declare const BASE_SCHEMA_SENTINELS: readonly string[];

export interface ReadinessContractOptions {
  log?: (message: string) => void;
  authoringTables?: readonly string[];
  asRuntimeRole?: boolean;
}

export interface ReadinessContractResult {
  ok: boolean;
  failures: string[];
  role: string;
  roleIsSuperuser: boolean;
  roleBypassesRls: boolean;
}

export declare function verifyReadinessContract(
  client: { query: (text: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> },
  opts?: ReadinessContractOptions,
): Promise<ReadinessContractResult>;

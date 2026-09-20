// Type surface for the plain-ESM inspector so the vitest gate files typecheck.
export const VERDICT_STRINGS: Set<string>;
export const VERDICT_BOOLEAN_KEYS: Set<string>;
export const SUCCESS_KEYS: Set<string>;
export const HONEST_STRINGS: Set<string>;
export function findVerdictClaims(body: unknown, path?: string): string[];
export function assertNoVerdictClaims(body: unknown, context: string): void;
export function selfTest(): string[];

/**
 * Formatting helpers shared by the protocol-development projection views.
 * They only read and print what an engine returned: `num` prints an absent or
 * non-finite number as "not recorded", never as 0.
 *
 * @module client/src/concept2cure/v2/surfaces/projectionFormat
 */

export type Obj = Record<string, unknown>;
export const str = (v: unknown): string => (v == null ? '' : String(v));
export const rows = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
export const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(str) : []);
export const num = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : 'not recorded');

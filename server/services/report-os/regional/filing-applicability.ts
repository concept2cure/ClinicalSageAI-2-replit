/** Pure recorded filing admission shared by regional overview and execution.
 * Only canonical registry/Module 1 bindings are consulted; no title or default. */
import { getApplicationType } from '../../../../shared/regulatory/global-document-registry';
import { resolveToRegistryId } from '../../../../shared/regulatory/submission-type-bridge';
import { MODELED_JURISDICTIONS, REGIONAL_MODULE1, type ApplicationKind, type ModeledJurisdiction } from '../../../../shared/regulatory/regional-module1';
import { REGIONAL_FILING_TYPES, REGION_TO_JURISDICTION, REGISTRY_TO_KIND } from './filing-types';

export type RegionalAvailabilityState = 'available' | 'filing-context-required' | 'not-applicable' | 'context-unavailable';
export interface RecordedRegionalFiling {
  registryId: string; entryLabel: string; agency: string;
  kind: ApplicationKind | null; jurisdiction: ModeledJurisdiction | null;
  continuingLifecycle: boolean;
}
export interface ModeledRegionalFiling extends RecordedRegionalFiling {
  kind: ApplicationKind; jurisdiction: ModeledJurisdiction;
}
export type RegionalFilingContext = { state: 'recorded'; filing: RecordedRegionalFiling }
  | { state: 'filing-context-required' | 'context-unavailable'; reasonCode: string; availabilityReason: string };
export type RegionalFilingApplicability = { availabilityState: 'available'; runnable: true; reasonCode: null; availabilityReason: null; filing: ModeledRegionalFiling }
  | { availabilityState: Exclude<RegionalAvailabilityState, 'available'>; runnable: false; reasonCode: string; availabilityReason: string };
type UnrecordedRegionalFiling = Exclude<RegionalFilingContext, { state: 'recorded' }>;
const invalidContext = (): UnrecordedRegionalFiling => ({ state: 'context-unavailable', reasonCode: 'REGIONAL_FILING_CONTEXT_INVALID', availabilityReason: 'The recorded filing context is malformed or conflicting. No market readiness was assessed.' });
export const unavailableRegionalFilingContext = (): UnrecordedRegionalFiling => ({ state: 'context-unavailable', reasonCode: 'REGIONAL_FILING_CONTEXT_UNAVAILABLE', availabilityReason: 'The recorded filing context could not be verified. No market readiness was assessed.' });

function metadataObject(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return {};
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    ? value as Record<string, unknown> : null;
}
function recordedString(meta: Record<string, unknown>, key: string): { value: string | null; invalid: boolean } {
  if (!Object.prototype.hasOwnProperty.call(meta, key)) return { value: null, invalid: false };
  const raw = meta[key];
  if (typeof raw !== 'string' || !raw.trim()) return { value: null, invalid: true };
  return { value: raw.trim(), invalid: false };
}
type RecordedIdentity = { state: 'identity'; registryId: string } | UnrecordedRegionalFiling;

/** An explicit registry identity is never replaced by a different legacy type. */
function readRecordedIdentity(meta: Record<string, unknown>): RecordedIdentity {
  const registry = recordedString(meta, 'registryId');
  const legacy = recordedString(meta, 'submissionType');
  if (registry.invalid || legacy.invalid) return invalidContext();
  if (!registry.value && !legacy.value) return {
    state: 'filing-context-required', reasonCode: 'REGIONAL_FILING_CONTEXT_REQUIRED',
    availabilityReason: 'Record the program’s filing type before running this market readiness assessment. No market readiness was assessed.',
  };
  const legacyId = legacy.value ? resolveToRegistryId(legacy.value) : null;
  if (legacy.value && !legacyId) return invalidContext();
  if (registry.value && legacyId && registry.value !== legacyId) return invalidContext();
  const registryId = registry.value ?? legacyId;
  return registryId ? { state: 'identity', registryId } : invalidContext();
}

export function readRecordedRegionalFiling(raw: unknown): RegionalFilingContext {
  const meta = metadataObject(raw);
  if (!meta) return invalidContext();
  const identity = readRecordedIdentity(meta);
  if (identity.state !== 'identity') return identity;
  const entry = getApplicationType(identity.registryId);
  if (!entry || !entry.active) return unavailableRegionalFilingContext();
  const kind = REGISTRY_TO_KIND[entry.id] ?? null;
  const jurisdiction = kind
    ? MODELED_JURISDICTIONS.find(market => REGIONAL_MODULE1[market].kinds.includes(kind)) ?? null : null;
  if (kind && !jurisdiction) return unavailableRegionalFilingContext();
  const applicationNumber = meta.applicationNumber;
  if (applicationNumber != null && typeof applicationNumber !== 'string') return invalidContext();
  return { state: 'recorded', filing: {
    registryId: entry.id, entryLabel: entry.displayName, agency: entry.agency, kind, jurisdiction,
    continuingLifecycle: typeof applicationNumber === 'string' && Boolean(applicationNumber.trim()),
  } };
}
const refusal = (availabilityState: Exclude<RegionalAvailabilityState, 'available'>, reasonCode: string, availabilityReason: string): RegionalFilingApplicability => ({ availabilityState, runnable: false, reasonCode, availabilityReason });
/** Missing/declaration drift/current kind or market are distinct, closed states. */
export function regionalFilingApplicability(typeId: string, declared: { region?: string | null; label?: string | null }, context: RegionalFilingContext): RegionalFilingApplicability {
  const binding = REGIONAL_FILING_TYPES[typeId];
  if (!binding) return refusal('not-applicable', 'REGIONAL_FILING_NOT_MODELED', `No market readiness is computed for ${typeId}.`);
  const label = declared.label ?? typeId;
  if (REGION_TO_JURISDICTION[declared.region ?? ''] !== binding.jurisdiction) return refusal('context-unavailable', 'REGIONAL_TYPE_MARKET_INCONSISTENT', `${label} declares region ${declared.region ?? 'none'}, which is not the ${binding.jurisdiction} Module 1 record this assessment reads. No market readiness was assessed.`);
  if (context.state !== 'recorded') return refusal(context.state, context.reasonCode, context.availabilityReason);
  const ctx = context.filing;
  if (!ctx.kind || !ctx.jurisdiction) {
    const modeled = MODELED_JURISDICTIONS.map(market => `${market} ${REGIONAL_MODULE1[market].kinds.join('/')}`).join(', ');
    return refusal('not-applicable', 'REGIONAL_FILING_NOT_MODELED', `The Module 1 record models ${modeled}. This program is recorded as ${ctx.entryLabel}, which has no Module 1 record here, so its Module 1 content was not assessed.`);
  }
  if (ctx.jurisdiction !== binding.jurisdiction) return refusal('not-applicable', 'REGIONAL_REPORT_MARKET_MISMATCH', `${label} assesses a ${binding.jurisdiction} filing. This program is recorded as ${ctx.entryLabel}, so its readiness for that market was not assessed under this market’s name.`);
  if (!binding.kinds.includes(ctx.kind)) return refusal('not-applicable', 'REGIONAL_REPORT_KIND_MISMATCH', `${label} assesses a ${binding.kinds.join(' or ')} filing. This program is recorded as ${ctx.entryLabel}, so it was not assessed under this report’s name.`);
  return { availabilityState: 'available', runnable: true, availabilityReason: null, reasonCode: null, filing: { ...ctx, kind: ctx.kind, jurisdiction: ctx.jurisdiction } };
}

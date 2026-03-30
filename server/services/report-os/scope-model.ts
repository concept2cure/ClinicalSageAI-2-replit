import type { ReportScope } from '@shared/schema/report-os';

export interface ScopeResolutionInput {
  scopeType: ReportScope;
  scopeId: string;
  organizationId: number;
}

export interface ScopeResolution {
  scopeType: ReportScope;
  scopeId: string;
  lineage: Array<{ scopeType: ReportScope; scopeId: string }>;
  freshnessBudgetMs: number;
}

export function resolveScope(input: ScopeResolutionInput): ScopeResolution {
  const lineage: Array<{ scopeType: ReportScope; scopeId: string }> = [
    { scopeType: input.scopeType, scopeId: input.scopeId },
  ];

  // Minimal architecture slice: explicit scope object; full hierarchy resolver in follow-on.
  return {
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    lineage,
    freshnessBudgetMs: input.scopeType === 'document' ? 5 * 60_000 : 30 * 60_000,
  };
}

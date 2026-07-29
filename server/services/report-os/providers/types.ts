import type { ReportScope } from '@shared/schema/report-os';

export interface InsightAtomRef {
  sourceTable: string;
  sourceField?: string;
  recordId?: string | number;
  transformation?: 'direct_copy' | 'aggregation' | 'calculation' | 'ai_generated' | 'manual_entry';
  confidence?: number;
}

export interface InsightValue {
  value: number | string | null;
  status: 'ready' | 'partial' | 'missing';
  confidence: number;
  blockers: string[];
  atoms: InsightAtomRef[];
  observedAt: string;
}

export interface InsightProviderContext {
  organizationId: number;
  scopeType: ReportScope;
  scopeId: string;
  asOf?: Date;
}

export interface InsightProvider {
  id: string;
  label: string;
  scopes: ReportScope[];
  freshnessBudgetMs: number;
  compute(ctx: InsightProviderContext): Promise<InsightValue>;
}

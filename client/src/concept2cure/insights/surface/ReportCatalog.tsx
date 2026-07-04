/**
 * ReportCatalog — lists the report types allowed for the active scope,
 * grouped by family, and lets the user generate one.
 *
 * The server has already filtered the taxonomy to the org's client segment(s)
 * (see server/services/report-os/segment.ts), so the catalog only shows what
 * this client actually needs. Here we additionally filter to types whose
 * `allowedScopes` include the active scope, group the survivors by `family`,
 * and — when a type is not entitled for the org's tier (Phase 2) — render an
 * honest Locked state instead of a Generate action. The component stays
 * presentational; the surface owns the mutation.
 *
 * @module client/src/concept2cure/insights/surface/ReportCatalog
 */

import * as React from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ReportScope, ReportTypeSummary } from '../data/types';

export interface ReportCatalogProps {
  /** The active scope; types not allowed for it are filtered out. */
  scope: ReportScope;
  /** Report types from the taxonomy registry (already segment-filtered server-side). */
  types: ReportTypeSummary[];
  /** Called with the chosen report type id when a row's generate action fires. */
  onGenerate: (typeId: string) => void;
  /** True while a generate mutation is in flight; disables the actions. */
  generating?: boolean;
}

/** Human label for a family slug ('usa_fda_pma' → 'Usa fda pma' is too raw;
 *  we de-slug and title the first word only, per sentence-case rules). */
function familyLabel(family: string): string {
  const words = family.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function ReportCatalog({
  scope,
  types,
  onGenerate,
  generating = false,
}: ReportCatalogProps): React.ReactElement {
  const allowed = types.filter((type) => type.allowedScopes.includes(scope));

  // Group by family, preserving first-seen family order.
  const groups = React.useMemo(() => {
    const byFamily = new Map<string, ReportTypeSummary[]>();
    for (const type of allowed) {
      const list = byFamily.get(type.family) ?? [];
      list.push(type);
      byFamily.set(type.family, list);
    }
    return [...byFamily.entries()];
  }, [allowed]);

  if (allowed.length === 0) {
    return (
      <div className="in-card">
        <h3>Report catalog</h3>
        <p className="in-sub" style={{ margin: 0 }}>
          No report types are enabled for the {scope} scope. Switch scope to see the
          types it can produce.
        </p>
      </div>
    );
  }

  return (
    <div className="in-card">
      <h3>Report catalog</h3>
      {groups.map(([family, familyTypes]) => (
        <div key={family} className="in-catalog-family">
          <div className="in-sub" style={{ fontWeight: 600, margin: '10px 0 4px' }}>
            {familyLabel(family)}
          </div>
          {familyTypes.map((type) => {
            const locked = type.entitled === false;
            return (
              <div
                key={type.typeId}
                className="row"
                style={{ gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center' }}
              >
                <div className="k">
                  <div>{type.label}</div>
                  <div className="sub">{type.family}</div>
                </div>
                <div className="v">
                  {locked ? (
                    <span
                      className="in-locked"
                      role="note"
                      aria-label={`Locked — available on the ${type.requiredTier ?? 'higher'} plan`}
                      title={`Available on the ${type.requiredTier ?? 'higher'} plan`}
                    >
                      <Lock aria-hidden size={12} />
                      {type.requiredTier ? `${type.requiredTier} plan` : 'Locked'}
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={generating}
                      onClick={() => onGenerate(type.typeId)}
                    >
                      Generate
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

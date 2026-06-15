/**
 * ReportCatalog — lists the report types allowed for the active scope and lets
 * the user generate one.
 *
 * Filters the taxonomy down to types whose `allowedScopes` include the active
 * scope, so the catalog only ever offers what the current scope can produce.
 * Each row exposes a governed Button that calls `onGenerate(typeId)` — the
 * surface owns the mutation, this component stays presentational.
 *
 * @module client/src/concept2cure/insights/surface/ReportCatalog
 */

import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { ReportScope, ReportTypeSummary } from '../data/types';

export interface ReportCatalogProps {
  /** The active scope; types not allowed for it are filtered out. */
  scope: ReportScope;
  /** Report types from the taxonomy registry. */
  types: ReportTypeSummary[];
  /** Called with the chosen report type id when a row's generate action fires. */
  onGenerate: (typeId: string) => void;
  /** True while a generate mutation is in flight; disables the actions. */
  generating?: boolean;
}

export function ReportCatalog({
  scope,
  types,
  onGenerate,
  generating = false,
}: ReportCatalogProps): React.ReactElement {
  const allowed = types.filter((type) => type.allowedScopes.includes(scope));

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
      {allowed.map((type) => (
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={generating}
              onClick={() => onGenerate(type.typeId)}
            >
              Generate
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

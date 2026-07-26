/**
 * RbmKit -- shared RBM component kit (ported from rbm-kit.jsx): RbmChip,
 * RiskMatrix, Sparkline, ThresholdGauge, DimBars, SeedEmpty, RbmStarters,
 * GovernedApprovalDialog. Build once, reuse per surface -- every status is
 * label + icon + tone; every score shows its number.
 *
 * Coordination note: most of this kit was already ported into
 * RbmSurfaces.tsx (the shared hub Rbm.tsx, RbmSurfacesA.tsx and
 * RbmSurfacesB.tsx import from) and the pure banding/status functions live
 * in fixtures/rbm-data.ts. Re-implementing those here under the rbm-kit.jsx
 * file name would duplicate logic that is already the single source of
 * truth elsewhere and risk the two copies drifting apart. This module
 * re-exports that existing kit so rbm-kit.jsx's public surface has a named
 * home, and adds the one primitive that had not yet been ported:
 * `RbmStarters`, the inline "Ask AnA" chip row used inside a surface body
 * (distinct from RbmAnaDock's own starters list in its docked panel).
 */
import React from 'react';
import { I } from '../icons';
import { rbmBand, kriStatusOf, qtlStatusOf, type RbmNavItem } from '../fixtures/rbm-data';

export {
  RbmChip, RiskMatrix, Sparkline, ThresholdGauge, DimBars, SeedEmpty,
  RbmScore, RbmFreshness, TrendTable, RbmFormModal, GovernedApprovalDialog,
} from './RbmSurfaces';
export type { FormField } from './RbmSurfaces';
export { rbmBand, kriStatusOf, qtlStatusOf };
/* The RBM write layer: every surface mutation goes through these rather than a
   page-local action store (the former RBM_STORE / useRbmActions, now removed). */
export { useRbmMutation, useRbmOwners, rbmWrite, rbmWriteWithMeta, RbmWriteError, RbmWriteNote } from './rbmWrites';

/* -- RbmStarters -- per-surface AnA starters, inline in the surface body.
   Surface actions and AnA tools are one system; each chip fires a real ask
   scoped to the active surface. -- */
export function RbmStarters({ nav, onAsk }: { nav: RbmNavItem; onAsk?: (t: string) => void }) {
  return (
    <div className="rbm-starters">
      <span className="rbm-starters-l">{I.sparkles} Ask AnA</span>
      {nav.starters.map((s, i) => (
        <button key={i} className="rbm-starter" onClick={() => onAsk && onAsk(s)}>{s}</button>
      ))}
    </div>
  );
}

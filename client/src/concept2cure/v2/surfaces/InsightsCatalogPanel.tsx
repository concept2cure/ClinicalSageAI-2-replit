/**
 * Report catalog — every governed report type, and what does not compute.
 *
 * ── WHY THIS SCREEN ─────────────────────────────────────────────────────────
 * Before this panel the only way to reach a report was to type words the
 * matcher recognised (`roResolveType`) or to press one of the hardcoded packs
 * in `RO_PRESETS`, which cover about six types for a pharma client. The
 * governed catalog the bootstrap already returns is larger than that, so most
 * of what the platform computes had no affordance at all.
 *
 * ── THE RULE THIS PANEL EXISTS TO KEEP ──────────────────────────────────────
 * A type with no engine is NEVER a control. 43 of the 61 declared types have
 * no provider (`server/services/report-os/report-engine.ts`), and running one
 * returned the readiness digest under the wrong title — the defect QA found on
 * 2026-10-08 (j8). They are listed by name, as not computed, and nothing in
 * this panel can run them.
 *
 * @module client/src/concept2cure/v2/surfaces/InsightsCatalogPanel
 */
import React, { useMemo, useState } from 'react';

import { EmptyState } from '../dataConnect';
import { I } from '../icons';
import { PanelHead, type LibraryReportType } from './insightsLibraryShared';

/** Family ids to the words a client reads; anything unlisted shows its id. */
const FAMILY_LABEL: Readonly<Record<string, string>> = {
  readiness: 'Submission readiness',
  evidence_provenance: 'Evidence & provenance',
  compliance_audit: 'Compliance & audit',
  prediction: 'Predictive (advisory)',
  research_compliance: 'Research compliance',
  research_admin: 'Research administration',
  research_security: 'Research security',
  lifecycle_obligations: 'Lifecycle & obligations',
  rim_registration: 'Registrations & labeling',
  inspection_readiness: 'Inspection readiness',
  etmf: 'Trial master file',
  nonclinical_module4: 'Nonclinical (Module 4)',
  fcoi_compliance: 'Financial disclosure',
  ha_commitment: 'Health-authority commitments',
  irb_ethics: 'Ethics (IRB)',
  iacuc_governance: 'Animal care (IACUC)',
  ibc_biosafety: 'Biosafety (IBC)',
  sponsored_programs: 'Sponsored programs',
  controlled_substances: 'Controlled substances',
  effort_certification: 'Effort certification',
};

export function familyLabel(id: string): string {
  return FAMILY_LABEL[id] ?? id.replace(/_/g, ' ');
}

/** One runnable type: what it is, where it runs, and the one control. */
function TypeCard({
  type,
  canRun,
  onRun,
}: {
  type: LibraryReportType;
  canRun: boolean;
  onRun: (t: LibraryReportType) => void;
}) {
  return (
    <div className="rl-card">
      <div className="rl-card-h">{type.label}</div>
      <div className="rl-card-meta">
        {type.scopes.length ? `Runs over: ${type.scopes.join(', ')}` : 'Scope not declared'}
      </div>
      {type.entitled === false ? (
        <div className="rl-card-lock">
          {I.lock} {type.requiredTier ? `${type.requiredTier} plan` : 'A higher plan'} unlocks this report.
        </div>
      ) : (
        <button
          type="button"
          className="rl-card-run"
          disabled={!canRun}
          onClick={() => onRun(type)}
          title={canRun ? undefined : 'Running a governed report needs an editor role'}
        >
          {I.play} Run
        </button>
      )}
    </div>
  );
}

/**
 * The types no engine computes, by name.
 *
 * Deliberately a list and not a grid of cards: a card carries an action, and
 * the whole point is that there is nothing here to press.
 */
function NotComputed({ types }: { types: LibraryReportType[] }) {
  if (types.length === 0) return null;
  const one = types.length === 1;
  return (
    <section className="rl-fam" aria-label="Not computed in this release" data-testid="rl-not-computed">
      <div className="ro-rep-eyebrow">Not computed in this release</div>
      <p className="rl-sub">
        {types.length} report {one ? 'type is' : 'types are'} defined in the governed catalog but no engine
        produces {one ? 'it' : 'them'} yet, so {one ? 'it is' : 'they are'} not offered and nothing is run
        in {one ? 'its' : 'their'} place.
      </p>
      <ul className="rl-nc-list">
        {types.map((t) => (
          <li key={t.typeId} className="rl-nc-item">{t.label}</li>
        ))}
      </ul>
    </section>
  );
}

export function CatalogPanel({
  types,
  onRun,
  canRun,
  programLabel,
}: {
  types: LibraryReportType[];
  onRun: (t: LibraryReportType) => void;
  canRun: boolean;
  programLabel: string;
}) {
  const [q, setQ] = useState('');
  const searchId = React.useId();

  const { runnable, notComputed } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const shown = needle
      ? types.filter(
          (t) => t.label.toLowerCase().includes(needle) || t.typeId.toLowerCase().includes(needle),
        )
      : types;
    return {
      runnable: shown.filter((t) => t.runnable),
      notComputed: shown.filter((t) => !t.runnable),
    };
  }, [types, q]);

  /* Grouped by family so a client scans by the kind of question they have,
     rather than down an alphabetical list of every title. */
  const byFamily = useMemo(() => {
    const m = new Map<string, LibraryReportType[]>();
    for (const t of runnable) {
      m.set(t.family, [...(m.get(t.family) ?? []), t]);
    }
    return [...m.entries()].sort((a, b) => familyLabel(a[0]).localeCompare(familyLabel(b[0])));
  }, [runnable]);

  const searching = q.trim().length > 0;

  return (
    <div className="rl">
      <PanelHead
        title="Report catalog"
        sub={
          `Every governed report type your plan and ${programLabel}'s product type admit. ` +
          `${runnable.length} ${runnable.length === 1 ? 'is' : 'are'} computed by an engine and can be run here.`
        }
      />

      <div className="rl-filters">
        <div className="rl-filter">
          <label className="gov-label" htmlFor={searchId}>Find a type</label>
          <input
            id={searchId}
            className="rl-input"
            type="search"
            value={q}
            placeholder="Report title or id"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {byFamily.length === 0 && notComputed.length === 0 ? (
        <EmptyState
          icon={I.grid}
          title={searching ? `No report type matches "${q.trim()}"` : 'No report types for this program'}
          hint={
            searching
              ? 'Clear the search to see the whole catalog.'
              : "The catalog follows the program's recorded product type and your plan. Nothing from another program is shown in its place."
          }
          testId="rl-catalog-empty"
        />
      ) : null}

      {byFamily.map(([family, rows]) => (
        <section key={family} className="rl-fam" aria-label={familyLabel(family)}>
          <div className="ro-rep-eyebrow">{familyLabel(family)}</div>
          <div className="rl-grid">
            {rows.map((t) => (
              <TypeCard key={t.typeId} type={t} canRun={canRun} onRun={onRun} />
            ))}
          </div>
        </section>
      ))}

      <NotComputed types={notComputed} />
    </div>
  );
}

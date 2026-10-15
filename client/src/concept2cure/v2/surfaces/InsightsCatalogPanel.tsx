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
 * A type with no engine is NEVER a control. Some declared report types have
 * no provider (`server/services/report-os/report-engine.ts`), and running one
 * returned the readiness digest under the wrong title — the defect QA found on
 * 2026-10-08 (j8). They are listed by name, as not computed, and nothing in
 * this panel can run them.
 *
 * @module client/src/concept2cure/v2/surfaces/InsightsCatalogPanel
 */
import React, { useMemo, useState } from 'react';

import { EmptyState, ErrorState, useLiveData } from '../dataConnect';
import { I } from '../icons';
import { isRowList, PanelHead, rowsOf, type LibraryReportType } from './insightsLibraryShared';
import { useCatalogReportingRole } from '../reportingPersona';

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
function runControlTitle(canRun: boolean, unavailableReason?: string): string | undefined {
  return unavailableReason || (canRun ? undefined : 'Running a governed report needs an editor role');
}

function RunUnavailableNote({ reason }: { reason?: string }) {
  if (!reason) return null;
  return <div className="rl-card-meta">{reason}</div>;
}

function TypeCard({
  type,
  canRun,
  onRun,
  busy,
  unavailableReason,
}: {
  type: LibraryReportType;
  canRun: boolean;
  onRun: (t: LibraryReportType) => void;
  busy: boolean;
  unavailableReason?: string;
}) {
  return (
    <div className="rl-card">
      <div className="rl-card-h">{type.label}</div>
      <div className="rl-card-meta">
        {/* Where it RUNS, not where it is declared. A type with no engine says
            nothing about running; one whose engine covers fewer scopes than the
            declaration says only the scopes it covers. */}
        {type.computedScopes.length
          ? `Runs over: ${type.computedScopes.join(', ')}`
          : type.scopes.length
            ? `Declared for: ${type.scopes.join(', ')}`
            : 'Scope not declared'}
      </div>
      {type.computedScope === 'organization' && <div className="rl-card-meta">Organization-wide records</div>}
      {type.computedScope === 'organization' && <div className="rl-card-meta">Counts are not narrowed to the selected program.</div>}
      {(type.region || type.allowedPersonas?.length) && <div className="rl-card-meta">{[type.region, type.allowedPersonas?.map(readable).join(', ')].filter(Boolean).join(' · ')}</div>}
      {type.availabilityReason && <div className="rl-card-meta">{type.availabilityReason}</div>}
      {type.entitled !== false && <RunUnavailableNote reason={unavailableReason} />}
      {type.entitled === false ? (
        <div className="rl-card-lock">
          {I.lock} {type.requiredTier ? `${type.requiredTier} plan` : 'A higher plan'} unlocks this report.
        </div>
      ) : (
        <button
          type="button"
          className="rl-card-run"
          disabled={!canRun || busy || Boolean(unavailableReason)}
          onClick={() => onRun(type)}
          title={runControlTitle(canRun, unavailableReason)}
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
          <li key={t.typeId} className="rl-nc-item">{t.label}{t.availabilityReason ? <span className="rl-cell-sub">{t.availabilityReason}</span> : null}</li>
        ))}
      </ul>
    </section>
  );
}

export function CatalogPanel({
  types,
  onRun,
  canRun,
  runUnavailableReason,
  programLabel,
  busy = false,
  projectId,
}: {
  types: LibraryReportType[];
  onRun: (t: LibraryReportType) => void;
  canRun: boolean;
  runUnavailableReason?: (type: LibraryReportType) => string | undefined;
  programLabel: string | null;
  busy?: boolean;
  projectId?: number;
}) {
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('');
  const [scope, setScope] = useState('');
  const [state, setState] = useState('');
  const searchId = React.useId();
  const regions = [...new Set(types.map(t => t.region).filter((v): v is string => Boolean(v)))].sort();
  const personas = [...new Set(types.flatMap(t => t.allowedPersonas ?? []))].sort();
  const { persona, choose: choosePersona, profile } = useCatalogReportingRole(personas);
  const scopes = [...new Set(types.flatMap(t => t.computedScope === 'organization' ? ['organization'] : t.computedScopes))].sort();

  const { runnable, notComputed, needsContext } = useMemo(() => {
    const shown = types.filter(t => matchesCatalog(t, { q, region, persona, scope, state }));
    return {
      runnable: shown.filter((t) => t.runnable),
      notComputed: shown.filter((t) => !t.runnable && catalogAvailability(t) === 'not-computed'),
      needsContext: shown.filter(t => !t.runnable && catalogAvailability(t) !== 'not-computed'),
    };
  }, [types, q, region, persona, scope, state]);

  /* Grouped by family so a client scans by the kind of question they have,
     rather than down an alphabetical list of every title. */
  const byFamily = useMemo(() => {
    const m = new Map<string, LibraryReportType[]>();
    for (const t of runnable) {
      m.set(t.family, [...(m.get(t.family) ?? []), t]);
    }
    return [...m.entries()].sort((a, b) => familyLabel(a[0]).localeCompare(familyLabel(b[0])));
  }, [runnable]);

  const searching = Boolean(q.trim() || region || persona || scope || state);

  return (
    <div className="rl">
      <PanelHead
        title="Report catalog"
        sub={
          (programLabel ? `Applicable reports for ${programLabel}. ` : 'Organization reports can run before a product program exists. ') +
          'Availability follows the supported computation, reporting scope and your organization’s plan.'
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
        <CatalogFilter label="Region" value={region} onChange={setRegion} options={regions} />
        <CatalogFilter label="Reporting role" value={persona} onChange={choosePersona} options={personas} />
        <CatalogFilter label="Data scope" value={scope} onChange={setScope} options={scopes} />
        <CatalogFilter label="Availability" value={state} onChange={setState} options={['available', 'locked', 'scope-required', 'filing-context-required', 'not-applicable', 'context-unavailable', 'disabled', 'unregistered', 'not-computed']} />
      </div>
      <ReportingPersonaError profile={profile} />

      {needsContext.map(type => type.availabilityState === 'scope-required' && type.computedScopes.includes('document') ? <DocumentTracePicker key={type.typeId} type={type} projectId={projectId} canRun={canRun} busy={busy} onRun={onRun} unavailableReason={runUnavailableReason?.(type)} /> : <div key={type.typeId} className="ro-dash-note" role="note">{I.info} {type.label} — {type.availabilityReason || 'This report is unavailable in the current context.'}</div>)}

      {byFamily.length === 0 && notComputed.length === 0 && needsContext.length === 0 ? (
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
              <TypeCard key={t.typeId} type={t} canRun={canRun} busy={busy} onRun={onRun} unavailableReason={runUnavailableReason?.(t)} />
            ))}
          </div>
        </section>
      ))}

      <NotComputed types={notComputed} />
    </div>
  );
}

const readable = (value: string) => value.replace(/[._-]/g, ' ');
function catalogAvailability(type: LibraryReportType): string {
  if (!type.runnable) return type.availabilityState || (type.computedScopes.length ? 'unavailable' : 'not-computed');
  return type.entitled === false ? 'locked' : 'available';
}
function matchesCatalog(type: LibraryReportType, filter: { q: string; region: string; persona: string; scope: string; state: string }): boolean {
  const text = `${type.label} ${type.typeId} ${type.family}`.toLowerCase();
  const scopeMatches = filter.scope === 'organization' ? type.computedScope === filter.scope : type.computedScopes.includes(filter.scope);
  return [text.includes(filter.q.trim().toLowerCase()), !filter.region || !type.region || type.region === filter.region,
    !filter.persona || !type.allowedPersonas?.length || type.allowedPersonas.includes(filter.persona),
    !filter.scope || scopeMatches, !filter.state || catalogAvailability(type) === filter.state].every(Boolean);
}
function ReportingPersonaError({ profile }: { profile: ReturnType<typeof useCatalogReportingRole>['profile'] }) {
  if (!profile.enabled || !profile.isError) return null;
  return <ErrorState variant="inline" title="Your saved reporting role could not be read." message={profile.error?.message} retry={() => void profile.refetch()} />;
}

function CatalogFilter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const id = React.useId();
  return <div className="rl-filter"><label className="gov-label" htmlFor={id}>{label}</label><select id={id} className="rl-input" value={value} onChange={e => onChange(e.target.value)}><option value="">All</option>{options.map(option => <option key={option} value={option}>{readable(option)}</option>)}</select></div>;
}

interface TraceArtifact { id: string; title: string; status?: string }
function DocumentTracePicker({ type, projectId, canRun, busy, onRun, unavailableReason }: { type: LibraryReportType; projectId?: number; canRun: boolean; busy: boolean; onRun: (type: LibraryReportType) => void; unavailableReason?: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [attempt, setAttempt] = useState(0);
  const id = React.useId();
  const url = open && projectId ? `/api/concept2cure/projects/${projectId}/artifacts` : null;
  const read = useLiveData<unknown>(url, [url, attempt], isRowList);
  const artifacts = rowsOf<TraceArtifact>(read.data).filter(a => typeof a.id === 'string' && typeof a.title === 'string');
  const picked = artifacts.find(a => a.id === selected);
  if (!projectId) return <div className="ro-dash-note" role="note">{I.info} {type.label} requires a document. Open its program to choose the governed document.</div>;
  const run = () => { if (picked) onRun({ ...type, runnable: true, runScopeType: 'document', runScopeId: picked.id, computedScope: 'document', availabilityReason: null }); };
  const mayRun = Boolean(picked && canRun && !busy && type.entitled !== false && !unavailableReason);
  let content: React.ReactNode = <button type="button" className="btn ghost" onClick={() => setOpen(true)}>Choose a document</button>;
  if (open && read.loading) content = <EmptyState busy title="Loading governed documents…" />;
  else if (open && read.error) content = <ErrorState title="Couldn’t read governed documents" message={read.error} retry={() => setAttempt(n => n + 1)} />;
  else if (open && !artifacts.length) content = <EmptyState title="No governed documents in this program" hint="Create or retain a document in the program before running its evidence trace." />;
  else if (open) content = <div className="rl-filters"><div className="rl-filter rl-filter-wide"><label className="gov-label" htmlFor={id}>Document</label><select id={id} className="rl-input" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose a governed document</option>{artifacts.map(a => <option key={a.id} value={a.id}>{a.title}{a.status ? ` · ${a.status}` : ''}</option>)}</select></div><button type="button" className="btn primary" disabled={!mayRun} title={unavailableReason} onClick={run}>Run document trace</button></div>;
  return <section className="rl-form" aria-label="Document evidence trace"><div className="rl-card-h">{type.label}</div><p className="rl-sub">Trace a retained document’s sources, versions and governed decisions. This reports its evidence record; it does not approve the document.</p>
    {content}
    <RunUnavailableNote reason={unavailableReason} />
  </section>;
}

/**
 * The contextual regulatory sections of the project cockpit — MDX-PM-01.
 *
 * Rendered INSIDE the existing ProjectDetail surface, between the workstreams
 * and the AnA thread. Not a route, not a tab group, not a second Projects
 * destination — the whole point of MDX-PM-01 is that the same URL renders
 * different content for a device programme than for a pharmaceutical one, and
 * that is only true if this stays a set of sections.
 *
 * It renders NOTHING when the server returns no sections, which is what happens
 * for every non-MDX project. A biopharma project's cockpit is therefore byte-for-
 * byte the cockpit it is today.
 *
 * Everything shown is derived from what the server sent. Where a value is absent
 * this says so rather than filling it in: a package with no linked tasks shows
 * "no tasks linked", not 0%; a programme with no dated milestones shows that no
 * dates have been committed, not an inferred schedule.
 *
 * @module client/src/concept2cure/projects/components/ProjectRegulatoryPlan
 */

import * as React from 'react';
import type { ProjectRegulatoryPlanData, PlanItemView } from './useRegulatoryContext';

/* ─── helpers ────────────────────────────────────────────────────────────── */

const PHASE_LABEL: Record<string, string> = {
  strategy: 'Strategy',
  design: 'Design',
  verification: 'Verification',
  clinical_performance_evidence: 'Clinical / Performance Evidence',
  submission_preparation: 'Submission Preparation',
  authority_review: 'Authority Review',
  market_authorization: 'Market Authorization',
  postmarket: 'Postmarket',
};

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  complete: 'Complete',
  not_applicable: 'Not applicable',
};

function titleize(id: string): string {
  return id.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

/** Group packages by phase, preserving the server's order within each group. */
function byPhase(packages: PlanItemView[]): Array<{ phase: string; items: PlanItemView[] }> {
  const groups: Array<{ phase: string; items: PlanItemView[] }> = [];
  for (const p of packages) {
    const phase = p.lifecyclePhase ?? 'unclassified';
    const last = groups[groups.length - 1];
    if (last && last.phase === phase) last.items.push(p);
    else groups.push({ phase, items: [p] });
  }
  return groups;
}

/* ─── one package card ───────────────────────────────────────────────────── */

function PackageCard({ item }: { item: PlanItemView }) {
  const state = item.persisted?.status ?? null;
  const { total, complete, blocked } = item.tasks;

  return (
    <div className="pj-wp-card">
      <div className="head">
        <span className="lbl">{item.label}</span>
        {item.applicability === 'conditional' && (
          <span className="pj-wp-tag conditional" title={item.appliesWhen ?? undefined}>
            Conditional
          </span>
        )}
        {item.offPlan && (
          // Real recorded work that the project's current specialization does not
          // call for. Surfaced rather than hidden: the alternative is a plan that
          // silently omits work the programme actually did.
          <span className="pj-wp-tag offplan" title="Recorded for this programme, but not part of the plan for its current specialization.">
            Off plan
          </span>
        )}
        <span className="pj-wp-state">
          {state ? STATUS_LABEL[state] ?? titleize(state) : 'Not instantiated'}
        </span>
      </div>

      {item.purpose && <div className="purpose">{item.purpose}</div>}

      {item.applicability === 'conditional' && item.appliesWhen && (
        <div className="condition">
          <strong>Applies when:</strong> {item.appliesWhen}
          {item.applicabilityBasis && <> — <em>{item.applicabilityBasis}</em></>}
        </div>
      )}

      <div className="meta">
        {/* Counted, never estimated. No percentage is derived from a phase, a
            date, or the number of deliverables the registry names. */}
        {total === 0
          ? 'No tasks linked'
          : `${complete} of ${total} linked tasks complete${blocked > 0 ? ` · ${blocked} blocked` : ''}`}
        {item.filings.length > 0 && ` · feeds ${item.filings.map(titleize).join(', ')}`}
        {item.persisted?.targetDate && ` · target ${item.persisted.targetDate}`}
      </div>

      {item.unsettledInputs.length > 0 && (
        // Reported, never enforced. Compressing a timeline by starting evidence
        // generation before the risk file is settled is a normal, deliberate
        // choice; naming it is useful, blocking it would be wrong.
        <div className="unsettled">
          Depends on {item.unsettledInputs.map(titleize).join(', ')}, not yet recorded complete.
        </div>
      )}
    </div>
  );
}

/* ─── sections ───────────────────────────────────────────────────────────── */

function PlanSection({ packages }: { packages: PlanItemView[] }) {
  return (
    <>
      {byPhase(packages).map(group => (
        <div className="pj-wp-group" key={group.phase}>
          <div className="pj-wp-phase">
            {PHASE_LABEL[group.phase] ?? 'Not classified'}
          </div>
          {group.items.map(item => (
            <PackageCard key={item.persisted?.id ?? item.archetypeId ?? item.label} item={item} />
          ))}
        </div>
      ))}
    </>
  );
}

function StudiesSection({ packages }: { packages: PlanItemView[] }) {
  // Which packages need each study. A study needed by two packages is one study,
  // and showing it twice would suggest two protocols.
  const byStudy = new Map<string, string[]>();
  for (const p of packages) {
    for (const s of p.studyArchetypes) {
      byStudy.set(s, [...(byStudy.get(s) ?? []), p.label]);
    }
  }
  if (byStudy.size === 0) {
    return <div className="pj-wp-empty">No study archetypes are attached to this plan.</div>;
  }
  return (
    <div className="pj-wp-list">
      {[...byStudy.entries()].map(([study, owners]) => (
        <div className="row" key={study}>
          <span className="name">{titleize(study)}</span>
          <span className="note">evidence for {owners.join(', ')}</span>
        </div>
      ))}
    </div>
  );
}

function DeliverablesSection({ packages }: { packages: PlanItemView[] }) {
  const withAny = packages.filter(p => p.deliverables.length > 0);
  if (withAny.length === 0) {
    return <div className="pj-wp-empty">No deliverables are defined for this plan.</div>;
  }
  return (
    <div className="pj-wp-list">
      {withAny.map(p => (
        <div className="block" key={p.archetypeId ?? p.label}>
          <div className="block-head">{p.label}</div>
          {p.deliverables.map(d => (
            <div className="row" key={d}>
              <span className="name">{d}</span>
              {/* Deliberately no state. This layer knows which documents a
                  package has to produce; it does not yet know which of them
                  exist, and a green tick nobody earned is worse than none. */}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function DecisionsSection({ packages }: { packages: PlanItemView[] }) {
  const withAny = packages.filter(p => p.decisions.length > 0);
  const open = withAny.reduce((n, p) => n + p.decisions.length, 0);
  if (open === 0) {
    return <div className="pj-wp-empty">No decisions are defined for this plan.</div>;
  }
  return (
    <>
      <div className="pj-wp-note">
        {open} questions this programme has to answer and defend. None has a
        recorded answer yet — answers are stored against the work package, and
        nothing has written one for this programme.
      </div>
      <div className="pj-wp-list">
        {withAny.map(p => (
          <div className="block" key={p.archetypeId ?? p.label}>
            <div className="block-head">{p.label}</div>
            {p.decisions.map(q => (
              <div className="row" key={q}>
                <span className="name">{q}</span>
                <span className="note">Open</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function TimelineSection({ packages }: { packages: PlanItemView[] }) {
  const dated = packages
    .filter(p => p.persisted?.targetDate)
    .sort((a, b) => (a.persisted!.targetDate! < b.persisted!.targetDate! ? -1 : 1));
  if (dated.length === 0) {
    // Nothing is inferred from a phase or a duration. An empty timeline means
    // nobody has committed to a date, which is a true and useful thing to show.
    return (
      <div className="pj-wp-empty">
        No dated commitments. Dates appear here when a work package is given a
        target — nothing on this timeline is inferred from a phase or a duration.
      </div>
    );
  }
  return (
    <div className="pj-wp-list">
      {dated.map(p => (
        <div className="row" key={p.persisted!.id}>
          <span className="name">{p.persisted!.targetDate}</span>
          <span className="note">
            {p.label}
            {p.persisted!.completedAt ? ' — complete' : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function ClientReviewSection({ packages }: { packages: PlanItemView[] }) {
  const released = packages.filter(
    p => p.persisted && p.persisted.clientVisibility !== 'internal',
  );
  if (released.length === 0) {
    // Fails closed, matching the server: nothing is client-visible until someone
    // releases it, and an empty room is the correct rendering of that.
    return (
      <div className="pj-wp-empty">
        Nothing has been released to the client. Work is internal until it is
        explicitly made visible.
      </div>
    );
  }
  return (
    <div className="pj-wp-list">
      {released.map(p => (
        <div className="row" key={p.persisted!.id}>
          <span className="name">{p.label}</span>
          <span className="note">{titleize(p.persisted!.clientVisibility)}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── the section set ────────────────────────────────────────────────────── */

interface Props {
  plan: ProjectRegulatoryPlanData | null;
}

export function ProjectRegulatoryPlan({ plan }: Props) {
  // No plan, or no sections: render nothing at all. This is the branch every
  // non-MDX project takes, and it is what keeps their cockpit unchanged.
  if (!plan || plan.sections.length === 0) return null;

  if (plan.awaitingDeclaration) {
    return (
      <div className="pj-sec">
        <div className="pj-sec-head">
          <h2>Regulatory plan</h2>
          <span className="meta">Not yet available</span>
          <span className="spacer" />
        </div>
        <div className="pj-wp-declare">
          {/* The resolver refuses to guess a specialization, and this is where
              that refusal becomes visible rather than looking like a bug. */}
          {plan.registryLimit
            ?? 'This project has no declared specialization, so there is no plan to offer.'}
          <div className="hint">
            Set the specialization in the project&apos;s industry profile to see the
            work packages for that kind of programme.
          </div>
        </div>
      </div>
    );
  }

  const body: Record<string, React.ReactNode> = {
    plan: <PlanSection packages={plan.packages} />,
    studies: <StudiesSection packages={plan.packages} />,
    deliverables: <DeliverablesSection packages={plan.packages} />,
    decisions: <DecisionsSection packages={plan.packages} />,
    timeline: <TimelineSection packages={plan.packages} />,
    client_review: <ClientReviewSection packages={plan.packages} />,
  };

  const required = plan.packages.filter(p => p.applicability === 'required').length;

  return (
    <>
      {plan.sections.map(section => (
        <div className="pj-sec" key={section.id}>
          <div className="pj-sec-head">
            <h2>{section.label}</h2>
            <span className="meta">
              {section.id === 'plan'
                ? `${plan.packages.length} work packages · ${required} required`
                : section.description}
            </span>
            <span className="spacer" />
          </div>
          {body[section.id] ?? null}
          {section.id === 'plan' && plan.registryLimit && (
            // The registry publishes what it does not model, and it is rendered
            // rather than buried: a plan that reads as complete when it is half a
            // programme is the failure this guards against.
            <div className="pj-wp-limit">
              <strong>Not modeled here:</strong> {plan.registryLimit}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

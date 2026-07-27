/**
 * The regulatory work-package registry — MDX-PM-01.
 *
 * Three groups of assertion here, and they carry different weight.
 *
 * The INTEGRITY tests are the ones worth having. A work package that names a
 * study the Study Design Center cannot open, or that depends on a package later
 * in the lifecycle than itself, produces a plan that looks authoritative and is
 * broken — and neither failure is visible by reading the registry. Those are
 * checked exhaustively.
 *
 * The CONTENT tests pin the decisions that would be wrong to change silently: no
 * analytical performance panel on software, no biocompatibility programme on an
 * app, nothing at all for an undeclared specialization, and nothing at all
 * outside MDX. That last one IS the acceptance criterion for MDX-PM-01 —
 * selecting a biopharma project has to restore biopharma content — so it is
 * asserted directly rather than left to the UI.
 *
 * What these tests CANNOT establish is that the deliverable and decision lists
 * are right for a given filing. That is a regulatory review, not a unit test.
 */

import { describe, it, expect } from 'vitest';
import {
  WORK_PACKAGE_IDS, WORK_PACKAGE_REGISTRY_VERSION, REGISTRY_LIMITS,
  allWorkPackages, getWorkPackage, isWorkPackageId, workPackagesForSpecialization,
  plannedWorkPackages, sortByLifecycle, packageFilingsInScope, unsettledDependencies,
  PROJECT_SECTIONS, projectSectionsForContext, isServiceOrganization, registryCoverage,
  type WorkPackageId,
} from '../mdx-work-packages';
import { allArchetypes, getArchetype } from '../mdx-study-archetypes';
import { MDX_SPECIALIZATIONS, PRIMARY_INDUSTRIES, type MdxSpecialization } from '../mdx-specialization';
import { lifecyclePhaseRank, isLifecyclePhase } from '../mdx-lifecycle';

// ── Integrity ────────────────────────────────────────────────────────────────

describe('registry integrity', () => {
  it('has one entry per declared id, and no extras', () => {
    expect(allWorkPackages()).toHaveLength(WORK_PACKAGE_IDS.length);
    for (const id of WORK_PACKAGE_IDS) {
      expect(getWorkPackage(id), id).not.toBeNull();
      expect(getWorkPackage(id)!.id, id).toBe(id);
    }
  });

  it('names only studies the archetype registry can actually open', () => {
    // The failure this exists for: a plan links "Reproducibility" and the Study
    // Design Center has no such archetype, so the link opens an empty protocol.
    for (const pkg of allWorkPackages()) {
      for (const studyId of pkg.studyArchetypes) {
        expect(getArchetype(studyId), `${pkg.id} → ${studyId}`).not.toBeNull();
      }
    }
  });

  it('accounts for every archetype in the registry', () => {
    // A study that exists but belongs to no work package is a study nobody's plan
    // schedules — it would only ever be found by browsing the archetype list.
    const claimed = new Set(allWorkPackages().flatMap(p => p.studyArchetypes));
    const orphaned = allArchetypes().map(a => a.id).filter(id => !claimed.has(id));
    expect(orphaned).toEqual([]);
  });

  it('gives every package a real lifecycle phase', () => {
    for (const pkg of allWorkPackages()) {
      expect(isLifecyclePhase(pkg.lifecyclePhase), pkg.id).toBe(true);
    }
  });

  it('never depends on a package later in the lifecycle', () => {
    // A dependency that sits later than its dependant is either a typo or a
    // misunderstanding of the phase; either way it would render as a warning that
    // can never clear.
    for (const pkg of allWorkPackages()) {
      for (const dep of pkg.dependsOn) {
        const target = getWorkPackage(dep);
        expect(target, `${pkg.id} → ${dep}`).not.toBeNull();
        expect(
          lifecyclePhaseRank(target!.lifecyclePhase),
          `${pkg.id} (${pkg.lifecyclePhase}) depends on ${dep} (${target!.lifecyclePhase})`,
        ).toBeLessThanOrEqual(lifecyclePhaseRank(pkg.lifecyclePhase));
      }
    }
  });

  it('has no package depending on itself', () => {
    for (const pkg of allWorkPackages()) {
      expect(pkg.dependsOn, pkg.id).not.toContain(pkg.id);
    }
  });

  it('gives every package a purpose, a deliverable, a decision and a reference', () => {
    for (const pkg of allWorkPackages()) {
      expect(pkg.purpose.length, pkg.id).toBeGreaterThan(20);
      expect(pkg.deliverables.length, pkg.id).toBeGreaterThan(0);
      expect(pkg.decisions.length, pkg.id).toBeGreaterThan(0);
      expect(pkg.references.length, pkg.id).toBeGreaterThan(0);
      expect(pkg.supportsFilings.length, pkg.id).toBeGreaterThan(0);
    }
  });

  it('phrases every decision as a question', () => {
    // Decisions are prompts for a judgement the programme has to defend. A
    // statement here would read as the platform having already decided.
    for (const pkg of allWorkPackages()) {
      for (const d of pkg.decisions) {
        expect(d.trim().endsWith('?'), `${pkg.id}: ${d}`).toBe(true);
      }
    }
  });

  it('states no duration, date or sample size anywhere', () => {
    // The registry says what must exist, never how long it takes or how many
    // samples it needs. A fabricated duration on a regulatory timeline is worse
    // than an absent one, and a fabricated n would be adopted unexamined.
    const forbidden = /\b(\d+\s*(days?|weeks?|months?|years?)|n\s*=\s*\d+)\b/i;
    for (const pkg of allWorkPackages()) {
      const text = [pkg.purpose, ...pkg.deliverables, ...pkg.decisions].join(' | ');
      expect(text, pkg.id).not.toMatch(forbidden);
    }
  });

  it('is versioned', () => {
    expect(WORK_PACKAGE_REGISTRY_VERSION).toMatch(/^\d{4}\.\d{2}\.\d+$/);
    expect(registryCoverage().packages).toBe(WORK_PACKAGE_IDS.length);
    expect(registryCoverage().version).toBe(WORK_PACKAGE_REGISTRY_VERSION);
  });

  it('recognizes its own ids and rejects others', () => {
    expect(isWorkPackageId('analytical_performance')).toBe(true);
    expect(isWorkPackageId('analytical-performance')).toBe(false);
    expect(isWorkPackageId(null)).toBe(false);
    expect(getWorkPackage('not_a_package')).toBeNull();
  });
});

// ── Per-specialization composition ───────────────────────────────────────────

describe('workPackagesForSpecialization', () => {
  it('covers every declared specialization', () => {
    for (const s of MDX_SPECIALIZATIONS) {
      expect(workPackagesForSpecialization(s).specialization, s).toBe(s);
    }
  });

  it('resolves every listed id, in both lists', () => {
    for (const s of MDX_SPECIALIZATIONS) {
      const { required, conditional } = workPackagesForSpecialization(s);
      for (const id of [...required, ...conditional]) {
        expect(getWorkPackage(id), `${s} → ${id}`).not.toBeNull();
      }
    }
  });

  it('never lists the same package as both required and conditional', () => {
    // The unions for medical_device_and_ivd are the risk here: a package required
    // on one side and conditional on the other would render twice, once asking a
    // question that the other answer already settled.
    for (const s of MDX_SPECIALIZATIONS) {
      const { required, conditional } = workPackagesForSpecialization(s);
      const overlap = required.filter(id => conditional.includes(id));
      expect(overlap, s).toEqual([]);
    }
  });

  it('has no duplicates within either list', () => {
    for (const s of MDX_SPECIALIZATIONS) {
      const { required, conditional } = workPackagesForSpecialization(s);
      expect(new Set(required).size, `${s} required`).toBe(required.length);
      expect(new Set(conditional).size, `${s} conditional`).toBe(conditional.length);
    }
  });

  it('states a condition for every conditional package', () => {
    // A conditional package with no stated condition is an unanswerable question:
    // the surface would ask "does this apply?" without saying on what basis.
    for (const s of MDX_SPECIALIZATIONS) {
      for (const id of workPackagesForSpecialization(s).conditional) {
        expect(getWorkPackage(id)!.appliesWhen, `${s} → ${id}`).not.toBeNull();
      }
    }
  });

  it('gives an undeclared specialization nothing at all', () => {
    // Matching specializationPreset('unspecified'). Offering every package would
    // be the same failure as guessing — a plan wrong for half of it, presented as
    // the plan. REGISTRY_LIMITS says so in words the surface can render.
    const u = workPackagesForSpecialization('unspecified');
    expect(u.required).toEqual([]);
    expect(u.conditional).toEqual([]);
    expect(REGISTRY_LIMITS.unspecified).toContain('no plan to offer');
  });

  it('treats an unrecognized value as unspecified rather than throwing', () => {
    expect(workPackagesForSpecialization('made_up').specialization).toBe('unspecified');
    expect(workPackagesForSpecialization(null).required).toEqual([]);
    expect(workPackagesForSpecialization(undefined).required).toEqual([]);
  });
});

describe('specialization content that must not drift', () => {
  const required = (s: MdxSpecialization) => workPackagesForSpecialization(s).required;
  const conditional = (s: MdxSpecialization) => workPackagesForSpecialization(s).conditional;

  it('gives an IVD programme the three performance pillars', () => {
    // IVDR treats scientific validity, analytical performance and clinical
    // performance as three separate pillars. Collapsing them is the single most
    // common gap in an IVD technical file.
    expect(required('ivd_diagnostics')).toContain('scientific_validity');
    expect(required('ivd_diagnostics')).toContain('analytical_performance');
    expect(required('ivd_diagnostics')).toContain('clinical_performance_ivd');
    expect(required('ivd_diagnostics')).toContain('stability');
  });

  it('does not put an analytical performance panel on software', () => {
    // There is no reagent, no specimen and no shelf life. Offering precision and
    // limit-of-detection studies for an app is the wrong regulatory instrument.
    expect(required('software_as_medical_device')).not.toContain('analytical_performance');
    expect(required('software_as_medical_device')).not.toContain('stability');
    expect(conditional('software_as_medical_device')).not.toContain('analytical_performance');
  });

  it('does not put biocompatibility on software, even conditionally', () => {
    const samd = workPackagesForSpecialization('software_as_medical_device');
    expect([...samd.required, ...samd.conditional])
      .not.toContain('biocompatibility_and_sterilization');
  });

  it('makes the software lifecycle required for SaMD and conditional for a device', () => {
    // For SaMD the software IS the product; for a device it depends on whether the
    // device contains software, which the specialization cannot know.
    expect(required('software_as_medical_device')).toContain('software_lifecycle');
    expect(conditional('medical_device')).toContain('software_lifecycle');
    expect(required('medical_device')).not.toContain('software_lifecycle');
  });

  it('makes a clinical investigation conditional for a device, never assumed', () => {
    // Many 510(k) programmes carry no clinical investigation at all. Putting one
    // on every device plan would manufacture a study nobody needs.
    expect(conditional('medical_device')).toContain('clinical_investigation');
    expect(required('medical_device')).not.toContain('clinical_investigation');
    expect(getWorkPackage('clinical_investigation')!.appliesWhen).toContain('510(k)');
  });

  it('makes CLIA waiver evidence conditional and IVD-only', () => {
    expect(conditional('ivd_diagnostics')).toContain('clia_waiver');
    const device = workPackagesForSpecialization('medical_device');
    expect([...device.required, ...device.conditional]).not.toContain('clia_waiver');
  });

  it('makes CDx coordination required for a companion diagnostic', () => {
    // A CDx's claim is tied to a therapeutic. Coordination with the drug programme
    // is the thing that distinguishes it from any other IVD, so it is not optional.
    expect(required('companion_diagnostic')).toContain('cdx_coordination');
    expect(required('companion_diagnostic')).toContain('analytical_performance');
    const ivd = workPackagesForSpecialization('ivd_diagnostics');
    expect([...ivd.required, ...ivd.conditional]).not.toContain('cdx_coordination');
  });

  it('makes EU postmarket follow-up conditional on an EU market', () => {
    // A US-only programme carries postmarket surveillance without a PMCF or PMPF
    // plan. Requiring one would put an EU obligation on a domestic filing.
    for (const s of ['medical_device', 'ivd_diagnostics', 'software_as_medical_device'] as const) {
      expect(required(s), s).toContain('postmarket_surveillance');
      expect(conditional(s), s).toContain('pmcf_pmpf');
      expect(required(s), s).not.toContain('pmcf_pmpf');
    }
  });

  it('publishes what it does not model for a combination product', () => {
    // The drug constituent's CMC and nonclinical work is genuinely absent, and a
    // plan that reads as complete when it is half a programme is the failure.
    expect(REGISTRY_LIMITS.combination_product).toContain('drug or biologic constituent');
    expect(REGISTRY_LIMITS.companion_diagnostic).toContain('therapeutic programme');
  });

  it('has a limits entry — even if null — for every specialization', () => {
    for (const s of MDX_SPECIALIZATIONS) {
      expect(Object.prototype.hasOwnProperty.call(REGISTRY_LIMITS, s), s).toBe(true);
    }
  });

  it('unions device and IVD without losing either side', () => {
    const both = workPackagesForSpecialization('medical_device_and_ivd').required;
    expect(both).toContain('verification_and_validation');   // device side
    expect(both).toContain('analytical_performance');        // IVD side
  });
});

// ── plannedWorkPackages: the acceptance criterion ────────────────────────────

describe('plannedWorkPackages', () => {
  it('returns nothing outside MDX', () => {
    // MDX-PM-01's acceptance criterion, asserted where it can be held still:
    // selecting a biopharma project restores biopharma content, because there is
    // no MDX work-package model for it and inventing one would put device
    // vocabulary on a pharmaceutical programme.
    expect(plannedWorkPackages({ vertical: 'biopharma', specialization: 'ivd_diagnostics' }))
      .toEqual([]);
    expect(plannedWorkPackages({ vertical: 'pdev', specialization: 'medical_device' }))
      .toEqual([]);
  });

  it('returns the required and conditional packages for an MDX project', () => {
    const planned = plannedWorkPackages({ vertical: 'mdx', specialization: 'ivd_diagnostics' });
    const { required, conditional } = workPackagesForSpecialization('ivd_diagnostics');
    expect(planned).toHaveLength(required.length + conditional.length);
    for (const p of planned) {
      const expected = required.includes(p.id) ? 'required' : 'conditional';
      expect(p.applicability, p.id).toBe(expected);
    }
  });

  it('returns nothing for an MDX project with no declared specialization', () => {
    expect(plannedWorkPackages({ vertical: 'mdx', specialization: 'unspecified' })).toEqual([]);
    expect(plannedWorkPackages({ vertical: 'mdx', specialization: null })).toEqual([]);
  });

  it('orders the plan along the lifecycle, strategy first and postmarket last', () => {
    const planned = plannedWorkPackages({ vertical: 'mdx', specialization: 'ivd_diagnostics' });
    const ranks = planned.map(p => lifecyclePhaseRank(p.lifecyclePhase));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(planned[0].id).toBe('regulatory_strategy');
    expect(planned[planned.length - 1].lifecyclePhase).toBe('postmarket');
  });

  it('keeps registry order within a phase, rather than sorting alphabetically', () => {
    // Alphabetical would put "Stability" before "Analytical performance" in the
    // verification phase, which reads as though the shelf-life claim comes first.
    const verification = plannedWorkPackages({ vertical: 'mdx', specialization: 'ivd_diagnostics' })
      .filter(p => p.lifecyclePhase === 'verification')
      .map(p => p.id);
    expect(verification.indexOf('analytical_performance'))
      .toBeLessThan(verification.indexOf('stability'));
  });
});

describe('sortByLifecycle', () => {
  it('is stable against input order', () => {
    const planned = plannedWorkPackages({ vertical: 'mdx', specialization: 'medical_device' });
    const forward = sortByLifecycle(planned).map(p => p.id);
    const reversed = sortByLifecycle([...planned].reverse()).map(p => p.id);
    expect(reversed).toEqual(forward);
  });

  it('does not mutate its input', () => {
    const planned = plannedWorkPackages({ vertical: 'mdx', specialization: 'medical_device' });
    const before = planned.map(p => p.id);
    sortByLifecycle(planned);
    expect(planned.map(p => p.id)).toEqual(before);
  });
});

// ── Filing scope and dependencies ────────────────────────────────────────────

describe('packageFilingsInScope', () => {
  const analytical = getWorkPackage('analytical_performance')!;

  it('returns every supported filing when the project has declared none', () => {
    // No declared pathway means nothing is known to be out of scope, not that
    // everything is.
    expect(packageFilingsInScope(analytical, [])).toEqual(analytical.supportsFilings);
  });

  it('narrows to the intersection when the project has declared pathways', () => {
    expect(packageFilingsInScope(analytical, ['ivd_510k', 'us_510k']))
      .toEqual(['ivd_510k']);
  });

  it('returns nothing when the package feeds none of the project pathways', () => {
    expect(packageFilingsInScope(analytical, ['us_510k', 'pma'])).toEqual([]);
  });
});

describe('unsettledDependencies', () => {
  const clinical = getWorkPackage('clinical_performance_ivd')!;

  it('names the inputs that are not settled yet', () => {
    expect(unsettledDependencies(clinical, [])).toEqual(clinical.dependsOn);
    expect(unsettledDependencies(clinical, ['analytical_performance']))
      .toEqual(['scientific_validity']);
  });

  it('returns nothing once every input is settled', () => {
    expect(unsettledDependencies(clinical, ['analytical_performance', 'scientific_validity']))
      .toEqual([]);
  });

  it('reports rather than enforces — a package with no declared inputs is never unsettled', () => {
    // Compressing a timeline by starting evidence generation before the risk file
    // is settled is a normal, deliberate choice. Naming it is useful; blocking it
    // would be wrong, and nothing here blocks anything.
    expect(unsettledDependencies(getWorkPackage('regulatory_strategy')!, [])).toEqual([]);
  });
});

// ── Contextual cockpit sections ──────────────────────────────────────────────

describe('projectSectionsForContext', () => {
  const mdx = (specialization: string, primaryIndustry?: 'cro' | 'medical_device_diagnostics') =>
    projectSectionsForContext({ vertical: 'mdx', specialization, primaryIndustry });

  it('adds nothing outside MDX', () => {
    // The other half of the acceptance criterion: no extra sections appear on a
    // biopharma project, so its cockpit is the cockpit it is today.
    expect(projectSectionsForContext({ vertical: 'biopharma', specialization: null })).toEqual([]);
    expect(projectSectionsForContext({ vertical: 'pdev', specialization: 'medical_device' }))
      .toEqual([]);
  });

  it('uses the specialization vocabulary for the studies section', () => {
    // The visible payoff of the whole context architecture: an IVD sponsor is not
    // running clinical investigations, and a shell that says so reads as built for
    // someone else.
    const label = (s: string) => mdx(s).find(x => x.id === 'studies')!.label;
    expect(label('ivd_diagnostics')).toBe('Performance studies');
    expect(label('medical_device')).toBe('Clinical investigations');
    expect(label('software_as_medical_device')).toBe('Clinical validations');
    expect(label('companion_diagnostic')).toBe('Performance studies');
  });

  it('falls back to a neutral label when the specialization sets no study word', () => {
    // 'unspecified' has empty terminology by design. The section still needs a
    // name, and "Studies" is the honest neutral one.
    expect(mdx('unspecified').find(x => x.id === 'studies')!.label).toBe('Studies');
  });

  it('shows a client review section only for an organization that has clients', () => {
    // A device manufacturer running its own programme has colleagues, not clients.
    // An empty "Client review" section would be furniture.
    expect(mdx('medical_device', 'cro').map(s => s.id)).toContain('client_review');
    expect(mdx('medical_device', 'medical_device_diagnostics').map(s => s.id))
      .not.toContain('client_review');
    expect(mdx('medical_device').map(s => s.id)).not.toContain('client_review');
  });

  it('returns the five core sections for any MDX project', () => {
    expect(mdx('ivd_diagnostics').map(s => s.id))
      .toEqual(['plan', 'studies', 'deliverables', 'decisions', 'timeline']);
  });

  it('only ever returns declared section ids', () => {
    for (const s of MDX_SPECIALIZATIONS) {
      for (const section of mdx(s, 'cro')) {
        expect(PROJECT_SECTIONS as readonly string[], section.id).toContain(section.id);
        expect(section.label.length, section.id).toBeGreaterThan(0);
        expect(section.description.length, section.id).toBeGreaterThan(0);
      }
    }
  });

  it('promises nothing inferred on the timeline', () => {
    const timeline = mdx('medical_device').find(s => s.id === 'timeline')!;
    expect(timeline.description).toContain('Nothing is inferred');
  });
});

describe('isServiceOrganization', () => {
  it('is true for organizations whose projects belong to clients', () => {
    expect(isServiceOrganization('cro')).toBe(true);
    expect(isServiceOrganization('regulatory_consulting')).toBe(true);
    expect(isServiceOrganization('academic_research')).toBe(true);
  });

  it('is false for organizations running their own programmes', () => {
    expect(isServiceOrganization('medical_device_diagnostics')).toBe(false);
    expect(isServiceOrganization('biotech_pharma')).toBe(false);
  });

  it('is false when the industry is not known, rather than assuming a client', () => {
    // Failing closed here means a client review section is never shown to an
    // organization that may have no clients at all.
    expect(isServiceOrganization(null)).toBe(false);
    expect(isServiceOrganization(undefined)).toBe(false);
  });

  it('answers for every declared primary industry', () => {
    for (const i of PRIMARY_INDUSTRIES) {
      expect(typeof isServiceOrganization(i), i).toBe('boolean');
    }
  });
});

// ── Coverage reporting ───────────────────────────────────────────────────────

describe('registryCoverage', () => {
  it('counts what it says it counts', () => {
    const c = registryCoverage();
    const all = allWorkPackages();
    expect(c.packages).toBe(all.length);
    expect(c.withStudies).toBe(all.filter(p => p.studyArchetypes.length > 0).length);
    expect(c.conditional).toBe(all.filter(p => p.appliesWhen !== null).length);
    // Some packages are pure documentation work with no study behind them
    // (labeling, submission assembly). If every package had studies, something
    // would have been assigned a study to make a number look better.
    expect(c.withStudies).toBeLessThan(c.packages);
    expect(c.conditional).toBeGreaterThan(0);
  });

  it('reports ids that are declared but unreachable from any specialization', () => {
    // Not an assertion that the set is empty — a package can legitimately be
    // declared before a specialization claims it. This test exists so that state
    // is visible in the suite rather than discovered in a plan that omits it.
    const reachable = new Set<WorkPackageId>();
    for (const s of MDX_SPECIALIZATIONS) {
      const { required, conditional } = workPackagesForSpecialization(s);
      for (const id of [...required, ...conditional]) reachable.add(id);
    }
    const unreachable = WORK_PACKAGE_IDS.filter(id => !reachable.has(id));
    expect(unreachable).toEqual([]);
  });
});

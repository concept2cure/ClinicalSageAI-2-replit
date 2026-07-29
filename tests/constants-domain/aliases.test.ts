/**
 * Alias-bridge completeness guard.
 *
 * Walks the LIVE AnA flow registry, collects every option value used by the
 * therapeutic_area / phase / study_phase / development_phase /
 * route_of_administration / dosage_form fields, and asserts that EVERY value
 * either normalizes to a real canonical constant member OR is explicitly declared
 * in INTENTIONALLY_UNMAPPED. No flow value may silently normalize to null.
 *
 * This makes shared/constants/domain/aliases.ts provably complete and
 * self-maintaining: a newly-introduced unmapped flow value fails this test.
 */
import { describe, it, expect } from 'vitest';

import {
  getAvailableFlows,
  getFlowDefinition,
} from '../../server/services/ana/intelligence-questions/flows/index';
import type { FlowEngineContext } from '../../server/services/ana/intelligence-questions/types';

import {
  normalizeTherapeuticArea,
  normalizeClinicalPhase,
  normalizeRouteOfAdministration,
  normalizeDosageForm,
  INTENTIONALLY_UNMAPPED,
} from '../../shared/constants/domain/aliases';

import { THERAPEUTIC_AREAS } from '../../shared/constants/domain/therapeutic-areas';
import { CLINICAL_PHASES } from '../../shared/constants/domain/clinical-phases';
import { ROUTES_OF_ADMINISTRATION } from '../../shared/constants/domain/routes-of-administration';
import { DOSAGE_FORMS } from '../../shared/constants/domain/dosage-forms';

/* ─── canonical membership sets ────────────────────────────────────────── */

const CANON = {
  therapeuticArea: new Set(THERAPEUTIC_AREAS.map((e) => e.value)),
  clinicalPhase: new Set(CLINICAL_PHASES.map((e) => e.value)),
  routeOfAdministration: new Set(ROUTES_OF_ADMINISTRATION.map((e) => e.value)),
  dosageForm: new Set(DOSAGE_FORMS.map((e) => e.value)),
} as const;

/* ─── field-id → normalizer + domain classification ────────────────────── */

type DomainKey = keyof typeof CANON;

const FIELD_TO_DOMAIN: Record<string, DomainKey> = {
  therapeutic_area: 'therapeuticArea',
  phase: 'clinicalPhase',
  study_phase: 'clinicalPhase',
  development_phase: 'clinicalPhase',
  route_of_administration: 'routeOfAdministration',
  dosage_form: 'dosageForm',
};

const NORMALIZERS: Record<DomainKey, (raw: string) => string | null> = {
  therapeuticArea: normalizeTherapeuticArea,
  clinicalPhase: normalizeClinicalPhase,
  routeOfAdministration: normalizeRouteOfAdministration,
  dosageForm: normalizeDosageForm,
};

const UNMAPPED: Record<DomainKey, Record<string, string>> = {
  therapeuticArea: INTENTIONALLY_UNMAPPED.therapeuticArea,
  clinicalPhase: INTENTIONALLY_UNMAPPED.clinicalPhase,
  routeOfAdministration: INTENTIONALLY_UNMAPPED.routeOfAdministration,
  dosageForm: INTENTIONALLY_UNMAPPED.dosageForm,
};

/* ─── collect every (domain, value) pair from the live registry ────────── */

const CLIENT_TYPES: NonNullable<FlowEngineContext['clientType']>[] = [
  'pharma',
  'biotech',
  'medtech',
];

/** Map of domain → Set<rawValue> collected across all flows & client types. */
function collectFlowValues(): Record<DomainKey, Set<string>> {
  const collected: Record<DomainKey, Set<string>> = {
    therapeuticArea: new Set(),
    clinicalPhase: new Set(),
    routeOfAdministration: new Set(),
    dosageForm: new Set(),
  };

  for (const clientType of CLIENT_TYPES) {
    const ctx: FlowEngineContext = {
      organizationId: null,
      userId: null,
      projectId: null,
      clientType,
    };

    for (const { category } of getAvailableFlows(ctx)) {
      const def = getFlowDefinition(category, ctx);
      if (!def) continue;

      for (const node of def.nodes) {
        for (const field of node.fields) {
          const domain = FIELD_TO_DOMAIN[field.id];
          if (!domain || !field.options) continue;
          for (const opt of field.options) {
            collected[domain].add(opt.value);
          }
        }
      }
    }
  }

  return collected;
}

const COLLECTED = collectFlowValues();

/* ─── the key guard ────────────────────────────────────────────────────── */

describe('alias bridge — completeness against the live flow registry', () => {
  it('collected at least one value for every relevant domain', () => {
    // Sanity: the registry actually produced values, so the guard is meaningful.
    expect(COLLECTED.therapeuticArea.size).toBeGreaterThan(0);
    expect(COLLECTED.clinicalPhase.size).toBeGreaterThan(0);
    expect(COLLECTED.routeOfAdministration.size).toBeGreaterThan(0);
    expect(COLLECTED.dosageForm.size).toBeGreaterThan(0);
  });

  for (const domain of Object.keys(CANON) as DomainKey[]) {
    it(`every ${domain} flow value maps to a canonical member or is intentionally unmapped`, () => {
      const normalize = NORMALIZERS[domain];
      const canon = CANON[domain];
      const unmapped = UNMAPPED[domain];

      for (const raw of COLLECTED[domain]) {
        const result = normalize(raw);
        if (result === null) {
          // Must be a declared, reviewed decision — never a silent null.
          expect(
            Object.prototype.hasOwnProperty.call(unmapped, raw),
            `flow value "${raw}" for ${domain} normalizes to null but is NOT declared in INTENTIONALLY_UNMAPPED.${domain}`,
          ).toBe(true);
        } else {
          // Must be an actual member of the canonical constant array.
          expect(
            canon.has(result),
            `flow value "${raw}" for ${domain} normalized to "${result}", which is not a canonical member`,
          ).toBe(true);
        }
      }
    });
  }
});

/* ─── targeted unit assertions for the tricky mappings ─────────────────── */

describe('alias bridge — targeted mappings', () => {
  it('therapeutic area aliases', () => {
    expect(normalizeTherapeuticArea('cardiovascular')).toBe('cardiology');
    expect(normalizeTherapeuticArea('cardiology')).toBe('cardiology');
    expect(normalizeTherapeuticArea('cns')).toBe('neurology');
    expect(normalizeTherapeuticArea('endocrine')).toBe('endocrinology');
    expect(normalizeTherapeuticArea('oncology')).toBe('oncology');
    // not a therapeutic area
    expect(normalizeTherapeuticArea('medical_device')).toBeNull();
  });

  it('clinical phase aliases', () => {
    expect(normalizeClinicalPhase('phase_1b_2a')).toBe('phase_1_2');
    expect(normalizeClinicalPhase('phase_2b_3')).toBe('phase_2_3');
    expect(normalizeClinicalPhase('phase_3b_4')).toBe('phase_3b');
    expect(normalizeClinicalPhase('discovery')).toBe('preclinical');
    expect(normalizeClinicalPhase('ind_enabling')).toBe('preclinical');
    expect(normalizeClinicalPhase('phase_3')).toBe('phase_3');
    // regulatory / device stages are not clinical phases
    expect(normalizeClinicalPhase('nda_bla')).toBeNull();
    expect(normalizeClinicalPhase('device_design')).toBeNull();
  });

  it('route of administration aliases', () => {
    expect(normalizeRouteOfAdministration('iv')).toBe('intravenous');
    expect(normalizeRouteOfAdministration('sc')).toBe('subcutaneous');
    expect(normalizeRouteOfAdministration('im')).toBe('intramuscular');
    expect(normalizeRouteOfAdministration('inhalation')).toBe('inhaled');
    expect(normalizeRouteOfAdministration('intradermal')).toBe('intradermal');
    // dosage form / device — not a route
    expect(normalizeRouteOfAdministration('implant')).toBeNull();
    expect(normalizeRouteOfAdministration('na_device')).toBeNull();
  });

  it('dosage form aliases', () => {
    expect(normalizeDosageForm('tablet')).toBe('tablet_ir');
    expect(normalizeDosageForm('oral_solution')).toBe('solution_oral');
    expect(normalizeDosageForm('powder')).toBe('powder_reconstitution');
    expect(normalizeDosageForm('cream_ointment')).toBe('cream');
    expect(normalizeDosageForm('patch')).toBe('transdermal_patch');
    expect(normalizeDosageForm('injection_iv')).toBe('solution_injection');
    expect(normalizeDosageForm('injection_sc')).toBe('solution_injection');
    expect(normalizeDosageForm('infusion')).toBe('solution_injection');
    expect(normalizeDosageForm('inhaler')).toBe('metered_dose_inhaler');
    expect(normalizeDosageForm('suppository')).toBe('suppository');
    // ambiguous / not-a-finished-form
    expect(normalizeDosageForm('solution')).toBeNull();
    expect(normalizeDosageForm('suspension')).toBeNull();
    expect(normalizeDosageForm('bulk_api')).toBeNull();
    expect(normalizeDosageForm('ophthalmic')).toBeNull();
    expect(normalizeDosageForm('topical')).toBeNull();
  });

  it('unknown values return null', () => {
    expect(normalizeTherapeuticArea('not_a_real_area')).toBeNull();
    expect(normalizeClinicalPhase('phase_99')).toBeNull();
    expect(normalizeRouteOfAdministration('teleportation')).toBeNull();
    expect(normalizeDosageForm('vaporware')).toBeNull();
  });
});

/**
 * CMC specifications expert — ICH Q6A (chemical) & Q6B (biological) test sets.
 *
 * Defining the specification — the list of tests, references to analytical
 * procedures, and acceptance criteria — for a drug substance and drug product is
 * a core RA CMC task: it establishes the quality attributes the product must meet
 * to be deemed acceptable for its intended use. This service encodes the ICH Q6A
 * universal tests for new chemical (small-molecule) drug substances/products and
 * the dosage-form-specific tests (solid oral, oral liquid, parenteral), plus the
 * ICH Q6B test set expected for biotechnological/biological products.
 *
 * Pure / deterministic — no DB, no IO. The encoded tables are a reference aid:
 * they enumerate the TEST SET that is generally expected to appear in a
 * specification, NOT numeric acceptance criteria. Acceptance criteria (and which
 * tests ultimately apply) are product-specific and must be justified case-by-case
 * per the ICH Q6A/Q6B decision trees.
 *
 * References:
 *   - ICH Q6A — Specifications: Test Procedures and Acceptance Criteria for New
 *     Drug Substances and New Drug Products: Chemical Substances
 *     (universal tests + dosage-form-specific tests; decision trees).
 *   - ICH Q6B — Specifications: Test Procedures and Acceptance Criteria for
 *     Biotechnological/Biological Products
 *     (identity, purity/impurities, potency, quantity, general tests).
 *
 * @module server/services/global-ri/cmc-specifications
 */

const ICH_Q6A = 'ICH Q6A';
const ICH_Q6B = 'ICH Q6B';

/** The modeled product types. */
export type SpecProductType = 'small_molecule' | 'biologic';

/** The modeled chemical (Q6A) dosage forms with form-specific test sets. */
export type SpecDosageForm = 'solid_oral' | 'oral_liquid' | 'parenteral';

/** The modeled product types, as a value (for iteration/validation). */
export const SPEC_PRODUCT_TYPES: SpecProductType[] = ['small_molecule', 'biologic'];

/** The modeled dosage forms, as a value (for iteration/validation). */
export const SPEC_DOSAGE_FORMS: SpecDosageForm[] = ['solid_oral', 'oral_liquid', 'parenteral'];

/** A single specification test (name + governing citation). */
export interface SpecTest {
  /** Stable identifier (snake_case). */
  id: string;
  /** Human-readable test title. */
  title: string;
  /** Governing ICH citation. */
  citation: string;
}

/** The universal-test result for a product type. */
export interface UniversalTestsResult {
  productType: SpecProductType;
  /** The universal tests expected in the specification. */
  tests: SpecTest[];
  /** Governing citation. */
  citation: string;
  /** Honest caveats. */
  notes: string[];
}

/** Input to {@link getSpecificationTests}. */
export interface SpecificationTestsInput {
  productType: SpecProductType;
  /** Optional dosage form (chemical Q6A forms; for biologic only 'parenteral' is recognised). */
  dosageForm?: SpecDosageForm;
}

/** The combined universal + dosage-form-specific test set. */
export interface SpecificationTestsResult {
  productType: SpecProductType;
  /** The resolved dosage form, or null when none was supplied. */
  dosageForm: string | null;
  /** Universal tests for the product type. */
  universalTests: SpecTest[];
  /** Dosage-form-specific tests (empty when not applicable). */
  dosageFormTests: SpecTest[];
  /** Governing citation. */
  citation: string;
  /** Honest caveats. */
  notes: string[];
}

/**
 * Honest caveat appended to every output: the service lists the expected TEST
 * SET, not numeric acceptance criteria. Criteria and applicability are
 * product-specific and justified case-by-case per the ICH Q6A/Q6B decision trees.
 */
const CASE_BY_CASE_CAVEAT =
  'Acceptance criteria are product-specific and justified case-by-case per the ICH Q6A/Q6B decision trees; this lists the expected TEST set, not numeric limits.';

/* ------------------------------------------------------------------------- *
 * A) ICH Q6A — universal tests for chemical (small-molecule) substances/products
 * ------------------------------------------------------------------------- */

// Q6A universal tests applicable to both new drug substances and new drug products.
const Q6A_UNIVERSAL_TESTS: SpecTest[] = [
  { id: 'description', title: 'Description (appearance)', citation: ICH_Q6A },
  { id: 'identification', title: 'Identification', citation: ICH_Q6A },
  { id: 'assay', title: 'Assay', citation: ICH_Q6A },
  { id: 'impurities', title: 'Impurities', citation: ICH_Q6A },
];

/* ------------------------------------------------------------------------- *
 * B) ICH Q6B — test set for biotechnological/biological products
 * ------------------------------------------------------------------------- */

// Q6B specification test set (appearance, identity, purity/impurities, potency,
// quantity, plus general tests / characterization).
const Q6B_TESTS: SpecTest[] = [
  { id: 'appearance', title: 'Appearance and description', citation: ICH_Q6B },
  { id: 'identity', title: 'Identity', citation: ICH_Q6B },
  { id: 'purity_and_impurities', title: 'Purity and impurities (process- and product-related)', citation: ICH_Q6B },
  { id: 'potency', title: 'Potency (biological activity)', citation: ICH_Q6B },
  { id: 'quantity', title: 'Quantity (protein/content)', citation: ICH_Q6B },
  { id: 'general_tests', title: 'General tests (e.g. pH, excipients)', citation: ICH_Q6B },
];

const UNIVERSAL_TESTS_BY_TYPE: Record<SpecProductType, UniversalTestsResult> = {
  small_molecule: {
    productType: 'small_molecule',
    tests: Q6A_UNIVERSAL_TESTS,
    citation: ICH_Q6A,
    notes: [
      'ICH Q6A universal tests apply to both a new drug substance and a new drug product; a drug product additionally requires dosage-form-specific tests.',
      CASE_BY_CASE_CAVEAT,
    ],
  },
  biologic: {
    productType: 'biologic',
    tests: Q6B_TESTS,
    citation: ICH_Q6B,
    notes: [
      'ICH Q6B test set; product characterization is extensive and the applicable tests depend on the molecule and manufacturing process.',
      CASE_BY_CASE_CAVEAT,
    ],
  },
};

/* ------------------------------------------------------------------------- *
 * C) ICH Q6A — dosage-form-specific tests (drug product)
 * ------------------------------------------------------------------------- */

const Q6A_SOLID_ORAL_TESTS: SpecTest[] = [
  { id: 'dissolution', title: 'Dissolution', citation: ICH_Q6A },
  { id: 'uniformity_of_dosage_units', title: 'Uniformity of dosage units', citation: ICH_Q6A },
  { id: 'disintegration', title: 'Disintegration (where relevant)', citation: ICH_Q6A },
  { id: 'water_content', title: 'Water content', citation: ICH_Q6A },
  { id: 'microbial_limits', title: 'Microbial limits', citation: ICH_Q6A },
];

const Q6A_ORAL_LIQUID_TESTS: SpecTest[] = [
  { id: 'uniformity_of_dosage_units', title: 'Uniformity of dosage units', citation: ICH_Q6A },
  { id: 'ph', title: 'pH', citation: ICH_Q6A },
  { id: 'microbial_limits', title: 'Microbial limits', citation: ICH_Q6A },
  { id: 'antimicrobial_preservative_content', title: 'Antimicrobial preservative content', citation: ICH_Q6A },
];

const Q6A_PARENTERAL_TESTS: SpecTest[] = [
  { id: 'sterility', title: 'Sterility', citation: ICH_Q6A },
  { id: 'endotoxins_pyrogens', title: 'Bacterial endotoxins / pyrogens', citation: ICH_Q6A },
  { id: 'particulate_matter', title: 'Particulate matter', citation: ICH_Q6A },
  { id: 'ph', title: 'pH', citation: ICH_Q6A },
  { id: 'uniformity_of_dosage_units', title: 'Uniformity of dosage units', citation: ICH_Q6A },
];

const DOSAGE_FORM_TESTS: Record<SpecDosageForm, SpecTest[]> = {
  solid_oral: Q6A_SOLID_ORAL_TESTS,
  oral_liquid: Q6A_ORAL_LIQUID_TESTS,
  parenteral: Q6A_PARENTERAL_TESTS,
};

/* ------------------------------------------------------------------------- *
 * Public API
 * ------------------------------------------------------------------------- */

/**
 * Get the universal specification tests expected for a product type:
 *   - 'small_molecule' → ICH Q6A universal tests (description, identification,
 *     assay, impurities).
 *   - 'biologic' → ICH Q6B test set (appearance, identity, purity/impurities,
 *     potency, quantity, general tests).
 *
 * Pure / deterministic. Throws for an unmodeled product type.
 */
export function getUniversalTests(productType: SpecProductType): UniversalTestsResult {
  const result = UNIVERSAL_TESTS_BY_TYPE[productType];
  if (!result) {
    throw new Error(
      `Unmodeled product type "${productType}" — expected one of: ${SPEC_PRODUCT_TYPES.join(', ')}.`,
    );
  }
  return result;
}

/**
 * Get the combined specification test set (universal + dosage-form-specific) for
 * a product type and optional dosage form.
 *
 *   - 'small_molecule' with a dosageForm → that form's Q6A dosage-form-specific
 *     tests; without a dosageForm → empty dosage-form list (drug-substance view).
 *   - 'biologic' with dosageForm='parenteral' → the parenteral test set (most
 *     biologics are sterile injectables); with any other dosageForm → empty.
 *
 * Pure / deterministic. Throws for an unmodeled product type or an unknown
 * dosage form.
 */
export function getSpecificationTests(input: SpecificationTestsInput): SpecificationTestsResult {
  const { productType, dosageForm } = input;
  const universal = getUniversalTests(productType);

  let dosageFormTests: SpecTest[] = [];
  if (dosageForm !== undefined) {
    if (!SPEC_DOSAGE_FORMS.includes(dosageForm)) {
      throw new Error(
        `Unknown dosage form "${dosageForm}" — expected one of: ${SPEC_DOSAGE_FORMS.join(', ')}.`,
      );
    }
    if (productType === 'biologic') {
      // Biologics are most commonly sterile parenterals; only the parenteral set
      // is modeled as dosage-form-specific for a biologic.
      dosageFormTests = dosageForm === 'parenteral' ? DOSAGE_FORM_TESTS.parenteral : [];
    } else {
      dosageFormTests = DOSAGE_FORM_TESTS[dosageForm];
    }
  }

  const notes = [...universal.notes];
  if (productType === 'biologic' && dosageForm !== undefined && dosageForm !== 'parenteral') {
    notes.unshift(
      `Dosage form "${dosageForm}" is not modeled as a distinct biologic specification set; only parenteral (sterile) tests are enumerated for biologics.`,
    );
  }

  return {
    productType,
    dosageForm: dosageForm ?? null,
    universalTests: universal.tests,
    dosageFormTests,
    citation: universal.citation,
    notes,
  };
}

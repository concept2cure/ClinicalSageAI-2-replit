/**
 * Establishment registration & drug listing expert — manufacturer/establishment
 * registration obligations per region.
 *
 * Before a drug can be lawfully manufactured, imported and distributed, the
 * establishment(s) involved must be made known to — and authorised/registered
 * by — the regulator, and the products themselves must be listed/declared. This
 * service encodes, per region, the mandatory establishment-registration and
 * listing elements and assesses a sponsor's prepared elements against that
 * checklist — surfacing exactly which obligations are not yet in place.
 *
 * Regions:
 *   - FDA: under FD&C Act §510 and 21 CFR Part 207, owners/operators of
 *     establishments engaged in the manufacture, preparation, propagation,
 *     compounding or processing of a drug must register the establishment with
 *     FDA and list each drug in commercial distribution. Registration yields an
 *     FEI/registration number; listing yields a National Drug Code (NDC).
 *     Foreign establishments importing into the US must designate a US Agent.
 *   - EU: under Directive 2001/83/EC Articles 40/41, the manufacture and
 *     importation of medicinal products requires a Manufacturing/Importation
 *     Authorisation (MIA) from the national competent authority, the services of
 *     a Qualified Person (QP) responsible for batch certification, and GMP
 *     compliance (evidenced by a GMP certificate recorded in EudraGMDP).
 *
 * Pure / deterministic — no DB, no IO. This is a readiness aid, honest by
 * construction: registration obligations are role-specific (manufacturer /
 * importer / distributor / active-substance) and the exact identifiers and
 * timelines evolve; the authority's current guidance is controlling.
 *
 * References:
 *   - FD&C Act §510 (21 U.S.C. 360) — registration of producers of drugs and
 *     devices; drug listing.
 *   - 21 CFR Part 207 — Requirements for Foreign and Domestic Establishment
 *     Registration and Listing for Human Drugs (FEI/registration number, NDC,
 *     annual registration Oct 1–Dec 31, US Agent for foreign establishments,
 *     DUNS as unique facility identifier).
 *   - Directive 2001/83/EC Art. 40 (Manufacturing/Importation Authorisation),
 *     Art. 41 (Qualified Person); EU GMP (EudraLex Volume 4); EudraGMDP database.
 *   - Directive 2001/83/EC Art. 46b/52a (active substances —
 *     manufacture/import/distribution & registration of API operators).
 *
 * @module server/services/global-ri/establishment-registration
 */

export type EstablishmentRegion = 'FDA' | 'EU';

/** Regions with a modeled establishment-registration framework. */
export const ESTABLISHMENT_REGIONS: EstablishmentRegion[] = ['FDA', 'EU'];

export interface EstablishmentElement {
  /** Stable element id (e.g. 'establishment_registration', 'qualified_person'). */
  id: string;
  /** Human label. */
  title: string;
  /** What the owner/operator must have in place for this element. */
  requirement: string;
  /** Governing citation. */
  citation: string;
}

export interface EstablishmentFramework {
  region: EstablishmentRegion;
  /** The named scheme governing establishment registration in the region. */
  scheme: string;
  /** The mandatory establishment-registration / listing elements. */
  elements: EstablishmentElement[];
  /** Top-level governing citation for the scheme. */
  citation: string;
  /** Honest caveats / scope notes. */
  notes: string[];
}

/**
 * Encoded establishment-registration / listing elements by region. Each region
 * lists the major mandatory obligations; element citations point to the specific
 * governing instrument (FD&C §510 / 21 CFR Part 207 subsection; Directive
 * 2001/83/EC article).
 */
const ESTABLISHMENT_FRAMEWORKS: Record<EstablishmentRegion, EstablishmentFramework> = {
  FDA: {
    region: 'FDA',
    scheme: 'FDA establishment registration & drug listing',
    citation: 'FD&C Act §510 (21 U.S.C. 360); 21 CFR Part 207',
    elements: [
      {
        id: 'establishment_registration',
        title: 'Establishment registration',
        requirement:
          'Register each drug establishment (domestic or foreign) engaged in manufacture, preparation, propagation, compounding or processing of a drug with FDA; obtain/maintain the FDA Establishment Identifier (FEI) / registration number.',
        citation: 'FD&C Act §510(b)/(i); 21 CFR 207.17, 207.25',
      },
      {
        id: 'drug_listing',
        title: 'Drug listing',
        requirement:
          'List each drug in commercial distribution (and update listings), obtaining a National Drug Code (NDC) for each listed product.',
        citation: 'FD&C Act §510(j); 21 CFR 207.41, 207.49',
      },
      {
        id: 'annual_registration',
        title: 'Annual registration',
        requirement:
          'Register/renew establishment registration annually during the Oct 1 – Dec 31 window each year.',
        citation: '21 CFR 207.29',
      },
      {
        id: 'us_agent',
        title: 'US Agent (foreign establishments)',
        requirement:
          'A foreign establishment must designate a single US Agent who resides or maintains a place of business in the United States.',
        citation: '21 CFR 207.69',
      },
      {
        id: 'unique_facility_identifier',
        title: 'Unique facility identifier (DUNS)',
        requirement:
          'Provide a unique facility identifier — the Data Universal Numbering System (DUNS) number — for the establishment as part of registration.',
        citation: '21 CFR 207.25(g) (unique facility identifier)',
      },
      {
        id: 'import_compliance',
        title: 'Import compliance',
        requirement:
          'Foreign facilities are subject to FDA inspection; drugs offered for import from an unregistered establishment, or not properly listed, may be detained/refused at entry.',
        citation: 'FD&C Act §801; §510; 21 CFR Part 207',
      },
    ],
    notes: [
      'This is a readiness aid; FDA’s current registration & listing guidance (and SPL/electronic-submission requirements) is controlling and may exceed the modeled elements.',
      'Obligations are role-specific (manufacturer / repacker / relabeler / private-label distributor); confirm the scope applicable to your operation.',
      'Registration is not an FDA approval or endorsement of the establishment or its drugs.',
    ],
  },
  EU: {
    region: 'EU',
    scheme: 'EU manufacturing/import authorisation & GMP',
    citation: 'Directive 2001/83/EC Art. 40/41; EU GMP (EudraLex Volume 4)',
    elements: [
      {
        id: 'manufacturing_import_authorisation',
        title: 'Manufacturing/Importation Authorisation (MIA)',
        requirement:
          'Hold a Manufacturing/Importation Authorisation (MIA) granted by the national competent authority for each site manufacturing or importing medicinal products.',
        citation: 'Directive 2001/83/EC Art. 40',
      },
      {
        id: 'qualified_person',
        title: 'Qualified Person (QP)',
        requirement:
          'Have permanently and continuously at disposal at least one Qualified Person (QP) responsible for certifying that each batch was manufactured and checked in compliance with the requirements before release.',
        citation: 'Directive 2001/83/EC Art. 41, 48, 51',
      },
      {
        id: 'gmp_certificate',
        title: 'GMP compliance certificate',
        requirement:
          'Demonstrate Good Manufacturing Practice compliance via inspection; the resulting GMP certificate (and MIA) is recorded in the EudraGMDP database.',
        citation: 'Directive 2001/83/EC Art. 47; EU GMP (EudraLex Vol. 4); EudraGMDP',
      },
      {
        id: 'site_registration',
        title: 'Manufacturing site registration in the dossier',
        requirement:
          'Declare/register all manufacturing and testing sites in the marketing-authorisation dossier (Module 3 / application), consistent with the held authorisations.',
        citation: 'Directive 2001/83/EC Art. 8(3); Art. 40',
      },
      {
        id: 'importer_authorisation',
        title: 'Importer authorisation (third-country import)',
        requirement:
          'For import of medicinal products from third countries, hold an importation authorisation and apply QP certification (re-certification) on importation into the EU.',
        citation: 'Directive 2001/83/EC Art. 40(3), Art. 51(1)(b)',
      },
      {
        id: 'api_registration',
        title: 'Active-substance operator registration',
        requirement:
          'Manufacturers, importers and distributors of active substances established in the EU must register their activity with the competent authority of the Member State.',
        citation: 'Directive 2001/83/EC Art. 52a; Art. 46/46b (active substances)',
      },
    ],
    notes: [
      'This is a readiness aid; the competent authority’s current requirements and EU GMP guidance are controlling and may exceed the modeled elements.',
      'Obligations are role-specific (manufacturer / importer / distributor / active-substance operator); confirm the authorisations applicable to your activity.',
      'For centrally authorised products the EMA dossier still relies on national-authority MIAs/GMP certificates for the named sites.',
    ],
  },
};

/**
 * Get the establishment-registration framework for a region: the scheme, the
 * mandatory elements (each with its citation) and honest scope caveats.
 * Pure / deterministic. Throws for an unmodeled region.
 */
export function getEstablishmentFramework(region: EstablishmentRegion): EstablishmentFramework {
  const framework = ESTABLISHMENT_FRAMEWORKS[region];
  if (!framework) throw new Error(`No establishment-registration framework modeled for region "${region}".`);
  return framework;
}

/**
 * List the establishment element ids for a region (for a checklist UI). Returns
 * an empty array for an unmodeled region (graceful, like
 * getRegionalModule1Requirements).
 */
export function getEstablishmentElements(region: EstablishmentRegion): string[] {
  const framework = ESTABLISHMENT_FRAMEWORKS[region];
  if (!framework) return [];
  return framework.elements.map((e) => e.id);
}

export interface EstablishmentReadinessInput {
  region: EstablishmentRegion;
  /** Element ids the sponsor has in place (from getEstablishmentElements). */
  providedElements: string[];
}

export interface EstablishmentReadinessResult {
  region: EstablishmentRegion;
  /** ready ⇔ no required element is missing. */
  ready: boolean;
  /** The required element ids the sponsor has provided. */
  provided: string[];
  /** The required element ids the sponsor has not provided. */
  missing: string[];
  /** Fraction of required elements covered, 0..1, rounded to 2 decimals. */
  coverage: number;
  notes: string[];
}

/**
 * Assess a sponsor's prepared establishment-registration elements against the
 * region's required checklist. ready ⇔ no missing elements.
 * Pure / deterministic. Throws for an unmodeled region.
 */
export function assessEstablishmentReadiness(
  input: EstablishmentReadinessInput,
): EstablishmentReadinessResult {
  const framework = ESTABLISHMENT_FRAMEWORKS[input.region];
  if (!framework) throw new Error(`No establishment-registration framework modeled for region "${input.region}".`);

  const requiredIds = framework.elements.map((e) => e.id);
  const providedSet = new Set((input.providedElements ?? []).map((e) => String(e)));

  const provided: string[] = [];
  const missing: string[] = [];
  for (const id of requiredIds) {
    if (providedSet.has(id)) provided.push(id);
    else missing.push(id);
  }

  const coverage =
    requiredIds.length === 0 ? 0 : Math.round((provided.length / requiredIds.length) * 100) / 100;

  const notes: string[] = [
    'This is a readiness aid; registration obligations are role-specific (manufacturer/importer/distributor/active-substance) and the exact identifiers/timelines evolve — confirm with the authority.',
    missing.length === 0
      ? 'All modeled establishment-registration elements are covered — proceed to evidence/identifier verification.'
      : `Address ${missing.length} uncovered establishment-registration element(s) before manufacturing/importing.`,
  ];

  return {
    region: input.region,
    ready: missing.length === 0,
    provided,
    missing,
    coverage,
    notes,
  };
}

/**
 * Import/export licensing expert — the authorisation needed to move a medicinal
 * product across a border, per region and product category.
 *
 * Importing or exporting a medicinal product is not a free trade activity: the
 * mover must hold the correct authorisation (an importer registration / prior
 * notice, a manufacturing-importation authorisation, a controlled-drug import or
 * export permit, …) and satisfy category-specific controls. The required vehicle
 * differs by REGION (US: FDA + DEA; EU) and by PRODUCT CATEGORY (finished drug,
 * controlled substance, investigational product, biological), and — for controlled
 * substances — by DIRECTION (import vs export). This service encodes that mapping
 * — the judgement an RA / trade-compliance / supply-chain lead makes when planning
 * a cross-border movement of drug product.
 *
 * This is the IMPORT/EXPORT companion to the DEA scheduling module
 * (controlled-substances.ts): scheduling decides WHAT controls attach to a
 * substance; this module decides WHAT AUTHORISATION is needed to bring it across
 * the border (or send it out).
 *
 * US framework:
 *  - Finished drugs are imported under the FD&C Act import provisions: the
 *    importer of record files FDA prior notice for imported food/drugs, entries
 *    are subject to FDA admissibility review (and may be detained or refused as
 *    adulterated/misbranded), and the foreign manufacturer must be registered.
 *  - Controlled substances require a DEA import or export PERMIT or declaration
 *    (per the controlled-substances import/export regime) — only a DEA registrant
 *    may import/export, Schedule I/II movements require a permit, and quotas apply.
 *  - Investigational drugs are imported under an IND; unapproved drugs intended
 *    for export use the "import for export" provisions of FD&C Act §801(d).
 *  - Biologicals follow the finished-drug import path with additional CBER
 *    oversight (and select-agent controls where applicable).
 *
 * EU framework:
 *  - Importing a finished medicine from a third country is treated as a
 *    manufacturing activity: the importer must hold a Manufacturing/Importation
 *    Authorisation (MIA) and a Qualified Person (QP) must certify each imported
 *    batch before release (Dir 2001/83/EC Art 40; EU GMP Annex 16).
 *  - Controlled substances require narcotic/psychotropic import and export
 *    authorisations issued by the national competent authority under the EU
 *    controlled-drugs regime.
 *  - Investigational medicinal products (IMPs) require the importer to hold an
 *    MIA(IMP) and QP certification on import.
 *  - Biologicals follow the MIA + QP path with additional controls for certain
 *    biologicals.
 *
 * Pure / deterministic — no DB, no IO. This is a reference aid keyed off the
 * declared region/category/direction only. It does NOT determine eligibility for
 * any specific shipment, does not issue or validate permits, and does not model
 * tariff/customs classification.
 *
 * References:
 *  - FD&C Act §801 (21 USC 381) — imports and exports; §801(d) "import for export".
 *  - FD&C Act §802 (21 USC 382) — exports of unapproved drugs/devices.
 *  - 21 CFR Part 1, Subpart I / Subpart J — registration of food/drug facilities
 *    and PRIOR NOTICE of imported articles; FDA import admissibility.
 *  - 21 USC 952 / 953 — importation / exportation of controlled substances.
 *  - 21 CFR Part 1312 — DEA importation and exportation of controlled substances
 *    (import/export permits and declarations).
 *  - 21 USC 826; 21 CFR Part 1303 — controlled-substance production/import quotas.
 *  - Dir 2001/83/EC Art 40 — manufacturing/importation authorisation (MIA).
 *  - EU GMP Annex 16 — certification by the Qualified Person and batch release.
 *  - Reg (EU) No 536/2014 — clinical trials; import of IMPs (MIA(IMP)).
 *  - EU controlled-drugs import/export authorisation regime (national competent
 *    authority; narcotic/psychotropic import and export authorisations).
 *
 * Honest caveat: import/export controls are highly role-, substance- and
 * route-specific, and controlled-substance permits are PER-SHIPMENT (a single
 * import/export authorisation does not cover a standing supply chain). This module
 * gives the indicative authorisation per region/category/direction only — always
 * confirm the specific requirement with the relevant authority (FDA / DEA for the
 * US; the national competent authority for the EU) before relying on it.
 *
 * @module server/services/global-ri/import-export-licensing
 */

/** A modeled import/export region. */
export type IERegion = 'US' | 'EU';

/** A modeled product category for import/export purposes. */
export type IECategory =
  | 'finished_drug'
  | 'controlled_substance'
  | 'investigational'
  | 'biological';

/** Direction of cross-border movement. */
export type IEDirection = 'import' | 'export';

/** The set of modeled import/export regions. */
export const IE_REGIONS: IERegion[] = ['US', 'EU'];

/** The set of modeled product categories. */
export const IE_CATEGORIES: IECategory[] = [
  'finished_drug',
  'controlled_substance',
  'investigational',
  'biological',
];

/**
 * The modeled authorisation entry for a region/category. Where import and export
 * differ materially (controlled substances), direction-specific text is resolved
 * by {@link getImportExportRequirements}.
 */
interface IEEntry {
  /** The headline authorisation/vehicle required. */
  authorisation: string;
  /** The concrete requirements / controls the mover must satisfy. */
  requirements: string[];
  /** Governing citation. */
  citation: string;
  /** Category-specific note(s). */
  notes: string[];
  /**
   * Optional direction-specific overrides. Controlled substances differ between
   * import and export (different permits/declarations); other categories use the
   * same base entry for both directions.
   */
  byDirection?: Partial<Record<IEDirection, { authorisation: string; requirements: string[]; notes: string[] }>>;
}

const US: Record<IECategory, IEEntry> = {
  finished_drug: {
    authorisation:
      'FDA import entry by the importer of record, with FDA prior notice for the imported drug',
    requirements: [
      'An importer of record must be named and the entry filed for FDA admissibility review',
      'FDA PRIOR NOTICE must be submitted for the imported article before arrival',
      'The foreign manufacturer must hold FDA establishment registration (and the drug be listed)',
      'The article is subject to FDA examination and may be DETAINED or REFUSED admission if it appears adulterated or misbranded',
    ],
    citation: 'FD&C Act §801 (21 USC 381); 21 CFR Part 1 (Subpart I registration; Subpart J prior notice)',
    notes: [
      'Import admissibility is assessed entry-by-entry; meeting the requirements does not guarantee release.',
    ],
  },
  controlled_substance: {
    authorisation:
      'DEA import or export permit / declaration (controlled-substance import/export regime) — DEA registrant only',
    requirements: [
      'The importer/exporter must be a DEA registrant authorised for the activity',
      'A DEA import/export PERMIT or DECLARATION is required per shipment (Schedule I/II movements require a permit)',
      'Aggregate production / import quotas apply to Schedule I and II substances (21 USC 826; 21 CFR Part 1303)',
      'The FDA finished-drug import controls (prior notice, entry review) apply in addition to the DEA controls',
    ],
    citation: '21 USC 952/953; 21 CFR Part 1312 (DEA import/export); FD&C Act §801',
    notes: [
      'Controlled-substance import/export permits are PER-SHIPMENT; a permit does not authorise a standing supply chain.',
    ],
    byDirection: {
      import: {
        authorisation:
          'DEA import permit or declaration (21 USC 952; 21 CFR Part 1312) — DEA registrant only',
        requirements: [
          'A DEA-registered importer must obtain an import PERMIT (Schedule I/II) or file an import DECLARATION (Schedule III–V, as applicable) before the shipment',
          'Quota controls apply to Schedule I and II substances (21 USC 826; 21 CFR Part 1303)',
          'FDA prior notice and entry review apply to the drug in addition to the DEA controls',
        ],
        notes: [
          'Import of Schedule I/II controlled substances requires a DEA import permit per shipment.',
        ],
      },
      export: {
        authorisation:
          'DEA export permit or declaration (21 USC 953; 21 CFR Part 1312) — DEA registrant only',
        requirements: [
          'A DEA-registered exporter must obtain an export PERMIT (Schedule I/II) or file an export DECLARATION (Schedule III–V, as applicable) before the shipment',
          'The importing country\'s import authorisation must be in place for narcotic/Schedule I–II exports',
          'Quota controls apply to Schedule I and II substances',
        ],
        notes: [
          'Export of controlled substances requires a DEA export permit/declaration per shipment and, for narcotics, the destination country\'s import authorisation.',
        ],
      },
    },
  },
  investigational: {
    authorisation:
      'Import under an active IND (investigational drugs); "import for export" under FD&C Act §801(d) for unapproved drugs intended for export',
    requirements: [
      'Investigational drug imported into the US must be covered by an active IND for the intended clinical use',
      'An unapproved drug may be imported for incorporation/processing and subsequent EXPORT under the §801(d) "import for export" provisions',
      'Export of an unapproved (investigational) drug uses the FD&C Act §802 / §801(e) export provisions',
    ],
    citation: 'FD&C Act §801(d) (import for export); §802 (21 USC 382); 21 CFR Part 312 (IND)',
    notes: [
      'Whether an investigational drug may be imported turns on the IND status for the specific use.',
    ],
  },
  biological: {
    authorisation:
      'FDA import entry + prior notice (as for finished drugs) with CBER oversight; additional controls for select agents',
    requirements: [
      'Follows the finished-drug import path: importer of record, FDA prior notice, entry admissibility review',
      'Biological products are overseen by CBER and licensed under the PHS Act §351 (BLA) where marketed',
      'Import of select biological agents/toxins is subject to additional Federal Select Agent Program controls',
    ],
    citation: 'FD&C Act §801; PHS Act §351 (42 USC 262); 21 CFR Part 1; 42 CFR Part 73 (select agents)',
    notes: [
      'Biologicals carry the finished-drug import controls plus CBER (and, for select agents, additional) oversight.',
    ],
  },
};

const EU: Record<IECategory, IEEntry> = {
  finished_drug: {
    authorisation:
      'Manufacturing/Importation Authorisation (MIA) held by the importer, with Qualified Person (QP) batch certification on import',
    requirements: [
      'Importing a finished medicine from a third country is a manufacturing activity requiring the importer to hold an MIA',
      'A Qualified Person (QP) must certify each imported batch before release to the EU market (EU GMP Annex 16)',
      'The third-country site must meet EU GMP (or an MRA/equivalence applies), evidenced on import',
    ],
    citation: 'Dir 2001/83/EC Art 40; EU GMP Annex 16',
    notes: [
      'Import = manufacturing in the EU sense; the MIA holder and QP carry the import responsibility.',
    ],
  },
  controlled_substance: {
    authorisation:
      'EU controlled-drugs import or export authorisation (narcotic/psychotropic) issued by the national competent authority',
    requirements: [
      'A narcotic/psychotropic IMPORT or EXPORT authorisation must be obtained from the national competent authority per consignment',
      'The MIA + QP finished-drug controls apply in addition for medicinal products',
      'Movements are reconciled against the operator\'s controlled-drug authorisation and quotas where applicable',
    ],
    citation: 'EU controlled-drugs import/export regime (national competent authority); Dir 2001/83/EC Art 40',
    notes: [
      'Narcotic/psychotropic import/export authorisations are issued per consignment by the national competent authority.',
    ],
    byDirection: {
      import: {
        authorisation:
          'Narcotic/psychotropic IMPORT authorisation from the national competent authority (per consignment)',
        requirements: [
          'A controlled-drug IMPORT authorisation must be obtained from the national competent authority before the consignment',
          'The MIA + QP controls apply in addition for the medicinal product',
        ],
        notes: [
          'A controlled-drug import authorisation is required per consignment, in addition to the MIA + QP controls.',
        ],
      },
      export: {
        authorisation:
          'Narcotic/psychotropic EXPORT authorisation from the national competent authority (per consignment)',
        requirements: [
          'A controlled-drug EXPORT authorisation must be obtained from the national competent authority before the consignment',
          'The destination country\'s import authorisation must be in place for narcotic/psychotropic exports',
        ],
        notes: [
          'A controlled-drug export authorisation is required per consignment, with the destination import authorisation for narcotics/psychotropics.',
        ],
      },
    },
  },
  investigational: {
    authorisation:
      'MIA(IMP) held by the importer with Qualified Person (QP) certification on import of the investigational medicinal product',
    requirements: [
      'Importing an IMP from a third country requires the importer to hold a manufacturing/importation authorisation for IMPs — MIA(IMP)',
      'A Qualified Person (QP) must certify each imported IMP batch before use in the trial',
      'Import is tied to an authorised clinical trial under the EU Clinical Trials Regulation',
    ],
    citation: 'Reg (EU) No 536/2014 (Clinical Trials Regulation); Dir 2001/83/EC Art 40; EU GMP Annex 16',
    notes: [
      'IMP import requires an MIA(IMP) and QP certification, tied to an authorised clinical trial.',
    ],
  },
  biological: {
    authorisation:
      'Manufacturing/Importation Authorisation (MIA) + Qualified Person (QP) certification, with additional controls for certain biologicals',
    requirements: [
      'Follows the finished-drug import path: the importer holds an MIA and the QP certifies each imported batch',
      'Certain biologicals (e.g. blood/tissue-derived, advanced therapies) carry additional EU controls',
      'The third-country site must meet EU GMP (or an MRA/equivalence applies)',
    ],
    citation: 'Dir 2001/83/EC Art 40; EU GMP Annex 16 (additional biological-specific controls apply)',
    notes: [
      'Biologicals carry the MIA + QP import controls plus additional controls for certain biological types.',
    ],
  },
};

const IE_TABLE: Record<IERegion, Record<IECategory, IEEntry>> = { US, EU };

const CAVEAT_NOTE =
  'Import/export controls are highly role-, substance- and route-specific, and controlled-substance permits are PER-SHIPMENT; confirm the specific requirement with the relevant authority (FDA/DEA for the US; the national competent authority for the EU) before relying on this.';

const REGION_CITATION: Record<IERegion, string> = {
  US: 'FD&C Act §§801–802 (21 USC 381–382); 21 CFR Part 1; 21 USC 952/953; 21 CFR Part 1312',
  EU: 'Dir 2001/83/EC Art 40; EU GMP Annex 16; Reg (EU) No 536/2014; EU controlled-drugs import/export regime',
};

export interface ImportExportRequirementsInput {
  region: IERegion;
  category: IECategory;
  /** Defaults to 'import' when omitted. */
  direction?: IEDirection;
}

export interface ImportExportRequirements {
  region: IERegion;
  category: IECategory;
  direction: IEDirection;
  /** The headline authorisation/vehicle required. */
  authorisation: string;
  /** The concrete requirements / controls the mover must satisfy. */
  requirements: string[];
  /** Governing citation. */
  citation: string;
  /** Category/direction notes plus the standing caveat. */
  notes: string[];
}

function assertRegion(region: IERegion): Record<IECategory, IEEntry> {
  const table = IE_TABLE[region];
  if (!table) {
    throw new Error(
      `No import/export requirements modeled for region "${region}"; modeled regions are ${IE_REGIONS.join(', ')}.`,
    );
  }
  return table;
}

/**
 * Return the import/export authorisation and requirements for a region/category
 * (and direction). Pure / deterministic. Throws for an unmodeled region or
 * category. Direction defaults to 'import' and only changes the result where the
 * category distinguishes import from export (controlled substances).
 */
export function getImportExportRequirements(
  input: ImportExportRequirementsInput,
): ImportExportRequirements {
  const table = assertRegion(input.region);
  const entry = table[input.category];
  if (!entry) {
    throw new Error(
      `Unknown product category "${input.category}" for region "${input.region}"; modeled categories are ${IE_CATEGORIES.join(', ')}.`,
    );
  }
  const direction: IEDirection = input.direction ?? 'import';
  const override = entry.byDirection?.[direction];
  return {
    region: input.region,
    category: input.category,
    direction,
    authorisation: override?.authorisation ?? entry.authorisation,
    requirements: override?.requirements ?? entry.requirements,
    citation: entry.citation,
    notes: [...(override?.notes ?? entry.notes), CAVEAT_NOTE],
  };
}

export interface ImportExportMatrixRow {
  category: IECategory;
  authorisation: string;
  citation: string;
}

export interface ImportExportMatrix {
  region: IERegion;
  categories: ImportExportMatrixRow[];
  citation: string;
  notes: string[];
}

/**
 * Return the import/export authorisation matrix for a region — one row per
 * modeled product category (using the base/import authorisation). Pure /
 * deterministic. Throws for an unmodeled region.
 */
export function getImportExportMatrix(region: IERegion): ImportExportMatrix {
  const table = assertRegion(region);
  return {
    region,
    categories: IE_CATEGORIES.map((category) => ({
      category,
      authorisation: table[category].authorisation,
      citation: table[category].citation,
    })),
    citation: REGION_CITATION[region],
    notes: [
      'One row per modeled product category, using the base (import) authorisation; controlled-substance export differs — use getImportExportRequirements with direction "export".',
      CAVEAT_NOTE,
    ],
  };
}

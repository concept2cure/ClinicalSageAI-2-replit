/**
 * Good Distribution Practice (GDP) & supply-chain security expert — per region.
 *
 * Once a medicinal product leaves the manufacturer it travels through a
 * distribution chain (wholesalers, brokers, 3PLs, dispensers) before reaching
 * the patient. Regulators impose distribution-stage controls to preserve product
 * quality in transit and to keep falsified/illegitimate product out of the legal
 * supply chain. This service encodes, per region, the mandatory GDP / supply-chain
 * security elements and assesses a distributor's prepared elements against that
 * checklist — surfacing exactly which controls are not yet in place.
 *
 * Regions:
 *   - EU: EU Good Distribution Practice (GDP) for medicinal products for human
 *     use, plus the Falsified Medicines Directive (FMD) safety-features regime
 *     (unique identifier + anti-tampering device, verified/decommissioned per the
 *     Delegated Regulation).
 *   - US: the Drug Supply Chain Security Act (DSCSA) under FD&C Act §582 — the
 *     interoperable, electronic, package-level traceability ("track-and-trace")
 *     framework whose enhanced drug distribution security requirements phased in
 *     from November 2023/2024.
 *
 * Pure / deterministic — no DB, no IO. This is a readiness aid, honest by
 * construction: GDP/DSCSA obligations are role- and product-specific
 * (manufacturer / wholesaler / dispenser / 3PL) and carry product-class and
 * deadline nuances; the authority's current guidance is controlling.
 *
 * References:
 *   - EU Guidelines on Good Distribution Practice of medicinal products for
 *     human use (2013/C 343/01).
 *   - Directive 2011/62/EU (Falsified Medicines Directive) amending Directive
 *     2001/83/EC; Commission Delegated Regulation (EU) 2016/161 (safety
 *     features — unique identifier + anti-tampering device; verification &
 *     decommissioning).
 *   - Drug Supply Chain Security Act (DSCSA), Title II of the Drug Quality and
 *     Security Act of 2013; FD&C Act §582 (21 U.S.C. 360eee-1).
 *
 * @module server/services/global-ri/gdp-distribution
 */

export type GdpRegion = 'EU' | 'US';

/** Regions with a modeled GDP / supply-chain security framework. */
export const GDP_REGIONS: GdpRegion[] = ['EU', 'US'];

export interface GdpElement {
  /** Stable element id (e.g. 'responsible_person', 'product_identifier'). */
  id: string;
  /** Human label. */
  title: string;
  /** What the distributor must have in place for this element. */
  requirement: string;
  /** Governing citation. */
  citation: string;
}

export interface GdpFramework {
  region: GdpRegion;
  /** The named scheme governing distribution in the region. */
  scheme: string;
  /** The mandatory GDP / supply-chain security elements. */
  elements: GdpElement[];
  /** Top-level governing citation for the scheme. */
  citation: string;
  /** Honest caveats / scope notes. */
  notes: string[];
}

/**
 * Encoded GDP / supply-chain security elements by region. Each region lists the
 * major mandatory distribution-stage controls; the element citations point to the
 * specific governing instrument (GDP chapter / Delegated Regulation / FD&C §582
 * subsection).
 */
const GDP_FRAMEWORKS: Record<GdpRegion, GdpFramework> = {
  EU: {
    region: 'EU',
    scheme: 'EU Good Distribution Practice (GDP) + Falsified Medicines Directive safety features',
    citation:
      'EU GDP Guidelines 2013/C 343/01; Directive 2011/62/EU (FMD); Commission Delegated Regulation (EU) 2016/161',
    elements: [
      {
        id: 'responsible_person',
        title: 'Responsible Person',
        requirement:
          'A designated Responsible Person (RP) with the requisite competence and authority ensures a quality system is implemented and maintained for the distribution activity.',
        citation: 'EU GDP Guidelines 2013/C 343/01 Ch. 2 (Personnel)',
      },
      {
        id: 'quality_system',
        title: 'Quality system',
        requirement:
          'A documented quality management system covering responsibilities, processes, change control, deviation handling, CAPA and management of outsourced activities.',
        citation: 'EU GDP Guidelines 2013/C 343/01 Ch. 1 (Quality Management)',
      },
      {
        id: 'premises_equipment',
        title: 'Premises & equipment',
        requirement:
          'Suitable, secure premises and equipment to preserve product quality, including temperature mapping, monitoring and control of storage areas.',
        citation: 'EU GDP Guidelines 2013/C 343/01 Ch. 3 (Premises and Equipment)',
      },
      {
        id: 'supplier_customer_qualification',
        title: 'Supplier & customer qualification',
        requirement:
          'Verify and qualify that suppliers and customers are authorised to supply/receive medicinal products before transacting (authorised supply chain only).',
        citation: 'EU GDP Guidelines 2013/C 343/01 Ch. 5 (Operations — qualification of suppliers/customers)',
      },
      {
        id: 'falsified_medicines_safety_features',
        title: 'Falsified medicines safety features',
        requirement:
          'Handle the safety features (unique identifier + anti-tampering device); verify authenticity and decommission the unique identifier as required under the FMD Delegated Regulation.',
        citation: 'Directive 2011/62/EU (FMD); Commission Delegated Regulation (EU) 2016/161',
      },
      {
        id: 'transportation_cold_chain',
        title: 'Transportation & cold chain',
        requirement:
          'Maintain the required storage/transport conditions (including cold chain) throughout transit, with appropriate route risk assessment and temperature control.',
        citation: 'EU GDP Guidelines 2013/C 343/01 Ch. 9 (Transportation)',
      },
      {
        id: 'documentation_records',
        title: 'Documentation & records',
        requirement:
          'Maintain good distribution documentation — procedures, records of receipt/supply and traceability data — that is legible, accurate and retained.',
        citation: 'EU GDP Guidelines 2013/C 343/01 Ch. 4 (Documentation)',
      },
      {
        id: 'recall_returns',
        title: 'Recalls & returns',
        requirement:
          'Effective procedures for product recalls and for handling returned, falsified, rejected, recalled and expired products.',
        citation: 'EU GDP Guidelines 2013/C 343/01 Ch. 6 (Complaints, Returns, Falsified & Recalls)',
      },
    ],
    notes: [
      'This is a readiness aid; the authority’s current guidance is controlling and may exceed the modeled elements.',
      'GDP obligations are role- and product-specific (wholesale distributor, broker, 3PL); confirm the scope applicable to your activity.',
    ],
  },
  US: {
    region: 'US',
    scheme: 'Drug Supply Chain Security Act (DSCSA)',
    citation: 'Drug Supply Chain Security Act (DSCSA); FD&C Act §582 (21 U.S.C. 360eee-1)',
    elements: [
      {
        id: 'product_identifier',
        title: 'Product identifier',
        requirement:
          'Affix/verify a standardized product identifier — GTIN + serial number + lot number + expiration date — encoded in a 2D data matrix (and human-readable) at the package and homogeneous-case level.',
        citation: 'FD&C Act §582; §581 (definition of product identifier / standardized numerical identifier)',
      },
      {
        id: 'transaction_information',
        title: 'Transaction information & statement (TI/TS)',
        requirement:
          'Exchange transaction information and a transaction statement (TI/TS) electronically with trading partners for each change of ownership.',
        citation: 'FD&C Act §582 (transaction information / transaction statement)',
      },
      {
        id: 'authorized_trading_partners',
        title: 'Authorized trading partners',
        requirement:
          'Transact only with authorized trading partners — partners that are appropriately licensed or registered (manufacturer, wholesale distributor, dispenser, 3PL).',
        citation: 'FD&C Act §582 (authorized trading partner requirements); §581',
      },
      {
        id: 'verification',
        title: 'Verification',
        requirement:
          'Verify the product identifier (including for saleable returns prior to redistribution) and respond to verification requests within the required timeframe.',
        citation: 'FD&C Act §582 (verification; saleable returns)',
      },
      {
        id: 'suspect_illegitimate_handling',
        title: 'Suspect & illegitimate product handling',
        requirement:
          'Quarantine and investigate suspect product; for illegitimate product, take action and notify FDA (Form FDA 3911) and affected trading partners.',
        citation: 'FD&C Act §582 (suspect/illegitimate product); Form FDA 3911',
      },
      {
        id: 'interoperable_tracing',
        title: 'Interoperable electronic tracing',
        requirement:
          'Participate in secure, interoperable, electronic package-level tracing of products under the enhanced drug distribution security requirements.',
        citation: 'FD&C Act §582 (enhanced drug distribution security / interoperable electronic tracing)',
      },
      {
        id: 'recordkeeping',
        title: 'Recordkeeping',
        requirement:
          'Retain transaction information and transaction statements (and related records) for not less than six years after the transaction.',
        citation: 'FD&C Act §582 (recordkeeping retention)',
      },
    ],
    notes: [
      'This is a readiness aid; FDA’s current DSCSA guidance and any stabilization/exemption policies are controlling.',
      'DSCSA obligations and effective dates are role-specific (manufacturer / wholesale distributor / dispenser / repackager / 3PL); confirm the requirements and current implementation deadlines applicable to your role.',
    ],
  },
};

/**
 * Get the GDP / supply-chain security framework for a region: the scheme, the
 * mandatory elements (each with its citation) and honest scope caveats.
 * Pure / deterministic. Throws for an unmodeled region.
 */
export function getGdpFramework(region: GdpRegion): GdpFramework {
  const framework = GDP_FRAMEWORKS[region];
  if (!framework) throw new Error(`No GDP framework modeled for region "${region}".`);
  return framework;
}

/**
 * List the GDP element ids for a region (for a checklist UI). Returns an empty
 * array for an unmodeled region (graceful, like getRegionalModule1Requirements).
 */
export function getGdpElements(region: GdpRegion): string[] {
  const framework = GDP_FRAMEWORKS[region];
  if (!framework) return [];
  return framework.elements.map((e) => e.id);
}

export interface GdpReadinessInput {
  region: GdpRegion;
  /** Element ids the distributor has in place (from getGdpElements). */
  providedElements: string[];
}

export interface GdpReadinessResult {
  region: GdpRegion;
  /** ready ⇔ no required element is missing. */
  ready: boolean;
  /** The required element ids the distributor has provided. */
  provided: string[];
  /** The required element ids the distributor has not provided. */
  missing: string[];
  /** Fraction of required elements covered, 0..1, rounded to 2 decimals. */
  coverage: number;
  notes: string[];
}

/**
 * Assess a distributor's prepared GDP / supply-chain security elements against
 * the region's required checklist. ready ⇔ no missing elements.
 * Pure / deterministic. Throws for an unmodeled region.
 */
export function assessGdpReadiness(input: GdpReadinessInput): GdpReadinessResult {
  const framework = GDP_FRAMEWORKS[input.region];
  if (!framework) throw new Error(`No GDP framework modeled for region "${input.region}".`);

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
    'This is a readiness aid; GDP/DSCSA obligations are role- and product-specific (manufacturer/wholesaler/dispenser/3PL) — confirm scope and current implementation deadlines with the authority.',
    missing.length === 0
      ? 'All modeled GDP elements are covered — proceed to evidence/SOP verification.'
      : `Address ${missing.length} uncovered GDP element(s) before distributing.`,
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

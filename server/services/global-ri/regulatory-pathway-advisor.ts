/**
 * Global regulatory pathway / strategy advisor.
 *
 * Given a product type and a set of target markets, this maps the product to its
 * genuine clinical-trial authorisation pathway and marketing-application pathway
 * in each market, along with the responsible agency. It is a deterministic
 * lookup over encoded regulatory frameworks — no network, no clock, no
 * randomness — so the same input always yields the same output.
 *
 * Frameworks encoded:
 *   - US  — FD&C Act / PHS Act: IND (21 CFR 312) then NDA 505(b)(1)/505(j)
 *           [FD&C Act §505] or BLA 351(a)/351(k) [PHS Act §351]; ANDA 505(j)
 *           for generics. Agency: FDA.
 *   - EU  — Clinical Trials Regulation (EU) No 536/2014 (CTA via CTIS) then a
 *           Marketing Authorisation. The centralised procedure (Reg (EC) No
 *           726/2004) is mandatory for biotech/biologics, ATMPs, oncology,
 *           orphan, etc.; ATMPs fall under Reg (EC) No 1394/2007. Generics may
 *           go national / Decentralised (DCP) / Mutual Recognition (MRP), or
 *           centralised when the reference product was centralised. Agency: EMA
 *           (centralised) / national competent authorities.
 *   - JP  — Pharmaceuticals and Medical Devices Act (PMD Act): Clinical Trial
 *           Notification (CTN, 治験届) then J-NDA. Cell/gene therapies may use the
 *           regenerative-medicine framework (conditional/time-limited approval).
 *           Agency: PMDA / MHLW.
 *   - CA  — Food and Drugs Act / Food and Drug Regulations: Clinical Trial
 *           Application (CTA) then a New Drug Submission (NDS); generics file an
 *           Abbreviated New Drug Submission (ANDS). Agency: Health Canada.
 *   - UK  — Post-Brexit (Human Medicines Regulations 2012): Clinical Trial
 *           Authorisation then an MHRA national Marketing Authorisation; the
 *           International Recognition Procedure (IRP) can leverage approvals from
 *           trusted reference regulators. Agency: MHRA.
 *   - AU  — Therapeutic Goods Act 1989: CTN or CTX scheme then registration on
 *           the Australian Register of Therapeutic Goods (ARTG). Agency: TGA.
 *
 * Pure / deterministic. Recommendations are returned in the input
 * `targetMarkets` order (stable).
 *
 * @module server/services/global-ri/regulatory-pathway-advisor
 */

/** Product archetypes whose regulatory pathway differs materially. */
export type ProductType =
  | 'small_molecule_nce'
  | 'biologic'
  | 'biosimilar'
  | 'generic'
  | 'vaccine'
  | 'cell_gene_therapy';

/** Supported target markets / jurisdictions. */
export type Market = 'US' | 'EU' | 'JP' | 'CA' | 'UK' | 'AU';

/** Development phase context (optional; refines general notes only). */
export type DevelopmentPhase = 'preclinical' | 'phase1' | 'phase2' | 'phase3' | 'filed';

export interface PathwayAdvisorInput {
  productType: ProductType;
  targetMarkets: Market[];
  developmentPhase?: DevelopmentPhase;
}

export interface PathwayRecommendation {
  market: Market;
  /** Clinical-trial authorisation pathway (how to get into the clinic). */
  clinicalTrialPathway: string;
  /** Marketing-application pathway (how to get on the market). */
  marketingApplication: string;
  /** Responsible regulatory agency. */
  agency: string;
  /** Optional strategic / framework notes. */
  notes?: string;
}

export interface PathwayAdvisorResult {
  recommendations: PathwayRecommendation[];
  generalNotes: string[];
}

/** A single market mapping for one product type. */
interface Mapping {
  clinicalTrialPathway: string;
  marketingApplication: string;
  agency: string;
  notes?: string;
}

const ALL_PRODUCT_TYPES: readonly ProductType[] = [
  'small_molecule_nce',
  'biologic',
  'biosimilar',
  'generic',
  'vaccine',
  'cell_gene_therapy',
];

const ALL_MARKETS: readonly Market[] = ['US', 'EU', 'JP', 'CA', 'UK', 'AU'];

/**
 * The encoded pathway matrix: PATHWAYS[productType][market].
 * Genuine regulatory mappings per the frameworks in the header.
 */
const PATHWAYS: Record<ProductType, Record<Market, Mapping>> = {
  small_molecule_nce: {
    US: {
      clinicalTrialPathway: 'IND (Investigational New Drug, 21 CFR 312)',
      marketingApplication: 'NDA 505(b)(1) (FD&C Act §505)',
      agency: 'FDA',
      notes: 'Full new chemical entity NDA with the applicant\'s own complete safety/efficacy data.',
    },
    EU: {
      clinicalTrialPathway: 'CTA via CTIS (Clinical Trials Regulation (EU) No 536/2014)',
      marketingApplication: 'Marketing Authorisation Application (centralised procedure available; national/DCP/MRP also possible for small molecules)',
      agency: 'EMA / national competent authorities',
      notes: 'A novel small molecule may use the centralised procedure but it is generally not mandatory unless a Reg 726/2004 Annex criterion applies.',
    },
    JP: {
      clinicalTrialPathway: 'Clinical Trial Notification (CTN / 治験届)',
      marketingApplication: 'J-NDA (PMD Act)',
      agency: 'PMDA / MHLW',
    },
    CA: {
      clinicalTrialPathway: 'Clinical Trial Application (CTA)',
      marketingApplication: 'New Drug Submission (NDS)',
      agency: 'Health Canada',
    },
    UK: {
      clinicalTrialPathway: 'Clinical Trial Authorisation (MHRA)',
      marketingApplication: 'MHRA national Marketing Authorisation (International Recognition Procedure (IRP) available)',
      agency: 'MHRA',
    },
    AU: {
      clinicalTrialPathway: 'CTN or CTX scheme',
      marketingApplication: 'Registration on the ARTG (Australian Register of Therapeutic Goods)',
      agency: 'TGA',
    },
  },

  biologic: {
    US: {
      clinicalTrialPathway: 'IND (Investigational New Drug, 21 CFR 312)',
      marketingApplication: 'BLA 351(a) (PHS Act §351)',
      agency: 'FDA',
      notes: 'Stand-alone biologics licence application with full data.',
    },
    EU: {
      clinicalTrialPathway: 'CTA via CTIS (Clinical Trials Regulation (EU) No 536/2014)',
      marketingApplication: 'Centralised Marketing Authorisation (mandatory for biotechnology-derived biologics under Reg (EC) No 726/2004)',
      agency: 'EMA',
    },
    JP: {
      clinicalTrialPathway: 'Clinical Trial Notification (CTN / 治験届)',
      marketingApplication: 'J-NDA (PMD Act)',
      agency: 'PMDA / MHLW',
    },
    CA: {
      clinicalTrialPathway: 'Clinical Trial Application (CTA)',
      marketingApplication: 'New Drug Submission (NDS) — Schedule D biologic',
      agency: 'Health Canada',
    },
    UK: {
      clinicalTrialPathway: 'Clinical Trial Authorisation (MHRA)',
      marketingApplication: 'MHRA national Marketing Authorisation (International Recognition Procedure (IRP) available)',
      agency: 'MHRA',
    },
    AU: {
      clinicalTrialPathway: 'CTN or CTX scheme',
      marketingApplication: 'Registration on the ARTG (biological / prescription medicine)',
      agency: 'TGA',
    },
  },

  biosimilar: {
    US: {
      clinicalTrialPathway: 'IND (Investigational New Drug, 21 CFR 312)',
      marketingApplication: 'BLA 351(k) (PHS Act §351 biosimilar pathway)',
      agency: 'FDA',
      notes: 'Abbreviated biologics pathway demonstrating biosimilarity to a US-licensed reference product; interchangeability may be sought.',
    },
    EU: {
      clinicalTrialPathway: 'CTA via CTIS (Clinical Trials Regulation (EU) No 536/2014)',
      marketingApplication: 'Centralised similar biological medicinal product (biosimilar) MAA (Reg (EC) No 726/2004; Directive 2001/83/EC Art 10(4))',
      agency: 'EMA',
    },
    JP: {
      clinicalTrialPathway: 'Clinical Trial Notification (CTN / 治験届)',
      marketingApplication: 'Biosimilar J-NDA (PMD Act)',
      agency: 'PMDA / MHLW',
    },
    CA: {
      clinicalTrialPathway: 'Clinical Trial Application (CTA)',
      marketingApplication: 'New Drug Submission (NDS) for a biosimilar (Health Canada biosimilar guidance)',
      agency: 'Health Canada',
    },
    UK: {
      clinicalTrialPathway: 'Clinical Trial Authorisation (MHRA)',
      marketingApplication: 'MHRA national biosimilar Marketing Authorisation (International Recognition Procedure (IRP) available)',
      agency: 'MHRA',
    },
    AU: {
      clinicalTrialPathway: 'CTN or CTX scheme',
      marketingApplication: 'Registration on the ARTG as a biosimilar',
      agency: 'TGA',
    },
  },

  generic: {
    US: {
      clinicalTrialPathway: 'No IND typically required (bioequivalence studies under an IND only if needed)',
      marketingApplication: 'ANDA 505(j) (FD&C Act §505(j), Hatch-Waxman)',
      agency: 'FDA',
      notes: 'Abbreviated application relying on demonstrated bioequivalence to the Reference Listed Drug (RLD).',
    },
    EU: {
      clinicalTrialPathway: 'Bioequivalence study (CTA via CTIS only where a clinical study is conducted)',
      marketingApplication: 'Generic MAA (Directive 2001/83/EC Art 10(1)) — national / Decentralised (DCP) / Mutual Recognition (MRP), or centralised if the reference product was centralised',
      agency: 'EMA / national competent authorities',
    },
    JP: {
      clinicalTrialPathway: 'Bioequivalence study (CTN only where a clinical study is conducted)',
      marketingApplication: 'Generic drug J-NDA (後発医薬品) (PMD Act)',
      agency: 'PMDA / MHLW',
    },
    CA: {
      clinicalTrialPathway: 'Bioequivalence study (CTA only where a clinical study is conducted)',
      marketingApplication: 'Abbreviated New Drug Submission (ANDS)',
      agency: 'Health Canada',
    },
    UK: {
      clinicalTrialPathway: 'Bioequivalence study (Clinical Trial Authorisation only where a clinical study is conducted)',
      marketingApplication: 'MHRA national generic (abridged) Marketing Authorisation',
      agency: 'MHRA',
    },
    AU: {
      clinicalTrialPathway: 'Bioequivalence study (CTN only where a clinical study is conducted)',
      marketingApplication: 'Registration on the ARTG as a generic medicine',
      agency: 'TGA',
    },
  },

  vaccine: {
    US: {
      clinicalTrialPathway: 'IND (Investigational New Drug, 21 CFR 312)',
      marketingApplication: 'BLA 351(a) (PHS Act §351)',
      agency: 'FDA',
      notes: 'Vaccines are biologics licensed by FDA CBER under a BLA.',
    },
    EU: {
      clinicalTrialPathway: 'CTA via CTIS (Clinical Trials Regulation (EU) No 536/2014)',
      marketingApplication: 'Centralised Marketing Authorisation (vaccines fall under the mandatory/optional centralised scope of Reg (EC) No 726/2004)',
      agency: 'EMA',
    },
    JP: {
      clinicalTrialPathway: 'Clinical Trial Notification (CTN / 治験届)',
      marketingApplication: 'J-NDA (PMD Act)',
      agency: 'PMDA / MHLW',
    },
    CA: {
      clinicalTrialPathway: 'Clinical Trial Application (CTA)',
      marketingApplication: 'New Drug Submission (NDS) — Schedule D biologic (vaccine)',
      agency: 'Health Canada',
    },
    UK: {
      clinicalTrialPathway: 'Clinical Trial Authorisation (MHRA)',
      marketingApplication: 'MHRA national Marketing Authorisation (International Recognition Procedure (IRP) available)',
      agency: 'MHRA',
    },
    AU: {
      clinicalTrialPathway: 'CTN or CTX scheme',
      marketingApplication: 'Registration on the ARTG (biological / vaccine)',
      agency: 'TGA',
    },
  },

  cell_gene_therapy: {
    US: {
      clinicalTrialPathway: 'IND (Investigational New Drug, 21 CFR 312; CBER review)',
      marketingApplication: 'BLA 351(a) (PHS Act §351)',
      agency: 'FDA',
      notes: 'Cellular and gene therapy products are regulated as biologics by FDA CBER (RMAT designation may apply).',
    },
    EU: {
      clinicalTrialPathway: 'CTA via CTIS (Clinical Trials Regulation (EU) No 536/2014)',
      marketingApplication: 'Centralised ATMP Marketing Authorisation (Advanced Therapy Medicinal Product, Reg (EC) No 1394/2007; mandatory centralised under Reg (EC) No 726/2004)',
      agency: 'EMA (CAT / CHMP)',
    },
    JP: {
      clinicalTrialPathway: 'Clinical Trial Notification (CTN / 治験届) — or the regenerative-medicine framework',
      marketingApplication: 'J-NDA, or conditional/time-limited approval under the regenerative-medicine framework (PMD Act / ASRM)',
      agency: 'PMDA / MHLW',
    },
    CA: {
      clinicalTrialPathway: 'Clinical Trial Application (CTA)',
      marketingApplication: 'New Drug Submission (NDS) — Schedule D biologic (cell/gene therapy)',
      agency: 'Health Canada',
    },
    UK: {
      clinicalTrialPathway: 'Clinical Trial Authorisation (MHRA)',
      marketingApplication: 'MHRA national ATMP Marketing Authorisation (International Recognition Procedure (IRP) available)',
      agency: 'MHRA',
    },
    AU: {
      clinicalTrialPathway: 'CTN or CTX scheme',
      marketingApplication: 'Registration on the ARTG (biological — cell/tissue/gene therapy)',
      agency: 'TGA',
    },
  },
};

/**
 * Recommend the regulatory pathway for a product across the target markets.
 * Pure / deterministic; recommendations preserve the input target-market order.
 */
export function recommendPathway(input: PathwayAdvisorInput): PathwayAdvisorResult {
  const recommendations: PathwayRecommendation[] = [];
  const productKnown = ALL_PRODUCT_TYPES.includes(input.productType);
  const productMap = productKnown ? PATHWAYS[input.productType] : undefined;

  for (const market of input.targetMarkets ?? []) {
    const marketKnown = ALL_MARKETS.includes(market);
    const mapping = productMap && marketKnown ? productMap[market] : undefined;

    if (mapping) {
      recommendations.push({ market, ...mapping });
    } else {
      // Unknown product/market combo — never throw; emit a consult-agency note.
      const reason = !productKnown
        ? `product type "${input.productType}" is not in the encoded matrix`
        : `market "${market}" is not in the encoded matrix`;
      recommendations.push({
        market,
        clinicalTrialPathway: 'Consult the national agency for the applicable clinical-trial authorisation route.',
        marketingApplication: 'Consult the national agency for the applicable marketing-application route.',
        agency: 'Consult agency',
        notes: `No encoded pathway: ${reason}. Consult the responsible regulator directly to confirm the applicable route.`,
      });
    }
  }

  return {
    recommendations,
    generalNotes: buildGeneralNotes(input),
  };
}

function buildGeneralNotes(input: PathwayAdvisorInput): string[] {
  const notes: string[] = [];

  notes.push(
    'Pathways follow each jurisdiction\'s primary framework: US FD&C Act §505 / PHS Act §351; EU Reg (EC) No 726/2004 and Clinical Trials Regulation (EU) No 536/2014; JP PMD Act; CA Food and Drug Regulations; UK Human Medicines Regulations 2012; AU Therapeutic Goods Act 1989.',
  );

  switch (input.productType) {
    case 'biologic':
    case 'vaccine':
    case 'cell_gene_therapy':
      notes.push('Biologics, vaccines and advanced therapies use a biologics licence (US BLA 351(a)) and mandatory centralised authorisation in the EU; align CMC/comparability strategy early.');
      break;
    case 'biosimilar':
      notes.push('Biosimilars use abbreviated, reference-product-dependent routes (US BLA 351(k); EU centralised similar biological MAA); the chosen reference product must be appropriate per region.');
      break;
    case 'generic':
      notes.push('Generics rely on demonstrated bioequivalence to the reference/listed product (US ANDA 505(j); EU generic MAA; CA ANDS) and usually do not require a full clinical program.');
      break;
    case 'small_molecule_nce':
      notes.push('A new chemical entity follows the full new-drug route (US NDA 505(b)(1)); consider ICH-aligned data packages to support parallel global filings.');
      break;
  }

  if (input.targetMarkets?.includes('UK')) {
    notes.push('UK: post-Brexit the MHRA grants national marketing authorisations; the International Recognition Procedure (IRP) can rely on approvals from trusted reference regulators to accelerate review.');
  }
  if (input.targetMarkets?.includes('EU')) {
    notes.push('EU: the centralised procedure (EMA) is mandatory for biotech-derived products, ATMPs, oncology and orphan medicines, and optional for certain others; clinical trials run under CTR 536/2014 via CTIS.');
  }
  if (input.targetMarkets?.includes('JP') && input.productType === 'cell_gene_therapy') {
    notes.push('JP: regenerative-medicine products may qualify for conditional and time-limited approval under the dedicated regenerative-medicine framework.');
  }

  switch (input.developmentPhase) {
    case 'preclinical':
      notes.push('Phase context (preclinical): focus on enabling the first clinical-trial authorisation (IND/CTA/CTN/CTX) before any marketing application.');
      break;
    case 'phase1':
    case 'phase2':
      notes.push('Phase context (early clinical): clinical-trial authorisations are the active filings; plan scientific advice / pre-IND or EMA/PMDA consultations toward the marketing application.');
      break;
    case 'phase3':
      notes.push('Phase context (phase 3): prepare the marketing application dossier (eCTD) and consider pre-submission meetings in each target market.');
      break;
    case 'filed':
      notes.push('Phase context (filed): the marketing application is under review; focus on response management and lifecycle/post-approval commitments.');
      break;
    default:
      break;
  }

  return notes;
}

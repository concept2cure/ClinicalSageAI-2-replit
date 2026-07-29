/**
 * Fixture for the MAA / Module-1 cockpit (non-US marketing-application admin).
 *
 * Mirrors the deterministic backend requirements in
 * server/services/global-ri/regional-module1-requirements.ts so the surface
 * renders the region-accurate eCTD Module-1 checklist offline. The live surface
 * fetches GET /api/global-ri/module1/requirements/:market; this is the
 * fail-closed fallback (marked "Sample data").
 */

/** One required regional Module-1 component (matches the server contract). */
export interface Module1Component {
  code: string;
  label: string;
  section: string;
}

/** A supported non-US market + its display metadata. */
export interface MaaMarket {
  /** Backend RegulatoryMarket code (GET /module1/requirements/:market). */
  key: string;
  /** Short label for the region selector. */
  label: string;
  /** Agency / application context. */
  agency: string;
  procedure: string;
}

/** The non-US markets the Module-1 requirements service models. */
export const MAA_MARKETS: MaaMarket[] = [
  { key: 'EMA', label: 'EU (EMA)', agency: 'European Medicines Agency', procedure: 'Centralised MAA' },
  { key: 'PMDA', label: 'Japan (PMDA)', agency: 'Pharmaceuticals and Medical Devices Agency', procedure: 'J-NDA' },
  { key: 'MHRA', label: 'UK (MHRA)', agency: 'Medicines and Healthcare products Regulatory Agency', procedure: 'UK MA' },
  { key: 'TGA', label: 'Australia (TGA)', agency: 'Therapeutic Goods Administration', procedure: 'Registration' },
  { key: 'HEALTH_CANADA', label: 'Canada (HC)', agency: 'Health Canada', procedure: 'NDS' },
  { key: 'NMPA', label: 'China (NMPA)', agency: 'National Medical Products Administration', procedure: 'NDA' },
];

/** Required Module-1 components per market — mirrors the backend constant. */
export const MAA_REQUIREMENTS: Record<string, Module1Component[]> = {
  EMA: [
    { code: 'eu_cover_letter', label: 'Cover letter', section: 'm1.0' },
    { code: 'eu_eaf', label: 'Application form (electronic Application Form, eAF)', section: 'm1.2' },
    { code: 'eu_product_information', label: 'Product information — SmPC, labelling, package leaflet (Annexes)', section: 'm1.3' },
    { code: 'eu_expert_declarations', label: 'Information about the experts (expert declarations)', section: 'm1.4' },
    { code: 'eu_era', label: 'Environmental risk assessment', section: 'm1.6' },
    { code: 'eu_rmp', label: 'Risk Management Plan + PSMF summary', section: 'm1.8.2' },
  ],
  PMDA: [
    { code: 'jp_application_form', label: 'Application form (承認申請書)', section: 'm1.2' },
    { code: 'jp_product_information', label: 'Japanese product information / package insert (添付文書)', section: 'm1.3' },
    { code: 'jp_gmp', label: 'GMP compliance documentation', section: 'm1.13' },
    { code: 'jp_manufacturer_certificate', label: 'Certificate of the (foreign) manufacturer / accreditation', section: 'm1.2' },
  ],
  MHRA: [
    { code: 'uk_cover_letter', label: 'Cover letter', section: 'm1.0' },
    { code: 'uk_application_form', label: 'Application form (UK MA)', section: 'm1.2' },
    { code: 'uk_product_information', label: 'Product information — SmPC, PIL, labelling', section: 'm1.3' },
    { code: 'uk_rmp', label: 'UK Risk Management Plan', section: 'm1.8.2' },
  ],
  TGA: [
    { code: 'au_cover_letter', label: 'Cover letter', section: 'm1.0' },
    { code: 'au_application_form', label: 'Application form', section: 'm1.2' },
    { code: 'au_product_information', label: 'Australian Product Information (PI)', section: 'm1.3.1' },
    { code: 'au_cmi', label: 'Consumer Medicines Information (CMI)', section: 'm1.3.2' },
    { code: 'au_labels', label: 'Draft Australian labels', section: 'm1.3.3' },
  ],
  HEALTH_CANADA: [
    { code: 'ca_hc3011', label: 'Drug Submission Application Form (HC/SC 3011)', section: 'm1.2' },
    { code: 'ca_cover_letter', label: 'Cover letter', section: 'm1.0' },
    { code: 'ca_product_monograph', label: 'Draft Product Monograph (labeling)', section: 'm1.3' },
    { code: 'ca_cpid', label: 'Certified Product Information Document (CPID)', section: 'm1.2' },
  ],
  NMPA: [
    { code: 'cn_application_form', label: 'Application form (申请表)', section: 'm1.2' },
    { code: 'cn_product_information', label: 'Chinese product information / labeling (说明书)', section: 'm1.3' },
    { code: 'cn_certificates', label: 'Certificates (manufacturing, GMP, CPP)', section: 'm1.2' },
  ],
};

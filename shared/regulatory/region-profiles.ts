/**
 * Region Profiles — Regulatory agency profiles for all supported regions.
 *
 * @module shared/regulatory/region-profiles
 */

import type { RegionProfile } from './document-taxonomy';

export const REGION_PROFILES: RegionProfile[] = [
  { region: 'US', country: 'United States', agency: 'FDA', agencyFullName: 'Food and Drug Administration', currency: 'USD', language: 'en', dossierStandard: 'eCTD', submissionGateway: 'https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/electronic-common-technical-document-ectd', supportedFamilies: ['clinical_trial', 'marketing_authorization', 'supplement', 'master_file', 'pre_submission', 'device_clearance', 'device_approval'] },
  { region: 'EU', country: 'European Union', agency: 'EMA', agencyFullName: 'European Medicines Agency', currency: 'EUR', language: 'en', dossierStandard: 'eCTD', submissionGateway: 'https://esubmission.ema.europa.eu', supportedFamilies: ['clinical_trial', 'marketing_authorization', 'variation', 'renewal', 'pediatric', 'orphan', 'safety_report'] },
  { region: 'UK', country: 'United Kingdom', agency: 'MHRA', agencyFullName: 'Medicines and Healthcare products Regulatory Agency', currency: 'GBP', language: 'en', dossierStandard: 'eCTD', supportedFamilies: ['clinical_trial', 'marketing_authorization', 'variation', 'renewal'] },
  { region: 'CA', country: 'Canada', agency: 'Health_Canada', agencyFullName: 'Health Canada', currency: 'CAD', language: 'en', dossierStandard: 'eCTD', supportedFamilies: ['clinical_trial', 'marketing_authorization', 'supplement', 'master_file'] },
  { region: 'JP', country: 'Japan', agency: 'PMDA', agencyFullName: 'Pharmaceuticals and Medical Devices Agency', currency: 'JPY', language: 'ja', dossierStandard: 'eCTD', supportedFamilies: ['clinical_trial', 'marketing_authorization', 'variation', 'master_file'] },
  { region: 'CN', country: 'China', agency: 'NMPA', agencyFullName: 'National Medical Products Administration', currency: 'CNY', language: 'zh', dossierStandard: 'CTD', supportedFamilies: ['clinical_trial', 'marketing_authorization', 'supplement', 'renewal'] },
  { region: 'AU', country: 'Australia', agency: 'TGA', agencyFullName: 'Therapeutic Goods Administration', currency: 'AUD', language: 'en', dossierStandard: 'eCTD', supportedFamilies: ['clinical_trial', 'marketing_authorization'] },
  { region: 'CH', country: 'Switzerland', agency: 'Swissmedic', agencyFullName: 'Swiss Agency for Therapeutic Products', currency: 'CHF', language: 'en', dossierStandard: 'eCTD', supportedFamilies: ['clinical_trial', 'marketing_authorization'] },
  { region: 'BR', country: 'Brazil', agency: 'ANVISA', agencyFullName: 'Agência Nacional de Vigilância Sanitária', currency: 'BRL', language: 'pt', dossierStandard: 'CTD', supportedFamilies: ['clinical_trial', 'marketing_authorization'] },
  { region: 'IN', country: 'India', agency: 'CDSCO', agencyFullName: 'Central Drugs Standard Control Organisation', currency: 'INR', language: 'en', dossierStandard: 'CTD', supportedFamilies: ['clinical_trial', 'marketing_authorization'] },
  { region: 'KR', country: 'South Korea', agency: 'MFDS', agencyFullName: 'Ministry of Food and Drug Safety', currency: 'KRW', language: 'ko', dossierStandard: 'eCTD', supportedFamilies: ['clinical_trial', 'marketing_authorization'] },
  { region: 'SG', country: 'Singapore', agency: 'HSA', agencyFullName: 'Health Sciences Authority', currency: 'SGD', language: 'en', dossierStandard: 'ACTD', supportedFamilies: ['marketing_authorization'] },
];

export function getRegionProfile(region: string): RegionProfile | undefined {
  return REGION_PROFILES.find(r => r.region === region);
}

export function getRegionsByAgency(agency: string): RegionProfile[] {
  return REGION_PROFILES.filter(r => r.agency === agency);
}

export default REGION_PROFILES;

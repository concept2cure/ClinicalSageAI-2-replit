/**
 * Global device strategy map — for a single device/IVD, how its evidence maps
 * across the major regions (FDA, EU MDR, EU IVDR, Japan PMDA): which evidence is
 * SHARED (transfers via internationally-recognised standards) vs. REGION-SPECIFIC
 * (must be produced per region), plus the per-region pathway and registration.
 *
 * WHY THIS EXISTS: global device/diagnostics clients need to know what a single
 * evidence package buys them across markets and what has to be redone. This is the
 * deterministic "build once, file many" map — risk management, biocompatibility,
 * electrical/EMC, usability, software, sterilisation, bench performance and the QMS
 * transfer across regions through ISO/IEC standards; the clinical/performance
 * argument, labelling, UDI and forms are region-specific.
 *
 * HONESTY: reflects the recognised-standards landscape and the per-region pathway
 * structure — a planning map, not a regulatory strategy decision. The reuse of a
 * data set across regions still requires the region's own gap/assessment (e.g. a
 * 510(k) SE story does NOT satisfy an MDR CER — see the device challenge library).
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/device-global-strategy
 */

export type DeviceKind = 'device' | 'ivd';
export type DeviceRegion = 'fda' | 'eu_mdr' | 'eu_ivdr' | 'pmda';

export interface EvidenceCategory {
  id: string;
  label: string;
  /** 'shared' transfers across regions via recognised standards; 'region_specific' does not. */
  reuse: 'shared' | 'region_specific';
  /** The recognised standard or region rule. */
  basis: string;
  /** Which device kinds the category applies to. */
  kinds: DeviceKind[];
}

export const DEVICE_EVIDENCE_CATEGORIES: EvidenceCategory[] = [
  { id: 'risk_management', label: 'Risk management file', reuse: 'shared', basis: 'ISO 14971', kinds: ['device', 'ivd'] },
  { id: 'qms', label: 'Quality management system', reuse: 'shared', basis: 'ISO 13485 (FDA QSR/QMSR aligns)', kinds: ['device', 'ivd'] },
  { id: 'biocompatibility', label: 'Biological evaluation', reuse: 'shared', basis: 'ISO 10993-1', kinds: ['device'] },
  { id: 'electrical_safety', label: 'Electrical safety', reuse: 'shared', basis: 'IEC 60601-1', kinds: ['device', 'ivd'] },
  { id: 'emc', label: 'Electromagnetic compatibility', reuse: 'shared', basis: 'IEC 60601-1-2', kinds: ['device', 'ivd'] },
  { id: 'usability', label: 'Usability / human factors', reuse: 'shared', basis: 'IEC 62366-1', kinds: ['device', 'ivd'] },
  { id: 'software', label: 'Software lifecycle', reuse: 'shared', basis: 'IEC 62304', kinds: ['device', 'ivd'] },
  { id: 'sterilization', label: 'Sterilisation validation', reuse: 'shared', basis: 'ISO 11135 / 11137', kinds: ['device'] },
  { id: 'bench_performance', label: 'Bench / non-clinical performance', reuse: 'shared', basis: 'Recognised consensus standards', kinds: ['device', 'ivd'] },
  { id: 'analytical_performance', label: 'Analytical performance', reuse: 'shared', basis: 'CLSI / recognised standards', kinds: ['ivd'] },
  // Region-specific.
  { id: 'clinical_evidence', label: 'Clinical evidence / equivalence argument', reuse: 'region_specific', basis: 'Region clinical standard (SE vs CER vs PER vs Shōnin)', kinds: ['device', 'ivd'] },
  { id: 'labeling', label: 'Labelling / IFU', reuse: 'region_specific', basis: 'Region language + format rules', kinds: ['device', 'ivd'] },
  { id: 'udi_registration', label: 'UDI + device registration', reuse: 'region_specific', basis: 'GUDID / EUDAMED / PMDA', kinds: ['device', 'ivd'] },
  { id: 'administrative', label: 'Administrative forms & fees', reuse: 'region_specific', basis: 'Region application forms', kinds: ['device', 'ivd'] },
];

interface RegionProfile {
  region: DeviceRegion;
  authority: string;
  kind: DeviceKind;
  pathway: string;
  clinicalEvidenceDoc: string;
  registration: string;
}

const REGION_PROFILES: RegionProfile[] = [
  { region: 'fda', authority: 'FDA', kind: 'device', pathway: '510(k) / De Novo / PMA (risk-based)', clinicalEvidenceDoc: 'Substantial Equivalence (510(k)) or clinical data (PMA/De Novo)', registration: 'FDA Establishment Registration & Device Listing; GUDID (UDI)' },
  { region: 'fda', authority: 'FDA', kind: 'ivd', pathway: '510(k) / De Novo / PMA (risk-based)', clinicalEvidenceDoc: 'Analytical & clinical performance; Substantial Equivalence', registration: 'FDA Registration & Listing; GUDID (UDI)' },
  { region: 'eu_mdr', authority: 'EU Notified Body / EUDAMED', kind: 'device', pathway: 'CE marking under MDR 2017/745 (Notified Body for class IIa+)', clinicalEvidenceDoc: 'Clinical Evaluation Report (Annex XIV)', registration: 'EUDAMED (actor/device/UDI/certificate)' },
  { region: 'eu_ivdr', authority: 'EU Notified Body / EUDAMED', kind: 'ivd', pathway: 'CE marking under IVDR 2017/746 (Notified Body for class B–D)', clinicalEvidenceDoc: 'Performance Evaluation Report (Annex XIII)', registration: 'EUDAMED' },
  { region: 'pmda', authority: 'PMDA / MHLW', kind: 'device', pathway: 'Shōnin (approval) / Ninshō (certification), risk-based', clinicalEvidenceDoc: 'STED + clinical data where required (ICH/IMDRF aligned)', registration: 'PMDA / MHLW marketing notification' },
  { region: 'pmda', authority: 'PMDA / MHLW', kind: 'ivd', pathway: 'Shōnin / Ninshō (risk-based)', clinicalEvidenceDoc: 'Analytical & clinical performance; STED', registration: 'PMDA / MHLW' },
];

/** Regions that apply to a device kind (eu_mdr for devices, eu_ivdr for IVDs). */
export function regionsForKind(kind: DeviceKind): DeviceRegion[] {
  return REGION_PROFILES.filter((p) => p.kind === kind).map((p) => p.region);
}

export interface RegionStrategy {
  region: DeviceRegion;
  authority: string;
  pathway: string;
  clinicalEvidenceDoc: string;
  registration: string;
  sharedEvidence: string[];
  regionSpecificEvidence: string[];
}

export interface GlobalDeviceStrategy {
  kind: DeviceKind;
  regions: RegionStrategy[];
  /** Evidence categories reusable across ALL selected regions (build once). */
  sharedAcrossAll: string[];
  notes: string[];
}

const STRATEGY_NOTES = [
  'Internationally-recognised standards (ISO 14971, ISO 10993, IEC 60601/62304/62366, ISO 13485) let one evidence package serve multiple regions — build these once.',
  'The clinical/performance ARGUMENT is region-specific: a 510(k) substantial-equivalence story does NOT satisfy an EU MDR CER or an IVDR PER. Plan region-specific clinical/performance work separately.',
  'Labelling, UDI and registration differ per region (GUDID vs EUDAMED vs PMDA) and per language.',
];

/**
 * Build the global strategy for a device/IVD across the requested regions (or all
 * regions applicable to the kind when none specified). Pure + deterministic.
 */
export function buildGlobalDeviceStrategy(kind: DeviceKind, regions?: DeviceRegion[]): GlobalDeviceStrategy {
  const applicable = regionsForKind(kind);
  const selected = (regions && regions.length ? regions.filter((r) => applicable.includes(r)) : applicable);

  const categories = DEVICE_EVIDENCE_CATEGORIES.filter((c) => c.kinds.includes(kind));
  const shared = categories.filter((c) => c.reuse === 'shared').map((c) => c.id);
  const regionSpecific = categories.filter((c) => c.reuse === 'region_specific').map((c) => c.id);

  const regionStrategies: RegionStrategy[] = selected.map((region) => {
    const p = REGION_PROFILES.find((x) => x.region === region && x.kind === kind)!;
    return {
      region,
      authority: p.authority,
      pathway: p.pathway,
      clinicalEvidenceDoc: p.clinicalEvidenceDoc,
      registration: p.registration,
      sharedEvidence: shared,
      regionSpecificEvidence: regionSpecific,
    };
  });

  return {
    kind,
    regions: regionStrategies,
    sharedAcrossAll: selected.length > 0 ? shared : [],
    notes: STRATEGY_NOTES,
  };
}

export default { DEVICE_EVIDENCE_CATEGORIES, regionsForKind, buildGlobalDeviceStrategy };

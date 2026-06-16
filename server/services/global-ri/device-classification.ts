/**
 * Medical device & IVD risk-classification + market-pathway expert — FDA, EU MDR, EU IVDR.
 *
 * Before any device or in-vitro diagnostic can reach a market, it must be slotted
 * into the correct RISK CLASS — and that risk class drives the premarket pathway
 * (510(k) vs PMA vs De Novo in the US) and whether a Notified Body must be engaged
 * (in the EU). This is a distinct judgement from the drug-device PMOA / lead-center
 * call modeled in combination-product-classification.ts: here the question is the
 * device's own risk class and the market route that follows from it.
 *
 * This service returns, per region, the modeled risk-class framework and — given a
 * region + class — the premarket pathway, the conformity-assessment route, and
 * whether Notified Body involvement is required. Deterministic.
 *
 * Regions:
 *  - FDA    (US medical devices)
 *  - EU_MDR (EU medical devices)
 *  - EU_IVDR (EU in-vitro diagnostic medical devices)
 *
 * Pure / deterministic — no DB, no IO. Classification is RULE-BASED and is
 * ultimately determined by the device's intended purpose; this module keys off the
 * declared class only. Confirm the class and pathway against the governing rules /
 * guidance and the agency (FDA) or Notified Body / competent authority (EU).
 *
 * References:
 *  - FDA: Federal Food, Drug, and Cosmetic Act §513 (device classification) and
 *    §513(g) (Request for Information on classification); device classification
 *    procedures at 21 CFR Part 860. Class I — general controls (most 510(k)-exempt);
 *    Class II — general + special controls (typically 510(k) premarket notification,
 *    21 CFR 807 Subpart E); Class III — premarket approval (PMA, 21 CFR Part 814).
 *    Additional routes: De Novo classification (FD&C Act §513(f)(2)) for novel
 *    low/moderate-risk devices with no predicate (grants Class I/II); Humanitarian
 *    Device Exemption (HDE, 21 CFR Part 814 Subpart H) for Humanitarian Use Devices.
 *  - EU MDR: Regulation (EU) 2017/745, Annex VIII classification rules 1–22.
 *    Classes I (incl. Is sterile, Im measuring, Ir reusable surgical), IIa, IIb, III.
 *    Class I (non-sterile / non-measuring / non-reusable-surgical) is self-declared;
 *    IIa / IIb / III require Notified Body conformity assessment (Annex IX–XI).
 *  - EU IVDR: Regulation (EU) 2017/746, Annex VIII classification rules.
 *    Classes A (lowest individual & public-health risk; mostly self-declared), B, C,
 *    D (highest, e.g. blood-screening / transmissible-agent detection). B / C / D
 *    require Notified Body involvement; Class A sterile also needs a Notified Body
 *    for the sterility aspect.
 *
 * @module server/services/global-ri/device-classification
 */

export type DeviceRegion = 'FDA' | 'EU_MDR' | 'EU_IVDR';

/** A single risk class within a region's framework. */
export interface DeviceClassInfo {
  /** The class label (e.g. 'I', 'II', 'III', 'IIa', 'IIb', 'A', 'B', 'C', 'D'). */
  class: string;
  /** Plain-language relative risk level. */
  riskLevel: string;
  /** The applicable controls / requirements for this class. */
  controls: string;
  /** The typical premarket pathway / conformity-assessment route. */
  typicalPathway: string;
  /** Whether a Notified Body (EU) is required for this class (FDA: always false). */
  notifiedBodyRequired: boolean;
  /** Governing citation. */
  citation: string;
}

export interface DeviceFramework {
  region: DeviceRegion;
  /** The legal basis of the regional classification framework. */
  basis: string;
  /** The modeled risk classes for the region. */
  classes: DeviceClassInfo[];
  /** Governing citation for the framework as a whole. */
  citation: string;
  notes: string[];
}

const FDA_BASIS =
  'FDA classifies devices into three regulatory classes by risk under FD&C Act §513; classification procedures at 21 CFR Part 860. The class determines the premarket pathway.';
const FDA_CIT = 'FD&C Act §513; 21 CFR Part 860';

const FDA_CLASSES: DeviceClassInfo[] = [
  {
    class: 'I',
    riskLevel: 'Low risk',
    controls: 'General controls',
    typicalPathway: '510(k)-exempt (general controls only); a minority require 510(k)',
    notifiedBodyRequired: false,
    citation: 'FD&C Act §513(a)(1)(A); 21 CFR Part 860',
  },
  {
    class: 'II',
    riskLevel: 'Moderate risk',
    controls: 'General controls + special controls',
    typicalPathway: '510(k) premarket notification (21 CFR 807 Subpart E)',
    notifiedBodyRequired: false,
    citation: 'FD&C Act §513(a)(1)(B); 21 CFR 807 Subpart E',
  },
  {
    class: 'III',
    riskLevel: 'High risk (life-sustaining / life-supporting or presenting significant risk)',
    controls: 'General controls + premarket approval',
    typicalPathway: 'PMA — premarket approval (21 CFR Part 814)',
    notifiedBodyRequired: false,
    citation: 'FD&C Act §513(a)(1)(C); 21 CFR Part 814',
  },
];

const MDR_BASIS =
  'EU MDR classifies devices into four classes by risk applying the rules in Annex VIII. The class determines the conformity-assessment route and whether a Notified Body is involved.';
const MDR_CIT = 'Regulation (EU) 2017/745 (MDR) Annex VIII';

const MDR_CLASSES: DeviceClassInfo[] = [
  {
    class: 'I',
    riskLevel: 'Low risk',
    controls:
      'General Safety and Performance Requirements (GSPR); self-declared (sub-classes Is sterile / Im measuring / Ir reusable surgical require a Notified Body for that specific aspect)',
    typicalPathway: 'Self-declaration of conformity (Annex IV); EU declaration of conformity, CE mark',
    notifiedBodyRequired: false,
    citation: 'MDR Annex VIII; Annex IV',
  },
  {
    class: 'IIa',
    riskLevel: 'Medium-low risk',
    controls: 'GSPR + Notified Body conformity assessment',
    typicalPathway: 'Notified Body conformity assessment (Annex IX or Annex XI)',
    notifiedBodyRequired: true,
    citation: 'MDR Annex VIII; Annex IX / Annex XI',
  },
  {
    class: 'IIb',
    riskLevel: 'Medium-high risk',
    controls: 'GSPR + Notified Body conformity assessment',
    typicalPathway: 'Notified Body conformity assessment (Annex IX or Annex X + XI)',
    notifiedBodyRequired: true,
    citation: 'MDR Annex VIII; Annex IX / Annex X / Annex XI',
  },
  {
    class: 'III',
    riskLevel: 'High risk',
    controls: 'GSPR + Notified Body conformity assessment (incl. technical-documentation assessment)',
    typicalPathway: 'Notified Body conformity assessment (Annex IX or Annex X); clinical evaluation',
    notifiedBodyRequired: true,
    citation: 'MDR Annex VIII; Annex IX / Annex X',
  },
];

const IVDR_BASIS =
  'EU IVDR classifies in-vitro diagnostics into four classes by individual and public-health risk applying the rules in Annex VIII. The class determines the conformity-assessment route and Notified Body involvement.';
const IVDR_CIT = 'Regulation (EU) 2017/746 (IVDR) Annex VIII';

const IVDR_CLASSES: DeviceClassInfo[] = [
  {
    class: 'A',
    riskLevel: 'Low individual risk and low public-health risk',
    controls:
      'GSPR; self-declared (Class A sterile requires a Notified Body for the sterility aspect only)',
    typicalPathway: 'Self-declaration of conformity (Annex II / III); EU declaration of conformity, CE mark',
    notifiedBodyRequired: false,
    citation: 'IVDR Annex VIII rule 5; Annex II / III',
  },
  {
    class: 'B',
    riskLevel: 'Moderate individual risk and/or low public-health risk',
    controls: 'GSPR + Notified Body conformity assessment',
    typicalPathway: 'Notified Body conformity assessment (Annex IX or Annex XI)',
    notifiedBodyRequired: true,
    citation: 'IVDR Annex VIII; Annex IX / Annex XI',
  },
  {
    class: 'C',
    riskLevel: 'High individual risk and/or moderate public-health risk',
    controls: 'GSPR + Notified Body conformity assessment',
    typicalPathway: 'Notified Body conformity assessment (Annex IX or Annex X + XI)',
    notifiedBodyRequired: true,
    citation: 'IVDR Annex VIII; Annex IX / Annex X / Annex XI',
  },
  {
    class: 'D',
    riskLevel:
      'High individual risk and high public-health risk (e.g. blood-screening / transmissible-agent detection)',
    controls:
      'GSPR + Notified Body conformity assessment, EU reference laboratory verification, expert-panel scrutiny',
    typicalPathway: 'Notified Body conformity assessment (Annex IX or Annex X); EU reference laboratory involvement',
    notifiedBodyRequired: true,
    citation: 'IVDR Annex VIII; Annex IX / Annex X',
  },
];

const FRAMEWORKS: Record<DeviceRegion, DeviceFramework> = {
  FDA: {
    region: 'FDA',
    basis: FDA_BASIS,
    classes: FDA_CLASSES,
    citation: FDA_CIT,
    notes: [
      'Most Class I (and some Class II) devices are exempt from 510(k) premarket notification.',
      'De Novo classification (FD&C Act §513(f)(2)) provides a route for a novel low/moderate-risk device with no predicate, granting Class I or II.',
      'A 513(g) Request for Information may be used to obtain FDA\'s view on a device\'s classification.',
      'A Humanitarian Device Exemption (HDE, 21 CFR Part 814 Subpart H) applies to Humanitarian Use Devices (HUDs).',
      DEVICE_CAVEAT_NOTE(),
    ],
  },
  EU_MDR: {
    region: 'EU_MDR',
    basis: MDR_BASIS,
    classes: MDR_CLASSES,
    citation: MDR_CIT,
    notes: [
      'Classification follows the Annex VIII rules 1–22 driven by the device\'s intended purpose (duration of contact, invasiveness, active/implantable nature, etc.).',
      'Class I (non-sterile, non-measuring, non-reusable-surgical) is self-declared; Is / Im / Ir, IIa, IIb and III require Notified Body involvement.',
      DEVICE_CAVEAT_NOTE(),
    ],
  },
  EU_IVDR: {
    region: 'EU_IVDR',
    basis: IVDR_BASIS,
    classes: IVDR_CLASSES,
    citation: IVDR_CIT,
    notes: [
      'Classification follows the Annex VIII rules driven by intended purpose and the risk to the individual and to public health.',
      'Class A is mostly self-declared (Class A sterile needs a Notified Body for sterility); B, C and D require Notified Body involvement, with Class D additionally subject to EU reference laboratory verification and expert-panel scrutiny.',
      DEVICE_CAVEAT_NOTE(),
    ],
  },
};

function DEVICE_CAVEAT_NOTE(): string {
  return 'Classification is rule-based and ultimately determined by the device\'s intended purpose; confirm against the governing rules/guidance and the agency (FDA) or Notified Body / competent authority (EU).';
}

/**
 * Return the modeled device-classification framework for a region.
 * Pure / deterministic. Throws for an unmodeled region.
 */
export function getDeviceFramework(region: DeviceRegion): DeviceFramework {
  const framework = FRAMEWORKS[region];
  if (!framework) throw new Error(`No device-classification framework modeled for region "${region}".`);
  return framework;
}

export interface DeviceClassificationInput {
  region: DeviceRegion;
  /** The declared risk class. FDA: 'I'|'II'|'III'; EU_MDR: 'I'|'IIa'|'IIb'|'III'; EU_IVDR: 'A'|'B'|'C'|'D'. */
  deviceClass: string;
}

export interface DevicePathwayResult {
  region: DeviceRegion;
  deviceClass: string;
  /** The premarket pathway / market route for this class. */
  pathway: string;
  /** The conformity-assessment route (EU) or premarket-review basis (FDA). */
  conformityAssessment: string;
  /** Whether a Notified Body must be engaged for this class. */
  notifiedBodyRequired: boolean;
  citation: string;
  notes: string[];
}

const FDA_PATHWAY_NOTES: Record<string, string[]> = {
  I: [
    'Most Class I devices are 510(k)-exempt and reach market under general controls only (registration, listing, GMP/QSR).',
    'A novel low-risk device with no predicate may instead use the De Novo classification route (FD&C Act §513(f)(2)).',
  ],
  II: [
    'Class II typically clears via 510(k) premarket notification demonstrating substantial equivalence to a legally marketed predicate.',
    'A novel moderate-risk device with no predicate may use the De Novo classification route (FD&C Act §513(f)(2)) instead of 510(k).',
    'A 513(g) Request for Information may be filed to obtain FDA\'s view on the device\'s classification.',
  ],
  III: [
    'Class III requires premarket approval (PMA) with valid scientific evidence of safety and effectiveness.',
    'A Humanitarian Device Exemption (HDE) may apply where the device is a Humanitarian Use Device (HUD).',
  ],
};

function classifyFda(deviceClass: string): DevicePathwayResult {
  const info = FDA_CLASSES.find((c) => c.class === deviceClass);
  if (!info) {
    throw new Error(
      `Unknown FDA device class "${deviceClass}"; modeled classes are I, II, III.`,
    );
  }
  return {
    region: 'FDA',
    deviceClass: info.class,
    pathway: info.typicalPathway,
    conformityAssessment: info.controls,
    notifiedBodyRequired: false,
    citation: info.citation,
    notes: [...FDA_PATHWAY_NOTES[info.class], DEVICE_CAVEAT_NOTE()],
  };
}

function classifyEu(region: 'EU_MDR' | 'EU_IVDR', deviceClass: string): DevicePathwayResult {
  const classes = region === 'EU_MDR' ? MDR_CLASSES : IVDR_CLASSES;
  const info = classes.find((c) => c.class === deviceClass);
  if (!info) {
    const modeled = classes.map((c) => c.class).join(', ');
    throw new Error(
      `Unknown ${region} device class "${deviceClass}"; modeled classes are ${modeled}.`,
    );
  }
  const notes: string[] = [];
  if (info.notifiedBodyRequired) {
    notes.push('A Notified Body must be engaged for the conformity assessment of this class.');
  } else {
    notes.push(
      region === 'EU_MDR'
        ? 'This class is self-declared (no Notified Body) unless it is sterile (Is), measuring (Im) or reusable surgical (Ir), in which case a Notified Body assesses that specific aspect.'
        : 'This class is self-declared (no Notified Body) unless it is sterile, in which case a Notified Body assesses the sterility aspect.',
    );
  }
  notes.push(DEVICE_CAVEAT_NOTE());
  return {
    region,
    deviceClass: info.class,
    pathway: info.typicalPathway,
    conformityAssessment: info.controls,
    notifiedBodyRequired: info.notifiedBodyRequired,
    citation: info.citation,
    notes,
  };
}

/**
 * Classify a device's market pathway given its region and declared risk class.
 * Validates the class against the region's modeled classes.
 * Pure / deterministic. Throws for an unmodeled region or class.
 */
export function classifyDevicePathway(input: DeviceClassificationInput): DevicePathwayResult {
  if (input.region === 'FDA') return classifyFda(input.deviceClass);
  if (input.region === 'EU_MDR' || input.region === 'EU_IVDR') {
    return classifyEu(input.region, input.deviceClass);
  }
  throw new Error(`No device-classification modeled for region "${input.region}".`);
}

/** The set of modeled device regions. */
export const DEVICE_REGIONS: DeviceRegion[] = ['FDA', 'EU_MDR', 'EU_IVDR'];

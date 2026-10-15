/**
 * REMS reference data: approved REMS programs used as design models, and the
 * ETASU sub-elements. designREMS in labeling-intelligence-knowledge.ts reads
 * them. Moved out of that file unchanged (2026-10-15) so that it does not grow
 * past its size; pure data, no imports.
 *
 * @module server/services/labeling/rems-reference
 */

export type REMSElement = 'medication_guide' | 'communication_plan' | 'etasu' | 'implementation_system';

export interface ExistingREMSModel {
  programName: string;
  drugNames: string[];
  elements: REMSElement[];
  keyFeatures: string[];
  yearEstablished: number;
}

export interface ETASUDetail {
  subElement: string;
  description: string;
  examples: string[];
}

/** REMS Existing Program Models */
export const EXISTING_REMS_MODELS: ExistingREMSModel[] = [
  {
    programName: 'iPLEDGE',
    drugNames: ['isotretinoin (Accutane, Absorica, Amnesteem, Claravis, Myorisan, Zenatane)'],
    elements: ['medication_guide', 'etasu', 'implementation_system'],
    keyFeatures: [
      'Prescriber certification and enrollment',
      'Pharmacy certification and enrollment',
      'Patient enrollment and informed consent',
      'Pregnancy testing protocol: two negative tests before starting, monthly tests during treatment',
      'Two forms of contraception required for females of reproductive potential',
      'Dispensing limited to 30-day supply with 7-day window',
      'Central electronic system (iPLEDGE website) linking prescribers, pharmacies, and patients',
    ],
    yearEstablished: 2006,
  },
  {
    programName: 'TIRF REMS Access Program',
    drugNames: ['fentanyl (Actiq, Fentora, Abstral, Lazanda, Subsys, transmucosal immediate-release fentanyl products)'],
    elements: ['medication_guide', 'communication_plan', 'etasu', 'implementation_system'],
    keyFeatures: [
      'Shared system REMS — covers all TIRF products under one program',
      'Prescriber enrollment and knowledge assessment',
      'Pharmacy enrollment and knowledge assessment',
      'Patient-prescriber agreement form',
      'Restricted to opioid-tolerant patients with breakthrough cancer pain',
      'Inpatient and outpatient dispensing requirements differ',
    ],
    yearEstablished: 2012,
  },
  {
    programName: 'Clozapine REMS Program',
    drugNames: ['clozapine (Clozaril, FazaClo, Versacloz, generic clozapine)'],
    elements: ['medication_guide', 'etasu', 'implementation_system'],
    keyFeatures: [
      'Mandatory ANC monitoring at specified intervals',
      'Prescriber, pharmacy, and patient enrollment in central registry',
      'ANC results must be entered before dispensing',
      'Monitoring schedule varies by patient baseline ANC and BEN status',
      'General population: weekly ANC x 6 months, biweekly x 6 months, then monthly',
      'Benign Ethnic Neutropenia (BEN) patients: modified ANC thresholds',
    ],
    yearEstablished: 2015,
  },
  {
    programName: 'Mifepristone REMS (Mifeprex)',
    drugNames: ['mifepristone (Mifeprex)'],
    elements: ['etasu', 'implementation_system'],
    keyFeatures: [
      'Must be dispensed in healthcare settings (clinics, medical offices, hospitals)',
      'Prescriber must be certified',
      'Patient must sign Patient Agreement Form',
      'Not dispensed through retail pharmacies (as of original REMS — subsequently modified)',
      'Follow-up assessment to confirm complete termination of pregnancy',
    ],
    yearEstablished: 2011,
  },
  {
    programName: 'Addyi REMS Program',
    drugNames: ['flibanserin (Addyi)'],
    elements: ['communication_plan', 'etasu'],
    keyFeatures: [
      'Prescriber certification required — must counsel on risks of hypotension and syncope with alcohol',
      'Pharmacy certification required',
      'Patients must be counseled about interaction with alcohol',
      'Limited distribution through certified pharmacies',
    ],
    yearEstablished: 2015,
  },
  {
    programName: 'Thalomid/Revlimid/Pomalyst REMS',
    drugNames: ['thalidomide (Thalomid)', 'lenalidomide (Revlimid)', 'pomalidomide (Pomalyst)'],
    elements: ['medication_guide', 'communication_plan', 'etasu', 'implementation_system'],
    keyFeatures: [
      'Prescriber enrollment and agreement to comply with REMS requirements',
      'Patient enrollment — females of reproductive potential have additional requirements',
      'Pregnancy testing protocol similar to iPLEDGE',
      'Two forms of contraception required for females of reproductive potential',
      'Counseling on venous thromboembolism risk (lenalidomide, pomalidomide)',
      'Monthly surveys for prescribers regarding patient compliance',
      'Limited dispensing: maximum 28-day supply, no telephone prescriptions, no automatic refills',
    ],
    yearEstablished: 2005,
  },
];

/** ETASU Sub-Elements */
export const ETASU_ELEMENTS: ETASUDetail[] = [
  {
    subElement: 'Prescriber Certification/Enrollment',
    description: 'Healthcare providers must be specially certified or enrolled in the REMS program before prescribing the drug. May require passing a knowledge assessment or completing training.',
    examples: ['iPLEDGE prescriber enrollment', 'Clozapine REMS prescriber certification', 'TIRF REMS prescriber knowledge assessment'],
  },
  {
    subElement: 'Pharmacy Certification/Enrollment',
    description: 'Pharmacies must be certified or enrolled in the REMS program. May require designated pharmacist training, specific dispensing procedures, or infrastructure requirements.',
    examples: ['iPLEDGE pharmacy enrollment', 'TIRF REMS pharmacy enrollment and knowledge assessment', 'Clozapine REMS pharmacy certification'],
  },
  {
    subElement: 'Patient Enrollment',
    description: 'Patients must be enrolled in the program, often requiring signed acknowledgment forms, informed consent, and agreement to comply with monitoring requirements.',
    examples: ['iPLEDGE patient registration and qualification', 'Clozapine patient enrollment', 'Thalomid REMS patient survey'],
  },
  {
    subElement: 'Safe Use Conditions',
    description: 'Specific clinical conditions that must be verified before or during prescribing, such as laboratory tests, imaging, pregnancy testing, or clinical assessments.',
    examples: ['ANC monitoring (clozapine)', 'Pregnancy testing (iPLEDGE, Thalomid REMS)', 'Liver function test monitoring (bosentan REMS)'],
  },
  {
    subElement: 'Monitoring Requirements',
    description: 'Ongoing clinical monitoring requirements that must be completed as a condition of continued prescribing/dispensing.',
    examples: ['Monthly ANC checks (clozapine)', 'Monthly pregnancy tests (isotretinoin)', 'Cardiac monitoring (certain kinase inhibitors)'],
  },
  {
    subElement: 'Restricted Distribution',
    description: 'Drug may only be dispensed through specific pharmacies, healthcare settings, or distribution channels rather than through all pharmacies.',
    examples: ['Mifepristone — healthcare setting dispensing only', 'Addyi — certified pharmacies only', 'TIRF products — enrolled pharmacies/prescribers only'],
  },
];

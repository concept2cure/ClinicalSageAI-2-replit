/**
 * Device Profile Defaults
 *
 * This module provides pre-filled device profiles for different device classes and therapeutic areas
 * to facilitate testing and demonstration of the 510(k) workflow.
 */

import { createNewDeviceProfile } from './deviceProfileUtils';

// Device profile collection organized by class and therapeutic area with real commercial devices
export const deviceProfiles = {
  // Class I Devices (Low Risk)
  classI: {
    generalSurgery: {
      id: 'class1-surgery-1',
      deviceName: 'Bard-Parker® Sterile Scalpel with Handle',
      manufacturer: 'Becton, Dickinson and Company (BD)',
      intendedUse: 'Precise incision and dissection of tissue during surgical procedures',
      deviceType: 'Surgical Cutting Instrument',
      regulatoryClass: 'I',
      productCode: 'GES',
      submissionType: 'Traditional',
      reviewPanel: 'General & Plastic Surgery',
      indications:
        'For use in general surgical procedures requiring precise cutting and dissection of soft tissue',
      contraindications: 'Not intended for cutting bone or hard tissue',
      classification: {
        riskLevel: 'Low',
        deviceClass: 'I',
        regulatoryPathway: '510(k)',
        productCodeName: 'Scalpel, Manual Surgical Instrument',
        regulationNumber: '878.4800',
      },
      technicalSpecifications: {
        dimensions: '5.75 x 0.5 x 0.2 inches',
        weight: '0.8 oz',
        materials: 'Surgical-grade stainless steel blade, polypropylene handle',
        sterilization: 'Provided sterile, single-use',
        shelfLife: '5 years',
        packaging: 'Individual sterile peel-pack',
        bladeSize: '#10 (standard), also available in sizes #11, #15, #20, #23',
        handle: 'Size 3 (standard), also available in size 4',
        k510Number: 'K823456',
        previousGenerationDevice: 'Bard-Parker® Classic Scalpel',
      },
      marketStatus: {
        yearIntroduced: 2019,
        currentlyMarketed: true,
        annualUnits: 1200000,
        recalled: false,
      },
      testing: {
        biocompatibility: 'ISO 10993-1 compliant',
        sterilizationValidation: 'ISO 11137-2 compliant',
        sharpnessValidation: 'ASTM F3172-21 compliant',
      },
    },
    generalHospital: {
      id: 'class1-hospital-1',
      deviceName: 'Welch Allyn Green Series 600 Examination Light',
      manufacturer: 'Hillrom (Welch Allyn)',
      intendedUse: 'Illumination of the patient examination area in clinical settings',
      deviceType: 'Medical Examination Lamp',
      regulatoryClass: 'I',
      productCode: 'FQP',
      submissionType: 'Traditional',
      reviewPanel: 'General Hospital',
      indications:
        'For use in clinical examination areas to provide adequate illumination for patient assessment',
      contraindications: 'Not intended for surgical illumination or diagnostic imaging',
      classification: {
        riskLevel: 'Low',
        deviceClass: 'I',
        regulatoryPathway: '510(k)',
        productCodeName: 'Lamp, Examination, Medical',
        regulationNumber: '880.6320',
      },
      technicalSpecifications: {
        dimensions: '43-inch flexible arm with 9-inch illumination head',
        weight: '6.2 lbs',
        powerSource: 'AC power, 100-240V, 50-60 Hz',
        illumination: '50,000 lux at 16 inches (40 cm)',
        colorTemperature: '4000K (neutral white)',
        lifespan: '50,000 hours LED life',
        mounting: 'Table/desk mount, wall mount, or mobile stand options',
        adjustability: '360° head rotation, flexible arm',
        k510Number: 'K112680',
        previousGenerationDevice: 'Welch Allyn Green Series 300 Examination Light',
      },
      marketStatus: {
        yearIntroduced: 2018,
        currentlyMarketed: true,
        annualUnits: 35000,
        recalled: false,
      },
      testing: {
        electrical: 'IEC 60601-1 compliant',
        emissions: 'FCC Class B compliant',
        photobiological: 'IEC 62471 compliant for eye and skin safety',
      },
    },
    dental: {
      id: 'class1-dental-1',
      deviceName: 'Dentsply Sirona Midwest Stylus ATC High-Speed Handpiece',
      manufacturer: 'Dentsply Sirona',
      intendedUse: 'High-speed rotary cutting and finishing of teeth and dental materials',
      deviceType: 'Dental Handpiece',
      regulatoryClass: 'I',
      productCode: 'EFB',
      submissionType: 'Traditional',
      reviewPanel: 'Dental',
      indications:
        'For use in general dentistry procedures requiring high-speed cutting, including cavity preparation and crown trimming',
      contraindications: 'None known when used as directed',
      classification: {
        riskLevel: 'Low',
        deviceClass: 'I',
        regulatoryPathway: '510(k)',
        productCodeName: 'Handpiece, Air-Powered, Dental',
        regulationNumber: '872.4200',
      },
      technicalSpecifications: {
        dimensions: '5.5 inches (length) x 0.5 inches (head diameter)',
        weight: '2.0 oz',
        materials: 'Titanium housing, stainless steel components',
        operatingSpeed: '400,000 RPM',
        coolingSystem: 'Quad-port water spray',
        connection: 'Midwest 4/5-line configuration',
        airPressure: '35-40 PSI operating pressure',
        autoClavable: 'Yes, up to 135°C',
        warranty: '2 years',
        k510Number: 'K072192',
        previousGenerationDevice: 'Midwest Tradition Handpiece',
      },
      marketStatus: {
        yearIntroduced: 2016,
        currentlyMarketed: true,
        annualUnits: 85000,
        recalled: false,
      },
      testing: {
        sterilization: 'ISO 17665-1 compliant for steam sterilization validation',
        durability: 'ANSI/ADA Standard No. 58 compliant',
        performance: 'ISO 14457 compliant for speed and torque',
      },
    },
  },

  // Class II Devices (Moderate Risk)
  classII: {
    cardiovascular: {
      id: 'class2-cardio-1',
      deviceName: 'Philips IntelliVue MX750 Patient Monitor',
      manufacturer: 'Philips Healthcare',
      intendedUse: 'Continuous monitoring of physiological parameters in clinical settings',
      deviceType: 'Patient Monitor',
      regulatoryClass: 'II',
      productCode: 'DRT',
      submissionType: 'Traditional',
      reviewPanel: 'Cardiovascular',
      indications:
        'For use in hospitals, clinics, and transport settings to monitor multiple physiological parameters in patients of all ages',
      contraindications:
        'Not for home use without appropriate clinical supervision. Not MRI compatible.',
      classification: {
        riskLevel: 'Moderate',
        deviceClass: 'II',
        regulatoryPathway: '510(k)',
        productCodeName: 'Monitor, Physiological, Patient (with arrhythmia detection)',
        regulationNumber: '870.2300',
      },
      technicalSpecifications: {
        dimensions: '15.7 x 13.5 x 3.8 inches (399 x 343 x 96 mm)',
        weight: '13.9 lbs (6.3 kg) with battery',
        display: '15-inch color LCD touchscreen, 1024 x 768 resolution',
        powerSource: 'AC power with 3-hour rechargeable battery backup',
        parameters: 'ECG (12-lead), SpO2, NIBP, IBP, EtCO2, temperature, respiration',
        connectivity: 'Wired Ethernet, Wi-Fi, Bluetooth, HL7 interface',
        dataStorage: '48 hours of continuous recording, network storage',
        alarmSystem: 'Three-tier priority alarm system with customizable thresholds',
        k510Number: 'K201456',
        previousGenerationDevice: 'Philips IntelliVue MX700',
      },
      marketStatus: {
        yearIntroduced: 2020,
        currentlyMarketed: true,
        annualUnits: 28000,
        recalled: false,
      },
      testing: {
        electrical: 'IEC 60601-1, IEC 60601-1-2, IEC 60601-2-27 compliant',
        accuracyECG: 'Heart rate accuracy ±1% or ±1 bpm, whichever is greater',
        accuracySpO2: '±2% in range of 70-100%, ±3% in range of 50-69%',
        accuracyNIBP: '±3 mmHg or ±2%, whichever is greater',
        clinicalValidation: 'Multi-center comparison with predicate devices',
      },
    },
    clinicalChemistry: {
      id: 'class2-chemistry-1',
      deviceName: 'Medtronic MiniMed 780G Insulin Pump System',
      manufacturer: 'Medtronic',
      intendedUse: 'Continuous subcutaneous insulin delivery for management of diabetes mellitus',
      deviceType: 'Insulin Pump',
      regulatoryClass: 'II',
      productCode: 'LZG',
      submissionType: 'Traditional',
      reviewPanel: 'Clinical Chemistry',
      indications:
        'For use in patients with type 1 diabetes mellitus who require insulin as well as for patients with insulin-requiring type 2 diabetes',
      contraindications:
        'Not for use with non-insulin medications. Not MRI compatible. Not for use in patients under age 7.',
      classification: {
        riskLevel: 'Moderate',
        deviceClass: 'II',
        regulatoryPathway: '510(k)',
        productCodeName: 'Pump, Infusion, Insulin',
        regulationNumber: '880.5725',
      },
      technicalSpecifications: {
        dimensions: '2.1 x 3.3 x 0.6 inches (53.6 x 83.3 x 15.3 mm)',
        weight: '3.0 oz (85 g) with battery and empty reservoir',
        reservoir: '300-unit insulin reservoir',
        basalDelivery: 'Programmable 0.025-35 U/hr, 24 patterns',
        bolusDelivery: 'Programmable 0.025-25 U, extended and dual-wave options',
        waterproofing: 'IPX8 (immersion up to 12 feet/3.6m for 24 hours)',
        connectivity: 'Bluetooth, integrated with CGM system',
        batteryLife: 'Up to 14 days with AAA alkaline battery',
        displayType: 'Full-color LCD screen with LED backlight',
        k510Number: 'K201968',
        previousGenerationDevice: 'Medtronic MiniMed 670G',
      },
      marketStatus: {
        yearIntroduced: 2021,
        currentlyMarketed: true,
        annualUnits: 120000,
        recalled: false,
      },
      testing: {
        accuracy: 'Delivery accuracy ±5% under normal conditions',
        occlusion: 'Occlusion detection typically within 2.23 units at 1 U/hr',
        electrical: 'IEC 60601-1, IEC 60601-1-2, IEC 60601-2-24 compliant',
        software: 'IEC 62304 compliance with level C classification',
        algorithmPerformance:
          'Auto Mode demonstrated 71% time in target glucose range (70-180 mg/dL)',
      },
    },
    neurology: {
      id: 'class2-neuro-1',
      deviceName: 'Natus Quantum Amplifier with NeuroWorks Software',
      manufacturer: 'Natus Medical Incorporated',
      intendedUse: 'Acquisition, display, storage and archiving of electrophysiological signals',
      deviceType: 'Electroencephalograph',
      regulatoryClass: 'II',
      productCode: 'GWQ',
      submissionType: 'Traditional',
      reviewPanel: 'Neurology',
      indications:
        'For use in clinical and research settings to record, monitor, and analyze electrical activity of the brain and to aid in diagnosis of neurological disorders',
      contraindications:
        'Not for use in MRI environments. Not for home use without clinical supervision.',
      classification: {
        riskLevel: 'Moderate',
        deviceClass: 'II',
        regulatoryPathway: '510(k)',
        productCodeName: 'Electroencephalograph',
        regulationNumber: '882.1400',
      },
      technicalSpecifications: {
        dimensions: '14.0 x 9.25 x 3.0 inches (35.6 x 23.5 x 7.6 cm)',
        weight: '4.85 lbs (2.2 kg)',
        channels: 'Up to 256 referential channels',
        samplingRate: '16 kHz maximum per channel',
        resolution: '24-bit ADC',
        inputImpedance: '>1500 MΩ',
        connectivity: 'TCP/IP Ethernet connection to acquisition PC',
        cmrr: '>110 dB at 60 Hz',
        softwareFeatures: 'Spike and seizure detection, spectral analysis, source localization',
        dataStorage: 'Network server storage with RAID configuration',
        k510Number: 'K163645',
        previousGenerationDevice: 'Natus Quantum LTM',
      },
      marketStatus: {
        yearIntroduced: 2019,
        currentlyMarketed: true,
        annualUnits: 3500,
        recalled: false,
      },
      testing: {
        electrical: 'IEC 60601-1, IEC 60601-1-2, IEC 60601-2-26 compliant',
        performance: 'ANSI/AAMI EC11 compliant for diagnostic electrocardiographs',
        software: 'IEC 62304 compliance with level B classification',
        clinicalValidation: 'Comparative study against reference EEG systems',
      },
    },
    radiology: {
      id: 'class2-radiology-1',
      deviceName: 'GE Healthcare Optima XR240amx Mobile X-ray System',
      manufacturer: 'GE Healthcare',
      intendedUse: 'Mobile diagnostic radiographic imaging of anatomical structures',
      deviceType: 'Mobile X-ray System',
      regulatoryClass: 'II',
      productCode: 'IZL',
      submissionType: 'Traditional',
      reviewPanel: 'Radiology',
      indications:
        'For use in various clinical settings where mobility is required for diagnostic radiographic procedures',
      contraindications: 'Not for mammographic procedures or fluoroscopy',
      classification: {
        riskLevel: 'Moderate',
        deviceClass: 'II',
        regulatoryPathway: '510(k)',
        productCodeName: 'Stationary X-ray System',
        regulationNumber: '892.1680',
      },
      technicalSpecifications: {
        dimensions: '56.9 x 27.6 x 82.3 inches (144.4 x 70.1 x 209.0 cm)',
        weight: '1120 lbs (508 kg)',
        detector: 'Digital flat panel detector, 16 x 17 inches (41 x 43 cm)',
        powerOutput: '32 kW maximum',
        kVpRange: '40-150 kVp',
        mARange: '0.5-320 mA',
        battery: 'Up to 10 hours of normal operation, 40+ exams on single charge',
        display: '19-inch color touchscreen monitor',
        wirelessCapability: 'Wi-Fi, DICOM 3.0 compliant',
        motorizedDrive: 'Variable speed, front-wheel drive with obstacle detection',
        k510Number: 'K193542',
        previousGenerationDevice: 'GE Optima XR220amx',
      },
      marketStatus: {
        yearIntroduced: 2020,
        currentlyMarketed: true,
        annualUnits: 1200,
        recalled: false,
      },
      testing: {
        radiation: 'Compliance with 21 CFR 1020.30-32 performance standards',
        electrical: 'IEC 60601-1, IEC 60601-1-2, IEC 60601-2-54 compliant',
        imaging: 'IEC 62220-1 compliance for DQE and MTF measurements',
        safety: 'IEC 60601-1-3 compliance for radiation protection',
      },
    },
  },

  // Class III Devices (High Risk)
  classIII: {
    cardiovascular: {
      id: 'class3-cardio-1',
      deviceName: 'Boston Scientific EMBLEM S-ICD System',
      manufacturer: 'Boston Scientific Corporation',
      intendedUse: 'Defibrillation therapy for life-threatening ventricular tachyarrhythmias',
      deviceType: 'Subcutaneous Implantable Cardioverter Defibrillator',
      regulatoryClass: 'III',
      productCode: 'MVK',
      submissionType: 'PMA',
      reviewPanel: 'Cardiovascular',
      indications:
        'For patients at risk for sudden cardiac death due to ventricular tachyarrhythmias who do not have symptomatic bradycardia, incessant ventricular tachycardia, or spontaneous, frequently recurring ventricular tachycardia that is reliably terminated with anti-tachycardia pacing',
      contraindications:
        'Patients with unipolar pacemakers, patients unable to tolerate the position required for defibrillation testing, patients with existing unipolar pacemakers',
      classification: {
        riskLevel: 'High',
        deviceClass: 'III',
        regulatoryPathway: 'PMA',
        productCodeName: 'Defibrillator, Implantable, Subcutaneous Electrode',
        regulationNumber: '870.3670',
      },
      technicalSpecifications: {
        dimensions: '3.17 x 2.6 x 0.85 inches (80.5 x 65.5 x 12.7 mm)',
        weight: '4.2 oz (130 g)',
        powerSource: 'Non-rechargeable lithium-silver vanadium oxide battery',
        batteryLife: 'Approximately 7.3 years at baseline settings',
        leadConfiguration: 'Subcutaneous electrode, no transvenous leads',
        shockEnergy: 'Maximum 80 joules',
        sensing: 'Automatic vectoring, SMART Pass sensing filter',
        mriCompatibility: 'MR Conditional at 1.5T',
        telemetry: 'LATITUDE NXT Remote Patient Management, Bluetooth',
        pmaNumber: 'P110042/S085',
        previousGenerationDevice: 'Boston Scientific EMBLEM MRI S-ICD',
      },
      marketStatus: {
        yearIntroduced: 2018,
        currentlyMarketed: true,
        annualUnits: 42000,
        recalled: false,
      },
      testing: {
        electrical: 'IEC 60601-1, IEC 60601-1-2, IEC 60601-2-4 compliant',
        clinicalEfficacy:
          'Detect and convert VF >98% of the time, first-shock success rate of 90.1%',
        biocompatibility: 'ISO 10993-1 compliance for all patient-contacting materials',
        longevity: 'Accelerated life testing demonstrating >99% reliability at 5 years',
      },
    },
    orthopedic: {
      id: 'class3-ortho-1',
      deviceName: 'Medtronic Infuse Bone Graft/LT-CAGE Lumbar Tapered Fusion Device',
      manufacturer: 'Medtronic Sofamor Danek',
      intendedUse: 'Spinal fusion assistance for degenerative disc disease treatment',
      deviceType: 'Spinal Fusion Stimulator',
      regulatoryClass: 'III',
      productCode: 'MQP',
      submissionType: 'PMA',
      reviewPanel: 'Orthopedic',
      indications:
        'For spinal fusion procedures in skeletally mature patients with degenerative disc disease (DDD) at one level from L4-S1',
      contraindications:
        'Patients with known hypersensitivity to rhBMP-2 or bovine Type I collagen, pregnancy, active infection at operative site, inadequate bone quality',
      classification: {
        riskLevel: 'High',
        deviceClass: 'III',
        regulatoryPathway: 'PMA',
        productCodeName: 'Stimulator, Morphogenetic Protein, Bone Growth',
        regulationNumber: '888.3353',
      },
      technicalSpecifications: {
        dimensions: 'Multiple cage sizes from 26-32mm length, 8-18mm height',
        materials: 'Titanium alloy cage, absorbable collagen sponge with rhBMP-2',
        loadBearing: 'Capable of supporting axial loads up to 15,000N',
        rhBMP2Dose:
          'Available in small kit (4.2mg), medium kit (8.4mg), large kit (12mg) configurations',
        imaging: 'Radiolucent with tantalum markers for radiographic visualization',
        sterilization: 'Provided sterile via gamma irradiation',
        instrumentation: 'Compatible with specified instruments for preparation and insertion',
        implantFeatures: 'Self-distraction, tapered design for stability',
        pmaNumber: 'P000058',
        previousGenerationDevice: 'Medtronic LT-Cage without Infuse',
      },
      marketStatus: {
        yearIntroduced: 2002,
        currentlyMarketed: true,
        annualUnits: 65000,
        recalled: false,
      },
      testing: {
        mechanical:
          'ASTM F2077 for static and dynamic compression, ASTM F1717 for compression bending',
        preclinical: 'Non-human primate studies demonstrating fusion efficacy and safety',
        clinical: 'Pivotal trial showing 94.5% fusion success rate at 24 months',
        biocompatibility: 'ISO 10993-1 compliance for all implanted materials',
      },
    },
    ophthalmic: {
      id: 'class3-ophthalmic-1',
      deviceName: 'Johnson & Johnson CATALYS Precision Laser System',
      manufacturer: 'Johnson & Johnson Vision (formerly Abbott Medical Optics)',
      intendedUse:
        'Precise laser-assisted capsulotomy, lens fragmentation, corneal incisions for cataract surgery',
      deviceType: 'Femtosecond Laser for Ophthalmology',
      regulatoryClass: 'III',
      productCode: 'OOE',
      submissionType: 'PMA',
      reviewPanel: 'Ophthalmic',
      indications:
        'For creation of anterior capsulotomy, phacofragmentation of the lens, corneal incisions in patients undergoing cataract surgery or lens replacement',
      contraindications:
        'Patients with corneal disease or opacity, glaucoma, severe dry eye, or other conditions preventing adequate docking',
      classification: {
        riskLevel: 'High',
        deviceClass: 'III',
        regulatoryPathway: 'PMA',
        productCodeName: 'Laser, Femtosecond, For Ophthalmology',
        regulationNumber: '886.4390',
      },
      technicalSpecifications: {
        dimensions: '70.8 x 40.2 x 70.8 inches (system console and articulating arm)',
        weight: '1100 lbs (500 kg)',
        laserType: 'Diode-pumped solid-state laser',
        wavelength: '1030 nm',
        pulseEnergy: '≤ 10 μJ',
        pulseRate: '120 kHz',
        spotSize: '<5 μm',
        imaging: 'Integrated 3D OCT for real-time guidance',
        patientInterface: 'Liquid optics with automated docking',
        treatmentTime: 'Typically 2-3 minutes per procedure',
        pmaNumber: 'P110012',
        previousGenerationDevice: 'OptiMedica CATALYS Precision Laser System',
      },
      marketStatus: {
        yearIntroduced: 2016,
        currentlyMarketed: true,
        annualUnits: 550,
        recalled: false,
      },
      testing: {
        laserSafety: 'IEC 60825-1 compliance for laser product safety',
        electrical: 'IEC 60601-1, IEC 60601-1-2 compliant',
        software: 'IEC 62304 compliance with class C classification',
        clinical:
          'Clinical studies demonstrating capsulotomy precision within ±125 μm of intended diameter',
      },
    },
  },
};

/**
 * Create a device profile from the pre-filled profile template
 * @param {string} deviceClass - 'classI', 'classII', or 'classIII'
 * @param {string} therapeuticArea - The therapeutic area key
 * @param {string} documentId - The document ID to use for the profile
 * @returns {Object} A complete device profile
 */
export function createProfileFromTemplate(deviceClass, therapeuticArea, documentId) {
  // Validate inputs
  if (!deviceProfiles[deviceClass]) {
    throw new Error(`Invalid device class: ${deviceClass}`);
  }

  if (!deviceProfiles[deviceClass][therapeuticArea]) {
    throw new Error(`Invalid therapeutic area for ${deviceClass}: ${therapeuticArea}`);
  }

  // Get the template
  const template = deviceProfiles[deviceClass][therapeuticArea];

  // Create a new profile with the template data
  return createNewDeviceProfile({
    id: documentId || template.id,
    deviceName: template.deviceName,
    manufacturer: template.manufacturer,
    intendedUse: template.intendedUse,
    deviceType: template.deviceType,
    regulatoryClass: template.regulatoryClass,
    productCode: template.productCode,
    submissionType: template.submissionType,
    reviewPanel: template.reviewPanel,
    indications: template.indications,
    contraindications: template.contraindications,
    classification: template.classification,
    technicalSpecifications: template.technicalSpecifications,
  });
}

/**
 * Get all available device profile templates as a flat array
 * @returns {Array} Array of device profile templates
 */
export function getAllProfileTemplates() {
  const templates = [];

  Object.keys(deviceProfiles).forEach(deviceClass => {
    Object.keys(deviceProfiles[deviceClass]).forEach(area => {
      templates.push({
        id: deviceProfiles[deviceClass][area].id,
        deviceName: deviceProfiles[deviceClass][area].deviceName,
        deviceClass: deviceClass.replace('class', ''),
        therapeuticArea: area,
        manufacturer: deviceProfiles[deviceClass][area].manufacturer,
        productCode: deviceProfiles[deviceClass][area].productCode,
        template: `${deviceClass}-${area}`,
      });
    });
  });

  return templates;
}

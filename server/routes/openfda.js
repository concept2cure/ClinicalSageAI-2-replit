/**
 * OpenFDA API Routes
 *
 * This module provides API endpoints to interact with the FDA's open data:
 * - /api/openfda/events: Search for adverse events related to drugs/devices
 * - /api/openfda/labels: Get drug or device labels
 * - /api/openfda/recalls: Search for recalls
 */

import express from 'express';
import { OpenAI } from 'openai';

const router = express.Router();

// Initialize OpenAI client for AI-enhanced summarization
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * @route GET /api/openfda/events
 * @description Search FDA adverse events by drug/device name
 * @param {string} drug - Drug name to search
 * @param {string} device - Device name to search
 * @param {number} limit - Maximum results to return (default: 10)
 * @returns {Array} Array of adverse event objects
 */
router.get('/events', async (req, res) => {
  try {
    const { drug, device, limit = 10 } = req.query;

    if (!drug && !device) {
      return res.status(400).json({ error: 'Either drug or device parameter is required' });
    }

    const searchTerm = drug || device;
    const searchType = drug ? 'drug' : 'device';

    // In production, this would call the actual FDA API
    // const fdaUrl = `https://api.fda.gov/drug/event.json?search=${encodeURIComponent(searchTerm)}&limit=${limit}`;
    // const response = await fetch(fdaUrl);
    // const data = await response.json();

    // For development, return mock data based on the query
    console.log(`[OpenFDA] Mock search for ${searchType}: ${searchTerm}`);

    // Generate deterministic results based on the search term
    const mockResults = generateMockAdverseEvents(searchTerm, parseInt(limit), searchType);

    res.json({
      success: true,
      searchTerm,
      searchType,
      results: mockResults,
    });
  } catch (error) {
    console.error('Error searching FDA events:', error);
    res.status(500).json({ error: 'Failed to search FDA events' });
  }
});

/**
 * @route GET /api/openfda/labels
 * @description Get drug or device labels from FDA
 * @param {string} drug - Drug name to search
 * @param {string} device - Device name to search
 * @returns {Object} Label information
 */
router.get('/labels', async (req, res) => {
  try {
    const { drug, device } = req.query;

    if (!drug && !device) {
      return res.status(400).json({ error: 'Either drug or device parameter is required' });
    }

    const searchTerm = drug || device;
    const searchType = drug ? 'drug' : 'device';

    // In production, this would call the actual FDA API
    // const fdaUrl = drug
    //   ? `https://api.fda.gov/drug/label.json?search=openfda.brand_name:${encodeURIComponent(searchTerm)}`
    //   : `https://api.fda.gov/device/510k.json?search=device_name:${encodeURIComponent(searchTerm)}`;
    // const response = await fetch(fdaUrl);
    // const data = await response.json();

    // For development, return mock label data
    console.log(`[OpenFDA] Mock label search for ${searchType}: ${searchTerm}`);

    const mockLabel = generateMockLabel(searchTerm, searchType);

    res.json({
      success: true,
      searchTerm,
      searchType,
      label: mockLabel,
    });
  } catch (error) {
    console.error('Error fetching FDA label:', error);
    res.status(500).json({ error: 'Failed to fetch FDA label' });
  }
});

/**
 * @route GET /api/openfda/recalls
 * @description Search for FDA recalls
 * @param {string} drug - Drug name to search
 * @param {string} device - Device name to search
 * @param {number} limit - Maximum results to return (default: 10)
 * @returns {Array} Array of recall objects
 */
router.get('/recalls', async (req, res) => {
  try {
    const { drug, device, limit = 10 } = req.query;

    if (!drug && !device) {
      return res.status(400).json({ error: 'Either drug or device parameter is required' });
    }

    const searchTerm = drug || device;
    const searchType = drug ? 'drug' : 'device';

    // In production, this would call the actual FDA API
    // const fdaUrl = drug
    //   ? `https://api.fda.gov/drug/enforcement.json?search=openfda.brand_name:${encodeURIComponent(searchTerm)}&limit=${limit}`
    //   : `https://api.fda.gov/device/enforcement.json?search=product_description:${encodeURIComponent(searchTerm)}&limit=${limit}`;
    // const response = await fetch(fdaUrl);
    // const data = await response.json();

    // For development, return mock recall data
    console.log(`[OpenFDA] Mock recall search for ${searchType}: ${searchTerm}`);

    const mockRecalls = generateMockRecalls(searchTerm, parseInt(limit), searchType);

    res.json({
      success: true,
      searchTerm,
      searchType,
      recalls: mockRecalls,
    });
  } catch (error) {
    console.error('Error searching FDA recalls:', error);
    res.status(500).json({ error: 'Failed to search FDA recalls' });
  }
});

/**
 * Generate mock adverse events based on search term
 */
function generateMockAdverseEvents(searchTerm, limit, type) {
  const searchHash = hashString(searchTerm); // Get a deterministic hash from the search term

  const events = [];
  for (let i = 0; i < limit; i++) {
    const reportId = `FDA-${type.toUpperCase()}-${(searchHash % 1000000) + i}`;
    const severity = i % 3 === 0 ? 'Mild' : i % 3 === 1 ? 'Moderate' : 'Severe';

    let eventText;
    if (type === 'drug') {
      const reactions = [
        'Headache',
        'Nausea',
        'Dizziness',
        'Fatigue',
        'Skin rash',
        'Vomiting',
        'Diarrhea',
        'Insomnia',
        'Anxiety',
        'Allergic reaction',
      ];
      eventText = reactions[i % reactions.length];
    } else {
      const reactions = [
        'Local inflammation',
        'Device malfunction',
        'Unintended tissue damage',
        'Infection at insertion site',
        'Excessive bleeding',
        'Pain at device site',
        'Migration of device',
        'Electrical interference',
        'System failure',
        'Biocompatibility reaction',
      ];
      eventText = reactions[i % reactions.length];
    }

    events.push({
      report_id: reportId,
      event_date: getRandomDate(2019, 2024),
      product_name: capitalizeName(searchTerm),
      manufacturer: getManufacturerByHash(searchHash + i),
      event_description: `Patient experienced ${eventText.toLowerCase()} after ${type === 'drug' ? 'taking' : 'using'} ${capitalizeName(searchTerm)}.`,
      patient_outcome:
        severity === 'Severe'
          ? 'Hospitalization'
          : severity === 'Moderate'
            ? 'Outpatient treatment'
            : 'No intervention required',
      severity,
    });
  }

  return events;
}

/**
 * Generate a mock label for a drug or device
 */
function generateMockLabel(name, type) {
  const nameHash = hashString(name);

  if (type === 'drug') {
    return {
      brand_name: capitalizeName(name),
      generic_name: name.toLowerCase() + 'um',
      manufacturer: getManufacturerByHash(nameHash),
      ndc: `${nameHash % 100}-${nameHash % 1000}-${nameHash % 10}`,
      dosage_form: nameHash % 2 === 0 ? 'Tablet' : 'Capsule',
      route: 'Oral',
      indications_and_usage: `${capitalizeName(name)} is indicated for the treatment of patients with ${getConditionByHash(nameHash)}.`,
      contraindications: `Hypersensitivity to ${name.toLowerCase()} or any component of the formulation.`,
      warnings: `Patients should be monitored for signs of ${nameHash % 2 === 0 ? 'liver toxicity' : 'kidney dysfunction'}.`,
      adverse_reactions: ['Headache (10%)', 'Nausea (8%)', 'Dizziness (5%)', 'Fatigue (3%)'],
      drug_interactions: `May interact with ${nameHash % 2 === 0 ? 'CYP3A4 inhibitors' : 'P-glycoprotein substrates'}.`,
    };
  } else {
    return {
      device_name: capitalizeName(name),
      manufacturer: getManufacturerByHash(nameHash),
      model_number: `${name.substring(0, 3).toUpperCase()}-${nameHash % 1000}`,
      device_class: nameHash % 3 === 0 ? 'I' : nameHash % 3 === 1 ? 'II' : 'III',
      regulation_number: `${nameHash % 100}.${nameHash % 1000}`,
      intended_use: `${capitalizeName(name)} is intended for use in patients with ${getConditionByHash(nameHash)}.`,
      contraindications: `Use of the device is contraindicated in patients with ${nameHash % 2 === 0 ? 'known allergies to device materials' : 'certain anatomical abnormalities'}.`,
      warnings: `The device should not be used in ${nameHash % 2 === 0 ? 'MRI environments' : 'conjunction with high-frequency surgical equipment'}.`,
      adverse_events: [
        'Local inflammation (5%)',
        'Infection at insertion site (2%)',
        'Device migration (1%)',
        'Pain at device site (3%)',
      ],
    };
  }
}

/**
 * Generate mock recalls based on search term
 */
function generateMockRecalls(searchTerm, limit, type) {
  const searchHash = hashString(searchTerm);

  const recalls = [];
  for (let i = 0; i < limit; i++) {
    // Only generate a few recalls (max 3) to keep it realistic
    if (i >= 3) {
      break;
    }

    const recallId = `Z-${type.charAt(0).toUpperCase()}-${(searchHash % 1000) + i}`;
    const classification = i === 0 ? 'Class I' : i === 1 ? 'Class II' : 'Class III';

    recalls.push({
      recall_number: recallId,
      event_date: getRandomDate(2018, 2024),
      product_name: capitalizeName(searchTerm) + (i > 0 ? ` ${['XR', 'ER', 'Plus'][i - 1]}` : ''),
      manufacturer: getManufacturerByHash(searchHash + i),
      classification,
      reason: getRecallReasonByClass(classification, type),
      status: i === 0 ? 'Ongoing' : 'Terminated',
    });
  }

  return recalls;
}

/**
 * Get a mock manufacturer name
 */
function getManufacturerByHash(hash) {
  const manufacturers = [
    'MediCore Inc.',
    'HealthTech Pharmaceuticals',
    'Biogen Solutions',
    'PharmaTrust',
    'NovoHealth',
    'MedicalEdge Systems',
    'Johnson Medical',
    'Pacific Devices',
    'Eastern Pharma',
    'United Medical Technologies',
  ];

  return manufacturers[hash % manufacturers.length];
}

/**
 * Get a mock medical condition
 */
function getConditionByHash(hash) {
  const conditions = [
    'hypertension',
    'diabetes mellitus',
    'chronic pain',
    'rheumatoid arthritis',
    'coronary artery disease',
    'asthma',
    'depression',
    'chronic kidney disease',
    'atrial fibrillation',
    'congestive heart failure',
    'osteoporosis',
    'epilepsy',
  ];

  return conditions[hash % conditions.length];
}

/**
 * Get a recall reason based on classification
 */
function getRecallReasonByClass(classification, type) {
  if (classification === 'Class I') {
    return type === 'drug'
      ? 'Potential for serious adverse health consequences or death due to contamination'
      : 'Device malfunction may cause serious injury or death';
  } else if (classification === 'Class II') {
    return type === 'drug'
      ? 'Product may cause temporary or medically reversible adverse health consequences'
      : 'Device may cause temporary or reversible health issues';
  } else {
    return type === 'drug'
      ? 'Product is unlikely to cause adverse health consequences but violates FDA regulations'
      : 'Device is unlikely to cause adverse health consequences but fails to meet specifications';
  }
}

/**
 * Get a random date between start year and end year
 */
function getRandomDate(startYear, endYear) {
  const start = new Date(startYear, 0, 1).getTime();
  const end = new Date(endYear, 11, 31).getTime();
  const randomTimestamp = start + (hashString(start + endYear) % (end - start));
  const date = new Date(randomTimestamp);
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

/**
 * Utility function to get a hash code from a string
 */
function hashString(str) {
  if (typeof str === 'number') {
    str = str.toString();
  }

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Capitalize a name properly
 */
function capitalizeName(name) {
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export default router;

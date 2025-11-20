/**
 * Drug Class Service
 *
 * This service provides pharmaceutical class information including
 * similar compounds for comparison when ATC codes or mechanism of action
 * data is not available through FDA API.
 */

// Simplified database of drug classes and their similar compounds
// In a production environment, this would be stored in a database
const drugClassDb = {
  // Anti-inflammatory drugs
  ibuprofen: {
    class: 'NSAID',
    similarityMethod: 'chemical structure',
    similars: ['naproxen', 'diclofenac', 'celecoxib', 'meloxicam', 'ketoprofen'],
  },
  naproxen: {
    class: 'NSAID',
    similarityMethod: 'chemical structure',
    similars: ['ibuprofen', 'diclofenac', 'celecoxib', 'meloxicam', 'ketoprofen'],
  },

  // Antihistamines
  cetirizine: {
    class: 'Antihistamine',
    similarityMethod: 'mechanism of action',
    similars: ['loratadine', 'fexofenadine', 'desloratadine', 'levocetirizine'],
  },
  loratadine: {
    class: 'Antihistamine',
    similarityMethod: 'mechanism of action',
    similars: ['cetirizine', 'fexofenadine', 'desloratadine', 'levocetirizine'],
  },

  // Beta blockers
  metoprolol: {
    class: 'Beta Blocker',
    similarityMethod: 'target receptor',
    similars: ['atenolol', 'propranolol', 'carvedilol', 'bisoprolol'],
  },
  atenolol: {
    class: 'Beta Blocker',
    similarityMethod: 'target receptor',
    similars: ['metoprolol', 'propranolol', 'carvedilol', 'bisoprolol'],
  },

  // ACE inhibitors
  lisinopril: {
    class: 'ACE Inhibitor',
    similarityMethod: 'mechanism of action',
    similars: ['enalapril', 'ramipril', 'captopril', 'benazepril'],
  },
  enalapril: {
    class: 'ACE Inhibitor',
    similarityMethod: 'mechanism of action',
    similars: ['lisinopril', 'ramipril', 'captopril', 'benazepril'],
  },

  // Statins
  atorvastatin: {
    class: 'Statin',
    similarityMethod: 'mechanism of action',
    similars: ['simvastatin', 'rosuvastatin', 'pravastatin', 'lovastatin'],
  },
  simvastatin: {
    class: 'Statin',
    similarityMethod: 'mechanism of action',
    similars: ['atorvastatin', 'rosuvastatin', 'pravastatin', 'lovastatin'],
  },

  // Proton pump inhibitors
  omeprazole: {
    class: 'Proton Pump Inhibitor',
    similarityMethod: 'mechanism of action',
    similars: ['pantoprazole', 'esomeprazole', 'lansoprazole', 'rabeprazole'],
  },
  pantoprazole: {
    class: 'Proton Pump Inhibitor',
    similarityMethod: 'mechanism of action',
    similars: ['omeprazole', 'esomeprazole', 'lansoprazole', 'rabeprazole'],
  },

  // Antidepressants - SSRIs
  fluoxetine: {
    class: 'SSRI Antidepressant',
    similarityMethod: 'mechanism of action',
    similars: ['sertraline', 'paroxetine', 'citalopram', 'escitalopram'],
  },
  sertraline: {
    class: 'SSRI Antidepressant',
    similarityMethod: 'mechanism of action',
    similars: ['fluoxetine', 'paroxetine', 'citalopram', 'escitalopram'],
  },

  // Antidiabetics
  metformin: {
    class: 'Biguanide Antidiabetic',
    similarityMethod: 'therapeutic use',
    similars: ['glipizide', 'glyburide', 'sitagliptin', 'pioglitazone', 'rosiglitazone'],
  },
  sitagliptin: {
    class: 'DPP-4 Inhibitor',
    similarityMethod: 'mechanism of action',
    similars: ['saxagliptin', 'linagliptin', 'alogliptin', 'metformin', 'pioglitazone'],
  },

  // ARBs
  losartan: {
    class: 'Angiotensin II Receptor Blocker',
    similarityMethod: 'mechanism of action',
    similars: ['valsartan', 'irbesartan', 'olmesartan', 'candesartan'],
  },
  valsartan: {
    class: 'Angiotensin II Receptor Blocker',
    similarityMethod: 'mechanism of action',
    similars: ['losartan', 'irbesartan', 'olmesartan', 'candesartan'],
  },

  // Sample biologics
  adalimumab: {
    class: 'TNF Inhibitor Biologic',
    similarityMethod: 'target mechanism',
    similars: ['etanercept', 'infliximab', 'certolizumab', 'golimumab'],
  },
  etanercept: {
    class: 'TNF Inhibitor Biologic',
    similarityMethod: 'target mechanism',
    similars: ['adalimumab', 'infliximab', 'certolizumab', 'golimumab'],
  },
};

/**
 * Get drug class information by generic drug name
 *
 * @param {string} drugName - Generic name of the drug (case insensitive)
 * @returns {Object|null} - Drug class information or null if not found
 */
function getDrugClassByName(drugName) {
  if (!drugName) return null;

  // Normalize the drug name for lookup
  const normalizedName = drugName.toLowerCase().trim();

  // Direct lookup
  if (drugClassDb[normalizedName]) {
    return {
      name: normalizedName,
      ...drugClassDb[normalizedName],
    };
  }

  // Partial match (for compound names or slightly different formats)
  for (const [key, value] of Object.entries(drugClassDb)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return {
        name: key,
        ...value,
      };
    }
  }

  return null;
}

/**
 * Find similar drugs by class
 *
 * @param {string} className - Pharmaceutical class name
 * @returns {Array} - Array of similar drugs in that class
 */
function getSimilarDrugsByClass(className) {
  if (!className) return [];

  const normalizedClass = className.toLowerCase().trim();
  const similarDrugs = new Set();

  for (const [drugName, info] of Object.entries(drugClassDb)) {
    if (info.class.toLowerCase() === normalizedClass) {
      similarDrugs.add(drugName);
      info.similars.forEach(similar => similarDrugs.add(similar));
    }
  }

  return Array.from(similarDrugs);
}

/**
 * Get information about a class of drugs
 *
 * @param {string} className - Pharmaceutical class name
 * @returns {Object} - Information about the drug class
 */
function getDrugClassInfo(className) {
  if (!className) return null;

  const normalizedClass = className.toLowerCase().trim();
  const classMembers = [];
  let similarityMethod = null;

  for (const [drugName, info] of Object.entries(drugClassDb)) {
    if (info.class.toLowerCase() === normalizedClass) {
      classMembers.push(drugName);
      if (!similarityMethod) similarityMethod = info.similarityMethod;
    }
  }

  if (classMembers.length === 0) return null;

  return {
    className,
    members: classMembers,
    similarityMethod,
  };
}

// ESM export
export { getDrugClassByName, getSimilarDrugsByClass, getDrugClassInfo };

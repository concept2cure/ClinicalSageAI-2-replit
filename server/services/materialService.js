/**
 * Material Service - Provides functionality for managing material data
 */

import { v4 as uuidv4 } from 'uuid';

// In-memory storage for materials
let materials = [
  {
    id: '1',
    name: 'Microcrystalline Cellulose',
    code: 'MCC-101',
    category: 'Excipient',
    grade: 'Pharmaceutical',
    vendor: 'FMC BioPolymer',
    cas: '9004-34-6',
    specifications: {
      particleSize: '50-100 microns',
      bulkDensity: '0.25-0.37 g/cm³',
      moisture: '<5%',
    },
    storageConditions: 'Store in a cool, dry place',
    expiryPeriod: '60 months',
    certifications: ['USP', 'Ph.Eur', 'JP'],
    lastTested: '2025-03-15',
    batchNumber: 'MCC-23-10289',
    status: 'Available',
    quantity: 250,
    unit: 'kg',
  },
  {
    id: '2',
    name: 'Lactose Monohydrate',
    code: 'LAC-200',
    category: 'Excipient',
    grade: 'Pharmaceutical',
    vendor: 'DFE Pharma',
    cas: '64044-51-5',
    specifications: {
      particleSize: '75-150 microns',
      bulkDensity: '0.5-0.7 g/cm³',
      moisture: '<0.5%',
    },
    storageConditions: 'Store in a cool, dry place away from moisture',
    expiryPeriod: '36 months',
    certifications: ['USP', 'Ph.Eur'],
    lastTested: '2025-02-20',
    batchNumber: 'LAC-23-8734',
    status: 'Available',
    quantity: 500,
    unit: 'kg',
  },
  {
    id: '3',
    name: 'Magnesium Stearate',
    code: 'MAG-ST-450',
    category: 'Excipient',
    grade: 'Pharmaceutical',
    vendor: 'Baerlocher',
    cas: '557-04-0',
    specifications: {
      particleSize: '<10 microns',
      bulkDensity: '0.1-0.2 g/cm³',
      moisture: '<3%',
    },
    storageConditions: 'Store in a tightly closed container',
    expiryPeriod: '48 months',
    certifications: ['USP', 'Ph.Eur', 'JP'],
    lastTested: '2025-01-10',
    batchNumber: 'MAG-23-5671',
    status: 'Available',
    quantity: 50,
    unit: 'kg',
  },
  {
    id: '4',
    name: 'Active Pharmaceutical Ingredient',
    code: 'API-XYZ-10',
    category: 'API',
    grade: 'GMP',
    vendor: 'PharmaChem Inc.',
    cas: '123456-78-9',
    specifications: {
      purity: '>99.5%',
      residualSolvents: 'Meets ICH Q3C',
      moisture: '<0.2%',
    },
    storageConditions: 'Store at 2-8°C in a tightly closed container',
    expiryPeriod: '24 months',
    certifications: ['GMP', 'ICH Q7'],
    lastTested: '2025-04-01',
    batchNumber: 'API-24-0023',
    status: 'Quarantined',
    quantity: 5,
    unit: 'kg',
  },
];

/**
 * Get all materials
 * @param {Object} filters - Optional filters
 * @returns {Array} List of materials
 */
export const getAllMaterials = (filters = {}) => {
  let filteredMaterials = [...materials];

  // Apply filters if provided
  if (filters.category) {
    filteredMaterials = filteredMaterials.filter(m => m.category === filters.category);
  }

  if (filters.vendor) {
    filteredMaterials = filteredMaterials.filter(m => m.vendor === filters.vendor);
  }

  if (filters.status) {
    filteredMaterials = filteredMaterials.filter(m => m.status === filters.status);
  }

  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filteredMaterials = filteredMaterials.filter(
      m =>
        m.name.toLowerCase().includes(searchLower) ||
        m.code.toLowerCase().includes(searchLower) ||
        m.batchNumber.toLowerCase().includes(searchLower)
    );
  }

  return filteredMaterials;
};

/**
 * Get a material by ID
 * @param {string} id - Material ID
 * @returns {Object|null} Material data or null if not found
 */
export const getMaterialById = id => {
  return materials.find(m => m.id === id) || null;
};

/**
 * Create a new material
 * @param {Object} materialData - Material data
 * @returns {Object} Created material
 */
export const createMaterial = materialData => {
  const newMaterial = {
    id: uuidv4(),
    ...materialData,
    createdAt: new Date().toISOString(),
  };

  materials.push(newMaterial);
  return newMaterial;
};

/**
 * Update a material
 * @param {string} id - Material ID
 * @param {Object} materialData - Updated material data
 * @returns {Object|null} Updated material or null if not found
 */
export const updateMaterial = (id, materialData) => {
  const index = materials.findIndex(m => m.id === id);

  if (index === -1) {
    return null;
  }

  const updatedMaterial = {
    ...materials[index],
    ...materialData,
    updatedAt: new Date().toISOString(),
  };

  materials[index] = updatedMaterial;
  return updatedMaterial;
};

/**
 * Delete a material
 * @param {string} id - Material ID
 * @returns {boolean} Success status
 */
export const deleteMaterial = id => {
  const initialLength = materials.length;
  materials = materials.filter(m => m.id !== id);
  return materials.length < initialLength;
};

/**
 * Get material categories
 * @returns {Array} List of unique categories
 */
export const getMaterialCategories = () => {
  const categories = new Set(materials.map(m => m.category));
  return Array.from(categories);
};

/**
 * Update material status
 * @param {string} id - Material ID
 * @param {string} status - New status
 * @returns {Object|null} Updated material or null if not found
 */
export const updateMaterialStatus = (id, status) => {
  const index = materials.findIndex(m => m.id === id);

  if (index === -1) {
    return null;
  }

  materials[index] = {
    ...materials[index],
    status,
    statusUpdatedAt: new Date().toISOString(),
  };

  return materials[index];
};

/**
 * Add test results to a material
 * @param {string} id - Material ID
 * @param {Object} testData - Test results data
 * @returns {Object|null} Updated material or null if not found
 */
export const addMaterialTestResults = (id, testData) => {
  const index = materials.findIndex(m => m.id === id);

  if (index === -1) {
    return null;
  }

  const testResults = materials[index].testResults || [];

  const newTestData = {
    id: uuidv4(),
    ...testData,
    testedAt: new Date().toISOString(),
  };

  materials[index] = {
    ...materials[index],
    testResults: [...testResults, newTestData],
    lastTested: new Date().toISOString(),
  };

  return materials[index];
};

/**
 * Get material inventory stats
 * @returns {Object} Inventory statistics
 */
export const getMaterialInventoryStats = () => {
  return {
    totalMaterials: materials.length,
    totalCategories: new Set(materials.map(m => m.category)).size,
    statusCounts: materials.reduce((acc, curr) => {
      acc[curr.status] = (acc[curr.status] || 0) + 1;
      return acc;
    }, {}),
    lowStock: materials.filter(m => m.quantity < 100).length,
  };
};

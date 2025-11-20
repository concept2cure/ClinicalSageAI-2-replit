/**
 * Vendor Service - Provides functionality for managing vendor data
 */

import { v4 as uuidv4 } from 'uuid';

// In-memory storage for vendors
let vendors = [
  {
    id: '1',
    name: 'FMC BioPolymer',
    code: 'VEN-FMC-001',
    contactPerson: 'John Smith',
    email: 'john.smith@fmcbiopolymer.example.com',
    phone: '+1-555-123-4567',
    address: {
      street: '123 Pharmaceutical Drive',
      city: 'Philadelphia',
      state: 'PA',
      zipCode: '19104',
      country: 'USA',
    },
    website: 'https://www.fmcbiopolymer.example.com',
    categories: ['Excipients', 'Binders'],
    certifications: ['ISO 9001', 'GMP', 'EXCiPACT'],
    qualificationStatus: 'Approved',
    qualifiedDate: '2024-01-15',
    auditHistory: [
      {
        id: 'audit-1',
        date: '2024-01-10',
        type: 'On-site',
        findings: 'No critical findings',
        auditor: 'Quality Team',
        score: 92,
      },
    ],
    performanceMetrics: {
      qualityScore: 95,
      deliveryScore: 90,
      responsivenesScore: 88,
      overall: 91,
    },
    materials: ['Microcrystalline Cellulose', 'Carboxymethylcellulose'],
    status: 'Active',
  },
  {
    id: '2',
    name: 'DFE Pharma',
    code: 'VEN-DFE-002',
    contactPerson: 'Emma Johnson',
    email: 'emma.johnson@dfepharma.example.com',
    phone: '+31-20-123-4567',
    address: {
      street: '456 Excipient Boulevard',
      city: 'Amsterdam',
      state: 'North Holland',
      zipCode: '1012 AB',
      country: 'Netherlands',
    },
    website: 'https://www.dfepharma.example.com',
    categories: ['Excipients', 'Fillers'],
    certifications: ['ISO 9001', 'GMP', 'FSSC 22000'],
    qualificationStatus: 'Approved',
    qualifiedDate: '2024-02-20',
    auditHistory: [
      {
        id: 'audit-2',
        date: '2024-02-15',
        type: 'Remote',
        findings: 'Minor observations addressed',
        auditor: 'External Auditor',
        score: 88,
      },
    ],
    performanceMetrics: {
      qualityScore: 92,
      deliveryScore: 85,
      responsivenesScore: 90,
      overall: 89,
    },
    materials: ['Lactose Monohydrate', 'Anhydrous Lactose'],
    status: 'Active',
  },
  {
    id: '3',
    name: 'Baerlocher',
    code: 'VEN-BAE-003',
    contactPerson: 'Michael Chen',
    email: 'michael.chen@baerlocher.example.com',
    phone: '+49-89-123-4567',
    address: {
      street: '789 Chemical Strasse',
      city: 'Munich',
      state: 'Bavaria',
      zipCode: '80331',
      country: 'Germany',
    },
    website: 'https://www.baerlocher.example.com',
    categories: ['Excipients', 'Lubricants'],
    certifications: ['ISO 9001', 'GMP', 'ISO 14001'],
    qualificationStatus: 'Approved',
    qualifiedDate: '2023-11-10',
    auditHistory: [
      {
        id: 'audit-3',
        date: '2023-11-05',
        type: 'On-site',
        findings: 'Two minor findings resolved',
        auditor: 'Quality Team',
        score: 86,
      },
    ],
    performanceMetrics: {
      qualityScore: 89,
      deliveryScore: 92,
      responsivenesScore: 85,
      overall: 89,
    },
    materials: ['Magnesium Stearate', 'Calcium Stearate'],
    status: 'Active',
  },
  {
    id: '4',
    name: 'PharmaChem Inc.',
    code: 'VEN-PCI-004',
    contactPerson: 'Sarah Williams',
    email: 'sarah.williams@pharmachem.example.com',
    phone: '+1-650-123-4567',
    address: {
      street: '101 API Avenue',
      city: 'South San Francisco',
      state: 'CA',
      zipCode: '94080',
      country: 'USA',
    },
    website: 'https://www.pharmachem.example.com',
    categories: ['API', 'Intermediates'],
    certifications: ['ISO 9001', 'GMP', 'ICH Q7'],
    qualificationStatus: 'Provisional',
    qualifiedDate: '2025-03-01',
    auditHistory: [
      {
        id: 'audit-4',
        date: '2025-02-25',
        type: 'On-site',
        findings: 'Three major findings requiring CAPA',
        auditor: 'External Auditor',
        score: 75,
      },
    ],
    performanceMetrics: {
      qualityScore: 82,
      deliveryScore: 78,
      responsivenesScore: 90,
      overall: 83,
    },
    materials: ['Active Pharmaceutical Ingredient'],
    status: 'Under Review',
  },
];

/**
 * Get all vendors
 * @param {Object} filters - Optional filters
 * @returns {Array} List of vendors
 */
export const getAllVendors = (filters = {}) => {
  let filteredVendors = [...vendors];

  // Apply filters if provided
  if (filters.category) {
    filteredVendors = filteredVendors.filter(v =>
      v.categories.some(c => c.toLowerCase() === filters.category.toLowerCase())
    );
  }

  if (filters.status) {
    filteredVendors = filteredVendors.filter(v => v.status === filters.status);
  }

  if (filters.qualificationStatus) {
    filteredVendors = filteredVendors.filter(
      v => v.qualificationStatus === filters.qualificationStatus
    );
  }

  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filteredVendors = filteredVendors.filter(
      v =>
        v.name.toLowerCase().includes(searchLower) ||
        v.code.toLowerCase().includes(searchLower) ||
        v.contactPerson.toLowerCase().includes(searchLower)
    );
  }

  return filteredVendors;
};

/**
 * Get a vendor by ID
 * @param {string} id - Vendor ID
 * @returns {Object|null} Vendor data or null if not found
 */
export const getVendorById = id => {
  return vendors.find(v => v.id === id) || null;
};

/**
 * Create a new vendor
 * @param {Object} vendorData - Vendor data
 * @returns {Object} Created vendor
 */
export const createVendor = vendorData => {
  const newVendor = {
    id: uuidv4(),
    ...vendorData,
    createdAt: new Date().toISOString(),
    auditHistory: vendorData.auditHistory || [],
    performanceMetrics: vendorData.performanceMetrics || {
      qualityScore: 0,
      deliveryScore: 0,
      responsivenesScore: 0,
      overall: 0,
    },
  };

  vendors.push(newVendor);
  return newVendor;
};

/**
 * Update a vendor
 * @param {string} id - Vendor ID
 * @param {Object} vendorData - Updated vendor data
 * @returns {Object|null} Updated vendor or null if not found
 */
export const updateVendor = (id, vendorData) => {
  const index = vendors.findIndex(v => v.id === id);

  if (index === -1) {
    return null;
  }

  const updatedVendor = {
    ...vendors[index],
    ...vendorData,
    updatedAt: new Date().toISOString(),
  };

  vendors[index] = updatedVendor;
  return updatedVendor;
};

/**
 * Delete a vendor
 * @param {string} id - Vendor ID
 * @returns {boolean} Success status
 */
export const deleteVendor = id => {
  const initialLength = vendors.length;
  vendors = vendors.filter(v => v.id !== id);
  return vendors.length < initialLength;
};

/**
 * Get vendor categories
 * @returns {Array} List of unique categories
 */
export const getVendorCategories = () => {
  const categoriesSet = new Set();
  vendors.forEach(v => {
    v.categories.forEach(c => categoriesSet.add(c));
  });
  return Array.from(categoriesSet);
};

/**
 * Add audit to vendor history
 * @param {string} id - Vendor ID
 * @param {Object} auditData - Audit data
 * @returns {Object|null} Updated vendor or null if not found
 */
export const addVendorAudit = (id, auditData) => {
  const index = vendors.findIndex(v => v.id === id);

  if (index === -1) {
    return null;
  }

  const auditHistory = vendors[index].auditHistory || [];

  const newAuditData = {
    id: uuidv4(),
    ...auditData,
    date: auditData.date || new Date().toISOString(),
  };

  vendors[index] = {
    ...vendors[index],
    auditHistory: [...auditHistory, newAuditData],
  };

  return vendors[index];
};

/**
 * Update vendor qualification status
 * @param {string} id - Vendor ID
 * @param {string} status - New qualification status
 * @returns {Object|null} Updated vendor or null if not found
 */
export const updateVendorQualificationStatus = (id, status) => {
  const index = vendors.findIndex(v => v.id === id);

  if (index === -1) {
    return null;
  }

  vendors[index] = {
    ...vendors[index],
    qualificationStatus: status,
    qualifiedDate: new Date().toISOString(),
  };

  return vendors[index];
};

/**
 * Update vendor performance metrics
 * @param {string} id - Vendor ID
 * @param {Object} metrics - Performance metrics
 * @returns {Object|null} Updated vendor or null if not found
 */
export const updateVendorPerformanceMetrics = (id, metrics) => {
  const index = vendors.findIndex(v => v.id === id);

  if (index === -1) {
    return null;
  }

  const currentMetrics = vendors[index].performanceMetrics || {};
  const updatedMetrics = {
    ...currentMetrics,
    ...metrics,
  };

  // Calculate overall score if not provided
  if (!metrics.overall) {
    const scores = [
      updatedMetrics.qualityScore || 0,
      updatedMetrics.deliveryScore || 0,
      updatedMetrics.responsivenesScore || 0,
    ];
    const validScores = scores.filter(s => s > 0);
    updatedMetrics.overall =
      validScores.length > 0
        ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
        : 0;
  }

  vendors[index] = {
    ...vendors[index],
    performanceMetrics: updatedMetrics,
    metricsUpdatedAt: new Date().toISOString(),
  };

  return vendors[index];
};

/**
 * Get vendor performance statistics
 * @returns {Object} Vendor performance statistics
 */
export const getVendorPerformanceStats = () => {
  const activeVendors = vendors.filter(v => v.status === 'Active');
  const performanceScores = activeVendors.map(v => v.performanceMetrics?.overall || 0);

  return {
    totalVendors: vendors.length,
    activeVendors: activeVendors.length,
    averagePerformance:
      performanceScores.length > 0
        ? Math.round(performanceScores.reduce((a, b) => a + b, 0) / performanceScores.length)
        : 0,
    topPerformers: activeVendors
      .filter(v => (v.performanceMetrics?.overall || 0) > 90)
      .map(v => ({ id: v.id, name: v.name, score: v.performanceMetrics?.overall || 0 })),
    qualificationStatusCounts: vendors.reduce((acc, curr) => {
      acc[curr.qualificationStatus] = (acc[curr.qualificationStatus] || 0) + 1;
      return acc;
    }, {}),
  };
};

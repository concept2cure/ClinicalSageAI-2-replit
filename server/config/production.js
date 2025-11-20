// Production Configuration
// Ensures no mock data or fallbacks are used

const productionConfig = {
  // Disable all mock data
  useMockData: false,

  // Require real API connections
  requireRealAPIs: true,

  // Database settings
  database: {
    requireConnection: true,
    failOnConnectionError: true,
  },

  // Template settings
  templates: {
    requireAPISource: true,
    disableFallbacks: true,
  },

  // Validation settings
  validation: {
    requireAPISource: true,
    strictMode: true,
  },

  // Error handling
  errors: {
    throwOnMockData: true,
    requireRealSources: true,
  },
};

module.exports = productionConfig;

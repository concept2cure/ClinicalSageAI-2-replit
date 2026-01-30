/**
 * Import Guard Module
 *
 * This script patches the Node.js module system to prevent importing of
 * specific problematic modules like react-toastify.
 *
 * It automatically runs at application startup to ensure stability.
 */

import Module from 'module';

// Save the original require function
const originalRequire = Module.prototype.require;

// Define banned modules that should be intercepted
const BANNED_MODULES = ['react-toastify'];
const REPLACEMENT_MESSAGE = 'Module was blocked by import guard for application stability.';

// Create a wrapper around the original require
Module.prototype.require = function (id) {
  // Check if the requested module is in the banned list
  if (BANNED_MODULES.includes(id)) {
    logger.warn(`⚠️ Blocked import of problematic module: ${id}`);
    // Return a mock module that won't crash the application
    return {
      __BLOCKED__: true,
      __REASON__: REPLACEMENT_MESSAGE,
      // Add mock toast functions that safely do nothing
      toast: () => logger.info('[Toast Blocked]:', ...arguments),
      ToastContainer: () => null,
    };
  }

  // For all other modules, use the original require
  return originalRequire.apply(this, arguments);
};

logger.info('✅ Import guard activated - application protected from problematic dependencies.');

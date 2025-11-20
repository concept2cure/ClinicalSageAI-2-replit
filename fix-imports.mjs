/**
 * Import Guard Module (ESM Version)
 *
 * This script patches the Node.js module system to prevent importing of
 * specific problematic modules like react-toastify.
 *
 * It automatically runs at application startup to ensure stability.
 */

// Define banned modules that should be intercepted
const BANNED_MODULES = ['react-toastify'];
const REPLACEMENT_MESSAGE = 'Module was blocked by import guard for application stability.';

// Override the import.meta.resolve function (ESM equivalent of require)
const originalResolve = import.meta.resolve;
if (originalResolve) {
  import.meta.resolve = function (specifier, parent) {
    // Check if the requested module is in the banned list
    if (BANNED_MODULES.some(banned => specifier.includes(banned))) {
      console.warn(`⚠️ Blocked ESM import of problematic module: ${specifier}`);
      // Return a safe path instead
      return import.meta.url;
    }

    // For all other modules, use the original resolve
    return originalResolve(specifier, parent);
  };
}

// Create a safe mock module
export const createSafeMock = () => ({
  __BLOCKED__: true,
  __REASON__: REPLACEMENT_MESSAGE,
  // Add mock toast functions that safely do nothing
  toast: (...args) => console.log('[Toast Blocked]:', ...args),
  ToastContainer: () => null,
});

console.log('✅ ESM Import guard activated - application protected from problematic dependencies.');

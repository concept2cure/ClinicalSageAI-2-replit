/**
 * Version Checker Utility
 *
 * This utility provides functions to check and validate version numbers
 * across the application, ensuring stability and consistent dependencies.
 * It helps prevent incompatibility issues between different parts of the
 * platform.
 */

// Core application version
export const APP_VERSION = '2.5.0';

// Component library versions - keeping these consistent is critical
export const CORE_DEPENDENCIES = {
  // Frontend dependencies (matches package.json)
  react: '18.2.0',
  'react-dom': '18.2.0',
  'shadcn-ui': '0.4.1',
  tailwindcss: '3.3.5',
  'lucide-react': '0.292.0',
  'react-query': '5.0.0',

  // API dependencies
  openai: '4.14.2',
  fastapi: '0.104.1',

  // Database versions
  postgresql: '16.0',
  'drizzle-orm': '0.28.6',
};

/**
 * Validate if a version string meets minimum requirement
 * @param {string} current - Current version in semver format
 * @param {string} required - Minimum required version
 * @returns {boolean} True if current version meets requirements
 */
export const isCompatibleVersion = (current, required) => {
  if (!current || !required) return false;

  const currentParts = current.split('.').map(Number);
  const requiredParts = required.split('.').map(Number);

  // Compare major version
  if (currentParts[0] !== requiredParts[0]) {
    return currentParts[0] > requiredParts[0];
  }

  // Compare minor version
  if (currentParts[1] !== requiredParts[1]) {
    return currentParts[1] > requiredParts[1];
  }

  // Compare patch version
  return currentParts[2] >= requiredParts[2];
};

/**
 * Check if the current app version matches a required version
 * @param {string} requiredVersion - Minimum required version
 * @returns {boolean} True if current app version is compatible
 */
export const checkAppVersion = requiredVersion => {
  return isCompatibleVersion(APP_VERSION, requiredVersion);
};

/**
 * Check if a dependency is at the expected version
 * @param {string} dependencyName - Name of the dependency
 * @param {string} actualVersion - The actual version to validate
 * @returns {boolean} True if compatible, false otherwise
 */
export const checkDependencyVersion = (dependencyName, actualVersion) => {
  const expectedVersion = CORE_DEPENDENCIES[dependencyName];
  if (!expectedVersion) {
    console.warn(`Unknown dependency: ${dependencyName}`);
    return true; // Skip checks for unknown dependencies
  }

  return isCompatibleVersion(actualVersion, expectedVersion);
};

/**
 * Get a list of all dependencies and their expected versions
 * @returns {Object} Map of dependencies and expected versions
 */
export const getExpectedDependencies = () => {
  return { ...CORE_DEPENDENCIES };
};

export default {
  APP_VERSION,
  CORE_DEPENDENCIES,
  isCompatibleVersion,
  checkAppVersion,
  checkDependencyVersion,
  getExpectedDependencies,
};

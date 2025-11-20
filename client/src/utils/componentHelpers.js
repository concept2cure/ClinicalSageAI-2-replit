/**
 * Component Helpers
 *
 * Safe utility functions for React components to prevent common errors
 * and crashes. These functions handle edge cases and provide fallbacks
 * for missing or invalid data.
 */

/**
 * Safely access a nested property in an object without throwing errors
 * @param {Object} obj - The object to access
 * @param {string|Array} path - The path to the property as a string 'a.b.c' or array ['a', 'b', 'c']
 * @param {*} defaultValue - Default value to return if path is not found
 * @returns {*} The value at the path or the default value
 */
export const safeGet = (obj, path, defaultValue = null) => {
  if (!obj) return defaultValue;

  const keys = Array.isArray(path) ? path : path.split('.');
  let result = obj;

  for (const key of keys) {
    if (result === null || result === undefined || typeof result !== 'object') {
      return defaultValue;
    }
    result = result[key];
  }

  return result !== undefined ? result : defaultValue;
};

/**
 * Filter out null or undefined values from an array
 * @param {Array} array - The array to filter
 * @returns {Array} Array with null/undefined values removed
 */
export const filterNullish = array => {
  if (!Array.isArray(array)) return [];
  return array.filter(item => item !== null && item !== undefined);
};

/**
 * Safely join an array of strings with a delimiter
 * @param {Array} array - The array to join
 * @param {string} delimiter - The delimiter to use
 * @returns {string} The joined string
 */
export const safeJoin = (array, delimiter = ', ') => {
  if (!Array.isArray(array)) return '';
  return filterNullish(array).join(delimiter);
};

/**
 * Create a safe event handler that won't crash if undefined
 * @param {Function} handler - The event handler function
 * @returns {Function} A wrapped safe event handler
 */
export const createSafeEventHandler = handler => {
  return (...args) => {
    if (typeof handler === 'function') {
      try {
        return handler(...args);
      } catch (error) {
        console.error('Error in event handler:', error);
        // Optionally report to error tracking service
        return undefined;
      }
    }
    return undefined;
  };
};

/**
 * Safely render a component or element with falsy check
 * @param {Function} condition - Condition that must be true for the component to render
 * @param {React.ReactNode} component - Component to render if condition is true
 * @param {React.ReactNode} fallback - Optional fallback component
 * @returns {React.ReactNode} The component or fallback or null
 */
export const renderIf = (condition, component, fallback = null) => {
  return condition ? component : fallback;
};

/**
 * Format a number with commas as thousands separators
 * @param {number|string} value - The number to format
 * @returns {string} Formatted number
 */
export const formatNumber = value => {
  if (value === null || value === undefined) return '';
  return Number(value).toLocaleString();
};

/**
 * Debounce a function call
 * @param {Function} func - The function to debounce
 * @param {number} wait - The time in ms to wait
 * @returns {Function} Debounced function
 */
export const debounce = (func, wait = 300) => {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
};

/**
 * Safely execute a function and return its result, or a default value if it throws
 * @param {Function} fn - The function to execute
 * @param {Array} args - Arguments to pass to the function
 * @param {*} defaultValue - Default value to return if function throws
 * @returns {*} The result of the function or the default value
 */
export const tryCatch = (fn, args = [], defaultValue = null) => {
  try {
    return fn(...args);
  } catch (error) {
    console.error('Error executing function:', error);
    return defaultValue;
  }
};

export default {
  safeGet,
  filterNullish,
  safeJoin,
  createSafeEventHandler,
  renderIf,
  formatNumber,
  debounce,
  tryCatch,
};

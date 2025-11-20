/**
 * Stability Patches - Emergency state management utilities
 * 
 * Created to resolve critical production import error in PredicateFinderPanel.jsx
 * Provides localStorage-based state persistence for 510(k) predicate device data
 */

/**
 * Load state from localStorage with error handling
 * @param {string} key - The storage key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {*} - The stored value or default
 */
export const loadState = (key, defaultValue = null) => {
  try {
    const serializedState = localStorage.getItem(`stability_${key}`);
    if (serializedState === null) {
      return defaultValue;
    }
    return JSON.parse(serializedState);
  } catch (error) {
    console.error(`Error loading state for key "${key}":`, error);
    return defaultValue;
  }
};

/**
 * Save state to localStorage with error handling
 * @param {string} key - The storage key
 * @param {*} state - The state to save
 * @returns {boolean} - Success status
 */
export const saveState = (key, state) => {
  try {
    const serializedState = JSON.stringify(state);
    localStorage.setItem(`stability_${key}`, serializedState);
    return true;
  } catch (error) {
    console.error(`Error saving state for key "${key}":`, error);
    return false;
  }
};

/**
 * Clear state from localStorage
 * @param {string} key - The storage key
 * @returns {boolean} - Success status
 */
export const clearState = (key) => {
  try {
    localStorage.removeItem(`stability_${key}`);
    return true;
  } catch (error) {
    console.error(`Error clearing state for key "${key}":`, error);
    return false;
  }
};

/**
 * Check if state exists
 * @param {string} key - The storage key
 * @returns {boolean} - Whether the key exists
 */
export const hasState = (key) => {
  try {
    return localStorage.getItem(`stability_${key}`) !== null;
  } catch (error) {
    console.error(`Error checking state for key "${key}":`, error);
    return false;
  }
};
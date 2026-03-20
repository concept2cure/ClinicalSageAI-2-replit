/**
 * UI Utilities for Concept2Cure
 *
 * This file contains utility functions for UI customization and layout management.
 */

/**
 * Apply compact styling to the application
 * Reduces padding and margins for denser information display
 *
 * @param {boolean} enabled - Whether compact styling should be enabled
 * @returns {object} Styling properties object
 */
export function applyCompactStyling(enabled = false) {
  if (!enabled) {
    return {
      cardPadding: 'p-6',
      sectionMargin: 'mb-6',
      contentSpacing: 'space-y-4',
      tableCellPadding: 'px-4 py-3',
      fontSize: 'text-base',
      buttonSize: 'px-4 py-2',
    };
  }

  // Return compact styling configuration
  return {
    cardPadding: 'p-3',
    sectionMargin: 'mb-3',
    contentSpacing: 'space-y-2',
    tableCellPadding: 'px-2 py-1.5',
    fontSize: 'text-sm',
    buttonSize: 'px-3 py-1.5',
  };
}

/**
 * Generate a color class based on value range
 *
 * @param {number} value - The value to generate a color for (0-100)
 * @param {boolean} inverse - Whether to inverse the color scale
 * @returns {string} Tailwind CSS color class
 */
export function getValueColor(value, inverse = false) {
  if (typeof value !== 'number' || isNaN(value)) {
    return 'text-gray-400';
  }

  const normalizedValue = Math.max(0, Math.min(100, value));

  if (inverse) {
    if (normalizedValue >= 80) return 'text-red-500';
    if (normalizedValue >= 60) return 'text-orange-500';
    if (normalizedValue >= 40) return 'text-yellow-500';
    if (normalizedValue >= 20) return 'text-teal-500';
    return 'text-green-500';
  }

  if (normalizedValue >= 80) return 'text-green-500';
  if (normalizedValue >= 60) return 'text-teal-500';
  if (normalizedValue >= 40) return 'text-yellow-500';
  if (normalizedValue >= 20) return 'text-orange-500';
  return 'text-red-500';
}

/**
 * Format a date string into a human-readable format
 *
 * @param {string} dateString - ISO date string
 * @param {boolean} includeTime - Whether to include time in the output
 * @returns {string} Formatted date string
 */
export function formatDate(dateString, includeTime = false) {
  if (!dateString) return 'N/A';

  try {
    const date = new Date(dateString);
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    };

    return date.toLocaleDateString('en-US', options);
  } catch (e) {
    console.error('Date formatting error:', e);
    return dateString;
  }
}

/**
 * Truncate text with ellipsis
 *
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
}

/**
 * Utility functions for CERv2 Workbench UI
 */

/**
 * Truncate string with deterministic middle ellipsis
 * Shows first and last characters for visual verification
 * 
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @param {number} edgeChars - Number of chars to show at each edge (default 6)
 * @returns {string} Truncated string like "abcdef…uvwxyz"
 */
export function truncateMiddle(str, maxLength = 16, edgeChars = 6) {
  if (!str || str.length <= maxLength) return str;
  
  const start = str.slice(0, edgeChars);
  const end = str.slice(-edgeChars);
  return `${start}…${end}`;
}

/**
 * Format bytes to human-readable size
 * 
 * @param {number} bytes - Number of bytes
 * @param {number} decimals - Number of decimal places (default 2)
 * @returns {string} Formatted size like "1.23 MB"
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format ISO timestamp to human-readable date
 * 
 * @param {string} isoString - ISO 8601 timestamp
 * @returns {string} Formatted date like "Jan 18, 2026 3:45 PM"
 */
export function formatTimestamp(isoString) {
  if (!isoString) return '';
  
  const date = new Date(isoString);
  
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Format relative time (e.g., "2 hours ago")
 * 
 * @param {string} isoString - ISO 8601 timestamp
 * @returns {string} Relative time like "2 hours ago"
 */
export function formatRelativeTime(isoString) {
  if (!isoString) return '';
  
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  
  // Fall back to absolute date for older items
  return formatTimestamp(isoString);
}

/**
 * Get status badge color
 * 
 * @param {string} status - Status value
 * @returns {string} Tailwind color class
 */
export function getStatusColor(status) {
  const colors = {
    draft: 'bg-gray-100 text-gray-800',
    'in-review': 'bg-blue-100 text-blue-800',
    complete: 'bg-green-100 text-green-800',
    'needs-evidence': 'bg-orange-100 text-orange-800',
  };
  
  return colors[status] || 'bg-gray-100 text-gray-800';
}

/**
 * Format coverage percentage
 * 
 * @param {number} coverage - Coverage value (0-1)
 * @returns {string} Formatted percentage like "75%"
 */
export function formatCoverage(coverage) {
  if (coverage === null || coverage === undefined) return '0%';
  return `${Math.round(coverage * 100)}%`;
}

/**
 * Get coverage color based on thresholds
 * 
 * @param {number} coverage - Coverage value (0-1)
 * @returns {string} Tailwind color class
 */
export function getCoverageColor(coverage) {
  if (coverage === null || coverage === undefined) return 'text-gray-400';
  if (coverage >= 0.9) return 'text-green-600';
  if (coverage >= 0.7) return 'text-blue-600';
  if (coverage >= 0.5) return 'text-orange-600';
  return 'text-red-600';
}

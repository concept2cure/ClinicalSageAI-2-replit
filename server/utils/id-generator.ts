/**
 * ID Generator Utility
 *
 * This utility provides standardized ID generation functions for
 * the various entities in the application following consistent patterns.
 */

/**
 * Generate a UUID v4 (simplified implementation)
 * @returns {string} A random UUID v4-like string
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a document ID with a specified prefix
 * @param {string} prefix - The prefix to use (default: 'DOC')
 * @returns {string} A prefixed document ID
 */
export function generateDocumentId(prefix: string = 'DOC'): string {
  const uuid = generateUUID();
  return `${prefix}_${uuid}`;
}

/**
 * Generate a CER ID with a timestamp
 * @returns {string} A CER ID
 */
export function generateCerId(): string {
  const timestamp = new Date().getTime();
  return `CER_${timestamp}_${generateUUID().substring(0, 8)}`;
}

/**
 * Generate a sequential ID based on a counter
 * @param {number} counter - The current counter value
 * @param {string} prefix - The prefix to use
 * @param {number} padLength - The length to pad the number to
 * @returns {string} A sequential ID
 */
export function generateSequentialId(
  counter: number,
  prefix: string = 'ID',
  padLength: number = 4
): string {
  const paddedCounter = counter.toString().padStart(padLength, '0');
  return `${prefix}_${paddedCounter}`;
}

/**
 * Generate a session ID
 * @returns {string} A session ID
 */
export function generateSessionId(): string {
  const timestamp = new Date().getTime();
  return `SESSION_${timestamp}_${generateUUID().substring(0, 8)}`;
}

/**
 * Generate a folder ID
 * @returns {string} A folder ID
 */
export function generateFolderId(): string {
  return `FOLDER_${generateUUID()}`;
}

/**
 * Generate a project ID
 * @param {string} prefix - The prefix for the project type (e.g., 'CER', 'IND')
 * @returns {string} A project ID
 */
export function generateProjectId(prefix: string = 'PRJ'): string {
  const timestamp = new Date().getTime();
  return `${prefix}_${timestamp}_${generateUUID().substring(0, 8)}`;
}

/**
 * Generate a template ID
 * @param {string} category - The category for the template type (e.g., 'IND', 'ECTD')
 * @returns {string} A template ID
 */
export function generateTemplateId(category: string = 'TMPL'): string {
  const timestamp = new Date().getTime();
  return `${category}_${timestamp}_${generateUUID().substring(0, 8)}`;
}

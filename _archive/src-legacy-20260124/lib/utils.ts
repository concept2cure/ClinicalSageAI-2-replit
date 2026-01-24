import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines class names using clsx and tailwind-merge
 * This utility is used to combine Tailwind CSS classes with conditional classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats bytes to a human readable string with appropriate unit
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Creates a delay using a Promise
 * @param ms - Milliseconds to delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generates a random string ID
 * @param length - Length of the ID
 */
export function generateId(length: number = 8): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

/**
 * Safely access deeply nested properties in an object without errors
 * @param obj - The object to access
 * @param path - The path to the property, separated by periods
 * @param defaultValue - Default value to return if property doesn't exist
 */
export function getNestedValue(obj: any, path: string, defaultValue: any = undefined): any {
  if (!obj || !path) return defaultValue;

  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (
      current === null ||
      current === undefined ||
      !Object.prototype.hasOwnProperty.call(current, key)
    ) {
      return defaultValue;
    }
    current = current[key];
  }

  return current === undefined ? defaultValue : current;
}

/**
 * Debounces a function call
 * @param fn - Function to debounce
 * @param ms - Debounce delay in milliseconds
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  ms: number = 300
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return function (...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Removes HTML tags from a string
 * @param html - String containing HTML
 */
export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

/**
 * Truncates a string to a specified length and adds ellipsis
 * @param str - String to truncate
 * @param length - Maximum length
 */
export function truncateString(str: string, length: number = 50): string {
  if (!str) return '';
  if (str.length <= length) return str;

  return str.substring(0, length) + '...';
}

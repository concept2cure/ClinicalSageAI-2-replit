import React from 'react';
import * as LucideIcons from 'lucide-react';
import { Circle } from 'lucide-react';

/**
 * Safe Icon Mapper
 *
 * This utility provides a safe way to render icons by name,
 * falling back to a default icon if the requested icon doesn't exist.
 * It helps prevent crashes that can occur when an icon name is missing
 * or misspelled.
 *
 * Usage:
 * import { getSafeIcon } from '@/utils/safeIconMapper';
 *
 * // In your component:
 * const Icon = getSafeIcon(iconName);
 * return <Icon className="w-5 h-5" />;
 */

/**
 * Get a safe icon component by name
 * @param {string} iconName - Name of the Lucide icon to render
 * @param {object} fallback - Optional custom fallback icon (defaults to Circle)
 * @returns {React.ComponentType} The icon component or a fallback
 */
export const getSafeIcon = (iconName, fallback = Circle) => {
  if (!iconName) return fallback;

  try {
    // Convert snake_case or kebab-case to PascalCase
    const pascalCaseName = iconName
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');

    // Try to find the icon in Lucide
    const Icon = LucideIcons[pascalCaseName] || fallback;
    return Icon;
  } catch (error) {
    console.warn(`Icon "${iconName}" not found, using fallback.`);
    return fallback;
  }
};

/**
 * Render a safe icon component
 * @param {string} iconName - Name of the Lucide icon to render
 * @param {object} props - Props to pass to the icon component
 * @returns {React.ReactNode} The rendered icon or fallback
 */
export const SafeIcon = ({ name, ...props }) => {
  const Icon = getSafeIcon(name);
  return <Icon {...props} />;
};

/**
 * Map of common icon categories to ensure we always have valid icons
 */
export const safeIconMap = {
  // Document types
  document: 'file-text',
  pdf: 'file-text',
  excel: 'file-spreadsheet',
  word: 'file-text',
  image: 'image',

  // Actions
  add: 'plus',
  edit: 'pencil',
  delete: 'trash-2',
  view: 'eye',
  download: 'download',
  upload: 'upload',

  // UI elements
  error: 'alert-circle',
  warning: 'alert-triangle',
  success: 'check-circle',
  info: 'info',

  // Module specific
  validation: 'check-square',
  protocol: 'clipboard',
  report: 'bar-chart-2',
  user: 'user',
  settings: 'settings',

  // Default
  default: 'circle',
};

export default SafeIcon;

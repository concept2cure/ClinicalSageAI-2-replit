/**
 * Component Safety Utilities
 *
 * This module provides safety functions to protect against common React rendering issues
 * including undefined components, missing props, and rendering errors.
 */

/**
 * Safely renders an icon component, providing a fallback if the component is undefined
 *
 * @param {React.ComponentType} IconComponent - The icon component to render
 * @param {Object} props - Props to pass to the icon
 * @param {React.ReactNode} fallback - Optional fallback element if component is undefined
 * @returns {React.ReactNode} The rendered icon or fallback
 */
export const SafeIcon = ({ component: IconComponent, ...props }) => {
  if (!IconComponent || typeof IconComponent !== 'function') {
    // Return an empty div as fallback (minimal impact on layout)
    return props.fallback || <div className={props.className} />;
  }

  try {
    return <IconComponent {...props} />;
  } catch (error) {
    console.error('Error rendering icon:', error);
    return props.fallback || <div className={props.className} />;
  }
};

/**
 * Checks if a component is valid and can be rendered
 *
 * @param {React.ComponentType} Component - The component to check
 * @returns {boolean} True if the component is valid
 */
export const isValidComponent = Component => {
  return (
    Component &&
    (typeof Component === 'function' ||
      typeof Component === 'object' ||
      typeof Component === 'string')
  );
};

/**
 * Creates a wrapped version of a component that includes error handling
 *
 * @param {React.ComponentType} Component - The component to wrap
 * @param {React.ReactNode} fallback - Fallback UI to show on error
 * @returns {React.ComponentType} Wrapped component with error handling
 */
export const withErrorHandling = (Component, fallback = null) => {
  if (!isValidComponent(Component)) {
    return () => fallback || null;
  }

  return props => {
    try {
      return <Component {...props} />;
    } catch (error) {
      console.error(`Error rendering component: ${Component.displayName || Component.name}`, error);
      return fallback || null;
    }
  };
};

/**
 * Safely access nested objects to prevent "cannot read property of undefined" errors
 *
 * @param {Object} obj - The object to access
 * @param {string|Array} path - Path to the property as a dot-notation string or array
 * @param {*} defaultValue - Default value if path doesn't exist
 * @returns {*} The value at path or defaultValue
 */
export const safeAccess = (obj, path, defaultValue = null) => {
  if (!obj) return defaultValue;

  const keys = Array.isArray(path) ? path : path.split('.');
  let result = obj;

  for (const key of keys) {
    if (result === null || result === undefined || typeof result !== 'object') {
      return defaultValue;
    }
    result = result[key];
  }

  return result === undefined ? defaultValue : result;
};

/**
 * A wrapper for arrays that prevents "map of undefined" errors
 *
 * @param {Array} arr - The array to check
 * @param {Function} mapFn - Mapping function
 * @returns {Array} Result of mapping or empty array
 */
export const safeMap = (arr, mapFn) => {
  if (!Array.isArray(arr)) return [];
  try {
    return arr.map(mapFn);
  } catch (error) {
    console.error('Error mapping array:', error);
    return [];
  }
};

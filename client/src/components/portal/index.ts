/**
 * Portal Module - Barrel Export
 * 
 * Central export point for all portal-related types, components, and utilities.
 */

// Types
export * from './types';

// Policy & Configuration
export {
  computePortalExperience,
  ROLE_PERMISSIONS,
  AGENCY_CONFIG,
  MODULE_REGISTRY,
  hasPermission,
  isModuleApplicable,
  getEnabledModules,
  buildNavigation,
  buildDashboardWidgets,
  buildQuickActions,
  getFeatureFlags,
} from './portalPolicy';

// Context & Provider
export {
  PortalProvider,
  usePortal,
  DEMO_USER,
  DEMO_ORGANIZATION,
} from './PortalContext';

// Layout Components
export {
  PortalFrame,
  PortalLayoutContext,
  usePortalLayout,
  TopBar,
  SidebarNav,
} from './layout';

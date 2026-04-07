import React from 'react';
import { DocuShareProvider } from '../../contexts/DocuShareContext';
import DocuSharePanel from './DocuSharePanel';

/**
 * DocuShareIntegration Component
 *
 * This component provides an easy way to integrate document management
 * into any module of the application with module-specific configurations.
 *
 * Usage examples:
 *
 * // Basic usage with default settings
 * <DocuShareIntegration />
 *
 * // For IND module with compact view
 * <DocuShareIntegration
 *   moduleName="ind"
 *   moduleLabel="IND Documents"
 *   compact={true}
 * />
 *
 * // For CSR with sidebar integration
 * <DocuShareIntegration
 *   moduleName="csr"
 *   moduleLabel="CSR Documents"
 *   compact={true}
 *   hidePreview={true}
 * />
 */
export default function DocuShareIntegration({
  // Module configuration
  moduleName = 'default',
  moduleLabel = 'Document Repository',
  includeGeneral = true,

  // Display configuration
  compact = false,
  hidePreview = false,
  hideMetadata = false,
  uploadEnabled = true,
  allowDelete = true,

  // Custom filters if needed
  customFilters = null,

  // Additional class names
  className = '',
}) {
  return (
    <div className={className}>
      <DocuShareProvider
        moduleName={moduleName}
        moduleLabel={moduleLabel}
        includeGeneral={includeGeneral}
      >
        <DocuSharePanel
          compact={compact}
          hidePreview={hidePreview}
          hideMetadata={hideMetadata}
          uploadEnabled={uploadEnabled}
          allowDelete={allowDelete}
          customFilters={customFilters}
        />
      </DocuShareProvider>
    </div>
  );
}

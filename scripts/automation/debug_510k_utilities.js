/**
 * Debugging Utilities for 510(k) Functionality
 *
 * This script provides a collection of browser console utilities to help
 * debug and troubleshoot the 510(k) functionality implementation.
 *
 * Usage:
 * 1. Open the CERV2 page in browser
 * 2. Open browser developer tools (F12)
 * 3. Copy this entire script and paste it into the console
 * 4. Use the utilities by typing, e.g., debugUtils.inspectState()
 */

// Define the debugging utilities
const debugUtils = {
  // Display current application state
  inspectState: function () {
    const app = this.getAppContext();
    if (!app) {
      logger.error('Could not access application context');
      return;
    }

    console.group('🔍 Application State');
    logger.info('Document Type:', app.documentType);
    logger.info('Active Tab:', app.activeTab);
    logger.info('Device Profile:', app.deviceProfile);
    logger.info('Compliance Data:', app.compliance);
    logger.info('Compliance Running:', app.isComplianceRunning);
    logger.info('Draft Status:', app.draftStatus);
    logger.info('Device Name:', app.deviceName);
    logger.info('Manufacturer:', app.manufacturer);
    logger.info('Device Type:', app.deviceType);
    logger.info('Intended Use:', app.intendedUse);
    console.groupEnd();

    return app;
  },

  // Force setting document type
  setDocumentType: function (type) {
    if (type !== 'cer' && type !== '510k') {
      logger.error('Invalid document type. Must be "cer" or "510k"');
      return;
    }

    const app = this.getAppContext();
    if (!app || !app.setDocumentType) {
      logger.error('Could not access setDocumentType function');
      return;
    }

    app.setDocumentType(type);
    logger.info(`✅ Document type set to: ${type}`);
    this.inspectState();
  },

  // Force navigation to specific tab
  setActiveTab: function (tabName) {
    const app = this.getAppContext();
    if (!app || !app.setActiveTab) {
      logger.error('Could not access setActiveTab function');
      return;
    }

    app.setActiveTab(tabName);
    logger.info(`✅ Active tab set to: ${tabName}`);
  },

  // Force device profile update
  setDeviceProfile: function (profile) {
    const app = this.getAppContext();
    if (!app || !app.setDeviceProfile) {
      logger.error('Could not access setDeviceProfile function');
      return;
    }

    const defaultProfile = {
      deviceName: 'Test Device',
      manufacturer: 'Test Manufacturer',
      deviceClass: 'II',
      intendedUse: 'Test intended use',
      documentType: app.documentType || '510k',
      id: app.documentType === 'cer' ? app.cerDocumentId : app.k510DocumentId,
      description: 'Test device description',
    };

    const mergedProfile = { ...defaultProfile, ...profile };
    app.setDeviceProfile(mergedProfile);
    logger.info('✅ Device profile updated:', mergedProfile);
  },

  // Fix stuck compliance check
  fixComplianceCheck: function () {
    const app = this.getAppContext();
    if (!app) {
      logger.error('Could not access application context');
      return;
    }

    if (app.isComplianceRunning) {
      if (app.setIsComplianceRunning) {
        app.setIsComplianceRunning(false);
        logger.info('✅ Stopped running compliance check');
      } else {
        logger.error('Could not access setIsComplianceRunning function');
      }
    }

    if (app.setCompliance) {
      app.setCompliance({
        score: 0.92,
        overallScore: 0.92,
        sections: [
          { name: 'Device Description', score: 0.95, issues: [] },
          { name: 'Substantial Equivalence', score: 0.89, issues: [] },
          { name: 'Performance Data', score: 0.93, issues: [] },
          { name: 'Predicate Comparison', score: 0.88, issues: [] },
        ],
        issues: [],
        summary: 'Your 510(k) submission appears to be compliant with FDA requirements.',
      });
      logger.info('✅ Set compliance data');
    } else {
      logger.error('Could not access setCompliance function');
    }

    if (app.setDraftStatus) {
      app.setDraftStatus('ready-for-review');
      logger.info('✅ Updated draft status to ready-for-review');
    }

    this.inspectState();
  },

  // Simulate predicates found
  simulatePredicatesFound: function () {
    const app = this.getAppContext();
    if (!app) {
      logger.error('Could not access application context');
      return;
    }

    const componentInstance = this.find510kComponent();
    if (
      componentInstance &&
      componentInstance.setPredicates &&
      componentInstance.setPredicateFound
    ) {
      componentInstance.setPredicates([
        {
          id: 'P123456',
          deviceName: 'XYZ Medical Device',
          manufacturer: 'Medical Corp',
          k510Number: 'K123456',
          approvalDate: '2024-02-15',
          similarity: 0.89,
          description: 'Class II therapeutic device for similar intended use',
        },
        {
          id: 'P223445',
          deviceName: 'ABC Health System',
          manufacturer: 'Health Industries',
          k510Number: 'K223445',
          approvalDate: '2023-11-10',
          similarity: 0.76,
          description: 'Similar technology with comparable safety profile',
        },
      ]);
      componentInstance.setPredicateFound(true);
      componentInstance.setProcessingStage('complete');
      componentInstance.setSearchingPredicates(false);
      logger.info('✅ Simulated predicates found');
    } else {
      logger.error('Could not access 510k component instance or required methods');
    }
  },

  // Inspect DOM structure for debugging UI
  inspectUI: function () {
    console.group('🔍 UI Elements Inspection');

    // Check for document type selector
    const selectTrigger = document.querySelector('button[id="documentType"]');
    logger.info('Document Type Selector:', selectTrigger ? '✅ Found' : '❌ Not found');

    // Check for tab buttons
    const tabButtons = document.querySelectorAll('button[role="tab"]');
    logger.info(
      'Tab Buttons:',
      tabButtons.length ? `✅ Found ${tabButtons.length} tabs` : '❌ No tabs found'
    );

    if (tabButtons.length) {
      console.group('Available Tabs');
      Array.from(tabButtons).forEach(button => {
        logger.info(`- ${button.textContent.trim()}`);
      });
      console.groupEnd();
    }

    // Check for 510k specific components
    this.find510kComponents();

    console.groupEnd();
  },

  // Find 510k components in the DOM
  find510kComponents: function () {
    console.group('510k Components');

    const componentNames = [
      'PredicateFinderPanel',
      'GuidedTooltip',
      'InsightsDisplay',
      'ProgressTracker',
      'SubmissionTimeline',
      'ReportGenerator',
      'FDA510kTabContent',
    ];

    componentNames.forEach(name => {
      // This is a simplified approach - actual detection would depend on how components are rendered
      const elements = document.querySelectorAll(
        `[data-component="${name}"], [class*="${name}"], [id*="${name}"]`
      );
      logger.info(
        `${name}:`,
        elements.length ? `✅ Found ${elements.length} instances` : '❌ Not found'
      );
    });

    console.groupEnd();

    return this.find510kComponent();
  },

  // Try to find a 510k component instance
  find510kComponent: function () {
    // This is a simplified approach - actual detection would depend on the framework and implementation
    const app = this.getAppContext();
    if (!app) return null;

    // Look for child components that might be 510k related
    if (app.__v && app.__v.children) {
      for (const child of app.__v.children) {
        if (child.type && child.type.name && child.type.name.includes('510k')) {
          logger.info('✅ Found 510k component instance:', child);
          return child.component.ctx;
        }
      }
    }

    logger.warn('❌ Could not find 510k component instance');
    return null;
  },

  // Get application context
  getAppContext: function () {
    // Try to find Vue app context
    const appElement = document.querySelector('[role="application"]');
    if (appElement && appElement.__vueParentComponent && appElement.__vueParentComponent.ctx) {
      return appElement.__vueParentComponent.ctx;
    }

    // Try alternative approaches for React apps
    if (window.__APP_CONTEXT__) {
      return window.__APP_CONTEXT__;
    }

    return null;
  },

  // Check for global error event listeners
  checkErrorHandling: function () {
    console.group('🔍 Error Handling');

    // Check for global error event listeners
    const errorListeners = window.getEventListeners && window.getEventListeners(window).error;
    logger.info(
      'Global error listeners:',
      errorListeners ? `✅ Found ${errorListeners.length} listeners` : '❌ No listeners found'
    );

    // Check for global unhandled rejection listeners
    const rejectionListeners =
      window.getEventListeners && window.getEventListeners(window).unhandledrejection;
    logger.info(
      'Unhandled rejection listeners:',
      rejectionListeners
        ? `✅ Found ${rejectionListeners.length} listeners`
        : '❌ No listeners found'
    );

    logger.info('Testing error handling with controlled error...');
    try {
      setTimeout(() => {
        try {
          // Intentionally cause a controlled error
          const nonExistentFunction = window.__debug_test_nonexistent__;
          nonExistentFunction();
        } catch (e) {
          logger.info('✅ Caught test error locally');
        }

        // Test promise rejection
        new Promise((resolve, reject) => {
          reject(new Error('Test rejection'));
        }).catch(e => {
          logger.info('✅ Caught test promise rejection locally');
        });
      }, 0);

      logger.info('Error tests queued. Check console for uncaught errors.');
    } catch (e) {
      logger.error('Error during testing:', e);
    }

    console.groupEnd();
  },

  // Help text
  help: function () {
    logger.info('%c510(k) Debugging Utilities', 'font-size: 16px; font-weight: bold; color: blue;');
    logger.info('\nAvailable commands:');
    logger.info('  debugUtils.inspectState() - Show current application state');
    logger.info('  debugUtils.setDocumentType("510k" | "cer") - Force document type');
    logger.info('  debugUtils.setActiveTab("tabName") - Force active tab');
    logger.info('  debugUtils.fixComplianceCheck() - Fix stuck compliance check');
    logger.info('  debugUtils.simulatePredicatesFound() - Simulate predicates found');
    logger.info('  debugUtils.inspectUI() - Inspect UI elements');
    logger.info('  debugUtils.checkErrorHandling() - Test error handling');
    logger.info('  debugUtils.help() - Show this help message');

    logger.info('\nExample usage:');
    logger.info('  1. debugUtils.setDocumentType("510k")');
    logger.info('  2. debugUtils.setActiveTab("predicates")');
    logger.info('  3. debugUtils.inspectState()');
  },
};

// Create a global reference for console use
window.debugUtils = debugUtils;

// Auto-run help on load
debugUtils.help();

logger.info('%c510(k) Debug Utilities Ready', 'font-size: 14px; font-weight: bold; color: green;');

// Export for Node.js environments if needed
if (typeof module !== 'undefined') {
  module.exports = { debugUtils };
}

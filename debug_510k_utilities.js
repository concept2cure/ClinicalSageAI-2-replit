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
      console.error('Could not access application context');
      return;
    }

    console.group('🔍 Application State');
    console.log('Document Type:', app.documentType);
    console.log('Active Tab:', app.activeTab);
    console.log('Device Profile:', app.deviceProfile);
    console.log('Compliance Data:', app.compliance);
    console.log('Compliance Running:', app.isComplianceRunning);
    console.log('Draft Status:', app.draftStatus);
    console.log('Device Name:', app.deviceName);
    console.log('Manufacturer:', app.manufacturer);
    console.log('Device Type:', app.deviceType);
    console.log('Intended Use:', app.intendedUse);
    console.groupEnd();

    return app;
  },

  // Force setting document type
  setDocumentType: function (type) {
    if (type !== 'cer' && type !== '510k') {
      console.error('Invalid document type. Must be "cer" or "510k"');
      return;
    }

    const app = this.getAppContext();
    if (!app || !app.setDocumentType) {
      console.error('Could not access setDocumentType function');
      return;
    }

    app.setDocumentType(type);
    console.log(`✅ Document type set to: ${type}`);
    this.inspectState();
  },

  // Force navigation to specific tab
  setActiveTab: function (tabName) {
    const app = this.getAppContext();
    if (!app || !app.setActiveTab) {
      console.error('Could not access setActiveTab function');
      return;
    }

    app.setActiveTab(tabName);
    console.log(`✅ Active tab set to: ${tabName}`);
  },

  // Force device profile update
  setDeviceProfile: function (profile) {
    const app = this.getAppContext();
    if (!app || !app.setDeviceProfile) {
      console.error('Could not access setDeviceProfile function');
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
    console.log('✅ Device profile updated:', mergedProfile);
  },

  // Fix stuck compliance check
  fixComplianceCheck: function () {
    const app = this.getAppContext();
    if (!app) {
      console.error('Could not access application context');
      return;
    }

    if (app.isComplianceRunning) {
      if (app.setIsComplianceRunning) {
        app.setIsComplianceRunning(false);
        console.log('✅ Stopped running compliance check');
      } else {
        console.error('Could not access setIsComplianceRunning function');
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
      console.log('✅ Set compliance data');
    } else {
      console.error('Could not access setCompliance function');
    }

    if (app.setDraftStatus) {
      app.setDraftStatus('ready-for-review');
      console.log('✅ Updated draft status to ready-for-review');
    }

    this.inspectState();
  },

  // Simulate predicates found
  simulatePredicatesFound: function () {
    const app = this.getAppContext();
    if (!app) {
      console.error('Could not access application context');
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
      console.log('✅ Simulated predicates found');
    } else {
      console.error('Could not access 510k component instance or required methods');
    }
  },

  // Inspect DOM structure for debugging UI
  inspectUI: function () {
    console.group('🔍 UI Elements Inspection');

    // Check for document type selector
    const selectTrigger = document.querySelector('button[id="documentType"]');
    console.log('Document Type Selector:', selectTrigger ? '✅ Found' : '❌ Not found');

    // Check for tab buttons
    const tabButtons = document.querySelectorAll('button[role="tab"]');
    console.log(
      'Tab Buttons:',
      tabButtons.length ? `✅ Found ${tabButtons.length} tabs` : '❌ No tabs found'
    );

    if (tabButtons.length) {
      console.group('Available Tabs');
      Array.from(tabButtons).forEach(button => {
        console.log(`- ${button.textContent.trim()}`);
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
      console.log(
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
          console.log('✅ Found 510k component instance:', child);
          return child.component.ctx;
        }
      }
    }

    console.warn('❌ Could not find 510k component instance');
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
    console.log(
      'Global error listeners:',
      errorListeners ? `✅ Found ${errorListeners.length} listeners` : '❌ No listeners found'
    );

    // Check for global unhandled rejection listeners
    const rejectionListeners =
      window.getEventListeners && window.getEventListeners(window).unhandledrejection;
    console.log(
      'Unhandled rejection listeners:',
      rejectionListeners
        ? `✅ Found ${rejectionListeners.length} listeners`
        : '❌ No listeners found'
    );

    console.log('Testing error handling with controlled error...');
    try {
      setTimeout(() => {
        try {
          // Intentionally cause a controlled error
          const nonExistentFunction = window.__debug_test_nonexistent__;
          nonExistentFunction();
        } catch (e) {
          console.log('✅ Caught test error locally');
        }

        // Test promise rejection
        new Promise((resolve, reject) => {
          reject(new Error('Test rejection'));
        }).catch(e => {
          console.log('✅ Caught test promise rejection locally');
        });
      }, 0);

      console.log('Error tests queued. Check console for uncaught errors.');
    } catch (e) {
      console.error('Error during testing:', e);
    }

    console.groupEnd();
  },

  // Help text
  help: function () {
    console.log('%c510(k) Debugging Utilities', 'font-size: 16px; font-weight: bold; color: blue;');
    console.log('\nAvailable commands:');
    console.log('  debugUtils.inspectState() - Show current application state');
    console.log('  debugUtils.setDocumentType("510k" | "cer") - Force document type');
    console.log('  debugUtils.setActiveTab("tabName") - Force active tab');
    console.log('  debugUtils.fixComplianceCheck() - Fix stuck compliance check');
    console.log('  debugUtils.simulatePredicatesFound() - Simulate predicates found');
    console.log('  debugUtils.inspectUI() - Inspect UI elements');
    console.log('  debugUtils.checkErrorHandling() - Test error handling');
    console.log('  debugUtils.help() - Show this help message');

    console.log('\nExample usage:');
    console.log('  1. debugUtils.setDocumentType("510k")');
    console.log('  2. debugUtils.setActiveTab("predicates")');
    console.log('  3. debugUtils.inspectState()');
  },
};

// Create a global reference for console use
window.debugUtils = debugUtils;

// Auto-run help on load
debugUtils.help();

console.log('%c510(k) Debug Utilities Ready', 'font-size: 14px; font-weight: bold; color: green;');

// Export for Node.js environments if needed
if (typeof module !== 'undefined') {
  module.exports = { debugUtils };
}

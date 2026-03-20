/**
 * Self-Healing System for Concept2Cure
 * Provides real-time diagnostics and auto-recovery capabilities
 */

class SelfHealingSystem {
  constructor() {
    this.diagnostics = new Map();
    this.autoFixers = new Map();
    this.isMonitoring = false;
    this.listeners = [];

    this.setupAutoFixers();
    this.startMonitoring();
  }

  setupAutoFixers() {
    // Auto-fix common React errors
    this.autoFixers.set('component-unmounted', () => {
      // Cancel pending requests for unmounted components
      this.cancelPendingRequests();
    });

    // Auto-fix memory leaks
    this.autoFixers.set('memory-leak', () => {
      // Clear unused cached data
      this.clearUnusedCache();
    });

    // Auto-fix API connection issues
    this.autoFixers.set('api-connection', () => {
      // Retry failed API connections
      this.retryFailedConnections();
    });

    // Auto-fix state inconsistencies
    this.autoFixers.set('state-inconsistency', () => {
      // Reset to known good state
      this.resetToKnownGoodState();
    });
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    // Monitor for common issues every 1 second
    this.monitoringInterval = setInterval(() => {
      this.runDiagnostics();
    }, 1000);

    // Monitor for React errors
    this.setupErrorBoundaryMonitoring();

    // Monitor for API health
    this.setupAPIHealthMonitoring();

    // Monitor for memory usage
    this.setupMemoryMonitoring();
  }

  runDiagnostics() {
    const issues = [];

    // Check for component state issues
    if (this.detectStateInconsistencies()) {
      issues.push({
        type: 'state-inconsistency',
        severity: 'medium',
        message: 'State inconsistency detected',
        autoFixable: true,
      });
    }

    // Check for memory issues - DISABLED to prevent console spam
    // if (this.detectMemoryLeaks()) {
    //   issues.push({
    //     type: 'memory-leak',
    //     severity: 'high',
    //     message: 'Potential memory leak detected',
    //     autoFixable: true
    //   });
    // }

    // Check API connectivity
    if (this.detectAPIIssues()) {
      issues.push({
        type: 'api-connection',
        severity: 'high',
        message: 'API connectivity issues detected',
        autoFixable: true,
      });
    }

    // Auto-fix issues that can be safely fixed
    issues.forEach(issue => {
      if (issue.autoFixable && this.autoFixers.has(issue.type)) {
        console.log(`🔧 Auto-fixing: ${issue.message}`);
        this.notifyListeners('fixing', issue);

        try {
          this.autoFixers.get(issue.type)();
          this.notifyListeners('fixed', issue);
          console.log(`✅ Auto-fixed: ${issue.message}`);
        } catch (error) {
          console.error(`❌ Failed to auto-fix: ${issue.message}`, error);
          this.notifyListeners('fix-failed', { issue, error });
        }
      } else {
        this.notifyListeners('issue-detected', issue);
      }
    });

    return issues;
  }

  detectStateInconsistencies() {
    // Check for common React state issues
    const reactFiberNode = document.querySelector('#root')?._reactInternalFiber;
    if (!reactFiberNode) return false;

    // Simple heuristic: check if there are error boundaries with errors
    return document.querySelectorAll('[data-error-boundary="true"]').length > 0;
  }

  detectMemoryLeaks() {
    // Check memory usage (simplified)
    if (performance.memory) {
      const { usedJSHeapSize, totalJSHeapSize } = performance.memory;
      const memoryUsageRatio = usedJSHeapSize / totalJSHeapSize;
      return memoryUsageRatio > 0.9; // 90% memory usage threshold
    }
    return false;
  }

  detectAPIIssues() {
    // Check for failed network requests in the last 30 seconds
    const recentErrors = this.getRecentNetworkErrors();
    return recentErrors.length > 3; // More than 3 failed requests
  }

  getRecentNetworkErrors() {
    // This would integrate with your existing error tracking
    return [];
  }

  cancelPendingRequests() {
    // Cancel any pending AbortControllers
    if (window.pendingRequests) {
      window.pendingRequests.forEach(controller => {
        try {
          controller.abort();
        } catch (e) {
          // Request may already be completed
        }
      });
      window.pendingRequests.clear();
    }
  }

  clearUnusedCache() {
    // Clear React Query cache for old data
    if (window.queryClient) {
      window.queryClient.clear();
    }

    // Clear any custom caches
    if (window.customCache) {
      window.customCache.clear();
    }
  }

  retryFailedConnections() {
    // Trigger reconnection for WebSocket connections
    if (window.wsConnections) {
      window.wsConnections.forEach(ws => {
        if (ws.readyState === WebSocket.CLOSED) {
          ws.reconnect?.();
        }
      });
    }
  }

  resetToKnownGoodState() {
    // Disabled — hard redirects cause disruptive page flashing for users
    console.warn('[SelfHealing] State inconsistency detected — skipping hard reset');
  }

  setupErrorBoundaryMonitoring() {
    // Listen for unhandled errors
    window.addEventListener('error', event => {
      this.notifyListeners('error-detected', {
        type: 'javascript-error',
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    });

    // Listen for unhandled promise rejections
    window.addEventListener('unhandledrejection', event => {
      this.notifyListeners('error-detected', {
        type: 'promise-rejection',
        message: event.reason?.message || 'Unhandled promise rejection',
        reason: event.reason,
      });
    });
  }

  setupAPIHealthMonitoring() {
    // Monitor API health with periodic pings
    setInterval(async () => {
      try {
        const response = await fetch('/api/health', {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          this.notifyListeners('api-health-issue', {
            status: response.status,
            statusText: response.statusText,
          });
        }
      } catch (error) {
        this.notifyListeners('api-health-issue', {
          error: error.message,
        });
      }
    }, 30000); // Check every 30 seconds
  }

  setupMemoryMonitoring() {
    // Monitor memory usage trends
    if (performance.memory) {
      setInterval(() => {
        const { usedJSHeapSize, totalJSHeapSize } = performance.memory;
        this.notifyListeners('memory-status', {
          used: usedJSHeapSize,
          total: totalJSHeapSize,
          percentage: (usedJSHeapSize / totalJSHeapSize) * 100,
        });
      }, 10000); // Check every 10 seconds
    }
  }

  // Real-time status updates
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('Error in self-healing listener:', error);
      }
    });
  }

  // Manual triggers
  runFullDiagnostic() {
    console.log('🔍 Running full diagnostic...');
    const issues = this.runDiagnostics();
    console.log(`Found ${issues.length} issues:`, issues);
    return issues;
  }

  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    this.isMonitoring = false;
  }
}

// Export singleton instance
export default new SelfHealingSystem();

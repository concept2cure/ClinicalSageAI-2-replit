import React, { useEffect, useState, useRef } from 'react';
import { optimizeMemory, getMemoryUsage } from '../../utils/memoryOptimizer';
import { initFreezeDetection, analyzeFreezeRisks } from '../../utils/freezeDetection';
import networkResilience from '../../utils/networkResilience';
import { EmergencyStability } from '../../utils/emergencyStability';
import { useToast } from '@/hooks/use-toast';

/**
 * StabilityEnabler component provides application stability enhancements
 * It monitors for UI freezes, optimizes memory usage, and handles network resilience
 */
export default function StabilityEnabler({ children }) {
  const { toast } = useToast();
  const [isStabilityEnabled, setIsStabilityEnabled] = useState(false);
  const [diagnosticData, setDiagnosticData] = useState(null);

  // References to maintain instance across renders
  const networkResilienceRef = useRef(null);
  const freezeDetectionRef = useRef(null);
  const stabilityMetricsRef = useRef({
    freezes: 0,
    memoryCleanups: 0,
    networkDisconnects: 0,
    severeFreezes: 0,
    lastMemoryUsage: null,
    risks: [],
  });

  // Run stability diagnostics to detect and log potential issues
  const runStabilityDiagnostics = () => {
    try {
      // Analyze freeze risks
      const freezeRiskAnalysis = analyzeFreezeRisks();

      // Get current memory metrics
      const memoryMetrics = getMemoryUsage();

      // Get freeze metrics
      const freezeMetrics = freezeDetectionRef.current?.getMetrics() || {};

      // Get network stats
      const networkStats = networkResilienceRef.current?.getStats() || {};
      const connectionQuality = networkResilienceRef.current?.getConnectionQuality() || 'unknown';

      // Determine if we need to run memory optimization
      const shouldOptimizeMemory =
        memoryMetrics && (memoryMetrics.percentUsed > 70 || freezeMetrics.severeFreezesCount > 0);

      // Run optimization if needed
      if (shouldOptimizeMemory) {
        optimizeMemory({
          aggressive: freezeMetrics.severeFreezesCount > 0,
          threshold: 75,
        });
        stabilityMetricsRef.current.memoryCleanups++;
      }

      // Compile diagnostic data
      const diagnostics = {
        timestamp: new Date().toISOString(),
        memory: memoryMetrics,
        freezes: freezeMetrics,
        network: {
          isOnline: networkResilienceRef.current?.isOnline() || navigator.onLine,
          connectionQuality,
          queueLength: networkResilienceRef.current?.getQueueLength() || 0,
          ...networkStats,
        },
        risks: freezeRiskAnalysis.risks,
        recommendations: [],
      };

      // Generate recommendations based on diagnostics
      if (freezeMetrics.severeFreezesCount > 2) {
        diagnostics.recommendations.push(
          'Multiple severe UI freezes detected. Consider reducing animations and complex DOM operations.'
        );
      }

      if (memoryMetrics && memoryMetrics.percentUsed > 80) {
        diagnostics.recommendations.push(
          'High memory usage detected. Consider implementing virtualization for large lists and data tables.'
        );
      }

      if (networkStats.failedRequests > networkStats.successfulRequests * 0.1) {
        diagnostics.recommendations.push(
          'High rate of network failures detected. Check for API endpoint issues or implement more robust error handling.'
        );
      }

      // Update local state
      setDiagnosticData(diagnostics);

      // Log diagnostics if there are issues
      if (diagnostics.recommendations.length > 0 || freezeRiskAnalysis.risks.length > 0) {
        console.warn('Stability issues detected:', diagnostics);
      }

      // Update metrics
      stabilityMetricsRef.current.lastMemoryUsage = memoryMetrics;
      stabilityMetricsRef.current.freezes = freezeMetrics.freezeCount || 0;
      stabilityMetricsRef.current.severeFreezes = freezeMetrics.severeFreezesCount || 0;
      stabilityMetricsRef.current.risks = freezeRiskAnalysis.risks;

      return diagnostics;
    } catch (error) {
      console.error('Error running stability diagnostics:', error);
      return null;
    }
  };

  useEffect(() => {
    console.log('🛡️ Initializing all stability features...');

    // First, apply the emergency stability patch to ensure baseline stability
    EmergencyStability.applyPatch();

    // Initialize network resilience
    networkResilienceRef.current = networkResilience.initNetworkResilience({
      onStatusChange: status => {
        if (!status.online) {
          stabilityMetricsRef.current.networkDisconnects++;

          toast({
            title: 'Network connection lost',
            description:
              'Working in offline mode. Changes will be synchronized when connection is restored.',
            variant: 'warning',
            duration: 5000,
          });
        } else if (status.queuedRequests > 0) {
          toast({
            title: 'Network connection restored',
            description: `Synchronizing ${status.queuedRequests} pending changes...`,
            variant: 'default',
            duration: 3000,
          });
        }
      },
      maxRetries: 3,
      retryDelay: 1000,
      useExponentialBackoff: true,
      criticalEndpoints: ['/api/auth', '/api/cer', '/api/health'],
    });

    // Initialize freeze detection with more detailed options
    freezeDetectionRef.current = initFreezeDetection({
      threshold: 2000, // 2 seconds
      severeFreezeThreshold: 5000, // 5 seconds is a severe freeze
      attemptRecovery: true,
      onFreeze: info => {
        console.warn(`UI freeze detected: ${Math.round(info.duration)}ms at ${info.timestamp}`);

        // If severe freeze, run memory optimization
        if (info.isSevere) {
          try {
            const result = optimizeMemory({
              aggressive: true,
              threshold: 50, // Lower threshold for severe freezes
            });

            if (result && result.success) {
              stabilityMetricsRef.current.memoryCleanups++;
              console.log('Memory optimization completed:', result);
            } else {
              console.warn(
                'Memory optimization during freeze recovery was not successful:',
                result?.reason || 'unknown reason'
              );
            }
          } catch (optimizeError) {
            console.error('Memory optimization failed during freeze recovery:', optimizeError);
            // Fall back to simpler cleanup mechanisms
            try {
              // Simple cache clearing as fallback
              if (window.caches && typeof caches.keys === 'function') {
                caches
                  .keys()
                  .then(keys => {
                    keys.forEach(key => {
                      if (key.includes('temp')) caches.delete(key);
                    });
                  })
                  .catch(() => {});
              }
            } catch (fallbackError) {
              console.error('Even fallback cleanup failed:', fallbackError);
            }
          }
        }
      },
      onSevereFreeze: info => {
        // Show toast for severe freezes
        toast({
          title: 'Performance issue detected',
          description:
            'Application performance was temporarily affected. Stability measures have been applied.',
          variant: 'warning',
          duration: 5000,
        });

        // Run diagnostics after severe freeze
        runStabilityDiagnostics();
      },
    });

    // Run initial memory optimization
    optimizeMemory();

    // Schedule regular stability checks
    const stabilityCheckInterval = setInterval(() => {
      runStabilityDiagnostics();
    }, 120000); // Every 2 minutes

    // Schedule more frequent memory optimizations
    const memoryInterval = setInterval(() => {
      optimizeMemory();
    }, 60000); // Every minute

    // Initial diagnostics after a short delay
    setTimeout(runStabilityDiagnostics, 5000);

    setIsStabilityEnabled(true);
    console.log('✅ Application stability measures initialized');

    // Cleanup function
    return () => {
      freezeDetectionRef.current?.cleanup();
      networkResilienceRef.current?.cleanup();
      clearInterval(memoryInterval);
      clearInterval(stabilityCheckInterval);
    };
  }, []);

  // Expose diagnostics method to window for debugging
  useEffect(() => {
    if (isStabilityEnabled) {
      window.__stabilityDiagnostics = runStabilityDiagnostics;
      window.__forceClearMemory = () => optimizeMemory({ aggressive: true });

      return () => {
        delete window.__stabilityDiagnostics;
        delete window.__forceClearMemory;
      };
    }
  }, [isStabilityEnabled]);

  return <>{children}</>;
}

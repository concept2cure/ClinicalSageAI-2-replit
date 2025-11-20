import { useState, useEffect } from 'react';

/**
 * Hook to monitor application health and performance
 * Connects to a shared worker for coordinated monitoring
 */
export const useHealthMonitor = (options = {}) => {
  const [status, setStatus] = useState('initializing');
  const [metrics, setMetrics] = useState({});
  const { interval = 10000, critical = false } = options;

  useEffect(() => {
    let worker;
    try {
      // Try to connect to shared worker if available
      if (window.SharedWorker) {
        worker = new SharedWorker('/src/workers/healthMonitor.worker.js');

        worker.port.onmessage = event => {
          if (event.data.type === 'health_update') {
            setStatus(event.data.status);
            setMetrics(event.data.metrics);
          }
        };

        worker.port.start();

        // Register this component
        worker.port.postMessage({
          type: 'register',
          componentId: Math.random().toString(36).substr(2, 9),
          critical,
        });

        console.log('Connected to health monitor shared worker');
      } else {
        // Fallback to local monitoring
        console.log('SharedWorker not available, using local health monitoring');
        const intervalId = setInterval(() => {
          // Basic health check
          const memory =
            window.performance && window.performance.memory
              ? window.performance.memory
              : { usedJSHeapSize: 0, totalJSHeapSize: 0 };

          setMetrics({
            memory: {
              used: memory.usedJSHeapSize,
              total: memory.totalJSHeapSize,
            },
            timestamp: Date.now(),
          });

          setStatus('healthy');
        }, interval);

        return () => clearInterval(intervalId);
      }
    } catch (err) {
      console.error('Failed to initialize health monitor:', err);
      setStatus('failed');
    }

    return () => {
      if (worker && worker.port) {
        worker.port.postMessage({ type: 'unregister' });
      }
    };
  }, [interval, critical]);

  // Methods to report issues
  const reportProblem = problem => {
    if (worker && worker.port) {
      worker.port.postMessage({
        type: 'report_problem',
        problem,
      });
    }

    console.warn('Health monitor problem:', problem);
  };

  const reportRecovery = () => {
    if (worker && worker.port) {
      worker.port.postMessage({
        type: 'report_recovery',
      });
    }

    console.log('Health monitor recovery reported');
  };

  return {
    status,
    metrics,
    reportProblem,
    reportRecovery,
  };
};

export default useHealthMonitor;

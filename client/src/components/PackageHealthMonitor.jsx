
import React, { useState, useEffect } from 'react';
import { packageMonitor } from '../services/packageMonitorService.js';
import { dependencyLoader } from '../utils/dependencyLoader.js';

export default function PackageHealthMonitor({ showDetails = false }) {
  const [healthStatus, setHealthStatus] = useState(null);
  const [packageStatus, setPackageStatus] = useState(null);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    const updateStatus = async () => {
      try {
        const health = await dependencyLoader.healthCheck();
        const packages = packageMonitor.getStatus();
        
        setHealthStatus(health);
        setPackageStatus(packages);
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Health status update failed:', error);
      }
    };

    // Initial update
    updateStatus();

    // Set up periodic updates
    const interval = setInterval(updateStatus, 10000); // Every 10 seconds

    // Listen for package loading events
    const handlePackageFailed = (event) => {
      updateStatus();
    };

    const handlePackageRecovered = (event) => {
      updateStatus();
    };

    window.addEventListener('packageLoadingFailed', handlePackageFailed);
    window.addEventListener('packageLoadingRecovered', handlePackageRecovered);

    return () => {
      clearInterval(interval);
      window.removeEventListener('packageLoadingFailed', handlePackageFailed);
      window.removeEventListener('packageLoadingRecovered', handlePackageRecovered);
    };
  }, []);

  if (!healthStatus || !packageStatus) {
    return null;
  }

  const hasIssues = packageStatus.failedPackages > 0 || healthStatus.testLoad === 'failed';
  const isEmergencyMode = packageMonitor.isEmergencyFallbackActive();

  if (!showDetails && !hasIssues) {
    // Show minimal indicator when everything is fine
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="flex items-center space-x-2 bg-green-100 border border-green-300 rounded-lg px-3 py-2 shadow-sm">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-green-700 font-medium">Packages OK</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className={`border rounded-lg shadow-lg p-4 ${
        hasIssues 
          ? 'bg-yellow-50 border-yellow-300' 
          : 'bg-green-50 border-green-300'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              hasIssues ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'
            }`}></div>
            <h3 className="font-semibold text-sm">
              {hasIssues ? 'Package Issues Detected' : 'All Systems Operational'}
            </h3>
          </div>
          <button
            onClick={() => setIsMonitoring(!isMonitoring)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {isMonitoring ? 'Hide' : 'Show'}
          </button>
        </div>

        {isMonitoring && (
          <>
            {/* Emergency Fallback Warning */}
            {isEmergencyMode && (
              <div className="mb-3 p-2 bg-orange-100 border border-orange-300 rounded-md">
                <div className="flex items-center space-x-1">
                  <span className="text-xs">⚠️</span>
                  <span className="text-xs font-semibold text-orange-700">
                    Emergency Fallback Active
                  </span>
                </div>
                <p className="text-xs text-orange-600 mt-1">
                  Document editor is using fallback components to ensure functionality.
                </p>
              </div>
            )}

            {/* Package Status */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span>Total Packages:</span>
                <span className="font-mono">{packageStatus.totalPackages}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span>Available:</span>
                <span className="font-mono text-green-600">{packageStatus.availablePackages}</span>
              </div>
              {packageStatus.failedPackages > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span>Failed:</span>
                  <span className="font-mono text-red-600">{packageStatus.failedPackages}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-xs">
                <span>Loaded Components:</span>
                <span className="font-mono">{healthStatus.loadedComponents}</span>
              </div>
            </div>

            {/* Failed Packages List */}
            {packageStatus.failedList.length > 0 && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-md">
                <div className="text-xs font-semibold text-red-700 mb-1">Failed Packages:</div>
                <div className="space-y-1">
                  {packageStatus.failedList.map((pkg, index) => (
                    <div key={index} className="text-xs font-mono text-red-600 truncate">
                      {pkg}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-3 flex space-x-2">
              <button
                onClick={() => window.location.reload()}
                className="text-xs bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700"
              >
                Reload Page
              </button>
              {isEmergencyMode && (
                <button
                  onClick={() => {
                    packageMonitor.clearEmergencyFallback();
                    window.location.reload();
                  }}
                  className="text-xs bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700"
                >
                  Retry Load
                </button>
              )}
            </div>

            {/* Last Update */}
            <div className="mt-2 text-xs text-gray-500">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { PackageHealthMonitor };

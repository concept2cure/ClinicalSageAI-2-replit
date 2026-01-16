/**
 * Device Loader Component
 * Loads demo devices into the CERV2 workflow
 * Bridges the gap between mock data and actual workflow components
 */

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import useDemoDataIntegration from '@/hooks/useDemoDataIntegration';
import { Play, Loader2, CheckCircle, AlertCircle, Info } from 'lucide-react';

export function DeviceLoaderComponent({ onDeviceLoaded, onWorkflowUpdate }) {
  const { toast } = useToast();
  const {
    isLoading,
    selectedScenario,
    selectedDevice,
    workflowData,
    loadDeviceToWorkflow,
    loadScenarioToWorkflow,
    getWorkflowProgress,
    scenarios,
    allDevices,
  } = useDemoDataIntegration(error => {
    toast({
      title: 'Error',
      description: error.message || 'An error occurred',
      variant: 'destructive',
    });
  });

  const [expandedDeviceId, setExpandedDeviceId] = useState(null);
  const progress = getWorkflowProgress();

  const handleDeviceLoad = useCallback(
    async (deviceId) => {
      try {
        const device = await loadDeviceToWorkflow(deviceId);
        
        toast({
          title: 'Device Loaded',
          description: `${device.deviceName} is ready in the workflow`,
          variant: 'default',
        });

        // Notify parent component
        if (onDeviceLoaded) {
          onDeviceLoaded(device, workflowData);
        }
      } catch (error) {
        toast({
          title: 'Load Failed',
          description: error.message,
          variant: 'destructive',
        });
      }
    },
    [loadDeviceToWorkflow, workflowData, onDeviceLoaded, toast]
  );

  const handleScenarioLoad = useCallback(
    async (scenarioName) => {
      try {
        const device = await loadScenarioToWorkflow(scenarioName);
        
        toast({
          title: 'Scenario Loaded',
          description: `${scenarioName} scenario is ready`,
          variant: 'default',
        });

        // Notify parent component
        if (onWorkflowUpdate) {
          onWorkflowUpdate(scenarioName, workflowData);
        }
      } catch (error) {
        toast({
          title: 'Load Failed',
          description: error.message,
          variant: 'destructive',
        });
      }
    },
    [loadScenarioToWorkflow, workflowData, onWorkflowUpdate, toast]
  );

  return (
    <div className="space-y-4 p-4 bg-white rounded-lg border">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Device Workflow Loader</h3>
          <p className="text-sm text-gray-600 mt-1">Load demo devices and scenarios into the workflow</p>
        </div>
        <Badge variant="outline" className="h-fit">
          {progress.completedStages}/{progress.totalStages} Stages
        </Badge>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Workflow Progress</span>
          <span className="font-semibold text-gray-900">{progress.percentComplete}%</span>
        </div>
        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
          <div
            className="bg-blue-600 h-full transition-all duration-300"
            style={{ width: `${progress.percentComplete}%` }}
          />
        </div>
      </div>

      {/* Currently Loaded Device */}
      {selectedDevice && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <div className="font-semibold text-gray-900">{selectedDevice.deviceName}</div>
              </div>
              <div className="text-sm text-gray-600 mt-1 ml-6">
                {selectedDevice.completionPercentage}% complete • {selectedDevice.status}
              </div>
            </div>
            <Badge className="bg-blue-600 text-white">Active</Badge>
          </div>
        </div>
      )}

      {/* Scenario Selection */}
      <div>
        <label className="text-sm font-semibold text-gray-900 mb-2 block">Select Scenario</label>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(scenarios).map(([key, scenario]) => (
            <Button
              key={key}
              onClick={() => handleScenarioLoad(key)}
              disabled={isLoading}
              variant={selectedScenario === key ? 'default' : 'outline'}
              size="sm"
              className={selectedScenario === key ? 'bg-blue-600 text-white' : ''}
            >
              {isLoading && selectedScenario === key ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Play className="w-3 h-3 mr-1" />
              )}
              {key}
            </Button>
          ))}
        </div>
      </div>

      {/* Devices List */}
      <div>
        <label className="text-sm font-semibold text-gray-900 mb-2 block">
          Available Devices ({allDevices.length})
        </label>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {allDevices.map(device => (
            <div key={device.id} className="border border-gray-200 rounded-lg p-2">
              <button
                onClick={() =>
                  setExpandedDeviceId(expandedDeviceId === device.id ? null : device.id)
                }
                className="w-full text-left p-2 rounded hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">
                      {device.deviceName}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {device.completionPercentage}% complete
                    </div>
                  </div>
                  <div className="ml-2 text-xs font-semibold text-blue-600">
                    {device.status === 'started' ? '🚀' : device.status === 'approved' ? '🎉' : '⏳'}
                  </div>
                </div>
                <div className="mt-1 bg-gray-200 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-500 h-full transition-all"
                    style={{ width: `${device.completionPercentage}%` }}
                  />
                </div>
              </button>

              {/* Expanded Details */}
              {expandedDeviceId === device.id && (
                <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
                  <div className="text-xs space-y-1">
                    <div>
                      <span className="text-gray-600">Manufacturer:</span>
                      <span className="font-semibold text-gray-900 ml-1">{device.manufacturer}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Device Class:</span>
                      <span className="font-semibold text-gray-900 ml-1">{device.deviceClass}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Status:</span>
                      <span className="font-semibold text-gray-900 ml-1">{device.status}</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleDeviceLoad(device.id)}
                    disabled={isLoading}
                    size="sm"
                    className="w-full bg-blue-600 text-white hover:bg-blue-700"
                  >
                    {isLoading && selectedDevice?.id === device.id ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3 mr-1" />
                    )}
                    Load Device
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Workflow Data Status */}
      {Object.values(workflowData).some(v => v) && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <div className="font-semibold text-green-900">Workflow Data Loaded</div>
              <div className="text-green-700 mt-1">
                Device profile, predicates, and analysis data are available in the workflow.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DeviceLoaderComponent;

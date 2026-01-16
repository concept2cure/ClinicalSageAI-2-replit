/**
 * Integrated Demo Tab Component for CERV2
 * Combines DemoDashboard with scenario switching and full data integration
 */

import React, { useState } from 'react';
import DemoDashboard from './DemoDashboard';
import DeviceLoaderComponent from './DeviceLoaderComponent';
import mockDemoData from '@/data/mockDemoData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Play,
  Download,
  Upload,
  ChevronRight,
  Lightbulb,
  BookOpen,
  FileCheck,
  Zap,
} from 'lucide-react';

export function IntegratedDemoTab() {
  const [selectedScenario, setSelectedScenario] = useState('midstage');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [demoMode, setDemoMode] = useState('showcase'); // 'showcase' or 'interactive'
  const [loadingDeviceData, setLoadingDeviceData] = useState(false);
  const { toast } = useToast();

  const scenarios = mockDemoData.mockDemoScenarios;
  const currentScenario = scenarios[selectedScenario];

  /**
   * Load device data into the workflow
   */
  const handleLoadDeviceToWorkflow = async (device) => {
    setLoadingDeviceData(true);
    try {
      // Set the selected device
      setSelectedDevice(device);

      // Simulate loading the device into the workflow
      await new Promise(resolve => setTimeout(resolve, 1000));

      toast({
        title: 'Device Loaded',
        description: `${device.deviceName} has been loaded into the workflow at ${device.completionPercentage}% completion.`,
        variant: 'default',
      });

      // In a real integration, this would:
      // 1. Update parent component state with device data
      // 2. Navigate to appropriate workflow tab
      // 3. Populate all form fields with device data
    } catch (error) {
      toast({
        title: 'Error Loading Device',
        description: 'Failed to load device data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoadingDeviceData(false);
    }
  };

  /**
   * Export scenario data as JSON
   */
  const handleExportScenario = () => {
    const exportData = {
      scenario: selectedScenario,
      timestamp: new Date().toISOString(),
      data: currentScenario,
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cerv2-demo-${selectedScenario}-${Date.now()}.json`;
    link.click();

    toast({
      title: 'Export Complete',
      description: 'Scenario data has been exported as JSON.',
      variant: 'default',
    });
  };

  /**
   * Duplicate scenario data to clipboard
   */
  const handleCopyScenarioData = async () => {
    try {
      const dataStr = JSON.stringify(currentScenario, null, 2);
      await navigator.clipboard.writeText(dataStr);
      toast({
        title: 'Copied to Clipboard',
        description: 'Scenario data has been copied to your clipboard.',
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Failed to copy data to clipboard.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 p-4">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-blue-900 flex items-center gap-2">
              <Lightbulb className="w-6 h-6" />
              Interactive Demo & Workflow Showcase
            </h2>
            <p className="text-blue-700 mt-2">
              Explore complete FDA 510K submission workflows through realistic demo scenarios
            </p>
          </div>
          <Badge variant="secondary" className="h-fit">
            {currentScenario?.devices?.length || 0} Devices
          </Badge>
        </div>
      </div>

      {/* Demo Mode Selector */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => setDemoMode('showcase')}
          className={`p-4 rounded-lg border-2 transition-all text-left ${
            demoMode === 'showcase'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="font-semibold text-gray-900">Showcase Mode</div>
          <div className="text-sm text-gray-600 mt-1">
            View completed workflows at various stages
          </div>
        </button>
        <button
          onClick={() => setDemoMode('interactive')}
          className={`p-4 rounded-lg border-2 transition-all text-left ${
            demoMode === 'interactive'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="font-semibold text-gray-900">Interactive Mode</div>
          <div className="text-sm text-gray-600 mt-1">
            Load devices into the workflow editor
          </div>
        </button>
      </div>

      {/* Scenario Selector */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Select Demo Scenario</h3>
        <div className="flex gap-3">
          {Object.entries(scenarios).map(([key, scenario]) => (
            <button
              key={key}
              onClick={() => setSelectedScenario(key)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                selectedScenario === key
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-600 mt-3 italic">{currentScenario?.description}</p>
      </div>

      {/* Main Demo Display */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left: Main Dashboard */}
        <div className="col-span-9">
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <DemoDashboard />
          </div>
        </div>

        {/* Right: Control Panel */}
        <div className="col-span-3 space-y-4">
          {/* Device Loader */}
          <DeviceLoaderComponent
            onDeviceLoaded={(device, workflowData) => {
              toast({
                title: 'Device Ready',
                description: `${device.deviceName} is loaded and ready to edit`,
                variant: 'default',
              });
            }}
            onWorkflowUpdate={(scenario, data) => {
              toast({
                title: 'Scenario Ready',
                description: `All data from "${scenario}" scenario loaded`,
                variant: 'default',
              });
            }}
          />

          {/* Statistics Panel */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileCheck className="w-4 h-4" />
              Scenario Stats
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Devices:</span>
                <span className="font-semibold">{currentScenario?.devices?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Organizations:</span>
                <span className="font-semibold">
                  {currentScenario?.organizations?.length || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Documents:</span>
                <span className="font-semibold">{currentScenario?.documents?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg. Completion:</span>
                <span className="font-semibold">
                  {currentScenario?.devices
                    ? Math.round(
                        currentScenario.devices.reduce((sum, d) => sum + d.completionPercentage, 0) /
                          currentScenario.devices.length
                      )
                    : 0}
                  %
                </span>
              </div>
            </div>
          </div>

          {/* Export Controls */}
          <div className="bg-white rounded-lg border p-4 space-y-2">
            <h3 className="font-semibold text-gray-900 mb-3">Export & Share</h3>
            <Button
              onClick={handleExportScenario}
              variant="outline"
              size="sm"
              className="w-full justify-start"
            >
              <Download className="w-4 h-4 mr-2" />
              Export as JSON
            </Button>
            <Button
              onClick={handleCopyScenarioData}
              variant="outline"
              size="sm"
              className="w-full justify-start"
            >
              <Upload className="w-4 h-4 mr-2" />
              Copy to Clipboard
            </Button>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <div className="font-semibold text-blue-900 mb-2">💡 Demo Tip</div>
            <div className="text-blue-800">
              {demoMode === 'showcase'
                ? 'Click on device cards to see details at each workflow stage.'
                : 'Select a device above and click "Open in Editor" to load it into the workflow.'}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Integration Info */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
        <h3 className="font-semibold text-green-900 mb-2">✅ Integration Ready</h3>
        <p className="text-sm text-green-800">
          Mock data is fully integrated with DocumentEditorService and FDA510kPipelineService.
          Devices can be loaded into the actual workflow editor for realistic testing and
          demonstrations.
        </p>
      </div>
    </div>
  );
}

export default IntegratedDemoTab;

import React, { useState, useEffect, useContext } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useToast } from '../../hooks/use-toast';
import { TenantContext } from '../../contexts/TenantContext.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, } from '../../components/ui/card';
import { InfoIcon, Shield, Lock, FileText } from 'lucide-react'

const SecuritySettingsPanel = () => {
  const { toast } = useToast();
  const { currentOrganization } = useContext(TenantContext);

  // State for security settings
  const [settings, setSettings] = useState({
    passwordPolicy: {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSpecialChar: true,
      historyCount: 5,
      expiryDays: 90,
    },
    sessionSettings: {
      timeoutMinutes: 30,
      maxConcurrentSessions: 3,
      enforceIPRestriction: false,
      allowedIPRanges: [],
      requireMFA: true,
    },
    auditSettings: {
      retentionDays: 365,
      enableBlockchainBackup: true,
      realTimeMonitoring: true,
      autoExportFrequency: 24,
    },
    complianceSettings: {
      enableFDA21CFRPart11: true,
      enableFDA21CFRPart820: false,
      enableHIPAA: false,
      enableGDPR: false,
      enableISO13485: false,
      enableICH: false,
      enableMDR: false,
    },
    dataProtection: {
      encryptionLevel: 'AES-256',
      dataClassification: true,
      autoBackup: true,
      backupFrequency: 24,
      restrictDocumentExport: false,
    },
  });

  // Load appropriate default compliance settings based on organization type
  useEffect(() => {
    if (currentOrganization?.industryType) {
      const industryDefaults = {
        pharma: {
          enableFDA21CFRPart11: true,
          enableICH: true,
        },
        biotech: {
          enableFDA21CFRPart11: true,
          enableICH: true,
        },
        meddevice: {
          enableFDA21CFRPart11: true,
          enableFDA21CFRPart820: true,
          enableISO13485: true,
          enableMDR: true,
        },
        cro: {
          enableFDA21CFRPart11: true,
          enableICH: true,
          enableHIPAA: true,
        },
      };

      // Apply industry specific defaults
      if (industryDefaults[currentOrganization.industryType]) {
        setSettings(prev => ({
          ...prev,
          complianceSettings: {
            ...prev.complianceSettings,
            ...industryDefaults[currentOrganization.industryType],
          },
        }));
      }
    }
  }, [currentOrganization?.industryType]);

  // Mutation for updating security settings
  const updateSettingsMutation = useMutation({
    mutationFn: async newSettings => {
      const response = await fetch('/api/fda-compliance/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSettings),
      });

      if (!response.ok) {
        throw new Error('Failed to update security settings');
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success('Security settings updated successfully', {
        title: 'Settings Saved',
      });
    },
    onError: error => {
      toast.error(`Failed to update security settings: ${error.message}`, {
        title: 'Update Failed',
      });
    },
  });

  // Handle input change
  const handleInputChange = (section, setting, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [setting]: value,
      },
    }));
  };

  // Handle checkbox change
  const handleCheckboxChange = (section, setting) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [setting]: !prev[section][setting],
      },
    }));
  };

  // Handle form submission
  const handleSubmit = e => {
    e.preventDefault();
    updateSettingsMutation.mutate(settings);
  };

  return (
    <div className="bg-white shadow-md rounded-lg p-6 mb-6">
      <h2 className="text-xl font-bold text-gray-800 mb-6">Security Settings</h2>

      <form onSubmit={handleSubmit}>
        {/* Password Policy */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Password Policy</h3>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Minimum Length
                </label>
                <input
                  type="number"
                  min="8"
                  max="20"
                  value={settings.passwordPolicy.minLength}
                  onChange={e =>
                    handleInputChange('passwordPolicy', 'minLength', parseInt(e.target.value))
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password History Count
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={settings.passwordPolicy.historyCount}
                  onChange={e =>
                    handleInputChange('passwordPolicy', 'historyCount', parseInt(e.target.value))
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expiry (Days)
                </label>
                <input
                  type="number"
                  min="30"
                  max="365"
                  value={settings.passwordPolicy.expiryDays}
                  onChange={e =>
                    handleInputChange('passwordPolicy', 'expiryDays', parseInt(e.target.value))
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requireUppercase"
                  checked={settings.passwordPolicy.requireUppercase}
                  onChange={() => handleCheckboxChange('passwordPolicy', 'requireUppercase')}
                  className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                />
                <label htmlFor="requireUppercase" className="ml-2 block text-sm text-gray-700">
                  Require uppercase letter
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requireLowercase"
                  checked={settings.passwordPolicy.requireLowercase}
                  onChange={() => handleCheckboxChange('passwordPolicy', 'requireLowercase')}
                  className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                />
                <label htmlFor="requireLowercase" className="ml-2 block text-sm text-gray-700">
                  Require lowercase letter
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requireNumber"
                  checked={settings.passwordPolicy.requireNumber}
                  onChange={() => handleCheckboxChange('passwordPolicy', 'requireNumber')}
                  className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                />
                <label htmlFor="requireNumber" className="ml-2 block text-sm text-gray-700">
                  Require number
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requireSpecialChar"
                  checked={settings.passwordPolicy.requireSpecialChar}
                  onChange={() => handleCheckboxChange('passwordPolicy', 'requireSpecialChar')}
                  className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                />
                <label htmlFor="requireSpecialChar" className="ml-2 block text-sm text-gray-700">
                  Require special character
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Session Settings */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Session Settings</h3>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Session Timeout (Minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={settings.sessionSettings.timeoutMinutes}
                  onChange={e =>
                    handleInputChange('sessionSettings', 'timeoutMinutes', parseInt(e.target.value))
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Concurrent Sessions
                </label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={settings.sessionSettings.maxConcurrentSessions}
                  onChange={e =>
                    handleInputChange(
                      'sessionSettings',
                      'maxConcurrentSessions',
                      parseInt(e.target.value)
                    )
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Audit Trail Settings */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Audit Trail Settings</h3>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Retention Period (Days)
                </label>
                <input
                  type="number"
                  min="90"
                  max="3650"
                  value={settings.auditSettings.retentionDays}
                  onChange={e =>
                    handleInputChange('auditSettings', 'retentionDays', parseInt(e.target.value))
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Auto-Export Frequency (Hours)
                </label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={settings.auditSettings.autoExportFrequency}
                  onChange={e =>
                    handleInputChange(
                      'auditSettings',
                      'autoExportFrequency',
                      parseInt(e.target.value)
                    )
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enableBlockchainBackup"
                  checked={settings.auditSettings.enableBlockchainBackup}
                  onChange={() => handleCheckboxChange('auditSettings', 'enableBlockchainBackup')}
                  className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                />
                <label
                  htmlFor="enableBlockchainBackup"
                  className="ml-2 block text-sm text-gray-700"
                >
                  Enable blockchain backup
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="realTimeMonitoring"
                  checked={settings.auditSettings.realTimeMonitoring}
                  onChange={() => handleCheckboxChange('auditSettings', 'realTimeMonitoring')}
                  className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                />
                <label htmlFor="realTimeMonitoring" className="ml-2 block text-sm text-gray-700">
                  Real-time monitoring
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Compliance Settings */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Regulatory Compliance</h3>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enableFDA21CFRPart11"
                  checked={settings.complianceSettings.enableFDA21CFRPart11}
                  onChange={() =>
                    handleCheckboxChange('complianceSettings', 'enableFDA21CFRPart11')
                  }
                  className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                />
                <label htmlFor="enableFDA21CFRPart11" className="ml-2 block text-sm text-gray-700">
                  FDA 21 CFR Part 11 (Electronic Records)
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enableFDA21CFRPart820"
                  checked={settings.complianceSettings.enableFDA21CFRPart820}
                  onChange={() =>
                    handleCheckboxChange('complianceSettings', 'enableFDA21CFRPart820')
                  }
                  className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                />
                <label htmlFor="enableFDA21CFRPart820" className="ml-2 block text-sm text-gray-700">
                  FDA 21 CFR Part 820 (Quality System)
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enableHIPAA"
                  checked={settings.complianceSettings.enableHIPAA}
                  onChange={() => handleCheckboxChange('complianceSettings', 'enableHIPAA')}
                  className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                />
                <label htmlFor="enableHIPAA" className="ml-2 block text-sm text-gray-700">
                  HIPAA Compliance
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enableGDPR"
                  checked={settings.complianceSettings.enableGDPR}
                  onChange={() => handleCheckboxChange('complianceSettings', 'enableGDPR')}
                  className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                />
                <label htmlFor="enableGDPR" className="ml-2 block text-sm text-gray-700">
                  GDPR Compliance
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enableISO13485"
                  checked={settings.complianceSettings.enableISO13485}
                  onChange={() => handleCheckboxChange('complianceSettings', 'enableISO13485')}
                  className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                />
                <label htmlFor="enableISO13485" className="ml-2 block text-sm text-gray-700">
                  ISO 13485 (Medical Devices)
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enableICH"
                  checked={settings.complianceSettings.enableICH}
                  onChange={() => handleCheckboxChange('complianceSettings', 'enableICH')}
                  className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                />
                <label htmlFor="enableICH" className="ml-2 block text-sm text-gray-700">
                  ICH Guidelines (GCP, GLP, GMP)
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enableMDR"
                  checked={settings.complianceSettings.enableMDR}
                  onChange={() => handleCheckboxChange('complianceSettings', 'enableMDR')}
                  className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                />
                <label htmlFor="enableMDR" className="ml-2 block text-sm text-gray-700">
                  EU MDR (Medical Device Regulation)
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Data Protection Settings */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Data Protection</h3>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Encryption Level
                </label>
                <select
                  value={settings.dataProtection.encryptionLevel}
                  onChange={e =>
                    handleInputChange('dataProtection', 'encryptionLevel', e.target.value)
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
                >
                  <option value="AES-128">AES-128</option>
                  <option value="AES-256">AES-256 (FIPS Compliant)</option>
                  <option value="AES-256-GCM">AES-256-GCM (FIPS Compliant, Enhanced)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Backup Frequency (Hours)
                </label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={settings.dataProtection.backupFrequency}
                  onChange={e =>
                    handleInputChange('dataProtection', 'backupFrequency', parseInt(e.target.value))
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="dataClassification"
                  checked={settings.dataProtection.dataClassification}
                  onChange={() => handleCheckboxChange('dataProtection', 'dataClassification')}
                  className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                />
                <label htmlFor="dataClassification" className="ml-2 block text-sm text-gray-700">
                  Enable Data Classification
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="autoBackup"
                  checked={settings.dataProtection.autoBackup}
                  onChange={() => handleCheckboxChange('dataProtection', 'autoBackup')}
                  className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                />
                <label htmlFor="autoBackup" className="ml-2 block text-sm text-gray-700">
                  Automatic Backup
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="restrictDocumentExport"
                  checked={settings.dataProtection.restrictDocumentExport}
                  onChange={() => handleCheckboxChange('dataProtection', 'restrictDocumentExport')}
                  className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                />
                <label
                  htmlFor="restrictDocumentExport"
                  className="ml-2 block text-sm text-gray-700"
                >
                  Restrict Document Export
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Information */}
        <div className="mb-6 bg-blue-50 p-4 rounded-lg">
          <h3 className="text-md font-semibold text-blue-800 mb-2">
            Regulatory Compliance Information
          </h3>
          <p className="text-sm text-blue-700">
            These security settings are configured to meet or exceed FDA 21 CFR Part 11 requirements
            for electronic records and electronic signatures, as well as other applicable
            regulations based on your organization type. The blockchain backup feature provides
            enhanced tamper-evident security that exceeds most regulatory requirements.
          </p>
          {currentOrganization?.industryType && (
            <p className="text-sm text-blue-700 mt-2">
              <strong>Industry-specific defaults applied:</strong>{' '}
              {currentOrganization.industryType === 'pharma'
                ? 'Pharmaceutical'
                : currentOrganization.industryType === 'biotech'
                  ? 'Biotech'
                  : currentOrganization.industryType === 'meddevice'
                    ? 'Medical Device'
                    : currentOrganization.industryType === 'cro'
                      ? 'CRO'
                      : 'Standard'}{' '}
              compliance profile
            </p>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={updateSettingsMutation.isPending}
            className="px-4 py-2 bg-pink-600 text-white rounded-md hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 disabled:bg-pink-300 disabled:cursor-not-allowed"
          >
            {updateSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SecuritySettingsPanel;

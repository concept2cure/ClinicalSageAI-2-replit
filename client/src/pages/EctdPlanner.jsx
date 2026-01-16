import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Settings, Clock, AlertTriangle, Info } from 'lucide-react'
import { useTenant } from '../../contexts/TenantContext.tsx';
import { OrganizationSwitcher } from '../../components/tenant/OrganizationSwitcher.tsx';
import { ClientWorkspaceSwitcher } from '../../components/tenant/ClientWorkspaceSwitcher.tsx';
import { useNetworkResilience } from '../../hooks/useNetworkResilience.jsx';
import { useHealthMonitor } from '../../hooks/useHealthMonitor.jsx';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

export default function EctdPlanner({ submissionId }) {
  const [outline, setOutline] = useState(null);
  const [missing, setMissing] = useState([]);
  const [hint, setHint] = useState('');
  const [activeTab, setActiveTab] = useState('planner');
  const [securitySettings, setSecuritySettings] = useState(null);
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);

  // Get tenant context
  const tenantContext = useTenant();
  const { currentOrganization, currentClientWorkspace, getTenantHeaders } = tenantContext || {};

  // Network resilience hooks
  const { request, isNetworkError, retryRequest } = useNetworkResilience();
  const healthStatus = useHealthMonitor();
  const { toast } = useToast();

  // Load eCTD outline data
  useEffect(() => {
    if (submissionId) {
      load();
    }
  }, [submissionId, currentOrganization, currentClientWorkspace]);

  async function load() {
    try {
      const { data } = await request(
        () =>
          axios.get(`/api/ectd/${submissionId}/outline`, {
            headers: getTenantHeaders ? getTenantHeaders() : {},
          }),
        {
          operation: 'fetch-ectd-outline',
          errorMessage: 'Failed to load eCTD outline',
        }
      );

      setOutline(data.outline);
      setMissing(data.missing);
      setHint(data.aiHint);
    } catch (error) {
      console.error('Error loading eCTD outline:', error);
      toast({
        title: 'Error',
        description: 'Failed to load eCTD outline. Please try again.',
        variant: 'destructive',
      });
    }
  }

  // Load security settings when tab changes to security
  useEffect(() => {
    if (activeTab === 'security' && currentClientWorkspace?.id) {
      loadSecuritySettings();
    }
  }, [activeTab, currentClientWorkspace]);

  // Load security settings
  async function loadSecuritySettings() {
    if (!currentClientWorkspace?.id) return;

    setIsSettingsLoading(true);
    try {
      const { data } = await request(
        () =>
          axios.get(`/api/clients/${currentClientWorkspace.id}/security-settings`, {
            headers: getTenantHeaders ? getTenantHeaders() : {},
          }),
        {
          operation: 'fetch-security-settings',
          errorMessage: 'Failed to load security settings',
        }
      );

      setSecuritySettings(
        data || {
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
            enforceIpLock: false,
          },
          documentSettings: {
            requireApproval: true,
            digitalSignaturesEnabled: true,
            auditTrailEnabled: true,
          },
        }
      );
    } catch (error) {
      console.error('Error loading security settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load security settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSettingsLoading(false);
    }
  }

  // Loading state
  if (!outline && activeTab === 'planner') {
    return (
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">eCTD Planner</h1>
          <div className="flex items-center space-x-4">
            <OrganizationSwitcher />
            <ClientWorkspaceSwitcher />
          </div>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="grid w-full md:w-auto grid-cols-3 md:grid-cols-3">
            <TabsTrigger value="planner">eCTD Planner</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="mt-6">
          <Skeleton className="h-12 w-full mb-4" />
          <Skeleton className="h-32 w-full mb-4" />
          <Skeleton className="h-32 w-full mb-4" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">eCTD Planner</h1>
        <div className="flex items-center space-x-4">
          <OrganizationSwitcher />
          <ClientWorkspaceSwitcher />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList className="grid w-full md:w-auto grid-cols-3 md:grid-cols-3">
          <TabsTrigger value="planner">eCTD Planner</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="planner" className="mt-6">
          {submissionId && (
            <div className="mb-4">
              <h2 className="text-xl font-bold mb-4">Submission {submissionId}</h2>
              {outline?.map(sec => (
                <Card key={sec.section} className="border shadow-sm mb-4">
                  <CardContent className="p-4">
                    <h2 className="text-xl font-semibold mb-2">
                      {sec.section} – {sec.name}
                    </h2>
                    {sec.docs?.length ? (
                      <ul className="list-disc ml-5 text-sm text-gray-700">
                        {sec.docs.map(d => (
                          <li key={d.id}>{d.filename}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-red-600 text-sm">No documents linked yet.</p>
                    )}
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() => alert('Open uploader pre‑tagged for ' + sec.section)}
                    >
                      Upload to {sec.section}
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {hint && (
                <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 text-sm">
                  AI Suggestion: {hint}
                </div>
              )}
              {missing?.length === 0 && (
                <div className="p-4 bg-green-50 text-green-700 text-sm rounded">
                  All sections have at least one document. Ready for QC!
                </div>
              )}
            </div>
          )}
          {!submissionId && (
            <div className="text-center py-8">
              <AlertTriangle className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Submission Selected</h2>
              <p className="text-gray-600 mb-4">
                Please select a submission to view its eCTD structure.
              </p>
              <Button onClick={() => alert('Would navigate to submission selection')}>
                Select Submission
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Settings className="mr-2 h-5 w-5" />
                eCTD Module Settings
              </h2>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Default Region</label>
                    <select className="w-full p-2 border rounded">
                      <option value="FDA">FDA (US)</option>
                      <option value="EMA">EMA (EU)</option>
                      <option value="PMDA">PMDA (Japan)</option>
                      <option value="Health Canada">Health Canada</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">eCTD Version</label>
                    <select className="w-full p-2 border rounded">
                      <option value="3.2.2">ICH eCTD v3.2.2</option>
                      <option value="4.0">ICH eCTD v4.0</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Default Storage Location</label>
                  <input
                    type="text"
                    className="w-full p-2 border rounded"
                    defaultValue={
                      currentClientWorkspace?.id
                        ? `/clients/${currentClientWorkspace.id}/ectd-submissions`
                        : ''
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center">
                    <input type="checkbox" defaultChecked={true} className="mr-2" />
                    <span className="text-sm font-medium">Enable real-time validation</span>
                  </label>

                  <label className="flex items-center">
                    <input type="checkbox" defaultChecked={true} className="mr-2" />
                    <span className="text-sm font-medium">Auto-generate XML index files</span>
                  </label>

                  <label className="flex items-center">
                    <input type="checkbox" defaultChecked={true} className="mr-2" />
                    <span className="text-sm font-medium">
                      Enable AI-assisted document classification
                    </span>
                  </label>
                </div>

                <Button>Save Settings</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Shield className="mr-2 h-5 w-5" />
                Security Settings
              </h2>

              {isSettingsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium mb-2">Password Policy</h3>
                    <div className="bg-gray-50 p-4 rounded">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm flex items-center mb-1">
                            <span className="w-48">Minimum Password Length:</span>
                            <span className="font-semibold">
                              {securitySettings?.passwordPolicy?.minLength || 12} characters
                            </span>
                          </p>
                          <p className="text-sm flex items-center mb-1">
                            <span className="w-48">Require Uppercase:</span>
                            <span className="font-semibold">
                              {securitySettings?.passwordPolicy?.requireUppercase ? 'Yes' : 'No'}
                            </span>
                          </p>
                          <p className="text-sm flex items-center mb-1">
                            <span className="w-48">Require Lowercase:</span>
                            <span className="font-semibold">
                              {securitySettings?.passwordPolicy?.requireLowercase ? 'Yes' : 'No'}
                            </span>
                          </p>
                        </div>
                        <div>
                          <p className="text-sm flex items-center mb-1">
                            <span className="w-48">Require Numbers:</span>
                            <span className="font-semibold">
                              {securitySettings?.passwordPolicy?.requireNumber ? 'Yes' : 'No'}
                            </span>
                          </p>
                          <p className="text-sm flex items-center mb-1">
                            <span className="w-48">Require Special Characters:</span>
                            <span className="font-semibold">
                              {securitySettings?.passwordPolicy?.requireSpecialChar ? 'Yes' : 'No'}
                            </span>
                          </p>
                          <p className="text-sm flex items-center mb-1">
                            <span className="w-48">Password Expiry:</span>
                            <span className="font-semibold">
                              {securitySettings?.passwordPolicy?.expiryDays || 90} days
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium mb-2">Session Security</h3>
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm flex items-center mb-1">
                        <span className="w-48">Session Timeout:</span>
                        <span className="font-semibold">
                          {securitySettings?.sessionSettings?.timeoutMinutes || 30} minutes
                        </span>
                      </p>
                      <p className="text-sm flex items-center mb-1">
                        <span className="w-48">Max Concurrent Sessions:</span>
                        <span className="font-semibold">
                          {securitySettings?.sessionSettings?.maxConcurrentSessions || 3}
                        </span>
                      </p>
                      <p className="text-sm flex items-center mb-1">
                        <span className="w-48">Enforce IP Lock:</span>
                        <span className="font-semibold">
                          {securitySettings?.sessionSettings?.enforceIpLock ? 'Yes' : 'No'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium mb-2">Document Security</h3>
                    <div className="bg-gray-50 p-4 rounded">
                      <p className="text-sm flex items-center mb-1">
                        <span className="w-48">Require Approval Workflow:</span>
                        <span className="font-semibold">
                          {securitySettings?.documentSettings?.requireApproval ? 'Yes' : 'No'}
                        </span>
                      </p>
                      <p className="text-sm flex items-center mb-1">
                        <span className="w-48">Digital Signatures:</span>
                        <span className="font-semibold">
                          {securitySettings?.documentSettings?.digitalSignaturesEnabled
                            ? 'Enabled'
                            : 'Disabled'}
                        </span>
                      </p>
                      <p className="text-sm flex items-center mb-1">
                        <span className="w-48">Audit Trail:</span>
                        <span className="font-semibold">
                          {securitySettings?.documentSettings?.auditTrailEnabled
                            ? 'Enabled'
                            : 'Disabled'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-3">
                    <Button variant="outline" onClick={() => setActiveTab('planner')}>
                      Cancel
                    </Button>
                    <Button disabled={!currentClientWorkspace?.id}>Update Security Settings</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {isNetworkError && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 mb-4">
          <div className="flex">
            <div className="py-1">
              <AlertTriangle className="h-6 w-6 text-red-500 mr-3" />
            </div>
            <div>
              <p className="font-bold">Network Error</p>
              <p className="text-sm">
                There was a problem connecting to the server. Please check your connection.
              </p>
              <Button variant="outline" size="sm" onClick={retryRequest} className="mt-2">
                Retry
              </Button>
            </div>
          </div>
        </div>
      )}

      {healthStatus && !healthStatus.healthy && (
        <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 mb-4">
          <div className="flex">
            <div className="py-1">
              <Info className="h-6 w-6 text-yellow-500 mr-3" />
            </div>
            <div>
              <p className="font-bold">System Status</p>
              <p className="text-sm">
                Some system components are currently experiencing issues. Our team has been
                notified.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

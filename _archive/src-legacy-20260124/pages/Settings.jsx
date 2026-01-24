// client/src/pages/Settings.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import {
  Settings as SettingsIcon,
  Shield,
  Bell,
  RefreshCw,
  Save,
  Globe,
  Key,
  Lock,
  FileKey,
  ScreenShare,
  Database,
  Palette,
  Upload,
  RotateCw,
  FileJson,
  AlertTriangle,
  Building,
  Users,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '../contexts/TenantContext';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

const Settings = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('general');
  const [formData, setFormData] = useState({
    organizationName: '',
    timezone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
    language: 'en',
  });

  const [securityData, setSecurityData] = useState({
    mfaEnabled: false,
    minLength: 12,
    historyCount: 5,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    sessionTimeout: 30,
  });

  const [notificationsData, setNotificationsData] = useState({
    emailEnabled: true,
    smsEnabled: false,
    documentApprovals: true,
    systemMaintenance: true,
    securityAlerts: true,
    weeklyReports: false,
  });

  const [integrationsData, setIntegrationsData] = useState({
    microsoftOfficeEnabled: false,
    microsoftOfficeTenantId: '',
    microsoftOfficeClientId: '',
    docusignEnabled: false,
    docusignApiKey: '',
    slackEnabled: false,
    slackWebhookUrl: '',
  });

  const [appearanceData, setAppearanceData] = useState({
    theme: 'light',
    primaryColor: '#1e40af',
    logoUrl: '',
    customCss: '',
  });

  const { currentOrganization } = useTenant();

  // Get organization ID from context - no fallback to ensure proper error handling
  const organizationId = currentOrganization?.id;

  // Debug logging
  React.useEffect(() => {
    console.log('🔍 Settings Debug:', {
      currentOrganization,
      organizationId,
      formData,
    });
  }, [currentOrganization, organizationId, formData]);

  // Fetch current organization data from tenants endpoint
  const {
    data: currentOrganizationData,
    isLoading: isLoadingOrganization,
    isError: isOrgError,
    error: orgError,
  } = useQuery({
    queryKey: ['/api/tenants', organizationId],
    queryFn: () =>
      organizationId
        ? apiRequest(`/api/tenants/${organizationId}`)
        : Promise.reject(new Error('No organization selected')),
    enabled: !!organizationId,
  });

  // Fetch organization settings
  const {
    data: settingsData,
    isLoading: isLoadingSettings,
    isError: isSettingsError,
    error: settingsError,
  } = useQuery({
    queryKey: ['/api/organizations', organizationId, 'settings'],
    queryFn: () =>
      organizationId
        ? apiRequest(`/api/organizations/${organizationId}/settings`)
        : Promise.reject(new Error('No organization selected')),
    enabled: !!organizationId,
  });

  // Update organization settings
  const updateSettingsMutation = useMutation({
    mutationFn: data =>
      apiRequest(`/api/organizations/${organizationId}/settings`, {
        method: 'PATCH',
        data,
      }),
    onSuccess: () => {
      // Force immediate cache invalidation and refetch
      queryClient.invalidateQueries(['/api/organizations', organizationId, 'settings']);
      queryClient.refetchQueries(['/api/organizations', organizationId, 'settings']);

      toast({
        title: 'Success',
        description: 'Settings updated successfully',
      });
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update settings',
        variant: 'destructive',
      });
    },
  });

  // Update organization data (separate from settings)
  const updateOrganizationMutation = useMutation({
    mutationFn: data => {
      console.log('🔍 Settings page updating organization data:', data);
      return apiRequest(`/api/tenants/${organizationId}`, {
        method: 'PATCH',
        data,
      });
    },
    onSuccess: data => {
      console.log('🔍 Settings page organization update success:', data);
      // Invalidate and refetch the specific organization query
      queryClient.invalidateQueries(['/api/tenants', organizationId]);
      queryClient.invalidateQueries(['/api/tenants']);
      // Also invalidate settings to refresh organization name in General tab
      queryClient.invalidateQueries(['/api/organizations', organizationId, 'settings']);
      // Force immediate refetch to update UI
      queryClient.refetchQueries(['/api/tenants', organizationId]);
      queryClient.refetchQueries(['/api/organizations', organizationId, 'settings']);

      // Update the form data immediately to reflect organization name change
      if (data && data.name) {
        setFormData(prev => ({
          ...prev,
          organizationName: data.name,
        }));
      }

      // Force a page reload to refresh the TenantContext with updated organization data
      setTimeout(() => {
        window.location.reload();
      }, 1000);

      toast({
        title: 'Success',
        description: 'Organization updated successfully. Refreshing page...',
      });
    },
    onError: error => {
      console.log('🔍 Settings page organization update error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update organization',
        variant: 'destructive',
      });
    },
  });

  // Initialize form data when settings are loaded
  React.useEffect(() => {
    if (settingsData?.settings?.general) {
      setFormData({
        organizationName: settingsData.settings.general.organizationName,
        timezone: settingsData.settings.general.timezone,
        dateFormat: settingsData.settings.general.dateFormat,
        language: settingsData.settings.general.language,
      });
    }
    if (settingsData?.settings?.security) {
      setSecurityData({
        mfaEnabled: settingsData.settings.security.mfaEnabled,
        minLength: settingsData.settings.security.passwordPolicy.minLength,
        historyCount: settingsData.settings.security.passwordPolicy.historyCount,
        requireUppercase: settingsData.settings.security.passwordPolicy.requireUppercase,
        requireLowercase: settingsData.settings.security.passwordPolicy.requireLowercase,
        requireNumbers: settingsData.settings.security.passwordPolicy.requireNumbers,
        requireSpecialChars: settingsData.settings.security.passwordPolicy.requireSpecialChars,
        sessionTimeout: settingsData.settings.security.sessionTimeout,
      });
    }
    if (settingsData?.settings?.notifications) {
      setNotificationsData({
        emailEnabled: settingsData.settings.notifications.emailEnabled,
        smsEnabled: settingsData.settings.notifications.smsEnabled,
        documentApprovals: settingsData.settings.notifications.documentApprovals,
        systemMaintenance: settingsData.settings.notifications.systemMaintenance,
        securityAlerts: settingsData.settings.notifications.securityAlerts,
        weeklyReports: settingsData.settings.notifications.weeklyReports,
      });
    }
    if (settingsData?.settings?.integrations) {
      setIntegrationsData({
        microsoftOfficeEnabled:
          settingsData.settings.integrations.microsoftOffice?.enabled || false,
        microsoftOfficeTenantId: settingsData.settings.integrations.microsoftOffice?.tenantId || '',
        microsoftOfficeClientId: settingsData.settings.integrations.microsoftOffice?.clientId || '',
        docusignEnabled: settingsData.settings.integrations.docusign?.enabled || false,
        docusignApiKey: settingsData.settings.integrations.docusign?.apiKey || '',
        slackEnabled: settingsData.settings.integrations.slack?.enabled || false,
        slackWebhookUrl: settingsData.settings.integrations.slack?.webhookUrl || '',
      });
    }
    if (settingsData?.settings?.appearance) {
      setAppearanceData({
        theme: settingsData.settings.appearance.theme,
        primaryColor: settingsData.settings.appearance.primaryColor,
        logoUrl: settingsData.settings.appearance.logoUrl,
        customCss: settingsData.settings.appearance.customCss,
      });
    }
  }, [settingsData]);

  // Sync organization name from tenant data (overrides settings data)
  React.useEffect(() => {
    if (currentOrganizationData?.name) {
      setFormData(prev => ({
        ...prev,
        organizationName: currentOrganizationData.name,
      }));
    }
  }, [currentOrganizationData]);

  const handleUpdateSettings = formData => {
    updateSettingsMutation.mutate(formData);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSecurityChange = (field, value) => {
    setSecurityData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleNotificationsChange = (field, value) => {
    setNotificationsData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleIntegrationsChange = (field, value) => {
    setIntegrationsData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAppearanceChange = (field, value) => {
    setAppearanceData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  // Loading state
  if (isLoadingSettings) {
    return (
      <div className="container mx-auto py-6 space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage your organization and application settings
            </p>
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 md:col-span-3">
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="col-span-12 md:col-span-9">
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (isSettingsError) {
    return (
      <div className="container mx-auto py-6">
        <Card className="border-red-300">
          <CardHeader>
            <CardTitle className="text-lg text-red-500">Error Loading Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{settingsError?.message || 'Failed to load settings. Please try again later.'}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() =>
                queryClient.invalidateQueries(['/api/organizations', organizationId, 'settings'])
              }
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // For development
  const settings = settingsData?.settings || {
    general: {
      organizationName: 'Your Organization',
      timezone: 'UTC',
      dateFormat: 'MM/DD/YYYY',
      language: 'en',
    },
    security: {
      mfaEnabled: false,
      passwordPolicy: {
        minLength: 10,
        requireUppercase: true,
        requireLowercase: true,
        requireNumber: true,
        requireSpecial: true,
        historyCount: 5,
      },
      sessionTimeout: 30,
    },
    notifications: {
      emailNotifications: true,
      projectUpdates: true,
      securityAlerts: true,
      systemAnnouncements: true,
    },
    integrations: {
      openaiApiKey: '',
      openaiEnabled: false,
      vaultEnabled: false,
      vaultUrl: '',
      vaultApiKey: '',
    },
    appearance: {
      theme: 'light',
      accentColor: '#4f46e5',
      compactMode: false,
    },
    advanced: {
      debugMode: false,
      betaFeatures: false,
      dataRetentionDays: 90,
    },
  };

  const tabs = [
    { id: 'general', label: 'General', icon: <SettingsIcon className="h-4 w-4" /> },
    { id: 'security', label: 'Security', icon: <Shield className="h-4 w-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
    { id: 'integrations', label: 'Integrations', icon: <Globe className="h-4 w-4" /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette className="h-4 w-4" /> },
    { id: 'advanced', label: 'Advanced', icon: <Database className="h-4 w-4" /> },
  ];

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your organization and application settings
          </p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Settings Navigation */}
        <div className="col-span-12 md:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Settings</CardTitle>
              <CardDescription>Configure your environment</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 p-0">
              <div className="flex flex-col">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    className={`flex items-center gap-2 px-6 py-3 text-left transition ${
                      activeTab === tab.id
                        ? 'bg-muted text-primary font-medium'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Settings Content */}
        <div className="col-span-12 md:col-span-9">
          <Card className="h-full">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{tabs.find(t => t.id === activeTab)?.label} Settings</CardTitle>
                  <CardDescription>
                    {activeTab === 'general' && 'Configure basic organization settings'}
                    {activeTab === 'security' && 'Manage security and access controls'}
                    {activeTab === 'notifications' && 'Configure notification preferences'}
                    {activeTab === 'integrations' && 'Manage third-party integrations'}
                    {activeTab === 'appearance' && 'Customize the application appearance'}
                    {activeTab === 'advanced' && 'Advanced system configuration options'}
                  </CardDescription>
                </div>
                {settingsData && (
                  <div className="text-xs text-muted-foreground">
                    Last updated: {new Date().toLocaleString()}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* General Settings */}
              {activeTab === 'general' && (
                <div key={`general-${organizationId}`} className="space-y-8">
                  <form
                    onSubmit={async e => {
                      e.preventDefault();

                      toast({
                        title: 'Updating Settings',
                        description: 'Saving your changes...',
                      });

                      try {
                        // Update organization name in tenant table if it changed
                        if (formData.organizationName !== currentOrganization?.name) {
                          await updateOrganizationMutation.mutateAsync({
                            name: formData.organizationName,
                          });
                        }

                        // Update settings
                        const generalSettings = {
                          general: {
                            organizationName: formData.organizationName,
                            timezone: formData.timezone,
                            dateFormat: formData.dateFormat,
                            language: formData.language,
                          },
                        };
                        await updateSettingsMutation.mutateAsync(generalSettings);
                      } catch (error) {
                        // Error handling is already done in the mutations
                      }
                    }}
                  >
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label htmlFor="organizationName" className="text-sm font-medium">
                          Organization Name
                        </label>
                        <Input
                          id="organizationName"
                          name="organizationName"
                          value={formData.organizationName}
                          onChange={e => handleInputChange('organizationName', e.target.value)}
                          placeholder="Your Organization"
                          className="bg-white dark:bg-black"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label htmlFor="timezone" className="text-sm font-medium">
                            Timezone
                          </label>
                          <select
                            id="timezone"
                            name="timezone"
                            className="flex h-10 w-full rounded-md border border-input bg-white dark:bg-black px-3 py-2 text-sm"
                            value={formData.timezone}
                            onChange={e => handleInputChange('timezone', e.target.value)}
                          >
                            <option value="UTC">UTC</option>
                            <option value="America/New_York">Eastern Time (ET)</option>
                            <option value="America/Chicago">Central Time (CT)</option>
                            <option value="America/Denver">Mountain Time (MT)</option>
                            <option value="America/Los_Angeles">Pacific Time (PT)</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="dateFormat" className="text-sm font-medium">
                            Date Format
                          </label>
                          <select
                            id="dateFormat"
                            name="dateFormat"
                            className="flex h-10 w-full rounded-md border border-input bg-white dark:bg-black px-3 py-2 text-sm"
                            value={formData.dateFormat}
                            onChange={e => handleInputChange('dateFormat', e.target.value)}
                          >
                            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="language" className="text-sm font-medium">
                          Language
                        </label>
                        <select
                          id="language"
                          name="language"
                          className="flex h-10 w-full rounded-md border border-input bg-white dark:bg-black px-3 py-2 text-sm"
                          value={formData.language}
                          onChange={e => handleInputChange('language', e.target.value)}
                        >
                          <option value="en">English</option>
                          <option value="es">Spanish</option>
                          <option value="fr">French</option>
                          <option value="de">German</option>
                          <option value="ja">Japanese</option>
                        </select>
                        <p className="text-xs text-muted-foreground mt-1">
                          Language settings apply to the user interface and some documents
                        </p>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          disabled={
                            updateSettingsMutation.isPending || updateOrganizationMutation.isPending
                          }
                          className="flex items-center gap-2"
                        >
                          {updateSettingsMutation.isPending ||
                          updateOrganizationMutation.isPending ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          {updateSettingsMutation.isPending || updateOrganizationMutation.isPending
                            ? 'Saving...'
                            : 'Save Settings'}
                        </Button>
                      </div>
                    </div>
                  </form>

                  {/* Organization Management Section */}
                  <div className="border-t pt-6 mt-6">
                    <h3 className="text-lg font-medium mb-4">Organization Management</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Manage your organization details, subscription tier, and compliance settings.
                    </p>

                    {currentOrganizationData && (
                      <OrganizationManagementForm
                        key={`org-form-${currentOrganizationData.id}-${currentOrganizationData.updatedAt}`}
                        organization={currentOrganizationData}
                        onUpdate={updateOrganizationMutation.mutate}
                        isLoading={updateOrganizationMutation.isPending}
                      />
                    )}

                    {isLoadingOrganization && (
                      <div className="p-4 text-center">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Loading organization details...
                        </p>
                      </div>
                    )}

                    {isOrgError && (
                      <div className="p-4 text-center border border-red-200 rounded-md bg-red-50">
                        <AlertTriangle className="h-6 w-6 text-red-500 mx-auto mb-2" />
                        <p className="text-sm text-red-600">Failed to load organization details</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Security Settings */}
              {activeTab === 'security' && (
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    const securitySettings = {
                      security: {
                        mfaEnabled: securityData.mfaEnabled,
                        passwordPolicy: {
                          minLength: securityData.minLength,
                          requireUppercase: securityData.requireUppercase,
                          requireLowercase: securityData.requireLowercase,
                          requireNumbers: securityData.requireNumbers,
                          requireSpecialChars: securityData.requireSpecialChars,
                          historyCount: securityData.historyCount,
                        },
                        sessionTimeout: securityData.sessionTimeout,
                        ipWhitelist: [],
                      },
                    };
                    handleUpdateSettings(securitySettings);
                  }}
                >
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-medium">Multi-Factor Authentication</h3>
                        <p className="text-xs text-muted-foreground">
                          Require MFA for all users in this organization
                        </p>
                      </div>
                      <Switch
                        checked={securityData.mfaEnabled}
                        onCheckedChange={checked => handleSecurityChange('mfaEnabled', checked)}
                      />
                    </div>

                    <Separator />

                    <div>
                      <h3 className="text-sm font-medium mb-3">Password Policy</h3>
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label htmlFor="minLength" className="text-xs font-medium">
                              Minimum Length
                            </label>
                            <Input
                              id="minLength"
                              type="number"
                              min="8"
                              max="32"
                              value={securityData.minLength}
                              onChange={e =>
                                handleSecurityChange('minLength', parseInt(e.target.value))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label htmlFor="historyCount" className="text-xs font-medium">
                              Password History
                            </label>
                            <Input
                              id="historyCount"
                              type="number"
                              min="0"
                              max="24"
                              value={securityData.historyCount}
                              onChange={e =>
                                handleSecurityChange('historyCount', parseInt(e.target.value))
                              }
                            />
                          </div>
                        </div>

                        <div className="space-y-1 pt-2">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="requireUppercase"
                              checked={securityData.requireUppercase}
                              onCheckedChange={checked =>
                                handleSecurityChange('requireUppercase', checked)
                              }
                            />
                            <label htmlFor="requireUppercase" className="text-xs">
                              Require uppercase letters
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="requireLowercase"
                              checked={securityData.requireLowercase}
                              onCheckedChange={checked =>
                                handleSecurityChange('requireLowercase', checked)
                              }
                            />
                            <label htmlFor="requireLowercase" className="text-xs">
                              Require lowercase letters
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="requireNumbers"
                              checked={securityData.requireNumbers}
                              onCheckedChange={checked =>
                                handleSecurityChange('requireNumbers', checked)
                              }
                            />
                            <label htmlFor="requireNumbers" className="text-xs">
                              Require numbers
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="requireSpecialChars"
                              checked={securityData.requireSpecialChars}
                              onCheckedChange={checked =>
                                handleSecurityChange('requireSpecialChars', checked)
                              }
                            />
                            <label htmlFor="requireSpecialChars" className="text-xs">
                              Require special characters
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <div className="space-y-2">
                        <label htmlFor="sessionTimeout" className="text-sm font-medium">
                          Session Timeout (minutes)
                        </label>
                        <Input
                          id="sessionTimeout"
                          type="number"
                          min="5"
                          max="1440"
                          value={securityData.sessionTimeout}
                          onChange={e =>
                            handleSecurityChange('sessionTimeout', parseInt(e.target.value))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Users will be automatically logged out after this period of inactivity
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        disabled={updateSettingsMutation.isPending}
                        className="flex items-center gap-2"
                      >
                        {updateSettingsMutation.isPending ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        {updateSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
                      </Button>
                    </div>
                  </div>
                </form>
              )}

              {/* Notification Settings */}
              {activeTab === 'notifications' && (
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    const notificationSettings = {
                      notifications: {
                        emailEnabled: notificationsData.emailEnabled,
                        smsEnabled: notificationsData.smsEnabled,
                        documentApprovals: notificationsData.documentApprovals,
                        systemMaintenance: notificationsData.systemMaintenance,
                        securityAlerts: notificationsData.securityAlerts,
                        weeklyReports: notificationsData.weeklyReports,
                      },
                    };
                    handleUpdateSettings(notificationSettings);
                  }}
                >
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-medium">Email Notifications</h3>
                        <p className="text-xs text-muted-foreground">
                          Send email notifications for important events
                        </p>
                      </div>
                      <Switch
                        checked={notificationsData.emailEnabled}
                        onCheckedChange={checked =>
                          handleNotificationsChange('emailEnabled', checked)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-medium">SMS Notifications</h3>
                        <p className="text-xs text-muted-foreground">
                          Send SMS notifications for urgent alerts
                        </p>
                      </div>
                      <Switch
                        checked={notificationsData.smsEnabled}
                        onCheckedChange={checked =>
                          handleNotificationsChange('smsEnabled', checked)
                        }
                      />
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <h3 className="text-sm font-medium">Notification Types</h3>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="documentApprovals" className="text-xs">
                            Document approvals and reviews
                          </label>
                          <Switch
                            id="documentApprovals"
                            checked={notificationsData.documentApprovals}
                            onCheckedChange={checked =>
                              handleNotificationsChange('documentApprovals', checked)
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <label htmlFor="systemMaintenance" className="text-xs">
                            System maintenance updates
                          </label>
                          <Switch
                            id="systemMaintenance"
                            checked={notificationsData.systemMaintenance}
                            onCheckedChange={checked =>
                              handleNotificationsChange('systemMaintenance', checked)
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <label htmlFor="securityAlerts" className="text-xs">
                            Security alerts and warnings
                          </label>
                          <Switch
                            id="securityAlerts"
                            checked={notificationsData.securityAlerts}
                            onCheckedChange={checked =>
                              handleNotificationsChange('securityAlerts', checked)
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <label htmlFor="weeklyReports" className="text-xs">
                            Weekly activity reports
                          </label>
                          <Switch
                            id="weeklyReports"
                            checked={notificationsData.weeklyReports}
                            onCheckedChange={checked =>
                              handleNotificationsChange('weeklyReports', checked)
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        disabled={updateSettingsMutation.isPending}
                        className="flex items-center gap-2"
                      >
                        {updateSettingsMutation.isPending ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        {updateSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
                      </Button>
                    </div>
                  </div>
                </form>
              )}

              {/* Integrations Settings */}
              {activeTab === 'integrations' && (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-medium flex items-center gap-2">
                          <Key className="h-4 w-4" />
                          OpenAI Integration
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Connect to OpenAI for enhanced AI capabilities
                        </p>
                      </div>
                      <Switch defaultChecked={settings.integrations.openaiEnabled} />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="openaiApiKey" className="text-xs font-medium">
                        API Key
                      </label>
                      <div className="relative">
                        <Input
                          id="openaiApiKey"
                          type="password"
                          defaultValue={settings.integrations.openaiApiKey}
                          placeholder="sk-..."
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute right-0 top-0 h-full px-3 text-muted-foreground"
                        >
                          <FileKey className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The API key is stored encrypted and never exposed
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-medium flex items-center gap-2">
                          <Lock className="h-4 w-4" />
                          Vault Integration
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Connect to document vault for secure storage
                        </p>
                      </div>
                      <Switch defaultChecked={settings.integrations.vaultEnabled} />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="vaultUrl" className="text-xs font-medium">
                        Vault URL
                      </label>
                      <Input
                        id="vaultUrl"
                        defaultValue={settings.integrations.vaultUrl}
                        placeholder="https://vault.example.com"
                      />
                    </div>

                    <div className="space-y-2 mt-2">
                      <label htmlFor="vaultApiKey" className="text-xs font-medium">
                        Vault API Key
                      </label>
                      <div className="relative">
                        <Input
                          id="vaultApiKey"
                          type="password"
                          defaultValue={settings.integrations.vaultApiKey}
                          placeholder="vault-..."
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute right-0 top-0 h-full px-3 text-muted-foreground"
                        >
                          <FileKey className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Appearance Settings */}
              {activeTab === 'appearance' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label htmlFor="theme" className="text-sm font-medium">
                      Theme
                    </label>
                    <select
                      id="theme"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      defaultValue={settings.appearance.theme}
                    >
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                      <option value="system">System</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Select the appearance theme for the application
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="accentColor" className="text-sm font-medium">
                      Accent Color
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="accentColor"
                        type="color"
                        defaultValue={settings.appearance.accentColor}
                        className="w-12 h-10 p-1"
                      />
                      <Input
                        type="text"
                        defaultValue={settings.appearance.accentColor}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <h3 className="text-sm font-medium">Compact Mode</h3>
                      <p className="text-xs text-muted-foreground">
                        Reduce padding and spacing throughout the interface
                      </p>
                    </div>
                    <Switch defaultChecked={settings.appearance.compactMode} />
                  </div>
                </div>
              )}

              {/* Advanced Settings */}
              {activeTab === 'advanced' && (
                <div className="space-y-6">
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-md">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-medium text-amber-800">Caution</h4>
                        <p className="text-xs text-amber-700">
                          These advanced settings may affect system behavior and performance.
                          Changes should be made with care.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium">Debug Mode</h3>
                      <p className="text-xs text-muted-foreground">
                        Enable detailed logging for troubleshooting
                      </p>
                    </div>
                    <Switch defaultChecked={settings.advanced.debugMode} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium">Beta Features</h3>
                      <p className="text-xs text-muted-foreground">
                        Enable experimental features that are still in development
                      </p>
                    </div>
                    <Switch defaultChecked={settings.advanced.betaFeatures} />
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <label htmlFor="dataRetentionDays" className="text-sm font-medium">
                      Data Retention Period (days)
                    </label>
                    <Input
                      id="dataRetentionDays"
                      type="number"
                      min="1"
                      max="3650"
                      defaultValue={settings.advanced.dataRetentionDays}
                    />
                    <p className="text-xs text-muted-foreground">
                      Number of days to retain temporary files and logs
                    </p>
                  </div>

                  <div className="space-y-4 pt-4">
                    <h3 className="text-sm font-medium">Data Management</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <Button variant="outline" className="h-auto py-2">
                        <FileJson className="h-4 w-4 mr-2" />
                        <div className="text-left">
                          <span className="block text-xs font-medium">Export Settings</span>
                          <span className="block text-xs text-muted-foreground">
                            Download as JSON
                          </span>
                        </div>
                      </Button>

                      <Button variant="outline" className="h-auto py-2">
                        <Upload className="h-4 w-4 mr-2" />
                        <div className="text-left">
                          <span className="block text-xs font-medium">Import Settings</span>
                          <span className="block text-xs text-muted-foreground">
                            Load from file
                          </span>
                        </div>
                      </Button>

                      <Button
                        variant="outline"
                        className="h-auto py-2 text-amber-600 border-amber-200"
                      >
                        <RotateCw className="h-4 w-4 mr-2" />
                        <div className="text-left">
                          <span className="block text-xs font-medium">Reset to Default</span>
                          <span className="block text-xs text-muted-foreground">
                            Restore default settings
                          </span>
                        </div>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

// Organization Management Form Component
const OrganizationManagementForm = ({ organization, onUpdate, isLoading }) => {
  const { toast } = useToast();
  const [orgData, setOrgData] = useState({
    name: organization?.name || '',
    tier: organization?.tier || 'free',
    maxUsers: organization?.max_users || 5,
    maxProjects: organization?.max_projects || 3,
    status: organization?.status || 'active',
    complianceLevel: organization?.compliance_level || 'basic',
    industryType: organization?.industry_type || 'biotech',
  });

  const handleSubmit = e => {
    e.preventDefault();
    console.log('🔍 OrganizationManagementForm submitting:', orgData);

    // Convert camelCase to snake_case for database
    // Note: Slug is not updated to avoid conflicts with existing organizations
    const dbData = {
      name: orgData.name,
      tier: orgData.tier,
      max_users: orgData.maxUsers,
      max_projects: orgData.maxProjects,
      status: orgData.status,
      compliance_level: orgData.complianceLevel,
      industry_type: orgData.industryType || 'biotech',
    };

    // Call the update function passed from parent
    onUpdate(dbData);

    // Show immediate feedback
    toast({
      title: 'Updating Organization',
      description: 'Please wait while we save your changes...',
    });
  };

  const handleInputChange = (field, value) => {
    setOrgData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  // Update local state when organization prop changes
  React.useEffect(() => {
    console.log(
      '🔍 OrganizationManagementForm useEffect triggered with organization:',
      organization
    );
    if (organization) {
      console.log('🔍 Setting organization data:', {
        name: organization.name,
        tier: organization.tier,
        max_users: organization.max_users,
        max_projects: organization.max_projects,
        status: organization.status,
        compliance_level: organization.compliance_level,
        industry_type: organization.industry_type,
      });
      setOrgData({
        name: organization.name || '',
        tier: organization.tier || 'free',
        maxUsers: organization.max_users || 5,
        maxProjects: organization.max_projects || 3,
        status: organization.status || 'active',
        complianceLevel: organization.compliance_level || 'basic',
        industryType: organization.industry_type || 'biotech',
      });
    } else {
      console.log('🔍 No organization data received in OrganizationManagementForm');
    }
  }, [organization]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="h-5 w-5" />
          Organization Details
        </CardTitle>
        <CardDescription>
          Update your organization's core information and subscription settings.
          {organization?.updatedAt && (
            <span className="block text-xs text-muted-foreground mt-1">
              Last updated: {new Date(organization.updatedAt).toLocaleString()}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="orgName" className="text-sm font-medium">
                Organization Name
              </label>
              <Input
                id="orgName"
                name="name"
                value={orgData.name}
                onChange={e => handleInputChange('name', e.target.value)}
                placeholder="Enter organization name"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="tier" className="text-sm font-medium">
                Subscription Tier
              </label>
              <select
                id="tier"
                name="tier"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={orgData.tier}
                onChange={e => handleInputChange('tier', e.target.value)}
              >
                <option value="free">Free</option>
                <option value="standard">Standard</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="industryType" className="text-sm font-medium">
                Industry Type
              </label>
              <select
                id="industryType"
                name="industryType"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={orgData.industryType}
                onChange={e => handleInputChange('industryType', e.target.value)}
              >
                <option value="biotech">Biotech</option>
                <option value="pharma">Pharma</option>
                <option value="cro">CRO</option>
                <option value="medical_device">Medical Device</option>
                <option value="academic">Academic</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="complianceLevel" className="text-sm font-medium">
                Compliance Level
              </label>
              <select
                id="complianceLevel"
                name="complianceLevel"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={orgData.complianceLevel}
                onChange={e => handleInputChange('complianceLevel', e.target.value)}
              >
                <option value="base">Base</option>
                <option value="standard">Standard</option>
                <option value="advanced">Advanced</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="maxUsers" className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Maximum Users
              </label>
              <Input
                id="maxUsers"
                name="maxUsers"
                type="number"
                min="1"
                max="1000"
                value={orgData.maxUsers}
                onChange={e => handleInputChange('maxUsers', parseInt(e.target.value))}
                placeholder="5"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="maxProjects" className="text-sm font-medium">
                Maximum Projects
              </label>
              <Input
                id="maxProjects"
                name="maxProjects"
                type="number"
                min="1"
                max="1000"
                value={orgData.maxProjects}
                onChange={e => handleInputChange('maxProjects', parseInt(e.target.value))}
                placeholder="3"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="status" className="text-sm font-medium">
                Status
              </label>
              <select
                id="status"
                name="status"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={orgData.status}
                onChange={e => handleInputChange('status', e.target.value)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="complianceLevel" className="text-sm font-medium">
                Compliance Level
              </label>
              <select
                id="complianceLevel"
                name="complianceLevel"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={orgData.complianceLevel}
                onChange={e => handleInputChange('complianceLevel', e.target.value)}
              >
                <option value="basic">Basic</option>
                <option value="standard">Standard</option>
                <option value="advanced">Advanced</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isLoading} className="flex items-center gap-2">
              {isLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isLoading ? 'Updating...' : 'Update Organization'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default Settings;

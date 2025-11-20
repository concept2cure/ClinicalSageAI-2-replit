import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/queryClient';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import EnhancedSelect from '@/components/ui/select-wrapper';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Settings,
  AlertTriangle,
  Building2,
  Users,
  Database,
  Folder,
  Clock,
  FileBox,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const ClientWorkspaceSettings = ({ clientId: propClientId }) => {
  const { currentClientWorkspace, currentOrganization, refreshClientWorkspaces } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Track tab state
  const [activeTab, setActiveTab] = useState('general');

  // Use prop clientId if provided, otherwise fall back to tenant context
  const clientId = propClientId || currentClientWorkspace?.id;

  // Debug the prop clientId and context values
  React.useEffect(() => {
    console.log('🔧 ClientWorkspaceSettings Debug:', {
      propClientId,
      currentClientWorkspace,
      resolvedClientId: clientId,
      currentOrganization: currentOrganization?.id,
    });
  }, [propClientId, currentClientWorkspace, clientId, currentOrganization]);

  // Fetch client workspace settings
  const {
    data: workspaceSettings,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['/api/clients', clientId, 'settings'],
    queryFn: () => {
      if (!clientId) {
        console.warn('No client workspace selected. Cannot fetch workspace settings.');
        return Promise.resolve(null);
      }
      return apiRequest(`/api/clients/${clientId}/settings`).catch(err => {
        console.error('Error fetching workspace settings:', err);
        // Return default settings on error instead of throwing
        return null;
      });
    },
    enabled: !!clientId,
    // Load saved data, use defaults only when no saved data exists
    select: data => {
      if (!data) return null; // Let defaults be handled elsewhere

      return {
        general: {
          name: data.general?.name ?? currentClientWorkspace?.name ?? '',
          description: data.general?.description ?? '',
          slug: data.general?.slug ?? '',
          industry: data.general?.industry ?? 'pharmaceutical',
          logoUrl: data.general?.logoUrl ?? currentClientWorkspace?.logo ?? '',
          tier: data.general?.tier ?? 'standard',
          status: data.general?.status ?? 'active',
        },
        quotas: {
          maxUsers: data.quotas?.maxUsers ?? 10,
          maxProjects: data.quotas?.maxProjects ?? 20,
          maxStorageGB: data.quotas?.maxStorageGB ?? 50,
          maxDocumentsPerProject: data.quotas?.maxDocumentsPerProject ?? 500,
          enableOverageProtection: data.quotas?.enableOverageProtection ?? true,
        },
        modules: {
          cerEnabled: data.modules?.cerEnabled ?? true,
          indEnabled: data.modules?.indEnabled ?? true,
          vaultEnabled: data.modules?.vaultEnabled ?? true,
          csrEnabled: data.modules?.csrEnabled ?? true,
          analyticsEnabled: data.modules?.analyticsEnabled ?? true,
        },
        integration: {
          enableExternalSharing: data.integration?.enableExternalSharing ?? false,
          enableApiAccess: data.integration?.enableApiAccess ?? false,
          connectToCTMS: data.integration?.connectToCTMS ?? false,
          ctmsProvider: data.integration?.ctmsProvider ?? '',
          allowVendorAccess: data.integration?.allowVendorAccess ?? false,
          webhookUrl: data.integration?.webhookUrl ?? '',
        },
        appearance: {
          theme: data.appearance?.theme ?? 'system',
          primaryColor: data.appearance?.primaryColor ?? '#0f172a',
          brandLogo: data.appearance?.brandLogo ?? currentClientWorkspace?.logo ?? '',
          customFonts: data.appearance?.customFonts ?? false,
          darkModeEnabled: data.appearance?.darkModeEnabled ?? true,
        },
        notifications: {
          emailNotifications: data.notifications?.emailNotifications ?? true,
          notifyOnDocumentChanges: data.notifications?.notifyOnDocumentChanges ?? true,
          notifyOnMentions: data.notifications?.notifyOnMentions ?? true,
          notifyOnComments: data.notifications?.notifyOnComments ?? true,
          digestFrequency: data.notifications?.digestFrequency ?? 'daily',
        },
      };
    },
  });

  // State to manage form values
  const [formValues, setFormValues] = useState(
    workspaceSettings || {
      general: {
        name: currentClientWorkspace?.name || '',
        description: '',
        slug: '',
        industry: 'pharmaceutical',
        logoUrl: currentClientWorkspace?.logo || '',
        tier: 'standard',
        status: 'active',
      },
      quotas: {
        maxUsers: 10,
        maxProjects: 20,
        maxStorageGB: 50,
        maxDocumentsPerProject: 500,
        enableOverageProtection: true,
      },
      modules: {
        cerEnabled: true,
        indEnabled: true,
        vaultEnabled: true,
        csrEnabled: true,
        analyticsEnabled: true,
      },
      integration: {
        enableExternalSharing: false,
        enableApiAccess: false,
        connectToCTMS: false,
        ctmsProvider: '',
        allowVendorAccess: false,
        webhookUrl: '',
      },
      appearance: {
        theme: 'system',
        primaryColor: '#0f172a',
        brandLogo: currentClientWorkspace?.logo || '',
        customFonts: false,
        darkModeEnabled: true,
      },
      notifications: {
        emailNotifications: true,
        notifyOnDocumentChanges: true,
        notifyOnMentions: true,
        notifyOnComments: true,
        digestFrequency: 'daily',
      },
    }
  );

  // Update form values when data is loaded
  React.useEffect(() => {
    console.log('🔄 ClientWorkspaceSettings: Data loaded', { workspaceSettings, clientId });
    if (workspaceSettings) {
      console.log('🔄 Updating form values with loaded data:', workspaceSettings);
      setFormValues(workspaceSettings);
    }
  }, [workspaceSettings, clientId]);

  // Mutation to update client workspace settings
  const updateSettingsMutation = useMutation({
    mutationFn: data => {
      console.log(
        '🔧 Workspace Settings Mutation Debug - Using clientId:',
        clientId,
        'from context'
      );

      if (!clientId) {
        throw new Error('No client workspace selected. Cannot save workspace settings.');
      }

      return apiRequest(`/api/clients/${clientId}/settings`, {
        method: 'PATCH',
        data,
      });
    },
    onSuccess: async () => {
      // Invalidate all related client caches to ensure UI updates everywhere
      queryClient.invalidateQueries(['/api/clients', clientId, 'settings']);
      queryClient.invalidateQueries(['/api/clients', clientId]);
      queryClient.invalidateQueries(['/api/clients', 'organization', currentOrganization?.id]);
      queryClient.invalidateQueries(['/api/clients']);

      // Force refetch to update UI immediately
      queryClient.refetchQueries(['/api/clients', clientId]);
      queryClient.refetchQueries(['/api/clients', 'organization', currentOrganization?.id]);

      // Refresh the sidebar client workspaces list to show updated names
      console.log('🔄 Refreshing client workspaces after settings update');
      if (refreshClientWorkspaces) {
        await refreshClientWorkspaces();
        console.log('✅ Client workspaces refreshed successfully');
      }

      toast({
        title: 'Workspace settings updated',
        description: 'Client workspace settings have been updated successfully',
      });
    },
    onError: err => {
      toast({
        variant: 'destructive',
        title: 'Error updating workspace settings',
        description: err.message || 'Could not update workspace settings. Please try again.',
      });
    },
  });

  // Handle form submission
  const handleSubmit = e => {
    e.preventDefault();

    console.log('🔧 Workspace Settings Submit Debug:', {
      clientId,
      currentClientWorkspace,
      formValues: Object.keys(formValues),
    });

    if (!clientId) {
      toast({
        variant: 'destructive',
        title: 'Error saving settings',
        description: 'No client workspace selected. Please select a client workspace first.',
      });
      return;
    }

    updateSettingsMutation.mutate(formValues);
  };

  // Handle input changes for text/number inputs
  const handleInputChange = (section, field, value) => {
    setFormValues(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  // Handle toggle/checkbox changes
  const handleToggleChange = (section, field) => {
    setFormValues(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: !prev[section][field],
      },
    }));
  };

  // Loading state
  if (isLoading && !formValues) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-full" />
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (isError) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center text-red-600">
            <AlertTriangle className="h-5 w-5 mr-2" />
            Error Loading Workspace Settings
          </CardTitle>
          <CardDescription className="text-red-500">
            {error?.message || 'Could not load workspace settings. Please try again later.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => queryClient.invalidateQueries(['/api/clients', clientId, 'settings'])}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center">
          <Settings className="h-5 w-5 mr-2 text-primary" />
          <CardTitle>Client Workspace Settings</CardTitle>
        </div>
        <CardDescription>
          Configure settings for the {currentClientWorkspace?.name} workspace
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3 sm:grid-cols-6 mb-6">
              <TabsTrigger value="general" className="flex items-center">
                <Building2 className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">General</span>
                <span className="inline sm:hidden">Gen</span>
              </TabsTrigger>
              <TabsTrigger value="quotas" className="flex items-center">
                <Database className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Quotas</span>
                <span className="inline sm:hidden">Quot</span>
              </TabsTrigger>
              <TabsTrigger value="modules" className="flex items-center">
                <Folder className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Modules</span>
                <span className="inline sm:hidden">Mod</span>
              </TabsTrigger>
              <TabsTrigger value="integration" className="flex items-center">
                <FileBox className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Integration</span>
                <span className="inline sm:hidden">Int</span>
              </TabsTrigger>
              <TabsTrigger value="appearance" className="flex items-center">
                <Settings className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Appearance</span>
                <span className="inline sm:hidden">App</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className="flex items-center">
                <Clock className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Notifications</span>
                <span className="inline sm:hidden">Not</span>
              </TabsTrigger>
            </TabsList>

            {/* General Settings Tab */}
            <TabsContent value="general" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="name">Workspace Name</Label>
                  <Input
                    id="name"
                    value={formValues.general.name}
                    onChange={e => handleInputChange('general', 'name', e.target.value)}
                    placeholder="Enter workspace name"
                  />
                </div>

                <div className="space-y-3">
                  <Label htmlFor="slug">Workspace Slug</Label>
                  <Input
                    id="slug"
                    value={formValues.general.slug}
                    onChange={e => handleInputChange('general', 'slug', e.target.value)}
                    placeholder="Enter URL slug"
                  />
                  <p className="text-sm text-muted-foreground">
                    Used in URLs and API endpoints (lowercase, no spaces)
                  </p>
                </div>

                <div className="space-y-3 md:col-span-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formValues.general.description}
                    onChange={e => handleInputChange('general', 'description', e.target.value)}
                    placeholder="Brief description of this client workspace"
                    rows={3}
                  />
                </div>

                <div className="space-y-3">
                  <Label htmlFor="industry">Industry</Label>
                  <EnhancedSelect
                    value={formValues.general.industry}
                    onValueChange={value => handleInputChange('general', 'industry', value)}
                    placeholder="Select industry"
                    options={{
                      pharmaceutical: 'Pharmaceutical',
                      biotech: 'Biotech',
                      'medical-device': 'Medical Device',
                      diagnostics: 'Diagnostics',
                      cro: 'Contract Research Organization',
                      regulatory: 'Regulatory Consulting',
                    }}
                  />
                  <div className="pt-1">
                    <p className="text-sm text-muted-foreground">
                      Industry-specific compliance frameworks and templates will be automatically
                      applied
                    </p>
                    {formValues.general.industry === 'pharmaceutical' && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="outline" className="bg-blue-50">
                          ICH M4
                        </Badge>
                        <Badge variant="outline" className="bg-blue-50">
                          ICH E3
                        </Badge>
                        <Badge variant="outline" className="bg-blue-50">
                          ICH E6(R2)
                        </Badge>
                        <Badge variant="outline" className="bg-blue-50">
                          EMA Clinical Templates
                        </Badge>
                        <Badge variant="outline" className="bg-blue-50">
                          eCTD Structure
                        </Badge>
                      </div>
                    )}
                    {formValues.general.industry === 'biotech' && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="outline" className="bg-emerald-50">
                          ICH S6(R1)
                        </Badge>
                        <Badge variant="outline" className="bg-emerald-50">
                          CMC Requirements
                        </Badge>
                        <Badge variant="outline" className="bg-emerald-50">
                          Accelerated Pathways
                        </Badge>
                        <Badge variant="outline" className="bg-emerald-50">
                          Breakthrough/RMAT Templates
                        </Badge>
                      </div>
                    )}
                    {formValues.general.industry === 'medical-device' && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="outline" className="bg-amber-50">
                          MDR/IVDR Templates
                        </Badge>
                        <Badge variant="outline" className="bg-amber-50">
                          ISO 14155
                        </Badge>
                        <Badge variant="outline" className="bg-amber-50">
                          Technical File Structure
                        </Badge>
                        <Badge variant="outline" className="bg-amber-50">
                          FDA 510(k) Format
                        </Badge>
                        <Badge variant="outline" className="bg-amber-50">
                          MEDDEV Guidelines
                        </Badge>
                      </div>
                    )}
                    {formValues.general.industry === 'cro' && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="outline" className="bg-purple-50">
                          Multi-client Framework
                        </Badge>
                        <Badge variant="outline" className="bg-purple-50">
                          Sponsor Templates
                        </Badge>
                        <Badge variant="outline" className="bg-purple-50">
                          TMF Structure
                        </Badge>
                        <Badge variant="outline" className="bg-purple-50">
                          Trial Master Protocols
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="tier">Subscription Tier</Label>
                  <EnhancedSelect
                    value={formValues.general.tier}
                    onValueChange={value => handleInputChange('general', 'tier', value)}
                    placeholder="Select tier"
                    options={{
                      basic: 'Basic',
                      standard: 'Standard',
                      professional: 'Professional',
                      enterprise: 'Enterprise',
                    }}
                  />
                </div>

                <div className="space-y-3">
                  <Label htmlFor="status">Workspace Status</Label>
                  <EnhancedSelect
                    value={formValues.general.status}
                    onValueChange={value => handleInputChange('general', 'status', value)}
                    placeholder="Select status"
                    options={{
                      active: 'Active',
                      trial: 'Trial',
                      inactive: 'Inactive',
                      suspended: 'Suspended',
                    }}
                  />
                </div>

                <div className="space-y-3">
                  <Label htmlFor="logoUrl">Logo URL</Label>
                  <Input
                    id="logoUrl"
                    value={formValues.general.logoUrl}
                    onChange={e => handleInputChange('general', 'logoUrl', e.target.value)}
                    placeholder="https://example.com/logo.png"
                  />
                  <div className="flex items-center space-x-2 pt-2">
                    <p className="text-sm text-muted-foreground">Preview:</p>
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={formValues.general.logoUrl} alt="Client logo" />
                      <AvatarFallback>{formValues.general.name?.charAt(0) || 'C'}</AvatarFallback>
                    </Avatar>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-start">
                  <Users className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">Organization Assignment</h3>
                    <p className="text-sm text-blue-700 mt-1">
                      This workspace belongs to {currentOrganization?.name} organization. To change
                      the parent organization, use the Client Management section.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Quotas Settings Tab */}
            <TabsContent value="quotas" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="maxUsers">Maximum Users</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="maxUsers"
                      type="number"
                      min="1"
                      max="1000"
                      value={formValues.quotas.maxUsers}
                      onChange={e => {
                        const value = e.target.value;
                        handleInputChange(
                          'quotas',
                          'maxUsers',
                          value === '' ? '' : parseInt(value) || ''
                        );
                      }}
                      className="w-full"
                    />
                    <div className="shrink-0">
                      <Badge variant="outline">{formValues.quotas.maxUsers} users</Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Maximum number of user accounts allowed for this workspace
                  </p>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="maxProjects">Maximum Projects</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="maxProjects"
                      type="number"
                      min="1"
                      max="1000"
                      value={formValues.quotas.maxProjects}
                      onChange={e => {
                        const value = e.target.value;
                        handleInputChange(
                          'quotas',
                          'maxProjects',
                          value === '' ? '' : parseInt(value) || ''
                        );
                      }}
                      className="w-full"
                    />
                    <div className="shrink-0">
                      <Badge variant="outline">{formValues.quotas.maxProjects} projects</Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Maximum number of active projects allowed for this workspace
                  </p>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="maxStorageGB">Storage Limit (GB)</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="maxStorageGB"
                      type="number"
                      min="1"
                      max="10000"
                      value={formValues.quotas.maxStorageGB}
                      onChange={e => {
                        const value = e.target.value;
                        handleInputChange(
                          'quotas',
                          'maxStorageGB',
                          value === '' ? '' : parseInt(value) || ''
                        );
                      }}
                      className="w-full"
                    />
                    <div className="shrink-0">
                      <Badge variant="outline">{formValues.quotas.maxStorageGB} GB</Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Maximum storage space in gigabytes for all projects in this workspace
                  </p>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="maxDocumentsPerProject">Max Documents Per Project</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="maxDocumentsPerProject"
                      type="number"
                      min="10"
                      max="10000"
                      value={formValues.quotas.maxDocumentsPerProject}
                      onChange={e => {
                        const value = e.target.value;
                        handleInputChange(
                          'quotas',
                          'maxDocumentsPerProject',
                          value === '' ? '' : parseInt(value) || ''
                        );
                      }}
                      className="w-full"
                    />
                    <div className="shrink-0">
                      <Badge variant="outline">
                        {formValues.quotas.maxDocumentsPerProject} docs
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Maximum number of documents allowed per project
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="enableOverageProtection">Overage Protection</Label>
                  <p className="text-sm text-muted-foreground">
                    Prevent users from exceeding quota limits with hard stops
                  </p>
                </div>
                <Switch
                  id="enableOverageProtection"
                  checked={formValues.quotas.enableOverageProtection}
                  onCheckedChange={() => handleToggleChange('quotas', 'enableOverageProtection')}
                />
              </div>

              <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
                <div className="flex items-start">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-amber-800">Important Notice</h3>
                    <p className="text-sm text-amber-700 mt-1">
                      Changes to quota settings will take effect immediately. If you reduce quotas
                      below current usage levels, users may lose access to resources. Consider
                      notifying workspace users before making significant changes.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Modules Settings Tab */}
            <TabsContent value="modules" className="space-y-6">
              <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 mb-4">
                <div className="flex items-start">
                  <FileBox className="h-5 w-5 text-indigo-600 mt-0.5" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-indigo-800">
                      VAULT as Central Document Repository
                    </h3>
                    <p className="text-sm text-indigo-700 mt-1">
                      VAULT serves as the central document repository for all modules, ensuring
                      proper document handling, version control, and audit trails across the
                      platform. Module permissions are configured below.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="border p-4 rounded-lg bg-white shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center">
                        <Label htmlFor="cerEnabled" className="text-base">
                          Clinical Evaluation Reports (CER)
                        </Label>
                        <Badge className="ml-2 bg-blue-100 text-blue-800 hover:bg-blue-200">
                          Core Module
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Advanced CER authoring, management and compliance
                      </p>
                    </div>
                    <Switch
                      id="cerEnabled"
                      checked={formValues.modules.cerEnabled}
                      onCheckedChange={() => handleToggleChange('modules', 'cerEnabled')}
                    />
                  </div>

                  <div className="mt-3 space-y-2 border-t pt-3">
                    <h4 className="text-xs font-semibold text-gray-700">
                      Critical-to-Quality (CtQ) Factors:
                    </h4>
                    <ul className="text-xs space-y-1 text-gray-600">
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5"></div>
                        MEDDEV 2.7/1 Rev. 4 compliance validation
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5"></div>
                        MDR Article 61 clinical evaluation requirements
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-yellow-500 mr-1.5"></div>
                        Vendor literature surveillance integration
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-red-500 mr-1.5"></div>
                        PMCF/PSUR implementation (gated section)
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="border p-4 rounded-lg bg-white shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center">
                        <Label htmlFor="indEnabled" className="text-base">
                          Investigational New Drug (IND)
                        </Label>
                        <Badge className="ml-2 bg-green-100 text-green-800 hover:bg-green-200">
                          Regulatory
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        IND application wizards, templates and tracking
                      </p>
                    </div>
                    <Switch
                      id="indEnabled"
                      checked={formValues.modules.indEnabled}
                      onCheckedChange={() => handleToggleChange('modules', 'indEnabled')}
                    />
                  </div>

                  <div className="mt-3 space-y-2 border-t pt-3">
                    <h4 className="text-xs font-semibold text-gray-700">
                      Critical-to-Quality (CtQ) Factors:
                    </h4>
                    <ul className="text-xs space-y-1 text-gray-600">
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5"></div>
                        FDA 21 CFR Part 312 compliance checks
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5"></div>
                        Protocol and CMC technical review validation
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-yellow-500 mr-1.5"></div>
                        Pre-clinical data integration completeness
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-red-500 mr-1.5"></div>
                        Investigator verification (gated section)
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="border p-4 rounded-lg bg-white shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center">
                        <Label htmlFor="vaultEnabled" className="text-base">
                          Document Vault (VAULT)
                        </Label>
                        <Badge className="ml-2 bg-purple-100 text-purple-800 hover:bg-purple-200">
                          Foundation
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        21 CFR Part 11 compliant document management
                      </p>
                    </div>
                    <Switch
                      id="vaultEnabled"
                      checked={formValues.modules.vaultEnabled}
                      onCheckedChange={() => handleToggleChange('modules', 'vaultEnabled')}
                    />
                  </div>

                  <div className="mt-3 space-y-2 border-t pt-3">
                    <h4 className="text-xs font-semibold text-gray-700">
                      Critical-to-Quality (CtQ) Factors:
                    </h4>
                    <ul className="text-xs space-y-1 text-gray-600">
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5"></div>
                        21 CFR Part 11 electronic signature validation
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5"></div>
                        Complete audit trail implementation
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-yellow-500 mr-1.5"></div>
                        Document classification & metadata completion
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-red-500 mr-1.5"></div>
                        Retention policy configuration (gated section)
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="border p-4 rounded-lg bg-white shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center">
                        <Label htmlFor="csrEnabled" className="text-base">
                          Clinical Study Reports (CSR)
                        </Label>
                        <Badge className="ml-2 bg-amber-100 text-amber-800 hover:bg-amber-200">
                          Clinical
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        ICH E3-compliant CSR authoring and management
                      </p>
                    </div>
                    <Switch
                      id="csrEnabled"
                      checked={formValues.modules.csrEnabled}
                      onCheckedChange={() => handleToggleChange('modules', 'csrEnabled')}
                    />
                  </div>

                  <div className="mt-3 space-y-2 border-t pt-3">
                    <h4 className="text-xs font-semibold text-gray-700">
                      Critical-to-Quality (CtQ) Factors:
                    </h4>
                    <ul className="text-xs space-y-1 text-gray-600">
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5"></div>
                        ICH E3 guideline compliance checks
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5"></div>
                        Statistical analysis plan integration
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-yellow-500 mr-1.5"></div>
                        Adverse event data reconciliation
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-red-500 mr-1.5"></div>
                        Regulatory submission readiness (gated section)
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="border p-4 rounded-lg bg-white shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center">
                        <Label htmlFor="analyticsEnabled" className="text-base">
                          Analytics Dashboard
                        </Label>
                        <Badge className="ml-2 bg-sky-100 text-sky-800 hover:bg-sky-200">
                          Business
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Risk-based quality metrics and operations insights
                      </p>
                    </div>
                    <Switch
                      id="analyticsEnabled"
                      checked={formValues.modules.analyticsEnabled}
                      onCheckedChange={() => handleToggleChange('modules', 'analyticsEnabled')}
                    />
                  </div>

                  <div className="mt-3 space-y-2 border-t pt-3">
                    <h4 className="text-xs font-semibold text-gray-700">
                      Critical-to-Quality (CtQ) Factors:
                    </h4>
                    <ul className="text-xs space-y-1 text-gray-600">
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5"></div>
                        Real-time KPI/metric configuration
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5"></div>
                        Data source connectivity validation
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-yellow-500 mr-1.5"></div>
                        Custom report template creation
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-red-500 mr-1.5"></div>
                        Advanced predictive analytics (gated section)
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="border p-4 rounded-lg bg-white shadow-sm mt-6">
                <div className="flex items-start">
                  <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-sm font-medium">CtQ Factor Legend</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                      <div className="flex items-center">
                        <div className="h-3 w-3 rounded-full bg-green-500 mr-2"></div>
                        <span className="text-xs">Validated & Complete</span>
                      </div>
                      <div className="flex items-center">
                        <div className="h-3 w-3 rounded-full bg-yellow-500 mr-2"></div>
                        <span className="text-xs">In Progress / Needs Review</span>
                      </div>
                      <div className="flex items-center">
                        <div className="h-3 w-3 rounded-full bg-red-500 mr-2"></div>
                        <span className="text-xs">Not Started / Gated Features</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 mt-2">
                      Critical-to-Quality (CtQ) factors are key elements that must be satisfied to
                      ensure regulatory compliance and data quality. Section-specific gating is
                      applied based on CtQ factor completion status.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg mt-4">
                <div className="flex items-start">
                  <div className="mt-0.5">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">Module Configuration</h3>
                    <p className="text-sm text-blue-700 mt-1">
                      Disabling a module will immediately remove access for all users in this
                      workspace. User data and settings will be preserved but inaccessible until the
                      module is re-enabled.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Integration Settings Tab */}
            <TabsContent value="integration" className="space-y-6">
              <div className="space-y-4">
                <div className="border p-4 rounded-lg bg-white shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center">
                        <Label htmlFor="enableExternalSharing" className="text-base">
                          External Sharing
                        </Label>
                        <Badge className="ml-2 bg-blue-100 text-blue-800 hover:bg-blue-200">
                          Enterprise
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Allow secure document sharing with external collaborators
                      </p>
                    </div>
                    <Switch
                      id="enableExternalSharing"
                      checked={formValues.integration.enableExternalSharing}
                      onCheckedChange={() =>
                        handleToggleChange('integration', 'enableExternalSharing')
                      }
                    />
                  </div>

                  <div className="mt-3 space-y-2 border-t pt-3">
                    <h4 className="text-xs font-semibold text-gray-700">
                      Critical-to-Quality (CtQ) Factors:
                    </h4>
                    <ul className="text-xs space-y-1 text-gray-600">
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5"></div>
                        21 CFR Part 11 compliance verified
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-yellow-500 mr-1.5"></div>
                        Document watermarking configuration
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-red-500 mr-1.5"></div>
                        External security assessment
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="border p-4 rounded-lg bg-white shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center">
                        <Label htmlFor="enableApiAccess" className="text-base">
                          API Access
                        </Label>
                        <Badge className="ml-2 bg-purple-100 text-purple-800 hover:bg-purple-200">
                          Developer
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Enable programmatic access through secure REST APIs
                      </p>
                    </div>
                    <Switch
                      id="enableApiAccess"
                      checked={formValues.integration.enableApiAccess}
                      onCheckedChange={() => handleToggleChange('integration', 'enableApiAccess')}
                    />
                  </div>

                  <div className="mt-3 space-y-2 border-t pt-3">
                    <h4 className="text-xs font-semibold text-gray-700">
                      Critical-to-Quality (CtQ) Factors:
                    </h4>
                    <ul className="text-xs space-y-1 text-gray-600">
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5"></div>
                        API rate limiting configuration
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-yellow-500 mr-1.5"></div>
                        Authentication token expiry settings
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-red-500 mr-1.5"></div>
                        Data validation rule configuration
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="border p-4 rounded-lg bg-white shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center">
                        <Label htmlFor="connectToCTMS" className="text-base">
                          CTMS Integration
                        </Label>
                        <Badge className="ml-2 bg-emerald-100 text-emerald-800 hover:bg-emerald-200">
                          Clinical
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Connect to Clinical Trial Management System
                      </p>
                    </div>
                    <Switch
                      id="connectToCTMS"
                      checked={formValues.integration.connectToCTMS}
                      onCheckedChange={() => handleToggleChange('integration', 'connectToCTMS')}
                    />
                  </div>

                  <div className="mt-3 space-y-2 border-t pt-3">
                    <h4 className="text-xs font-semibold text-gray-700">
                      Critical-to-Quality (CtQ) Factors:
                    </h4>
                    <ul className="text-xs space-y-1 text-gray-600">
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5"></div>
                        Data mapping validation
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-yellow-500 mr-1.5"></div>
                        Bidirectional sync configuration
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-red-500 mr-1.5"></div>
                        Error reconciliation process
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="border p-4 rounded-lg bg-white shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center">
                        <Label htmlFor="allowVendorAccess" className="text-base">
                          Vendor Access
                        </Label>
                        <Badge className="ml-2 bg-amber-100 text-amber-800 hover:bg-amber-200">
                          Regulated
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Controlled access for third-party vendors to specific projects
                      </p>
                    </div>
                    <Switch
                      id="allowVendorAccess"
                      checked={formValues.integration.allowVendorAccess}
                      onCheckedChange={() => handleToggleChange('integration', 'allowVendorAccess')}
                    />
                  </div>

                  <div className="mt-3 space-y-2 border-t pt-3">
                    <h4 className="text-xs font-semibold text-gray-700">
                      Critical-to-Quality (CtQ) Factors:
                    </h4>
                    <ul className="text-xs space-y-1 text-gray-600">
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-green-500 mr-1.5"></div>
                        Vendor qualification status
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-yellow-500 mr-1.5"></div>
                        Data access limitation settings
                      </li>
                      <li className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-red-500 mr-1.5"></div>
                        Vendor access audit trail
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div
                  className={`space-y-3 ${formValues.integration.connectToCTMS ? '' : 'opacity-50'}`}
                >
                  <Label htmlFor="ctmsProvider">CTMS Provider</Label>
                  <EnhancedSelect
                    value={formValues.integration.ctmsProvider}
                    onValueChange={value => handleInputChange('integration', 'ctmsProvider', value)}
                    disabled={!formValues.integration.connectToCTMS}
                    placeholder="Select CTMS provider"
                    options={{
                      veeva: 'Veeva Vault CTMS',
                      medidata: 'Medidata Rave CTMS',
                      oracle: 'Oracle Clinical',
                      ibm: 'IBM Clinical Development',
                      bioclinica: 'Bioclinica CTMS',
                      custom: 'Custom/Other',
                    }}
                  />
                </div>

                <div
                  className={`space-y-3 ${formValues.integration.enableApiAccess ? '' : 'opacity-50'}`}
                >
                  <Label htmlFor="webhookUrl">Webhook URL (Optional)</Label>
                  <Input
                    id="webhookUrl"
                    value={formValues.integration.webhookUrl}
                    onChange={e => handleInputChange('integration', 'webhookUrl', e.target.value)}
                    placeholder="https://example.com/webhook"
                    disabled={!formValues.integration.enableApiAccess}
                  />
                  <p className="text-sm text-muted-foreground">
                    URL for receiving webhook notifications from our system
                  </p>
                </div>
              </div>

              <div className="bg-amber-50 p-4 rounded-lg mt-2">
                <div className="flex items-start">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-amber-800">Security Notice</h3>
                    <p className="text-sm text-amber-700 mt-1">
                      Enabling external integrations may have security implications. Please ensure
                      your security team has reviewed and approved these settings. API keys and
                      integration credentials can be managed in the Security Settings section.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Appearance Settings Tab */}
            <TabsContent value="appearance" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="theme">Theme Preference</Label>
                  <EnhancedSelect
                    value={formValues.appearance.theme}
                    onValueChange={value => handleInputChange('appearance', 'theme', value)}
                    placeholder="Select theme preference"
                    options={{
                      light: 'Light',
                      dark: 'Dark',
                      system: 'System (Follow device setting)',
                    }}
                  />
                </div>

                <div className="space-y-3">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex items-center gap-4">
                    <div
                      className="w-8 h-8 rounded-full border"
                      style={{ backgroundColor: formValues.appearance.primaryColor }}
                    />
                    <Input
                      id="primaryColor"
                      type="text"
                      value={formValues.appearance.primaryColor}
                      onChange={e =>
                        handleInputChange('appearance', 'primaryColor', e.target.value)
                      }
                      className="font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="brandLogo">Brand Logo URL</Label>
                  <Input
                    id="brandLogo"
                    value={formValues.appearance.brandLogo}
                    onChange={e => handleInputChange('appearance', 'brandLogo', e.target.value)}
                    placeholder="https://example.com/logo.png"
                  />
                  <div className="flex items-center space-x-2 pt-1">
                    <p className="text-sm text-muted-foreground">Preview:</p>
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={formValues.appearance.brandLogo} alt="Brand logo" />
                      <AvatarFallback>{formValues.general.name?.charAt(0) || 'B'}</AvatarFallback>
                    </Avatar>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="darkModeEnabled">Dark Mode Support</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow users to switch to dark mode in the application
                    </p>
                  </div>
                  <Switch
                    id="darkModeEnabled"
                    checked={formValues.appearance.darkModeEnabled}
                    onCheckedChange={() => handleToggleChange('appearance', 'darkModeEnabled')}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="customFonts">Custom Fonts</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable custom font support for the interface (requires Enterprise tier)
                    </p>
                  </div>
                  <Switch
                    id="customFonts"
                    checked={formValues.appearance.customFonts}
                    onCheckedChange={() => handleToggleChange('appearance', 'customFonts')}
                    disabled={formValues.general.tier !== 'enterprise'}
                  />
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg mt-2">
                <div className="flex items-start">
                  <div className="mt-0.5">
                    <Settings className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">White Label Configuration</h3>
                    <p className="text-sm text-blue-700 mt-1">
                      Enterprise tier workspaces can fully customize the application appearance with
                      custom themes, logos, and branding elements. Contact your account manager to
                      learn more about advanced white labeling options.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Notifications Settings Tab */}
            <TabsContent value="notifications" className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="emailNotifications">Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable email notifications for users in this workspace
                    </p>
                  </div>
                  <Switch
                    id="emailNotifications"
                    checked={formValues.notifications.emailNotifications}
                    onCheckedChange={() =>
                      handleToggleChange('notifications', 'emailNotifications')
                    }
                  />
                </div>

                <div
                  className={`flex items-center justify-between ${formValues.notifications.emailNotifications ? '' : 'opacity-50'}`}
                >
                  <div className="space-y-0.5">
                    <Label htmlFor="notifyOnDocumentChanges">Document Change Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify users when documents are created or modified
                    </p>
                  </div>
                  <Switch
                    id="notifyOnDocumentChanges"
                    checked={formValues.notifications.notifyOnDocumentChanges}
                    onCheckedChange={() =>
                      handleToggleChange('notifications', 'notifyOnDocumentChanges')
                    }
                    disabled={!formValues.notifications.emailNotifications}
                  />
                </div>

                <div
                  className={`flex items-center justify-between ${formValues.notifications.emailNotifications ? '' : 'opacity-50'}`}
                >
                  <div className="space-y-0.5">
                    <Label htmlFor="notifyOnMentions">Mention Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify users when they are mentioned in comments
                    </p>
                  </div>
                  <Switch
                    id="notifyOnMentions"
                    checked={formValues.notifications.notifyOnMentions}
                    onCheckedChange={() => handleToggleChange('notifications', 'notifyOnMentions')}
                    disabled={!formValues.notifications.emailNotifications}
                  />
                </div>

                <div
                  className={`flex items-center justify-between ${formValues.notifications.emailNotifications ? '' : 'opacity-50'}`}
                >
                  <div className="space-y-0.5">
                    <Label htmlFor="notifyOnComments">Comment Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify users of new comments on their documents
                    </p>
                  </div>
                  <Switch
                    id="notifyOnComments"
                    checked={formValues.notifications.notifyOnComments}
                    onCheckedChange={() => handleToggleChange('notifications', 'notifyOnComments')}
                    disabled={!formValues.notifications.emailNotifications}
                  />
                </div>
              </div>

              <Separator />

              <div
                className={`space-y-3 ${formValues.notifications.emailNotifications ? '' : 'opacity-50'}`}
              >
                <Label htmlFor="digestFrequency">Notification Digest Frequency</Label>
                <EnhancedSelect
                  value={formValues.notifications.digestFrequency}
                  onValueChange={value =>
                    handleInputChange('notifications', 'digestFrequency', value)
                  }
                  disabled={!formValues.notifications.emailNotifications}
                  placeholder="Select frequency"
                  options={{
                    immediate: 'Immediate',
                    hourly: 'Hourly Digest',
                    daily: 'Daily Digest',
                    weekly: 'Weekly Digest',
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  How often users receive notification digests for non-urgent updates
                </p>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg mt-2">
                <div className="flex items-start">
                  <div className="mt-0.5">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">User Preferences</h3>
                    <p className="text-sm text-blue-700 mt-1">
                      These settings define workspace defaults. Individual users can override these
                      settings in their personal notification preferences unless you've disabled
                      that functionality.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-6 flex justify-end">
            <Button
              type="submit"
              disabled={updateSettingsMutation.isPending}
              className="flex items-center"
            >
              {updateSettingsMutation.isPending ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                  Saving...
                </>
              ) : (
                <>Save Workspace Settings</>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default ClientWorkspaceSettings;

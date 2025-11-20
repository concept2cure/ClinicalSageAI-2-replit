// client/src/pages/ClientManagement.jsx
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import { useTenant } from '../contexts/TenantContext';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  RefreshCw,
  Settings,
  Users,
  Layers,
  Shield,
  Cog,
  FileCode,
} from 'lucide-react';
import ClientSecuritySettings from '../components/client/ClientSecuritySettings';
import ClientWorkspaceSettings from '../components/client/ClientWorkspaceSettings';
import ClientLicenseTab from '../components/client/ClientLicenseTab';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const ClientManagement = () => {
  const queryClient = useQueryClient();
  const { currentOrganization, currentClientWorkspace, refreshClientWorkspaces } = useTenant();
  const [selectedClient, setSelectedClient] = useState(currentClientWorkspace?.id || null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isNewClientDialogOpen, setIsNewClientDialogOpen] = useState(false);
  const [isEditClientDialogOpen, setIsEditClientDialogOpen] = useState(false);
  const [isEditQuotasDialogOpen, setIsEditQuotasDialogOpen] = useState(false);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [newClientData, setNewClientData] = useState({
    name: '',
    slug: '',
    quotaProjects: 10,
    quotaStorageGB: 5,
  });

  const [editClientData, setEditClientData] = useState({
    name: '',
    slug: '',
    quotaProjects: 10,
    quotaStorageGB: 5,
  });

  const [editQuotasData, setEditQuotasData] = useState({
    quotaProjects: 10,
    quotaStorageGB: 5,
  });

  // Get organization ID from context
  const organizationId = currentOrganization?.id || '1';

  // Fetch ALL clients from ALL organizations (user preference)
  const {
    data: clientsData,
    isLoading: isLoadingClients,
    isError: isClientsError,
    error: clientsError,
  } = useQuery({
    queryKey: ['/api/clients', 'all'],
    queryFn: () => apiRequest('/api/clients/all'),
  });

  // Fetch selected client details
  const { data: clientDetailData, isLoading: isLoadingClientDetail } = useQuery({
    queryKey: ['/api/clients', selectedClient],
    queryFn: () => apiRequest(`/api/clients/${selectedClient}`),
    enabled: !!selectedClient,
    retry: false, // Don't retry if client is not found (404)
    refetchOnWindowFocus: false, // Avoid refetching on window focus
  });

  // Get client detail for form population
  const clientDetail = clientDetailData?.client;

  // Prioritize currentClientWorkspace from context, then auto-select first client
  useEffect(() => {
    const clients = clientsData?.clients || [];

    // First priority: Use currentClientWorkspace from context (selected in dashboard)
    if (currentClientWorkspace?.id && currentClientWorkspace.id !== selectedClient) {
      console.log('🔧 Using client from dashboard selection:', currentClientWorkspace);
      setSelectedClient(currentClientWorkspace.id);
      return;
    }

    // Second priority: Auto-select first client if none selected
    if (clients.length > 0 && !selectedClient) {
      console.log('🔧 Auto-selecting first client:', clients[0]);
      setSelectedClient(clients[0].id);
    }
  }, [clientsData, selectedClient, currentClientWorkspace]);

  // Fetch workspace settings for edit form population
  const { data: workspaceSettings } = useQuery({
    queryKey: ['/api/clients', selectedClient, 'settings'],
    queryFn: () => (selectedClient ? apiRequest(`/api/clients/${selectedClient}/settings`) : null),
    enabled: !!selectedClient,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Populate edit form when dialog opens and we have client data
  useEffect(() => {
    console.log('Edit form useEffect triggered:', {
      isEditClientDialogOpen,
      clientDetail,
      workspaceSettings,
      selectedClient,
      clientDetailData,
    });

    if (isEditClientDialogOpen && clientDetail) {
      console.log('Populating edit form with client data:', clientDetail);
      console.log('Current workspace settings:', workspaceSettings);
      console.log('🔍 RAW clientDetail object:', JSON.stringify(clientDetail, null, 2));
      console.log('🔍 RAW workspaceSettings object:', JSON.stringify(workspaceSettings, null, 2));
      console.log('🔍 Direct quota access test:', {
        'clientDetail.quotaProjects': clientDetail.quotaProjects,
        'clientDetail.quotaStorageGB': clientDetail.quotaStorageGB,
        'clientDetail.quota_projects': clientDetail.quota_projects,
        'clientDetail.quota_storage_gb': clientDetail.quota_storage_gb,
      });

      // PRIORITY FIX: Use clientDetail first since that's what gets updated by mutations
      // The workspaceSettings may contain stale data, so prioritize the fresh clientDetail
      const workspaceName = clientDetail.name || workspaceSettings?.general?.name || '';
      const workspaceSlug = clientDetail.slug || workspaceSettings?.general?.slug || '';
      const quotaProjects =
        clientDetail.quotaProjects || workspaceSettings?.quotas?.maxProjects || 10;
      const quotaStorageGB =
        clientDetail.quotaStorageGB || workspaceSettings?.quotas?.maxStorageGB || 5;

      const formData = {
        name: workspaceName,
        slug: workspaceSlug,
        quotaProjects: quotaProjects,
        quotaStorageGB: quotaStorageGB,
      };
      console.log('Setting edit form data to:', formData);
      setEditClientData(formData);
    }
  }, [isEditClientDialogOpen, clientDetail, workspaceSettings]);

  // Populate edit quotas form when dialog opens and we have client data
  useEffect(() => {
    if (isEditQuotasDialogOpen && clientDetail) {
      console.log('Populating edit quotas form with client data:', clientDetail);
      const quotasData = {
        quotaProjects: clientDetail.quotaProjects || 10,
        quotaStorageGB: clientDetail.quotaStorageGB || 5,
      };
      console.log('Setting edit quotas data to:', quotasData);
      setEditQuotasData(quotasData);
    }
  }, [isEditQuotasDialogOpen, clientDetail]);

  // Separate effect to handle form reset when creating new client
  useEffect(() => {
    if (isNewClientDialogOpen) {
      setNewClientData({
        name: '',
        slug: '',
        quotaProjects: 10,
        quotaStorageGB: 5,
      });
    }
  }, [isNewClientDialogOpen]);

  // Function to handle opening edit dialog with form population
  const handleOpenEditDialog = async () => {
    console.log('Opening edit dialog, clientDetail:', clientDetail);
    console.log('Opening edit dialog, workspaceSettings:', workspaceSettings);

    // Force refresh the client data and settings before opening modal
    console.log('🔄 Force refreshing client data before opening edit modal...');
    await queryClient.refetchQueries({ queryKey: ['/api/clients', selectedClient] });
    await queryClient.refetchQueries({ queryKey: ['/api/clients', selectedClient, 'settings'] });

    // Wait a moment for the refetch to complete
    setTimeout(() => {
      const latestClientData = queryClient.getQueryData(['/api/clients', selectedClient]);
      const latestSettingsData = queryClient.getQueryData([
        '/api/clients',
        selectedClient,
        'settings',
      ]);

      console.log('🔄 Latest client data after refetch:', latestClientData);
      console.log('🔄 Latest settings data after refetch:', latestSettingsData);
      console.log('🔄 RAW latestClientData object:', JSON.stringify(latestClientData, null, 2));
      console.log('🔄 RAW latestSettingsData object:', JSON.stringify(latestSettingsData, null, 2));

      const refreshedClientDetail = latestClientData?.client;

      if (refreshedClientDetail) {
        // PRIORITY FIX: Use refreshedClientDetail first since that's what gets updated by mutations
        const workspaceName = refreshedClientDetail.name || latestSettingsData?.general?.name || '';
        const workspaceSlug = refreshedClientDetail.slug || latestSettingsData?.general?.slug || '';
        const quotaProjects =
          refreshedClientDetail.quotaProjects || latestSettingsData?.quotas?.maxProjects || 10;
        const quotaStorageGB =
          refreshedClientDetail.quotaStorageGB || latestSettingsData?.quotas?.maxStorageGB || 5;

        const formData = {
          name: workspaceName,
          slug: workspaceSlug,
          quotaProjects: quotaProjects,
          quotaStorageGB: quotaStorageGB,
        };
        console.log('🔄 Pre-populating edit form with latest data:', formData);
        setEditClientData(formData);
      }
      setIsEditClientDialogOpen(true);
    }, 200); // Small delay to ensure queries complete
  };

  // Simple close handler for edit dialog
  const handleCloseEditDialog = () => {
    console.log('Closing edit dialog');
    setIsEditClientDialogOpen(false);
  };

  // Create a new client
  const createClientMutation = useMutation({
    mutationFn: clientData =>
      apiRequest('/api/clients', {
        method: 'POST',
        data: { ...clientData, organizationId },
      }),
    onSuccess: async response => {
      // Fix cache invalidation to match the fetch query key
      queryClient.invalidateQueries({ queryKey: ['/api/clients', 'all'] });
      queryClient.refetchQueries({ queryKey: ['/api/clients', 'all'] });

      // Refresh the sidebar client workspaces list
      console.log('💫 Calling refreshClientWorkspaces after creating client');
      if (refreshClientWorkspaces) {
        await refreshClientWorkspaces();
        console.log('💫 refreshClientWorkspaces completed');
      } else {
        console.log('⚠️ refreshClientWorkspaces function not available');
      }

      setIsNewClientDialogOpen(false);
      setSelectedClient(response.client.id); // Auto-select the newly created client
      toast({
        title: 'Success',
        description: 'Client workspace created successfully',
      });
      setNewClientData({
        name: '',
        slug: '',
        quotaProjects: 10,
        quotaStorageGB: 5,
      });
    },
    onError: error => {
      // Handle specific error types with better messaging
      let errorMessage = 'Failed to create client workspace';

      if (error.response?.status === 409 && error.response?.data?.field === 'slug') {
        errorMessage = 'This URL slug is already taken. Please choose a different one.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });

  // Update a client
  const updateClientMutation = useMutation({
    mutationFn: clientData =>
      apiRequest(`/api/clients/${selectedClient}`, {
        method: 'PATCH',
        data: clientData,
      }),
    onSuccess: async () => {
      // Fix cache invalidation to match the fetch query keys
      queryClient.invalidateQueries({ queryKey: ['/api/clients', 'all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients', selectedClient] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients', selectedClient, 'settings'] });
      queryClient.refetchQueries({ queryKey: ['/api/clients', 'all'] });
      queryClient.refetchQueries({ queryKey: ['/api/clients', selectedClient] });

      // Refresh the sidebar client workspaces list
      console.log('💫 Calling refreshClientWorkspaces after updating client');
      if (refreshClientWorkspaces) {
        await refreshClientWorkspaces();
        console.log('💫 refreshClientWorkspaces completed');
      } else {
        console.log('⚠️ refreshClientWorkspaces function not available');
      }

      handleCloseEditDialog();
      toast({
        title: 'Success',
        description: 'Client workspace updated successfully',
      });
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update client workspace',
        variant: 'destructive',
      });
    },
  });

  // Update client quotas
  const updateQuotasMutation = useMutation({
    mutationFn: quotasData =>
      apiRequest(`/api/clients/${selectedClient}`, {
        method: 'PATCH',
        data: quotasData,
      }),
    onSuccess: async () => {
      // Fix cache invalidation to match the fetch query keys
      queryClient.invalidateQueries({ queryKey: ['/api/clients', 'all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients', selectedClient] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients', selectedClient, 'settings'] });
      queryClient.refetchQueries({ queryKey: ['/api/clients', 'all'] });
      queryClient.refetchQueries({ queryKey: ['/api/clients', selectedClient] });

      // Refresh the sidebar client workspaces list
      console.log('💫 Calling refreshClientWorkspaces after updating quotas');
      if (refreshClientWorkspaces) {
        await refreshClientWorkspaces();
        console.log('💫 refreshClientWorkspaces completed');
      }

      setIsEditQuotasDialogOpen(false);
      toast({
        title: 'Success',
        description: 'Client quotas updated successfully',
      });
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update client quotas',
        variant: 'destructive',
      });
    },
  });

  // Delete a client
  const deleteClientMutation = useMutation({
    mutationFn: clientId =>
      apiRequest(`/api/clients/${clientId}`, {
        method: 'DELETE',
      }),
    onSuccess: async (_, clientId) => {
      // Remove the specific client from cache to prevent 404 refetches
      queryClient.removeQueries(['/api/clients', clientId]);

      // Clear selected client to prevent UI showing deleted client
      setSelectedClient(null);

      // Fix cache invalidation to match the fetch query keys
      queryClient.invalidateQueries({ queryKey: ['/api/clients', 'all'] });
      queryClient.refetchQueries({ queryKey: ['/api/clients', 'all'] });

      // Refresh the sidebar client workspaces list
      console.log('💫 Calling refreshClientWorkspaces after deleting client');
      if (refreshClientWorkspaces) {
        await refreshClientWorkspaces();
        console.log('💫 refreshClientWorkspaces completed');
      }

      setIsDeleteConfirmationOpen(false);
      toast({
        title: 'Success',
        description: 'Client workspace deleted successfully',
      });
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete client workspace',
        variant: 'destructive',
      });
    },
  });

  const handleCreateClient = () => {
    createClientMutation.mutate({
      name: newClientData.name,
      slug: newClientData.slug,
      projectQuota: newClientData.quotaProjects,
      storageQuota: newClientData.quotaStorageGB,
      organizationId,
    });
  };

  const handleUpdateClient = () => {
    console.log('handleUpdateClient called with:', editClientData);
    console.log('Stack trace:', new Error().stack);
    updateClientMutation.mutate(editClientData);
  };

  const handleUpdateQuotas = () => {
    console.log('handleUpdateQuotas called with:', editQuotasData);
    updateQuotasMutation.mutate(editQuotasData);
  };

  const handleDeleteClient = () => {
    // Store the client ID before clearing selection
    const clientIdToDelete = selectedClient;

    // Pass the stored client ID to the mutation
    deleteClientMutation.mutate(clientIdToDelete);
  };

  const handleClientClick = clientId => {
    setSelectedClient(clientId);
    setActiveTab('overview'); // Reset to overview tab when selecting a new client
  };

  // Loading state
  if (isLoadingClients) {
    return (
      <div className="container mx-auto py-6 space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Client Management</h1>
            <p className="text-sm text-muted-foreground">
              Manage client workspaces in your organization
            </p>
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-3 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Client Workspaces</CardTitle>
                <CardDescription>Select a client to manage</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-9">
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (isClientsError) {
    return (
      <div className="container mx-auto py-6">
        <Card className="border-red-300">
          <CardHeader>
            <CardTitle className="text-lg text-red-500">Error Loading Client Data</CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              {clientsError?.message || 'Failed to load client workspaces. Please try again later.'}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() =>
                queryClient.invalidateQueries(['/api/organizations', organizationId, 'clients'])
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

  // For development - show sample clients if none exist
  const clients = clientsData?.clients || [];

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Client Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage all client workspaces across all organizations
          </p>
        </div>
        <Button onClick={() => setIsNewClientDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Client Workspace
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Client List Sidebar */}
        <div className="md:col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Client Workspaces</CardTitle>
              <CardDescription>Select a client to manage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {clients.length === 0 ? (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  No client workspaces yet
                </div>
              ) : (
                clients.map(client => (
                  <Button
                    key={client.id}
                    variant={selectedClient === client.id ? 'default' : 'outline'}
                    className="w-full justify-start h-auto py-3"
                    onClick={() => handleClientClick(client.id)}
                  >
                    <div className="flex items-start w-full">
                      <Building2 className="mr-2 h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div className="text-left">
                        <div className="font-medium">{client.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {client.organizationName}
                        </div>
                      </div>
                    </div>
                  </Button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Client Detail Panel */}
        <div className="md:col-span-9">
          {selectedClient ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  {isLoadingClientDetail ? (
                    <div className="space-y-2">
                      <Skeleton className="h-7 w-48" />
                      <Skeleton className="h-5 w-32" />
                    </div>
                  ) : (
                    <>
                      <CardTitle className="text-xl">{clientDetail?.name}</CardTitle>
                      <CardDescription>Slug: {clientDetail?.slug}</CardDescription>
                    </>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="bg-white dark:bg-black border shadow-lg rounded-md z-50 min-w-[160px]"
                  >
                    <DropdownMenuItem
                      className="hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleOpenEditDialog();
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit Client
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
                      onClick={() => setIsDeleteConfirmationOpen(true)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Client
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>

              <CardContent className="pt-4">
                {isLoadingClientDetail ? (
                  <div className="space-y-4">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-48 w-full" />
                  </div>
                ) : (
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="mb-4">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="workspace-settings">Workspace Settings</TabsTrigger>
                      <TabsTrigger value="security-settings">Security Settings</TabsTrigger>
                      <TabsTrigger value="quotas">Quotas</TabsTrigger>
                      <TabsTrigger value="users">Users</TabsTrigger>
                      <TabsTrigger value="projects">Projects</TabsTrigger>
                      <TabsTrigger value="licenses">Licenses</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Client Details</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <dl className="grid grid-cols-2 gap-1 text-sm">
                              <dt className="font-medium">Name:</dt>
                              <dd>{clientDetail?.name}</dd>
                              <dt className="font-medium">Slug:</dt>
                              <dd>{clientDetail?.slug}</dd>
                              <dt className="font-medium">Created:</dt>
                              <dd>
                                {new Date(
                                  clientDetail?.createdAt || Date.now()
                                ).toLocaleDateString()}
                              </dd>
                              <dt className="font-medium">Status:</dt>
                              <dd>
                                <Badge
                                  variant="outline"
                                  className="bg-green-50 text-green-700 hover:bg-green-50"
                                >
                                  Active
                                </Badge>
                              </dd>
                            </dl>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Usage Statistics</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <dl className="grid grid-cols-2 gap-1 text-sm">
                              <dt className="font-medium">Active Projects:</dt>
                              <dd>{clientDetail?.activeProjects || 0}</dd>
                              <dt className="font-medium">Total Documents:</dt>
                              <dd>{clientDetail?.documentCount || 0}</dd>
                              <dt className="font-medium">Storage Used:</dt>
                              <dd>{clientDetail?.storageUsedGB || 0} GB</dd>
                              <dt className="font-medium">Last Activity:</dt>
                              <dd>
                                {clientDetail?.lastActivity
                                  ? new Date(clientDetail.lastActivity).toLocaleDateString()
                                  : 'Never'}
                              </dd>
                            </dl>
                          </CardContent>
                        </Card>
                      </div>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-20 flex flex-col items-center justify-center"
                              onClick={() => setActiveTab('workspace-settings')}
                            >
                              <Cog className="h-5 w-5 mb-1" />
                              <span>Workspace Settings</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-20 flex flex-col items-center justify-center"
                              onClick={() => setActiveTab('users')}
                            >
                              <Users className="h-5 w-5 mb-1" />
                              <span>Manage Users</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-20 flex flex-col items-center justify-center"
                              onClick={() => setActiveTab('projects')}
                            >
                              <Layers className="h-5 w-5 mb-1" />
                              <span>View Projects</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-20 flex flex-col items-center justify-center"
                              onClick={() => setActiveTab('security-settings')}
                            >
                              <Shield className="h-5 w-5 mb-1" />
                              <span>Security Settings</span>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    {/* Workspace Settings Tab */}
                    <TabsContent value="workspace-settings" className="space-y-4">
                      <ClientWorkspaceSettings clientId={selectedClient} />
                    </TabsContent>

                    {/* Security Settings Tab */}
                    <TabsContent value="security-settings" className="space-y-4">
                      <ClientSecuritySettings clientId={selectedClient} />
                    </TabsContent>

                    <TabsContent value="quotas" className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Resource Quotas</CardTitle>
                          <CardDescription>
                            Manage resource limitations for this client workspace
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <div>
                                <h4 className="font-medium">Projects</h4>
                                <p className="text-sm text-muted-foreground">
                                  Maximum number of active projects
                                </p>
                              </div>
                              <div className="text-right">
                                <div className="text-xl font-bold">
                                  {clientDetail?.activeProjects || 0} /{' '}
                                  {clientDetail?.quotaProjects || 10}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {Math.round(
                                    ((clientDetail?.activeProjects || 0) /
                                      (clientDetail?.quotaProjects || 10)) *
                                      100
                                  )}
                                  % used
                                </div>
                              </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                              <div
                                className="bg-blue-600 h-2.5 rounded-full"
                                style={{
                                  width: `${Math.min(((clientDetail?.activeProjects || 0) / (clientDetail?.quotaProjects || 10)) * 100, 100)}%`,
                                }}
                              ></div>
                            </div>
                          </div>

                          <div className="space-y-2 pt-2">
                            <div className="flex justify-between items-center">
                              <div>
                                <h4 className="font-medium">Storage</h4>
                                <p className="text-sm text-muted-foreground">
                                  Maximum storage capacity in GB
                                </p>
                              </div>
                              <div className="text-right">
                                <div className="text-xl font-bold">
                                  {clientDetail?.storageUsedGB || 0} /{' '}
                                  {clientDetail?.quotaStorageGB || 5} GB
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {Math.round(
                                    ((clientDetail?.storageUsedGB || 0) /
                                      (clientDetail?.quotaStorageGB || 5)) *
                                      100
                                  )}
                                  % used
                                </div>
                              </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                              <div
                                className="bg-blue-600 h-2.5 rounded-full"
                                style={{
                                  width: `${Math.min(((clientDetail?.storageUsedGB || 0) / (clientDetail?.quotaStorageGB || 5)) * 100, 100)}%`,
                                }}
                              ></div>
                            </div>
                          </div>
                        </CardContent>
                        <CardFooter>
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => setIsEditQuotasDialogOpen(true)}
                          >
                            Edit Quotas
                          </Button>
                        </CardFooter>
                      </Card>
                    </TabsContent>

                    <TabsContent value="users" className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Client Users</CardTitle>
                          <CardDescription>Manage users for this client workspace</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="text-center py-6 text-sm text-muted-foreground">
                            User management will be implemented in the next phase
                          </div>
                        </CardContent>
                        <CardFooter>
                          <Button disabled variant="outline" className="w-full">
                            <Plus className="mr-2 h-4 w-4" />
                            Add User
                          </Button>
                        </CardFooter>
                      </Card>
                    </TabsContent>

                    <TabsContent value="projects" className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Client Projects</CardTitle>
                          <CardDescription>
                            View and manage all projects for this client
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="text-center py-6 text-sm text-muted-foreground">
                            Project list will be populated in the next phase
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="licenses" className="space-y-4">
                      <ClientLicenseTab 
                        clientId={selectedClient} 
                        clientDetail={clientDetail}
                      />
                    </TabsContent>
                  </Tabs>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center p-6">
              <div className="text-center">
                <Building2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Select a Client Workspace</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose a client workspace from the list on the left to view and manage its details
                </p>
                <Button onClick={() => setIsNewClientDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Client Workspace
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Create Client Dialog */}
      <Dialog open={isNewClientDialogOpen} onOpenChange={setIsNewClientDialogOpen}>
        <DialogContent className="z-[9999]">
          <DialogHeader>
            <DialogTitle>Create New Client Workspace</DialogTitle>
            <DialogDescription>
              Add a new client workspace to your organization. Client workspaces help you organize
              your projects.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Client Name
              </label>
              <Input
                id="name"
                value={newClientData.name}
                onChange={e => setNewClientData({ ...newClientData, name: e.target.value })}
                placeholder="Acme Biotech"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="slug" className="text-sm font-medium">
                URL Slug
              </label>
              <Input
                id="slug"
                value={newClientData.slug}
                onChange={e => setNewClientData({ ...newClientData, slug: e.target.value })}
                placeholder="acme-biotech"
              />
              <p className="text-xs text-muted-foreground">
                Used in URLs and API endpoints. Only lowercase letters, numbers, and hyphens.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="quotaProjects" className="text-sm font-medium">
                  Project Quota
                </label>
                <Input
                  id="quotaProjects"
                  type="number"
                  value={newClientData.quotaProjects}
                  onChange={e =>
                    setNewClientData({ ...newClientData, quotaProjects: parseInt(e.target.value) })
                  }
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="quotaStorageGB" className="text-sm font-medium">
                  Storage Quota (GB)
                </label>
                <Input
                  id="quotaStorageGB"
                  type="number"
                  value={newClientData.quotaStorageGB}
                  onChange={e =>
                    setNewClientData({ ...newClientData, quotaStorageGB: parseInt(e.target.value) })
                  }
                  min="1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewClientDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateClient}
              disabled={
                !newClientData.name || !newClientData.slug || createClientMutation.isPending
              }
            >
              {createClientMutation.isPending && (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={isEditClientDialogOpen}>
        <DialogContent
          className="z-[9999]"
          onPointerDownOutside={e => e.preventDefault()}
          onEscapeKeyDown={e => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Edit Client Workspace</DialogTitle>
            <DialogDescription>Update the details for this client workspace.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label htmlFor="edit-name" className="text-sm font-medium">
                Client Name
              </label>
              <Input
                id="edit-name"
                value={editClientData.name || ''}
                onChange={e => setEditClientData({ ...editClientData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="edit-slug" className="text-sm font-medium">
                URL Slug
              </label>
              <Input
                id="edit-slug"
                value={editClientData.slug || ''}
                onChange={e => setEditClientData({ ...editClientData, slug: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Used in URLs and API endpoints. Only lowercase letters, numbers, and hyphens.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="edit-quotaProjects" className="text-sm font-medium">
                  Project Quota
                </label>
                <Input
                  id="edit-quotaProjects"
                  type="number"
                  value={editClientData.quotaProjects || 10}
                  onChange={e =>
                    setEditClientData({
                      ...editClientData,
                      quotaProjects: parseInt(e.target.value),
                    })
                  }
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-quotaStorageGB" className="text-sm font-medium">
                  Storage Quota (GB)
                </label>
                <Input
                  id="edit-quotaStorageGB"
                  type="number"
                  value={editClientData.quotaStorageGB || 5}
                  onChange={e =>
                    setEditClientData({
                      ...editClientData,
                      quotaStorageGB: parseInt(e.target.value),
                    })
                  }
                  min="1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseEditDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateClient}
              disabled={
                !editClientData.name || !editClientData.slug || updateClientMutation.isPending
              }
            >
              {updateClientMutation.isPending && (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              )}
              Update Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
        <DialogContent className="z-[9999]">
          <DialogHeader>
            <DialogTitle>Delete Client Workspace</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this client workspace? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="font-medium">{clientDetail?.name}</p>
            <p className="text-sm text-muted-foreground">
              All projects, documents, and data associated with this client will be permanently
              deleted.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmationOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteClient}
              disabled={deleteClientMutation.isPending}
            >
              {deleteClientMutation.isPending && (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Quotas Dialog */}
      <Dialog open={isEditQuotasDialogOpen} onOpenChange={setIsEditQuotasDialogOpen}>
        <DialogContent className="z-[9999]">
          <DialogHeader>
            <DialogTitle>Edit Resource Quotas</DialogTitle>
            <DialogDescription>
              Update the resource limitations for {clientDetail?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label htmlFor="quotas-projects" className="text-sm font-medium">
                  Project Quota
                </label>
                <Input
                  id="quotas-projects"
                  type="number"
                  value={editQuotasData.quotaProjects || 10}
                  onChange={e =>
                    setEditQuotasData({
                      ...editQuotasData,
                      quotaProjects: parseInt(e.target.value),
                    })
                  }
                  min="1"
                  max="1000"
                />
                <p className="text-xs text-muted-foreground">Maximum number of active projects</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="quotas-storage" className="text-sm font-medium">
                  Storage Quota (GB)
                </label>
                <Input
                  id="quotas-storage"
                  type="number"
                  value={editQuotasData.quotaStorageGB || 5}
                  onChange={e =>
                    setEditQuotasData({
                      ...editQuotasData,
                      quotaStorageGB: parseInt(e.target.value),
                    })
                  }
                  min="1"
                  max="10000"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum storage capacity in gigabytes
                </p>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-blue-800 mb-2">Current Usage</h4>
              <div className="text-sm text-blue-700 space-y-1">
                <div>
                  Projects: {clientDetail?.activeProjects || 0} /{' '}
                  {clientDetail?.quotaProjects || 10} used
                </div>
                <div>
                  Storage: {clientDetail?.storageUsedGB || 0} GB /{' '}
                  {clientDetail?.quotaStorageGB || 5} GB used
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditQuotasDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateQuotas} disabled={updateQuotasMutation.isPending}>
              {updateQuotasMutation.isPending && (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              )}
              Update Quotas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientManagement;

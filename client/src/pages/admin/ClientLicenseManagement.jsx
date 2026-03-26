// client/src/pages/ClientLicenseManagement.jsx
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/queryClient';
import { useTenant } from '../../contexts/TenantContext';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Key,
  Link,
  Copy,
  Check,
  Shield,
  Users,
  FileText,
  Package,
  AlertTriangle,
  Calendar,
  Activity,
  BarChart3,
  Lock,
  Unlock,
  RefreshCw,
  Settings,
  Database,
  Eye,
  EyeOff,
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const ClientLicenseManagement = () => {
  const queryClient = useQueryClient();
  const { currentOrganization } = useTenant();
  const [selectedClient, setSelectedClient] = useState(null);
  const [isNewLicenseDialogOpen, setIsNewLicenseDialogOpen] = useState(false);
  const [isEditLicenseDialogOpen, setIsEditLicenseDialogOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  // License form data
  const [newLicenseData, setNewLicenseData] = useState({
    clientName: '',
    companyName: '',
    contactEmail: '',
    licenseType: 'professional',
    // License limits
    maxUsers: 10,
    maxSubmissions: 50,
    maxStorageGB: 100,
    maxProjects: 20,
    // Feature toggles
    features: {
      fda510k: true,
      fdaPMA: true,
      euMDR: true,
      aiAssistance: true,
      collaborationTools: true,
      advancedAnalytics: false,
      apiAccess: false,
      whiteLabeling: false,
      customIntegrations: false,
    },
    // License duration
    validFrom: new Date().toISOString().split('T')[0],
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    // Access control
    ipRestrictions: '',
    notes: '',
  });

  // Fetch all client licenses
  const {
    data: licensesData,
    isLoading: isLoadingLicenses,
    error: licensesError,
  } = useQuery({
    queryKey: ['/api/licenses'],
    queryFn: () => apiRequest('/api/licenses'),
  });

  // Fetch license usage statistics
  const { data: usageData } = useQuery({
    queryKey: ['/api/licenses', selectedClient, 'usage'],
    queryFn: () => apiRequest(`/api/licenses/${selectedClient}/usage`),
    enabled: !!selectedClient,
  });

  // Create new license mutation
  const createLicenseMutation = useMutation({
    mutationFn: licenseData =>
      apiRequest('/api/licenses', {
        method: 'POST',
        body: JSON.stringify(licenseData),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(['/api/licenses']);
      setIsNewLicenseDialogOpen(false);
      toast({
        title: 'License Created',
        description: 'Client license has been created successfully with private URL.',
      });
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create license',
        variant: 'destructive',
      });
    },
  });

  // Update license mutation
  const updateLicenseMutation = useMutation({
    mutationFn: ({ id, data }) =>
      apiRequest(`/api/licenses/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(['/api/licenses']);
      setIsEditLicenseDialogOpen(false);
      toast({
        title: 'License Updated',
        description: 'License limits and features have been updated.',
      });
    },
  });

  // Revoke license mutation
  const revokeLicenseMutation = useMutation({
    mutationFn: id =>
      apiRequest(`/api/licenses/${id}/revoke`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(['/api/licenses']);
      toast({
        title: 'License Revoked',
        description: 'Client access has been revoked.',
        variant: 'destructive',
      });
    },
  });

  // Generate new access key mutation
  const regenerateKeyMutation = useMutation({
    mutationFn: id =>
      apiRequest(`/api/licenses/${id}/regenerate-key`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(['/api/licenses']);
      toast({
        title: 'Access Key Regenerated',
        description: 'A new private URL has been generated for this client.',
      });
    },
  });

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(type);
    setTimeout(() => setCopiedUrl(null), 3000);
    toast({
      title: 'Copied!',
      description: `${type} copied to clipboard`,
    });
  };

  const formatDate = date => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getLicenseStatus = license => {
    const now = new Date();
    const validUntil = new Date(license.validUntil);
    const daysRemaining = Math.ceil((validUntil - now) / (1000 * 60 * 60 * 24));

    if (license.status === 'revoked') return { status: 'revoked', color: 'destructive' };
    if (daysRemaining < 0) return { status: 'expired', color: 'destructive' };
    if (daysRemaining < 30) return { status: 'expiring', color: 'warning' };
    return { status: 'active', color: 'success' };
  };

  const licenses = licensesData?.licenses || [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Client License Management</h1>
        <p className="text-gray-600">Issue private URLs and manage client access limits</p>
      </div>

      {/* License Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Licenses</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{licenses.length}</div>
            <p className="text-xs text-muted-foreground">Active clients</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {licenses.reduce((sum, l) => sum + (l.activeUsers || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">Across all clients</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Submissions</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {licenses.reduce((sum, l) => sum + (l.submissionsUsed || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              $
              {licenses
                .reduce((sum, l) => {
                  const monthly =
                    l.licenseType === 'starter'
                      ? 2500
                      : l.licenseType === 'professional'
                      ? 7500
                      : 15000;
                  return sum + monthly;
                }, 0)
                .toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Monthly recurring</p>
          </CardContent>
        </Card>
      </div>

      {/* Main License Management */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Client Licenses</CardTitle>
            <Button onClick={() => setIsNewLicenseDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Issue New License
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>License Type</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingLicenses ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ) : licenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                    No licenses issued yet. Click "Issue New License" to get started.
                  </TableCell>
                </TableRow>
              ) : (
                licenses.map(license => {
                  const status = getLicenseStatus(license);
                  return (
                    <TableRow key={license.id}>
                      <TableCell className="font-medium">{license.clientName}</TableCell>
                      <TableCell>{license.companyName}</TableCell>
                      <TableCell>
                        <Badge
                          variant={license.licenseType === 'enterprise' ? 'default' : 'secondary'}
                        >
                          {license.licenseType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">
                            {license.activeUsers || 0}/{license.maxUsers} users
                          </div>
                          <div className="text-sm text-gray-500">
                            {license.submissionsUsed || 0}/{license.maxSubmissions} submissions
                          </div>
                          <Progress
                            value={((license.submissionsUsed || 0) / license.maxSubmissions) * 100}
                            className="h-2"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.color}>{status.status}</Badge>
                      </TableCell>
                      <TableCell>{formatDate(license.validUntil)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(license.privateUrl, 'Private URL')}
                          >
                            <Link className="h-4 w-4 mr-1" />
                            {copiedUrl === 'Private URL' ? <Check className="h-4 w-4" /> : 'URL'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedClient(license);
                              setIsEditLicenseDialogOpen(true);
                            }}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create New License Dialog */}
      <Dialog open={isNewLicenseDialogOpen} onOpenChange={setIsNewLicenseDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Issue New Client License</DialogTitle>
            <DialogDescription>
              Create a new license with private URL and access limits
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="limits">Limits</TabsTrigger>
              <TabsTrigger value="features">Features</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Client Name</Label>
                  <Input
                    value={newLicenseData.clientName}
                    onChange={e =>
                      setNewLicenseData({ ...newLicenseData, clientName: e.target.value })
                    }
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <Label>Company Name</Label>
                  <Input
                    value={newLicenseData.companyName}
                    onChange={e =>
                      setNewLicenseData({ ...newLicenseData, companyName: e.target.value })
                    }
                    placeholder="Pharma Corp"
                  />
                </div>
              </div>
              <div>
                <Label>Contact Email</Label>
                <Input
                  type="email"
                  value={newLicenseData.contactEmail}
                  onChange={e =>
                    setNewLicenseData({ ...newLicenseData, contactEmail: e.target.value })
                  }
                  placeholder="john.doe@company.com"
                />
              </div>
              <div>
                <Label>License Type</Label>
                <Select
                  value={newLicenseData.licenseType}
                  onValueChange={value =>
                    setNewLicenseData({ ...newLicenseData, licenseType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter - $2,500/month</SelectItem>
                    <SelectItem value="professional">Professional - $7,500/month</SelectItem>
                    <SelectItem value="enterprise">Enterprise - Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Valid From</Label>
                  <Input
                    type="date"
                    value={newLicenseData.validFrom}
                    onChange={e =>
                      setNewLicenseData({ ...newLicenseData, validFrom: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Valid Until</Label>
                  <Input
                    type="date"
                    value={newLicenseData.validUntil}
                    onChange={e =>
                      setNewLicenseData({ ...newLicenseData, validUntil: e.target.value })
                    }
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="limits" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Max Users</Label>
                  <Input
                    type="number"
                    value={newLicenseData.maxUsers}
                    onChange={e =>
                      setNewLicenseData({ ...newLicenseData, maxUsers: parseInt(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Max Submissions/Month</Label>
                  <Input
                    type="number"
                    value={newLicenseData.maxSubmissions}
                    onChange={e =>
                      setNewLicenseData({
                        ...newLicenseData,
                        maxSubmissions: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Max Projects</Label>
                  <Input
                    type="number"
                    value={newLicenseData.maxProjects}
                    onChange={e =>
                      setNewLicenseData({
                        ...newLicenseData,
                        maxProjects: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Max Storage (GB)</Label>
                  <Input
                    type="number"
                    value={newLicenseData.maxStorageGB}
                    onChange={e =>
                      setNewLicenseData({
                        ...newLicenseData,
                        maxStorageGB: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="features" className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>FDA 510(k) Submissions</Label>
                  <Switch
                    checked={newLicenseData.features.fda510k}
                    onCheckedChange={checked =>
                      setNewLicenseData({
                        ...newLicenseData,
                        features: { ...newLicenseData.features, fda510k: checked },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>FDA PMA Submissions</Label>
                  <Switch
                    checked={newLicenseData.features.fdaPMA}
                    onCheckedChange={checked =>
                      setNewLicenseData({
                        ...newLicenseData,
                        features: { ...newLicenseData.features, fdaPMA: checked },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>EU MDR CER</Label>
                  <Switch
                    checked={newLicenseData.features.euMDR}
                    onCheckedChange={checked =>
                      setNewLicenseData({
                        ...newLicenseData,
                        features: { ...newLicenseData.features, euMDR: checked },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>AI Assistance</Label>
                  <Switch
                    checked={newLicenseData.features.aiAssistance}
                    onCheckedChange={checked =>
                      setNewLicenseData({
                        ...newLicenseData,
                        features: { ...newLicenseData.features, aiAssistance: checked },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Collaboration Tools</Label>
                  <Switch
                    checked={newLicenseData.features.collaborationTools}
                    onCheckedChange={checked =>
                      setNewLicenseData({
                        ...newLicenseData,
                        features: { ...newLicenseData.features, collaborationTools: checked },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Advanced Analytics</Label>
                  <Switch
                    checked={newLicenseData.features.advancedAnalytics}
                    onCheckedChange={checked =>
                      setNewLicenseData({
                        ...newLicenseData,
                        features: { ...newLicenseData.features, advancedAnalytics: checked },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>API Access</Label>
                  <Switch
                    checked={newLicenseData.features.apiAccess}
                    onCheckedChange={checked =>
                      setNewLicenseData({
                        ...newLicenseData,
                        features: { ...newLicenseData.features, apiAccess: checked },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>White Labeling</Label>
                  <Switch
                    checked={newLicenseData.features.whiteLabeling}
                    onCheckedChange={checked =>
                      setNewLicenseData({
                        ...newLicenseData,
                        features: { ...newLicenseData.features, whiteLabeling: checked },
                      })
                    }
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="security" className="space-y-4">
              <div>
                <Label>IP Restrictions (optional)</Label>
                <Textarea
                  value={newLicenseData.ipRestrictions}
                  onChange={e =>
                    setNewLicenseData({ ...newLicenseData, ipRestrictions: e.target.value })
                  }
                  placeholder="Enter IP addresses or ranges (one per line)"
                  rows={4}
                />
                <p className="text-sm text-gray-500 mt-1">
                  Leave empty to allow access from any IP
                </p>
              </div>
              <div>
                <Label>Internal Notes</Label>
                <Textarea
                  value={newLicenseData.notes}
                  onChange={e => setNewLicenseData({ ...newLicenseData, notes: e.target.value })}
                  placeholder="Any internal notes about this client..."
                  rows={3}
                />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsNewLicenseDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createLicenseMutation.mutate(newLicenseData)}
              disabled={
                createLicenseMutation.isPending ||
                !newLicenseData.clientName ||
                !newLicenseData.companyName
              }
            >
              {createLicenseMutation.isPending ? 'Creating...' : 'Issue License'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* License Created Success Alert */}
      {licensesData?.latestLicense && (
        <Alert className="mt-6">
          <Shield className="h-4 w-4" />
          <AlertTitle>License Created Successfully</AlertTitle>
          <AlertDescription>
            <div className="mt-2 space-y-2">
              <p>Private URL for {licensesData.latestLicense.clientName}:</p>
              <div className="flex items-center gap-2 p-2 bg-gray-100 rounded">
                <code className="flex-1 text-sm">{licensesData.latestLicense.privateUrl}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(licensesData.latestLicense.privateUrl, 'URL')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 p-2 bg-gray-100 rounded">
                <code className="flex-1 text-sm">
                  License Key:{' '}
                  {showPrivateKey ? licensesData.latestLicense.licenseKey : '••••••••••••••••'}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                >
                  {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default ClientLicenseManagement;

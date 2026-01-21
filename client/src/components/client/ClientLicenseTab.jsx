// client/src/components/client/ClientLicenseTab.jsx
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '../../lib/queryClient.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Key,
  Link,
  Copy,
  Check,
  Shield,
  Activity,
  FileText,
  AlertTriangle,
  Calendar,
  Package,
  Eye,
  EyeOff,
  RefreshCw,
  Lock,
  Unlock,
  Stethoscope,
  TestTube2,
  FileBox,
} from 'lucide-react';

const ClientLicenseTab = ({ clientId, clientDetail }) => {
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [copiedText, setCopiedText] = useState(null);

  // Fetch client license data
  const { data: licenseData, isLoading: isLoadingLicense } = useQuery({
    queryKey: ['/api/licenses/client', clientId],
    queryFn: async () => {
      return await apiRequest(`/api/licenses/client/${clientId}`, { method: 'GET' });
    },
    enabled: !!clientId,
  });

  // Fetch license usage statistics
  const { data: usageData, isLoading: isLoadingUsage } = useQuery({
    queryKey: ['/api/licenses/client', clientId, 'usage'],
    queryFn: async () => {
      return await apiRequest(`/api/licenses/client/${clientId}/usage`, { method: 'GET' });
    },
    enabled: !!clientId,
  });

  // Create or update license mutation
  const saveLicenseMutation = useMutation({
    mutationFn: async (licenseData) => {
      if (licenseData.id) {
        return await apiRequest(`/api/licenses/${licenseData.id}`, { 
          method: 'PUT', 
          data: licenseData 
        });
      } else {
        return await apiRequest('/api/licenses', { 
          method: 'POST', 
          data: { ...licenseData, clientId } 
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['/api/licenses/client', clientId]);
      toast({
        title: 'License Updated',
        description: 'Medical device submission license has been configured.',
      });
    },
  });

  // Regenerate access key mutation
  const regenerateKeyMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/licenses/${licenseData?.license?.id}/regenerate-key`, { 
        method: 'POST' 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['/api/licenses/client', clientId]);
      toast({
        title: 'Access Key Regenerated',
        description: 'A new private URL has been generated for this client.',
      });
    },
  });

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedText(type);
    setTimeout(() => setCopiedText(null), 3000);
    toast({
      title: 'Copied!',
      description: `${type} copied to clipboard`,
    });
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getLicenseStatus = (license) => {
    if (!license) return { status: 'none', color: 'secondary' };
    
    const now = new Date();
    const validUntil = new Date(license.validUntil);
    const daysRemaining = Math.ceil((validUntil - now) / (1000 * 60 * 60 * 24));
    
    if (license.status === 'revoked') return { status: 'revoked', color: 'destructive' };
    if (daysRemaining < 0) return { status: 'expired', color: 'destructive' };
    if (daysRemaining < 30) return { status: 'expiring', color: 'warning' };
    return { status: 'active', color: 'success' };
  };

  const license = licenseData?.license;
  const usage = usageData?.usage;
  const status = getLicenseStatus(license);

  // Default license configuration for new clients
  const [licenseConfig, setLicenseConfig] = useState({
    licenseType: license?.licenseType || 'professional',
    maxUsers: license?.maxUsers || 10,
    maxSubmissions: license?.maxSubmissions || 50,
    maxStorageGB: license?.maxStorageGB || 100,
    maxProjects: license?.maxProjects || 20,
    validFrom: license?.validFrom || new Date().toISOString().split('T')[0],
    validUntil: license?.validUntil || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    features: license?.features || {
      fda510k: true,
      fdaPMA: true,
      euMDR: true,
      aiAssistance: true,
      collaborationTools: true,
      advancedAnalytics: false,
      apiAccess: false,
      whiteLabeling: false,
    },
  });

  useEffect(() => {
    if (license) {
      setLicenseConfig({
        licenseType: license.licenseType,
        maxUsers: license.maxUsers,
        maxSubmissions: license.maxSubmissions,
        maxStorageGB: license.maxStorageGB,
        maxProjects: license.maxProjects,
        validFrom: license.validFrom,
        validUntil: license.validUntil,
        features: license.features || {},
      });
    }
  }, [license]);

  if (isLoadingLicense || isLoadingUsage) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Loading License Information...</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* License Status Card */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Medical Device Submission License
              </CardTitle>
              <CardDescription>
                {clientDetail?.name} - Medical Device & Diagnostics Regulatory Module Access
              </CardDescription>
            </div>
            <Badge variant={status.color}>
              {status.status === 'none' ? 'No License' : status.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {license ? (
            <>
              {/* Private Access URL */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <Label className="text-sm font-medium mb-2 block">Private Access URL</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs p-2 bg-white border rounded">
                    {license.privateUrl || `${window.location.origin}/client-access/${clientId}/${license.accessToken}`}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(license.privateUrl || `${window.location.origin}/client-access/${clientId}/${license.accessToken}`, 'URL')}
                  >
                    {copiedText === 'URL' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Share this URL with the client for direct access to their Medical Device & Diagnostics submissions
                </p>
              </div>

              {/* License Key */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <Label className="text-sm font-medium mb-2 block">License Key</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs p-2 bg-white border rounded">
                    {showPrivateKey ? (license.licenseKey || 'MDD-XXXX-XXXX-XXXX') : '••••-••••-••••-••••'}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                  >
                    {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => regenerateKeyMutation.mutate()}
                    disabled={regenerateKeyMutation.isPending}
                  >
                    <RefreshCw className={`h-4 w-4 ${regenerateKeyMutation.isPending ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No License Issued</AlertTitle>
              <AlertDescription>
                Configure and issue a license to enable Medical Device & Diagnostics submissions for this client.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Medical Device Features Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            Medical Device & Diagnostics Regulatory Module Features
          </CardTitle>
          <CardDescription>
            Configure access to FDA and EU regulatory submission types
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* FDA Submissions */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm">FDA Submissions</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <FileBox className="h-4 w-4 text-blue-600" />
                    510(k) Premarket Notification
                  </Label>
                  <Switch
                    checked={licenseConfig.features.fda510k}
                    onCheckedChange={(checked) => setLicenseConfig({
                      ...licenseConfig,
                      features: { ...licenseConfig.features, fda510k: checked }
                    })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    PMA (Premarket Approval)
                  </Label>
                  <Switch
                    checked={licenseConfig.features.fdaPMA}
                    onCheckedChange={(checked) => setLicenseConfig({
                      ...licenseConfig,
                      features: { ...licenseConfig.features, fdaPMA: checked }
                    })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <TestTube2 className="h-4 w-4 text-blue-600" />
                    De Novo Classification
                  </Label>
                  <Switch
                    checked={licenseConfig.features.deNovo}
                    onCheckedChange={(checked) => setLicenseConfig({
                      ...licenseConfig,
                      features: { ...licenseConfig.features, deNovo: checked }
                    })}
                  />
                </div>
              </div>
            </div>

            {/* EU Submissions */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm">EU Submissions</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-green-600" />
                    MDR CER (Clinical Evaluation)
                  </Label>
                  <Switch
                    checked={licenseConfig.features.euMDR}
                    onCheckedChange={(checked) => setLicenseConfig({
                      ...licenseConfig,
                      features: { ...licenseConfig.features, euMDR: checked }
                    })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <TestTube2 className="h-4 w-4 text-green-600" />
                    IVDR Performance Evaluation
                  </Label>
                  <Switch
                    checked={licenseConfig.features.ivdr}
                    onCheckedChange={(checked) => setLicenseConfig({
                      ...licenseConfig,
                      features: { ...licenseConfig.features, ivdr: checked }
                    })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <FileBox className="h-4 w-4 text-green-600" />
                    Technical Documentation
                  </Label>
                  <Switch
                    checked={licenseConfig.features.techDoc}
                    onCheckedChange={(checked) => setLicenseConfig({
                      ...licenseConfig,
                      features: { ...licenseConfig.features, techDoc: checked }
                    })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* AI Features */}
          <div className="pt-4 border-t">
            <h4 className="font-medium text-sm mb-3">AI-Powered Features</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="flex items-center justify-between">
                <Label>AI Document Generation</Label>
                <Switch
                  checked={licenseConfig.features.aiAssistance}
                  onCheckedChange={(checked) => setLicenseConfig({
                    ...licenseConfig,
                    features: { ...licenseConfig.features, aiAssistance: checked }
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Predicate Analysis (510k)</Label>
                <Switch
                  checked={licenseConfig.features.predicateAnalysis}
                  onCheckedChange={(checked) => setLicenseConfig({
                    ...licenseConfig,
                      features: { ...licenseConfig.features, predicateAnalysis: checked }
                  })}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage & Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Submission Limits & Usage</CardTitle>
          <CardDescription>
            Track and configure submission quotas for {clientDetail?.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Submission Limits */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Max Submissions/Month</Label>
              <Input
                type="number"
                value={licenseConfig.maxSubmissions}
                onChange={(e) => setLicenseConfig({
                  ...licenseConfig,
                  maxSubmissions: parseInt(e.target.value)
                })}
                min="1"
              />
            </div>
            <div>
              <Label>Max Projects</Label>
              <Input
                type="number"
                value={licenseConfig.maxProjects}
                onChange={(e) => setLicenseConfig({
                  ...licenseConfig,
                  maxProjects: parseInt(e.target.value)
                })}
                min="1"
              />
            </div>
          </div>

          {/* Usage Statistics */}
          {usage && (
            <div className="space-y-3 pt-4 border-t">
              <h4 className="font-medium text-sm">Current Usage</h4>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Submissions This Month</span>
                    <span>{usage.monthlySubmissions || 0}/{licenseConfig.maxSubmissions}</span>
                  </div>
                  <Progress 
                    value={(usage.monthlySubmissions || 0) / licenseConfig.maxSubmissions * 100}
                    className="h-2"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Active Projects</span>
                    <span>{usage.activeProjects || 0}/{licenseConfig.maxProjects}</span>
                  </div>
                  <Progress 
                    value={(usage.activeProjects || 0) / licenseConfig.maxProjects * 100}
                    className="h-2"
                  />
                </div>
              </div>

              {/* Submission Breakdown */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="text-center p-2 bg-gray-50 rounded">
                  <div className="text-lg font-bold">{usage.fda510kCount || 0}</div>
                  <div className="text-xs text-gray-500">510(k)</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded">
                  <div className="text-lg font-bold">{usage.pmaCount || 0}</div>
                  <div className="text-xs text-gray-500">PMA</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded">
                  <div className="text-lg font-bold">{usage.cerCount || 0}</div>
                  <div className="text-xs text-gray-500">CER</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* License Type & Duration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">License Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>License Type</Label>
              <Select
                value={licenseConfig.licenseType}
                onValueChange={(value) => setLicenseConfig({ ...licenseConfig, licenseType: value })}
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
            <div>
              <Label>Max Users</Label>
              <Input
                type="number"
                value={licenseConfig.maxUsers}
                onChange={(e) => setLicenseConfig({
                  ...licenseConfig,
                  maxUsers: parseInt(e.target.value)
                })}
                min="1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Valid From</Label>
              <Input
                type="date"
                value={licenseConfig.validFrom}
                onChange={(e) => setLicenseConfig({ ...licenseConfig, validFrom: e.target.value })}
              />
            </div>
            <div>
              <Label>Valid Until</Label>
              <Input
                type="date"
                value={licenseConfig.validUntil}
                onChange={(e) => setLicenseConfig({ ...licenseConfig, validUntil: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setLicenseConfig(license || {})}
            disabled={!license}
          >
            Reset
          </Button>
          <Button
            onClick={() => {
              // Ensure all numeric values are properly parsed
              const licenseData = {
                ...licenseConfig,
                id: license?.id,
                clientId: clientId,
                clientName: clientDetail?.name,
                companyName: clientDetail?.name,
                contactEmail: clientDetail?.contact_email || clientDetail?.email || 'admin@example.com',
                maxUsers: parseInt(licenseConfig.maxUsers) || 10,
                maxSubmissions: parseInt(licenseConfig.maxSubmissions) || 100,
                maxProjects: parseInt(licenseConfig.maxProjects) || 50,
                maxStorageGB: parseInt(licenseConfig.maxStorageGB) || 100,
              };
              console.log('Saving license with data:', licenseData);
              saveLicenseMutation.mutate(licenseData);
            }}
            disabled={saveLicenseMutation.isPending}
          >
            {saveLicenseMutation.isPending && (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            )}
            {license ? 'Update License' : 'Issue License'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default ClientLicenseTab;
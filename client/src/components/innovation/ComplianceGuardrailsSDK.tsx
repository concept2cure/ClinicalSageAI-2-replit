/**
 * Compliance Guardrails SDK Component
 * 
 * Pre-submission validation API with rule management, validation runs,
 * and CI/CD integration guidance.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, Clock,
  Code2, Copy, FileCode, Filter, GitBranch, Layers, Play, Plus,
  RefreshCw, Search, Settings, Shield, ShieldAlert, ShieldCheck,
  Terminal, XCircle, Zap, BookOpen, Key
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Types
interface GuardrailRule {
  id: string;
  ruleCode: string;
  category: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  ruleType: 'schema' | 'format' | 'content' | 'completeness' | 'consistency' | 'regulatory' | 'custom';
  validationLogic: string;
  parameters?: Record<string, any>;
  agency?: string;
  documentTypes?: string[];
  isActive: boolean;
  createdAt: string;
}

interface GuardrailProfile {
  id: string;
  profileCode: string;
  name: string;
  description?: string;
  submissionType: string;
  agency: string;
  baseProfile?: string;
  isDefault: boolean;
  ruleCount?: number;
}

interface ValidationRun {
  id: string;
  documentId: string;
  documentName?: string;
  profileId: string;
  profileName?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  triggeredBy: string;
  executionContext: string;
  startedAt: string;
  completedAt?: string;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  warningCount: number;
  errorCount: number;
  summary?: string;
}

interface GuardrailFinding {
  id: string;
  runId: string;
  ruleId: string;
  ruleName?: string;
  ruleCode?: string;
  severity: 'error' | 'warning' | 'info';
  status: 'open' | 'acknowledged' | 'resolved' | 'false_positive';
  location?: string;
  message: string;
  details?: string;
  suggestedFix?: string;
}

interface ApiKey {
  id: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  lastUsed?: string;
  expiresAt?: string;
}

const SEVERITY_CONFIG = {
  error: { color: 'destructive', icon: XCircle, bg: 'bg-red-500/10' },
  warning: { color: 'warning', icon: AlertTriangle, bg: 'bg-yellow-500/10' },
  info: { color: 'secondary', icon: CheckCircle2, bg: 'bg-blue-500/10' }
};

const STATUS_CONFIG = {
  pending: { color: 'secondary', icon: Clock },
  running: { color: 'default', icon: RefreshCw },
  completed: { color: 'success', icon: CheckCircle2 },
  failed: { color: 'destructive', icon: XCircle }
};

export function ComplianceGuardrailsSDK({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const [rules, setRules] = useState<GuardrailRule[]>([]);
  const [profiles, setProfiles] = useState<GuardrailProfile[]>([]);
  const [validationRuns, setValidationRuns] = useState<ValidationRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<ValidationRun | null>(null);
  const [findings, setFindings] = useState<GuardrailFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [showApiDocs, setShowApiDocs] = useState(false);
  const [runningValidation, setRunningValidation] = useState(false);

  // Sample validation document ID for demo
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');

  // Load data
  useEffect(() => {
    loadData();
  }, [organizationId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rulesRes, profilesRes, runsRes] = await Promise.all([
        fetch(`/api/innovation/guardrails/rules?organizationId=${organizationId}`),
        fetch(`/api/innovation/guardrails/profiles?organizationId=${organizationId}`),
        fetch(`/api/innovation/guardrails/runs?organizationId=${organizationId}&limit=20`)
      ]);

      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data.data || []);
      }
      if (profilesRes.ok) {
        const data = await profilesRes.json();
        setProfiles(data.data || []);
      }
      if (runsRes.ok) {
        const data = await runsRes.json();
        setValidationRuns(data.data || []);
      }
    } catch (error) {
      console.error('Error loading guardrails data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFindings = async (runId: string) => {
    try {
      const response = await fetch(`/api/innovation/guardrails/runs/${runId}/findings`);
      if (response.ok) {
        const data = await response.json();
        setFindings(data.data || []);
      }
    } catch (error) {
      console.error('Error loading findings:', error);
    }
  };

  const runValidation = async () => {
    if (!selectedDocumentId || !selectedProfileId) {
      toast({
        title: 'Missing Selection',
        description: 'Please select a document and profile',
        variant: 'destructive'
      });
      return;
    }

    setRunningValidation(true);
    try {
      const response = await fetch('/api/innovation/guardrails/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: selectedDocumentId,
          profileId: selectedProfileId,
          triggeredBy: 'manual',
          executionContext: 'ui'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setValidationRuns(prev => [data.data, ...prev]);
        setSelectedRun(data.data);
        loadFindings(data.data.id);
        toast({
          title: 'Validation Complete',
          description: `Found ${data.data.errorCount} errors and ${data.data.warningCount} warnings`
        });
      }
    } catch (error) {
      toast({
        title: 'Validation Failed',
        description: 'An error occurred during validation',
        variant: 'destructive'
      });
    } finally {
      setRunningValidation(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Code copied to clipboard'
    });
  };

  // Filter rules
  const filteredRules = useMemo(() => {
    return rules.filter(r => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (severityFilter !== 'all' && r.severity !== severityFilter) return false;
      if (searchTerm && !r.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [rules, categoryFilter, severityFilter, searchTerm]);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = validationRuns.length;
    const passed = validationRuns.filter(r => r.errorCount === 0).length;
    const avgErrors = total > 0
      ? validationRuns.reduce((acc, r) => acc + r.errorCount, 0) / total
      : 0;
    return { total, passed, passRate: total > 0 ? (passed / total) * 100 : 0, avgErrors };
  }, [validationRuns]);

  const categories = useMemo(() => {
    return Array.from(new Set(rules.map(r => r.category)));
  }, [rules]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/10 to-pink-500/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Compliance Guardrails SDK</h2>
            <p className="text-muted-foreground">
              Pre-submission validation API and rule management
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowApiDocs(true)}>
            <Code2 className="h-4 w-4 mr-2" />
            API Docs
          </Button>
          <Button onClick={runValidation} disabled={runningValidation}>
            {runningValidation ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run Validation
          </Button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <Layers className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-3xl font-bold">{rules.length}</p>
            <p className="text-sm text-muted-foreground">Active Rules</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Settings className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-3xl font-bold">{profiles.length}</p>
            <p className="text-sm text-muted-foreground">Profiles</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <GitBranch className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-3xl font-bold">{stats.total}</p>
            <p className="text-sm text-muted-foreground">Validation Runs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <ShieldCheck className="h-6 w-6 mx-auto mb-2 text-green-500" />
            <p className="text-3xl font-bold">{stats.passRate.toFixed(0)}%</p>
            <p className="text-sm text-muted-foreground">Pass Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <ShieldAlert className="h-6 w-6 mx-auto mb-2 text-red-500" />
            <p className="text-3xl font-bold">{stats.avgErrors.toFixed(1)}</p>
            <p className="text-sm text-muted-foreground">Avg Errors</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="rules">Rules ({rules.length})</TabsTrigger>
          <TabsTrigger value="profiles">Profiles ({profiles.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="integration">CI/CD Integration</TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Recent Runs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Validation Runs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {validationRuns.slice(0, 5).map((run) => {
                    const StatusIcon = STATUS_CONFIG[run.status]?.icon || Clock;
                    return (
                      <div
                        key={run.id}
                        className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-accent/50"
                        onClick={() => {
                          setSelectedRun(run);
                          loadFindings(run.id);
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <StatusIcon className={`h-5 w-5 ${
                            run.status === 'completed' && run.errorCount === 0
                              ? 'text-green-500'
                              : run.errorCount > 0
                              ? 'text-red-500'
                              : 'text-muted-foreground'
                          }`} />
                          <div>
                            <p className="font-medium text-sm">{run.documentName || 'Document'}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(run.startedAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {run.errorCount > 0 && (
                            <Badge variant="destructive">{run.errorCount} errors</Badge>
                          )}
                          {run.warningCount > 0 && (
                            <Badge variant="warning">{run.warningCount} warnings</Badge>
                          )}
                          {run.errorCount === 0 && run.warningCount === 0 && (
                            <Badge variant="success">Passed</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Selected Run Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {selectedRun ? 'Run Details' : 'Select a Run'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedRun ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge variant={STATUS_CONFIG[selectedRun.status]?.color as any}>
                        {selectedRun.status}
                      </Badge>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Pass Rate</span>
                        <span className="text-sm font-medium">
                          {selectedRun.totalRules > 0
                            ? ((selectedRun.passedRules / selectedRun.totalRules) * 100).toFixed(0)
                            : 0}%
                        </span>
                      </div>
                      <Progress
                        value={selectedRun.totalRules > 0
                          ? (selectedRun.passedRules / selectedRun.totalRules) * 100
                          : 0}
                      />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Findings</h4>
                      <ScrollArea className="h-[200px]">
                        {findings.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No findings
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {findings.map((finding) => {
                              const SeverityIcon = SEVERITY_CONFIG[finding.severity]?.icon || AlertTriangle;
                              return (
                                <div
                                  key={finding.id}
                                  className={`p-2 rounded-lg ${SEVERITY_CONFIG[finding.severity]?.bg}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <SeverityIcon className="h-4 w-4" />
                                    <span className="text-sm font-medium">
                                      {finding.ruleCode}: {finding.message}
                                    </span>
                                  </div>
                                  {finding.suggestedFix && (
                                    <p className="text-xs text-muted-foreground mt-1 ml-6">
                                      Fix: {finding.suggestedFix}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Shield className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
                    <p className="text-muted-foreground">
                      Select a validation run to view details
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Rules */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search rules..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {filteredRules.map((rule) => {
              const SeverityIcon = SEVERITY_CONFIG[rule.severity]?.icon || AlertTriangle;
              return (
                <Card key={rule.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <SeverityIcon className={`h-4 w-4 ${
                          rule.severity === 'error' ? 'text-red-500' :
                          rule.severity === 'warning' ? 'text-yellow-500' :
                          'text-blue-500'
                        }`} />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {rule.ruleCode}
                        </code>
                      </div>
                      <Badge variant={rule.isActive ? 'default' : 'secondary'}>
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <h4 className="font-medium mb-1">{rule.name}</h4>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {rule.description}
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <Badge variant="outline">{rule.category}</Badge>
                      <Badge variant="outline">{rule.ruleType}</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Profiles */}
        <TabsContent value="profiles" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {profiles.map((profile) => (
              <Card key={profile.id} className={profile.isDefault ? 'ring-2 ring-primary' : ''}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {profile.profileCode}
                    </code>
                    {profile.isDefault && (
                      <Badge>Default</Badge>
                    )}
                  </div>
                  <h4 className="font-medium mb-1">{profile.name}</h4>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {profile.description || 'No description'}
                  </p>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{profile.agency}</Badge>
                      <Badge variant="outline">{profile.submissionType}</Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {profile.ruleCount || 0} rules
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* History */}
        <TabsContent value="history">
          <Card>
            <CardContent className="py-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Document</th>
                    <th className="text-left py-3 px-4 font-medium">Profile</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-left py-3 px-4 font-medium">Results</th>
                    <th className="text-left py-3 px-4 font-medium">Triggered By</th>
                    <th className="text-left py-3 px-4 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {validationRuns.map((run) => (
                    <tr key={run.id} className="border-b last:border-0 hover:bg-accent/50">
                      <td className="py-3 px-4">{run.documentName || 'Document'}</td>
                      <td className="py-3 px-4">{run.profileName || 'Profile'}</td>
                      <td className="py-3 px-4">
                        <Badge variant={STATUS_CONFIG[run.status]?.color as any}>
                          {run.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-green-500">{run.passedRules} ✓</span>
                          <span className="text-red-500">{run.errorCount} ✗</span>
                          <span className="text-yellow-500">{run.warningCount} ⚠</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline">{run.triggeredBy}</Badge>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {new Date(run.startedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CI/CD Integration */}
        <TabsContent value="integration" className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  CLI Usage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`# Install the CLI
npm install -g @trialsage/guardrails-cli

# Run validation
trialsage validate \\
  --document ./submission.pdf \\
  --profile fda-nda-standard \\
  --api-key $TRIALSAGE_API_KEY`}
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard('npm install -g @trialsage/guardrails-cli')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  GitHub Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`name: Compliance Check
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: trialsage/guardrails-action@v1
        with:
          api-key: \${{ secrets.TRIALSAGE_API_KEY }}
          profile: fda-nda-standard
          fail-on-warnings: true`}
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard('uses: trialsage/guardrails-action@v1')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Code2 className="h-5 w-5" />
                  REST API
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`POST /api/v1/guardrails/validate
Authorization: Bearer <api-key>
Content-Type: application/json

{
  "documentId": "doc-123",
  "profileCode": "fda-nda-standard",
  "async": false
}`}
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard('POST /api/v1/guardrails/validate')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  API Keys
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Manage API keys for CI/CD integration and external access.
                </p>
                <Button variant="outline" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Generate New API Key
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* API Docs Dialog */}
      <Dialog open={showApiDocs} onOpenChange={setShowApiDocs}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Guardrails SDK API Documentation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <section>
              <h3 className="text-lg font-semibold mb-2">Overview</h3>
              <p className="text-sm text-muted-foreground">
                The Compliance Guardrails SDK provides programmatic access to pre-submission
                validation rules, allowing you to integrate compliance checks into your
                CI/CD pipeline and development workflow.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-2">Endpoints</h3>
              <div className="space-y-3">
                <div className="p-3 bg-muted rounded-lg">
                  <code className="text-sm font-mono">POST /api/v1/guardrails/validate</code>
                  <p className="text-sm text-muted-foreground mt-1">
                    Run validation against a document using a specified profile.
                  </p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <code className="text-sm font-mono">GET /api/v1/guardrails/rules</code>
                  <p className="text-sm text-muted-foreground mt-1">
                    List all available validation rules.
                  </p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <code className="text-sm font-mono">GET /api/v1/guardrails/profiles</code>
                  <p className="text-sm text-muted-foreground mt-1">
                    List available validation profiles.
                  </p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <code className="text-sm font-mono">GET /api/v1/guardrails/runs/:id</code>
                  <p className="text-sm text-muted-foreground mt-1">
                    Get validation run details and findings.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-2">Authentication</h3>
              <p className="text-sm text-muted-foreground">
                All API requests require Bearer token authentication using your API key.
                Include the header: <code>Authorization: Bearer &lt;api-key&gt;</code>
              </p>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ComplianceGuardrailsSDK;

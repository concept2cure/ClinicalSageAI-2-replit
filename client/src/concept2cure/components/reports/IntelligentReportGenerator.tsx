import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileDown,
  FileStack,
  Filter,
  Mail,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { getOrgId } from '@/utils/authToken';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  WorkspaceCanvas,
  WorkspaceHeaderRich,
} from '@/components/ui/workspace-primitives';
import {
  DataStateWrapper,
  SkeletonCard,
  SkeletonTable,
} from '@/components/ui/statesV2';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type ReportBundle = {
  bundleId: string;
  label: string;
  description: string;
  personas: string[];
  allowedScopes: string[];
  reportTypeIds: string[];
  defaultDeliveryMode: 'platform_email' | 'save_pdf';
  exportFormats: Array<'pdf' | 'json' | 'csv'>;
};

type ReportRunRow = {
  id: number;
  runUuid: string;
  scopeType: string;
  scopeId: string;
  reportTypeId: string;
  status: string;
  confidence: number | null;
  blockers: string[] | null;
  createdAt: string;
};

type WorkspaceSummaryResponse = {
  scope: { scopeType: string; scopeId: string | null };
  bundles: ReportBundle[];
  taxonomy: Array<{
    typeId: string;
    label: string;
    family: string;
    allowedScopes: string[];
    allowedPersonas: string[];
  }>;
  summary: {
    runCount: number;
    immutableReportCount: number;
    learningEventCount: number;
    partialRuns: number;
    completedRuns: number;
  };
  recentRuns: ReportRunRow[];
  recentReports: Array<{
    id: number;
    reportCode: string;
    reportTitle: string;
    reportDomain: string;
    sealStatus: string;
    complianceScore: number | null;
    createdAt: string;
    projectId: number | null;
  }>;
};

type DeliveryMode = 'platform_email' | 'save_pdf';
type ScopeType = 'account' | 'program' | 'project' | 'study' | 'submission' | 'document';

const scopeOptions: Array<{ value: ScopeType; label: string }> = [
  { value: 'account', label: 'Account' },
  { value: 'program', label: 'Program' },
  { value: 'project', label: 'Project' },
  { value: 'study', label: 'Study' },
  { value: 'submission', label: 'Submission' },
  { value: 'document', label: 'Document' },
];

const deliveryOptions: Array<{ value: DeliveryMode; label: string; description: string }> = [
  {
    value: 'platform_email',
    label: 'Send through Concept2Cure',
    description: 'Logs the outbound correspondence and helps the wisdom layer learn from the exchange.',
  },
  {
    value: 'save_pdf',
    label: 'Save PDF for offline delivery',
    description: 'Exports a governed PDF when clients prefer to send from their own email accounts.',
  },
];

function formatDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString();
}

function statusTone(status?: string) {
  switch (status) {
    case 'completed':
    case 'sealed':
      return 'ready';
    case 'partial':
    case 'draft':
      return 'needs-work';
    case 'revoked':
      return 'blocked';
    default:
      return 'drafting';
  }
}

function toneClass(status?: string) {
  switch (statusTone(status)) {
    case 'ready':
      return 'border-stone-200 bg-stone-100 text-stone-800';
    case 'needs-work':
      return 'border-stone-200 bg-stone-100 text-stone-700';
    case 'blocked':
      return 'border-stone-200 bg-stone-100 text-stone-800';
    default:
      return 'border-stone-200 bg-stone-100 text-stone-700';
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function IntelligentReportGenerator() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const organizationId = Number(getOrgId());
  const [scopeType, setScopeType] = useState<ScopeType>('project');
  const [scopeId, setScopeId] = useState('');
  const [bundleSearch, setBundleSearch] = useState('');
  const [personaFilter, setPersonaFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedBundleId, setSelectedBundleId] = useState<string>('');
  const [selectedRecipients, setSelectedRecipients] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('save_pdf');
  const [deliverySubject, setDeliverySubject] = useState('');
  const [deliveryMessage, setDeliveryMessage] = useState('');
  const [selectedReportIds, setSelectedReportIds] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState('packs');

  const workspaceParams = useMemo(
    () => ({
      organizationId,
      scopeType,
      scopeId: scopeId.trim(),
    }),
    [organizationId, scopeId, scopeType]
  );

  const workspaceQuery = useQuery({
    queryKey: queryKeys.reports.workspace(workspaceParams),
    queryFn: async () => {
      const params = new URLSearchParams({
        organizationId: String(organizationId),
        scopeType,
      });
      if (scopeId.trim()) params.set('scopeId', scopeId.trim());
      const response = await apiRequest('GET', `/api/report-os/workspace?${params.toString()}`);
      const json = await response.json();
      return json.data as WorkspaceSummaryResponse;
    },
    enabled: Number.isFinite(organizationId) && organizationId > 0,
  });

  const runsQuery = useQuery({
    queryKey: queryKeys.reports.runs(workspaceParams),
    queryFn: async () => {
      const params = new URLSearchParams({ organizationId: String(organizationId) });
      if (scopeId.trim()) {
        params.set('scopeType', scopeType);
        params.set('scopeId', scopeId.trim());
      }
      const response = await apiRequest('GET', `/api/report-os/runs?${params.toString()}`);
      const json = await response.json();
      return (json.data || []) as ReportRunRow[];
    },
    enabled: Number.isFinite(organizationId) && organizationId > 0,
  });

  const filteredBundles = useMemo(() => {
    const bundles = workspaceQuery.data?.bundles || [];
    return bundles.filter(bundle => {
      const matchesSearch =
        !bundleSearch.trim() ||
        bundle.label.toLowerCase().includes(bundleSearch.toLowerCase()) ||
        bundle.description.toLowerCase().includes(bundleSearch.toLowerCase()) ||
        bundle.personas.some(persona => persona.toLowerCase().includes(bundleSearch.toLowerCase()));

      const matchesPersona =
        personaFilter === 'all' || bundle.personas.includes(personaFilter);

      return matchesSearch && matchesPersona;
    });
  }, [bundleSearch, personaFilter, workspaceQuery.data?.bundles]);

  const filteredRuns = useMemo(() => {
    const runs = runsQuery.data || [];
    return runs.filter(run => (statusFilter === 'all' ? true : run.status === statusFilter));
  }, [runsQuery.data, statusFilter]);

  const selectedBundle =
    workspaceQuery.data?.bundles.find(bundle => bundle.bundleId === selectedBundleId) || null;

  const generateBundleMutation = useMutation({
    mutationFn: async (bundle: ReportBundle) => {
      const resolvedScopeId = scopeId.trim();
      if (!resolvedScopeId) {
        throw new Error('Enter a scope ID before generating a bundle.');
      }

      const response = await apiRequest('POST', '/api/report-os/bundle-runs', {
        organizationId,
        scopeType,
        scopeId: resolvedScopeId,
        bundleId: bundle.bundleId,
        deliveryMode,
        recipients:
          deliveryMode === 'platform_email'
            ? selectedRecipients
                .split(',')
                .map(entry => entry.trim())
                .filter(Boolean)
            : undefined,
        subject: deliverySubject || `${bundle.label} delivery`,
        message: deliveryMessage || undefined,
      });

      return response.json();
    },
    onSuccess: async payload => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.reports.workspace(workspaceParams) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.reports.runs(workspaceParams) }),
      ]);
      const reports = payload?.data?.immutableReports || [];
      setSelectedReportIds(reports.map((report: { reportId: number }) => report.reportId));
      toast({
        title: 'Bundle generated',
        description:
          reports.length > 0
            ? `${reports.length} governed reports are ready for export or delivery.`
            : 'Bundle run completed.',
      });
      setActiveTab('history');
    },
    onError: (error: Error) => {
      toast({
        title: 'Bundle generation failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deliveryMutation = useMutation({
    mutationFn: async (reportId: number) => {
      const recipients = selectedRecipients
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);

      if (deliveryMode === 'platform_email' && recipients.length === 0) {
        throw new Error('At least one recipient email is required.');
      }

      const response = await apiRequest('POST', '/api/report-os/deliveries', {
        reportId,
        organizationId,
        projectId:
          workspaceQuery.data?.recentReports.find(report => report.id === reportId)?.projectId || undefined,
        submissionId: scopeType === 'submission' ? scopeId.trim() || undefined : undefined,
        deliveryMode,
        recipients,
        subject:
          deliverySubject ||
          `Regulatory report delivery — ${workspaceQuery.data?.recentReports.find(report => report.id === reportId)?.reportTitle || 'Concept2Cure report'}`,
        message: deliveryMessage || undefined,
        communicationType: 'response_letter',
      });
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.reports.workspace(workspaceParams) });
      toast({
        title: deliveryMode === 'platform_email' ? 'Delivery sent' : 'Delivery logged',
        description:
          deliveryMode === 'platform_email'
            ? 'The report was sent and captured as outbound correspondence.'
            : 'The PDF workflow was logged for offline delivery and learning capture.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Delivery failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async ({ reportId, format }: { reportId: number; format: 'pdf' | 'json' | 'csv' }) => {
      const url =
        format === 'pdf'
          ? `/api/report-os/exports/${reportId}/pdf`
          : `/api/intelligent-reports/${reportId}/export/${format}`;

      const response = await apiRequest('GET', url);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Export failed');
      }

      const blob = await response.blob();
      const filename =
        response.headers.get('Content-Disposition')?.split('filename="')[1]?.replace('"', '') ||
        `report-${reportId}.${format}`;
      downloadBlob(blob, filename);
    },
    onSuccess: () => {
      toast({
        title: 'Export ready',
        description: 'The report export has been downloaded.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Export failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const personaOptions = useMemo(() => {
    const personas = new Set<string>();
    (workspaceQuery.data?.bundles || []).forEach(bundle => bundle.personas.forEach(persona => personas.add(persona)));
    return ['all', ...Array.from(personas)];
  }, [workspaceQuery.data?.bundles]);

  const selectedReports = useMemo(
    () => (workspaceQuery.data?.recentReports || []).filter(report => selectedReportIds.includes(report.id)),
    [selectedReportIds, workspaceQuery.data?.recentReports]
  );

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          workspaceQuery.refetch();
          runsQuery.refetch();
        }}
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Refresh
      </Button>
      {selectedReports[0] && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <FileDown className="mr-2 h-4 w-4" />
              Export selected
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Download format</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => exportMutation.mutate({ reportId: selectedReports[0].id, format: 'pdf' })}>
              PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportMutation.mutate({ reportId: selectedReports[0].id, format: 'json' })}>
              JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportMutation.mutate({ reportId: selectedReports[0].id, format: 'csv' })}>
              CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-stone-50/40">
      <WorkspaceHeaderRich
        title="Reporting Workspace"
        breadcrumb="AnA / Report OS"
        actions={headerActions}
        secondaryInfo={
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
            <span>Bundle-first reporting for executives, RA, QA, writers, and agency response teams.</span>
            <Badge variant="outline" className="border-stone-200 text-stone-800">
              Wisdom capture active
            </Badge>
          </div>
        }
      />

      <WorkspaceCanvas maxWidth="6xl" bg="default">
        <DataStateWrapper
          isLoading={workspaceQuery.isLoading}
          error={(workspaceQuery.error as Error) || null}
          data={workspaceQuery.data}
          loadingComponent={
            <div className="space-y-4">
              <SkeletonCard />
              <SkeletonTable rows={6} columns={5} />
            </div>
          }
          emptyTitle="Reporting workspace unavailable"
          emptyDescription="No reporting data is available for the current scope yet."
          retry={() => workspaceQuery.refetch()}
        >
          {workspace => (
            <>
              <div className="grid gap-4 lg:grid-cols-[2.2fr_1fr]">
                <Card className="border-stone-200 shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-semibold text-stone-900">
                      Calm, scope-aware reporting
                    </CardTitle>
                    <CardDescription>
                      Run board packs, audit packs, submission response bundles, and PDF exports from one governed surface.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <MetricCard
                        label="Report runs"
                        value={String(workspace.summary.runCount)}
                        detail={`${workspace.summary.completedRuns} completed / ${workspace.summary.partialRuns} partial`}
                      />
                      <MetricCard
                        label="Immutable reports"
                        value={String(workspace.summary.immutableReportCount)}
                        detail="Ready for PDF, JSON, CSV, and audit review"
                      />
                      <MetricCard
                        label="Learning events"
                        value={String(workspace.summary.learningEventCount)}
                        detail="Correspondence and delivery insights captured"
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
                          Scope type
                        </label>
                        <Select value={scopeType} onValueChange={value => setScopeType(value as ScopeType)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a scope" />
                          </SelectTrigger>
                          <SelectContent>
                            {scopeOptions.map(option => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
                          Scope ID
                        </label>
                        <Input
                          value={scopeId}
                          onChange={event => setScopeId(event.target.value)}
                          placeholder="Project, submission, or program ID"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
                          Persona filter
                        </label>
                        <Select value={personaFilter} onValueChange={setPersonaFilter}>
                          <SelectTrigger>
                            <SelectValue placeholder="All personas" />
                          </SelectTrigger>
                          <SelectContent>
                            {personaOptions.map(option => (
                              <SelectItem key={option} value={option}>
                                {option === 'all' ? 'All personas' : option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-600">
                      <div className="flex items-start gap-2">
                        <ShieldCheck className="mt-0.5 h-4 w-4 text-stone-700" />
                        <div>
                          Platform email sends through Concept2Cure and records outbound correspondence for future learning.
                          Saving as PDF still logs the delivery event so rejection-response workflows continue improving AnA.
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-stone-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-stone-900">Selected report actions</CardTitle>
                    <CardDescription>
                      Export or deliver the most recent generated report directly to agencies or third parties.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
                        Delivery mode
                      </label>
                      <Select value={deliveryMode} onValueChange={value => setDeliveryMode(value as DeliveryMode)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {deliveryOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-stone-500">
                        {deliveryOptions.find(option => option.value === deliveryMode)?.description}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
                        Recipient emails
                      </label>
                      <Input
                        value={selectedRecipients}
                        onChange={event => setSelectedRecipients(event.target.value)}
                        placeholder="regulator@example.gov, partner@example.com"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
                        Subject
                      </label>
                      <Input
                        value={deliverySubject}
                        onChange={event => setDeliverySubject(event.target.value)}
                        placeholder="Agency response package"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
                        Message
                      </label>
                      <Textarea
                        value={deliveryMessage}
                        onChange={event => setDeliveryMessage(event.target.value)}
                        className="min-h-28"
                        placeholder="Optional delivery note or submission context"
                      />
                    </div>

                    <Button
                      className="w-full"
                      disabled={!selectedReports[0] || deliveryMutation.isPending}
                      onClick={() => {
                        if (selectedReports[0]) {
                          deliveryMutation.mutate(selectedReports[0].id);
                        }
                      }}
                    >
                      {deliveryMode === 'platform_email' ? (
                        <Mail className="mr-2 h-4 w-4" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      {deliveryMutation.isPending ? 'Processing...' : 'Deliver selected report'}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="bg-stone-100">
                  <TabsTrigger value="packs">Bundle packs</TabsTrigger>
                  <TabsTrigger value="history">Run history</TabsTrigger>
                  <TabsTrigger value="reports">Immutable reports</TabsTrigger>
                </TabsList>

                <TabsContent value="packs" className="space-y-4">
                  <Card className="border-stone-200 shadow-sm">
                    <CardContent className="pt-6">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                          <Input
                            value={bundleSearch}
                            onChange={event => setBundleSearch(event.target.value)}
                            className="pl-9"
                            placeholder="Search pack names, personas, or descriptions"
                          />
                        </div>
                        <Badge variant="outline" className="border-stone-300 text-stone-600">
                          <Filter className="mr-1 h-3 w-3" />
                          {filteredBundles.length} bundle presets
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
                    <div className="grid gap-4 md:grid-cols-2">
                      {filteredBundles.map(bundle => {
                        const isSelected = selectedBundleId === bundle.bundleId;
                        return (
                          <button
                            key={bundle.bundleId}
                            type="button"
                            onClick={() => {
                              setSelectedBundleId(bundle.bundleId);
                              setDeliveryMode(bundle.defaultDeliveryMode);
                              setDeliverySubject(`${bundle.label} delivery`);
                            }}
                            className={cn(
                              'rounded-xl border bg-white p-5 text-left transition-colors',
                              isSelected
                                ? 'border-stone-900 shadow-sm'
                                : 'border-stone-200 hover:border-stone-300'
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <FileStack className="h-4 w-4 text-stone-500" />
                                  <h3 className="text-sm font-semibold text-stone-900">{bundle.label}</h3>
                                </div>
                                <p className="mt-2 text-sm text-stone-600">{bundle.description}</p>
                              </div>
                              {isSelected && <CheckCircle2 className="h-4 w-4 text-stone-700" />}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              {bundle.personas.map(persona => (
                                <Badge key={persona} variant="outline" className="border-stone-200 text-stone-600">
                                  {persona}
                                </Badge>
                              ))}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-stone-500">
                              <span>{bundle.reportTypeIds.length} report modules</span>
                              <span>{bundle.exportFormats.join(', ').toUpperCase()}</span>
                              <span>{bundle.defaultDeliveryMode === 'platform_email' ? 'Platform send' : 'PDF first'}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <Card className="border-stone-200 shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-sm font-semibold text-stone-900">
                          {selectedBundle?.label || 'Choose a bundle'}
                        </CardTitle>
                        <CardDescription>
                          {selectedBundle
                            ? 'Review the included report types and launch a governed run.'
                            : 'Select a pack to see which reports will be generated for this scope.'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {selectedBundle ? (
                          <>
                            <div className="space-y-2">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
                                Included report types
                              </p>
                              <div className="space-y-2">
                                {selectedBundle.reportTypeIds.map(typeId => {
                                  const type = workspace.taxonomy.find(entry => entry.typeId === typeId);
                                  return (
                                    <div key={typeId} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                                      <div className="text-sm font-medium text-stone-900">{type?.label || typeId}</div>
                                      <div className="mt-1 text-[11px] text-stone-500">
                                        {type?.family || 'report family'} • {(type?.allowedPersonas || []).join(', ')}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
                              Bundle runs create Report OS lineage entries and generate immutable reports that can be exported
                              or delivered immediately.
                            </div>

                            <Button
                              className="w-full"
                              onClick={() => generateBundleMutation.mutate(selectedBundle)}
                              disabled={generateBundleMutation.isPending}
                            >
                              <Sparkles className="mr-2 h-4 w-4" />
                              {generateBundleMutation.isPending ? 'Generating bundle...' : 'Generate bundle'}
                            </Button>
                          </>
                        ) : (
                          <div className="rounded-lg border border-dashed border-stone-200 px-4 py-10 text-center text-sm text-stone-500">
                            No bundle selected yet.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="history">
                  <Card className="border-stone-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold text-stone-900">Report run history</CardTitle>
                      <CardDescription>
                        Track readiness confidence, blockers, and the latest scoped runs.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Filter status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All status</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="partial">Partial</SelectItem>
                            <SelectItem value="queued">Queued</SelectItem>
                          </SelectContent>
                        </Select>
                        <Badge variant="outline" className="border-stone-300 text-stone-600">
                          {filteredRuns.length} runs
                        </Badge>
                      </div>

                      <DataStateWrapper
                        isLoading={runsQuery.isLoading}
                        error={(runsQuery.error as Error) || null}
                        data={filteredRuns}
                        loadingComponent={<SkeletonTable rows={5} columns={5} />}
                        emptyTitle="No report runs yet"
                        emptyDescription="Generate a bundle pack to create your first scoped run."
                        retry={() => runsQuery.refetch()}
                      >
                        {runs => (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Run</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Confidence</TableHead>
                                <TableHead>Blockers</TableHead>
                                <TableHead>Created</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {runs.map(run => (
                                <TableRow key={run.id}>
                                  <TableCell className="font-medium text-stone-900">#{run.id}</TableCell>
                                  <TableCell>{run.reportTypeId}</TableCell>
                                  <TableCell>
                                    <WorkspaceStatusBadge status={statusTone(run.status)} />
                                  </TableCell>
                                  <TableCell>{run.confidence != null ? `${run.confidence}%` : '—'}</TableCell>
                                  <TableCell className="max-w-[320px] text-xs text-stone-500">
                                    {(run.blockers || []).length > 0
                                      ? (run.blockers || []).slice(0, 2).join('; ')
                                      : 'No blockers'}
                                  </TableCell>
                                  <TableCell>{formatDate(run.createdAt)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </DataStateWrapper>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="reports">
                  <Card className="border-stone-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold text-stone-900">Immutable reports</CardTitle>
                      <CardDescription>
                        Export PDF or structured formats, and select one for direct delivery.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <DataStateWrapper
                        isLoading={workspaceQuery.isLoading}
                        error={(workspaceQuery.error as Error) || null}
                        data={workspace.recentReports}
                        loadingComponent={<SkeletonTable rows={5} columns={6} />}
                        emptyTitle="No immutable reports available"
                        emptyDescription="Generate a report bundle to create export-ready immutable records."
                        retry={() => workspaceQuery.refetch()}
                      >
                        {reports => (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Select</TableHead>
                                <TableHead>Report</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Compliance</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {reports.map(report => {
                                const checked = selectedReportIds.includes(report.id);
                                return (
                                  <TableRow key={report.id}>
                                    <TableCell>
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={value => {
                                          setSelectedReportIds(current =>
                                            value
                                              ? [...current, report.id]
                                              : current.filter(id => id !== report.id)
                                          );
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <div className="space-y-1">
                                        <div className="font-medium text-stone-900">{report.reportTitle}</div>
                                        <div className="text-xs text-stone-500">
                                          {report.reportCode} • {report.reportDomain}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <WorkspaceStatusBadge status={statusTone(report.sealStatus)} />
                                    </TableCell>
                                    <TableCell>{report.complianceScore != null ? `${report.complianceScore}%` : '—'}</TableCell>
                                    <TableCell>{formatDate(report.createdAt)}</TableCell>
                                    <TableCell className="text-right">
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="outline" size="sm">
                                            <ExternalLink className="mr-2 h-4 w-4" />
                                            Actions
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuLabel>Export report</DropdownMenuLabel>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            onClick={() => exportMutation.mutate({ reportId: report.id, format: 'pdf' })}
                                          >
                                            <Download className="mr-2 h-4 w-4" />
                                            Export PDF
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => exportMutation.mutate({ reportId: report.id, format: 'json' })}
                                          >
                                            Export JSON
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => exportMutation.mutate({ reportId: report.id, format: 'csv' })}
                                          >
                                            Export CSV
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            onClick={() => {
                                              setSelectedReportIds([report.id]);
                                              setActiveTab('reports');
                                            }}
                                          >
                                            Select for delivery
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        )}
                      </DataStateWrapper>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {selectedReports.length > 0 && (
                <div className="rounded-xl border border-stone-200 bg-stone-100 px-4 py-3 text-sm text-stone-800">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4" />
                    <div>
                      Selected report for delivery: <strong>{selectedReports[0].reportTitle}</strong>. If you send through
                      Concept2Cure, the platform will log the outbound correspondence so future rejection letters and agency
                      responses improve AnA’s judgment over time.
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </DataStateWrapper>
      </WorkspaceCanvas>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-stone-900">{value}</div>
      <div className="mt-1 text-xs text-stone-500">{detail}</div>
    </div>
  );
}

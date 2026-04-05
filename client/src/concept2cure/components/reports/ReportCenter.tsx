import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, Plus, Search, Send } from 'lucide-react';
import { useReports } from '../../hooks/useReports';
import { DataStateWrapper } from '@/components/ui/statesV2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const FALLBACK_REPORT_TYPE_OPTIONS = [
  { id: 'readiness.executive_digest', label: 'Executive Readiness Digest', family: 'global' },
  { id: 'provenance.evidence_trace_report', label: 'Evidence & Provenance Trace', family: 'global' },
  { id: 'compliance.audit_assurance_pack', label: 'Compliance & Audit Assurance Pack', family: 'global' },
];

interface ReportCenterProps {
  projectId?: string;
}

export const ReportCenter: React.FC<ReportCenterProps> = ({ projectId }) => {
  const {
    taxonomy,
    runs,
    bundles,
    deliveries,
    listRuns,
    generateReport,
    createBundle,
    createDelivery,
    captureCorrespondence,
    refreshAll,
    runPdfExportUrl,
    bundlePdfExportUrl,
    isLoading,
    isGenerating,
    isCreatingBundle,
    isCreatingDelivery,
    isCapturingCorrespondence,
  } = useReports();

  const numericProjectId = Number(projectId);
  const safeProjectId = Number.isFinite(numericProjectId) && numericProjectId > 0 ? numericProjectId : undefined;

  const [reportTypeId, setReportTypeId] = useState(FALLBACK_REPORT_TYPE_OPTIONS[0].id);
  const reportTypeOptions = (taxonomy?.length ? taxonomy : FALLBACK_REPORT_TYPE_OPTIONS) as Array<{
    typeId?: string;
    id?: string;
    label: string;
    family?: string;
  }>;

  useEffect(() => {
    if (!reportTypeOptions.length) return;
    const exists = reportTypeOptions.some(option => (option.typeId || option.id) === reportTypeId);
    if (!exists) {
      const first = reportTypeOptions[0];
      setReportTypeId(first.typeId || first.id || FALLBACK_REPORT_TYPE_OPTIONS[0].id);
    }
  }, [reportTypeOptions, reportTypeId]);

  const groupedReportTypes = useMemo(() => {
    const groups = new Map<string, Array<{ id: string; label: string }>>();
    for (const option of reportTypeOptions) {
      const id = option.typeId || option.id;
      if (!id) continue;
      const family = option.family || 'global';
      const bucket = groups.get(family) || [];
      bucket.push({ id, label: option.label });
      groups.set(family, bucket);
    }
    return [...groups.entries()].map(([family, items]) => ({
      family,
      items: items.sort((a, b) => a.label.localeCompare(b.label)),
    }));
  }, [reportTypeOptions]);
  const [scopeType, setScopeType] = useState<'project' | 'submission'>('project');
  const [scopeId, setScopeId] = useState<string>(safeProjectId ? String(safeProjectId) : '');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'createdAt' | 'confidence' | 'status' | 'reportType'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedRunIds, setSelectedRunIds] = useState<number[]>([]);
  const [bundleName, setBundleName] = useState('Agency Audit Bundle');
  const [bundleDescription, setBundleDescription] = useState('');
  const [submissionId, setSubmissionId] = useState('');
  const [deliverySubject, setDeliverySubject] = useState('Regulatory report transmittal');
  const [deliveryMessage, setDeliveryMessage] = useState('');
  const [deliveryRecipients, setDeliveryRecipients] = useState('');
  const [captureSubject, setCaptureSubject] = useState('Agency rejection letter');
  const [captureBody, setCaptureBody] = useState('');
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const filteredRuns = useMemo(() => {
    const filtered = runs.filter(run => {
      const statusPass = statusFilter === 'all' ? true : run.status === statusFilter;
      const searchPass =
        search.trim().length === 0
          ? true
          : `${run.reportTypeLabel} ${run.scopeType} ${run.scopeId} ${run.status}`
              .toLowerCase()
              .includes(search.toLowerCase());
      return statusPass && searchPass;
    });

    const direction = sortOrder === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      let compare = 0;
      if (sortBy === 'confidence') compare = (a.confidence ?? -1) - (b.confidence ?? -1);
      else if (sortBy === 'status') compare = a.status.localeCompare(b.status);
      else if (sortBy === 'reportType') compare = a.reportTypeLabel.localeCompare(b.reportTypeLabel);
      else compare = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return compare * direction;
    });
  }, [runs, search, statusFilter, sortBy, sortOrder]);

  const selectedBundleSource = selectedRunIds
    .map(id => runs.find(run => run.id === id))
    .filter((run): run is NonNullable<typeof run> => !!run);

  const handleGenerate = async () => {
    if (!scopeId.trim()) return;
    setErrorMessage(null);
    try {
      await generateReport({
        reportTypeId,
        scopeType,
        scopeId: scopeId.trim(),
      });
      await listRuns({ sortBy: 'createdAt', sortOrder: 'desc', limit: 200 });
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to generate report');
    }
  };

  const handleSortRefresh = async () => {
    setErrorMessage(null);
    try {
      await refreshAll();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to refresh report list');
    }
  };

  const handleCreateBundle = async () => {
    if (selectedRunIds.length === 0) return;
    setErrorMessage(null);
    try {
      await createBundle({
        name: bundleName.trim() || 'Regulatory Bundle',
        description: bundleDescription.trim() || undefined,
        runIds: selectedRunIds,
      });
      setSelectedRunIds([]);
      setBundleDescription('');
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to create bundle');
    }
  };

  const handleSend = async (channel: 'platform_send' | 'external_pdf_export') => {
    if (selectedRunIds.length === 0) return;
    setErrorMessage(null);
    try {
      const recipients = deliveryRecipients
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
      for (const runId of selectedRunIds) {
        await createDelivery({
          runId,
          projectId: safeProjectId,
          submissionId: submissionId || undefined,
          channel,
          correspondenceType: 'audit_report_transmittal',
          subject: deliverySubject,
          message: deliveryMessage,
          recipients,
          captureForLearning: true,
        });
      }
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to process delivery');
    }
  };

  const handleCaptureRejection = async () => {
    if (!safeProjectId || !captureBody.trim()) return;
    setErrorMessage(null);
    setCaptureMessage(null);
    try {
      const result = await captureCorrespondence({
        projectId: safeProjectId,
        submissionId: submissionId || undefined,
        communicationType: 'rejection_letter',
        subject: captureSubject,
        body: captureBody,
        direction: 'inbound',
        sourceChannel: 'manual_upload',
        responseRequired: true,
        captureForLearning: true,
      });
      setCaptureMessage(
        `Captured${result.persistedToPlatform ? ' and linked to correspondence pipeline' : ''}. Issues: ${result.issues.map(i => i.category).join(', ')}`
      );
      setCaptureBody('');
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to capture correspondence');
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-stone-900">Reporting Module</h2>
        <p className="mt-1 text-xs text-stone-500">
          Build and sort reports, bundle deliverables, send through platform channels, export PDF, capture rejection letters for AnA learning, and verify region-specific submission obligations.
        </p>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-100 px-3 py-2 text-xs text-stone-800">
          <AlertTriangle className="h-4 w-4" />
          <span>{errorMessage}</span>
        </div>
      )}
      {captureMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-100 px-3 py-2 text-xs text-stone-800">
          <CheckCircle2 className="h-4 w-4" />
          <span>{captureMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-600">Generate reports</h3>
            <Button size="sm" onClick={handleGenerate} disabled={isGenerating || !scopeId.trim()}>
              {isGenerating ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
              Generate
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <p className="mb-1 text-[11px] text-stone-500">Report type</p>
              <Select value={reportTypeId} onValueChange={value => setReportTypeId(value)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groupedReportTypes.map(group => (
                    <React.Fragment key={group.family}>
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                        {group.family.split('_').join(' ')}
                      </div>
                      {group.items.map(option => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-[11px] text-stone-500">Scope type</p>
              <Select value={scopeType} onValueChange={value => setScopeType(value as 'project' | 'submission')}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="submission">Submission</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-[11px] text-stone-500">Scope id</p>
              <Input value={scopeId} onChange={event => setScopeId(event.target.value)} className="h-8 text-xs" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-600">Delivery controls</h3>
          <div className="space-y-2">
            <Input
              value={submissionId}
              onChange={event => setSubmissionId(event.target.value)}
              className="h-8 text-xs"
              placeholder="Submission ID (required for platform send)"
            />
            <Input
              value={deliverySubject}
              onChange={event => setDeliverySubject(event.target.value)}
              className="h-8 text-xs"
              placeholder="Delivery subject"
            />
            <Input
              value={deliveryRecipients}
              onChange={event => setDeliveryRecipients(event.target.value)}
              className="h-8 text-xs"
              placeholder="Recipients (comma separated)"
            />
            <Textarea
              value={deliveryMessage}
              onChange={event => setDeliveryMessage(event.target.value)}
              className="min-h-[82px] text-xs"
              placeholder="Message body"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => handleSend('platform_send')}
                disabled={isCreatingDelivery || !selectedRunIds.length || !submissionId.trim()}
              >
                <Send className="mr-1 h-3.5 w-3.5" />
                Platform send
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => handleSend('external_pdf_export')}
                disabled={isCreatingDelivery || !selectedRunIds.length}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                External PDF
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-stone-400" />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search runs"
              className="h-8 pl-7 text-xs"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={value => setSortBy(value as typeof sortBy)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt">Created</SelectItem>
              <SelectItem value="confidence">Confidence</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="reportType">Type</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={value => setSortOrder(value as 'asc' | 'desc')}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Desc</SelectItem>
              <SelectItem value="asc">Asc</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handleSortRefresh}>
            Refresh
          </Button>
        </div>

        <DataStateWrapper
          isLoading={isLoading}
          error={null}
          data={filteredRuns}
          emptyTitle="No report runs"
          emptyDescription="Generate a report run to start building bundles."
        >
          {runRows => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[44px]">Pick</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[120px]">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runRows.map(run => {
                  const checked = selectedRunIds.includes(run.id);
                  return (
                    <TableRow key={run.id}>
                      <TableCell>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() =>
                            setSelectedRunIds(prev =>
                              checked ? prev.filter(id => id !== run.id) : [...prev, run.id]
                            )
                          }
                          aria-label={`Select report run ${run.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-xs">{run.reportTypeLabel}</TableCell>
                      <TableCell className="text-xs">{run.scopeType}:{run.scopeId}</TableCell>
                      <TableCell className="text-xs">{run.status}</TableCell>
                      <TableCell className="text-xs">{run.confidence ?? 'N/A'}</TableCell>
                      <TableCell className="text-xs">{new Date(run.createdAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <a
                          href={runPdfExportUrl(run.id)}
                          className="inline-flex items-center text-xs text-stone-600 hover:text-stone-900"
                        >
                          <Download className="mr-1 h-3.5 w-3.5" />
                          Export
                        </a>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DataStateWrapper>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-600">Create bundle</h3>
          <div className="space-y-2">
            <Input
              value={bundleName}
              onChange={event => setBundleName(event.target.value)}
              className="h-8 text-xs"
              placeholder="Bundle name"
            />
            <Textarea
              value={bundleDescription}
              onChange={event => setBundleDescription(event.target.value)}
              className="min-h-[70px] text-xs"
              placeholder="Bundle description"
            />
            <p className="text-[11px] text-stone-500">
              Selected runs: {selectedBundleSource.length}
            </p>
            <Button
              size="sm"
              onClick={handleCreateBundle}
              disabled={isCreatingBundle || selectedBundleSource.length === 0}
            >
              {isCreatingBundle ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
              Create report bundle
            </Button>
          </div>
          <div className="mt-3 space-y-1">
            {bundles.map(bundle => (
              <div key={bundle.bundleId} className="flex items-center justify-between rounded border border-stone-200 px-2 py-1.5">
                <div>
                  <p className="text-xs font-medium text-stone-800">{bundle.name}</p>
                  <p className="text-[11px] text-stone-500">{bundle.items.length} reports</p>
                </div>
                <a
                  href={bundlePdfExportUrl(bundle.bundleId)}
                  className="inline-flex items-center text-xs text-stone-600 hover:text-stone-900"
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  PDF
                </a>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-600">Capture rejection / deficiency letters</h3>
          <div className="space-y-2">
            <Input
              value={captureSubject}
              onChange={event => setCaptureSubject(event.target.value)}
              className="h-8 text-xs"
              placeholder="Letter subject"
            />
            <Textarea
              value={captureBody}
              onChange={event => setCaptureBody(event.target.value)}
              className="min-h-[140px] text-xs"
              placeholder="Paste agency letter text here. This will map deficiencies and store learning atoms."
            />
            <Button
              size="sm"
              onClick={handleCaptureRejection}
              disabled={isCapturingCorrespondence || !safeProjectId || !captureBody.trim()}
            >
              {isCapturingCorrespondence ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              )}
              Capture correspondence signal
            </Button>
          </div>
          <div className="mt-3 border-t border-stone-100 pt-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-stone-500">Recent deliveries</p>
            <div className="space-y-1">
              {deliveries.slice(0, 6).map(delivery => (
                <div key={delivery.deliveryId} className="rounded border border-stone-200 px-2 py-1.5">
                  <p className="text-xs font-medium text-stone-800">{delivery.subject}</p>
                  <p className="text-[11px] text-stone-500">
                    {delivery.channel} · {delivery.status} · {new Date(delivery.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
              {deliveries.length === 0 && <p className="text-xs text-stone-400">No delivery history yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportCenter;

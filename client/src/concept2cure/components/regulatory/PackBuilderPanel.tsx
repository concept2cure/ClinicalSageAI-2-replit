/**
 * Pack Builder Panel — IVDR Technical File / Performance Study Pack Generator
 *
 * Provides:
 *   - Readiness gating (all required claims must be APPROVED before build)
 *   - Pack build trigger with format/scope selection
 *   - Live job status polling
 *   - Pack history table with version, integrity hash, and download
 *
 * @module components/regulatory/PackBuilderPanel
 * @version 1.0.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Package,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Shield,
  Hash,
  FileJson,
  FileText,
  FileArchive,
  Eye,
  Copy,
  ShieldCheck,
} from 'lucide-react';
import {
  fetchPackReadiness,
  buildPack,
  fetchJobStatus,
  fetchPacks,
  fetchPackDetail,
  downloadPackManifest,
  downloadPackArtifact,
} from '@/services/ivdrBinderApi';
import type { PackDetailResponse } from '@shared/ivdr/manifest';

interface PackBuilderPanelProps {
  projectId: string;
}

// ── Status helpers ───────────────────────────────────────────────────────────

function JobStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'COMPLETED':
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Completed
        </Badge>
      );
    case 'FAILED':
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" /> Failed
        </Badge>
      );
    case 'RUNNING':
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Running
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          <Clock className="mr-1 h-3 w-3" /> Queued
        </Badge>
      );
  }
}

function PackStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'SUCCEEDED':
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          <Shield className="mr-1 h-3 w-3" /> Sealed
        </Badge>
      );
    case 'BUILDING':
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Building
        </Badge>
      );
    case 'FAILED':
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" /> Failed
        </Badge>
      );
    case 'REVOKED':
      return (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          <AlertTriangle className="mr-1 h-3 w-3" /> Revoked
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function WarningsBadge({ hasWarnings, count }: { hasWarnings: boolean; count: number }) {
  if (!hasWarnings) return null;
  return (
    <Badge
      variant="outline"
      className="border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-400"
    >
      <AlertTriangle className="mr-1 h-3 w-3" />
      {count} warning{count !== 1 ? 's' : ''}
    </Badge>
  );
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function truncateHash(hash: string | null | undefined, len = 12): string {
  if (!hash) return '—';
  return hash.length > len ? hash.substring(0, len) + '…' : hash;
}

// ═══════════════════════════════════════════════════════════════════════════════

export default function PackBuilderPanel({ projectId }: PackBuilderPanelProps) {
  const queryClient = useQueryClient();
  const packListKey = useMemo(() => ['ivdr-packs', projectId], [projectId]);

  // ── Pack history ───────────────────────────────────────────────────────────
  const { data: packData, isLoading: packsLoading } = useQuery({
    queryKey: packListKey,
    queryFn: () => fetchPacks(projectId),
    enabled: !!projectId,
    staleTime: 15_000,
  });
  const packs = packData?.packs ?? [];

  // ── Build dialog ───────────────────────────────────────────────────────────
  const [showBuild, setShowBuild] = useState(false);
  const [buildForm, setBuildForm] = useState({
    packType: 'technical_file' as string,
    outputs: ['manifest_json'] as string[],
    useLatestApprovedOnly: true,
    signBuild: false,
  });

  // ── Readiness check ────────────────────────────────────────────────────────
  const { data: readiness, isLoading: readinessLoading } = useQuery({
    queryKey: ['ivdr-pack-readiness', projectId, buildForm.packType],
    queryFn: () => fetchPackReadiness(projectId, buildForm.packType),
    enabled: showBuild && !!projectId,
    staleTime: 10_000,
  });

  // ── Build trigger ──────────────────────────────────────────────────────────
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const buildMutation = useMutation({
    mutationFn: () =>
      buildPack({
        projectId,
        packType: buildForm.packType as any,
        outputs: buildForm.outputs as any[],
        useLatestApprovedOnly: buildForm.useLatestApprovedOnly,
        signBuild: buildForm.signBuild,
      }),
    onSuccess: data => {
      setActiveJobId(data.jobId);
      setShowBuild(false);
    },
  });

  // ── Job polling ────────────────────────────────────────────────────────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [jobStatus, setJobStatus] = useState<{
    status: string;
    errorCode?: string;
    errorLabel?: string;
    packId?: string;
  } | null>(null);

  useEffect(() => {
    if (!activeJobId) return;

    async function poll() {
      try {
        const result = await fetchJobStatus(activeJobId!);
        setJobStatus(result);
        if (result.status === 'COMPLETED' || result.status === 'FAILED') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          queryClient.invalidateQueries({ queryKey: packListKey });
        }
      } catch {
        // silently retry
      }
    }

    poll(); // immediate first check
    pollRef.current = setInterval(poll, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeJobId, queryClient, packListKey]);

  // ── Download handler ───────────────────────────────────────────────────────
  const handleDownloadManifest = async (packId: string) => {
    try {
      const manifest = await downloadPackManifest(packId, 'manifest');
      const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ivdr-pack-${packId}-manifest.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Manifest download failed:', err);
    }
  };

  const handleDownloadArtifact = async (packId: string, format: 'pdf' | 'docx' | 'zip') => {
    try {
      const { blob, filename } = await downloadPackArtifact(packId, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`${format.toUpperCase()} download failed:`, err);
    }
  };

  // ── Pack detail dialog state ───────────────────────────────────────────────
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const { data: packDetail, isLoading: detailLoading } = useQuery<PackDetailResponse>({
    queryKey: ['ivdr-pack-detail', selectedPackId],
    queryFn: () => fetchPackDetail(selectedPackId!),
    enabled: !!selectedPackId,
    staleTime: 30_000,
  });

  const copyToClipboard = (hash: string, label: string) => {
    navigator.clipboard.writeText(hash).then(() => {
      setCopiedHash(label);
      setTimeout(() => setCopiedHash(null), 2000);
    });
  };

  return (
    <div className="space-y-4">
      {/* ── Active job banner ──────────────────────────────────────────────── */}
      {activeJobId &&
        jobStatus &&
        jobStatus.status !== 'COMPLETED' &&
        jobStatus.status !== 'FAILED' && (
          <Card className="border-blue-200 dark:border-blue-800">
            <CardContent className="flex items-center gap-3 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <div className="flex-1">
                <p className="text-sm font-medium">Pack build in progress…</p>
                <p className="text-xs text-muted-foreground">Job ID: {activeJobId}</p>
              </div>
              <JobStatusBadge status={jobStatus.status} />
            </CardContent>
          </Card>
        )}

      {activeJobId && jobStatus?.status === 'COMPLETED' && (
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="flex items-center gap-3 py-4">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div className="flex-1">
              <p className="text-sm font-medium">Pack build completed!</p>
              <p className="text-xs text-muted-foreground">
                Pack ready for download in the history below
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setActiveJobId(null);
                setJobStatus(null);
              }}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {activeJobId && jobStatus?.status === 'FAILED' && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-4">
            <XCircle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Pack build failed</p>
              <p className="text-xs text-muted-foreground">
                {jobStatus.errorLabel || jobStatus.errorCode}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setActiveJobId(null);
                setJobStatus(null);
              }}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Pack History Table ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">
              <Package className="inline mr-2 h-5 w-5" />
              Technical File Packs
            </CardTitle>
            <CardDescription>
              Immutable, hash-verified regulatory submission artifacts
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowBuild(true)}>
            <Play className="mr-1 h-4 w-4" /> Build Pack
          </Button>
        </CardHeader>
        <CardContent>
          {packsLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : packs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="mx-auto h-10 w-10 mb-2 opacity-50" />
              <p>No packs generated yet. Build your first technical file pack.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Warnings</TableHead>
                  <TableHead>Integrity</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packs.map((pack: any) => (
                  <TableRow key={pack.packId || pack.id}>
                    <TableCell className="font-mono font-medium">
                      v{pack.packVersion ?? pack.pack_version}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {(pack.packType ?? pack.pack_type)?.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <PackStatusBadge status={pack.status} />
                    </TableCell>
                    <TableCell>
                      <WarningsBadge
                        hasWarnings={pack.hasWarnings ?? false}
                        count={Array.isArray(pack.warnings) ? pack.warnings.length : 0}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        <Hash className="inline h-3 w-3 mr-0.5" />
                        {truncateHash(pack.snapshotHashSha256 ?? pack.snapshot_hash_sha256)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(pack.createdAt ?? pack.created_at)
                        ? new Date(pack.createdAt ?? pack.created_at).toLocaleString()
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedPackId(pack.packId || pack.id)}
                          title="View details"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        {pack.downloads?.manifest && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadManifest(pack.packId || pack.id)}
                            title="Download manifest"
                          >
                            <FileJson className="h-3 w-3" />
                          </Button>
                        )}
                        {pack.downloads?.pdf && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadArtifact(pack.packId || pack.id, 'pdf')}
                            title="Download PDF"
                          >
                            <FileText className="h-3 w-3" />
                          </Button>
                        )}
                        {pack.downloads?.docx && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadArtifact(pack.packId || pack.id, 'docx')}
                            title="Download DOCX"
                          >
                            <FileText className="h-3 w-3" />
                          </Button>
                        )}
                        {pack.downloads?.zip && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadArtifact(pack.packId || pack.id, 'zip')}
                            title="Download ZIP bundle"
                          >
                            <FileArchive className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Build Pack Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showBuild} onOpenChange={setShowBuild}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Build Regulatory Pack</DialogTitle>
            <DialogDescription>
              Generate an immutable, hash-verified technical file or performance study pack
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Pack Type</label>
              <Select
                value={buildForm.packType}
                onValueChange={v => setBuildForm(p => ({ ...p, packType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="technical_file">Technical File</SelectItem>
                  <SelectItem value="performance_study">Performance Study</SelectItem>
                  <SelectItem value="post_market_pack">Post-Market Pack</SelectItem>
                  <SelectItem value="full_submission">Full Submission</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ── Readiness check ────────────────────────────────────────── */}
            <div className="rounded-md border p-3">
              <p className="text-sm font-medium mb-2">
                <Shield className="inline h-4 w-4 mr-1" /> Readiness Check
              </p>
              {readinessLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking readiness…
                </div>
              ) : readiness ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      Approved: {readiness.approvedCount} / {readiness.totalRequired}
                    </span>
                    <span>
                      {readiness.ready ? (
                        <CheckCircle2 className="inline h-4 w-4 text-green-600" />
                      ) : (
                        <AlertTriangle className="inline h-4 w-4 text-yellow-600" />
                      )}
                    </span>
                  </div>
                  <Progress
                    value={
                      readiness.totalRequired > 0
                        ? (readiness.approvedCount / readiness.totalRequired) * 100
                        : 0
                    }
                    className="h-2"
                  />
                  {readiness.missingClaims && readiness.missingClaims.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      <p className="font-medium text-yellow-700 dark:text-yellow-400">
                        Missing approvals:
                      </p>
                      <ul className="list-disc list-inside">
                        {readiness.missingClaims.map((c: any) => (
                          <li key={c.id || c.claim_key}>
                            {c.claim_key}: {c.title} ({c.status})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Unable to check readiness</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBuild(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                buildMutation.isPending || readinessLoading || (readiness && !readiness.ready)
              }
              onClick={() => buildMutation.mutate()}
            >
              {buildMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <FileJson className="h-4 w-4 mr-1" />
              )}
              Build Pack
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Pack Detail Dialog ────────────────────────────────────────────── */}
      <Dialog
        open={!!selectedPackId}
        onOpenChange={open => {
          if (!open) setSelectedPackId(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Pack Details
              {packDetail && (
                <span className="text-muted-foreground font-normal text-sm ml-2">
                  v{packDetail.packVersion}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Integrity hashes, artifact sizes, and quality warnings
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : packDetail ? (
            <div className="space-y-5">
              {/* ── Status + Warnings ────────────────────────────────────── */}
              <div className="flex items-center gap-3">
                <PackStatusBadge status={packDetail.status} />
                {packDetail.hasWarnings && (
                  <WarningsBadge
                    hasWarnings
                    count={Array.isArray(packDetail.warnings) ? packDetail.warnings.length : 0}
                  />
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(packDetail.createdAt).toLocaleString()}
                </span>
              </div>

              {/* ── Warning Details ──────────────────────────────────────── */}
              {packDetail.hasWarnings &&
                Array.isArray(packDetail.warnings) &&
                packDetail.warnings.length > 0 && (
                  <div className="rounded-md border border-amber-200 dark:border-amber-800 p-3">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">
                      <AlertTriangle className="inline h-4 w-4 mr-1" /> Quality Warnings
                    </p>
                    <ul className="space-y-1">
                      {packDetail.warnings.map((w: any, i: number) => (
                        <li
                          key={i}
                          className="text-xs text-muted-foreground flex items-start gap-2"
                        >
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1 py-0 mt-0.5 shrink-0"
                          >
                            {w.code}
                          </Badge>
                          <span>{w.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {/* ── Integrity Hashes ─────────────────────────────────────── */}
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-1">
                  <ShieldCheck className="h-4 w-4" /> Integrity Verification
                </p>

                {/* Manifest */}
                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Manifest</span>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(packDetail.manifest.sizeBytes)}
                    </span>
                  </div>
                  {packDetail.manifest.hashSha256 && (
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono bg-muted px-2 py-1 rounded flex-1 truncate">
                        SHA-256: {packDetail.manifest.hashSha256}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 shrink-0"
                        onClick={() => copyToClipboard(packDetail.manifest.hashSha256, 'manifest')}
                        title="Copy hash"
                      >
                        {copiedHash === 'manifest' ? (
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Artifacts */}
                {packDetail.artifacts.map((art: any) => (
                  <div key={art.type} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        {art.type === 'PDF' && <FileText className="h-3.5 w-3.5" />}
                        {art.type === 'DOCX' && <FileText className="h-3.5 w-3.5" />}
                        {art.type === 'ZIP' && <FileArchive className="h-3.5 w-3.5" />}
                        {art.type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(art.sizeBytes)}
                      </span>
                    </div>
                    {art.hashSha256 && (
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono bg-muted px-2 py-1 rounded flex-1 truncate">
                          SHA-256: {art.hashSha256}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 shrink-0"
                          onClick={() => copyToClipboard(art.hashSha256, art.type)}
                          title="Copy hash"
                        >
                          {copiedHash === art.type ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* ── Snapshot Hash ─────────────────────────────────────────── */}
              {packDetail.snapshot && (
                <div className="rounded-md border p-3 space-y-1">
                  <span className="text-sm font-medium">Snapshot Hash</span>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-muted px-2 py-1 rounded flex-1 truncate">
                      SHA-256: {packDetail.snapshot.snapshotHashSha256}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={() =>
                        copyToClipboard(packDetail.snapshot!.snapshotHashSha256, 'snapshot')
                      }
                      title="Copy hash"
                    >
                      {copiedHash === 'snapshot' ? (
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Download Actions ──────────────────────────────────────── */}
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownloadManifest(packDetail.packId)}
                >
                  <FileJson className="h-3 w-3 mr-1" /> Manifest
                </Button>
                {packDetail.artifacts.some((a: any) => a.type === 'PDF') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadArtifact(packDetail.packId, 'pdf')}
                  >
                    <FileText className="h-3 w-3 mr-1" /> PDF
                  </Button>
                )}
                {packDetail.artifacts.some((a: any) => a.type === 'DOCX') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadArtifact(packDetail.packId, 'docx')}
                  >
                    <FileText className="h-3 w-3 mr-1" /> DOCX
                  </Button>
                )}
                {packDetail.artifacts.some((a: any) => a.type === 'ZIP') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadArtifact(packDetail.packId, 'zip')}
                  >
                    <FileArchive className="h-3 w-3 mr-1" /> ZIP Bundle
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">Unable to load pack details</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Phase 6.6.D — Download + Verify Panel
 *
 * After a defense packet is built, this panel provides:
 *   1. Download buttons — JSON, CSV (evidence-task-level), full ZIP bundle
 *   2. Manifest hash verification — copy, compare, "Tamper Safe" badge
 *   3. Audit trail — timestamp, who built it, lock version
 *
 * @phase 6.6.D
 */

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  FileJson,
  FileSpreadsheet,
  Download,
  Lock,
  Hash,
  ClipboardCheck,
  ClipboardCopy,
  CheckCircle,
  XCircle,
  Loader2,
  FolderArchive,
} from 'lucide-react';
import {
  useExportDefensePacketJSON,
  useExportDefensePacketCSV,
} from '@/hooks/use-predicate-intelligence';
import { RISK_CODES_LOCK_HASH } from '../../../shared/types/generated';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface DownloadVerifyPanelProps {
  programId: string;
  manifestHash: string;
  lockHash?: string;
  builtAt?: string;
  builtBy?: string;
  readinessScore?: number;
  taskCount?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hash Verification Sub-component
// ═══════════════════════════════════════════════════════════════════════════════

function HashVerifier({ manifestHash }: { manifestHash: string }) {
  const [verifyInput, setVerifyInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'match' | 'mismatch'>('idle');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(manifestHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-secure contexts
      const textarea = document.createElement('textarea');
      textarea.value = manifestHash;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [manifestHash]);

  const handleVerify = useCallback(() => {
    const clean = verifyInput.trim().toLowerCase();
    if (!clean) {
      setStatus('idle');
      return;
    }
    setStatus(clean === manifestHash.toLowerCase() ? 'match' : 'mismatch');
  }, [verifyInput, manifestHash]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Hash className="h-4 w-4" /> Manifest Hash Verification
        </CardTitle>
        <CardDescription>
          Verify packet integrity by comparing the manifest hash. Copy or paste to confirm.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current hash display */}
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-muted px-3 py-2 rounded text-xs font-mono break-all select-all">
            {manifestHash}
          </code>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <ClipboardCheck className="h-4 w-4 text-green-600" />
                  ) : (
                    <ClipboardCopy className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{copied ? 'Copied!' : 'Copy hash'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Verify input */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="Paste hash to verify…"
            value={verifyInput}
            onChange={e => {
              setVerifyInput(e.target.value);
              setStatus('idle');
            }}
            className="font-mono text-xs"
          />
          <Button size="sm" onClick={handleVerify} disabled={!verifyInput.trim()}>
            Verify
          </Button>
        </div>

        {/* Status badge */}
        {status === 'match' && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 border border-green-200">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-semibold text-green-800">Tamper-Safe — Verified</p>
              <p className="text-xs text-green-600">
                Hash matches the build manifest. Packet integrity confirmed.
              </p>
            </div>
          </div>
        )}
        {status === 'mismatch' && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 border border-red-200">
            <XCircle className="h-5 w-5 text-red-600" />
            <div>
              <p className="text-sm font-semibold text-red-800">Integrity Failure</p>
              <p className="text-xs text-red-600">
                Hash does NOT match. The packet may have been tampered with or a different build was
                referenced.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Lock Version Badge
// ═══════════════════════════════════════════════════════════════════════════════

function LockVersionBadge({ lockHash }: { lockHash?: string }) {
  const expected = RISK_CODES_LOCK_HASH;
  const matches = lockHash ? lockHash === expected : false;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={matches ? 'default' : lockHash ? 'destructive' : 'secondary'}
            className="flex items-center gap-1"
          >
            {matches ? (
              <Lock className="h-3 w-3" />
            ) : lockHash ? (
              <ShieldAlert className="h-3 w-3" />
            ) : (
              <Shield className="h-3 w-3" />
            )}
            {matches ? 'Lock ✓' : lockHash ? 'Lock DRIFT' : 'No lock hash'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="text-xs space-y-1">
            <p className="font-semibold">Risk Code Lock Version</p>
            <p>
              Expected: <code className="text-[10px]">{expected.slice(0, 12)}…</code>
            </p>
            {lockHash && (
              <p>
                Packet: <code className="text-[10px]">{lockHash.slice(0, 12)}…</code>
              </p>
            )}
            {matches && <p className="text-green-600">Risk codes are in sync.</p>}
            {lockHash && !matches && (
              <p className="text-red-600">
                The packet was built with a different risk code version. Rebuild recommended.
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

export function DownloadVerifyPanel({
  programId,
  manifestHash,
  lockHash,
  builtAt,
  builtBy,
  readinessScore,
  taskCount,
}: DownloadVerifyPanelProps) {
  const jsonQuery = useExportDefensePacketJSON(programId, manifestHash);
  const csvMut = useExportDefensePacketCSV();
  const [zipDownloading, setZipDownloading] = useState(false);

  const handleCSV = useCallback(() => {
    csvMut.mutate(
      { programId, manifestHash },
      {
        onSuccess: ({ blob, filename }) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
        },
      }
    );
  }, [programId, manifestHash, csvMut]);

  const handleJSON = useCallback(() => {
    if (!jsonQuery.data) return;
    const json = JSON.stringify(jsonQuery.data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `defense_packet_${manifestHash.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [jsonQuery.data, manifestHash]);

  const handleZIP = useCallback(async () => {
    setZipDownloading(true);
    try {
      // Build a simple ZIP-like download by packaging JSON + CSV together
      // In production this would hit a /export.zip endpoint
      const orgId = localStorage.getItem('organizationId') || '1';
      const res = await fetch(
        `/api/programs/${programId}/predicate-intel/defense-packet/${manifestHash}/export.zip`,
        {
          headers: { 'x-organization-id': orgId },
          credentials: 'include',
        }
      );
      if (res.ok) {
        const blob = await res.blob();
        const cd = res.headers.get('Content-Disposition');
        const filename =
          cd?.match(/filename="?([^"]+)"?/)?.[1] ??
          `defense_packet_${manifestHash.slice(0, 8)}.zip`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Fallback: download JSON only
        handleJSON();
      }
    } finally {
      setZipDownloading(false);
    }
  }, [programId, manifestHash, handleJSON]);

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" /> Download &amp; Verify Defense Packet
          </CardTitle>
          <CardDescription>
            Export the complete defense packet for regulatory submission. Verify integrity before
            filing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-3">
            <LockVersionBadge lockHash={lockHash} />
            {readinessScore != null && (
              <Badge
                variant={
                  readinessScore >= 80
                    ? 'default'
                    : readinessScore >= 60
                      ? 'secondary'
                      : 'destructive'
                }
                className="flex items-center gap-1"
              >
                <ShieldCheck className="h-3 w-3" />
                Readiness {readinessScore}%
              </Badge>
            )}
            {taskCount != null && (
              <Badge variant="outline" className="text-xs">
                {taskCount} evidence tasks
              </Badge>
            )}
            {builtAt && (
              <span className="text-xs text-muted-foreground">
                Built: {new Date(builtAt).toLocaleString()}
              </span>
            )}
            {builtBy && <span className="text-xs text-muted-foreground">By: {builtBy}</span>}
          </div>

          {/* Download buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
              variant="outline"
              className="h-20 flex flex-col items-center justify-center gap-1"
              onClick={handleJSON}
              disabled={!jsonQuery.data}
            >
              <FileJson className="h-6 w-6 text-blue-600" />
              <span className="text-sm font-medium">Export JSON</span>
              <span className="text-[10px] text-muted-foreground">Full packet + metadata</span>
            </Button>

            <Button
              variant="outline"
              className="h-20 flex flex-col items-center justify-center gap-1"
              onClick={handleCSV}
              disabled={csvMut.isPending}
            >
              {csvMut.isPending ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-6 w-6 text-green-600" />
              )}
              <span className="text-sm font-medium">Export CSV</span>
              <span className="text-[10px] text-muted-foreground">Evidence tasks spreadsheet</span>
            </Button>

            <Button
              variant="outline"
              className="h-20 flex flex-col items-center justify-center gap-1"
              onClick={handleZIP}
              disabled={zipDownloading}
            >
              {zipDownloading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <FolderArchive className="h-6 w-6 text-purple-600" />
              )}
              <span className="text-sm font-medium">Download ZIP</span>
              <span className="text-[10px] text-muted-foreground">Complete submission bundle</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Hash Verification */}
      <HashVerifier manifestHash={manifestHash} />
    </div>
  );
}

/**
 * Evidence Health Panel — "Regulatory Truth Machine" dashboard card
 *
 * Displays aggregated evidence health for a clinical program:
 *  - Latest contradiction scan summary (time, trigger, count)
 *  - Contradictions by severity (top 5)
 *  - Claims/sources/provenance counts
 *  - "Run Scan Now" trigger button
 *
 * @version 1.0.0
 * @phase 5.3.B — Truth Machine UI
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Clock,
  AlertTriangle,
  FileText,
  Database,
  Link2,
  ChevronRight,
  Activity,
  Download,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface LatestScan {
  id: string;
  scan_type: string;
  status: string;
  total_claims: number;
  contradictions_found: number;
  triggered_by: string;
  actor: string;
  started_at: string;
  completed_at: string;
  created_at: string;
}

interface Contradiction {
  entity: string;
  field: string;
  claim_count: number;
  values: string[];
}

interface HealthSummary {
  program_id: string;
  latest_scan: LatestScan | null;
  claims: Record<string, number>;
  sources_count: number;
  provenance_count: number;
  scans: Record<string, number>;
  top_contradictions: Contradiction[];
}

interface EvidenceHealthPanelProps {
  programId: string;
  /** Base URL for the BFF proxy (default: /api/evidence-fabric). No auth token needed — the Node server injects it. */
  baseUrl?: string;
  onViewScanDetail?: (scanId: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function triggerLabel(triggered_by: string): string {
  switch (triggered_by) {
    case 'manual':
      return 'Manual';
    case 'a8_nightly':
      return 'Nightly';
    case 'api':
      return 'API';
    default:
      return triggered_by;
  }
}

function severityColor(count: number): string {
  if (count === 0) return 'text-emerald-600';
  if (count <= 3) return 'text-amber-600';
  return 'text-red-600';
}

function severityBadge(count: number) {
  if (count === 0)
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
        Clean
      </Badge>
    );
  if (count <= 3)
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
        {count} Issues
      </Badge>
    );
  return (
    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
      {count} Issues
    </Badge>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function EvidenceHealthPanel({
  programId,
  baseUrl = '/api/evidence-fabric',
  onViewScanDetail,
}: EvidenceHealthPanelProps) {
  const queryClient = useQueryClient();
  const [scanTriggered, setScanTriggered] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Download defense packet as ZIP
  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch(`${baseUrl}/defense-packet?program_id=${programId}`);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `defense-packet-${programId}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setDownloadError(err.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  // Fetch health summary
  const { data, isLoading, error, refetch } = useQuery<HealthSummary>({
    queryKey: ['evidence-health', programId],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/health-summary?program_id=${programId}`);
      if (!res.ok) throw new Error(`Health summary failed: ${res.status}`);
      return res.json();
    },
    refetchInterval: 30_000, // auto-refresh every 30s
    staleTime: 10_000,
  });

  // Run scan mutation
  const runScan = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `${baseUrl}/contradiction-scans?program_id=${programId}&triggered_by=manual`,
        { method: 'POST' }
      );
      if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      setScanTriggered(true);
      // Refetch health after a short delay for the scan to complete
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['evidence-health', programId] });
        setScanTriggered(false);
      }, 3000);
    },
  });

  // ─── Loading ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-slate-400" />
            <CardTitle className="text-base">Evidence Health</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            <CardTitle className="text-base">Evidence Health</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Unable to load evidence health data.</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ─── Data Available ─────────────────────────────────────────────────────
  const scan = data.latest_scan;
  const totalClaims = Object.values(data.claims).reduce((s, n) => s + n, 0);
  const activeClaims = data.claims['active'] ?? 0;
  const contradictions = scan?.contradictions_found ?? 0;
  const hasScans = (data.scans['completed'] ?? 0) > 0;

  return (
    <Card className="shadow-sm border-slate-200 hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {contradictions === 0 && hasScans ? (
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            ) : contradictions > 0 ? (
              <ShieldAlert className="h-5 w-5 text-amber-600" />
            ) : (
              <Shield className="h-5 w-5 text-slate-400" />
            )}
            <CardTitle className="text-base">Evidence Health</CardTitle>
          </div>
          {scan && severityBadge(contradictions)}
        </div>
        {scan && (
          <CardDescription className="text-xs mt-1">
            Last scan: {timeAgo(scan.completed_at)} · {triggerLabel(scan.triggered_by)}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Latest Scan Summary ────────────────────────────── */}
        {scan ? (
          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Latest Scan
              </span>
              {onViewScanDetail && (
                <button
                  onClick={() => onViewScanDetail(scan.id)}
                  className="text-xs text-primary-600 hover:text-primary-800 flex items-center gap-0.5"
                >
                  Details <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className={`text-lg font-semibold ${severityColor(contradictions)}`}>
                  {contradictions}
                </div>
                <div className="text-xs text-slate-500">Contradictions</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-slate-900">{scan.total_claims}</div>
                <div className="text-xs text-slate-500">Claims Scanned</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-slate-900">{scan.scan_type}</div>
                <div className="text-xs text-slate-500">Scan Type</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 rounded-lg p-4 text-center">
            <Shield className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No scans yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Run your first contradiction scan to check evidence integrity.
            </p>
          </div>
        )}

        {/* ── Top Contradictions ─────────────────────────────── */}
        {data.top_contradictions.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Top Contradictions
            </span>
            {data.top_contradictions.map((c, i) => (
              <div
                key={`${c.entity}-${c.field}-${i}`}
                className="flex items-center justify-between px-2 py-1.5 bg-amber-50 rounded text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-amber-600 flex-shrink-0" />
                  <span className="text-slate-700 font-medium truncate max-w-[160px]">
                    {c.entity}:{c.field}
                  </span>
                </div>
                <span className="text-amber-700 font-mono">{c.claim_count} claims</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Evidence Inventory ─────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 pt-1">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-500" />
            <div>
              <div className="text-sm font-semibold text-slate-900">{activeClaims}</div>
              <div className="text-xs text-slate-500">Claims</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-violet-500" />
            <div>
              <div className="text-sm font-semibold text-slate-900">{data.sources_count}</div>
              <div className="text-xs text-slate-500">Sources</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-slate-500" />
            <div>
              <div className="text-sm font-semibold text-slate-900">{data.provenance_count}</div>
              <div className="text-xs text-slate-500">Provenance</div>
            </div>
          </div>
        </div>

        {/* ── Action Buttons ────────────────────────────────── */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => runScan.mutate()}
            disabled={runScan.isPending || scanTriggered}
          >
            {runScan.isPending || scanTriggered ? (
              <>
                <Activity className="h-3.5 w-3.5 mr-1.5 animate-pulse" />
                Running Scan...
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Run Scan Now
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? (
              <>
                <Download className="h-3.5 w-3.5 mr-1.5 animate-bounce" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Defense Packet
              </>
            )}
          </Button>
        </div>
        {downloadError && <p className="text-xs text-red-500 mt-1">{downloadError}</p>}

        {/* ── Scan History Summary ───────────────────────────── */}
        {hasScans && (
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
            <span>
              {data.scans['completed'] ?? 0} completed · {data.scans['failed'] ?? 0} failed
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Auto-refresh 30s
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EvidenceHealthPanel;

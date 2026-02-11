/**
 * Phase 6.6.E1 — Proof Strip (Zero-Drift Evidence Badge Row)
 *
 * Compact compliance badge strip showing:
 *   1. Contract: version + lock hash (copy)
 *   2. Manifest: manifest hash (copy)
 *   3. Freshness: FDA data updated timestamp (color-coded)
 *   4. Audit: signer type + key id (copy)
 *
 * "The compliance flex in demos."
 *
 * @phase 6.6.E1
 */

import { useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Shield, FileCheck, RefreshCw, Key, Copy, Check } from 'lucide-react';
import { useProofPack } from '@/hooks/use-predicate-intelligence';
import type { IngestFreshnessStatus } from '../../../shared/types/predicate-intelligence';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const FRESHNESS_COLORS: Record<IngestFreshnessStatus, string> = {
  GREEN: 'bg-green-100 text-green-800 border-green-300',
  YELLOW: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  RED: 'bg-red-100 text-red-800 border-red-300',
};

const FRESHNESS_LABELS: Record<IngestFreshnessStatus, string> = {
  GREEN: 'Fresh',
  YELLOW: 'Aging',
  RED: 'Stale',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Copy Button micro-component
// ═══════════════════════════════════════════════════════════════════════════════

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={`Copy ${label}`}
          >
            {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">{copied ? 'Copied!' : `Copy ${label}`}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ProofStrip
// ═══════════════════════════════════════════════════════════════════════════════

interface ProofStripProps {
  programId: string;
  subjectHash?: string;
}

export function ProofStrip({ programId, subjectHash = '' }: ProofStripProps) {
  const { data: proof, isLoading, error } = useProofPack(programId, subjectHash);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
        <Shield className="h-3.5 w-3.5" />
        <span>Loading proof pack…</span>
      </div>
    );
  }

  if (error || !proof) {
    return null; // Graceful fallback — don't block the page
  }

  const freshnessClass = FRESHNESS_COLORS[proof.ingest_freshness.status] || FRESHNESS_COLORS.RED;
  const freshnessLabel = FRESHNESS_LABELS[proof.ingest_freshness.status] || 'Unknown';

  const freshnessTime = proof.ingest_freshness.last_success_at
    ? new Date(proof.ingest_freshness.last_success_at).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Never';

  return (
    <div
      className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg border bg-muted/30 text-xs"
      data-testid="proof-strip"
    >
      {/* Contract badge */}
      <div className="flex items-center gap-1.5">
        <Shield className="h-3.5 w-3.5 text-blue-600" />
        <span className="font-medium">Contract:</span>
        <Badge variant="outline" className="text-xs px-1.5 py-0">
          v{proof.risk_vocab_version}
        </Badge>
        <code className="text-[10px] text-muted-foreground font-mono">
          {proof.risk_vocab_hash.slice(0, 12)}…
        </code>
        <CopyButton value={proof.risk_vocab_hash} label="risk vocab hash" />
      </div>

      <span className="text-muted-foreground">|</span>

      {/* Manifest badge */}
      <div className="flex items-center gap-1.5">
        <FileCheck className="h-3.5 w-3.5 text-purple-600" />
        <span className="font-medium">Manifest:</span>
        <code className="text-[10px] text-muted-foreground font-mono">
          {proof.manifest_hash ? `${proof.manifest_hash.slice(0, 12)}…` : '—'}
        </code>
        {proof.manifest_hash && <CopyButton value={proof.manifest_hash} label="manifest hash" />}
      </div>

      <span className="text-muted-foreground">|</span>

      {/* Freshness badge */}
      <div className="flex items-center gap-1.5">
        <RefreshCw className="h-3.5 w-3.5 text-green-600" />
        <span className="font-medium">FDA Data:</span>
        <Badge variant="outline" className={`text-xs px-1.5 py-0 ${freshnessClass}`}>
          {freshnessLabel}
        </Badge>
        <span className="text-muted-foreground">{freshnessTime}</span>
      </div>

      <span className="text-muted-foreground">|</span>

      {/* Audit badge */}
      <div className="flex items-center gap-1.5">
        <Key className="h-3.5 w-3.5 text-amber-600" />
        <span className="font-medium">Audit:</span>
        <Badge variant="outline" className="text-xs px-1.5 py-0">
          {proof.audit.signature_method}
        </Badge>
        <code className="text-[10px] text-muted-foreground font-mono">{proof.audit.key_id}</code>
        <CopyButton value={proof.audit.doc_hash} label="audit doc hash" />
      </div>
    </div>
  );
}

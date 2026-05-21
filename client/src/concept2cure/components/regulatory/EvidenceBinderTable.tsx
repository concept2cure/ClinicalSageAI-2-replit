/**
 * Evidence Binder Table — IVDR Binder Claim + Evidence Management UI
 *
 * Renders all binder claims for the current project, each expandable
 * to show attached evidence. Supports:
 *   - Creating / editing claims (upsert)
 *   - Attaching vault file evidence to claims
 *   - Approving / revoking claims (permission-gated)
 *   - Soft-removing evidence
 *   - Visual status badges (DRAFT/IN_REVIEW/APPROVED)
 *
 * @module components/regulatory/EvidenceBinderTable
 * @version 1.0.0
 */

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  CheckCircle2,
  Clock,
  FileText,
  Link2,
  Plus,
  ShieldCheck,
  ShieldX,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { InlineAIButton } from '../ui/InlineAIButton';
import {
  fetchBinderClaims,
  upsertClaim,
  attachEvidence,
  removeEvidence,
  approveClaim,
  revokeClaim,
} from '@/services/ivdrBinderApi';

interface EvidenceBinderTableProps {
  projectId: string;
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'APPROVED':
      return (
        <Badge className="bg-green-100 text-green-800">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Approved
        </Badge>
      );
    case 'IN_REVIEW':
      return (
        <Badge className="bg-yellow-100 text-yellow-800">
          <Clock className="mr-1 h-3 w-3" /> In Review
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          <FileText className="mr-1 h-3 w-3" /> Draft
        </Badge>
      );
  }
}

// ── Pack scope label ─────────────────────────────────────────────────────────

function packScopeLabel(scope: string | null): string {
  switch (scope) {
    case 'technical_file':
      return 'Technical File';
    case 'performance_study':
      return 'Performance Study';
    case 'post_market':
      return 'Post-Market';
    case 'full':
      return 'Full';
    default:
      return scope || '—';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════

export default function EvidenceBinderTable({ projectId }: EvidenceBinderTableProps) {
  const queryClient = useQueryClient();
  const queryKey = ['ivdr-binder', projectId];

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchBinderClaims(projectId),
    enabled: !!projectId,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const claims = data?.claims ?? [];

  // ── Expanded rows ──────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── New claim dialog ───────────────────────────────────────────────────────
  const [showNewClaim, setShowNewClaim] = useState(false);
  const [newClaim, setNewClaim] = useState({
    claimKey: '',
    title: '',
    description: '',
    packScope: 'technical_file',
    requiredForPack: true,
  });

  const createClaimMutation = useMutation({
    mutationFn: () =>
      upsertClaim({
        projectId,
        claimKey: newClaim.claimKey,
        title: newClaim.title,
        description: newClaim.description,
        packScope: newClaim.packScope as any,
        requiredForPack: newClaim.requiredForPack,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setShowNewClaim(false);
      setNewClaim({
        claimKey: '',
        title: '',
        description: '',
        packScope: 'technical_file',
        requiredForPack: true,
      });
    },
  });

  // ── Attach evidence dialog ─────────────────────────────────────────────────
  const [attachTarget, setAttachTarget] = useState<string | null>(null);
  const [attachForm, setAttachForm] = useState({
    vaultFileId: '',
    vaultVersionId: '',
    artifactType: 'protocol' as string,
    notes: '',
  });

  const attachMutation = useMutation({
    mutationFn: () =>
      attachEvidence(attachTarget!, {
        projectId,
        vaultFileId: attachForm.vaultFileId,
        vaultVersionId: attachForm.vaultVersionId || '',
        artifactType: attachForm.artifactType as any,
        notes: attachForm.notes || undefined,
      } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setAttachTarget(null);
      setAttachForm({ vaultFileId: '', vaultVersionId: '', artifactType: 'protocol', notes: '' });
    },
  });

  // ── Approve/Revoke mutations ───────────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: (claimId: string) => approveClaim(claimId, { projectId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const revokeMutation = useMutation({
    mutationFn: (claimId: string) => revokeClaim(claimId, { projectId } as any),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  // ── Remove evidence mutation ───────────────────────────────────────────────
  const removeMutation = useMutation({
    mutationFn: ({ evidenceId, reason }: { evidenceId: string; reason: string }) =>
      removeEvidence(evidenceId, { projectId, reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  // ── Loading / Error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="border border-stone-200 rounded-md">
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading evidence binder…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-stone-200 rounded-md">
        <div className="p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>Failed to load evidence binder: {(error as Error)?.message}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border border-stone-200 rounded-md">
        <div className="flex flex-row items-center justify-between px-4 py-3 border-b border-stone-200">
          <div>
            <h3 className="text-lg font-semibold">Evidence Binder</h3>
            <p className="text-sm text-muted-foreground">
              Manage regulatory claims and attach supporting evidence from the Document Vault
            </p>
          </div>
          <Button size="sm" onClick={() => setShowNewClaim(true)}>
            <Plus className="mr-1 h-4 w-4" /> New Claim
          </Button>
        </div>
        <div className="px-4 py-3">
          {claims.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="mx-auto h-10 w-10 mb-2 opacity-50" />
              <p>No claims yet. Create your first binder claim to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Claim Key</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pack Scope</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map(claim => {
                  const isExpanded = expanded.has(claim.id);
                  return (
                    <React.Fragment key={claim.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleExpand(claim.id)}
                      >
                        <TableCell>
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{(claim as any).claim_key ?? claim.claimKey}</TableCell>
                        <TableCell className="font-medium">{claim.title}</TableCell>
                        <TableCell>
                          <StatusBadge status={claim.status} />
                        </TableCell>
                        <TableCell>{packScopeLabel((claim as any).pack_scope ?? claim.packScope)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{claim.evidence?.length ?? 0}</Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1" onClick={e => e.stopPropagation()}>
                          <InlineAIButton
                            actionType="explain_selection"
                            content={`Claim: ${claim.title}\n\nDescription: ${claim.description || ''}\nKey: ${(claim as any).claim_key ?? claim.claimKey}\nStatus: ${claim.status}\nScope: ${packScopeLabel((claim as any).pack_scope ?? claim.packScope)}`}
                            projectId={Number(projectId) || 1}
                            module={'regulatory' as any}
                            size="sm"
                            label="Explain"
                          />
                          <InlineAIButton
                            actionType="extract_structured_data"
                            content={`Claim: ${claim.title}\n\nDescription: ${claim.description || ''}\nKey: ${(claim as any).claim_key ?? claim.claimKey}\nStatus: ${claim.status}\nScope: ${packScopeLabel((claim as any).pack_scope ?? claim.packScope)}\nEvidence count: ${claim.evidence?.length ?? 0}`}
                            projectId={Number(projectId) || 1}
                            module={'regulatory' as any}
                            size="sm"
                            label="Extract"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={e => {
                              e.stopPropagation();
                              setAttachTarget(claim.id);
                            }}
                          >
                            <Link2 className="h-3 w-3 mr-1" /> Attach
                          </Button>
                          {claim.status === 'IN_REVIEW' && (
                            <Button
                              size="sm"
                              variant="default"
                              disabled={approveMutation.isPending}
                              onClick={e => {
                                e.stopPropagation();
                                approveMutation.mutate(claim.id);
                              }}
                            >
                              <ShieldCheck className="h-3 w-3 mr-1" /> Approve
                            </Button>
                          )}
                          {claim.status === 'APPROVED' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={revokeMutation.isPending}
                              onClick={e => {
                                e.stopPropagation();
                                revokeMutation.mutate(claim.id);
                              }}
                            >
                              <ShieldX className="h-3 w-3 mr-1" /> Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Expanded evidence rows */}
                      {isExpanded &&
                        claim.evidence?.map(ev => (
                          <TableRow key={ev.id} className="bg-muted/30">
                            <TableCell />
                            <TableCell colSpan={2} className="text-xs">
                              <span className="font-mono">{(ev as any).vault_file_id ?? (ev as any).vaultFileId}</span>
                              {((ev as any).vault_version_id ?? (ev as any).vaultVersionId) && (
                                <span className="text-muted-foreground ml-1">
                                  v{(ev as any).vault_version_id ?? (ev as any).vaultVersionId}
                                </span>
                              )}
                              {ev.notes && (
                                <span className="block text-muted-foreground mt-0.5">
                                  {ev.notes}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {(ev as any).artifact_type ?? (ev as any).artifactType}
                              </Badge>
                            </TableCell>
                            <TableCell colSpan={2}>
                              {((ev as any).excerpt_preview ?? (ev as any).excerptPreview) && (
                                <span className="text-xs text-muted-foreground line-clamp-1">
                                  "{(ev as any).excerpt_preview ?? (ev as any).excerptPreview}"
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() =>
                                  removeMutation.mutate({
                                    evidenceId: ev.id,
                                    reason: 'Removed by user',
                                  })
                                }
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}

                      {isExpanded && (!claim.evidence || claim.evidence.length === 0) && (
                        <TableRow className="bg-muted/30">
                          <TableCell />
                          <TableCell
                            colSpan={6}
                            className="text-center text-muted-foreground text-sm py-4"
                          >
                            No evidence attached yet
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* ── New Claim Dialog ──────────────────────────────────────────────── */}
      <Dialog open={showNewClaim} onOpenChange={setShowNewClaim}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Binder Claim</DialogTitle>
            <DialogDescription>Add a regulatory claim to the evidence binder</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Claim Key (e.g., PERF-LOD-001)"
              value={newClaim.claimKey}
              onChange={e => setNewClaim(p => ({ ...p, claimKey: e.target.value }))}
            />
            <Input
              placeholder="Title"
              value={newClaim.title}
              onChange={e => setNewClaim(p => ({ ...p, title: e.target.value }))}
            />
            <Textarea
              placeholder="Description (optional)"
              value={newClaim.description}
              onChange={e => setNewClaim(p => ({ ...p, description: e.target.value }))}
            />
            <Select
              value={newClaim.packScope}
              onValueChange={v => setNewClaim(p => ({ ...p, packScope: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pack Scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="technical_file">Technical File</SelectItem>
                <SelectItem value="performance_study">Performance Study</SelectItem>
                <SelectItem value="post_market">Post-Market</SelectItem>
                <SelectItem value="full">Full</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewClaim(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newClaim.claimKey || !newClaim.title || createClaimMutation.isPending}
              onClick={() => createClaimMutation.mutate()}
            >
              {createClaimMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              Create Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Attach Evidence Dialog ────────────────────────────────────────── */}
      <Dialog open={!!attachTarget} onOpenChange={() => setAttachTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach Evidence</DialogTitle>
            <DialogDescription>Link a Document Vault file to this claim</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Vault File ID"
              value={attachForm.vaultFileId}
              onChange={e => setAttachForm(p => ({ ...p, vaultFileId: e.target.value }))}
            />
            <Input
              placeholder="Vault Version ID (optional)"
              value={attachForm.vaultVersionId}
              onChange={e => setAttachForm(p => ({ ...p, vaultVersionId: e.target.value }))}
            />
            <Select
              value={attachForm.artifactType}
              onValueChange={v => setAttachForm(p => ({ ...p, artifactType: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Artifact Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="protocol">Protocol</SelectItem>
                <SelectItem value="report">Report</SelectItem>
                <SelectItem value="raw_data">Raw Data</SelectItem>
                <SelectItem value="statistical_analysis">Statistical Analysis</SelectItem>
                <SelectItem value="certificate">Certificate</SelectItem>
                <SelectItem value="declaration">Declaration</SelectItem>
                <SelectItem value="labeling">Labeling</SelectItem>
                <SelectItem value="bibliography">Bibliography</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Notes (optional)"
              value={attachForm.notes}
              onChange={e => setAttachForm(p => ({ ...p, notes: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={!attachForm.vaultFileId || attachMutation.isPending}
              onClick={() => attachMutation.mutate()}
            >
              {attachMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Link2 className="h-4 w-4 mr-1" />
              )}
              Attach
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

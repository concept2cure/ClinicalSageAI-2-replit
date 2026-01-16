import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Package, Play, Download, AlertTriangle, CheckCircle, Clock, FileText, Archive, Shield } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface EctdPackagerProps {
  subId: string;
}

interface Sequence {
  seq_id: string;
  seq_no: number;
  region: string;
  app_type: string;
  note: string;
  package_path?: string;
  package_sha256?: string;
  built_at?: string;
  built_by?: string;
  file_count: number;
}

interface PreflightIssue {
  severity: 'CRITICAL' | 'WARN' | 'INFO';
  code: string;
  message: string;
}

interface PreflightResult {
  ok: boolean;
  issues: PreflightIssue[];
}

const EctdPackager: React.FC<EctdPackagerProps> = ({ subId }) => {
  const [selectedSeq, setSelectedSeq] = useState<string>('');
  const [newSeqForm, setNewSeqForm] = useState({
    region: 'FDA',
    app_type: 'NDA',
    note: '',
  });
  const [preflightResults, setPreflightResults] = useState<PreflightResult | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch sequences
  const { data: sequences = [], isLoading: loadingSequences } = useQuery<Sequence[]>({
    queryKey: ['/api/reg/submissions', subId, 'sequences'],
    enabled: !!subId,
  });

  // Fetch next sequence number
  const { data: nextSeq } = useQuery<{ next: number }>({
    queryKey: ['/api/reg/submissions', subId, 'sequence/next'],
    enabled: !!subId,
  });

  // Fetch files for selected sequence
  const { data: files = [] } = useQuery<any[]>({
    queryKey: ['/api/reg/sequences', selectedSeq, 'files'],
    enabled: !!selectedSeq,
  });

  // Create sequence mutation
  const createSequenceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/reg/submissions/${subId}/sequences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create sequence');
      return response.json();
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['/api/reg/submissions', subId, 'sequences'] });
      setSelectedSeq(data.seq_id);
      setNewSeqForm({ region: 'FDA', app_type: 'NDA', note: '' });
      toast({
        title: 'Sequence Created',
        description: `Sequence ${String(data.seq_no).padStart(4, '0')} created successfully`,
      });
    },
  });

  // Preflight mutation
  const preflightMutation = useMutation({
    mutationFn: async (seqId: string) => {
      const response = await fetch(`/api/reg/sequences/${seqId}/preflight`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to run preflight');
      return response.json();
    },
    onSuccess: data => {
      setPreflightResults(data);
      toast({
        title: 'Preflight Check Complete',
        description: data.ok ? 'All checks passed!' : `Found ${data.issues.length} issues`,
        variant: data.ok ? 'default' : 'destructive',
      });
    },
  });

  // Package mutation
  const packageMutation = useMutation({
    mutationFn: async (seqId: string) => {
      const response = await fetch(`/api/reg/sequences/${seqId}/package`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to create package');
      return response.json();
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['/api/reg/submissions', subId, 'sequences'] });
      toast({
        title: 'Package Created',
        description: `eCTD sequence ${data.seq_no}.zip created (${(data.size / 1024 / 1024).toFixed(1)} MB)`,
      });
    },
  });

  const handleCreateSequence = () => {
    createSequenceMutation.mutate(newSeqForm);
  };

  const handlePreflight = () => {
    if (selectedSeq) {
      preflightMutation.mutate(selectedSeq);
    }
  };

  const handlePackage = () => {
    if (selectedSeq) {
      packageMutation.mutate(selectedSeq);
    }
  };

  const handleDownload = (seqId: string) => {
    window.open(`/api/reg/sequences/${seqId}/download`, '_blank');
  };

  const getIssueBadgeVariant = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'destructive';
      case 'WARN':
        return 'secondary';
      case 'INFO':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const selectedSequence =
    sequences && Array.isArray(sequences)
      ? sequences.find((s: Sequence) => s.seq_id === selectedSeq)
      : undefined;

  return (
    <div className="space-y-6" data-testid="ectd-packager">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Package className="h-6 w-6 text-blue-600" />
        <div>
          <h3 className="text-lg font-semibold">eCTD Packager (Module 3)</h3>
          <p className="text-sm text-gray-600">
            Create regulatory submission packages with preflight QC and sequence management
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel: Sequences */}
        <div className="space-y-4">
          {/* Create New Sequence */}
          <Card data-testid="create-sequence-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Archive className="h-4 w-4" />
                Create New Sequence
              </CardTitle>
              <CardDescription>
                Next sequence: {String(nextSeq?.next || 1).padStart(4, '0')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="region">Region</Label>
                  <Select
                    value={newSeqForm.region}
                    onValueChange={value => setNewSeqForm(prev => ({ ...prev, region: value }))}
                  >
                    <SelectTrigger data-testid="select-region">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FDA">FDA</SelectItem>
                      <SelectItem value="EMA">EMA</SelectItem>
                      <SelectItem value="PMDA">PMDA</SelectItem>
                      <SelectItem value="HC">Health Canada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="app_type">Application Type</Label>
                  <Select
                    value={newSeqForm.app_type}
                    onValueChange={value => setNewSeqForm(prev => ({ ...prev, app_type: value }))}
                  >
                    <SelectTrigger data-testid="select-app-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NDA">NDA</SelectItem>
                      <SelectItem value="ANDA">ANDA</SelectItem>
                      <SelectItem value="BLA">BLA</SelectItem>
                      <SelectItem value="IND">IND</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="note">Notes (optional)</Label>
                <Textarea
                  data-testid="input-sequence-note"
                  placeholder="Sequence description..."
                  value={newSeqForm.note}
                  onChange={e => setNewSeqForm(prev => ({ ...prev, note: e.target.value }))}
                />
              </div>
              <Button
                data-testid="button-create-sequence"
                onClick={handleCreateSequence}
                disabled={createSequenceMutation.isPending}
                className="w-full"
              >
                {createSequenceMutation.isPending ? 'Creating...' : 'Create Sequence'}
              </Button>
            </CardContent>
          </Card>

          {/* Existing Sequences */}
          <Card data-testid="sequences-list-card">
            <CardHeader>
              <CardTitle>Existing Sequences</CardTitle>
              <CardDescription>{sequences.length} sequences</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSequences ? (
                <div className="text-center py-4">Loading sequences...</div>
              ) : sequences.length === 0 ? (
                <div className="text-center py-4 text-gray-500">No sequences created yet</div>
              ) : (
                <div className="space-y-2">
                  {sequences.map((seq: Sequence) => (
                    <div
                      key={seq.seq_id}
                      data-testid={`sequence-item-${seq.seq_id}`}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedSeq === seq.seq_id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedSeq(seq.seq_id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">
                            {String(seq.seq_no).padStart(4, '0')}
                          </span>
                          <Badge variant="outline">{seq.region}</Badge>
                          <Badge variant="secondary">{seq.app_type}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {seq.package_path && <CheckCircle className="h-4 w-4 text-green-600" />}
                          <span className="text-sm text-gray-500">{seq.file_count} files</span>
                        </div>
                      </div>
                      {seq.note && <p className="text-sm text-gray-600 mt-1">{seq.note}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Panel: Actions & Details */}
        <div className="space-y-4">
          {selectedSequence ? (
            <>
              {/* Sequence Details */}
              <Card data-testid="sequence-details-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Sequence {String(selectedSequence.seq_no).padStart(4, '0')} Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Region</Label>
                      <p className="font-medium">{selectedSequence.region}</p>
                    </div>
                    <div>
                      <Label>Application Type</Label>
                      <p className="font-medium">{selectedSequence.app_type}</p>
                    </div>
                  </div>
                  <div>
                    <Label>Files Included</Label>
                    <p className="font-medium">{selectedSequence.file_count} files</p>
                  </div>
                  {selectedSequence.package_path && (
                    <div className="space-y-2">
                      <Label>Package Status</Label>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm">
                          Built {new Date(selectedSequence.built_at!).toLocaleString()}
                        </span>
                      </div>
                      <Button
                        data-testid="button-download-package"
                        onClick={() => handleDownload(selectedSequence.seq_id)}
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download ZIP
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Preflight Check */}
              <Card data-testid="preflight-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Preflight QC
                  </CardTitle>
                  <CardDescription>Validate submission readiness before packaging</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    data-testid="button-run-preflight"
                    onClick={handlePreflight}
                    disabled={preflightMutation.isPending}
                    variant="outline"
                    className="w-full"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {preflightMutation.isPending ? 'Running...' : 'Run Preflight Check'}
                  </Button>

                  {preflightResults && (
                    <div className="space-y-3">
                      <Separator />
                      <div className="flex items-center gap-2">
                        {preflightResults.ok ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="font-medium">
                          {preflightResults.ok
                            ? 'All Checks Passed'
                            : `${preflightResults.issues.length} Issues Found`}
                        </span>
                      </div>

                      {preflightResults.issues.length > 0 && (
                        <div className="space-y-2">
                          {preflightResults.issues.map((issue, index) => (
                            <div
                              key={index}
                              data-testid={`preflight-issue-${index}`}
                              className="flex items-start gap-2 p-2 border rounded"
                            >
                              <Badge variant={getIssueBadgeVariant(issue.severity)}>
                                {issue.severity}
                              </Badge>
                              <div className="flex-1">
                                <p className="text-sm font-medium">{issue.code}</p>
                                <p className="text-sm text-gray-600">{issue.message}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Package Creation */}
              <Card data-testid="package-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Create Package
                  </CardTitle>
                  <CardDescription>Generate eCTD-compliant ZIP with index.xml</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    data-testid="button-create-package"
                    onClick={handlePackage}
                    disabled={
                      packageMutation.isPending ||
                      (preflightResults !== null && !preflightResults.ok)
                    }
                    className="w-full"
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    {packageMutation.isPending ? 'Creating Package...' : 'Create eCTD Package'}
                  </Button>
                  {preflightResults && !preflightResults.ok && (
                    <p className="text-sm text-red-600 mt-2">
                      Fix critical issues before packaging
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Files Preview */}
              {files.length > 0 && (
                <Card data-testid="files-preview-card">
                  <CardHeader>
                    <CardTitle>Files to Package</CardTitle>
                    <CardDescription>{files.length} files selected</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {files.map((file: any, index: number) => (
                        <div
                          key={file.file_id}
                          data-testid={`file-item-${index}`}
                          className="flex items-center justify-between p-2 border rounded text-sm"
                        >
                          <div>
                            <p className="font-medium">{file.title}</p>
                            <p className="text-gray-500">{file.path}</p>
                          </div>
                          <Badge variant="outline">{file.sec_code}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a sequence to view details and actions</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default EctdPackager;

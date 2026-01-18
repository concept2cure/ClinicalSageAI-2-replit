import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Download, RefreshCw, Shield, Sparkles } from 'lucide-react';

interface Claim {
  claimId: number;
  submissionId: string;
  proposedClaim: string;
  claimType: string | null;
  strengthScore: number | null;
  riskLevel: string | null;
  riskFlags: string[] | null;
  saferAlternative: string | null;
  testStandardMapping: string[] | null;
}

interface Summary {
  totalClaims: number;
  highRisk: number;
  evidenceReady: number;
  averageStrength: number;
}

export default function ClaimsMatrixPanel({ submissionId }: { submissionId: string }) {
  const [hasGenerated, setHasGenerated] = useState(false);
  const [smartMatrix, setSmartMatrix] = useState<any>(null);
  const [smartMatrixLoading, setSmartMatrixLoading] = useState(false);
  const [smartMatrixError, setSmartMatrixError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['claims-matrix', submissionId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/claims/matrix?submission_id=${submissionId}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || 'Failed to load claims matrix');
      }
      return response.json();
    },
    enabled: Boolean(submissionId),
    refetchOnMount: true,
    staleTime: 0,
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/claims/analyze', {
        submissionId,
        sectionId: '6.0',
      });
      return response.json();
    },
    onSuccess: () => {
      setHasGenerated(true);
      refetch();
    },
    onError: () => {
      setHasGenerated(true);
      refetch();
    },
  });

  const claims: Claim[] = data?.claims || [];
  const summary: Summary | null = data?.summary || null;

  useEffect(() => {
    if (!isLoading && !isError && claims.length === 0 && !analyzeMutation.isPending && submissionId) {
      analyzeMutation.mutate();
    }
  }, [analyzeMutation, claims.length, isError, isLoading, submissionId]);

  const averageStrengthPercent = summary ? Math.round(summary.averageStrength * 100) : 0;

  const riskColor = (level?: string | null) => {
    switch (level) {
      case 'critical':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default:
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    }
  };

  const strengthClass = useMemo(() => {
    if (!summary) return 'text-gray-600';
    if (summary.averageStrength >= 0.8) return 'text-emerald-600';
    if (summary.averageStrength >= 0.6) return 'text-yellow-600';
    return 'text-rose-600';
  }, [summary]);

  const handleGenerateSmartMatrix = async () => {
    if (!submissionId) return;
    setSmartMatrixLoading(true);
    setSmartMatrixError(null);
    try {
      const response = await apiRequest('POST', '/api/smart-claims-matrix/generate', {
        deviceId: submissionId,
        cerIds: [submissionId],
      });
      const payload = await response.json();
      if (payload?.matrix) {
        setSmartMatrix(payload.matrix);
      } else {
        setSmartMatrixError('No matrix returned');
      }
    } catch (error: any) {
      setSmartMatrix(null);
      setSmartMatrixError(error?.message || 'Smart matrix generation failed');
    } finally {
      setSmartMatrixLoading(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="claims-matrix-panel">
      <Card className="border-indigo-200 bg-gradient-to-r from-indigo-50 to-slate-50">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-indigo-900">
              <Shield className="h-5 w-5 text-indigo-600" />
              Smart Claims Matrix (AI)
            </CardTitle>
            <CardDescription className="text-indigo-700">
              AI readiness score, predicted FDA feedback, and predicate recommendations.
            </CardDescription>
          </div>
          <Button
            size="sm"
            className="bg-gradient-to-r from-indigo-600 to-purple-600"
            onClick={handleGenerateSmartMatrix}
            disabled={smartMatrixLoading || !submissionId}
          >
            {smartMatrixLoading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate AI Matrix
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {smartMatrixError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-700">
              {smartMatrixError}
            </div>
          )}
          {isError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-700">
              {(error as Error)?.message || 'Unable to load claims matrix.'}
            </div>
          )}
          {!smartMatrix && !smartMatrixError && (
            <div className="text-gray-600">Generate to see AI readiness and predicted feedback.</div>
          )}
          {smartMatrix && (
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-gray-500">Readiness</div>
                <div className="text-lg font-semibold capitalize">
                  {smartMatrix.regulatoryReadiness}
                </div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-gray-500">Compliance</div>
                <div className="text-lg font-semibold">{smartMatrix.complianceScore}%</div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-gray-500">Claims analyzed</div>
                <div className="text-lg font-semibold">{smartMatrix.totalClaims}</div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-gray-500">Opportunity score</div>
                <div className="text-lg font-semibold">{smartMatrix.opportunityScore}</div>
              </div>
              <div className="md:col-span-2 rounded-lg border bg-white p-3">
                <div className="text-xs text-gray-500">Predicted FDA feedback</div>
                <ul className="mt-2 list-disc pl-4 text-sm">
                  {(smartMatrix.predictedFdaFeedback || []).length === 0 && (
                    <li>No critical feedback predicted.</li>
                  )}
                  {(smartMatrix.predictedFdaFeedback || []).map((item: string) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="md:col-span-2 rounded-lg border bg-white p-3">
                <div className="text-xs text-gray-500">Predicate recommendations</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(smartMatrix.predicateDeviceRecommendations || []).map((item: string) => (
                    <Badge key={item} variant="outline" className="bg-white">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-indigo-200 bg-gradient-to-r from-indigo-50 to-slate-50">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-indigo-900">
              <Shield className="h-5 w-5 text-indigo-600" />
              Claims Matrix
            </CardTitle>
            <CardDescription className="text-indigo-700">
              AI-powered analysis of marketing, regulatory, and labeling claims.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasGenerated && (
              <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-white">
                <Sparkles className="h-3 w-3 mr-1" />
                AI Analyzed
              </Badge>
            )}
            <Button
              size="sm"
              className="bg-gradient-to-r from-indigo-600 to-purple-600"
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
            >
              {analyzeMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {hasGenerated ? 'Re-analyze' : 'Analyze with AI'}
                </>
              )}
            </Button>
            <Button size="sm" variant="outline" className="bg-white">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        {summary && (
          <CardContent className="border-t border-indigo-100">
            <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
              <div>
                <div className="text-2xl font-semibold text-gray-900">{summary.totalClaims}</div>
                <div className="text-xs text-gray-500">Total claims</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-rose-600">{summary.highRisk}</div>
                <div className="text-xs text-gray-500">High risk</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-emerald-600">{summary.evidenceReady}</div>
                <div className="text-xs text-gray-500">Evidence ready</div>
              </div>
              <div>
                <div className={`text-2xl font-semibold ${strengthClass}`}>{averageStrengthPercent}%</div>
                <div className="text-xs text-gray-500">Avg strength</div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Card className="border-slate-200">
        <CardContent className="p-0">
          {isLoading || analyzeMutation.isPending ? (
            <div className="flex h-64 items-center justify-center text-gray-500">
              <RefreshCw className="h-6 w-6 mr-2 animate-spin" />
              {analyzeMutation.isPending ? 'Analyzing claims with AI…' : 'Loading claims matrix…'}
            </div>
          ) : claims.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-gray-500">
              <Shield className="h-10 w-10 mb-3 text-gray-400" />
              <p className="text-lg">No claims analyzed yet</p>
              <p className="text-sm text-gray-400">Click “Analyze with AI” to generate your matrix.</p>
            </div>
          ) : (
            <ScrollArea className="h-[560px]">
              <Table>
                <TableHeader className="sticky top-0 bg-slate-50">
                  <TableRow>
                    <TableHead>Claim</TableHead>
                    <TableHead className="w-28">Type</TableHead>
                    <TableHead className="w-24">Strength</TableHead>
                    <TableHead className="w-24">Risk</TableHead>
                    <TableHead>Safer wording</TableHead>
                    <TableHead>Standards</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claims.map((claim) => (
                    <TableRow key={claim.claimId}>
                      <TableCell className="align-top">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 mt-1 text-gray-400" />
                          <div>
                            <p className="text-sm text-gray-900">{claim.proposedClaim}</p>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {(claim.riskFlags || []).map((flag) => (
                                <Badge
                                  key={flag}
                                  variant="outline"
                                  className="border-rose-200 text-rose-600 bg-rose-50"
                                >
                                  {flag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-white">
                          {claim.claimType || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`text-sm font-semibold ${
                            (claim.strengthScore || 0) >= 0.8
                              ? 'text-emerald-600'
                              : (claim.strengthScore || 0) >= 0.6
                                ? 'text-yellow-600'
                                : 'text-rose-600'
                          }`}
                        >
                          {Math.round((claim.strengthScore || 0) * 100)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={riskColor(claim.riskLevel)}>
                          {claim.riskLevel || 'low'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {claim.saferAlternative || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {(claim.testStandardMapping || []).map((standard) => (
                          <div key={standard}>{standard}</div>
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

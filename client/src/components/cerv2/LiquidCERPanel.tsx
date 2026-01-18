import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RegulatoryAtom {
  atomId: number;
  atomType: string | null;
  complianceScore: number | null;
  applicableJurisdictions: string[] | null;
  gaps: string[] | null;
  createdAt?: string;
}

interface LiquidCERPanelProps {
  submissionId?: string | number | null;
}

const LiquidCERPanel: React.FC<LiquidCERPanelProps> = ({ submissionId }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const normalizedId = submissionId != null ? String(submissionId) : '';

  const atomsQuery = useQuery({
    queryKey: ['regulatory-atoms', normalizedId],
    enabled: Boolean(normalizedId),
    queryFn: async () => {
      const resp = await axios.get(`/api/vault/atoms?submission_id=${encodeURIComponent(normalizedId)}`);
      return (resp.data?.data || []) as RegulatoryAtom[];
    },
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      const resp = await axios.post('/api/vault/liquid-cer/convert', {
        submission_id: normalizedId,
        target_jurisdiction: 'EU',
      });
      return resp.data;
    },
    onSuccess: (data) => {
      toast({
        title: 'EU CER Generated',
        description: `CER ID: ${data?.cerId || data?.cer_id || 'generated'}`,
      });
      queryClient.invalidateQueries({ queryKey: ['regulatory-atoms', normalizedId] });
    },
    onError: (error: any) => {
      toast({
        title: 'Conversion Failed',
        description: error?.message || 'Unable to convert to EU CER',
        variant: 'destructive',
      });
    },
  });

  const atoms = atomsQuery.data || [];
  const metrics = useMemo(() => {
    const total = atoms.length || 1;
    const fdaCoverage = atoms.filter(atom => atom.applicableJurisdictions?.includes('FDA')).length;
    const euCoverage = atoms.filter(atom => atom.applicableJurisdictions?.includes('EU')).length;
    const avgCompliance = atoms.reduce((acc, atom) => acc + (atom.complianceScore || 0), 0) / total;
    const gapFree = atoms.filter(atom => (atom.gaps || []).length === 0).length;
    return {
      total,
      fdaCoverage,
      euCoverage,
      avgCompliance,
      gapFree,
    };
  }, [atoms]);

  if (!normalizedId) {
    return (
      <Card className="w-full mt-6 border-slate-200" data-testid="liquid-cer-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-5 w-5 text-blue-600" />
            Liquid CER Multi-Agency View
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Submission ID missing</AlertTitle>
            <AlertDescription>
              Select or create a submission to activate regulatory atom intelligence.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full mt-6 border-l-4 border-l-blue-500" data-testid="liquid-cer-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Globe className="h-5 w-5 text-blue-600" />
          Liquid CER Multi-Agency View
          <Badge variant="outline" className="ml-auto">
            {atoms.length} Regulatory Atoms
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {atomsQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading regulatory atoms…</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-900">FDA Coverage</p>
                <Progress value={(metrics.fdaCoverage / metrics.total) * 100} className="mt-2" />
                <p className="text-2xl font-bold mt-2">{metrics.fdaCoverage}</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-sm font-medium text-green-900">EU Coverage</p>
                <Progress value={(metrics.euCoverage / metrics.total) * 100} className="mt-2" />
                <p className="text-2xl font-bold mt-2">{metrics.euCoverage}</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-sm font-medium text-purple-900">Avg Compliance</p>
                <Progress value={metrics.avgCompliance * 100} className="mt-2" />
                <p className="text-2xl font-bold mt-2">{(metrics.avgCompliance * 100).toFixed(0)}%</p>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {atoms.map((atom) => (
                <div
                  key={atom.atomId}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    {atom.complianceScore != null && atom.complianceScore > 0.7 ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-yellow-600" />
                    )}
                    <div>
                      <p className="font-medium capitalize">{String(atom.atomType || 'unclassified').replace('_', ' ')}</p>
                      <p className="text-xs text-gray-500">
                        {(atom.applicableJurisdictions || ['FDA']).join(', ')}
                        {atom.complianceScore != null && (
                          <> • Score: {(atom.complianceScore * 100).toFixed(0)}%</>
                        )}
                      </p>
                    </div>
                  </div>
                  {atom.gaps && atom.gaps.length > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {atom.gaps.length} gaps
                    </Badge>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-4 pt-4 border-t">
              <Button
                onClick={() => convertMutation.mutate()}
                disabled={convertMutation.isPending}
                className="flex-1 bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700"
              >
                {convertMutation.isPending ? 'Converting…' : (
                  <>
                    <Globe className="h-4 w-4 mr-2" />
                    Convert to EU CER
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default LiquidCERPanel;

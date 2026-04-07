import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  FileText, 
  Brain, 
  BarChart3,
  Zap,
  Target,
  Shield,
  Download,
  RefreshCw,
  Eye,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import DraftResponseEditor from './DraftResponseEditor';

function Pill({ children, tone = 'neutral' }) {
  const styles = {
    high: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-50 dark:border-red-300 dark:text-red-800',
    medium: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-yellow-50 dark:border-yellow-300 dark:text-yellow-800',
    low: 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-green-50 dark:border-green-300 dark:text-green-800',
    neutral: 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-gray-50 dark:border-gray-300 dark:text-gray-800',
  }[tone] || 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-gray-50 dark:border-gray-300 dark:text-gray-800';
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}

function FindingCard({ finding, onEditResponse }) {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Pill tone={finding.severity}>{finding.severity?.toUpperCase()}</Pill>
              <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">{finding.ruleId}</span>
              {finding.confidence && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Confidence: {Math.round(finding.confidence * 100)}%
                </span>
              )}
            </div>
            <CardTitle className="text-base text-gray-900 dark:text-gray-100">{finding.title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => onEditResponse(finding)}
              className="flex items-center gap-1"
              data-testid={`btn-edit-response-${finding.ruleId}`}
            >
              <FileText className="w-3 h-3" />
              Edit Response
            </Button>
            {finding.severity === 'high' && <AlertTriangle className="w-5 h-5 text-red-500" />}
            {finding.severity === 'medium' && <Clock className="w-5 h-5 text-amber-500" />}
            {finding.severity === 'low' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          {finding.rationale}
        </p>
        
        {finding.evidence && finding.evidence.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Evidence:</h4>
            <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              {finding.evidence.map((item, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-gray-400 rounded-full flex-shrink-0"></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {finding.actions && finding.actions.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Required Actions:</h4>
            <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
              {finding.actions.map((action, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0 mt-2"></span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(finding.relatedTabs || finding.module3Sections) && (
          <div className="flex items-center gap-4 pt-2 border-t border-gray-100 dark:border-gray-300">
            {finding.relatedTabs && finding.relatedTabs.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">Related:</span>
                <div className="flex gap-1">
                  {finding.relatedTabs.slice(0, 3).map((tab, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs py-0">{tab}</Badge>
                  ))}
                </div>
              </div>
            )}
            {finding.module3Sections && finding.module3Sections.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">Module 3:</span>
                <div className="flex gap-1">
                  {finding.module3Sections.slice(0, 2).map((section, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs py-0 font-mono">{section}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeficiencyCard({ deficiency }) {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">{deficiency.section}</Badge>
            <Pill tone={deficiency.severity}>{deficiency.severity?.toUpperCase()}</Pill>
          </div>
          <FileText className="w-4 h-4 text-gray-400" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
          {deficiency.comment}
        </p>
        
        {deficiency.draftResponse && (
          <div className="border-l-4 border-blue-500 pl-4 py-2 bg-blue-50 dark:bg-blue-50 rounded-r-md">
            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-800 mb-2">Draft Response:</h4>
            <p className="text-sm text-blue-800 dark:text-blue-700 leading-relaxed whitespace-pre-line">
              {deficiency.draftResponse}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ManufacturingAIInsights() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [data, setData] = React.useState({ findings: [], meta: null });
  const [deficiencyData, setDeficiencyData] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState('review');
  const [responseEditorOpen, setResponseEditorOpen] = React.useState(false);
  const [selectedFinding, setSelectedFinding] = React.useState(null);
  const { toast } = useToast();

  const handleEditResponse = (finding) => {
    setSelectedFinding(finding);
    setResponseEditorOpen(true);
  };

  const runReview = async () => {
    setLoading(true);
    setError(null);
    setDeficiencyData(null);
    
    try {
      // Call real Manufacturing AI API
      const response = await fetch('/api/cmc/manufacturing/ai/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          snapshot: {
            validation: { ppq: { completedRuns: 2, targetRuns: 3 } },
            process: { cppCqaMatrix: [{ relation: 'unknown' }, { relation: 'validated' }] },
            equipment: [{ id: 'mix-100', critical: true, calibrationDue: '2025-01-01', pq: false }],
            ebr: { incompleteSteps: 1 },
            stability: { longTermMonths: 6, claimMonths: 12 }
          },
          useLLM: false
        })
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const apiData = await response.json();
      console.log('🔍 AI Review API Response:', apiData);
      
      setData({ 
        findings: apiData.findings || [], 
        meta: apiData.meta || { generatedAt: new Date().toISOString(), count: 0 } 
      });
      
      console.log('🎯 Data state updated with findings:', { 
        findingsCount: (apiData.findings || []).length,
        firstFinding: apiData.findings?.[0]
      });
      toast({
        title: "AI Review Completed",
        description: `Found ${apiData.findings?.length || 0} findings requiring attention.`,
      });
      setLoading(false);

    } catch (e) {
      setError(e);
      setLoading(false);
      toast({
        title: "Review Failed",
        description: "Unable to complete AI review. Please try again.",
        variant: "destructive"
      });
    }
  };

  const runDeficiency = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Call real Manufacturing AI deficiency simulation API
      const response = await fetch('/api/cmc/manufacturing/ai/simulate-deficiency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          snapshot: {
            validation: { ppq: { completedRuns: 2, targetRuns: 3 } },
            process: { cppCqaMatrix: [{ relation: 'unknown' }] }
          },
          useLLM: false
        })
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const apiData = await response.json();
      
      setDeficiencyData(apiData);
      toast({
        title: "Deficiency Simulation Complete",
        description: `Generated ${apiData.letter?.length || 0} regulatory comments with draft responses.`,
      });
      setLoading(false);

    } catch (e) {
      setError(e);
      setLoading(false);
      toast({
        title: "Simulation Failed",
        description: "Unable to complete deficiency simulation. Please try again.",
        variant: "destructive"
      });
    }
  };

  const stats = React.useMemo(() => {
    const findings = data.findings || [];
    return {
      total: findings.length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
      avgConfidence: findings.length > 0 
        ? Math.round((findings.reduce((acc, f) => acc + (f.confidence || 0), 0) / findings.length) * 100)
        : 0
    };
  }, [data.findings]);

  return (
    <div className="space-y-6" data-testid="manufacturing-ai-insights">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Brain className="w-5 h-5 text-blue-600" />
            AI Oversight (ex-FDA)
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Regulatory compliance analysis with predictive deficiency identification
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={runReview} 
            disabled={loading}
            className="flex items-center gap-2"
            data-testid="btn-ai-review"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Run AI Review
          </Button>
          <Button 
            variant="outline" 
            onClick={runDeficiency} 
            disabled={loading}
            className="flex items-center gap-2"
            data-testid="btn-simulate-deficiency"
          >
            <Target className="w-4 h-4" />
            Simulate Deficiency
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {data.findings.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Findings</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{stats.high}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">High Priority</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-amber-600">{stats.medium}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Medium Priority</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.low}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Low Priority</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.avgConfidence}%</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Avg Confidence</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="review" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Review Findings
          </TabsTrigger>
          <TabsTrigger value="deficiency" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Deficiency Letter
          </TabsTrigger>
        </TabsList>

        <TabsContent value="review" className="mt-6">
          {error && (
            <Card className="border-red-200 bg-red-50 dark:bg-red-50 dark:border-red-300">
              <CardContent className="p-4">
                <p className="text-red-700 dark:text-red-800 text-sm">Error: {error.message}</p>
              </CardContent>
            </Card>
          )}

          {loading && (
            <Card>
              <CardContent className="p-8 text-center">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
                <p className="text-gray-600 dark:text-gray-400">Running comprehensive AI review...</p>
              </CardContent>
            </Card>
          )}

          {!loading && data.findings.length === 0 && !error && (
            <Card>
              <CardContent className="p-8 text-center">
                <Brain className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 dark:text-gray-400 mb-4">No AI review data available</p>
                <p className="text-sm text-gray-500 dark:text-gray-500">Click "Run AI Review" to analyze your manufacturing data</p>
              </CardContent>
            </Card>
          )}

          {!loading && data.findings.length > 0 && (
            <div className="space-y-4" data-testid="ai-findings">
              {data.findings.map((finding, idx) => (
                <div key={`${finding.ruleId}-${idx}`} data-testid={`ai-finding-${finding.ruleId}`}>
                  <FindingCard 
                    finding={finding} 
                    onEditResponse={handleEditResponse}
                  />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="deficiency" className="mt-6">
          {!deficiencyData && !loading && (
            <Card>
              <CardContent className="p-8 text-center">
                <Target className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 dark:text-gray-400 mb-4">No deficiency simulation available</p>
                <p className="text-sm text-gray-500 dark:text-gray-500">Click "Simulate Deficiency" to generate regulatory letter preview</p>
              </CardContent>
            </Card>
          )}

          {deficiencyData && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Agency Deficiency Letter
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {deficiencyData.letter.map((def, idx) => (
                      <DeficiencyCard key={idx} deficiency={def} />
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ExternalLink className="w-4 h-4" />
                      Draft Responses
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {deficiencyData.responses.map((resp, idx) => (
                      <DeficiencyCard key={idx} deficiency={resp} />
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Footer Info */}
      {data.meta && (
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-4 border-t border-gray-200 dark:border-gray-300">
          Last updated: {new Date(data.meta.generatedAt).toLocaleString()}
        </div>
      )}

      {/* Draft Response Editor */}
      <DraftResponseEditor
        finding={selectedFinding}
        open={responseEditorOpen}
        onClose={() => {
          setResponseEditorOpen(false);
          setSelectedFinding(null);
        }}
      />
    </div>
  );
}
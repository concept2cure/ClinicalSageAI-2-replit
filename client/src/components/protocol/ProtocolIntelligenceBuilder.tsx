import { useEffect, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardTitle,
  CardDescription,
  CardHeader,
  CardFooter,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/portal-v2/services/authService';
import { toast } from '@/hooks/use-toast';

export default function ProtocolIntelligenceBuilder() {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<any>(null);
  const [prediction, setPrediction] = useState<any>(null);
  const [benchmarks, setBenchmarks] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [sap, setSap] = useState('');
  const [loading, setLoading] = useState(false);
  const [savedVersions, setSavedVersions] = useState<any[]>([]);
  const [selectedTab, setSelectedTab] = useState('editor');
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  const { user } = useAuth();

  // Load saved versions if user is authenticated
  useEffect(() => {
    if (user) {
      fetchSavedVersions();
    }
  }, [user]);

  const fetchSavedVersions = async () => {
    try {
      const res = await fetch(`/api/dossier/${user?.id}_TS-4980_dossier.json`);
      if (res.ok) {
        const data = await res.json();
        if (data.reports && Array.isArray(data.reports)) {
          setSavedVersions(data.reports);
        }
      }
    } catch (error) {
      console.error('Error fetching saved versions:', error);
    }
  };

  const runAnalysis = async () => {
    if (!text.trim()) {
      toast({
        title: "Missing Protocol Text",
        description: "Please enter protocol text to analyze.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      // Parse the protocol text
      const parsedRes = await fetch('/api/protocol/full-analyze', {
        method: 'POST',
        body: JSON.stringify({ text }),
        headers: { 'Content-Type': 'application/json' },
      });

      if (!parsedRes.ok) {
        throw new Error('Failed to parse protocol text');
      }

      const parsedData = await parsedRes.json();
      setParsed(parsedData);

      // Get success prediction
      const predRes = await fetch('/api/protocol/risk-profile', {
        method: 'POST',
        body: JSON.stringify(parsedData),
        headers: { 'Content-Type': 'application/json' },
      });

      if (!predRes.ok) {
        throw new Error('Failed to calculate risk profile');
      }

      const pred = await predRes.json();
      setPrediction(pred);

      // Get CSR benchmarks for comparison
      const benchRes = await fetch('/api/strategy/from-csrs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          indication: parsedData.indication,
          phase: parsedData.phase,
        }),
      });

      if (!benchRes.ok) {
        throw new Error('Failed to fetch CSR benchmarks');
      }

      const benchData = await benchRes.json();
      setBenchmarks(benchData.metrics);

      // Get optimization recommendations
      const optRes = await fetch('/api/protocol/optimize-deep', {
        method: 'POST',
        body: JSON.stringify(parsedData),
        headers: { 'Content-Type': 'application/json' },
      });

      if (!optRes.ok) {
        throw new Error('Failed to generate optimization recommendations');
      }

      const recommendations = await optRes.json();
      setRecommendations(recommendations);

      // Generate Statistical Analysis Plan
      const sapRes = await fetch('/api/sap/generate', {
        method: 'POST',
        body: JSON.stringify(parsedData),
        headers: { 'Content-Type': 'application/json' },
      });

      if (!sapRes.ok) {
        throw new Error('Failed to generate SAP');
      }

      const sapText = await sapRes.text();
      setSap(sapText);

      // Update to show analysis tab
      setSelectedTab('analysis');
    } catch (error) {
      console.error('Error analyzing protocol text:', error);
      toast({
        title: "Analysis Error",
        description: "Failed to analyze protocol text.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async () => {
    if (!parsed || !prediction) {
      toast({
        title: "Missing Analysis",
        description: "Please run analysis first before exporting.",
        variant: "destructive"
      });
      return;
    }

    try {
      const res = await fetch('/api/export/intelligence-report', {
        method: 'POST',
        body: JSON.stringify({
          protocol_id: 'TS-4980',
          parsed,
          prediction: prediction.success_probability,
          benchmarks,
          sap,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        throw new Error('Failed to generate report');
      }

      const { download_url } = await res.json();
      window.open(download_url, '_blank');
    } catch (error) {
      console.error('Error exporting report:', error);
      toast({
        title: "Export Error",
        description: "Failed to export report.",
        variant: "destructive"
      });
    }
  };

  const saveToDossier = async () => {
    if (!parsed || !prediction || !user) {
      toast({
        title: "Cannot Save",
        description: "Please log in and complete analysis first.",
        variant: "destructive"
      });
      return;
    }

    try {
      const res = await fetch('/api/dossier/save-intelligence-report', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id,
          protocol_id: 'TS-4980',
          report_data: {
            parsed,
            prediction: prediction.success_probability,
            benchmarks,
            sap,
          },
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        throw new Error('Failed to save to dossier');
      }

      const data = await res.json();

      toast({
        title: "Saved",
        description: "Report saved to dossier successfully.",
      });

      // Refresh versions list
      fetchSavedVersions();
      setCurrentVersion(data.version);
    } catch (error) {
      console.error('Error saving to dossier:', error);
      toast({
        title: "Save Error",
        description: "Failed to save report to dossier.",
        variant: "destructive"
      });
    }
  };

  const restoreVersion = async (version: string) => {
    if (!user) return;

    try {
      const res = await fetch(
        `/api/dossier/${user.id}/${encodeURIComponent('TS-4980')}/restore/${version}`,
        {
          method: 'POST',
        }
      );

      if (!res.ok) {
        throw new Error('Failed to restore version');
      }

      const data = await res.json();

      toast({
        title: "Restored",
        description: `Version ${version} restored successfully.`,
      });

      // Load restored data
      if (data.original) {
        setParsed(data.original.parsed || null);
        setPrediction({
          success_probability: data.original.prediction,
        });
        setBenchmarks(data.original.benchmarks || null);
        setSap(data.original.sap || '');
      }

      // Refresh versions
      fetchSavedVersions();
      setCurrentVersion(data.version);
      setSelectedTab('analysis');
    } catch (error) {
      console.error('Error restoring version:', error);
      toast({
        title: "Restore Error",
        description: "Failed to restore version.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-blue-900">📄 Protocol Intelligence Engine</h2>
        {savedVersions.length > 0 && (
          <Badge variant="outline" className="px-3">
            {currentVersion ||
              (savedVersions.length > 0 ? savedVersions[savedVersions.length - 1].version : '')}
          </Badge>
        )}
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="editor">Protocol Editor</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="versions">Version History</TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="space-y-4">
          <Textarea
            rows={12}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Paste your protocol summary here..."
            className="font-mono text-sm"
          />

          <Button
            onClick={runAnalysis}
            className="bg-blue-700 text-white"
            disabled={loading || !text.trim()}
          >
            {loading ? 'Analyzing...' : '🧠 Analyze Protocol'}
          </Button>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          {parsed ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Protocol Fields</CardTitle>
                    <CardDescription>Key parameters extracted from protocol</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm space-y-2">
                      <li>
                        <span className="font-semibold">📌 Indication:</span> {parsed.indication}
                      </li>
                      <li>
                        <span className="font-semibold">🔢 Phase:</span> {parsed.phase}
                      </li>
                      <li>
                        <span className="font-semibold">👥 Sample Size:</span> {parsed.sample_size}
                      </li>
                      <li>
                        <span className="font-semibold">📆 Duration:</span> {parsed.duration_weeks}{' '}
                        weeks
                      </li>
                      <li>
                        <span className="font-semibold">📉 Dropout:</span>{' '}
                        {parsed.dropout_rate * 100}%
                      </li>
                      <li>
                        <span className="font-semibold">🎯 Endpoint:</span>{' '}
                        {parsed.endpoint_primary}
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Success Prediction</CardTitle>
                    <CardDescription>AI-powered risk assessment</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {prediction ? (
                      <div className="flex flex-col items-center justify-center h-full">
                        <div className="text-4xl font-bold text-green-700">
                          {(prediction.success_probability * 100).toFixed(1)}%
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                          Predicted success probability
                        </p>
                      </div>
                    ) : (
                      <p>No prediction available</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {benchmarks && (
                  <Card>
                    <CardHeader>
                      <CardTitle>CSR Benchmark Comparison</CardTitle>
                      <CardDescription>Based on similar published trials</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="text-sm space-y-2">
                        <li>
                          <span className="font-semibold">📊 Sample Size Benchmark:</span>{' '}
                          {benchmarks.avg_sample_size}
                        </li>
                        <li>
                          <span className="font-semibold">📆 Duration Benchmark:</span>{' '}
                          {benchmarks.avg_duration_weeks} weeks
                        </li>
                        <li>
                          <span className="font-semibold">📉 Dropout Benchmark:</span>{' '}
                          {(benchmarks.avg_dropout_rate * 100).toFixed(1)}%
                        </li>
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {recommendations.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Recommended Improvements</CardTitle>
                      <CardDescription>AI-suggested protocol optimizations</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="text-sm text-gray-800 space-y-1">
                        {recommendations.map((r, i) => (
                          <li key={i}>🔁 {r}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>

              {sap && (
                <Card>
                  <CardHeader>
                    <CardTitle>Statistical Analysis Plan</CardTitle>
                    <CardDescription>Auto-generated based on protocol parameters</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-gray-100 p-3 overflow-auto rounded">{sap}</pre>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-3">
                <Button onClick={exportReport} variant="secondary">
                  📄 Export Full Report
                </Button>
                {user && (
                  <Button onClick={saveToDossier} variant="outline">
                    💾 Save to Dossier
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No protocol analysis results yet. Please analyze a protocol first.</p>
              <Button onClick={() => setSelectedTab('editor')} variant="outline" className="mt-4">
                Go to Protocol Editor
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="versions" className="space-y-4">
          {savedVersions.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Saved Protocol Versions</h3>
              <div className="grid gap-3">
                {savedVersions.map((ver, i) => (
                  <Card key={i} className="border-blue-100">
                    <CardHeader className="py-3">
                      <CardTitle className="text-base flex justify-between">
                        <span>Version {ver.version}</span>
                        <Badge variant={ver.version === currentVersion ? 'default' : 'outline'}>
                          {ver.version === currentVersion ? 'Current' : 'Saved'}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardFooter className="py-3 flex justify-between">
                      <span className="text-xs text-muted-foreground">
                        {new Date(ver.created_at).toLocaleString()}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => restoreVersion(ver.version)}
                        disabled={ver.version === currentVersion}
                      >
                        {ver.version === currentVersion ? 'Current Version' : 'Restore Version'}
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No saved versions yet. Analyze a protocol and save it to create versions.</p>
              <Button onClick={() => setSelectedTab('editor')} variant="outline" className="mt-4">
                Go to Protocol Editor
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

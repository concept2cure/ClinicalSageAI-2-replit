import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import { apiRequest } from '@/lib/queryClient';

interface ProtocolData {
  indication: string;
  phase: string;
  sample_size: number;
  duration_weeks: number;
  dropout_rate: number;
  primary_endpoints: string[];
}

interface BenchmarkData {
  avg_sample_size: number;
  min_sample_size: number;
  max_sample_size: number;
  avg_duration: number;
  min_duration: number;
  max_duration: number;
  avg_dropout: number;
  trial_count: number;
  common_endpoints: Array<{ endpoint: string; count: number }>;
  success_rate: number | null;
  total_trials: number;
}

interface ComparisonItem {
  metric: string;
  your_input: string | number;
  csr_median: string | number;
  risk_flag: 'high' | 'medium' | 'low' | 'none';
  message?: string;
}

interface ProtocolBenchmarkPanelProps {
  protocolData: ProtocolData;
  benchmarkData?: BenchmarkData;
  isLoading?: boolean;
}

export default function ProtocolBenchmarkPanel({
  protocolData,
  benchmarkData,
  isLoading = false,
}: ProtocolBenchmarkPanelProps) {
  const [comparisons, setComparisons] = useState<ComparisonItem[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    if (protocolData && benchmarkData) {
      // Create comparison data
      const comparisonItems: ComparisonItem[] = [];

      // Sample size comparison
      const sampleSizeRatio = protocolData.sample_size / benchmarkData.avg_sample_size;
      let sampleSizeRisk: 'high' | 'medium' | 'low' | 'none' = 'none';
      let sampleSizeMessage = '';

      if (sampleSizeRatio < 0.7) {
        sampleSizeRisk = 'high';
        sampleSizeMessage = 'Significantly underpowered';
      } else if (sampleSizeRatio < 0.9) {
        sampleSizeRisk = 'medium';
        sampleSizeMessage = 'Potentially underpowered';
      } else if (sampleSizeRatio > 1.3) {
        sampleSizeRisk = 'low';
        sampleSizeMessage = 'Larger than typical';
      } else {
        sampleSizeRisk = 'none';
        sampleSizeMessage = 'Well aligned with benchmark';
      }

      comparisonItems.push({
        metric: 'Sample Size',
        your_input: protocolData.sample_size,
        csr_median: Math.round(benchmarkData.avg_sample_size),
        risk_flag: sampleSizeRisk,
        message: sampleSizeMessage,
      });

      // Duration comparison
      const durationRatio = protocolData.duration_weeks / benchmarkData.avg_duration;
      let durationRisk: 'high' | 'medium' | 'low' | 'none' = 'none';
      let durationMessage = '';

      if (durationRatio < 0.6) {
        durationRisk = 'medium';
        durationMessage = 'Shorter than typical';
      } else if (durationRatio > 1.4) {
        durationRisk = 'medium';
        durationMessage = 'Longer than typical';
      } else {
        durationRisk = 'none';
        durationMessage = 'Well aligned with benchmark';
      }

      comparisonItems.push({
        metric: 'Duration (weeks)',
        your_input: protocolData.duration_weeks,
        csr_median: Math.round(benchmarkData.avg_duration),
        risk_flag: durationRisk,
        message: durationMessage,
      });

      // Dropout rate comparison
      const dropoutRatio = protocolData.dropout_rate / benchmarkData.avg_dropout;
      let dropoutRisk: 'high' | 'medium' | 'low' | 'none' = 'none';
      let dropoutMessage = '';

      if (dropoutRatio < 0.7) {
        dropoutRisk = 'medium';
        dropoutMessage = 'Optimistic dropout estimate';
      } else if (dropoutRatio > 1.3) {
        dropoutRisk = 'low';
        dropoutMessage = 'Conservative dropout estimate';
      } else {
        dropoutRisk = 'none';
        dropoutMessage = 'Well aligned with benchmark';
      }

      comparisonItems.push({
        metric: 'Dropout Rate',
        your_input: `${(protocolData.dropout_rate * 100).toFixed(1)}%`,
        csr_median: `${(benchmarkData.avg_dropout * 100).toFixed(1)}%`,
        risk_flag: dropoutRisk,
        message: dropoutMessage,
      });

      // Endpoint comparison - only if there are common endpoints
      if (benchmarkData.common_endpoints && benchmarkData.common_endpoints.length > 0) {
        const primaryEndpoint =
          protocolData.primary_endpoints && protocolData.primary_endpoints.length > 0
            ? protocolData.primary_endpoints[0]
            : '';

        if (primaryEndpoint) {
          // Check if endpoint matches any common endpoints
          const matchingEndpoint = benchmarkData.common_endpoints.some(
            e =>
              primaryEndpoint.toLowerCase().includes(e.endpoint.toLowerCase()) ||
              e.endpoint.toLowerCase().includes(primaryEndpoint.toLowerCase())
          );

          comparisonItems.push({
            metric: 'Primary Endpoint',
            your_input: primaryEndpoint,
            csr_median: benchmarkData.common_endpoints[0].endpoint || 'N/A',
            risk_flag: matchingEndpoint ? 'none' : 'medium',
            message: matchingEndpoint ? 'Matches common endpoint' : 'Novel endpoint selection',
          });
        }
      }

      setComparisons(comparisonItems);

      // Create chart data
      setChartData([
        {
          name: 'Your Protocol',
          'Sample Size': protocolData.sample_size,
          'Duration (weeks)': protocolData.duration_weeks,
          'Dropout Rate (%)': protocolData.dropout_rate * 100,
        },
        {
          name: 'CSR Median',
          'Sample Size': Math.round(benchmarkData.avg_sample_size),
          'Duration (weeks)': Math.round(benchmarkData.avg_duration),
          'Dropout Rate (%)': benchmarkData.avg_dropout * 100,
        },
      ]);
    }
  }, [protocolData, benchmarkData]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <div className="flex flex-col items-center gap-2 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading benchmark data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!benchmarkData) {
    return (
      <Card>
        <CardContent className="py-6">
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No benchmark data available</AlertTitle>
            <AlertDescription>
              We couldn't find enough CSR data for this indication and phase to provide meaningful
              benchmarks.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>Protocol Benchmark Comparison</span>
          {benchmarkData?.trial_count && (
            <Badge variant="outline" className="ml-2">
              Based on {benchmarkData.trial_count} CSRs
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Comparing your protocol design parameters against similar trials from CSR database
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Visual comparison chart */}
        <div className="rounded-md border p-4">
          <h4 className="mb-4 text-sm font-medium">Visual Comparison</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <XAxis dataKey="name" />
              <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
              <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="Sample Size" fill="#8884d8" />
              <Bar yAxisId="left" dataKey="Duration (weeks)" fill="#82ca9d" />
              <Bar yAxisId="right" dataKey="Dropout Rate (%)" fill="#ffc658" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Metric comparison table */}
        <div className="rounded-md border">
          <div className="grid grid-cols-4 gap-4 p-4 font-medium text-sm border-b">
            <div>Metric</div>
            <div>Your Input</div>
            <div>CSR Median</div>
            <div>Risk Assessment</div>
          </div>

          <div className="divide-y">
            {comparisons.map((item, index) => (
              <div key={index} className="grid grid-cols-4 gap-4 p-4 text-sm items-center">
                <div className="font-medium">{item.metric}</div>
                <div>{item.your_input}</div>
                <div>{item.csr_median}</div>
                <div>
                  {item.risk_flag === 'high' && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      High Risk
                    </Badge>
                  )}
                  {item.risk_flag === 'medium' && (
                    <Badge variant="warning" className="gap-1 bg-amber-500">
                      <AlertTriangle className="h-3 w-3" />
                      Caution
                    </Badge>
                  )}
                  {item.risk_flag === 'low' && (
                    <Badge variant="outline" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Minor Risk
                    </Badge>
                  )}
                  {item.risk_flag === 'none' && (
                    <Badge variant="success" className="gap-1 bg-green-500">
                      <CheckCircle className="h-3 w-3" />
                      Aligned
                    </Badge>
                  )}
                  {item.message && (
                    <p className="text-xs text-muted-foreground mt-1">{item.message}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Success rate information */}
        {benchmarkData.success_rate !== null && (
          <div className="rounded-md border p-4">
            <h4 className="mb-2 text-sm font-medium">Historical Success Rate</h4>
            <p className="text-sm">
              Similar trials for this indication and phase have a
              <span className="font-medium mx-1">
                {Math.round(benchmarkData.success_rate * 100)}%
              </span>
              historical success rate based on
              <span className="font-medium mx-1">{benchmarkData.total_trials}</span>
              trials in our CSR database.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

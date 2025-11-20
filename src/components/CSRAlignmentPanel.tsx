import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Scale as ScaleIcon,
  AlertTriangle as AlertTriangleIcon,
  CheckCircle as CheckCircleIcon,
  XCircle as XCircleIcon,
} from 'lucide-react';

// Define interfaces for the component props and state
interface ProtocolData {
  primary_endpoint?: string;
  population?: string;
  sample_size?: string | number;
  dosing?: string;
}

interface CSRContext {
  id?: string | number;
  title?: string;
  indication?: string;
  primary_endpoint?: string;
  population?: string;
  sample_size?: string | number;
  dosing?: string;
}

interface AlignmentDetail {
  category: string;
  score: number;
  weight: number;
  status: 'success' | 'warning' | 'error';
  description: string;
}

interface ComparisonResult {
  score: number;
  reason: string;
}

interface CSRAlignmentPanelProps {
  protocolData?: ProtocolData;
  csrContext?: CSRContext;
}

/**
 * CSRAlignmentPanel component displays protocol alignment with CSR precedents
 * - Shows overall alignment score
 * - Shows key precedent comparisons for endpoints, sample size, etc.
 * - Highlights potential issues with visual indicators
 */
const CSRAlignmentPanel: React.FC<CSRAlignmentPanelProps> = ({ protocolData, csrContext }) => {
  const [alignmentScore, setAlignmentScore] = useState<number>(0);
  const [alignmentDetails, setAlignmentDetails] = useState<AlignmentDetail[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Only calculate if we have both protocol data and CSR context
    if (protocolData && csrContext) {
      calculateAlignmentScore();
    } else {
      setLoading(false);
    }
  }, [protocolData, csrContext]);

  const calculateAlignmentScore = (): void => {
    if (!csrContext || !protocolData) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Generate a weighted score based on key protocol fields matching CSR precedent
    const details: AlignmentDetail[] = [];
    let totalWeight = 0;
    let weightedScore = 0;

    // Check primary endpoint alignment (high importance)
    const endpointWeight = 35;
    totalWeight += endpointWeight;
    const endpointMatch = compareEndpoints(
      protocolData.primary_endpoint,
      csrContext.primary_endpoint
    );
    weightedScore += endpointMatch.score * endpointWeight;
    details.push({
      category: 'Primary Endpoint',
      score: endpointMatch.score,
      weight: endpointWeight,
      status: getStatusFromScore(endpointMatch.score),
      description: endpointMatch.reason,
    });

    // Check population alignment (high importance)
    const populationWeight = 25;
    totalWeight += populationWeight;
    const populationMatch = comparePopulation(protocolData.population, csrContext.population);
    weightedScore += populationMatch.score * populationWeight;
    details.push({
      category: 'Population',
      score: populationMatch.score,
      weight: populationWeight,
      status: getStatusFromScore(populationMatch.score),
      description: populationMatch.reason,
    });

    // Check sample size alignment (medium importance)
    const sampleSizeWeight = 20;
    totalWeight += sampleSizeWeight;
    const sampleSizeMatch = compareSampleSize(
      parseInt(protocolData.sample_size?.toString() || '0'),
      parseInt(csrContext.sample_size?.toString() || '0')
    );
    weightedScore += sampleSizeMatch.score * sampleSizeWeight;
    details.push({
      category: 'Sample Size',
      score: sampleSizeMatch.score,
      weight: sampleSizeWeight,
      status: getStatusFromScore(sampleSizeMatch.score),
      description: sampleSizeMatch.reason,
    });

    // Check dosing regimen alignment (medium importance)
    const dosingWeight = 20;
    totalWeight += dosingWeight;
    const dosingMatch = compareDosing(protocolData.dosing, csrContext.dosing);
    weightedScore += dosingMatch.score * dosingWeight;
    details.push({
      category: 'Dosing Regimen',
      score: dosingMatch.score,
      weight: dosingWeight,
      status: getStatusFromScore(dosingMatch.score),
      description: dosingMatch.reason,
    });

    // Calculate final weighted score as percentage
    const finalScore = totalWeight > 0 ? (weightedScore / totalWeight) * 100 : 0;

    setAlignmentScore(Math.round(finalScore));
    setAlignmentDetails(details);
    setLoading(false);
  };

  const compareEndpoints = (protocolEndpoint?: string, csrEndpoint?: string): ComparisonResult => {
    if (!protocolEndpoint || !csrEndpoint) {
      return { score: 0.5, reason: 'Insufficient data to compare endpoints' };
    }

    // Simple string matching - in a real implementation we would use semantic matching
    const protocolLower = protocolEndpoint.toLowerCase();
    const csrLower = csrEndpoint.toLowerCase();

    if (protocolLower === csrLower) {
      return { score: 1.0, reason: 'Endpoints match exactly - strong alignment with precedent' };
    } else if (protocolLower.includes(csrLower) || csrLower.includes(protocolLower)) {
      return { score: 0.8, reason: 'Endpoints are similar - good alignment with precedent' };
    } else {
      // Check for key terms that might indicate similar endpoints
      const keyTerms = ['response', 'survival', 'progression', 'remission', 'improvement'];
      let sharedTerms = 0;

      keyTerms.forEach(term => {
        if (protocolLower.includes(term) && csrLower.includes(term)) {
          sharedTerms++;
        }
      });

      if (sharedTerms > 0) {
        return {
          score: 0.5 + sharedTerms * 0.1,
          reason: 'Endpoints share some key concepts - partial alignment with precedent',
        };
      }

      return { score: 0.3, reason: 'Endpoints differ significantly from successful precedent' };
    }
  };

  const comparePopulation = (protocolPop?: string, csrPop?: string): ComparisonResult => {
    if (!protocolPop || !csrPop) {
      return { score: 0.5, reason: 'Insufficient data to compare population criteria' };
    }

    // Simple string matching - in a real implementation we would use semantic matching
    const protocolLower = protocolPop.toLowerCase();
    const csrLower = csrPop.toLowerCase();

    if (protocolLower === csrLower) {
      return { score: 1.0, reason: 'Population criteria match exactly with precedent' };
    } else if (protocolLower.includes(csrLower) || csrLower.includes(protocolLower)) {
      return { score: 0.8, reason: 'Population criteria are similar to precedent' };
    } else {
      // Check for key population terms
      const keyTerms = ['age', 'adult', 'pediatric', 'gender', 'naive', 'refractory', 'stage'];
      let sharedTerms = 0;

      keyTerms.forEach(term => {
        if (protocolLower.includes(term) && csrLower.includes(term)) {
          sharedTerms++;
        }
      });

      if (sharedTerms > 0) {
        return {
          score: 0.5 + sharedTerms * 0.1,
          reason: 'Population shares some characteristics with precedent',
        };
      }

      return { score: 0.3, reason: 'Population differs significantly from precedent' };
    }
  };

  const compareSampleSize = (protocolSize: number, csrSize: number): ComparisonResult => {
    if (!protocolSize || !csrSize) {
      return { score: 0.5, reason: 'Insufficient data to compare sample sizes' };
    }

    // Calculate the ratio between the two sample sizes
    const ratio = protocolSize / csrSize;

    if (ratio >= 0.9 && ratio <= 1.1) {
      return { score: 1.0, reason: 'Sample size closely matches successful precedent' };
    } else if (ratio >= 0.8 && ratio <= 1.2) {
      return { score: 0.8, reason: 'Sample size is within 20% of successful precedent' };
    } else if (ratio >= 0.5 && ratio <= 1.5) {
      return { score: 0.6, reason: 'Sample size differs moderately from precedent' };
    } else if (ratio < 0.5) {
      return { score: 0.3, reason: 'Sample size may be underpowered compared to precedent' };
    } else {
      return { score: 0.4, reason: 'Sample size is substantially larger than precedent' };
    }
  };

  const compareDosing = (protocolDosing?: string, csrDosing?: string): ComparisonResult => {
    if (!protocolDosing || !csrDosing) {
      return { score: 0.5, reason: 'Insufficient data to compare dosing regimens' };
    }

    // Simple string matching - in a real implementation we would use semantic matching
    const protocolLower = protocolDosing.toLowerCase();
    const csrLower = csrDosing.toLowerCase();

    if (protocolLower === csrLower) {
      return { score: 1.0, reason: 'Dosing regimen matches exactly with precedent' };
    } else if (protocolLower.includes(csrLower) || csrLower.includes(protocolLower)) {
      return { score: 0.8, reason: 'Dosing regimen is similar to precedent' };
    } else {
      // Check for common dosing terms
      const keyTerms = ['mg', 'daily', 'weekly', 'bid', 'tid', 'qd', 'qw', 'dose'];
      let sharedTerms = 0;

      keyTerms.forEach(term => {
        if (protocolLower.includes(term) && csrLower.includes(term)) {
          sharedTerms++;
        }
      });

      if (sharedTerms > 0) {
        return {
          score: 0.4 + sharedTerms * 0.1,
          reason: 'Dosing shares some characteristics with precedent',
        };
      }

      return { score: 0.3, reason: 'Dosing differs significantly from precedent' };
    }
  };

  const getStatusFromScore = (score: number): 'success' | 'warning' | 'error' => {
    if (score >= 0.8) return 'success';
    if (score >= 0.5) return 'warning';
    return 'error';
  };

  const getStatusIcon = (status: 'success' | 'warning' | 'error'): React.ReactNode => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'warning':
        return <AlertTriangleIcon className="w-4 h-4 text-amber-500" />;
      case 'error':
        return <XCircleIcon className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getAlignmentLevel = (score: number): { level: string; color: string } => {
    if (score >= 80) return { level: 'High', color: 'bg-green-500' };
    if (score >= 60) return { level: 'Moderate', color: 'bg-amber-500' };
    return { level: 'Low', color: 'bg-red-500' };
  };

  const alignment = getAlignmentLevel(alignmentScore);

  return (
    <Card className="shadow-md">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ScaleIcon className="h-5 w-5 text-blue-600" />
              CSR Precedent Alignment
            </CardTitle>
            <CardDescription>
              Comparison with successful CSR precedents for{' '}
              {csrContext?.indication || 'this indication'}
            </CardDescription>
          </div>
          <Badge className={`${alignment.color} text-white`}>{alignment.level} Alignment</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-col items-center py-4">
            <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-2 text-sm text-gray-500">Calculating alignment score...</p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">Overall Alignment</span>
                <span className="text-sm font-medium">{alignmentScore}%</span>
              </div>
              <Progress value={alignmentScore} className="h-2" />
            </div>

            <Separator className="my-4" />

            <div className="space-y-3">
              {alignmentDetails.map((detail, index) => (
                <div key={index} className="flex items-start justify-between">
                  <div className="flex items-start gap-2 grow">
                    {getStatusIcon(detail.status)}
                    <div>
                      <p className="font-medium text-sm">{detail.category}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {detail.description}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-medium">Weight: {detail.weight}%</span>
                  </div>
                </div>
              ))}
            </div>

            {csrContext && (
              <>
                <Separator className="my-4" />
                <div className="text-sm mt-2">
                  <p className="text-muted-foreground">
                    Based on CSR precedent:{' '}
                    <span className="font-medium">{csrContext.title || 'Unnamed CSR'}</span>
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default CSRAlignmentPanel;

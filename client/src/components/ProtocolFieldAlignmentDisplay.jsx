import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Component to display semantic alignment between protocol fields and CSR patterns
 */
export default function ProtocolFieldAlignmentDisplay({ alignmentData }) {
  if (!alignmentData) {
    return (
      <Card className="border-dashed border-muted-foreground/50">
        <CardContent className="p-6 text-center text-muted-foreground">
          <Info className="h-8 w-8 mx-auto mb-2" />
          <p>No alignment data available yet.</p>
          <p className="text-sm mt-2">
            Save your protocol to generate semantic alignment analysis.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { alignment_score, matched_fields, risk_flags, recommended_adjustments } = alignmentData;

  // Helper function to get color based on score
  const getScoreColor = score => {
    if (score >= 0.8) return 'text-green-500';
    if (score >= 0.6) return 'text-amber-500';
    return 'text-red-500';
  };

  // Helper function to get badge variant based on score
  const getScoreBadgeVariant = score => {
    if (score >= 0.8) return 'success';
    if (score >= 0.6) return 'warning';
    return 'destructive';
  };

  // Helper function to get progress bar color based on score
  const getProgressColor = score => {
    if (score >= 0.8) return 'bg-green-500';
    if (score >= 0.6) return 'bg-amber-500';
    return 'bg-red-500';
  };

  // Helper function to determine icon for a field
  const getFieldIcon = similarity => {
    if (similarity >= 0.8) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (similarity >= 0.5) return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    return <AlertCircle className="h-4 w-4 text-red-500" />;
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        {/* Overall alignment score */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium">Protocol Alignment</h3>
            <p className="text-sm text-muted-foreground">
              Semantic match to historical CSR patterns
            </p>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${getScoreColor(alignment_score)}`}>
              {(alignment_score * 100).toFixed(0)}%
            </div>
            <Badge variant={getScoreBadgeVariant(alignment_score)}>
              {alignment_score >= 0.8
                ? 'High Match'
                : alignment_score >= 0.6
                  ? 'Moderate Match'
                  : 'Low Match'}
            </Badge>
          </div>
        </div>

        {/* Visual progress bar */}
        <div className="mb-6">
          <Progress
            value={alignment_score * 100}
            className="h-2"
            indicatorClassName={getProgressColor(alignment_score)}
          />
        </div>

        {/* Field-by-field alignment */}
        <div className="mb-6">
          <h4 className="text-sm font-medium mb-3">Field-Level Alignment</h4>
          <div className="space-y-3">
            {matched_fields.map((field, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getFieldIcon(field.similarity)}
                  <div>
                    <div className="font-medium capitalize">{field.field.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              <span className="underline underline-offset-2 decoration-dotted">
                                Protocol:{' '}
                                {typeof field.protocol === 'string'
                                  ? field.protocol
                                  : JSON.stringify(field.protocol)}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              From your protocol:{' '}
                              {typeof field.protocol === 'string'
                                ? field.protocol
                                : JSON.stringify(field.protocol)}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              <span className="underline underline-offset-2 decoration-dotted">
                                CSR pattern:{' '}
                                {typeof field.csr === 'string'
                                  ? field.csr
                                  : JSON.stringify(field.csr)}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              From reference CSR:{' '}
                              {typeof field.csr === 'string'
                                ? field.csr
                                : JSON.stringify(field.csr)}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>
                <div>
                  <Badge variant={getScoreBadgeVariant(field.similarity)}>
                    {(field.similarity * 100).toFixed(0)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {risk_flags && risk_flags.length > 0 && (
          <>
            <Separator className="my-4" />

            {/* Risk flags */}
            <div className="mb-6">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                Risk Flags
              </h4>
              <ul className="space-y-2 text-sm">
                {risk_flags.map((risk, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {recommended_adjustments && recommended_adjustments.length > 0 && (
          <>
            <Separator className="my-4" />

            {/* Recommendations */}
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Recommended Adjustments
              </h4>
              <ul className="space-y-2 text-sm">
                {recommended_adjustments.map((recommendation, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <span>{recommendation}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

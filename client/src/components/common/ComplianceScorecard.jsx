import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react'

export default function ComplianceScorecard({ score, validationResults, region, onRegionChange }) {
  const getScoreColor = score => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBadgeVariant = score => {
    if (score >= 90) return 'default';
    if (score >= 70) return 'secondary';
    return 'destructive';
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Compliance Score
            <Badge variant={getScoreBadgeVariant(score)} className="text-lg px-3 py-1">
              {score}%
            </Badge>
          </CardTitle>
          <CardDescription>
            Regulatory compliance assessment for {region.toUpperCase()} submission
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={score} className="w-full mb-4" />
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">
                {validationResults?.filter(r => r.type === 'passed')?.length || 0}
              </div>
              <div className="text-sm text-gray-600">Passed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">
                {validationResults?.filter(r => r.type === 'warning')?.length || 0}
              </div>
              <div className="text-sm text-gray-600">Warnings</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">
                {validationResults?.filter(r => r.type === 'error')?.length || 0}
              </div>
              <div className="text-sm text-gray-600">Errors</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {validationResults && validationResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Validation Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-auto">
              {validationResults.map((result, index) => (
                <div key={index} className="flex items-start space-x-3 p-2 border rounded">
                  {result.type === 'passed' && (
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                  )}
                  {result.type === 'warning' && (
                    <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                  )}
                  {result.type === 'error' && <XCircle className="h-4 w-4 text-red-600 mt-0.5" />}
                  <div className="flex-1">
                    <div className="text-sm font-medium">{result.title}</div>
                    <div className="text-xs text-gray-600">{result.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

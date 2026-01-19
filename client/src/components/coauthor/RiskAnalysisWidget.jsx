import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Shield, PieChart } from 'lucide-react'
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { fetchSectionGuidance } from '@/api/coauthor';

// Default risk assessment for sections without specific data
const defaultRiskData = {
  overallRisk: 'low',
  score: 85,
  findings: [
    {
      level: 'low',
      text: 'Standard formatting should be reviewed for consistency.',
      impact: 'Minimal impact on review.',
      recommendation: 'Perform final formatting check before submission.',
    },
  ],
};

export default function RiskAnalysisWidget({ sectionId }) {
  const [riskData, setRiskData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetchSectionGuidance(sectionId)
      .then(data => {
        if (!isMounted) return;
        const rules = Array.isArray(data?.rules) ? data.rules : [];

        if (!rules.length) {
          setRiskData(defaultRiskData);
          return;
        }

        const severityWeight = {
          critical: { level: 'high', score: 20 },
          major: { level: 'medium', score: 10 },
          minor: { level: 'low', score: 5 },
          informational: { level: 'low', score: 2 },
        };

        const deductions = rules.reduce((total, rule) => {
          const weight = severityWeight[rule.severity]?.score ?? 3;
          return total + weight;
        }, 0);

        const score = Math.max(0, Math.min(100, 95 - deductions));
        const overallRisk = rules.some(r => r.severity === 'critical')
          ? 'high'
          : rules.some(r => r.severity === 'major')
            ? 'medium'
            : 'low';

        const findings = rules.slice(0, 4).map(rule => {
          const level = severityWeight[rule.severity]?.level || 'low';
          return {
            level,
            text: rule.description || rule.name || 'Potential compliance issue detected.',
            impact: rule.category || 'Regulatory review impact unknown.',
            recommendation: rule.remediation || 'Review this section against regulatory guidance.',
          };
        });

        setRiskData({ overallRisk, score, findings });
      })
      .catch(() => {
        if (!isMounted) return;
        setRiskData(defaultRiskData);
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [sectionId]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Risk Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center">
          <PieChart className="h-4 w-4 mr-2" />
          Regulatory Risk Analysis
        </CardTitle>
        <CardDescription>AI-powered risk assessment for Section {sectionId}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <div className="text-sm font-medium">Overall Risk Level</div>
            <Badge
              variant={
                riskData.overallRisk === 'high'
                  ? 'destructive'
                  : riskData.overallRisk === 'medium'
                    ? 'warning'
                    : 'success'
              }
            >
              {riskData.overallRisk === 'high'
                ? 'High Risk'
                : riskData.overallRisk === 'medium'
                  ? 'Medium Risk'
                  : 'Low Risk'}
            </Badge>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-sm font-medium">Compliance Score</span>
            <span
              className={`text-lg font-bold ${
                riskData.score < 50
                  ? 'text-red-500'
                  : riskData.score < 75
                    ? 'text-amber-500'
                    : 'text-green-600'
              }`}
            >
              {riskData.score}/100
            </span>
          </div>
        </div>

        <Progress
          value={riskData.score}
          className={`h-2 ${
            riskData.score < 50
              ? 'bg-red-100'
              : riskData.score < 75
                ? 'bg-amber-100'
                : 'bg-green-100'
          }`}
        />

        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="flex w-full justify-between p-0">
              <span className="text-sm font-medium">
                Risk Findings ({riskData.findings.length})
              </span>
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 mt-2">
            {riskData.findings.map((finding, index) => (
              <div key={index} className="border rounded-md p-3 text-sm">
                <div className="flex items-start space-x-2">
                  {finding.level === 'high' ? (
                    <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                  ) : finding.level === 'medium' ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="space-y-1">
                    <p className="font-medium">{finding.text}</p>
                    <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground">
                      <div>
                        <span className="font-semibold">Impact:</span> {finding.impact}
                      </div>
                      <div>
                        <span className="font-semibold">Recommendation:</span>{' '}
                        {finding.recommendation}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>

        <div className="pt-1 flex justify-end">
          <Button variant="outline" size="sm" className="text-xs h-7">
            <Shield className="h-3 w-3 mr-1" />
            Run Full Analysis
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

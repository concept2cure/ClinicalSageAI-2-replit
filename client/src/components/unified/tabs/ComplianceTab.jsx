import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ComplianceTab({ regulatoryData }) {
  return (
    <div className="space-y-6 mt-0">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Readiness Score Card */}
        <Card className="rounded-2xl border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-500" />
              Submission Readiness
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center">
              <div className="text-5xl font-bold text-green-600" data-testid="text-readiness-score">
                {regulatoryData?.readinessScore || 0}%
              </div>
              <Progress
                value={regulatoryData?.readinessScore || 0}
                className="mt-4 h-3"
              />
              <p className="text-sm text-muted-foreground mt-4 text-center">
                Your submission is{' '}
                {regulatoryData?.readinessScore >= 80 ? 'on track' : 'needs attention'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Risk Assessment */}
        <Card className="rounded-2xl border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Risk Assessment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Overall Risk</span>
                <Badge
                  variant={
                    regulatoryData?.riskLevel === 'High'
                      ? 'destructive'
                      : regulatoryData?.riskLevel === 'Medium'
                      ? 'warning'
                      : 'success'
                  }
                >
                  {regulatoryData?.riskLevel || 'Medium'}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Delay Risk</span>
                <span className="font-semibold text-orange-600">
                  {regulatoryData?.delayDays || 0} days
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Financial Impact</span>
                <span className="font-semibold">
                  ${((regulatoryData?.financialImpact || 0) / 1000000).toFixed(1)}M
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ICH Compliance */}
        <Card className="rounded-2xl border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-blue-500" />
              ICH E6(R3) Compliance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Data Integrity</span>
                <Progress value={95} className="w-24 h-2" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Risk-Based QMS</span>
                <Progress value={88} className="w-24 h-2" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Protocol Adherence</span>
                <Progress value={92} className="w-24 h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compliance Gaps */}
      {regulatoryData?.gaps?.length > 0 && (
        <Card className="rounded-2xl border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Regulatory Gaps Identified
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {regulatoryData.gaps.map((gap, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/20"
                  data-testid={`gap-item-${idx}`}
                >
                  <AlertTriangle
                    className={`h-5 w-5 mt-0.5 ${
                      gap.impact === 'high'
                        ? 'text-red-500'
                        : gap.impact === 'medium'
                        ? 'text-orange-500'
                        : 'text-yellow-500'
                    }`}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{gap.section}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Impact: {gap.impact} | Status: {gap.status}
                    </p>
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

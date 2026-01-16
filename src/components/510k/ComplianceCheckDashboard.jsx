import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Shield,
  ClipboardCheck,
  Download,
  RefreshCw,
  Info,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export default function ComplianceCheckDashboard({ deviceProfile, onComplianceUpdate }) {
  const { toast } = useToast();
  const [complianceData, setComplianceData] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [expandedSections, setExpandedSections] = useState(['essential']);

  useEffect(() => {
    if (deviceProfile && !complianceData) {
      runComplianceCheck();
    }
  }, [deviceProfile]);

  const runComplianceCheck = async () => {
    setIsChecking(true);
    try {
      const response = await fetch('/api/510k/compliance-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceProfile }),
      });

      if (!response.ok) throw new Error('Compliance check failed');

      const result = await response.json();
      setComplianceData(result);

      if (onComplianceUpdate) {
        onComplianceUpdate(result);
      }

      toast({
        title: 'Compliance Check Complete',
        description: `${result.overallScore}% compliant`,
      });
    } catch (error) {
      toast({
        title: 'Compliance Check Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsChecking(false);
    }
  };

  const getComplianceLevel = (score) => {
    if (score >= 90) return { label: 'Fully Compliant', color: 'bg-green-500', variant: 'default' };
    if (score >= 70) return { label: 'Mostly Compliant', color: 'bg-yellow-500', variant: 'secondary' };
    return { label: 'Non-Compliant', color: 'bg-red-500', variant: 'destructive' };
  };

  const renderRequirementItem = (requirement, onCheck) => {
    const getIcon = () => {
      if (requirement.status === 'compliant') return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      if (requirement.status === 'partial') return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      return <XCircle className="w-5 h-5 text-red-600" />;
    };

    const getBgColor = () => {
      if (requirement.status === 'compliant') return 'bg-green-50 border-green-200';
      if (requirement.status === 'partial') return 'bg-yellow-50 border-yellow-200';
      return 'bg-red-50 border-red-200';
    };

    return (
      <div className={`p-4 border rounded-lg ${getBgColor()}`}>
        <div className="flex items-start gap-3">
          {getIcon()}
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-semibold text-sm">{requirement.title}</h4>
                <p className="text-sm text-gray-700 mt-1">{requirement.description}</p>
              </div>
              {requirement.reference && (
                <Button variant="ghost" size="sm" className="text-blue-600">
                  <ExternalLink className="w-4 h-4" />
                </Button>
              )}
            </div>

            {requirement.evidence && (
              <div className="mt-3 p-2 bg-white rounded text-xs">
                <strong>Evidence:</strong> {requirement.evidence}
              </div>
            )}

            {requirement.actions && requirement.actions.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-gray-700">Required Actions:</p>
                {requirement.actions.map((action, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs">
                    <Checkbox
                      checked={action.completed}
                      onCheckedChange={() => onCheck && onCheck(requirement.id, idx)}
                    />
                    <span className={action.completed ? 'line-through text-gray-500' : ''}>
                      {action.text}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {requirement.reference && (
              <div className="mt-2 text-xs text-gray-600">
                <strong>Reference:</strong> {requirement.reference}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (isChecking) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Shield className="w-12 h-12 text-blue-500 animate-pulse mb-4" />
          <h3 className="text-lg font-semibold mb-2">Running Compliance Check</h3>
          <p className="text-sm text-gray-600">Analyzing regulatory requirements...</p>
        </CardContent>
      </Card>
    );
  }

  if (!complianceData) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <ClipboardCheck className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-gray-600">Provide device profile to run compliance check</p>
        </CardContent>
      </Card>
    );
  }

  const {
    overallScore = 0,
    categories = {},
    criticalIssues = [],
    warnings = [],
    recommendations = [],
  } = complianceData;

  const complianceLevel = getComplianceLevel(overallScore);

  return (
    <div className="space-y-6">
      {/* Overall Compliance Score */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>510(k) Compliance Assessment</CardTitle>
              <CardDescription>Regulatory requirements compliance status</CardDescription>
            </div>
            <Badge className={complianceLevel.color}>{complianceLevel.label}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Overall Compliance</span>
                <span className="text-2xl font-bold">{overallScore}%</span>
              </div>
              <Progress value={overallScore} className="h-3" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              {Object.entries(categories).map(([key, data]) => (
                <div key={key} className="text-center p-4 border rounded-lg">
                  <div className="text-lg font-bold">{data.score}%</div>
                  <div className="text-sm text-gray-600 capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <Progress value={data.score} className="h-2 mt-2" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Critical Issues */}
      {criticalIssues.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Critical Issues Found</AlertTitle>
          <AlertDescription>
            <div className="mt-2 space-y-2">
              {criticalIssues.map((issue, idx) => (
                <div key={idx} className="text-sm">
                  • {issue}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Warnings</AlertTitle>
          <AlertDescription>
            <div className="mt-2 space-y-2">
              {warnings.map((warning, idx) => (
                <div key={idx} className="text-sm">
                  • {warning}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Detailed Compliance by Category */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Compliance Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" value={expandedSections} onValueChange={setExpandedSections}>
            <AccordionItem value="essential">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Essential Elements (21 CFR 807.87)
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  {categories.essential?.requirements?.map((req, idx) => (
                    <div key={idx}>{renderRequirementItem(req)}</div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="labeling">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Labeling Requirements (21 CFR 801)
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  {categories.labeling?.requirements?.map((req, idx) => (
                    <div key={idx}>{renderRequirementItem(req)}</div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="performance">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5" />
                  Performance Testing
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  {categories.performance?.requirements?.map((req, idx) => (
                    <div key={idx}>{renderRequirementItem(req)}</div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="biocompatibility">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Biocompatibility (ISO 10993)
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  {categories.biocompatibility?.requirements?.map((req, idx) => (
                    <div key={idx}>{renderRequirementItem(req)}</div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="sterilization">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Sterilization & Shelf Life
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  {categories.sterilization?.requirements?.map((req, idx) => (
                    <div key={idx}>{renderRequirementItem(req)}</div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recommendations.map((rec, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center flex-shrink-0 font-semibold text-sm">
                    {idx + 1}
                  </div>
                  <p className="text-sm">{rec}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={() => window.print()}>
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
        <Button onClick={runComplianceCheck}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Re-run Check
        </Button>
      </div>
    </div>
  );
}

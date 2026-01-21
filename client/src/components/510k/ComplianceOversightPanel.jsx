import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  AlertTriangle, 
  CheckCircle, 
  AlertCircle, 
  Info, 
  Shield,
  Clock,
  GitBranch,
  FileText,
  Search,
  TrendingUp,
  Activity
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * FDA 510(k) Compliance Oversight Panel
 * Provides real-time compliance feedback, audit trails, and AI suggestions
 */
export function ComplianceOversightPanel({ projectId, currentData, stage, section }) {
  const [activeTab, setActiveTab] = useState('compliance');
  const [expandedIssue, setExpandedIssue] = useState(null);
  
  // Fetch compliance report
  const { data: complianceReport } = useQuery({
    queryKey: ['/api/510k-workflow', projectId, 'compliance-report'],
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: !!projectId
  });
  
  // Fetch audit trail
  const { data: auditTrail } = useQuery({
    queryKey: ['/api/510k-workflow', projectId, 'audit-trail'],
    enabled: !!projectId && activeTab === 'audit'
  });
  
  // Fetch version history
  const { data: versionHistory } = useQuery({
    queryKey: ['/api/510k-workflow', projectId, 'versions'],
    enabled: !!projectId && activeTab === 'versions'
  });
  
  // Fetch data lineage
  const { data: dataLineage } = useQuery({
    queryKey: ['/api/510k-workflow', projectId, 'data-lineage'],
    enabled: !!projectId && activeTab === 'lineage'
  });
  
  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'major':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'minor':
        return <Info className="h-4 w-4 text-yellow-500" />;
      case 'suggestion':
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
      default:
        return null;
    }
  };
  
  const getSeverityBadgeVariant = (severity) => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'major':
        return 'warning';
      case 'minor':
        return 'secondary';
      case 'suggestion':
        return 'default';
      default:
        return 'outline';
    }
  };
  
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const localRtaIssues = useMemo(() => {
    if (!currentData) return [];

    const issues = [];
    const addIssue = (field, issue, severity, suggestedFix, fdaRequirement) => {
      issues.push({
        field,
        issue,
        severity,
        suggestedFix,
        fdaRequirement: fdaRequirement || 'FDA Refuse-to-Accept (RTA) Checklist'
      });
    };

    if (!currentData.applicantName) {
      addIssue(
        'Applicant Name',
        'Applicant name is missing on administrative forms.',
        'critical',
        'Enter the legal applicant name in Setup → Company Information.'
      );
    }

    if (!currentData.contactName || !currentData.contactEmail) {
      addIssue(
        'Contact Information',
        'Primary contact name and email are required.',
        'critical',
        'Provide contact name and email to complete FDA 3514.'
      );
    }

    if (!currentData.deviceName || !currentData.productCode) {
      addIssue(
        'Device Identification',
        'Device name and product code are required for 510(k) submission.',
        'critical',
        'Complete device identification in the intake section.'
      );
    }

    if (!currentData.intendedUse || !currentData.indicationsForUse) {
      addIssue(
        'Intended Use',
        'Intended use and indications for use are required.',
        'major',
        'Provide intended use and indications statements.'
      );
    }

    if (!currentData.summaryChoice) {
      addIssue(
        '510(k) Summary/Statement',
        'Summary type selection is required.',
        'major',
        'Select 510(k) Summary or Statement in intake.'
      );
    }

    if (!currentData.truthfulAccurate) {
      addIssue(
        'Truthful & Accurate Statement',
        'Attestation is required prior to submission.',
        'major',
        'Check the Truthful and Accurate attestation.'
      );
    }

    if (currentData.hasClinicalData && currentData.clinicalDataUsed && !currentData.clinicalDataSummary) {
      addIssue(
        'Clinical Data Summary',
        'Clinical data summary is missing for FDA 3674.',
        'major',
        'Provide a clinical data summary in intake.'
      );
    }

    if (currentData.hasSoftware && !currentData.softwareLevel) {
      addIssue(
        'Software Level of Concern',
        'Software level of concern is required for software devices.',
        'major',
        'Select software level of concern in intake.'
      );
    }

    if (currentData.isSterile && !currentData.sterilizationMethod) {
      addIssue(
        'Sterilization Method',
        'Sterilization method is required for sterile devices.',
        'major',
        'Provide sterilization method and SAL details.'
      );
    }

    if (currentData.hasPatientContacting && !currentData.iso10993Mapping) {
      addIssue(
        'Biocompatibility Planning',
        'ISO 10993 endpoint mapping is missing.',
        'major',
        'Map ISO 10993 endpoints for patient contact.'
      );
    }

    if (!currentData.rxUse && !currentData.otcUse) {
      addIssue(
        'Rx/OTC Use',
        'Rx/OTC use designation is missing.',
        'minor',
        'Select Rx and/or OTC use in intake.'
      );
    }

    if (!currentData.environmentOfUse || !currentData.patientPopulation) {
      addIssue(
        'Use Environment',
        'Environment of use and patient population are incomplete.',
        'minor',
        'Complete environment of use and patient population fields.'
      );
    }

    return issues;
  }, [currentData]);
  
  // Calculate compliance score
  const combinedIssues = [
    ...localRtaIssues,
    ...(complianceReport?.report?.complianceIssues || [])
  ];
  const localIssueCounts = combinedIssues.reduce(
    (acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] || 0) + 1;
      return acc;
    },
    { critical: 0, major: 0, minor: 0, suggestion: 0 }
  );
  const fallbackScore = Math.max(0, 100 - combinedIssues.length * 8);
  const complianceScore = complianceReport?.report?.complianceScore ?? fallbackScore;
  const scoreColor = complianceScore >= 80 ? 'text-green-500' : 
                     complianceScore >= 60 ? 'text-yellow-500' : 'text-red-500';
  
  return (
    <Card className="w-full h-full border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            FDA Compliance Oversight
          </CardTitle>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-gray-500">Compliance Score</div>
              <div className={`text-2xl font-bold ${scoreColor}`}>
                {complianceScore}%
              </div>
            </div>
            {complianceReport?.report?.auditTrailComplete && (
              <Badge variant="success" className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Audit Complete
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="compliance" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Compliance
            </TabsTrigger>
            <TabsTrigger value="audit" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              Audit Trail
            </TabsTrigger>
            <TabsTrigger value="versions" className="text-xs">
              <GitBranch className="h-3 w-3 mr-1" />
              Versions
            </TabsTrigger>
            <TabsTrigger value="lineage" className="text-xs">
              <Activity className="h-3 w-3 mr-1" />
              Lineage
            </TabsTrigger>
          </TabsList>
          
          {/* Compliance Issues Tab */}
          <TabsContent value="compliance" className="mt-4">
            <ScrollArea className="h-[400px] w-full">
              {combinedIssues.length > 0 ? (
                <div className="space-y-3">
                  {combinedIssues.map((issue, index) => (
                    <Alert
                      key={index}
                      className={`cursor-pointer transition-all ${
                        expandedIssue === index ? 'border-blue-500' : ''
                      }`}
                      onClick={() => setExpandedIssue(expandedIssue === index ? null : index)}
                    >
                      <div className="flex items-start gap-2">
                        {getSeverityIcon(issue.severity)}
                        <div className="flex-1">
                          <AlertTitle className="flex items-center justify-between">
                            <span className="text-sm font-medium">{issue.field}</span>
                            <Badge variant={getSeverityBadgeVariant(issue.severity)} className="text-xs">
                              {issue.severity}
                            </Badge>
                          </AlertTitle>
                          <AlertDescription className="mt-1">
                            <div className="text-sm text-gray-600">{issue.issue}</div>
                            {expandedIssue === index && (
                              <div className="mt-3 space-y-2 border-t pt-2">
                                <div>
                                  <span className="font-medium text-xs">FDA Requirement:</span>
                                  <p className="text-xs text-gray-600 mt-1">{issue.fdaRequirement}</p>
                                </div>
                                <div>
                                  <span className="font-medium text-xs">Suggested Fix:</span>
                                  <p className="text-xs text-green-600 mt-1">{issue.suggestedFix}</p>
                                </div>
                                <div>
                                  <span className="font-medium text-xs">Reference:</span>
                                  <p className="text-xs text-blue-600 mt-1">{issue.regulatoryReference}</p>
                                </div>
                              </div>
                            )}
                          </AlertDescription>
                        </div>
                      </div>
                    </Alert>
                  ))}
                  
                  {/* Recommendations Section */}
                  {complianceReport?.report?.recommendations?.length > 0 && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <div className="font-medium text-sm mb-2 flex items-center gap-1">
                        <TrendingUp className="h-4 w-4" />
                        AI Recommendations
                      </div>
                      <ul className="space-y-1">
                        {complianceReport.report.recommendations.map((rec, index) => (
                          <li key={index} className="text-xs text-gray-700 flex items-start gap-1">
                            <span className="text-blue-500 mt-0.5">•</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
                  <p className="text-sm font-medium">No Compliance Issues Found</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Your submission meets FDA requirements
                  </p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
          
          {/* Audit Trail Tab */}
          <TabsContent value="audit" className="mt-4">
            <ScrollArea className="h-[400px] w-full">
              <div className="space-y-2">
                {auditTrail?.entries?.map((entry, index) => (
                  <div key={index} className="border-l-2 border-gray-200 pl-3 pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-gray-400" />
                        <span className="text-xs text-gray-500">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {entry.action.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <div className="mt-1">
                      <p className="text-sm">{entry.details?.section || entry.entityId}</p>
                      {entry.details?.completeness && (
                        <div className="text-xs text-gray-500 mt-1">
                          Completeness: {entry.details.completeness}%
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          
          {/* Version History Tab */}
          <TabsContent value="versions" className="mt-4">
            <ScrollArea className="h-[400px] w-full">
              <div className="space-y-3">
                {versionHistory?.versions?.map((version, index) => (
                  <div key={index} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline">Version {version.versionNumber}</Badge>
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(version.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{version.changeDescription}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {version.changesCount} changes
                      </span>
                      <span className="text-xs font-mono bg-gray-100 px-1 rounded">
                        {version.hash.substring(0, 8)}...
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          
          {/* Data Lineage Tab */}
          <TabsContent value="lineage" className="mt-4">
            <ScrollArea className="h-[400px] w-full">
              <div className="space-y-3">
                {dataLineage?.lineage?.map((item, index) => (
                  <div key={index} className="border rounded-lg p-3">
                    <div className="font-medium text-sm mb-2 flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      {item.sourceField}
                    </div>
                    <div className="space-y-1">
                      {item.mappings.map((mapping, mapIndex) => (
                        <div key={mapIndex} className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500">→</span>
                          <span className="font-mono bg-gray-100 px-1 rounded">
                            {mapping.target}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {mapping.rule}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="text-center text-xs text-gray-500 mt-3">
                  Total Mappings: {dataLineage?.totalMappings || 0}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
        
        {/* Status Summary */}
        <div className="mt-4 pt-3 border-t grid grid-cols-4 gap-2">
          <div className="text-center">
            <div className="text-xs text-gray-500">Critical</div>
            <div className="text-lg font-bold text-red-500">
              {complianceReport?.report?.issues?.critical ?? localIssueCounts.critical}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">Major</div>
            <div className="text-lg font-bold text-orange-500">
              {complianceReport?.report?.issues?.major ?? localIssueCounts.major}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">Minor</div>
            <div className="text-lg font-bold text-yellow-500">
              {complianceReport?.report?.issues?.minor ?? localIssueCounts.minor}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">Suggestions</div>
            <div className="text-lg font-bold text-blue-500">
              {complianceReport?.report?.issues?.suggestions ?? localIssueCounts.suggestion}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
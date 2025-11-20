import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, AlertTriangle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getObjectiveCompliance } from '@/services/CerComplianceService';

/**
 * ObjectiveComplianceCard
 *
 * Displays compliance status for a single objective with score, issues, and recommendations.
 * Used in the QualityManagementPlanPanel to show objective-specific compliance information.
 */
const ObjectiveComplianceCard = ({
  objectiveId,
  documentId = 'current',
  framework = 'mdr',
  onRefresh = null,
}) => {
  const { toast } = useToast();
  const [compliance, setCompliance] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (objectiveId) {
      fetchCompliance();
    }
  }, [objectiveId, documentId, framework]);

  const fetchCompliance = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await getObjectiveCompliance(objectiveId, documentId, framework);
      setCompliance(data);
    } catch (err) {
      console.error('Error fetching objective compliance:', err);
      setError(err.message || 'Failed to load compliance data');
      toast({
        title: 'Compliance Data Error',
        description: err.message || 'Failed to load objective compliance data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchCompliance();
    toast({
      title: 'Refreshing Compliance',
      description: 'Updating objective compliance data...',
      variant: 'default',
    });

    if (onRefresh) {
      onRefresh();
    }
  };

  // Select appropriate status icon based on compliance score
  const renderStatusIcon = () => {
    if (!compliance || compliance.complianceScore === null) {
      return <AlertCircle className="h-5 w-5 text-gray-400" />;
    }

    if (compliance.complianceScore >= 90) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    } else if (compliance.complianceScore >= 75) {
      return <CheckCircle className="h-5 w-5 text-blue-500" />;
    } else if (compliance.complianceScore >= 60) {
      return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    } else {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  // Get appropriate badge color based on compliance score
  const getComplianceBadgeVariant = () => {
    if (!compliance || compliance.complianceScore === null) {
      return 'outline';
    }

    if (compliance.complianceScore >= 90) {
      return 'success';
    } else if (compliance.complianceScore >= 75) {
      return 'default';
    } else if (compliance.complianceScore >= 60) {
      return 'warning';
    } else {
      return 'destructive';
    }
  };

  // Get appropriate progress bar color based on compliance score
  const getProgressColor = () => {
    if (!compliance || compliance.complianceScore === null) {
      return 'bg-gray-400';
    }

    if (compliance.complianceScore >= 90) {
      return 'bg-green-500';
    } else if (compliance.complianceScore >= 75) {
      return 'bg-blue-500';
    } else if (compliance.complianceScore >= 60) {
      return 'bg-amber-500';
    } else {
      return 'bg-red-500';
    }
  };

  if (isLoading && !compliance) {
    return (
      <Card className="w-full bg-muted/30">
        <CardContent className="p-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
              <div className="h-4 w-36 bg-muted animate-pulse rounded"></div>
            </div>
            <div className="h-6 w-16 bg-muted animate-pulse rounded"></div>
          </div>
          <div className="mt-3 h-2 w-full bg-muted animate-pulse rounded"></div>
          <div className="mt-3 space-y-2">
            <div className="h-4 w-3/4 bg-muted animate-pulse rounded"></div>
            <div className="h-4 w-2/3 bg-muted animate-pulse rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !compliance) {
    return (
      <Card className="w-full bg-muted/30">
        <CardContent className="p-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <AlertCircle className="h-4 w-4 text-amber-500 mr-2" />
              <span className="text-sm font-medium">Compliance Unavailable</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            {error || 'Could not load compliance data for this objective'}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div className="flex items-center">
            {renderStatusIcon()}
            <div className="ml-2">
              <h4 className="text-sm font-medium line-clamp-1">{compliance.title}</h4>
              <div className="flex items-center mt-1">
                <Badge variant={getComplianceBadgeVariant()}>
                  {compliance.complianceScore !== null
                    ? `${compliance.complianceScore}%`
                    : 'Not Evaluated'}
                </Badge>
                <span className="text-xs text-muted-foreground ml-2">
                  {compliance.complianceStatus}
                </span>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoading}>
            {isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="mt-3">
          <Progress
            value={compliance.complianceScore || 0}
            className="h-2"
            indicatorClassName={getProgressColor()}
          />
        </div>

        {compliance.sections && compliance.sections.length > 0 && (
          <div className="mt-3">
            <span className="text-xs text-muted-foreground">Sections:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {compliance.sections.map((section, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {section}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {compliance.issues && compliance.issues.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center">
              <AlertTriangle className="h-3 w-3 text-amber-500 mr-1" />
              <span className="text-xs font-medium">Issues ({compliance.issues.length})</span>
            </div>
            <ul className="mt-1 text-xs text-muted-foreground space-y-1 pl-4 list-disc">
              {compliance.issues.slice(0, 2).map((issue, index) => (
                <li key={index} className="line-clamp-1">
                  {issue.message}
                </li>
              ))}
              {compliance.issues.length > 2 && (
                <li className="text-xs text-muted-foreground">
                  +{compliance.issues.length - 2} more issues
                </li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ObjectiveComplianceCard;

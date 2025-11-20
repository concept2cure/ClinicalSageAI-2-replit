import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import selfHealingSystem from '../utils/selfHealingSystem';

const SelfHealingStatusPanel = () => {
  const [status, setStatus] = useState({
    isActive: true,
    issues: [],
    fixes: [],
    memoryUsage: 0,
    apiHealth: 'good',
  });

  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    const removeListener = selfHealingSystem.addListener((event, data) => {
      setStatus(prev => {
        const newStatus = { ...prev };

        switch (event) {
          case 'issue-detected':
            newStatus.issues = [...prev.issues.filter(i => i.type !== data.type), data];
            break;
          case 'fixing':
            newStatus.fixes = [...prev.fixes, { ...data, status: 'fixing', timestamp: Date.now() }];
            break;
          case 'fixed':
            newStatus.fixes = prev.fixes.map(f =>
              f.type === data.type ? { ...f, status: 'fixed' } : f
            );
            newStatus.issues = prev.issues.filter(i => i.type !== data.type);
            break;
          case 'fix-failed':
            newStatus.fixes = prev.fixes.map(f =>
              f.type === data.issue.type ? { ...f, status: 'failed', error: data.error } : f
            );
            break;
          case 'memory-status':
            newStatus.memoryUsage = data.percentage;
            break;
          case 'api-health-issue':
            newStatus.apiHealth = 'degraded';
            break;
          default:
            break;
        }

        return newStatus;
      });
    });

    return removeListener;
  }, []);

  const getSeverityColor = severity => {
    switch (severity) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'warning';
      case 'low':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const getStatusColor = status => {
    switch (status) {
      case 'fixing':
        return 'warning';
      case 'fixed':
        return 'success';
      case 'failed':
        return 'destructive';
      default:
        return 'default';
    }
  };

  return (
    <>
      {/* Floating status indicator */}
      <div
        className="fixed top-4 right-4 z-50 cursor-pointer"
        onClick={() => setShowPanel(!showPanel)}
      >
        <Badge
          variant={status.issues.length > 0 ? 'destructive' : 'success'}
          className="animate-pulse"
        >
          🔧 {status.issues.length > 0 ? `${status.issues.length} issues` : 'All good'}
        </Badge>
      </div>

      {/* Detailed status panel */}
      {showPanel && (
        <Card className="fixed top-16 right-4 z-50 w-80 max-h-96 overflow-y-auto">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              Self-Healing System
              <Button variant="ghost" size="sm" onClick={() => setShowPanel(false)}>
                ×
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* System Status */}
            <div className="flex justify-between items-center text-xs">
              <span>System Status:</span>
              <Badge variant={status.isActive ? 'success' : 'destructive'}>
                {status.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>

            {/* Memory Usage */}
            <div className="flex justify-between items-center text-xs">
              <span>Memory Usage:</span>
              <Badge variant={status.memoryUsage > 80 ? 'destructive' : 'default'}>
                {status.memoryUsage.toFixed(1)}%
              </Badge>
            </div>

            {/* API Health */}
            <div className="flex justify-between items-center text-xs">
              <span>API Health:</span>
              <Badge variant={status.apiHealth === 'good' ? 'success' : 'warning'}>
                {status.apiHealth}
              </Badge>
            </div>

            {/* Current Issues */}
            {status.issues.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-1">Current Issues:</h4>
                <div className="space-y-1">
                  {status.issues.map((issue, index) => (
                    <div key={index} className="flex items-center justify-between text-xs">
                      <span className="truncate">{issue.message}</span>
                      <Badge variant={getSeverityColor(issue.severity)}>{issue.severity}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Fixes */}
            {status.fixes.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-1">Recent Activity:</h4>
                <div className="space-y-1">
                  {status.fixes.slice(-3).map((fix, index) => (
                    <div key={index} className="flex items-center justify-between text-xs">
                      <span className="truncate">{fix.message}</span>
                      <Badge variant={getStatusColor(fix.status)}>{fix.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manual Controls */}
            <div className="border-t pt-2">
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                onClick={() => selfHealingSystem.runFullDiagnostic()}
              >
                Run Full Diagnostic
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
};

export default SelfHealingStatusPanel;

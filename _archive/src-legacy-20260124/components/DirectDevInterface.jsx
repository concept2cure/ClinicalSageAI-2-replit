import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

const DirectDevInterface = () => {
  const [buildRequest, setBuildRequest] = useState('');
  const [buildHistory, setBuildHistory] = useState([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [currentFiles, setCurrentFiles] = useState([]);

  const executeDirectBuild = async request => {
    setIsBuilding(true);

    try {
      const response = await fetch('/api/direct-build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request,
          context: {
            currentPath: window.location.pathname,
            activeFiles: currentFiles,
            timestamp: Date.now(),
          },
        }),
      });

      const result = await response.json();

      setBuildHistory(prev => [
        ...prev,
        {
          id: Date.now(),
          request,
          result,
          timestamp: new Date().toISOString(),
          status: response.ok ? 'success' : 'error',
        },
      ]);

      if (result.files) {
        setCurrentFiles(result.files);
      }
    } catch (error) {
      setBuildHistory(prev => [
        ...prev,
        {
          id: Date.now(),
          request,
          result: { error: error.message },
          timestamp: new Date().toISOString(),
          status: 'error',
        },
      ]);
    } finally {
      setIsBuilding(false);
      setBuildRequest('');
    }
  };

  const quickActions = [
    {
      label: 'Add new CER feature',
      request: 'Add a new feature to the CER generator module',
    },
    {
      label: 'Enhance AI Assistant',
      request: 'Improve the AI assistant functionality with new capabilities',
    },
    {
      label: 'Create new module',
      request: 'Create a new module for the TrialSage platform',
    },
    {
      label: 'Fix performance issue',
      request: 'Optimize performance across the application',
    },
    {
      label: 'Add API endpoint',
      request: 'Create a new API endpoint for data processing',
    },
    {
      label: 'Enhance UI component',
      request: 'Improve an existing UI component with better functionality',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl h-[90vh] flex flex-col">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="flex items-center justify-between">
            Direct Development Interface
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent('closeDev'))}
            >
              ×
            </Button>
          </CardTitle>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Quick Actions */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setBuildRequest(action.request)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Build Request Input */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">Build Request</label>
            <Textarea
              value={buildRequest}
              onChange={e => setBuildRequest(e.target.value)}
              placeholder="Describe what you want to build or modify..."
              className="min-h-[100px]"
            />
            <Button
              onClick={() => executeDirectBuild(buildRequest)}
              disabled={!buildRequest.trim() || isBuilding}
              className="w-full"
            >
              {isBuilding ? 'Building...' : 'Execute Build'}
            </Button>
          </div>

          {/* Build History */}
          <div className="flex-1 overflow-hidden">
            <h3 className="text-sm font-semibold mb-2">Build History</h3>
            <div className="space-y-2 overflow-y-auto h-full">
              {buildHistory.map(build => (
                <Card key={build.id} className="p-3">
                  <div className="flex items-start justify-between mb-2">
                    <Badge variant={build.status === 'success' ? 'default' : 'destructive'}>
                      {build.status}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {new Date(build.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-sm">
                    <div className="font-medium mb-1">Request:</div>
                    <div className="text-gray-700 mb-2">{build.request}</div>
                    <div className="font-medium mb-1">Result:</div>
                    <div className="text-gray-700 text-xs">
                      {build.result.error ? (
                        <Alert variant="destructive">
                          <AlertDescription>{build.result.error}</AlertDescription>
                        </Alert>
                      ) : (
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(build.result, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DirectDevInterface;

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ChevronRight, Zap, FileText, Play, Settings } from 'lucide-react';
import ProcessFlow from './ProcessFlow';
import AIPanel from './AIPanel';
import ControlStrategyTab from './ControlStrategyTab';
import DesignSpaceTab from './DesignSpaceTab';
import PPQCPVTab from './PPQCPVTab';

const ProcessTab = () => {
  const [processes, setProcesses] = useState([]);
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProcesses();
  }, []);

  const fetchProcesses = async () => {
    try {
      const response = await fetch('/api/cmc-process/processes');
      const data = await response.json();
      setProcesses(data);
      if (data.length > 0) {
        setSelectedProcess(data[0].process_id);
      }
    } catch (error) {
      console.error('Error fetching processes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAISuggest = async processId => {
    setShowAIPanel(true);
  };

  const handleGenerateDocs = async processId => {
    try {
      const response = await fetch(`/api/cmc-process/processes/${processId}/generate-docs`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Error generating documents:', error);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading processes...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Process Development</h1>
          <p className="text-gray-600">
            Manufacturing process design, control strategy, and validation
          </p>
        </div>
        <Button disabled className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          New Process
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Process List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Active Processes</h2>
          {processes.map(process => (
            <Card
              key={process.process_id}
              className={`cursor-pointer transition-all ${
                selectedProcess === process.process_id ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => setSelectedProcess(process.process_id)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  {process.name}
                  <Badge variant="outline">{process.scope}</Badge>
                  <Badge
                    variant={
                      process.stage === 'VALIDATED'
                        ? 'default'
                        : process.stage === 'QUAL'
                          ? 'secondary'
                          : 'outline'
                    }
                  >
                    {process.stage}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-sm text-gray-600 space-y-1">
                  <div>
                    Units: {process.units} • CPPs: {process.cpp_count}
                  </div>
                  <div>Owner: {process.owner}</div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={e => {
                      e.stopPropagation();
                      handleAISuggest(process.process_id);
                    }}
                    className="flex items-center gap-1"
                  >
                    <Zap className="h-3 w-3" />
                    AI Suggest
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={e => {
                      e.stopPropagation();
                      handleGenerateDocs(process.process_id);
                    }}
                    className="flex items-center gap-1"
                  >
                    <FileText className="h-3 w-3" />
                    P.3 Doc
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Process Details with Tabs */}
        <div className="lg:col-span-2">
          {selectedProcess ? (
            <ProcessDetails processId={selectedProcess} />
          ) : (
            <Card className="h-64 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <Play className="h-8 w-8 mx-auto mb-2" />
                Select a process to view details
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* AI Panel */}
      {showAIPanel && selectedProcess && (
        <AIPanel
          processId={selectedProcess}
          onClose={() => setShowAIPanel(false)}
          onRefresh={() => fetchProcesses()}
        />
      )}
    </div>
  );
};

// Process Details Component with Enhanced Tabs
const ProcessDetails = ({ processId }) => {
  const [processData, setProcessData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProcessDetails();
  }, [processId]);

  const fetchProcessDetails = async () => {
    try {
      const response = await fetch(`/api/cmc-process/processes/${processId}`);
      const data = await response.json();
      setProcessData(data);
    } catch (error) {
      console.error('Error fetching process details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDocs = async () => {
    try {
      const response = await fetch(`/api/cmc-process/processes/${processId}/generate-docs`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Error generating documents:', error);
    }
  };

  const handleSetStage = async stage => {
    try {
      const response = await fetch(`/api/cmc-process/processes/${processId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      if (response.ok) {
        const data = await response.json();
        setProcessData(prev => ({ ...prev, process: { ...prev.process, stage: data.stage } }));
      } else {
        const error = await response.json().catch(() => ({ error: 'Failed' }));
        alert(`Stage change blocked: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error setting stage:', error);
      alert('Failed to update stage');
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading process details...</div>;
  }

  if (!processData) {
    return <div className="text-center py-8">No process data available</div>;
  }

  const { process, units } = processData;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">{process.name}</h2>
          <Badge variant="outline">{process.scope}</Badge>
          <Badge
            variant={
              process.stage === 'VALIDATED'
                ? 'default'
                : process.stage === 'QUAL'
                  ? 'secondary'
                  : 'outline'
            }
          >
            {process.stage}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleSetStage('DESIGN')}>
            Set DESIGN
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleSetStage('QUAL')}>
            Set QUAL
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleSetStage('VALIDATED')}>
            Set VALIDATED
          </Button>
          <Button size="sm" onClick={handleGenerateDocs}>
            Generate P.3 Docs
          </Button>
        </div>
      </div>

      <Tabs defaultValue="flow">
        <TabsList>
          <TabsTrigger value="flow">Flow</TabsTrigger>
          <TabsTrigger value="control">Control Strategy</TabsTrigger>
          <TabsTrigger value="design">Design Space</TabsTrigger>
          <TabsTrigger value="ppqcpv">PPQ & CPV</TabsTrigger>
          <TabsTrigger value="ai">AI Advisor</TabsTrigger>
        </TabsList>

        <TabsContent value="flow">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Process Flow</CardTitle>
              </CardHeader>
              <CardContent>
                <ProcessFlow processId={processId} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Parameters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="p-2 text-left">Unit</th>
                        <th className="p-2 text-left">Param</th>
                        <th className="p-2">Kind</th>
                        <th className="p-2">Target</th>
                        <th className="p-2">Range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {units.flatMap(u =>
                        u.parameters.map(p => (
                          <tr key={p.param_id} className="border-t">
                            <td className="p-2">{u.name}</td>
                            <td className="p-2">{p.name}</td>
                            <td className="p-2">
                              <Badge variant={p.kind === 'CPP' ? 'secondary' : 'outline'}>
                                {p.kind}
                              </Badge>
                            </td>
                            <td className="p-2">{p.target || '—'}</td>
                            <td className="p-2">
                              {p.low || ''}
                              {p.low ? '–' + (p.high || '') : ''} {p.unit || ''}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="control">
          <ControlStrategyTab processId={processId} />
        </TabsContent>

        <TabsContent value="design">
          <DesignSpaceTab processId={processId} />
        </TabsContent>

        <TabsContent value="ppqcpv">
          <PPQCPVTab processId={processId} />
        </TabsContent>

        <TabsContent value="ai">
          <AIPanel processId={processId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProcessTab;

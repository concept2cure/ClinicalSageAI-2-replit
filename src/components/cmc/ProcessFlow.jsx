import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@/lib/reactflow-stub';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const ProcessFlow = ({ processId }) => {
  const [processData, setProcessData] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (processId) {
      fetchProcessData();
    }
  }, [processId]);

  const fetchProcessData = async () => {
    try {
      const response = await fetch(`/api/cmc-process/processes/${processId}`);
      const data = await response.json();
      setProcessData(data);
      createFlowData(data);
    } catch (error) {
      console.error('Error fetching process data:', error);
    } finally {
      setLoading(false);
    }
  };

  const createFlowData = data => {
    if (!data || !data.units) return;

    const flowNodes = data.units.map((unit, index) => ({
      id: unit.unit_id,
      type: 'default',
      position: { x: index * 250, y: 100 },
      data: {
        label: (
          <div className="text-center">
            <div className="font-semibold">{unit.name}</div>
            <div className="text-xs text-gray-500">{unit.type}</div>
            <Badge variant={unit.status === 'VALIDATED' ? 'default' : 'outline'} className="mt-1">
              {unit.status}
            </Badge>
          </div>
        ),
      },
      style: {
        background: unit.status === 'VALIDATED' ? '#e3f2fd' : '#f5f5f5',
        border: '2px solid #1976d2',
        borderRadius: '8px',
        padding: '10px',
      },
    }));

    const flowEdges = data.units.slice(0, -1).map((unit, index) => ({
      id: `e${index}`,
      source: unit.unit_id,
      target: data.units[index + 1].unit_id,
      animated: true,
      style: { stroke: '#1976d2' },
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
  };

  const onConnect = useCallback(params => setEdges(eds => addEdge(params, eds)), [setEdges]);

  if (loading) {
    return (
      <Card className="h-96">
        <CardContent className="flex items-center justify-center h-full">
          <div>Loading process flow...</div>
        </CardContent>
      </Card>
    );
  }

  if (!processData) {
    return (
      <Card className="h-96">
        <CardContent className="flex items-center justify-center h-full">
          <div>No process data available</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {processData.process.name}
            <Badge>{processData.process.scope}</Badge>
            <Badge variant="outline">{processData.process.stage}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="flow" className="w-full">
            <TabsList>
              <TabsTrigger value="flow">Process Flow</TabsTrigger>
              <TabsTrigger value="parameters">Parameters</TabsTrigger>
              <TabsTrigger value="control">Control Strategy</TabsTrigger>
            </TabsList>

            <TabsContent value="flow">
              <div className="h-96 border rounded-lg">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  fitView
                >
                  <Controls />
                  <MiniMap />
                  <Background variant="grid" gap={12} size={1} />
                </ReactFlow>
              </div>
            </TabsContent>

            <TabsContent value="parameters">
              <div className="space-y-4">
                {processData.units.map(unit => (
                  <Card key={unit.unit_id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        {unit.name} - {unit.type}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {unit.parameters.length > 0 ? (
                        <div className="space-y-2">
                          {unit.parameters.map(param => (
                            <div
                              key={param.param_id}
                              className="flex items-center justify-between p-2 bg-gray-50 rounded"
                            >
                              <div>
                                <span className="font-medium">{param.name}</span>
                                <Badge
                                  variant={param.kind === 'CPP' ? 'default' : 'outline'}
                                  className="ml-2"
                                >
                                  {param.kind}
                                </Badge>
                              </div>
                              <div className="text-sm text-gray-600">
                                {param.target && `Target: ${param.target}`}
                                {param.low &&
                                  param.high &&
                                  ` (${param.low}-${param.high} ${param.unit || ''})`}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">No parameters defined</div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="control">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-600">
                    Control strategy development in progress...
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProcessFlow;

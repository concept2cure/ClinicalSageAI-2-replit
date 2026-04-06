import React, { useEffect, useState, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitBranch, Package, Leaf, Truck, Download } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface GenealogyGraphPanelProps {
  batchId: string;
}

export default function GenealogyGraphPanel({ batchId }: GenealogyGraphPanelProps) {
  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  async function loadGraph() {
    try {
      setLoading(true);
      const response = await apiRequest('GET', `/api/quality/batches/${batchId}/genealogy/graph`);
      const data = await response.json();
      setGraphData(data);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }

  const drawGraph = () => {
    if (!graphData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { nodes, edges } = graphData;

    // Simple layout - arrange nodes in a tree-like structure
    const nodePositions = new Map();
    let yOffset = 50;
    const xSpacing = 150;
    const ySpacing = 80;

    // Position the batch node at the bottom center
    const batchNode = nodes.find(n => n.type === 'BATCH');
    if (batchNode) {
      nodePositions.set(batchNode.id, { x: canvas.width / 2, y: canvas.height - 50 });
    }

    // Position other nodes above
    const otherNodes = nodes.filter(n => n.type !== 'BATCH');
    otherNodes.forEach((node, index) => {
      const x = canvas.width / 2 + (index - otherNodes.length / 2) * xSpacing;
      const y = yOffset + Math.floor(index / 3) * ySpacing;
      nodePositions.set(node.id, { x, y });
    });

    // Draw edges first
    ctx.strokeStyle = '#8a8880';
    ctx.lineWidth = 2;
    edges.forEach(edge => {
      const source = nodePositions.get(edge.source);
      const target = nodePositions.get(edge.target);
      if (source && target) {
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();

        // Draw arrowhead
        const angle = Math.atan2(target.y - source.y, target.x - source.x);
        const arrowSize = 10;
        ctx.beginPath();
        ctx.moveTo(target.x, target.y);
        ctx.lineTo(
          target.x - arrowSize * Math.cos(angle - Math.PI / 6),
          target.y - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          target.x - arrowSize * Math.cos(angle + Math.PI / 6),
          target.y - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
      }
    });

    // Draw nodes
    nodes.forEach(node => {
      const pos = nodePositions.get(node.id);
      if (!pos) return;

      // Node colors by type
      const colors = {
        BATCH: '#ef4444',
        RAW_MATERIAL: '#92a87a',
        INTERMEDIATE: '#f59e0b',
        COMPONENT: '#78716c',
      };

      ctx.fillStyle = colors[node.type as keyof typeof colors] || '#8a8880';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 20, 0, 2 * Math.PI);
      ctx.fill();

      // Node label
      ctx.fillStyle = '#000';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, pos.x, pos.y + 35);
    });
  };

  useEffect(() => {
    loadGraph();
  }, [batchId]);

  useEffect(() => {
    if (graphData) {
      drawGraph();
    }
  }, [graphData]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'BATCH':
        return <Package className="w-4 h-4" />;
      case 'RAW_MATERIAL':
        return <Leaf className="w-4 h-4" />;
      case 'INTERMEDIATE':
        return <GitBranch className="w-4 h-4" />;
      case 'COMPONENT':
        return <Truck className="w-4 h-4" />;
      default:
        return <Package className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'BATCH':
        return 'bg-stone-100 text-stone-800';
      case 'RAW_MATERIAL':
        return 'bg-stone-100 text-stone-800';
      case 'INTERMEDIATE':
        return 'bg-stone-100 text-stone-800';
      case 'COMPONENT':
        return 'bg-stone-100 text-stone-800';
      default:
        return 'bg-stone-100 text-stone-800';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-stone-600" />
            Material Genealogy Graph
          </CardTitle>
          <Button variant="outline" size="sm" onClick={loadGraph} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!graphData ? (
          <div className="text-center py-8 text-stone-500">
            <GitBranch className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Loading genealogy data...</p>
          </div>
        ) : graphData.nodes.length === 0 ? (
          <div className="text-center py-8 text-stone-500">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No genealogy data available</p>
            <p className="text-sm">Add material lineage information to view the graph</p>
          </div>
        ) : (
          <>
            <div className="border rounded-lg bg-stone-50">
              <canvas
                ref={canvasRef}
                width={600}
                height={400}
                className="w-full h-auto"
                style={{ maxWidth: '100%' }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium mb-2">Materials ({graphData.nodes.length})</h4>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {graphData.nodes.map(node => (
                    <div key={node.id} className="flex items-center gap-2 text-sm">
                      <Badge
                        variant="outline"
                        className={`${getTypeColor(node.type)} flex items-center gap-1`}
                      >
                        {getTypeIcon(node.type)}
                        {node.type}
                      </Badge>
                      <span className="truncate">{node.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Connections ({graphData.edges.length})</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto text-sm text-stone-600">
                  {graphData.edges.map(edge => {
                    const sourceNode = graphData.nodes.find(n => n.id === edge.source);
                    const targetNode = graphData.nodes.find(n => n.id === edge.target);
                    return (
                      <div key={edge.id} className="text-xs">
                        {sourceNode?.label} → {targetNode?.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-xs text-stone-600">
                Material traceability supports regulatory compliance and quality investigations
              </div>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-1" />
                Export
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

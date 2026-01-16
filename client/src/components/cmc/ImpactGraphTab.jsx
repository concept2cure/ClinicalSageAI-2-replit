import React, { useEffect, useMemo, useState } from 'react';
// import { ReactFlow, Background, Controls, MiniMap } from "@xyflow/react";
// import "@xyflow/react/dist/style.css";
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GitBranch, RefreshCw } from 'lucide-react'

export default function ImpactGraphTab({ processId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (processId) {
      loadGraphData();
    }
  }, [processId]);

  const loadGraphData = async () => {
    try {
      const r = await fetch(`/api/process/processes/${processId}/impact/graph`);
      if (r.ok) {
        const graphData = await r.json();
        setData(graphData);
      }
    } catch (error) {
      console.error('Error loading impact graph:', error);
    } finally {
      setLoading(false);
    }
  };

  const nodesRF = useMemo(
    () =>
      (data?.nodes || []).map((n, i) => ({
        id: n.id,
        data: { label: n.label },
        position: { x: 80 + (i % 4) * 200, y: 80 + Math.floor(i / 4) * 120 },
        style:
          n.type === 'doc'
            ? { background: '#eef' }
            : n.type === 'mod'
              ? { background: '#efe' }
              : n.type === 'cpp'
                ? { background: '#fee' }
                : n.type === 'unit'
                  ? { background: '#eff' }
                  : {},
      })),
    [data]
  );

  const edgesRF = useMemo(
    () =>
      (data?.edges || []).map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: e.style === 'warn',
        style: { stroke: e.style === 'warn' ? '#e11' : '#999' },
      })),
    [data]
  );

  const applyAllFixes = async () => {
    setApplying(true);
    try {
      const r = await fetch(`/api/process/processes/${processId}/impact/apply`, { method: 'POST' });
      const result = await r.json();
      if (r.ok) {
        alert(`Created ${result.created} task(s).`);
      } else {
        alert(result.error || 'Failed');
      }
    } catch (error) {
      console.error('Error applying fixes:', error);
      alert('Failed to apply fixes');
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <Card data-testid="card-impact-graph">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Impact Graph
          </CardTitle>
        </CardHeader>
        <CardContent>Loading impact graph...</CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-impact-graph">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Impact Graph
        </CardTitle>
        <Button
          variant="outline"
          onClick={applyAllFixes}
          disabled={applying}
          data-testid="button-apply-all-fixes"
        >
          {applying ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Applying...
            </>
          ) : (
            'Apply all fixes'
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {!data ? (
          <div className="text-sm text-slate-500">Unable to load impact graph</div>
        ) : (
          <div style={{ height: 420 }} data-testid="impact-graph-canvas">
            <div className="h-full bg-gray-50 border border-gray-200 rounded-md flex items-center justify-center">
              <div className="text-center">
                <GitBranch className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p className="text-gray-500">Visual Impact Graph</p>
                <p className="text-sm text-gray-400">
                  {data?.nodes?.length || 0} nodes, {data?.edges?.length || 0} connections
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

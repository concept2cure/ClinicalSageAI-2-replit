import React, { useCallback, useState } from 'react';
// import { ReactFlow, Background, Controls, MiniMap, addEdge, useEdgesState, useNodesState } from "@xyflow/react";
// import "@xyflow/react/dist/style.css";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

export default function ProcessCanvasEditor({ processId, units, onSaved }) {
  const startNodes = units.map((u, i) => ({
    id: u.unit_id,
    data: { label: `${u.name}` },
    position: { x: u.pos_x ?? 140 * i, y: u.pos_y ?? 80 },
    dragHandle: '.react-flow__node',
  }));

  const startEdges = units.slice(1).map((u, i) => ({
    id: `e${i}`,
    source: units[i].unit_id,
    target: u.unit_id,
  }));

  // const [nodes, setNodes, onNodesChange] = useNodesState(startNodes);
  // const [edges, setEdges, onEdgesChange] = useEdgesState(startEdges);
  const [nodes, setNodes] = useState(startNodes);
  const [edges, setEdges] = useState(startEdges);

  const saveLayout = useCallback(async () => {
    const payload = nodes.map(n => ({
      unit_id: n.id,
      pos_x: n.position.x,
      pos_y: n.position.y,
    }));

    const r = await fetch(`/api/process/processes/${processId}/units/layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes: payload }),
    });

    if (r.ok) {
      console.log('✅ Layout saved successfully');
      onSaved && onSaved();
    } else {
      console.error('❌ Failed to save layout');
      toast({ title: 'Failed to save layout' });
    }
  }, [nodes, processId, onSaved]);

  // const onConnect = useCallback((connection) => setEdges((eds) => addEdge(connection, eds)), []);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitType, setNewUnitType] = useState('');

  async function addUnit() {
    if (!newUnitName || !newUnitType) return;

    const r = await fetch(`/api/process/processes/${processId}/units`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newUnitName,
        type: newUnitType,
        sequence_no: units.length + 1,
        pos_x: 60,
        pos_y: 60,
      }),
    });

    if (r.ok) {
      console.log('✅ Unit added successfully');
      // Refresh the parent component instead of full page reload
      onSaved && onSaved();
      setNewUnitName('');
      setNewUnitType('');
    } else {
      console.error('❌ Failed to add unit');
      toast({ title: 'Add failed' });
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          placeholder="New unit name"
          value={newUnitName}
          onChange={e => setNewUnitName(e.target.value)}
          className="w-56"
          data-testid="input-unit-name"
        />
        <Input
          placeholder="Type (e.g., Blender)"
          value={newUnitType}
          onChange={e => setNewUnitType(e.target.value)}
          className="w-56"
          data-testid="input-unit-type"
        />
        <Button variant="outline" onClick={addUnit} data-testid="button-add-unit">
          Add Unit
        </Button>
        <Button onClick={saveLayout} data-testid="button-save-layout">
          Save Layout
        </Button>
      </div>
      <div style={{ height: 360 }}>
        <div
          className="h-full bg-gray-50 border border-gray-200 rounded-md flex items-center justify-center"
          data-testid="canvas-process-flow"
        >
          <div className="text-center">
            <div className="text-lg font-medium text-gray-700 mb-2">Process Canvas Editor</div>
            <p className="text-sm text-gray-500">{nodes.length} units configured</p>
            <p className="text-xs text-gray-400">Visual editor loading...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

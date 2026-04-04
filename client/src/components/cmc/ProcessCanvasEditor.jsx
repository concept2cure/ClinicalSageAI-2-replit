import React, { useCallback, useState } from 'react';
// @xyflow/react removed (Build Order #11) — dependency was dead/unused
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
      <div style={{ height: 360, overflow: 'auto' }}>
        <div
          className="h-full bg-gray-50 border border-gray-200 rounded-md p-4"
          data-testid="canvas-process-flow"
        >
          {nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              No process units defined. Add a unit above to get started.
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {nodes.map((node, i) => (
                <React.Fragment key={node.id}>
                  <div className="flex flex-col items-center">
                    <div className="bg-white border-2 border-blue-300 rounded-lg px-4 py-3 shadow-sm min-w-[120px] text-center hover:border-blue-500 transition-colors">
                      <div className="text-sm font-semibold text-gray-800">{node.data.label}</div>
                      <div className="text-xs text-gray-400 mt-1">Step {i + 1}</div>
                    </div>
                  </div>
                  {i < nodes.length - 1 && (
                    <div className="text-gray-400 text-lg font-bold select-none">&rarr;</div>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

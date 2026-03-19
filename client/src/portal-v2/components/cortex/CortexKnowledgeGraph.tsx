/**
 * Cortex Knowledge Graph Component
 *
 * Visual representation of the Cortex knowledge graph.
 * Shows atoms, edges, and their relationships.
 *
 * @module portal-v2/components/cortex/CortexKnowledgeGraph
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RefreshCw, Filter, Download, Info } from 'lucide-react';
import {
  useCortexGraphStats,
  useCortexGraphTraversal,
  type GraphStats,
} from '../../hooks/useCortex';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface CortexKnowledgeGraphProps {
  /** Center atom ID to start traversal from */
  centerAtomId?: string;
  /** Maximum traversal depth */
  maxDepth?: number;
  /** Enable interactive mode */
  interactive?: boolean;
  /** Callback when node is selected */
  onNodeSelect?: (nodeId: string, nodeData: GraphNode) => void;
  /** Width of the graph container */
  width?: number | string;
  /** Height of the graph container */
  height?: number | string;
  /** CSS class name */
  className?: string;
}

interface GraphNode {
  id: string;
  type: string;
  label: string;
  x?: number;
  y?: number;
  color?: string;
  size?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const NODE_COLORS: Record<string, string> = {
  fact: '#647746',
  concept: '#d97706',
  rule: '#dc2626',
  procedure: '#0891b2',
  reference: '#5585b3',
  default: '#8a8880',
};

const EDGE_COLORS: Record<string, string> = {
  relates_to: '#b0aea5',
  depends_on: '#f97316',
  contradicts: '#ef4444',
  supports: '#92a87a',
  references: '#6a9bcc',
  default: '#d6d3c8',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function CortexKnowledgeGraph({
  centerAtomId,
  maxDepth = 2,
  interactive = true,
  onNodeSelect,
  width = '100%',
  height = 400,
  className = '',
}: CortexKnowledgeGraphProps) {
  // State
  const [zoom, setZoom] = useState(1);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);

  // Refs
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hooks
  const { data: stats, isLoading: statsLoading } = useCortexGraphStats();
  const {
    data: traversalData,
    isLoading: traversalLoading,
    refetch: refetchTraversal,
  } = useCortexGraphTraversal(centerAtomId || '', {
    maxDepth,
    edgeTypes: filterType ? [filterType] : undefined,
    enabled: !!centerAtomId,
  });

  // Computed
  const nodes: GraphNode[] = useMemo(() => {
    if (!traversalData?.nodes) return [];
    return traversalData.nodes.map((node: any, index: number) => {
      const angle = (2 * Math.PI * index) / traversalData.nodes.length;
      const radius = 150 * (node.level + 1);
      return {
        id: node.id,
        type: node.type || 'default',
        label: node.content?.substring(0, 30) || node.id.substring(0, 8),
        x: Math.cos(angle) * radius + 200,
        y: Math.sin(angle) * radius + 200,
        color: NODE_COLORS[node.type] || NODE_COLORS.default,
        size: node.level === 0 ? 20 : 12,
      };
    });
  }, [traversalData]);

  const edges: GraphEdge[] = useMemo(() => {
    if (!traversalData?.edges) return [];
    return traversalData.edges.map((edge: any) => ({
      source: edge.sourceId || edge.source,
      target: edge.targetId || edge.target,
      type: edge.type || 'relates_to',
      weight: edge.weight || 1,
    }));
  }, [traversalData]);

  // Handlers
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.2, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.2, 0.5));
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setSelectedNode(null);
    setFilterType(null);
  }, []);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      setSelectedNode(node.id);
      onNodeSelect?.(node.id, node);
    },
    [onNodeSelect]
  );

  const handleRefresh = useCallback(() => {
    refetchTraversal();
  }, [refetchTraversal]);

  // Loading state
  if (statsLoading || traversalLoading) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 rounded-lg ${className}`}
        style={{ width, height }}
      >
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500">Loading knowledge graph...</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (!centerAtomId && !stats) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 rounded-lg ${className}`}
        style={{ width, height }}
      >
        <div className="text-center">
          <Info className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Select an atom to visualize its connections</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative bg-gray-900 rounded-lg overflow-hidden ${className}`}
      style={{ width, height }}
    >
      {/* Toolbar */}
      <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
        <div className="flex items-center bg-white/90 backdrop-blur rounded-lg shadow">
          <button
            onClick={handleZoomOut}
            className="p-2 hover:bg-gray-100 rounded-l-lg transition-colors"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4 text-gray-600" />
          </button>
          <span className="px-2 text-xs text-gray-600 font-medium">{Math.round(zoom * 100)}%</span>
          <button
            onClick={handleZoomIn}
            className="p-2 hover:bg-gray-100 rounded-r-lg transition-colors"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <button
          onClick={handleReset}
          className="p-2 bg-white/90 backdrop-blur rounded-lg shadow hover:bg-gray-100 transition-colors"
          aria-label="Reset view"
        >
          <Maximize2 className="w-4 h-4 text-gray-600" />
        </button>

        <button
          onClick={handleRefresh}
          className="p-2 bg-white/90 backdrop-blur rounded-lg shadow hover:bg-gray-100 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* Stats Panel */}
      {stats && (
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur rounded-lg shadow p-3 z-10">
          <div className="text-xs font-medium text-gray-500 mb-2">Graph Statistics</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Atoms:</span>
              <span className="ml-1 font-medium text-gray-900">{stats.totalAtoms}</span>
            </div>
            <div>
              <span className="text-gray-500">Edges:</span>
              <span className="ml-1 font-medium text-gray-900">{stats.totalEdges}</span>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur rounded-lg shadow p-3 z-10">
        <div className="text-xs font-medium text-gray-500 mb-2">Node Types</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(NODE_COLORS).map(
            ([type, color]) =>
              type !== 'default' && (
                <div key={type} className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-xs text-gray-600 capitalize">{type}</span>
                </div>
              )
          )}
        </div>
      </div>

      {/* SVG Graph */}
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox="0 0 400 400"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
      >
        {/* Edges */}
        <g className="edges">
          {edges.map((edge, index) => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            const targetNode = nodes.find(n => n.id === edge.target);
            if (!sourceNode || !targetNode) return null;
            return (
              <line
                key={`edge-${index}`}
                x1={sourceNode.x}
                y1={sourceNode.y}
                x2={targetNode.x}
                y2={targetNode.y}
                stroke={EDGE_COLORS[edge.type] || EDGE_COLORS.default}
                strokeWidth={edge.weight || 1}
                strokeOpacity={0.6}
              />
            );
          })}
        </g>

        {/* Nodes */}
        <g className="nodes">
          {nodes.map(node => (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              onClick={() => interactive && handleNodeClick(node)}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: interactive ? 'pointer' : 'default' }}
            >
              <circle
                r={node.size}
                fill={node.color}
                stroke={selectedNode === node.id ? '#fff' : 'transparent'}
                strokeWidth={selectedNode === node.id ? 3 : 0}
                opacity={hoveredNode && hoveredNode !== node.id ? 0.5 : 1}
              />
              {(hoveredNode === node.id || selectedNode === node.id) && (
                <text
                  y={node.size! + 14}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize="10"
                  fontWeight="500"
                >
                  {node.label}
                </text>
              )}
            </g>
          ))}
        </g>
      </svg>

      {/* Selected Node Info */}
      {selectedNode && (
        <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur rounded-lg shadow p-3 z-10 max-w-[200px]">
          <div className="text-xs font-medium text-gray-500 mb-1">Selected Node</div>
          <div className="text-sm font-medium text-gray-900">
            {nodes.find(n => n.id === selectedNode)?.label}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Type: {nodes.find(n => n.id === selectedNode)?.type}
          </div>
        </div>
      )}
    </div>
  );
}

export default CortexKnowledgeGraph;

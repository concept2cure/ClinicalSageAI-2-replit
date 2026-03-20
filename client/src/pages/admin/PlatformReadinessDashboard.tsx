/**
 * Platform Readiness Dashboard — Interactive React Flow Visualization
 *
 * Three-tab view for Concept2Cure Phase 0–1:
 *   Tab 1: Platform Overview — modules, templates, AI, Canvas, DOCX, gaps
 *   Tab 2: Remediation Roadmap — Gantt-style phases & task cards
 *   Tab 3: Architecture Flow — Client → Server → DB wiring with live/broken status
 *
 * @version 1.0.0
 */

import React, { useState, useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { nodeTypes } from '../../components/platform-readiness/FlowNodes';
import {
  MODULES,
  SEVERITY_COLORS,
  MODULE_COLORS,
  buildOverviewNodes,
  buildOverviewEdges,
  buildRoadmapNodes,
  buildRoadmapEdges,
  buildArchitectureNodes,
  buildArchitectureEdges,
} from '../../components/platform-readiness/readinessFlowData';

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "'Poppins', Arial, sans-serif",
  background: '#faf9f5',
};

const headerStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #141413, #2d2d2a)',
  color: 'white',
  padding: '16px 24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
  zIndex: 10,
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 0,
  background: '#2d2d2a',
  padding: '0 24px',
  borderBottom: '1px solid #4a4a46',
  flexShrink: 0,
  zIndex: 10,
};

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 20px',
  fontSize: 13,
  fontWeight: active ? 700 : 400,
  color: active ? '#8bb4d9' : '#b0aea5',
  background: 'transparent',
  border: 'none',
  borderBottom: active ? '2px solid #8bb4d9' : '2px solid transparent',
  cursor: 'pointer',
  transition: 'color 0.2s, border-color 0.2s',
  fontFamily: 'inherit',
});

const flowContainerStyle: React.CSSProperties = {
  flex: 1,
  position: 'relative',
};

const legendStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 8,
  padding: '12px 16px',
  fontSize: 11,
  lineHeight: 1.8,
  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
  maxWidth: 220,
};

// ─────────────────────────────────────────────────────────────────────────────
// QUICK STATS BAR
// ─────────────────────────────────────────────────────────────────────────────

const QuickStats: React.FC = () => {
  const modules = Object.values(MODULES);
  const totalGaps = modules.reduce((sum, m) => sum + m.gaps.length, 0);
  const totalTasks = modules.reduce((sum, m) => sum + m.tasks.length, 0);
  const criticalGaps = modules.reduce(
    (sum, m) => sum + m.gaps.filter(g => g.severity === 'critical').length,
    0
  );

  const stats = [
    { label: 'Overall Readiness', value: '55%', color: '#f59e0b' },
    { label: 'Modules', value: '3', color: '#6a9bcc' },
    { label: 'Total Gaps', value: String(totalGaps), color: '#ef4444' },
    { label: 'Critical', value: String(criticalGaps), color: '#dc2626' },
    { label: 'Remediation Tasks', value: String(totalTasks), color: '#6a9bcc' },
    { label: 'Endpoints Broken', value: '~200', color: '#f97316' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        padding: '10px 24px',
        background: '#f4f3ee',
        borderBottom: '1px solid #e8e6dc',
        flexShrink: 0,
        overflowX: 'auto',
      }}
    >
      {stats.map(s => (
        <div key={s.label} style={{ textAlign: 'center', minWidth: 100 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
          <div style={{ fontSize: 10, color: '#8a8880', fontWeight: 500 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW VIEW
// ─────────────────────────────────────────────────────────────────────────────

const OverviewView: React.FC = () => {
  const initialNodes = useMemo(() => buildOverviewNodes(), []);
  const initialEdges = useMemo(() => buildOverviewEdges(), []);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.2}
      maxZoom={2}
      attributionPosition="bottom-left"
    >
      <Background color="#e8e6dc" gap={20} />
      <Controls position="bottom-right" />
      <MiniMap
        nodeColor={node => {
          if (node.type === 'platformHeader') return '#2d2d2a';
          if (node.type === 'moduleCard') {
            const modId = node.data?.module?.id;
            return MODULE_COLORS[modId]?.border || '#b0aea5';
          }
          if (node.type === 'gapBadge') {
            return SEVERITY_COLORS[node.data?.gap?.severity]?.badge || '#b0aea5';
          }
          return '#b0aea5';
        }}
        maskColor="rgba(15, 23, 42, 0.1)"
        style={{ borderRadius: 8 }}
      />
      <Panel position="top-left">
        <div style={legendStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Legend</div>
          <div>🟢 Live / Ready</div>
          <div>🟡 Stub / Partial</div>
          <div>🔴 Missing / Broken</div>
          <div>⚪ Unmounted</div>
          <div style={{ marginTop: 8, fontWeight: 600 }}>Gaps</div>
          {(['critical', 'high', 'medium', 'low'] as const).map(sev => (
            <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: SEVERITY_COLORS[sev].badge,
                  display: 'inline-block',
                }}
              />
              {sev.charAt(0).toUpperCase() + sev.slice(1)}
            </div>
          ))}
          <div style={{ marginTop: 8, fontSize: 10, color: '#8a8880' }}>
            Click module cards to expand details
          </div>
        </div>
      </Panel>
    </ReactFlow>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ROADMAP VIEW
// ─────────────────────────────────────────────────────────────────────────────

const RoadmapView: React.FC = () => {
  const initialNodes = useMemo(() => buildRoadmapNodes(), []);
  const initialEdges = useMemo(() => buildRoadmapEdges(), []);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      minZoom={0.15}
      maxZoom={2}
      attributionPosition="bottom-left"
    >
      <Background color="#e8e6dc" gap={20} />
      <Controls position="bottom-right" />
      <MiniMap
        nodeColor={node => {
          if (node.type === 'phaseHeader') return node.data?.phase?.color || '#b0aea5';
          if (node.type === 'taskCard')
            return SEVERITY_COLORS[node.data?.task?.priority]?.badge || '#b0aea5';
          return '#b0aea5';
        }}
        maskColor="rgba(15, 23, 42, 0.1)"
        style={{ borderRadius: 8 }}
      />
      <Panel position="top-left">
        <div style={legendStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Roadmap Legend</div>
          <div>⬜ Not Started</div>
          <div>🔄 In Progress</div>
          <div>✅ Completed</div>
          <div style={{ marginTop: 8, fontWeight: 600 }}>Priority</div>
          {(['critical', 'high', 'medium', 'low'] as const).map(sev => (
            <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: SEVERITY_COLORS[sev].badge,
                  display: 'inline-block',
                }}
              />
              {sev.charAt(0).toUpperCase() + sev.slice(1)}
            </div>
          ))}
          <div style={{ marginTop: 8, fontSize: 10, color: '#8a8880' }}>
            Dashed yellow lines = dependency
          </div>
        </div>
      </Panel>
    </ReactFlow>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ARCHITECTURE VIEW
// ─────────────────────────────────────────────────────────────────────────────

const ArchitectureView: React.FC = () => {
  const initialNodes = useMemo(() => buildArchitectureNodes(), []);
  const initialEdges = useMemo(() => buildArchitectureEdges(), []);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.2}
      maxZoom={2}
      attributionPosition="bottom-left"
    >
      <Background color="#e8e6dc" gap={20} />
      <Controls position="bottom-right" />
      <MiniMap
        nodeColor={node => {
          if (node.type === 'archComponent') {
            const status = node.data?.component?.status;
            if (status === 'connected') return '#647746';
            if (status === 'broken') return '#dc2626';
            return '#b0aea5';
          }
          return '#b0aea5';
        }}
        maskColor="rgba(15, 23, 42, 0.1)"
        style={{ borderRadius: 8 }}
      />
      <Panel position="top-left">
        <div style={legendStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Architecture Legend</div>
          <div>🟢 Connected — working end-to-end</div>
          <div>🔴 Broken — 404 / stub route</div>
          <div>⚪ Unmounted — code exists, not wired</div>
          <div style={{ marginTop: 8, fontWeight: 600 }}>Layers</div>
          <div>📱 Client (React SPA)</div>
          <div>🖥️ Express Server (Port 5000)</div>
          <div>🐍 Shadow Service (Python FastAPI)</div>
          <div>🗄️ PostgreSQL Database</div>
          <div style={{ marginTop: 8, fontSize: 10, color: '#8a8880' }}>
            Hover components for details
          </div>
        </div>
      </Panel>
    </ReactFlow>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY PANEL (sidebar)
// ─────────────────────────────────────────────────────────────────────────────

const SummaryPanel: React.FC<{ visible: boolean; onClose: () => void }> = ({
  visible,
  onClose,
}) => {
  if (!visible) return null;

  const modules = Object.values(MODULES);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 380,
        height: '100%',
        background: 'white',
        borderLeft: '1px solid #e8e6dc',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
        zIndex: 20,
        overflowY: 'auto',
        padding: 20,
        fontFamily: "'Poppins', Arial, sans-serif",
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Executive Summary</h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: 20,
            cursor: 'pointer',
            color: '#8a8880',
          }}
        >
          ✕
        </button>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 12,
          background: '#fef2f2',
          borderRadius: 8,
          border: '1px solid #fecaca',
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        <strong>Platform Readiness: 55%</strong>
        <br />8 critical blockers must be resolved before production.
        <br />
        ~200 endpoints unreachable from client code.
        <br />
        Fastest fix: Mount CMC routes (30 min) → unlocks 90K lines.
      </div>

      {modules.map(mod => (
        <div key={mod.id} style={{ marginTop: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: MODULE_COLORS[mod.id]?.border,
              }}
            />
            <strong style={{ fontSize: 13 }}>{mod.name}</strong>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 12,
                fontWeight: 700,
                color:
                  mod.readiness >= 75 ? '#647746' : mod.readiness >= 50 ? '#ca8a04' : '#dc2626',
              }}
            >
              {mod.readiness}%
            </span>
          </div>

          {/* Gaps */}
          <div style={{ fontSize: 11, marginBottom: 4, color: '#6b6963' }}>
            Gaps: {mod.gaps.length} ({mod.gaps.filter(g => g.severity === 'critical').length}{' '}
            critical)
          </div>
          {mod.gaps.map(gap => (
            <div
              key={gap.id}
              style={{
                fontSize: 10,
                padding: '4px 0',
                borderBottom: '1px solid #f4f3ee',
                display: 'flex',
                gap: 6,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  padding: '1px 6px',
                  borderRadius: 8,
                  background: SEVERITY_COLORS[gap.severity].badge,
                  color: 'white',
                  fontWeight: 600,
                  fontSize: 9,
                  minWidth: 26,
                  textAlign: 'center',
                }}
              >
                {gap.id}
              </span>
              <span>{gap.title}</span>
            </div>
          ))}

          {/* Tasks */}
          <div style={{ fontSize: 11, marginTop: 8, marginBottom: 4, color: '#6b6963' }}>
            Remediation: {mod.tasks.length} tasks
          </div>
          {mod.tasks.slice(0, 5).map(task => (
            <div
              key={task.id}
              style={{
                fontSize: 10,
                padding: '3px 0',
                borderBottom: '1px solid #f4f3ee',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: SEVERITY_COLORS[task.priority].badge,
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1 }}>{task.title}</span>
              <span style={{ color: '#b0aea5', fontSize: 9 }}>{task.effort}</span>
            </div>
          ))}
          {mod.tasks.length > 5 && (
            <div style={{ fontSize: 10, color: '#b0aea5', marginTop: 4 }}>
              + {mod.tasks.length - 5} more tasks
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

type ViewTab = 'overview' | 'roadmap' | 'architecture';

const views: { id: ViewTab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Platform Overview', icon: '📊' },
  { id: 'roadmap', label: 'Remediation Roadmap', icon: '🗓️' },
  { id: 'architecture', label: 'Architecture Flow', icon: '🔌' },
];

export default function PlatformReadinessDashboard() {
  const [activeTab, setActiveTab] = useState<ViewTab>('overview');
  const [showSummary, setShowSummary] = useState(false);

  const toggleSummary = useCallback(() => setShowSummary(v => !v), []);

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Concept2Cure — Platform Readiness Dashboard
          </div>
          <div style={{ fontSize: 12, color: '#b0aea5', marginTop: 2 }}>
            Phase 0–1 Interactive Audit · 3 Modules ·{' '}
            {Object.values(MODULES).reduce((s, m) => s + m.gaps.length, 0)} Gaps ·{' '}
            {Object.values(MODULES).reduce((s, m) => s + m.tasks.length, 0)} Tasks
          </div>
        </div>
        <button
          onClick={toggleSummary}
          style={{
            background: showSummary ? '#8bb4d9' : '#4a4a46',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {showSummary ? '✕ Close Summary' : '📋 Executive Summary'}
        </button>
      </div>

      {/* Tab bar */}
      <div style={tabBarStyle}>
        {views.map(v => (
          <button
            key={v.id}
            style={tabStyle(activeTab === v.id)}
            onClick={() => setActiveTab(v.id)}
          >
            {v.icon} {v.label}
          </button>
        ))}
      </div>

      {/* Quick stats */}
      <QuickStats />

      {/* Flow canvas */}
      <div style={flowContainerStyle}>
        <ReactFlowProvider>
          {activeTab === 'overview' && <OverviewView />}
          {activeTab === 'roadmap' && <RoadmapView />}
          {activeTab === 'architecture' && <ArchitectureView />}
        </ReactFlowProvider>

        {/* Summary panel overlay */}
        <SummaryPanel visible={showSummary} onClose={toggleSummary} />
      </div>
    </div>
  );
}

/**
 * Custom React Flow Node Components for Platform Readiness Dashboard
 *
 * Includes: PlatformHeader, ModuleCard, TemplateItem, EndpointItem,
 *           GapBadge, PhaseHeader, TaskCard, ArchComponent, LayerLabel
 *
 * @version 1.0.0
 */

import React, { memo, useState, useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { SEVERITY_COLORS, MODULE_COLORS, STATUS_ICONS } from './readinessFlowData';
import type {
  ModuleDetail,
  TemplateInfo,
  GapItem,
  RemediationTask,
  ConnectionStatus,
} from './readinessFlowData';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED STYLES
// ─────────────────────────────────────────────────────────────────────────────

const baseNodeStyle: React.CSSProperties = {
  fontFamily: "'Poppins', Arial, sans-serif",
  fontSize: 12,
  borderRadius: 8,
  boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)',
};

const handleStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  background: '#b0aea5',
  border: '2px solid white',
};

// ─────────────────────────────────────────────────────────────────────────────
// READINESS RING (circular progress indicator)
// ─────────────────────────────────────────────────────────────────────────────

const ReadinessRing: React.FC<{ value: number; size?: number; color?: string }> = ({
  value,
  size = 56,
  color,
}) => {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const ringColor = color || (value >= 75 ? '#647746' : value >= 50 ? '#ca8a04' : '#dc2626');

  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e8e6dc" strokeWidth={4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={ringColor}
        strokeWidth={4}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size > 50 ? 14 : 11}
        fontWeight={700}
        fill={ringColor}
      >
        {value}%
      </text>
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. PLATFORM HEADER NODE
// ─────────────────────────────────────────────────────────────────────────────

interface PlatformHeaderData {
  label: string;
  readiness: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export const PlatformHeaderNode: React.FC<NodeProps<PlatformHeaderData>> = memo(({ data }) => {
  return (
    <div
      style={{
        ...baseNodeStyle,
        background: 'linear-gradient(135deg, #141413, #2d2d2a)',
        color: 'white',
        padding: '16px 24px',
        minWidth: 360,
        textAlign: 'center',
      }}
    >
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{data.label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <ReadinessRing value={data.readiness} size={64} />
        <div style={{ textAlign: 'left', fontSize: 11, lineHeight: 1.6 }}>
          <div>
            <span style={{ color: '#fca5a5' }}>●</span> {data.critical} Critical
          </div>
          <div>
            <span style={{ color: '#fdba74' }}>●</span> {data.high} High
          </div>
          <div>
            <span style={{ color: '#fde047' }}>●</span> {data.medium} Medium
          </div>
          <div>
            <span style={{ color: '#c4d6b3' }}>●</span> {data.low} Low
          </div>
        </div>
      </div>
    </div>
  );
});

PlatformHeaderNode.displayName = 'PlatformHeaderNode';

// ─────────────────────────────────────────────────────────────────────────────
// 2. MODULE CARD NODE (expandable)
// ─────────────────────────────────────────────────────────────────────────────

interface ModuleCardData {
  module: ModuleDetail;
}

export const ModuleCardNode: React.FC<NodeProps<ModuleCardData>> = memo(({ data }) => {
  const [expanded, setExpanded] = useState(false);
  const mod = data.module;
  const colors = MODULE_COLORS[mod.id] || MODULE_COLORS.cerv2;

  const liveAI = mod.aiEndpoints.filter(e => e.status === 'live').length;
  const totalAI = mod.aiEndpoints.length;
  const readyTemplates = mod.templates.filter(t => t.status === 'ready').length;
  const totalTemplates = mod.templates.length;

  const toggleExpand = useCallback(() => setExpanded(e => !e), []);

  return (
    <div
      style={{
        ...baseNodeStyle,
        background: colors.bg,
        border: `2px solid ${colors.border}`,
        minWidth: 380,
        overflow: 'hidden',
      }}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />

      {/* Header */}
      <div
        style={{
          background: colors.header,
          color: 'white',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={toggleExpand}
      >
        <span style={{ fontWeight: 700, fontSize: 13 }}>{mod.name}</span>
        <ReadinessRing value={mod.readiness} size={42} color="white" />
      </div>

      {/* Quick stats */}
      <div style={{ padding: '10px 14px', fontSize: 11, lineHeight: 1.7 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          <div>
            📄 Templates:{' '}
            <strong>
              {readyTemplates}/{totalTemplates}
            </strong>
          </div>
          <div>
            🤖 AI Endpoints:{' '}
            <strong>
              {liveAI}/{totalAI}
            </strong>
          </div>
          <div>
            🎨 Canvas: <strong>{mod.canvas ? '✅' : '❌'}</strong>
          </div>
          <div>
            📑 DOCX Factory: <strong>{mod.docxFactory ? '✅' : '❌'}</strong>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            📤 Exports: <strong>{mod.exports.join(', ')}</strong>
          </div>
          <div>
            📁 Client: <strong>{mod.clientFiles} files</strong> (
            {(mod.clientLines / 1000).toFixed(1)}K lines)
          </div>
          <div>
            🖥️ Server: <strong>{mod.serverFiles} files</strong> (
            {(mod.serverLines / 1000).toFixed(1)}K lines)
          </div>
        </div>

        {/* Gap summary bar */}
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {mod.gaps.map(gap => (
            <span
              key={gap.id}
              title={`${gap.id}: ${gap.title}\n${gap.description}`}
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 10,
                fontWeight: 600,
                color: 'white',
                background: SEVERITY_COLORS[gap.severity].badge,
                cursor: 'help',
              }}
            >
              {gap.id}
            </span>
          ))}
        </div>

        {/* Click to expand hint */}
        <div
          style={{
            marginTop: 8,
            textAlign: 'center',
            fontSize: 10,
            color: '#8a8880',
            cursor: 'pointer',
          }}
          onClick={toggleExpand}
        >
          {expanded ? '▲ Collapse details' : '▼ Click to expand templates, endpoints & tasks'}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div
          style={{
            padding: '0 14px 14px',
            fontSize: 11,
            borderTop: `1px solid ${colors.border}40`,
            maxHeight: 500,
            overflowY: 'auto',
          }}
        >
          {/* Templates */}
          <div style={{ fontWeight: 700, marginTop: 8, marginBottom: 4 }}>Templates</div>
          {mod.templates.map((tmpl, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '3px 0',
                borderBottom: '1px solid #f4f3ee',
              }}
            >
              <span>
                {STATUS_ICONS[tmpl.status]} {tmpl.name}
              </span>
              <span style={{ color: '#8a8880' }}>
                {tmpl.docxSeed ? '📑' : '—'} {tmpl.canvasEnabled ? '🎨' : '—'}
              </span>
            </div>
          ))}

          {/* AI Endpoints */}
          <div style={{ fontWeight: 700, marginTop: 10, marginBottom: 4 }}>AI Endpoints</div>
          {mod.aiEndpoints.map((ep, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '3px 0',
                borderBottom: '1px solid #f4f3ee',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
              }}
            >
              <span>{ep.path}</span>
              <span>{STATUS_ICONS[ep.status]}</span>
            </div>
          ))}

          {/* Remediation Tasks */}
          <div style={{ fontWeight: 700, marginTop: 10, marginBottom: 4 }}>Remediation Tasks</div>
          {mod.tasks.map(task => (
            <div
              key={task.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 0',
                borderBottom: '1px solid #f4f3ee',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: SEVERITY_COLORS[task.priority].badge,
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1 }}>{task.title}</span>
              <span style={{ color: '#8a8880', fontSize: 10, whiteSpace: 'nowrap' }}>
                {task.effort}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

ModuleCardNode.displayName = 'ModuleCardNode';

// ─────────────────────────────────────────────────────────────────────────────
// 3. TEMPLATE ITEM NODE (sub-node, hidden by default)
// ─────────────────────────────────────────────────────────────────────────────

interface TemplateItemData {
  template: TemplateInfo;
  moduleId: string;
}

export const TemplateItemNode: React.FC<NodeProps<TemplateItemData>> = memo(({ data }) => {
  const tmpl = data.template;
  return (
    <div
      style={{
        ...baseNodeStyle,
        padding: '6px 12px',
        fontSize: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'white',
        border: '1px solid #e8e6dc',
        minWidth: 180,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ ...handleStyle, width: 6, height: 6 }}
      />
      <span>{STATUS_ICONS[tmpl.status]}</span>
      <span style={{ flex: 1 }}>{tmpl.name}</span>
      <span style={{ color: '#b0aea5' }}>
        {tmpl.docxSeed ? '📑' : ''} {tmpl.canvasEnabled ? '🎨' : ''}
      </span>
    </div>
  );
});

TemplateItemNode.displayName = 'TemplateItemNode';

// ─────────────────────────────────────────────────────────────────────────────
// 4. ENDPOINT ITEM NODE (sub-node, hidden by default)
// ─────────────────────────────────────────────────────────────────────────────

interface EndpointItemData {
  endpoint: { path: string; status: string };
  moduleId: string;
}

export const EndpointItemNode: React.FC<NodeProps<EndpointItemData>> = memo(({ data }) => {
  const ep = data.endpoint;
  return (
    <div
      style={{
        ...baseNodeStyle,
        padding: '4px 10px',
        fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'white',
        border: '1px solid #e8e6dc',
        minWidth: 220,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ ...handleStyle, width: 6, height: 6 }}
      />
      <span>{STATUS_ICONS[ep.status]}</span>
      <span style={{ flex: 1 }}>{ep.path}</span>
    </div>
  );
});

EndpointItemNode.displayName = 'EndpointItemNode';

// ─────────────────────────────────────────────────────────────────────────────
// 5. GAP BADGE NODE
// ─────────────────────────────────────────────────────────────────────────────

interface GapBadgeData {
  gap: GapItem;
}

export const GapBadgeNode: React.FC<NodeProps<GapBadgeData>> = memo(({ data }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const gap = data.gap;
  const colors = SEVERITY_COLORS[gap.severity];

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        style={{
          ...baseNodeStyle,
          background: colors.bg,
          border: `2px solid ${colors.border}`,
          padding: '6px 14px',
          fontSize: 11,
          fontWeight: 700,
          color: colors.text,
          cursor: 'pointer',
          textAlign: 'center',
          minWidth: 70,
        }}
      >
        <Handle
          type="target"
          position={Position.Top}
          style={{ ...handleStyle, width: 6, height: 6 }}
        />
        {gap.id}
        <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2 }}>
          {gap.severity.toUpperCase()}
        </div>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: 8,
            background: '#2d2d2a',
            color: 'white',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 11,
            lineHeight: 1.5,
            width: 280,
            zIndex: 100,
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{gap.title}</div>
          <div style={{ color: '#d6d3c8' }}>{gap.description}</div>
        </div>
      )}
    </div>
  );
});

GapBadgeNode.displayName = 'GapBadgeNode';

// ─────────────────────────────────────────────────────────────────────────────
// 6. PHASE HEADER NODE (Roadmap view)
// ─────────────────────────────────────────────────────────────────────────────

interface PhaseHeaderData {
  phase: { id: string; label: string; dates: string; color: string; module: string };
  taskCount: number;
}

export const PhaseHeaderNode: React.FC<NodeProps<PhaseHeaderData>> = memo(({ data }) => {
  const phase = data.phase;
  return (
    <div
      style={{
        ...baseNodeStyle,
        background: phase.color,
        color: 'white',
        padding: '12px 18px',
        minWidth: 260,
      }}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <Handle type="source" position={Position.Right} id="tasks" style={handleStyle} />
      <div style={{ fontWeight: 700, fontSize: 13 }}>{phase.label}</div>
      <div style={{ fontSize: 11, opacity: 0.9, marginTop: 4 }}>
        📅 {phase.dates} · {data.taskCount} tasks
      </div>
    </div>
  );
});

PhaseHeaderNode.displayName = 'PhaseHeaderNode';

// ─────────────────────────────────────────────────────────────────────────────
// 7. TASK CARD NODE (Roadmap view)
// ─────────────────────────────────────────────────────────────────────────────

interface TaskCardData {
  task: RemediationTask;
}

export const TaskCardNode: React.FC<NodeProps<TaskCardData>> = memo(({ data }) => {
  const task = data.task;
  const colors = SEVERITY_COLORS[task.priority];
  const statusIcon =
    task.status === 'completed' ? '✅' : task.status === 'in-progress' ? '🔄' : '⬜';

  return (
    <div
      style={{
        ...baseNodeStyle,
        background: colors.bg,
        border: `1.5px solid ${colors.border}`,
        padding: '8px 12px',
        minWidth: 240,
        maxWidth: 260,
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ fontSize: 14 }}>{statusIcon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: colors.text }}>{task.id}</div>
          <div style={{ fontSize: 11, marginTop: 2, lineHeight: 1.4 }}>{task.title}</div>
          <div style={{ fontSize: 10, color: '#8a8880', marginTop: 4 }}>
            ⏱ {task.effort}
            {task.dependency && (
              <span style={{ marginLeft: 8, color: '#f59e0b' }}>⤵ {task.dependency}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

TaskCardNode.displayName = 'TaskCardNode';

// ─────────────────────────────────────────────────────────────────────────────
// 8. ARCHITECTURE COMPONENT NODE
// ─────────────────────────────────────────────────────────────────────────────

interface ArchComponentData {
  component: {
    id: string;
    label: string;
    layer: string;
    module: string;
    status: ConnectionStatus;
    detail: string;
  };
}

const statusBorderColors: Record<ConnectionStatus, string> = {
  connected: '#647746',
  broken: '#dc2626',
  unmounted: '#b0aea5',
};

export const ArchComponentNode: React.FC<NodeProps<ArchComponentData>> = memo(({ data }) => {
  const [showDetail, setShowDetail] = useState(false);
  const comp = data.component;
  const borderColor = statusBorderColors[comp.status];
  const moduleColor = MODULE_COLORS[comp.module]?.bg || '#faf9f5';

  return (
    <div
      style={{
        ...baseNodeStyle,
        background: moduleColor,
        border: `2px solid ${borderColor}`,
        padding: '10px 14px',
        minWidth: 190,
        maxWidth: 210,
        cursor: 'pointer',
        position: 'relative',
      }}
      onClick={() => setShowDetail(!showDetail)}
      onMouseEnter={() => setShowDetail(true)}
      onMouseLeave={() => setShowDetail(false)}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>
          {comp.status === 'connected' ? '🟢' : comp.status === 'broken' ? '🔴' : '⚪'}
        </span>
        <span style={{ fontWeight: 700, fontSize: 11 }}>{comp.label}</span>
      </div>
      <div style={{ fontSize: 10, color: '#8a8880' }}>
        {comp.layer === 'client'
          ? '📱'
          : comp.layer === 'server'
            ? '🖥️'
            : comp.layer === 'shadow'
              ? '🐍'
              : '🗄️'}{' '}
        {comp.module.toUpperCase()}
      </div>

      {showDetail && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 8,
            background: '#2d2d2a',
            color: 'white',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 10,
            lineHeight: 1.5,
            width: 240,
            zIndex: 100,
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
          }}
        >
          <div style={{ fontWeight: 700 }}>{comp.label}</div>
          <div style={{ color: '#d6d3c8', marginTop: 4 }}>{comp.detail}</div>
          <div style={{ marginTop: 4 }}>
            Status:{' '}
            <span
              style={{
                color:
                  comp.status === 'connected'
                    ? '#c4d6b3'
                    : comp.status === 'broken'
                      ? '#fca5a5'
                      : '#e8e6dc',
                fontWeight: 600,
              }}
            >
              {comp.status.toUpperCase()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

ArchComponentNode.displayName = 'ArchComponentNode';

// ─────────────────────────────────────────────────────────────────────────────
// 9. LAYER LABEL NODE (Architecture view)
// ─────────────────────────────────────────────────────────────────────────────

interface LayerLabelData {
  label: string;
}

export const LayerLabelNode: React.FC<NodeProps<LayerLabelData>> = memo(({ data }) => {
  return (
    <div
      style={{
        background: 'transparent',
        padding: '4px 12px',
        fontSize: 12,
        fontWeight: 700,
        color: '#6b6963',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
        whiteSpace: 'nowrap',
      }}
    >
      {data.label}
    </div>
  );
});

LayerLabelNode.displayName = 'LayerLabelNode';

// ─────────────────────────────────────────────────────────────────────────────
// NODE TYPE REGISTRY (for ReactFlow)
// ─────────────────────────────────────────────────────────────────────────────

export const nodeTypes = {
  platformHeader: PlatformHeaderNode,
  moduleCard: ModuleCardNode,
  templateItem: TemplateItemNode,
  endpointItem: EndpointItemNode,
  gapBadge: GapBadgeNode,
  phaseHeader: PhaseHeaderNode,
  taskCard: TaskCardNode,
  archComponent: ArchComponentNode,
  layerLabel: LayerLabelNode,
};

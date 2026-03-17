import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  ArrowRight,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CapabilityCluster =
  | 'core'
  | 'intelligence'
  | 'authoring'
  | 'governance'
  | 'operations'
  | 'ai';

export interface CapabilityNode {
  id: string;
  label: string;
  description: string;
  cluster: CapabilityCluster;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  poweredBy: 'dr-sage' | 'ana' | 'both' | 'none';
  connections: string[];
  size?: 'normal' | 'large';
}

export interface CapabilityConstellationProps {
  onExploreCapability?: (capabilityId: string) => void;
  className?: string;
  interactive?: boolean;
}

// ─── Cluster Colors ───────────────────────────────────────────────────────────

const CLUSTER_COLORS: Record<CapabilityCluster, { glow: string; fill: string; text: string; ring: string }> = {
  core: {
    glow: 'rgba(59,130,246,0.6)',
    fill: '#3b82f6',
    text: 'text-blue-400',
    ring: 'ring-blue-500/40',
  },
  intelligence: {
    glow: 'rgba(139,92,246,0.6)',
    fill: '#8b5cf6',
    text: 'text-violet-400',
    ring: 'ring-violet-500/40',
  },
  authoring: {
    glow: 'rgba(16,185,129,0.6)',
    fill: '#10b981',
    text: 'text-emerald-400',
    ring: 'ring-emerald-500/40',
  },
  governance: {
    glow: 'rgba(245,158,11,0.6)',
    fill: '#f59e0b',
    text: 'text-amber-400',
    ring: 'ring-amber-500/40',
  },
  operations: {
    glow: 'rgba(244,63,94,0.6)',
    fill: '#f43f5e',
    text: 'text-rose-400',
    ring: 'ring-rose-500/40',
  },
  ai: {
    glow: 'rgba(99,102,241,0.7)',
    fill: 'url(#aiGradient)',
    text: 'text-indigo-300',
    ring: 'ring-indigo-400/50',
  },
};

// ─── Node Definitions ─────────────────────────────────────────────────────────

export const CAPABILITY_NODES: CapabilityNode[] = [
  // AI Layer (center)
  { id: 'dr-sage', label: 'Dr. Sage', description: 'AI clinical advisor providing real-time guidance across all workflows', cluster: 'ai', x: 42, y: 44, poweredBy: 'dr-sage', connections: ['project-mgmt', 'doc-vault', 'co-author', 'provenance', 'audit-trail', 'compliance-check', 'version-control', 'submission-ops'], size: 'large' },
  { id: 'ana-1', label: 'AnA 1.0', description: 'Advanced analytical engine for evidence synthesis, gap analysis, and regulatory intelligence', cluster: 'ai', x: 58, y: 44, poweredBy: 'ana', connections: ['evidence-graph', 'precedent-search', 'gap-analysis', 'section-drafting', 'dossier-builder', 'readiness-assessment', 'template-engine'], size: 'large' },

  // Core Platform (top-left)
  { id: 'project-mgmt', label: 'Project Management', description: 'Centralized project tracking with milestones, tasks, and team assignments', cluster: 'core', x: 18, y: 20, poweredBy: 'dr-sage', connections: ['dr-sage', 'workflow-engine', 'doc-vault'] },
  { id: 'doc-vault', label: 'Document Vault', description: 'Secure, versioned repository for all regulatory documents and evidence', cluster: 'core', x: 32, y: 14, poweredBy: 'dr-sage', connections: ['dr-sage', 'project-mgmt', 'version-control', 'provenance'] },
  { id: 'workflow-engine', label: 'Workflow Engine', description: 'Configurable workflow automation for review, approval, and submission processes', cluster: 'core', x: 12, y: 38, poweredBy: 'none', connections: ['project-mgmt', 'compliance-check', 'mission-control'] },

  // Intelligence (top-right)
  { id: 'evidence-graph', label: 'Evidence Graph', description: 'Visual knowledge graph connecting evidence across studies and regulatory filings', cluster: 'intelligence', x: 72, y: 16, poweredBy: 'ana', connections: ['ana-1', 'precedent-search', 'gap-analysis'] },
  { id: 'precedent-search', label: 'Precedent Search', description: 'Search historical submissions and regulatory precedents for strategic guidance', cluster: 'intelligence', x: 86, y: 24, poweredBy: 'ana', connections: ['ana-1', 'evidence-graph'] },
  { id: 'gap-analysis', label: 'Gap Analysis', description: 'Identify missing evidence, incomplete sections, and compliance gaps', cluster: 'intelligence', x: 80, y: 38, poweredBy: 'ana', connections: ['ana-1', 'evidence-graph', 'readiness-assessment'] },

  // Authoring (bottom-left)
  { id: 'co-author', label: 'Co-Author', description: 'AI-assisted document authoring with intelligent suggestions and auto-completion', cluster: 'authoring', x: 16, y: 62, poweredBy: 'both', connections: ['dr-sage', 'template-engine', 'section-drafting'] },
  { id: 'template-engine', label: 'Template Engine', description: 'Regulatory-compliant document templates with smart field population', cluster: 'authoring', x: 28, y: 72, poweredBy: 'ana', connections: ['ana-1', 'co-author', 'section-drafting'] },
  { id: 'section-drafting', label: 'Section Drafting', description: 'AI-generated first drafts of regulatory document sections', cluster: 'authoring', x: 18, y: 82, poweredBy: 'ana', connections: ['ana-1', 'co-author', 'template-engine'] },
  { id: 'version-control', label: 'Version Control', description: 'Full version history with diff comparison and rollback capabilities', cluster: 'authoring', x: 36, y: 84, poweredBy: 'dr-sage', connections: ['dr-sage', 'doc-vault'] },

  // Governance (bottom-right area)
  { id: 'provenance', label: 'Provenance', description: 'Complete data lineage tracking from source to final document placement', cluster: 'governance', x: 62, y: 68, poweredBy: 'dr-sage', connections: ['dr-sage', 'audit-trail', 'doc-vault'] },
  { id: 'audit-trail', label: 'Audit Trail', description: 'Immutable record of all actions, changes, and decisions for regulatory compliance', cluster: 'governance', x: 72, y: 76, poweredBy: 'dr-sage', connections: ['dr-sage', 'provenance', 'compliance-check'] },
  { id: 'compliance-check', label: 'Compliance Check', description: 'Automated compliance validation against regulatory requirements and guidelines', cluster: 'governance', x: 82, y: 66, poweredBy: 'both', connections: ['dr-sage', 'audit-trail', 'workflow-engine', 'mission-control'] },
  { id: 'mission-control', label: 'Mission Control', description: 'Executive dashboard for submission readiness and team performance metrics', cluster: 'governance', x: 88, y: 80, poweredBy: 'none', connections: ['compliance-check', 'workflow-engine', 'readiness-assessment'] },

  // Operations (right side)
  { id: 'submission-ops', label: 'Submission Ops', description: 'End-to-end submission operations management and tracking', cluster: 'operations', x: 88, y: 50, poweredBy: 'dr-sage', connections: ['dr-sage', 'export', 'dossier-builder'] },
  { id: 'export', label: 'Export', description: 'Multi-format export with regulatory-compliant packaging and validation', cluster: 'operations', x: 78, y: 56, poweredBy: 'none', connections: ['submission-ops', 'dossier-builder'] },
  { id: 'dossier-builder', label: 'Dossier Builder', description: 'Structured assembly of regulatory dossiers with eCTD compliance', cluster: 'operations', x: 66, y: 56, poweredBy: 'ana', connections: ['ana-1', 'submission-ops', 'export', 'readiness-assessment'] },
  { id: 'readiness-assessment', label: 'Readiness Assessment', description: 'Comprehensive submission readiness scoring and remediation tracking', cluster: 'operations', x: 82, y: 44, poweredBy: 'both', connections: ['ana-1', 'gap-analysis', 'dossier-builder', 'mission-control'] },
];

// ─── Star Field ───────────────────────────────────────────────────────────────

function StarField() {
  const stars = useMemo(() => {
    const result: { x: number; y: number; size: number; opacity: number; delay: number }[] = [];
    for (let i = 0; i < 120; i++) {
      result.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.4 + 0.1,
        delay: Math.random() * 4,
      });
    }
    return result;
  }, []);

  return (
    <g className="star-field">
      {stars.map((star, i) => (
        <circle
          key={i}
          cx={`${star.x}%`}
          cy={`${star.y}%`}
          r={star.size}
          fill="white"
          opacity={star.opacity}
        >
          <animate
            attributeName="opacity"
            values={`${star.opacity};${star.opacity * 0.3};${star.opacity}`}
            dur={`${3 + star.delay}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
    </g>
  );
}

// ─── Connection Lines ─────────────────────────────────────────────────────────

interface ConnectionLineProps {
  from: CapabilityNode;
  to: CapabilityNode;
  highlighted: boolean;
  isAI: boolean;
}

function ConnectionLine({ from, to, highlighted, isAI }: ConnectionLineProps) {
  return (
    <line
      x1={`${from.x}%`}
      y1={`${from.y}%`}
      x2={`${to.x}%`}
      y2={`${to.y}%`}
      stroke={highlighted ? 'rgba(167,139,250,0.8)' : 'rgba(148,163,184,0.15)'}
      strokeWidth={isAI ? (highlighted ? 2.5 : 1.5) : highlighted ? 2 : 1}
      strokeDasharray={highlighted ? '6 3' : 'none'}
      style={{
        transition: 'stroke 0.4s ease, stroke-width 0.4s ease, opacity 0.4s ease',
        opacity: highlighted ? 1 : 0.5,
      }}
    >
      {highlighted && (
        <animate
          attributeName="stroke-dashoffset"
          values="0;-18"
          dur="1s"
          repeatCount="indefinite"
        />
      )}
    </line>
  );
}

// ─── Constellation Node ───────────────────────────────────────────────────────

interface ConstellationNodeProps {
  node: CapabilityNode;
  isHovered: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
  autoAnimate: boolean;
}

function ConstellationNode({
  node,
  isHovered,
  isSelected,
  isDimmed,
  onHover,
  onClick,
  autoAnimate,
}: ConstellationNodeProps) {
  const colors = CLUSTER_COLORS[node.cluster];
  const isLarge = node.size === 'large';
  const r = isLarge ? 18 : 10;
  const isAI = node.cluster === 'ai';

  return (
    <g
      style={{
        cursor: 'pointer',
        transition: 'opacity 0.4s ease',
        opacity: isDimmed ? 0.2 : 1,
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(node.id)}
    >
      {/* Glow */}
      {(isHovered || isSelected || (autoAnimate && isAI)) && (
        <circle
          cx={`${node.x}%`}
          cy={`${node.y}%`}
          r={r + 12}
          fill="none"
          stroke={colors.glow}
          strokeWidth={2}
          opacity={0.5}
        >
          <animate
            attributeName="r"
            values={`${r + 8};${r + 16};${r + 8}`}
            dur="2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.5;0.2;0.5"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* Main circle */}
      <circle
        cx={`${node.x}%`}
        cy={`${node.y}%`}
        r={r}
        fill={isAI ? 'url(#aiGradient)' : colors.fill}
        stroke={isHovered || isSelected ? 'white' : 'rgba(255,255,255,0.2)'}
        strokeWidth={isHovered || isSelected ? 2 : 1}
        style={{ transition: 'stroke 0.3s, stroke-width 0.3s' }}
      />

      {/* AI breathing animation */}
      {isAI && autoAnimate && (
        <circle
          cx={`${node.x}%`}
          cy={`${node.y}%`}
          r={r}
          fill="none"
          stroke="rgba(167,139,250,0.4)"
          strokeWidth={1.5}
        >
          <animate
            attributeName="r"
            values={`${r};${r + 6};${r}`}
            dur="3s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.6;0;0.6"
            dur="3s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* Label */}
      <text
        x={`${node.x}%`}
        y={`${node.y + (isLarge ? 4 : 3.2)}%`}
        textAnchor="middle"
        dy="1.2em"
        fill={isDimmed ? 'rgba(148,163,184,0.3)' : 'rgba(226,232,240,0.9)'}
        fontSize={isLarge ? 12 : 10}
        fontWeight={isLarge ? 600 : 400}
        style={{ transition: 'fill 0.4s ease', pointerEvents: 'none', userSelect: 'none' }}
      >
        {node.label}
      </text>
    </g>
  );
}

// ─── Node Detail Panel ────────────────────────────────────────────────────────

interface NodeDetailPanelProps {
  node: CapabilityNode;
  position: { x: number; y: number };
  onClose: () => void;
  onExplore?: (id: string) => void;
}

function NodeDetailPanel({ node, position, onClose, onExplore }: NodeDetailPanelProps) {
  const colors = CLUSTER_COLORS[node.cluster];
  const relatedNodes = CAPABILITY_NODES.filter(
    (n) => node.connections.includes(n.id) && n.id !== node.id
  );

  const poweredLabel =
    node.poweredBy === 'both'
      ? 'Dr. Sage + AnA 1.0'
      : node.poweredBy === 'dr-sage'
      ? 'Dr. Sage'
      : node.poweredBy === 'ana'
      ? 'AnA 1.0'
      : 'Platform Native';

  // Position panel to the right of node, or left if too far right
  const panelLeft = position.x > 65 ? position.x - 30 : position.x + 5;
  const panelTop = Math.max(5, Math.min(position.y - 5, 60));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="absolute z-20 w-72 rounded-xl border border-slate-700/60 bg-slate-900/95 backdrop-blur-xl shadow-2xl"
      style={{ left: `${panelLeft}%`, top: `${panelTop}%` }}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className={cn('font-semibold text-sm', colors.text)}>{node.label}</h3>
            <Badge variant="outline" className="mt-1 text-[10px] border-slate-600 text-slate-400">
              {node.cluster.charAt(0).toUpperCase() + node.cluster.slice(1)}
            </Badge>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-slate-500 hover:text-slate-300 transition-colors p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-400 leading-relaxed mb-3">{node.description}</p>

        {/* Powered by */}
        <div className="flex items-center gap-1.5 mb-3">
          <Sparkles className="w-3 h-3 text-violet-400" />
          <span className="text-[10px] text-violet-300 font-medium">Powered by {poweredLabel}</span>
        </div>

        {/* Related capabilities */}
        {relatedNodes.length > 0 && (
          <div className="mb-3">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
              Connected to
            </span>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {relatedNodes.slice(0, 5).map((rn) => (
                <span
                  key={rn.id}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/50"
                >
                  {rn.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        {onExplore && (
          <Button
            size="sm"
            className="w-full h-8 text-xs bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 border-0"
            onClick={(e) => {
              e.stopPropagation();
              onExplore(node.id);
            }}
          >
            Explore in Enablement Center
            <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CapabilityConstellation({
  onExploreCapability,
  className,
  interactive = true,
}: CapabilityConstellationProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [autoIndex, setAutoIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-animate mode: cycle through nodes
  useEffect(() => {
    if (interactive) return;
    const interval = setInterval(() => {
      setAutoIndex((prev) => (prev + 1) % CAPABILITY_NODES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [interactive]);

  const autoHighlightedId = !interactive ? CAPABILITY_NODES[autoIndex]?.id : null;
  const activeId = hoveredNode || autoHighlightedId;

  const activeNode = useMemo(
    () => CAPABILITY_NODES.find((n) => n.id === activeId) || null,
    [activeId]
  );

  const activeConnections = useMemo(() => {
    if (!activeNode) return new Set<string>();
    const set = new Set<string>(activeNode.connections);
    set.add(activeNode.id);
    return set;
  }, [activeNode]);

  // Compute unique connections for SVG lines
  const connectionPairs = useMemo(() => {
    const pairs: { from: CapabilityNode; to: CapabilityNode; isAI: boolean }[] = [];
    const seen = new Set<string>();
    for (const node of CAPABILITY_NODES) {
      for (const connId of node.connections) {
        const key = [node.id, connId].sort().join('--');
        if (seen.has(key)) continue;
        seen.add(key);
        const target = CAPABILITY_NODES.find((n) => n.id === connId);
        if (target) {
          pairs.push({
            from: node,
            to: target,
            isAI: node.cluster === 'ai' || target.cluster === 'ai',
          });
        }
      }
    }
    return pairs;
  }, []);

  const handleNodeClick = useCallback(
    (id: string) => {
      if (!interactive) return;
      setSelectedNode((prev) => (prev === id ? null : id));
    },
    [interactive]
  );

  const selectedNodeData = useMemo(
    () => CAPABILITY_NODES.find((n) => n.id === selectedNode) || null,
    [selectedNode]
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800/50',
        className
      )}
      style={{ aspectRatio: '16/10' }}
      onClick={() => { if (selectedNode) setSelectedNode(null); }}
    >
      {/* SVG Canvas */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="aiGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>

        <StarField />

        {/* Connection lines */}
        {connectionPairs.map(({ from, to, isAI }) => {
          const highlighted =
            activeConnections.has(from.id) && activeConnections.has(to.id);
          return (
            <ConnectionLine
              key={`${from.id}--${to.id}`}
              from={from}
              to={to}
              highlighted={highlighted}
              isAI={isAI}
            />
          );
        })}
      </svg>

      {/* Node layer rendered as an SVG overlay for hit targets */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="aiGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        {CAPABILITY_NODES.map((node) => {
          const isHovered = hoveredNode === node.id;
          const isSelected = selectedNode === node.id;
          const isDimmed = activeId !== null && !activeConnections.has(node.id);

          return (
            <ConstellationNode
              key={node.id}
              node={node}
              isHovered={isHovered}
              isSelected={isSelected}
              isDimmed={isDimmed}
              onHover={interactive ? setHoveredNode : () => {}}
              onClick={handleNodeClick}
              autoAnimate={!interactive}
            />
          );
        })}
      </svg>

      {/* Cluster legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
        {(
          [
            ['core', 'Core Platform', 'bg-blue-500'],
            ['intelligence', 'Intelligence', 'bg-violet-500'],
            ['authoring', 'Authoring', 'bg-emerald-500'],
            ['governance', 'Governance', 'bg-amber-500'],
            ['operations', 'Operations', 'bg-rose-500'],
            ['ai', 'AI Layer', 'bg-gradient-to-r from-blue-500 to-violet-500'],
          ] as const
        ).map(([, label, bg]) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', bg)} />
            <span className="text-[10px] text-slate-500">{label}</span>
          </div>
        ))}
      </div>

      {/* Node detail panel */}
      <AnimatePresence>
        {selectedNodeData && interactive && (
          <NodeDetailPanel
            key={selectedNodeData.id}
            node={selectedNodeData}
            position={{ x: selectedNodeData.x, y: selectedNodeData.y }}
            onClose={() => setSelectedNode(null)}
            onExplore={onExploreCapability}
          />
        )}
      </AnimatePresence>

      {/* Showcase mode label */}
      {!interactive && (
        <div className="absolute top-3 right-3">
          <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-500 bg-slate-900/80">
            <Sparkles className="w-2.5 h-2.5 mr-1" />
            Platform Constellation
          </Badge>
        </div>
      )}
    </div>
  );
}

export default CapabilityConstellation;

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

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
  x: number;
  y: number;
  poweredBy: 'dr-sage' | 'ana' | 'both' | 'none';
  connections: string[];
  size?: 'normal' | 'large';
}

export interface CapabilityConstellationProps {
  onExploreCapability?: (capabilityId: string) => void;
  className?: string;
  interactive?: boolean;
}

// ─── Cluster Labels ─────────────────────────────────────────────────────────

const CLUSTER_LABELS: Record<CapabilityCluster, string> = {
  core: 'Core Platform',
  intelligence: 'Intelligence',
  authoring: 'Authoring',
  governance: 'Governance',
  operations: 'Operations',
  ai: 'AI Layer',
};

// ─── Node Definitions ───────────────────────────────────────────────────────

export const CAPABILITY_NODES: CapabilityNode[] = [
  { id: 'dr-sage', label: 'Dr. Sage', description: 'AI clinical advisor providing real-time guidance across all workflows', cluster: 'ai', x: 42, y: 44, poweredBy: 'dr-sage', connections: ['project-mgmt', 'doc-vault', 'co-author', 'provenance', 'audit-trail', 'compliance-check', 'version-control', 'submission-ops'], size: 'large' },
  { id: 'ana-1', label: 'AnA 1.0', description: 'Advanced analytical engine for evidence synthesis, gap analysis, and regulatory intelligence', cluster: 'ai', x: 58, y: 44, poweredBy: 'ana', connections: ['evidence-graph', 'precedent-search', 'gap-analysis', 'section-drafting', 'dossier-builder', 'readiness-assessment', 'template-engine'], size: 'large' },
  { id: 'project-mgmt', label: 'Project Management', description: 'Centralized project tracking with milestones, tasks, and team assignments', cluster: 'core', x: 18, y: 20, poweredBy: 'dr-sage', connections: ['dr-sage', 'workflow-engine', 'doc-vault'] },
  { id: 'doc-vault', label: 'Document Vault', description: 'Secure, versioned repository for all regulatory documents and evidence', cluster: 'core', x: 32, y: 14, poweredBy: 'dr-sage', connections: ['dr-sage', 'project-mgmt', 'version-control', 'provenance'] },
  { id: 'workflow-engine', label: 'Workflow Engine', description: 'Configurable workflow automation for review, approval, and submission processes', cluster: 'core', x: 12, y: 38, poweredBy: 'none', connections: ['project-mgmt', 'compliance-check', 'mission-control'] },
  { id: 'evidence-graph', label: 'Evidence Graph', description: 'Visual knowledge graph connecting evidence across studies and regulatory filings', cluster: 'intelligence', x: 72, y: 16, poweredBy: 'ana', connections: ['ana-1', 'precedent-search', 'gap-analysis'] },
  { id: 'precedent-search', label: 'Precedent Search', description: 'Search historical submissions and regulatory precedents for strategic guidance', cluster: 'intelligence', x: 86, y: 24, poweredBy: 'ana', connections: ['ana-1', 'evidence-graph'] },
  { id: 'gap-analysis', label: 'Gap Analysis', description: 'Identify missing evidence, incomplete sections, and compliance gaps', cluster: 'intelligence', x: 80, y: 38, poweredBy: 'ana', connections: ['ana-1', 'evidence-graph', 'readiness-assessment'] },
  { id: 'co-author', label: 'Co-Author', description: 'AI-assisted document authoring with intelligent suggestions and auto-completion', cluster: 'authoring', x: 16, y: 62, poweredBy: 'both', connections: ['dr-sage', 'template-engine', 'section-drafting'] },
  { id: 'template-engine', label: 'Template Engine', description: 'Regulatory-compliant document templates with smart field population', cluster: 'authoring', x: 28, y: 72, poweredBy: 'ana', connections: ['ana-1', 'co-author', 'section-drafting'] },
  { id: 'section-drafting', label: 'Section Drafting', description: 'AI-generated first drafts of regulatory document sections', cluster: 'authoring', x: 18, y: 82, poweredBy: 'ana', connections: ['ana-1', 'co-author', 'template-engine'] },
  { id: 'version-control', label: 'Version Control', description: 'Full version history with diff comparison and rollback capabilities', cluster: 'authoring', x: 36, y: 84, poweredBy: 'dr-sage', connections: ['dr-sage', 'doc-vault'] },
  { id: 'provenance', label: 'Provenance', description: 'Complete data lineage tracking from source to final document placement', cluster: 'governance', x: 62, y: 68, poweredBy: 'dr-sage', connections: ['dr-sage', 'audit-trail', 'doc-vault'] },
  { id: 'audit-trail', label: 'Audit Trail', description: 'Immutable record of all actions, changes, and decisions for regulatory compliance', cluster: 'governance', x: 72, y: 76, poweredBy: 'dr-sage', connections: ['dr-sage', 'provenance', 'compliance-check'] },
  { id: 'compliance-check', label: 'Compliance Check', description: 'Automated compliance validation against regulatory requirements and guidelines', cluster: 'governance', x: 82, y: 66, poweredBy: 'both', connections: ['dr-sage', 'audit-trail', 'workflow-engine', 'mission-control'] },
  { id: 'mission-control', label: 'Mission Control', description: 'Executive dashboard for submission readiness and team performance metrics', cluster: 'governance', x: 88, y: 80, poweredBy: 'none', connections: ['compliance-check', 'workflow-engine', 'readiness-assessment'] },
  { id: 'submission-ops', label: 'Submission Ops', description: 'End-to-end submission operations management and tracking', cluster: 'operations', x: 88, y: 50, poweredBy: 'dr-sage', connections: ['dr-sage', 'export', 'dossier-builder'] },
  { id: 'export', label: 'Export', description: 'Multi-format export with regulatory-compliant packaging and validation', cluster: 'operations', x: 78, y: 56, poweredBy: 'none', connections: ['submission-ops', 'dossier-builder'] },
  { id: 'dossier-builder', label: 'Dossier Builder', description: 'Structured assembly of regulatory dossiers with eCTD compliance', cluster: 'operations', x: 66, y: 56, poweredBy: 'ana', connections: ['ana-1', 'submission-ops', 'export', 'readiness-assessment'] },
  { id: 'readiness-assessment', label: 'Readiness Assessment', description: 'Comprehensive submission readiness scoring and remediation tracking', cluster: 'operations', x: 82, y: 44, poweredBy: 'both', connections: ['ana-1', 'gap-analysis', 'dossier-builder', 'mission-control'] },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function poweredByLabel(poweredBy: CapabilityNode['poweredBy']): string {
  switch (poweredBy) {
    case 'both': return 'Dr. Sage + AnA 1.0';
    case 'dr-sage': return 'Dr. Sage';
    case 'ana': return 'AnA 1.0';
    default: return 'Platform Native';
  }
}

// ─── Capability Item ────────────────────────────────────────────────────────

function CapabilityItem({
  node,
  isExpanded,
  onToggle,
  onExplore,
}: {
  node: CapabilityNode;
  isExpanded: boolean;
  onToggle: () => void;
  onExplore?: (id: string) => void;
}) {
  const connectedNodes = useMemo(
    () =>
      CAPABILITY_NODES.filter(
        (n) => node.connections.includes(n.id) && n.id !== node.id
      ),
    [node]
  );

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full text-left py-1.5 px-2 rounded hover:bg-zinc-50 transition-colors duration-150"
      >
        <span className="text-sm text-zinc-700">{node.label}</span>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="pl-4 pr-2 pb-3 space-y-2">
              <p className="text-xs text-zinc-500 leading-relaxed">
                {node.description}
              </p>
              <p className="text-xs text-zinc-400">
                Powered by {poweredByLabel(node.poweredBy)}
              </p>
              {connectedNodes.length > 0 && (
                <p className="text-xs text-zinc-400">
                  Connected to: {connectedNodes.map((n) => n.label).join(', ')}
                </p>
              )}
              {onExplore && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onExplore(node.id);
                  }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Explore &rarr;
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CapabilityConstellation({
  onExploreCapability,
  className,
  interactive = true,
}: CapabilityConstellationProps) {
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  const clusters = useMemo(() => {
    const groups: Record<CapabilityCluster, CapabilityNode[]> = {
      ai: [],
      core: [],
      intelligence: [],
      authoring: [],
      governance: [],
      operations: [],
    };
    for (const node of CAPABILITY_NODES) {
      groups[node.cluster].push(node);
    }
    return groups;
  }, []);

  const clusterOrder: CapabilityCluster[] = [
    'ai',
    'core',
    'intelligence',
    'authoring',
    'governance',
    'operations',
  ];

  const handleToggle = useCallback(
    (id: string) => {
      if (!interactive) return;
      setExpandedNode((prev) => (prev === id ? null : id));
    },
    [interactive]
  );

  return (
    <div className={cn('w-full bg-white border border-zinc-200 rounded-lg p-6', className)}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clusterOrder.map((cluster) => {
          const nodes = clusters[cluster];
          if (nodes.length === 0) return null;

          return (
            <div key={cluster}>
              <h3 className="text-xs uppercase tracking-wider text-zinc-400 mb-2">
                {CLUSTER_LABELS[cluster]}
              </h3>
              <div className="space-y-0.5">
                {nodes.map((node) => (
                  <CapabilityItem
                    key={node.id}
                    node={node}
                    isExpanded={expandedNode === node.id}
                    onToggle={() => handleToggle(node.id)}
                    onExplore={onExploreCapability}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CapabilityConstellation;

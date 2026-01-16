import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

type NodeType = 'module' | 'section' | 'subsection';

type NodeStatus = 'complete' | 'incomplete' | 'error' | 'draft';

interface TreeNode {
  id: string;
  title: string;
  section: string;
  type: NodeType;
  status: NodeStatus;
  required: boolean;
  children?: TreeNode[];
  validationIssues?: number;
}

interface DocumentStructureProps {
  documentId: string;
  region: 'FDA' | 'EMA' | 'PMDA' | 'WHO';
}

const sectionIcons: Record<NodeType, React.ReactNode> = {
  module: <Folder className="h-4 w-4 text-indigo-500" />,
  section: <FileText className="h-4 w-4 text-slate-500" />,
  subsection: <FileText className="h-4 w-4 text-slate-400" />,
};

const statusIcon = (status: NodeStatus, issues?: number) => {
  if (issues && issues > 0) {
    return <AlertCircle className="h-4 w-4 text-amber-500" />;
  }

  switch (status) {
    case 'complete':
      return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <FileText className="h-4 w-4 text-slate-400" />;
  }
};

export default function DocumentStructure({ documentId, region }: DocumentStructureProps) {
  void documentId;
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['3.2.P']));
  const [selectedNode, setSelectedNode] = useState<string>('3.2.P.1');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStructure = async () => {
      setLoading(true);
      try {
        const structure = generateCTDStructure(region);
        setTreeData(structure);
      } catch (error) {
        console.error('Failed to load structure', error);
      } finally {
        setLoading(false);
      }
    };

    loadStructure();
  }, [region]);

  const generateCTDStructure = (activeRegion: string): TreeNode[] => {
    const base: TreeNode[] = [
      {
        id: '3.2.P',
        title: 'Drug Product',
        section: '3.2.P',
        type: 'module',
        status: 'draft',
        required: true,
        children: [
          {
            id: '3.2.P.1',
            title: 'Description and Composition',
            section: '3.2.P.1',
            type: 'section',
            status: 'complete',
            required: true,
          },
          {
            id: '3.2.P.2',
            title: 'Pharmaceutical Development',
            section: '3.2.P.2',
            type: 'section',
            status: 'incomplete',
            required: true,
            validationIssues: 3,
            children: [
              {
                id: '3.2.P.2.1',
                title: 'Components of the Drug Product',
                section: '3.2.P.2.1',
                type: 'subsection',
                status: 'complete',
                required: true,
              },
              {
                id: '3.2.P.2.2',
                title: 'Drug Product',
                section: '3.2.P.2.2',
                type: 'subsection',
                status: 'draft',
                required: true,
                validationIssues: 2,
              },
              {
                id: '3.2.P.2.3',
                title: 'Manufacturing Process Development',
                section: '3.2.P.2.3',
                type: 'subsection',
                status: 'error',
                required: true,
                validationIssues: 1,
              },
            ],
          },
          {
            id: '3.2.P.3',
            title: 'Manufacture',
            section: '3.2.P.3',
            type: 'section',
            status: 'draft',
            required: true,
            children: [
              {
                id: '3.2.P.3.1',
                title: 'Manufacturer(s)',
                section: '3.2.P.3.1',
                type: 'subsection',
                status: 'complete',
                required: true,
              },
              {
                id: '3.2.P.3.2',
                title: 'Batch Formula',
                section: '3.2.P.3.2',
                type: 'subsection',
                status: 'draft',
                required: true,
              },
            ],
          },
          {
            id: '3.2.P.4',
            title: 'Control of Excipients',
            section: '3.2.P.4',
            type: 'section',
            status: 'draft',
            required: true,
          },
          {
            id: '3.2.P.5',
            title: 'Control of Drug Product',
            section: '3.2.P.5',
            type: 'section',
            status: 'incomplete',
            required: true,
            validationIssues: 5,
            children: [
              {
                id: '3.2.P.5.1',
                title: 'Specification',
                section: '3.2.P.5.1',
                type: 'subsection',
                status: 'incomplete',
                required: true,
                validationIssues: 3,
              },
              {
                id: '3.2.P.5.2',
                title: 'Analytical Procedures',
                section: '3.2.P.5.2',
                type: 'subsection',
                status: 'draft',
                required: true,
              },
            ],
          },
          {
            id: '3.2.P.8',
            title: 'Stability',
            section: '3.2.P.8',
            type: 'section',
            status: 'draft',
            required: true,
            children: [
              {
                id: '3.2.P.8.1',
                title: 'Stability Summary and Conclusions',
                section: '3.2.P.8.1',
                type: 'subsection',
                status: 'draft',
                required: true,
              },
              {
                id: '3.2.P.8.2',
                title: 'Post-marketing Stability Protocol',
                section: '3.2.P.8.2',
                type: 'subsection',
                status: 'draft',
                required: activeRegion === 'FDA',
              },
            ],
          },
        ],
      },
    ];

    if (activeRegion === 'EMA') {
      base[0].children?.push({
        id: '3.2.P.9',
        title: 'Environmental Risk Assessment',
        section: '3.2.P.9',
        type: 'section',
        status: 'draft',
        required: true,
      });
    }

    return base;
  };

  const toggleNode = (nodeId: string) => {
    const next = new Set(expandedNodes);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    setExpandedNodes(next);
  };

  const selectNode = (nodeId: string) => {
    setSelectedNode(nodeId);
    window.dispatchEvent(
      new CustomEvent('navigateToSection', {
        detail: { sectionId: nodeId },
      }),
    );
  };

  const renderTreeNode = (node: TreeNode, depth = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNode === node.id;
    const hasChildren = Boolean(node.children && node.children.length > 0);

    return (
      <li key={node.id}>
        <div
          className={cn(
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
            isSelected ? 'bg-white/80 text-gray-900 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.2)]' : 'text-gray-600 hover:bg-gray-100',
            !node.required && 'opacity-60',
          )}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
          onClick={() => selectNode(node.id)}
          data-testid={`tree-node-${node.id}`}
        >
          {hasChildren ? (
            <Button
              variant="ghost"
              size="sm"
              className="mr-1 h-5 w-5 p-0 text-gray-500 hover:text-gray-700"
              onClick={event => {
                event.stopPropagation();
                toggleNode(node.id);
              }}
              data-testid={`expand-${node.id}`}
            >
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
          ) : (
            <span className="mr-1 h-5 w-5" />
          )}

          <span>{sectionIcons[node.type]}</span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] text-gray-700">
              <span className="mr-2 text-xs uppercase tracking-wider text-gray-400">{node.section}</span>
              {node.title}
            </span>
            {node.validationIssues && node.validationIssues > 0 ? (
              <span className="text-[11px] text-amber-600">
                {node.validationIssues} issue{node.validationIssues !== 1 ? 's' : ''}
              </span>
            ) : null}
          </div>
          <span>{statusIcon(node.status, node.validationIssues)}</span>
        </div>

        {hasChildren && isExpanded ? (
          <ul>{node.children?.map(child => renderTreeNode(child, depth + 1))}</ul>
        ) : null}
      </li>
    );
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col gap-2 px-4 py-6 text-sm text-gray-400">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-4 w-full animate-pulse rounded bg-gray-200/70" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-4">
        <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Document Structure</p>
        <p className="mt-1 text-sm font-semibold text-gray-700">{region} CTD Module 3.2.P</p>
      </div>
      <ScrollArea className="flex-1">
        <ul className="space-y-0.5 pb-8 pr-2">{treeData.map(node => renderTreeNode(node))}</ul>
      </ScrollArea>
    </div>
  );
}

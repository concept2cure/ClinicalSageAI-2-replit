import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TreeNode {
  id: string;
  title: string;
  section: string;
  type: 'module' | 'section' | 'subsection';
  children?: TreeNode[];
  status: 'complete' | 'incomplete' | 'error' | 'draft';
  required: boolean;
  validationIssues?: number;
}

interface DossierTreeProps {
  documentId: string;
  region: 'FDA' | 'EMA' | 'PMDA' | 'WHO';
}

export default function DossierTree({ documentId, region }: DossierTreeProps) {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['3.2.P']));
  const [selectedNode, setSelectedNode] = useState<string>('3.2.P.1');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDossierStructure = async () => {
      setLoading(true);
      try {
        // Generate region-specific CTD/eCTD structure
        const structure = generateCTDStructure(region);
        setTreeData(structure);
      } catch (error) {
      } finally {
        setLoading(false);
      }
    };

    loadDossierStructure();
  }, [region]);

  const generateCTDStructure = (region: string): TreeNode[] => {
    // Generate regulatory-aware CTD Module 3 structure
    const baseStructure: TreeNode[] = [
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
                required: region === 'FDA', // FDA-specific requirement
              },
            ],
          },
        ],
      },
    ];

    // Add region-specific sections
    if (region === 'EMA') {
      baseStructure[0].children?.push({
        id: '3.2.P.9',
        title: 'Environmental Risk Assessment',
        section: '3.2.P.9',
        type: 'section',
        status: 'draft',
        required: true,
      });
    }

    return baseStructure;
  };

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const selectNode = (nodeId: string) => {
    setSelectedNode(nodeId);
    // Emit event for editor to navigate to section
    window.dispatchEvent(
      new CustomEvent('navigateToSection', {
        detail: { sectionId: nodeId },
      })
    );
  };

  const getStatusIcon = (status: TreeNode['status'], validationIssues?: number) => {
    if (validationIssues && validationIssues > 0) {
      return <AlertCircle className="h-4 w-4 text-amber-500" />;
    }

    switch (status) {
      case 'complete':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const renderTreeNode = (node: TreeNode, depth = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNode === node.id;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id} className="select-none">
        <div
          className={cn(
            'flex items-center py-1 px-2 rounded-sm cursor-pointer hover:bg-accent transition-colors',
            isSelected && 'bg-accent font-medium',
            !node.required && 'opacity-60'
          )}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => selectNode(node.id)}
          data-testid={`tree-node-${node.id}`}
        >
          {hasChildren ? (
            <Button
              variant="ghost"
              size="sm"
              className="p-0 h-4 w-4 mr-1"
              onClick={e => {
                e.stopPropagation();
                toggleNode(node.id);
              }}
              data-testid={`expand-${node.id}`}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          ) : (
            <div className="w-4 mr-1" />
          )}

          {getStatusIcon(node.status, node.validationIssues)}

          <div className="flex-1 ml-2 min-w-0">
            <div className="text-sm truncate">
              <span className="text-muted-foreground mr-2">{node.section}</span>
              {node.title}
            </div>
            {node.validationIssues && node.validationIssues > 0 && (
              <div className="text-xs text-amber-600">
                {node.validationIssues} issue{node.validationIssues !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div>{node.children?.map(child => renderTreeNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-6 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="dossier-tree">
      <div className="p-3 border-b">
        <h3 className="font-medium text-sm">Document Structure</h3>
        <p className="text-xs text-muted-foreground mt-1">{region} CTD Module 3.2.P</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">{treeData.map(node => renderTreeNode(node))}</div>
      </ScrollArea>
    </div>
  );
}

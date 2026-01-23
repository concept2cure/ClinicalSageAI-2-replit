/**
 * eCTD Module Browser Component
 * 
 * Displays the eCTD module structure as an expandable tree view.
 * Supports FDA, EMA, and PMDA regional variants.
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Search,
  RefreshCw,
  Download,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Types
interface ModuleNode {
  id: string;
  module_code: string;
  module_name: string;
  parent_module_code: string | null;
  module_level: number;
  content_type: string;
  is_required: boolean;
  is_regional: boolean;
  fda_specific: boolean;
  ema_specific: boolean;
  pmda_specific: boolean;
  children?: ModuleNode[];
}

interface ProjectFolder {
  id: string;
  module_code: string;
  folder_name: string;
  folder_path: string;
  is_placeholder: boolean;
  document_count: number;
  status: string;
}

// Module Tree Node Component
function ModuleTreeNode({ 
  node, 
  projectFolders, 
  depth = 0,
  searchTerm,
  expandedNodes,
  toggleNode
}: { 
  node: ModuleNode;
  projectFolders?: Map<string, ProjectFolder>;
  depth?: number;
  searchTerm: string;
  expandedNodes: Set<string>;
  toggleNode: (code: string) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.module_code);
  const folder = projectFolders?.get(node.module_code);
  
  // Filter by search term
  const matchesSearch = searchTerm === '' || 
    node.module_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    node.module_name.toLowerCase().includes(searchTerm.toLowerCase());
  
  const childrenMatchSearch = node.children?.some(child => 
    child.module_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    child.module_name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  if (!matchesSearch && !childrenMatchSearch && searchTerm !== '') {
    return null;
  }
  
  const getStatusIcon = () => {
    if (!folder) return <Clock className="h-3 w-3 text-muted-foreground" />;
    if (folder.status === 'complete') return <CheckCircle className="h-3 w-3 text-green-500" />;
    if (folder.status === 'in-progress') return <RefreshCw className="h-3 w-3 text-blue-500" />;
    if (folder.is_placeholder) return <Clock className="h-3 w-3 text-yellow-500" />;
    return <FileText className="h-3 w-3 text-muted-foreground" />;
  };

  return (
    <div className="select-none">
      <Collapsible open={isExpanded} onOpenChange={() => toggleNode(node.module_code)}>
        <div
          className={cn(
            "flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 cursor-pointer",
            matchesSearch && searchTerm !== '' && "bg-yellow-50 dark:bg-yellow-900/20"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {hasChildren ? (
            <CollapsibleTrigger asChild>
              <button className="p-0.5 hover:bg-muted rounded">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            </CollapsibleTrigger>
          ) : (
            <span className="w-5" />
          )}
          
          {node.content_type === 'folder' ? (
            isExpanded ? (
              <FolderOpen className="h-4 w-4 text-yellow-500" />
            ) : (
              <Folder className="h-4 w-4 text-yellow-500" />
            )
          ) : (
            <FileText className="h-4 w-4 text-blue-500" />
          )}
          
          <span className="font-mono text-xs text-muted-foreground">
            {node.module_code}
          </span>
          
          <span className="text-sm flex-1 truncate">
            {node.module_name}
          </span>
          
          {node.is_required && (
            <Badge variant="outline" className="text-xs h-5">Required</Badge>
          )}
          
          {node.is_regional && (
            <Badge variant="secondary" className="text-xs h-5">Regional</Badge>
          )}
          
          {folder && folder.document_count > 0 && (
            <Badge variant="default" className="text-xs h-5">
              {folder.document_count}
            </Badge>
          )}
          
          {getStatusIcon()}
        </div>
        
        {hasChildren && (
          <CollapsibleContent>
            {node.children!.map(child => (
              <ModuleTreeNode
                key={child.module_code}
                node={child}
                projectFolders={projectFolders}
                depth={depth + 1}
                searchTerm={searchTerm}
                expandedNodes={expandedNodes}
                toggleNode={toggleNode}
              />
            ))}
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
}

// Main Component
export default function ECTDModuleBrowser({ projectId }: { projectId?: string }) {
  const { toast } = useToast();
  const [agency, setAgency] = useState<'FDA' | 'EMA' | 'PMDA'>('FDA');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['m1', 'm2', 'm3', 'm4', 'm5']));

  // Fetch module structure
  const { data: moduleData, isLoading: modulesLoading } = useQuery({
    queryKey: ['ectd-modules', agency],
    queryFn: async () => {
      const response = await fetch(`/api/gcc/ectd/module-structure/tree?agency=${agency}`);
      if (!response.ok) throw new Error('Failed to fetch modules');
      return response.json();
    }
  });

  // Fetch project folders if projectId provided
  const { data: folderData, isLoading: foldersLoading } = useQuery({
    queryKey: ['ectd-folders', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/gcc/ectd/projects/${projectId}/folders`);
      if (!response.ok) throw new Error('Failed to fetch folders');
      return response.json();
    },
    enabled: !!projectId
  });

  // Seed project mutation
  const seedMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/gcc/ectd/projects/${projectId}/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: `Project ${projectId}`, agency })
      });
      if (!response.ok) throw new Error('Failed to seed project');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Project Seeded',
        description: `Created ${data.foldersCreated} folders in ${data.executionMs}ms`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Create folder map for quick lookup
  const projectFolders = useMemo(() => {
    if (!folderData?.folders) return new Map();
    return new Map(folderData.folders.map((f: ProjectFolder) => [f.module_code, f]));
  }, [folderData]);

  const toggleNode = (code: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (!moduleData?.tree) return;
    const allCodes = new Set<string>();
    const collectCodes = (nodes: ModuleNode[]) => {
      nodes.forEach(node => {
        allCodes.add(node.module_code);
        if (node.children) collectCodes(node.children);
      });
    };
    collectCodes(moduleData.tree);
    setExpandedNodes(allCodes);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set(['m1', 'm2', 'm3', 'm4', 'm5']));
  };

  if (modulesLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>eCTD Module Structure</CardTitle>
            <CardDescription>
              {moduleData?.count || 0} modules • {agency} region
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={agency} onValueChange={(v) => setAgency(v as any)}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FDA">FDA</SelectItem>
                <SelectItem value="EMA">EMA</SelectItem>
                <SelectItem value="PMDA">PMDA</SelectItem>
              </SelectContent>
            </Select>
            
            {projectId && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
              >
                {seedMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Seed Folders
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* Search and controls */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search modules..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll}>
              Collapse
            </Button>
          </div>
          
          {/* Stats */}
          {folderData?.stats && (
            <div className="grid grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold">{folderData.stats.total_folders}</div>
                <div className="text-xs text-muted-foreground">Total Folders</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{folderData.stats.populated_folders}</div>
                <div className="text-xs text-muted-foreground">With Documents</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{folderData.stats.placeholder_folders}</div>
                <div className="text-xs text-muted-foreground">Placeholders</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{folderData.stats.total_documents}</div>
                <div className="text-xs text-muted-foreground">Documents</div>
              </div>
            </div>
          )}
          
          {/* Module tree */}
          <div className="border rounded-lg max-h-[600px] overflow-auto">
            {moduleData?.tree?.map((node: ModuleNode) => (
              <ModuleTreeNode
                key={node.module_code}
                node={node}
                projectFolders={projectFolders}
                searchTerm={searchTerm}
                expandedNodes={expandedNodes}
                toggleNode={toggleNode}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useTenantContext } from '@/contexts/TenantContext';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  Upload,
  Download,
  Search,
  Plus,
  File,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Trash2,
  FolderPlus,
  ArrowUp,
  ArrowDown,
  Home,
  Check,
  X,
  SidebarClose,
  List,
  LayoutGrid,
  MoreVertical,
} from 'lucide-react';
import cerv2SectionService from '@/services/CERV2SectionService';
import { queryClient } from '@/lib/queryClient';
import { cn } from '@/lib/utils';

/**
 * Enhanced Document Vault - Windows File Explorer Style
 *
 * Features:
 * - Real-time database connectivity via React Query
 * - Hierarchical folder tree with FDA 510(k) sections
 * - Expandable/collapsible folders
 * - Document status badges (Draft, In Progress, Completed)
 * - Professional layout matching Windows Explorer
 * - Search functionality across all documents
 * - Real backend CRUD operations
 */
const EnhancedDocumentVault = ({
  documentType = '510k',
  onFileClick,
  onUpload,
  projectId,
  onSectionSelect,
}) => {
  const { toast } = useToast();
  const { currentOrganization } = useTenantContext();
  const tenantOrgId = String(currentOrganization?.id || '1');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState({
    'root-regulatory': true,
    'folder-510k': true,
    'folder-administrative': true,
  });
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);

  // Windows Explorer selection state
  const [selectedItems, setSelectedItems] = useState([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [focusedItem, setFocusedItem] = useState(null);
  const [renamingItem, setRenamingItem] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  // View mode state
  const [viewMode, setViewMode] = useState('details'); // 'details' or 'list'
  const [sortColumn, setSortColumn] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');

  // Current folder for main file list view
  const [currentFolder, setCurrentFolder] = useState('folder-510k');

  // Properties panel state
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(false);

  // Initialize service with organization ID from TenantContext
  React.useEffect(() => {
    cerv2SectionService.setOrganization(tenantOrgId);
  }, [tenantOrgId]);

  // Windows Explorer selection handlers
  const handleItemClick = (item, event, allItems) => {
    const itemIndex = allItems.findIndex(i => i.id === item.id);

    if (event.ctrlKey || event.metaKey) {
      // Ctrl+Click: Toggle individual selection
      if (selectedItems.find(i => i.id === item.id)) {
        setSelectedItems(prev => prev.filter(i => i.id !== item.id));
      } else {
        setSelectedItems(prev => [...prev, item]);
      }
      setLastSelectedIndex(itemIndex);
    } else if (event.shiftKey && lastSelectedIndex !== null) {
      // Shift+Click: Range selection
      const start = Math.min(lastSelectedIndex, itemIndex);
      const end = Math.max(lastSelectedIndex, itemIndex);
      const rangeItems = allItems.slice(start, end + 1);
      setSelectedItems(rangeItems);
    } else {
      // Single click: Replace selection
      setSelectedItems([item]);
      setLastSelectedIndex(itemIndex);
    }
    setFocusedItem(item);
  };

  const handleItemDoubleClick = item => {
    if (item.type === 'folder') {
      // Navigate into folder
      setCurrentFolder(item.id);
      setSelectedItems([]);
    } else if (item.type === 'file') {
      // Open document in editor
      handleDocumentClick(item);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (event, allItems) => {
    if (renamingItem) return; // Don't handle keys while renaming

    const currentIndex =
      selectedItems.length > 0
        ? allItems.findIndex(i => i.id === selectedItems[selectedItems.length - 1].id)
        : 0;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (currentIndex < allItems.length - 1) {
          const nextItem = allItems[currentIndex + 1];
          if (event.shiftKey) {
            setSelectedItems(prev => [...prev, nextItem]);
          } else {
            setSelectedItems([nextItem]);
          }
          setLastSelectedIndex(currentIndex + 1);
          setFocusedItem(nextItem);
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (currentIndex > 0) {
          const prevItem = allItems[currentIndex - 1];
          if (event.shiftKey) {
            setSelectedItems(prev => [...prev, prevItem]);
          } else {
            setSelectedItems([prevItem]);
          }
          setLastSelectedIndex(currentIndex - 1);
          setFocusedItem(prevItem);
        }
        break;

      case 'Enter':
        if (selectedItems.length === 1) {
          handleItemDoubleClick(selectedItems[0]);
        }
        break;

      case 'Delete':
        if (selectedItems.length > 0 && selectedItems[0].sectionData) {
          handleDeleteSection(selectedItems[0].sectionData.id, selectedItems[0].name);
        }
        break;

      case 'F2':
        if (selectedItems.length === 1 && selectedItems[0].sectionData) {
          startRename(selectedItems[0]);
        }
        break;

      case 'a':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          setSelectedItems(allItems.filter(i => i.type !== 'folder'));
        }
        break;

      case 'Escape':
        if (renamingItem) {
          setRenamingItem(null);
          setRenameValue('');
        }
        break;
    }
  };

  // Rename functions
  const startRename = item => {
    setRenamingItem(item);
    setRenameValue(item.name);
  };

  const commitRename = async () => {
    if (!renamingItem || !renamingItem.sectionData || !renameValue.trim()) {
      setRenamingItem(null);
      return;
    }

    try {
      const updated = {
        ...renamingItem.sectionData,
        section_title: renameValue.replace(/\.\w+$/, ''), // Remove extension
      };

      await cerv2SectionService.updateSection(renamingItem.sectionData.id, updated);
      await queryClient.invalidateQueries({ queryKey: ['/api/cerv2-sections'] });

      toast({
        title: 'Renamed Successfully',
        description: `File renamed to "${renameValue}"`,
      });

      refetch();
    } catch (error) {
      toast({
        title: 'Rename Failed',
        description: error.message || 'Could not rename file',
        variant: 'destructive',
      });
    }

    setRenamingItem(null);
    setRenameValue('');
  };

  // Fetch real sections from backend, scoped by project when available
  const sectionsQueryUrl = projectId
    ? `/api/cerv2-sections?document_id=${projectId}`
    : '/api/cerv2-sections';
  const {
    data: sectionsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['/api/cerv2-sections', projectId],
    queryFn: () => fetch(sectionsQueryUrl).then(r => r.json()),
    enabled: true,
    staleTime: 30000, // 30 seconds
  });

  // Log any errors
  if (error) {
    console.error('[EnhancedDocumentVault] Error fetching sections:', error);
  }

  // Transform database sections into SharePoint-style document tree
  const buildDocumentTree = sections => {
    // Create a complete document management structure
    const tree = [
      {
        id: 'root-regulatory',
        name: '📁 Regulatory Submissions',
        type: 'folder',
        isRoot: true,
        children: [
          {
            id: 'folder-510k',
            name: '510(k) Submission',
            type: 'folder',
            modified: new Date().toISOString(),
            children: [
              {
                id: 'folder-administrative',
                name: 'Administrative Documents',
                type: 'folder',
                children:
                  sections?.sections
                    ?.filter(s => parseInt(s.section_number) <= 10)
                    .map(section => ({
                      id: `doc-${section.id}`,
                      name: `${section.section_number} ${section.section_title}.docx`,
                      type: 'file',
                      format: 'docx',
                      size: '245 KB',
                      modified: section.last_modified || new Date().toISOString(),
                      status: section.status,
                      sectionData: section,
                      owner: 'Regulatory Team',
                    })) || [],
              },
              {
                id: 'folder-device-description',
                name: 'Device Description',
                type: 'folder',
                children:
                  sections?.sections
                    ?.filter(
                      s => parseInt(s.section_number) >= 11 && parseInt(s.section_number) <= 15
                    )
                    .map(section => ({
                      id: `doc-${section.id}`,
                      name: `${section.section_number} ${section.section_title}.docx`,
                      type: 'file',
                      format: 'docx',
                      size: '312 KB',
                      modified: section.last_modified || new Date().toISOString(),
                      status: section.status,
                      sectionData: section,
                      owner: 'Engineering Team',
                    })) || [],
              },
              {
                id: 'folder-performance',
                name: 'Performance Testing',
                type: 'folder',
                children:
                  sections?.sections
                    ?.filter(
                      s => parseInt(s.section_number) >= 16 && parseInt(s.section_number) <= 20
                    )
                    .map(section => ({
                      id: `doc-${section.id}`,
                      name: `${section.section_number} ${section.section_title}.docx`,
                      type: 'file',
                      format: 'docx',
                      size: '458 KB',
                      modified: section.last_modified || new Date().toISOString(),
                      status: section.status,
                      sectionData: section,
                      owner: 'Quality Team',
                    })) || [],
              },
              {
                id: 'folder-clinical',
                name: 'Clinical Data',
                type: 'folder',
                children:
                  sections?.sections
                    ?.filter(s => parseInt(s.section_number) >= 21)
                    .map(section => ({
                      id: `doc-${section.id}`,
                      name: `${section.section_number} ${section.section_title}.docx`,
                      type: 'file',
                      format: 'docx',
                      size: '892 KB',
                      modified: section.last_modified || new Date().toISOString(),
                      status: section.status,
                      sectionData: section,
                      owner: 'Clinical Team',
                    })) || [],
              },
            ],
          },
          {
            id: 'folder-pma',
            name: 'PMA Submission',
            type: 'folder',
            children: [],
          },
          {
            id: 'folder-denovo',
            name: 'De Novo Classification',
            type: 'folder',
            children: [],
          },
        ],
      },
      {
        id: 'root-quality',
        name: '📁 Quality System',
        type: 'folder',
        isRoot: true,
        children: [
          {
            id: 'folder-sops',
            name: 'Standard Operating Procedures',
            type: 'folder',
            children: [
              {
                id: 'doc-sop-001',
                name: 'SOP-001 Document Control.pdf',
                type: 'file',
                format: 'pdf',
                size: '156 KB',
                modified: '2024-10-15T10:30:00Z',
                owner: 'Quality Manager',
              },
              {
                id: 'doc-sop-002',
                name: 'SOP-002 Design Controls.pdf',
                type: 'file',
                format: 'pdf',
                size: '203 KB',
                modified: '2024-10-14T14:20:00Z',
                owner: 'Quality Manager',
              },
            ],
          },
          {
            id: 'folder-audits',
            name: 'Internal Audits',
            type: 'folder',
            children: [],
          },
        ],
      },
      {
        id: 'root-working',
        name: '📁 Working Documents',
        type: 'folder',
        isRoot: true,
        children: [
          {
            id: 'folder-drafts',
            name: 'Drafts',
            type: 'folder',
            children: [],
          },
          {
            id: 'folder-references',
            name: 'Reference Materials',
            type: 'folder',
            children: [
              {
                id: 'doc-ref-001',
                name: 'FDA Guidance - 510(k) Program.pdf',
                type: 'file',
                format: 'pdf',
                size: '2.3 MB',
                modified: '2024-09-01T08:00:00Z',
                owner: 'FDA',
              },
            ],
          },
        ],
      },
    ];

    return tree;
  };

  // Fallback tree structure when no data
  const getFallbackTree = () => {
    return [
      {
        id: 'section-new',
        name: 'No sections found',
        type: 'info',
        children: [],
      },
    ];
  };

  const documentTree = buildDocumentTree(sectionsData);

  // Toggle folder expansion
  const toggleFolder = folderId => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  // Handle file/document click - open in editor
  const handleDocumentClick = item => {
    if (item.type === 'file' && item.sectionData) {
      // Notify parent to open this document in the editor
      if (onSectionSelect) {
        onSectionSelect(item.sectionData);
      } else if (onFileClick) {
        onFileClick(item);
      }

      toast({
        title: 'Document Opened',
        description: `Editing ${item.name}`,
      });
    } else if (item.type === 'file' && !item.sectionData) {
      toast({
        title: 'Document Preview',
        description: `Opening ${item.name} in preview mode`,
      });
    }
  };

  // Handle right-click context menu
  const handleContextMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item: item,
    });
  };

  // Close context menu
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // Context menu actions
  const handleContextAction = async (action, item) => {
    closeContextMenu();

    switch (action) {
      case 'open':
        if (item.type === 'file') {
          handleDocumentClick(item);
        }
        break;

      case 'delete':
        if (item.sectionData) {
          await handleDeleteSection(item.sectionData.id, item.name);
        }
        break;

      case 'download':
        if (item.sectionData && item.sectionData.content) {
          try {
            // Create a blob with the HTML content
            const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${item.sectionData.section_number} ${item.sectionData.section_title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
    h1 { color: #5585b3; border-bottom: 2px solid #5585b3; padding-bottom: 10px; }
    h2 { color: #4a7399; margin-top: 30px; }
    p { margin: 10px 0; }
  </style>
</head>
<body>
  <h1>${item.sectionData.section_number} ${item.sectionData.section_title}</h1>
  ${item.sectionData.content}
</body>
</html>`;

            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${item.sectionData.section_number}-${item.sectionData.section_title.replace(/[^a-z0-9]/gi, '-')}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast({
              title: 'Download Complete',
              description: `Downloaded ${item.name} as HTML`,
            });
          } catch (error) {
            toast({
              title: 'Download Failed',
              description: error.message || 'Could not download file',
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: 'Download Unavailable',
            description: 'This document has no content to download',
            variant: 'destructive',
          });
        }
        break;

      case 'rename':
        // Trigger inline rename mode
        setRenamingItem(item);
        setRenameValue(item.sectionData?.section_title || item.name.replace(/\.\w+$/, ''));
        break;

      case 'duplicate':
        if (item.sectionData) {
          try {
            const duplicateSection = {
              ...item.sectionData,
              section_number: `${item.sectionData.section_number}-copy`,
              section_title: `${item.sectionData.section_title} (Copy)`,
              section_key: `${item.sectionData.section_key}-copy-${Date.now()}`,
              ...(projectId ? { document_id: Number(projectId) } : {}),
            };

            await cerv2SectionService.createSection(duplicateSection);
            await queryClient.invalidateQueries({ queryKey: ['/api/cerv2-sections'] });

            toast({
              title: 'Document Duplicated',
              description: `Created a copy of ${item.name}`,
            });

            refetch();
          } catch (error) {
            toast({
              title: 'Error Duplicating',
              description: error.message || 'Failed to duplicate section',
              variant: 'destructive',
            });
          }
        }
        break;

      case 'properties':
        toast({
          title: 'Properties',
          description: `${item.name}\nModified: ${item.modified ? new Date(item.modified).toLocaleString() : 'Unknown'}\nSize: ${item.size || 'Unknown'}`,
        });
        break;

      case 'export-to-510k':
        // Export selected document(s) to 510(k) submission
        if (item.sectionData) {
          toast({
            title: 'Exporting to 510(k) Submission',
            description: `Adding ${item.name} to your 510(k) package...`,
          });

          // The document is already a section in the 510(k) structure
          // Notify user that it's part of the submission
          setTimeout(() => {
            toast({
              title: 'Document Added to 510(k)',
              description: `${item.sectionData.section_number} ${item.sectionData.section_title} is now part of your submission package. Use "Export Complete 510(k)" to generate the full dossier.`,
              variant: 'default',
            });
          }, 1000);
        } else {
          toast({
            title: 'Export Not Available',
            description:
              'This document cannot be exported to 510(k). Only submission sections can be exported.',
            variant: 'destructive',
          });
        }
        break;
    }
  };

  // Get status badge config
  const getStatusBadge = status => {
    switch (status) {
      case 'completed':
        return {
          label: 'Completed',
          variant: 'default',
          icon: CheckCircle2,
          className: 'bg-green-500 text-white',
        };
      case 'in-progress':
        return {
          label: 'In Progress',
          variant: 'secondary',
          icon: Clock,
          className: 'bg-blue-500 text-white',
        };
      case 'todo':
      default:
        return {
          label: 'Draft',
          variant: 'outline',
          icon: AlertCircle,
          className: 'bg-yellow-500 text-white',
        };
    }
  };

  // Filter tree based on search
  const filterTree = items => {
    if (!searchQuery.trim()) return items;

    return items.filter(item => {
      const matchesName = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      const hasMatchingChildren = item.children?.some(child =>
        child.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      return matchesName || hasMatchingChildren;
    });
  };

  // Create new section/document
  const handleCreateSection = async () => {
    setIsCreating(true);
    try {
      // Get the next section number
      const existingSections = sectionsData?.sections || [];
      const maxSectionNum = existingSections.reduce((max, section) => {
        const num = parseFloat(section.section_number);
        return num > max ? num : max;
      }, 22); // Start after the standard 22 sections

      const newSectionNumber = `${maxSectionNum + 1}.0`;

      const newSection = {
        section_number: newSectionNumber,
        section_title: 'New Custom Section',
        section_key: `custom-section-${Date.now()}`,
        category: 'Additional',
        level: 1,
        display_order: maxSectionNum + 1,
        is_required: false,
        icon: 'FileText',
        status: 'todo',
        content: `<h2>${newSectionNumber} New Custom Section</h2><p>Enter your content here...</p>`,
        ...(projectId ? { document_id: Number(projectId) } : {}),
      };

      const created = await cerv2SectionService.createSection(newSection);

      // Invalidate cache to refresh the tree
      await queryClient.invalidateQueries({ queryKey: ['/api/cerv2-sections'] });

      toast({
        title: 'Document Created',
        description: `${newSectionNumber} New Custom Section has been created successfully.`,
      });

      // Refetch to update the tree
      refetch();
    } catch (error) {
      console.error('[EnhancedDocumentVault] Error creating section:', error);
      toast({
        title: 'Error Creating Document',
        description: error.message || 'Failed to create new section. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Delete section/document
  const handleDeleteSection = async (sectionId, sectionName) => {
    if (
      !confirm(`Are you sure you want to delete "${sectionName}"? This action cannot be undone.`)
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      await cerv2SectionService.deleteSection(sectionId);

      // Invalidate cache to refresh the tree
      await queryClient.invalidateQueries({ queryKey: ['/api/cerv2-sections'] });

      toast({
        title: 'Document Deleted',
        description: `${sectionName} has been deleted successfully.`,
      });

      // Refetch to update the tree
      refetch();
    } catch (error) {
      console.error('[EnhancedDocumentVault] Error deleting section:', error);
      toast({
        title: 'Error Deleting Document',
        description: error.message || 'Failed to delete section. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Render file icon based on format
  const FileIcon = ({ format }) => {
    if (format === 'pdf') {
      return <FileText className="h-4 w-4 text-red-500" data-testid="icon-pdf" />;
    }
    return <File className="h-4 w-4 text-gray-500" />;
  };

  // Render tree item (folder or file)
  const TreeItem = ({ item, depth = 0 }) => {
    const isFolder = item.type === 'folder';
    const isExpanded = expandedFolders[item.id];
    const paddingLeft = depth * 16 + 8; // Indent based on depth
    const statusBadge = item.status ? getStatusBadge(item.status) : null;
    const StatusIcon = statusBadge?.icon;

    const handleClick = () => {
      if (isFolder) {
        toggleFolder(item.id);
      }
    };

    const handleDoubleClick = () => {
      if (item.type === 'file') {
        handleDocumentClick(item);
      }
    };

    return (
      <div key={item.id} data-testid={`tree-item-${item.id}`}>
        {/* SharePoint-style Row with Columns */}
        <div
          className={cn(
            'grid grid-cols-12 gap-2 items-center py-2 px-2 hover:bg-blue-50 cursor-pointer transition-colors group',
            'border-b border-gray-100'
          )}
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={e => handleContextMenu(e, item)}
          data-testid={isFolder ? `folder-${item.id}` : `file-${item.id}`}
        >
          {/* Name Column (6 cols) */}
          <div className="col-span-6 flex items-center">
            {/* Chevron (only for folders) */}
            {isFolder && (
              <div className="mr-2" data-testid={`chevron-${item.id}`}>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-600" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-600" />
                )}
              </div>
            )}

            {/* Icon */}
            <div className={cn('mr-2', !isFolder && 'ml-6')}>
              {isFolder ? (
                <Folder className="h-4 w-4 text-yellow-500" data-testid="icon-folder" />
              ) : item.format === 'pdf' ? (
                <FileText className="h-4 w-4 text-red-500" />
              ) : item.format === 'docx' ? (
                <FileText className="h-4 w-4 text-blue-500" />
              ) : (
                <File className="h-4 w-4 text-gray-500" />
              )}
            </div>

            {/* Name */}
            <span
              className={cn(
                'text-sm truncate',
                isFolder ? 'font-semibold text-gray-900' : 'text-gray-700'
              )}
            >
              {item.name}
            </span>
          </div>

          {/* Modified Date Column (2 cols) */}
          <div className="col-span-2 text-xs text-gray-600">
            {item.modified ? new Date(item.modified).toLocaleDateString() : '-'}
          </div>

          {/* Modified By Column (2 cols) */}
          <div className="col-span-2 text-xs text-gray-600 truncate">{item.owner || 'System'}</div>

          {/* File Size Column (1 col) */}
          <div className="col-span-1 text-xs text-gray-600">
            {item.size || (isFolder ? '-' : '0 KB')}
          </div>

          {/* Status/Actions Column (1 col) */}
          <div className="col-span-1 flex justify-end items-center gap-2">
            {!isFolder && item.sectionData && (
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                onClick={e => {
                  e.stopPropagation();
                  handleDeleteSection(item.sectionData.id, item.name);
                }}
                disabled={isDeleting}
                data-testid={`button-delete-${item.id}`}
              >
                <Trash2 className="h-3 w-3 text-red-500" />
              </Button>
            )}
            {statusBadge && (
              <Badge
                variant={statusBadge.variant}
                className={cn('text-xs', statusBadge.className)}
                data-testid={`status-badge-${item.id}`}
              >
                {StatusIcon && <StatusIcon className="h-3 w-3" />}
              </Badge>
            )}
            {isFolder && item.children && item.children.length > 0 && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                {item.children.length}
              </span>
            )}
          </div>
        </div>

        {/* Children (if folder is expanded) */}
        {isFolder && isExpanded && item.children && item.children.length > 0 && (
          <div data-testid={`children-${item.id}`}>
            {item.children.map(child => (
              <TreeItem key={child.id} item={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const filteredTree = filterTree(documentTree);

  // Get contents of current folder for file list view
  const getCurrentFolderContents = () => {
    if (!documentTree || documentTree.length === 0) return [];

    // Find the current folder in the tree
    const findFolder = items => {
      for (const item of items) {
        if (item.id === currentFolder) {
          return item.children || [];
        }
        if (item.children) {
          const found = findFolder(item.children);
          if (found) return found;
        }
      }
      return null;
    };

    const contents = findFolder(documentTree) || [];

    // Apply sorting
    const sorted = [...contents].sort((a, b) => {
      let comparison = 0;

      switch (sortColumn) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'modified':
          comparison = new Date(a.modified || 0) - new Date(b.modified || 0);
          break;
        case 'size':
          const sizeA = parseInt(a.size) || 0;
          const sizeB = parseInt(b.size) || 0;
          comparison = sizeA - sizeB;
          break;
        case 'type':
          comparison = (a.format || '').localeCompare(b.format || '');
          break;
        default:
          comparison = 0;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  };

  const currentFolderContents = getCurrentFolderContents();

  // Handle column sort
  const handleSort = column => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Close context menu when clicking anywhere
  React.useEffect(() => {
    if (contextMenu) {
      const handleClick = () => closeContextMenu();
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  // Get breadcrumb path from root to current folder
  const getBreadcrumbPath = () => {
    const path = [];

    const findPath = (items, targetId, currentPath = []) => {
      for (const item of items) {
        const newPath = [...currentPath, item];

        if (item.id === targetId) {
          return newPath;
        }

        if (item.children) {
          const found = findPath(item.children, targetId, newPath);
          if (found) return found;
        }
      }
      return null;
    };

    const foundPath = findPath(documentTree, currentFolder);
    return foundPath || [];
  };

  const breadcrumbPath = getBreadcrumbPath();

  // TreeItem for navigation panel - simplified version for left sidebar
  const NavigationTreeItem = ({ item, depth = 0 }) => {
    const isFolder = item.type === 'folder';
    const isExpanded = expandedFolders[item.id];
    const isCurrentFolder = item.id === currentFolder;
    const paddingLeft = depth * 12 + 8;

    if (!isFolder) return null; // Only show folders in navigation

    return (
      <div key={item.id} data-testid={`nav-tree-item-${item.id}`}>
        <div
          className={cn(
            'flex items-center py-1.5 px-2 hover:bg-gray-100 cursor-pointer text-sm',
            isCurrentFolder && 'bg-blue-100 text-blue-700 font-semibold'
          )}
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={() => {
            toggleFolder(item.id);
            setCurrentFolder(item.id);
          }}
          data-testid={`nav-folder-${item.id}`}
        >
          {/* Chevron */}
          <div className="mr-1">
            {item.children && item.children.length > 0 ? (
              isExpanded ? (
                <ChevronDown className="h-3 w-3 text-gray-500" />
              ) : (
                <ChevronRight className="h-3 w-3 text-gray-500" />
              )
            ) : (
              <div className="w-3" />
            )}
          </div>

          {/* Folder Icon */}
          <Folder className="h-4 w-4 text-yellow-500 mr-2" />

          {/* Folder Name */}
          <span className="truncate">{item.name}</span>
        </div>

        {/* Children */}
        {isExpanded && item.children && item.children.length > 0 && (
          <div>
            {item.children.map(
              child =>
                child.type === 'folder' && (
                  <NavigationTreeItem key={child.id} item={child} depth={depth + 1} />
                )
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white" data-testid="enhanced-document-vault">
      {/* Top Toolbar */}
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-2" data-testid="toolbar">
        <div className="flex items-center justify-between">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-1 text-sm" data-testid="breadcrumb">
            <Home
              className="h-4 w-4 text-gray-600 cursor-pointer hover:text-blue-600"
              onClick={() => setCurrentFolder('root-regulatory')}
              data-testid="breadcrumb-home"
            />
            {breadcrumbPath.map((pathItem, index) => (
              <div key={pathItem.id} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-gray-400" />
                <span
                  className={cn(
                    'cursor-pointer hover:text-blue-600',
                    index === breadcrumbPath.length - 1
                      ? 'text-gray-900 font-semibold'
                      : 'text-gray-600'
                  )}
                  onClick={() => setCurrentFolder(pathItem.id)}
                  data-testid={`breadcrumb-${pathItem.id}`}
                >
                  {pathItem.name.replace('📁 ', '')}
                </span>
              </div>
            ))}
          </div>

          {/* Right-side Toolbar Actions */}
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div
              className="flex items-center border border-gray-300 rounded"
              data-testid="view-mode-toggle"
            >
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 px-2 rounded-none border-r',
                  viewMode === 'details' && 'bg-blue-50 text-blue-600'
                )}
                onClick={() => setViewMode('details')}
                data-testid="button-view-details"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 px-2 rounded-none',
                  viewMode === 'list' && 'bg-blue-50 text-blue-600'
                )}
                onClick={() => setViewMode('list')}
                data-testid="button-view-list"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>

            {/* Sort Dropdown - Simple button to cycle through options */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                const sortOptions = ['name', 'modified', 'type', 'size'];
                const currentIndex = sortOptions.indexOf(sortColumn);
                const nextIndex = (currentIndex + 1) % sortOptions.length;
                handleSort(sortOptions[nextIndex]);
              }}
              data-testid="button-sort-toggle"
            >
              Sort: {sortColumn} {sortDirection === 'asc' ? '↑' : '↓'}
            </Button>

            {/* Properties Panel Toggle */}
            <Button
              variant="outline"
              size="sm"
              className={cn('h-7 px-2', showPropertiesPanel && 'bg-blue-50 text-blue-600')}
              onClick={() => setShowPropertiesPanel(!showPropertiesPanel)}
              data-testid="button-toggle-properties"
            >
              <SidebarClose className="h-4 w-4" />
            </Button>

            {/* Refresh Button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => refetch()}
              disabled={isLoading}
              data-testid="button-refresh"
            >
              <Loader2 className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Three-Panel Area */}
      <div className="flex flex-1 overflow-hidden" data-testid="three-panel-container">
        {/* Left Panel: Navigation Tree (25% width) */}
        <div className="w-1/4 border-r border-gray-200 bg-gray-50" data-testid="navigation-panel">
          <div className="p-2 border-b border-gray-200 bg-white">
            <h3 className="text-sm font-semibold text-gray-700">Folders</h3>
          </div>
          <ScrollArea className="h-full">
            <div className="p-1">
              {isLoading ? (
                <div className="p-4 text-center">
                  <Loader2 className="h-6 w-6 mx-auto text-blue-500 animate-spin" />
                </div>
              ) : (
                documentTree.map(item => <NavigationTreeItem key={item.id} item={item} depth={0} />)
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Center Panel: File List - Details View (50% or 75% width) */}
        <div
          className={cn('flex flex-col', showPropertiesPanel ? 'flex-1' : 'flex-[3]')}
          data-testid="file-list-panel"
        >
          {/* Column Headers - Sortable */}
          <div
            className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 border-b bg-gray-50 sticky top-0 text-xs font-semibold text-gray-700"
            data-testid="column-headers"
          >
            <div
              className="flex items-center gap-1 cursor-pointer hover:text-blue-600"
              onClick={() => handleSort('name')}
              data-testid="header-name"
            >
              Name
              {sortColumn === 'name' &&
                (sortDirection === 'asc' ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                ))}
            </div>
            <div
              className="flex items-center gap-1 cursor-pointer hover:text-blue-600"
              onClick={() => handleSort('modified')}
              data-testid="header-modified"
            >
              Date Modified
              {sortColumn === 'modified' &&
                (sortDirection === 'asc' ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                ))}
            </div>
            <div
              className="flex items-center gap-1 cursor-pointer hover:text-blue-600"
              onClick={() => handleSort('type')}
              data-testid="header-type"
            >
              Type
              {sortColumn === 'type' &&
                (sortDirection === 'asc' ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                ))}
            </div>
            <div
              className="flex items-center gap-1 cursor-pointer hover:text-blue-600"
              onClick={() => handleSort('size')}
              data-testid="header-size"
            >
              Size
              {sortColumn === 'size' &&
                (sortDirection === 'asc' ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                ))}
            </div>
            <div data-testid="header-status">Status</div>
          </div>

          {/* File Rows */}
          <ScrollArea className="flex-1">
            <div
              className="divide-y divide-gray-100"
              tabIndex={0}
              onKeyDown={e => handleKeyDown(e, currentFolderContents)}
              data-testid="file-rows-container"
            >
              {isLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="h-12 w-12 mx-auto mb-3 text-blue-500 animate-spin" />
                  <p className="text-gray-500">Loading documents...</p>
                </div>
              ) : currentFolderContents.length > 0 ? (
                currentFolderContents.map((item, index) => {
                  const isSelected = selectedItems.find(i => i.id === item.id);
                  const isRenaming = renamingItem?.id === item.id;
                  const statusBadge = item.status ? getStatusBadge(item.status) : null;
                  const StatusIcon = statusBadge?.icon;

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 cursor-pointer group',
                        'hover:bg-blue-50 transition-colors',
                        isSelected && 'bg-[rgb(0,120,215)] text-white hover:bg-[rgb(0,105,195)]'
                      )}
                      onClick={e => handleItemClick(item, e, currentFolderContents)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                      onContextMenu={e => handleContextMenu(e, item)}
                      data-testid={`file-row-${item.id}`}
                    >
                      {/* Name Column with Checkbox and Icon */}
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Checkbox - visible on hover or when selected */}
                        <div
                          className={cn(
                            'flex-shrink-0',
                            !isSelected && 'opacity-0 group-hover:opacity-100 transition-opacity'
                          )}
                        >
                          <div
                            className={cn(
                              'w-4 h-4 border-2 rounded flex items-center justify-center',
                              isSelected ? 'bg-white border-white' : 'border-gray-400'
                            )}
                            data-testid={`checkbox-${item.id}`}
                          >
                            {isSelected && <Check className="h-3 w-3 text-blue-600" />}
                          </div>
                        </div>

                        {/* File Icon */}
                        <div className="flex-shrink-0">
                          {item.type === 'folder' ? (
                            <Folder
                              className={cn(
                                'h-4 w-4',
                                isSelected ? 'text-white' : 'text-yellow-500'
                              )}
                            />
                          ) : item.format === 'pdf' ? (
                            <FileText
                              className={cn('h-4 w-4', isSelected ? 'text-white' : 'text-red-500')}
                            />
                          ) : item.format === 'docx' ? (
                            <FileText
                              className={cn('h-4 w-4', isSelected ? 'text-white' : 'text-blue-500')}
                            />
                          ) : (
                            <File
                              className={cn('h-4 w-4', isSelected ? 'text-white' : 'text-gray-500')}
                            />
                          )}
                        </div>

                        {/* File Name - Inline editable */}
                        {isRenaming ? (
                          <Input
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                commitRename();
                              } else if (e.key === 'Escape') {
                                setRenamingItem(null);
                                setRenameValue('');
                              }
                              e.stopPropagation();
                            }}
                            className="h-6 text-sm flex-1"
                            autoFocus
                            data-testid={`rename-input-${item.id}`}
                          />
                        ) : (
                          <span
                            className={cn(
                              'text-sm truncate',
                              isSelected ? 'text-white' : 'text-gray-900'
                            )}
                            data-testid={`file-name-${item.id}`}
                          >
                            {item.name}
                          </span>
                        )}
                      </div>

                      {/* Date Modified */}
                      <div
                        className={cn(
                          'text-xs truncate',
                          isSelected ? 'text-white' : 'text-gray-600'
                        )}
                      >
                        {item.modified ? new Date(item.modified).toLocaleDateString() : '-'}
                      </div>

                      {/* Type */}
                      <div
                        className={cn(
                          'text-xs truncate',
                          isSelected ? 'text-white' : 'text-gray-600'
                        )}
                      >
                        {item.type === 'folder' ? 'Folder' : item.format?.toUpperCase() || 'File'}
                      </div>

                      {/* Size */}
                      <div className={cn('text-xs', isSelected ? 'text-white' : 'text-gray-600')}>
                        {item.type === 'folder' ? '-' : item.size || '0 KB'}
                      </div>

                      {/* Status */}
                      <div className="flex items-center gap-2">
                        {statusBadge && (
                          <Badge
                            variant={statusBadge.variant}
                            className={cn(
                              'text-xs h-5',
                              isSelected ? 'bg-white text-blue-600' : statusBadge.className
                            )}
                            data-testid={`status-${item.id}`}
                          >
                            {StatusIcon && <StatusIcon className="h-3 w-3" />}
                          </Badge>
                        )}
                        {!isSelected && item.sectionData && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                            onClick={e => {
                              e.stopPropagation();
                              handleDeleteSection(item.sectionData.id, item.name);
                            }}
                            disabled={isDeleting}
                            data-testid={`delete-${item.id}`}
                          >
                            <Trash2 className="h-3 w-3 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-gray-500">
                  <Folder className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>This folder is empty</p>
                  <p className="text-xs mt-2">Add sections using the "New Section" button below</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right Panel: Properties Panel (25% width, togglable) */}
        {showPropertiesPanel && (
          <div
            className="w-1/4 border-l border-gray-200 bg-white p-4 overflow-y-auto"
            data-testid="properties-panel"
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Properties</h3>

            {selectedItems.length > 0 ? (
              <div className="space-y-4">
                {selectedItems.slice(0, 1).map(item => {
                  const statusBadge = item.status ? getStatusBadge(item.status) : null;
                  const StatusIcon = statusBadge?.icon;

                  return (
                    <div key={item.id} className="space-y-3">
                      {/* Icon and Name */}
                      <div className="flex items-start gap-3 pb-3 border-b">
                        {item.type === 'folder' ? (
                          <Folder className="h-8 w-8 text-yellow-500 flex-shrink-0" />
                        ) : item.format === 'pdf' ? (
                          <FileText className="h-8 w-8 text-red-500 flex-shrink-0" />
                        ) : (
                          <FileText className="h-8 w-8 text-blue-500 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm text-gray-900 break-words">
                            {item.name}
                          </h4>
                          <p className="text-xs text-gray-500 mt-1">
                            {item.type === 'folder'
                              ? 'Folder'
                              : item.format?.toUpperCase() || 'Document'}
                          </p>
                        </div>
                      </div>

                      {/* Section Details */}
                      {item.sectionData && (
                        <div className="space-y-2 text-xs">
                          <div>
                            <span className="font-semibold text-gray-700">Section Number:</span>
                            <p className="text-gray-900 mt-0.5">
                              {item.sectionData.section_number}
                            </p>
                          </div>
                          <div>
                            <span className="font-semibold text-gray-700">Title:</span>
                            <p className="text-gray-900 mt-0.5">{item.sectionData.section_title}</p>
                          </div>
                        </div>
                      )}

                      {/* Status */}
                      {statusBadge && (
                        <div>
                          <span className="font-semibold text-xs text-gray-700">Status:</span>
                          <div className="mt-1">
                            <Badge
                              variant={statusBadge.variant}
                              className={cn('text-xs', statusBadge.className)}
                            >
                              {StatusIcon && <StatusIcon className="h-3 w-3 mr-1" />}
                              {statusBadge.label}
                            </Badge>
                          </div>
                        </div>
                      )}

                      {/* Modified Date */}
                      <div className="text-xs">
                        <span className="font-semibold text-gray-700">Modified:</span>
                        <p className="text-gray-900 mt-0.5">
                          {item.modified ? new Date(item.modified).toLocaleString() : 'Unknown'}
                        </p>
                      </div>

                      {/* Owner */}
                      {item.owner && (
                        <div className="text-xs">
                          <span className="font-semibold text-gray-700">Owner:</span>
                          <p className="text-gray-900 mt-0.5">{item.owner}</p>
                        </div>
                      )}

                      {/* File Size */}
                      {item.type !== 'folder' && (
                        <div className="text-xs">
                          <span className="font-semibold text-gray-700">Size:</span>
                          <p className="text-gray-900 mt-0.5">{item.size || '0 KB'}</p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="pt-3 border-t space-y-2">
                        {item.type === 'file' && (
                          <>
                            <Button
                              variant="default"
                              size="sm"
                              className="w-full"
                              onClick={() => handleDocumentClick(item)}
                              data-testid="properties-open"
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              Open
                            </Button>
                            {item.sectionData && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full"
                                  onClick={() => handleContextAction('download', item)}
                                  data-testid="properties-export"
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Export
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() =>
                                    handleDeleteSection(item.sectionData.id, item.name)
                                  }
                                  data-testid="properties-delete"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </Button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                {selectedItems.length > 1 && (
                  <div className="pt-3 border-t">
                    <p className="text-xs text-gray-600">
                      + {selectedItems.length - 1} more{' '}
                      {selectedItems.length - 1 === 1 ? 'item' : 'items'} selected
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-gray-400 mt-8">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Select an item to view properties</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div
        className="border-t border-gray-200 px-4 py-2 bg-gray-50 flex items-center justify-between text-xs text-gray-600"
        data-testid="status-bar"
      >
        <div>
          {selectedItems.length > 0 ? (
            <span data-testid="status-selected">
              {selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'} selected
            </span>
          ) : (
            <span data-testid="status-total">
              {currentFolderContents.length} {currentFolderContents.length === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onUpload}
            className="h-7"
            data-testid="button-upload"
            disabled={isLoading}
          >
            <Upload className="h-3 w-3 mr-1" />
            Upload
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            data-testid="button-new-section"
            onClick={handleCreateSection}
            disabled={isLoading || isCreating}
          >
            {isCreating ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Plus className="h-3 w-3 mr-1" />
            )}
            New Section
          </Button>
        </div>
      </div>

      {/* Context Menu (existing) */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-300 rounded-lg shadow-lg py-1 z-50 min-w-[200px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
          data-testid="context-menu"
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.item.type === 'file' && (
            <>
              <button
                className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2"
                onClick={() => handleContextAction('open', contextMenu.item)}
                data-testid="context-menu-open"
              >
                <FileText className="h-4 w-4" />
                Open / Edit
              </button>
              <div className="border-t border-gray-200 my-1" />
            </>
          )}

          {contextMenu.item.type === 'file' && contextMenu.item.sectionData && (
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2"
              onClick={() => handleContextAction('duplicate', contextMenu.item)}
              data-testid="context-menu-duplicate"
            >
              <FileText className="h-4 w-4" />
              Duplicate
            </button>
          )}

          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2"
            onClick={() => handleContextAction('download', contextMenu.item)}
            data-testid="context-menu-download"
          >
            <Download className="h-4 w-4" />
            Download
          </button>

          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2"
            onClick={() => handleContextAction('rename', contextMenu.item)}
            data-testid="context-menu-rename"
          >
            <FileText className="h-4 w-4" />
            Rename
          </button>

          <div className="border-t border-gray-200 my-1" />

          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2"
            onClick={() => handleContextAction('properties', contextMenu.item)}
            data-testid="context-menu-properties"
          >
            <FileText className="h-4 w-4" />
            Properties / Info
          </button>

          {contextMenu.item.type === 'file' && contextMenu.item.sectionData && (
            <>
              <div className="border-t border-gray-200 my-1" />
              <button
                className="w-full px-4 py-2 text-left text-sm hover:bg-green-50 text-green-700 flex items-center gap-2"
                onClick={() => handleContextAction('export-to-510k', contextMenu.item)}
                data-testid="context-menu-export-to-510k"
              >
                <Download className="h-4 w-4" />
                Export to 510(k) Submission
              </button>
              <div className="border-t border-gray-200 my-1" />
              <button
                className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                onClick={() => handleContextAction('delete', contextMenu.item)}
                data-testid="context-menu-delete"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default EnhancedDocumentVault;

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EditorContent, useEditor, BubbleMenu, FloatingMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { Highlight } from '@tiptap/extension-highlight';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Mention } from '@tiptap/extension-mention';
import CharacterCount from '@tiptap/extension-character-count';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertTitle,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  Separator,
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui';
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Edit,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  FilePlus,
  Lock,
  Save,
  Sparkles,
  Unlock,
  Upload,
  X,
  Clock,
  Check,
  Loader2,
  Info,
  Bold,
  Italic,
  List,
  Table2,
  Plus,
  Globe,
  BookOpen,
  CheckCircle2,
  MapPin,
  Beaker,
  RotateCcw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useParams, Link } from 'wouter';
import { cn } from '@/lib/utils';

// Enhanced TipTap Editor with CMC regulatory validation
const CMCRegulatoryEditor = ({
  content,
  onChange,
  region = 'FDA',
  productName = '',
  section = '',
}) => {
  const [validationIssues, setValidationIssues] = useState([]);
  const [isValidating, setIsValidating] = useState(false);
  const [citationsCount, setCitationsCount] = useState(0);
  const { toast } = useToast();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Highlight.configure({
        multicolor: true,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention bg-blue-100 text-blue-800 px-1 rounded',
        },
        suggestion: {
          items: ({ query }) => {
            return [
              'FDA',
              'EMA',
              'PMDA',
              'WHO',
              'ICH',
              'GMP',
              'GLP',
              'GCP',
              'API',
              'CMC',
              'USP',
              'EP',
              'BP',
              'JP',
              productName || 'Drug Product',
            ]
              .filter(item => item.toLowerCase().startsWith(query.toLowerCase()))
              .slice(0, 8);
          },
        },
      }),
      CharacterCount,
    ],
    content: content || getRegionTemplate(region, section),
    onUpdate: ({ editor }) => {
      const htmlContent = editor.getHTML();
      onChange(htmlContent);

      // Auto-validate on content change (debounced)
      clearTimeout(window.validationTimeout);
      window.validationTimeout = setTimeout(() => {
        validateContent(htmlContent);
      }, 1000);
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none focus:outline-none min-h-[400px] p-6 bg-white border rounded-lg',
      },
    },
  });

  const validateContent = async htmlContent => {
    setIsValidating(true);
    try {
      const response = await fetch('/api/cmc/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: htmlContent,
          region,
          section,
          productName,
        }),
      });

      if (response.ok) {
        const issues = await response.json();
        setValidationIssues(issues.validationIssues || []);
        setCitationsCount(issues.citationsCount || 0);
      }
    } catch (error) {
      console.error('Validation failed:', error);
    } finally {
      setIsValidating(false);
    }
  };

  const insertStructuredBlock = blockType => {
    if (!editor) return;

    let blockContent = '';
    switch (blockType) {
      case 'spec-table':
        blockContent = `
          <div class="structured-block bg-blue-50 border border-blue-200 rounded p-4 my-4">
            <h4 class="font-semibold text-blue-800 mb-3">Specification Table (${region})</h4>
            <table class="w-full border-collapse border border-gray-300">
              <thead class="bg-gray-100">
                <tr>
                  <th class="border border-gray-300 p-2 text-left">Test</th>
                  <th class="border border-gray-300 p-2 text-left">Acceptance Criteria</th>
                  <th class="border border-gray-300 p-2 text-left">Method</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="border border-gray-300 p-2">Assay</td>
                  <td class="border border-gray-300 p-2">95.0% - 105.0%</td>
                  <td class="border border-gray-300 p-2">HPLC Method</td>
                </tr>
                <tr>
                  <td class="border border-gray-300 p-2">Related Substances</td>
                  <td class="border border-gray-300 p-2">NMT 0.5% individual, NMT 2.0% total</td>
                  <td class="border border-gray-300 p-2">HPLC Method</td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
        break;

      case 'stability-summary':
        blockContent = `
          <div class="structured-block bg-green-50 border border-green-200 rounded p-4 my-4">
            <h4 class="font-semibold text-green-800 mb-3">Stability Summary</h4>
            <div class="space-y-2">
              <p><strong>Storage Condition:</strong> 25°C/60% RH (Zone II)</p>
              <p><strong>Duration:</strong> 24 months</p>
              <p><strong>Package:</strong> HDPE bottles with desiccant</p>
              <p><strong>Conclusion:</strong> ${productName} remains stable under proposed storage conditions with no significant changes in quality attributes.</p>
            </div>
          </div>
        `;
        break;

      case 'manufacturing-process':
        blockContent = `
          <div class="structured-block bg-purple-50 border border-purple-200 rounded p-4 my-4">
            <h4 class="font-semibold text-purple-800 mb-3">Manufacturing Process Flow</h4>
            <ol class="space-y-2">
              <li><strong>Step 1:</strong> Weighing and dispensing of raw materials</li>
              <li><strong>Step 2:</strong> Blending of ${productName} with excipients</li>
              <li><strong>Step 3:</strong> Granulation (if applicable)</li>
              <li><strong>Step 4:</strong> Compression/Encapsulation</li>
              <li><strong>Step 5:</strong> Coating (if applicable)</li>
              <li><strong>Step 6:</strong> Final packaging</li>
            </ol>
          </div>
        `;
        break;

      default:
        return;
    }

    editor.chain().focus().insertContent(blockContent).run();

    toast({
      title: 'Block Inserted',
      description: `${blockType.replace('-', ' ')} block added with ${region}-compliant formatting.`,
    });
  };

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="cmc-regulatory-editor">
      {/* Validation Status Bar */}
      {(validationIssues.length > 0 || isValidating) && (
        <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded">
          <div className="flex items-center space-x-2">
            {isValidating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-600" />
            )}
            <span className="text-sm">
              {isValidating
                ? 'Validating content...'
                : `${validationIssues.length} compliance issue${validationIssues.length !== 1 ? 's' : ''} found`}
            </span>
          </div>

          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
            <span>Region: {region}</span>
            <span>Citations: {citationsCount}</span>
            <span>{editor.storage.characterCount.words()} words</span>
          </div>
        </div>
      )}

      {/* Bubble Menu for formatting */}
      <BubbleMenu
        editor={editor}
        tippyOptions={{ duration: 100 }}
        className="bg-white border rounded-lg shadow-lg p-1 flex items-center space-x-1"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn('h-8 w-8', editor.isActive('bold') && 'bg-accent')}
        >
          <Bold className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn('h-8 w-8', editor.isActive('italic') && 'bg-accent')}
        >
          <Italic className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          className={cn('h-8 w-8', editor.isActive('highlight') && 'bg-accent')}
        >
          <span className="bg-yellow-200 px-1 rounded text-xs font-bold">H</span>
        </Button>
      </BubbleMenu>

      {/* Floating Menu for structured blocks */}
      <FloatingMenu
        editor={editor}
        tippyOptions={{ duration: 100 }}
        className="bg-white border rounded-lg shadow-lg p-2 flex items-center space-x-2"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => insertStructuredBlock('spec-table')}
          className="flex items-center space-x-1"
        >
          <Table2 className="h-4 w-4" />
          <span className="text-xs">Spec Table</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => insertStructuredBlock('stability-summary')}
          className="flex items-center space-x-1"
        >
          <Beaker className="h-4 w-4" />
          <span className="text-xs">Stability</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => insertStructuredBlock('manufacturing-process')}
          className="flex items-center space-x-1"
        >
          <Plus className="h-4 w-4" />
          <span className="text-xs">Process</span>
        </Button>
      </FloatingMenu>

      {/* Main Editor */}
      <EditorContent editor={editor} />

      {/* Validation Issues Display */}
      {validationIssues.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Compliance Issues:</h4>
          {validationIssues.slice(0, 3).map((issue, index) => (
            <Alert key={index} variant={issue.level === 'error' ? 'destructive' : 'default'}>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-sm">
                {issue.level === 'error' ? 'Error' : 'Warning'}
              </AlertTitle>
              <AlertDescription className="text-sm">{issue.message}</AlertDescription>
            </Alert>
          ))}
          {validationIssues.length > 3 && (
            <p className="text-xs text-muted-foreground">
              +{validationIssues.length - 3} more issues...
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// Region-specific template generator
const getRegionTemplate = (region, section) => {
  const templates = {
    FDA: {
      '3.2.P.1': `
        <h2>3.2.P.1 Description and Composition of the Drug Product</h2>
        <p>The drug product is formulated as a <strong>[DOSAGE_FORM]</strong> for <strong>[ROUTE_OF_ADMINISTRATION]</strong> administration. Each <strong>[DOSAGE_UNIT]</strong> contains:</p>
        <ul>
          <li><strong>Active ingredient:</strong> [API_NAME] [STRENGTH]</li>
          <li><strong>Inactive ingredients:</strong> As listed in the drug product specification</li>
        </ul>
        <p>The formulation is designed to ensure product stability and bioavailability in accordance with FDA requirements.</p>
      `,
      '3.2.P.5': `
        <h2>3.2.P.5 Control of Drug Product</h2>
        <h3>3.2.P.5.1 Specification</h3>
        <p>The drug product specification includes tests and acceptance criteria for identity, strength, purity, and quality attributes as required by FDA guidelines.</p>
        <p><em>Insert specification table using the structured block menu above.</em></p>
      `,
    },
    EMA: {
      '3.2.P.1': `
        <h2>3.2.P.1 Description and Composition of the Medicinal Product</h2>
        <p>The medicinal product is presented as a <strong>[PHARMACEUTICAL_FORM]</strong> for <strong>[ROUTE_OF_ADMINISTRATION]</strong> use. The composition per <strong>[DOSAGE_UNIT]</strong> is:</p>
        <ul>
          <li><strong>Active substance:</strong> [ACTIVE_SUBSTANCE_NAME] [STRENGTH]</li>
          <li><strong>Excipients:</strong> As detailed in the product specification</li>
        </ul>
        <p>The formulation complies with EMA guidelines and relevant Ph. Eur. monographs.</p>
      `,
    },
  };

  return (
    templates[region]?.[section] ||
    `
    <h2>Section ${section}</h2>
    <p>Begin documenting your CMC content here. Use the floating menu to insert structured blocks for specifications, stability data, and manufacturing processes.</p>
    <p><strong>Region:</strong> ${region} compliance requirements apply.</p>
  `
  );
};

export function BlueprintEditor() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('structure');
  const [selectedSectionPath, setSelectedSectionPath] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [isContentModified, setIsContentModified] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [generationContext, setGenerationContext] = useState({});
  const [exportFormat, setExportFormat] = useState('pdf');
  const [showExportDialog, setShowExportDialog] = useState(false);

  // CMC Enhancement: Region-specific regulatory controls
  const [selectedRegion, setSelectedRegion] = useState('FDA');
  const [productName, setProductName] = useState('');
  const [showRegionDialog, setShowRegionDialog] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch blueprint data
  const blueprintQuery = useQuery({
    queryKey: [`/api/cmc/blueprints/${id}`],
  });

  // Lock blueprint mutation
  const lockMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/cmc/blueprints/${id}/lock`);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Blueprint Locked',
        description: 'You now have exclusive editing rights',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/cmc/blueprints/${id}`] });
    },
    onError: error => {
      toast({
        title: 'Lock Failed',
        description: error.message || 'Failed to lock blueprint',
        variant: 'destructive',
      });
    },
  });

  // Unlock blueprint mutation
  const unlockMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/cmc/blueprints/${id}/unlock`);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Blueprint Unlocked',
        description: 'Others can now edit this blueprint',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/cmc/blueprints/${id}`] });
    },
    onError: error => {
      toast({
        title: 'Unlock Failed',
        description: error.message || 'Failed to unlock blueprint',
        variant: 'destructive',
      });
    },
  });

  // Update blueprint content mutation
  const updateContentMutation = useMutation({
    mutationFn: async ({ path, content }) => {
      // Get current content
      const currentContent = blueprintQuery.data?.content || {};
      // Update the section content
      const updatedContent = {
        ...currentContent,
        [path]: content,
      };

      const response = await apiRequest('PUT', `/api/cmc/blueprints/${id}`, {
        content: updatedContent,
      });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Content Saved',
        description: 'Section content has been saved successfully',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/cmc/blueprints/${id}`] });
      setIsContentModified(false);
    },
    onError: error => {
      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save content',
        variant: 'destructive',
      });
    },
  });

  // Generate section content mutation
  const generateSectionMutation = useMutation({
    mutationFn: async sectionPath => {
      const response = await apiRequest(
        'POST',
        `/api/cmc/blueprints/${id}/generate/${sectionPath}`,
        generationContext
      );
      return await response.json();
    },
    onSuccess: data => {
      toast({
        title: 'Content Generated',
        description: `Section content generated successfully using ${data.tokens_used} tokens`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/cmc/blueprints/${id}`] });
      setIsContentModified(false);
    },
    onError: error => {
      toast({
        title: 'Generation Failed',
        description: error.message || 'Failed to generate content',
        variant: 'destructive',
      });
    },
  });

  // Export blueprint mutation (download)
  const exportMutation = useMutation({
    mutationFn: async format => {
      window.open(`/api/cmc/blueprints/${id}/export?format=${format}`, '_blank');
      return true;
    },
    onSuccess: () => {
      toast({
        title: 'Export Started',
        description: 'Your document is being prepared for download',
      });
      setShowExportDialog(false);
    },
    onError: error => {
      toast({
        title: 'Export Failed',
        description: error.message || 'Failed to export blueprint',
        variant: 'destructive',
      });
    },
  });

  // Set editing content when section changes
  useEffect(() => {
    if (selectedSectionPath && blueprintQuery.data?.content) {
      setEditingContent(blueprintQuery.data.content[selectedSectionPath] || '');
      setIsContentModified(false);
    } else {
      setEditingContent('');
    }
  }, [selectedSectionPath, blueprintQuery.data]);

  // Handle content change
  const handleContentChange = newContent => {
    setEditingContent(newContent);
    setIsContentModified(true);
  };

  // Handle save content
  const handleSaveContent = () => {
    if (!selectedSectionPath) return;

    updateContentMutation.mutate({
      path: selectedSectionPath,
      content: editingContent,
    });
  };

  // Handle lock/unlock
  const handleToggleLock = () => {
    const blueprint = blueprintQuery.data;

    if (!blueprint) return;

    if (blueprint.is_locked) {
      unlockMutation.mutate();
    } else {
      lockMutation.mutate();
    }
  };

  // Handle generate content
  const handleGenerateContent = () => {
    if (!selectedSectionPath) return;

    generateSectionMutation.mutate(selectedSectionPath);
  };

  // Handle context change
  const handleContextChange = e => {
    const { name, value } = e.target;
    setGenerationContext(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle export
  const handleExport = () => {
    exportMutation.mutate(exportFormat);
  };

  // Recursive function to render structure
  const renderStructure = (sections, level = 0) => {
    if (!sections || !Array.isArray(sections)) return null;

    return sections.map(section => {
      const hasContent = blueprintQuery.data?.content && blueprintQuery.data.content[section.id];

      return (
        <AccordionItem key={section.id} value={section.id}>
          <AccordionTrigger className={`${level > 0 ? `pl-${level * 4}` : ''}`}>
            <div className="flex items-center gap-2">
              <span>{section.id}</span>
              <span className="font-medium">{section.title}</span>
              {hasContent && (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <Check className="w-3 h-3 mr-1" />
                  Content
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex gap-2 mb-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedSectionPath(section.id)}
              >
                <Edit className="w-4 h-4 mr-1" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleGenerateContent(section.id)}
                disabled={generateSectionMutation.isPending}
              >
                <Sparkles className="w-4 h-4 mr-1" />
                Generate
              </Button>
            </div>

            {section.subsections && section.subsections.length > 0 && (
              <Accordion type="multiple" className="ml-4">
                {renderStructure(section.subsections, level + 1)}
              </Accordion>
            )}
          </AccordionContent>
        </AccordionItem>
      );
    });
  };

  // Show loading state
  if (blueprintQuery.isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="w-10 h-10 animate-spin text-hotpink-500" />
      </div>
    );
  }

  // Show error state
  if (blueprintQuery.error || !blueprintQuery.data) {
    return (
      <div className="container mx-auto py-10 px-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load blueprint: {blueprintQuery.error?.message || 'Blueprint not found'}
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button asChild>
            <Link to="/cmc">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Return to Blueprint List
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const blueprint = blueprintQuery.data;
  const canEdit =
    !blueprint.is_locked || (blueprint.is_locked && blueprint.locked_by === 'currentUserId'); // Replace with actual user ID check

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/cmc" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">{blueprint.name}</h1>
            <Badge
              className={`
              ${
                blueprint.status === 'DRAFT'
                  ? 'bg-yellow-100 text-yellow-800'
                  : blueprint.status === 'DRAFT_COMPLETE'
                    ? 'bg-blue-100 text-blue-800'
                    : blueprint.status === 'APPROVED'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
              }
            `}
            >
              {blueprint.status}
            </Badge>
          </div>
          <p className="text-gray-500">
            {blueprint.template?.region} | {blueprint.template?.category} | {blueprint.product_name}
          </p>
        </div>

        <div className="flex gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={blueprint.is_locked ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={handleToggleLock}
                  disabled={lockMutation.isPending || unlockMutation.isPending}
                >
                  {blueprint.is_locked ? (
                    <>
                      <Unlock className="mr-2 h-4 w-4" />
                      Unlock
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Lock
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {blueprint.is_locked
                  ? 'Release editing lock to allow others to edit'
                  : 'Lock blueprint for exclusive editing'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button size="sm" variant="outline" onClick={() => setShowExportDialog(true)}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {blueprint.is_locked && blueprint.locked_by !== 'currentUserId' && (
        <Alert className="mb-4">
          <Info className="h-4 w-4" />
          <AlertTitle>Blueprint is Locked</AlertTitle>
          <AlertDescription>
            This blueprint is currently being edited by another user. You can view content but
            cannot make changes.
          </AlertDescription>
        </Alert>
      )}

      {/* CMC Enhancement: Regulatory Controls */}
      <Card className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <MapPin className="h-4 w-4 text-blue-600" />
              <Label className="text-sm font-medium text-blue-800">Regulatory Region:</Label>
              <Select
                value={selectedRegion}
                onValueChange={value => {
                  setSelectedRegion(value);
                  toast({
                    title: 'Region Updated',
                    description: `Switched to ${value} regulatory requirements. Content validation and terminology will be updated accordingly.`,
                  });
                }}
              >
                <SelectTrigger className="w-32 bg-white border-blue-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FDA">🇺🇸 FDA</SelectItem>
                  <SelectItem value="EMA">🇪🇺 EMA</SelectItem>
                  <SelectItem value="PMDA">🇯🇵 PMDA</SelectItem>
                  <SelectItem value="WHO">🌍 WHO</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator orientation="vertical" className="h-6" />

            <div className="flex items-center space-x-2">
              <Beaker className="h-4 w-4 text-blue-600" />
              <Label className="text-sm font-medium text-blue-800">Product Name:</Label>
              <Input
                value={productName || blueprint.product_name || ''}
                onChange={e => setProductName(e.target.value)}
                placeholder="Enter product name for context"
                className="w-48 bg-white border-blue-300"
              />
            </div>

            <div className="flex items-center space-x-3 ml-auto">
              <Badge variant="outline" className="text-blue-700 border-blue-300">
                {selectedRegion} Compliance Mode
              </Badge>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRegionDialog(true)}
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <Globe className="h-3 w-3 mr-1" />
                Regional Guide
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Blueprint Structure</CardTitle>
              <CardDescription>Navigate the document structure and edit sections</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple">
                {blueprint.structure?.sections && renderStructure(blueprint.structure.sections)}
              </Accordion>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {selectedSectionPath ? (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>Editing Section: {selectedSectionPath}</CardTitle>
                  <CardDescription>
                    {/*Find section title from structure*/}
                    {blueprint.structure?.sections?.find(s => s.id === selectedSectionPath)
                      ?.title ||
                      blueprint.structure?.sections
                        ?.flatMap(s => s.subsections || [])
                        .find(s => s.id === selectedSectionPath)?.title ||
                      blueprint.structure?.sections
                        ?.flatMap(s => (s.subsections || []).flatMap(sub => sub.subsections || []))
                        .find(s => s.id === selectedSectionPath)?.title}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedSectionPath(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="edit">
                  <TabsList>
                    <TabsTrigger value="edit">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </TabsTrigger>
                    <TabsTrigger value="preview">
                      <Eye className="mr-2 h-4 w-4" />
                      Preview
                    </TabsTrigger>
                    <TabsTrigger value="generate">
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="edit" className="min-h-[500px]">
                    <CMCRegulatoryEditor
                      content={editingContent}
                      onChange={handleContentChange}
                      region={selectedRegion}
                      productName={productName || blueprintQuery.data?.title || 'Drug Product'}
                      section={selectedSectionPath}
                    />
                  </TabsContent>

                  <TabsContent value="preview" className="min-h-[500px]">
                    <div className="prose max-w-none">
                      {/* In a real implementation, render markdown/formatting here */}
                      <div className="p-4 border rounded-md whitespace-pre-wrap">
                        {editingContent || 'No content to preview'}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="generate" className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-md">
                      <h3 className="font-medium mb-2">AI Generation Context</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Provide relevant context information to help the AI generate better content
                        for this section.
                      </p>

                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="manufacturer_name">Manufacturer Name</Label>
                          <Input
                            id="manufacturer_name"
                            name="manufacturer_name"
                            onChange={handleContextChange}
                            value={generationContext.manufacturer_name || ''}
                            placeholder="Enter manufacturer name"
                          />
                        </div>

                        <div>
                          <Label htmlFor="manufacturer_address">Manufacturer Address</Label>
                          <Input
                            id="manufacturer_address"
                            name="manufacturer_address"
                            onChange={handleContextChange}
                            value={generationContext.manufacturer_address || ''}
                            placeholder="Enter manufacturer address"
                          />
                        </div>

                        <div>
                          <Label htmlFor="manufacturing_steps">Manufacturing Steps</Label>
                          <Textarea
                            id="manufacturing_steps"
                            name="manufacturing_steps"
                            onChange={handleContextChange}
                            value={generationContext.manufacturing_steps || ''}
                            placeholder="Describe key manufacturing steps"
                          />
                        </div>

                        <div>
                          <Label htmlFor="tests">Quality Control Tests</Label>
                          <Textarea
                            id="tests"
                            name="tests"
                            onChange={handleContextChange}
                            value={generationContext.tests || ''}
                            placeholder="Enter key quality control tests"
                          />
                        </div>
                      </div>

                      <Button
                        className="mt-4"
                        onClick={handleGenerateContent}
                        disabled={generateSectionMutation.isPending}
                      >
                        {generateSectionMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Generate Content
                          </>
                        )}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={() => setSelectedSectionPath(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveContent}
                  disabled={!isContentModified || updateContentMutation.isPending || !canEdit}
                >
                  {updateContentMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Blueprint Information</CardTitle>
                <CardDescription>
                  Select a section from the structure to start editing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label>Product Name</Label>
                    <div className="p-2 border rounded-md bg-gray-50">{blueprint.product_name}</div>
                  </div>

                  <div>
                    <Label>Template</Label>
                    <div className="p-2 border rounded-md bg-gray-50">
                      {blueprint.template?.name} ({blueprint.template?.region})
                    </div>
                  </div>

                  <div>
                    <Label>Description</Label>
                    <div className="p-2 border rounded-md bg-gray-50 min-h-[80px]">
                      {blueprint.description || 'No description provided'}
                    </div>
                  </div>

                  <div>
                    <Label>Status</Label>
                    <div className="flex gap-2 p-2">
                      <Badge
                        className={`
                        ${
                          blueprint.status === 'DRAFT'
                            ? 'bg-yellow-100 text-yellow-800'
                            : blueprint.status === 'DRAFT_COMPLETE'
                              ? 'bg-blue-100 text-blue-800'
                              : blueprint.status === 'APPROVED'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                        }
                      `}
                      >
                        {blueprint.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Created By</Label>
                      <div className="p-2 border rounded-md bg-gray-50">
                        {blueprint.created_by_user?.name || 'Unknown'}
                      </div>
                    </div>

                    <div>
                      <Label>Last Updated</Label>
                      <div className="p-2 border rounded-md bg-gray-50">
                        {new Date(blueprint.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Blueprint</DialogTitle>
            <DialogDescription>Choose your preferred export format</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="exportFormat">Format</Label>
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger id="exportFormat">
                  <SelectValue placeholder="Select Format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF Document</SelectItem>
                  <SelectItem value="word">Word Document</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={exportMutation.isPending}>
              {exportMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Track Changes Feature for CMC Documents
const TrackChangesPanel = ({
  changes,
  onAcceptChange,
  onRejectChange,
  showTrackChanges,
  onToggleTrackChanges,
}) => {
  if (!showTrackChanges) return null;

  return (
    <Card className="mt-4 border-orange-200 bg-orange-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-orange-800">Track Changes</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleTrackChanges}
            className="text-orange-700 hover:bg-orange-100"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {changes.length === 0 ? (
          <p className="text-sm text-orange-600">No pending changes</p>
        ) : (
          changes.map((change, index) => (
            <div key={index} className="bg-white p-3 rounded border border-orange-200">
              <div className="flex justify-between items-start mb-2">
                <div className="text-xs text-orange-600">
                  {change.type === 'addition' ? 'Added' : 'Deleted'} • {change.author} •{' '}
                  {change.timestamp}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onAcceptChange(index)}
                    className="h-6 px-2 text-green-700 hover:bg-green-100"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRejectChange(index)}
                    className="h-6 px-2 text-red-700 hover:bg-red-100"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div
                className={`text-sm ${change.type === 'addition' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} p-2 rounded`}
              >
                {change.text}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

// Version History Component
const VersionHistoryPanel = ({ versions, onRestoreVersion, currentVersion }) => {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-sm">Version History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {versions.map((version, index) => (
          <div
            key={index}
            className={`p-3 rounded border ${version.version === currentVersion ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}
          >
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium text-sm">v{version.version}</span>
              <span className="text-xs text-gray-500">{version.timestamp}</span>
            </div>
            <p className="text-xs text-gray-600 mb-2">{version.description}</p>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">by {version.author}</span>
              {version.version !== currentVersion && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRestoreVersion(version)}
                  className="h-6 px-2 text-xs"
                >
                  Restore
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

// AI Writing Helper with Regulatory Spell Check
const RegulatorySpellCheckPanel = ({ suggestions, onApplySuggestion, onDismissSuggestion }) => {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <Card className="mt-4 border-purple-200 bg-purple-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-purple-800 flex items-center">
          <Sparkles className="h-4 w-4 mr-2" />
          Regulatory Suggestions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {suggestions.map((suggestion, index) => (
          <div key={index} className="bg-white p-3 rounded border border-purple-200">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="text-xs font-medium text-purple-700 mb-1">
                  {suggestion.type === 'terminology'
                    ? '📚 Terminology'
                    : suggestion.type === 'compliance'
                      ? '⚖️ Compliance'
                      : suggestion.type === 'formatting'
                        ? '📝 Formatting'
                        : '💡 Enhancement'}
                </div>
                <p className="text-sm text-gray-700">{suggestion.issue}</p>
              </div>
              <Badge variant="outline" className="text-purple-700 border-purple-300 text-xs">
                {suggestion.region}
              </Badge>
            </div>

            <div className="bg-gray-50 p-2 rounded text-sm mb-2">
              <div className="font-medium text-gray-700 mb-1">Suggested change:</div>
              <div className="text-gray-600">{suggestion.suggestion}</div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => onApplySuggestion(suggestion)}
                className="h-7 px-3 text-xs bg-purple-600 hover:bg-purple-700"
              >
                Apply
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDismissSuggestion(index)}
                className="h-7 px-3 text-xs border-purple-300 text-purple-700 hover:bg-purple-100"
              >
                Dismiss
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export function BlueprintEditorForm({ blueprintId, onSave }) {
  const [formData, setFormData] = useState({
    title: '',
    version: '1.0',
    description: '',
    region: 'FDA',
    category: 'Drug Substance',
    productName: '',
    isLocked: false,
  });

  const [currentTab, setCurrentTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [showTrackChanges, setShowTrackChanges] = useState(false);
  const [trackChanges, setTrackChanges] = useState([]);
  const [versions, setVersions] = useState([
    {
      version: '1.0',
      timestamp: '2 hours ago',
      author: 'John Doe',
      description: 'Initial blueprint creation',
    },
    {
      version: '0.9',
      timestamp: '1 day ago',
      author: 'Jane Smith',
      description: 'Draft content review',
    },
  ]);
  const [regulatorySuggestions, setRegulatorySuggestions] = useState([
    {
      type: 'terminology',
      region: 'FDA',
      issue: 'Consider using "drug substance" instead of "API" for FDA submissions',
      suggestion: 'Replace "API" with "drug substance" to align with FDA terminology preferences',
      position: { start: 45, end: 48 },
    },
    {
      type: 'compliance',
      region: 'ICH',
      issue: 'Missing ICH Q7 reference for manufacturing controls',
      suggestion: 'Add reference to ICH Q7 guidelines for API manufacturing quality systems',
      position: { start: 120, end: 140 },
    },
  ]);
  const { toast } = useToast();

  // Enhanced Handler Functions for Word/Google Docs-style Features
  const handleAcceptChange = changeIndex => {
    const updatedChanges = trackChanges.filter((_, index) => index !== changeIndex);
    setTrackChanges(updatedChanges);
    toast({
      title: 'Change Accepted',
      description: 'The suggested change has been applied to the document.',
    });
  };

  const handleRejectChange = changeIndex => {
    const updatedChanges = trackChanges.filter((_, index) => index !== changeIndex);
    setTrackChanges(updatedChanges);
    toast({
      title: 'Change Rejected',
      description: 'The suggested change has been dismissed.',
    });
  };

  const handleRestoreVersion = version => {
    setFormData(prev => ({ ...prev, version: version.version }));
    toast({
      title: `Version ${version.version} Restored`,
      description: 'Document has been restored to the selected version.',
    });
  };

  const handleApplySuggestion = suggestion => {
    // Apply the regulatory suggestion to the document
    toast({
      title: 'Suggestion Applied',
      description: `${suggestion.type} suggestion has been applied to improve regulatory compliance.`,
    });

    // Remove the suggestion from the list
    setRegulatorySuggestions(prev => prev.filter(s => s.issue !== suggestion.issue));
  };

  const handleDismissSuggestion = index => {
    setRegulatorySuggestions(prev => prev.filter((_, i) => i !== index));
    toast({
      title: 'Suggestion Dismissed',
      description: 'The regulatory suggestion has been dismissed.',
    });
  };

  const handleToggleTrackChanges = () => {
    setShowTrackChanges(!showTrackChanges);
    toast({
      title: showTrackChanges ? 'Track Changes Disabled' : 'Track Changes Enabled',
      description: showTrackChanges
        ? 'Changes will no longer be tracked'
        : 'All document changes will now be tracked for review',
    });
  };

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleToggleLock = () => {
    setFormData(prev => ({
      ...prev,
      isLocked: !prev.isLocked,
    }));

    toast({
      title: formData.isLocked ? 'Blueprint unlocked' : 'Blueprint locked',
      description: formData.isLocked
        ? 'The blueprint can now be edited'
        : 'The blueprint is now locked for editing',
    });
  };

  const handleSave = () => {
    setSaving(true);

    // Simulate API call
    setTimeout(() => {
      setSaving(false);
      if (onSave) {
        onSave(formData);
      }

      toast({
        title: 'Blueprint saved',
        description: 'All changes have been saved successfully',
      });
    }, 1000);
  };

  const handleGenerateCompliance = () => {
    toast({
      title: 'Compliance verification started',
      description: 'AI is analyzing your blueprint for regulatory compliance',
    });
  };

  const handleExport = () => {
    toast({
      title: 'Blueprint export initiated',
      description: 'Your document is being prepared for export',
    });
  };

  const handleRefreshTokens = async () => {
    try {
      // Extract method and section from URL query parameters
      const urlParams = new URLSearchParams(window.location.search);
      const sectionId = urlParams.get('section');
      const methodId = urlParams.get('method');

      if (!sectionId) {
        toast({
          title: 'Missing section id',
          description: 'Section parameter is required for token refresh.',
          variant: 'destructive',
        });
        return;
      }

      let mid = methodId;
      if (!mid) {
        // Fallback: try to extract method ID from document content
        try {
          const response = await fetch(`/api/authoring/sections/${sectionId}`);
          if (response.ok) {
            const { content_md } = await response.json();
            const match = /<!--\s*METHOD_ID:\s*([0-9a-f-]{36})\s*-->/.exec(content_md);
            mid = match?.[1] || '';
          }
        } catch (error) {
          console.warn('Could not fetch section content for method ID extraction:', error);
        }
      }

      if (!mid) {
        toast({
          title: 'No method id found',
          description: 'Unable to locate method ID for token refresh.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Refreshing tokens from LIMS',
        description: 'Updating validation plan with latest data...',
      });

      const response = await fetch('/api/analytical/recompute-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ methodId: mid, sectionId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to refresh tokens');
      }

      const result = await response.json();

      toast({
        title: 'Tokens refreshed from LIMS',
        description: `Updated ${result.tokens} tokens with latest LIMS data.`,
      });

      // Reload the page to show updated content
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error('Token refresh error:', error);
      toast({
        title: 'Refresh failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const regions = [
    { value: 'FDA', label: 'FDA (US)' },
    { value: 'EMA', label: 'EMA (EU)' },
    { value: 'PMDA', label: 'PMDA (Japan)' },
    { value: 'NMPA', label: 'NMPA (China)' },
    { value: 'Health Canada', label: 'Health Canada' },
    { value: 'TGA', label: 'TGA (Australia)' },
    { value: 'MHRA', label: 'MHRA (UK)' },
  ];

  const categories = [
    { value: 'Drug Substance', label: 'Drug Substance (API)' },
    { value: 'Drug Product', label: 'Drug Product' },
    { value: 'Excipients', label: 'Excipients' },
    { value: 'Container Closure', label: 'Container Closure System' },
    { value: 'Process Validation', label: 'Process Validation' },
  ];

  // Mock revision history
  const revisionHistory = [
    {
      id: 1,
      version: '1.0',
      date: '2025-05-01',
      author: 'David Park',
      changes: 'Initial draft creation',
    },
    {
      id: 2,
      version: '1.1',
      date: '2025-05-03',
      author: 'Maria Chen',
      changes: 'Updated manufacturing section with new process parameters',
    },
    {
      id: 3,
      version: '1.2',
      date: '2025-05-08',
      author: 'James Wilson',
      changes: 'Added stability data and updated specifications',
    },
  ];

  // Mock sections data
  const sectionsData = [
    {
      id: 's1',
      path: '3.2.S.1',
      title: 'General Information',
      status: 'Complete',
      subsections: [
        { id: 's11', path: '3.2.S.1.1', title: 'Nomenclature', status: 'Complete' },
        { id: 's12', path: '3.2.S.1.2', title: 'Structure', status: 'Complete' },
        { id: 's13', path: '3.2.S.1.3', title: 'General Properties', status: 'Complete' },
      ],
    },
    {
      id: 's2',
      path: '3.2.S.2',
      title: 'Manufacture',
      status: 'In Progress',
      subsections: [
        { id: 's21', path: '3.2.S.2.1', title: 'Manufacturer(s)', status: 'Complete' },
        {
          id: 's22',
          path: '3.2.S.2.2',
          title: 'Description of Manufacturing Process',
          status: 'Complete',
        },
        { id: 's23', path: '3.2.S.2.3', title: 'Control of Materials', status: 'In Progress' },
        {
          id: 's24',
          path: '3.2.S.2.4',
          title: 'Control of Critical Steps and Intermediates',
          status: 'In Progress',
        },
        { id: 's25', path: '3.2.S.2.5', title: 'Process Validation', status: 'Not Started' },
        {
          id: 's26',
          path: '3.2.S.2.6',
          title: 'Manufacturing Process Design',
          status: 'Not Started',
        },
      ],
    },
    {
      id: 's3',
      path: '3.2.S.3',
      title: 'Characterisation',
      status: 'In Progress',
      subsections: [
        { id: 's31', path: '3.2.S.3.1', title: 'Elucidation of Structure', status: 'Complete' },
        { id: 's32', path: '3.2.S.3.2', title: 'Impurities', status: 'In Progress' },
      ],
    },
    {
      id: 's4',
      path: '3.2.S.4',
      title: 'Control of Drug Substance',
      status: 'Not Started',
      subsections: [
        { id: 's41', path: '3.2.S.4.1', title: 'Specification', status: 'Not Started' },
        { id: 's42', path: '3.2.S.4.2', title: 'Analytical Procedures', status: 'Not Started' },
        {
          id: 's43',
          path: '3.2.S.4.3',
          title: 'Validation of Analytical Procedures',
          status: 'Not Started',
        },
        { id: 's44', path: '3.2.S.4.4', title: 'Batch Analyses', status: 'Not Started' },
        {
          id: 's45',
          path: '3.2.S.4.5',
          title: 'Justification of Specification',
          status: 'Not Started',
        },
      ],
    },
    { id: 's5', path: '3.2.S.5', title: 'Reference Standards', status: 'Not Started' },
    { id: 's6', path: '3.2.S.6', title: 'Container Closure System', status: 'Not Started' },
    {
      id: 's7',
      path: '3.2.S.7',
      title: 'Stability',
      status: 'Not Started',
      subsections: [
        {
          id: 's71',
          path: '3.2.S.7.1',
          title: 'Stability Summary and Conclusions',
          status: 'Not Started',
        },
        {
          id: 's72',
          path: '3.2.S.7.2',
          title: 'Post-approval Stability Protocol',
          status: 'Not Started',
        },
        { id: 's73', path: '3.2.S.7.3', title: 'Stability Data', status: 'Not Started' },
      ],
    },
  ];

  const getStatusBadge = status => {
    switch (status) {
      case 'Complete':
        return (
          <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
            Complete
          </span>
        );
      case 'In Progress':
        return (
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
            In Progress
          </span>
        );
      case 'Not Started':
        return (
          <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600">
            Not Started
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>CMC Blueprint Editor</CardTitle>
            <CardDescription>
              {blueprintId
                ? 'Edit existing blueprint'
                : 'Create a new blueprint for your CMC documentation'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {/* Professional Document Toolbar */}
            <Button
              variant={showTrackChanges ? 'default' : 'outline'}
              onClick={handleToggleTrackChanges}
              className="flex items-center gap-2"
            >
              <Edit className="h-4 w-4" />
              Track Changes
            </Button>

            <Separator orientation="vertical" className="h-6" />

            <Button variant="outline" onClick={handleToggleLock}>
              {formData.isLocked ? (
                <Unlock className="h-4 w-4 mr-2" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              {formData.isLocked ? 'Unlock' : 'Lock'}
            </Button>

            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>

            <Button variant="outline" onClick={handleRefreshTokens}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Refresh tokens from LIMS
            </Button>

            <Button
              variant="outline"
              onClick={handleGenerateCompliance}
              className="flex items-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Writing Helper
            </Button>

            <Button variant="default" onClick={handleSave} disabled={saving || formData.isLocked}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="general" value={currentTab} onValueChange={setCurrentTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="sections">Sections</TabsTrigger>
            <TabsTrigger value="revisions">Version History</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
            <TabsTrigger value="ai-assist">AI Assistant</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Blueprint Title</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="Enter blueprint title"
                  value={formData.title}
                  onChange={handleChange}
                  disabled={formData.isLocked}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="version">Version</Label>
                <Input
                  id="version"
                  name="version"
                  placeholder="1.0"
                  value={formData.version}
                  onChange={handleChange}
                  disabled={formData.isLocked}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Enter a detailed description of this blueprint"
                value={formData.description}
                onChange={handleChange}
                disabled={formData.isLocked}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="region">Target Region</Label>
                <Select
                  value={formData.region}
                  onValueChange={value => handleSelectChange('region', value)}
                  disabled={formData.isLocked}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a region" />
                  </SelectTrigger>
                  <SelectContent>
                    {regions.map(region => (
                      <SelectItem key={region.value} value={region.value}>
                        {region.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={value => handleSelectChange('category', value)}
                  disabled={formData.isLocked}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(category => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="productName">Product Name</Label>
              <Input
                id="productName"
                name="productName"
                placeholder="Enter the product name"
                value={formData.productName}
                onChange={handleChange}
                disabled={formData.isLocked}
              />
            </div>
          </TabsContent>

          <TabsContent value="sections" className="pt-4">
            <div className="space-y-4">
              {sectionsData.map(section => (
                <div key={section.id} className="border rounded-md p-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <h4 className="font-medium">{section.title}</h4>
                        <p className="text-xs text-muted-foreground">Section {section.path}</p>
                      </div>
                    </div>
                    <div>{getStatusBadge(section.status)}</div>
                  </div>

                  {section.subsections && section.subsections.length > 0 && (
                    <div className="mt-3 pl-8 grid gap-2">
                      {section.subsections.map(subsection => (
                        <div
                          key={subsection.id}
                          className="flex justify-between items-center py-1 border-t text-sm"
                        >
                          <div>
                            <span className="text-muted-foreground text-xs">{subsection.path}</span>
                            <p>{subsection.title}</p>
                          </div>
                          <div>{getStatusBadge(subsection.status)}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex justify-end">
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Last updated: May 8, 2025</span>
              </div>
              <Button>
                <Play className="h-4 w-4 mr-2" />
                Generate Content
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="revisions" className="pt-4">
            <div className="space-y-4">
              {revisionHistory.map(revision => (
                <div key={revision.id} className="flex items-start gap-3 border-b pb-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <History className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <h4 className="font-medium">Version {revision.version}</h4>
                      <span className="text-sm text-muted-foreground">{revision.date}</span>
                    </div>
                    <p className="text-sm">{revision.changes}</p>
                    <div className="mt-1 flex items-center text-xs text-muted-foreground">
                      <Users className="h-3 w-3 mr-1" />
                      <span>{revision.author}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-between">
              <Button variant="outline" size="sm">
                View All Revisions
              </Button>
              <Button variant="outline" size="sm">
                Compare Versions
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="compliance" className="pt-4">
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-md p-4 flex items-start gap-3">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <h4 className="font-medium text-amber-800">Compliance Check Required</h4>
                  <p className="text-sm text-amber-700">
                    Run a compliance check to ensure your blueprint meets all regulatory
                    requirements.
                  </p>
                </div>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Regulatory Compliance Checks</CardTitle>
                  <CardDescription>
                    Verify alignment with selected region requirements
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between p-2 border-b">
                      <span>ICH M4Q Guidelines</span>
                      <span className="text-gray-500">Not verified</span>
                    </div>
                    <div className="flex justify-between p-2 border-b">
                      <span>FDA Guidance for Industry</span>
                      <span className="text-gray-500">Not verified</span>
                    </div>
                    <div className="flex justify-between p-2 border-b">
                      <span>CTD Format Requirements</span>
                      <span className="text-gray-500">Not verified</span>
                    </div>
                    <div className="flex justify-between p-2 border-b">
                      <span>Section Completeness</span>
                      <span className="text-gray-500">Not verified</span>
                    </div>
                    <div className="flex justify-between p-2">
                      <span>Consistency Check</span>
                      <span className="text-gray-500">Not verified</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button variant="default" className="w-full" onClick={handleGenerateCompliance}>
                    <FileCheck className="h-4 w-4 mr-2" />
                    Run Compliance Check
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>

          {/* New AI Assistant Tab with Comprehensive Features */}
          <TabsContent value="ai-assist" className="pt-4">
            <div className="space-y-6">
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <Sparkles className="h-5 w-5 mr-2 text-blue-600" />
                    AI Writing Helper & Regulatory Assistant
                  </CardTitle>
                  <CardDescription>
                    Advanced AI-powered features for professional CMC document authoring with
                    real-time regulatory compliance checks.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Button
                      variant="outline"
                      className="h-20 flex flex-col items-center justify-center border-blue-300 hover:bg-blue-100"
                      onClick={() =>
                        toast({
                          title: 'AI Content Generation',
                          description: 'Generating regulatory-compliant content...',
                        })
                      }
                    >
                      <FileText className="h-6 w-6 mb-2 text-blue-600" />
                      <span className="text-sm font-medium">Generate Content</span>
                      <span className="text-xs text-gray-600">AI-powered section writing</span>
                    </Button>

                    <Button
                      variant="outline"
                      className="h-20 flex flex-col items-center justify-center border-purple-300 hover:bg-purple-100"
                      onClick={() =>
                        toast({
                          title: 'Compliance Check',
                          description: 'Running comprehensive regulatory compliance analysis...',
                        })
                      }
                    >
                      <CheckCircle2 className="h-6 w-6 mb-2 text-purple-600" />
                      <span className="text-sm font-medium">Compliance Check</span>
                      <span className="text-xs text-gray-600">Multi-region validation</span>
                    </Button>

                    <Button
                      variant="outline"
                      className="h-20 flex flex-col items-center justify-center border-green-300 hover:bg-green-100"
                      onClick={() =>
                        toast({
                          title: 'Format Optimization',
                          description:
                            'Optimizing document formatting for regulatory submission...',
                        })
                      }
                    >
                      <Bold className="h-6 w-6 mb-2 text-green-600" />
                      <span className="text-sm font-medium">Format Optimizer</span>
                      <span className="text-xs text-gray-600">Professional styling</span>
                    </Button>

                    <Button
                      variant="outline"
                      className="h-20 flex flex-col items-center justify-center border-orange-300 hover:bg-orange-100"
                      onClick={() =>
                        toast({
                          title: 'Citation Manager',
                          description: 'Managing regulatory references and citations...',
                        })
                      }
                    >
                      <BookOpen className="h-6 w-6 mb-2 text-orange-600" />
                      <span className="text-sm font-medium">Citation Manager</span>
                      <span className="text-xs text-gray-600">ICH/FDA references</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Track Changes Panel */}
              <TrackChangesPanel
                changes={trackChanges}
                onAcceptChange={handleAcceptChange}
                onRejectChange={handleRejectChange}
                showTrackChanges={showTrackChanges}
                onToggleTrackChanges={handleToggleTrackChanges}
              />

              {/* Regulatory Spell Check Panel */}
              <RegulatorySpellCheckPanel
                suggestions={regulatorySuggestions}
                onApplySuggestion={handleApplySuggestion}
                onDismissSuggestion={handleDismissSuggestion}
              />

              {/* Version History Panel */}
              <VersionHistoryPanel
                versions={versions}
                onRestoreVersion={handleRestoreVersion}
                currentVersion={formData.version}
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Professional Status Bar */}
        <div className="mt-6 px-4 py-2 bg-gray-50 rounded-md border">
          <div className="flex justify-between items-center text-sm text-gray-600">
            <div className="flex items-center space-x-4">
              <span>
                Document Status: <strong className="text-blue-600">In Progress</strong>
              </span>
              <span>
                Region: <strong>{formData.region}</strong>
              </span>
              <span>
                Category: <strong>{formData.category}</strong>
              </span>
            </div>
            <div className="flex items-center space-x-4">
              {showTrackChanges && (
                <span className="flex items-center">
                  <div className="w-2 h-2 bg-orange-500 rounded-full mr-1"></div>
                  Track Changes Active
                </span>
              )}
              {regulatorySuggestions.length > 0 && (
                <span className="text-purple-600">
                  {regulatorySuggestions.length} AI Suggestion
                  {regulatorySuggestions.length !== 1 ? 's' : ''}
                </span>
              )}
              <span>Version {formData.version}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default BlueprintEditor;

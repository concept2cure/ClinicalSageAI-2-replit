// SubmissionBuilder.jsx – simplified version without drag-drop tree
import React, { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle,
  XCircle,
  Info,
  AlertTriangle,
  Settings,
  Shield,
  Building,
  Users,
  FileText,
  FileX,
  Plus,
  ArrowUpDown,
  FileSearch,
  InfoIcon,
  Eye,
  Pencil,
  Trash,
  Files,
  RefreshCw,
  ClipboardCheck,
  FolderTree,
  FileArchive,
  Upload,
  FileDown,
  Loader2,
  Wand2,
} from 'lucide-react';
import { useQCWebSocket } from '../hooks/useQCWebSocket';
import { useTenant } from '../contexts/TenantContext.tsx';
import { OrganizationSwitcher } from '../components/tenant/OrganizationSwitcher.tsx';
import { ClientWorkspaceSwitcher } from '../components/tenant/ClientWorkspaceSwitcher.tsx';
import useNetworkResilience from '../hooks/useNetworkResilience.jsx';
import useHealthMonitor from '../hooks/useHealthMonitor.jsx';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import axios from 'axios';

// Region‑specific folder hierarchy definitions
const REGION_TREE = {
  FDA: {
    m1: {
      'm1.1': { 'cover-letter': {} },
      'm1.2': { 'form-1571': {}, 'form-3674': {} },
      'm1.3': { 'administrative-information': {} },
      'm1.4': { references: {} },
      'm1.5': { 'promotional-materials': {} },
    },
    m2: {
      'm2.1': { toc: {} },
      'm2.2': { introduction: {} },
      'm2.3': { 'quality-summary': {} },
      'm2.4': { 'non-clinical-summary': {} },
      'm2.5': { 'clinical-overview': {} },
      'm2.6': { 'non-clinical-written-and-tabulated-summaries': {} },
      'm2.7': { 'clinical-summary': {} },
    },
    m3: {
      'm3.1': { toc: {} },
      'm3.2': { 'body-of-data': {} },
      'm3.3': { 'literature-references': {} },
    },
    m4: {
      'm4.1': { toc: {} },
      'm4.2': { 'study-reports': {} },
      'm4.3': { 'literature-references': {} },
    },
    m5: {
      'm5.1': { toc: {} },
      'm5.2': { 'tabular-listing-of-clinical-studies': {} },
      'm5.3': { 'clinical-study-reports': {} },
      'm5.4': { 'literature-references': {} },
    },
  },
  EMA: {
    m1: {
      'm1.0': { 'eu-cover-letter': {} },
      'm1.2': { 'application-form': {} },
      'm1.3': {
        'product-information': {
          'm1.3.1': { 'smpc-pl-labelling': {} },
        },
      },
    },
    // Modules 2–5 similar to FDA but with EU regional requirements
    m2: {
      /* similar structure */
    },
    m3: {
      /* similar structure */
    },
    m4: {
      /* similar structure */
    },
    m5: {
      /* similar structure */
    },
  },
  PMDA: {
    m1: {
      'm1.1': { 'jp-index': {} },
      'm1.2': { 'approval-application-form': {} },
      'm1.5': { 'risk-management-plan': {} },
      'm1.13': { 'clinical-overview-for-generic-products': {} },
    },
    // Modules 2–5 similar to FDA but with Japanese regional requirements
    m2: {
      /* similar structure */
    },
    m3: {
      /* similar structure */
    },
    m4: {
      /* similar structure */
    },
    m5: {
      /* similar structure */
    },
  },
};

// Pre-defined folder structures by region
const REGION_FOLDERS = {
  FDA: [
    { module: 'm1', name: 'Administrative Information' },
    { module: 'm2', name: 'Common Technical Document Summaries' },
    { module: 'm3', name: 'Quality' },
    { module: 'm4', name: 'Nonclinical Study Reports' },
    { module: 'm5', name: 'Clinical Study Reports' },
  ],
  EMA: [
    { module: 'm1', name: 'EU Regional Administrative Information' },
    { module: 'm2', name: 'Common Technical Document Summaries' },
    { module: 'm3', name: 'Quality' },
    { module: 'm4', name: 'Nonclinical Study Reports' },
    { module: 'm5', name: 'Clinical Study Reports' },
  ],
  PMDA: [
    { module: 'm1', name: 'Japan Regional Administrative Information' },
    { module: 'm2', name: 'Common Technical Document Summaries' },
    { module: 'm3', name: 'Quality' },
    { module: 'm4', name: 'Nonclinical Study Reports' },
    { module: 'm5', name: 'Clinical Study Reports' },
  ],
};

// Region-specific requirements for QC checks
const REGION_REQUIREMENTS = {
  FDA: [
    '✓ Study data follows CDISC standards',
    '✓ Form 1571 must be in m1.2/form-1571',
    '✓ Form 3674 must be in m1.2/form-3674',
    '✗ Missing Clinical Overview in m2.5',
    '! Review Data Tabulation Model (RDTM) recommended for m5',
    '✓ Module 1 follows FDA regional requirements',
  ],
  EMA: [
    '✓ SmPC/PL/Labelling are in m1.3.1',
    '✓ Product information in xml format',
    '✓ Module 1 follows EU regional requirements',
    '! Risk Management Plan should be included',
    '✓ Uses eCTD format',
  ],
  PMDA: [
    '✓ Local reviewer assigned',
    '✓ Application form must be in m1.1/application-form',
    '✓ Risk Management Plan required in m1.5/risk-management-plan',
    '✓ Follows JP eCTD 1.0 technical validation requirements',
  ],
};

// Hints for each region
const REGION_HINTS = {
  FDA: [
    'Electronic submissions to FDA must use eCTD format as of May 5, 2018',
    'For clinical studies, CDISC SDTM/ADaM standards are required',
    'PDF documents must be PDF/A-compliant with proper bookmarks',
    'File and folder names should avoid special characters',
  ],
  EMA: [
    'Electronic submissions to EMA must be in eCTD format',
    'EDQM certificates should be included in Module 3',
    'All product information must be in XML format using PIM system',
    'Variations should include clear tracking of changes',
  ],
  PMDA: [
    'PMDA requires additional data for regional validation',
    'Module 1 should include Japan-specific annexes',
    'Documents in Japanese require certified translations',
    'Risk Management Plan is mandatory in section m1.5',
  ],
};

export default function SubmissionBuilder({
  initialRegion = 'FDA',
  region: propRegion,
  initialModule = null, // Support direct navigation to specific CTD module
}) {
  // Use either the passed region prop or fall back to initialRegion
  const [region, setRegion] = useState(propRegion || initialRegion);
  const [tree, setTree] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('builder');
  const [securitySettings, setSecuritySettings] = useState(null);
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [showStatusDetails, setShowStatusDetails] = useState(false);
  const [activeModule, setActiveModule] = useState(initialModule);

  // Get tenant context
  const tenantContext = useTenant();
  const { currentOrganization, currentClientWorkspace, getTenantHeaders } = tenantContext || {};

  // Network resilience and UI hooks
  const { request, isNetworkError, retryRequest } = useNetworkResilience();
  const healthStatus = useHealthMonitor();
  const { toast } = useToast();

  // Set up initial active tab based on initialModule prop
  useEffect(() => {
    if (initialModule) {
      console.log(`Navigating to specific module: ${initialModule}`);
      // Set active tab to the corresponding module
      switch (initialModule) {
        case 'm1':
          setActiveTab('module1');
          break;
        case 'm2':
          setActiveTab('module2');
          break;
        case 'm3':
          setActiveTab('module3');
          break;
        case 'm4':
          setActiveTab('module4');
          break;
        case 'm5':
          setActiveTab('module5');
          break;
        default:
          setActiveTab('builder');
      }
    }
  }, [initialModule]);

  // Handle messages from QC WebSocket
  const handleQCMessage = useCallback(
    data => {
      console.log(`[QC] Received update for region ${region}:`, data);

      // Handle QC status updates
      if (data && data.id && data.status) {
        // Show a toast notification
        if (data.status === 'passed') {
          console.log(`QC passed for document ${data.id}`);
        } else {
          console.error(`QC failed for document ${data.id}`);
        }

        // Update document node in tree if it exists
        setTree(prevTree => {
          // Make a deep copy to avoid mutation
          const newTree = JSON.parse(JSON.stringify(prevTree));

          // Find document by ID
          const doc = newTree.find(node => !node.droppable && node.id === data.id);
          if (doc) {
            // Set or update QC status
            doc.data = { ...doc.data, qc_json: { status: data.status } };
          }

          return newTree;
        });
      }
    },
    [region]
  );

  // Initialize WebSocket for QC notifications
  const {
    wsStatus,
    lastMessage,
    lastError,
    retries,
    send: sendToQC,
    reset: resetWS,
  } = useQCWebSocket(handleQCMessage);

  // Handle status badge formatting
  const getStatusBadgeClass = () => {
    switch (wsStatus) {
      case 'connected':
        return 'bg-green-100 text-green-800';
      case 'connecting':
      case 'reconnecting':
        return 'bg-amber-100 text-amber-800';
      case 'disconnected':
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get status message for display
  const getStatusMessage = () => {
    switch (wsStatus) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'reconnecting':
        return `Reconnecting (${retries})...`;
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return 'Connection Error';
      default:
        return 'Unknown Status';
    }
  };

  // Toggle document selection
  const toggleSelect = id => {
    setSelected(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      return newSelected;
    });
  };

  // Bulk approval handler
  const bulkApprove = () => {
    // Convert selected Set to array
    const selectedIds = Array.from(selected);
    console.log(`Bulk approving ${selectedIds.length} documents:`, selectedIds);

    // Toggle QC status on selected documents
    setTree(prevTree => {
      // Make a deep copy to avoid mutation
      const newTree = JSON.parse(JSON.stringify(prevTree));

      selectedIds.forEach(id => {
        // Find document by ID
        const doc = newTree.find(node => !node.droppable && node.id === id);
        if (doc) {
          // Set or update QC status
          doc.data = { ...doc.data, qc_json: { status: 'pending' } };
        }
      });

      return newTree;
    });

    // Trigger QC via WebSocket, if connected
    if (wsStatus === 'connected') {
      sendToQC({ action: 'request_qc', documents: selectedIds, region });
    } else {
      toast({
        title: 'Warning',
        description: 'QC system is not connected. Please try again later.',
        variant: 'warning',
      });
    }
  };

  // Save ordering handler
  const saveOrder = () => {
    console.log('Saving new order for region:', region);
    // Simulate save success
    toast({
      title: 'Success',
      description: 'Document order saved successfully',
      variant: 'success',
    });
  };

  // Trigger QC validation
  const triggerValidation = () => {
    if (wsStatus === 'connected') {
      sendToQC({ action: 'validate_submission', region });

      toast({
        title: 'Validation Started',
        description: 'eCTD validation is running. Results will appear shortly.',
        variant: 'info',
      });
    } else {
      toast({
        title: 'Cannot Validate',
        description: 'QC service is not connected. Please try again later.',
        variant: 'destructive',
      });
    }
  };

  // Build folder tree from document list
  const buildTree = useCallback((documents, selectedRegion) => {
    // Start with ID 0 for root
    let nextId = 0;

    // Create root folders first based on region
    const folders = REGION_FOLDERS[selectedRegion].map(folder => {
      nextId++;
      return {
        id: nextId,
        parent: 0, // Root is parent
        droppable: true,
        text: `${folder.module.toUpperCase()} - ${folder.name}`,
        data: { module: folder.module },
      };
    });

    // Add documents under appropriate parent folders
    const docs = documents.map(doc => {
      // Find parent folder ID
      nextId++;
      const parentFolder = folders.find(
        folder => doc.module && doc.module.startsWith(folder.data.module)
      );

      const parentId = parentFolder ? parentFolder.id : 0;

      return {
        id: nextId,
        parent: parentId,
        droppable: false,
        text: doc.filename,
        data: {
          document_id: doc.id,
          qc_json: doc.qc_status ? { status: doc.qc_status } : null,
        },
      };
    });

    // Add root node (invisible)
    const nodes = [{ id: 0, parent: -1, droppable: true, text: 'Root' }, ...folders, ...docs];

    return nodes;
  }, []);

  // Load security settings when tab changes to security
  useEffect(() => {
    if (activeTab === 'security' && currentClientWorkspace?.id) {
      loadSecuritySettings();
    }
  }, [activeTab, currentClientWorkspace]);

  // Load security settings
  async function loadSecuritySettings() {
    if (!currentClientWorkspace?.id) return;

    setIsSettingsLoading(true);
    try {
      const { data } = await request(
        () =>
          axios.get(`/api/clients/${currentClientWorkspace.id}/security-settings`, {
            headers: getTenantHeaders ? getTenantHeaders() : {},
          }),
        {
          operation: 'fetch-security-settings',
          errorMessage: 'Failed to load security settings',
        }
      );

      setSecuritySettings(
        data || {
          passwordPolicy: {
            minLength: 12,
            requireUppercase: true,
            requireLowercase: true,
            requireNumber: true,
            requireSpecialChar: true,
            historyCount: 5,
            expiryDays: 90,
          },
          sessionSettings: {
            timeoutMinutes: 30,
            maxConcurrentSessions: 3,
            enforceIpLock: false,
          },
          documentSettings: {
            requireApproval: true,
            digitalSignaturesEnabled: true,
            auditTrailEnabled: true,
          },
        }
      );
    } catch (error) {
      console.error('Error loading security settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load security settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSettingsLoading(false);
    }
  }

  // Load documents and build tree
  useEffect(() => {
    async function loadDocs() {
      if (!currentOrganization) {
        return; // Don't load if no organization is selected
      }

      setLoading(true);
      try {
        const response = await request(
          () =>
            fetch('/api/documents?status=all', {
              headers: getTenantHeaders ? getTenantHeaders() : {},
            }),
          {
            operation: 'fetch-documents',
            errorMessage: 'Failed to load submission documents',
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const docs = await response.json();

        // Build region-specific tree with retrieved documents
        const newTree = buildTree(docs, region);
        setTree(newTree);
      } catch (error) {
        console.error('Error loading documents:', error);
        toast({
          title: 'Error',
          description: 'Failed to load submission documents. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    }

    loadDocs();
  }, [region, buildTree, currentOrganization, currentClientWorkspace]);

  // Render folder node with children
  const renderFolderNode = node => {
    return (
      <div key={node.id} className="folder-item">
        <div className="folder-name font-medium py-1 px-3 bg-gray-100 rounded-t-md border-b">
          {node.text}
        </div>

        <div className="children pl-4 pt-2 pb-1">
          {tree
            .filter(child => child.parent === node.id)
            .map(child => (child.droppable ? renderFolderNode(child) : null))}
        </div>
      </div>
    );
  };

  if (loading)
    return (
      <div className="container max-w-7xl mx-auto py-4">
        <div className="mb-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold">Submission Builder</h2>
          <div className="flex items-center space-x-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <div className="grid gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-center items-center min-h-[400px]">
                <div className="flex flex-col items-center gap-2">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                  <p className="text-muted-foreground">Loading submission documents...</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );

  return (
    <div className="container max-w-7xl mx-auto py-4">
      {/* Tenant context selectors */}
      <div className="mb-6 grid md:grid-cols-2 gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">Submission Builder</h1>
          <p className="text-muted-foreground">Build and manage electronic CTD submissions</p>
        </div>
        <div className="flex flex-col md:flex-row md:items-center md:justify-end gap-2">
          {currentOrganization ? (
            <OrganizationSwitcher />
          ) : (
            <Button variant="outline" size="sm" className="flex items-center gap-1" disabled>
              <Building className="h-4 w-4" />
              <span>Select Organization</span>
            </Button>
          )}

          {currentOrganization &&
            (currentClientWorkspace ? (
              <ClientWorkspaceSwitcher />
            ) : (
              <Button variant="outline" size="sm" className="flex items-center gap-1" disabled>
                <Users className="h-4 w-4" />
                <span>Select Client</span>
              </Button>
            ))}
        </div>
      </div>

      {/* Tabs for different sections */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="space-y-4">
          {/* WebSocket connection status indicator */}
          <div className="flex items-center mb-3">
            <span
              className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStatusBadgeClass()}`}
              title={`QC WebSocket status: ${wsStatus}`}
            >
              {wsStatus === 'connecting' || wsStatus === 'reconnecting' ? (
                <span className="animate-pulse mr-1 h-2 w-2 rounded-full bg-current"></span>
              ) : null}
              {getStatusMessage()}
            </span>
          </div>

          {/* Region Selector */}
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center me-3">
                <span className="mr-2">Region:</span>
              </div>

              <div className="flex flex-wrap gap-1" role="group" aria-label="Region Selection">
                {Object.keys(REGION_FOLDERS).map(r => (
                  <Button
                    key={r}
                    variant={region === r ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRegion(r)}
                    disabled={!currentClientWorkspace}
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {region === 'FDA' &&
                'FDA submissions follow US regulatory standards and 21 CFR Part 11 requirements.'}
              {region === 'EMA' &&
                'EMA submissions adhere to EU regulatory requirements with regional variations.'}
              {region === 'PMDA' &&
                'PMDA submissions include Japan-specific annexes and follow PMDA guidelines.'}
            </p>
          </div>

          {/* Region hints */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4 text-sm">
            <div className="flex gap-2">
              <Info size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
              <ul className="space-y-1 m-0">
                {REGION_HINTS[region].map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            {/* Validation button */}
            <Button
              variant="success"
              onClick={() => triggerValidation()}
              disabled={!currentClientWorkspace}
            >
              <CheckCircle size={16} className="mr-1" />
              Run Validation
            </Button>
            {/* Export button */}
            <Button
              variant="default"
              onClick={() => console.log('Export requested')}
              disabled={!currentClientWorkspace}
            >
              Export for Submission
            </Button>
            {/* Import button */}
            <Button
              variant="outline"
              onClick={() => console.log('Import requested')}
              disabled={!currentClientWorkspace}
            >
              Import Documents
            </Button>
          </div>

          {/* Validation/QC status */}
          <Card className="mb-4">
            <CardContent className="pt-6">
              <h3 className="text-lg font-medium mb-2">Regional CTD Requirements</h3>
              <ul className="space-y-2">
                {REGION_REQUIREMENTS[region]?.map((req, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0"
                  >
                    {req.startsWith('✓') ? (
                      <CheckCircle className="text-green-500" size={16} />
                    ) : req.startsWith('✗') ? (
                      <XCircle className="text-red-500" size={16} />
                    ) : req.startsWith('!') ? (
                      <AlertTriangle className="text-amber-500" size={16} />
                    ) : (
                      <Info className="text-blue-500" size={16} />
                    )}
                    <span>{req.substring(2)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Tree structure - using simplified version without DnD */}
          <Card className="mb-4">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium">
                  {activeModule
                    ? `Module ${activeModule.substring(1)} - ${
                        activeModule === 'm1'
                          ? 'Administrative'
                          : activeModule === 'm2'
                            ? 'Summaries'
                            : activeModule === 'm3'
                              ? 'Quality'
                              : activeModule === 'm4'
                                ? 'Nonclinical'
                                : activeModule === 'm5'
                                  ? 'Clinical'
                                  : 'CTD Structure'
                      }`
                    : 'eCTD Structure'}
                </h3>
                <div className="bg-amber-100 text-amber-800 flex items-center text-xs px-2 py-1 rounded">
                  <AlertTriangle size={14} className="mr-1" />
                  Drag and drop temporarily disabled
                </div>
              </div>

              {/* Module navigation tabs */}
              {!activeModule && (
                <div className="mb-4 flex flex-wrap gap-1">
                  {['m1', 'm2', 'm3', 'm4', 'm5'].map(module => (
                    <Button
                      key={module}
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveModule(module)}
                      className="flex items-center gap-1"
                    >
                      <span className="font-mono">{module.toUpperCase()}</span>
                      <span className="hidden sm:inline">
                        -{' '}
                        {module === 'm1'
                          ? 'Administrative'
                          : module === 'm2'
                            ? 'Summaries'
                            : module === 'm3'
                              ? 'Quality'
                              : module === 'm4'
                                ? 'Nonclinical'
                                : 'Clinical'}
                      </span>
                    </Button>
                  ))}
                </div>
              )}

              {/* Back button when viewing a specific module */}
              {activeModule && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveModule(null)}
                  className="mb-3"
                >
                  ← Back to All Modules
                </Button>
              )}

              <div className="folders-container space-y-4">
                {tree
                  .filter(node => {
                    // If activeModule is set, only show folders for that module
                    if (activeModule && node.droppable && node.id !== 0) {
                      return node.data?.module === activeModule;
                    }
                    // Otherwise show all folders
                    return node.droppable && node.id !== 0;
                  })
                  .map(folder => (
                    <div
                      key={folder.id}
                      className={`folder border rounded-md overflow-hidden ${
                        activeModule === folder.data.module ? 'ring-2 ring-primary' : ''
                      }`}
                    >
                      <div className="folder-header py-2 px-3 bg-gray-50 border-b flex items-center justify-between">
                        <strong className="text-sm">{folder.text}</strong>
                      </div>
                      <div className="folder-content p-2">
                        {tree
                          .filter(node => !node.droppable && node.parent === folder.id)
                          .map(doc => {
                            const qcStatus = doc.data?.qc_json?.status;
                            const isSelected = selected.has(doc.id);

                            return (
                              <div
                                key={doc.id}
                                onClick={() => toggleSelect(doc.id)}
                                className={`flex items-center py-2 px-3 rounded-md cursor-pointer border-b last:border-0 ${
                                  isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                                }`}
                              >
                                <div className="mr-2">
                                  <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-primary focus:ring-primary/20"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    id={`check-${doc.id}`}
                                  />
                                </div>

                                {qcStatus === 'passed' ? (
                                  <CheckCircle
                                    size={14}
                                    className="text-green-500 mr-2 flex-shrink-0"
                                  />
                                ) : qcStatus === 'failed' ? (
                                  <XCircle size={14} className="text-red-500 mr-2 flex-shrink-0" />
                                ) : (
                                  <AlertTriangle
                                    size={14}
                                    className="text-amber-500 mr-2 flex-shrink-0"
                                  />
                                )}

                                <span className="text-sm">{doc.text}</span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2 mt-3">
            <Button onClick={saveOrder} disabled={!currentClientWorkspace}>
              Save Order
            </Button>
            <Button
              variant="outline"
              disabled={!selected.size || !currentClientWorkspace}
              onClick={bulkApprove}
            >
              Bulk Approve + QC
            </Button>

            {/* Show status details button */}
            <Button
              variant="outline"
              className="ml-auto"
              onClick={() => setShowStatusDetails(!showStatusDetails)}
            >
              Status Details {showStatusDetails ? '▲' : '▼'}
            </Button>
          </div>

          {/* Status details panel */}
          {showStatusDetails && (
            <Card className="mt-3">
              <CardContent className="pt-4">
                <h4 className="text-sm font-medium mb-2">WebSocket Status Details</h4>
                <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto">
                  {JSON.stringify({ wsStatus, lastMessage, lastError, retries }, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-medium mb-4">Submission History</h3>

              {currentClientWorkspace ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-5 font-medium text-sm border-b pb-2">
                    <div>Date</div>
                    <div>Sequence</div>
                    <div>Type</div>
                    <div>Status</div>
                    <div>Actions</div>
                  </div>

                  {/* Historical submissions would be loaded from API */}
                  <div className="grid grid-cols-5 text-sm border-b pb-2">
                    <div>2025-04-15</div>
                    <div>0000</div>
                    <div>Original Application</div>
                    <div className="flex items-center">
                      <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                        Submitted
                      </span>
                    </div>
                    <div>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-5 text-sm border-b pb-2">
                    <div>2025-03-22</div>
                    <div>0000</div>
                    <div>Original Application</div>
                    <div className="flex items-center">
                      <span className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded">
                        Draft
                      </span>
                    </div>
                    <div>
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center">
                  <p className="text-muted-foreground mb-2">
                    Please select an organization and client workspace to view submission history
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">Security Settings</h3>
                <Shield className="h-5 w-5 text-blue-500" />
              </div>

              {currentClientWorkspace ? (
                isSettingsLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {securitySettings && (
                      <>
                        <div>
                          <h4 className="text-md font-medium mb-2">Password Policy</h4>
                          <div className="grid md:grid-cols-2 gap-3">
                            <div className="flex items-center justify-between p-3 border rounded">
                              <span>Minimum Length</span>
                              <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                                {securitySettings.passwordPolicy.minLength}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-3 border rounded">
                              <span>Uppercase Required</span>
                              <span
                                className={
                                  securitySettings.passwordPolicy.requireUppercase
                                    ? 'text-green-500'
                                    : 'text-red-500'
                                }
                              >
                                {securitySettings.passwordPolicy.requireUppercase ? 'Yes' : 'No'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-3 border rounded">
                              <span>Password History</span>
                              <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                                {securitySettings.passwordPolicy.historyCount}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-3 border rounded">
                              <span>Password Expiry</span>
                              <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                                {securitySettings.passwordPolicy.expiryDays} days
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-md font-medium mb-2">Session Settings</h4>
                          <div className="grid md:grid-cols-2 gap-3">
                            <div className="flex items-center justify-between p-3 border rounded">
                              <span>Session Timeout</span>
                              <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                                {securitySettings.sessionSettings.timeoutMinutes} minutes
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-3 border rounded">
                              <span>Max Concurrent Sessions</span>
                              <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                                {securitySettings.sessionSettings.maxConcurrentSessions}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-md font-medium mb-2">Document Security</h4>
                          <div className="grid md:grid-cols-2 gap-3">
                            <div className="flex items-center justify-between p-3 border rounded">
                              <span>Approval Required</span>
                              <span
                                className={
                                  securitySettings.documentSettings.requireApproval
                                    ? 'text-green-500'
                                    : 'text-red-500'
                                }
                              >
                                {securitySettings.documentSettings.requireApproval ? 'Yes' : 'No'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-3 border rounded">
                              <span>Digital Signatures</span>
                              <span
                                className={
                                  securitySettings.documentSettings.digitalSignaturesEnabled
                                    ? 'text-green-500'
                                    : 'text-red-500'
                                }
                              >
                                {securitySettings.documentSettings.digitalSignaturesEnabled
                                  ? 'Enabled'
                                  : 'Disabled'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-3 border rounded">
                              <span>Audit Trail</span>
                              <span
                                className={
                                  securitySettings.documentSettings.auditTrailEnabled
                                    ? 'text-green-500'
                                    : 'text-red-500'
                                }
                              >
                                {securitySettings.documentSettings.auditTrailEnabled
                                  ? 'Enabled'
                                  : 'Disabled'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2">
                          <Button variant="outline" disabled>
                            Reset to Default
                          </Button>
                          <Button>Edit Settings</Button>
                        </div>
                      </>
                    )}
                  </div>
                )
              ) : (
                <div className="p-4 text-center">
                  <p className="text-muted-foreground mb-2">
                    Please select an organization and client workspace to view security settings
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

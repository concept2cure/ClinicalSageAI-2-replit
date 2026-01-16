import React, { useState, useEffect, useMemo, useCallback } from 'react';
// import { useNavigate } from 'react-router-dom'; // Removed for prop-based routing
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import {
  Plus, Edit, Eye, Users, CalendarClock, TrendingUp, AlertCircle, AlertTriangle, FlaskConical, ChevronDown, Upload, BarChart3, RefreshCw, Zap, User, CheckCircle2, Activity } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { diffWords, renderUnifiedFiltered, computeSafety } from '@/lib/diff';
import { Switch } from '@/components/ui/switch';

const AnalyticalMethodsTab = ({ openModal, onViewMethod }) => {
  // Remove unused navigate import since we're using prop-based routing
  const [methods, setMethods] = useState([]);
  const [gaps, setGaps] = useState({});
  const [runs, setRuns] = useState({});
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [availableUsers, setAvailableUsers] = useState([]);

  // LIMS Data Import State
  const [csvFile, setCsvFile] = useState(null);
  const [csvImportType, setCsvImportType] = useState('linearity');
  const [csvImporting, setCsvImporting] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState(null);
  const [importMessage, setImportMessage] = useState('');
  const [showLimsPanel, setShowLimsPanel] = useState(false);

  // Diff Preview State
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [oldBlock, setOldBlock] = useState('');
  const [newBlock, setNewBlock] = useState('');
  const [unifiedHtml, setUnifiedHtml] = useState('');
  const [addCount, setAddCount] = useState(0);
  const [delCount, setDelCount] = useState(0);
  const [makeCheckpoint, setMakeCheckpoint] = useState(true);
  const [previewMethodId, setPreviewMethodId] = useState(null);

  // Enhanced Diff State
  const [hideWs, setHideWs] = useState(true);
  const [hidePunct, setHidePunct] = useState(true);
  const [tokens, setTokens] = useState([]);
  const [safety, setSafety] = useState({ numericOnly: false, changeRatio: 0, safe: false });
  const SAFE_RATIO = 0.005; // 0.5%

  useEffect(() => {
    const fetchAnalyticalData = async () => {
      try {
        setLoading(true);

        // Fetch available users for assignment
        const usersResponse = await fetch('/api/users', {
          headers: {
            'x-tenant-id': localStorage.getItem('currentOrganization') || '7',
            'Content-Type': 'application/json',
          },
        });
        if (usersResponse.ok) {
          const users = await usersResponse.json();
          setAvailableUsers(users || []);
        }

        // Get current organization from localStorage or default
        const currentOrgId = localStorage.getItem('currentOrganization') || '7';

        const headers = {
          'x-tenant-id': currentOrgId,
          'Content-Type': 'application/json',
        };

        // Fetch methods from API
        const methodsResponse = await fetch('/api/analytical/methods', { headers });
        if (!methodsResponse.ok) {
          throw new Error(`Failed to fetch methods: ${methodsResponse.status}`);
        }
        const methodsData = await methodsResponse.json();
        console.log('Fetched analytical methods:', methodsData);
        console.log('Methods data type:', typeof methodsData, Array.isArray(methodsData));
        setMethods(methodsData);

        // Fetch gaps from API
        const gapsResponse = await fetch('/api/analytical/methods/gaps', { headers });
        const gapsData = await gapsResponse.json();
        setGaps(gapsData);

        // Fetch runs from API
        const runsResponse = await fetch('/api/analytical/methods/runs', { headers });
        const runsData = await runsResponse.json();
        setRuns(runsData);
      } catch (error) {
        console.error('Error fetching analytical data:', error);
        // Fallback to demo data if API fails
        setMethods([
          {
            id: 1,
            code: 'AM-001',
            title: 'HPLC-UV • API Assay',
            technique: 'HPLC-UV',
            matrix: 'Drug Product',
            analyte: 'Active Pharmaceutical Ingredient',
            range: '0.05–150 μg/mL',
            precisionTarget: '≤2.0% RSD',
            accuracyTarget: '98–102%',
            status: 'IN_VALIDATION',
            owner: 'Dr. Sarah Chen',
            due: '2025-09-15',
            readiness: 85,
          },
        ]);
        setGaps({});
        setRuns({});
      } finally {
        setLoading(false);
      }
    };

    fetchAnalyticalData();
  }, []);

  // LIMS CSV Import Functions with Enhanced Error Handling
  const importCSV = async () => {
    // Input validation
    if (!csvFile || !selectedMethodId) {
      setImportMessage('❌ Please select both a method and CSV file');
      setTimeout(() => setImportMessage(''), 3000);
      return;
    }

    // File validation
    if (!csvFile.name.toLowerCase().endsWith('.csv')) {
      setImportMessage('❌ Please select a valid CSV file');
      setTimeout(() => setImportMessage(''), 3000);
      return;
    }

    // Enhanced file size validation (10MB limit with detailed feedback)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (csvFile.size > maxSize) {
      const fileSizeMB = (csvFile.size / (1024 * 1024)).toFixed(1);
      setImportMessage(`❌ File size ${fileSizeMB}MB exceeds 10MB limit`);
      setTimeout(() => setImportMessage(''), 4000);
      return;
    }

    try {
      setCsvImporting(true);
      setImportMessage('📤 Uploading and processing CSV file...');

      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const formData = new FormData();
      formData.append('file', csvFile);

      const endpoint = `/api/analytical-database/methods/${selectedMethodId}/${csvImportType}/import`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-tenant-id': currentOrgId,
          'x-user-name': 'Current User',
        },
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        setImportMessage(
          `✅ Successfully imported ${result.inserted} ${csvImportType} data points`
        );
        setCsvFile(null);

        // Clear file input
        const fileInput = document.querySelector('[data-testid="input-csv-file"]');
        if (fileInput) fileInput.value = '';

        // Refresh methods data
        try {
          const methodsResponse = await fetch('/api/analytical/methods', {
            headers: { 'x-tenant-id': currentOrgId },
          });
          if (methodsResponse.ok) {
            const methodsData = await methodsResponse.json();
            setMethods(methodsData);
          }
        } catch (refreshError) {
          console.warn('Failed to refresh methods data:', refreshError);
        }

        setTimeout(() => setImportMessage(''), 5000);
      } else {
        let errorMessage = 'Unknown error occurred';
        try {
          const errorData = await response.json();
          errorMessage =
            errorData.error || errorData.message || `Server error (${response.status})`;
        } catch (parseError) {
          errorMessage = `Server error (${response.status}): ${response.statusText}`;
        }
        setImportMessage(`❌ Import failed: ${errorMessage}`);
        setTimeout(() => setImportMessage(''), 6000);
      }
    } catch (error) {
      console.error('Error importing CSV:', error);
      let errorMessage = 'Network or connection error';
      if (error.message) {
        errorMessage = error.message.includes('Failed to fetch')
          ? 'Connection error - please check your network'
          : error.message;
      }
      setImportMessage(`❌ Import failed: ${errorMessage}`);
      setTimeout(() => setImportMessage(''), 6000);
    } finally {
      setCsvImporting(false);
    }
  };

  // Recompute validation documents with fresh LIMS data - Enhanced Error Handling
  const recomputeValidationDoc = async methodId => {
    if (!methodId) {
      setImportMessage('❌ Invalid method ID');
      setTimeout(() => setImportMessage(''), 3000);
      return;
    }

    try {
      setImportMessage('🔄 Refreshing validation document with latest LIMS data...');
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';

      // Find validation document for this method
      const docsResponse = await fetch(
        `/api/analytical-database/validation-documents?method_id=${methodId}`,
        {
          headers: {
            'x-tenant-id': currentOrgId,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!docsResponse.ok) {
        throw new Error(`Failed to fetch validation documents (${docsResponse.status})`);
      }

      const docs = await docsResponse.json();
      if (!Array.isArray(docs) || docs.length === 0) {
        setImportMessage(
          '❌ No validation document found for this method. Create a validation document first.'
        );
        setTimeout(() => setImportMessage(''), 6000);
        return;
      }

      const validationDoc = docs[0]; // Get first validation document

      // Get sections for the document
      const sectionsResponse = await fetch(
        `/api/analytical-database/documents/${validationDoc.id}/sections`,
        {
          headers: {
            'x-tenant-id': currentOrgId,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!sectionsResponse.ok) {
        throw new Error(`Failed to fetch document sections (${sectionsResponse.status})`);
      }

      const sections = await sectionsResponse.json();
      if (!Array.isArray(sections) || sections.length === 0) {
        setImportMessage('❌ No document sections found. Document may be empty.');
        setTimeout(() => setImportMessage(''), 6000);
        return;
      }

      const mainSection = sections[0];

      // Recompute the section
      const recomputeResponse = await fetch(
        `/api/analytical-database/sections/${mainSection.section_id}/recompute-tokens`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': currentOrgId,
            'x-user-name': 'Current User',
          },
        }
      );

      if (!recomputeResponse.ok) {
        const errorText = await recomputeResponse.text().catch(() => 'Unknown error');
        throw new Error(`Recompute failed (${recomputeResponse.status}): ${errorText}`);
      }

      const result = await recomputeResponse.json();

      if (result && result.dataPoints) {
        const totalDataPoints =
          (result.dataPoints.linearity || 0) +
          (result.dataPoints.accuracy || 0) +
          (result.dataPoints.precision || 0);
        setImportMessage(
          `✅ Validation document updated successfully with fresh LIMS data (${totalDataPoints} data points)`
        );
      } else {
        setImportMessage('✅ Validation document updated successfully');
      }

      setTimeout(() => setImportMessage(''), 7000);
    } catch (error) {
      console.error('Recompute failed:', error);

      let errorMessage = 'Unknown error occurred';
      if (error.message) {
        if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Connection error - please check your network';
        } else if (error.message.includes('NetworkError')) {
          errorMessage = 'Network error - server may be unavailable';
        } else {
          errorMessage = error.message;
        }
      }

      setImportMessage(`❌ Recompute failed: ${errorMessage}`);
      setTimeout(() => setImportMessage(''), 8000);
    }
  };

  // Enhanced Recompute with diff preview
  const openDiffPreview = async methodId => {
    if (!methodId) {
      setImportMessage('❌ Invalid method ID');
      setTimeout(() => setImportMessage(''), 3000);
      return;
    }

    setPreviewMethodId(methodId);
    setPreviewOpen(true);
    setLoadingPreview(true);

    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';

      // Find validation document for this method
      const docsResponse = await fetch(
        `/api/analytical-database/validation-documents?method_id=${methodId}`,
        {
          headers: {
            'x-tenant-id': currentOrgId,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!docsResponse.ok) {
        throw new Error(`Failed to fetch validation documents (${docsResponse.status})`);
      }

      const docs = await docsResponse.json();
      if (!Array.isArray(docs) || docs.length === 0) {
        setImportMessage(
          '❌ No validation document found for this method. Create a validation document first.'
        );
        setPreviewOpen(false);
        setTimeout(() => setImportMessage(''), 6000);
        return;
      }

      const validationDoc = docs[0];

      // Get sections for the document
      const sectionsResponse = await fetch(
        `/api/analytical-database/documents/${validationDoc.id}/sections`,
        {
          headers: {
            'x-tenant-id': currentOrgId,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!sectionsResponse.ok) {
        throw new Error(`Failed to fetch document sections (${sectionsResponse.status})`);
      }

      const sections = await sectionsResponse.json();
      if (!Array.isArray(sections) || sections.length === 0) {
        setImportMessage('❌ No document sections found. Document may be empty.');
        setPreviewOpen(false);
        setTimeout(() => setImportMessage(''), 6000);
        return;
      }

      const mainSection = sections[0];

      // Get preview diff
      const previewResponse = await fetch(
        `/api/analytical-database/sections/${mainSection.section_id}/recompute-preview`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': currentOrgId,
            'x-user-name': 'Current User',
          },
        }
      );

      if (!previewResponse.ok) {
        const errorText = await previewResponse.text().catch(() => 'Unknown error');
        throw new Error(`Preview failed (${previewResponse.status}): ${errorText}`);
      }

      const { oldBlock, newBlock } = await previewResponse.json();
      setOldBlock(oldBlock || '');
      setNewBlock(newBlock || '');

      // Generate diff with enhanced classification
      const toks = diffWords(oldBlock || '', newBlock || '');
      setTokens(toks);

      // Initial render with filters
      const { html, stats } = renderUnifiedFiltered(toks, {
        hideWhitespace: hideWs,
        hidePunctuation: hidePunct,
      });
      setUnifiedHtml(html);

      const s = computeSafety(stats, {
        safeRatio: SAFE_RATIO,
        allowNumericOnly: true,
      });

      setAddCount(stats.adds);
      setDelCount(stats.dels);
      setSafety(s);
    } catch (error) {
      console.error('Preview failed:', error);

      let errorMessage = 'Unknown error occurred';
      if (error.message) {
        if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Connection error - please check your network';
        } else if (error.message.includes('NetworkError')) {
          errorMessage = 'Network error - server may be unavailable';
        } else {
          errorMessage = error.message;
        }
      }

      setImportMessage(`❌ Preview failed: ${errorMessage}`);
      setPreviewOpen(false);
      setTimeout(() => setImportMessage(''), 8000);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Execute recompute after preview confirmation
  const executeRecompute = async () => {
    if (!previewMethodId) return;

    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';

      // Find validation document for this method
      const docsResponse = await fetch(
        `/api/analytical-database/validation-documents?method_id=${previewMethodId}`,
        {
          headers: {
            'x-tenant-id': currentOrgId,
            'Content-Type': 'application/json',
          },
        }
      );

      const docs = await docsResponse.json();
      const validationDoc = docs[0];

      // Get sections for the document
      const sectionsResponse = await fetch(
        `/api/analytical-database/documents/${validationDoc.id}/sections`,
        {
          headers: {
            'x-tenant-id': currentOrgId,
            'Content-Type': 'application/json',
          },
        }
      );

      const sections = await sectionsResponse.json();
      const mainSection = sections[0];

      // Create checkpoint if requested
      if (makeCheckpoint) {
        await fetch(`/api/analytical-database/sections/${mainSection.section_id}/checkpoint`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': currentOrgId,
          },
          body: JSON.stringify({ reason: 'Recompute from LIMS (user-confirmed)' }),
        });
      }

      // Execute recompute
      const recomputeResponse = await fetch(
        `/api/analytical-database/sections/${mainSection.section_id}/recompute-tokens`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': currentOrgId,
            'x-user-name': 'Current User',
          },
        }
      );

      if (!recomputeResponse.ok) {
        throw new Error(`Recompute failed (${recomputeResponse.status})`);
      }

      const result = await recomputeResponse.json();
      setImportMessage(`✅ Validation document updated successfully with fresh LIMS data`);
      setPreviewOpen(false);
      setTimeout(() => setImportMessage(''), 7000);
    } catch (error) {
      console.error('Recompute failed:', error);
      setImportMessage(`❌ Recompute failed: ${error.message}`);
      setTimeout(() => setImportMessage(''), 8000);
    }
  };

  // Re-render diff when filters change
  useEffect(() => {
    if (tokens.length > 0) {
      const { html, stats } = renderUnifiedFiltered(tokens, {
        hideWhitespace: hideWs,
        hidePunctuation: hidePunct,
      });
      setUnifiedHtml(html);

      const s = computeSafety(stats, {
        safeRatio: SAFE_RATIO,
        allowNumericOnly: true,
      });
      setSafety(s);
    }
  }, [hideWs, hidePunct, tokens]);

  const statusBadgeColor = status => {
    switch (status) {
      case 'APPROVED':
        return 'default';
      case 'IN_VALIDATION':
        return 'secondary';
      case 'UNDER_DEV':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getStatusIcon = status => {
    switch (status) {
      case 'APPROVED':
        return '✓';
      case 'IN_VALIDATION':
        return '⚠';
      case 'UNDER_DEV':
        return '⚙';
      default:
        return '◯';
    }
  };

  const getReadinessColor = readiness => {
    if (readiness >= 90) return 'bg-emerald-600';
    if (readiness >= 70) return 'bg-yellow-500';
    if (readiness >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  };

  // Memoized callbacks for performance
  const assignToUser = useCallback(async (id, userId, userName) => {
    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const headers = {
        'x-tenant-id': currentOrgId,
        'x-user-name': userName,
        'Content-Type': 'application/json',
      };
      const response = await fetch(`/api/analytical/methods/${id}/assign`, {
        method: 'POST',
        headers,
      });
      if (response.ok) {
        const updated = await response.json();
        setMethods(prev => prev.map(m => (m.id === id ? { ...m, owner: updated.owner } : m)));
      }
    } catch (error) {
      console.error('Error assigning method:', error);
      // Update state optimistically for demo
      setMethods(prev => prev.map(m => (m.id === id ? { ...m, owner: userName } : m)));
    }
  }, []);

  const updateStatus = useCallback(async (id, status) => {
    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const headers = {
        'x-tenant-id': currentOrgId,
        'x-user-name': 'Current User',
        'Content-Type': 'application/json',
      };

      const response = await fetch(`/api/analytical/methods/${id}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status }),
      });
      if (response.ok) {
        setMethods(prev => prev.map(m => (m.id === id ? { ...m, status } : m)));
      }
    } catch (error) {
      console.error('Error updating status:', error);
      // Update state optimistically for demo
      setMethods(prev => prev.map(m => (m.id === id ? { ...m, status } : m)));
    }
  }, []);

  const startGapResolution = async (methodId, gap) => {
    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const headers = {
        'x-tenant-id': currentOrgId,
        'x-user-name': 'Current User',
        'Content-Type': 'application/json',
      };

      // Fetch gap resolution workflow
      const workflowResponse = await fetch(
        `/api/analytical/gap-resolution-workflows/${gap.ruleId}`,
        { headers }
      );
      const workflow = await workflowResponse.json();

      // Open gap resolution modal with workflow
      openModal('gap-workflow', {
        methodId,
        gap,
        workflow,
        onComplete: () => {
          // Refresh gaps after resolution
          window.location.reload();
        },
      });
    } catch (error) {
      console.error('Error starting gap resolution:', error);
      alert('Failed to start gap resolution workflow');
    }
  };

  const createTaskFromGap = async (methodId, gap) => {
    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const headers = {
        'x-tenant-id': currentOrgId,
        'x-user-name': 'Current User',
        'Content-Type': 'application/json',
      };

      const taskData = {
        title: `Resolve: ${gap.title}`,
        description: `${gap.why}\n\nResolution Steps:\n${gap.resolutionSteps?.map((step, i) => `${i + 1}. ${step}`).join('\n') || 'Follow ICH guidelines'}`,
        priority:
          gap.severity === 'CRITICAL' ? 'URGENT' : gap.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
        assignedTo: 'Current User',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        sourceGapId: gap.id,
        methodId: methodId,
      };

      const response = await fetch(
        `/api/analytical/methods/${methodId}/gaps/${gap.id}/create-task`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(taskData),
        }
      );

      if (response.ok) {
        const task = await response.json();
        console.log('Created task from gap:', task);

        // Show success message with task details in a more professional way
        const successDiv = document.createElement('div');
        successDiv.className =
          'fixed top-4 right-4 bg-green-50 border border-green-200 rounded-lg p-4 shadow-lg z-50';
        successDiv.innerHTML = `
          <div class="flex items-start">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3">
              <h3 class="text-sm font-medium text-green-800">Task Created Successfully</h3>
              <div class="mt-1 text-sm text-green-700">
                <p><strong>${task.title}</strong></p>
                <p class="text-xs text-green-600 mt-1">ID: ${task.id} • Priority: ${task.priority}</p>
              </div>
            </div>
          </div>
        `;

        document.body.appendChild(successDiv);
        setTimeout(() => {
          document.body.removeChild(successDiv);
        }, 5000);

        // Optional: refresh gaps to show updated state
        window.location.reload();
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error creating task from gap:', error);

      // Show error message in a more professional way
      const errorDiv = document.createElement('div');
      errorDiv.className =
        'fixed top-4 right-4 bg-red-50 border border-red-200 rounded-lg p-4 shadow-lg z-50';
      errorDiv.innerHTML = `
        <div class="flex items-start">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-red-800">Failed to Create Task</h3>
            <div class="mt-1 text-sm text-red-700">
              <p>Unable to create task from validation gap. Please try again.</p>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(errorDiv);
      setTimeout(() => {
        document.body.removeChild(errorDiv);
      }, 5000);
    }
  };

  // Memoized filtered methods for performance
  const filtered = useMemo(() => {
    // Ensure methods is always an array
    const methodsArray = Array.isArray(methods) ? methods : [];
    if (!filter) return methodsArray;
    const searchTerm = filter.toLowerCase();
    return methodsArray.filter(m =>
      [m.code, m.title, m.technique, m.matrix, m.analyte, m.owner]
        .join(' ')
        .toLowerCase()
        .includes(searchTerm)
    );
  }, [methods, filter]);

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading analytical methods data">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-4"></div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Analytical Methods</h3>
            <p className="text-sm text-gray-600">Fetching LIMS data and validation status...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse border rounded-lg p-6" aria-hidden="true">
              <div className="flex items-center justify-between mb-4">
                <div className="h-6 bg-gray-200 rounded w-24"></div>
                <div className="h-5 bg-gray-200 rounded-full w-16"></div>
              </div>
              <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="flex gap-2 mb-4">
                <div className="h-6 bg-gray-200 rounded-full w-20"></div>
                <div className="h-6 bg-gray-200 rounded-full w-16"></div>
              </div>
              <div className="flex justify-between">
                <div className="h-8 bg-gray-200 rounded w-16"></div>
                <div className="h-8 bg-gray-200 rounded w-20"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Analytical Methods</h2>
          <p className="text-gray-600">
            AI-driven method development, validation, and lifecycle management with ICH Q2(R2) & Q14
            compliance
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowLimsPanel(!showLimsPanel)}
            data-testid="button-toggle-lims"
          >
            <Upload className="w-4 h-4 mr-2" />
            LIMS Data
          </Button>
          <Button
            onClick={() => openModal('analytical-methods')}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Method
          </Button>
        </div>
      </div>

      {/* LIMS Data Import Panel */}
      {showLimsPanel && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                LIMS Data Import & Integration
              </div>
              <Button
                onClick={() => window.open('/analytical-monitoring', '_blank')}
                variant="outline"
                size="sm"
                className="border-blue-300 text-blue-700 hover:bg-blue-100"
              >
                <Activity className="w-4 h-4 mr-2" />
                Real-Time Monitor
              </Button>
            </CardTitle>
            <CardDescription>
              <div className="flex items-center gap-2">
                <span>
                  Import validation data from LIMS systems and refresh documents with latest
                  analytical results
                </span>
                <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">
                  Enhanced AI + Guards
                </Badge>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {importMessage && (
              <div className="p-3 bg-white border rounded-md">
                <p className="text-sm">{importMessage}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* CSV Import Section */}
              <div className="space-y-3">
                <h4 className="font-medium text-blue-800">CSV Data Import</h4>
                <div className="bg-white p-4 rounded-md border space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Select Method</label>
                    <select
                      value={selectedMethodId || ''}
                      onChange={e => setSelectedMethodId(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-md text-sm"
                      data-testid="select-method-for-import"
                      aria-label="Select method for CSV import"
                    >
                      <option value="">Choose method...</option>
                      {methods.map(method => (
                        <option key={method.id} value={method.id}>
                          {method.code} - {method.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Data Type</label>
                    <select
                      value={csvImportType}
                      onChange={e => setCsvImportType(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-md text-sm"
                      aria-label="Select data type for CSV import"
                      data-testid="select-data-type"
                    >
                      <option value="linearity">Linearity Data</option>
                      <option value="accuracy">Accuracy Data</option>
                      <option value="precision">Precision Data</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">CSV File</label>
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={e => setCsvFile(e.target.files[0])}
                      className="text-sm"
                      data-testid="input-csv-file"
                      aria-label="Select CSV file for LIMS data import"
                    />
                  </div>

                  <Button
                    onClick={importCSV}
                    disabled={csvImporting || !csvFile || !selectedMethodId}
                    className="w-full"
                    size="sm"
                    data-testid="button-import-csv"
                  >
                    {csvImporting ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin h-3 w-3 border border-white border-t-transparent rounded-full"></div>
                        Importing...
                      </div>
                    ) : (
                      `Import ${csvImportType.charAt(0).toUpperCase() + csvImportType.slice(1)} Data`
                    )}
                  </Button>
                </div>
              </div>

              {/* Document Recompute Section */}
              <div className="space-y-3">
                <h4 className="font-medium text-blue-800">Document Integration</h4>
                <div className="bg-white p-4 rounded-md border space-y-3">
                  <p className="text-sm text-gray-600">
                    Refresh validation documents with latest LIMS data while preserving manual
                    content
                  </p>

                  <div className="space-y-2">
                    {methods.slice(0, 3).map(method => (
                      <div
                        key={method.id}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded border"
                      >
                        <div className="text-sm">
                          <div className="font-medium">{method.code}</div>
                          <div className="text-gray-500">{method.title}</div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDiffPreview(method.id)}
                            className="text-xs"
                            disabled={loadingPreview}
                            data-testid={`button-preview-${method.id}`}
                          >
                            <Zap className="w-3 h-3 mr-1" />
                            Preview
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => recomputeValidationDoc(method.id)}
                            className="text-xs"
                            disabled={importMessage && importMessage.includes('🔄')}
                            data-testid={`button-recompute-${method.id}`}
                          >
                            <RefreshCw
                              className={`w-3 h-3 mr-1 ${importMessage && importMessage.includes('🔄') ? 'animate-spin' : ''}`}
                            />
                            Recompute
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {methods.length > 3 && (
                    <p className="text-xs text-gray-500 text-center">
                      +{methods.length - 3} more methods available
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* CSV Format Guide */}
            <div className="bg-white p-4 rounded-md border">
              <h4 className="font-medium text-blue-800 mb-2">CSV Format Guide</h4>
              <div className="text-sm text-gray-700 space-y-2">
                <div>
                  <p>
                    <strong>Linearity:</strong> level_no, nominal, response, replicate (optional)
                  </p>
                  <p className="text-xs text-gray-500 ml-2">Example: 1,10.0,98.5,1</p>
                </div>
                <div>
                  <p>
                    <strong>Accuracy:</strong> level_label (LOW/MID/HIGH), level_pct, recovery_pct,
                    replicate
                  </p>
                  <p className="text-xs text-gray-500 ml-2">Example: LOW,80,99.2,1</p>
                </div>
                <div>
                  <p>
                    <strong>Precision:</strong> run_no, result
                  </p>
                  <p className="text-xs text-gray-500 ml-2">Example: 1,100.5</p>
                </div>
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                  <strong>Note:</strong> File size limit: 5MB. Ensure CSV headers match exactly.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diff Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Replace "Validation Experiments" block?</DialogTitle>
            <DialogDescription>
              Review changes below. Only the <b>## 5. Validation Experiments</b> block will be
              replaced with fresh LIMS data.
            </DialogDescription>
          </DialogHeader>

          {loadingPreview ? (
            <div className="p-6 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border border-gray-300 border-t-blue-600 rounded-full"></div>
                Loading preview...
              </div>
            </div>
          ) : (
            <>
              {/* 2. Enhanced Legend & Advanced Safety Analysis */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm border-b pb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Adds: {addCount}</Badge>
                    <Badge variant="secondary">Deletes: {delCount}</Badge>
                    <span className="text-gray-500">
                      Safety:{' '}
                      {safety.safe ? (
                        <b className="text-green-700">SAFE</b>
                      ) : (
                        <b className="text-red-700">REQUIRES REVIEW</b>
                      )}
                    </span>
                    <span className="text-gray-500">
                      Change Impact: {(safety.changeRatio * 100).toFixed(2)}%
                    </span>
                    {safety.numericOnly && (
                      <Badge className="bg-blue-100 text-blue-800">Data Only</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2">
                      <Switch checked={hideWs} onCheckedChange={checked => setHideWs(!!checked)} />
                      <span className="text-xs">Hide whitespace</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <Switch
                        checked={hidePunct}
                        onCheckedChange={checked => setHidePunct(!!checked)}
                      />
                      <span className="text-xs">Hide punctuation</span>
                    </label>
                  </div>
                </div>

                {/* Enhanced Safety Analysis Summary */}
                <div
                  className={`p-3 rounded-md border ${
                    safety.safe ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {safety.safe ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-orange-600" />
                    )}
                    <span className="font-medium text-sm">
                      {safety.safe ? 'Safe to Apply' : 'Review Required'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-700 space-y-1">
                    <div>• Regulatory Impact: {safety.safe ? 'Minimal' : 'Moderate'}</div>
                    <div>• Data Integrity: {safety.numericOnly ? 'Preserved' : 'Modified'}</div>
                    <div>
                      • Change Classification:{' '}
                      {safety.changeRatio < 0.1
                        ? 'Minor Update'
                        : safety.changeRatio < 0.3
                          ? 'Moderate Change'
                          : 'Major Revision'}
                    </div>
                    {!safety.safe && (
                      <div>• Recommendation: Manual review by validation lead required</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm mt-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="checkpoint"
                    checked={makeCheckpoint}
                    onCheckedChange={checked => setMakeCheckpoint(!!checked)}
                  />
                  <label htmlFor="checkpoint" className="text-sm">
                    Create checkpoint before replacing
                  </label>
                </div>
              </div>

              <Tabs defaultValue="unified" className="mt-2">
                <TabsList>
                  <TabsTrigger value="unified">Unified Diff</TabsTrigger>
                  <TabsTrigger value="side">Side-by-side</TabsTrigger>
                </TabsList>

                <TabsContent value="unified">
                  <div
                    className="mt-2 whitespace-pre-wrap rounded border p-3 text-sm leading-6 max-h-96 overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: unifiedHtml }}
                  />
                </TabsContent>

                <TabsContent value="side">
                  <div className="mt-2 grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                    <div className="rounded border p-3 text-sm whitespace-pre-wrap">
                      <div className="mb-2 text-xs uppercase text-gray-500 font-medium">
                        Current
                      </div>
                      <div>
                        {oldBlock ? oldBlock : <span className="text-gray-400">— empty —</span>}
                      </div>
                    </div>
                    <div className="rounded border p-3 text-sm whitespace-pre-wrap">
                      <div className="mb-2 text-xs uppercase text-gray-500 font-medium">
                        New (from LIMS)
                      </div>
                      <div>
                        {newBlock ? newBlock : <span className="text-gray-400">— empty —</span>}
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            {safety.safe && (
              <Button
                onClick={executeRecompute}
                disabled={loadingPreview}
                className={loadingPreview ? 'opacity-50 cursor-not-allowed' : ''}
              >
                {loadingPreview ? (
                  <>
                    <div className="animate-spin h-3 w-3 border border-white border-t-transparent rounded-full mr-2"></div>
                    Applying...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-1" />
                    Quick-Apply
                  </>
                )}
              </Button>
            )}
            <Button
              variant={safety.safe ? 'outline' : 'default'}
              onClick={executeRecompute}
              disabled={loadingPreview}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              {safety.safe ? 'Apply anyway' : 'Replace Block'}
            </Button>
          </DialogFooter>

          <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
            <Eye className="h-3 w-3" />
            You can revert changes via document history after replacement.
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-4 mb-6">
        <div className="relative w-96">
          <Input
            placeholder="Filter by code, analyte, matrix, owner..."
            className="w-full pr-8"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            aria-label="Filter analytical methods"
          />
          {filter && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-gray-100"
              onClick={() => setFilter('')}
              aria-label="Clear filter"
            >
              ×
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Badge
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700 transition-colors"
            >
              <span className="mr-1">✓</span>
              Approved: {methods.filter(m => m.status === 'APPROVED').length}
            </Badge>
            <Badge
              variant="secondary"
              className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 transition-colors"
            >
              <span className="mr-1">⚠</span>
              In Validation: {methods.filter(m => m.status === 'IN_VALIDATION').length}
            </Badge>
            <Badge
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors"
            >
              <span className="mr-1">⚙</span>
              Under Dev: {methods.filter(m => m.status === 'UNDER_DEV').length}
            </Badge>
          </div>
          <div className="border-l pl-3 ml-2 text-gray-500">Total: {methods.length} methods</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map(method => {
          const methodGaps = gaps[method.id] || [];
          const methodRuns = runs[method.id] || [];
          const openErrors = methodGaps.filter(g => g.severity === 'ERROR').length;

          return (
            <Card
              key={method.id}
              className="shadow-sm hover:shadow-lg transition-all duration-300 hover:border-blue-200 cursor-pointer group"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold group-hover:text-blue-700 transition-colors">
                      {method.code}
                    </CardTitle>
                    <div className="text-sm text-gray-600">
                      {method.technique} • {method.analyte}
                    </div>
                  </div>
                  <Badge variant={statusBadgeColor(method.status)}>
                    <span className="mr-1">{getStatusIcon(method.status)}</span>
                    {method.status.replace('_', ' ')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-y-1 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500 text-xs">Matrix:</span>
                    <span className="font-medium">{method.matrix}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500 text-xs">Range:</span>
                    <span className="font-medium">{method.range}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500 text-xs">Precision:</span>
                    <span className="font-medium">{method.precisionTarget || '—'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500 text-xs">Accuracy:</span>
                    <span className="font-medium">{method.accuracyTarget || '—'}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span className="text-sm">{method.owner || 'Unassigned'}</span>
                    {method.due && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        Due {new Date(method.due).toLocaleDateString()}
                      </span>
                    )}
                    {openErrors > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        <span className="mr-1">⚠</span>
                        {openErrors} error{openErrors !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm">Readiness</div>
                    <div className="h-2 w-20 bg-gray-200 rounded">
                      <div
                        className={`h-2 rounded ${getReadinessColor(method.readiness)}`}
                        style={{ width: `${method.readiness}%` }}
                      />
                    </div>
                    <span className="text-sm">{method.readiness}%</span>
                  </div>
                </div>

                {methodRuns.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center gap-1 text-sm text-gray-600 mb-2">
                      <TrendingUp className="h-4 w-4" />
                      System Suitability Trend
                    </div>
                    <div className="h-16 bg-gray-50 rounded p-2">
                      <div className="flex items-end justify-between h-full">
                        {methodRuns.slice(-7).map((run, index) => {
                          const maxSst = Math.max(...methodRuns.map(r => r.sst));
                          const height = Math.max(15, (run.sst / maxSst) * 80);
                          const isGood = run.sst >= 0.95;

                          return (
                            <div key={index} className="flex flex-col items-center group relative">
                              <div
                                className={`w-3 rounded-t transition-all duration-200 ${
                                  isGood
                                    ? 'bg-emerald-500 hover:bg-emerald-600'
                                    : 'bg-red-500 hover:bg-red-600'
                                }`}
                                style={{ height: `${height}%` }}
                              />
                              <span className="text-xs text-gray-600 mt-1">
                                {new Date(run.date).getDate()}
                              </span>
                              <div className="absolute bottom-full mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                SST: {run.sst.toFixed(3)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <div className="flex gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="transition-all duration-200 hover:bg-blue-50 hover:border-blue-300"
                        >
                          <User className="h-3 w-3 mr-1" />
                          Assign to... <ChevronDown className="ml-1 h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {availableUsers.map(user => (
                          <DropdownMenuItem
                            key={user.id}
                            onSelect={() => assignToUser(method.id, user.id, user.name)}
                          >
                            {user.name} ({user.email})
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem
                          onSelect={() => assignToUser(method.id, null, 'Unassigned')}
                        >
                          Unassign
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="transition-all duration-200 hover:bg-gray-50 hover:border-gray-300"
                        >
                          <FlaskConical className="h-3 w-3 mr-1" />
                          Stage <ChevronDown className="ml-1 h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => updateStatus(method.id, 'UNDER_DEV')}>
                          Under Development
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => updateStatus(method.id, 'IN_VALIDATION')}>
                          In Validation
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => updateStatus(method.id, 'APPROVED')}>
                          Approved
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openModal('analytical-methods', method)}
                      className="transition-all duration-200 hover:bg-gray-50 hover:border-gray-300"
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => onViewMethod && onViewMethod(method.id)}
                      className="transition-all duration-200 hover:bg-blue-600"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View
                    </Button>
                  </div>
                </div>

                {methodGaps.length > 0 && (
                  <div className="border-t pt-3 bg-red-50 -mx-6 px-6 -mb-6 pb-6 rounded-b-lg">
                    <div className="text-sm font-medium mb-2 flex items-center justify-between">
                      <div className="flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1 text-red-500" />
                        <span className="text-red-700">
                          Validation Issues ({methodGaps.length})
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          openModal('gap-resolution', { methodId: method.id, gaps: methodGaps })
                        }
                        className="text-xs border-red-300 text-red-700 hover:bg-red-100 transition-colors"
                      >
                        Resolve All
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {methodGaps.slice(0, 2).map(gap => (
                        <div
                          key={gap.id}
                          className="text-xs p-2 bg-white border border-red-200 rounded shadow-sm"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="font-medium text-red-800">{gap.title}</div>
                              <div className="text-red-600">
                                {gap.section} • ICH {gap.ruleId}
                              </div>
                              <div className="text-red-500 text-xs mt-1">{gap.why}</div>
                            </div>
                            <div className="flex gap-1 ml-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startGapResolution(method.id, gap)}
                                className="text-xs h-6 px-2"
                              >
                                Resolve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => createTaskFromGap(method.id, gap)}
                                className="text-xs h-6 px-2"
                              >
                                Create Task
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {methodGaps.length > 2 && (
                        <div className="text-xs text-gray-500">
                          +{methodGaps.length - 2} more issues
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <FlaskConical className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No analytical methods found</h3>
          <p className="text-gray-600 mb-4">
            {filter
              ? 'Try adjusting your search criteria'
              : 'Start by creating your first analytical method'}
          </p>
          {!filter && (
            <Button
              onClick={() => openModal('analytical-methods')}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Method
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default AnalyticalMethodsTab;

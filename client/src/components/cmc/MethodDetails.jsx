import React, { useEffect, useState } from 'react';
// import { useLocation } from "wouter"; // Removed for prop-based routing
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Upload,
  FileText,
  Wrench,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Plus,
  Download,
  BarChart3,
  BadgeCheck,
  TriangleAlert,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  ComposedChart,
  Scatter,
  Line as RLine,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import SystemSuitabilityTrending from './SystemSuitabilityTrending';

const MethodDetails = ({ methodId, onBack }) => {
  const [method, setMethod] = useState(null);
  const [gaps, setGaps] = useState([]);
  const [runs, setRuns] = useState([]);
  const [files, setFiles] = useState([]);
  const [changeControls, setCcs] = useState([]);
  const [csvFile, setCsvFile] = useState(null);
  const [importNote, setImportNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState('FDA');
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [newFileInput, setNewFileInput] = useState(null);
  const [showCCForm, setShowCCForm] = useState(false);
  const [ccFormData, setCCFormData] = useState({
    title: '',
    reason: '',
    impact: '',
    owner: '',
    due: '',
    changes: '',
  });

  // CSV Import state (LIMS data)
  const [csvImportType, setCsvImportType] = useState('linearity');
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvLin, setCsvLin] = useState(null);
  const [csvAcc, setCsvAcc] = useState(null);
  const [csvPrec, setCsvPrec] = useState(null);
  const [showValidationForm, setShowValidationForm] = useState(false);
  const [validationFormData, setValidationFormData] = useState({
    parameter: '',
    specificityResults: '',
    linearityR2: '',
    linearityRange: '',
    accuracyResults: '',
    precisionRSD: '',
    notes: '',
  });

  // Statistics and regression state
  const { toast } = useToast();
  const [stats, setStats] = useState(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);

  // 1. Live Regression Preview with Approval Guards
  const [regressionPreview, setRegressionPreview] = useState(null);
  const [showRegressionPreview, setShowRegressionPreview] = useState(false);
  const [regressionLoading, setRegressionLoading] = useState(false);
  const [approvalGuards, setApprovalGuards] = useState(null);
  const [guardFailures, setGuardFailures] = useState([]);

  // 4. Advanced LIMS Data Validation
  const [dataValidationRules, setDataValidationRules] = useState({
    outlierDetection: true,
    rangeValidation: true,
    statisticalChecks: true,
    integrityValidation: true,
  });
  const [validationErrors, setValidationErrors] = useState([]);

  // 6. Enhanced Approval Workflow
  const [approvalWorkflow, setApprovalWorkflow] = useState(null);
  const [currentApprovalStep, setCurrentApprovalStep] = useState(0);
  const [approvalHistory, setApprovalHistory] = useState([]);

  useEffect(() => {
    const fetchMethodDetails = async () => {
      try {
        setLoading(true);
        const currentOrgId = localStorage.getItem('currentOrganization') || '7';
        const headers = {
          'x-tenant-id': currentOrgId,
          'Content-Type': 'application/json',
        };

        const response = await fetch(`/api/analytical/methods/${methodId}`, { headers });
        if (response.ok) {
          const data = await response.json();
          setMethod(data.method);
          setGaps(data.gaps);
          setRuns(data.runs);
          setFiles(data.files);
          setCcs(data.changeControls);
        }
      } catch (error) {
        console.error('Error fetching method details:', error);
      } finally {
        setLoading(false);
      }
    };

    if (methodId) fetchMethodDetails();
  }, [methodId]);

  // Load statistical analysis and acceptance data
  const loadStats = async () => {
    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const headers = {
        'x-tenant-id': currentOrgId,
        'Content-Type': 'application/json',
      };

      const response = await fetch(`/api/analytical/methods/${methodId}/stats`, { headers });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  // Load stats on component mount and after CSV imports
  useEffect(() => {
    if (methodId) {
      loadStats();
      loadApprovalGuards();
      loadApprovalWorkflow();
    }
  }, [methodId]);

  // 1. Load approval guards and regression analysis
  const loadApprovalGuards = async () => {
    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const response = await fetch(`/api/analytical/methods/${methodId}/approval-guards`, {
        headers: {
          'x-tenant-id': currentOrgId,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const guards = await response.json();
        setApprovalGuards(guards);
        setGuardFailures(guards.failures || []);
      }
    } catch (error) {
      console.error('Error loading approval guards:', error);
    }
  };

  // 1. Live regression preview
  const generateRegressionPreview = async () => {
    try {
      setRegressionLoading(true);
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const response = await fetch(`/api/analytical/methods/${methodId}/regression-preview`, {
        method: 'POST',
        headers: {
          'x-tenant-id': currentOrgId,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const preview = await response.json();
        setRegressionPreview(preview);
        setShowRegressionPreview(true);

        // Check if guards pass
        if (preview.guardsPass === false) {
          await createGuardFailureTasks(preview.failures);
        }
      }
    } catch (error) {
      console.error('Error generating regression preview:', error);
      setImportNote('❌ Failed to generate regression preview');
      setTimeout(() => setImportNote(''), 3000);
    } finally {
      setRegressionLoading(false);
    }
  };

  // 3. Create tasks automatically when guards fail
  const createGuardFailureTasks = async failures => {
    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';

      for (const failure of failures) {
        const taskData = {
          title: `Guard Failure: ${failure.parameter}`,
          description: `Approval guard failed for ${failure.parameter}\n\nFailed Condition: ${failure.condition}\nActual Value: ${failure.actualValue}\nExpected: ${failure.expectedValue}\n\nImmediate action required to resolve this validation issue.`,
          priority: 'CRITICAL',
          assignedTo: 'Dr. Sarah Chen', // Auto-assign to method validation lead
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
          category: 'Guard Failure',
          source: 'Automated Guard System',
        };

        await fetch(`/api/analytical/methods/${methodId}/guard-failure-tasks`, {
          method: 'POST',
          headers: {
            'x-tenant-id': currentOrgId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(taskData),
        });
      }

      toast({
        title: 'Guard Failure Tasks Created',
        description: `${failures.length} automatic tasks created for guard failures`,
        variant: 'destructive',
      });
    } catch (error) {
      console.error('Error creating guard failure tasks:', error);
    }
  };

  // 6. Load approval workflow
  const loadApprovalWorkflow = async () => {
    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const response = await fetch(`/api/analytical/methods/${methodId}/approval-workflow`, {
        headers: {
          'x-tenant-id': currentOrgId,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const workflow = await response.json();
        setApprovalWorkflow(workflow);
        setCurrentApprovalStep(workflow.currentStep || 0);
        setApprovalHistory(workflow.history || []);
      }
    } catch (error) {
      console.error('Error loading approval workflow:', error);
    }
  };

  const generateValidationPlan = async () => {
    try {
      setGeneratingPlan(true);
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';

      const response = await fetch(`/api/analytical/methods/${methodId}/generate-validation-plan`, {
        method: 'POST',
        headers: {
          'x-tenant-id': currentOrgId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ region }),
      });

      if (response.ok) {
        const result = await response.json();
        setImportNote(`✅ Validation plan generated: ${result.title}`);

        // Open the generated document in a new tab
        if (result.url) {
          window.open(result.url, '_blank');
        }

        setTimeout(() => setImportNote(''), 5000);
      } else {
        setImportNote('❌ Failed to generate validation plan');
        setTimeout(() => setImportNote(''), 3000);
      }
    } catch (error) {
      console.error('Error generating validation plan:', error);
      setImportNote('❌ Failed to generate validation plan');
      setTimeout(() => setImportNote(''), 3000);
    } finally {
      setGeneratingPlan(false);
    }
  };

  const createTaskFromGap = async gapId => {
    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const headers = {
        'x-tenant-id': currentOrgId,
        'Content-Type': 'application/json',
      };

      const response = await fetch(
        `/api/analytical/methods/${methodId}/gaps/${gapId}/create-task`,
        {
          method: 'POST',
          headers,
        }
      );

      if (response.ok) {
        const task = await response.json();
        setImportNote(`✅ Task created: ${task.title}`);
        setTimeout(() => setImportNote(''), 3000);
      } else {
        setImportNote('❌ Failed to create task');
      }
    } catch (error) {
      console.error('Error creating task:', error);
      setImportNote('❌ Failed to create task');
    }
  };

  const importCsv = async () => {
    if (!csvFile) return;

    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const formData = new FormData();
      formData.append('file', csvFile);

      const response = await fetch(`/api/analytical/methods/${methodId}/runs/import`, {
        method: 'POST',
        headers: { 'x-tenant-id': currentOrgId },
        body: formData,
      });

      if (response.ok) {
        const { inserted } = await response.json();
        setImportNote(`✅ Imported ${inserted} run(s)`);

        // Reload method details to get updated runs
        const detailsResponse = await fetch(`/api/analytical/methods/${methodId}`, {
          headers: { 'x-tenant-id': currentOrgId, 'Content-Type': 'application/json' },
        });
        if (detailsResponse.ok) {
          const data = await detailsResponse.json();
          setRuns(data.runs);
        }

        setCsvFile(null);
        setTimeout(() => setImportNote(''), 3000);
      } else {
        setImportNote('❌ Import failed');
      }
    } catch (error) {
      console.error('Error importing CSV:', error);
      setImportNote('❌ Import failed');
    }
  };

  const uploadFile = async () => {
    if (!newFileInput) return;

    try {
      setUploadingFile(true);
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const formData = new FormData();
      formData.append('file', newFileInput);
      formData.append('uploaded_by', 'Current User');

      const response = await fetch(`/api/analytical/methods/${methodId}/files`, {
        method: 'POST',
        headers: { 'x-tenant-id': currentOrgId },
        body: formData,
      });

      if (response.ok) {
        const newFile = await response.json();
        setFiles(prev => [...prev, newFile]);
        setImportNote(`✅ File uploaded: ${newFile.file_name}`);
        setNewFileInput(null);
        setTimeout(() => setImportNote(''), 3000);
      } else {
        setImportNote('❌ File upload failed');
        setTimeout(() => setImportNote(''), 3000);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      setImportNote('❌ File upload failed');
      setTimeout(() => setImportNote(''), 3000);
    } finally {
      setUploadingFile(false);
    }
  };

  // 4. Enhanced CSV import with advanced validation
  const importCSV = async (file, url) => {
    if (!file) {
      setImportNote('❌ Please select a CSV file');
      setTimeout(() => setImportNote(''), 3000);
      return;
    }

    try {
      setCsvImporting(true);
      setValidationErrors([]);

      // Pre-validate file before upload
      const fileContent = await file.text();
      const preValidationErrors = await validateCSVContent(fileContent, csvImportType);

      if (preValidationErrors.length > 0) {
        setValidationErrors(preValidationErrors);
        setImportNote(`❌ Validation failed: ${preValidationErrors.length} errors found`);
        setTimeout(() => setImportNote(''), 5000);
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('validationRules', JSON.stringify(dataValidationRules));

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-validation-enabled': 'true',
          'x-outlier-detection': dataValidationRules.outlierDetection.toString(),
        },
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        setImportNote(
          `✅ Imported ${result.inserted} ${csvImportType} data points (${result.validated} validated, ${result.rejected || 0} rejected)`
        );

        if (result.warnings && result.warnings.length > 0) {
          setValidationErrors(result.warnings);
        }

        setCsvFile(null);
        setTimeout(() => setImportNote(''), 5000);

        // Auto-generate regression preview after successful import
        if (csvImportType === 'linearity') {
          setTimeout(() => generateRegressionPreview(), 1000);
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        setImportNote(`❌ CSV import failed: ${errorData.error}`);
        setTimeout(() => setImportNote(''), 3000);
      }
    } catch (error) {
      console.error('Error importing CSV:', error);
      setImportNote('❌ CSV import failed');
      setTimeout(() => setImportNote(''), 3000);
    } finally {
      setCsvImporting(false);
      // Reload stats and guards after import
      loadStats();
      loadApprovalGuards();
    }
  };

  // 4. Advanced CSV content validation
  const validateCSVContent = async (content, type) => {
    const errors = [];
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      errors.push({ row: 0, message: 'CSV must contain header row and at least one data row' });
      return errors;
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    // Type-specific validation
    if (type === 'linearity') {
      if (!headers.includes('concentration') && !headers.includes('nominal')) {
        errors.push({
          row: 0,
          message: 'Linearity CSV must include concentration or nominal column',
        });
      }
      if (!headers.includes('response') && !headers.includes('area')) {
        errors.push({ row: 0, message: 'Linearity CSV must include response or area column' });
      }
    } else if (type === 'accuracy') {
      if (!headers.includes('recovery') && !headers.includes('recovery_percent')) {
        errors.push({ row: 0, message: 'Accuracy CSV must include recovery column' });
      }
    } else if (type === 'precision') {
      if (!headers.includes('result') && !headers.includes('value')) {
        errors.push({ row: 0, message: 'Precision CSV must include result or value column' });
      }
    }

    // Data validation
    for (let i = 1; i < lines.length && i < 100; i++) {
      const values = lines[i].split(',');

      if (values.length !== headers.length) {
        errors.push({ row: i + 1, message: 'Row has different number of columns than header' });
        continue;
      }

      // Check for numeric values
      values.forEach((value, idx) => {
        const header = headers[idx];
        if (
          ['concentration', 'nominal', 'response', 'area', 'recovery', 'result', 'value'].includes(
            header
          )
        ) {
          const num = parseFloat(value.trim());
          if (isNaN(num)) {
            errors.push({ row: i + 1, column: header, message: `Invalid numeric value: ${value}` });
          } else if (num < 0 && header !== 'recovery') {
            errors.push({
              row: i + 1,
              column: header,
              message: `Negative value not allowed: ${num}`,
            });
          }
        }
      });
    }

    return errors;
  };

  // Handle method status update with approval guard
  const handleStatusUpdate = async (newStatus, useOverride = false) => {
    if (statusUpdating) return;

    try {
      setStatusUpdating(true);
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const headers = {
        'x-tenant-id': currentOrgId,
        'Content-Type': 'application/json',
        'x-user-name': 'Current User',
      };

      const body = {
        status: newStatus,
        override: useOverride,
        reason: useOverride ? overrideReason : undefined,
      };

      const response = await fetch(`/api/analytical/methods/${methodId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });

      if (response.status === 412) {
        // Guard conditions not met
        const data = await response.json();
        toast({
          title: 'Approval blocked',
          description: 'Guard conditions not met. Review failures and use override if necessary.',
          variant: 'destructive',
        });
        // Refresh stats to show current acceptance status
        loadStats();
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      setMethod(prev => ({ ...prev, status: result.status }));

      toast({
        title: 'Status updated',
        description: `Method status changed to ${result.status}${useOverride ? ' (with override)' : ''}`,
      });

      if (useOverride) {
        setOverrideOpen(false);
        setOverrideReason('');
      }
    } catch (error) {
      console.error('Status update error:', error);
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setStatusUpdating(false);
    }
  };

  const createChangeControl = async () => {
    // Validate required fields
    if (!ccFormData.title || !ccFormData.reason || !ccFormData.impact || !ccFormData.owner) {
      setImportNote('❌ Please fill in all required fields (Title, Reason, Impact, Owner)');
      setTimeout(() => setImportNote(''), 3000);
      return;
    }

    // Validate impact level
    const validImpacts = ['Low', 'Medium', 'High', 'Critical'];
    if (!validImpacts.includes(ccFormData.impact)) {
      setImportNote('❌ Impact must be one of: Low, Medium, High, Critical');
      setTimeout(() => setImportNote(''), 3000);
      return;
    }

    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const response = await fetch(`/api/analytical/methods/${methodId}/change-controls`, {
        method: 'POST',
        headers: {
          'x-tenant-id': currentOrgId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...ccFormData,
          method_id: methodId,
          status: 'PENDING',
          created_by: 'Current User',
        }),
      });

      if (response.ok) {
        const newCC = await response.json();
        setCcs(prev => [...prev, newCC]);
        setImportNote(`✅ Change control created: ${newCC.title}`);
        setShowCCForm(false);
        setCCFormData({ title: '', reason: '', impact: '', owner: '', due: '', changes: '' });
        setTimeout(() => setImportNote(''), 3000);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        setImportNote(`❌ Failed to create change control: ${errorData.error}`);
        setTimeout(() => setImportNote(''), 3000);
      }
    } catch (error) {
      console.error('Error creating change control:', error);
      setImportNote('❌ Network error - please check your connection');
      setTimeout(() => setImportNote(''), 3000);
    }
  };

  const submitValidationData = async () => {
    // Validate required fields
    if (!validationFormData.parameter) {
      setImportNote('❌ Please select a validation parameter');
      setTimeout(() => setImportNote(''), 3000);
      return;
    }

    // Validate scientific data formats
    if (
      validationFormData.linearityR2 &&
      !/^0\.[89]\d{3}$|^1\.0000$/.test(validationFormData.linearityR2)
    ) {
      setImportNote('❌ Linearity R² should be between 0.8000 and 1.0000 (e.g., 0.9995)');
      setTimeout(() => setImportNote(''), 3000);
      return;
    }

    if (
      validationFormData.precisionRSD &&
      !/^\d+(\.\d+)?%?$/.test(validationFormData.precisionRSD)
    ) {
      setImportNote('❌ Precision RSD should be a percentage (e.g., 1.2% or 1.2)');
      setTimeout(() => setImportNote(''), 3000);
      return;
    }

    if (
      validationFormData.accuracyResults &&
      !/^\d+(\.\d+)?-\d+(\.\d+)?%?$/.test(validationFormData.accuracyResults)
    ) {
      setImportNote('❌ Accuracy Results should be a range (e.g., 98.5-101.2%)');
      setTimeout(() => setImportNote(''), 3000);
      return;
    }

    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const response = await fetch(`/api/analytical/methods/${methodId}/validation-data`, {
        method: 'POST',
        headers: {
          'x-tenant-id': currentOrgId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...validationFormData,
          method_id: methodId,
          submitted_by: 'Current User',
        }),
      });

      if (response.ok) {
        const validationData = await response.json();
        setImportNote(`✅ Validation data submitted for ${validationData.parameter}`);
        setShowValidationForm(false);
        setValidationFormData({
          parameter: '',
          specificityResults: '',
          linearityR2: '',
          linearityRange: '',
          accuracyResults: '',
          precisionRSD: '',
          notes: '',
        });
        setTimeout(() => setImportNote(''), 3000);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        setImportNote(`❌ Failed to submit validation data: ${errorData.error}`);
        setTimeout(() => setImportNote(''), 3000);
      }
    } catch (error) {
      console.error('Error submitting validation data:', error);
      setImportNote('❌ Network error - please check your connection');
      setTimeout(() => setImportNote(''), 3000);
    }
  };

  const getStatusBadgeVariant = status => {
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

  const getSeverityBadgeVariant = severity => {
    switch (severity) {
      case 'ERROR':
        return 'destructive';
      case 'WARNING':
        return 'secondary';
      case 'INFO':
        return 'outline';
      default:
        return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="text-slate-500">Loading method details...</div>
      </div>
    );
  }

  if (!method) {
    return (
      <div className="p-6 text-center">
        <div className="text-slate-500">Method not found</div>
        <Button onClick={onBack} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Methods
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-to-methods">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Methods
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900" data-testid="text-method-title">
              {method.code} — {method.title}
            </h1>
            <div className="text-slate-600" data-testid="text-method-details">
              {method.technique} • {method.matrix} • {method.analyte}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={getStatusBadgeVariant(method.status)} data-testid="badge-method-status">
            {method.status.replace('_', ' ')}
          </Badge>
          <div className="flex items-center gap-2">
            <div className="h-2 w-28 bg-slate-200 rounded overflow-hidden">
              <div
                className="h-2 bg-emerald-600 rounded transition-all duration-300"
                style={{ width: `${method.readiness}%` }}
              />
            </div>
            <span className="text-sm text-slate-600" data-testid="text-readiness-score">
              {method.readiness}%
            </span>
          </div>
        </div>
      </div>

      {/* Import Notification */}
      {importNote && (
        <div
          className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800"
          data-testid="notification-import"
        >
          {importNote}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="summary" data-testid="tab-summary">
            Summary
          </TabsTrigger>
          <TabsTrigger value="validation" data-testid="tab-validation">
            Validation
          </TabsTrigger>
          <TabsTrigger value="runs" data-testid="tab-runs">
            Runs
          </TabsTrigger>
          <TabsTrigger value="trending" data-testid="tab-trending">
            Trending
          </TabsTrigger>
          <TabsTrigger value="files" data-testid="tab-files">
            Files
          </TabsTrigger>
          <TabsTrigger value="lims-data" data-testid="tab-lims-data">
            LIMS Data
          </TabsTrigger>
          <TabsTrigger value="change-control" data-testid="tab-change-control">
            Change Control
          </TabsTrigger>
        </TabsList>

        {/* Summary Tab */}
        <TabsContent value="summary" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Method Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-slate-500">Code:</div>
                  <div className="font-medium" data-testid="text-method-code">
                    {method.code}
                  </div>

                  <div className="text-slate-500">Technique:</div>
                  <div data-testid="text-method-technique">{method.technique}</div>

                  <div className="text-slate-500">Matrix:</div>
                  <div data-testid="text-method-matrix">{method.matrix}</div>

                  <div className="text-slate-500">Analyte:</div>
                  <div data-testid="text-method-analyte">{method.analyte}</div>

                  <div className="text-slate-500">Range:</div>
                  <div data-testid="text-method-range">{method.range}</div>

                  <div className="text-slate-500">Precision Target:</div>
                  <div data-testid="text-precision-target">{method.precisionTarget}</div>

                  <div className="text-slate-500">Accuracy Target:</div>
                  <div data-testid="text-accuracy-target">{method.accuracyTarget}</div>

                  <div className="text-slate-500">Owner:</div>
                  <div data-testid="text-method-owner">{method.owner}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Status Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Validation Progress</span>
                    <span className="font-medium">{method.readiness}%</span>
                  </div>
                  <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-3 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all duration-500"
                      style={{ width: `${method.readiness}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-slate-50 rounded">
                    <div
                      className="text-lg font-semibold text-emerald-600"
                      data-testid="count-files"
                    >
                      {files.length}
                    </div>
                    <div className="text-xs text-slate-500">Files</div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded">
                    <div className="text-lg font-semibold text-orange-600" data-testid="count-gaps">
                      {gaps.length}
                    </div>
                    <div className="text-xs text-slate-500">Open Gaps</div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded">
                    <div className="text-lg font-semibold text-blue-600" data-testid="count-runs">
                      {runs.length}
                    </div>
                    <div className="text-xs text-slate-500">Recent Runs</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Generate Validation Plan Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                ICH Q2(R2)/Q14 Validation Plan Generator
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Regulatory Region
                    </label>
                    <select
                      className="w-full h-9 rounded border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={region}
                      onChange={e => setRegion(e.target.value)}
                      data-testid="select-region"
                    >
                      <option value="FDA">FDA / USP</option>
                      <option value="EMA">EMA / Ph. Eur.</option>
                      <option value="PMDA">PMDA / JP</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <Button
                      onClick={generateValidationPlan}
                      disabled={generatingPlan}
                      className="w-full"
                      data-testid="button-generate-validation-plan"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      {generatingPlan ? 'Generating...' : 'Generate Validation Plan'}
                    </Button>
                  </div>
                </div>
                <div className="text-sm text-slate-600">
                  Generate a comprehensive analytical method validation plan with region-specific
                  terminology, ICH Q2(R2)/Q14 compliance requirements, and prefilled validation
                  tables.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Validation Tab */}
        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Validation Gaps ({gaps.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {gaps.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
                  <div>No validation gaps found</div>
                  <div className="text-sm">All ICH Q2/Q14 requirements satisfied</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {gaps.map(gap => (
                    <div
                      key={gap.id}
                      className="p-4 border border-slate-200 rounded-lg"
                      data-testid={`gap-${gap.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant={getSeverityBadgeVariant(gap.severity)}>
                              {gap.severity}
                            </Badge>
                            <span className="text-sm text-slate-500">{gap.rule_id}</span>
                          </div>
                          <h4 className="font-medium text-slate-900 mb-1">{gap.title}</h4>
                          {gap.why && <p className="text-sm text-slate-600 mb-2">{gap.why}</p>}
                          {gap.section && (
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                              {gap.section}
                            </span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => createTaskFromGap(gap.id)}
                          data-testid={`button-create-task-${gap.id}`}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Create Task
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Runs Tab */}
        <TabsContent value="runs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  System Suitability Runs ({runs.length})
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".csv"
                    onChange={e => setCsvFile(e.target.files[0])}
                    className="w-auto"
                    data-testid="input-csv-file"
                  />
                  <Button
                    onClick={importCsv}
                    disabled={!csvFile}
                    size="sm"
                    data-testid="button-import-csv"
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    Import CSV
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <TrendingUp className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                  <div>No run data available</div>
                  <div className="text-sm">Import CSV to see trending data</div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left p-2">Date</th>
                          <th className="text-left p-2">SST Metric</th>
                          <th className="text-left p-2">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map((run, index) => (
                          <tr
                            key={index}
                            className="border-b border-slate-100"
                            data-testid={`run-row-${index}`}
                          >
                            <td className="p-2">{run.date}</td>
                            <td className="p-2 font-mono">{run.sst?.toFixed(1)}</td>
                            <td className="p-2 text-slate-600">{run.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trending Tab */}
        <TabsContent value="trending" className="space-y-4">
          <SystemSuitabilityTrending
            methodId={methodId}
            onClose={() => {}} // Tab doesn't need close functionality
          />
        </TabsContent>

        {/* Files Tab */}
        <TabsContent value="files" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Method Files ({files.length})
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                    onChange={e => setNewFileInput(e.target.files[0])}
                    className="w-auto"
                    data-testid="input-file-upload"
                  />
                  <Button
                    onClick={uploadFile}
                    disabled={!newFileInput || uploadingFile}
                    size="sm"
                    data-testid="button-upload-file"
                  >
                    {uploadingFile ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-1" />
                    )}
                    {uploadingFile ? 'Uploading...' : 'Upload File'}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {files.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                  <div>No files attached</div>
                  <div className="text-sm">Upload validation documents, SOPs, and protocols</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {files.map(file => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                      data-testid={`file-${file.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-slate-400" />
                        <div>
                          <div className="font-medium">{file.file_name}</div>
                          <div className="text-sm text-slate-500">
                            Uploaded by {file.uploaded_by} •{' '}
                            {new Date(file.uploaded_at).toLocaleDateString()}
                            {file.file_type && ` • ${file.file_type.toUpperCase()}`}
                            {file.file_size && ` • ${(file.file_size / 1024).toFixed(1)} KB`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {file.url && (
                          <Button variant="ghost" size="sm" asChild>
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid={`link-download-${file.id}`}
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LIMS Data Import Tab with Regression Preview */}
        <TabsContent value="lims-data" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Data Import (CSV)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Linearity */}
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  Linearity (level_no, nominal, response, replicate)
                </div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={e => setCsvLin(e.target.files[0])}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  data-testid="input-linearity-csv"
                />
                <Button
                  disabled={!csvLin || csvImporting}
                  onClick={() =>
                    importCSV(
                      csvLin,
                      `/api/analytical/methods/${methodId}/linearity/import?clear=1`
                    )
                  }
                  className="w-full"
                  data-testid="button-import-linearity"
                >
                  {csvImporting ? 'Importing...' : 'Import linearity'}
                </Button>
              </div>

              {/* Accuracy */}
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  Accuracy (level_label, level_pct, recovery_pct, replicate)
                </div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={e => setCsvAcc(e.target.files[0])}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  data-testid="input-accuracy-csv"
                />
                <Button
                  disabled={!csvAcc || csvImporting}
                  onClick={() =>
                    importCSV(csvAcc, `/api/analytical/methods/${methodId}/accuracy/import?clear=1`)
                  }
                  className="w-full"
                  data-testid="button-import-accuracy"
                >
                  {csvImporting ? 'Importing...' : 'Import accuracy'}
                </Button>
              </div>

              {/* Precision */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Precision (run_no, result)</div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={e => setCsvPrec(e.target.files[0])}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  data-testid="input-precision-csv"
                />
                <Button
                  disabled={!csvPrec || csvImporting}
                  onClick={() =>
                    importCSV(
                      csvPrec,
                      `/api/analytical/methods/${methodId}/precision/import?clear=1`
                    )
                  }
                  className="w-full"
                  data-testid="button-import-precision"
                >
                  {csvImporting ? 'Importing...' : 'Import precision'}
                </Button>
              </div>

              {/* 4. Advanced Validation Settings */}
              <div className="mt-4 p-3 border border-gray-200 rounded">
                <div className="text-sm font-medium mb-2">Data Validation Settings</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={dataValidationRules.outlierDetection}
                      onChange={e =>
                        setDataValidationRules(prev => ({
                          ...prev,
                          outlierDetection: e.target.checked,
                        }))
                      }
                    />
                    <span>Outlier Detection</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={dataValidationRules.rangeValidation}
                      onChange={e =>
                        setDataValidationRules(prev => ({
                          ...prev,
                          rangeValidation: e.target.checked,
                        }))
                      }
                    />
                    <span>Range Validation</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={dataValidationRules.statisticalChecks}
                      onChange={e =>
                        setDataValidationRules(prev => ({
                          ...prev,
                          statisticalChecks: e.target.checked,
                        }))
                      }
                    />
                    <span>Statistical Checks</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={dataValidationRules.integrityValidation}
                      onChange={e =>
                        setDataValidationRules(prev => ({
                          ...prev,
                          integrityValidation: e.target.checked,
                        }))
                      }
                    />
                    <span>Integrity Validation</span>
                  </label>
                </div>
              </div>

              {validationErrors.length > 0 && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                  <div className="text-sm font-medium text-red-800 mb-2">Validation Errors:</div>
                  <div className="space-y-1 text-xs text-red-700 max-h-32 overflow-y-auto">
                    {validationErrors.map((error, idx) => (
                      <div key={idx}>
                        Row {error.row}
                        {error.column && ` (${error.column})`}: {error.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importNote && (
                <div className="mt-4 p-2 rounded text-sm text-center bg-gray-50">{importNote}</div>
              )}
            </CardContent>
          </Card>

          {/* 1. Live Regression Preview with Enhanced Guards */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Live Regression & Approval Guards
                </div>
                <Button
                  onClick={generateRegressionPreview}
                  disabled={regressionLoading}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {regressionLoading ? 'Analyzing...' : 'Generate Preview'}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!stats ? (
                <div className="text-center py-6 text-slate-500">
                  <BarChart3 className="w-10 h-10 mx-auto mb-2 text-slate-400" />
                  <div className="text-sm">
                    Import CSV data to see regression analysis and acceptance evaluation
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded border p-3">
                      <div className="text-xs text-slate-500">
                        R² (min {stats.acceptance.thresholds.r2Min})
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-2xl font-semibold">{stats.r2.toFixed(5)}</div>
                        <Badge
                          variant={stats.acceptance.passes.r2Pass ? 'secondary' : 'destructive'}
                        >
                          {stats.acceptance.passes.r2Pass ? 'PASS' : 'FAIL'}
                        </Badge>
                      </div>
                    </div>
                    <div className="rounded border p-3">
                      <div className="text-xs text-slate-500">
                        %RSD repeatability (max {stats.acceptance.thresholds.rsdMax}%)
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-2xl font-semibold">
                          {typeof stats.rsd === 'number' ? stats.rsd.toFixed(2) : '—'}
                        </div>
                        <Badge
                          variant={stats.acceptance.passes.rsdPass ? 'secondary' : 'destructive'}
                        >
                          {stats.acceptance.passes.rsdPass ? 'PASS' : 'FAIL'}
                        </Badge>
                      </div>
                    </div>
                    <div className="rounded border p-3">
                      <div className="text-xs text-slate-500">
                        Accuracy means within {stats.acceptance.thresholds.accLo}–
                        {stats.acceptance.thresholds.accHi}%
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-xl font-semibold">
                          L:{stats.accMeans.LOW?.toFixed(1) ?? '—'} • M:
                          {stats.accMeans.MID?.toFixed(1) ?? '—'} • H:
                          {stats.accMeans.HIGH?.toFixed(1) ?? '—'}
                        </div>
                        <Badge
                          variant={
                            stats.acceptance.passes.accuracyOverall ? 'secondary' : 'destructive'
                          }
                        >
                          {stats.acceptance.passes.accuracyOverall ? 'PASS' : 'FAIL'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Regression Chart */}
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="x" type="number" name="Nominal" />
                        <YAxis dataKey="y" type="number" name="Response" />
                        <RTooltip />
                        <Scatter data={stats.scatter} fill="#6a9bcc" />
                        <RLine
                          type="linear"
                          dataKey="y"
                          data={stats.line}
                          dot={false}
                          stroke="#ef4444"
                          strokeWidth={2}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Guard Summary */}
                  <div
                    className={`rounded border p-4 ${stats.acceptance.passes.guardPass ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`}
                  >
                    <div className="flex items-center gap-3">
                      {stats.acceptance.passes.guardPass ? (
                        <BadgeCheck className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <TriangleAlert className="h-5 w-5 text-red-600" />
                      )}
                      <div>
                        <div className="font-medium">
                          {stats.acceptance.passes.guardPass
                            ? 'Guard conditions satisfied'
                            : 'Guard conditions NOT met'}
                        </div>
                        {!stats.acceptance.passes.guardPass && (
                          <ul className="mt-2 text-sm list-disc ml-6 space-y-1">
                            {!stats.acceptance.passes.r2Pass && <li>R² below minimum threshold</li>}
                            {!stats.acceptance.passes.rsdPass && (
                              <li>Repeatability %RSD above maximum</li>
                            )}
                            {!stats.acceptance.passes.accuracyOverall && (
                              <li>One or more accuracy means outside bounds</li>
                            )}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Method Status Controls */}
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="text-sm text-slate-600">
                      Current status:{' '}
                      <span className="font-medium">{method?.status?.replace('_', ' ')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {method?.status !== 'APPROVED' && (
                        <Button
                          onClick={() => handleStatusUpdate('APPROVED')}
                          disabled={statusUpdating}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          {statusUpdating ? 'Updating...' : 'Approve Method'}
                        </Button>
                      )}
                      {!stats.acceptance.passes.guardPass && method?.status !== 'APPROVED' && (
                        <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              className="border-orange-300 text-orange-700 hover:bg-orange-50"
                            >
                              Approve with Override
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Override Approval Guard</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="text-sm text-slate-600">
                                Guard conditions are not met. Please provide justification for
                                override:
                              </div>
                              <textarea
                                className="w-full p-3 border border-slate-300 rounded-md"
                                rows={4}
                                placeholder="Enter reason for override (e.g., CCR-123: acceptable risk based on historical data...)"
                                value={overrideReason}
                                onChange={e => setOverrideReason(e.target.value)}
                              />
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setOverrideOpen(false)}>
                                Cancel
                              </Button>
                              <Button
                                onClick={() => handleStatusUpdate('APPROVED', true)}
                                disabled={!overrideReason.trim() || statusUpdating}
                                className="bg-orange-600 hover:bg-orange-700"
                              >
                                {statusUpdating ? 'Processing...' : 'Override & Approve'}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Change Control Tab */}
        <TabsContent value="change-control" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="w-5 h-5" />
                  Change Controls ({changeControls.length})
                </div>
                <Button
                  onClick={() => setShowCCForm(true)}
                  size="sm"
                  data-testid="button-new-change-control"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  New Change Control
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Change Control Form */}
              {showCCForm && (
                <div className="mb-6 p-4 border border-blue-200 rounded-lg bg-blue-50">
                  <h3 className="font-medium text-slate-900 mb-4">Create Change Control</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Title
                        </label>
                        <Input
                          value={ccFormData.title}
                          onChange={e =>
                            setCCFormData(prev => ({ ...prev, title: e.target.value }))
                          }
                          placeholder="Brief description of change"
                          data-testid="input-cc-title"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Owner
                        </label>
                        <Input
                          value={ccFormData.owner}
                          onChange={e =>
                            setCCFormData(prev => ({ ...prev, owner: e.target.value }))
                          }
                          placeholder="Responsible person"
                          data-testid="input-cc-owner"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Reason for Change
                      </label>
                      <Input
                        value={ccFormData.reason}
                        onChange={e => setCCFormData(prev => ({ ...prev, reason: e.target.value }))}
                        placeholder="Why is this change needed?"
                        data-testid="input-cc-reason"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Impact Assessment
                        </label>
                        <Input
                          value={ccFormData.impact}
                          onChange={e =>
                            setCCFormData(prev => ({ ...prev, impact: e.target.value }))
                          }
                          placeholder="Low/Medium/High"
                          data-testid="input-cc-impact"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Due Date
                        </label>
                        <Input
                          type="date"
                          value={ccFormData.due}
                          onChange={e => setCCFormData(prev => ({ ...prev, due: e.target.value }))}
                          data-testid="input-cc-due"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={createChangeControl}
                        size="sm"
                        data-testid="button-submit-cc"
                      >
                        Create Change Control
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowCCForm(false)}
                        size="sm"
                        data-testid="button-cancel-cc"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {changeControls.length === 0 && !showCCForm ? (
                <div className="text-center py-8 text-slate-500">
                  <Wrench className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                  <div>No change controls</div>
                  <div className="text-sm">
                    Create a change control to track method modifications
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {changeControls.map(cc => (
                    <div
                      key={cc.id}
                      className="p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                      data-testid={`change-control-${cc.id}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-medium text-slate-900">{cc.title}</h4>
                          <div className="text-sm text-slate-500 mt-1">
                            Created {new Date(cc.created_at).toLocaleDateString()}
                            {cc.created_by && ` by ${cc.created_by}`}
                          </div>
                        </div>
                        <Badge
                          variant={
                            cc.status === 'APPROVED'
                              ? 'default'
                              : cc.status === 'PENDING'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {cc.status}
                        </Badge>
                      </div>

                      {cc.reason && <p className="text-sm text-slate-600 mb-3">{cc.reason}</p>}

                      {cc.impact && (
                        <div className="mb-3">
                          <span className="text-xs font-medium text-slate-500">Impact: </span>
                          <Badge
                            variant={
                              cc.impact === 'High'
                                ? 'destructive'
                                : cc.impact === 'Medium'
                                  ? 'secondary'
                                  : 'outline'
                            }
                            className="text-xs"
                          >
                            {cc.impact}
                          </Badge>
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        {cc.owner && <span>Owner: {cc.owner}</span>}
                        {cc.due && <span>Due: {new Date(cc.due).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Validation Data Entry */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Validation Data Entry
                </div>
                <Button
                  onClick={() => setShowValidationForm(true)}
                  size="sm"
                  data-testid="button-new-validation-data"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Validation Data
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {showValidationForm && (
                <div className="p-4 border border-green-200 rounded-lg bg-green-50">
                  <h3 className="font-medium text-slate-900 mb-4">Enter Validation Data</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Validation Parameter
                        </label>
                        <select
                          value={validationFormData.parameter}
                          onChange={e =>
                            setValidationFormData(prev => ({ ...prev, parameter: e.target.value }))
                          }
                          className="w-full p-2 border border-slate-300 rounded-md"
                          data-testid="select-validation-parameter"
                        >
                          <option value="">Select parameter...</option>
                          <option value="Specificity">Specificity</option>
                          <option value="Linearity">Linearity</option>
                          <option value="Accuracy">Accuracy</option>
                          <option value="Precision">Precision</option>
                          <option value="Range">Range</option>
                          <option value="Detection Limit">Detection Limit</option>
                          <option value="Quantitation Limit">Quantitation Limit</option>
                          <option value="Robustness">Robustness</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Linearity R²
                        </label>
                        <Input
                          value={validationFormData.linearityR2}
                          onChange={e =>
                            setValidationFormData(prev => ({
                              ...prev,
                              linearityR2: e.target.value,
                            }))
                          }
                          placeholder="0.9995"
                          data-testid="input-linearity-r2"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Accuracy Results (%)
                        </label>
                        <Input
                          value={validationFormData.accuracyResults}
                          onChange={e =>
                            setValidationFormData(prev => ({
                              ...prev,
                              accuracyResults: e.target.value,
                            }))
                          }
                          placeholder="98.5-101.2%"
                          data-testid="input-accuracy-results"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Precision RSD (%)
                        </label>
                        <Input
                          value={validationFormData.precisionRSD}
                          onChange={e =>
                            setValidationFormData(prev => ({
                              ...prev,
                              precisionRSD: e.target.value,
                            }))
                          }
                          placeholder="1.2%"
                          data-testid="input-precision-rsd"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Specificity Results
                      </label>
                      <Input
                        value={validationFormData.specificityResults}
                        onChange={e =>
                          setValidationFormData(prev => ({
                            ...prev,
                            specificityResults: e.target.value,
                          }))
                        }
                        placeholder="No interference observed from excipients"
                        data-testid="input-specificity-results"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                      <Input
                        value={validationFormData.notes}
                        onChange={e =>
                          setValidationFormData(prev => ({ ...prev, notes: e.target.value }))
                        }
                        placeholder="Additional observations or comments"
                        data-testid="input-validation-notes"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={submitValidationData}
                        size="sm"
                        data-testid="button-submit-validation"
                      >
                        Submit Validation Data
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowValidationForm(false)}
                        size="sm"
                        data-testid="button-cancel-validation"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {!showValidationForm && (
                <div className="text-center py-6 text-slate-500">
                  <BarChart3 className="w-10 h-10 mx-auto mb-2 text-slate-400" />
                  <div className="text-sm">
                    Enter validation data for specificity, linearity, accuracy, and precision
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MethodDetails;

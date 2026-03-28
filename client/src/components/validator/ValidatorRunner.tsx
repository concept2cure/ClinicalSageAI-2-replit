import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useDropzone } from '../lightweight-wrappers.js';
import { toast, Toaster } from '../lightweight-wrappers.js';
import Select from '../lightweight-wrappers.js';
import clsx from 'clsx';
import { useSortable } from '../lightweight-wrappers.js';
import { CSS } from '../lightweight-wrappers.js';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '../lightweight-wrappers.js';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '../lightweight-wrappers.jsx';
import axiosWithToken from '../../utils/axiosWithToken';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Upload,
  FileText,
  ChevronRight,
  Trash2,
  Settings,
  RefreshCw,
  Search,
  Eye,
  Download,
  Play,
  Info,
  Clipboard,
  Shield,
  FileCheck,
  File,
} from 'lucide-react';

// Types
interface FileWithMetadata {
  id: string;
  file: File;
  status: 'idle' | 'validating' | 'completed' | 'failed';
  result?: ValidationResult;
  uploadTimestamp: number;
}

interface ValidationEngine {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  fileTypes: string[];
}

interface ValidationResult {
  validations: {
    id: string;
    rule: string;
    status: 'success' | 'warning' | 'error';
    message: string;
    path?: string;
    lineNumber?: number;
  }[];
  summary: {
    success: number;
    warning: number;
    error: number;
  };
  timestamp: number;
}

// Mock data for validation engines
const VALIDATION_ENGINES: ValidationEngine[] = [
  {
    id: 'fda-ind',
    name: 'FDA IND Checker',
    description: 'Validates against FDA IND submission guidelines and requirements',
    icon: <Shield className="w-5 h-5 text-blue-600" />,
    fileTypes: ['.pdf', '.docx', '.doc'],
  },
  {
    id: 'ema-imp',
    name: 'EMA IMPD Validator',
    description: 'Checks compliance with EMA IMPD structure and content requirements',
    icon: <FileCheck className="w-5 h-5 text-green-600" />,
    fileTypes: ['.pdf', '.docx', '.doc', '.xml'],
  },
  {
    id: 'pmda-check',
    name: 'PMDA Compliance Tool',
    description: 'Validates against PMDA submission standards',
    icon: <Clipboard className="w-5 h-5 text-purple-600" />,
    fileTypes: ['.pdf', '.docx', '.doc', '.xml'],
  },
  {
    id: 'ctd-validator',
    name: 'CTD Structure Validator',
    description: 'Checks if documents follow the CTD structure guidelines',
    icon: <FileText className="w-5 h-5 text-orange-600" />,
    fileTypes: ['.pdf', '.docx', '.doc', '.xml', '.json'],
  },
];

// File Item Component with Microsoft 365 styling
const FileItem = ({ file }: { file: FileWithMetadata }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: file.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Format file size
  const formatFileSize = (size: number): string => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get status icon
  const getStatusIcon = () => {
    switch (file.status) {
      case 'idle':
        return <Info className="w-5 h-5 text-gray-400" />;
      case 'validating':
        return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'completed':
        if (file.result && file.result.summary.error > 0) {
          return <XCircle className="w-5 h-5 text-red-500" />;
        } else if (file.result && file.result.summary.warning > 0) {
          return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
        } else {
          return <CheckCircle className="w-5 h-5 text-green-500" />;
        }
      case 'failed':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      default:
        return <Info className="w-5 h-5 text-gray-400" />;
    }
  };

  // Get file icon based on type
  const getFileIcon = () => {
    const ext = file.file.name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      return <FileText className="w-5 h-5 text-red-500" />;
    } else if (['doc', 'docx'].includes(ext || '')) {
      return <FileText className="w-5 h-5 text-blue-500" />;
    } else if (['xls', 'xlsx'].includes(ext || '')) {
      return <FileText className="w-5 h-5 text-green-500" />;
    } else if (['ppt', 'pptx'].includes(ext || '')) {
      return <FileText className="w-5 h-5 text-orange-500" />;
    } else if (['xml', 'json'].includes(ext || '')) {
      return <FileText className="w-5 h-5 text-purple-500" />;
    }
    return <File className="w-5 h-5 text-gray-500" />;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-center bg-white border border-gray-200 rounded-md p-3 mb-2 hover:shadow-md transition-shadow duration-150 cursor-pointer group relative"
    >
      <div className="mr-3">{getFileIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 truncate">{file.file.name}</div>
        <div className="flex items-center text-xs text-gray-500 mt-1">
          <span>{formatFileSize(file.file.size)}</span>
          <span className="mx-2">•</span>
          <span>{formatDate(file.uploadTimestamp)}</span>
        </div>
      </div>
      <div className="flex items-center">
        <div className="mr-3">{getStatusIcon()}</div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Status Badge Component (mimicking MS Pills)
const StatusBadge = ({ type, count }: { type: 'success' | 'warning' | 'error'; count: number }) => {
  const classes = {
    success: 'bg-green-100 text-green-800 border-green-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    error: 'bg-red-100 text-red-800 border-red-200',
  };

  const icons = {
    success: <CheckCircle className="w-3.5 h-3.5 mr-1" />,
    warning: <AlertTriangle className="w-3.5 h-3.5 mr-1" />,
    error: <XCircle className="w-3.5 h-3.5 mr-1" />,
  };

  return (
    <div
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${classes[type]}`}
    >
      {icons[type]}
      <span>{count}</span>
    </div>
  );
};

// Validation Result Item Component
const ValidationResultItem = ({
  validation,
}: {
  validation: ValidationResult['validations'][0];
}) => {
  const [isExplaining, setIsExplaining] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [fix, setFix] = useState<string | null>(null);

  const icons = {
    success: <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />,
    error: <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />,
  };

  const classes = {
    success: 'border-green-200 bg-green-50',
    warning: 'border-yellow-200 bg-yellow-50',
    error: 'border-red-200 bg-red-50',
  };

  // Handle explaining a rule
  const handleExplain = async () => {
    if (validation.status === 'success') return;

    setIsExplaining(true);
    setExplanation(null);

    try {
      // Connect to our new FastAPI explanation endpoint
      const ruleId = validation.id.split('-')[0]; // Extract rule ID like 'REG001'
      const response = await axiosWithToken.get(`/regintel/explain/${ruleId}`);

      // Format the explanation from the API response
      const data = response.data;
      const formattedExplanation =
        `${data.title}\n\n` +
        `${data.description}\n\n` +
        `Requirement: ${data.requirement}\n\n` +
        `Impact: ${data.impact}`;

      setExplanation(formattedExplanation);
    } catch (error) {
      console.error('Error explaining rule:', error);
      toast.error('Failed to get explanation');

      // Fallback explanation for development
      if (process.env.NODE_ENV === 'development') {
        setExplanation(
          `Rule '${validation.rule}' requires that all dataset files conform to the regulatory standard. This ensures that agencies can properly process and review the data. Common issues include missing variables, incorrect formatting, or invalid coding.`
        );
      }
    } finally {
      setIsExplaining(false);
    }
  };

  // Handle fixing a rule
  const handleFix = async () => {
    if (validation.status === 'success') return;

    setIsFixing(true);
    setFix(null);

    try {
      // Connect to our new FastAPI fix suggestion endpoint
      const ruleId = validation.id.split('-')[0]; // Extract rule ID like 'REG001'
      const response = await axiosWithToken.get(`/regintel/fix/${ruleId}`);

      // Format the fix suggestions from the API response
      const suggestions = response.data.suggestions;
      const formattedFix = suggestions
        .map((suggestion: string, index: number) => `${index + 1}. ${suggestion}`)
        .join('\n');

      setFix(formattedFix);
      toast.success('Fix suggestions generated');
    } catch (error) {
      console.error('Error fixing rule:', error);
      toast.error('Failed to get fix suggestions');

      // Fallback fix for development
      if (process.env.NODE_ENV === 'development') {
        setFix(
          `To fix the '${validation.rule}' violation, consider the following:\n1. Check that all required variables are present in your dataset\n2. Ensure all dates follow the ISO8601 format\n3. Verify that all coded values match the specified controlled terminology`
        );
      }
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className={`p-3 rounded-md border mb-2 ${classes[validation.status]}`}>
      <div className="flex">
        <div className="mr-3">{icons[validation.status]}</div>
        <div className="flex-1">
          <div className="font-medium text-gray-900">{validation.rule}</div>
          <p className="text-sm text-gray-600 mt-1">{validation.message}</p>
          {validation.path && validation.lineNumber && (
            <div className="mt-2 flex items-center text-xs text-gray-500">
              <span className="font-medium">Location:</span>
              <span className="ml-1">
                {validation.path} (Line {validation.lineNumber})
              </span>
            </div>
          )}

          {/* Action buttons */}
          {validation.status !== 'success' && (
            <div className="flex mt-3 space-x-4">
              <button
                onClick={handleExplain}
                disabled={isExplaining}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
              >
                {isExplaining ? (
                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Info className="w-3 h-3 mr-1" />
                )}
                {isExplaining ? 'Explaining...' : 'Explain Rule'}
              </button>

              <button
                onClick={handleFix}
                disabled={isFixing}
                className="text-xs text-green-600 hover:text-green-800 flex items-center"
              >
                {isFixing ? (
                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="w-3 h-3 mr-1" />
                )}
                {isFixing ? 'Generating Fix...' : 'Suggest Fix'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Explanation panel */}
      {explanation && (
        <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-md text-sm text-gray-700">
          <div className="font-medium mb-1 flex items-center text-blue-800">
            <Info className="w-3.5 h-3.5 mr-1.5" />
            Explanation:
          </div>
          <p className="whitespace-pre-line">{explanation}</p>
        </div>
      )}

      {/* Fix suggestion panel */}
      {fix && (
        <div className="mt-3 p-3 bg-green-50 border border-green-100 rounded-md text-sm text-gray-700">
          <div className="font-medium mb-1 flex items-center text-green-800">
            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
            Fix Suggestions:
          </div>
          <p className="whitespace-pre-line">{fix}</p>
        </div>
      )}
    </div>
  );
};

// Empty State Component (OneDrive inspired)
const EmptyState = ({ onUploadClick }: { onUploadClick: () => void }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8">
      <div className="w-16 h-16 mb-4 rounded-full bg-blue-100 flex items-center justify-center">
        <FileText className="w-8 h-8 text-blue-600" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">No files uploaded yet</h3>
      <p className="text-gray-500 mb-6 max-w-sm">
        Upload your regulatory documents to validate them against global compliance standards.
      </p>
      <button
        onClick={onUploadClick}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
      >
        <Upload className="w-4 h-4 mr-2" />
        Upload Files
      </button>
    </div>
  );
};

// Main ValidatorRunner Component
const ValidatorRunner: React.FC = () => {
  const [files, setFiles] = useState<FileWithMetadata[]>([]);
  const [selectedEngine, setSelectedEngine] = useState<ValidationEngine | null>(
    VALIDATION_ENGINES[0]
  );
  const [selectedFile, setSelectedFile] = useState<FileWithMetadata | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Handle file drop
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newFiles = acceptedFiles.map(file => ({
        id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file,
        status: 'idle' as const,
        uploadTimestamp: Date.now(),
      }));

      setFiles(prev => [...prev, ...newFiles]);
      toast.success(`${acceptedFiles.length} file(s) uploaded`);

      if (newFiles.length > 0 && !selectedFile) {
        setSelectedFile(newFiles[0]);
      }
    },
    [selectedFile]
  );

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  // API validation function
  const validateFile = async (file: FileWithMetadata) => {
    if (!selectedEngine) return;

    setIsValidating(true);

    // Update file status
    setFiles(prev => prev.map(f => (f.id === file.id ? { ...f, status: 'validating' } : f)));

    // Create a FormData object to send the file
    const formData = new FormData();
    formData.append('file', file.file);
    formData.append('engine_id', selectedEngine.id);

    try {
      // Call the new FastAPI validation endpoint
      const response = await axiosWithToken.post('/validate/file', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Get the validation result from the response
      const apiResponse = response.data;

      // The response already has the correct format for our ValidationResult
      const result: ValidationResult = {
        validations: apiResponse.validations,
        summary: apiResponse.summary,
        timestamp: Date.now(),
      };

      // Create report and define XML URLs for download
      const reportUrl = `/downloads/${apiResponse.id}.json`;
      const defineXmlUrl = `/define/${apiResponse.id}.xml`;

      // Update file with results
      setFiles(prev =>
        prev.map(f =>
          f.id === file.id
            ? {
                ...f,
                status: 'completed',
                result,
                reportUrl,
                defineXmlUrl,
              }
            : f
        )
      );

      toast.success('Validation completed');
    } catch (error) {
      console.error('Validation error:', error);

      // For development, use mock data if the API fails
      if (process.env.NODE_ENV === 'development') {
        // Generate mock validation results
        const mockResults: ValidationResult = {
          validations: [
            {
              id: `val-${Date.now()}-1`,
              rule: 'Document Structure Check',
              status: Math.random() > 0.7 ? 'error' : 'success',
              message: 'Document structure follows CTD format.',
              path: file.file.name,
              lineNumber: Math.floor(Math.random() * 100) + 1,
            },
            {
              id: `val-${Date.now()}-2`,
              rule: 'Required Sections',
              status: Math.random() > 0.6 ? 'success' : 'warning',
              message: 'All required sections are present.',
              path: file.file.name,
              lineNumber: Math.floor(Math.random() * 100) + 1,
            },
            {
              id: `val-${Date.now()}-3`,
              rule: 'Metadata Validation',
              status: Math.random() > 0.5 ? 'success' : 'error',
              message: 'Some required metadata fields are missing or invalid.',
              path: file.file.name,
              lineNumber: Math.floor(Math.random() * 100) + 1,
            },
          ],
          summary: {
            success: 0,
            warning: 0,
            error: 0,
          },
          timestamp: Date.now(),
        };

        // Calculate summary counts
        mockResults.validations.forEach(v => {
          mockResults.summary[v.status]++;
        });

        // Update file with mock results
        setFiles(prev =>
          prev.map(f => (f.id === file.id ? { ...f, status: 'completed', result: mockResults } : f))
        );
        toast.success('Validation completed (mock)');
      } else {
        setFiles(prev => prev.map(f => (f.id === file.id ? { ...f, status: 'failed' } : f)));
        toast.error('Validation failed');
      }
    } finally {
      setIsValidating(false);
    }
  };

  // Handle DnD sort end
  const handleDndSortEnd = ({ active, over }: any) => {
    if (active.id !== over.id) {
      setFiles(items => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Format validation engine options for react-select
  const engineOptions = VALIDATION_ENGINES.map(engine => ({
    value: engine.id,
    label: engine.name,
    engine,
  }));

  // Handle engine selection change
  const handleEngineChange = (option: any) => {
    setSelectedEngine(option.engine);
  };

  // Delete a file
  const handleDeleteFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    if (selectedFile?.id === id) {
      setSelectedFile(files.length > 1 ? files.find(f => f.id !== id) || null : null);
    }
    toast.success('File removed');
  };

  // Handle validate button click
  const handleValidate = () => {
    if (selectedFile) {
      validateFile(selectedFile);
    }
  };

  // Select a file for validation
  const handleSelectFile = (file: FileWithMetadata) => {
    setSelectedFile(file);
  };

  // Effect to update the selected file if it's removed
  useEffect(() => {
    if (selectedFile && !files.some(f => f.id === selectedFile.id)) {
      setSelectedFile(files.length > 0 ? files[0] : null);
    }
  }, [files, selectedFile]);

  return (
    <div className="bg-gray-50 min-h-screen font-sans" {...getRootProps()}>
      <Toaster position="top-right" />
      <input {...getInputProps()} hidden ref={fileInputRef} />

      {/* Header with MS 365-like styling */}
      <header className="bg-white border-b border-gray-200 py-3 px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="mr-4">
              <Shield className="w-7 h-7 text-blue-700" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">RegIntel Validator</h1>
              <p className="text-sm text-gray-500">
                Validate regulatory documents against compliance standards
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative max-w-xs w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
                placeholder="Search validations..."
              />
            </div>

            <button
              onClick={() => {}}
              className="inline-flex items-center p-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-64px)]">
        {/* Left sidebar - MS Outlook inspired */}
        <div className="w-72 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <button
              onClick={open}
              className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Files
            </button>

            <div className="mt-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Validation Engines
              </h3>
              <Select
                options={engineOptions}
                defaultValue={engineOptions[0]}
                onChange={handleEngineChange}
                isSearchable
                className="react-select-container"
                classNamePrefix="react-select"
                styles={{
                  control: base => ({
                    ...base,
                    borderColor: '#e8e6dc',
                    boxShadow: 'none',
                    '&:hover': {
                      borderColor: '#d6d3c8',
                    },
                  }),
                  option: (base, state) => ({
                    ...base,
                    backgroundColor: state.isSelected
                      ? '#e0f2fe'
                      : state.isFocused
                        ? '#f0f9ff'
                        : 'white',
                    color: '#c15f3c',
                    '&:active': {
                      backgroundColor: '#e0f2fe',
                    },
                  }),
                }}
              />
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Uploaded Files
                </h3>
                <span className="text-xs font-medium text-gray-500">
                  {files.length} file{files.length !== 1 ? 's' : ''}
                </span>
              </div>

              {files.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDndSortEnd}
                >
                  <SortableContext
                    items={files.map(f => f.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {files.map(file => (
                        <div
                          key={file.id}
                          onClick={() => handleSelectFile(file)}
                          className={clsx(
                            'cursor-pointer',
                            selectedFile?.id === file.id && 'ring-2 ring-blue-500 rounded-md'
                          )}
                        >
                          <FileItem file={file} />
                        </div>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="text-center p-4 border border-dashed border-gray-300 rounded-md bg-gray-50">
                  <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No files uploaded</p>
                  <button
                    onClick={open}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Upload now
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main content area - MS Word/OneDrive inspired */}
        <div className="flex-1 overflow-y-auto">
          {isDragActive && (
            <div className="absolute inset-0 bg-blue-100 bg-opacity-70 flex items-center justify-center z-50">
              <div className="bg-white p-8 rounded-lg shadow-xl text-center">
                <Upload className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Drop files here</h2>
                <p className="text-gray-500">Upload your regulatory documents to validate</p>
              </div>
            </div>
          )}

          {!selectedFile ? (
            <EmptyState onUploadClick={open} />
          ) : (
            <div className="p-6">
              <div className="bg-white border border-gray-200 rounded-md shadow-sm p-4 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <FileText className="w-6 h-6 text-blue-600 mr-3" />
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        {selectedFile.file.name}
                      </h2>
                      <div className="flex items-center text-sm text-gray-500 mt-1">
                        <span>{selectedFile.file.type || 'document'}</span>
                        <span className="mx-2">•</span>
                        <span>{selectedFile.file.size} bytes</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleDeleteFile(selectedFile.id)}
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      Delete
                    </button>

                    <button
                      onClick={handleValidate}
                      disabled={isValidating || selectedFile.status === 'validating'}
                      className={clsx(
                        'inline-flex items-center px-3 py-1.5 border border-transparent rounded-md text-sm font-medium text-white shadow-sm',
                        isValidating || selectedFile.status === 'validating'
                          ? 'bg-blue-400 cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700'
                      )}
                    >
                      {isValidating || selectedFile.status === 'validating' ? (
                        <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-1.5" />
                      )}
                      {isValidating || selectedFile.status === 'validating'
                        ? 'Validating...'
                        : 'Validate'}
                    </button>
                  </div>
                </div>

                {/* Validation engine details */}
                <div className="flex items-center p-3 bg-blue-50 border border-blue-100 rounded-md">
                  <div className="mr-3">{selectedEngine?.icon}</div>
                  <div>
                    <div className="font-medium text-gray-900">{selectedEngine?.name}</div>
                    <p className="text-sm text-gray-600">{selectedEngine?.description}</p>
                  </div>
                </div>
              </div>

              {/* Validation results */}
              {selectedFile.status === 'completed' && selectedFile.result && (
                <div className="bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-gray-900">Validation Results</h3>
                      <div className="flex space-x-2">
                        <StatusBadge type="success" count={selectedFile.result.summary.success} />
                        <StatusBadge type="warning" count={selectedFile.result.summary.warning} />
                        <StatusBadge type="error" count={selectedFile.result.summary.error} />
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="space-y-3">
                      {selectedFile.result.validations.map(validation => (
                        <ValidationResultItem key={validation.id} validation={validation} />
                      ))}
                    </div>

                    <div className="mt-4 flex justify-end">
                      <button className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                        <Download className="w-4 h-4 mr-1.5" />
                        Export Report
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {selectedFile.status === 'validating' && (
                <div className="bg-white border border-gray-200 rounded-md shadow-sm p-8 text-center">
                  <div className="animate-spin inline-block w-12 h-12 border-4 border-current border-t-transparent text-blue-600 rounded-full mb-4"></div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Validating Document</h3>
                  <p className="text-gray-500 max-w-md mx-auto">
                    Analyzing your document against {selectedEngine?.name} compliance requirements.
                    This may take a moment...
                  </p>
                </div>
              )}

              {selectedFile.status === 'idle' && (
                <div className="bg-white border border-gray-200 rounded-md shadow-sm p-8 text-center">
                  <div className="inline-block p-3 bg-blue-100 rounded-full mb-4">
                    <Play className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to Validate</h3>
                  <p className="text-gray-500 max-w-md mx-auto mb-6">
                    Click the Validate button to check your document against
                    {selectedEngine?.name} compliance requirements.
                  </p>
                  <button
                    onClick={handleValidate}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                  >
                    <Play className="w-4 h-4 mr-1.5" />
                    Start Validation
                  </button>
                </div>
              )}

              {selectedFile.status === 'failed' && (
                <div className="bg-white border border-red-200 rounded-md shadow-sm p-8 text-center">
                  <div className="inline-block p-3 bg-red-100 rounded-full mb-4">
                    <XCircle className="w-8 h-8 text-red-600" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Validation Failed</h3>
                  <p className="text-gray-500 max-w-md mx-auto mb-6">
                    We encountered an error while validating your document. This could be due to
                    file corruption or an unsupported format.
                  </p>
                  <button
                    onClick={handleValidate}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                  >
                    <RefreshCw className="w-4 h-4 mr-1.5" />
                    Try Again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ValidatorRunner;

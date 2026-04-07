import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  FileText,
  FolderTree,
  LayoutGrid,
  List,
  Check,
  AlertCircle,
  Folder,
  File,
  Plus,
  RefreshCw,
  PackageOpen,
  Download,
  Upload,
  FileUp,
  X,
  Info,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';

import {
  createEctdFolderStructure,
  generateEctdIndexXml,
  validateEctdFileName,
  validateEctdFilePath,
} from '../../utils/ectd-validator';

/**
 * eCTD Submission Builder Component
 *
 * This component allows users to prepare eCTD-compliant regulatory submissions
 * following ICH eCTD v3.2.2 specifications.
 *
 * Features:
 * - Create submission structure following eCTD specifications
 * - Add/remove/edit documents within the structure
 * - Validate document naming and placement
 * - Generate required XML files
 * - Prepare submission package
 */
const ECTDSubmissionBuilder = () => {
  // Submission metadata
  const [submissionData, setSubmissionData] = useState({
    submissionId: '',
    submissionType: 'original',
    applicationNumber: '',
    submissionDescription: '',
    applicant: '',
    agency: 'FDA',
    productName: '',
    dtdVersion: '3.2',
    sequenceNumber: '0000',
    submissionUnit: 'initial-application',
    regionCode: 'us',
  });

  // Submission structure and files
  const [submissionStructure, setSubmissionStructure] = useState({});
  const [selectedNode, setSelectedNode] = useState(null);
  const [files, setFiles] = useState([]);

  // UI states
  const [activeTab, setActiveTab] = useState('structure');
  const [validationResults, setValidationResults] = useState([]);
  const [validationProgress, setValidationProgress] = useState(0);
  const [isValidating, setIsValidating] = useState(false);
  const [showAddFileDialog, setShowAddFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [fileContents, setFileContents] = useState({});

  // Initialize submission structure
  useEffect(() => {
    initializeSubmissionStructure();
  }, []);

  const initializeSubmissionStructure = () => {
    // Create basic eCTD structure
    const structure = {
      name: 'Root',
      children: [
        {
          name: 'm1',
          label: 'Module 1 - Administrative and Prescribing Information',
          children: [
            {
              name: `m1/${submissionData.regionCode}`,
              label: `Module 1 - ${submissionData.regionCode.toUpperCase()} Regional`,
              children: [],
            },
          ],
        },
        {
          name: 'm2',
          label: 'Module 2 - Common Technical Document Summaries',
          children: [
            { name: 'm2/21-toc', label: '2.1 Table of Contents' },
            { name: 'm2/22-intro', label: '2.2 Introduction' },
            { name: 'm2/23-qos', label: '2.3 Quality Overall Summary' },
            { name: 'm2/24-nonclin-over', label: '2.4 Nonclinical Overview' },
            { name: 'm2/25-clin-over', label: '2.5 Clinical Overview' },
            { name: 'm2/26-nonclin-sum', label: '2.6 Nonclinical Written and Tabulated Summaries' },
            { name: 'm2/27-clin-sum', label: '2.7 Clinical Summary' },
          ],
        },
        {
          name: 'm3',
          label: 'Module 3 - Quality',
          children: [
            { name: 'm3/31-toc', label: '3.1 Table of Contents' },
            {
              name: 'm3/32-body-data',
              label: '3.2 Body of Data',
              children: [
                {
                  name: 'm3/32-body-data/32s-drug-sub',
                  label: '3.2.S Drug Substance',
                  children: [
                    {
                      name: 'm3/32-body-data/32s-drug-sub/32s1-gen-info',
                      label: '3.2.S.1 General Information',
                    },
                    {
                      name: 'm3/32-body-data/32s-drug-sub/32s2-manuf',
                      label: '3.2.S.2 Manufacture',
                    },
                    {
                      name: 'm3/32-body-data/32s-drug-sub/32s3-charac',
                      label: '3.2.S.3 Characterisation',
                    },
                    {
                      name: 'm3/32-body-data/32s-drug-sub/32s4-contr-drug-sub',
                      label: '3.2.S.4 Control of Drug Substance',
                    },
                    {
                      name: 'm3/32-body-data/32s-drug-sub/32s5-ref-stand',
                      label: '3.2.S.5 Reference Standards or Materials',
                    },
                    {
                      name: 'm3/32-body-data/32s-drug-sub/32s6-cont-closure-sys',
                      label: '3.2.S.6 Container Closure System',
                    },
                    { name: 'm3/32-body-data/32s-drug-sub/32s7-stab', label: '3.2.S.7 Stability' },
                  ],
                },
                {
                  name: 'm3/32-body-data/32p-drug-prod',
                  label: '3.2.P Drug Product',
                  children: [
                    {
                      name: 'm3/32-body-data/32p-drug-prod/32p1-desc-comp',
                      label: '3.2.P.1 Description and Composition',
                    },
                    {
                      name: 'm3/32-body-data/32p-drug-prod/32p2-pharm-dev',
                      label: '3.2.P.2 Pharmaceutical Development',
                    },
                    {
                      name: 'm3/32-body-data/32p-drug-prod/32p3-manuf',
                      label: '3.2.P.3 Manufacture',
                    },
                    {
                      name: 'm3/32-body-data/32p-drug-prod/32p4-contr-excip',
                      label: '3.2.P.4 Control of Excipients',
                    },
                    {
                      name: 'm3/32-body-data/32p-drug-prod/32p5-contr-drug-prod',
                      label: '3.2.P.5 Control of Drug Product',
                    },
                    {
                      name: 'm3/32-body-data/32p-drug-prod/32p6-ref-stand',
                      label: '3.2.P.6 Reference Standards or Materials',
                    },
                    {
                      name: 'm3/32-body-data/32p-drug-prod/32p7-cont-closure-sys',
                      label: '3.2.P.7 Container Closure System',
                    },
                    { name: 'm3/32-body-data/32p-drug-prod/32p8-stab', label: '3.2.P.8 Stability' },
                  ],
                },
              ],
            },
            { name: 'm3/33-lit-ref', label: '3.3 Literature References' },
          ],
        },
        {
          name: 'm4',
          label: 'Module 4 - Nonclinical Study Reports',
          children: [
            { name: 'm4/41-toc', label: '4.1 Table of Contents' },
            {
              name: 'm4/42-stud-rep',
              label: '4.2 Study Reports',
              children: [
                {
                  name: 'm4/42-stud-rep/421-pharmacol',
                  label: '4.2.1 Pharmacology',
                  children: [
                    {
                      name: 'm4/42-stud-rep/421-pharmacol/4211-prim-pd',
                      label: '4.2.1.1 Primary Pharmacodynamics',
                    },
                    {
                      name: 'm4/42-stud-rep/421-pharmacol/4212-sec-pd',
                      label: '4.2.1.2 Secondary Pharmacodynamics',
                    },
                    {
                      name: 'm4/42-stud-rep/421-pharmacol/4213-safety-pharmacol',
                      label: '4.2.1.3 Safety Pharmacology',
                    },
                    {
                      name: 'm4/42-stud-rep/421-pharmacol/4214-pd-drug-interact',
                      label: '4.2.1.4 Pharmacodynamic Drug Interactions',
                    },
                  ],
                },
                {
                  name: 'm4/42-stud-rep/422-pk',
                  label: '4.2.2 Pharmacokinetics',
                  children: [],
                },
                {
                  name: 'm4/42-stud-rep/423-tox',
                  label: '4.2.3 Toxicology',
                  children: [],
                },
              ],
            },
            { name: 'm4/43-lit-ref', label: '4.3 Literature References' },
          ],
        },
        {
          name: 'm5',
          label: 'Module 5 - Clinical Study Reports',
          children: [
            { name: 'm5/51-toc', label: '5.1 Table of Contents' },
            { name: 'm5/52-tab', label: '5.2 Tabular Listing of All Clinical Studies' },
            {
              name: 'm5/53-clin-stud-rep',
              label: '5.3 Clinical Study Reports',
              children: [
                {
                  name: 'm5/53-clin-stud-rep/531-rep-biopharm-stud',
                  label: '5.3.1 Reports of Biopharmaceutic Studies',
                  children: [],
                },
                {
                  name: 'm5/53-clin-stud-rep/532-rep-stud-pk-human-biomat',
                  label:
                    '5.3.2 Reports of Studies Pertinent to Pharmacokinetics using Human Biomaterials',
                  children: [],
                },
                {
                  name: 'm5/53-clin-stud-rep/533-rep-human-pk-stud',
                  label: '5.3.3 Reports of Human Pharmacokinetic (PK) Studies',
                  children: [],
                },
                {
                  name: 'm5/53-clin-stud-rep/534-rep-human-pd-stud',
                  label: '5.3.4 Reports of Human Pharmacodynamic (PD) Studies',
                  children: [],
                },
                {
                  name: 'm5/53-clin-stud-rep/535-rep-effic-safety-stud',
                  label: '5.3.5 Reports of Efficacy and Safety Studies',
                  children: [
                    {
                      name: 'm5/53-clin-stud-rep/535-rep-effic-safety-stud/5351-stud-rep-contr',
                      label:
                        '5.3.5.1 Study Reports of Controlled Clinical Studies Pertinent to the Claimed Indication',
                    },
                    {
                      name: 'm5/53-clin-stud-rep/535-rep-effic-safety-stud/5352-stud-rep-uncontr',
                      label: '5.3.5.2 Study Reports of Uncontrolled Clinical Studies',
                    },
                  ],
                },
              ],
            },
            { name: 'm5/54-lit-ref', label: '5.4 Literature References' },
          ],
        },
      ],
    };

    setSubmissionStructure(structure);
  };

  // Handle metadata changes
  const handleMetadataChange = (field, value) => {
    setSubmissionData({
      ...submissionData,
      [field]: value,
    });
  };

  // Handle file uploads
  const handleFileUpload = (event, parentFolder) => {
    const uploadedFiles = Array.from(event.target.files);

    // Add files to the selected folder
    uploadedFiles.forEach(file => {
      // Validate file name against eCTD conventions
      const fileName = file.name;
      const parentPath = parentFolder || '';
      const fullPath = parentPath ? `${parentPath}/${fileName}` : fileName;

      const validation = validateEctdFileName(fileName, extractSectionFromPath(parentPath), {
        sequenceNumber: submissionData.sequenceNumber,
      });

      if (!validation.valid) {
        setValidationResults(prev => [
          ...prev,
          {
            type: 'warning',
            message: `File "${fileName}" has naming issues: ${validation.errors.join(', ')}`,
            path: fullPath,
          },
        ]);
      }

      // Read file content (text files only)
      if (file.type.includes('text') || file.name.endsWith('.xml')) {
        const reader = new FileReader();
        reader.onload = e => {
          setFileContents(prev => ({
            ...prev,
            [fullPath]: e.target.result,
          }));
        };
        reader.readAsText(file);
      }

      // Add file to state
      setFiles(prev => [
        ...prev,
        {
          name: fileName,
          path: fullPath,
          size: file.size,
          type: file.type,
          lastModified: new Date(file.lastModified).toISOString(),
          status: validation.valid ? 'valid' : 'warning',
        },
      ]);
    });

    // Reset file input
    event.target.value = null;
  };

  // Extract section identifier from a path
  const extractSectionFromPath = path => {
    // Extract the module number
    const moduleMatch = path.match(/^m([1-5])/);
    if (!moduleMatch) return null;

    const moduleNum = moduleMatch[1];

    // Module 1 is region-specific, handle differently
    if (moduleNum === '1') {
      // Extract regional section if available
      const regionSectionMatch = path.match(/m1\/[a-z]{2}\/([0-9.]+)/);
      return regionSectionMatch ? regionSectionMatch[1] : '1';
    }

    // For modules 2-5, extract section number
    let sectionMatch;

    // Module 2
    if (moduleNum === '2') {
      sectionMatch = path.match(/m2\/([0-9]{2})/);
      return sectionMatch ? `2.${sectionMatch[1].substring(0, 1)}` : '2';
    }

    // Module 3
    if (moduleNum === '3') {
      // Handle 3.2.S and 3.2.P special cases
      if (path.includes('32s-drug-sub')) {
        const subsectionMatch = path.match(/32s([0-9])/);
        return subsectionMatch ? `3.2.S.${subsectionMatch[1]}` : '3.2.S';
      }
      if (path.includes('32p-drug-prod')) {
        const subsectionMatch = path.match(/32p([0-9])/);
        return subsectionMatch ? `3.2.P.${subsectionMatch[1]}` : '3.2.P';
      }

      sectionMatch = path.match(/m3\/([0-9]{2})/);
      return sectionMatch ? `3.${sectionMatch[1].substring(0, 1)}` : '3';
    }

    // Module 4
    if (moduleNum === '4') {
      if (path.includes('421-pharmacol')) {
        const subsectionMatch = path.match(/421([0-9])/);
        return subsectionMatch ? `4.2.1.${subsectionMatch[1]}` : '4.2.1';
      }

      sectionMatch = path.match(/m4\/([0-9]{2})/);
      return sectionMatch ? `4.${sectionMatch[1].substring(0, 1)}` : '4';
    }

    // Module 5
    if (moduleNum === '5') {
      if (path.includes('535-rep-effic-safety-stud')) {
        const subsectionMatch = path.match(/535([0-9])/);
        return subsectionMatch ? `5.3.5.${subsectionMatch[1]}` : '5.3.5';
      }

      sectionMatch = path.match(/m5\/([0-9]{2})/);
      return sectionMatch ? `5.${sectionMatch[1].substring(0, 1)}` : '5';
    }

    return null;
  };

  // Add a new file manually
  const handleAddFile = () => {
    if (!selectedNode || !newFileName) return;

    const path = selectedNode.name;
    const fullPath = `${path}/${newFileName}`;

    // Validate file name against eCTD conventions
    const validation = validateEctdFileName(newFileName, extractSectionFromPath(path), {
      sequenceNumber: submissionData.sequenceNumber,
    });

    // Add file to state
    setFiles(prev => [
      ...prev,
      {
        name: newFileName,
        path: fullPath,
        size: 0,
        type: newFileName.endsWith('.pdf') ? 'application/pdf' : 'text/plain',
        lastModified: new Date().toISOString(),
        status: validation.valid ? 'valid' : 'warning',
        isNew: true,
      },
    ]);

    // Add validation results if needed
    if (!validation.valid) {
      setValidationResults(prev => [
        ...prev,
        {
          type: 'warning',
          message: `File "${newFileName}" has naming issues: ${validation.errors.join(', ')}`,
          path: fullPath,
        },
      ]);
    }

    // Reset and close dialog
    setNewFileName('');
    setShowAddFileDialog(false);
  };

  // Validate the entire submission
  const validateSubmission = () => {
    setIsValidating(true);
    setValidationProgress(0);
    setValidationResults([]);

    // Start with basic checks
    const results = [];

    // Check required metadata
    if (!submissionData.submissionId) {
      results.push({
        type: 'error',
        message: 'Submission ID is required',
        path: 'metadata',
      });
    }

    if (!submissionData.applicationNumber) {
      results.push({
        type: 'warning',
        message: 'Application Number is recommended',
        path: 'metadata',
      });
    }

    if (!submissionData.applicant) {
      results.push({
        type: 'error',
        message: 'Applicant name is required',
        path: 'metadata',
      });
    }

    if (!submissionData.productName) {
      results.push({
        type: 'error',
        message: 'Product name is required',
        path: 'metadata',
      });
    }

    // Simulate progressive validation
    setValidationProgress(10);

    // Check required files in Module 1
    const m1Files = files.filter(f => f.path.startsWith('m1/'));
    if (m1Files.length === 0) {
      results.push({
        type: 'warning',
        message: 'No files found in Module 1',
        path: 'm1',
      });
    }

    // Verify if there's a module 1 regional XML file
    const hasM1RegionalXml = files.some(
      f => f.path.startsWith(`m1/${submissionData.regionCode}`) && f.name.endsWith('.xml')
    );

    if (!hasM1RegionalXml) {
      results.push({
        type: 'error',
        message: `Required Module 1 regional XML file is missing for ${submissionData.regionCode.toUpperCase()}`,
        path: `m1/${submissionData.regionCode}`,
      });
    }

    setValidationProgress(25);

    // Simulate further validation steps with delays for UX
    setTimeout(() => {
      setValidationProgress(50);

      // Check directory structure
      checkDirectoryStructure(results);

      setTimeout(() => {
        setValidationProgress(75);

        // Validate each file
        validateFiles(results);

        setTimeout(() => {
          setValidationProgress(100);
          setValidationResults(results);
          setIsValidating(false);
        }, 500);
      }, 500);
    }, 500);
  };

  // Check directory structure for completeness
  const checkDirectoryStructure = results => {
    // Get all required directories
    const requiredDirectories = createEctdFolderStructure();

    // Get all directories currently in the submission
    const submissionDirectories = new Set();

    // Extract all directories from file paths
    files.forEach(file => {
      const pathParts = file.path.split('/');
      let currentPath = '';

      for (let i = 0; i < pathParts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${pathParts[i]}` : pathParts[i];
        submissionDirectories.add(currentPath);
      }
    });

    // Check for any missing critical directories
    const criticalDirectories = [
      'm1',
      `m1/${submissionData.regionCode}`,
      'm2/23-qos',
      'm2/25-clin-over',
      'm3/32-body-data',
    ];

    criticalDirectories.forEach(dir => {
      if (!submissionDirectories.has(dir)) {
        results.push({
          type: 'warning',
          message: `Critical directory "${dir}" is missing or empty`,
          path: dir,
        });
      }
    });
  };

  // Validate all files in the submission
  const validateFiles = results => {
    files.forEach(file => {
      // Skip XML files as they're validated separately
      if (file.name.endsWith('.xml')) return;

      // Check file naming based on location
      const parentPath = file.path.substring(0, file.path.lastIndexOf('/'));
      const sectionId = extractSectionFromPath(parentPath);

      if (sectionId) {
        const validation = validateEctdFileName(file.name, sectionId, {
          sequenceNumber: submissionData.sequenceNumber,
        });

        if (!validation.valid) {
          results.push({
            type: 'warning',
            message: `File "${file.name}" in section ${sectionId}: ${validation.errors.join(', ')}`,
            path: file.path,
          });
        }
      }

      // Check file path validity
      const pathValidation = validateEctdFilePath(file.path);
      if (!pathValidation.valid) {
        results.push({
          type: 'error',
          message: `Invalid path for file "${file.name}": ${pathValidation.errors.join(', ')}`,
          path: file.path,
        });
      }
    });
  };

  // Generate index.xml file
  const generateIndexXml = () => {
    const xml = generateEctdIndexXml({
      submissionId: submissionData.submissionId,
      submissionType: submissionData.submissionType,
      applicationNumber: submissionData.applicationNumber,
      regionCode: submissionData.regionCode,
      sequenceNumber: submissionData.sequenceNumber,
      applicant: submissionData.applicant,
      productName: submissionData.productName,
      dtdVersion: submissionData.dtdVersion,
    });

    // Add the XML file to the list of files
    setFiles(prev => [
      ...prev,
      {
        name: 'index.xml',
        path: 'index.xml',
        size: xml.length,
        type: 'text/xml',
        lastModified: new Date().toISOString(),
        status: 'valid',
        isGenerated: true,
      },
    ]);

    // Store the content
    setFileContents(prev => ({
      ...prev,
      'index.xml': xml,
    }));

    // Show success message
    setValidationResults(prev => [
      ...prev,
      {
        type: 'success',
        message: 'index.xml file generated successfully',
        path: 'index.xml',
      },
    ]);
  };

  // Export the submission
  const exportSubmission = () => {
    // Validate first
    validateSubmission();

    // Create a simple export summary for demonstration
    const summary = {
      metadata: submissionData,
      fileCount: files.length,
      modules: {
        m1: files.filter(f => f.path.startsWith('m1/')).length,
        m2: files.filter(f => f.path.startsWith('m2/')).length,
        m3: files.filter(f => f.path.startsWith('m3/')).length,
        m4: files.filter(f => f.path.startsWith('m4/')).length,
        m5: files.filter(f => f.path.startsWith('m5/')).length,
      },
      validationStatus:
        validationResults.filter(r => r.type === 'error').length === 0 ? 'PASS' : 'FAIL',
    };

    // In a real implementation, this would package the files or send to a server
    console.log('Exporting submission:', summary);

    // Add an information message to validation results
    setValidationResults(prev => [
      ...prev,
      {
        type: 'info',
        message: 'Submission exported successfully',
        path: 'export',
      },
    ]);
  };

  // Recursive function to render the directory tree
  const renderDirectoryTree = (node, depth = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const filesInNode = files.filter(f => {
      const filePath = f.path;
      const dirPath = node.name;

      // Match files directly in this directory (not in subdirectories)
      const regex = new RegExp(`^${dirPath}/[^/]+$`);
      return regex.test(filePath);
    });

    return (
      <div key={node.name} className="text-sm">
        <div
          className={`py-1 pl-${depth * 4} pr-2 flex items-center hover:bg-gray-100 cursor-pointer ${selectedNode && selectedNode.name === node.name ? 'bg-blue-50' : ''}`}
          onClick={() => setSelectedNode(node)}
        >
          {hasChildren ? (
            <FolderTree className="h-4 w-4 text-orange-500 mr-2" />
          ) : (
            <Folder className="h-4 w-4 text-orange-500 mr-2" />
          )}
          <span className="flex-1 truncate">{node.label || node.name}</span>
          {filesInNode.length > 0 && (
            <Badge variant="outline" className="ml-2">
              {filesInNode.length}
            </Badge>
          )}
        </div>

        {hasChildren && (
          <div className={`pl-${depth > 0 ? 4 : 2}`}>
            {node.children.map(child => renderDirectoryTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Render the metadata form
  const renderMetadataForm = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="submissionId">
              Submission ID <span className="text-red-500">*</span>
            </Label>
            <Input
              id="submissionId"
              value={submissionData.submissionId}
              onChange={e => handleMetadataChange('submissionId', e.target.value)}
              placeholder="e.g., NDA123456"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="submissionType">Submission Type</Label>
            <Select
              value={submissionData.submissionType}
              onValueChange={value => handleMetadataChange('submissionType', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select submission type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">Original</SelectItem>
                <SelectItem value="amendment">Amendment</SelectItem>
                <SelectItem value="supplement">Supplement</SelectItem>
                <SelectItem value="variation">Variation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="applicationNumber">Application Number</Label>
            <Input
              id="applicationNumber"
              value={submissionData.applicationNumber}
              onChange={e => handleMetadataChange('applicationNumber', e.target.value)}
              placeholder="e.g., NDA123456"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="applicant">
              Applicant <span className="text-red-500">*</span>
            </Label>
            <Input
              id="applicant"
              value={submissionData.applicant}
              onChange={e => handleMetadataChange('applicant', e.target.value)}
              placeholder="Company name"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="productName">
              Product Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="productName"
              value={submissionData.productName}
              onChange={e => handleMetadataChange('productName', e.target.value)}
              placeholder="Product name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agency">Regulatory Agency</Label>
            <Select
              value={submissionData.agency}
              onValueChange={value => handleMetadataChange('agency', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select agency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FDA">FDA (United States)</SelectItem>
                <SelectItem value="EMA">EMA (European Union)</SelectItem>
                <SelectItem value="PMDA">PMDA (Japan)</SelectItem>
                <SelectItem value="Health Canada">Health Canada</SelectItem>
                <SelectItem value="MHRA">MHRA (United Kingdom)</SelectItem>
                <SelectItem value="TGA">TGA (Australia)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="regionCode">Region Code</Label>
            <Select
              value={submissionData.regionCode}
              onValueChange={value => handleMetadataChange('regionCode', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select region code" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="us">US</SelectItem>
                <SelectItem value="eu">EU</SelectItem>
                <SelectItem value="jp">JP</SelectItem>
                <SelectItem value="ca">CA</SelectItem>
                <SelectItem value="ch">CH</SelectItem>
                <SelectItem value="au">AU</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sequenceNumber">Sequence Number</Label>
            <Input
              id="sequenceNumber"
              value={submissionData.sequenceNumber}
              onChange={e => handleMetadataChange('sequenceNumber', e.target.value)}
              placeholder="e.g., 0000"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-2">
        <Button onClick={validateSubmission}>Validate Metadata</Button>
      </div>
    </div>
  );

  // Render the structure tab
  const renderStructureTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader className="py-3">
            <CardTitle className="text-base">Directory Structure</CardTitle>
            <CardDescription>eCTD folder structure</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px] p-2">
              {renderDirectoryTree(submissionStructure)}
            </ScrollArea>
          </CardContent>
          <CardFooter className="bg-slate-50 border-t p-3">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => setShowAddFileDialog(true)}
              disabled={!selectedNode}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add File
            </Button>
          </CardFooter>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="py-3">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-base">Content</CardTitle>
                <CardDescription>
                  {selectedNode
                    ? selectedNode.label || selectedNode.name
                    : 'Select a directory to view its content'}
                </CardDescription>
              </div>
              {selectedNode && (
                <div>
                  <input
                    type="file"
                    id="file-upload"
                    multiple
                    className="hidden"
                    onChange={e => handleFileUpload(e, selectedNode.name)}
                  />
                  <label htmlFor="file-upload">
                    <Button variant="outline" size="sm" asChild>
                      <span>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Files
                      </span>
                    </Button>
                  </label>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {selectedNode ? (
              <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Modified</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files
                      .filter(file => {
                        const filePath = file.path;
                        const dirPath = selectedNode.name;
                        const regex = new RegExp(`^${dirPath}/[^/]+$`);
                        return regex.test(filePath);
                      })
                      .map(file => (
                        <TableRow key={file.path}>
                          <TableCell className="font-medium">{file.name}</TableCell>
                          <TableCell>
                            {file.size > 0 ? Math.round(file.size / 1024) + ' KB' : 'Empty'}
                          </TableCell>
                          <TableCell>{new Date(file.lastModified).toLocaleDateString()}</TableCell>
                          <TableCell>
                            {file.status === 'valid' && (
                              <Check className="h-4 w-4 text-green-500" />
                            )}
                            {file.status === 'warning' && (
                              <AlertCircle className="h-4 w-4 text-amber-500" />
                            )}
                            {file.status === 'error' && <X className="h-4 w-4 text-red-500" />}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>

                {files.filter(file => {
                  const filePath = file.path;
                  const dirPath = selectedNode.name;
                  const regex = new RegExp(`^${dirPath}/[^/]+$`);
                  return regex.test(filePath);
                }).length === 0 && (
                  <div className="py-8 text-center text-gray-500">No files in this directory</div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">
                Select a directory to view its content
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  // Render the validation tab
  const renderValidationTab = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Submission Validation</CardTitle>
              <CardDescription>
                Validate your submission against eCTD v3.2.2 requirements
              </CardDescription>
            </div>
            <div className="flex space-x-2">
              <Button onClick={generateIndexXml} variant="outline">
                <FileText className="h-4 w-4 mr-2" />
                Generate index.xml
              </Button>
              <Button onClick={validateSubmission} disabled={isValidating}>
                {isValidating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Validate Submission
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isValidating && (
            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-sm">
                <span>Validating submission...</span>
                <span>{validationProgress}%</span>
              </div>
              <Progress value={validationProgress} />
            </div>
          )}

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium mb-2">Validation Results</h3>
              {validationResults.length > 0 ? (
                <div className="space-y-2">
                  {validationResults.map((result, index) => (
                    <div
                      key={index}
                      className={`p-3 border rounded-md ${
                        result.type === 'error'
                          ? 'bg-red-50 border-red-200'
                          : result.type === 'warning'
                            ? 'bg-amber-50 border-amber-200'
                            : result.type === 'success'
                              ? 'bg-green-50 border-green-200'
                              : 'bg-blue-50 border-blue-200'
                      }`}
                    >
                      <div className="flex items-start">
                        {result.type === 'error' && (
                          <X className="h-4 w-4 text-red-500 mt-0.5 mr-2" />
                        )}
                        {result.type === 'warning' && (
                          <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 mr-2" />
                        )}
                        {result.type === 'success' && (
                          <Check className="h-4 w-4 text-green-500 mt-0.5 mr-2" />
                        )}
                        {result.type === 'info' && (
                          <Info className="h-4 w-4 text-blue-500 mt-0.5 mr-2" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{result.message}</p>
                          {result.path && (
                            <p className="text-xs text-gray-500 mt-1">Path: {result.path}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                !isValidating && (
                  <div className="text-center py-4 text-gray-500">
                    No validation results yet. Click "Validate Submission" to begin.
                  </div>
                )
              )}
            </div>

            <div className="flex justify-end">
              <Button
                onClick={exportSubmission}
                disabled={
                  isValidating ||
                  validationResults.filter(r => r.type === 'error').length > 0 ||
                  validationResults.length === 0
                }
              >
                <PackageOpen className="h-4 w-4 mr-2" />
                Export Submission
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>eCTD Submission Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium mb-3">Submission Information</h3>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Submission ID</TableCell>
                    <TableCell>{submissionData.submissionId || '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Application Number</TableCell>
                    <TableCell>{submissionData.applicationNumber || '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Product Name</TableCell>
                    <TableCell>{submissionData.productName || '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Agency</TableCell>
                    <TableCell>{submissionData.agency || '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Sequence Number</TableCell>
                    <TableCell>{submissionData.sequenceNumber || '—'}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3">Content Summary</h3>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Total Files</TableCell>
                    <TableCell>{files.length}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Module 1 Files</TableCell>
                    <TableCell>{files.filter(f => f.path.startsWith('m1/')).length}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Module 2 Files</TableCell>
                    <TableCell>{files.filter(f => f.path.startsWith('m2/')).length}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Module 3 Files</TableCell>
                    <TableCell>{files.filter(f => f.path.startsWith('m3/')).length}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Module 4 Files</TableCell>
                    <TableCell>{files.filter(f => f.path.startsWith('m4/')).length}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Module 5 Files</TableCell>
                    <TableCell>{files.filter(f => f.path.startsWith('m5/')).length}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Render the help tab
  const renderHelpTab = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>eCTD Submission Guide</CardTitle>
          <CardDescription>How to prepare compliant eCTD submissions</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>What is an eCTD submission?</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-gray-600">
                  The Electronic Common Technical Document (eCTD) is the standard format for
                  submitting applications, amendments, supplements and reports to regulatory
                  agencies. It's organized into five modules:
                </p>
                <ul className="list-disc pl-6 text-sm text-gray-600 mt-2 space-y-1">
                  <li>Module 1: Regional Administrative Information</li>
                  <li>Module 2: Common Technical Document Summaries</li>
                  <li>Module 3: Quality</li>
                  <li>Module 4: Nonclinical Study Reports</li>
                  <li>Module 5: Clinical Study Reports</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger>File Naming Conventions</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-gray-600">
                  eCTD submissions require specific file naming conventions. Key rules include:
                </p>
                <ul className="list-disc pl-6 text-sm text-gray-600 mt-2 space-y-1">
                  <li>Use only a-z, A-Z, 0-9, hyphen, and underscore characters</li>
                  <li>Maximum filename length of 64 characters (including extension)</li>
                  <li>Use lowercase file extensions (.pdf, .xml)</li>
                  <li>Follow region-specific naming patterns for Module 1</li>
                  <li>Include sequence numbers where required</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3">
              <AccordionTrigger>Required XML Files</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-gray-600">
                  Every eCTD submission requires specific XML files:
                </p>
                <ul className="list-disc pl-6 text-sm text-gray-600 mt-2 space-y-1">
                  <li>index.xml - The main index file for the submission</li>
                  <li>Regional XML files for Module 1 (varies by region)</li>
                  <li>MD5 checksum file (md5.txt)</li>
                </ul>
                <p className="text-sm text-gray-600 mt-2">
                  These XML files must conform to the DTD/Schema specified in the eCTD
                  specification.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4">
              <AccordionTrigger>Lifecycle Management</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-gray-600">
                  eCTD uses lifecycle operations to manage documents across submissions:
                </p>
                <ul className="list-disc pl-6 text-sm text-gray-600 mt-2 space-y-1">
                  <li>
                    <strong>new</strong> - First instance of a document
                  </li>
                  <li>
                    <strong>replace</strong> - Completely replaces a previous version
                  </li>
                  <li>
                    <strong>append</strong> - Adds to existing information
                  </li>
                  <li>
                    <strong>delete</strong> - Removes a document from the current view
                  </li>
                </ul>
                <p className="text-sm text-gray-600 mt-2">
                  Each operation is specified in the XML and affects how regulatory agencies view
                  the submission.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5">
              <AccordionTrigger>Common Submission Errors</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-gray-600">Watch out for these common issues:</p>
                <ul className="list-disc pl-6 text-sm text-gray-600 mt-2 space-y-1">
                  <li>Incorrect file naming or placement in the directory structure</li>
                  <li>Invalid PDF formatting (must be PDF 1.4 to 1.7)</li>
                  <li>Missing required XML files or DTD references</li>
                  <li>Improper lifecycle management references</li>
                  <li>Incorrect checksum values</li>
                  <li>Broken hyperlinks or bookmarks in PDFs</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ICH eCTD Specification Resources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border rounded-md p-4">
              <h3 className="text-sm font-medium mb-2">ICH eCTD v3.2.2 Specification</h3>
              <p className="text-sm text-gray-600 mb-2">
                Official ICH specification for eCTD v3.2.2 submissions
              </p>
              <a
                href="https://ich.org/page/ich-electronic-common-technical-document-ectd-v322-specification-and-related-files"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline flex items-center"
              >
                <ArrowRight className="h-3 w-3 mr-1" />
                View Specification
              </a>
            </div>

            <div className="border rounded-md p-4">
              <h3 className="text-sm font-medium mb-2">FDA eCTD Guidance</h3>
              <p className="text-sm text-gray-600 mb-2">
                FDA technical guidance for eCTD submissions
              </p>
              <a
                href="https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/electronic-common-technical-document"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline flex items-center"
              >
                <ArrowRight className="h-3 w-3 mr-1" />
                View FDA Guidance
              </a>
            </div>

            <div className="border rounded-md p-4">
              <h3 className="text-sm font-medium mb-2">EMA eCTD Guidance</h3>
              <p className="text-sm text-gray-600 mb-2">
                European Medicines Agency guidance for eCTD submissions
              </p>
              <a
                href="https://www.ema.europa.eu/en/human-regulatory/marketing-authorisation/common-technical-document"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline flex items-center"
              >
                <ArrowRight className="h-3 w-3 mr-1" />
                View EMA Guidance
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="container mx-auto py-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">eCTD Submission Builder</h1>
        <p className="text-gray-500 mt-2">
          Prepare and validate regulatory submissions in eCTD v3.2.2 format
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="metadata" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Submission Metadata</span>
            <span className="sm:hidden">Metadata</span>
          </TabsTrigger>
          <TabsTrigger value="structure" className="flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            <span className="hidden sm:inline">Submission Structure</span>
            <span className="sm:hidden">Structure</span>
          </TabsTrigger>
          <TabsTrigger value="validation" className="flex items-center gap-2">
            <Check className="h-4 w-4" />
            <span className="hidden sm:inline">Validation & Export</span>
            <span className="sm:hidden">Validate</span>
          </TabsTrigger>
          <TabsTrigger value="help" className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            <span>Help</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metadata" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Submission Metadata</CardTitle>
              <CardDescription>Enter information about your eCTD submission</CardDescription>
            </CardHeader>
            <CardContent>{renderMetadataForm()}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="structure">{renderStructureTab()}</TabsContent>

        <TabsContent value="validation">{renderValidationTab()}</TabsContent>

        <TabsContent value="help">{renderHelpTab()}</TabsContent>
      </Tabs>

      <Dialog open={showAddFileDialog} onOpenChange={setShowAddFileDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New File</DialogTitle>
            <DialogDescription>
              Create a new file in the selected directory: {selectedNode?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="filename">File Name</Label>
              <Input
                id="filename"
                placeholder="Enter file name (e.g., document.pdf)"
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddFileDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddFile} disabled={!newFileName}>
              Add File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ECTDSubmissionBuilder;

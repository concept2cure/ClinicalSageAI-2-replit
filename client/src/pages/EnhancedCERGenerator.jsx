import React, { useState } from 'react';
import { Link } from 'wouter';
import {
  Beaker,
  FileText,
  Search,
  CheckCircle,
  AlertCircle,
  Package,
  Globe,
  ArrowRight,
  FileDown,
  Bot,
  PlusCircle,
  ChevronDown,
  ChevronRight,
  FilterX,
  Filter,
  Calendar,
  BarChart,
  Database,
  RefreshCw,
  Clock,
  ArrowUpRight,
  Zap,
} from 'lucide-react';

// UI Components for our enhanced generator
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Sample data for our regulatory module
const recentReports = [
  {
    id: 'CER-2024-0412',
    title: 'Oncology Drug X Safety Report',
    type: 'FDA CER',
    date: 'April 18, 2024',
    status: 'Complete',
    link: '/cer-generator/report/1',
    product: 'Oncology Drug X (NDC: 12345-678-90)',
    lastUpdated: '2 days ago',
    reviewStatus: 'Approved',
    alerts: 0,
  },
  {
    id: 'CER-2024-0397',
    title: 'Antibody Therapy Clinical Evaluation',
    type: 'EMA CER',
    date: 'April 15, 2024',
    status: 'In Review',
    link: '/cer-generator/report/2',
    product: 'mAB-2023 (NDC: 45678-123-45)',
    lastUpdated: '5 days ago',
    reviewStatus: 'Pending Approval',
    alerts: 2,
  },
  {
    id: 'CER-2024-0371',
    title: 'Rare Disease Treatment Assessment',
    type: 'FDA CER',
    date: 'April 10, 2024',
    status: 'Complete',
    link: '/cer-generator/report/3',
    product: 'RareTx-01 (NDC: 98765-432-10)',
    lastUpdated: '1 week ago',
    reviewStatus: 'Approved',
    alerts: 0,
  },
  {
    id: 'CER-2024-0368',
    title: 'Cardiovascular Device Safety Evaluation',
    type: 'FDA + EMA CER',
    date: 'April 8, 2024',
    status: 'In Progress',
    link: '/cer-generator/report/4',
    product: 'CardioStent V2 (UDI: ABC123456789)',
    lastUpdated: '2 hours ago',
    reviewStatus: 'Draft',
    alerts: 1,
  },
  {
    id: 'CER-2024-0352',
    title: 'Diabetes Medication Post-Market Analysis',
    type: 'Health Canada CER',
    date: 'April 3, 2024',
    status: 'Complete',
    link: '/cer-generator/report/5',
    product: 'GlucoRegulate (DIN: HC-12345-6)',
    lastUpdated: '2 weeks ago',
    reviewStatus: 'Approved',
    alerts: 0,
  },
];

const registeredProducts = [
  {
    id: 1,
    name: 'Oncology Drug X',
    type: 'Drug',
    identifier: 'NDC: 12345-678-90',
    approvalDate: 'June 15, 2022',
    lastReportDate: 'April 18, 2024',
    reportsCount: 3,
  },
  {
    id: 2,
    name: 'mAB-2023',
    type: 'Biologic',
    identifier: 'NDC: 45678-123-45',
    approvalDate: 'November 30, 2023',
    lastReportDate: 'April 15, 2024',
    reportsCount: 1,
  },
  {
    id: 3,
    name: 'RareTx-01',
    type: 'Drug',
    identifier: 'NDC: 98765-432-10',
    approvalDate: 'August 5, 2021',
    lastReportDate: 'April 10, 2024',
    reportsCount: 4,
  },
  {
    id: 4,
    name: 'CardioStent V2',
    type: 'Device',
    identifier: 'UDI: ABC123456789',
    approvalDate: 'January 22, 2023',
    lastReportDate: 'April 8, 2024',
    reportsCount: 2,
  },
  {
    id: 5,
    name: 'GlucoRegulate',
    type: 'Drug',
    identifier: 'DIN: HC-12345-6',
    approvalDate: 'March 14, 2022',
    lastReportDate: 'April 3, 2024',
    reportsCount: 3,
  },
];

const cerTemplates = [
  {
    id: 'template-fda',
    name: 'FDA Clinical Evaluation Report',
    description:
      'Standardized CER template optimized for FDA submissions with integrated clinical data presentation.',
    lastUpdated: 'March 15, 2024',
    sections: 8,
    estimatedCompletionTime: '15-20 minutes',
    popularFor: ['Drugs', 'Biologics', 'Combination Products'],
  },
  {
    id: 'template-ema',
    name: 'EMA Clinical Evaluation Report',
    description:
      'EU MDR compliant clinical evaluation report template with MEDDEV guidance integration.',
    lastUpdated: 'April 1, 2024',
    sections: 10,
    estimatedCompletionTime: '20-25 minutes',
    popularFor: ['Medical Devices', 'In Vitro Diagnostics', 'Software as Medical Device'],
  },
  {
    id: 'template-hc',
    name: 'Health Canada Clinical Report',
    description:
      'Clinical evaluation reporting tailored for Health Canada submissions and regulatory requirements.',
    lastUpdated: 'February 28, 2024',
    sections: 7,
    estimatedCompletionTime: '15-20 minutes',
    popularFor: ['Drugs', 'Natural Health Products', 'Medical Devices'],
  },
  {
    id: 'template-pmda',
    name: 'PMDA Clinical Evaluation Report',
    description:
      'Japanese regulatory authority compliant CER format with region-specific requirements.',
    lastUpdated: 'March 10, 2024',
    sections: 9,
    estimatedCompletionTime: '20-25 minutes',
    popularFor: ['Pharmaceuticals', 'Medical Devices', 'Regenerative Products'],
  },
  {
    id: 'template-multi',
    name: 'Multi-Region Harmonized Report',
    description:
      'Single template designed to satisfy FDA, EMA, Health Canada, and PMDA requirements simultaneously.',
    lastUpdated: 'April 10, 2024',
    sections: 12,
    estimatedCompletionTime: '25-30 minutes',
    popularFor: ['Global Products', 'Simultaneous Submissions', 'Harmonized Documentation'],
  },
  {
    id: 'template-custom',
    name: 'Custom CER Template',
    description:
      'Create a customized clinical evaluation report with your specific requirements and structure.',
    lastUpdated: 'April 15, 2024',
    sections: 'Variable',
    estimatedCompletionTime: 'Depends on complexity',
    popularFor: ['Specialized Products', 'Novel Therapies', 'Custom Regulatory Pathways'],
  },
];

// Status Badge Component
const StatusBadge = ({ status }) => {
  let color = '';
  switch (status) {
    case 'Complete':
      color = 'bg-green-100 text-green-800 hover:bg-green-100';
      break;
    case 'In Progress':
      color = 'bg-blue-100 text-blue-800 hover:bg-blue-100';
      break;
    case 'In Review':
      color = 'bg-amber-100 text-amber-800 hover:bg-amber-100';
      break;
    case 'Draft':
      color = 'bg-gray-100 text-gray-800 hover:bg-gray-100';
      break;
    default:
      color = 'bg-gray-100 text-gray-800 hover:bg-gray-100';
  }

  return <Badge className={color}>{status}</Badge>;
};

// Template Card Component
const TemplateCard = ({ template, onSelect }) => {
  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onSelect(template)}
    >
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          <FileText className="h-5 w-5 text-rose-600 mr-2" />
          {template.name}
        </CardTitle>
        <CardDescription>{template.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Last Updated:</span>
            <span className="font-medium">{template.lastUpdated}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Sections:</span>
            <span className="font-medium">{template.sections}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Est. Time:</span>
            <span className="font-medium">{template.estimatedCompletionTime}</span>
          </div>

          <div className="pt-2">
            <p className="text-xs text-gray-500 mb-1">Popular for:</p>
            <div className="flex flex-wrap gap-1">
              {template.popularFor.map((item, idx) => (
                <Badge key={idx} variant="outline" className="text-xs bg-gray-50">
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t pt-3">
        <Button className="w-full" onClick={() => onSelect(template)}>
          Use Template
        </Button>
      </CardFooter>
    </Card>
  );
};

// New CER Wizard Component
const NewCERWizard = ({ selectedTemplate, selectedProduct, onCancel, onComplete }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [reportConfig, setReportConfig] = useState({
    title: selectedProduct ? `${selectedTemplate.name} for ${selectedProduct.name}` : '',
    dateRange: 'last-12-months',
    customStartDate: '',
    customEndDate: '',
    includeComparisons: true,
    detectOutliers: true,
    includeLiterature: true,
    generateVisualizations: true,
    regulatoryRecommendations: true,
  });

  const handleConfigChange = (field, value) => {
    setReportConfig({
      ...reportConfig,
      [field]: value,
    });
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      setLoading(true);
      // Simulate API call to generate report
      setTimeout(() => {
        setLoading(false);
        onComplete({
          id: `CER-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
          title: reportConfig.title,
          product: selectedProduct.name,
          template: selectedTemplate.name,
          dateRange: reportConfig.dateRange,
          status: 'Draft',
        });
      }, 3000);
    }
  };

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader className="border-b">
        <CardTitle className="text-xl">Generate New Clinical Evaluation Report</CardTitle>
        <CardDescription>
          Complete the following steps to configure and generate your CER
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            <div className="text-sm font-medium">
              Step {step} of 3:{' '}
              {step === 1
                ? 'Basic Information'
                : step === 2
                  ? 'Report Configuration'
                  : 'Review & Generate'}
            </div>
            <button className="text-sm text-rose-600" onClick={onCancel}>
              Cancel
            </button>
          </div>
          <Progress value={(step / 3) * 100} className="h-2" />
        </div>

        {/* Step 1: Basic Information */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Report Title</label>
              <Input
                value={reportConfig.title}
                onChange={e => handleConfigChange('title', e.target.value)}
                placeholder="Enter a title for your CER"
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Selected Template
                </label>
                <div className="flex items-center p-3 border rounded-md bg-gray-50">
                  <FileText className="h-5 w-5 text-rose-600 mr-2" />
                  <span className="text-sm">{selectedTemplate.name}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Selected Product
                </label>
                <div className="flex items-center p-3 border rounded-md bg-gray-50">
                  <Package className="h-5 w-5 text-rose-600 mr-2" />
                  <span className="text-sm">{selectedProduct.name}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
              <Select
                value={reportConfig.dateRange}
                onValueChange={value => handleConfigChange('dateRange', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last-12-months">Last 12 months</SelectItem>
                  <SelectItem value="last-24-months">Last 24 months</SelectItem>
                  <SelectItem value="last-36-months">Last 36 months</SelectItem>
                  <SelectItem value="year-to-date">Year to date</SelectItem>
                  <SelectItem value="custom">Custom date range</SelectItem>
                </SelectContent>
              </Select>

              {reportConfig.dateRange === 'custom' && (
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                    <Input
                      type="date"
                      value={reportConfig.customStartDate}
                      onChange={e => handleConfigChange('customStartDate', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">End Date</label>
                    <Input
                      type="date"
                      value={reportConfig.customEndDate}
                      onChange={e => handleConfigChange('customEndDate', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Report Configuration */}
        {step === 2 && (
          <div className="space-y-6">
            <h3 className="font-medium">Report Options</h3>

            <div className="space-y-3">
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="includeComparisons"
                  checked={reportConfig.includeComparisons}
                  onCheckedChange={checked => handleConfigChange('includeComparisons', checked)}
                />
                <div>
                  <label
                    htmlFor="includeComparisons"
                    className="text-sm font-medium text-gray-700 cursor-pointer"
                  >
                    Include comparative analysis
                  </label>
                  <p className="text-xs text-gray-500">
                    Compare your product against similar products in the same class
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="detectOutliers"
                  checked={reportConfig.detectOutliers}
                  onCheckedChange={checked => handleConfigChange('detectOutliers', checked)}
                />
                <div>
                  <label
                    htmlFor="detectOutliers"
                    className="text-sm font-medium text-gray-700 cursor-pointer"
                  >
                    Detect statistical outliers and anomalies
                  </label>
                  <p className="text-xs text-gray-500">
                    Highlight unusual patterns or deviations in safety data
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="includeLiterature"
                  checked={reportConfig.includeLiterature}
                  onCheckedChange={checked => handleConfigChange('includeLiterature', checked)}
                />
                <div>
                  <label
                    htmlFor="includeLiterature"
                    className="text-sm font-medium text-gray-700 cursor-pointer"
                  >
                    Include literature and clinical trial data
                  </label>
                  <p className="text-xs text-gray-500">
                    Pull relevant published studies from PubMed and ClinicalTrials.gov
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="generateVisualizations"
                  checked={reportConfig.generateVisualizations}
                  onCheckedChange={checked => handleConfigChange('generateVisualizations', checked)}
                />
                <div>
                  <label
                    htmlFor="generateVisualizations"
                    className="text-sm font-medium text-gray-700 cursor-pointer"
                  >
                    Generate data visualizations
                  </label>
                  <p className="text-xs text-gray-500">
                    Create charts and graphs to visualize key metrics and trends
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="regulatoryRecommendations"
                  checked={reportConfig.regulatoryRecommendations}
                  onCheckedChange={checked =>
                    handleConfigChange('regulatoryRecommendations', checked)
                  }
                />
                <div>
                  <label
                    htmlFor="regulatoryRecommendations"
                    className="text-sm font-medium text-gray-700 cursor-pointer"
                  >
                    Include regulatory recommendations
                  </label>
                  <p className="text-xs text-gray-500">
                    AI-powered suggestions for addressing potential regulatory concerns
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <Card className="bg-blue-50 border-blue-100">
                <CardContent className="p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0 mr-3">
                      <Bot className="h-8 w-8 text-blue-500" />
                    </div>
                    <div>
                      <h4 className="font-medium text-blue-900 mb-1">AI Assistance Available</h4>
                      <p className="text-sm text-blue-700">
                        Our AI will help analyze data patterns, suggest appropriate narrative, and
                        ensure regulatory compliance for your CER. Click "Use AI Assistance" during
                        generation for enhanced results.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Step 3: Review & Generate */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="font-medium mb-3">Report Summary</h3>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="text-gray-500">Report Title:</div>
                <div className="font-medium">{reportConfig.title}</div>

                <div className="text-gray-500">Template:</div>
                <div className="font-medium">{selectedTemplate.name}</div>

                <div className="text-gray-500">Product:</div>
                <div className="font-medium">
                  {selectedProduct.name} ({selectedProduct.identifier})
                </div>

                <div className="text-gray-500">Date Range:</div>
                <div className="font-medium">
                  {reportConfig.dateRange === 'custom'
                    ? `${reportConfig.customStartDate} to ${reportConfig.customEndDate}`
                    : reportConfig.dateRange.replace(/-/g, ' ')}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium">Enabled Options:</div>
              <div className="flex flex-wrap gap-2">
                {reportConfig.includeComparisons && (
                  <Badge variant="outline" className="bg-gray-50">
                    Comparative Analysis
                  </Badge>
                )}
                {reportConfig.detectOutliers && (
                  <Badge variant="outline" className="bg-gray-50">
                    Outlier Detection
                  </Badge>
                )}
                {reportConfig.includeLiterature && (
                  <Badge variant="outline" className="bg-gray-50">
                    Literature Data
                  </Badge>
                )}
                {reportConfig.generateVisualizations && (
                  <Badge variant="outline" className="bg-gray-50">
                    Data Visualizations
                  </Badge>
                )}
                {reportConfig.regulatoryRecommendations && (
                  <Badge variant="outline" className="bg-gray-50">
                    Regulatory Recommendations
                  </Badge>
                )}
              </div>
            </div>

            <div className="pt-2">
              <Card className="bg-green-50 border-green-100">
                <CardContent className="p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0 mr-3">
                      <CheckCircle className="h-8 w-8 text-green-500" />
                    </div>
                    <div>
                      <h4 className="font-medium text-green-900 mb-1">Ready to Generate</h4>
                      <p className="text-sm text-green-700">
                        Your Clinical Evaluation Report is ready to be generated. The system will
                        pull all relevant data based on your configuration and create a
                        comprehensive report in less than 2 minutes.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between border-t pt-4">
        {step > 1 ? (
          <Button variant="outline" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        ) : (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}

        <Button onClick={handleNext} disabled={loading}>
          {loading ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Generating Report...
            </>
          ) : step < 3 ? (
            <>Next</>
          ) : (
            <>Generate Report</>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

// Main regulatory module component
export default function EnhancedCERGenerator() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showNewCERWizard, setShowNewCERWizard] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Filtered reports based on search and status filter
  const filteredReports = recentReports.filter(report => {
    const matchesSearch =
      searchQuery === '' ||
      report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.product.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus === 'all' || report.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  // Handle template selection
  const handleTemplateSelect = template => {
    setSelectedTemplate(template);
    setActiveTab('products');
  };

  // Handle product selection and start wizard
  const handleProductSelect = product => {
    setSelectedProduct(product);
    setShowNewCERWizard(true);
  };

  // Handle wizard completion
  const handleWizardComplete = newReport => {
    // In a real implementation, this would call an API to save the new report
    setShowNewCERWizard(false);
    setSelectedTemplate(null);
    setSelectedProduct(null);
    setActiveTab('recent');

    // Show success message or redirect to the new report
    console.log('New report created:', newReport);
  };

  return (
    <div className="bg-white min-h-screen">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-rose-800 to-rose-900 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center">
                <Beaker className="mr-3 h-7 w-7" />
                Clinical Evaluation Report Generator
              </h1>
              <p className="text-rose-100 max-w-3xl mt-2">
                Create comprehensive, regulation-compliant clinical evaluation reports in minutes
                with our AI-powered platform. Seamlessly analyze post-market surveillance data and
                generate reports for FDA, EMA, Health Canada, and more.
              </p>
            </div>

            {!showNewCERWizard && (
              <Button
                className="bg-white text-rose-800 hover:bg-rose-50"
                onClick={() => setActiveTab('templates')}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Create New CER
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {showNewCERWizard ? (
          <NewCERWizard
            selectedTemplate={selectedTemplate}
            selectedProduct={selectedProduct}
            onCancel={() => {
              setShowNewCERWizard(false);
              setActiveTab('dashboard');
            }}
            onComplete={handleWizardComplete}
          />
        ) : (
          <>
            {/* Tabs Navigation */}
            <Tabs
              defaultValue={activeTab}
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="dashboard">
                  <BarChart className="mr-2 h-4 w-4" />
                  Dashboard
                </TabsTrigger>
                <TabsTrigger value="templates">
                  <FileText className="mr-2 h-4 w-4" />
                  Templates
                </TabsTrigger>
                <TabsTrigger value="products">
                  <Package className="mr-2 h-4 w-4" />
                  Products
                </TabsTrigger>
                <TabsTrigger value="recent">
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Recent Reports
                </TabsTrigger>
              </TabsList>

              {/* Dashboard Tab */}
              <TabsContent value="dashboard" className="mt-6">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Regulatory Dashboard</h2>
                  <p className="text-gray-600">
                    Monitor your regulatory evaluation reports, track status, and identify actionable
                    insights.
                  </p>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-500">Total Reports</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{recentReports.length}</div>
                      <p className="text-xs text-green-600 mt-1">+2 in the last 30 days</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-500">Registered Products</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{registeredProducts.length}</div>
                      <p className="text-xs text-green-600 mt-1">+1 in the last 30 days</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-500">
                        Reports Pending Review
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">2</div>
                      <p className="text-xs text-amber-600 mt-1">Oldest: 5 days ago</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-500">Data Sources</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">4</div>
                      <p className="text-xs text-blue-600 mt-1">All sources updated</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Recent Reports Quick View */}
                <div className="mb-8">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Recent Reports</h3>
                    <Button variant="outline" size="sm" onClick={() => setActiveTab('recent')}>
                      View All
                    </Button>
                  </div>

                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Report ID</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentReports.slice(0, 3).map(report => (
                          <TableRow key={report.id}>
                            <TableCell className="font-medium">{report.id}</TableCell>
                            <TableCell>{report.title}</TableCell>
                            <TableCell>{report.product}</TableCell>
                            <TableCell>{report.date}</TableCell>
                            <TableCell>
                              <StatusBadge status={report.status} />
                            </TableCell>
                            <TableCell className="text-right">
                              <Link to={report.link}>
                                <Button variant="ghost" size="sm">
                                  View
                                </Button>
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </div>

                {/* Quick Actions */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setActiveTab('templates')}
                    >
                      <CardContent className="p-6 flex items-start">
                        <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center mr-4">
                          <PlusCircle className="h-5 w-5 text-rose-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900 mb-1">Create New Report</h4>
                          <p className="text-sm text-gray-600">
                            Start a new CER for any registered product
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="hover:bg-gray-50 cursor-pointer transition-colors">
                      <CardContent className="p-6 flex items-start">
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center mr-4">
                          <RefreshCw className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900 mb-1">Update Data Sources</h4>
                          <p className="text-sm text-gray-600">
                            Refresh data from FDA, EMA and other sources
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="hover:bg-gray-50 cursor-pointer transition-colors">
                      <CardContent className="p-6 flex items-start">
                        <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center mr-4">
                          <FileDown className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900 mb-1">Batch Export</h4>
                          <p className="text-sm text-gray-600">
                            Export multiple reports for regulatory submission
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              {/* Templates Tab */}
              <TabsContent value="templates" className="mt-6">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">CER Templates</h2>
                  <p className="text-gray-600">
                    Select a template to start generating your clinical evaluation report.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {cerTemplates.map(template => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onSelect={handleTemplateSelect}
                    />
                  ))}
                </div>
              </TabsContent>

              {/* Products Tab */}
              <TabsContent value="products" className="mt-6">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {selectedTemplate
                      ? `Select a Product for ${selectedTemplate.name}`
                      : 'Registered Products'}
                  </h2>
                  <p className="text-gray-600">
                    {selectedTemplate
                      ? 'Choose the product you want to generate a report for.'
                      : 'View and manage products registered in the system.'}
                  </p>
                </div>

                <div className="mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search products..."
                      className="pl-10"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Identifier</TableHead>
                        <TableHead>Approval Date</TableHead>
                        <TableHead>Last Report</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registeredProducts.map(product => (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell>{product.type}</TableCell>
                          <TableCell>{product.identifier}</TableCell>
                          <TableCell>{product.approvalDate}</TableCell>
                          <TableCell>{product.lastReportDate}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant={selectedTemplate ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handleProductSelect(product)}
                            >
                              {selectedTemplate ? 'Select' : 'View Reports'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>

                {selectedTemplate && (
                  <div className="mt-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="flex items-start">
                      <div className="flex-shrink-0 mr-3">
                        <InfoIcon className="h-5 w-5 text-blue-500" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">
                          Selected Template: {selectedTemplate.name}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">{selectedTemplate.description}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => setSelectedTemplate(null)}
                        >
                          Change Template
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Recent Reports Tab */}
              <TabsContent value="recent" className="mt-6">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Recent Reports</h2>
                  <p className="text-gray-600">
                    View, manage, and export your clinical evaluation reports.
                  </p>
                </div>

                {/* Search and Filters */}
                <div className="mb-6 flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search reports..."
                      className="pl-10"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="Complete">Complete</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="In Review">In Review</SelectItem>
                        <SelectItem value="Draft">Draft</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSearchQuery('');
                        setFilterStatus('all');
                      }}
                    >
                      <FilterX className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Reports Table */}
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Report ID</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Alerts</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredReports.length > 0 ? (
                          filteredReports.map(report => (
                            <TableRow key={report.id}>
                              <TableCell className="font-medium">{report.id}</TableCell>
                              <TableCell>{report.title}</TableCell>
                              <TableCell className="max-w-[200px] truncate">
                                {report.product}
                              </TableCell>
                              <TableCell>{report.date}</TableCell>
                              <TableCell>
                                <StatusBadge status={report.status} />
                              </TableCell>
                              <TableCell>
                                {report.alerts > 0 ? (
                                  <Badge variant="destructive">{report.alerts}</Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-green-50">
                                    0
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      Actions
                                      <ChevronDown className="ml-2 h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem>
                                      <FileText className="mr-2 h-4 w-4" />
                                      View Report
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      <FileDown className="mr-2 h-4 w-4" />
                                      Download PDF
                                    </DropdownMenuItem>
                                    {report.status !== 'Complete' && (
                                      <DropdownMenuItem>
                                        <ArrowUpRight className="mr-2 h-4 w-4" />
                                        Continue Editing
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem>
                                      <RefreshCw className="mr-2 h-4 w-4" />
                                      Update Data
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center">
                              <div className="flex flex-col items-center justify-center text-gray-500">
                                <AlertCircle className="h-8 w-8 mb-2 text-gray-400" />
                                <p>No reports match your search criteria</p>
                                <Button
                                  variant="link"
                                  className="mt-1"
                                  onClick={() => {
                                    setSearchQuery('');
                                    setFilterStatus('all');
                                  }}
                                >
                                  Clear filters
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                  <CardFooter className="flex justify-between border-t py-4">
                    <div className="text-sm text-gray-500">
                      Showing {filteredReports.length} of {recentReports.length} reports
                    </div>
                    <Button
                      onClick={() => {
                        setActiveTab('templates');
                      }}
                    >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      New Report
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Bottom info banner */}
      <div className="bg-gray-50 border-t border-gray-200 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="mb-4 md:mb-0">
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <Zap className="mr-2 h-5 w-5 text-rose-600" />
                Seamless Integration with Your Regulatory Workflow
              </h3>
              <p className="text-gray-600 mt-1 max-w-2xl">
                The Medical Device & Diagnostics Regulatory Module integrates with our IND
                Accelerator and Submission Builder for a complete regulatory solution.
              </p>
            </div>
            <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-3">
              <Link to="/ind-full-solution">
                <Button variant="outline" className="w-full sm:w-auto">
                  IND Full Solution
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/builder">
                <Button className="w-full sm:w-auto">
                  Submission Builder
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

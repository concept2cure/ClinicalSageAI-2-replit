import React, { useState, useEffect } from 'react';
import {
  FileBarChart2,
  Download,
  FileText,
  Filter,
  Search,
  SlidersHorizontal,
  AlertCircle,
  Calendar,
  Tag,
  ChevronDown,
  ArrowLeft,
  ExternalLink,
  Beaker,
  LineChart,
  PieChart,
  ClipboardCheck,
  Microscope,
  Users,
  Database,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link, useLocation } from 'wouter';

// Example CSR reports
const csrReports = [
  {
    id: 1,
    title: 'Protocol Optimization Report for Phase II Oncology Trials',
    type: 'CSR',
    date: 'April 10, 2025',
    category: 'Clinical',
    description:
      'Detailed analysis of optimal protocol design based on 35+ CSRs from successful oncology trials, with eligibility optimization recommendations.',
    tags: ['Oncology', 'Phase II', 'Eligibility Criteria'],
    featuredImage: 'protocol',
    badgeText: 'Premium',
    badgeVariant: 'default',
    downloadUrl: '/attached_assets/example_reports/clinical/protocol_optimization.pdf',
    previewUrl: '/attached_assets/example_reports/clinical/protocol_optimization.pdf',
  },
  {
    id: 2,
    title: 'Trial Success Prediction Analysis',
    type: 'CSR',
    date: 'April 5, 2025',
    category: 'Biostatistics',
    description:
      'Statistical model predicting trial outcomes with 92% confidence based on historical CSR data, risk factor analysis and recommendations.',
    tags: ['Statistical Modeling', 'Risk Analysis', 'Predictive'],
    featuredImage: 'prediction',
    badgeText: 'ML-Powered',
    badgeVariant: 'default',
    downloadUrl: '/attached_assets/example_reports/clinical/trial_success_prediction.pdf',
    previewUrl: '/attached_assets/example_reports/clinical/trial_success_prediction.pdf',
  },
  {
    id: 3,
    title: 'Strategic Portfolio Analysis Report',
    type: 'CSR',
    date: 'March 28, 2025',
    category: 'Executive',
    description:
      'Executive intelligence report on trial portfolio performance and optimization opportunities based on cross-indication analysis.',
    tags: ['Executive', 'Strategic', 'Competitive'],
    featuredImage: 'strategic',
    badgeText: 'Executive',
    badgeVariant: 'default',
    downloadUrl: '/attached_assets/example_reports/ceo/strategic_portfolio_analysis.pdf',
    previewUrl: '/attached_assets/example_reports/ceo/strategic_portfolio_analysis.pdf',
  },
  {
    id: 4,
    title: 'Regulatory Submission Package for FDA',
    type: 'CSR',
    date: 'March 15, 2025',
    category: 'Regulatory',
    description:
      'Comprehensive regulatory submission package with automated citations, validation, and cross-reference verification for FDA submission.',
    tags: ['FDA', 'Regulatory', 'Submission-Ready'],
    featuredImage: 'regulatory',
    badgeText: 'FDA-Aligned',
    badgeVariant: 'outline',
    downloadUrl: '/attached_assets/example_reports/regulatory/regulatory_submission.pdf',
    previewUrl: '/attached_assets/example_reports/regulatory/regulatory_submission.pdf',
  },
  {
    id: 5,
    title: 'Endpoint Selection Optimization Report',
    type: 'CSR',
    date: 'March 10, 2025',
    category: 'Clinical',
    description:
      'Evidence-based endpoint selection and validation guide with statistical power analysis and historical validation from CSR database.',
    tags: ['Endpoints', 'Clinical Design', 'Validation'],
    featuredImage: 'endpoint',
    badgeText: 'Clinical',
    badgeVariant: 'outline',
    downloadUrl: '/attached_assets/example_reports/clinical/endpoint_selection.pdf',
    previewUrl: '/attached_assets/example_reports/clinical/endpoint_selection.pdf',
  },
  {
    id: 6,
    title: 'Investment Risk Assessment for Biotech',
    type: 'CSR',
    date: 'February 25, 2025',
    category: 'Executive',
    description:
      'Comprehensive analysis of trial investment risk with ROI projections based on CSR database of similar programs and historical outcomes.',
    tags: ['Investment', 'Risk', 'Valuation'],
    featuredImage: 'investment',
    badgeText: 'Financial',
    badgeVariant: 'outline',
    downloadUrl: '/attached_assets/example_reports/ceo/investment_risk_report.pdf',
    previewUrl: '/attached_assets/example_reports/ceo/investment_risk_report.pdf',
  },
];

// Example regulatory evaluation report data
const cerReports = [
  {
    id: 7,
    title: 'Adalimumab Clinical Evaluation Report',
    type: 'Regulatory',
    date: 'April 15, 2025',
    category: 'Immunology',
    description:
      'Comprehensive Clinical Evaluation Report for Adalimumab with 5-year safety data analysis, literature review, and risk-benefit assessment.',
    tags: ['FDA FAERS', 'Literature Review', 'Safety Analysis'],
    featuredImage: 'adalimumab',
    badgeText: 'Enhanced',
    badgeVariant: 'default',
    downloadUrl: '/attached_assets/example_reports/clinical/adalimumab_cer.pdf',
    previewUrl: '/attached_assets/example_reports/clinical/adalimumab_cer.pdf',
  },
  {
    id: 8,
    title: 'Semaglutide Post-Market Surveillance Report',
    type: 'Regulatory',
    date: 'March 28, 2025',
    category: 'Endocrinology',
    description:
      'Post-market surveillance report for Semaglutide with safety signal detection, adverse event clustering, and regulatory recommendations.',
    tags: ['Adverse Events', 'Signal Detection', 'Visualizations'],
    featuredImage: 'semaglutide',
    badgeText: 'AI-Generated',
    badgeVariant: 'default',
    downloadUrl: '/attached_assets/example_reports/clinical/semaglutide_post_market.pdf',
    previewUrl: '/attached_assets/example_reports/clinical/semaglutide_post_market.pdf',
  },
  {
    id: 9,
    title: 'Pembrolizumab Clinical Evaluation with Safety Monitoring',
    type: 'Regulatory',
    date: 'March 10, 2025',
    category: 'Oncology',
    description:
      'Enhanced Clinical Evaluation Report for Pembrolizumab featuring comprehensive adverse event monitoring across multiple indications.',
    tags: ['Oncology', 'Immuno-Oncology', 'Multi-Indication'],
    featuredImage: 'pembrolizumab',
    badgeText: 'Premium',
    badgeVariant: 'default',
    downloadUrl: '/attached_assets/example_reports/clinical/pembrolizumab_cer.pdf',
    previewUrl: '/attached_assets/example_reports/clinical/pembrolizumab_cer.pdf',
  },
  {
    id: 10,
    title: 'Infliximab Regulatory Compliance Report',
    type: 'Regulatory',
    date: 'February 20, 2025',
    category: 'Immunology',
    description:
      'Regulatory-focused Clinical Evaluation Report for Infliximab with detailed compliance analysis for FDA, EMA, and PMDA requirements.',
    tags: ['Regulatory', 'Global', 'Compliance'],
    featuredImage: 'infliximab',
    badgeText: 'Regulatory',
    badgeVariant: 'outline',
    downloadUrl: '/attached_assets/example_reports/clinical/infliximab_compliance.pdf',
    previewUrl: '/attached_assets/example_reports/clinical/infliximab_compliance.pdf',
  },
  {
    id: 11,
    title: 'Ustekinumab Annual Safety Update Report',
    type: 'Regulatory',
    date: 'February 5, 2025',
    category: 'Dermatology',
    description:
      'Annual update to Clinical Evaluation Report for Ustekinumab with focus on dermatological indications and emerging safety signals.',
    tags: ['Annual Update', 'Dermatology', 'Psoriasis'],
    featuredImage: 'ustekinumab',
    badgeText: 'Annual',
    badgeVariant: 'outline',
    downloadUrl: '/attached_assets/example_reports/clinical/ustekinumab_annual.pdf',
    previewUrl: '/attached_assets/example_reports/clinical/ustekinumab_annual.pdf',
  },
  {
    id: 12,
    title: 'Apixaban Comparative Safety Analysis',
    type: 'Regulatory',
    date: 'January 25, 2025',
    category: 'Cardiology',
    description:
      'Comparative Clinical Evaluation Report for Apixaban with head-to-head analysis against other NOACs using real-world evidence.',
    tags: ['Comparative', 'NOAC', 'Real-World Evidence'],
    featuredImage: 'apixaban',
    badgeText: 'Comparative',
    badgeVariant: 'outline',
    downloadUrl: '/attached_assets/example_reports/clinical/apixaban_comparative.pdf',
    previewUrl: '/attached_assets/example_reports/clinical/apixaban_comparative.pdf',
  },
];

// Combine both report types
const allReports = [...csrReports, ...cerReports];

// Component for the gradient backgrounds
const ReportGradient = ({ type, className = '' }) => {
  const gradients = {
    adalimumab: 'from-sky-500 to-indigo-600',
    semaglutide: 'from-emerald-500 to-teal-600',
    pembrolizumab: 'from-purple-500 to-indigo-600',
    infliximab: 'from-amber-500 to-orange-600',
    ustekinumab: 'from-rose-500 to-pink-600',
    apixaban: 'from-blue-500 to-cyan-600',
    protocol: 'from-blue-600 to-indigo-700',
    prediction: 'from-emerald-600 to-teal-700',
    strategic: 'from-amber-600 to-orange-700',
    regulatory: 'from-purple-600 to-indigo-700',
    endpoint: 'from-teal-600 to-blue-700',
    investment: 'from-red-600 to-rose-700',
    default: 'from-gray-700 to-gray-900',
  };

  const icons = {
    adalimumab: <FileBarChart2 className="h-16 w-16 text-white" />,
    semaglutide: <FileBarChart2 className="h-16 w-16 text-white" />,
    pembrolizumab: <FileBarChart2 className="h-16 w-16 text-white" />,
    infliximab: <FileBarChart2 className="h-16 w-16 text-white" />,
    ustekinumab: <FileBarChart2 className="h-16 w-16 text-white" />,
    apixaban: <FileBarChart2 className="h-16 w-16 text-white" />,
    protocol: <Beaker className="h-16 w-16 text-white" />,
    prediction: <LineChart className="h-16 w-16 text-white" />,
    strategic: <PieChart className="h-16 w-16 text-white" />,
    regulatory: <ClipboardCheck className="h-16 w-16 text-white" />,
    endpoint: <Microscope className="h-16 w-16 text-white" />,
    investment: <PieChart className="h-16 w-16 text-white" />,
    default: <FileText className="h-16 w-16 text-white" />,
  };

  const gradient = gradients[type] || gradients.default;
  const icon = icons[type] || icons.default;

  return (
    <div
      className={`h-40 bg-gradient-to-r ${gradient} flex items-center justify-center ${className}`}
    >
      {icon}
    </div>
  );
};

export default function ExampleReportsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [currentReports, setCurrentReports] = useState(allReports);
  const [location] = useLocation();

  // Set initial tab and filters based on URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const type = urlParams.get('type');

    if (type) {
      switch (type) {
        case 'protocol':
          setActiveTab('csr');
          setCategoryFilter('Clinical');
          break;
        case 'regulatory':
          setActiveTab('csr');
          setCategoryFilter('Regulatory');
          break;
        case 'prediction':
          setActiveTab('csr');
          setCategoryFilter('Biostatistics');
          break;
        case 'strategic':
          setActiveTab('csr');
          setCategoryFilter('Executive');
          break;
        default:
          setActiveTab('all');
          setCategoryFilter('');
      }
    }
  }, [location]);

  // Update current reports when tab changes
  useEffect(() => {
    switch (activeTab) {
      case 'csr':
        setCurrentReports(csrReports);
        break;
      case 'cer':
        setCurrentReports(cerReports);
        break;
      default:
        setCurrentReports(allReports);
        break;
    }
  }, [activeTab]);

  // Filter reports based on search term and filters
  const filteredReports = currentReports.filter(report => {
    const matchesSearch =
      searchTerm === '' ||
      report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = categoryFilter === '' || report.category === categoryFilter;
    const matchesType = typeFilter === '' || report.type === typeFilter;

    return matchesSearch && matchesCategory && matchesType;
  });

  // Get unique categories and types for filters
  const categories = [...new Set(currentReports.map(report => report.category))];

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </div>

        <div className="flex gap-2">
          <Link href="/cer-generator">
            <Button size="sm" variant="outline" className="gap-1">
              <FileBarChart2 className="h-4 w-4" />
              Regulatory Builder
            </Button>
          </Link>
          <Link href="/protocol-generator">
            <Button size="sm" variant="outline" className="gap-1">
              <Beaker className="h-4 w-4" />
              Protocol Designer
            </Button>
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Example Reports</h1>
        <p className="text-muted-foreground max-w-3xl">
          Browse our library of high-quality example reports to see how LumenTrialGuide.AI can
          transform your clinical research with CSR intelligence and regulatory reporting.
        </p>
      </div>

      <Tabs defaultValue="all" className="w-full" value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <TabsList className="mb-0">
            <TabsTrigger value="all">All Reports</TabsTrigger>
            <TabsTrigger value="csr">CSR Intelligence</TabsTrigger>
            <TabsTrigger value="cer">Regulatory Reports</TabsTrigger>
          </TabsList>

          <div className="flex flex-1 sm:max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search reports..."
                className="pl-8"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Categories</SelectItem>
              {categories.map(category => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="all" className="mt-6">
          <div className="mb-4">
            <h2 className="text-xl font-bold">All Report Types</h2>
            <p className="text-sm text-muted-foreground">
              Browse our complete collection of CSR Intelligence and regulatory reports
            </p>
          </div>
        </TabsContent>

        <TabsContent value="csr" className="mt-6">
          <div className="mb-4">
            <h2 className="text-xl font-bold">CSR Intelligence Reports</h2>
            <p className="text-sm text-muted-foreground">
              Reports generated from our database of 2,800+ clinical study reports
            </p>
          </div>
        </TabsContent>

        <TabsContent value="cer" className="mt-6">
          <div className="mb-4">
            <h2 className="text-xl font-bold">Regulatory Evaluation Reports</h2>
            <p className="text-sm text-muted-foreground">
              AI-generated evaluations using multi-jurisdiction safety data and regulatory frameworks
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {filteredReports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg">No Reports Found</h3>
          <p className="text-muted-foreground">
            Try adjusting your search or filters to find reports.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredReports.map(report => (
            <Card key={report.id} className="overflow-hidden flex flex-col h-full">
              <ReportGradient type={report.featuredImage} />
              <CardHeader>
                <div className="flex justify-between items-start gap-2">
                  <CardTitle className="text-lg">{report.title}</CardTitle>
                  <Badge variant={report.badgeVariant}>{report.badgeText}</Badge>
                </div>
                <div className="flex items-center text-sm text-muted-foreground gap-3 mt-1">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{report.date}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" />
                    <span>{report.category}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  {report.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  {report.tags.map(tag => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t p-4">
                <Button variant="outline" size="sm" asChild>
                  <a href={report.previewUrl} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-4 w-4 mr-1" />
                    View Report
                  </a>
                </Button>
                <Button size="sm" asChild>
                  <a href={report.downloadUrl} download>
                    <Download className="h-4 w-4 mr-1" />
                    Download PDF
                  </a>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 pointer-events-none" />
          <CardHeader>
            <CardTitle>CSR Intelligence Platform</CardTitle>
            <CardDescription>
              Extract, analyze, and leverage insights from 2,800+ clinical study reports
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 flex items-center justify-center bg-blue-100 dark:bg-blue-900/20 rounded-lg text-blue-700 dark:text-blue-400 mt-0.5">
                <Database className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-medium">Structured CSR Database</h3>
                <p className="text-sm text-muted-foreground">
                  Access our library of 2,800+ structured clinical study reports from major
                  regulatory agencies
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 flex items-center justify-center bg-blue-100 dark:bg-blue-900/20 rounded-lg text-blue-700 dark:text-blue-400 mt-0.5">
                <Beaker className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-medium">Protocol Designer</h3>
                <p className="text-sm text-muted-foreground">
                  Generate evidence-based protocol templates based on successful trials in your
                  therapeutic area
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 flex items-center justify-center bg-blue-100 dark:bg-blue-900/20 rounded-lg text-blue-700 dark:text-blue-400 mt-0.5">
                <LineChart className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-medium">Statistical Modeling</h3>
                <p className="text-sm text-muted-foreground">
                  Predict trial outcomes and optimize statistical approaches based on historical CSR
                  data
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Link href="/dashboard">
              <Button>Explore CSR Platform</Button>
            </Link>
          </CardFooter>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/10 to-teal-600/10 pointer-events-none" />
          <CardHeader>
            <CardTitle>Medical Device & Diagnostics Regulatory Module</CardTitle>
            <CardDescription>
              Generate comprehensive regulatory evaluations with multi-source safety data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/20 rounded-lg text-emerald-700 dark:text-emerald-400 mt-0.5">
                <FileBarChart2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-medium">Automated Regulatory Compilation</h3>
                <p className="text-sm text-muted-foreground">
                  Create regulatory-compliant evaluations using product identifiers and evidence packs
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/20 rounded-lg text-emerald-700 dark:text-emerald-400 mt-0.5">
                <ClipboardCheck className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-medium">Regulatory Compliance</h3>
                <p className="text-sm text-muted-foreground">
                  Meet requirements for FDA, EMA, PMDA and other regulatory bodies with validated
                  templates
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/20 rounded-lg text-emerald-700 dark:text-emerald-400 mt-0.5">
                <PieChart className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-medium">Enhanced Visualizations</h3>
                <p className="text-sm text-muted-foreground">
                  Powerful analytics dashboards for safety signal detection and adverse event
                  monitoring
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Link href="/enhanced-cer-dashboard">
              <Button>Open Regulatory Dashboard</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>

      <div className="mt-8 bg-slate-50 dark:bg-slate-800/50 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
        <h2 className="text-xl font-bold mb-4">Frequently Asked Questions</h2>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger>
              What's the difference between CSR and regulatory evaluation reports?
            </AccordionTrigger>
            <AccordionContent>
              <p className="mb-2">
                <strong>Clinical Study Reports (CSRs)</strong> document the methods and results of
                clinical trials for drugs, biologics, or devices. They're typically created at the
                end of a clinical trial.
              </p>
              <p>
                <strong>Regulatory evaluation reports</strong> focus on post-market surveillance and
                ongoing safety monitoring of medical products. They compile real-world data from
                sources like FDA FAERS to maintain regulatory compliance after a product has been
                approved.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-2">
            <AccordionTrigger>How are these example reports created?</AccordionTrigger>
            <AccordionContent>
              <p className="mb-2">
                The CSR reports are generated using our AI-powered analysis of 2,800+ clinical study
                reports from our structured database. The system identifies patterns, best
                practices, and success factors from historical trial data.
              </p>
              <p>
                The regulatory evaluation reports are generated using the Medical Device &
                Diagnostics Regulatory Module, which combines data from FDA FAERS with AI-powered
                narrative generation and visualization tools. Each report follows MEDDEV 2.7/1
                Rev. 4 structure (for medical devices) or similar pharmaceutical industry standards
                for post-market surveillance reporting.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-3">
            <AccordionTrigger>
              Can I create custom reports for my specific products?
            </AccordionTrigger>
            <AccordionContent>
              <p className="mb-2">
                Yes! LumenTrialGuide.AI allows you to generate both types of reports:
              </p>
              <p className="mb-2">
                For CSR intelligence, you can upload your protocol or enter your indication to
                receive tailored analysis based on similar trials in our database.
              </p>
              <p>
                For regulatory evaluations, you can generate custom reports using NDC codes or
                other product identifiers. Our platform will pull the relevant data from FDA FAERS
                and other sources, apply AI-powered analysis, and create a comprehensive report
                tailored to your product's safety profile.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-4">
            <AccordionTrigger>Do these reports meet regulatory requirements?</AccordionTrigger>
            <AccordionContent>
              <p>
                Yes, our reports are designed to meet the requirements of major regulatory bodies
                including FDA, EMA, PMDA, and others. The structure and content follow established
                guidelines such as ICH E3 for CSRs and MEDDEV 2.7/1 Rev. 4 for medical device
                evaluations and similar pharmaceutical industry standards for drug evaluations.
                However, final
                regulatory compliance is the responsibility of the manufacturer or sponsor.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-5">
            <AccordionTrigger>Can I integrate this with my existing systems?</AccordionTrigger>
            <AccordionContent>
              <p>
                LumenTrialGuide.AI offers API access and integration options to connect with your
                existing regulatory information management systems, safety databases, document
                management platforms, and clinical trial management systems. Our team can help set
                up custom workflows to ensure seamless integration with your current processes.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="bg-gradient-to-r from-indigo-600 to-blue-700 text-white p-8 rounded-lg">
        <div className="flex flex-col md:flex-row gap-8 items-center">
          <div className="md:w-2/3">
            <h2 className="text-2xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="mb-6">
              Access our complete platform for CSR intelligence and regulatory reporting. Design better
              trials, generate comprehensive evaluation reports, and accelerate regulatory
              submissions with LumenTrialGuide.AI.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/protocol-generator">
                <Button className="bg-white text-indigo-700 hover:bg-slate-100">
                  <Beaker className="h-4 w-4 mr-2" />
                  Try Protocol Designer
                </Button>
              </Link>
              <Link href="/enhanced-cer-dashboard">
                <Button className="bg-white text-indigo-700 hover:bg-slate-100">
                  <FileBarChart2 className="h-4 w-4 mr-2" />
                  Open Regulatory Builder
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="outline" className="border-white text-white hover:bg-indigo-700">
                  View Full Platform
                </Button>
              </Link>
            </div>
          </div>
          <div className="md:w-1/3 flex flex-col gap-4">
            <div className="p-4 bg-white/10 backdrop-blur-sm rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-5 w-5 text-indigo-300" />
                <span className="font-medium">2,800+ CSRs</span>
              </div>
              <p className="text-sm text-indigo-100">
                Access our comprehensive database of structured clinical study reports
              </p>
            </div>
            <div className="p-4 bg-white/10 backdrop-blur-sm rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <FileBarChart2 className="h-5 w-5 text-indigo-300" />
                <span className="font-medium">Real-time FAERS data</span>
              </div>
              <p className="text-sm text-indigo-100">
                Generate regulatory evaluations with the latest FDA FAERS data for post-market surveillance
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

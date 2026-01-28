/**
 * Concept2Cure - Regulatory Intelligence Hub
 * 
 * Centralized regulatory intelligence for:
 * - Guidance document tracking
 * - Regulatory changes and updates
 * - Competitive intelligence
 * - Approval trends analysis
 * - Global regulatory landscape
 * 
 * @module components/regulatory/RegulatoryIntelligence
 * @version 1.0.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  Globe,
  FileText,
  AlertCircle,
  Bell,
  TrendingUp,
  Calendar,
  ExternalLink,
  Star,
  Bookmark,
  Filter,
  RefreshCw,
  Download,
  Eye,
  Sparkles,
  Building2,
  Pill,
  Zap,
  BarChart3,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Agency = 'FDA' | 'EMA' | 'PMDA' | 'Health Canada' | 'TGA' | 'MHRA' | 'Swissmedic' | 'NMPA';
type DocumentType = 'guidance' | 'regulation' | 'policy' | 'draft_guidance' | 'final_guidance' | 'warning_letter' | 'approval';
type TherapeuticArea = 'oncology' | 'cardiology' | 'neurology' | 'infectious' | 'rare_disease' | 'immunology' | 'metabolic' | 'other';
type AlertPriority = 'critical' | 'high' | 'medium' | 'low';

interface RegulatoryDocument {
  id: string;
  title: string;
  agency: Agency;
  type: DocumentType;
  therapeuticArea?: TherapeuticArea;
  publishDate: string;
  effectiveDate?: string;
  commentDeadline?: string;
  url: string;
  summary: string;
  relevanceScore: number;
  isBookmarked: boolean;
  tags: string[];
}

interface RegulatoryAlert {
  id: string;
  title: string;
  agency: Agency;
  priority: AlertPriority;
  date: string;
  category: string;
  description: string;
  actionRequired: boolean;
  deadline?: string;
  acknowledged: boolean;
}

interface CompetitorApproval {
  id: string;
  productName: string;
  company: string;
  indication: string;
  agency: Agency;
  approvalDate: string;
  approvalType: 'standard' | 'priority' | 'accelerated' | 'breakthrough' | 'fast_track';
  therapeuticArea: TherapeuticArea;
  mechanism: string;
  notes?: string;
}

interface ApprovalTrend {
  year: number;
  agency: Agency;
  totalApprovals: number;
  novelApprovals: number;
  priorityReviews: number;
  avgReviewTime: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const AGENCY_CONFIG: Record<Agency, { label: string; color: string; flag: string }> = {
  FDA: { label: 'FDA (US)', color: 'bg-blue-100 text-blue-800', flag: '🇺🇸' },
  EMA: { label: 'EMA (EU)', color: 'bg-indigo-100 text-indigo-800', flag: '🇪🇺' },
  PMDA: { label: 'PMDA (Japan)', color: 'bg-red-100 text-red-800', flag: '🇯🇵' },
  'Health Canada': { label: 'Health Canada', color: 'bg-pink-100 text-pink-800', flag: '🇨🇦' },
  TGA: { label: 'TGA (Australia)', color: 'bg-green-100 text-green-800', flag: '🇦🇺' },
  MHRA: { label: 'MHRA (UK)', color: 'bg-purple-100 text-purple-800', flag: '🇬🇧' },
  Swissmedic: { label: 'Swissmedic', color: 'bg-orange-100 text-orange-800', flag: '🇨🇭' },
  NMPA: { label: 'NMPA (China)', color: 'bg-yellow-100 text-yellow-800', flag: '🇨🇳' },
};

const THERAPEUTIC_AREAS: Record<TherapeuticArea, string> = {
  oncology: 'Oncology',
  cardiology: 'Cardiovascular',
  neurology: 'Neurology',
  infectious: 'Infectious Disease',
  rare_disease: 'Rare Disease',
  immunology: 'Immunology',
  metabolic: 'Metabolic',
  other: 'Other',
};

// Mock Data
const MOCK_DOCUMENTS: RegulatoryDocument[] = [
  {
    id: 'doc1',
    title: 'Artificial Intelligence and Machine Learning in Drug Development',
    agency: 'FDA',
    type: 'draft_guidance',
    publishDate: '2025-01-15',
    commentDeadline: '2025-04-15',
    url: 'https://fda.gov/guidance/ai-ml-drug-dev',
    summary: 'FDA seeks input on the use of AI/ML throughout drug development lifecycle, including clinical trials and manufacturing.',
    relevanceScore: 95,
    isBookmarked: true,
    tags: ['AI/ML', 'Drug Development', 'Clinical Trials'],
  },
  {
    id: 'doc2',
    title: 'Decentralized Clinical Trials for Drugs and Biological Products',
    agency: 'FDA',
    type: 'final_guidance',
    publishDate: '2025-01-10',
    effectiveDate: '2025-01-10',
    url: 'https://fda.gov/guidance/dct',
    summary: 'Final guidance on conducting decentralized clinical trials including remote data collection and telemedicine.',
    relevanceScore: 88,
    isBookmarked: false,
    tags: ['DCT', 'Clinical Trials', 'Remote Monitoring'],
  },
  {
    id: 'doc3',
    title: 'Medical Device Regulation (MDR) Amendment 2025',
    agency: 'EMA',
    type: 'regulation',
    publishDate: '2025-01-05',
    effectiveDate: '2025-07-01',
    url: 'https://ema.europa.eu/mdr-2025',
    summary: 'Amendments to EU MDR 2017/745 regarding transition periods and clinical evidence requirements.',
    relevanceScore: 82,
    isBookmarked: true,
    tags: ['MDR', 'Medical Devices', 'EU Regulation'],
  },
  {
    id: 'doc4',
    title: 'Real-World Data and Real-World Evidence in Regulatory Decisions',
    agency: 'PMDA',
    type: 'guidance',
    therapeuticArea: 'oncology',
    publishDate: '2024-12-20',
    url: 'https://pmda.go.jp/rwd-guidance',
    summary: 'PMDA guidance on use of real-world data for regulatory applications in oncology.',
    relevanceScore: 75,
    isBookmarked: false,
    tags: ['RWD', 'RWE', 'Oncology', 'Japan'],
  },
];

const MOCK_ALERTS: RegulatoryAlert[] = [
  {
    id: 'alert1',
    title: 'FDA Announces New Electronic Submission Requirements',
    agency: 'FDA',
    priority: 'high',
    date: '2025-01-20',
    category: 'Submission Requirements',
    description: 'Starting June 2025, all IND amendments must be submitted in eCTD v4.0 format.',
    actionRequired: true,
    deadline: '2025-06-01',
    acknowledged: false,
  },
  {
    id: 'alert2',
    title: 'EMA PSUSA Deadline Reminder',
    agency: 'EMA',
    priority: 'medium',
    date: '2025-01-18',
    category: 'PSUR',
    description: 'Upcoming PSUSA deadline for active substances starting with A-C.',
    actionRequired: true,
    deadline: '2025-02-28',
    acknowledged: true,
  },
  {
    id: 'alert3',
    title: 'Health Canada Cannabis Regulations Update',
    agency: 'Health Canada',
    priority: 'low',
    date: '2025-01-15',
    category: 'Regulation Update',
    description: 'Updates to cannabis product packaging and labeling requirements.',
    actionRequired: false,
    acknowledged: false,
  },
];

const MOCK_APPROVALS: CompetitorApproval[] = [
  {
    id: 'app1',
    productName: 'Nexolumab',
    company: 'BioPharm Inc.',
    indication: 'Non-small cell lung cancer with EGFR mutation',
    agency: 'FDA',
    approvalDate: '2025-01-18',
    approvalType: 'breakthrough',
    therapeuticArea: 'oncology',
    mechanism: 'EGFR Tyrosine Kinase Inhibitor',
  },
  {
    id: 'app2',
    productName: 'CardioShield XR',
    company: 'HeartCare Therapeutics',
    indication: 'Heart failure with reduced ejection fraction',
    agency: 'FDA',
    approvalDate: '2025-01-15',
    approvalType: 'priority',
    therapeuticArea: 'cardiology',
    mechanism: 'SGLT2 Inhibitor',
  },
  {
    id: 'app3',
    productName: 'Immunostat',
    company: 'ImmunoGen Corp',
    indication: 'Moderate-to-severe rheumatoid arthritis',
    agency: 'EMA',
    approvalDate: '2025-01-12',
    approvalType: 'standard',
    therapeuticArea: 'immunology',
    mechanism: 'JAK Inhibitor',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Intelligence Dashboard Metrics
 */
function IntelligenceMetrics() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">New Guidance</p>
              <p className="text-2xl font-bold">12</p>
              <p className="text-xs text-green-600">+3 this week</p>
            </div>
            <FileText className="w-8 h-8 text-blue-500" />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active Alerts</p>
              <p className="text-2xl font-bold text-orange-600">5</p>
              <p className="text-xs text-red-600">2 high priority</p>
            </div>
            <Bell className="w-8 h-8 text-orange-500" />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Recent Approvals</p>
              <p className="text-2xl font-bold">24</p>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Comment Deadlines</p>
              <p className="text-2xl font-bold text-purple-600">3</p>
              <p className="text-xs text-muted-foreground">Open for comments</p>
            </div>
            <Calendar className="w-8 h-8 text-purple-500" />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Bookmarked</p>
              <p className="text-2xl font-bold">8</p>
              <p className="text-xs text-muted-foreground">Saved items</p>
            </div>
            <Bookmark className="w-8 h-8 text-yellow-500" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Guidance Documents Browser
 */
function GuidanceDocuments({ documents }: { documents: RegulatoryDocument[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAgency, setFilterAgency] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  const filteredDocs = useMemo(() => {
    return documents.filter(doc => {
      if (filterAgency !== 'all' && doc.agency !== filterAgency) return false;
      if (filterType !== 'all' && doc.type !== filterType) return false;
      if (searchTerm && !doc.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [documents, filterAgency, filterType, searchTerm]);

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-64">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search guidance documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={filterAgency} onValueChange={setFilterAgency}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Agency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agencies</SelectItem>
            {Object.entries(AGENCY_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                {config.flag} {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="draft_guidance">Draft Guidance</SelectItem>
            <SelectItem value="final_guidance">Final Guidance</SelectItem>
            <SelectItem value="regulation">Regulation</SelectItem>
            <SelectItem value="policy">Policy</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Document Cards */}
      <div className="grid gap-4">
        {filteredDocs.map((doc) => {
          const agencyConfig = AGENCY_CONFIG[doc.agency];
          return (
            <Card key={doc.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={agencyConfig.color}>
                        {agencyConfig.flag} {doc.agency}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {doc.type.replace('_', ' ')}
                      </Badge>
                      {doc.commentDeadline && new Date(doc.commentDeadline) > new Date() && (
                        <Badge variant="secondary">
                          <Clock className="w-3 h-3 mr-1" />
                          Comments Open
                        </Badge>
                      )}
                    </div>
                    <h4 className="font-semibold text-lg mb-2">{doc.title}</h4>
                    <p className="text-sm text-muted-foreground mb-3">{doc.summary}</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {doc.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Published: {doc.publishDate}</span>
                      {doc.effectiveDate && <span>Effective: {doc.effectiveDate}</span>}
                      {doc.commentDeadline && (
                        <span className="text-orange-600">
                          Comments due: {doc.commentDeadline}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 ml-4">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground">Relevance</span>
                      <Badge variant={doc.relevanceScore >= 80 ? 'default' : 'secondary'}>
                        {doc.relevanceScore}%
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Star className={`w-4 h-4 ${doc.isBookmarked ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Regulatory Alerts Panel
 */
function RegulatoryAlerts({ alerts }: { alerts: RegulatoryAlert[] }) {
  const priorityConfig: Record<AlertPriority, { color: string; icon: React.ReactNode }> = {
    critical: { color: 'bg-red-500 text-white', icon: <AlertCircle className="w-4 h-4" /> },
    high: { color: 'bg-orange-500 text-white', icon: <AlertCircle className="w-4 h-4" /> },
    medium: { color: 'bg-yellow-500 text-white', icon: <Bell className="w-4 h-4" /> },
    low: { color: 'bg-blue-100 text-blue-800', icon: <Bell className="w-4 h-4" /> },
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Active Alerts</h3>
          <p className="text-sm text-muted-foreground">
            Regulatory changes requiring attention
          </p>
        </div>
        <Button variant="outline">
          <Filter className="w-4 h-4 mr-2" />
          Manage Alerts
        </Button>
      </div>

      <div className="space-y-3">
        {alerts.map((alert) => {
          const config = priorityConfig[alert.priority];
          const agencyConfig = AGENCY_CONFIG[alert.agency];
          return (
            <Card key={alert.id} className={!alert.acknowledged ? 'border-l-4 border-l-orange-500' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${config.color}`}>
                      {config.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={agencyConfig.color}>
                          {agencyConfig.flag} {alert.agency}
                        </Badge>
                        <Badge className={config.color}>{alert.priority}</Badge>
                        {alert.actionRequired && (
                          <Badge variant="destructive">Action Required</Badge>
                        )}
                      </div>
                      <h4 className="font-semibold">{alert.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{alert.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span>{alert.date}</span>
                        <span>{alert.category}</span>
                        {alert.deadline && (
                          <span className="text-red-600">Deadline: {alert.deadline}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!alert.acknowledged && (
                      <Button size="sm" variant="outline">Acknowledge</Button>
                    )}
                    <Button size="sm">View Details</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Competitive Intelligence Panel
 */
function CompetitiveIntelligence({ approvals }: { approvals: CompetitorApproval[] }) {
  const approvalTypeConfig: Record<string, { label: string; color: string }> = {
    standard: { label: 'Standard', color: 'bg-gray-100 text-gray-800' },
    priority: { label: 'Priority Review', color: 'bg-blue-100 text-blue-800' },
    accelerated: { label: 'Accelerated', color: 'bg-green-100 text-green-800' },
    breakthrough: { label: 'Breakthrough', color: 'bg-purple-100 text-purple-800' },
    fast_track: { label: 'Fast Track', color: 'bg-orange-100 text-orange-800' },
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Recent Approvals</h3>
          <p className="text-sm text-muted-foreground">
            Monitor competitor and industry approvals
          </p>
        </div>
        <div className="flex gap-2">
          <Select defaultValue="all">
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Therapeutic Area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Areas</SelectItem>
              {Object.entries(THERAPEUTIC_AREAS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Indication</TableHead>
            <TableHead>Agency</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {approvals.map((approval) => {
            const agencyConfig = AGENCY_CONFIG[approval.agency];
            const typeConfig = approvalTypeConfig[approval.approvalType];
            return (
              <TableRow key={approval.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{approval.productName}</p>
                    <p className="text-xs text-muted-foreground">{approval.mechanism}</p>
                  </div>
                </TableCell>
                <TableCell>{approval.company}</TableCell>
                <TableCell className="max-w-xs truncate">{approval.indication}</TableCell>
                <TableCell>
                  <Badge className={agencyConfig.color}>
                    {agencyConfig.flag} {approval.agency}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
                </TableCell>
                <TableCell>{approval.approvalDate}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost">
                    <Eye className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Approval Trends */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Approval Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <Card className="p-4 bg-blue-50">
              <p className="text-sm text-muted-foreground">FDA 2024</p>
              <p className="text-2xl font-bold">50</p>
              <p className="text-xs text-green-600">+12% vs 2023</p>
            </Card>
            <Card className="p-4 bg-indigo-50">
              <p className="text-sm text-muted-foreground">EMA 2024</p>
              <p className="text-2xl font-bold">42</p>
              <p className="text-xs text-green-600">+8% vs 2023</p>
            </Card>
            <Card className="p-4 bg-purple-50">
              <p className="text-sm text-muted-foreground">Priority Reviews</p>
              <p className="text-2xl font-bold">35%</p>
              <p className="text-xs text-muted-foreground">of total</p>
            </Card>
            <Card className="p-4 bg-green-50">
              <p className="text-sm text-muted-foreground">Avg Review Time</p>
              <p className="text-2xl font-bold">10.2</p>
              <p className="text-xs text-muted-foreground">months</p>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Global Landscape Overview
 */
function GlobalLandscape() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Global Regulatory Landscape</h3>
          <p className="text-sm text-muted-foreground">
            Overview of regulatory environments across key markets
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(AGENCY_CONFIG).map(([agency, config]) => (
          <Card key={agency}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <span className="text-2xl">{config.flag}</span>
                {config.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Recent Updates</span>
                  <Badge variant="outline">3 new</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Open Comments</span>
                  <Badge variant="outline">2</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Avg Review Time</span>
                  <span>10-12 mo</span>
                </div>
                <Button variant="outline" className="w-full" size="sm">
                  View Details
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * Main Regulatory Intelligence Component
 */
export function RegulatoryIntelligence() {
  const [documents] = useState<RegulatoryDocument[]>(MOCK_DOCUMENTS);
  const [alerts] = useState<RegulatoryAlert[]>(MOCK_ALERTS);
  const [approvals] = useState<CompetitorApproval[]>(MOCK_APPROVALS);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Globe className="w-8 h-8 text-blue-600" />
            Regulatory Intelligence Hub
          </h1>
          <p className="text-muted-foreground">
            Stay informed on global regulatory changes and industry trends
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Bell className="w-4 h-4 mr-2" />
            Alert Settings
          </Button>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <IntelligenceMetrics />

      {/* Main Content */}
      <Tabs defaultValue="guidance">
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="guidance">Guidance</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="competitive">Competitive</TabsTrigger>
          <TabsTrigger value="global">Global</TabsTrigger>
        </TabsList>

        <TabsContent value="guidance" className="mt-6">
          <GuidanceDocuments documents={documents} />
        </TabsContent>

        <TabsContent value="alerts" className="mt-6">
          <RegulatoryAlerts alerts={alerts} />
        </TabsContent>

        <TabsContent value="competitive" className="mt-6">
          <CompetitiveIntelligence approvals={approvals} />
        </TabsContent>

        <TabsContent value="global" className="mt-6">
          <GlobalLandscape />
        </TabsContent>
      </Tabs>

      {/* AI Assistance */}
      <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-full">
              <Sparkles className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-purple-900">Lumen AI Intelligence</h3>
              <p className="text-sm text-purple-700">
                Get AI-powered analysis of regulatory trends, impact assessments for your products,
                and automated summaries of new guidance documents.
              </p>
            </div>
            <Button variant="outline" className="border-purple-300 text-purple-700">
              Impact Analysis
            </Button>
            <Button className="bg-purple-600 hover:bg-purple-700">
              Ask Lumen
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default RegulatoryIntelligence;

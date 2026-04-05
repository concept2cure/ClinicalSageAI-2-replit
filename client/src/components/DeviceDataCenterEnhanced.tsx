import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FileText,
  Upload,
  Search,
  Filter,
  Download,
  Eye,
  Tags,
  FileCheck,
  Heart,
  Zap,
  Code,
  Shield,
  Clock,
  Package,
  Users,
  Activity,
  Factory,
  AlertTriangle,
  Plus,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Sparkles,
  UploadCloud,
  Database,
  LinkIcon,
  Target,
  BookOpen,
  FileX,
  GitCompare,
  MessageCircle,
  FileSignature,
  History,
  TrendingUp,
  BarChart3,
  Brain,
  Layers,
  ClipboardCopy,
  FileOutput,
  UserCheck,
  Calendar,
  Settings,
  ChevronRight,
  XCircle,
  MessageSquare
} from 'lucide-react';

// FDA Requirement Categories
const FDA_REQUIREMENTS: Record<string, { id: string; required: boolean; sections: { id: string; label: string; required: boolean; }[] }> = {
  'Device Description': {
    id: 'device_desc',
    required: true,
    sections: [
      { id: 'physical_characteristics', label: 'Physical Characteristics', required: true },
      { id: 'materials_composition', label: 'Materials & Composition', required: true },
      { id: 'design_drawings', label: 'Design Drawings', required: false },
      { id: 'specifications', label: 'Technical Specifications', required: true }
    ]
  },
  'Performance Data': {
    id: 'performance',
    required: true,
    sections: [
      { id: 'bench_testing', label: 'Bench Testing', required: true },
      { id: 'animal_testing', label: 'Animal Testing', required: false },
      { id: 'computational_modeling', label: 'Computational Modeling', required: false },
      { id: 'validation_verification', label: 'V&V Testing', required: true }
    ]
  },
  'Biocompatibility': {
    id: 'biocompat',
    required: true,
    sections: [
      { id: 'iso_10993', label: 'ISO 10993 Testing', required: true },
      { id: 'cytotoxicity', label: 'Cytotoxicity', required: true },
      { id: 'sensitization', label: 'Sensitization', required: true },
      { id: 'irritation', label: 'Irritation/Intracutaneous', required: true },
      { id: 'systemic_toxicity', label: 'Systemic Toxicity', required: false },
      { id: 'hemocompatibility', label: 'Hemocompatibility', required: false }
    ]
  },
  'Sterilization': {
    id: 'sterilization',
    required: true,
    sections: [
      { id: 'validation', label: 'Sterilization Validation', required: true },
      { id: 'sterility_assurance', label: 'SAL Documentation', required: true },
      { id: 'residuals', label: 'Residual Testing', required: false },
      { id: 'packaging', label: 'Sterile Packaging Validation', required: true }
    ]
  },
  'Software': {
    id: 'software',
    required: false,
    sections: [
      { id: 'sds', label: 'Software Design Specification', required: true },
      { id: 'svvp', label: 'V&V Plan and Reports', required: true },
      { id: 'cybersecurity', label: 'Cybersecurity Documentation', required: true },
      { id: 'hazard_analysis', label: 'Software Hazard Analysis', required: true }
    ]
  },
  'Clinical': {
    id: 'clinical',
    required: false,
    sections: [
      { id: 'protocol', label: 'Clinical Protocol', required: true },
      { id: 'results', label: 'Clinical Study Results', required: true },
      { id: 'statistical_analysis', label: 'Statistical Analysis', required: true },
      { id: 'adverse_events', label: 'Adverse Events', required: false }
    ]
  },
  'Labeling': {
    id: 'labeling',
    required: true,
    sections: [
      { id: 'device_label', label: 'Device Label', required: true },
      { id: 'ifu', label: 'Instructions for Use', required: true },
      { id: 'patient_labeling', label: 'Patient Labeling', required: false },
      { id: 'physician_labeling', label: 'Physician Labeling', required: false }
    ]
  },
  'Manufacturing': {
    id: 'manufacturing',
    required: true,
    sections: [
      { id: 'process_flow', label: 'Manufacturing Process Flow', required: true },
      { id: 'quality_controls', label: 'Quality Controls', required: true },
      { id: 'device_history', label: 'Device History Record', required: false },
      { id: 'facility_info', label: 'Facility Information', required: true }
    ]
  }
};

// Workflow Stage Mapping
const WORKFLOW_STAGE_REQUIREMENTS: Record<number, string[]> = {
  0: ['device_desc', 'labeling'],
  1: ['performance', 'biocompat'],
  2: ['clinical', 'predicate_comparison'],
  3: ['performance', 'validation_verification'],
  4: ['labeling', 'ifu'],
  5: ['manufacturing', 'quality'],
  6: ['all_evidence']
};

interface EvidenceFile {
  id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  category: string;
  categories: string[];
  test_standards: string[];
  device_components: string[];
  regulatory_status: 'draft' | 'under_review' | 'approved' | 'rejected';
  fda_requirement?: string;
  fda_section?: string;
  workflow_stage?: number;
  extracted_data?: any;
  review_status?: 'pending' | 'reviewed' | 'approved';
  review_comments?: string[];
  version?: number;
  created_at: string;
  updated_at: string;
  device_name?: string;
  test_date?: string;
  test_lab_name?: string;
  result?: string;
  metadata?: any;
}

interface FilesResponse {
  files: EvidenceFile[];
  totalFiles?: number;
  approvedFiles?: number;
  underReview?: number;
  gaps?: number;
}

interface RequirementStatusResponse {
  completed?: number;
  [key: string]: any;
}

interface DeviceDataCenterEnhancedProps {
  projectId?: string;
  workflowStage?: number;
  onFileSelect?: (file: EvidenceFile) => void;
  mode?: 'full' | 'embedded' | 'selector';
}

export default function DeviceDataCenterEnhanced({ 
  projectId, 
  workflowStage = 0,
  onFileSelect,
  mode = 'full' 
}: DeviceDataCenterEnhancedProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRequirement, setSelectedRequirement] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'requirements' | 'files' | 'timeline' | 'analytics' | 'review'>('requirements');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Fetch files
  const { data: filesData, isLoading: isLoadingFiles } = useQuery<FilesResponse>({
    queryKey: ['/api/device-data-center/files', projectId, selectedRequirement, searchQuery],
    enabled: true
  });

  // Fetch requirement mapping
  const { data: requirementStatus, isLoading: isLoadingStatus } = useQuery<RequirementStatusResponse>({
    queryKey: [`/api/device-data-center/requirements/${projectId}`],
    enabled: !!projectId
  });

  // Fetch analytics
  const { data: analytics } = useQuery<FilesResponse>({
    queryKey: [`/api/device-data-center/analytics/${projectId}`],
    enabled: !!projectId
  });

  // Calculate completion percentage
  const calculateCompletion = () => {
    if (!requirementStatus) return 0;
    const totalRequired = Object.values(FDA_REQUIREMENTS).filter(r => r.required).length;
    const completed = requirementStatus.completed || 0;
    return Math.round((completed / totalRequired) * 100);
  };

  // Get files for a specific requirement
  const getFilesForRequirement = (reqId: string, sectionId?: string) => {
    if (!filesData?.files) return [];
    return filesData.files.filter((file: EvidenceFile) => {
      if (sectionId) {
        return file.fda_requirement === reqId && file.fda_section === sectionId;
      }
      return file.fda_requirement === reqId;
    });
  };

  // Get requirement status color
  const getRequirementStatus = (reqId: string) => {
    const files = getFilesForRequirement(reqId);
    if (files.length === 0) return 'bg-stone-100 text-stone-800';
    const approved = files.filter(f => f.regulatory_status === 'approved').length;
    if (approved === files.length) return 'bg-stone-100 text-stone-800';
    if (approved > 0) return 'bg-stone-100 text-stone-700';
    return 'bg-stone-100 text-stone-700';
  };

  // Handle file upload with requirement linking
  const handleFileUpload = async (files: FileList | null, requirement?: string, section?: string) => {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });
    
    if (requirement) formData.append('fda_requirement', requirement);
    if (section) formData.append('fda_section', section);
    if (workflowStage) formData.append('workflow_stage', workflowStage.toString());
    if (projectId) formData.append('project_id', projectId);

    try {
      const response = await fetch('/api/device-data-center/upload', {
        method: 'POST',
        headers: {
          'X-Organization-Id': '7'
        },
        body: formData
      });

      if (response.ok) {
        toast({
          title: 'Files Uploaded',
          description: `Successfully uploaded ${files.length} file(s)`
        });
        queryClient.invalidateQueries({ queryKey: ['/api/device-data-center'] });
      }
    } catch (error) {
      toast({
        title: 'Upload Failed',
        description: 'Failed to upload files',
        variant: 'destructive'
      });
    }
  };

  // Render Requirements View
  const renderRequirementsView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Requirements List */}
      <div className="lg:col-span-1 space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              FDA Requirements
              <Badge variant="outline">
                {calculateCompletion()}% Complete
              </Badge>
            </CardTitle>
            <Progress value={calculateCompletion()} className="mt-2" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(FDA_REQUIREMENTS).map(([name, req]) => {
              const fileCount = getFilesForRequirement(req.id).length;
              const isSelected = selectedRequirement === req.id;
              
              return (
                <Button
                  key={req.id}
                  variant={isSelected ? "default" : "outline"}
                  className="w-full justify-between"
                  onClick={() => setSelectedRequirement(req.id)}
                  data-testid={`button-requirement-${req.id}`}
                >
                  <div className="flex items-center gap-2">
                    {fileCount > 0 ? (
                      <CheckCircle className="h-4 w-4 text-stone-1000" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-stone-1000" />
                    )}
                    <span>{name}</span>
                    {req.required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                  </div>
                  <Badge variant="secondary">{fileCount} files</Badge>
                </Button>
              );
            })}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" variant="outline" data-testid="button-gap-analysis">
              <FileX className="mr-2 h-4 w-4" />
              Gap Analysis
            </Button>
            <Button className="w-full" variant="outline" data-testid="button-generate-citations">
              <ClipboardCopy className="mr-2 h-4 w-4" />
              Generate Citations
            </Button>
            <Button className="w-full" variant="outline" data-testid="button-export-evidence">
              <FileOutput className="mr-2 h-4 w-4" />
              Export Evidence Package
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Requirement Details */}
      <div className="lg:col-span-2">
        {selectedRequirement ? (
          <Card>
            <CardHeader>
              <CardTitle>
                {Object.entries(FDA_REQUIREMENTS).find(([_, r]) => r.id === selectedRequirement)?.[0]}
              </CardTitle>
              <CardDescription>
                Upload and manage evidence files for this requirement
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Section Breakdown */}
              <div className="space-y-4">
                {FDA_REQUIREMENTS[Object.keys(FDA_REQUIREMENTS).find(k => 
                  FDA_REQUIREMENTS[k].id === selectedRequirement
                ) || '']?.sections.map(section => {
                  const sectionFiles = getFilesForRequirement(selectedRequirement, section.id);
                  
                  return (
                    <div key={section.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{section.label}</h4>
                          {section.required && (
                            <Badge variant="outline" className="text-xs">Required</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {sectionFiles.length > 0 ? (
                            <Badge variant="default" className="bg-stone-1000">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {sectionFiles.length} files
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              No files
                            </Badge>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.multiple = true;
                              input.onchange = (e) => {
                                const files = (e.target as HTMLInputElement).files;
                                handleFileUpload(files, selectedRequirement, section.id);
                              };
                              input.click();
                            }}
                            data-testid={`button-upload-${section.id}`}
                          >
                            <Upload className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Section Files */}
                      {sectionFiles.length > 0 && (
                        <div className="space-y-2 mt-3">
                          {sectionFiles.map((file: EvidenceFile) => (
                            <div
                              key={file.id}
                              className="flex items-center justify-between p-2 bg-stone-50 rounded hover:bg-stone-100 transition-colors cursor-pointer"
                              onClick={() => onFileSelect?.(file)}
                            >
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-stone-500" />
                                <span className="text-sm">{file.file_name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={
                                  file.regulatory_status === 'approved' ? 'default' :
                                  file.regulatory_status === 'under_review' ? 'outline' :
                                  'secondary'
                                } className={file.regulatory_status === 'approved' ? 'bg-stone-1000' : ''}>
                                  {file.regulatory_status}
                                </Badge>
                                <Button size="sm" variant="ghost">
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Upload Zone */}
              <div
                className={`mt-6 border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  isDragging ? 'border-stone-1000 bg-stone-100' : 'border-stone-300'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFileUpload(e.dataTransfer.files, selectedRequirement);
                }}
              >
                <UploadCloud className="h-8 w-8 mx-auto mb-2 text-stone-400" />
                <p className="text-sm text-stone-600">
                  Drop files here or click to browse
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Database className="h-12 w-12 mx-auto mb-3 text-stone-400" />
                <h3 className="text-lg font-semibold mb-2">Select a Requirement</h3>
                <p className="text-sm text-stone-600">
                  Choose an FDA requirement category to view and manage evidence files
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  // Render Analytics View
  const renderAnalyticsView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Total Evidence Files</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{analytics?.totalFiles || 0}</p>
          <p className="text-xs text-muted-foreground">+12% from last month</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Approved Evidence</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-stone-700">
            {analytics?.approvedFiles || 0}
          </p>
          <Progress value={75} className="h-1 mt-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Under Review</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-stone-600">
            {analytics?.underReview || 0}
          </p>
          <p className="text-xs text-muted-foreground">Awaiting approval</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Missing Evidence</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-stone-700">
            {analytics?.gaps || 0}
          </p>
          <p className="text-xs text-muted-foreground">Critical gaps</p>
        </CardContent>
      </Card>
    </div>
  );

  // Render Review & Approval View
  const renderReviewView = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Review & Approval Workflow</CardTitle>
          <CardDescription>
            Manage document review and approval processes for regulatory compliance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Review Queue */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Files Pending Review</h3>
            <div className="space-y-2">
              {filesData?.files?.filter((f: EvidenceFile) => 
                f.regulatory_status === 'draft' || f.regulatory_status === 'under_review'
              ).map((file: EvidenceFile) => (
                <Card key={file.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-stone-500" />
                      <div>
                        <p className="font-medium">{file.file_name}</p>
                        <div className="flex gap-2 text-sm text-muted-foreground">
                          <span>Uploaded {new Date(file.created_at).toLocaleDateString()}</span>
                          {file.fda_requirement && (
                            <Badge variant="outline">{file.fda_requirement}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="text-stone-700">
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-stone-700">
                        <XCircle className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                      <Button size="sm" variant="outline">
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Comment
                      </Button>
                    </div>
                  </div>
                </Card>
              )) || <p className="text-muted-foreground">No files pending review</p>}
            </div>
          </div>

          {/* Recently Approved */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Recently Approved</h3>
            <div className="space-y-2">
              {filesData?.files?.filter((f: EvidenceFile) => 
                f.regulatory_status === 'approved'
              ).slice(0, 3).map((file: EvidenceFile) => (
                <div key={file.id} className="flex items-center gap-3 p-2">
                  <CheckCircle className="h-4 w-4 text-stone-1000" />
                  <span className="text-sm">{file.file_name}</span>
                  <Badge variant="outline" className="text-stone-700">Approved</Badge>
                </div>
              )) || <p className="text-muted-foreground text-sm">No recently approved files</p>}
            </div>
          </div>

          {/* Review Statistics */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-stone-700">
                    {filesData?.files?.filter((f: EvidenceFile) => f.regulatory_status === 'approved').length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Approved</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-stone-600">
                    {filesData?.files?.filter((f: EvidenceFile) => f.regulatory_status === 'under_review').length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Under Review</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-stone-600">
                    {filesData?.files?.filter((f: EvidenceFile) => f.regulatory_status === 'draft').length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (mode === 'embedded') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Evidence Repository</h3>
          <Button size="sm" variant="outline">
            <LinkIcon className="mr-2 h-4 w-4" />
            Link Evidence
          </Button>
        </div>
        {renderRequirementsView()}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6" />
            Evidence Management Center
          </h2>
          <p className="text-muted-foreground">
            Intelligently manage and track all 510(k) submission evidence
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="button-view-timeline">
            <History className="mr-2 h-4 w-4" />
            Timeline
          </Button>
          <Button data-testid="button-upload-evidence">
            <Upload className="mr-2 h-4 w-4" />
            Upload Evidence
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="requirements" data-testid="tab-requirements">
            <Target className="mr-2 h-4 w-4" />
            Requirements
          </TabsTrigger>
          <TabsTrigger value="files" data-testid="tab-files">
            <FileText className="mr-2 h-4 w-4" />
            All Files
          </TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-timeline">
            <Calendar className="mr-2 h-4 w-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart3 className="mr-2 h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="review" data-testid="tab-review">
            <CheckCircle className="mr-2 h-4 w-4" />
            Review & Approval
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requirements" className="mt-6">
          {renderRequirementsView()}
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          {renderAnalyticsView()}
        </TabsContent>

        <TabsContent value="review" className="mt-6">
          {renderReviewView()}
        </TabsContent>
      </Tabs>

      {/* Workflow Integration Alert */}
      {workflowStage !== undefined && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Workflow Stage {workflowStage}</AlertTitle>
          <AlertDescription>
            Currently working on Stage {workflowStage}. Required evidence: {
              WORKFLOW_STAGE_REQUIREMENTS[workflowStage]?.join(', ') || 'None specified'
            }
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
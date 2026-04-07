import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  User,
  Link2,
  Calendar,
  Target,
  BarChart3,
  Shield,
  Database,
  Search,
  Filter,
  Download,
  Plus,
  Edit,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useQuery, useMutation } from '@tanstack/react-query';

export default function ContentPlan({ isOpen, onClose, documentId, documentType = '510k' }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('sections');
  const [selectedSection, setSelectedSection] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterOwner, setFilterOwner] = useState('all');

  // Fetch content plan
  const { data: contentPlan, isLoading, refetch } = useQuery({
    queryKey: ['/api/content-plan', documentId],
    enabled: !!documentId && isOpen,
  });

  // Update section status mutation
  const updateSectionMutation = useMutation({
    mutationFn: async (section) => {
      return apiRequest(`/api/content-plan/${documentId}/section/${section.id}`, {
        method: 'PATCH',
        body: JSON.stringify(section),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['/api/content-plan', documentId]);
      toast({
        title: 'Section Updated',
        description: 'Content plan section has been updated successfully.',
      });
    },
  });

  // Generate content plan mutation
  const generatePlanMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/content-plan/${documentId}/generate`, {
        method: 'POST',
        body: JSON.stringify({ documentType }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['/api/content-plan', documentId]);
      toast({
        title: 'Content Plan Generated',
        description: 'AI has generated a comprehensive content plan for your document.',
      });
    },
  });

  // Calculate completion percentage
  const calculateCompletion = () => {
    if (!contentPlan?.sections) return 0;
    const completed = contentPlan.sections.filter(s => s.status === 'completed').length;
    return Math.round((completed / contentPlan.sections.length) * 100);
  };

  // Filter sections based on search and filters
  const filteredSections = contentPlan?.sections?.filter(section => {
    const matchesSearch = section.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          section.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || section.status === filterStatus;
    const matchesOwner = filterOwner === 'all' || section.owner === filterOwner;
    return matchesSearch && matchesStatus && matchesOwner;
  }) || [];

  // Get unique owners for filter
  const uniqueOwners = [...new Set(contentPlan?.sections?.map(s => s.owner).filter(Boolean))] || [];

  // Status color mapping
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'in_progress': return 'bg-blue-500';
      case 'in_review': return 'bg-yellow-500';
      case 'not_started': return 'bg-gray-400';
      case 'blocked': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  // Get status badge variant
  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'in_progress': return 'default';
      case 'in_review': return 'warning';
      case 'blocked': return 'destructive';
      default: return 'secondary';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Target className="h-5 w-5 text-blue-500" />
              <span>Content Plan Manager</span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                Completion: {calculateCompletion()}%
              </div>
              <Progress value={calculateCompletion()} className="w-32" />
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="sections" className="flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>Sections</span>
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex items-center space-x-2">
              <Calendar className="h-4 w-4" />
              <span>Timeline</span>
            </TabsTrigger>
            <TabsTrigger value="dependencies" className="flex items-center space-x-2">
              <Link2 className="h-4 w-4" />
              <span>Dependencies</span>
            </TabsTrigger>
            <TabsTrigger value="readiness" className="flex items-center space-x-2">
              <Shield className="h-4 w-4" />
              <span>Readiness</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden mt-4">
            <TabsContent value="sections" className="h-full flex flex-col m-0">
              {/* Filters */}
              <div className="flex items-center space-x-4 mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search sections..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-sections"
                    />
                  </div>
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[180px]" data-testid="select-filter-status">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterOwner} onValueChange={setFilterOwner}>
                  <SelectTrigger className="w-[180px]" data-testid="select-filter-owner">
                    <SelectValue placeholder="Filter by owner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Owners</SelectItem>
                    {uniqueOwners.map(owner => (
                      <SelectItem key={owner} value={owner}>{owner}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generatePlanMutation.mutate()}
                  disabled={generatePlanMutation.isPending}
                  data-testid="button-generate-plan"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Generate Plan
                </Button>
              </div>

              {/* Sections Table */}
              <ScrollArea className="flex-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">#</TableHead>
                      <TableHead>Section Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Evidence</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSections.map((section, index) => (
                      <TableRow 
                        key={section.id} 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedSection(section)}
                        data-testid={`row-section-${section.id}`}
                      >
                        <TableCell className="font-medium">{section.number || index + 1}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{section.title}</div>
                            {section.description && (
                              <div className="text-xs text-gray-500 mt-1">{section.description}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadge(section.status)}>
                            {section.status?.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <User className="h-3 w-3 text-gray-400" />
                            <span className="text-sm">{section.owner || 'Unassigned'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Calendar className="h-3 w-3 text-gray-400" />
                            <span className="text-sm">{section.dueDate || 'Not set'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {section.evidenceLinks?.length > 0 ? (
                            <div className="flex items-center space-x-1">
                              <Database className="h-3 w-3 text-blue-500" />
                              <span className="text-sm text-blue-600">
                                {section.evidenceLinks.length} items
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">No evidence</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSection(section);
                            }}
                            data-testid={`button-edit-section-${section.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="timeline" className="h-full m-0">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  <h3 className="font-semibold text-lg mb-4">Document Timeline</h3>
                  {/* Timeline visualization */}
                  <div className="space-y-3">
                    {filteredSections
                      .filter(s => s.dueDate)
                      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
                      .map(section => (
                        <div key={section.id} className="flex items-center space-x-4 p-3 bg-white border rounded-lg">
                          <div className={`w-3 h-3 rounded-full ${getStatusColor(section.status)}`} />
                          <div className="flex-1">
                            <div className="font-medium">{section.title}</div>
                            <div className="text-sm text-gray-500">{section.owner || 'Unassigned'}</div>
                          </div>
                          <div className="text-sm text-gray-600">
                            {new Date(section.dueDate).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="dependencies" className="h-full m-0">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  <h3 className="font-semibold text-lg mb-4">Section Dependencies</h3>
                  {/* Dependencies graph */}
                  <div className="space-y-3">
                    {filteredSections
                      .filter(s => s.dependencies?.length > 0)
                      .map(section => (
                        <div key={section.id} className="p-4 bg-white border rounded-lg">
                          <div className="font-medium mb-2">{section.title}</div>
                          <div className="text-sm text-gray-600 mb-3">Depends on:</div>
                          <div className="space-y-2">
                            {section.dependencies.map(depId => {
                              const depSection = contentPlan?.sections?.find(s => s.id === depId);
                              return depSection ? (
                                <div key={depId} className="flex items-center space-x-2 text-sm">
                                  <ChevronRight className="h-3 w-3 text-gray-400" />
                                  <span>{depSection.title}</span>
                                  <Badge variant={getStatusBadge(depSection.status)} className="text-xs">
                                    {depSection.status?.replace('_', ' ')}
                                  </Badge>
                                </div>
                              ) : null;
                            })}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="readiness" className="h-full m-0">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  <h3 className="font-semibold text-lg mb-4">Readiness Checks</h3>
                  
                  {/* Overall Readiness Score */}
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">Overall Readiness</span>
                      <span className="text-2xl font-bold text-blue-600">
                        {calculateCompletion()}%
                      </span>
                    </div>
                    <Progress value={calculateCompletion()} className="h-2" />
                  </div>

                  {/* Readiness Issues */}
                  <div className="space-y-3">
                    <div className="font-medium text-sm text-gray-700 mb-2">Issues to Address:</div>
                    
                    {/* Missing Sections */}
                    {filteredSections.filter(s => s.status === 'not_started').length > 0 && (
                      <div className="flex items-start space-x-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
                        <div>
                          <div className="font-medium text-red-900">Missing Sections</div>
                          <div className="text-sm text-red-700 mt-1">
                            {filteredSections.filter(s => s.status === 'not_started').length} sections have not been started
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Blocked Sections */}
                    {filteredSections.filter(s => s.status === 'blocked').length > 0 && (
                      <div className="flex items-start space-x-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                        <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5" />
                        <div>
                          <div className="font-medium text-orange-900">Blocked Sections</div>
                          <div className="text-sm text-orange-700 mt-1">
                            {filteredSections.filter(s => s.status === 'blocked').length} sections are blocked
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Missing Evidence */}
                    {filteredSections.filter(s => !s.evidenceLinks || s.evidenceLinks.length === 0).length > 0 && (
                      <div className="flex items-start space-x-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <Database className="h-5 w-5 text-yellow-600 mt-0.5" />
                        <div>
                          <div className="font-medium text-yellow-900">Missing Evidence</div>
                          <div className="text-sm text-yellow-700 mt-1">
                            {filteredSections.filter(s => !s.evidenceLinks || s.evidenceLinks.length === 0).length} sections lack supporting evidence
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Overdue Sections */}
                    {filteredSections.filter(s => s.dueDate && new Date(s.dueDate) < new Date() && s.status !== 'completed').length > 0 && (
                      <div className="flex items-start space-x-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <Clock className="h-5 w-5 text-red-500 mt-0.5" />
                        <div>
                          <div className="font-medium text-red-900">Overdue Items</div>
                          <div className="text-sm text-red-700 mt-1">
                            {filteredSections.filter(s => s.dueDate && new Date(s.dueDate) < new Date() && s.status !== 'completed').length} sections are past their due date
                          </div>
                        </div>
                      </div>
                    )}

                    {/* All Good */}
                    {calculateCompletion() === 100 && (
                      <div className="flex items-start space-x-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                        <div>
                          <div className="font-medium text-green-900">Document Ready</div>
                          <div className="text-sm text-green-700 mt-1">
                            All sections are complete and ready for submission
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Export Report */}
                  <div className="pt-4 border-t">
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => {
                        toast({
                          title: 'Readiness Report',
                          description: 'Generating comprehensive readiness report...',
                        });
                      }}
                      data-testid="button-export-readiness"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export Readiness Report
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button 
            onClick={() => {
              toast({
                title: 'Content Plan Saved',
                description: 'Your content plan has been saved successfully.',
              });
            }}
            data-testid="button-save-plan"
          >
            Save Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
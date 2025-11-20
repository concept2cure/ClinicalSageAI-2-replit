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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  User,
  Calendar,
  Tag,
  FileText,
  Brain,
  Sparkles,
  Search,
  Plus,
  Edit,
  Trash,
  Download,
  Flag,
  AlertTriangle,
  TrendingUp,
  Filter,
  Eye,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useQuery, useMutation } from '@tanstack/react-query';

export default function CommitmentExtractor({ isOpen, onClose, documentId, documentContent }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('commitments');
  const [selectedCommitment, setSelectedCommitment] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOwner, setFilterOwner] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [isExtracting, setIsExtracting] = useState(false);

  // Fetch existing commitments
  const { data: commitments, isLoading, refetch } = useQuery({
    queryKey: ['/api/commitments', documentId],
    enabled: !!documentId && isOpen,
  });

  // Fetch team members for owner assignment
  const { data: teamMembers } = useQuery({
    queryKey: ['/api/team-members'],
    enabled: isOpen,
  });

  // Extract commitments mutation
  const extractMutation = useMutation({
    mutationFn: async () => {
      setIsExtracting(true);
      return apiRequest(`/api/commitments/extract`, {
        method: 'POST',
        body: JSON.stringify({ 
          documentId,
          content: documentContent,
          extractType: activeTab // 'commitments', 'assumptions', or 'both'
        }),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['/api/commitments', documentId]);
      toast({
        title: 'Extraction Complete',
        description: `Found ${data.commitments?.length || 0} commitments and ${data.assumptions?.length || 0} assumptions`,
      });
      setIsExtracting(false);
    },
    onError: () => {
      toast({
        title: 'Extraction Failed',
        description: 'Failed to extract commitments from document',
        variant: 'destructive',
      });
      setIsExtracting(false);
    },
  });

  // Update commitment mutation
  const updateCommitmentMutation = useMutation({
    mutationFn: async (commitment) => {
      return apiRequest(`/api/commitments/${commitment.id}`, {
        method: 'PATCH',
        body: JSON.stringify(commitment),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['/api/commitments', documentId]);
      toast({
        title: 'Commitment Updated',
        description: 'Commitment has been updated successfully.',
      });
      setSelectedCommitment(null);
    },
  });

  // Delete commitment mutation
  const deleteCommitmentMutation = useMutation({
    mutationFn: async (commitmentId) => {
      return apiRequest(`/api/commitments/${commitmentId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['/api/commitments', documentId]);
      toast({
        title: 'Commitment Deleted',
        description: 'Commitment has been removed.',
      });
    },
  });

  // Filter commitments based on search and filters
  const filteredCommitments = commitments?.filter(commitment => {
    const matchesSearch = commitment.text?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          commitment.context?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOwner = filterOwner === 'all' || commitment.owner === filterOwner;
    const matchesStatus = filterStatus === 'all' || commitment.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || commitment.priority === filterPriority;
    const matchesTab = activeTab === 'both' || commitment.type === activeTab;
    
    return matchesSearch && matchesOwner && matchesStatus && matchesPriority && matchesTab;
  }) || [];

  // Get unique owners for filter
  const uniqueOwners = [...new Set(commitments?.map(c => c.owner).filter(Boolean))] || [];

  // Priority color mapping
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  // Status badge variant
  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'in_progress': return 'default';
      case 'pending': return 'warning';
      case 'overdue': return 'destructive';
      default: return 'secondary';
    }
  };

  // Calculate statistics
  const stats = {
    total: filteredCommitments.length,
    pending: filteredCommitments.filter(c => c.status === 'pending').length,
    inProgress: filteredCommitments.filter(c => c.status === 'in_progress').length,
    completed: filteredCommitments.filter(c => c.status === 'completed').length,
    overdue: filteredCommitments.filter(c => c.status === 'overdue').length,
    critical: filteredCommitments.filter(c => c.priority === 'critical').length,
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Brain className="h-5 w-5 text-purple-500" />
              <span>Commitment & Assumption Extractor</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => extractMutation.mutate()}
              disabled={isExtracting || extractMutation.isPending}
              data-testid="button-extract-commitments"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {isExtracting ? 'Extracting...' : 'AI Extract'}
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Statistics Overview */}
        <div className="grid grid-cols-6 gap-2 mb-4">
          <Card className="p-2">
            <CardContent className="p-0">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-gray-500">Total</div>
            </CardContent>
          </Card>
          <Card className="p-2">
            <CardContent className="p-0">
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
              <div className="text-xs text-gray-500">Pending</div>
            </CardContent>
          </Card>
          <Card className="p-2">
            <CardContent className="p-0">
              <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
              <div className="text-xs text-gray-500">In Progress</div>
            </CardContent>
          </Card>
          <Card className="p-2">
            <CardContent className="p-0">
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <div className="text-xs text-gray-500">Completed</div>
            </CardContent>
          </Card>
          <Card className="p-2">
            <CardContent className="p-0">
              <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
              <div className="text-xs text-gray-500">Overdue</div>
            </CardContent>
          </Card>
          <Card className="p-2">
            <CardContent className="p-0">
              <div className="text-2xl font-bold text-orange-600">{stats.critical}</div>
              <div className="text-xs text-gray-500">Critical</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="commitments">Commitments</TabsTrigger>
            <TabsTrigger value="assumptions">Assumptions</TabsTrigger>
            <TabsTrigger value="both">All Items</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden mt-4">
            {/* Filters */}
            <div className="flex items-center space-x-4 mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search commitments..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-commitments"
                  />
                </div>
              </div>
              <Select value={filterOwner} onValueChange={setFilterOwner}>
                <SelectTrigger className="w-[150px]" data-testid="select-filter-owner">
                  <SelectValue placeholder="Owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  {uniqueOwners.map(owner => (
                    <SelectItem key={owner} value={owner}>{owner}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px]" data-testid="select-filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-[150px]" data-testid="select-filter-priority">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Commitments Table */}
            <ScrollArea className="flex-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox />
                    </TableHead>
                    <TableHead className="w-[80px]">Type</TableHead>
                    <TableHead>Text</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCommitments.map((commitment) => (
                    <TableRow 
                      key={commitment.id} 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedCommitment(commitment)}
                      data-testid={`row-commitment-${commitment.id}`}
                    >
                      <TableCell>
                        <Checkbox 
                          checked={commitment.status === 'completed'}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCommitmentMutation.mutate({
                              ...commitment,
                              status: commitment.status === 'completed' ? 'pending' : 'completed'
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant={commitment.type === 'commitment' ? 'default' : 'secondary'}>
                          {commitment.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-md">
                          <div className="font-medium truncate">{commitment.text}</div>
                          {commitment.context && (
                            <div className="text-xs text-gray-500 mt-1 truncate">
                              Context: {commitment.context}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          <User className="h-3 w-3 text-gray-400" />
                          <span className="text-sm">{commitment.owner || 'Unassigned'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-3 w-3 text-gray-400" />
                          <span className="text-sm">
                            {commitment.dueDate ? 
                              new Date(commitment.dueDate).toLocaleDateString() : 
                              'No due date'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(commitment.priority)}`}>
                          {commitment.priority === 'critical' && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {commitment.priority?.toUpperCase()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadge(commitment.status)}>
                          {commitment.status?.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCommitment(commitment);
                            }}
                            data-testid={`button-edit-commitment-${commitment.id}`}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteCommitmentMutation.mutate(commitment.id);
                            }}
                            data-testid={`button-delete-commitment-${commitment.id}`}
                          >
                            <Trash className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </Tabs>

        {/* Edit Commitment Dialog */}
        {selectedCommitment && (
          <Dialog open={!!selectedCommitment} onOpenChange={() => setSelectedCommitment(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit {selectedCommitment.type}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Text</Label>
                  <Textarea
                    value={selectedCommitment.text}
                    onChange={(e) => setSelectedCommitment({
                      ...selectedCommitment,
                      text: e.target.value
                    })}
                    rows={3}
                    data-testid="textarea-commitment-text"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Owner</Label>
                    <Select 
                      value={selectedCommitment.owner || ''} 
                      onValueChange={(value) => setSelectedCommitment({
                        ...selectedCommitment,
                        owner: value
                      })}
                    >
                      <SelectTrigger data-testid="select-commitment-owner">
                        <SelectValue placeholder="Select owner" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamMembers?.map(member => (
                          <SelectItem key={member.id} value={member.name}>
                            {member.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Due Date</Label>
                    <Input
                      type="date"
                      value={selectedCommitment.dueDate?.split('T')[0] || ''}
                      onChange={(e) => setSelectedCommitment({
                        ...selectedCommitment,
                        dueDate: e.target.value
                      })}
                      data-testid="input-commitment-due-date"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Priority</Label>
                    <Select 
                      value={selectedCommitment.priority || 'medium'} 
                      onValueChange={(value) => setSelectedCommitment({
                        ...selectedCommitment,
                        priority: value
                      })}
                    >
                      <SelectTrigger data-testid="select-commitment-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select 
                      value={selectedCommitment.status || 'pending'} 
                      onValueChange={(value) => setSelectedCommitment({
                        ...selectedCommitment,
                        status: value
                      })}
                    >
                      <SelectTrigger data-testid="select-commitment-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="overdue">Overdue</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Context/Notes</Label>
                  <Textarea
                    value={selectedCommitment.context || ''}
                    onChange={(e) => setSelectedCommitment({
                      ...selectedCommitment,
                      context: e.target.value
                    })}
                    rows={2}
                    placeholder="Additional context or notes..."
                    data-testid="textarea-commitment-context"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedCommitment(null)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => updateCommitmentMutation.mutate(selectedCommitment)}
                  disabled={updateCommitmentMutation.isPending}
                  data-testid="button-save-commitment"
                >
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              // Export commitments to CSV
              const csv = filteredCommitments.map(c => 
                `"${c.type}","${c.text}","${c.owner || ''}","${c.dueDate || ''}","${c.priority}","${c.status}"`
              ).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'commitments.csv';
              a.click();
            }}
            data-testid="button-export-commitments"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
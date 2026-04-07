/**
 * Label Impact Simulator Component
 * 
 * SPL document management, section comparison, and labeling change impact analysis.
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  GitCompare,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Eye,
  ArrowRight,
  Diff,
  Info,
  History,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Types
interface SPLDocument {
  id: string;
  document_id: string;
  set_id: string;
  version_number: number;
  effective_date: string;
  document_title: string;
  document_type: string;
  status: 'draft' | 'review' | 'approved' | 'obsolete';
  created_at: string;
  section_count?: number;
}

interface SPLSection {
  id: string;
  section_id: string;
  section_name: string;
  section_number: string;
  section_text: string;
  display_order: number;
}

interface LabelChange {
  id: string;
  change_type: string;
  section_id: string;
  section_name: string;
  previous_text: string;
  new_text: string;
  reason_for_change: string;
  regulatory_requirement: boolean;
  status: 'proposed' | 'approved' | 'implemented' | 'rejected';
  created_at: string;
}

interface ImpactSimulation {
  id: string;
  simulation_name: string;
  from_document_id: string;
  to_document_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  overall_impact_score: number;
  risk_assessment: string;
  recommendations: any;
  created_at: string;
}

// Impact Score Gauge
function ImpactGauge({ score, label }: { score: number; label: string }) {
  const getColor = (score: number) => {
    if (score <= 30) return 'text-green-500';
    if (score <= 60) return 'text-yellow-500';
    if (score <= 80) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <div className="text-center">
      <div className={`text-4xl font-bold ${getColor(score)}`}>
        {score?.toFixed(0) || '-'}
      </div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="w-full bg-muted rounded-full h-2 mt-2">
        <div 
          className={`h-2 rounded-full transition-all ${
            score <= 30 ? 'bg-green-500' :
            score <= 60 ? 'bg-yellow-500' :
            score <= 80 ? 'bg-orange-500' : 'bg-red-500'
          }`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
    </div>
  );
}

// Status Badge
function StatusBadge({ status, type }: { status: string; type: 'document' | 'change' | 'simulation' }) {
  const variants: Record<string, Record<string, string>> = {
    document: {
      draft: 'bg-gray-100 text-gray-800',
      review: 'bg-blue-100 text-blue-800',
      approved: 'bg-green-100 text-green-800',
      obsolete: 'bg-red-100 text-red-800',
    },
    change: {
      proposed: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      implemented: 'bg-blue-100 text-blue-800',
      rejected: 'bg-red-100 text-red-800',
    },
    simulation: {
      pending: 'bg-gray-100 text-gray-800',
      running: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    }
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${variants[type][status] || 'bg-gray-100'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// Diff Viewer Component
function DiffViewer({ previous, current }: { previous: string; current: string }) {
  const previousLines = (previous || '').split('\n');
  const currentLines = (current || '').split('\n');
  
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1">
        <Label className="text-red-600">Previous Version</Label>
        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg font-mono text-sm">
          {previousLines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">
              <span className="text-red-400 mr-2">-</span>
              {line}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-green-600">New Version</Label>
        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg font-mono text-sm">
          {currentLines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">
              <span className="text-green-400 mr-2">+</span>
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Document List Component
function DocumentList({ 
  documents, 
  selectedId, 
  onSelect 
}: { 
  documents: SPLDocument[]; 
  selectedId?: string;
  onSelect: (doc: SPLDocument) => void;
}) {
  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className={`p-3 border rounded-lg cursor-pointer transition-all hover:bg-muted/50 ${
            selectedId === doc.id ? 'border-primary bg-muted/50' : ''
          }`}
          onClick={() => onSelect(doc)}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-sm">{doc.document_title}</p>
              <p className="text-xs text-muted-foreground">
                v{doc.version_number} • {doc.document_type}
              </p>
            </div>
            <StatusBadge status={doc.status} type="document" />
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <span>{new Date(doc.effective_date).toLocaleDateString()}</span>
            {doc.section_count && (
              <>
                <span>•</span>
                <span>{doc.section_count} sections</span>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Simulation Results Component
function SimulationResults({ simulationId }: { simulationId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['simulation', simulationId],
    queryFn: async () => {
      const response = await fetch(`/api/gcc/labeling/simulations/${simulationId}`);
      if (!response.ok) throw new Error('Failed to fetch simulation');
      return response.json();
    },
    refetchInterval: (query) => {
      const status = query.state.data?.simulation?.status;
      return status === 'running' || status === 'pending' ? 2000 : false;
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const sim = data?.simulation;
  if (!sim) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{sim.simulation_name}</h3>
          <p className="text-sm text-muted-foreground">
            Created {new Date(sim.created_at).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={sim.status} type="simulation" />
      </div>

      {sim.status === 'running' && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
            <span>Analyzing label impact...</span>
          </div>
        </div>
      )}

      {sim.status === 'completed' && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <ImpactGauge score={sim.overall_impact_score} label="Overall Impact" />
              </CardContent>
            </Card>
            
            <Card className="col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Risk Assessment</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{sim.risk_assessment || 'No significant risks identified.'}</p>
              </CardContent>
            </Card>
          </div>

          {sim.recommendations && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {(Array.isArray(sim.recommendations) ? sim.recommendations : [sim.recommendations]).map((rec: any, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{typeof rec === 'string' ? rec : rec.text || JSON.stringify(rec)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// New Simulation Dialog
function NewSimulationDialog({ 
  documents, 
  onSimulate 
}: { 
  documents: SPLDocument[];
  onSimulate: (fromId: string, toId: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fromDoc, setFromDoc] = useState<string>('');
  const [toDoc, setToDoc] = useState<string>('');
  const [simName, setSimName] = useState('');

  const handleSubmit = () => {
    if (fromDoc && toDoc) {
      onSimulate(fromDoc, toDoc, simName || `Comparison ${new Date().toLocaleDateString()}`);
      setOpen(false);
      setFromDoc('');
      setToDoc('');
      setSimName('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <GitCompare className="h-4 w-4 mr-2" />
          New Simulation
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Impact Simulation</DialogTitle>
          <DialogDescription>
            Compare two label versions to analyze the impact of changes
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Simulation Name</Label>
            <Input
              value={simName}
              onChange={(e) => setSimName(e.target.value)}
              placeholder="Enter simulation name"
            />
          </div>
          
          <div className="space-y-2">
            <Label>From Document (Previous)</Label>
            <Select value={fromDoc} onValueChange={setFromDoc}>
              <SelectTrigger>
                <SelectValue placeholder="Select previous version" />
              </SelectTrigger>
              <SelectContent>
                {documents.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.document_title} v{doc.version_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center justify-center">
            <ArrowRight className="h-6 w-6 text-muted-foreground" />
          </div>
          
          <div className="space-y-2">
            <Label>To Document (New)</Label>
            <Select value={toDoc} onValueChange={setToDoc}>
              <SelectTrigger>
                <SelectValue placeholder="Select new version" />
              </SelectTrigger>
              <SelectContent>
                {documents.filter(d => d.id !== fromDoc).map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.document_title} v{doc.version_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!fromDoc || !toDoc}>
            <Zap className="h-4 w-4 mr-2" />
            Run Simulation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Section Viewer Component
function SectionViewer({ documentId }: { documentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['spl-sections', documentId],
    queryFn: async () => {
      const response = await fetch(`/api/gcc/labeling/documents/${documentId}/sections`);
      if (!response.ok) throw new Error('Failed to fetch sections');
      return response.json();
    },
    enabled: !!documentId,
  });

  const sections: SPLSection[] = data?.sections || [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
        <p>No sections found for this document.</p>
        <p className="text-sm mt-1">Sections will appear here once the document is populated.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-3">
        {sections
          .sort((a, b) => a.display_order - b.display_order)
          .map((section) => (
            <div key={section.id} className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-xs font-mono">
                  {section.section_number}
                </Badge>
                <span className="font-medium text-sm">{section.section_name}</span>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                {section.section_text || 'No content'}
              </p>
            </div>
          ))}
      </div>
    </ScrollArea>
  );
}

// Main Dashboard Component
export default function LabelImpactSimulator({ programId }: { programId?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDocument, setSelectedDocument] = useState<SPLDocument | null>(null);
  const [selectedSimulation, setSelectedSimulation] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('documents');

  // Fetch documents
  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ['spl-documents', programId],
    queryFn: async () => {
      const params = programId ? `?programId=${programId}` : '';
      const response = await fetch(`/api/gcc/labeling/documents${params}`);
      if (!response.ok) throw new Error('Failed to fetch documents');
      return response.json();
    }
  });

  // Fetch changes
  const { data: changesData, isLoading: changesLoading } = useQuery({
    queryKey: ['label-changes', selectedDocument?.id],
    queryFn: async () => {
      if (!selectedDocument) return { changes: [] };
      const response = await fetch(`/api/gcc/labeling/changes?documentId=${selectedDocument.id}`);
      if (!response.ok) throw new Error('Failed to fetch changes');
      return response.json();
    },
    enabled: !!selectedDocument
  });

  // Fetch simulations
  const { data: simsData, isLoading: simsLoading, refetch: refetchSims } = useQuery({
    queryKey: ['simulations', programId],
    queryFn: async () => {
      const params = programId ? `?programId=${programId}` : '';
      const response = await fetch(`/api/gcc/labeling/simulations${params}`);
      if (!response.ok) throw new Error('Failed to fetch simulations');
      return response.json();
    }
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['labeling-stats', programId],
    queryFn: async () => {
      const params = programId ? `?programId=${programId}` : '';
      const response = await fetch(`/api/gcc/labeling/stats${params}`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    }
  });

  // Create simulation mutation
  const simulateMutation = useMutation({
    mutationFn: async ({ fromId, toId, name }: { fromId: string; toId: string; name: string }) => {
      const response = await fetch('/api/gcc/labeling/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromDocumentId: fromId,
          toDocumentId: toId,
          simulationName: name
        })
      });
      if (!response.ok) throw new Error('Failed to create simulation');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Simulation Started',
        description: 'Impact analysis is now running'
      });
      setSelectedSimulation(data.simulation.id);
      setActiveTab('simulations');
      refetchSims();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const stats = statsData?.stats || {};
  const documents = docsData?.documents || [];
  const changes = changesData?.changes || [];
  const simulations = simsData?.simulations || [];

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">SPL Documents</p>
                <p className="text-3xl font-bold">{stats.total_documents || 0}</p>
              </div>
              <FileText className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approved</p>
                <p className="text-3xl font-bold text-green-600">{stats.approved_documents || 0}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Changes</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.pending_changes || 0}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Simulations</p>
                <p className="text-3xl font-bold">{stats.total_simulations || 0}</p>
              </div>
              <GitCompare className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Impact</p>
                <p className="text-3xl font-bold">{stats.avg_impact_score?.toFixed(0) || '-'}</p>
              </div>
              <Zap className="h-8 w-8 text-orange-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Input placeholder="Search labels..." className="w-64" />
        </div>
        
        <div className="flex items-center gap-2">
          <NewSimulationDialog
            documents={documents}
            onSimulate={(fromId, toId, name) => 
              simulateMutation.mutate({ fromId, toId, name })
            }
          />
          <Button variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            New Document
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Left Column - Document/Simulation List */}
        <div className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="documents">
                <FileText className="h-4 w-4 mr-2" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="simulations">
                <GitCompare className="h-4 w-4 mr-2" />
                Simulations
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="documents" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">SPL Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    {docsLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map(i => (
                          <Skeleton key={i} className="h-20 w-full" />
                        ))}
                      </div>
                    ) : documents.length > 0 ? (
                      <DocumentList
                        documents={documents}
                        selectedId={selectedDocument?.id}
                        onSelect={setSelectedDocument}
                      />
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No SPL documents found
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="simulations" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Impact Simulations</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    {simsLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map(i => (
                          <Skeleton key={i} className="h-20 w-full" />
                        ))}
                      </div>
                    ) : simulations.length > 0 ? (
                      <div className="space-y-2">
                        {simulations.map((sim: ImpactSimulation) => (
                          <div
                            key={sim.id}
                            className={`p-3 border rounded-lg cursor-pointer transition-all hover:bg-muted/50 ${
                              selectedSimulation === sim.id ? 'border-primary bg-muted/50' : ''
                            }`}
                            onClick={() => setSelectedSimulation(sim.id)}
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-medium text-sm">{sim.simulation_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(sim.created_at).toLocaleString()}
                                </p>
                              </div>
                              <StatusBadge status={sim.status} type="simulation" />
                            </div>
                            {sim.status === 'completed' && (
                              <div className="mt-2 flex items-center gap-2">
                                <span className={`font-bold ${
                                  sim.overall_impact_score <= 30 ? 'text-green-500' :
                                  sim.overall_impact_score <= 60 ? 'text-yellow-500' :
                                  'text-red-500'
                                }`}>
                                  Impact: {sim.overall_impact_score}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No simulations yet. Create one to compare labels.
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column - Details */}
        <div className="col-span-2">
          {activeTab === 'documents' && selectedDocument ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{selectedDocument.document_title}</CardTitle>
                    <CardDescription>
                      Version {selectedDocument.version_number} • {selectedDocument.document_type}
                    </CardDescription>
                  </div>
                  <StatusBadge status={selectedDocument.status} type="document" />
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="changes">
                  <TabsList>
                    <TabsTrigger value="changes">
                      <History className="h-4 w-4 mr-2" />
                      Changes ({changes.length})
                    </TabsTrigger>
                    <TabsTrigger value="sections">
                      <FileText className="h-4 w-4 mr-2" />
                      Sections
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="changes" className="mt-4">
                    {changesLoading ? (
                      <div className="space-y-2">
                        {[1, 2].map(i => (
                          <Skeleton key={i} className="h-32 w-full" />
                        ))}
                      </div>
                    ) : changes.length > 0 ? (
                      <div className="space-y-4">
                        {changes.map((change: LabelChange) => (
                          <div key={change.id} className="border rounded-lg p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <Badge variant="outline">{change.change_type}</Badge>
                                <span className="ml-2 text-sm">{change.section_name}</span>
                              </div>
                              <StatusBadge status={change.status} type="change" />
                            </div>
                            
                            <p className="text-sm text-muted-foreground mb-4">
                              {change.reason_for_change}
                            </p>
                            
                            {change.previous_text && change.new_text && (
                              <DiffViewer 
                                previous={change.previous_text}
                                current={change.new_text}
                              />
                            )}
                            
                            <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                              {change.regulatory_requirement && (
                                <Badge variant="secondary" className="text-xs">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Regulatory
                                </Badge>
                              )}
                              <span>{new Date(change.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No changes tracked for this document
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="sections" className="mt-4">
                    <SectionViewer documentId={selectedDocument.id} />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : activeTab === 'simulations' && selectedSimulation ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitCompare className="h-5 w-5" />
                  Impact Analysis Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SimulationResults simulationId={selectedSimulation} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                {activeTab === 'documents' ? (
                  <>
                    <FileText className="h-12 w-12 mb-4 opacity-50" />
                    <p>Select a document to view details</p>
                  </>
                ) : (
                  <>
                    <GitCompare className="h-12 w-12 mb-4 opacity-50" />
                    <p>Select a simulation to view results</p>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

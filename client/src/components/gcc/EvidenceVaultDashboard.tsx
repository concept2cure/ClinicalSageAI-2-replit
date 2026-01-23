/**
 * Evidence Vault Dashboard Component
 * 
 * Document management interface with search capabilities.
 * Supports semantic, full-text, and hybrid search.
 */
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
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
  Search,
  Upload,
  FileText,
  Database,
  Cpu,
  CheckCircle,
  Clock,
  AlertCircle,
  Download,
  Trash2,
  Eye,
  Sparkles,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

// Types
interface Document {
  id: string;
  title: string;
  document_type: string;
  classification: string;
  file_name: string;
  file_type: string;
  file_size: number;
  is_vectorized: boolean;
  chunk_count: number;
  status: string;
  created_at: string;
}

interface SearchResult {
  document_id: string;
  document_title: string;
  chunk_content: string;
  similarity_score: number;
  chunk_index: number;
}

interface VaultStats {
  total_documents: number;
  vectorized_documents: number;
  total_chunks: number;
  total_bytes: number;
  pending_jobs: number;
  processing_jobs: number;
  searches_24h: number;
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Search Component
function VaultSearch({ programId }: { programId?: string }) {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'fulltext' | 'semantic' | 'hybrid'>('fulltext');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    try {
      const endpoint = `/api/gcc/vault/search/${searchType}`;
      const body: any = { query, programId, limit: 20 };
      
      // For semantic/hybrid search, we'd need to generate embeddings client-side
      // or have the server do it. For now, using fulltext.
      if (searchType !== 'fulltext') {
        toast({
          title: 'Note',
          description: 'Semantic search requires embedding generation. Using full-text for now.',
        });
        body.query = query;
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) throw new Error('Search failed');
      
      const data = await response.json();
      setResults(data.results || []);
      
      if (data.results?.length === 0) {
        toast({
          title: 'No Results',
          description: 'No documents matched your search query.',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Search Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Document Search
        </CardTitle>
        <CardDescription>
          Search across all documents in the Evidence Vault
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="Enter your search query..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <Select value={searchType} onValueChange={(v) => setSearchType(v as any)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fulltext">Full Text</SelectItem>
              <SelectItem value="semantic">Semantic</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleSearch} disabled={isSearching}>
            {isSearching ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>
        
        {results.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {results.length} results found
            </div>
            <div className="border rounded-lg divide-y max-h-96 overflow-auto">
              {results.map((result, index) => (
                <div key={index} className="p-3 hover:bg-muted/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{result.document_title}</span>
                    {result.similarity_score && (
                      <Badge variant="secondary">
                        {(result.similarity_score * 100).toFixed(1)}% match
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {result.chunk_content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Documents List Component
function DocumentsList({ programId }: { programId?: string }) {
  const { toast } = useToast();
  
  const { data: documentsData, isLoading, refetch } = useQuery({
    queryKey: ['vault-documents', programId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (programId) params.append('programId', programId);
      params.append('limit', '50');
      
      const response = await fetch(`/api/gcc/vault/documents?${params}`);
      if (!response.ok) throw new Error('Failed to fetch documents');
      return response.json();
    }
  });

  const vectorizeMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await fetch(`/api/gcc/vault/documents/${documentId}/vectorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: 'high' })
      });
      if (!response.ok) throw new Error('Failed to queue vectorization');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Vectorization Queued',
        description: 'Document has been queued for processing'
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Chunks</TableHead>
          <TableHead>Uploaded</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documentsData?.documents?.map((doc: Document) => (
          <TableRow key={doc.id}>
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-500" />
                {doc.title}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{doc.document_type}</Badge>
            </TableCell>
            <TableCell>{formatFileSize(doc.file_size)}</TableCell>
            <TableCell>
              {doc.is_vectorized ? (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Vectorized
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <Clock className="h-3 w-3 mr-1" />
                  Pending
                </Badge>
              )}
            </TableCell>
            <TableCell>{doc.chunk_count || '-'}</TableCell>
            <TableCell className="text-muted-foreground">
              {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="icon">
                  <Eye className="h-4 w-4" />
                </Button>
                {!doc.is_vectorized && (
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => vectorizeMutation.mutate(doc.id)}
                    disabled={vectorizeMutation.isPending}
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
        
        {(!documentsData?.documents || documentsData.documents.length === 0) && (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
              No documents in the vault. Upload your first document to get started.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

// Worker Status Component
function WorkerStatus() {
  const { data: status, isLoading } = useQuery({
    queryKey: ['vault-worker-status'],
    queryFn: async () => {
      const response = await fetch('/api/gcc/vault/worker/status');
      if (!response.ok) throw new Error('Failed to fetch worker status');
      return response.json();
    },
    refetchInterval: 5000 // Poll every 5 seconds
  });

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  const s = status?.status || {};
  const total = (s.pending || 0) + (s.processing || 0) + (s.completed || 0) + (s.failed || 0);
  const completedPercent = total > 0 ? ((s.completed || 0) / total) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Cpu className="h-4 w-4" />
          Vectorization Worker
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={completedPercent} className="h-2" />
        
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-lg font-bold text-yellow-600">{s.pending || 0}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </div>
          <div>
            <div className="text-lg font-bold text-blue-600">{s.processing || 0}</div>
            <div className="text-xs text-muted-foreground">Processing</div>
          </div>
          <div>
            <div className="text-lg font-bold text-green-600">{s.completed || 0}</div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </div>
          <div>
            <div className="text-lg font-bold text-red-600">{s.failed || 0}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
        </div>
        
        {s.avg_processing_seconds && (
          <div className="text-xs text-center text-muted-foreground">
            Avg processing time: {s.avg_processing_seconds.toFixed(1)}s
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Main Dashboard Component
export default function EvidenceVaultDashboard({ programId }: { programId?: string }) {
  const { toast } = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);

  // Fetch vault stats
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['vault-stats'],
    queryFn: async () => {
      const response = await fetch('/api/gcc/vault/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    }
  });

  const stats = statsData?.stats as VaultStats | undefined;

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Documents</p>
                <p className="text-3xl font-bold">{stats?.total_documents || 0}</p>
              </div>
              <Database className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Vectorized</p>
                <p className="text-3xl font-bold text-green-600">
                  {stats?.vectorized_documents || 0}
                </p>
              </div>
              <Sparkles className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Chunks</p>
                <p className="text-3xl font-bold">{stats?.total_chunks || 0}</p>
              </div>
              <Zap className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Storage</p>
                <p className="text-3xl font-bold">
                  {formatFileSize(stats?.total_bytes || 0)}
                </p>
              </div>
              <Database className="h-8 w-8 text-orange-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Search */}
          <VaultSearch programId={programId} />
          
          {/* Documents */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Documents</CardTitle>
                  <CardDescription>
                    All documents in the Evidence Vault
                  </CardDescription>
                </div>
                <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Upload Document</DialogTitle>
                      <DialogDescription>
                        Upload a document to the Evidence Vault for storage and vectorization.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="border-2 border-dashed rounded-lg p-8 text-center">
                        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Drag and drop files here, or click to browse
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          PDF, Word, Text files up to 50MB
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setUploadOpen(false)}>
                        Cancel
                      </Button>
                      <Button>Upload</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <DocumentsList programId={programId} />
            </CardContent>
          </Card>
        </div>
        
        {/* Sidebar */}
        <div className="space-y-6">
          <WorkerStatus />
          
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start">
                <RefreshCw className="h-4 w-4 mr-2" />
                Process All Pending
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Download className="h-4 w-4 mr-2" />
                Export Metadata
              </Button>
              <Button variant="outline" className="w-full justify-start text-red-600 hover:text-red-700">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Failed Jobs
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

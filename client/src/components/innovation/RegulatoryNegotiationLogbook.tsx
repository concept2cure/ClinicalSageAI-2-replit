/**
 * Regulatory Negotiation Logbook Component
 * 
 * Structured record of agency correspondence and meeting outcomes
 * with semantic search and position tracking.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle, ArrowRight, BookOpen, Calendar, CheckCircle,
  ChevronRight, Clock, FileText, Filter, MessageSquare, Plus,
  RefreshCw, Search, Send, Target, Users, XCircle,
  Building2, Milestone, AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Types
interface NegotiationThread {
  id: string;
  threadCode: string;
  title: string;
  agency: string;
  division?: string;
  meetingType?: string;
  topic: string;
  status: 'planning' | 'requested' | 'scheduled' | 'active' | 'awaiting_response' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  requestDate?: string;
  meetingDate?: string;
  responseDeadline?: string;
  sponsorLead: string;
  objectivesSummary?: string;
  createdAt: string;
  updatedAt: string;
}

interface NegotiationEntry {
  id: string;
  threadId: string;
  entryNumber: number;
  entryType: string;
  title: string;
  direction: 'outgoing' | 'incoming' | 'internal';
  content: string;
  summary?: string;
  entryDate: string;
  status: 'draft' | 'final' | 'submitted' | 'acknowledged';
}

interface NegotiationPosition {
  id: string;
  threadId: string;
  topic: string;
  sponsorPosition: string;
  fdaPosition?: string;
  status: 'proposed' | 'under_discussion' | 'agreed' | 'disagreed' | 'compromised' | 'withdrawn';
}

interface SearchResult {
  type: 'thread' | 'entry' | 'position';
  id: string;
  title: string;
  snippet: string;
  relevanceScore: number;
  threadId: string;
  threadTitle?: string;
  date: string;
}

interface ThreadStatistics {
  totalThreads: number;
  byStatus: Record<string, number>;
  byAgency: Record<string, number>;
  avgResolutionDays: number;
  positionsAgreed: number;
  positionsDisagreed: number;
  upcomingDeadlines: Array<{ threadId: string; title: string; deadline: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-gray-500',
  requested: 'bg-blue-500',
  scheduled: 'bg-indigo-500',
  active: 'bg-green-500',
  awaiting_response: 'bg-yellow-500',
  resolved: 'bg-emerald-500',
  closed: 'bg-gray-400'
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'secondary',
  medium: 'default',
  high: 'warning',
  critical: 'destructive'
};

const DIRECTION_ICONS: Record<string, React.ReactNode> = {
  outgoing: <Send className="h-4 w-4 text-blue-500" />,
  incoming: <MessageSquare className="h-4 w-4 text-green-500" />,
  internal: <FileText className="h-4 w-4 text-gray-500" />
};

export function RegulatoryNegotiationLogbook({ programId }: { programId: string }) {
  const { toast } = useToast();
  const [threads, setThreads] = useState<NegotiationThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<NegotiationThread | null>(null);
  const [entries, setEntries] = useState<NegotiationEntry[]>([]);
  const [positions, setPositions] = useState<NegotiationPosition[]>([]);
  const [statistics, setStatistics] = useState<ThreadStatistics | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('threads');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [agencyFilter, setAgencyFilter] = useState<string>('all');
  const [showNewThreadDialog, setShowNewThreadDialog] = useState(false);
  const [newThread, setNewThread] = useState({
    title: '',
    agency: 'FDA',
    topic: '',
    meetingType: '',
    priority: 'medium',
    sponsorLead: ''
  });

  // Load data
  useEffect(() => {
    loadData();
  }, [programId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [threadsRes, statsRes] = await Promise.all([
        fetch(`/api/innovation/negotiations/threads?programId=${programId}`),
        fetch(`/api/innovation/negotiations/statistics/${programId}`)
      ]);

      if (threadsRes.ok) {
        const data = await threadsRes.json();
        setThreads(data.data || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStatistics(data.data);
      }
    } catch (error) {
      console.error('Error loading negotiation data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadThreadDetails = async (threadId: string) => {
    try {
      const [entriesRes, positionsRes] = await Promise.all([
        fetch(`/api/innovation/negotiations/threads/${threadId}/entries`),
        fetch(`/api/innovation/negotiations/threads/${threadId}/positions`)
      ]);

      if (entriesRes.ok) {
        const data = await entriesRes.json();
        setEntries(data.data || []);
      }
      if (positionsRes.ok) {
        const data = await positionsRes.json();
        setPositions(data.data || []);
      }
    } catch (error) {
      console.error('Error loading thread details:', error);
    }
  };

  const createThread = async () => {
    try {
      const response = await fetch('/api/innovation/negotiations/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newThread,
          programId
        })
      });

      if (response.ok) {
        const data = await response.json();
        setThreads(prev => [data.data, ...prev]);
        setShowNewThreadDialog(false);
        setNewThread({
          title: '',
          agency: 'FDA',
          topic: '',
          meetingType: '',
          priority: 'medium',
          sponsorLead: ''
        });
        toast({
          title: 'Thread Created',
          description: `Created negotiation thread: ${data.data.threadCode}`
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create thread',
        variant: 'destructive'
      });
    }
  };

  const searchNegotiations = async () => {
    if (!searchTerm) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await fetch(`/api/innovation/negotiations/search?q=${encodeURIComponent(searchTerm)}&programId=${programId}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.data || []);
      }
    } catch (error) {
      console.error('Error searching:', error);
    }
  };

  // Filter threads
  const filteredThreads = useMemo(() => {
    return threads.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (agencyFilter !== 'all' && t.agency !== agencyFilter) return false;
      if (searchTerm && !t.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [threads, statusFilter, agencyFilter, searchTerm]);

  const getStatusLabel = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/10 to-teal-500/10">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Negotiation Logbook</h2>
            <p className="text-muted-foreground">
              Track agency correspondence and meeting outcomes
            </p>
          </div>
        </div>
        <Dialog open={showNewThreadDialog} onOpenChange={setShowNewThreadDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Thread
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Negotiation Thread</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Title</Label>
                <Input
                  value={newThread.title}
                  onChange={(e) => setNewThread({ ...newThread, title: e.target.value })}
                  placeholder="Pre-NDA Meeting for Drug X"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Agency</Label>
                  <Select
                    value={newThread.agency}
                    onValueChange={(v) => setNewThread({ ...newThread, agency: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FDA">FDA</SelectItem>
                      <SelectItem value="EMA">EMA</SelectItem>
                      <SelectItem value="PMDA">PMDA</SelectItem>
                      <SelectItem value="Health Canada">Health Canada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Meeting Type</Label>
                  <Select
                    value={newThread.meetingType}
                    onValueChange={(v) => setNewThread({ ...newThread, meetingType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pre_ind">Pre-IND</SelectItem>
                      <SelectItem value="pre_nda">Pre-NDA</SelectItem>
                      <SelectItem value="type_a">Type A</SelectItem>
                      <SelectItem value="type_b">Type B</SelectItem>
                      <SelectItem value="type_c">Type C</SelectItem>
                      <SelectItem value="written_response">Written Response</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Topic</Label>
                <Textarea
                  value={newThread.topic}
                  onChange={(e) => setNewThread({ ...newThread, topic: e.target.value })}
                  placeholder="Key discussion topics..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Priority</Label>
                  <Select
                    value={newThread.priority}
                    onValueChange={(v) => setNewThread({ ...newThread, priority: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Sponsor Lead</Label>
                  <Input
                    value={newThread.sponsorLead}
                    onChange={(e) => setNewThread({ ...newThread, sponsorLead: e.target.value })}
                    placeholder="Name"
                  />
                </div>
              </div>
              <Button className="w-full" onClick={createThread}>
                Create Thread
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <MessageSquare className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-3xl font-bold">{statistics.totalThreads}</p>
              <p className="text-sm text-muted-foreground">Total Threads</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Clock className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-3xl font-bold">{statistics.avgResolutionDays.toFixed(0)}</p>
              <p className="text-sm text-muted-foreground">Avg Resolution Days</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-500" />
              <p className="text-3xl font-bold">{statistics.positionsAgreed}</p>
              <p className="text-sm text-muted-foreground">Positions Agreed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <XCircle className="h-6 w-6 mx-auto mb-2 text-red-500" />
              <p className="text-3xl font-bold">{statistics.positionsDisagreed}</p>
              <p className="text-sm text-muted-foreground">Positions Disagreed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <AlertCircle className="h-6 w-6 mx-auto mb-2 text-orange-500" />
              <p className="text-3xl font-bold">{statistics.upcomingDeadlines.length}</p>
              <p className="text-sm text-muted-foreground">Upcoming Deadlines</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Upcoming Deadlines Alert */}
      {statistics && statistics.upcomingDeadlines.length > 0 && (
        <Card className="border-orange-500/50 bg-orange-500/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <div className="flex-1">
                <p className="font-medium">Upcoming Deadlines</p>
                <div className="flex items-center gap-4 mt-1">
                  {statistics.upcomingDeadlines.slice(0, 3).map((d) => (
                    <span key={d.threadId} className="text-sm text-muted-foreground">
                      {d.title}: {new Date(d.deadline).toLocaleDateString()}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-6">
        {/* Thread List */}
        <div className="col-span-5 space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search threads..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchNegotiations()}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="awaiting_response">Awaiting</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Thread Cards */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredThreads.map((thread) => (
              <Card
                key={thread.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedThread?.id === thread.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => {
                  setSelectedThread(thread);
                  loadThreadDetails(thread.id);
                }}
              >
                <CardContent className="py-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[thread.status]}`} />
                      <span className="text-xs text-muted-foreground">{thread.threadCode}</span>
                    </div>
                    <Badge variant={PRIORITY_COLORS[thread.priority] as any}>
                      {thread.priority}
                    </Badge>
                  </div>
                  <h4 className="font-medium line-clamp-1">{thread.title}</h4>
                  <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {thread.agency}
                    </span>
                    <span>{getStatusLabel(thread.status)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Thread Detail */}
        <div className="col-span-7">
          {selectedThread ? (
            <Card className="h-full">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={PRIORITY_COLORS[selectedThread.priority] as any}>
                        {selectedThread.priority}
                      </Badge>
                      <Badge variant="outline">
                        {getStatusLabel(selectedThread.status)}
                      </Badge>
                    </div>
                    <CardTitle>{selectedThread.title}</CardTitle>
                    <CardDescription>
                      {selectedThread.threadCode} • {selectedThread.agency}
                      {selectedThread.division && ` - ${selectedThread.division}`}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="timeline">
                  <TabsList className="mb-4">
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                    <TabsTrigger value="positions">Positions ({positions.length})</TabsTrigger>
                    <TabsTrigger value="details">Details</TabsTrigger>
                  </TabsList>

                  <TabsContent value="timeline" className="space-y-3 max-h-[400px] overflow-y-auto">
                    {entries.length === 0 ? (
                      <div className="text-center py-8">
                        <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
                        <p className="text-muted-foreground">No entries yet</p>
                      </div>
                    ) : (
                      entries.map((entry) => (
                        <div key={entry.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            {DIRECTION_ICONS[entry.direction]}
                            <div className="w-px flex-1 bg-border mt-2" />
                          </div>
                          <Card className="flex-1">
                            <CardContent className="py-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium">{entry.title}</span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(entry.entryDate).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {entry.summary || entry.content}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-xs">
                                  {entry.entryType.replace(/_/g, ' ')}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {entry.status}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      ))
                    )}
                  </TabsContent>

                  <TabsContent value="positions" className="space-y-3">
                    {positions.length === 0 ? (
                      <div className="text-center py-8">
                        <Target className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
                        <p className="text-muted-foreground">No positions tracked</p>
                      </div>
                    ) : (
                      positions.map((pos) => (
                        <Card key={pos.id}>
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="font-medium">{pos.topic}</h5>
                              <Badge variant={
                                pos.status === 'agreed' ? 'success' as any :
                                pos.status === 'disagreed' ? 'destructive' :
                                'secondary'
                              }>
                                {pos.status}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Sponsor Position</p>
                                <p>{pos.sponsorPosition}</p>
                              </div>
                              {pos.fdaPosition && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">FDA Position</p>
                                  <p>{pos.fdaPosition}</p>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </TabsContent>

                  <TabsContent value="details">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-muted-foreground">Topic</Label>
                        <p className="mt-1">{selectedThread.topic}</p>
                      </div>
                      {selectedThread.objectivesSummary && (
                        <div>
                          <Label className="text-muted-foreground">Objectives</Label>
                          <p className="mt-1">{selectedThread.objectivesSummary}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-muted-foreground">Sponsor Lead</Label>
                          <p className="mt-1">{selectedThread.sponsorLead}</p>
                        </div>
                        {selectedThread.meetingType && (
                          <div>
                            <Label className="text-muted-foreground">Meeting Type</Label>
                            <p className="mt-1">{selectedThread.meetingType.replace(/_/g, ' ')}</p>
                          </div>
                        )}
                      </div>
                      {selectedThread.meetingDate && (
                        <div>
                          <Label className="text-muted-foreground">Meeting Date</Label>
                          <p className="mt-1">{new Date(selectedThread.meetingDate).toLocaleDateString()}</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <CardContent className="text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
                <p className="text-lg font-medium">Select a Thread</p>
                <p className="text-muted-foreground">
                  Choose a negotiation thread to view details
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default RegulatoryNegotiationLogbook;

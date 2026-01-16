/**
 * Comprehensive Multi-Agency Regulatory Management Enhancements
 * GA-ready enterprise regulatory compliance features
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import {
  Activity, AlertTriangle, CheckCircle2, Plus, Edit, Download, Upload, Search, Filter, Calendar as CalendarIcon, Clock, Users, Target, Globe, Shield, Settings, FileText, Send, Bell, Lightbulb, TrendingUp, BarChart3, AlertCircle, RefreshCw, Database, MapPin, Building2, Flag, User, History, ChevronRight, ChevronDown, Eye, Pencil, Trash2, MessageSquare, ExternalLink, Info, Building, Circle } from 'lucide-react'

// Multi-Agency Compliance Tracking Dashboard
export const ComplianceTrackingDashboard = () => {
  const [complianceData, setComplianceData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [agencies, setAgencies] = useState([]);
  const [selectedAgency, setSelectedAgency] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState('all');
  const { toast } = useToast();

  // Fetch agencies on component mount
  useEffect(() => {
    const fetchAgencies = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/regulatory/agencies');
        const data = await response.json();
        if (data.success) {
          setAgencies(data.data);
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load regulatory agencies',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    fetchAgencies();
  }, [toast]);

  // Fetch compliance data
  useEffect(() => {
    const fetchComplianceData = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (selectedAgency !== 'all') params.append('agencyId', selectedAgency);
        if (selectedProduct !== 'all') params.append('productId', selectedProduct);

        const response = await fetch(`/api/regulatory/compliance?${params}`);
        const data = await response.json();
        if (data.success) {
          setComplianceData(data.data);
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load compliance data',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    fetchComplianceData();
  }, [selectedAgency, selectedProduct, toast]);

  const handleComplianceUpdate = async (complianceId, updates) => {
    try {
      const response = await fetch(`/api/regulatory/compliance/${complianceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      if (response.ok) {
        // Refresh data
        setComplianceData(prev => prev.map(item => 
          item.id === complianceId ? { ...item, ...updates } : item
        ));
        toast({
          title: 'Success',
          description: 'Compliance status updated successfully',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update compliance status',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6" data-testid="compliance-tracking-dashboard">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-bold">Multi-Agency Compliance Tracking</h3>
          <p className="text-gray-600">Real-time regulatory compliance monitoring across global agencies</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedAgency} onValueChange={setSelectedAgency}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by Agency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agencies</SelectItem>
              {agencies.map((agency) => (
                <SelectItem key={agency.id} value={agency.id.toString()}>
                  {agency.agencyName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            size="sm"
            data-testid="refresh-compliance-data"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Shield className="w-5 h-5 mr-2 text-green-500" />
              Overall Compliance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {complianceData.length > 0 
                ? Math.round((complianceData.filter(c => c.complianceStatus === 'compliant').length / complianceData.length) * 100)
                : 0}%
            </div>
            <Progress 
              value={complianceData.length > 0 
                ? (complianceData.filter(c => c.complianceStatus === 'compliant').length / complianceData.length) * 100
                : 0} 
              className="h-2 mt-2" 
            />
            <p className="text-sm text-gray-600 mt-1">Across all agencies</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Globe className="w-5 h-5 mr-2 text-blue-500" />
              Active Agencies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{agencies.length}</div>
            <p className="text-sm text-gray-600">Regulatory authorities</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2 text-red-500" />
              Non-Compliant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {complianceData.filter(c => c.complianceStatus === 'non_compliant').length}
            </div>
            <p className="text-sm text-gray-600">Require attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Clock className="w-5 h-5 mr-2 text-yellow-500" />
              In Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {complianceData.filter(c => c.complianceStatus === 'in_review').length}
            </div>
            <p className="text-sm text-gray-600">Under assessment</p>
          </CardContent>
        </Card>
      </div>

      {/* Agency Compliance Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Agency Compliance Status</CardTitle>
          <CardDescription>
            Region-specific compliance status and requirements matrix
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {complianceData.map((compliance) => (
                <Card key={compliance.id} className="border-l-4 border-l-blue-500">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg flex items-center">
                          <Flag className="w-4 h-4 mr-2" />
                          {compliance.agency?.agencyName} - {compliance.productId}
                        </CardTitle>
                        <CardDescription>
                          {compliance.agency?.region} • Last assessed: {compliance.lastAssessmentDate}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={
                          compliance.complianceStatus === 'compliant'
                            ? 'default'
                            : compliance.complianceStatus === 'non_compliant'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {compliance.complianceStatus.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-sm font-medium">Compliance Score</Label>
                        <div className="flex items-center space-x-2 mt-1">
                          <Progress value={compliance.complianceScore || 0} className="flex-1 h-2" />
                          <span className="text-sm font-medium">{compliance.complianceScore || 0}%</span>
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Risk Level</Label>
                        <Badge
                          variant={
                            compliance.riskLevel === 'low'
                              ? 'default'
                              : compliance.riskLevel === 'high'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="mt-1"
                        >
                          {compliance.riskLevel?.toUpperCase()}
                        </Badge>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Assigned To</Label>
                        <p className="text-sm mt-1 flex items-center">
                          <User className="w-3 h-3 mr-1" />
                          {compliance.assignedTo || 'Unassigned'}
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-2 mt-4">
                      <Button
                        size="sm"
                        onClick={() => handleComplianceUpdate(compliance.id, { complianceStatus: 'compliant' })}
                        data-testid={`mark-compliant-${compliance.id}`}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Mark Compliant
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleComplianceUpdate(compliance.id, { complianceStatus: 'in_review' })}
                        data-testid={`review-compliance-${compliance.id}`}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Review
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`view-details-${compliance.id}`}
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Regulatory Submission Calendar
export const SubmissionCalendar = () => {
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchCalendarData = async () => {
      try {
        setLoading(true);
        const [calendarResponse, submissionsResponse] = await Promise.all([
          fetch('/api/regulatory/calendar'),
          fetch('/api/regulatory/submissions')
        ]);

        const [calendarData, submissionsData] = await Promise.all([
          calendarResponse.json(),
          submissionsResponse.json()
        ]);

        if (calendarData.success) {
          setCalendarEvents(calendarData.data);
        }
        if (submissionsData.success) {
          setSubmissions(submissionsData.data);
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load calendar data',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    fetchCalendarData();
  }, [toast]);

  const handleScheduleMeeting = async (submissionId, meetingType) => {
    try {
      const response = await fetch('/api/regulatory/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${meetingType} Meeting`,
          eventType: 'meeting',
          eventDate: selectedDate.toISOString(),
          submissionId,
          status: 'scheduled',
          priority: 'high',
        }),
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: `${meetingType} meeting scheduled successfully`,
        });
        // Refresh calendar data
        window.location.reload();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to schedule meeting',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6" data-testid="submission-calendar">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-bold">Regulatory Submission Calendar</h3>
          <p className="text-gray-600">Interactive calendar with submission deadlines and milestones</p>
        </div>
        <div className="flex gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button className="bg-indigo-600 hover:bg-indigo-700" data-testid="schedule-meeting-btn">
                <Plus className="w-4 h-4 mr-2" />
                Schedule Meeting
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule Agency Meeting</DialogTitle>
                <DialogDescription>
                  Schedule Type A, B, or C meeting with regulatory agency
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Meeting Type</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select meeting type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Type A">Type A - Specific disagreements or issues</SelectItem>
                      <SelectItem value="Type B - EOP">Type B - End of Phase meetings</SelectItem>
                      <SelectItem value="Type B - SPA">Type B - Special Protocol Assessment</SelectItem>
                      <SelectItem value="Type C">Type C - All other meetings</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Submission</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select submission" />
                    </SelectTrigger>
                    <SelectContent>
                      {submissions.map((submission) => (
                        <SelectItem key={submission.id} value={submission.id.toString()}>
                          {submission.productName} - {submission.submissionType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Proposed Date</Label>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    className="rounded-md border"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => handleScheduleMeeting(1, 'Type C')}>
                  Schedule Meeting
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Calendar View</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="rounded-md border w-full"
            />
          </CardContent>
        </Card>

        {/* Upcoming Events */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {calendarEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{event.title}</p>
                      <p className="text-xs text-gray-600">
                        {event.agency?.agencyName} • {new Date(event.eventDate).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant={
                        event.priority === 'critical'
                          ? 'destructive'
                          : event.priority === 'high'
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {event.priority}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Submission Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Submission Milestones & Timeline</CardTitle>
          <CardDescription>Critical path visualization for active submissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {submissions.map((submission) => (
              <div key={submission.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-medium">{submission.productName}</h4>
                    <p className="text-sm text-gray-600">
                      {submission.submissionType} • {submission.agency?.agencyName}
                    </p>
                  </div>
                  <Badge variant="outline">{submission.status}</Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Progress</span>
                    <span className="text-sm">{submission.progress}%</span>
                  </div>
                  <Progress value={submission.progress} className="h-2" />
                </div>
                {submission.milestones && submission.milestones.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <h5 className="text-sm font-medium">Milestones</h5>
                    {submission.milestones.map((milestone, index) => (
                      <div key={index} className="flex items-center space-x-2 text-sm">
                        <Circle
                          className={`w-3 h-3 ${
                            milestone.status === 'completed'
                              ? 'text-green-500 fill-green-500'
                              : milestone.status === 'pending'
                              ? 'text-yellow-500'
                              : 'text-gray-400'
                          }`}
                        />
                        <span>{milestone.name}</span>
                        <span className="text-gray-500">({milestone.date})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Agency Correspondence Management
export const CorrespondenceManagement = () => {
  const [correspondence, setCorrespondence] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCorrespondence, setSelectedCorrespondence] = useState(null);
  const [newCorrespondence, setNewCorrespondence] = useState({
    subject: '',
    correspondenceType: '',
    agencyId: '',
    priority: 'medium',
    responseDeadline: '',
  });
  const { toast } = useToast();

  useEffect(() => {
    const fetchCorrespondence = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/regulatory/correspondence');
        const data = await response.json();
        if (data.success) {
          setCorrespondence(data.data);
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load correspondence',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    fetchCorrespondence();
  }, [toast]);

  const handleCreateCorrespondence = async () => {
    try {
      const response = await fetch('/api/regulatory/correspondence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCorrespondence),
      });

      if (response.ok) {
        const data = await response.json();
        setCorrespondence(prev => [...prev, data.data]);
        setNewCorrespondence({
          subject: '',
          correspondenceType: '',
          agencyId: '',
          priority: 'medium',
          responseDeadline: '',
        });
        toast({
          title: 'Success',
          description: 'Correspondence created successfully',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create correspondence',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateStatus = async (correspondenceId, status) => {
    try {
      const response = await fetch(`/api/regulatory/correspondence/${correspondenceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        setCorrespondence(prev =>
          prev.map(item => (item.id === correspondenceId ? { ...item, status } : item))
        );
        toast({
          title: 'Success',
          description: 'Status updated successfully',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update status',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6" data-testid="correspondence-management">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-bold">Agency Correspondence Management</h3>
          <p className="text-gray-600">Track and manage all regulatory agency communications</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700" data-testid="new-correspondence-btn">
              <Plus className="w-4 h-4 mr-2" />
              New Correspondence
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Correspondence</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Subject</Label>
                <Input
                  value={newCorrespondence.subject}
                  onChange={e => setNewCorrespondence({ ...newCorrespondence, subject: e.target.value })}
                  placeholder="Enter correspondence subject"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={newCorrespondence.correspondenceType}
                  onValueChange={value => setNewCorrespondence({ ...newCorrespondence, correspondenceType: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IR">Information Request</SelectItem>
                    <SelectItem value="RTF">Refuse to File</SelectItem>
                    <SelectItem value="CRL">Complete Response Letter</SelectItem>
                    <SelectItem value="approval_letter">Approval Letter</SelectItem>
                    <SelectItem value="meeting_minutes">Meeting Minutes</SelectItem>
                    <SelectItem value="guidance_request">Guidance Request</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select
                  value={newCorrespondence.priority}
                  onValueChange={value => setNewCorrespondence({ ...newCorrespondence, priority: value })}
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
                <Label>Response Deadline</Label>
                <Input
                  type="date"
                  value={newCorrespondence.responseDeadline}
                  onChange={e => setNewCorrespondence({ ...newCorrespondence, responseDeadline: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreateCorrespondence}>Create Correspondence</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Correspondence List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          correspondence.map((item) => (
            <Card key={item.id} className="border-l-4 border-l-indigo-500">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg flex items-center">
                      <MessageSquare className="w-4 h-4 mr-2" />
                      {item.subject}
                    </CardTitle>
                    <CardDescription>
                      {item.correspondenceType} • {item.agency?.agencyName} • 
                      Received: {item.receivedDate}
                    </CardDescription>
                  </div>
                  <div className="flex space-x-2">
                    <Badge
                      variant={
                        item.status === 'pending'
                          ? 'destructive'
                          : item.status === 'in_progress'
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {item.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                    <Badge
                      variant={
                        item.priority === 'critical'
                          ? 'destructive'
                          : item.priority === 'high'
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {item.priority.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <Label className="text-sm font-medium">Response Deadline</Label>
                    <p className="text-sm mt-1 flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {item.responseDeadline || 'No deadline set'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Assigned To</Label>
                    <p className="text-sm mt-1 flex items-center">
                      <User className="w-3 h-3 mr-1" />
                      {item.assignedTo || 'Unassigned'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Direction</Label>
                    <p className="text-sm mt-1 flex items-center">
                      <Send className="w-3 h-3 mr-1" />
                      {item.direction?.toUpperCase()}
                    </p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    onClick={() => handleUpdateStatus(item.id, 'in_progress')}
                    data-testid={`start-response-${item.id}`}
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    Start Response
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateStatus(item.id, 'responded')}
                    data-testid={`mark-responded-${item.id}`}
                  >
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Mark Responded
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`view-thread-${item.id}`}
                  >
                    <History className="w-3 h-3 mr-1" />
                    View Thread
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

// Components are already exported above with 'export const'
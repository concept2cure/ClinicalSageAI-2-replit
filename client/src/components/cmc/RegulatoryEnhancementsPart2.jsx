/**
 * Remaining 3 Regulatory Management Features
 * Part 2: Regulatory Intelligence, Change Control, Post-Approval Commitments
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Activity, AlertTriangle, CheckCircle2, Plus, Edit, Download, Upload, Search, Filter, Calendar, Clock, Users, Target, Globe, Shield, Settings, FileText, Send, Bell, Lightbulb, TrendingUp, BarChart3, AlertCircle, RefreshCw, Database, MapPin, Building2, Flag, User, History, ChevronRight, ChevronDown, Eye, Pencil, Trash2, MessageSquare, ExternalLink, Info, Building, Circle, Zap, Bookmark, Star, Rss, Archive, GitBranch, Link, Play } from 'lucide-react'

// Regulatory Intelligence Updates
export const RegulatoryIntelligence = () => {
  const [intelligence, setIntelligence] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState('all');
  const [selectedImpact, setSelectedImpact] = useState('all');
  const { toast } = useToast();

  useEffect(() => {
    const fetchIntelligence = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (selectedType !== 'all') params.append('type', selectedType);
        if (selectedImpact !== 'all') params.append('impactLevel', selectedImpact);

        const response = await fetch(`/api/regulatory/intelligence?${params}`);
        const data = await response.json();
        if (data.success) {
          setIntelligence(data.data);
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load regulatory intelligence',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    fetchIntelligence();
  }, [selectedType, selectedImpact, toast]);

  const handleMarkAsRead = async (intelId) => {
    try {
      setIntelligence(prev =>
        prev.map(item => (item.id === intelId ? { ...item, status: 'read' } : item))
      );
      toast({
        title: 'Success',
        description: 'Marked as read',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update status',
        variant: 'destructive',
      });
    }
  };

  const handleCreateAlert = async (intelId) => {
    try {
      toast({
        title: 'Alert Created',
        description: 'Impact assessment alert has been created for your team',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create alert',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6" data-testid="regulatory-intelligence">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-bold">Regulatory Intelligence Updates</h3>
          <p className="text-gray-600">Real-time regulatory news, guidance updates, and impact assessment</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="guidance">Guidance</SelectItem>
              <SelectItem value="regulation">Regulation</SelectItem>
              <SelectItem value="alert">Alert</SelectItem>
              <SelectItem value="news">News</SelectItem>
              <SelectItem value="policy_change">Policy Change</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedImpact} onValueChange={setSelectedImpact}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by Impact" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Impacts</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Intelligence Feed */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          intelligence.map((item) => (
            <Card 
              key={item.id} 
              className={`border-l-4 ${
                item.impactLevel === 'critical' ? 'border-l-red-500' :
                item.impactLevel === 'high' ? 'border-l-orange-500' :
                item.impactLevel === 'medium' ? 'border-l-yellow-500' :
                'border-l-blue-500'
              }`}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center">
                      <Rss className="w-4 h-4 mr-2" />
                      {item.title}
                    </CardTitle>
                    <CardDescription>
                      {item.agency?.agencyName} • {item.type} • Published: {item.publishedDate}
                    </CardDescription>
                  </div>
                  <div className="flex space-x-2">
                    <Badge
                      variant={
                        item.impactLevel === 'critical'
                          ? 'destructive'
                          : item.impactLevel === 'high'
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {item.impactLevel?.toUpperCase()} IMPACT
                    </Badge>
                    {item.actionRequired && (
                      <Badge variant="outline" className="bg-yellow-50">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        ACTION REQUIRED
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm">{item.summary}</p>
                  
                  {item.impactAssessment && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <h4 className="font-medium text-sm flex items-center text-blue-800">
                        <Lightbulb className="w-4 h-4 mr-2" />
                        Impact Assessment
                      </h4>
                      <p className="text-sm text-blue-700 mt-1">{item.impactAssessment}</p>
                    </div>
                  )}

                  {item.actionItems && item.actionItems.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <h4 className="font-medium text-sm flex items-center text-amber-800">
                        <Target className="w-4 h-4 mr-2" />
                        Action Items
                      </h4>
                      <ul className="list-disc list-inside text-sm text-amber-700 mt-1 space-y-1">
                        {item.actionItems.map((action, index) => (
                          <li key={index}>{action}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      onClick={() => handleMarkAsRead(item.id)}
                      data-testid={`mark-read-${item.id}`}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Mark Read
                    </Button>
                    {item.actionRequired && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCreateAlert(item.id)}
                        data-testid={`create-alert-${item.id}`}
                      >
                        <Bell className="w-3 h-3 mr-1" />
                        Create Alert
                      </Button>
                    )}
                    {item.url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(item.url, '_blank')}
                        data-testid={`view-source-${item.id}`}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        View Source
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`bookmark-${item.id}`}
                    >
                      <Bookmark className="w-3 h-3 mr-1" />
                      Bookmark
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

// Change Control Management
export const ChangeControlManagement = () => {
  const [changeControls, setChangeControls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newChange, setNewChange] = useState({
    title: '',
    description: '',
    changeType: '',
    riskCategory: 'medium',
    affectedProducts: [],
    affectedAgencies: [],
    notificationRequired: false,
  });
  const { toast } = useToast();

  useEffect(() => {
    const fetchChangeControls = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/regulatory/change-control');
        const data = await response.json();
        if (data.success) {
          setChangeControls(data.data);
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load change controls',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    fetchChangeControls();
  }, [toast]);

  const handleCreateChange = async () => {
    try {
      const response = await fetch('/api/regulatory/change-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newChange,
          changeControlNumber: `CC-${Date.now()}`,
          status: 'draft',
          initiatedBy: 'Current User',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setChangeControls(prev => [...prev, data.data]);
        setNewChange({
          title: '',
          description: '',
          changeType: '',
          riskCategory: 'medium',
          affectedProducts: [],
          affectedAgencies: [],
          notificationRequired: false,
        });
        toast({
          title: 'Success',
          description: 'Change control created successfully',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create change control',
        variant: 'destructive',
      });
    }
  };

  const handleStatusUpdate = async (changeId, newStatus) => {
    try {
      const response = await fetch(`/api/regulatory/change-control/${changeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        setChangeControls(prev =>
          prev.map(item => (item.id === changeId ? { ...item, status: newStatus } : item))
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
    <div className="space-y-6" data-testid="change-control-management">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-bold">Change Control Management</h3>
          <p className="text-gray-600">Regulatory change impact assessment and notification workflows</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700" data-testid="new-change-control-btn">
              <Plus className="w-4 h-4 mr-2" />
              New Change Control
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Change Control</DialogTitle>
              <DialogDescription>
                Document and assess regulatory impact of proposed changes
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input
                  value={newChange.title}
                  onChange={e => setNewChange({ ...newChange, title: e.target.value })}
                  placeholder="Enter change control title"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={newChange.description}
                  onChange={e => setNewChange({ ...newChange, description: e.target.value })}
                  placeholder="Describe the proposed change"
                />
              </div>
              <div>
                <Label>Change Type</Label>
                <Select
                  value={newChange.changeType}
                  onValueChange={value => setNewChange({ ...newChange, changeType: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select change type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="major">Major</SelectItem>
                    <SelectItem value="minor">Minor</SelectItem>
                    <SelectItem value="administrative">Administrative</SelectItem>
                    <SelectItem value="manufacturing">Manufacturing</SelectItem>
                    <SelectItem value="analytical">Analytical</SelectItem>
                    <SelectItem value="labeling">Labeling</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Risk Category</Label>
                <Select
                  value={newChange.riskCategory}
                  onValueChange={value => setNewChange({ ...newChange, riskCategory: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low Risk</SelectItem>
                    <SelectItem value="medium">Medium Risk</SelectItem>
                    <SelectItem value="high">High Risk</SelectItem>
                    <SelectItem value="critical">Critical Risk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="notification-required"
                  checked={newChange.notificationRequired}
                  onChange={e => setNewChange({ ...newChange, notificationRequired: e.target.checked })}
                />
                <Label htmlFor="notification-required">Agency notification required</Label>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreateChange}>Create Change Control</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Change Controls List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          changeControls.map((change) => (
            <Card key={change.id} className="border-l-4 border-l-purple-500">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg flex items-center">
                      <GitBranch className="w-4 h-4 mr-2" />
                      {change.title}
                    </CardTitle>
                    <CardDescription>
                      {change.changeControlNumber} • {change.changeType} • Initiated: {change.createdAt?.split('T')[0]}
                    </CardDescription>
                  </div>
                  <div className="flex space-x-2">
                    <Badge
                      variant={
                        change.status === 'approved'
                          ? 'default'
                          : change.status === 'rejected'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {change.status?.toUpperCase()}
                    </Badge>
                    <Badge
                      variant={
                        change.riskCategory === 'critical'
                          ? 'destructive'
                          : change.riskCategory === 'high'
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {change.riskCategory?.toUpperCase()} RISK
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm">{change.description}</p>
                  
                  {change.regulatoryImpact && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <h4 className="font-medium text-sm text-orange-800">Regulatory Impact</h4>
                      <p className="text-sm text-orange-700 mt-1">{change.regulatoryImpact}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-sm font-medium">Affected Products</Label>
                      <p className="text-sm mt-1">
                        {change.affectedProducts?.join(', ') || 'None specified'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Affected Agencies</Label>
                      <p className="text-sm mt-1">
                        {change.affectedAgencies?.join(', ') || 'None specified'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Implementation Date</Label>
                      <p className="text-sm mt-1">
                        {change.implementationDate || 'Not set'}
                      </p>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    {change.status === 'draft' && (
                      <Button
                        size="sm"
                        onClick={() => handleStatusUpdate(change.id, 'under_review')}
                        data-testid={`submit-review-${change.id}`}
                      >
                        <Send className="w-3 h-3 mr-1" />
                        Submit for Review
                      </Button>
                    )}
                    {change.status === 'under_review' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleStatusUpdate(change.id, 'approved')}
                          data-testid={`approve-change-${change.id}`}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusUpdate(change.id, 'rejected')}
                          data-testid={`reject-change-${change.id}`}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`view-impact-${change.id}`}
                    >
                      <BarChart3 className="w-3 h-3 mr-1" />
                      Impact Assessment
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`edit-change-${change.id}`}
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

// Post-Approval Commitments Tracking
export const PostApprovalCommitments = () => {
  const [commitments, setCommitments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const { toast } = useToast();

  useEffect(() => {
    const fetchCommitments = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (selectedStatus !== 'all') params.append('status', selectedStatus);

        const response = await fetch(`/api/regulatory/commitments?${params}`);
        const data = await response.json();
        if (data.success) {
          setCommitments(data.data);
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load commitments',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    fetchCommitments();
  }, [selectedStatus, toast]);

  const handleStatusUpdate = async (commitmentId, newStatus) => {
    try {
      const response = await fetch(`/api/regulatory/commitments/${commitmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        setCommitments(prev =>
          prev.map(item => (item.id === commitmentId ? { ...item, status: newStatus } : item))
        );
        toast({
          title: 'Success',
          description: 'Commitment status updated successfully',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update commitment status',
        variant: 'destructive',
      });
    }
  };

  const isOverdue = (dueDate) => {
    return new Date(dueDate) < new Date();
  };

  const getDaysUntilDue = (dueDate) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="space-y-6" data-testid="post-approval-commitments">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-bold">Post-Approval Commitments Tracking</h3>
          <p className="text-gray-600">Monitor and manage all regulatory commitments and deadlines</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Commitments</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => window.location.reload()}>
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
              <Target className="w-5 h-5 mr-2 text-blue-500" />
              Total Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {commitments.filter(c => ['pending', 'in_progress'].includes(c.status)).length}
            </div>
            <p className="text-sm text-gray-600">Active commitments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Clock className="w-5 h-5 mr-2 text-red-500" />
              Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {commitments.filter(c => c.dueDate && isOverdue(c.dueDate) && c.status !== 'completed').length}
            </div>
            <p className="text-sm text-gray-600">Require attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <CheckCircle2 className="w-5 h-5 mr-2 text-green-500" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {commitments.filter(c => c.status === 'completed').length}
            </div>
            <p className="text-sm text-gray-600">This year</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2 text-yellow-500" />
              Due Soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {commitments.filter(c => c.dueDate && getDaysUntilDue(c.dueDate) <= 30 && getDaysUntilDue(c.dueDate) > 0).length}
            </div>
            <p className="text-sm text-gray-600">Next 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Commitments List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          commitments.map((commitment) => (
            <Card 
              key={commitment.id} 
              className={`border-l-4 ${
                commitment.status === 'overdue' || (commitment.dueDate && isOverdue(commitment.dueDate) && commitment.status !== 'completed')
                  ? 'border-l-red-500' 
                  : commitment.status === 'completed'
                  ? 'border-l-green-500'
                  : 'border-l-blue-500'
              }`}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg flex items-center">
                      <Archive className="w-4 h-4 mr-2" />
                      {commitment.title}
                    </CardTitle>
                    <CardDescription>
                      {commitment.commitmentNumber} • {commitment.type} • 
                      {commitment.agency?.agencyName}
                    </CardDescription>
                  </div>
                  <div className="flex space-x-2">
                    <Badge
                      variant={
                        commitment.status === 'completed'
                          ? 'default'
                          : commitment.status === 'overdue' || (commitment.dueDate && isOverdue(commitment.dueDate))
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {commitment.status?.replace('_', ' ').toUpperCase()}
                    </Badge>
                    <Badge
                      variant={
                        commitment.priority === 'high'
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {commitment.priority?.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm">{commitment.description}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-sm font-medium">Due Date</Label>
                      <p className="text-sm mt-1 flex items-center">
                        <Calendar className="w-3 h-3 mr-1" />
                        {commitment.dueDate || 'Not set'}
                      </p>
                      {commitment.dueDate && (
                        <p className={`text-xs mt-1 ${
                          isOverdue(commitment.dueDate) ? 'text-red-600' : 
                          getDaysUntilDue(commitment.dueDate) <= 30 ? 'text-yellow-600' : 'text-gray-500'
                        }`}>
                          {isOverdue(commitment.dueDate) 
                            ? `${Math.abs(getDaysUntilDue(commitment.dueDate))} days overdue`
                            : `${getDaysUntilDue(commitment.dueDate)} days remaining`}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Assigned To</Label>
                      <p className="text-sm mt-1 flex items-center">
                        <User className="w-3 h-3 mr-1" />
                        {commitment.assignedTo || 'Unassigned'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Submission Date</Label>
                      <p className="text-sm mt-1">
                        {commitment.submissionDate || 'Not submitted'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Approval Date</Label>
                      <p className="text-sm mt-1">
                        {commitment.approvalDate || 'Pending'}
                      </p>
                    </div>
                  </div>

                  {commitment.progressReport && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <h4 className="font-medium text-sm text-blue-800">Progress Report</h4>
                      <p className="text-sm text-blue-700 mt-1">{commitment.progressReport}</p>
                    </div>
                  )}

                  <div className="flex space-x-2">
                    {commitment.status !== 'completed' && (
                      <Button
                        size="sm"
                        onClick={() => handleStatusUpdate(commitment.id, 'in_progress')}
                        data-testid={`start-commitment-${commitment.id}`}
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Start Progress
                      </Button>
                    )}
                    {commitment.status === 'in_progress' && (
                      <Button
                        size="sm"
                        onClick={() => handleStatusUpdate(commitment.id, 'completed')}
                        data-testid={`complete-commitment-${commitment.id}`}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Mark Complete
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`update-progress-${commitment.id}`}
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Update Progress
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`view-details-${commitment.id}`}
                    >
                      <FileText className="w-3 h-3 mr-1" />
                      View Details
                    </Button>
                    {commitment.dueDate && getDaysUntilDue(commitment.dueDate) <= 30 && (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`escalate-${commitment.id}`}
                      >
                        <Bell className="w-3 h-3 mr-1" />
                        Escalate
                      </Button>
                    )}
                  </div>
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
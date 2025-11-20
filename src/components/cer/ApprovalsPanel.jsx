import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  UserCheck,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  FileCheck,
  Send,
  MessageSquare,
  CheckCircle,
  User,
  Edit,
  Plus,
  FileText,
  Mail,
  Smartphone,
  Users,
} from 'lucide-react';

export default function ApprovalsPanel() {
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showAddReviewerDialog, setShowAddReviewerDialog] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [selectedDocumentType, setSelectedDocumentType] = useState('cer');
  const [newReviewer, setNewReviewer] = useState({
    name: '',
    email: '',
    role: '',
    department: '',
    phone: '',
  });

  // Mock data for the table
  const approvals = [
    {
      id: 1,
      name: 'Dr. Michael Chen',
      role: 'Regulatory Affairs Director',
      department: 'Regulatory Affairs',
      status: 'approved',
      date: '2025-04-28T14:30:00Z',
      comments: 'Approved with minor comments on section 4.2. Please address in the next revision.',
    },
    {
      id: 2,
      name: 'Dr. Sarah Johnson',
      role: 'Clinical Research Manager',
      department: 'Clinical Operations',
      status: 'approved',
      date: '2025-04-27T11:15:00Z',
      comments: 'Clinical data looks good. Approved.',
    },
    {
      id: 3,
      name: 'John Smith',
      role: 'Quality Assurance Specialist',
      department: 'Quality',
      status: 'pending',
      date: null,
      comments: null,
    },
    {
      id: 4,
      name: 'Emily Williams',
      role: 'Medical Director',
      department: 'Medical Affairs',
      status: 'pending',
      date: null,
      comments: null,
    },
    {
      id: 5,
      name: 'David Lee',
      role: 'Pharmacovigilance Officer',
      department: 'Safety',
      status: 'rejected',
      date: '2025-04-26T09:45:00Z',
      comments: 'Missing safety information in section 5.3. Please address and resubmit.',
    },
  ];

  // Document types for approval workflow
  const documentTypes = [
    { id: 'cer', name: 'Clinical Evaluation Report', pendingApprovals: 3 },
    { id: 'data', name: 'Clinical Data Appendices', pendingApprovals: 1 },
    { id: 'literature', name: 'Literature Review Report', pendingApprovals: 0 },
    { id: 'declarations', name: 'Declaration of Interests', pendingApprovals: 2 },
  ];

  // Filtered approvals based on document type
  const filteredApprovals = approvals;

  // Handle approval submission
  const handleApproval = () => {
    console.log('Approving document with comment:', reviewComment);
    setShowApprovalDialog(false);
    setReviewComment('');
    // In a real app, we would update the approval status in the backend
  };

  // Handle rejection submission
  const handleRejection = () => {
    console.log('Rejecting document with reason:', reviewComment);
    setShowRejectDialog(false);
    setReviewComment('');
    // In a real app, we would update the rejection status in the backend
  };

  // Handle adding a new reviewer
  const handleAddReviewer = () => {
    console.log('Adding new reviewer:', newReviewer);
    setShowAddReviewerDialog(false);
    setNewReviewer({
      name: '',
      email: '',
      role: '',
      department: '',
      phone: '',
    });
    // In a real app, we would add the new reviewer in the backend
  };

  // Handle sending bulk reminders
  const handleSendBulkReminders = () => {
    console.log('Sending bulk reminders');
    setShowBulkDialog(false);
    // In a real app, we would send reminders to all pending reviewers
  };

  // Format date string
  const formatDate = dateString => {
    if (!dateString) return 'Not available';
    return new Date(dateString).toLocaleString();
  };

  // Get status badge color
  const getStatusBadge = status => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold flex items-center">
                <UserCheck className="mr-2 h-5 w-5 text-blue-600" />
                Approvals Workflow
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Manage document approvals and reviewer assignments
              </p>
            </div>

            <div className="flex space-x-2 mt-3 sm:mt-0">
              <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Send className="mr-2 h-3.5 w-3.5" />
                    Send Reminders
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Send Bulk Reminders</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-3">
                    <p>
                      This will send reminder notifications to all reviewers with pending approval
                      status. Would you like to continue?
                    </p>
                    <div className="bg-amber-50 p-3 rounded-md">
                      <p className="text-sm text-amber-800 flex items-start">
                        <AlertCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                        Reminders will be sent to 2 reviewers with pending approvals for this
                        document.
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowBulkDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSendBulkReminders}>Send Reminders</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={showAddReviewerDialog} onOpenChange={setShowAddReviewerDialog}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Add Reviewer
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Reviewer</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-3">
                    <div className="space-y-2">
                      <Label htmlFor="reviewerName">Name</Label>
                      <Input
                        id="reviewerName"
                        value={newReviewer.name}
                        onChange={e => setNewReviewer({ ...newReviewer, name: e.target.value })}
                        placeholder="Enter reviewer's name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reviewerEmail">Email Address</Label>
                      <Input
                        id="reviewerEmail"
                        type="email"
                        value={newReviewer.email}
                        onChange={e => setNewReviewer({ ...newReviewer, email: e.target.value })}
                        placeholder="Enter email address"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="reviewerRole">Role</Label>
                        <Input
                          id="reviewerRole"
                          value={newReviewer.role}
                          onChange={e => setNewReviewer({ ...newReviewer, role: e.target.value })}
                          placeholder="Job title"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reviewerDepartment">Department</Label>
                        <Input
                          id="reviewerDepartment"
                          value={newReviewer.department}
                          onChange={e =>
                            setNewReviewer({ ...newReviewer, department: e.target.value })
                          }
                          placeholder="Department"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reviewerPhone">Phone Number (Optional)</Label>
                      <Input
                        id="reviewerPhone"
                        value={newReviewer.phone}
                        onChange={e => setNewReviewer({ ...newReviewer, phone: e.target.value })}
                        placeholder="Enter phone number"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowAddReviewerDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddReviewer}>Add Reviewer</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Tabs
            value={selectedDocumentType}
            onValueChange={setSelectedDocumentType}
            className="space-y-4"
          >
            <TabsList className="grid grid-cols-2 md:grid-cols-4">
              {documentTypes.map(docType => (
                <TabsTrigger key={docType.id} value={docType.id} className="relative">
                  {docType.name}
                  {docType.pendingApprovals > 0 && (
                    <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-medium rounded-full bg-red-100 text-red-800">
                      {docType.pendingApprovals}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {documentTypes.map(docType => (
              <TabsContent key={docType.id} value={docType.id} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-5 w-5 text-gray-500" />
                    <div>
                      <h4 className="font-medium">{docType.name}</h4>
                      <p className="text-sm text-gray-500">
                        {docType.pendingApprovals > 0
                          ? `${docType.pendingApprovals} pending approval${docType.pendingApprovals > 1 ? 's' : ''}`
                          : 'All approvals complete'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="whitespace-nowrap">
                      <Clock className="mr-1 h-3 w-3" />
                      Last updated: Apr 28, 2025
                    </Badge>
                  </div>
                </div>

                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[250px]">Reviewer</TableHead>
                        <TableHead className="w-[150px]">Department</TableHead>
                        <TableHead className="w-[120px]">Status</TableHead>
                        <TableHead className="w-[180px]">Date</TableHead>
                        <TableHead>Comments</TableHead>
                        <TableHead className="text-right w-[150px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredApprovals.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                            No reviewers assigned to this document yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredApprovals.map(approval => (
                          <TableRow key={approval.id}>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                  <User className="h-4 w-4 text-blue-600" />
                                </div>
                                <div>
                                  <div className="font-medium">{approval.name}</div>
                                  <div className="text-xs text-gray-500">{approval.role}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{approval.department}</TableCell>
                            <TableCell>{getStatusBadge(approval.status)}</TableCell>
                            <TableCell>
                              {approval.date ? (
                                <div className="flex items-center">
                                  <Calendar className="h-3.5 w-3.5 text-gray-500 mr-1.5" />
                                  <span className="text-sm">{formatDate(approval.date)}</span>
                                </div>
                              ) : (
                                <span className="text-gray-400">Pending</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {approval.comments ? (
                                <div className="max-w-md truncate" title={approval.comments}>
                                  {approval.comments}
                                </div>
                              ) : (
                                <span className="text-gray-400">No comments yet</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex space-x-2 justify-end">
                                {approval.status === 'pending' ? (
                                  <>
                                    <Dialog
                                      open={showApprovalDialog}
                                      onOpenChange={setShowApprovalDialog}
                                    >
                                      <DialogTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                        >
                                          <CheckCircle2 className="h-4 w-4" />
                                        </Button>
                                      </DialogTrigger>
                                      <DialogContent>
                                        <DialogHeader>
                                          <DialogTitle>Approve Document</DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-4 py-3">
                                          <p>
                                            You are approving {docType.name} as {approval.role}.
                                          </p>
                                          <div className="space-y-2">
                                            <Label htmlFor="approvalComments">
                                              Review Comments (Optional)
                                            </Label>
                                            <Textarea
                                              id="approvalComments"
                                              placeholder="Add any comments or feedback..."
                                              value={reviewComment}
                                              onChange={e => setReviewComment(e.target.value)}
                                              rows={4}
                                            />
                                          </div>
                                        </div>
                                        <DialogFooter>
                                          <Button
                                            variant="outline"
                                            onClick={() => setShowApprovalDialog(false)}
                                          >
                                            Cancel
                                          </Button>
                                          <Button onClick={handleApproval}>
                                            <CheckCircle className="mr-2 h-4 w-4" />
                                            Approve
                                          </Button>
                                        </DialogFooter>
                                      </DialogContent>
                                    </Dialog>

                                    <Dialog
                                      open={showRejectDialog}
                                      onOpenChange={setShowRejectDialog}
                                    >
                                      <DialogTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        >
                                          <XCircle className="h-4 w-4" />
                                        </Button>
                                      </DialogTrigger>
                                      <DialogContent>
                                        <DialogHeader>
                                          <DialogTitle>Reject Document</DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-4 py-3">
                                          <p>
                                            You are rejecting {docType.name} as {approval.role}.
                                          </p>
                                          <div className="space-y-2">
                                            <Label htmlFor="rejectionReason">
                                              Reason for Rejection (Required)
                                            </Label>
                                            <Textarea
                                              id="rejectionReason"
                                              placeholder="Please provide a detailed reason for rejection..."
                                              value={reviewComment}
                                              onChange={e => setReviewComment(e.target.value)}
                                              rows={4}
                                            />
                                          </div>
                                        </div>
                                        <DialogFooter>
                                          <Button
                                            variant="outline"
                                            onClick={() => setShowRejectDialog(false)}
                                          >
                                            Cancel
                                          </Button>
                                          <Button variant="destructive" onClick={handleRejection}>
                                            <XCircle className="mr-2 h-4 w-4" />
                                            Reject
                                          </Button>
                                        </DialogFooter>
                                      </DialogContent>
                                    </Dialog>

                                    <Button size="sm" variant="ghost">
                                      <Send className="h-4 w-4" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button size="sm" variant="ghost">
                                    <MessageSquare className="h-4 w-4" />
                                  </Button>
                                )}

                                <Button size="sm" variant="ghost">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </Card>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-blue-50 p-4 rounded-md">
                  <div>
                    <h4 className="font-medium text-blue-800">Document Approval Status</h4>
                    <p className="text-sm text-blue-600">
                      {docType.pendingApprovals === 0
                        ? 'All approvals complete. Document is ready for final submission.'
                        : `${docType.pendingApprovals} ${docType.pendingApprovals === 1 ? 'reviewer' : 'reviewers'} pending approval.`}
                    </p>
                  </div>

                  <div className="flex space-x-2">
                    <Button variant="outline" className="bg-white">
                      <Mail className="mr-2 h-4 w-4" />
                      Email Reviewers
                    </Button>

                    {docType.pendingApprovals === 0 && (
                      <Button className="bg-blue-700 hover:bg-blue-800">
                        <FileCheck className="mr-2 h-4 w-4" />
                        Mark as Final
                      </Button>
                    )}
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold text-lg mb-4 flex items-center">
            <Users className="mr-2 h-5 w-5 text-gray-500" />
            Reviewer Information
          </h3>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {approvals.slice(0, 3).map(reviewer => (
                <Card key={reviewer.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center mb-2">
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                        <User className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium">{reviewer.name}</div>
                        <div className="text-xs text-gray-500">{reviewer.role}</div>
                      </div>
                    </div>

                    <Separator className="my-3" />

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center">
                        <Mail className="h-3.5 w-3.5 text-gray-500 mr-2" />
                        <span>user@example.com</span>
                      </div>
                      <div className="flex items-center">
                        <Smartphone className="h-3.5 w-3.5 text-gray-500 mr-2" />
                        <span>+1 (555) 123-4567</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t flex justify-between items-center">
                      <Badge variant="outline">{reviewer.department}</Badge>
                      {getStatusBadge(reviewer.status)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setShowAddReviewerDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add New Reviewer
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

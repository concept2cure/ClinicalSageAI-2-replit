import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  CheckSquare, FileSignature, UserCheck, Clock, CheckCircle, XCircle, User, Shield, Mail } from 'lucide-react'
import indWizardService from '@/services/indWizardService';

export default function SignoffDrawer({ submissionId }) {
  const [loading, setLoading] = useState(true);
  const [signoffData, setSignoffData] = useState(null);

  useEffect(() => {
    if (submissionId) {
      setLoading(true);

      indWizardService
        .getSignoffStatus(submissionId)
        .then(data => {
          setSignoffData(data);
          setLoading(false);
        })
        .catch(error => {
          console.error('Failed to load signoff status:', error);
          setLoading(false);
        });
    }
  }, [submissionId]);

  const getStatusIcon = status => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-amber-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  if (loading) {
    return (
      <Card className="shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center">
            <CheckSquare className="h-5 w-5 mr-2 text-blue-600" />
            Signoff Status
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-8">
          <div className="flex flex-col items-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mb-3"></div>
            <p className="text-sm text-gray-500">Loading signoff status...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!signoffData) {
    return (
      <Card className="shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center">
            <CheckSquare className="h-5 w-5 mr-2 text-blue-600" />
            Signoff Status
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-8">
          <div className="text-center">
            <FileSignature className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 mb-2">No signoff process initiated yet</p>
            <Button className="gap-1.5">
              <UserCheck className="h-4 w-4" />
              <span>Start Signoff Process</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center">
          <CheckSquare className="h-5 w-5 mr-2 text-blue-600" />
          Signoff Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Overall status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded-md p-3">
              <div className="text-sm text-gray-500 mb-1">Required Signatures</div>
              <div className="font-semibold">
                {signoffData.signaturesCompleted}/{signoffData.signaturesRequired}
              </div>
            </div>
            <div className="border rounded-md p-3">
              <div className="text-sm text-gray-500 mb-1">Process Status</div>
              <div className="font-semibold flex items-center">
                {getStatusIcon(signoffData.overallStatus)}
                <span className="ml-1.5">
                  {signoffData.overallStatus === 'approved'
                    ? 'Complete'
                    : signoffData.overallStatus === 'rejected'
                      ? 'Rejected'
                      : 'In Progress'}
                </span>
              </div>
            </div>
            <div className="border rounded-md p-3">
              <div className="text-sm text-gray-500 mb-1">Deadline</div>
              <div className="font-semibold">{signoffData.deadline}</div>
            </div>
          </div>

          {/* Approval list */}
          <div className="border rounded-md">
            <div className="bg-gray-50 p-2 border-b flex items-center justify-between">
              <span className="font-medium">Required Approvals</span>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                <Mail className="h-3.5 w-3.5" />
                <span>Send Reminders</span>
              </Button>
            </div>
            <ScrollArea className="h-[240px]">
              <div className="divide-y">
                {signoffData.approvals.map((approval, index) => (
                  <div key={index} className="p-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-gray-100 rounded-full h-10 w-10 flex items-center justify-center">
                          <User className="h-5 w-5 text-gray-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">{approval.name}</h4>
                          <div className="flex items-center text-xs text-gray-500 mt-0.5">
                            <span>{approval.role}</span>
                            {approval.required && (
                              <>
                                <span className="mx-1">•</span>
                                <span className="text-red-600">Required</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="flex items-center">
                          {getStatusIcon(approval.status)}
                          <span className="ml-1.5 text-sm font-medium">
                            {approval.status === 'approved'
                              ? 'Approved'
                              : approval.status === 'rejected'
                                ? 'Rejected'
                                : 'Pending'}
                          </span>
                        </div>
                        {approval.signedDate && (
                          <div className="text-xs text-gray-500 mt-0.5">{approval.signedDate}</div>
                        )}
                      </div>
                    </div>

                    {approval.comments && (
                      <div className="mt-2 pt-2 border-t border-dashed ml-12">
                        <p className="text-xs text-gray-600 italic">"{approval.comments}"</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" className="gap-1.5">
              <Shield className="h-4 w-4" />
              <span>Audit Trail</span>
            </Button>
            <Button className="gap-1.5">
              <FileSignature className="h-4 w-4" />
              <span>Sign Document</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

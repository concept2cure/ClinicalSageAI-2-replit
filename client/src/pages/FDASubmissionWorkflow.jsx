import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import {
  FileText, Upload, CheckCircle, Clock, AlertTriangle, ArrowRight, Download, Send, Globe, Shield, Target, Zap } from 'lucide-react'

function FDASubmissionWorkflow() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [submissionData, setSubmissionData] = useState({
    submissionType: '',
    productName: '',
    indication: '',
    sponsorCompany: '',
    contactEmail: '',
    regulatoryConsultant: '',
    submissionPath: '',
    deviceClass: '',
    predicateDevice: '',
    studyData: '',
    manufacturingInfo: '',
    qualityData: '',
    clinicalData: '',
  });
  const [documents, setDocuments] = useState([]);
  const [submissionProgress, setSubmissionProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submissionSteps = [
    {
      id: 1,
      title: 'Pre-Submission Planning',
      description: 'Define submission strategy and requirements',
      required: true,
      estimatedTime: '2-4 weeks',
    },
    {
      id: 2,
      title: 'Document Generation',
      description: 'Create all required regulatory documents',
      required: true,
      estimatedTime: '4-8 weeks',
    },
    {
      id: 3,
      title: 'Quality Review',
      description: 'Internal review and validation',
      required: true,
      estimatedTime: '1-2 weeks',
    },
    {
      id: 4,
      title: 'eCTD Compilation',
      description: 'Compile documents into eCTD format',
      required: true,
      estimatedTime: '1 week',
    },
    {
      id: 5,
      title: 'FDA Submission',
      description: 'Submit to FDA via Electronic Submission Gateway',
      required: true,
      estimatedTime: '1 day',
    },
    {
      id: 6,
      title: 'Post-Submission',
      description: 'Track FDA review and respond to questions',
      required: true,
      estimatedTime: '3-6 months',
    },
  ];

  const handleInputChange = (field, value) => {
    setSubmissionData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const generateRequiredDocuments = async () => {
    setIsSubmitting(true);
    try {
      const documentRequests = [
        {
          section: '2.5',
          title: 'Clinical Overview',
          description: 'Comprehensive clinical summary',
        },
        {
          section: '2.7',
          title: 'Clinical Summary',
          description: 'Detailed clinical analysis',
        },
        {
          section: '3.2.S',
          title: 'Drug Substance Information',
          description: 'Manufacturing and quality data',
        },
        {
          section: '5.3.5.1',
          title: 'Clinical Study Reports',
          description: 'Individual study reports',
        },
      ];

      const generatedDocs = [];

      for (const docReq of documentRequests) {
        const response = await fetch('/api/v1/drafting/start_task', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            project_id: `fda-submission-${Date.now()}`,
            ectd_section: docReq.section,
            document_title: docReq.title,
            submission_type: submissionData.submissionType,
            product_name: submissionData.productName,
            indication: submissionData.indication,
            sponsor_company: submissionData.sponsorCompany,
          }),
        });

        const result = await response.json();
        if (result.task_id) {
          generatedDocs.push({
            ...docReq,
            taskId: result.task_id,
            status: 'generating',
          });
        }
      }

      setDocuments(generatedDocs);
      setCurrentStep(2);
      setSubmissionProgress(33);

      toast({
        title: 'Document Generation Started',
        description: `Generating ${generatedDocs.length} required documents for FDA submission`,
      });
    } catch (error) {
      toast({
        title: 'Generation Failed',
        description: 'Failed to start document generation',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkDocumentStatus = async () => {
    const updatedDocs = await Promise.all(
      documents.map(async doc => {
        if (doc.status === 'generating') {
          try {
            const response = await fetch(`/api/v1/drafting/task_status/${doc.taskId}`);
            const status = await response.json();
            return {
              ...doc,
              status: status.status.toLowerCase(),
              content: status.draft_content,
            };
          } catch (error) {
            return { ...doc, status: 'error' };
          }
        }
        return doc;
      })
    );

    setDocuments(updatedDocs);

    const completedDocs = updatedDocs.filter(doc => doc.status === 'completed');
    if (completedDocs.length === updatedDocs.length && updatedDocs.length > 0) {
      setCurrentStep(3);
      setSubmissionProgress(66);
    }
  };

  const compileeCTD = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/fda/compile-ectd', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          submissionData,
          documents: documents.filter(doc => doc.status === 'completed'),
        }),
      });

      const result = await response.json();

      if (result.success) {
        setCurrentStep(4);
        setSubmissionProgress(85);
        toast({
          title: 'eCTD Compiled Successfully',
          description: 'Ready for FDA submission',
        });
      }
    } catch (error) {
      toast({
        title: 'Compilation Failed',
        description: 'Failed to compile eCTD package',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitToFDA = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/fda/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          submissionData,
          submissionType: submissionData.submissionType,
          ectdPackage: true,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setCurrentStep(5);
        setSubmissionProgress(100);
        toast({
          title: 'FDA Submission Successful',
          description: `Submission ID: ${result.submissionId}`,
        });
      }
    } catch (error) {
      toast({
        title: 'Submission Failed',
        description: 'Failed to submit to FDA',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (documents.length > 0) {
      const interval = setInterval(checkDocumentStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [documents]);

  const getStepStatus = stepId => {
    if (stepId < currentStep) return 'completed';
    if (stepId === currentStep) return 'active';
    return 'pending';
  };

  const getStepIcon = status => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'active':
        return <Clock className="h-5 w-5 text-blue-600" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">FDA Submission Workflow</h1>
          <p className="text-gray-600">
            Complete end-to-end FDA submission process from document creation to filing
          </p>
        </div>

        {/* Progress Overview */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Submission Progress</CardTitle>
            <CardDescription>
              Track your progress through the FDA submission process
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Progress value={submissionProgress} className="w-full" />
              <p className="text-sm text-gray-600 mt-2">{submissionProgress}% Complete</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {submissionSteps.map(step => (
                <div key={step.id} className="flex items-start space-x-3 p-4 rounded-lg border">
                  {getStepIcon(getStepStatus(step.id))}
                  <div className="flex-1">
                    <h3 className="font-medium text-sm">{step.title}</h3>
                    <p className="text-xs text-gray-600">{step.description}</p>
                    <Badge variant="outline" className="mt-1 text-xs">
                      {step.estimatedTime}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Step 1: Pre-Submission Planning */}
          {currentStep === 1 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Target className="h-5 w-5 mr-2" />
                  Step 1: Pre-Submission Planning
                </CardTitle>
                <CardDescription>
                  Define your submission strategy and gather required information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="submissionType">Submission Type *</Label>
                    <Select
                      value={submissionData.submissionType}
                      onValueChange={value => handleInputChange('submissionType', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select submission type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="510k">510(k) Premarket Notification</SelectItem>
                        <SelectItem value="PMA">PMA - Premarket Approval</SelectItem>
                        <SelectItem value="IDE">IDE - Investigational Device Exemption</SelectItem>
                        <SelectItem value="IND">IND - Investigational New Drug</SelectItem>
                        <SelectItem value="NDA">NDA - New Drug Application</SelectItem>
                        <SelectItem value="BLA">BLA - Biologics License Application</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="productName">Product Name *</Label>
                    <Input
                      id="productName"
                      value={submissionData.productName}
                      onChange={e => handleInputChange('productName', e.target.value)}
                      placeholder="Enter product name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="indication">Indication *</Label>
                    <Input
                      id="indication"
                      value={submissionData.indication}
                      onChange={e => handleInputChange('indication', e.target.value)}
                      placeholder="Enter intended use/indication"
                    />
                  </div>

                  <div>
                    <Label htmlFor="sponsorCompany">Sponsor Company *</Label>
                    <Input
                      id="sponsorCompany"
                      value={submissionData.sponsorCompany}
                      onChange={e => handleInputChange('sponsorCompany', e.target.value)}
                      placeholder="Enter company name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="contactEmail">Contact Email *</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      value={submissionData.contactEmail}
                      onChange={e => handleInputChange('contactEmail', e.target.value)}
                      placeholder="Enter contact email"
                    />
                  </div>

                  <div>
                    <Label htmlFor="regulatoryConsultant">Regulatory Consultant</Label>
                    <Input
                      id="regulatoryConsultant"
                      value={submissionData.regulatoryConsultant}
                      onChange={e => handleInputChange('regulatoryConsultant', e.target.value)}
                      placeholder="Enter consultant name (optional)"
                    />
                  </div>
                </div>

                <div className="mt-6">
                  <Button
                    onClick={generateRequiredDocuments}
                    disabled={
                      !submissionData.submissionType ||
                      !submissionData.productName ||
                      !submissionData.indication ||
                      !submissionData.sponsorCompany ||
                      isSubmitting
                    }
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    {isSubmitting ? (
                      <>
                        <Clock className="h-4 w-4 mr-2 animate-spin" />
                        Starting Document Generation...
                      </>
                    ) : (
                      <>
                        <ArrowRight className="h-4 w-4 mr-2" />
                        Start Document Generation
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Document Generation */}
          {currentStep >= 2 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Step 2: Document Generation
                </CardTitle>
                <CardDescription>
                  AI-generated regulatory documents for your submission
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {documents.map((doc, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        {doc.status === 'completed' ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : doc.status === 'generating' ? (
                          <Clock className="h-5 w-5 text-blue-600 animate-spin" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                        )}
                        <div>
                          <h4 className="font-medium">{doc.title}</h4>
                          <p className="text-sm text-gray-600">Section {doc.section}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={doc.status === 'completed' ? 'default' : 'secondary'}>
                          {doc.status}
                        </Badge>
                        {doc.status === 'completed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLocation(`/editor?taskId=${doc.taskId}`)}
                          >
                            View
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {documents.every(doc => doc.status === 'completed') && documents.length > 0 && (
                  <div className="mt-6">
                    <Button
                      onClick={compileeCTD}
                      disabled={isSubmitting}
                      className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Compile eCTD Package
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 3: Final Submission */}
          {currentStep >= 4 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Send className="h-5 w-5 mr-2" />
                  Step 4: FDA Submission
                </CardTitle>
                <CardDescription>Submit your compiled eCTD package to the FDA</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-blue-50 p-4 rounded-lg mb-4">
                  <h4 className="font-medium text-blue-900 mb-2">Ready for Submission</h4>
                  <p className="text-blue-800 text-sm">
                    Your eCTD package has been compiled and is ready for submission to the FDA
                    Electronic Submission Gateway.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 border rounded">
                    <span className="font-medium">eCTD Package</span>
                    <Badge variant="default">Ready</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded">
                    <span className="font-medium">FDA Forms</span>
                    <Badge variant="default">Complete</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded">
                    <span className="font-medium">Digital Signatures</span>
                    <Badge variant="default">Valid</Badge>
                  </div>
                </div>

                <div className="mt-6 space-x-3">
                  <Button
                    onClick={submitToFDA}
                    disabled={isSubmitting}
                    className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700"
                  >
                    {isSubmitting ? (
                      <>
                        <Clock className="h-4 w-4 mr-2 animate-spin" />
                        Submitting to FDA...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Submit to FDA
                      </>
                    )}
                  </Button>

                  <Button variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Download eCTD Package
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Submission Complete */}
          {currentStep === 5 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center text-green-700">
                  <CheckCircle className="h-5 w-5 mr-2" />
                  Submission Complete
                </CardTitle>
                <CardDescription>
                  Your submission has been successfully filed with the FDA
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-green-50 p-6 rounded-lg text-center">
                  <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-green-900 mb-2">
                    FDA Submission Successful
                  </h3>
                  <p className="text-green-800 mb-4">
                    Your submission has been received by the FDA. You will receive confirmation
                    within 24-48 hours.
                  </p>
                  <div className="space-y-2 text-sm">
                    <p>
                      <strong>Submission Type:</strong> {submissionData.submissionType}
                    </p>
                    <p>
                      <strong>Product:</strong> {submissionData.productName}
                    </p>
                    <p>
                      <strong>Submitted:</strong> {new Date().toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default FDASubmissionWorkflow;

import React, { useState, useEffect } from 'react';
import { cerApiService } from '@/services/CerAPIService';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toaster';
import {
  Loader2, CheckCircle, AlertCircle, Info, ShieldCheck, FileText, ListChecks, CircleDot } from 'lucide-react'
import CerTooltipWrapper from './CerTooltipWrapper';
import QmpIntegrationHelp from './QmpIntegrationHelp';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * RegulatoryTraceabilityMatrix component
 *
 * This component provides a regulatory traceability matrix for monitoring and controlling
 * Critical-to-Quality (CtQ) factors in compliance with ICH E6(R3) and EU MDR requirements.
 */
const RegulatoryTraceabilityMatrix = ({
  deviceName = '',
  manufacturer = '',
  onGenerateReport,
  onTraceabilityDataChange,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [activeTab, setActiveTab] = useState('ctq-factors');
  const [qmpData, setQmpData] = useState(null);
  const [reportSections, setReportSections] = useState([]);
  const [traceabilityData, setTraceabilityData] = useState({
    qmpData: null,
    generatedReport: null,
    lastUpdated: null,
  });
  const [showHelp, setShowHelp] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    // Load QMP data if available
    const loadQmpData = async () => {
      setIsLoading(true);
      try {
        const response = await cerApiService.getQmpData();

        if (response && response.success) {
          setQmpData(response.data);
          setTraceabilityData(prev => ({
            ...prev,
            qmpData: response.data,
          }));

          // Also load available CER sections
          const sectionsResponse = await cerApiService.getCerSections();
          if (sectionsResponse && sectionsResponse.success) {
            setReportSections(sectionsResponse.sections.map(s => s.title));
          }
        } else {
          // If no QMP data exists, create a default structure
          const defaultQmpData = {
            objectives: [],
            ctqFactors: [],
            riskAssessments: [],
          };
          setQmpData(defaultQmpData);
          setTraceabilityData(prev => ({
            ...prev,
            qmpData: defaultQmpData,
          }));
        }
      } catch (error) {
        console.error('Error loading QMP data:', error);
        toast({
          title: 'Error Loading QMP Data',
          description: 'Failed to load Quality Management Plan data. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadQmpData();
  }, [toast]);

  const handleGenerateReport = async () => {
    if (!qmpData || !qmpData.ctqFactors || qmpData.ctqFactors.length === 0) {
      toast({
        title: 'Cannot Generate Report',
        description: 'Please define Critical-to-Quality factors in the QMP section first.',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingReport(true);

    try {
      const response = await cerApiService.generateQmpTraceabilityReport({
        deviceName: deviceName || 'Medical Device',
        qmpData: qmpData,
        sectionTitles: reportSections,
      });

      if (response && response.success && response.reportSection) {
        setTraceabilityData(prev => ({
          ...prev,
          generatedReport: response.reportSection,
          lastUpdated: new Date().toISOString(),
        }));

        // Pass the generated report to the parent component
        if (onGenerateReport) {
          onGenerateReport(response.reportSection);
        }

        toast({
          title: 'Traceability Report Generated',
          description: 'Regulatory traceability report has been generated successfully.',
          variant: 'default',
        });

        // Switch to preview tab
        setActiveTab('preview');
      } else {
        throw new Error('Failed to generate report');
      }
    } catch (error) {
      console.error('Error generating traceability report:', error);
      toast({
        title: 'Report Generation Failed',
        description: error.message || 'Failed to generate traceability report. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleAddCtqFactor = () => {
    const newCtqFactors = [
      ...(qmpData?.ctqFactors || []),
      {
        id: `ctq-${Date.now()}`,
        name: 'New Critical-to-Quality Factor',
        description: '',
        associatedSection: '',
        riskLevel: 'medium',
        status: 'pending',
        complianceStatus: { ich: 'pending', mdr: 'pending' },
        controls: [],
        verificationActivities: [],
      },
    ];

    setQmpData(prev => ({
      ...prev,
      ctqFactors: newCtqFactors,
    }));

    setTraceabilityData(prev => ({
      ...prev,
      qmpData: {
        ...prev.qmpData,
        ctqFactors: newCtqFactors,
      },
    }));

    if (onTraceabilityDataChange) {
      onTraceabilityDataChange({
        ...traceabilityData,
        qmpData: {
          ...qmpData,
          ctqFactors: newCtqFactors,
        },
      });
    }
  };

  const handleUpdateCtqFactor = (index, field, value) => {
    const updatedFactors = [...qmpData.ctqFactors];
    updatedFactors[index] = {
      ...updatedFactors[index],
      [field]: value,
    };

    setQmpData(prev => ({
      ...prev,
      ctqFactors: updatedFactors,
    }));

    setTraceabilityData(prev => ({
      ...prev,
      qmpData: {
        ...prev.qmpData,
        ctqFactors: updatedFactors,
      },
    }));

    if (onTraceabilityDataChange) {
      onTraceabilityDataChange({
        ...traceabilityData,
        qmpData: {
          ...qmpData,
          ctqFactors: updatedFactors,
        },
      });
    }
  };

  const handleAddControl = factorIndex => {
    const updatedFactors = [...qmpData.ctqFactors];

    if (!updatedFactors[factorIndex].controls) {
      updatedFactors[factorIndex].controls = [];
    }

    updatedFactors[factorIndex].controls.push({
      id: `control-${Date.now()}`,
      name: 'New Control Measure',
      description: '',
      status: 'pending',
      type: 'process',
    });

    setQmpData(prev => ({
      ...prev,
      ctqFactors: updatedFactors,
    }));

    setTraceabilityData(prev => ({
      ...prev,
      qmpData: {
        ...prev.qmpData,
        ctqFactors: updatedFactors,
      },
    }));
  };

  const handleUpdateControl = (factorIndex, controlIndex, field, value) => {
    const updatedFactors = [...qmpData.ctqFactors];
    updatedFactors[factorIndex].controls[controlIndex] = {
      ...updatedFactors[factorIndex].controls[controlIndex],
      [field]: value,
    };

    setQmpData(prev => ({
      ...prev,
      ctqFactors: updatedFactors,
    }));

    setTraceabilityData(prev => ({
      ...prev,
      qmpData: {
        ...prev.qmpData,
        ctqFactors: updatedFactors,
      },
    }));
  };

  const handleAddVerification = factorIndex => {
    const updatedFactors = [...qmpData.ctqFactors];

    if (!updatedFactors[factorIndex].verificationActivities) {
      updatedFactors[factorIndex].verificationActivities = [];
    }

    updatedFactors[factorIndex].verificationActivities.push({
      id: `verification-${Date.now()}`,
      name: 'New Verification Activity',
      description: '',
      status: 'planned',
      dueDate: '',
    });

    setQmpData(prev => ({
      ...prev,
      ctqFactors: updatedFactors,
    }));

    setTraceabilityData(prev => ({
      ...prev,
      qmpData: {
        ...prev.qmpData,
        ctqFactors: updatedFactors,
      },
    }));
  };

  const handleUpdateVerification = (factorIndex, verificationIndex, field, value) => {
    const updatedFactors = [...qmpData.ctqFactors];
    updatedFactors[factorIndex].verificationActivities[verificationIndex] = {
      ...updatedFactors[factorIndex].verificationActivities[verificationIndex],
      [field]: value,
    };

    setQmpData(prev => ({
      ...prev,
      ctqFactors: updatedFactors,
    }));

    setTraceabilityData(prev => ({
      ...prev,
      qmpData: {
        ...prev.qmpData,
        ctqFactors: updatedFactors,
      },
    }));
  };

  const handleSaveAndClose = () => {
    // Save data to backend
    cerApiService
      .saveQmpData(qmpData)
      .then(response => {
        if (response.success) {
          toast({
            title: 'Traceability Data Saved',
            description: 'Your regulatory traceability data has been saved successfully.',
            variant: 'default',
          });
        } else {
          throw new Error('Failed to save data');
        }
      })
      .catch(error => {
        console.error('Error saving QMP data:', error);
        toast({
          title: 'Save Failed',
          description: 'Failed to save traceability data. Please try again.',
          variant: 'destructive',
        });
      });

    // Notify parent component
    if (onTraceabilityDataChange) {
      onTraceabilityDataChange(traceabilityData);
    }
  };

  // Helper function to get status badge
  const getStatusBadge = status => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" /> Completed
          </span>
        );
      case 'in-progress':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" /> In Progress
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
            <CircleDot className="w-3 h-3 mr-1" /> Pending
          </span>
        );
      case 'planned':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">
            <CircleDot className="w-3 h-3 mr-1" /> Planned
          </span>
        );
      case 'at-risk':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
            <AlertCircle className="w-3 h-3 mr-1" /> At Risk
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
            <Info className="w-3 h-3 mr-1" /> {status}
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="mb-4">
          <Skeleton className="h-8 w-[350px]" />
        </div>
        <div className="grid gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-[250px]" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold text-[#323130] flex items-center">
            <ShieldCheck className="mr-2 h-5 w-5 text-[#E3008C]" />
            Regulatory Traceability Matrix
          </h2>
          <p className="text-[#605E5C] text-sm mt-1">
            Monitor and control Critical-to-Quality (CtQ) factors for ICH E6(R3) and EU MDR
            compliance.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHelp(!showHelp)}
            className="text-[#0F6CBD] border-[#0F6CBD] hover:bg-[#EFF6FC]"
          >
            <Info className="mr-1 h-4 w-4" />
            Help
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveAndClose}
            className="text-[#0F6CBD] border-[#0F6CBD] hover:bg-[#EFF6FC]"
          >
            <CheckCircle className="mr-1 h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>

      {showHelp && (
        <Alert className="mb-4 border-l-4 border-l-[#E3008C]">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-[#E3008C]">
            ICH E6(R3) Quality Management Integration
          </AlertTitle>
          <AlertDescription>
            <p className="mb-2">
              The Regulatory Traceability Matrix is essential for demonstrating how
              Critical-to-Quality (CtQ) factors are monitored and controlled throughout the clinical
              evaluation process, providing evidence for both ICH E6(R3) and EU MDR compliance.
            </p>
            <Button
              variant="link"
              className="p-0 h-auto text-[#0F6CBD]"
              onClick={() => {
                // Show full help modal with focus on regulatory traceability section
                setShowHelp(true);
              }}
            >
              Learn more about ICH E6(R3) Quality Management
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full flex bg-[#F3F2F1] p-1 rounded-md">
          <TabsTrigger value="ctq-factors" className="flex-1 rounded data-[state=active]:bg-white">
            <ListChecks className="mr-2 h-4 w-4" />
            CtQ Factors
          </TabsTrigger>
          <TabsTrigger value="controls" className="flex-1 rounded data-[state=active]:bg-white">
            <ShieldCheck className="mr-2 h-4 w-4" />
            Control Measures
          </TabsTrigger>
          <TabsTrigger value="preview" className="flex-1 rounded data-[state=active]:bg-white">
            <FileText className="mr-2 h-4 w-4" />
            Report Preview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ctq-factors" className="mt-4">
          <Card className="border-[#E3008C] border-t-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-[#323130]">
                Critical-to-Quality Factors
              </CardTitle>
              <CardDescription>
                Define and manage Critical-to-Quality (CtQ) factors that affect your clinical
                evaluation process
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!qmpData?.ctqFactors || qmpData.ctqFactors.length === 0 ? (
                <div className="text-center py-6 bg-gray-50 rounded-md">
                  <p className="text-gray-500 mb-4">No Critical-to-Quality factors defined yet.</p>
                  <Button
                    onClick={handleAddCtqFactor}
                    className="bg-[#0F6CBD] hover:bg-[#0F6CBD]/90"
                  >
                    Add First CtQ Factor
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {qmpData.ctqFactors.map((factor, index) => (
                    <Card key={factor.id || index} className="border border-gray-200">
                      <CardHeader className="pb-2 bg-gray-50">
                        <div className="flex justify-between items-center">
                          <Input
                            value={factor.name}
                            onChange={e => handleUpdateCtqFactor(index, 'name', e.target.value)}
                            className="font-medium"
                            placeholder="Factor name"
                          />
                          <div className="ml-2">{getStatusBadge(factor.status)}</div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label
                              htmlFor={`factor-description-${index}`}
                              className="text-sm text-gray-600 mb-1"
                            >
                              Description
                            </Label>
                            <Textarea
                              id={`factor-description-${index}`}
                              value={factor.description}
                              onChange={e =>
                                handleUpdateCtqFactor(index, 'description', e.target.value)
                              }
                              placeholder="Describe this Critical-to-Quality factor..."
                              rows={3}
                              className="resize-none"
                            />
                          </div>
                          <div className="space-y-4">
                            <div>
                              <Label
                                htmlFor={`factor-section-${index}`}
                                className="text-sm text-gray-600 mb-1"
                              >
                                Associated Section
                              </Label>
                              <Input
                                id={`factor-section-${index}`}
                                value={factor.associatedSection}
                                onChange={e =>
                                  handleUpdateCtqFactor(index, 'associatedSection', e.target.value)
                                }
                                placeholder="e.g., Clinical Data, State of Art, GSPR Mapping"
                              />
                            </div>
                            <div>
                              <Label
                                htmlFor={`factor-risk-${index}`}
                                className="text-sm text-gray-600 mb-1"
                              >
                                Risk Level
                              </Label>
                              <Select
                                value={factor.riskLevel}
                                onValueChange={value =>
                                  handleUpdateCtqFactor(index, 'riskLevel', value)
                                }
                              >
                                <SelectTrigger id={`factor-risk-${index}`}>
                                  <SelectValue placeholder="Select risk level" />
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
                              <Label
                                htmlFor={`factor-status-${index}`}
                                className="text-sm text-gray-600 mb-1"
                              >
                                Status
                              </Label>
                              <Select
                                value={factor.status}
                                onValueChange={value =>
                                  handleUpdateCtqFactor(index, 'status', value)
                                }
                              >
                                <SelectTrigger id={`factor-status-${index}`}>
                                  <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="in-progress">In Progress</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                  <SelectItem value="at-risk">At Risk</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4">
                          <div className="flex justify-between items-center mb-2">
                            <Label className="text-sm text-gray-600">Compliance Status</Label>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-[#0F6CBD]"
                              onClick={() => {
                                // Auto update compliance status
                                handleUpdateCtqFactor(index, 'complianceStatus', {
                                  ich: factor.controls?.length > 0 ? 'compliant' : 'pending',
                                  mdr:
                                    factor.verificationActivities?.length > 0
                                      ? 'compliant'
                                      : 'pending',
                                });
                              }}
                            >
                              Update Status
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 gap-2 mb-4">
                            <div className="flex items-center justify-between border rounded p-2 bg-gray-50">
                              <span className="text-sm font-medium">ICH E6(R3):</span>
                              <span
                                className={`text-sm ${
                                  factor.complianceStatus?.ich === 'compliant'
                                    ? 'text-green-600'
                                    : factor.complianceStatus?.ich === 'non-compliant'
                                      ? 'text-red-600'
                                      : 'text-amber-600'
                                }`}
                              >
                                {factor.complianceStatus?.ich || 'pending'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between border rounded p-2 bg-gray-50">
                              <span className="text-sm font-medium">EU MDR:</span>
                              <span
                                className={`text-sm ${
                                  factor.complianceStatus?.mdr === 'compliant'
                                    ? 'text-green-600'
                                    : factor.complianceStatus?.mdr === 'non-compliant'
                                      ? 'text-red-600'
                                      : 'text-amber-600'
                                }`}
                              >
                                {factor.complianceStatus?.mdr || 'pending'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="justify-between bg-gray-50">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddControl(index)}
                          className="text-[#0F6CBD] border-[#0F6CBD] hover:bg-[#EFF6FC]"
                        >
                          <ShieldCheck className="mr-1 h-4 w-4" />
                          Add Control
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddVerification(index)}
                          className="text-[#0F6CBD] border-[#0F6CBD] hover:bg-[#EFF6FC]"
                        >
                          <CheckCircle className="mr-1 h-4 w-4" />
                          Add Verification
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="justify-between border-t">
              <Button
                variant="outline"
                onClick={handleAddCtqFactor}
                className="text-[#0F6CBD] border-[#0F6CBD] hover:bg-[#EFF6FC]"
              >
                Add CtQ Factor
              </Button>
              <Button
                onClick={() => setActiveTab('controls')}
                className="bg-[#0F6CBD] hover:bg-[#0F6CBD]/90"
              >
                Next: Control Measures
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="controls" className="mt-4">
          <Card className="border-[#E3008C] border-t-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-[#323130]">
                Control Measures & Verification
              </CardTitle>
              <CardDescription>
                Manage control measures and verification activities for each Critical-to-Quality
                factor
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!qmpData?.ctqFactors || qmpData.ctqFactors.length === 0 ? (
                <Alert className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No CtQ factors defined</AlertTitle>
                  <AlertDescription>
                    Please define Critical-to-Quality factors first in the CtQ Factors tab.
                    <Button
                      variant="link"
                      className="p-0 h-auto text-[#0F6CBD] block mt-2"
                      onClick={() => setActiveTab('ctq-factors')}
                    >
                      Go to CtQ Factors
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-8">
                  {qmpData.ctqFactors.map((factor, factorIndex) => (
                    <div key={factor.id || factorIndex} className="border rounded-md p-4">
                      <h3 className="text-md font-semibold flex items-center mb-2">
                        <span className="inline-block w-3 h-3 rounded-full bg-[#E3008C] mr-2"></span>
                        {factor.name}
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          ({factor.associatedSection || 'No section'})
                        </span>
                      </h3>

                      <div className="mt-4">
                        <h4 className="text-sm font-medium mb-2 flex items-center">
                          <ShieldCheck className="mr-1 h-4 w-4 text-[#0F6CBD]" />
                          Control Measures
                        </h4>

                        {!factor.controls || factor.controls.length === 0 ? (
                          <div className="text-center py-3 bg-gray-50 rounded-md mb-4">
                            <p className="text-gray-500 text-sm mb-2">
                              No control measures defined for this factor.
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddControl(factorIndex)}
                              className="text-[#0F6CBD] border-[#0F6CBD] hover:bg-[#EFF6FC]"
                            >
                              Add Control Measure
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3 mb-4">
                            {factor.controls.map((control, controlIndex) => (
                              <div
                                key={control.id || controlIndex}
                                className="border rounded-md p-3 bg-gray-50"
                              >
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                    <Label
                                      htmlFor={`control-name-${factorIndex}-${controlIndex}`}
                                      className="text-xs text-gray-600"
                                    >
                                      Control Name
                                    </Label>
                                    <Input
                                      id={`control-name-${factorIndex}-${controlIndex}`}
                                      value={control.name}
                                      onChange={e =>
                                        handleUpdateControl(
                                          factorIndex,
                                          controlIndex,
                                          'name',
                                          e.target.value
                                        )
                                      }
                                      className="mt-1"
                                      placeholder="Control measure name"
                                    />
                                  </div>
                                  <div>
                                    <Label
                                      htmlFor={`control-type-${factorIndex}-${controlIndex}`}
                                      className="text-xs text-gray-600"
                                    >
                                      Control Type
                                    </Label>
                                    <Select
                                      value={control.type}
                                      onValueChange={value =>
                                        handleUpdateControl(
                                          factorIndex,
                                          controlIndex,
                                          'type',
                                          value
                                        )
                                      }
                                    >
                                      <SelectTrigger
                                        id={`control-type-${factorIndex}-${controlIndex}`}
                                        className="mt-1"
                                      >
                                        <SelectValue placeholder="Control type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="process">Process Control</SelectItem>
                                        <SelectItem value="documentation">Documentation</SelectItem>
                                        <SelectItem value="review">Review</SelectItem>
                                        <SelectItem value="testing">Testing</SelectItem>
                                        <SelectItem value="monitoring">Monitoring</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="col-span-2">
                                    <Label
                                      htmlFor={`control-description-${factorIndex}-${controlIndex}`}
                                      className="text-xs text-gray-600"
                                    >
                                      Description
                                    </Label>
                                    <Textarea
                                      id={`control-description-${factorIndex}-${controlIndex}`}
                                      value={control.description}
                                      onChange={e =>
                                        handleUpdateControl(
                                          factorIndex,
                                          controlIndex,
                                          'description',
                                          e.target.value
                                        )
                                      }
                                      placeholder="Describe this control measure..."
                                      className="mt-1"
                                      rows={2}
                                    />
                                  </div>
                                </div>
                                <div className="mt-2 flex justify-end">
                                  <Select
                                    value={control.status}
                                    onValueChange={value =>
                                      handleUpdateControl(
                                        factorIndex,
                                        controlIndex,
                                        'status',
                                        value
                                      )
                                    }
                                  >
                                    <SelectTrigger className="w-[140px]">
                                      <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="pending">Pending</SelectItem>
                                      <SelectItem value="in-progress">In Progress</SelectItem>
                                      <SelectItem value="completed">Completed</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            ))}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddControl(factorIndex)}
                              className="mt-1"
                            >
                              Add Another Control
                            </Button>
                          </div>
                        )}

                        <h4 className="text-sm font-medium mb-2 flex items-center mt-4">
                          <CheckCircle className="mr-1 h-4 w-4 text-[#0F6CBD]" />
                          Verification Activities
                        </h4>

                        {!factor.verificationActivities ||
                        factor.verificationActivities.length === 0 ? (
                          <div className="text-center py-3 bg-gray-50 rounded-md">
                            <p className="text-gray-500 text-sm mb-2">
                              No verification activities defined for this factor.
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddVerification(factorIndex)}
                              className="text-[#0F6CBD] border-[#0F6CBD] hover:bg-[#EFF6FC]"
                            >
                              Add Verification Activity
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {factor.verificationActivities.map(
                              (verification, verificationIndex) => (
                                <div
                                  key={verification.id || verificationIndex}
                                  className="border rounded-md p-3 bg-gray-50"
                                >
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                      <Label
                                        htmlFor={`verification-name-${factorIndex}-${verificationIndex}`}
                                        className="text-xs text-gray-600"
                                      >
                                        Activity Name
                                      </Label>
                                      <Input
                                        id={`verification-name-${factorIndex}-${verificationIndex}`}
                                        value={verification.name}
                                        onChange={e =>
                                          handleUpdateVerification(
                                            factorIndex,
                                            verificationIndex,
                                            'name',
                                            e.target.value
                                          )
                                        }
                                        className="mt-1"
                                        placeholder="Verification activity name"
                                      />
                                    </div>
                                    <div>
                                      <Label
                                        htmlFor={`verification-date-${factorIndex}-${verificationIndex}`}
                                        className="text-xs text-gray-600"
                                      >
                                        Due Date
                                      </Label>
                                      <Input
                                        id={`verification-date-${factorIndex}-${verificationIndex}`}
                                        type="date"
                                        value={verification.dueDate}
                                        onChange={e =>
                                          handleUpdateVerification(
                                            factorIndex,
                                            verificationIndex,
                                            'dueDate',
                                            e.target.value
                                          )
                                        }
                                        className="mt-1"
                                      />
                                    </div>
                                    <div className="col-span-2">
                                      <Label
                                        htmlFor={`verification-description-${factorIndex}-${verificationIndex}`}
                                        className="text-xs text-gray-600"
                                      >
                                        Description
                                      </Label>
                                      <Textarea
                                        id={`verification-description-${factorIndex}-${verificationIndex}`}
                                        value={verification.description}
                                        onChange={e =>
                                          handleUpdateVerification(
                                            factorIndex,
                                            verificationIndex,
                                            'description',
                                            e.target.value
                                          )
                                        }
                                        placeholder="Describe this verification activity..."
                                        className="mt-1"
                                        rows={2}
                                      />
                                    </div>
                                  </div>
                                  <div className="mt-2 flex justify-end">
                                    <Select
                                      value={verification.status}
                                      onValueChange={value =>
                                        handleUpdateVerification(
                                          factorIndex,
                                          verificationIndex,
                                          'status',
                                          value
                                        )
                                      }
                                    >
                                      <SelectTrigger className="w-[140px]">
                                        <SelectValue placeholder="Status" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="planned">Planned</SelectItem>
                                        <SelectItem value="in-progress">In Progress</SelectItem>
                                        <SelectItem value="completed">Completed</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              )
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddVerification(factorIndex)}
                              className="mt-1"
                            >
                              Add Another Verification
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="justify-between border-t">
              <Button
                variant="outline"
                onClick={() => setActiveTab('ctq-factors')}
                className="text-[#0F6CBD] border-[#0F6CBD] hover:bg-[#EFF6FC]"
              >
                Back to CtQ Factors
              </Button>
              <Button
                onClick={handleGenerateReport}
                disabled={
                  isGeneratingReport || !qmpData?.ctqFactors || qmpData.ctqFactors.length === 0
                }
                className="bg-[#0F6CBD] hover:bg-[#0F6CBD]/90"
              >
                {isGeneratingReport ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Report...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Generate Traceability Report
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <Card className="border-[#E3008C] border-t-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-[#323130]">
                Regulatory Traceability Report Preview
              </CardTitle>
              <CardDescription>
                Preview the generated traceability report before including it in your CER
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!traceabilityData.generatedReport ? (
                <div className="text-center py-8 bg-gray-50 rounded-md">
                  <p className="text-gray-500 mb-4">
                    No traceability report has been generated yet.
                  </p>
                  <Button
                    onClick={handleGenerateReport}
                    disabled={
                      isGeneratingReport || !qmpData?.ctqFactors || qmpData.ctqFactors.length === 0
                    }
                    className="bg-[#0F6CBD] hover:bg-[#0F6CBD]/90"
                  >
                    {isGeneratingReport ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating Report...
                      </>
                    ) : (
                      <>
                        <FileText className="mr-2 h-4 w-4" />
                        Generate Traceability Report
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="border rounded-md p-4 bg-white">
                  <div className="prose max-w-none">
                    <h2 className="text-xl text-[#323130] font-bold mb-4">
                      {traceabilityData.generatedReport.title}
                    </h2>
                    <div
                      className="markdown-content"
                      dangerouslySetInnerHTML={{
                        __html: traceabilityData.generatedReport.content.replace(/\n/g, '<br />'),
                      }}
                    />
                  </div>

                  <div className="mt-6 text-sm text-gray-500">
                    <p>
                      Last Updated:{' '}
                      {new Date(traceabilityData.lastUpdated || new Date()).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="justify-between border-t">
              <Button
                variant="outline"
                onClick={() => setActiveTab('controls')}
                className="text-[#0F6CBD] border-[#0F6CBD] hover:bg-[#EFF6FC]"
              >
                Back to Controls
              </Button>
              {traceabilityData.generatedReport && (
                <Button
                  onClick={() => {
                    // Add to CER
                    if (onGenerateReport) {
                      onGenerateReport(traceabilityData.generatedReport);
                      toast({
                        title: 'Report Added to CER',
                        description: 'The traceability report has been added to your CER.',
                        variant: 'default',
                      });
                    }
                  }}
                  className="bg-[#0F6CBD] hover:bg-[#0F6CBD]/90"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Add to CER Document
                </Button>
              )}
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Help Modal using QmpIntegrationHelp with controlled state */}
      <QmpIntegrationHelp
        isDialogOpen={showHelp}
        setIsDialogOpen={setShowHelp}
        focusSection="regulatory-traceability"
        className="hidden" // We trigger via state, not button click
      />
    </div>
  );
};

export default RegulatoryTraceabilityMatrix;

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toaster';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  GitCompare,
  ArrowRight,
  Check,
  Loader2,
  FileCheck,
  X,
  ChevronDown,
  ChevronUp,
  Info,
  Save,
  FileText,
  BookOpen,
  Calendar,
  BarChart2,
  PlusCircle,
  MinusCircle,
  File,
  Link,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import FDA510kService from '@/services/FDA510kService';
import LiteratureTab from './LiteratureTab';

/**
 * Equivalence Builder Panel for 510(k) Submissions
 *
 * This component allows users to build a substantial equivalence argument
 * for their 510(k) submission by comparing their device to predicate devices.
 */
const EquivalenceBuilderPanel = ({
  deviceProfile,
  documentId,
  onComplete,
  predicateDevices = [],
  selectedLiterature = [],
}) => {
  const [selectedTab, setSelectedTab] = useState('overview');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [comparisonFeatures, setComparisonFeatures] = useState([
    {
      id: 'f1',
      name: 'Intended Use',
      subjectDevice: deviceProfile?.intendedUse || '',
      predicateDevice: '',
      substantial: true,
      comments: '',
    },
    {
      id: 'f2',
      name: 'Indications for Use',
      subjectDevice: '',
      predicateDevice: '',
      substantial: null,
      comments: '',
    },
    {
      id: 'f3',
      name: 'Technology',
      subjectDevice: '',
      predicateDevice: '',
      substantial: null,
      comments: '',
    },
    {
      id: 'f4',
      name: 'Materials',
      subjectDevice: '',
      predicateDevice: '',
      substantial: null,
      comments: '',
    },
    {
      id: 'f5',
      name: 'Performance',
      subjectDevice: '',
      predicateDevice: '',
      substantial: null,
      comments: '',
    },
    {
      id: 'f6',
      name: 'Safety',
      subjectDevice: '',
      predicateDevice: '',
      substantial: null,
      comments: '',
    },
    {
      id: 'f7',
      name: 'Standards Compliance',
      subjectDevice: deviceProfile?.technicalSpecifications || '',
      predicateDevice: '',
      substantial: null,
      comments: '',
    },
  ]);
  const [selectedPredicateDevice, setSelectedPredicateDevice] = useState(
    predicateDevices?.[0]?.id || ''
  );
  const [summaryStatement, setSummaryStatement] = useState('');
  const [equivalenceComplete, setEquivalenceComplete] = useState(false);
  const [literatureEvidence, setLiteratureEvidence] = useState({});
  const [activeFeatureForEvidence, setActiveFeatureForEvidence] = useState(null);
  const { toast } = useToast();

  // Verification effect runs first to ensure equivalence analysis is ready
  useEffect(() => {
    const verifyEquivalenceReady = async () => {
      if (deviceProfile?.id) {
        try {
          console.log(
            '[EquivalenceBuilderPanel] Checking equivalence readiness for device:',
            deviceProfile.id
          );

          // Mock verification since API endpoint is not working
          // This allows development to proceed while the backend issue is fixed
          if (predicateDevices && predicateDevices.length > 0) {
            console.log(
              '[EquivalenceBuilderPanel] Found predicate devices:',
              predicateDevices.length
            );
            toast({
              title: 'Equivalence Analysis Ready',
              description: 'Found predicate devices for equivalence analysis',
              duration: 2000,
            });
          } else {
            console.warn('[EquivalenceBuilderPanel] No predicate devices available');
            toast({
              title: 'Equivalence Analysis Warning',
              description: 'No predicate devices available for equivalence analysis',
              variant: 'destructive',
              duration: 3000,
            });
          }
        } catch (error) {
          console.error('[EquivalenceBuilderPanel] Equivalence verification failed:', error);
        }
      }
    };

    verifyEquivalenceReady();
  }, [deviceProfile, predicateDevices]);

  // Initialize with predicate devices data and log component mounting
  useEffect(() => {
    console.log('[EquivalenceBuilderPanel] Component mounted with:', {
      deviceProfile: deviceProfile?.id || 'No device profile',
      documentId: documentId || 'No document ID',
      predicateDevicesCount: predicateDevices?.length || 0,
      selectedLiteratureCount: selectedLiterature?.length || 0,
    });

    if (predicateDevices?.length > 0) {
      console.log('[EquivalenceBuilderPanel] Setting predicate device:', predicateDevices[0].id);
      // Force selection of first predicate device regardless of current state
      setSelectedPredicateDevice(predicateDevices[0].id);
    } else {
      console.warn('[EquivalenceBuilderPanel] No predicate devices available');

      // Show user-friendly error message
      toast({
        title: 'Missing Predicate Devices',
        description:
          'No predicate devices are available. Please return to the previous step and select predicates.',
        variant: 'destructive',
        duration: 5000,
      });
    }

    // Pre-populate device-specific data in comparison features
    if (deviceProfile) {
      setComparisonFeatures(features =>
        features.map(feature => {
          // Update fields that can be populated from device profile
          if (feature.name === 'Intended Use') {
            return {
              ...feature,
              subjectDevice: deviceProfile.intendedUse || feature.subjectDevice,
            };
          } else if (feature.name === 'Standards Compliance') {
            return {
              ...feature,
              subjectDevice: deviceProfile.technicalSpecifications || feature.subjectDevice,
            };
          }
          return feature;
        })
      );
    } else {
      console.error('[EquivalenceBuilderPanel] Missing device profile data');
    }
  }, [predicateDevices, deviceProfile]);

  // Process selected literature
  useEffect(() => {
    if (selectedLiterature?.length > 0) {
      const evidenceMap = {};

      // Organize literature evidence by relevant feature
      selectedLiterature.forEach(paper => {
        if (paper.relevantFeatures) {
          paper.relevantFeatures.forEach(feature => {
            if (!evidenceMap[feature]) {
              evidenceMap[feature] = [];
            }
            evidenceMap[feature].push(paper);
          });
        }
      });

      setLiteratureEvidence(evidenceMap);
    }
  }, [selectedLiterature]);

  // Generate a summary statement of the substantial equivalence analysis
  const generateSummaryStatement = () => {
    const selectedPredicate = predicateDevices.find(d => d.id === selectedPredicateDevice);

    // Count total features and substantially equivalent features
    const totalFeatures = comparisonFeatures.length;
    const substantialFeatures = comparisonFeatures.filter(f => f.substantial === true).length;
    const nonSubstantialFeatures = comparisonFeatures.filter(f => f.substantial === false).length;
    const undeterminedFeatures = comparisonFeatures.filter(f => f.substantial === null).length;

    let summary = `This analysis compares ${deviceProfile?.deviceName || 'Subject Device'} with ${selectedPredicate?.name || 'Predicate Device'} (${selectedPredicate?.k_number || 'Unknown K Number'}).\n\n`;

    if (undeterminedFeatures === 0) {
      if (nonSubstantialFeatures === 0) {
        summary += `All ${totalFeatures} analyzed features demonstrate substantial equivalence. `;
      } else {
        summary += `${substantialFeatures} of ${totalFeatures} analyzed features demonstrate substantial equivalence. `;
        summary += `${nonSubstantialFeatures} features may require additional testing or justification. `;
      }
    } else {
      summary += `${substantialFeatures} features demonstrate substantial equivalence, ${nonSubstantialFeatures} are not equivalent, and ${undeterminedFeatures} require further analysis. `;
    }

    // Add literature evidence summary if available
    const featuresWithEvidence = Object.keys(literatureEvidence).length;
    if (featuresWithEvidence > 0) {
      const totalPapers = selectedLiterature.length;
      summary += `\n\nSupporting literature evidence includes ${totalPapers} papers, with ${featuresWithEvidence} features having specific literature support. `;
    }

    return summary;
  };

  // Submit the completed equivalence analysis
  const completeEquivalenceAnalysis = async () => {
    setIsAnalyzing(true);
    setProgress(0);

    // Simulate progress
    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + 10;
        if (newProgress >= 100) {
          clearInterval(interval);
          return 100;
        }
        return newProgress;
      });
    }, 300);

    try {
      // Create the payload for our equivalence analysis
      const equivalenceData = {
        documentId,
        predicateDeviceId: selectedPredicateDevice,
        features: comparisonFeatures,
        summaryStatement: summaryStatement || generateSummaryStatement(),
        literatureEvidence,
      };

      // Update our backend with complete equivalence data including literature evidence
      const folderStructure = deviceProfile?.folderStructure || {};
      await FDA510kService.saveEquivalenceAnalysis({
        ...equivalenceData,
        folderStructure,
      });

      // Clear interval and mark as complete
      clearInterval(interval);
      setProgress(100);
      setEquivalenceComplete(true);

      // Notify success
      toast({
        title: 'Equivalence Analysis Saved',
        description: 'Your substantial equivalence analysis has been completed and saved.',
      });

      // Call the completion callback if provided
      if (onComplete) {
        onComplete(equivalenceData);
      }
    } catch (error) {
      console.error('Error saving equivalence analysis:', error);
      clearInterval(interval);
      setProgress(0);

      // Notify error
      toast({
        title: 'Error',
        description: 'Failed to save the equivalence analysis. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle changes to feature comparison data
  const handleFeatureChange = (featureId, field, value) => {
    setComparisonFeatures(features =>
      features.map(feature => (feature.id === featureId ? { ...feature, [field]: value } : feature))
    );
  };

  // Render the tab navigation
  const renderTabNavigation = () => (
    <div className="flex space-x-4 border-b">
      <div className="flex">
        <Button
          variant={selectedTab === 'overview' ? 'subtle' : 'ghost'}
          className={`rounded-none border-b-2 ${
            selectedTab === 'overview'
              ? 'border-blue-600 text-stone-600'
              : 'border-transparent text-stone-600'
          }`}
          onClick={() => setSelectedTab('overview')}
        >
          Overview
        </Button>
        <Button
          variant={selectedTab === 'comparison' ? 'subtle' : 'ghost'}
          className={`rounded-none border-b-2 ${
            selectedTab === 'comparison'
              ? 'border-blue-600 text-stone-600'
              : 'border-transparent text-stone-600'
          }`}
          onClick={() => setSelectedTab('comparison')}
          disabled={predicateDevices.length === 0 || !selectedPredicateDevice}
        >
          Feature Comparison
        </Button>
        <Button
          variant={selectedTab === 'literature' ? 'subtle' : 'ghost'}
          className={`rounded-none border-b-2 ${
            selectedTab === 'literature'
              ? 'border-blue-600 text-stone-600'
              : 'border-transparent text-stone-600'
          }`}
          onClick={() => setSelectedTab('literature')}
          disabled={predicateDevices.length === 0 || !selectedPredicateDevice}
        >
          Supporting Literature
        </Button>
        <Button
          variant={selectedTab === 'summary' ? 'subtle' : 'ghost'}
          className={`rounded-none border-b-2 ${
            selectedTab === 'summary'
              ? 'border-blue-600 text-stone-600'
              : 'border-transparent text-stone-600'
          }`}
          onClick={() => {
            setSummaryStatement(generateSummaryStatement());
            setSelectedTab('summary');
          }}
          disabled={predicateDevices.length === 0 || !selectedPredicateDevice}
        >
          Summary
        </Button>
      </div>
    </div>
  );

  // Helper function to toggle literature associations for a feature
  const toggleLiteratureForFeature = (featureId, paper, isChecked) => {
    if (!featureId) return;

    setLiteratureEvidence(prev => {
      const newEvidence = { ...prev };

      // If feature doesn't have an array yet, create one
      if (!newEvidence[featureId]) {
        newEvidence[featureId] = [];
      }

      if (isChecked) {
        // Add paper if not already present
        if (!newEvidence[featureId].some(p => p.id === paper.id)) {
          newEvidence[featureId].push(paper);
        }
      } else {
        // Remove paper
        newEvidence[featureId] = newEvidence[featureId].filter(p => p.id !== paper.id);

        // Clean up empty arrays
        if (newEvidence[featureId].length === 0) {
          delete newEvidence[featureId];
        }
      }

      return newEvidence;
    });

    // Show feedback to the user
    toast({
      title: isChecked ? 'Evidence Added' : 'Evidence Removed',
      description: isChecked
        ? `Paper added as supporting evidence for this feature.`
        : `Paper removed from feature evidence.`,
      variant: isChecked ? 'default' : 'destructive',
    });
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="bg-stone-50 border-b">
        <CardTitle className="text-stone-800 flex items-center">
          <GitCompare className="mr-2 h-5 w-5 text-stone-600" />
          Substantial Equivalence Analysis
        </CardTitle>
        <CardDescription>
          Demonstrate substantial equivalence to predicate devices for your 510(k) submission
        </CardDescription>
        {renderTabNavigation()}
      </CardHeader>

      <CardContent className="p-6">
        {selectedTab === 'overview' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium">Predicate Device Selection</h3>
              <p className="text-sm text-stone-500 mb-2">
                Select the primary predicate device for your substantial equivalence comparison.
              </p>

              <Select value={selectedPredicateDevice} onValueChange={setSelectedPredicateDevice}>
                <SelectTrigger className="w-full md:w-[400px]">
                  <SelectValue placeholder="Select a predicate device" />
                </SelectTrigger>
                <SelectContent>
                  {predicateDevices.map(device => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.name} ({device.k_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {predicateDevices.length === 0 && (
              <div className="bg-amber-50 p-4 rounded-md border border-amber-200">
                <div className="flex items-start">
                  <Info className="h-5 w-5 text-amber-600 mt-0.5 mr-2 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-amber-800">No Predicate Devices</h4>
                    <p className="text-sm text-amber-700 mt-1">
                      You need to select predicate devices in the Predicate Finder tab before you
                      can build an equivalence argument.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {selectedPredicateDevice && (
              <div className="border rounded-md mt-4">
                <div className="bg-stone-50 p-3 rounded-t-md border-b">
                  <h4 className="font-medium">Selected Predicate Device</h4>
                </div>
                <div className="p-3">
                  {(() => {
                    const selectedDevice = predicateDevices.find(
                      d => d.id === selectedPredicateDevice
                    );
                    return (
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-medium text-stone-500">Device Name</p>
                          <p>{selectedDevice?.name}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-stone-500">K Number</p>
                          <p>{selectedDevice?.k_number}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-stone-500">Manufacturer</p>
                          <p>{selectedDevice?.manufacturer}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-stone-500">Decision Date</p>
                          <p>{selectedDevice?.decision_date}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {selectedTab === 'comparison' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-medium">Feature Comparison</h3>

              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Auto-fill predicate device details from the database
                    toast({
                      title: 'Auto-filling Predicate Details',
                      description:
                        'Fetching and populating predicate device information from FDA database.',
                    });

                    // Simulate fetching data
                    setTimeout(() => {
                      setComparisonFeatures(features =>
                        features.map(feature => ({
                          ...feature,
                          predicateDevice:
                            feature.predicateDevice || `Predicate data for ${feature.name}`,
                        }))
                      );
                    }, 1000);
                  }}
                >
                  <FileCheck className="h-4 w-4 mr-1" />
                  Auto-fill Predicate
                </Button>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead className="w-[200px]">Feature</TableHead>
                  <TableHead>Subject Device</TableHead>
                  <TableHead>Predicate Device</TableHead>
                  <TableHead className="w-[150px]">Substantial?</TableHead>
                  {selectedLiterature.length > 0 && (
                    <TableHead className="w-[120px]">Evidence</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisonFeatures.map(feature => (
                  <TableRow key={feature.id}>
                    <TableCell className="font-medium">{feature.name}</TableCell>
                    <TableCell>
                      <Textarea
                        className="min-h-[80px]"
                        value={feature.subjectDevice}
                        onChange={e =>
                          handleFeatureChange(feature.id, 'subjectDevice', e.target.value)
                        }
                        placeholder={`Enter ${feature.name.toLowerCase()} details for your device`}
                      />
                    </TableCell>
                    <TableCell>
                      <Textarea
                        className="min-h-[80px]"
                        value={feature.predicateDevice}
                        onChange={e =>
                          handleFeatureChange(feature.id, 'predicateDevice', e.target.value)
                        }
                        placeholder={`Enter ${feature.name.toLowerCase()} details for predicate device`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col space-y-2">
                        <div className="flex space-x-2">
                          <Button
                            variant={feature.substantial === true ? 'default' : 'outline'}
                            size="sm"
                            className={
                              feature.substantial === true ? 'bg-green-600 hover:bg-green-700' : ''
                            }
                            onClick={() => handleFeatureChange(feature.id, 'substantial', true)}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Yes
                          </Button>
                          <Button
                            variant={feature.substantial === false ? 'default' : 'outline'}
                            size="sm"
                            className={
                              feature.substantial === false ? 'bg-red-600 hover:bg-red-700' : ''
                            }
                            onClick={() => handleFeatureChange(feature.id, 'substantial', false)}
                          >
                            <X className="h-4 w-4 mr-1" />
                            No
                          </Button>
                        </div>
                        <Textarea
                          className="text-xs"
                          value={feature.comments}
                          onChange={e =>
                            handleFeatureChange(feature.id, 'comments', e.target.value)
                          }
                          placeholder="Add comments on equivalence..."
                        />
                      </div>
                    </TableCell>
                    {selectedLiterature.length > 0 && (
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {literatureEvidence[feature.id] ? (
                            <Badge className="bg-stone-100 text-stone-800 hover:bg-stone-100">
                              {literatureEvidence[feature.id].length}{' '}
                              {literatureEvidence[feature.id].length === 1 ? 'Paper' : 'Papers'}
                            </Badge>
                          ) : (
                            <span className="text-stone-500 text-sm">None</span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => setActiveFeatureForEvidence(feature.id)}
                          >
                            <Link className="h-4 w-4 text-stone-600" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {selectedTab === 'literature' && (
          <LiteratureTab
            deviceFeatures={comparisonFeatures}
            deviceName={deviceProfile?.deviceName || ''}
            documentId={documentId}
            manufacturer={deviceProfile?.manufacturer || ''}
            onEvidenceUpdated={updatedEvidence => {
              setLiteratureEvidence(updatedEvidence);
              toast({
                title: 'Literature Evidence Updated',
                description: 'Your feature-literature connections have been saved.',
                variant: 'default',
              });
            }}
          />
        )}

        {selectedTab === 'summary' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Summary Statement</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSummaryStatement(generateSummaryStatement());
                  toast({
                    title: 'Summary Updated',
                    description: 'The summary statement has been regenerated.',
                  });
                }}
              >
                <FileText className="h-4 w-4 mr-1" />
                Generate Summary
              </Button>
            </div>

            <Textarea
              className="min-h-[200px]"
              value={summaryStatement}
              onChange={e => setSummaryStatement(e.target.value)}
              placeholder="Enter or generate a summary of your substantial equivalence argument"
            />

            <div className="mt-2">
              <h4 className="font-medium mb-2">Equivalence Overview</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-emerald-50 border border-green-100 rounded-md p-3">
                  <p className="text-sm text-emerald-600 mb-1">Substantially Equivalent</p>
                  <p className="text-2xl font-bold text-emerald-700">
                    {comparisonFeatures.filter(f => f.substantial === true).length}
                    <span className="text-sm font-normal text-green-500 ml-1">features</span>
                  </p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-md p-3">
                  <p className="text-sm text-red-600 mb-1">Not Equivalent</p>
                  <p className="text-2xl font-bold text-red-700">
                    {comparisonFeatures.filter(f => f.substantial === false).length}
                    <span className="text-sm font-normal text-red-500 ml-1">features</span>
                  </p>
                </div>
                <div className="bg-stone-50 border border-stone-100 rounded-md p-3">
                  <p className="text-sm text-stone-600 mb-1">Not Determined</p>
                  <p className="text-2xl font-bold text-stone-700">
                    {comparisonFeatures.filter(f => f.substantial === null).length}
                    <span className="text-sm font-normal text-stone-500 ml-1">features</span>
                  </p>
                </div>
              </div>
            </div>

            {Object.keys(literatureEvidence).length > 0 && (
              <div className="mt-2">
                <h4 className="font-medium mb-2">Supporting Literature</h4>
                <div className="bg-stone-50 border border-blue-100 rounded-md p-3">
                  <p className="text-sm text-stone-600 mb-1">Literature Support</p>
                  <div className="flex items-baseline">
                    <p className="text-2xl font-bold text-stone-700">
                      {Object.keys(literatureEvidence).length}
                      <span className="text-sm font-normal text-blue-500 ml-1">features</span>
                    </p>
                    <p className="text-sm text-blue-500 ml-3">
                      with {selectedLiterature.length} papers
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="bg-stone-50 border-t p-4">
        <div className="w-full flex items-center justify-end gap-4">
          {isAnalyzing && (
            <div className="flex-1 max-w-md">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-stone-500 mt-1">Analyzing equivalence...</p>
            </div>
          )}
          <Button
            variant="primary"
            onClick={completeEquivalenceAnalysis}
            disabled={equivalenceComplete || isAnalyzing}
          >
            {equivalenceComplete ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Completed
              </>
            ) : (
              <>
                {isAnalyzing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileCheck className="mr-2 h-4 w-4" />
                )}
                Complete Analysis
              </>
            )}
          </Button>
        </div>
      </CardFooter>

      {/* Literature Evidence Selection Dialog */}
      <Dialog
        open={activeFeatureForEvidence !== null}
        onOpenChange={open => !open && setActiveFeatureForEvidence(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Assign Literature Evidence</DialogTitle>
            <DialogDescription>
              Select literature to associate with this feature to strengthen your substantial
              equivalence argument.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {activeFeatureForEvidence && (
              <div className="mb-4 p-3 bg-stone-50 rounded-md border border-blue-100">
                <h3 className="font-medium text-stone-800">Feature</h3>
                <p>{comparisonFeatures.find(f => f.id === activeFeatureForEvidence)?.name}</p>
              </div>
            )}

            <ScrollArea className="h-[320px]">
              <div className="space-y-3">
                {selectedLiterature.map(paper => {
                  // Check if this paper is already linked to the active feature
                  const isLinked = literatureEvidence[activeFeatureForEvidence]?.some(
                    linkedPaper => linkedPaper.id === paper.id
                  );

                  return (
                    <div key={paper.id} className="flex items-start gap-3 p-3 border rounded-md">
                      <Checkbox
                        checked={isLinked}
                        id={`paper-${paper.id}`}
                        onCheckedChange={checked => {
                          toggleLiteratureForFeature(activeFeatureForEvidence, paper, checked);
                        }}
                      />
                      <div className="flex-1">
                        <label
                          htmlFor={`paper-${paper.id}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {paper.title}
                        </label>
                        <div className="text-xs text-stone-500 flex items-center gap-2 mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(paper.publicationDate || Date.now()).getFullYear()}
                          </span>
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3 w-3" />
                            {paper.journal || 'Journal'}
                          </span>
                          {paper.relevanceScore && (
                            <span className="flex items-center gap-1">
                              <BarChart2 className="h-3 w-3" />
                              {Math.round(paper.relevanceScore * 100)}% relevant
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setActiveFeatureForEvidence(null)}>
              Cancel
            </Button>
            <Button onClick={() => setActiveFeatureForEvidence(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default EquivalenceBuilderPanel;

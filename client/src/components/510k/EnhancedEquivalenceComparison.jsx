import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowRight,
  Download,
  Check,
  X,
  AlertTriangle,
  Lightbulb,
  FileText,
  HelpCircle,
  Plus,
  Minus,
  Filter,
  BarChart,
  Printer,
  Share2,
  Star,
  ChevronsUpDown,
  ExternalLink,
  Search,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * Enhanced Equivalence Comparison Component
 *
 * Provides a detailed side-by-side comparison of the subject device against
 * predicate devices with visual indicators for equivalence.
 */
const EnhancedEquivalenceComparison = ({
  subjectDevice,
  predicateDevices,
  onGenerateReport,
  onRequestAIAssistance,
}) => {
  // Core state variables
  const [activeTab, setActiveTab] = useState('technical');
  const [expandedParameters, setExpandedParameters] = useState({});
  const [aiSuggestions, setAiSuggestions] = useState({});
  const [equivalenceScores, setEquivalenceScores] = useState({
    overall: 0,
    technical: 0,
    performance: 0,
    safety: 0,
    clinical: 0,
  });
  const [comparisonMode, setComparisonMode] = useState('detailed');
  const [selectedPredicate, setSelectedPredicate] = useState(predicateDevices[0]?.id);
  const [filterNonEquivalent, setFilterNonEquivalent] = useState(false);
  const [showEquivalenceCriteria, setShowEquivalenceCriteria] = useState(false);

  // Advanced features and enhancements
  const [searchTerm, setSearchTerm] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [parameterImportance, setParameterImportance] = useState({});
  const [showVisualComparison, setShowVisualComparison] = useState(false);
  const [exportFormat, setExportFormat] = useState('json');
  const [showCitations, setShowCitations] = useState(false);
  const [regulatoryNotes, setRegulatoryNotes] = useState({});
  const [comparisonHistory, setComparisonHistory] = useState([]);
  const [equivalenceThreshold, setEquivalenceThreshold] = useState(0.1); // 10% default
  const [autoSuggestMitigations, setAutoSuggestMitigations] = useState(true);
  const [highlightCriticalParameters, setHighlightCriticalParameters] = useState(true);

  // Calculate equivalence scores when devices change
  useEffect(() => {
    if (!subjectDevice || !predicateDevices.length) return;

    // Simple heuristic for demo purposes - in production this would be more sophisticated
    const selectedPredicateDevice = predicateDevices.find(p => p.id === selectedPredicate);
    if (!selectedPredicateDevice) return;

    const technicalScore = calculateCategoryScore(
      subjectDevice.technicalCharacteristics || [],
      selectedPredicateDevice.technicalCharacteristics || []
    );

    const performanceScore = calculateCategoryScore(
      subjectDevice.performanceData || [],
      selectedPredicateDevice.performanceData || []
    );

    const safetyScore = calculateCategoryScore(
      subjectDevice.safetyFeatures || [],
      selectedPredicateDevice.safetyFeatures || []
    );

    const clinicalScore = 75; // Placeholder - would be calculated in production version

    const overall = Math.round(
      (technicalScore + performanceScore + safetyScore + clinicalScore) / 4
    );

    setEquivalenceScores({
      overall,
      technical: technicalScore,
      performance: performanceScore,
      safety: safetyScore,
      clinical: clinicalScore,
    });
  }, [subjectDevice, predicateDevices, selectedPredicate]);

  // Calculate a category score based on parameters
  const calculateCategoryScore = (subjectParams = [], predicateParams = []) => {
    if (!subjectParams.length || !predicateParams.length) return 0;

    // Map the parameters by name for easier comparison
    const predicateMap = predicateParams.reduce((map, param) => {
      map[param.name] = param.value;
      return map;
    }, {});

    // Count matches
    let matches = 0;
    subjectParams.forEach(param => {
      if (predicateMap[param.name] && isEquivalent(param.value, predicateMap[param.name])) {
        matches++;
      }
    });

    return Math.round((matches / subjectParams.length) * 100);
  };

  // Determine if two parameter values are equivalent
  const isEquivalent = (value1, value2, parameterType = 'general') => {
    if (value1 === value2) return true;

    // For numeric comparisons, allow small differences
    if (!isNaN(value1) && !isNaN(value2)) {
      const num1 = parseFloat(value1);
      const num2 = parseFloat(value2);
      return Math.abs((num1 - num2) / Math.max(num1, num2)) < 0.1; // Allow 10% difference
    }

    // Special handling for performance metrics
    if (parameterType === 'performance') {
      // For percentage values in performance metrics, subject device should be at least as good
      if (String(value1).includes('%') && String(value2).includes('%')) {
        const num1 = parseFloat(String(value1));
        const num2 = parseFloat(String(value2));
        if (!isNaN(num1) && !isNaN(num2)) {
          return num1 >= num2;
        }
      }

      // For time/latency metrics, lower is better
      if (String(value1).includes('ms') && String(value2).includes('ms')) {
        const num1 = parseFloat(String(value1));
        const num2 = parseFloat(String(value2));
        if (!isNaN(num1) && !isNaN(num2)) {
          return num1 <= num2;
        }
      }
    }

    // String comparisons - could be enhanced with more sophisticated equivalence logic
    if (typeof value1 === 'string' && typeof value2 === 'string') {
      const v1 = value1.toLowerCase();
      const v2 = value2.toLowerCase();
      return v1.includes(v2) || v2.includes(v1);
    }

    return false;
  };

  // Enhanced filtered parameters with search, advanced filtering, and importance scoring
  const getFilteredParameters = paramType => {
    let parameters = [];

    // Get the appropriate parameter list based on tab
    if (paramType === 'technical') {
      parameters = subjectDevice.technicalCharacteristics || [];
    } else if (paramType === 'performance') {
      parameters = subjectDevice.performanceData || [];
    } else if (paramType === 'safety') {
      parameters = subjectDevice.safetyFeatures || [];
    } else {
      parameters = []; // No clinical parameters in this demo
    }

    const selectedPredicateData = predicateDevices.find(p => p.id === selectedPredicate);
    if (!selectedPredicateData) return parameters;

    // Apply search term filtering if present
    if (searchTerm.trim()) {
      const lowercaseSearch = searchTerm.toLowerCase().trim();
      parameters = parameters.filter(
        param =>
          param.name.toLowerCase().includes(lowercaseSearch) ||
          String(param.value).toLowerCase().includes(lowercaseSearch)
      );
    }

    // Get the appropriate predicate parameters
    let predicateParams = [];
    if (paramType === 'technical') {
      predicateParams = selectedPredicateData.technicalCharacteristics || [];
    } else if (paramType === 'performance') {
      predicateParams = selectedPredicateData.performanceData || [];
    } else if (paramType === 'safety') {
      predicateParams = selectedPredicateData.safetyFeatures || [];
    }

    // Apply non-equivalent filtering if enabled
    if (filterNonEquivalent) {
      parameters = parameters.filter(param => {
        const predicateParam = predicateParams.find(p => p.name === param.name);

        // If no matching parameter found in predicate, consider it non-equivalent
        if (!predicateParam) return true;

        // Check equivalence with appropriate parameter type
        return !isEquivalent(
          param.value,
          predicateParam.value,
          paramType === 'performance' ? 'performance' : 'general'
        );
      });
    }

    // Highlight critical parameters if enabled
    if (highlightCriticalParameters) {
      // Mark parameters as critical based on importance to equivalence determination
      // In a real implementation, this would use a more sophisticated algorithm
      parameters = parameters.map(param => ({
        ...param,
        isCritical: [
          'accuracy',
          'material',
          'energy',
          'sensitivity',
          'specificity',
          'detection',
          'safety',
          'fail-safe',
          'biocompatibility',
          'alarm',
        ].some(keyword => param.name.toLowerCase().includes(keyword)),
      }));
    }

    // Sort parameters by importance if importance scores exist
    if (Object.keys(parameterImportance).length > 0) {
      parameters.sort((a, b) => {
        const importanceA = parameterImportance[a.name] || 0;
        const importanceB = parameterImportance[b.name] || 0;
        return importanceB - importanceA; // Sort by descending importance
      });
    }

    return parameters;
  };

  // Export the comparison data for sharing/saving
  const handleExport = () => {
    // Generate report data
    const selectedPredicateDevice = predicateDevices.find(p => p.id === selectedPredicate);

    // Create a structured format that can be used for export
    const reportData = {
      title: 'Substantial Equivalence Comparison Report',
      timestamp: new Date().toISOString(),
      subjectDevice: {
        name: subjectDevice.deviceName || 'Unknown Device',
        manufacturer: subjectDevice.manufacturer || 'Unknown Manufacturer',
        id: subjectDevice.id || 'N/A',
      },
      predicateDevice: {
        name: selectedPredicateDevice?.deviceName || 'Unknown Device',
        manufacturer: selectedPredicateDevice?.manufacturer || 'Unknown Manufacturer',
        id: selectedPredicateDevice?.id || 'N/A',
      },
      scores: {
        overall: equivalenceScores.overall,
        technical: equivalenceScores.technical,
        performance: equivalenceScores.performance,
        safety: equivalenceScores.safety,
        clinical: equivalenceScores.clinical,
      },
      technicalComparison: (subjectDevice.technicalCharacteristics || []).map(param => {
        const predicateParam = selectedPredicateDevice?.technicalCharacteristics?.find(
          p => p.name === param.name
        );
        const equivalent = predicateParam ? isEquivalent(param.value, predicateParam.value) : false;

        return {
          parameter: param.name,
          subjectValue: param.value,
          predicateValue: predicateParam?.value || 'N/A',
          equivalent: equivalent,
        };
      }),
    };

    // Create a blob with the JSON data
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Create an anchor element to trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = `510k_equivalence_comparison_${subjectDevice.id}.json`;
    document.body.appendChild(a);
    a.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);

    // Alert user
    alert(
      'Equivalence report data exported successfully. This JSON file can be used for FDA 510(k) submission preparation.'
    );
  };

  // Enhanced AI assistance for non-equivalent features with regulatory context
  const handleRequestAI = parameter => {
    if (typeof onRequestAIAssistance === 'function') {
      onRequestAIAssistance(parameter);
    }

    // Add to comparison history to track user actions
    const timestamp = new Date().toISOString();
    const newHistoryEntry = {
      id: `history-${timestamp}`,
      timestamp,
      action: 'requested_ai_assistance',
      parameter: parameter,
    };
    setComparisonHistory(prev => [...prev, newHistoryEntry]);

    // Enhanced AI responses with regulatory context and mitigation strategies
    const enhancedResponses = {
      Display: {
        analysis:
          'The subject device has a higher resolution display (1024x768) than the predicate (800x600).',
        regulatoryContext:
          'Per FDA guidance, improvements in technological characteristics are generally acceptable when they do not raise different questions of safety or effectiveness.',
        mitigationStrategy:
          '1. Document that the higher resolution enhances visibility of patient data without affecting safety or effectiveness.\n2. Provide human factors validation testing results showing improved legibility.\n3. Include a comparison table highlighting this as a technological improvement.',
        regulatoryCitations: [
          '21 CFR 807.100(b)(2)(ii)(B)',
          'FDA Guidance: Deciding When to Submit a 510(k) for a Change to an Existing Device (2017)',
        ],
      },
      'Battery Life': {
        analysis:
          'The subject device has a shorter battery life (6h vs 8h), which could be seen as a performance decrease.',
        regulatoryContext:
          'Changes that could significantly affect the safety or effectiveness of the device require substantial equivalence justification.',
        mitigationStrategy:
          '1. Conduct comparative testing showing that 6 hours is sufficient for the intended use scenario.\n2. Provide risk analysis demonstrating no new risks associated with shorter battery life.\n3. Consider implementing power optimization features.\n4. Include clear labeling about battery duration expectations.',
        regulatoryCitations: [
          'FDA Guidance: Deciding When to Submit a 510(k) for a Change to an Existing Device (2017)',
          'CDRH Benefit-Risk Guidance (2016)',
        ],
      },
      Connectivity: {
        analysis: 'The subject device uses newer connectivity standards (Bluetooth 5.0 vs 4.2).',
        regulatoryContext:
          'Updates to connectivity standards typically require cybersecurity risk evaluation.',
        mitigationStrategy:
          '1. Demonstrate that this represents an improvement in security and reliability.\n2. Provide cybersecurity risk assessment showing no new risks.\n3. Include interoperability testing with relevant systems.\n4. Document compliance with FDA guidance on wireless technologies.',
        regulatoryCitations: [
          'FDA Guidance: Radio Frequency Wireless Technology in Medical Devices',
          'Content of Premarket Submissions for Management of Cybersecurity in Medical Devices (2018)',
        ],
      },
      Weight: {
        analysis: 'The subject device is heavier (3.6 lbs vs 3.2 lbs).',
        regulatoryContext:
          'Physical changes require evaluation of ergonomic and usability impacts.',
        mitigationStrategy:
          '1. Conduct human factors testing to show that the weight difference does not impact usability.\n2. Provide ergonomic assessment for handheld applications.\n3. Include risk analysis for any mounting or support accessories.\n4. Document user feedback from testing.',
        regulatoryCitations: [
          'FDA Guidance: Applying Human Factors and Usability Engineering to Medical Devices (2016)',
        ],
      },
      Materials: {
        analysis: 'The subject device uses different materials than the predicate device.',
        regulatoryContext: 'Material changes require biocompatibility evaluation.',
        mitigationStrategy:
          '1. Provide biocompatibility testing per ISO 10993.\n2. Document material formulation and supplier information.\n3. Include chemical characterization for patient-contacting components.\n4. Compare material properties to predicate materials.',
        regulatoryCitations: [
          'ISO 10993',
          'FDA Guidance: Use of International Standard ISO 10993-1',
        ],
      },
      Dimensions: {
        analysis: 'The subject device has different dimensions from the predicate.',
        regulatoryContext: 'Physical changes require evaluation of intended use compatibility.',
        mitigationStrategy:
          '1. Confirm compatibility with intended use environments.\n2. Document any testing related to dimensional requirements.\n3. Provide engineering rationale for dimension changes.\n4. Include performance testing showing equivalence despite dimensional differences.',
        regulatoryCitations: [
          'FDA Guidance: Deciding When to Submit a 510(k) for a Change to an Existing Device (2017)',
        ],
      },
    };

    // Set parameter importance for prioritization
    if (
      parameter.toLowerCase().includes('material') ||
      parameter.toLowerCase().includes('safety') ||
      parameter.toLowerCase().includes('battery') ||
      parameter.toLowerCase().includes('energy')
    ) {
      setParameterImportance(prev => ({
        ...prev,
        [parameter]: 0.9, // High importance
      }));
    } else if (
      parameter.toLowerCase().includes('dimension') ||
      parameter.toLowerCase().includes('weight') ||
      parameter.toLowerCase().includes('connectivity')
    ) {
      setParameterImportance(prev => ({
        ...prev,
        [parameter]: 0.6, // Medium importance
      }));
    } else {
      setParameterImportance(prev => ({
        ...prev,
        [parameter]: 0.3, // Lower importance
      }));
    }

    // Generate regulatory notes for this parameter
    setRegulatoryNotes(prev => ({
      ...prev,
      [parameter]: `FDA typically requires detailed comparison for this type of parameter. Reference 21 CFR 807.87(f) in your submission.`,
    }));

    // Generate specific response based on parameter type or use a sophisticated default
    let aiResponse = '';

    // Check if we have a prepared enhanced response
    if (enhancedResponses[parameter]) {
      const response = enhancedResponses[parameter];
      aiResponse = `**Analysis:** ${response.analysis}\n\n**Regulatory Context:** ${response.regulatoryContext}\n\n**Mitigation Strategy:**\n${response.mitigationStrategy}\n\n${showCitations ? `**Regulatory Citations:**\n${response.regulatoryCitations.join('\n')}` : ''}`;
    } else {
      // Generate dynamic response based on parameter name
      const paramLower = parameter.toLowerCase();

      if (
        paramLower.includes('accuracy') ||
        paramLower.includes('precision') ||
        paramLower.includes('sensitivity')
      ) {
        aiResponse = `**Analysis:** Performance metric differences require validation.\n\n**Regulatory Context:** FDA requires evidence that the subject device performs at least as well as the predicate for critical performance metrics.\n\n**Mitigation Strategy:**\n1. Conduct side-by-side performance testing.\n2. Provide statistical analysis showing non-inferiority.\n3. Document test methods and acceptance criteria.\n4. If performance is lower, provide risk-benefit analysis supporting substantial equivalence.`;
      } else if (
        paramLower.includes('power') ||
        paramLower.includes('voltage') ||
        paramLower.includes('current')
      ) {
        aiResponse = `**Analysis:** Electrical parameter differences require safety evaluation.\n\n**Regulatory Context:** Changes in electrical parameters may affect safety.\n\n**Mitigation Strategy:**\n1. Provide electrical safety testing per applicable standards.\n2. Document thermal safety analysis.\n3. Include EMC testing results.\n4. Analyze and document any effects on other device functions.`;
      } else if (
        paramLower.includes('interface') ||
        paramLower.includes('control') ||
        paramLower.includes('user')
      ) {
        aiResponse = `**Analysis:** User interface differences require usability evaluation.\n\n**Regulatory Context:** Changes to user interfaces may affect safe and effective use.\n\n**Mitigation Strategy:**\n1. Conduct human factors validation testing.\n2. Document user error analysis.\n3. Provide training materials comparison.\n4. Include screenshots or images comparing interfaces.`;
      } else {
        aiResponse = `**Analysis:** Parameter differences require substantial equivalence justification.\n\n**Regulatory Context:** 21 CFR 807.87(f) requires a 510(k) to include a description of similarities and differences to predicates.\n\n**Mitigation Strategy:**\n1. Document engineering rationale for the difference.\n2. Provide performance testing showing equivalence despite the difference.\n3. Include risk analysis addressing any potential new risks.\n4. Consider expert statements supporting substantial equivalence.`;
      }
    }

    // Update the AI suggestions state
    setAiSuggestions(prev => ({
      ...prev,
      [parameter]: aiResponse,
    }));
  };

  // Toggle parameter expansion
  const toggleParameter = paramName => {
    setExpandedParameters(prev => ({
      ...prev,
      [paramName]: !prev[paramName],
    }));
  };

  // Get a predicate device by ID
  const getPredicateById = id => {
    return predicateDevices.find(p => p.id === id) || predicateDevices[0];
  };

  // Get color for equivalence status
  const getEquivalenceColor = score => {
    if (score >= 90) return 'text-green-600 dark:text-green-400';
    if (score >= 70) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  // Get icon for equivalence status
  const getEquivalenceIcon = (value1, value2) => {
    const equivalent = isEquivalent(value1, value2);
    if (equivalent) {
      return <Check className="h-5 w-5 text-green-600 dark:text-green-400" />;
    }
    return <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />;
  };

  // Create memoized parameter statistics for overall analysis
  const parameterStats = useMemo(() => {
    if (!subjectDevice || !predicateDevices.length) return null;

    const selectedPredicateDevice = predicateDevices.find(p => p.id === selectedPredicate);
    if (!selectedPredicateDevice) return null;

    // Get all parameters from subject device
    const allParams = [
      ...(subjectDevice.technicalCharacteristics || []),
      ...(subjectDevice.performanceData || []),
      ...(subjectDevice.safetyFeatures || []),
    ];

    // Get all parameters from predicate device
    const allPredicateParams = [
      ...(selectedPredicateDevice.technicalCharacteristics || []),
      ...(selectedPredicateDevice.performanceData || []),
      ...(selectedPredicateDevice.safetyFeatures || []),
    ];

    // Create a map for faster lookup
    const predicateParamMap = allPredicateParams.reduce((map, param) => {
      map[param.name] = param.value;
      return map;
    }, {});

    // Count equivalent and non-equivalent parameters
    let equivalentCount = 0;
    let nonEquivalentCount = 0;
    let uniqueToSubjectCount = 0;
    let uniqueToPredicateCount = 0;

    // Check each parameter in subject device
    allParams.forEach(param => {
      if (predicateParamMap[param.name]) {
        if (isEquivalent(param.value, predicateParamMap[param.name])) {
          equivalentCount++;
        } else {
          nonEquivalentCount++;
        }
      } else {
        uniqueToSubjectCount++;
      }
    });

    // Check for parameters unique to predicate
    allPredicateParams.forEach(param => {
      if (!allParams.some(p => p.name === param.name)) {
        uniqueToPredicateCount++;
      }
    });

    return {
      totalParameters: allParams.length,
      equivalentCount,
      nonEquivalentCount,
      uniqueToSubjectCount,
      uniqueToPredicateCount,
      equivalencePercentage: Math.round(
        (equivalentCount / (equivalentCount + nonEquivalentCount)) * 100
      ),
    };
  }, [subjectDevice, predicateDevices, selectedPredicate]);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-xl font-semibold">
              Substantial Equivalence Analysis
            </CardTitle>
            <CardDescription>
              Detailed comparison between your device and selected predicate devices
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-1" />
                  Options
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-3">
                  <h4 className="font-medium">Display Options</h4>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="highlight-critical">Highlight Critical Parameters</Label>
                    <Switch
                      id="highlight-critical"
                      checked={highlightCriticalParameters}
                      onCheckedChange={setHighlightCriticalParameters}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-suggest">Auto-Suggest Mitigations</Label>
                    <Switch
                      id="auto-suggest"
                      checked={autoSuggestMitigations}
                      onCheckedChange={setAutoSuggestMitigations}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-citations">Show Citations</Label>
                    <Switch
                      id="show-citations"
                      checked={showCitations}
                      onCheckedChange={setShowCitations}
                    />
                  </div>
                  <h4 className="font-medium pt-2">Equivalence Threshold</h4>
                  <div className="grid grid-cols-4 items-center gap-2">
                    <Label htmlFor="threshold" className="col-span-3">
                      Numeric tolerance ({Math.round(equivalenceThreshold * 100)}%)
                    </Label>
                    <Input
                      id="threshold"
                      type="range"
                      min="0.05"
                      max="0.25"
                      step="0.01"
                      value={equivalenceThreshold}
                      onChange={e => setEquivalenceThreshold(parseFloat(e.target.value))}
                      className="col-span-1"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Share2 className="h-4 w-4 mr-1" />
                  Export
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60">
                <div className="space-y-2">
                  <h4 className="font-medium">Export Options</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={handleExport}>
                      <Download className="h-4 w-4 mr-1" />
                      JSON
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onGenerateReport?.()}>
                      <FileText className="h-4 w-4 mr-1" />
                      Full Report
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => alert('PDF generation feature coming soon!')}
                    >
                      <Printer className="h-4 w-4 mr-1" />
                      Print PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => alert('Chart export feature coming soon!')}
                    >
                      <BarChart className="h-4 w-4 mr-1" />
                      Charts
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowEquivalenceCriteria(!showEquivalenceCriteria)}
                  >
                    <HelpCircle className="h-4 w-4 mr-1" />
                    Criteria
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Show/hide substantial equivalence criteria information
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Search panel for filtering parameters */}
        <div className="flex mt-2 items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
            <Input
              type="search"
              placeholder="Search parameters..."
              className="pl-8"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            variant={filterNonEquivalent ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterNonEquivalent(!filterNonEquivalent)}
            className="whitespace-nowrap"
          >
            <AlertTriangle
              className={`h-4 w-4 mr-1 ${filterNonEquivalent ? 'text-white' : 'text-amber-500'}`}
            />
            Non-Equivalent Only
          </Button>
        </div>

        {parameterStats && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
              <div>
                <div className="text-sm text-gray-500">Total Parameters</div>
                <div className="text-2xl font-bold">{parameterStats.totalParameters}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Equivalent</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {parameterStats.equivalentCount}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Non-Equivalent</div>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {parameterStats.nonEquivalentCount}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Unique to Subject</div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {parameterStats.uniqueToSubjectCount}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Unique to Predicate</div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {parameterStats.uniqueToPredicateCount}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Equivalence Criteria Information Panel */}
        {showEquivalenceCriteria && (
          <Alert className="mt-4">
            <HelpCircle className="h-4 w-4" />
            <AlertTitle>Substantial Equivalence Criteria</AlertTitle>
            <AlertDescription>
              <div className="text-sm mt-2">
                <p className="mb-2">
                  Two devices are considered substantially equivalent when they have:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>The same intended use; and</li>
                  <li>
                    Either the same technological characteristics or different technological
                    characteristics that do not raise different questions of safety and
                    effectiveness.
                  </li>
                </ul>
                <p className="mt-2 mb-2">
                  <strong>Equivalence thresholds:</strong>
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    <span className="text-green-600 font-medium">Numeric values:</span> Within 10%
                    difference (e.g., weight, dimensions, power)
                  </li>
                  <li>
                    <span className="text-green-600 font-medium">Categorical values:</span> Exact
                    match or functionally equivalent (e.g., connectivity types)
                  </li>
                  <li>
                    <span className="text-green-600 font-medium">Performance metrics:</span> Subject
                    device must be at least as good as predicate
                  </li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="col-span-1">
            <div className="text-sm font-medium">Overall Equivalence</div>
            <div className="mt-1 flex items-center">
              <div
                className={`text-2xl font-bold ${getEquivalenceColor(equivalenceScores.overall)}`}
              >
                {equivalenceScores.overall}%
              </div>
              <Progress value={equivalenceScores.overall} className="ml-2 w-24" />
            </div>
          </div>

          <div className="col-span-1">
            <div className="text-sm font-medium">Technical</div>
            <div className="mt-1 flex items-center">
              <div
                className={`text-lg font-bold ${getEquivalenceColor(equivalenceScores.technical)}`}
              >
                {equivalenceScores.technical}%
              </div>
              <Progress value={equivalenceScores.technical} className="ml-2 w-24" />
            </div>
          </div>

          <div className="col-span-1">
            <div className="text-sm font-medium">Performance</div>
            <div className="mt-1 flex items-center">
              <div
                className={`text-lg font-bold ${getEquivalenceColor(equivalenceScores.performance)}`}
              >
                {equivalenceScores.performance}%
              </div>
              <Progress value={equivalenceScores.performance} className="ml-2 w-24" />
            </div>
          </div>

          <div className="col-span-1">
            <div className="text-sm font-medium">Safety</div>
            <div className="mt-1 flex items-center">
              <div className={`text-lg font-bold ${getEquivalenceColor(equivalenceScores.safety)}`}>
                {equivalenceScores.safety}%
              </div>
              <Progress value={equivalenceScores.safety} className="ml-2 w-24" />
            </div>
          </div>

          <div className="col-span-1">
            <div className="text-sm font-medium">Clinical</div>
            <div className="mt-1 flex items-center">
              <div
                className={`text-lg font-bold ${getEquivalenceColor(equivalenceScores.clinical)}`}
              >
                {equivalenceScores.clinical}%
              </div>
              <Progress value={equivalenceScores.clinical} className="ml-2 w-24" />
            </div>
          </div>
        </div>

        {/* Predicate selection */}
        <div className="mt-4">
          <div className="text-sm font-medium mb-2">Selected Predicate Device</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {predicateDevices.map(device => (
              <div
                key={device.id}
                className={`p-3 border rounded-md cursor-pointer transition-colors ${
                  selectedPredicate === device.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'hover:border-gray-300 dark:hover:border-gray-700'
                }`}
                onClick={() => setSelectedPredicate(device.id)}
              >
                <div className="font-medium">{device.deviceName}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {device.manufacturer}
                </div>
                <Badge variant="outline" className="mt-1">
                  {device.predicateType || 'Predicate'}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="technical" onValueChange={setActiveTab}>
          <div className="flex justify-between items-center mb-4">
            <TabsList>
              <TabsTrigger value="technical">Technical Characteristics</TabsTrigger>
              <TabsTrigger value="performance">Performance Data</TabsTrigger>
              <TabsTrigger value="safety">Safety & Compliance</TabsTrigger>
              <TabsTrigger value="clinical">Clinical Outcomes</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50 mr-2"
                  checked={filterNonEquivalent}
                  onChange={() => setFilterNonEquivalent(!filterNonEquivalent)}
                />
                <span className="text-sm font-medium">Show non-equivalent only</span>
              </label>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <HelpCircle className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Filter to show only parameters that are not equivalent between devices
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          <TabsContent value="technical">
            <div className="rounded-md border">
              <div className="grid grid-cols-12 p-3 bg-gray-50 dark:bg-gray-800 border-b font-medium">
                <div className="col-span-3">Parameter</div>
                <div className="col-span-3">Subject Device</div>
                <div className="col-span-3">Predicate Device</div>
                <div className="col-span-2">Equivalence</div>
                <div className="col-span-1">Actions</div>
              </div>

              <ScrollArea className="h-[400px]">
                {getFilteredParameters('technical').map((param, index) => {
                  const predicateDevice = getPredicateById(selectedPredicate);
                  const predicateParam = predicateDevice?.technicalCharacteristics?.find(
                    p => p.name === param.name
                  );
                  const equivalent = predicateParam
                    ? isEquivalent(param.value, predicateParam.value)
                    : false;
                  const isExpanded = expandedParameters[param.name] || false;

                  return (
                    <div key={`${param.name}-${index}`} className="border-b last:border-0">
                      <div
                        className={`grid grid-cols-12 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                          !equivalent ? 'bg-amber-50 dark:bg-amber-900/20' : ''
                        }`}
                      >
                        <div className="col-span-3 font-medium">{param.name}</div>
                        <div className="col-span-3">{param.value}</div>
                        <div className="col-span-3">{predicateParam?.value || 'N/A'}</div>
                        <div className="col-span-2 flex items-center">
                          {predicateParam ? (
                            getEquivalenceIcon(param.value, predicateParam.value)
                          ) : (
                            <X className="h-5 w-5 text-red-600 dark:text-red-400" />
                          )}
                          <span className="ml-1">
                            {equivalent ? 'Equivalent' : 'Not Equivalent'}
                          </span>
                        </div>
                        <div className="col-span-1 flex justify-end">
                          {!equivalent && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRequestAI(param.name)}
                                  >
                                    <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Get AI suggestions for addressing this non-equivalent feature
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleParameter(param.name)}
                          >
                            {isExpanded ? (
                              <Minus className="h-4 w-4" />
                            ) : (
                              <Plus className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Expanded content with AI suggestions */}
                      {isExpanded && !equivalent && aiSuggestions[param.name] && (
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 border-t border-dashed">
                          <div className="flex items-start gap-2">
                            <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                            <div>
                              <div className="font-medium">AI Suggestion</div>
                              <div className="text-sm mt-1">{aiSuggestions[param.name]}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="performance">
            <div className="rounded-md border">
              <div className="grid grid-cols-12 p-3 bg-gray-50 dark:bg-gray-800 border-b font-medium">
                <div className="col-span-3">Parameter</div>
                <div className="col-span-3">Subject Device</div>
                <div className="col-span-3">Predicate Device</div>
                <div className="col-span-2">Equivalence</div>
                <div className="col-span-1">Actions</div>
              </div>

              <ScrollArea className="h-[400px]">
                {getFilteredParameters('performance').map((param, index) => {
                  const predicateDevice = getPredicateById(selectedPredicate);
                  const predicateParam = predicateDevice?.performanceData?.find(
                    p => p.name === param.name
                  );
                  const equivalent = predicateParam
                    ? isEquivalent(param.value, predicateParam.value, 'performance')
                    : false;
                  const isExpanded = expandedParameters[param.name] || false;

                  return (
                    <div key={`${param.name}-${index}`} className="border-b last:border-0">
                      <div
                        className={`grid grid-cols-12 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                          !equivalent ? 'bg-amber-50 dark:bg-amber-900/20' : ''
                        }`}
                      >
                        <div className="col-span-3 font-medium">{param.name}</div>
                        <div className="col-span-3">{param.value}</div>
                        <div className="col-span-3">{predicateParam?.value || 'N/A'}</div>
                        <div className="col-span-2 flex items-center">
                          {predicateParam ? (
                            getEquivalenceIcon(param.value, predicateParam.value)
                          ) : (
                            <X className="h-5 w-5 text-red-600 dark:text-red-400" />
                          )}
                          <span className="ml-1">
                            {equivalent ? 'Equivalent' : 'Not Equivalent'}
                          </span>
                        </div>
                        <div className="col-span-1 flex justify-end">
                          {!equivalent && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRequestAI(param.name)}
                                  >
                                    <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Get AI suggestions for addressing this non-equivalent feature
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleParameter(param.name)}
                          >
                            {isExpanded ? (
                              <Minus className="h-4 w-4" />
                            ) : (
                              <Plus className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Expanded content with AI suggestions */}
                      {isExpanded && !equivalent && aiSuggestions[param.name] && (
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 border-t border-dashed">
                          <div className="flex items-start gap-2">
                            <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                            <div>
                              <div className="font-medium">AI Suggestion</div>
                              <div className="text-sm mt-1">{aiSuggestions[param.name]}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="safety">
            <div className="rounded-md border">
              <div className="grid grid-cols-12 p-3 bg-gray-50 dark:bg-gray-800 border-b font-medium">
                <div className="col-span-3">Parameter</div>
                <div className="col-span-3">Subject Device</div>
                <div className="col-span-3">Predicate Device</div>
                <div className="col-span-2">Equivalence</div>
                <div className="col-span-1">Actions</div>
              </div>

              <ScrollArea className="h-[400px]">
                {getFilteredParameters('safety').map((param, index) => {
                  const predicateDevice = getPredicateById(selectedPredicate);
                  const predicateParam = predicateDevice?.safetyFeatures?.find(
                    p => p.name === param.name
                  );
                  const equivalent = predicateParam
                    ? isEquivalent(param.value, predicateParam.value)
                    : false;
                  const isExpanded = expandedParameters[param.name] || false;

                  return (
                    <div key={`${param.name}-${index}`} className="border-b last:border-0">
                      <div
                        className={`grid grid-cols-12 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                          !equivalent ? 'bg-amber-50 dark:bg-amber-900/20' : ''
                        }`}
                      >
                        <div className="col-span-3 font-medium">{param.name}</div>
                        <div className="col-span-3">{param.value}</div>
                        <div className="col-span-3">{predicateParam?.value || 'N/A'}</div>
                        <div className="col-span-2 flex items-center">
                          {predicateParam ? (
                            getEquivalenceIcon(param.value, predicateParam.value)
                          ) : (
                            <X className="h-5 w-5 text-red-600 dark:text-red-400" />
                          )}
                          <span className="ml-1">
                            {equivalent ? 'Equivalent' : 'Not Equivalent'}
                          </span>
                        </div>
                        <div className="col-span-1 flex justify-end">
                          {!equivalent && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRequestAI(param.name)}
                                  >
                                    <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Get AI suggestions for addressing this non-equivalent feature
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleParameter(param.name)}
                          >
                            {isExpanded ? (
                              <Minus className="h-4 w-4" />
                            ) : (
                              <Plus className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Expanded content with AI suggestions */}
                      {isExpanded && !equivalent && aiSuggestions[param.name] && (
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 border-t border-dashed">
                          <div className="flex items-start gap-2">
                            <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                            <div>
                              <div className="font-medium">AI Suggestion</div>
                              <div className="text-sm mt-1">{aiSuggestions[param.name]}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="clinical">
            <div className="flex items-center justify-center h-[400px]">
              <div className="text-center p-8 max-w-md">
                <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Clinical Data Under Development</h3>
                <p className="text-gray-500 dark:text-gray-400">
                  Clinical outcomes comparison tools are currently being built. In the full 510(k)
                  submission, this section will include detailed analysis of clinical data
                  supporting substantial equivalence.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default EnhancedEquivalenceComparison;

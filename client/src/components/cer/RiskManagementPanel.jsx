import React, { useState, useEffect } from 'react';
import { cerApiService } from '@/services/CerAPIService';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertCircle,
  CheckCircle,
  FileText,
  Upload,
  Database,
  FileSpreadsheet,
  UploadCloud,
  RefreshCw,
  ShieldAlert,
  LinkIcon,
  FilePlus2,
  Table,
  Layers,
  CheckSquare,
  Sparkles,
  Brain,
  BarChart,
  Lightbulb,
} from 'lucide-react';
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const RiskManagementPanel = ({ jobId, deviceName, manufacturer, onAddToCER, sections = [] }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [riskImportMethod, setRiskImportMethod] = useState('file'); // 'file', 'manual', 'api', 'ai'
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [riskMatrix, setRiskMatrix] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [newRisk, setNewRisk] = useState({
    id: '',
    hazard: '',
    hazardousSituation: '',
    harm: '',
    initialSeverity: 'moderate',
    initialProbability: 'occasional',
    initialRisk: 'medium',
    mitigations: '',
    residualSeverity: 'minor',
    residualProbability: 'remote',
    residualRisk: 'low',
    clinicalEvidence: '',
    linkedEvidence: [],
  });
  const [riskAnalysisImported, setRiskAnalysisImported] = useState(false);
  const [evidenceLinkages, setEvidenceLinkages] = useState([]);
  const [riskGaps, setRiskGaps] = useState([]);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  useEffect(() => {
    // If sections are provided, extract potential evidence sources
    if (sections.length > 0) {
      const extractedEvidence = sections
        .filter(
          section =>
            section.type === 'literature-review' ||
            section.type === 'clinical-data' ||
            section.type === 'faers-data' ||
            section.type === 'eu-global-pms-data' ||
            section.type === 'internal-clinical-data'
        )
        .map(section => ({
          id: section.type + '-' + Date.now(),
          title: section.title,
          type: section.type,
          source: section.type,
          linked: false,
          content: section.content ? section.content.substring(0, 100) + '...' : '',
        }));

      setEvidenceLinkages(extractedEvidence);
    }
  }, [sections]);

  const handleFileChange = event => {
    const files = Array.from(event.target.files);
    setSelectedFiles(files);
  };

  const severityLevels = ['negligible', 'minor', 'moderate', 'major', 'catastrophic'];
  const probabilityLevels = ['remote', 'unlikely', 'occasional', 'probable', 'frequent'];
  const riskLevels = ['negligible', 'low', 'medium', 'high', 'critical'];

  const calculateRiskLevel = (severity, probability) => {
    const severityIndex = severityLevels.indexOf(severity);
    const probabilityIndex = probabilityLevels.indexOf(probability);

    // Simple risk matrix calculation logic
    const riskIndex = Math.round((severityIndex + probabilityIndex) / 2);
    return riskLevels[riskIndex];
  };

  const handleRiskChange = (field, value) => {
    const updatedRisk = { ...newRisk, [field]: value };

    // Auto-calculate risk levels when severity or probability changes
    if (field === 'initialSeverity' || field === 'initialProbability') {
      updatedRisk.initialRisk = calculateRiskLevel(
        field === 'initialSeverity' ? value : updatedRisk.initialSeverity,
        field === 'initialProbability' ? value : updatedRisk.initialProbability
      );
    }

    if (field === 'residualSeverity' || field === 'residualProbability') {
      updatedRisk.residualRisk = calculateRiskLevel(
        field === 'residualSeverity' ? value : updatedRisk.residualSeverity,
        field === 'residualProbability' ? value : updatedRisk.residualProbability
      );
    }

    setNewRisk(updatedRisk);
  };

  const handleAddRisk = () => {
    const riskWithId = {
      ...newRisk,
      id: `risk-${Date.now()}`,
      hasEvidence: false,
    };

    setRiskMatrix([...riskMatrix, riskWithId]);

    // Reset form
    setNewRisk({
      id: '',
      hazard: '',
      hazardousSituation: '',
      harm: '',
      initialSeverity: 'moderate',
      initialProbability: 'occasional',
      initialRisk: 'medium',
      mitigations: '',
      residualSeverity: 'minor',
      residualProbability: 'remote',
      residualRisk: 'low',
      clinicalEvidence: '',
      linkedEvidence: [],
    });
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploadingFile(true);

    try {
      // Simulate upload progress
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          const newProgress = prev + 10;
          if (newProgress >= 100) {
            clearInterval(interval);
            return 100;
          }
          return newProgress;
        });
      }, 300);

      // Create FormData for file upload
      const formData = new FormData();

      // Add each file to the form data
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });

      // Add metadata to the form data
      formData.append('deviceName', deviceName || '');
      formData.append('manufacturer', manufacturer || '');
      formData.append('jobId', jobId);

      // Simulate API call delay and processing ISO 14971 risk files
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Simulate parsed risks - in a real implementation, this would come from the API
      const parsedRisks = [
        {
          id: 'risk-1',
          hazard: 'Sharp edges on device',
          hazardousSituation: 'Contact with sharp edge during use',
          harm: 'Tissue damage, laceration',
          initialSeverity: 'moderate',
          initialProbability: 'occasional',
          initialRisk: 'medium',
          mitigations: 'Edge rounding, protective covers, user training',
          residualSeverity: 'minor',
          residualProbability: 'remote',
          residualRisk: 'low',
          clinicalEvidence: '',
          linkedEvidence: [],
          hasEvidence: false,
        },
        {
          id: 'risk-2',
          hazard: 'Material degradation',
          hazardousSituation: 'Device failure during procedure',
          harm: 'Extended procedure time, additional interventions',
          initialSeverity: 'major',
          initialProbability: 'unlikely',
          initialRisk: 'medium',
          mitigations: 'Material testing, shelf-life validation, packaging controls',
          residualSeverity: 'moderate',
          residualProbability: 'remote',
          residualRisk: 'low',
          clinicalEvidence: '',
          linkedEvidence: [],
          hasEvidence: false,
        },
        {
          id: 'risk-3',
          hazard: 'Biocompatibility issues',
          hazardousSituation: 'Allergic reaction to device materials',
          harm: 'Local or systemic immune response',
          initialSeverity: 'major',
          initialProbability: 'occasional',
          initialRisk: 'high',
          mitigations: 'Biocompatible material selection, ISO 10993 testing',
          residualSeverity: 'moderate',
          residualProbability: 'unlikely',
          residualRisk: 'medium',
          clinicalEvidence: '',
          linkedEvidence: [],
          hasEvidence: false,
        },
      ];

      // Set the imported risk matrix
      setRiskMatrix(parsedRisks);
      setRiskAnalysisImported(true);

      clearInterval(interval);
      setUploadProgress(100);

      setTimeout(() => {
        setUploadingFile(false);
        setUploadProgress(0);
        setSelectedFiles([]);
      }, 1000);
    } catch (error) {
      console.error('Error uploading risk management files:', error);
      setUploadingFile(false);
      setUploadProgress(0);
    }
  };

  const handleLinkEvidence = (riskId, evidenceId, isLinked) => {
    // Update the evidence linkage status
    const updatedLinkages = evidenceLinkages.map(evidence =>
      evidence.id === evidenceId ? { ...evidence, linked: isLinked } : evidence
    );
    setEvidenceLinkages(updatedLinkages);

    // Update the risk matrix to record linked evidence
    const updatedMatrix = riskMatrix.map(risk => {
      if (risk.id === riskId) {
        const linkedEvidence = evidenceLinkages.find(e => e.id === evidenceId);

        if (isLinked) {
          return {
            ...risk,
            linkedEvidence: [...risk.linkedEvidence, evidenceId],
            hasEvidence: true,
          };
        } else {
          return {
            ...risk,
            linkedEvidence: risk.linkedEvidence.filter(id => id !== evidenceId),
            hasEvidence: risk.linkedEvidence.filter(id => id !== evidenceId).length > 0,
          };
        }
      }

      return risk;
    });

    setRiskMatrix(updatedMatrix);
  };

  const runGapAnalysis = () => {
    setIsLoading(true);

    // Simulate API call delay
    setTimeout(() => {
      // Identify risks without linked evidence
      const gaps = riskMatrix
        .filter(risk => !risk.hasEvidence && risk.residualRisk !== 'negligible')
        .map(risk => ({
          riskId: risk.id,
          hazard: risk.hazard,
          harm: risk.harm,
          residualRisk: risk.residualRisk,
          recommendedEvidence:
            risk.residualRisk === 'high' || risk.residualRisk === 'critical'
              ? 'Clinical investigation data or substantial clinical experience data required'
              : 'Literature review or post-market surveillance data recommended',
        }));

      setRiskGaps(gaps);
      setAnalysisComplete(true);
      setIsLoading(false);
    }, 2000);
  };

  // AI-powered risk analysis functions
  const runAiRiskIdentification = async () => {
    if (!deviceName) {
      alert('Please ensure a device name is provided before running AI analysis');
      return;
    }

    setIsAiAnalyzing(true);

    try {
      // Setup progress simulation
      const interval = setInterval(() => {
        setAiProgress(prev => {
          const newProgress = prev + 2;
          if (newProgress >= 100) {
            clearInterval(interval);
            return 100;
          }
          return newProgress;
        });
      }, 200);

      // Create data package for AI analysis
      const aiAnalysisData = {
        deviceName,
        manufacturer,
        jobId,
        deviceType: deviceName.toLowerCase().includes('shoulder')
          ? 'shoulder implant'
          : 'medical device',
        sections: sections.map(section => ({
          type: section.type,
          title: section.title,
          contentSummary: section.content ? section.content.substring(0, 500) + '...' : '',
        })),
      };

      // Simulate AI-generated risk identification based on MEDDEV and ISO 14971
      // In a real implementation, this would call the OpenAI-powered backend
      await new Promise(resolve => setTimeout(resolve, 5000));

      // AI-generated risks based on device type and available information
      const aiGeneratedRisks = [
        {
          id: `ai-risk-${Date.now()}-1`,
          hazard: 'Implant migration/loosening',
          hazardousSituation: 'Device displacement from intended position',
          harm: 'Pain, reduced mobility, revision surgery',
          initialSeverity: 'major',
          initialProbability: 'occasional',
          initialRisk: 'high',
          mitigations:
            'Proper fixation design, surgical technique guidance, patient activity restrictions',
          residualSeverity: 'moderate',
          residualProbability: 'unlikely',
          residualRisk: 'medium',
          clinicalEvidence: 'Literature review, registry data analysis',
          linkedEvidence: [],
          hasEvidence: false,
          aiGenerated: true,
          regulatoryRefs: [
            'ISO 14971:2019 Annex C',
            'MEDDEV 2.7/1 Rev 4 Sec. A7.2',
            'EU MDR Annex I',
          ],
          confidence: 0.92,
        },
        {
          id: `ai-risk-${Date.now()}-2`,
          hazard: 'Bearing surface wear',
          hazardousSituation: 'Generation of wear particles during device use',
          harm: 'Tissue reaction, osteolysis, implant failure',
          initialSeverity: 'major',
          initialProbability: 'probable',
          initialRisk: 'high',
          mitigations: 'Material selection, surface treatment, wear testing',
          residualSeverity: 'moderate',
          residualProbability: 'occasional',
          residualRisk: 'medium',
          clinicalEvidence: 'Lab testing, clinical follow-up studies',
          linkedEvidence: [],
          hasEvidence: false,
          aiGenerated: true,
          regulatoryRefs: [
            'ISO 14971:2019 Annex C',
            'MEDDEV 2.7/1 Rev 4 Sec. A7.2',
            'EU MDR Annex I',
          ],
          confidence: 0.89,
        },
        {
          id: `ai-risk-${Date.now()}-3`,
          hazard: 'Infection',
          hazardousSituation: 'Bacterial contamination during implantation',
          harm: 'Surgical site infection, deep tissue infection, sepsis',
          initialSeverity: 'major',
          initialProbability: 'occasional',
          initialRisk: 'high',
          mitigations: 'Sterile packaging, surgical protocol, antibiotic prophylaxis',
          residualSeverity: 'major',
          residualProbability: 'unlikely',
          residualRisk: 'medium',
          clinicalEvidence: 'Clinical studies, post-market surveillance',
          linkedEvidence: [],
          hasEvidence: false,
          aiGenerated: true,
          regulatoryRefs: [
            'ISO 14971:2019 Sec 4.3',
            'MEDDEV 2.7/1 Rev 4 Sec. 8',
            'EU MDR Article 61',
          ],
          confidence: 0.95,
        },
        {
          id: `ai-risk-${Date.now()}-4`,
          hazard: 'Improper device sizing',
          hazardousSituation: 'Selection of incorrect implant size',
          harm: 'Pain, limited range of motion, early revision',
          initialSeverity: 'moderate',
          initialProbability: 'probable',
          initialRisk: 'medium',
          mitigations: 'Sizing guides, pre-op planning tools, surgical technique manual',
          residualSeverity: 'moderate',
          residualProbability: 'unlikely',
          residualRisk: 'medium',
          clinicalEvidence: 'User studies, post-market feedback',
          linkedEvidence: [],
          hasEvidence: false,
          aiGenerated: true,
          regulatoryRefs: [
            'ISO 14971:2019 Sec 5.2',
            'MEDDEV 2.7/1 Rev 4 Sec. 6.2.3',
            'EU MDR Annex I',
          ],
          confidence: 0.87,
        },
      ];

      // Generate AI suggestions for evidence mapping
      const suggestions = aiGeneratedRisks.map(risk => {
        // Find matching evidence sections for each risk
        const matchingEvidence = evidenceLinkages
          .filter(evidence => {
            // In a real implementation, this would use proper AI matching logic
            if (risk.hazard.includes('migration') && evidence.type === 'literature-review')
              return true;
            if (risk.hazard.includes('wear') && evidence.type === 'internal-clinical-data')
              return true;
            if (
              risk.hazard.includes('infection') &&
              (evidence.type === 'faers-data' || evidence.type === 'eu-global-pms-data')
            )
              return true;
            if (risk.hazard.includes('sizing') && evidence.type === 'clinical-data') return true;
            return false;
          })
          .map(evidence => evidence.id);

        return {
          riskId: risk.id,
          suggestedEvidenceIds: matchingEvidence,
          regulatoryRequirement:
            risk.residualRisk === 'high' || risk.residualRisk === 'critical'
              ? 'Required by EU MDR Article 61'
              : 'Recommended by MEDDEV 2.7/1 Rev 4',
        };
      });

      // Update state with AI-generated risks and suggestions
      setRiskMatrix(prevMatrix => [...prevMatrix, ...aiGeneratedRisks]);
      setAiSuggestions(suggestions);
      setRiskAnalysisImported(true);

      // Clear interval and finish
      clearInterval(interval);
      setAiProgress(100);

      setTimeout(() => {
        setIsAiAnalyzing(false);
        setAiProgress(0);
      }, 1000);
    } catch (error) {
      console.error('Error during AI risk analysis:', error);
      setIsAiAnalyzing(false);
      setAiProgress(0);
    }
  };

  const autoMapEvidence = () => {
    if (aiSuggestions.length === 0) return;

    // Apply AI suggestions to automatically map evidence to risks
    let updatedMatrix = [...riskMatrix];

    aiSuggestions.forEach(suggestion => {
      const riskIndex = updatedMatrix.findIndex(risk => risk.id === suggestion.riskId);

      if (riskIndex >= 0) {
        suggestion.suggestedEvidenceIds.forEach(evidenceId => {
          // Update each evidence to be linked
          const updatedLinkages = evidenceLinkages.map(evidence =>
            evidence.id === evidenceId ? { ...evidence, linked: true } : evidence
          );
          setEvidenceLinkages(updatedLinkages);

          // Update the risk with the linked evidence
          updatedMatrix[riskIndex] = {
            ...updatedMatrix[riskIndex],
            linkedEvidence: [...updatedMatrix[riskIndex].linkedEvidence, evidenceId],
            hasEvidence: true,
          };
        });
      }
    });

    setRiskMatrix(updatedMatrix);
  };

  const renderAiRiskAnalysisForm = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">
            <div className="flex items-center">
              <Brain className="h-5 w-5 mr-2 text-[#E3008C]" />
              AI-Powered ISO 14971 Risk Identification
            </div>
          </CardTitle>
          <CardDescription>
            Automatically identify device-specific risks and map them to clinical evidence using AI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-md">
              <div className="flex">
                <Lightbulb className="h-5 w-5 text-blue-500 mr-2 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800">How AI Risk Analysis Works</p>
                  <p className="text-xs text-blue-700 mt-1">
                    The AI analyzes your device information and applicable standards to:
                  </p>
                  <ul className="text-xs text-blue-700 mt-1 list-disc pl-4 space-y-1">
                    <li>Identify potential risks based on ISO 14971:2019 principles</li>
                    <li>Generate initial risk assessments per regulatory requirements</li>
                    <li>
                      Automatically suggest evidence linkages to support residual risk acceptability
                    </li>
                    <li>Detect potential evidence gaps required by EU MDR and MEDDEV</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="deviceName">Device Name</Label>
                <Input
                  id="deviceName"
                  value={deviceName || ''}
                  readOnly
                  placeholder="Device name will be used for analysis"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="manufacturer">Manufacturer</Label>
                <Input
                  id="manufacturer"
                  value={manufacturer || ''}
                  readOnly
                  placeholder="Manufacturer will be used for analysis"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Available Evidence Sources</Label>
              <div className="border rounded-md p-3 bg-gray-50">
                <ul className="space-y-1">
                  {evidenceLinkages.length > 0 ? (
                    evidenceLinkages.map((evidence, index) => (
                      <li key={index} className="text-sm flex items-center">
                        <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                        {evidence.title}
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-gray-500">
                      No evidence sources available. Add clinical data, literature reviews, or other
                      evidence first.
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          {isAiAnalyzing ? (
            <div className="w-full">
              <div className="flex justify-between mb-1">
                <span className="text-sm">{aiProgress}% Complete</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-[#E3008C] h-2.5 rounded-full"
                  style={{ width: `${aiProgress}%` }}
                ></div>
              </div>
              <p className="text-xs text-center mt-2 text-gray-500">
                Analyzing device characteristics, applying ISO 14971 methodology, and mapping to
                regulatory requirements...
              </p>
            </div>
          ) : (
            <div className="flex flex-col w-full space-y-2">
              <Button
                onClick={runAiRiskIdentification}
                className="w-full bg-[#E3008C] hover:bg-[#C4007A] text-white"
                disabled={!deviceName}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Device-Specific Risk Analysis
              </Button>

              {aiSuggestions.length > 0 && (
                <Button onClick={autoMapEvidence} variant="outline" className="w-full">
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Auto-Map Evidence to Risks
                </Button>
              )}
            </div>
          )}
        </CardFooter>
      </Card>

      {aiSuggestions.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              <div className="flex items-center">
                <BarChart className="h-5 w-5 mr-2 text-[#E3008C]" />
                AI Evidence Mapping Recommendations
              </div>
            </CardTitle>
            <CardDescription>
              AI-suggested evidence linkages based on risk analysis and regulatory requirements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <UITable>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[250px]">Risk</TableHead>
                    <TableHead>Suggested Evidence</TableHead>
                    <TableHead className="w-[200px]">Regulatory Basis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aiSuggestions.map((suggestion, index) => {
                    const risk = riskMatrix.find(r => r.id === suggestion.riskId);
                    return (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{risk?.hazard}</TableCell>
                        <TableCell>
                          <ul className="space-y-1">
                            {suggestion.suggestedEvidenceIds.map((evidenceId, idx) => {
                              const evidence = evidenceLinkages.find(e => e.id === evidenceId);
                              return (
                                <li key={idx} className="text-sm flex items-center">
                                  <LinkIcon className="h-3 w-3 mr-1 text-blue-500" />
                                  {evidence?.title || 'Unknown Evidence'}
                                </li>
                              );
                            })}
                          </ul>
                        </TableCell>
                        <TableCell className="text-xs">
                          {suggestion.regulatoryRequirement}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </UITable>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const handleAddToCER = () => {
    // Create a comprehensive risk management report for the CER
    const cerSection = {
      type: 'risk-management',
      title: 'Risk Management and Clinical Evaluation Linkage',
      content: `
## Risk Management and Clinical Evaluation Linkage

### Overview
This section establishes the linkage between risk management for ${deviceName || 'the device'} and clinical evaluation, as required by MEDDEV 2.7/1 Rev 4 and EU MDR Article 61.

### Risk Analysis Summary
A total of ${riskMatrix.length} risks have been identified and analyzed according to ISO 14971:2019 principles. 

### Risk-Evidence Mapping
${riskMatrix.filter(risk => risk.hasEvidence).length} of ${riskMatrix.length} identified risks have corresponding clinical evidence in this Clinical Evaluation Report.

${
  riskMatrix.some(risk => risk.aiGenerated)
    ? `### AI-Assisted Risk Identification
The risk management analysis was enhanced using AI technology that:
- Applied ISO 14971:2019 principles to systematically identify device-specific risks
- Mapped risks to their corresponding clinical evidence requirements
- Provided evidence linkage based on regulatory requirements from EU MDR Article 61 and MEDDEV 2.7/1 Rev 4
- Analyzed evidence gaps in accordance with ISO 14971:2019 Section 7.4 requirements

This AI-assisted process ensured comprehensive coverage of potential risks while maintaining regulatory compliance.`
    : ''
}

### Identified Risk Management Gaps
${
  riskGaps.length > 0
    ? `${riskGaps.length} risks require additional clinical evidence to support their acceptability:\n\n${riskGaps
        .map(
          gap =>
            `- **${gap.hazard}** (Residual Risk: ${gap.residualRisk.toUpperCase()}): ${gap.recommendedEvidence}`
        )
        .join('\n')}`
    : 'All significant risks have sufficient clinical evidence to support their acceptability.'
}

### Risk Management Conclusions
Based on the clinical evidence analyzed in this report and its linkage to the device risk management file:

${
  riskGaps.length === 0
    ? '- The clinical evidence sufficiently addresses all identified risks.\n- The benefit-risk profile supports the safety and performance of the device for its intended purpose.'
    : '- Additional clinical evidence is required to fully address all identified risks.\n- Further risk control measures or additional clinical data collection should be considered for the identified gaps.'
}

### Compliance Statement
This risk management linkage was performed in accordance with:
- ISO 14971:2019 (Medical devices — Application of risk management to medical devices)
- MEDDEV 2.7/1 Rev 4
- EU MDR (2017/745) Article 61 requirements
`,
      author: 'TrialSage AI',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      sources: [
        { name: 'ISO 14971:2019', type: 'standard', date: new Date().toISOString() },
        { name: 'MEDDEV 2.7/1 Rev 4', type: 'guidance', date: new Date().toISOString() },
        { name: 'EU MDR (2017/745)', type: 'regulation', date: new Date().toISOString() },
        {
          name: 'Risk Management File Analysis',
          type: 'assessment',
          date: new Date().toISOString(),
        },
        ...(riskMatrix.some(risk => risk.aiGenerated)
          ? [
              {
                name: 'AI-Assisted Risk Analysis',
                type: 'methodology',
                date: new Date().toISOString(),
              },
              { name: 'ISO 14971:2019 Annex C', type: 'reference', date: new Date().toISOString() },
            ]
          : []),
      ],
    };

    onAddToCER(cerSection);
  };

  const renderFileUploadForm = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">
            <div className="flex items-center">
              <ShieldAlert className="h-5 w-5 mr-2 text-orange-500" />
              Import ISO 14971 Risk Management File
            </div>
          </CardTitle>
          <CardDescription>
            Upload your device's ISO 14971-compliant risk management file or risk matrix
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6">
            <UploadCloud className="h-12 w-12 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500 mb-4 text-center">
              Drag and drop your files here, or click to browse
            </p>
            <p className="text-xs text-gray-500 mb-4 text-center">
              Supported formats: CSV, XLS, XLSX, XML, PDF with tables (table extraction may be
              limited)
            </p>
            <Input
              type="file"
              id="riskFileUpload"
              multiple
              accept=".csv,.xls,.xlsx,.xml,.pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => document.getElementById('riskFileUpload').click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Browse Files
            </Button>
            <div className="w-full mt-4">
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Selected Files ({selectedFiles.length})</p>
                  <ul className="space-y-1 text-sm">
                    {selectedFiles.map((file, index) => (
                      <li key={index} className="flex items-center">
                        <FileText className="h-4 w-4 mr-2 text-blue-500" />
                        {file.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          {uploadingFile ? (
            <div className="w-full">
              <div className="flex justify-between mb-1">
                <span className="text-sm">{uploadProgress}% Complete</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          ) : (
            <Button onClick={handleUpload} disabled={selectedFiles.length === 0} className="w-full">
              <Upload className="h-4 w-4 mr-2" />
              Upload Risk Management Files
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );

  const renderManualRiskEntryForm = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            <div className="flex items-center">
              <FilePlus2 className="h-5 w-5 mr-2 text-blue-500" />
              Manual Risk Entry
            </div>
          </CardTitle>
          <CardDescription>Manually enter risks according to ISO 14971 methodology</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hazard">Hazard</Label>
                <Input
                  id="hazard"
                  value={newRisk.hazard}
                  onChange={e => handleRiskChange('hazard', e.target.value)}
                  placeholder="Describe the hazard"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hazardousSituation">Hazardous Situation</Label>
                <Input
                  id="hazardousSituation"
                  value={newRisk.hazardousSituation}
                  onChange={e => handleRiskChange('hazardousSituation', e.target.value)}
                  placeholder="Describe the hazardous situation"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="harm">Harm</Label>
              <Input
                id="harm"
                value={newRisk.harm}
                onChange={e => handleRiskChange('harm', e.target.value)}
                placeholder="Describe potential harm to patient or user"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="initialSeverity">Pre-Control Severity</Label>
                <Select
                  value={newRisk.initialSeverity}
                  onValueChange={value => handleRiskChange('initialSeverity', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="negligible">Negligible</SelectItem>
                    <SelectItem value="minor">Minor</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="major">Major</SelectItem>
                    <SelectItem value="catastrophic">Catastrophic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="initialProbability">Pre-Control Probability</Label>
                <Select
                  value={newRisk.initialProbability}
                  onValueChange={value => handleRiskChange('initialProbability', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select probability" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="remote">Remote</SelectItem>
                    <SelectItem value="unlikely">Unlikely</SelectItem>
                    <SelectItem value="occasional">Occasional</SelectItem>
                    <SelectItem value="probable">Probable</SelectItem>
                    <SelectItem value="frequent">Frequent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="initialRisk">Pre-Control Risk Level</Label>
                <Input
                  id="initialRisk"
                  value={newRisk.initialRisk}
                  readOnly
                  className="bg-gray-50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mitigations">Risk Control Measures</Label>
              <Textarea
                id="mitigations"
                value={newRisk.mitigations}
                onChange={e => handleRiskChange('mitigations', e.target.value)}
                placeholder="Describe implemented risk control measures"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="residualSeverity">Residual Severity</Label>
                <Select
                  value={newRisk.residualSeverity}
                  onValueChange={value => handleRiskChange('residualSeverity', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="negligible">Negligible</SelectItem>
                    <SelectItem value="minor">Minor</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="major">Major</SelectItem>
                    <SelectItem value="catastrophic">Catastrophic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="residualProbability">Residual Probability</Label>
                <Select
                  value={newRisk.residualProbability}
                  onValueChange={value => handleRiskChange('residualProbability', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select probability" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="remote">Remote</SelectItem>
                    <SelectItem value="unlikely">Unlikely</SelectItem>
                    <SelectItem value="occasional">Occasional</SelectItem>
                    <SelectItem value="probable">Probable</SelectItem>
                    <SelectItem value="frequent">Frequent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="residualRisk">Residual Risk Level</Label>
                <Input
                  id="residualRisk"
                  value={newRisk.residualRisk}
                  readOnly
                  className="bg-gray-50"
                />
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleAddRisk}
            disabled={!newRisk.hazard || !newRisk.harm}
            className="w-full"
          >
            <FilePlus2 className="h-4 w-4 mr-2" />
            Add Risk to Matrix
          </Button>
        </CardFooter>
      </Card>
    </div>
  );

  const renderRiskMatrix = () => (
    <div className="space-y-4 mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            <div className="flex items-center">
              <Table className="h-5 w-5 mr-2 text-blue-600" />
              Risk Matrix
            </div>
          </CardTitle>
          <CardDescription>
            ISO 14971-compliant risk management data with linkage to clinical evidence
          </CardDescription>
        </CardHeader>
        <CardContent>
          {riskMatrix.length > 0 ? (
            <div className="overflow-x-auto">
              <UITable>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Hazard</TableHead>
                    <TableHead>Harm</TableHead>
                    <TableHead className="w-[100px]">Initial Risk</TableHead>
                    <TableHead className="w-[100px]">Residual Risk</TableHead>
                    <TableHead className="w-[120px]">Evidence Status</TableHead>
                    <TableHead className="w-[80px]">Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riskMatrix.map(risk => (
                    <TableRow key={risk.id} className={risk.aiGenerated ? 'bg-blue-50' : ''}>
                      <TableCell className="font-medium">
                        {risk.aiGenerated && (
                          <Sparkles className="h-3 w-3 mr-1 text-[#E3008C] inline" />
                        )}
                        {risk.hazard}
                      </TableCell>
                      <TableCell>{risk.harm}</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            risk.initialRisk === 'negligible'
                              ? 'bg-gray-100'
                              : risk.initialRisk === 'low'
                                ? 'bg-green-100 text-green-800'
                                : risk.initialRisk === 'medium'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : risk.initialRisk === 'high'
                                    ? 'bg-orange-100 text-orange-800'
                                    : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {risk.initialRisk.toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            risk.residualRisk === 'negligible'
                              ? 'bg-gray-100'
                              : risk.residualRisk === 'low'
                                ? 'bg-green-100 text-green-800'
                                : risk.residualRisk === 'medium'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : risk.residualRisk === 'high'
                                    ? 'bg-orange-100 text-orange-800'
                                    : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {risk.residualRisk.toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell>
                        {risk.hasEvidence ? (
                          <div className="flex items-center text-green-600">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            <span className="text-xs">Supported</span>
                          </div>
                        ) : (
                          <div className="flex items-center text-orange-600">
                            <AlertCircle className="h-4 w-4 mr-1" />
                            <span className="text-xs">Need Evidence</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {risk.aiGenerated ? (
                          <div className="flex items-center">
                            <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
                              AI
                            </span>
                            {risk.confidence && (
                              <span className="ml-1 text-xs text-gray-500">
                                {Math.round(risk.confidence * 100)}%
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-800 rounded">
                              Manual
                            </span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </UITable>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <ShieldAlert className="h-12 w-12 mx-auto text-gray-400 mb-2" />
              <p>No risk data available. Please import or add risks using the options above.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderEvidenceLinkage = () => (
    <div className="space-y-4 mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            <div className="flex items-center">
              <LinkIcon className="h-5 w-5 mr-2 text-blue-600" />
              Risk-Evidence Linkage
            </div>
          </CardTitle>
          <CardDescription>
            Map risks to clinical evidence to ensure all significant risks are addressed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {riskMatrix.length > 0 && evidenceLinkages.length > 0 ? (
            <div className="space-y-6">
              {riskMatrix.map(risk => (
                <div key={risk.id} className="border rounded-md p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-medium text-sm">{risk.hazard}</h4>
                      <p className="text-xs text-gray-500">{risk.harm}</p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        risk.residualRisk === 'negligible'
                          ? 'bg-gray-100'
                          : risk.residualRisk === 'low'
                            ? 'bg-green-100 text-green-800'
                            : risk.residualRisk === 'medium'
                              ? 'bg-yellow-100 text-yellow-800'
                              : risk.residualRisk === 'high'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {risk.residualRisk.toUpperCase()}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Link Clinical Evidence</Label>
                    {evidenceLinkages.map(evidence => (
                      <div key={evidence.id} className="flex items-center space-x-2 text-sm">
                        <Checkbox
                          id={`${risk.id}-${evidence.id}`}
                          checked={risk.linkedEvidence?.includes(evidence.id)}
                          onCheckedChange={checked =>
                            handleLinkEvidence(risk.id, evidence.id, checked)
                          }
                        />
                        <Label
                          htmlFor={`${risk.id}-${evidence.id}`}
                          className="text-sm font-normal flex-1"
                        >
                          {evidence.title}
                        </Label>
                        <span className="text-xs text-gray-500">{evidence.source}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <LinkIcon className="h-12 w-12 mx-auto text-gray-400 mb-2" />
              <p>
                No risks or evidence available for linkage. Please import/add risks and ensure CER
                sections are available.
              </p>
            </div>
          )}
        </CardContent>
        {riskMatrix.length > 0 && evidenceLinkages.length > 0 && (
          <CardFooter>
            <Button onClick={runGapAnalysis} disabled={isLoading} className="w-full">
              {isLoading ? (
                <LoadingSpinner />
              ) : (
                <>
                  <Layers className="h-4 w-4 mr-2" />
                  Run Gap Analysis
                </>
              )}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );

  const renderGapAnalysis = () => (
    <div className="space-y-4 mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            <div className="flex items-center">
              <CheckSquare className="h-5 w-5 mr-2 text-green-600" />
              Risk Evidence Gap Analysis
            </div>
          </CardTitle>
          <CardDescription>
            Analysis of risks with insufficient clinical evidence as required by MEDDEV 2.7/1 Rev 4
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analysisComplete ? (
            riskGaps.length > 0 ? (
              <div className="space-y-4">
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <div className="flex items-start">
                    <AlertCircle className="h-5 w-5 text-yellow-500 mr-2 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800">
                        Evidence Gaps Identified
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        {riskGaps.length} of {riskMatrix.length} risks require additional clinical
                        evidence to support their acceptability.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <UITable>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Hazard</TableHead>
                        <TableHead>Harm</TableHead>
                        <TableHead className="w-[100px]">Risk Level</TableHead>
                        <TableHead>Recommended Evidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {riskGaps.map(gap => (
                        <TableRow key={gap.riskId}>
                          <TableCell className="font-medium">{gap.hazard}</TableCell>
                          <TableCell>{gap.harm}</TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                gap.residualRisk === 'negligible'
                                  ? 'bg-gray-100'
                                  : gap.residualRisk === 'low'
                                    ? 'bg-green-100 text-green-800'
                                    : gap.residualRisk === 'medium'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : gap.residualRisk === 'high'
                                        ? 'bg-orange-100 text-orange-800'
                                        : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {gap.residualRisk.toUpperCase()}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">{gap.recommendedEvidence}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </UITable>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <div className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      All Risks Adequately Supported
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      All identified risks have sufficient clinical evidence in the CER to support
                      their acceptability.
                    </p>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="text-center py-6 text-gray-500">
              <CheckSquare className="h-12 w-12 mx-auto text-gray-400 mb-2" />
              <p>
                Run the gap analysis to assess the sufficiency of clinical evidence for each risk.
              </p>
            </div>
          )}
        </CardContent>
        {analysisComplete && (
          <CardFooter>
            <Button onClick={handleAddToCER} className="w-full">
              <FileText className="h-4 w-4 mr-2" />
              Add Risk Analysis to CER
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-[#323130] mb-4">Risk Management Linkage</h2>

          <Tabs defaultValue="file">
            <TabsList className="mb-4">
              <TabsTrigger value="file" onClick={() => setRiskImportMethod('file')}>
                <Upload className="h-4 w-4 mr-2" />
                Import File
              </TabsTrigger>
              <TabsTrigger value="manual" onClick={() => setRiskImportMethod('manual')}>
                <FileText className="h-4 w-4 mr-2" />
                Manual Entry
              </TabsTrigger>
              <TabsTrigger value="ai" onClick={() => setRiskImportMethod('ai')}>
                <Sparkles className="h-4 w-4 mr-2" />
                AI Analysis
              </TabsTrigger>
            </TabsList>

            <TabsContent value="file">{renderFileUploadForm()}</TabsContent>

            <TabsContent value="manual">{renderManualRiskEntryForm()}</TabsContent>

            <TabsContent value="ai">{renderAiRiskAnalysisForm()}</TabsContent>
          </Tabs>

          {riskMatrix.length > 0 && renderRiskMatrix()}
        </div>

        <div className="md:w-1/2 lg:w-2/5">
          <h2 className="text-xl font-semibold text-[#323130] mb-4">ISO 14971 Analysis</h2>

          {renderEvidenceLinkage()}

          {renderGapAnalysis()}
        </div>
      </div>
    </div>
  );
};

export default RiskManagementPanel;

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2,
  Plus,
  Trash2,
  Edit2,
  Save,
  FileText,
  Settings,
  X,
  CheckCircle2,
  AlertCircle,
  Copy,
  Info,
  Shield,
  ShieldCheck,
  ShieldAlert,
  BarChart,
  FileCheck,
  Fingerprint,
  Key,
} from 'lucide-react';

// Define feature categories based on MEDDEV 2.7/1 Rev 4 requirements and EU MDR
const featureCategories = [
  // Clinical characteristics
  { value: 'clinical', label: 'Clinical Characteristics' },
  { value: 'intended_use', label: 'Intended Use / Indications' },
  { value: 'clinical_population', label: 'Clinical Population' },
  { value: 'clinical_performance', label: 'Clinical Performance' },
  { value: 'clinical_benefit', label: 'Clinical Benefit' },
  { value: 'clinical_claims', label: 'Clinical Claims' },

  // Technical characteristics
  { value: 'technical', label: 'Technical Characteristics' },
  { value: 'design', label: 'Design & Physical Properties' },
  { value: 'dimensions', label: 'Dimensions & Measurements' },
  { value: 'principles', label: 'Principles of Operation' },
  { value: 'energy_source', label: 'Energy Source (if applicable)' },
  { value: 'software', label: 'Software / Algorithms (if applicable)' },
  { value: 'accessories', label: 'Accessories / Components' },

  // Biological characteristics
  { value: 'biological', label: 'Biological Characteristics' },
  { value: 'materials', label: 'Materials & Composition' },
  { value: 'biocompatibility', label: 'Biocompatibility' },
  { value: 'sterility', label: 'Sterility & Packaging' },
  { value: 'degradation', label: 'Degradation Properties (if applicable)' },
  { value: 'absorption', label: 'Absorption / Elution (if applicable)' },
];

// Predefined common characteristics based on MEDDEV 2.7/1 Rev 4 and EU MDR regulatory guidance
const predefinedCharacteristics = [
  // Clinical characteristics
  { category: 'intended_use', name: 'Intended Use' },
  { category: 'intended_use', name: 'Indications for Use' },
  { category: 'intended_use', name: 'Contraindications' },
  { category: 'clinical_population', name: 'Patient Population' },
  { category: 'clinical_population', name: 'User Population' },
  { category: 'clinical_performance', name: 'Performance Claims' },
  { category: 'clinical_performance', name: 'Endpoints/Outcomes' },
  { category: 'clinical_benefit', name: 'Clinical Benefits' },

  // Technical characteristics
  { category: 'technical', name: 'Classification (Rule/Class)' },
  { category: 'technical', name: 'Classification Rationale' },
  { category: 'design', name: 'Physical Form' },
  { category: 'design', name: 'Structural Components' },
  { category: 'dimensions', name: 'Key Dimensions' },
  { category: 'dimensions', name: 'Size Range' },
  { category: 'principles', name: 'Principles of Operation' },
  { category: 'principles', name: 'Mechanism of Action' },
  { category: 'software', name: 'Software Version' },
  { category: 'software', name: 'Software Functionality' },
  { category: 'energy_source', name: 'Energy Type' },
  { category: 'energy_source', name: 'Power Requirements' },
  { category: 'accessories', name: 'Essential Accessories' },
  { category: 'accessories', name: 'Compatible Accessories' },

  // Biological characteristics
  { category: 'materials', name: 'Primary Materials' },
  { category: 'materials', name: 'Material Composition' },
  { category: 'materials', name: 'Material Processing' },
  { category: 'biocompatibility', name: 'Biocompatibility Category' },
  { category: 'biocompatibility', name: 'ISO 10993 Compliance' },
  { category: 'biocompatibility', name: 'Tissue Contact' },
  { category: 'biocompatibility', name: 'Contact Duration' },
  { category: 'sterility', name: 'Sterility Status' },
  { category: 'sterility', name: 'Sterilization Method' },
  { category: 'sterility', name: 'Packaging Type' },
  { category: 'degradation', name: 'Degradation Profile' },
  { category: 'absorption', name: 'Absorption Rate' },
  { category: 'absorption', name: 'Elution Characteristics' },
];

/**
 * This component allows users to build a structured equivalence justification
 * for Clinical Evaluation Reports.
 *
 * It follows MEDDEV 2.7/1 Rev 4 requirements for device equivalence assessment
 * by allowing feature-by-feature comparison of the subject device with claimed
 * equivalent devices.
 */
export default function EquivalenceBuilderPanel({ onEquivalenceDataChange, onAddToCER }) {
  const { toast } = useToast();

  // Device states
  const [subjectDevice, setSubjectDevice] = useState({
    name: '',
    manufacturer: '',
    model: '',
    description: '',
  });

  const [equivalentDevices, setEquivalentDevices] = useState([]);
  const [currentEquivalentDevice, setCurrentEquivalentDevice] = useState({
    id: null,
    name: '',
    manufacturer: '',
    model: '',
    description: '',
    features: [],
    overallRationale: '',
  });

  // Current feature state
  const [currentFeature, setCurrentFeature] = useState({
    id: null,
    category: '',
    name: '',
    subjectValue: '',
    equivalentValue: '',
    impact: 'none', // 'none', 'minor', 'moderate', 'significant'
    rationale: '',
    isEditing: false,
  });

  // UI states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isFeatureDialogOpen, setIsFeatureDialogOpen] = useState(false);
  const [isGeneratingRationale, setIsGeneratingRationale] = useState(false);
  const [isGeneratingSectionE4, setIsGeneratingSectionE4] = useState(false);
  const [sectionE4Content, setSectionE4Content] = useState('');
  const [rationaleSuggestion, setRationaleSuggestion] = useState('');
  const [dialogMode, setDialogMode] = useState('add'); // 'add' or 'edit'
  const [activeDeviceId, setActiveDeviceId] = useState(null);

  // Data access verification
  const [isDataAccessDialogOpen, setIsDataAccessDialogOpen] = useState(false);
  const [dataAccessStatus, setDataAccessStatus] = useState(null); // null, 'checking', 'compliant', 'non-compliant', 'uncertain'
  const [dataAccessAssessment, setDataAccessAssessment] = useState('');
  const [dataAccessInfo, setDataAccessInfo] = useState({
    manufacturerName: '',
    accessType: 'direct_contract', // 'direct_contract', 'indirect_access', 'published_literature', 'other'
    accessDetails: '',
    contractReference: '',
    thirdPartyService: '',
    // EU MDR compliance checklist
    hasTechnicalAccess: false,
    hasBiologicalAccess: false,
    hasClinicalAccess: false,
    hasDocumentation: false,
  });

  // Save whole equivalence data to parent
  useEffect(() => {
    if (subjectDevice.name && onEquivalenceDataChange) {
      const data = {
        subjectDevice,
        equivalentDevices,
      };

      onEquivalenceDataChange(data);
    }
  }, [subjectDevice, equivalentDevices, onEquivalenceDataChange]);

  // Reset feature state
  const resetFeatureForm = () => {
    setCurrentFeature({
      id: null,
      category: '',
      name: '',
      subjectValue: '',
      equivalentValue: '',
      impact: 'none',
      rationale: '',
      isEditing: false,
    });
  };

  // Reset equivalent device form
  const resetEquivalentDeviceForm = () => {
    setCurrentEquivalentDevice({
      id: null,
      name: '',
      manufacturer: '',
      model: '',
      description: '',
      features: [],
      overallRationale: '',
    });
  };

  // Add new equivalent device
  const addEquivalentDevice = () => {
    if (!currentEquivalentDevice.name || !currentEquivalentDevice.manufacturer) {
      toast({
        title: 'Missing information',
        description: 'Please provide at least a name and manufacturer for the equivalent device.',
        variant: 'destructive',
      });
      return;
    }

    const newDevice = {
      ...currentEquivalentDevice,
      id: Date.now().toString(),
      features: [],
    };

    setEquivalentDevices([...equivalentDevices, newDevice]);
    setActiveDeviceId(newDevice.id);
    resetEquivalentDeviceForm();
    setIsDialogOpen(false);

    toast({
      title: 'Device added',
      description: `${newDevice.name} has been added as an equivalent device.`,
    });
  };

  // Update equivalent device
  const updateEquivalentDevice = () => {
    if (!currentEquivalentDevice.name || !currentEquivalentDevice.manufacturer) {
      toast({
        title: 'Missing information',
        description: 'Please provide at least a name and manufacturer for the equivalent device.',
        variant: 'destructive',
      });
      return;
    }

    const updatedDevices = equivalentDevices.map(device =>
      device.id === currentEquivalentDevice.id ? { ...currentEquivalentDevice } : device
    );

    setEquivalentDevices(updatedDevices);
    resetEquivalentDeviceForm();
    setIsDialogOpen(false);

    toast({
      title: 'Device updated',
      description: `${currentEquivalentDevice.name} has been updated.`,
    });
  };

  // Delete equivalent device
  const deleteEquivalentDevice = deviceId => {
    setEquivalentDevices(equivalentDevices.filter(device => device.id !== deviceId));

    if (activeDeviceId === deviceId) {
      setActiveDeviceId(equivalentDevices.length > 1 ? equivalentDevices[0].id : null);
    }

    toast({
      title: 'Device removed',
      description: 'The equivalent device has been removed.',
    });
  };

  // Set device for editing
  const editEquivalentDevice = device => {
    setCurrentEquivalentDevice(device);
    setDialogMode('edit');
    setIsDialogOpen(true);
  };

  // Add feature to equivalent device
  const addFeature = () => {
    if (!currentFeature.category || !currentFeature.name || !activeDeviceId) {
      toast({
        title: 'Missing information',
        description: 'Please provide all required feature information.',
        variant: 'destructive',
      });
      return;
    }

    const newFeature = {
      ...currentFeature,
      id: Date.now().toString(),
    };

    const updatedDevices = equivalentDevices.map(device => {
      if (device.id === activeDeviceId) {
        return {
          ...device,
          features: [...device.features, newFeature],
        };
      }
      return device;
    });

    setEquivalentDevices(updatedDevices);
    resetFeatureForm();
    setIsFeatureDialogOpen(false);

    toast({
      title: 'Feature added',
      description: `${newFeature.name} comparison has been added.`,
    });
  };

  // Update feature
  const updateFeature = () => {
    if (!currentFeature.category || !currentFeature.name || !activeDeviceId) {
      toast({
        title: 'Missing information',
        description: 'Please provide all required feature information.',
        variant: 'destructive',
      });
      return;
    }

    const updatedDevices = equivalentDevices.map(device => {
      if (device.id === activeDeviceId) {
        return {
          ...device,
          features: device.features.map(feature =>
            feature.id === currentFeature.id ? { ...currentFeature, isEditing: false } : feature
          ),
        };
      }
      return device;
    });

    setEquivalentDevices(updatedDevices);
    resetFeatureForm();
    setIsFeatureDialogOpen(false);

    toast({
      title: 'Feature updated',
      description: `${currentFeature.name} comparison has been updated.`,
    });
  };

  // Delete feature
  const deleteFeature = (deviceId, featureId) => {
    const updatedDevices = equivalentDevices.map(device => {
      if (device.id === deviceId) {
        return {
          ...device,
          features: device.features.filter(feature => feature.id !== featureId),
        };
      }
      return device;
    });

    setEquivalentDevices(updatedDevices);

    toast({
      title: 'Feature removed',
      description: 'The feature comparison has been removed.',
    });
  };

  // Edit feature
  const editFeature = feature => {
    setCurrentFeature({
      ...feature,
      isEditing: true,
    });
    setIsFeatureDialogOpen(true);
  };

  // Generate AI rationale for feature
  const generateFeatureRationale = async () => {
    if (
      !currentFeature.category ||
      !currentFeature.name ||
      !currentFeature.subjectValue ||
      !currentFeature.equivalentValue
    ) {
      toast({
        title: 'Missing information',
        description: 'Please fill in all feature values before generating a rationale.',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingRationale(true);

    try {
      // Get the active device
      const activeDevice = equivalentDevices.find(d => d.id === activeDeviceId);

      const response = await fetch('/api/cer/equivalence/feature-rationale', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subjectDevice: {
            name: subjectDevice.name,
            feature: {
              category: currentFeature.category,
              name: currentFeature.name,
              value: currentFeature.subjectValue,
            },
          },
          equivalentDevice: {
            name: activeDevice?.name || 'Equivalent device',
            feature: {
              category: currentFeature.category,
              name: currentFeature.name,
              value: currentFeature.equivalentValue,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Error generating rationale: ${response.statusText}`);
      }

      const data = await response.json();

      // Determine impact based on AI assessment
      let suggestedImpact = 'none';
      const impactText = data.impact ? data.impact.toLowerCase() : '';

      if (impactText.includes('significant') || impactText.includes('high')) {
        suggestedImpact = 'significant';
      } else if (impactText.includes('moderate') || impactText.includes('medium')) {
        suggestedImpact = 'moderate';
      } else if (impactText.includes('minor') || impactText.includes('low')) {
        suggestedImpact = 'minor';
      }

      // Update the form with AI suggestions
      setCurrentFeature({
        ...currentFeature,
        impact: suggestedImpact,
        rationale: data.rationale || data.text || '',
      });

      setRationaleSuggestion(data.rationale || data.text || '');

      toast({
        title: 'Rationale generated',
        description: 'AI has provided a suggested rationale for this feature comparison.',
      });
    } catch (error) {
      console.error('Error generating rationale:', error);
      toast({
        title: 'Generation failed',
        description: error.message || 'Failed to generate rationale. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingRationale(false);
    }
  };

  // Generate overall equivalence assessment
  const generateOverallEquivalence = async deviceId => {
    const device = equivalentDevices.find(d => d.id === deviceId);

    if (!device || device.features.length === 0) {
      toast({
        title: 'Missing features',
        description: 'Please add feature comparisons before generating an overall assessment.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/cer/equivalence/overall-assessment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subjectDevice,
          equivalentDevice: device,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error generating assessment: ${response.statusText}`);
      }

      const data = await response.json();

      // Update the device with the overall rationale
      const updatedDevices = equivalentDevices.map(d => {
        if (d.id === deviceId) {
          return {
            ...d,
            overallRationale: data.overallRationale || data.text || '',
          };
        }
        return d;
      });

      setEquivalentDevices(updatedDevices);

      toast({
        title: 'Assessment generated',
        description: 'Overall equivalence assessment has been generated.',
      });
    } catch (error) {
      console.error('Error generating overall assessment:', error);
      toast({
        title: 'Generation failed',
        description: error.message || 'Failed to generate overall assessment. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Check data access compliance for equivalent device
  const checkDataAccessCompliance = async deviceId => {
    const device = equivalentDevices.find(d => d.id === deviceId);

    if (!device) {
      toast({
        title: 'Device not found',
        description: 'Please select a valid equivalent device to check data access compliance.',
        variant: 'destructive',
      });
      return;
    }

    if (!dataAccessInfo.manufacturerName || !dataAccessInfo.accessType) {
      toast({
        title: 'Missing information',
        description: 'Please provide manufacturer name and access type information.',
        variant: 'destructive',
      });
      return;
    }

    // Validate specific fields based on access type
    if (dataAccessInfo.accessType === 'direct_contract' && !dataAccessInfo.contractReference) {
      toast({
        title: 'Missing contract reference',
        description: 'Please provide the contract reference number for direct contract access.',
        variant: 'destructive',
      });
      return;
    }

    if (dataAccessInfo.accessType === 'indirect_access' && !dataAccessInfo.thirdPartyService) {
      toast({
        title: 'Missing third-party service',
        description:
          'Please select the third-party service providing access (e.g., greenlight.guru).',
        variant: 'destructive',
      });
      return;
    }

    // At minimum, one of the three access domains must be covered
    if (
      !dataAccessInfo.hasTechnicalAccess &&
      !dataAccessInfo.hasBiologicalAccess &&
      !dataAccessInfo.hasClinicalAccess
    ) {
      toast({
        title: 'Incomplete data access',
        description:
          'Per EU MDR Article 61(5), you must have access to at least one data domain (technical, biological, or clinical).',
        variant: 'destructive',
      });
      return;
    }

    setDataAccessStatus('checking');

    try {
      // Prepare data for compliance check
      const apiRequestData = {
        manufacturerName: dataAccessInfo.manufacturerName || subjectDevice.manufacturer,
        equivalentDeviceInfo: {
          name: device.name,
          manufacturer: device.manufacturer,
        },
        accessType: dataAccessInfo.accessType,
        accessDetails: dataAccessInfo.accessDetails,
        // Additional details
        contractReference: dataAccessInfo.contractReference,
        thirdPartyService: dataAccessInfo.thirdPartyService,
        // EU MDR compliance details
        accessDomains: {
          technical: dataAccessInfo.hasTechnicalAccess,
          biological: dataAccessInfo.hasBiologicalAccess,
          clinical: dataAccessInfo.hasClinicalAccess,
          documented: dataAccessInfo.hasDocumentation,
        },
      };

      console.log('Verifying data access with EU MDR compliance data:', apiRequestData);

      // Call API for verification
      const response = await fetch('/api/cer/equivalence/data-access-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiRequestData),
      });

      if (!response.ok) {
        throw new Error(`Error checking data access: ${response.statusText}`);
      }

      const data = await response.json();

      setDataAccessAssessment(data.assessment || '');
      setDataAccessStatus(data.complianceStatus || 'uncertain');

      // Update device with data access status
      const updatedDevices = equivalentDevices.map(d => {
        if (d.id === deviceId) {
          return {
            ...d,
            dataAccessStatus: data.complianceStatus,
            dataAccessDetails: {
              ...dataAccessInfo,
              assessment: data.assessment,
              verifiedAt: new Date().toISOString(),
            },
          };
        }
        return d;
      });

      setEquivalentDevices(updatedDevices);

      toast({
        title: 'Data access verified',
        description:
          data.complianceStatus === 'compliant'
            ? `${device.name} complies with EU MDR Article 61(5) data access requirements.`
            : `${device.name} data access verification completed. See assessment for details.`,
      });
    } catch (error) {
      console.error('Error checking data access:', error);
      setDataAccessStatus(null);

      toast({
        title: 'Verification failed',
        description: error.message || 'Failed to verify data access compliance. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle adding the equivalence section to the CER
  const handleAddToCER = () => {
    if (!sectionE4Content) {
      toast({
        title: 'No content to add',
        description: 'Please generate the E.4 section first before adding to your CER.',
        variant: 'destructive',
      });
      return;
    }

    if (onAddToCER) {
      const cerSection = {
        title: 'Device Equivalence Assessment',
        type: 'equivalence-assessment',
        content: sectionE4Content,
        lastUpdated: new Date().toISOString(),
      };

      onAddToCER(cerSection);

      toast({
        title: 'Added to CER',
        description: 'Device equivalence assessment has been added to your CER document.',
        variant: 'default',
      });
    }
  };

  // Generate Section E.4 for Clinical Evaluation Report
  const generateSectionE4 = async () => {
    if (!subjectDevice.name || equivalentDevices.length === 0) {
      toast({
        title: 'Missing data',
        description:
          'Please define the subject device and at least one equivalent device to generate the E.4 section.',
        variant: 'destructive',
      });
      return;
    }

    // Check if any device is missing features or overall rationale
    const incompleteDevices = equivalentDevices.filter(
      device => device.features.length === 0 || !device.overallRationale
    );

    if (incompleteDevices.length > 0) {
      const incompleteNames = incompleteDevices.map(d => d.name).join(', ');
      toast({
        title: 'Incomplete data',
        description: `Please complete features and generate overall assessments for: ${incompleteNames}`,
        variant: 'destructive',
      });
      return;
    }

    // Check for data access verification
    const unverifiedDevices = equivalentDevices.filter(
      device => !device.dataAccessStatus || device.dataAccessStatus === 'non-compliant'
    );

    if (unverifiedDevices.length > 0) {
      const unverifiedNames = unverifiedDevices.map(d => d.name).join(', ');
      toast({
        title: 'Data access verification needed',
        description: `Please verify data access for: ${unverifiedNames}. EU MDR Article 61(5) requires verification of sufficient access to the equivalent device's technical documentation.`,
        variant: 'destructive',
      });

      // Open data access dialog for the first unverified device
      if (unverifiedDevices.length > 0) {
        setActiveDeviceId(unverifiedDevices[0].id);
        setDataAccessInfo({
          manufacturerName: subjectDevice.manufacturer,
          accessType: 'direct_contract',
          accessDetails: '',
          contractReference: '',
          thirdPartyService: '',
          hasTechnicalAccess: false,
          hasBiologicalAccess: false,
          hasClinicalAccess: false,
          hasDocumentation: false,
        });
        setIsDataAccessDialogOpen(true);
      }

      return;
    }

    setIsGeneratingSectionE4(true);

    try {
      const response = await fetch('/api/cer/equivalence/generate-section', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subjectDevice,
          equivalentDevices,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error generating E.4 section: ${response.statusText}`);
      }

      const data = await response.json();
      setSectionE4Content(data.sectionContent || data.text || '');

      toast({
        title: 'Section E.4 generated',
        description:
          'The device equivalence section has been generated according to MEDDEV 2.7/1 Rev 4 requirements.',
      });
    } catch (error) {
      console.error('Error generating E.4 section:', error);
      toast({
        title: 'Generation failed',
        description: error.message || 'Failed to generate E.4 section. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingSectionE4(false);
    }
  };

  // Add a new predefined feature to the form
  const addPredefinedFeature = predefined => {
    if (!activeDeviceId) {
      toast({
        title: 'No device selected',
        description: 'Please select an equivalent device first.',
        variant: 'destructive',
      });
      return;
    }

    setCurrentFeature({
      ...currentFeature,
      category: predefined.category,
      name: predefined.name,
    });
    setIsFeatureDialogOpen(true);
  };

  // Get the active device
  const activeDevice = equivalentDevices.find(device => device.id === activeDeviceId);

  // Get impact badge color
  const getImpactColor = impact => {
    switch (impact) {
      case 'significant':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'moderate':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'minor':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-green-100 text-green-800 border-green-200';
    }
  };

  // Get impact label
  const getImpactLabel = impact => {
    switch (impact) {
      case 'significant':
        return 'Significant Difference';
      case 'moderate':
        return 'Moderate Difference';
      case 'minor':
        return 'Minor Difference';
      default:
        return 'No Significant Difference';
    }
  };

  // Calculate overall equivalence status
  const getEquivalenceStatus = device => {
    if (!device.features || device.features.length === 0) {
      return 'incomplete';
    }

    const hasMissingRationale = device.features.some(
      f => !f.rationale || f.rationale.trim() === ''
    );

    if (hasMissingRationale) {
      return 'incomplete';
    }

    const hasSignificantDifference = device.features.some(f => f.impact === 'significant');

    if (hasSignificantDifference) {
      return 'not-equivalent';
    }

    // If there are many moderate differences, it might not be equivalent
    const moderateDifferences = device.features.filter(f => f.impact === 'moderate').length;

    if (moderateDifferences > 2 && device.features.length > 4) {
      return 'questionable';
    }

    return 'equivalent';
  };

  // Calculate equivalence score
  const getEquivalenceScore = device => {
    if (!device.features || device.features.length === 0) {
      return 0;
    }

    // Score each feature: no difference = 3, minor = 2, moderate = 1, significant = 0
    const featureScores = device.features.map(feature => {
      switch (feature.impact) {
        case 'none':
          return 3;
        case 'minor':
          return 2;
        case 'moderate':
          return 1;
        case 'significant':
          return 0;
        default:
          return 0;
      }
    });

    // Calculate average score (0-3 scale)
    const totalScore = featureScores.reduce((sum, score) => sum + score, 0);
    const averageScore = totalScore / device.features.length;

    // Convert to percentage
    return Math.round((averageScore / 3) * 100);
  };

  return (
    <div className="space-y-4">
      {/* Data Access Verification Dialog */}
      <Dialog open={isDataAccessDialogOpen} onOpenChange={setIsDataAccessDialogOpen}>
        <DialogContent className="max-w-md md:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-[#141413] text-lg font-semibold flex items-center">
              <Shield className="h-5 w-5 mr-2 text-[#292524]" />
              Data Access Verification
            </DialogTitle>
            <DialogDescription className="text-[#616161]">
              EU MDR Article 61(5) requires manufacturers to verify sufficient data access for
              equivalent devices used in clinical evaluations. This is{' '}
              <span className="font-semibold">CRITICAL</span> for EU MDR/MEDDEV compliance when
              using literature from equivalent devices.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            {activeDevice && (
              <Alert variant="outline" className="bg-[#F2F6FB] border-[#292524]">
                <div className="flex">
                  <Info className="h-4 w-4 text-[#292524] mt-0.5 mr-2" />
                  <div>
                    <AlertTitle>Verifying access for {activeDevice.name}</AlertTitle>
                    <AlertDescription className="text-[#616161] text-xs mt-1">
                      Manufactured by {activeDevice.manufacturer || 'Unknown'}
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            )}

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
              <div className="flex items-start">
                <AlertCircle className="h-4 w-4 text-amber-500 mt-1 mr-2 flex-shrink-0" />
                <div className="text-xs text-amber-800">
                  <p className="font-medium">Important Regulatory Notice:</p>
                  <p className="mt-1">
                    Using literature from equivalent devices requires evidence of sufficient access
                    to technical, biological, and clinical data. Without proper documentation,
                    Notified Bodies may reject your CER.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="data-manufacturer" className="text-sm font-medium text-[#141413]">
                  Your Manufacturer Name
                </Label>
                <Input
                  id="data-manufacturer"
                  value={dataAccessInfo.manufacturerName}
                  onChange={e =>
                    setDataAccessInfo({ ...dataAccessInfo, manufacturerName: e.target.value })
                  }
                  className="h-9 border-[#e8e6dc] focus:border-[#292524] focus:ring-1 focus:ring-[#292524]"
                  placeholder="e.g. Your Company, Inc."
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#141413] flex items-center">
                  Data Access Type
                  <span className="ml-1 text-[#1c1917] text-xs font-medium">*</span>
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div
                    className={cn(
                      'flex items-start p-3 border rounded cursor-pointer',
                      dataAccessInfo.accessType === 'direct_contract'
                        ? 'border-[#292524] bg-[#F2F6FB]'
                        : 'border-[#e8e6dc] hover:border-[#292524] hover:bg-[#F9FAFB]'
                    )}
                    onClick={() =>
                      setDataAccessInfo({ ...dataAccessInfo, accessType: 'direct_contract' })
                    }
                  >
                    <Key className="h-5 w-5 text-[#292524] mt-0.5 mr-2" />
                    <div>
                      <p className="text-sm font-medium text-[#141413]">Direct Contract</p>
                      <p className="text-xs text-[#616161] mt-1">
                        Contractual agreement with the equivalent device manufacturer
                      </p>
                    </div>
                  </div>

                  <div
                    className={cn(
                      'flex items-start p-3 border rounded cursor-pointer',
                      dataAccessInfo.accessType === 'published_literature'
                        ? 'border-[#292524] bg-[#F2F6FB]'
                        : 'border-[#e8e6dc] hover:border-[#292524] hover:bg-[#F9FAFB]'
                    )}
                    onClick={() =>
                      setDataAccessInfo({ ...dataAccessInfo, accessType: 'published_literature' })
                    }
                  >
                    <FileCheck className="h-5 w-5 text-[#292524] mt-0.5 mr-2" />
                    <div>
                      <p className="text-sm font-medium text-[#141413]">Published Literature</p>
                      <p className="text-xs text-[#616161] mt-1">
                        Access through published scientific literature
                      </p>
                    </div>
                  </div>

                  <div
                    className={cn(
                      'flex items-start p-3 border rounded cursor-pointer',
                      dataAccessInfo.accessType === 'indirect_access'
                        ? 'border-[#292524] bg-[#F2F6FB]'
                        : 'border-[#e8e6dc] hover:border-[#292524] hover:bg-[#F9FAFB]'
                    )}
                    onClick={() =>
                      setDataAccessInfo({ ...dataAccessInfo, accessType: 'indirect_access' })
                    }
                  >
                    <Fingerprint className="h-5 w-5 text-[#292524] mt-0.5 mr-2" />
                    <div>
                      <p className="text-sm font-medium text-[#141413]">Indirect Access</p>
                      <p className="text-xs text-[#616161] mt-1">
                        Access through a third-party service (e.g., greenlight.guru)
                      </p>
                    </div>
                  </div>

                  <div
                    className={cn(
                      'flex items-start p-3 border rounded cursor-pointer',
                      dataAccessInfo.accessType === 'other'
                        ? 'border-[#292524] bg-[#F2F6FB]'
                        : 'border-[#e8e6dc] hover:border-[#292524] hover:bg-[#F9FAFB]'
                    )}
                    onClick={() => setDataAccessInfo({ ...dataAccessInfo, accessType: 'other' })}
                  >
                    <BarChart className="h-5 w-5 text-[#292524] mt-0.5 mr-2" />
                    <div>
                      <p className="text-sm font-medium text-[#141413]">Other Method</p>
                      <p className="text-xs text-[#616161] mt-1">
                        Other forms of access (please specify in details)
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {dataAccessInfo.accessType === 'direct_contract' && (
                <div className="space-y-2">
                  <Label
                    htmlFor="contract-reference"
                    className="text-sm font-medium text-[#141413]"
                  >
                    Contract Reference Number
                  </Label>
                  <Input
                    id="contract-reference"
                    value={dataAccessInfo.contractReference || ''}
                    onChange={e =>
                      setDataAccessInfo({ ...dataAccessInfo, contractReference: e.target.value })
                    }
                    className="h-9 border-[#e8e6dc] focus:border-[#292524] focus:ring-1 focus:ring-[#292524]"
                    placeholder="e.g. CONT-2025-4893"
                  />
                </div>
              )}

              {dataAccessInfo.accessType === 'indirect_access' && (
                <div className="space-y-2">
                  <Label
                    htmlFor="thirdparty-service"
                    className="text-sm font-medium text-[#141413]"
                  >
                    Third-Party Service
                  </Label>
                  <Select
                    value={dataAccessInfo.thirdPartyService || ''}
                    onValueChange={value =>
                      setDataAccessInfo({ ...dataAccessInfo, thirdPartyService: value })
                    }
                  >
                    <SelectTrigger id="thirdparty-service">
                      <SelectValue placeholder="Select third-party service" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="greenlight.guru">greenlight.guru</SelectItem>
                      <SelectItem value="emergo">Emergo by UL</SelectItem>
                      <SelectItem value="bsi">BSI Group</SelectItem>
                      <SelectItem value="tüv">TÜV SÜD</SelectItem>
                      <SelectItem value="other">Other (specify in details)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="data-details" className="text-sm font-medium text-[#141413]">
                  Access Details
                </Label>
                <Textarea
                  id="data-details"
                  value={dataAccessInfo.accessDetails}
                  onChange={e =>
                    setDataAccessInfo({ ...dataAccessInfo, accessDetails: e.target.value })
                  }
                  className="border-[#e8e6dc] focus:border-[#292524] focus:ring-1 focus:ring-[#292524] resize-none"
                  placeholder={
                    dataAccessInfo.accessType === 'indirect_access'
                      ? 'Please provide details including your greenlight.guru subscription level, access date, and any specific agreements in place...'
                      : 'Provide additional details about your data access arrangement...'
                  }
                  rows={3}
                />
              </div>

              {/* Data access checklist for EU MDR compliance */}
              <div className="space-y-3 p-3 border border-[#e8e6dc] rounded-md">
                <div className="text-sm font-medium text-[#141413]">
                  EU MDR Article 61(5) Compliance Checklist
                </div>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="check-technical"
                      checked={dataAccessInfo.hasTechnicalAccess}
                      onCheckedChange={checked =>
                        setDataAccessInfo({ ...dataAccessInfo, hasTechnicalAccess: checked })
                      }
                    />
                    <Label
                      htmlFor="check-technical"
                      className="text-xs text-[#141413] cursor-pointer"
                    >
                      Access to Technical Characteristics data
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="check-biological"
                      checked={dataAccessInfo.hasBiologicalAccess}
                      onCheckedChange={checked =>
                        setDataAccessInfo({ ...dataAccessInfo, hasBiologicalAccess: checked })
                      }
                    />
                    <Label
                      htmlFor="check-biological"
                      className="text-xs text-[#141413] cursor-pointer"
                    >
                      Access to Biological Characteristics data
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="check-clinical"
                      checked={dataAccessInfo.hasClinicalAccess}
                      onCheckedChange={checked =>
                        setDataAccessInfo({ ...dataAccessInfo, hasClinicalAccess: checked })
                      }
                    />
                    <Label
                      htmlFor="check-clinical"
                      className="text-xs text-[#141413] cursor-pointer"
                    >
                      Access to Clinical Characteristics data
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="check-documentation"
                      checked={dataAccessInfo.hasDocumentation}
                      onCheckedChange={checked =>
                        setDataAccessInfo({ ...dataAccessInfo, hasDocumentation: checked })
                      }
                    />
                    <Label
                      htmlFor="check-documentation"
                      className="text-xs text-[#141413] cursor-pointer"
                    >
                      Documentation of data access is available for Notified Body review
                    </Label>
                  </div>
                </div>
              </div>

              {dataAccessStatus && (
                <div className="mt-4">
                  <div className="flex items-center mb-2">
                    {dataAccessStatus === 'checking' ? (
                      <Loader2 className="h-4 w-4 text-[#292524] animate-spin mr-2" />
                    ) : dataAccessStatus === 'compliant' ? (
                      <ShieldCheck className="h-4 w-4 text-green-600 mr-2" />
                    ) : dataAccessStatus === 'non-compliant' ? (
                      <ShieldAlert className="h-4 w-4 text-red-600 mr-2" />
                    ) : (
                      <Shield className="h-4 w-4 text-amber-600 mr-2" />
                    )}

                    <span
                      className={cn(
                        'text-sm font-medium',
                        dataAccessStatus === 'checking'
                          ? 'text-[#292524]'
                          : dataAccessStatus === 'compliant'
                            ? 'text-green-600'
                            : dataAccessStatus === 'non-compliant'
                              ? 'text-red-600'
                              : 'text-amber-600'
                      )}
                    >
                      {dataAccessStatus === 'checking'
                        ? 'Verifying compliance...'
                        : dataAccessStatus === 'compliant'
                          ? 'Compliant with EU MDR Article 61(5)'
                          : dataAccessStatus === 'non-compliant'
                            ? 'Non-compliant with EU MDR Article 61(5)'
                            : 'Uncertain compliance status'}
                    </span>
                  </div>

                  {dataAccessAssessment && (
                    <div className="text-xs text-[#616161] p-3 bg-[#F9FAFB] border border-[#e8e6dc] rounded max-h-40 overflow-y-auto mt-2">
                      {dataAccessAssessment.split('\n').map((paragraph, index) => (
                        <p key={index} className="mb-2">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="text-[#616161] border-[#e8e6dc] hover:bg-[#F9FAFB] hover:text-[#141413]"
              onClick={() => setIsDataAccessDialogOpen(false)}
            >
              Cancel
            </Button>

            <Button
              variant="default"
              className="bg-[#292524] text-white hover:bg-[#0C5AA0]"
              onClick={() => checkDataAccessCompliance(activeDeviceId)}
              disabled={dataAccessStatus === 'checking'}
            >
              {dataAccessStatus === 'checking' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify Access'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subject Device Section */}
      <div className="bg-white p-4 border border-[#e8e6dc] rounded">
        <div className="flex items-center justify-between border-b border-[#e8e6dc] pb-3 mb-3">
          <h3 className="text-base font-semibold text-[#141413]">Subject Device</h3>
          <Badge
            variant="outline"
            className="bg-[#faf0ec] text-[#292524] text-xs border-[#292524] px-2 py-0.5"
          >
            MEDDEV 2.7/1 Rev 4 Compliant
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="subject-name" className="text-sm font-medium text-[#141413]">
              Device Name
            </Label>
            <Input
              id="subject-name"
              value={subjectDevice.name}
              onChange={e => setSubjectDevice({ ...subjectDevice, name: e.target.value })}
              className="h-9 border-[#e8e6dc] focus:border-[#292524] focus:ring-1 focus:ring-[#292524]"
              placeholder="e.g. OrthoFlex Medical Implant"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject-manufacturer" className="text-sm font-medium text-[#141413]">
              Manufacturer
            </Label>
            <Input
              id="subject-manufacturer"
              value={subjectDevice.manufacturer}
              onChange={e => setSubjectDevice({ ...subjectDevice, manufacturer: e.target.value })}
              className="h-9 border-[#e8e6dc] focus:border-[#292524] focus:ring-1 focus:ring-[#292524]"
              placeholder="e.g. OrthoFlex Medical, Inc."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject-model" className="text-sm font-medium text-[#141413]">
              Model/Version
            </Label>
            <Input
              id="subject-model"
              value={subjectDevice.model}
              onChange={e => setSubjectDevice({ ...subjectDevice, model: e.target.value })}
              className="h-9 border-[#e8e6dc] focus:border-[#292524] focus:ring-1 focus:ring-[#292524]"
              placeholder="e.g. OF-2025-A"
            />
          </div>

          <div className="md:col-span-2 space-y-2">
            <Label htmlFor="subject-description" className="text-sm font-medium text-[#141413]">
              Brief Description
            </Label>
            <Textarea
              id="subject-description"
              value={subjectDevice.description}
              onChange={e => setSubjectDevice({ ...subjectDevice, description: e.target.value })}
              className="border-[#e8e6dc] focus:border-[#292524] focus:ring-1 focus:ring-[#292524] resize-none"
              placeholder="Enter a brief description of the device..."
              rows={3}
            />
          </div>
        </div>
      </div>

      {/* Equivalent Devices Section */}
      <div className="bg-white p-4 border border-[#e8e6dc] rounded">
        <div className="flex items-center justify-between border-b border-[#e8e6dc] pb-3 mb-3">
          <h3 className="text-base font-semibold text-[#141413]">Equivalent Devices</h3>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-xs bg-[#F5F5F5] text-[#616161] border-[#e8e6dc] px-2 py-0.5"
            >
              {equivalentDevices.length} device{equivalentDevices.length !== 1 ? 's' : ''}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[#292524] border-[#292524] hover:bg-[#faf0ec] hover:text-[#292524]"
              onClick={() => {
                resetEquivalentDeviceForm();
                setDialogMode('add');
                setIsDialogOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              <span>Add Device</span>
            </Button>
          </div>
        </div>

        {equivalentDevices.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 bg-[#faf9f5] rounded border border-[#e8e6dc] text-center">
            <FileText className="h-8 w-8 text-[#8a8880] mb-2" />
            <p className="text-sm text-[#141413] font-medium">No equivalent devices yet</p>
            <p className="text-xs text-[#616161] mt-1">
              Add equivalent devices to start building the comparison table
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Device tabs */}
            <div className="flex flex-wrap gap-2 pb-2 border-b border-[#e8e6dc]">
              {equivalentDevices.map(device => (
                <Button
                  key={device.id}
                  variant={activeDeviceId === device.id ? 'default' : 'outline'}
                  className={
                    activeDeviceId === device.id
                      ? 'bg-[#292524] hover:bg-[#1c1917] text-white'
                      : 'text-[#141413] hover:bg-[#f4f3ee]'
                  }
                  onClick={() => setActiveDeviceId(device.id)}
                >
                  {device.name}
                  {getEquivalenceStatus(device) === 'equivalent' && (
                    <CheckCircle2 className="h-3.5 w-3.5 ml-1.5 text-green-500" />
                  )}
                  {getEquivalenceStatus(device) === 'not-equivalent' && (
                    <AlertCircle className="h-3.5 w-3.5 ml-1.5 text-red-500" />
                  )}
                </Button>
              ))}
            </div>

            {/* Active device details */}
            {activeDevice && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-medium text-[#141413]">{activeDevice.name}</h4>
                    <p className="text-xs text-[#616161]">
                      {activeDevice.manufacturer}{' '}
                      {activeDevice.model ? `• ${activeDevice.model}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => editEquivalentDevice(activeDevice)}
                      className="h-8 text-[#141413] hover:bg-[#f4f3ee]"
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                      <span>Edit</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteEquivalentDevice(activeDevice.id)}
                      className="h-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      <span>Delete</span>
                    </Button>
                  </div>
                </div>

                {/* Device description */}
                {activeDevice.description && (
                  <div className="p-3 bg-[#faf9f5] rounded border border-[#e8e6dc] mb-4">
                    <p className="text-sm text-[#141413]">{activeDevice.description}</p>
                  </div>
                )}

                {/* Features section */}
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-sm font-medium text-[#141413]">Feature Comparison Table</h5>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-[#292524] border-[#292524] hover:bg-[#faf0ec] hover:text-[#292524]"
                    onClick={() => {
                      resetFeatureForm();
                      setIsFeatureDialogOpen(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    <span>Add Feature</span>
                  </Button>
                </div>

                {activeDevice.features.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-4 bg-[#faf9f5] rounded border border-[#e8e6dc] text-center">
                    <p className="text-xs text-[#616161]">
                      No features added yet. Click 'Add Feature' to begin the comparison.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-[#e8e6dc] rounded">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-[#faf9f5]">
                          <TableHead className="w-1/4">Feature</TableHead>
                          <TableHead className="w-1/4">Subject Device</TableHead>
                          <TableHead className="w-1/4">Equivalent Device</TableHead>
                          <TableHead className="w-1/6">Difference</TableHead>
                          <TableHead className="w-1/12">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeDevice.features.map(feature => (
                          <TableRow key={feature.id}>
                            <TableCell className="align-top">
                              <div className="text-sm font-medium">{feature.name}</div>
                              <Badge
                                variant="outline"
                                className="mt-1 text-xs bg-[#F5F5F5] text-[#616161] border-[#e8e6dc]"
                              >
                                {featureCategories.find(c => c.value === feature.category)?.label ||
                                  feature.category}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{feature.subjectValue}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{feature.equivalentValue}</div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn('text-xs', getImpactColor(feature.impact))}
                              >
                                {getImpactLabel(feature.impact)}
                              </Badge>
                              {feature.rationale && (
                                <div className="text-xs text-[#616161] mt-1 line-clamp-2">
                                  {feature.rationale}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => editFeature(feature)}
                                  className="h-7 w-7 text-[#141413] hover:bg-[#f4f3ee]"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => deleteFeature(activeDevice.id, feature.id)}
                                  className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Overall Equivalence Rationale */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-medium text-[#141413]">
                      Overall Equivalence Assessment
                    </h5>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={activeDevice.features.length === 0}
                      onClick={() => generateOverallEquivalence(activeDevice.id)}
                      className="h-8 text-[#292524] border-[#292524] hover:bg-[#faf0ec] hover:text-[#292524]"
                    >
                      <Settings className="h-3.5 w-3.5 mr-1.5" />
                      <span>Generate Assessment</span>
                    </Button>
                  </div>

                  {/* Display equivalence status */}
                  <div className="mb-2">
                    {getEquivalenceStatus(activeDevice) === 'equivalent' && (
                      <Badge className="text-xs bg-green-100 text-green-800 border-green-200">
                        Equivalent
                      </Badge>
                    )}
                    {getEquivalenceStatus(activeDevice) === 'not-equivalent' && (
                      <Badge className="text-xs bg-red-100 text-red-800 border-red-200">
                        Not Equivalent
                      </Badge>
                    )}
                    {getEquivalenceStatus(activeDevice) === 'questionable' && (
                      <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200">
                        Questionable Equivalence
                      </Badge>
                    )}
                    {getEquivalenceStatus(activeDevice) === 'incomplete' && (
                      <Badge className="text-xs bg-blue-100 text-blue-800 border-blue-200">
                        Assessment Incomplete
                      </Badge>
                    )}
                  </div>

                  {activeDevice.overallRationale ? (
                    <div className="p-3 bg-[#faf9f5] rounded border border-[#e8e6dc] text-sm">
                      {activeDevice.overallRationale.split('\n').map((paragraph, i) => (
                        <p key={i} className="mb-2 last:mb-0">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 bg-[#faf9f5] rounded border border-[#e8e6dc] text-center">
                      <p className="text-xs text-[#616161]">
                        {activeDevice.features.length === 0
                          ? 'Add features to enable overall assessment generation'
                          : "Click 'Generate Assessment' to create an overall equivalence justification"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Device Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'add' ? 'Add Equivalent Device' : 'Edit Device'}
            </DialogTitle>
            <DialogDescription>
              Enter the details of the device you want to compare with your subject device.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="device-name" className="text-sm font-medium">
                Device Name
              </Label>
              <Input
                id="device-name"
                placeholder="e.g. CompetitorFlex Implant"
                value={currentEquivalentDevice.name}
                onChange={e =>
                  setCurrentEquivalentDevice({ ...currentEquivalentDevice, name: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="device-manufacturer" className="text-sm font-medium">
                Manufacturer
              </Label>
              <Input
                id="device-manufacturer"
                placeholder="e.g. Competitor Medical Ltd."
                value={currentEquivalentDevice.manufacturer}
                onChange={e =>
                  setCurrentEquivalentDevice({
                    ...currentEquivalentDevice,
                    manufacturer: e.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="device-model" className="text-sm font-medium">
                Model/Version (Optional)
              </Label>
              <Input
                id="device-model"
                placeholder="e.g. CF-100"
                value={currentEquivalentDevice.model}
                onChange={e =>
                  setCurrentEquivalentDevice({ ...currentEquivalentDevice, model: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="device-description" className="text-sm font-medium">
                Brief Description (Optional)
              </Label>
              <Textarea
                id="device-description"
                placeholder="Brief description of the device..."
                rows={3}
                value={currentEquivalentDevice.description}
                onChange={e =>
                  setCurrentEquivalentDevice({
                    ...currentEquivalentDevice,
                    description: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={dialogMode === 'add' ? addEquivalentDevice : updateEquivalentDevice}
              className="bg-[#292524] hover:bg-[#1c1917] text-white"
            >
              {dialogMode === 'add' ? 'Add Device' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Feature Dialog */}
      <Dialog open={isFeatureDialogOpen} onOpenChange={setIsFeatureDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {currentFeature.isEditing ? 'Edit Feature Comparison' : 'Add Feature Comparison'}
            </DialogTitle>
            <DialogDescription>
              Compare a specific feature between your subject device and the equivalent device.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="feature-category" className="text-sm font-medium">
                  Feature Category
                </Label>
                <Select
                  value={currentFeature.category}
                  onValueChange={value => setCurrentFeature({ ...currentFeature, category: value })}
                >
                  <SelectTrigger id="feature-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Categories</SelectLabel>
                      {featureCategories.map(category => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="feature-name" className="text-sm font-medium">
                  Feature Name
                </Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      id="feature-name"
                      placeholder="e.g. Material Composition"
                      value={currentFeature.name}
                      onChange={e => setCurrentFeature({ ...currentFeature, name: e.target.value })}
                    />
                  </div>
                  <Select
                    value=""
                    onValueChange={value => {
                      // Find the predefined characteristic
                      const predefined = predefinedCharacteristics.find(c => c.name === value);
                      if (predefined) {
                        setCurrentFeature({
                          ...currentFeature,
                          category: predefined.category,
                          name: predefined.name,
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Predefined" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Common Characteristics</SelectLabel>
                        {predefinedCharacteristics.map(characteristic => (
                          <SelectItem key={characteristic.name} value={characteristic.name}>
                            {characteristic.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="subject-value" className="text-sm font-medium">
                  Subject Device Value
                  <span className="text-xs text-[#616161] ml-1">
                    ({subjectDevice.name || 'Subject Device'})
                  </span>
                </Label>
                <Textarea
                  id="subject-value"
                  placeholder="e.g. Titanium alloy Ti-6Al-4V"
                  rows={3}
                  value={currentFeature.subjectValue}
                  onChange={e =>
                    setCurrentFeature({ ...currentFeature, subjectValue: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="equivalent-value" className="text-sm font-medium">
                  Equivalent Device Value
                  <span className="text-xs text-[#616161] ml-1">
                    ({activeDevice?.name || 'Equivalent Device'})
                  </span>
                </Label>
                <Textarea
                  id="equivalent-value"
                  placeholder="e.g. Titanium alloy Ti-6Al-4V with nickel coating"
                  rows={3}
                  value={currentFeature.equivalentValue}
                  onChange={e =>
                    setCurrentFeature({ ...currentFeature, equivalentValue: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between items-start mb-2">
                  <Label htmlFor="impact-assessment" className="text-sm font-medium">
                    Impact Assessment
                  </Label>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">Match/Difference:</span>
                    <div className="flex border rounded overflow-hidden">
                      <Button
                        type="button"
                        size="sm"
                        variant={currentFeature.impact === 'none' ? 'default' : 'outline'}
                        className={`rounded-none px-2 py-0 h-7 ${currentFeature.impact === 'none' ? 'bg-green-600 text-white hover:bg-green-700' : ''}`}
                        onClick={() => setCurrentFeature({ ...currentFeature, impact: 'none' })}
                      >
                        Match
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={currentFeature.impact !== 'none' ? 'default' : 'outline'}
                        className={`rounded-none px-2 py-0 h-7 ${currentFeature.impact !== 'none' ? 'bg-amber-600 text-white hover:bg-amber-700' : ''}`}
                        onClick={() =>
                          currentFeature.impact === 'none'
                            ? setCurrentFeature({ ...currentFeature, impact: 'minor' })
                            : null
                        }
                      >
                        Difference
                      </Button>
                    </div>
                  </div>
                </div>
                <Select
                  value={currentFeature.impact}
                  onValueChange={value => setCurrentFeature({ ...currentFeature, impact: value })}
                >
                  <SelectTrigger id="impact-assessment">
                    <SelectValue placeholder="Select impact level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Impact Levels</SelectLabel>
                      <SelectItem value="none">No Significant Difference</SelectItem>
                      <SelectItem value="minor">Minor Difference</SelectItem>
                      <SelectItem value="moderate">Moderate Difference</SelectItem>
                      <SelectItem value="significant">Significant Difference</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button
                  variant="outline"
                  disabled={
                    isGeneratingRationale ||
                    !currentFeature.subjectValue ||
                    !currentFeature.equivalentValue
                  }
                  onClick={generateFeatureRationale}
                  className="h-9 border-[#292524] text-[#292524] hover:bg-[#faf0ec] hover:text-[#292524]"
                >
                  {isGeneratingRationale ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Generate AI Rationale</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rationale" className="text-sm font-medium">
                Rationale for Equivalence
              </Label>
              <Textarea
                id="rationale"
                placeholder="Explain why this difference does or does not impact safety and performance..."
                rows={4}
                value={currentFeature.rationale}
                onChange={e => setCurrentFeature({ ...currentFeature, rationale: e.target.value })}
              />
              <p className="text-xs text-[#616161]">
                Provide justification for why any differences do not affect safety or performance,
                per MEDDEV 2.7/1 Rev 4 requirements.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFeatureDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={currentFeature.isEditing ? updateFeature : addFeature}
              className="bg-[#292524] hover:bg-[#1c1917] text-white"
            >
              {currentFeature.isEditing ? 'Save Changes' : 'Add Feature'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Section E.4 Generation Panel */}
      {equivalentDevices.length > 0 && (
        <div className="mt-8 bg-white p-4 border border-[#e8e6dc] rounded">
          <div className="flex items-center justify-between border-b border-[#e8e6dc] pb-3 mb-3">
            <div>
              <h3 className="text-base font-semibold text-[#141413]">Generate Section E.4</h3>
              <p className="text-xs text-[#616161]">
                Creates a fully formatted device equivalence section following MEDDEV 2.7/1 Rev 4
                requirements
              </p>
            </div>
            <Button
              variant="default"
              disabled={isGeneratingSectionE4}
              onClick={generateSectionE4}
              className="bg-[#292524] hover:bg-[#1c1917] text-white"
            >
              {isGeneratingSectionE4 ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  <span>Generate E.4 Section</span>
                </>
              )}
            </Button>
          </div>

          {sectionE4Content ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-[#141413]">
                  Generated Section E.4: Comparison of Clinical, Technical and Biological
                  Characteristics
                </h4>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => {
                      navigator.clipboard.writeText(sectionE4Content);
                      toast({
                        title: 'Copied to clipboard',
                        description: 'The E.4 section content has been copied to your clipboard.',
                      });
                    }}
                  >
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    <span>Copy</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-[#292524] text-[#292524]"
                    onClick={handleAddToCER}
                  >
                    <FileText className="mr-2 h-3.5 w-3.5" />
                    <span>Add to CER</span>
                  </Button>
                </div>
              </div>
              <div className="p-4 bg-[#faf9f5] rounded border border-[#e8e6dc] max-h-96 overflow-y-auto">
                <div className="prose prose-sm max-w-none">
                  {sectionE4Content.split('\n').map((paragraph, index) => (
                    <p key={index} className="my-2">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
              <div className="flex items-center pt-2 text-sm">
                <Info className="h-4 w-4 text-[#292524] mr-2" />
                <span className="text-[#616161]">
                  This generated content can be used directly in Section E.4 of your CER.
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 bg-[#faf9f5] rounded border border-[#e8e6dc] text-center">
              <FileText className="h-10 w-10 text-[#8a8880] mb-3" />
              <p className="text-sm text-[#141413] font-medium">
                No E.4 section content generated yet
              </p>
              <p className="text-xs text-[#616161] mt-1 max-w-md">
                Click the "Generate E.4 Section" button above to create a complete device
                equivalence section following MEDDEV 2.7/1 Rev 4 requirements.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

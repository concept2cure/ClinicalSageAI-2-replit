import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { DOC_TYPES } from '@shared/docTypes';
import { applyScaffold } from '@/lib/scaffold';
import EnhancedDocumentEditor from './EnhancedDocumentEditor';
import RegulatoryRichTextEditor from './RegulatoryRichTextEditor';
import { useEvidenceGraph } from '@/contexts/EvidenceGraphContext';
import { EvidenceType, ValidationStatus } from '@shared/evidenceSchema';
import {
  generateCompleteDocument,
  getWorkflowSuggestions,
  populatePredicateSection,
  populateEquivalenceSection,
  populateLiteratureSection,
} from '@/lib/documentDataFlow';
import Fda510kExportService from '@/services/Fda510kExportService';
import cerv2SectionService from '@/services/CERV2SectionService';
import FDA510kTemplateService from '@/services/FDA510kTemplateService';
import FDA510kAIService from '@/services/FDA510kAIService';
import {
  Save,
  Download,
  FileText,
  CheckCircle,
  AlertCircle,
  Info,
  Sparkles,
  FileCheck,
  History,
  Edit3,
  Eye,
  Lock,
  Unlock,
  RefreshCw,
  Package,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Clock,
  Upload,
  User,
  Building2,
  Phone,
  Mail,
  MapPin,
  Shield,
  Activity,
  ClipboardCheck,
  Beaker,
  FileSignature,
  Circle,
  CheckCircle2,
  BookOpen,
  ShieldCheck,
  Link2,
  DollarSign,
  Code,
  Network,
  Users,
  Settings,
  Zap,
  Tag,
  GitCompare,
  AlertTriangle,
  Bot,
  Send,
  Brain,
  Database,
} from 'lucide-react';

// Import Data Room integration components
import DocumentCitationHelper from './DocumentCitationHelper';

const MedicalDeviceDocumentEditor = ({
  documentType = 'cerv2_510k',
  deviceProfile = {},
  predicateDevices = [],
  literatureData = [],
  literatureResults = [], // Also accept literatureResults prop
  onSave,
  onExport,
  existingContent = '',
  documentId = null,
  readOnly = false,
  onWorkflowUpdate,
  selectedSection = null, // Section selected from Document Vault
  onSectionSaved, // Callback when section is saved to database
}) => {
  const { toast } = useToast();
  const editorRef = useRef(null);
  const contentRef = useRef(null);

  // EMR-style state management
  const [activeSection, setActiveSection] = useState('user-fee-cover');
  const [expandedSections, setExpandedSections] = useState(new Set(['user-fee-cover']));
  const [completedSections, setCompletedSections] = useState(new Set());
  const [sectionData, setSectionData] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [overallProgress, setOverallProgress] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [viewMode, setViewMode] = useState('form'); // 'form', 'preview', or 'edit'
  const [documentContent, setDocumentContent] = useState('');

  const docTypeLabel = DOC_TYPES[documentType]?.label || 'CERV2 Document';
  const docTypeExportHeading =
    documentType === 'cerv2_510k'
      ? 'FDA 510(k) SUBMISSION'
      : documentType === 'cerv2_pma'
        ? 'FDA PMA APPLICATION'
        : 'CLINICAL EVALUATION REPORT (CER)';
  const [isManualEdit, setIsManualEdit] = useState(false);
  const [citations, setCitations] = useState({});
  const [citationSources, setCitationSources] = useState([]);

  // Multi-section tab editing state
  const [openSections, setOpenSections] = useState(['user-fee-cover']); // Array of section IDs open in tabs
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  // AI Assistant state
  const [aiSuggestions, setAiSuggestions] = useState({});
  const [isAiProcessing, setIsAiProcessing] = useState({});

  // Device Data Center state for Sources Tab
  const [deviceFiles, setDeviceFiles] = useState([]);
  const [deviceFilesLoading, setDeviceFilesLoading] = useState(false);
  const [deviceFileSearch, setDeviceFileSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [draggedFile, setDraggedFile] = useState(null);

  // Assignment/Routing state
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);
  const [assignmentData, setAssignmentData] = useState({
    assignTo: '',
    notes: '',
    priority: 'normal',
  });

  // Data Room Integration state
  const [showDataRoomDialog, setShowDataRoomDialog] = useState(false);
  const [dataRoomTargetField, setDataRoomTargetField] = useState(null);

  // Icon mapping for sections loaded from database
  const iconMap = {
    DollarSign: DollarSign,
    FileSignature: FileSignature,
    FileText: FileText,
    FileSearch: FileCheck,
    FileMinus: FileText,
    CheckCircle: CheckCircle,
    AlertCircle: AlertCircle,
    Banknote: DollarSign,
    Award: ShieldCheck,
    BookOpen: BookOpen,
    Package: Package,
    GitCompare: GitCompare,
    Tag: Tag,
    Droplet: Activity,
    Activity: Activity,
    TestTube: Beaker,
    Code: Code,
    Zap: Zap,
    Network: Network,
    Users: Users,
    UserCheck: User,
    Settings: Settings,
  };

  // Fetch 510(k) sections from database
  const { data: sectionsResponse, isLoading: sectionsLoading } = useQuery({
    queryKey: ['/api/cerv2-sections'],
    enabled: documentType === 'cerv2_510k',
  });

  // Fetch Device Data Center files for Sources Tab
  const { data: deviceDataCenterFiles = [], isLoading: isLoadingDeviceDataFiles } = useQuery({
    queryKey: ['/api/device-data-center/files', { organizationId: 7 }],
    enabled: true,
    select: data => data?.files || [],
  });

  // Update deviceFiles state when data changes
  useEffect(() => {
    if (deviceDataCenterFiles) {
      setDeviceFiles(deviceDataCenterFiles);
      setDeviceFilesLoading(false);
    }
  }, [deviceDataCenterFiles]);

  // Filter files for Sources Tab
  const filteredDeviceFiles = useMemo(() => {
    if (!deviceFiles) return [];

    return deviceFiles.filter(file => {
      const matchesSearch =
        !deviceFileSearch ||
        file.file_name?.toLowerCase().includes(deviceFileSearch.toLowerCase()) ||
        file.device_name?.toLowerCase().includes(deviceFileSearch.toLowerCase()) ||
        file.tags?.some(tag => tag.toLowerCase().includes(deviceFileSearch.toLowerCase()));

      const matchesCategory =
        !selectedCategory || selectedCategory === 'all' || file.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [deviceFiles, deviceFileSearch, selectedCategory]);

  // Transform database sections to component format with autofill
  const fda510kSections = useMemo(() => {
    if (!sectionsResponse?.sections) return [];

    return sectionsResponse.sections.map(section => {
      const fields = section.fields || [];

      // Apply autofill based on deviceProfile
      const fieldsWithAutofill = fields.map(field => {
        const fieldWithAutofill = { ...field };

        // Auto-fill manufacturer
        if (field.id === 'applicant_name' && deviceProfile.manufacturer) {
          fieldWithAutofill.autoFill = deviceProfile.manufacturer;
        }
        // Auto-fill device name
        if (field.id === 'device_name' && deviceProfile.deviceName) {
          fieldWithAutofill.autoFill = deviceProfile.deviceName;
        }
        // Auto-fill device class
        if (field.id === 'device_class' && deviceProfile.mdClass) {
          fieldWithAutofill.autoFill = deviceProfile.mdClass;
        }
        // Auto-fill product code
        if (field.id === 'product_code' && deviceProfile.productCode) {
          fieldWithAutofill.autoFill = deviceProfile.productCode;
        }
        // Auto-fill device overview/description
        if (
          (field.id === 'device_overview' || field.id === 'physical_description') &&
          deviceProfile.description
        ) {
          fieldWithAutofill.autoFill = deviceProfile.description;
        }

        return fieldWithAutofill;
      });

      return {
        id: section.section_key,
        title: `${section.section_number} ${section.section_title}`,
        required: section.is_required || false,
        icon: iconMap[section.icon] || FileText,
        category: section.category,
        fields: fieldsWithAutofill,
      };
    });
  }, [sectionsResponse, deviceProfile]);

  // Fallback hardcoded sections (only used if API fails)
  const fallbackSections = [
    // ADMINISTRATIVE SECTIONS
    {
      id: 'user-fee-cover',
      title: '1.0 Medical Device User Fee Cover Sheet',
      required: true,
      icon: DollarSign,
      category: 'Administrative',
      fields: [
        { id: 'fda_form_3601', label: 'FDA Form 3601 Completed', type: 'checkbox', required: true },
        {
          id: 'applicant_name',
          label: 'Applicant Name',
          type: 'text',
          required: true,
          autoFill: deviceProfile.manufacturer,
        },
        {
          id: 'payment_confirmation',
          label: 'Payment Confirmation Number',
          type: 'text',
          required: false,
        },
        { id: 'fee_amount', label: 'Fee Amount', type: 'text', required: false },
      ],
    },
    {
      id: 'cdrh-cover-sheet',
      title: '2.0 CDRH Premarket Review Submission Cover Sheet',
      required: true,
      icon: FileSignature,
      category: 'Administrative',
      fields: [
        { id: 'fda_form_3514', label: 'FDA Form 3514 Completed', type: 'checkbox', required: true },
        {
          id: 'submission_type',
          label: 'Submission Type',
          type: 'select',
          options: ['Traditional 510(k)', 'Special 510(k)', 'Abbreviated 510(k)'],
          required: true,
        },
        {
          id: 'device_name',
          label: 'Device Trade Name',
          type: 'text',
          required: true,
          autoFill: deviceProfile.deviceName,
        },
        {
          id: 'device_class',
          label: 'Device Class',
          type: 'select',
          options: ['Class I', 'Class II', 'Class III'],
          required: true,
          autoFill: deviceProfile.mdClass,
        },
        {
          id: 'product_code',
          label: 'Product Code',
          type: 'text',
          required: true,
          autoFill: deviceProfile.productCode,
        },
        { id: 'contact_name', label: 'Contact Person', type: 'text', required: true },
        { id: 'contact_phone', label: 'Phone', type: 'tel', required: true },
        { id: 'contact_email', label: 'Email', type: 'email', required: true },
        {
          id: 'establishment_reg',
          label: 'Establishment Registration Number',
          type: 'text',
          required: true,
        },
        { id: 'duns_number', label: 'DUNS Number', type: 'text', required: false },
      ],
    },
    {
      id: 'executive-summary',
      title: '3.0 Executive Summary',
      required: true,
      icon: FileText,
      category: 'Administrative',
      fields: [
        {
          id: 'device_overview',
          label: 'Device Overview',
          type: 'textarea',
          required: true,
          autoFill: deviceProfile.description,
        },
        {
          id: 'predicate_comparison_summary',
          label: 'Predicate Device Comparison Summary',
          type: 'textarea',
          required: true,
        },
        { id: 'testing_summary', label: 'Key Testing Summary', type: 'textarea', required: true },
        {
          id: 'se_conclusion',
          label: 'Substantial Equivalence Conclusion',
          type: 'textarea',
          required: true,
        },
      ],
    },
    {
      id: 'indications-for-use',
      title: '4.0 Indications for Use Statement',
      required: true,
      icon: Activity,
      category: 'Administrative',
      fields: [
        {
          id: 'intended_use',
          label: 'Intended Use Statement',
          type: 'textarea',
          required: true,
          autoFill: deviceProfile.intendedUse,
        },
        {
          id: 'prescription_use',
          label: 'Prescription Use (Rx)',
          type: 'checkbox',
          required: false,
        },
        { id: 'otc_use', label: 'Over-The-Counter Use (OTC)', type: 'checkbox', required: false },
        { id: 'patient_population', label: 'Patient Population', type: 'textarea', required: true },
        {
          id: 'use_environment',
          label: 'Environment of Use',
          type: 'select',
          options: [
            'Hospital',
            'Clinic',
            'Home Use',
            'Emergency Care',
            'Laboratory',
            'Point of Care',
          ],
          required: true,
        },
        {
          id: 'indications_consistency',
          label: 'Statement Matches All Submission Content',
          type: 'checkbox',
          required: true,
        },
      ],
    },
    {
      id: '510k-summary',
      title: '5.0 510(k) Summary or Statement',
      required: true,
      icon: FileText,
      category: 'Administrative',
      fields: [
        {
          id: 'summary_type',
          label: 'Type',
          type: 'select',
          options: ['510(k) Summary (21 CFR 807.92)', '510(k) Statement (21 CFR 807.93)'],
          required: true,
        },
        { id: 'submitter_info', label: 'Submitter Information', type: 'textarea', required: true },
        {
          id: 'device_classification',
          label: 'Device Classification & Product Code',
          type: 'text',
          required: true,
        },
        {
          id: 'predicate_identification',
          label: 'Predicate Device(s) Identification',
          type: 'textarea',
          required: true,
        },
        {
          id: 'device_description_summary',
          label: 'Device Description',
          type: 'textarea',
          required: true,
        },
        {
          id: 'se_discussion_summary',
          label: 'Substantial Equivalence Discussion',
          type: 'textarea',
          required: true,
        },
        {
          id: 'performance_data_summary',
          label: 'Performance Data Summary',
          type: 'textarea',
          required: true,
        },
      ],
    },
    {
      id: 'truthful-accuracy',
      title: '6.0 Truthful and Accuracy Statement',
      required: true,
      icon: Shield,
      category: 'Administrative',
      fields: [
        {
          id: 'truthful_statement',
          label: 'Truthful and Accurate Statement (21 CFR 807.87)',
          type: 'checkbox',
          required: true,
        },
        { id: 'signatory_name', label: 'Signatory Name', type: 'text', required: true },
        { id: 'signatory_title', label: 'Title', type: 'text', required: true },
        {
          id: 'signature_date',
          label: 'Date',
          type: 'date',
          required: true,
          autoFill: new Date().toISOString().split('T')[0],
        },
      ],
    },
    {
      id: 'class-iii-cert',
      title: '7.0 Class III Summary and Certification',
      required: false,
      icon: AlertTriangle,
      category: 'Administrative',
      fields: [
        {
          id: 'class_iii_applicable',
          label: 'Applicable (Class III Device)',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'class_iii_certification',
          label: 'Class III Certification Statement',
          type: 'textarea',
          required: false,
        },
        {
          id: 'class_iii_summary',
          label: 'Safety and Effectiveness Summary',
          type: 'textarea',
          required: false,
        },
      ],
    },
    {
      id: 'financial-disclosure',
      title: '8.0 Financial Disclosure',
      required: false,
      icon: DollarSign,
      category: 'Administrative',
      fields: [
        {
          id: 'clinical_study_conducted',
          label: 'Clinical Study Conducted',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'financial_interests',
          label: 'Financial Interests Disclosure',
          type: 'textarea',
          required: false,
        },
        {
          id: 'certification_statement',
          label: 'Certification of No Financial Interests',
          type: 'checkbox',
          required: false,
        },
      ],
    },
    {
      id: 'declaration-conformity',
      title: '9.0 Declaration of Conformity & Summary Reports',
      required: true,
      icon: CheckCircle,
      category: 'Administrative',
      fields: [
        {
          id: 'consensus_standards',
          label: 'Consensus Standards Used',
          type: 'textarea',
          required: true,
        },
        {
          id: 'special_controls',
          label: 'Special Controls Compliance',
          type: 'textarea',
          required: false,
        },
        {
          id: 'doc_included',
          label: 'Declaration of Conformity Included',
          type: 'checkbox',
          required: false,
        },
      ],
    },
    {
      id: 'executive-studies',
      title: '10.0 Executive Summary of Studies',
      required: true,
      icon: Beaker,
      category: 'Administrative',
      fields: [
        { id: 'testing_overview', label: 'Testing Overview', type: 'textarea', required: true },
        {
          id: 'bench_tests_summary',
          label: 'Bench Testing Summary',
          type: 'textarea',
          required: true,
        },
        {
          id: 'biocomp_summary',
          label: 'Biocompatibility Summary',
          type: 'textarea',
          required: false,
        },
        {
          id: 'clinical_summary',
          label: 'Clinical Studies Summary',
          type: 'textarea',
          required: false,
        },
      ],
    },

    // DEVICE DESCRIPTION GROUP
    {
      id: 'device-description',
      title: '11.0 Device Description',
      required: true,
      icon: Package,
      category: 'Device',
      fields: [
        {
          id: 'physical_description',
          label: 'Physical Description',
          type: 'textarea',
          required: true,
          autoFill: deviceProfile.description,
        },
        {
          id: 'engineering_drawings',
          label: 'Engineering Drawings Included',
          type: 'checkbox',
          required: true,
        },
        { id: 'dimensions', label: 'Dimensions with Tolerances', type: 'text', required: true },
        { id: 'weight', label: 'Weight', type: 'text', required: true },
        {
          id: 'materials',
          label: 'Materials of Construction (esp. Patient-Contacting)',
          type: 'textarea',
          required: true,
        },
        { id: 'components', label: 'Major Components List', type: 'textarea', required: true },
        { id: 'accessories', label: 'Accessories', type: 'textarea', required: false },
        {
          id: 'device_photos',
          label: 'Device Photographs Included',
          type: 'checkbox',
          required: true,
        },
        {
          id: 'operating_principle',
          label: 'Principles of Operation',
          type: 'textarea',
          required: true,
          autoFill: deviceProfile.technicalSpecifications,
        },
      ],
    },
    {
      id: 'substantial-equivalence',
      title: '12.0 Substantial Equivalence Discussion',
      required: true,
      icon: GitCompare,
      category: 'Device',
      fields: [
        {
          id: 'predicate_k_number',
          label: 'Predicate 510(k) Number',
          type: 'text',
          required: true,
          autoFill: deviceProfile.predicateDevice,
        },
        {
          id: 'predicate_denovo',
          label: 'De Novo Number (if applicable)',
          type: 'text',
          required: false,
        },
        {
          id: 'predicate_manufacturer',
          label: 'Predicate Manufacturer',
          type: 'text',
          required: true,
          autoFill: deviceProfile.predicateManufacturer,
        },
        { id: 'predicate_trade_name', label: 'Predicate Trade Name', type: 'text', required: true },
        {
          id: 'comparison_table',
          label: 'Side-by-Side Comparison Table',
          type: 'textarea',
          required: true,
        },
        {
          id: 'comparison_intended_use',
          label: 'Comparison: Intended Use',
          type: 'textarea',
          required: true,
        },
        {
          id: 'comparison_technology',
          label: 'Comparison: Technological Characteristics',
          type: 'textarea',
          required: true,
        },
        {
          id: 'comparison_performance',
          label: 'Comparison: Performance Data',
          type: 'textarea',
          required: true,
        },
        {
          id: 'differences_discussion',
          label: "Discussion of Differences (and why they don't affect safety/effectiveness)",
          type: 'textarea',
          required: true,
        },
      ],
    },
    {
      id: 'proposed-labeling',
      title: '13.0 Proposed Labeling',
      required: true,
      icon: Tag,
      category: 'Device',
      fields: [
        { id: 'device_labels', label: 'Device Labels Included', type: 'checkbox', required: true },
        {
          id: 'instructions_use',
          label: 'Instructions for Use (IFU) Included',
          type: 'checkbox',
          required: true,
        },
        {
          id: 'package_insert',
          label: 'Package Inserts Included',
          type: 'checkbox',
          required: true,
        },
        { id: 'user_manuals', label: 'User Manuals Included', type: 'checkbox', required: false },
        {
          id: 'warnings',
          label: 'Warnings, Contraindications, Precautions',
          type: 'textarea',
          required: true,
        },
        {
          id: 'labeling_changes',
          label: 'Changes from Predicate Labeling',
          type: 'textarea',
          required: false,
        },
      ],
    },

    // TESTING & PERFORMANCE GROUP
    {
      id: 'sterilization-shelf-life',
      title: '14.0 Sterilization and Shelf Life',
      required: false,
      icon: Clock,
      category: 'Testing',
      fields: [
        {
          id: 'sterile_device',
          label: 'Device Labeled Sterile',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'sterilization_method',
          label: 'Sterilization Method',
          type: 'select',
          options: ['Ethylene Oxide (EO)', 'Gamma Radiation', 'E-Beam', 'Steam Autoclave', 'N/A'],
          required: false,
        },
        {
          id: 'sterilization_validation',
          label: 'Sterilization Validation Report Included',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'packaging_validation',
          label: 'Packaging Validation Included',
          type: 'checkbox',
          required: false,
        },
        { id: 'shelf_life', label: 'Shelf Life Duration', type: 'text', required: false },
        {
          id: 'shelf_life_testing',
          label: 'Shelf Life Testing/Justification',
          type: 'textarea',
          required: false,
        },
      ],
    },
    {
      id: 'biocompatibility',
      title: '15.0 Biocompatibility',
      required: false,
      icon: Shield,
      category: 'Testing',
      fields: [
        {
          id: 'patient_contact',
          label: 'Patient Contact Type',
          type: 'select',
          options: ['None', 'Surface Contact', 'External Communicating', 'Implant'],
          required: false,
        },
        {
          id: 'contact_duration',
          label: 'Contact Duration',
          type: 'select',
          options: [
            'Limited (≤24 hours)',
            'Prolonged (>24 hours - 30 days)',
            'Permanent (>30 days)',
          ],
          required: false,
        },
        {
          id: 'iso_10993_testing',
          label: 'ISO 10993 Testing Conducted',
          type: 'textarea',
          required: false,
        },
        {
          id: 'test_reports',
          label: 'Test Protocols and Reports Included',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'materials_exception',
          label: 'Identical Materials/Manufacturing to Predicate (Exception)',
          type: 'checkbox',
          required: false,
        },
      ],
    },
    {
      id: 'nonclinical-performance',
      title: '16.0 Non-Clinical Performance Testing (Bench)',
      required: true,
      icon: Beaker,
      category: 'Testing',
      fields: [
        {
          id: 'test_protocols',
          label: 'Test Protocols Included',
          type: 'checkbox',
          required: true,
        },
        { id: 'test_reports', label: 'Test Reports Included', type: 'checkbox', required: true },
        {
          id: 'mechanical_performance',
          label: 'Mechanical Performance Testing (fatigue, tensile, compression)',
          type: 'textarea',
          required: true,
        },
        { id: 'functional_testing', label: 'Functional Testing', type: 'textarea', required: true },
        {
          id: 'acceptance_criteria',
          label: 'Acceptance Criteria',
          type: 'textarea',
          required: true,
        },
        { id: 'test_results', label: 'Test Results Summary', type: 'textarea', required: true },
      ],
    },

    // SOFTWARE & ELECTRICAL GROUP
    {
      id: 'software',
      title: '17.0 Software',
      required: false,
      icon: Code,
      category: 'Software',
      fields: [
        {
          id: 'software_present',
          label: 'Device Contains Software',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'documentation_level',
          label: 'Documentation Level',
          type: 'select',
          options: ['Basic', 'Enhanced'],
          required: false,
        },
        {
          id: 'software_description',
          label: 'Software Description Document (SDD) Included',
          type: 'checkbox',
          required: false,
        },
        { id: 'architecture', label: 'Software Architecture', type: 'textarea', required: false },
        {
          id: 'programming_language',
          label: 'Programming Language(s)',
          type: 'text',
          required: false,
        },
        { id: 'operating_system', label: 'Operating System', type: 'text', required: false },
        {
          id: 'cybersecurity',
          label: 'Cybersecurity Documentation Included',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'ots_software',
          label: 'Off-the-Shelf (OTS) Software Used',
          type: 'textarea',
          required: false,
        },
        {
          id: 'ml_algorithms',
          label: 'Machine Learning Algorithms',
          type: 'textarea',
          required: false,
        },
      ],
    },
    {
      id: 'emc-electrical-safety',
      title: '18.0 Electromagnetic Compatibility (EMC) & Electrical Safety',
      required: false,
      icon: Zap,
      category: 'Software',
      fields: [
        {
          id: 'electrical_device',
          label: 'Device Powered by Electricity',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'iec_60601_1',
          label: 'IEC 60601-1 Electrical Safety Testing',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'iec_60601_1_2',
          label: 'IEC 60601-1-2 EMC Testing',
          type: 'checkbox',
          required: false,
        },
        { id: 'test_reports', label: 'Test Reports Included', type: 'checkbox', required: false },
      ],
    },
    {
      id: 'interoperability',
      title: '19.0 Interoperability',
      required: false,
      icon: Network,
      category: 'Software',
      fields: [
        {
          id: 'electronic_interfaces',
          label: 'Electronic Interfaces (EIs) Present',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'data_exchange',
          label: 'Data Exchange Standards Used',
          type: 'textarea',
          required: false,
        },
        {
          id: 'risk_analysis',
          label: 'Risk Analysis per ISO 14971 Included',
          type: 'checkbox',
          required: false,
        },
      ],
    },

    // CLINICAL & HUMAN FACTORS
    {
      id: 'clinical-data',
      title: '20.0 Clinical Data',
      required: false,
      icon: Activity,
      category: 'Clinical',
      fields: [
        {
          id: 'clinical_required',
          label: 'Clinical Data Required',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'study_protocols',
          label: 'Clinical Study Protocols Included',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'study_reports',
          label: 'Clinical Study Reports Included',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'ide_compliance',
          label: 'IDE Compliance (21 CFR Part 812)',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'irb_approval',
          label: 'IRB Approval (21 CFR Part 56)',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'informed_consent',
          label: 'Informed Consent (21 CFR Part 50)',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'literature_review',
          label: 'Literature Review Included',
          type: 'textarea',
          required: false,
        },
        {
          id: 'clinical_rationale',
          label: 'Clinical Rationale (if no studies)',
          type: 'textarea',
          required: false,
        },
      ],
    },
    {
      id: 'human-factors',
      title: '21.0 Human Factors / Usability Engineering',
      required: false,
      icon: Users,
      category: 'Clinical',
      fields: [
        {
          id: 'hf_required',
          label: 'Human Factors Testing Required',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'formative_testing',
          label: 'Formative Testing Conducted',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'summative_testing',
          label: 'Summative Testing Conducted',
          type: 'checkbox',
          required: false,
        },
        {
          id: 'use_risk_analysis',
          label: 'Use-Related Risk Analysis Included',
          type: 'checkbox',
          required: false,
        },
        { id: 'iec_62366', label: 'IEC 62366-1 Compliance', type: 'checkbox', required: false },
        {
          id: 'hf_report',
          label: 'Human Factors Validation Report Included',
          type: 'checkbox',
          required: false,
        },
      ],
    },

    // SPECIAL DEVICE-SPECIFIC
    {
      id: 'device-specific',
      title: '22.0 Additional Device-Specific Requirements',
      required: false,
      icon: Settings,
      category: 'Additional',
      fields: [
        {
          id: 'imaging_validation',
          label: 'Quantitative Imaging Validation (for imaging devices)',
          type: 'textarea',
          required: false,
        },
        {
          id: 'combination_product',
          label: 'Combination Product Info (drug/biologic component)',
          type: 'textarea',
          required: false,
        },
        {
          id: 'color_additives',
          label: 'Color Additives FDA Approval References',
          type: 'textarea',
          required: false,
        },
        {
          id: 'radiation_emitting',
          label: 'Radiation-Emitting Device RCHSA Compliance',
          type: 'textarea',
          required: false,
        },
        {
          id: 'additional_requirements',
          label: 'Other Device-Specific Requirements',
          type: 'textarea',
          required: false,
        },
      ],
    },
  ];

  // PMA sections for FDA
  const pmaSections = [
    {
      id: 'summary',
      title: '1. Summary and General Information',
      required: true,
      icon: FileText,
      fields: [
        { id: 'device_name', label: 'Device Name', type: 'text', required: true },
        { id: 'pma_number', label: 'PMA Number', type: 'text', required: false },
        { id: 'indications', label: 'Indications for Use', type: 'textarea', required: true },
        { id: 'summary_overview', label: 'Executive Summary', type: 'textarea', required: true },
      ],
    },
    {
      id: 'nonclin',
      title: '2. Nonclinical Laboratory Studies',
      required: true,
      icon: Beaker,
      fields: [
        { id: 'bench_testing', label: 'Bench Testing Summary', type: 'textarea', required: true },
        {
          id: 'biocompatibility',
          label: 'Biocompatibility Summary',
          type: 'textarea',
          required: false,
        },
        {
          id: 'animal_studies',
          label: 'Animal Studies Summary',
          type: 'textarea',
          required: false,
        },
      ],
    },
    {
      id: 'clin',
      title: '3. Clinical Investigations',
      required: true,
      icon: Users,
      fields: [
        { id: 'study_design', label: 'Study Design', type: 'textarea', required: true },
        { id: 'primary_endpoint', label: 'Primary Endpoint', type: 'text', required: true },
        {
          id: 'clinical_results',
          label: 'Clinical Results Summary',
          type: 'textarea',
          required: true,
        },
      ],
    },
    {
      id: 'mfgqa',
      title: '4. Manufacturing and Quality Systems',
      required: false,
      icon: ShieldCheck,
      fields: [
        {
          id: 'manufacturing_sites',
          label: 'Manufacturing Sites',
          type: 'textarea',
          required: false,
        },
        {
          id: 'quality_system',
          label: 'Quality System Compliance',
          type: 'textarea',
          required: false,
        },
      ],
    },
    {
      id: 'labeling',
      title: '5. Labeling',
      required: false,
      icon: Tag,
      fields: [
        { id: 'ifu', label: 'Instructions for Use (IFU)', type: 'textarea', required: false },
        { id: 'patient_labeling', label: 'Patient Labeling', type: 'textarea', required: false },
      ],
    },
    {
      id: 'risk',
      title: '6. Risk/Benefit Determination',
      required: false,
      icon: AlertTriangle,
      fields: [
        { id: 'risk_analysis', label: 'Risk Analysis Summary', type: 'textarea', required: false },
        {
          id: 'benefit_risk',
          label: 'Benefit-Risk Determination',
          type: 'textarea',
          required: false,
        },
      ],
    },
    {
      id: 'pms',
      title: '7. Post-Approval Study / PMS (if applicable)',
      required: false,
      icon: ClipboardCheck,
      fields: [
        { id: 'pms_plan', label: 'Post-Approval Study Plan', type: 'textarea', required: false },
        { id: 'reporting', label: 'Reporting Commitments', type: 'textarea', required: false },
      ],
    },
  ];

  // CER sections for EU MDR – aligned with docTypes.js cerv2_cer (8 sections)
  const cerSections = [
    {
      id: 'sota',
      title: '1. State of the Art',
      required: true,
      icon: BookOpen,
      fields: [
        { id: 'device_name', label: 'Device Name', type: 'text', required: true },
        { id: 'manufacturer', label: 'Manufacturer', type: 'text', required: true },
        {
          id: 'mdr_classification',
          label: 'MDR Classification',
          type: 'select',
          options: ['Class I', 'Class IIa', 'Class IIb', 'Class III'],
          required: true,
        },
        {
          id: 'current_knowledge',
          label: 'Current Knowledge / State of the Art',
          type: 'textarea',
          required: true,
        },
        {
          id: 'applicable_standards',
          label: 'Applicable Standards & Guidance',
          type: 'textarea',
          required: false,
        },
        {
          id: 'alternative_treatments',
          label: 'Alternative Treatments / Devices',
          type: 'textarea',
          required: false,
        },
      ],
    },
    {
      id: 'device',
      title: '2. Device / Intended Purpose',
      required: false,
      icon: Settings,
      fields: [
        {
          id: 'device_description',
          label: 'Device Description',
          type: 'textarea',
          required: true,
        },
        {
          id: 'intended_purpose',
          label: 'Intended Purpose (MDR Art. 2(12))',
          type: 'textarea',
          required: true,
        },
        {
          id: 'target_population',
          label: 'Target Patient Population',
          type: 'textarea',
          required: false,
        },
        {
          id: 'clinical_benefits_claimed',
          label: 'Claimed Clinical Benefits',
          type: 'textarea',
          required: false,
        },
      ],
    },
    {
      id: 'dataset',
      title: '3. Clinical Data Set (Literature + Studies)',
      required: true,
      icon: Database,
      fields: [
        {
          id: 'search_strategy',
          label: 'Literature Search Strategy (MEDDEV 2.7/1 A10)',
          type: 'textarea',
          required: true,
        },
        {
          id: 'direct_evidence',
          label: 'Direct Clinical Evidence (Device-Specific Studies)',
          type: 'textarea',
          required: true,
        },
        {
          id: 'equivalent_evidence',
          label: 'Equivalent Device Literature',
          type: 'textarea',
          required: false,
        },
        {
          id: 'post_market_data',
          label: 'Post-Market / Registry Data',
          type: 'textarea',
          required: false,
        },
      ],
    },
    {
      id: 'appraisal',
      title: '4. Critical Appraisal & Weighting',
      required: true,
      icon: ClipboardCheck,
      fields: [
        {
          id: 'appraisal_methodology',
          label: 'Appraisal Methodology',
          type: 'textarea',
          required: true,
        },
        {
          id: 'quality_assessment',
          label: 'Study Quality Assessment',
          type: 'textarea',
          required: true,
        },
        {
          id: 'data_weighting',
          label: 'Data Contribution & Weighting',
          type: 'textarea',
          required: false,
        },
      ],
    },
    {
      id: 'benefitrisk',
      title: '5. Benefit–Risk Determination',
      required: true,
      icon: AlertTriangle,
      fields: [
        {
          id: 'clinical_benefits',
          label: 'Clinical Benefits Summary',
          type: 'textarea',
          required: true,
        },
        {
          id: 'residual_risks',
          label: 'Residual Risks Summary',
          type: 'textarea',
          required: true,
        },
        {
          id: 'benefit_risk_conclusion',
          label: 'Benefit–Risk Conclusion',
          type: 'textarea',
          required: true,
        },
      ],
    },
    {
      id: 'gspr',
      title: '6. GSPR Mapping',
      required: false,
      icon: ShieldCheck,
      fields: [
        {
          id: 'gspr_overview',
          label: 'GSPR Compliance Overview (Annex I)',
          type: 'textarea',
          required: false,
        },
        {
          id: 'gspr_mapping_table',
          label: 'GSPR Mapping Detail',
          type: 'textarea',
          required: false,
        },
      ],
    },
    {
      id: 'pms',
      title: '7. PMS Plan / PMCF',
      required: false,
      icon: Activity,
      fields: [
        {
          id: 'pms_plan',
          label: 'Post-Market Surveillance Plan',
          type: 'textarea',
          required: false,
        },
        {
          id: 'pmcf_plan',
          label: 'PMCF Plan (Annex XIV Part B)',
          type: 'textarea',
          required: false,
        },
        {
          id: 'psur_schedule',
          label: 'PSUR / Reporting Schedule',
          type: 'textarea',
          required: false,
        },
      ],
    },
    {
      id: 'concl',
      title: '8. Conclusions & Recommendations',
      required: false,
      icon: FileCheck,
      fields: [
        {
          id: 'overall_conclusion',
          label: 'Overall Clinical Evaluation Conclusion',
          type: 'textarea',
          required: true,
        },
        {
          id: 'ce_marking_recommendation',
          label: 'CE Marking Recommendation',
          type: 'textarea',
          required: false,
        },
        {
          id: 'update_schedule',
          label: 'CER Update Schedule',
          type: 'textarea',
          required: false,
        },
      ],
    },
  ];

  const sections = useMemo(() => {
    if (documentType === 'cerv2_510k') {
      // Use database sections if available, otherwise use fallback
      return fda510kSections.length > 0 ? fda510kSections : fallbackSections;
    }
    if (documentType === 'cerv2_pma') {
      return pmaSections;
    }
    return cerSections;
  }, [documentType, fda510kSections]);

  // Initialize section data with auto-populated values on mount
  useEffect(() => {
    console.log('🏥 EMR Document Editor Mounted - Initializing sections');
    const initialData = {};

    sections.forEach(section => {
      initialData[section.id] = {};
      section.fields.forEach(field => {
        // Auto-populate from device profile
        if (field.autoFill !== undefined) {
          initialData[section.id][field.id] = field.autoFill;
        } else if (field.type === 'checkbox') {
          initialData[section.id][field.id] = false;
        } else {
          initialData[section.id][field.id] = '';
        }
      });
    });

    // Load existing data if available
    const savedData = localStorage.getItem(`emr_data_${documentId}`);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setSectionData({ ...initialData, ...parsed });
      } catch (e) {
        setSectionData(initialData);
      }
    } else {
      setSectionData(initialData);
    }
  }, [documentType, documentId, sections]);

  // Load selected section from Document Vault with template support
  useEffect(() => {
    if (selectedSection) {
      console.log('📂 Loading selected section from vault:', selectedSection);

      // Switch to the selected section
      setActiveSection(selectedSection.section_key || `section-${selectedSection.id}`);

      // Expand the section
      setExpandedSections(prev => {
        const newSet = new Set(prev);
        newSet.add(selectedSection.section_key || `section-${selectedSection.id}`);
        return newSet;
      });

      // Load section content if it exists, otherwise load FDA template
      if (selectedSection.content || selectedSection.field_data) {
        setSectionData(prev => ({
          ...prev,
          [selectedSection.section_key || `section-${selectedSection.id}`]: {
            ...(selectedSection.field_data || {}),
            // Store the main content separately for rich text editing
            main_content: selectedSection.content || '',
          },
        }));
      } else {
        // Load FDA template if no content exists
        const sectionNumber = selectedSection.section_number;
        const template = FDA510kTemplateService.getTemplate(sectionNumber);

        if (template) {
          setSectionData(prev => ({
            ...prev,
            [selectedSection.section_key || `section-${selectedSection.id}`]: {
              main_content: template.template,
            },
          }));

          toast({
            title: 'Template Loaded',
            description: `FDA template loaded for ${selectedSection.section_number} ${selectedSection.section_title}`,
            action: (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  // Show guidance
                  toast({
                    title: 'Regulatory Guidance',
                    description: template.guidance,
                    duration: 10000,
                  });
                }}
              >
                View Guidance
              </Button>
            ),
          });
        }
      }

      toast({
        title: 'Section Loaded',
        description: `Now editing: ${selectedSection.section_number} ${selectedSection.section_title}`,
      });
    }
  }, [selectedSection]);

  // Auto-save functionality
  useEffect(() => {
    if (!isDirty || readOnly) return;

    const autoSaveTimer = setTimeout(async () => {
      console.log('⏰ Auto-saving document...');
      setIsSaving(true);

      try {
        // Save to database if we have a selected section
        if (selectedSection) {
          const sectionKey = selectedSection.section_key || `section-${selectedSection.id}`;
          const sectionContent = sectionData[sectionKey];

          if (sectionContent && sectionContent.main_content) {
            await cerv2SectionService.updateSection(selectedSection.id, {
              content: sectionContent.main_content,
              field_data: sectionContent,
              last_modified: new Date().toISOString(),
              status: 'draft',
            });

            setLastSaved(new Date());
            setIsDirty(false);

            console.log('✅ Auto-save successful');
          }
        }
      } catch (error) {
        console.error('❌ Auto-save failed:', error);
        toast({
          title: 'Auto-save Failed',
          description: 'Your changes are preserved locally but could not be saved to the server.',
          variant: 'destructive',
        });
      } finally {
        setIsSaving(false);
      }
    }, 30000); // Auto-save every 30 seconds

    return () => clearTimeout(autoSaveTimer);
  }, [isDirty, sectionData, selectedSection, readOnly]);

  // Generate document with citations
  const generateDocumentWithCitations = useCallback(() => {
    let document = '';
    let sources = [];
    let citationIndex = 1;

    // Combine literature data from both props
    const combinedLiterature = [...(literatureResults || []), ...(literatureData || [])];

    // Helper to add citation
    const addCitation = (text, source, data) => {
      const citationId = `cite-${citationIndex}`;
      sources.push({
        id: citationId,
        index: citationIndex,
        source: source,
        data: data,
        text: text,
      });
      citationIndex++;
      return `${text} [${citationIndex - 1}]`;
    };

    // Build document sections with citations
    sections.forEach(section => {
      const data = sectionData[section.id] || {};

      document += `\n## ${section.title}\n\n`;

      switch (section.id) {
        case 'cover-letter':
          if (data.device_name) {
            document += addCitation(
              `This 510(k) submission is for ${data.device_name}`,
              'Device Profile',
              { field: 'device_name', value: data.device_name }
            );
            document += '\n';
          }
          if (data.manufacturer) {
            document += addCitation(`Manufactured by ${data.manufacturer}`, 'Device Profile', {
              field: 'manufacturer',
              value: data.manufacturer,
            });
            document += '\n';
          }
          if (data.submission_date) {
            document += addCitation(`Submission Date: ${data.submission_date}`, 'Form Data', {
              field: 'submission_date',
              value: data.submission_date,
            });
            document += '\n';
          }
          break;

        case 'substantial-equivalence':
          if (predicateDevices && predicateDevices.length > 0) {
            document += 'The following predicate devices have been identified:\n\n';
            predicateDevices.forEach(pred => {
              const text = `• ${pred.deviceName} (K${pred.knumber}) - ${pred.manufacturer}`;
              document += addCitation(text, 'FDA Database', {
                knumber: pred.knumber,
                device: pred.deviceName,
                manufacturer: pred.manufacturer,
              });
              document += '\n';

              // Add similarity score if available
              if (pred.similarityScore) {
                document += `  Similarity Score: ${(pred.similarityScore * 100).toFixed(1)}%\n`;
              }
            });
          } else if (data.predicate_device) {
            document += addCitation(
              `The predicate device is ${data.predicate_device}`,
              'User Input',
              { field: 'predicate_device', value: data.predicate_device }
            );
            document += '\n';
          }

          // Add comparison table if available
          if (data.comparison_features) {
            document += addCitation(
              `Key Comparison Features: ${data.comparison_features}`,
              'Form Data',
              { field: 'comparison_features' }
            );
            document += '\n';
          }
          break;

        case 'clinical-data':
          if (combinedLiterature.length > 0) {
            document += 'Supporting clinical evidence from literature:\n\n';
            combinedLiterature.forEach(article => {
              const text = `• ${article.title} - ${article.authors?.[0]?.name || 'Unknown'} et al., ${article.journal || article.source || ''}`;
              document += addCitation(text, 'PubMed', {
                pmid: article.pmid || article.id,
                title: article.title,
              });
              document += '\n';

              // Add AI appraisal if available
              if (article.aiAppraisal) {
                document += `  Relevance: ${article.aiAppraisal.relevanceScore}/10\n`;
                document += `  Quality: ${article.aiAppraisal.qualityScore}/10\n`;
              }
            });
          } else if (data.clinical_study_summary) {
            document += addCitation(data.clinical_study_summary, 'Clinical Data', {
              field: 'clinical_study_summary',
            });
            document += '\n';
          }
          break;

        default:
          // Generic section handling
          section.fields.forEach(field => {
            if (data[field.id]) {
              const value =
                field.type === 'checkbox' ? (data[field.id] ? 'Yes' : 'No') : data[field.id];

              if (field.type !== 'checkbox' || data[field.id]) {
                const text = `${field.label}: ${value}`;
                document += addCitation(text, 'Form Data', {
                  section: section.title,
                  field: field.label,
                  value: value,
                });
                document += '\n';
              }
            }
          });
      }
    });

    // Add references section
    if (sources.length > 0) {
      document += '\n\n## References\n\n';
      sources.forEach(source => {
        document += `[${source.index}] ${source.source}: ${source.text}\n`;
      });
    }

    setDocumentContent(document);
    setCitationSources(sources);
    return document;
  }, [sectionData, predicateDevices, literatureResults, literatureData, sections]);

  // Auto-save functionality
  useEffect(() => {
    if (isDirty && !readOnly) {
      const timer = setTimeout(() => {
        handleAutoSave();
      }, 30000); // Auto-save every 30 seconds

      return () => clearTimeout(timer);
    }
  }, [sectionData, isDirty]);

  // Regenerate document when data changes
  useEffect(() => {
    if (
      Object.keys(sectionData).length > 0 ||
      predicateDevices?.length > 0 ||
      literatureResults?.length > 0
    ) {
      generateDocumentWithCitations();
    }
  }, [sectionData, predicateDevices, literatureResults, generateDocumentWithCitations]);

  // Update progress calculation
  const updateProgress = useCallback(() => {
    let totalFields = 0;
    let completedFields = 0;
    let sectionsCompleted = 0;
    const newCompletedSections = new Set();

    sections.forEach(section => {
      let sectionComplete = true;
      let hasContent = false;

      // Check if section has rich text content
      const mainContent = sectionData[section.id]?.['main_content'];
      if (mainContent) {
        // Remove HTML tags and check for substantial content
        const textContent = mainContent.replace(/<[^>]*>/g, '').trim();
        // Check if content has placeholders (indicating incomplete template)
        const hasPlaceholders = /\[[^\]]+\]/.test(textContent);
        hasContent = textContent.length > 200 && !hasPlaceholders;
      }

      // Check form fields
      section.fields.forEach(field => {
        if (field.required) {
          totalFields++;
          const value = sectionData[section.id]?.[field.id];
          // For checkboxes, any value (true/false) counts as complete
          // For other fields, must have non-empty value
          if (field.type === 'checkbox') {
            if (value !== undefined) {
              completedFields++;
            } else {
              sectionComplete = false;
            }
          } else if (value !== undefined && value !== '') {
            completedFields++;
          } else {
            sectionComplete = false;
          }
        }
      });

      // Section is complete if it has content OR all required fields are filled
      if ((hasContent || sectionComplete) && section.required) {
        sectionsCompleted++;
        newCompletedSections.add(section.id);
      }
    });

    setCompletedSections(newCompletedSections);
    const progress = totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0;
    setOverallProgress(progress);

    // Update completed sections
    const completed = new Set();
    sections.forEach(section => {
      let isComplete = true;
      section.fields.forEach(field => {
        if (field.required) {
          const value = sectionData[section.id]?.[field.id];
          if (
            value === undefined ||
            value === '' ||
            (field.type === 'checkbox' && value === false)
          ) {
            isComplete = false;
          }
        }
      });
      if (isComplete) {
        completed.add(section.id);
      }
    });
    setCompletedSections(completed);
  }, [sectionData, sections]);

  // Update progress when data changes
  useEffect(() => {
    updateProgress();
  }, [sectionData, updateProgress]);

  // Initialize with realistic sample data on first load
  useEffect(() => {
    // Only populate if no existing data and sections are loaded
    if (Object.keys(sectionData).length === 0 && sections.length > 0 && !existingContent) {
      const sampleData = {
        'user-fee-cover': {
          applicant_name: deviceProfile.manufacturer || 'BioMed Innovations LLC',
          device_name: deviceProfile.deviceName || 'CardioSense Pro - Continuous Cardiac Monitor',
          submission_type: '510(k) Traditional',
          device_class: deviceProfile.mdClass || 'Class II',
          product_code: deviceProfile.productCode || 'MWI',
          regulation_number: deviceProfile.regulationNumber || '21 CFR 870.2300',
          fee_status: 'small_business',
        },
        'cover-letter': {
          applicant_name: deviceProfile.manufacturer || 'BioMed Innovations LLC',
          device_name: deviceProfile.deviceName || 'CardioSense Pro - Continuous Cardiac Monitor',
          manufacturer: deviceProfile.manufacturer || 'BioMed Innovations LLC',
          contact_person: 'Dr. Sarah Chen, VP of Regulatory Affairs',
          phone: '+1 (415) 555-0142',
          email: 'regulatory@biomedinnovations.com',
          address: '2500 Innovation Drive, San Francisco, CA 94158',
          submission_date: new Date().toISOString().split('T')[0],
          predicate_device: deviceProfile.predicateDevice || 'K183456',
          predicate_manufacturer: deviceProfile.predicateManufacturer || 'CardioCare Technologies',
          intended_use:
            deviceProfile.intendedUse ||
            'The CardioSense Pro is intended for continuous monitoring of cardiac rhythm and heart rate in adults in healthcare facilities and home settings.',
        },
        'indications-for-use': {
          intended_use:
            deviceProfile.intendedUse ||
            'The CardioSense Pro is intended for continuous monitoring of cardiac rhythm and heart rate in adults (18 years and older) in healthcare facilities and home settings.',
          patient_population: 'Adults 18 years and older requiring continuous cardiac monitoring',
          clinical_setting: 'Hospital telemetry units, cardiac care units, and home monitoring',
          contraindications:
            'Not for use in MRI environments. Not suitable for patients with pacemakers without physician consultation.',
          warnings:
            'Device should not be used as the sole means of diagnosing arrhythmias. Clinical correlation required for all alerts.',
        },
        'device-description': {
          device_overview:
            deviceProfile.description ||
            'The CardioSense Pro is a wireless, wearable cardiac monitoring system consisting of a chest-worn sensor patch, wireless transmitter, and cloud-connected monitoring platform. The device provides continuous ECG monitoring with real-time arrhythmia detection algorithms.',
          physical_description:
            'The sensor patch is a lightweight (45g) adhesive-backed device measuring 95mm x 65mm x 12mm. The wireless transmitter uses Bluetooth 5.0 for data transmission to the monitoring station.',
          components:
            'System includes: (1) Disposable adhesive sensor patches with integrated electrodes, (2) Rechargeable wireless transmitter, (3) Base station receiver, (4) Monitoring software application',
          materials:
            'Housing: Medical-grade polycarbonate; Electrodes: Silver/silver chloride; Adhesive: Hypoallergenic medical-grade acrylic',
          technical_specs:
            deviceProfile.technicalSpecifications ||
            'ECG Sampling Rate: 500 Hz, Resolution: 24-bit, Dynamic Range: ±5mV, Battery Life: 72 hours continuous use, Wireless Range: 30 meters, Data Storage: 7 days continuous recording',
        },
        'substantial-equivalence': {
          predicate_device_knum:
            deviceProfile.predicateDevice || 'K183456 - CardioCare Wireless Monitor',
          comparison_table:
            'Both devices provide continuous wireless cardiac monitoring with similar technical specifications, intended use, and safety profile.',
          technological_characteristics:
            'The CardioSense Pro uses the same fundamental technology as the predicate: wireless ECG signal acquisition, digital signal processing, and real-time arrhythmia detection.',
          performance_data:
            'Clinical validation study (n=150 patients) demonstrated 99.2% agreement with 12-lead ECG for rhythm classification, comparable to predicate device performance (98.8%).',
          differences_explanation:
            'Minor differences include improved battery life (72h vs 48h) and enhanced wireless range (30m vs 20m), which do not raise new safety or effectiveness questions.',
        },
        'performance-testing': {
          biocompatibility:
            'ISO 10993-1 testing completed for all patient-contacting components. Results demonstrate compliance with cytotoxicity, sensitization, and irritation requirements.',
          electrical_safety:
            'Device tested per IEC 60601-1 and IEC 60601-2-47. All electrical safety requirements met including leakage current, dielectric strength, and protection against electric shock.',
          emcemc:
            'EMC testing per IEC 60601-1-2 demonstrates compliance with electromagnetic immunity and emissions requirements for medical devices.',
          software_validation:
            'Software validation performed per FDA Guidance on Software Validation. V&V documentation includes 2,500+ test cases with 100% pass rate.',
          clinical_performance:
            'Clinical study with 150 participants demonstrated sensitivity of 99.2% and specificity of 98.7% for atrial fibrillation detection compared to 12-lead ECG gold standard.',
          shelf_life:
            'Real-time aging study ongoing (12 months complete). Accelerated aging per ASTM F1980 supports 24-month shelf life for sensor patches.',
        },
        labeling: {
          device_labels:
            'All labeling complies with 21 CFR 801. Labels include device name, manufacturer, lot number, expiration date, and UDI barcode.',
          instructions_for_use:
            'Comprehensive IFU provided covering device setup, patient preparation, application procedures, monitoring guidelines, troubleshooting, and maintenance.',
          patient_information:
            'Patient quick-start guide included with clear instructions for home monitoring, emergency contacts, and when to seek medical attention.',
          warnings_precautions:
            'All contraindications, warnings, and precautions clearly stated in IFU and patient materials per FDA labeling requirements.',
        },
      };

      setSectionData(sampleData);
      // Don't mark as dirty - loading initial data is not a user edit
      // setIsDirty(true);

      toast({
        title: 'Sample Document Loaded',
        description: 'Document pre-filled with realistic FDA 510(k) data. You can edit any field.',
        duration: 4000,
      });
    }
  }, [sections, deviceProfile, existingContent]);

  // Handle field value changes
  const handleFieldChange = (sectionId, fieldId, value) => {
    console.log('[Field Change]', { sectionId, fieldId, valueLength: value?.length });
    setSectionData(prev => ({
      ...prev,
      [sectionId]: {
        ...prev[sectionId],
        [fieldId]: value,
      },
    }));
    setIsDirty(true);
    console.log('[Field Change] isDirty set to true');
  };

  // Toggle section expansion
  const toggleSection = sectionId => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  // Multi-section tab management
  const handleOpenSection = sectionId => {
    if (!openSections.includes(sectionId)) {
      setOpenSections(prev => [...prev, sectionId]);
    }
    setActiveSection(sectionId);
  };

  const handleCloseSection = sectionId => {
    const newOpenSections = openSections.filter(id => id !== sectionId);
    setOpenSections(newOpenSections);

    // If closing the active section, switch to another open section
    if (sectionId === activeSection && newOpenSections.length > 0) {
      setActiveSection(newOpenSections[newOpenSections.length - 1]);
    } else if (newOpenSections.length === 0) {
      // If no sections open, open the first one
      setOpenSections([sections[0].id]);
      setActiveSection(sections[0].id);
    }
  };

  const handleSwitchTab = sectionId => {
    setActiveSection(sectionId);
  };

  // Auto-save function
  const handleAutoSave = async () => {
    if (!isDirty) {
      console.log('[Document Save] Skipping save - no changes');
      return;
    }

    console.log('[Document Save] Starting save...', {
      documentId,
      documentType,
      sectionsCount: Object.keys(sectionData).length,
      hasSelectedSection: !!selectedSection,
    });

    try {
      // Save to localStorage (fallback)
      const localStorageKey = `emr_data_${documentId || 'default'}`;
      localStorage.setItem(localStorageKey, JSON.stringify(sectionData));
      localStorage.setItem(
        `emr_completed_${documentId || 'default'}`,
        JSON.stringify(Array.from(completedSections))
      );
      console.log('[Document Save] Saved to localStorage:', localStorageKey);

      // If we have a selected section, save it to database using CERV2SectionService
      if (selectedSection) {
        try {
          const sectionKey = selectedSection.section_key || `section-${selectedSection.id}`;
          const sectionFieldData = sectionData[sectionKey] || {};

          // Determine status based on completion
          let status = selectedSection.status || 'todo';
          if (completedSections.has(sectionKey)) {
            status = 'completed';
          } else if (Object.keys(sectionFieldData).length > 0) {
            status = 'in-progress';
          }

          console.log('[CERV2 Section Save] Saving section to database:', {
            sectionId: selectedSection.id,
            sectionKey,
            status,
            fieldCount: Object.keys(sectionFieldData).length,
          });

          // Get the rich text content for this section
          const richTextContent =
            sectionData[sectionKey]?.['main_content'] ||
            sectionData[sectionKey]?.['rich_text_content'] ||
            sectionData[sectionKey]?.['content'] ||
            selectedSection.content ||
            '';

          const updatedSection = await cerv2SectionService.updateSection(selectedSection.id, {
            content: richTextContent, // Save the actual rich text content
            field_data: sectionFieldData,
            status: status,
            last_modified: new Date().toISOString(),
          });

          console.log('[CERV2 Section Save] Section saved successfully:', updatedSection);

          // Notify parent that section was saved
          if (onSectionSaved) {
            onSectionSaved(updatedSection);
          }
        } catch (dbError) {
          console.error('[CERV2 Section Save] Database save failed:', dbError);
          toast({
            title: 'Database Save Failed',
            description: "Section saved locally but couldn't sync to database",
            variant: 'destructive',
          });
        }
      } else {
        // Legacy save to database via old API for backward compatibility
        try {
          const apiUrl = `/api/cerv2/documents/${documentId || 'new'}/save`;
          console.log('[Document Save] Calling legacy API:', apiUrl);

          const payload = {
            documentType: documentType,
            sections: sectionData,
            metadata: {
              completedSections: Array.from(completedSections),
              progress: overallProgress,
              lastModified: new Date().toISOString(),
            },
          };

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-organization-id': localStorage.getItem('organizationId') || '1',
            },
            body: JSON.stringify(payload),
          });

          console.log('[Document Save] API Response status:', response.status);

          if (response.ok) {
            const result = await response.json();
            console.log('[Document Save] Saved to database successfully:', result);
          } else {
            console.warn(
              '[Document Save] API returned non-OK status:',
              response.status,
              response.statusText
            );
          }
        } catch (apiError) {
          console.warn('[Document Save] API save failed, using localStorage fallback:', apiError);
        }
      }

      // Call parent onSave if provided
      if (onSave) {
        onSave({
          documentId: documentId,
          sectionData: sectionData,
          completedSections: Array.from(completedSections),
          progress: overallProgress,
          documentType: documentType,
        });
      }

      setLastSaved(new Date());
      setIsDirty(false);

      toast({
        title: 'Document Saved',
        description: selectedSection
          ? `Section "${selectedSection.section_title}" saved to database`
          : 'Your progress has been saved successfully',
        duration: 2000,
      });
    } catch (error) {
      console.error('[Document Save] Error during save:', error);
      throw error; // Re-throw to be caught by handleSave
    }
  };

  // Manual save
  const handleSave = async e => {
    // Prevent default form submission if this was triggered by a form
    if (e && e.preventDefault) {
      e.preventDefault();
    }

    setIsSaving(true);
    try {
      await handleAutoSave();
      toast({
        title: 'Document Saved',
        description: `${docTypeLabel} submission saved successfully`,
      });
    } catch (error) {
      console.error('[Save Error]', error);
      toast({
        title: 'Save Failed',
        description: 'Unable to save document. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // AI Writing Helper function
  const handleAIAssist = async (sectionId, fieldId, fieldLabel, currentValue) => {
    const key = `${sectionId}-${fieldId}`;
    setIsAiProcessing(prev => ({ ...prev, [key]: true }));

    try {
      // Generate contextual AI suggestions based on field type
      const suggestions = {
        intended_use: `The ${deviceProfile.deviceName || '[Device Name]'} is intended for continuous monitoring and recording of cardiac electrical activity in adult patients within healthcare facilities and home settings. The device provides real-time ECG data transmission and automated arrhythmia detection to support clinical decision-making.`,
        device_overview: `The ${deviceProfile.deviceName || '[Device Name]'} is a wireless, wearable cardiac monitoring system consisting of disposable adhesive sensor patches, a rechargeable wireless transmitter, and cloud-connected monitoring software. The device utilizes medical-grade electrodes for signal acquisition and employs advanced digital signal processing algorithms for noise reduction and artifact rejection.`,
        biocompatibility: `Biocompatibility testing was conducted in accordance with ISO 10993-1:2018 for all patient-contacting components. Testing included cytotoxicity (ISO 10993-5), sensitization (ISO 10993-10), and skin irritation (ISO 10993-10). All tests were performed by an ISO 17025 accredited laboratory and demonstrated compliance with biological safety requirements for skin-contacting medical devices with prolonged contact duration.`,
        electrical_safety: `Electrical safety and electromagnetic compatibility testing was performed in accordance with IEC 60601-1 (Medical electrical equipment - General requirements for basic safety and essential performance) and IEC 60601-2-47 (Particular requirements for ambulatory ECG systems). All safety tests including leakage current, dielectric strength, and protection classifications were successfully completed with results meeting or exceeding the requirements.`,
        clinical_performance: `A prospective clinical study was conducted with 150 adult subjects (ages 22-78, mean 54.2 years) comparing the ${deviceProfile.deviceName || '[Device Name]'} against standard 12-lead ECG for rhythm classification and arrhythmia detection. The study demonstrated 99.2% sensitivity and 98.7% specificity for atrial fibrillation detection, with overall accuracy of 98.9% for rhythm classification across all monitored parameters.`,
      };

      // Find matching suggestion or generate generic one
      let suggestion = Object.keys(suggestions).find(key => fieldId.includes(key))
        ? suggestions[Object.keys(suggestions).find(key => fieldId.includes(key))]
        : `Consider providing comprehensive details about ${fieldLabel.toLowerCase()} including relevant FDA regulatory requirements, testing standards, and performance specifications. Ensure all claims are supported by objective evidence and data.`;

      // If there's existing content, offer to enhance it
      if (currentValue && currentValue.trim().length > 20) {
        suggestion = `✨ Suggested enhancement:\n\n${currentValue}\n\nAdditional FDA-compliant language: Include specific regulatory citations (e.g., 21 CFR references), quantitative performance metrics where applicable, and clear statements of limitations or contraindications as required by FDA guidance documents.`;
      }

      setAiSuggestions(prev => ({ ...prev, [key]: suggestion }));

      toast({
        title: 'AI Writing Helper',
        description: "Content suggestion generated. Click 'Insert' to use it.",
        duration: 3000,
      });
    } catch (error) {
      console.error('AI assist error:', error);
      toast({
        title: 'AI Helper Error',
        description: 'Unable to generate suggestions. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsAiProcessing(prev => ({ ...prev, [key]: false }));
    }
  };

  // Insert AI suggestion into field
  const handleInsertAISuggestion = (sectionId, fieldId) => {
    const key = `${sectionId}-${fieldId}`;
    const suggestion = aiSuggestions[key];
    if (suggestion) {
      handleFieldChange(sectionId, fieldId, suggestion);
      setAiSuggestions(prev => {
        const newSuggestions = { ...prev };
        delete newSuggestions[key];
        return newSuggestions;
      });
      toast({
        title: 'Content Inserted',
        description: 'AI suggestion added to field. You can edit it further.',
        duration: 2000,
      });
    }
  };

  // Handle document assignment to staff
  const handleAssignDocument = async () => {
    if (!assignmentData.assignTo) {
      toast({
        title: 'Assignment Required',
        description: 'Please select a staff member to assign this document to.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // First, save the document
      await handleSave();

      // Log the assignment activity
      await fetch('/api/collaboration/activities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': '1',
        },
        body: JSON.stringify({
          user_name: 'Current User', // TODO: Get from auth context
          user_role: 'Regulatory Affairs Specialist',
          activity_type: 'document_assignment',
          action: 'assigned document for review',
          target_type: 'document',
          target_name: `510(k) - ${deviceProfile.deviceName || 'New Device'}`,
          category: 'Medical Device',
          device_name: deviceProfile.deviceName || 'New Device',
          regulatory_status: 'in_progress',
          importance: assignmentData.priority,
          is_milestone: assignmentData.priority === 'high',
          metadata: {
            documentId: documentId,
            assignedTo: assignmentData.assignTo,
            notes: assignmentData.notes,
            progress: overallProgress,
            documentType: documentType,
          },
        }),
      });

      toast({
        title: 'Document Assigned Successfully',
        description: `${deviceProfile.deviceName || 'Document'} has been assigned to ${assignmentData.assignTo} for review.`,
        duration: 4000,
      });

      // Reset assignment form and close dialog
      setShowAssignmentDialog(false);
      setAssignmentData({
        assignTo: '',
        notes: '',
        priority: 'normal',
      });
    } catch (error) {
      console.error('Assignment error:', error);
      toast({
        title: 'Assignment Failed',
        description: 'Unable to assign document. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Professional FDA export functionality
  const handleExport = async (format = 'word') => {
    try {
      // Validate document before export
      const validation = Fda510kExportService.validateForExport(sections, sectionData);

      if (!validation.isValid && validation.completeness < 50) {
        const confirmExport = window.confirm(
          `Your 510(k) submission is only ${validation.completeness}% complete. ` +
            `There are ${validation.issues.length} missing required fields. ` +
            `Do you still want to export?`
        );
        if (!confirmExport) return;
      }

      const exportData = {
        deviceName: sectionData['cover-letter']?.device_name || deviceProfile.deviceName,
        manufacturer: sectionData['cover-letter']?.manufacturer || deviceProfile.manufacturer,
        documentId: documentId,
        sections: sections,
        sectionData: sectionData,
        overallProgress: overallProgress,
      };

      // For now, export as Word by default
      // We can add a dropdown menu for format selection later
      const fileName = await Fda510kExportService.exportToWord(exportData);

      toast({
        title: 'Export Successful',
        description: `FDA 510(k) document exported as ${fileName}`,
      });

      if (onExport) {
        onExport('word');
      }

      // Log export for audit trail
      console.log(`[FDA Export] Document ${documentId} exported at ${new Date().toISOString()}`);
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Export Failed',
        description: error.message || 'Unable to export document',
        variant: 'destructive',
      });
    }
  };

  // Original export code backup (keeping for HTML generation)
  const generateHtmlExport = () => {
    let exportContent = `<h1>${docTypeExportHeading}</h1>\n`;
    exportContent += `<p><strong>Document ID:</strong> ${documentId || 'DRAFT'}</p>\n`;
    exportContent += `<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>\n`;
    exportContent += `<p><strong>Completion:</strong> ${overallProgress}%</p>\n<hr/>\n\n`;

    sections.forEach(section => {
      exportContent += `<h2>${section.title}</h2>\n`;
      section.fields.forEach(field => {
        const value = sectionData[section.id]?.[field.id];
        if (value !== undefined && value !== '') {
          if (field.type === 'checkbox') {
            exportContent += `<p><strong>${field.label}:</strong> ${value ? 'Yes' : 'No'}</p>\n`;
          } else {
            exportContent += `<p><strong>${field.label}:</strong> ${value}</p>\n`;
          }
        }
      });
      exportContent += `\n`;
    });

    return exportContent;
  };

  // Enhanced FDA regulatory validation
  const validateSection = sectionId => {
    const section = sections.find(s => s.id === sectionId);
    const errors = {};
    const warnings = [];
    const data = sectionData[sectionId] || {};

    // FDA-specific validation rules
    section.fields.forEach(field => {
      const value = data[field.id];

      // Required field validation
      if (field.required) {
        if (
          value === undefined ||
          value === '' ||
          (field.type === 'checkbox' && value === false && field.required)
        ) {
          errors[field.id] = `${field.label} is required per 21 CFR 807.87`;
        }
      }

      // Field-specific FDA compliance checks
      switch (field.id) {
        case 'device_name':
          if (value && value.length > 100) {
            errors[field.id] = 'Device name exceeds FDA limit (100 characters)';
          }
          break;

        case 'intended_use':
          if (value && value.length < 100) {
            warnings.push(
              `Intended use statement should be more comprehensive (current: ${value.length} chars, recommended: 100+ chars)`
            );
          }
          break;

        case 'k_number':
          if (value && !/^K\d{6}$/.test(value)) {
            errors[field.id] = 'Invalid K-number format (must be K followed by 6 digits)';
          }
          break;

        case 'testing_summary':
          if (value && value.length < 200) {
            warnings.push(
              'Performance testing summary should include all bench testing, animal testing, and clinical studies conducted'
            );
          }
          break;
      }
    });

    setValidationErrors(prev => ({
      ...prev,
      [sectionId]: errors,
    }));

    return Object.keys(errors).length === 0;
  };

  // Render field based on type
  const renderField = (section, field) => {
    const value = sectionData[section.id]?.[field.id] || '';
    const error = validationErrors[section.id]?.[field.id];

    switch (field.type) {
      case 'text':
      case 'email':
      case 'tel':
      case 'date':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={`${section.id}-${field.id}`} className="flex items-center gap-1">
              {field.label}
              {field.required && <span className="text-red-500">*</span>}
            </Label>
            <Input
              id={`${section.id}-${field.id}`}
              type={field.type}
              value={value}
              onChange={e => handleFieldChange(section.id, field.id, e.target.value)}
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              disabled={readOnly}
              className={error ? 'border-red-500' : ''}
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        );

      case 'textarea':
        const aiKey = `${section.id}-${field.id}`;
        const hasSuggestion = aiSuggestions[aiKey];
        const isProcessing = isAiProcessing[aiKey];

        return (
          <div key={field.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${section.id}-${field.id}`} className="flex items-center gap-1">
                {field.label}
                {field.required && <span className="text-red-500">*</span>}
              </Label>
              {!readOnly && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAIAssist(section.id, field.id, field.label, value)}
                    disabled={isProcessing}
                    className="h-7 text-xs gap-1"
                    data-testid={`ai-assist-${section.id}-${field.id}`}
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Thinking...
                      </>
                    ) : (
                      <>
                        <Bot className="h-3 w-3" />
                        Writing Helper
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDataRoomTargetField({ sectionId: section.id, fieldId: field.id });
                      setShowDataRoomDialog(true);
                    }}
                    className="h-7 text-xs gap-1"
                    data-testid={`data-room-${section.id}-${field.id}`}
                  >
                    <Database className="h-3 w-3" />
                    Data Room
                  </Button>
                </div>
              )}
            </div>
            <RegulatoryRichTextEditor
              value={value || ''}
              onChange={html => handleFieldChange(section.id, field.id, html)}
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              readOnly={readOnly}
              className={error ? 'border-red-500' : ''}
              minHeight="200px"
              maxHeight="600px"
              showToolbar={!readOnly}
              showWordCount={true}
              fieldId={`${section.id}-${field.id}`}
            />
            {hasSuggestion && (
              <div className="border rounded-lg p-3 bg-blue-50 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-900">
                  <Sparkles className="h-4 w-4" />
                  AI Suggestion
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{hasSuggestion}</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleInsertAISuggestion(section.id, field.id)}
                    className="h-7 text-xs"
                    data-testid={`insert-ai-${section.id}-${field.id}`}
                  >
                    Insert Suggestion
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setAiSuggestions(prev => {
                        const newSuggestions = { ...prev };
                        delete newSuggestions[aiKey];
                        return newSuggestions;
                      })
                    }
                    className="h-7 text-xs"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        );

      case 'select':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={`${section.id}-${field.id}`} className="flex items-center gap-1">
              {field.label}
              {field.required && <span className="text-red-500">*</span>}
            </Label>
            <Select
              value={value}
              onValueChange={val => handleFieldChange(section.id, field.id, val)}
              disabled={readOnly}
            >
              <SelectTrigger
                className={error ? 'border-red-500' : ''}
                data-testid={`select-${section.id}-${field.id}`}
              >
                <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map(option => (
                  <SelectItem
                    key={option}
                    value={option}
                    data-testid={`option-${section.id}-${field.id}-${option}`}
                  >
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.id} className="flex items-center space-x-2">
            <Checkbox
              id={`${section.id}-${field.id}`}
              checked={value || false}
              onCheckedChange={checked => handleFieldChange(section.id, field.id, checked)}
              disabled={readOnly}
            />
            <Label
              htmlFor={`${section.id}-${field.id}`}
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
          </div>
        );

      default:
        return null;
    }
  };

  // Generate scaffold with smart data population (REMOVED OLD HTML VERSION)
  const handleGenerateScaffold = () => {
    // For 510(k), create comprehensive FDA-compliant document
    if (documentType === 'cerv2_510k') {
      const fda510kContent = `
<h1>FDA 510(k) SUBMISSION - ${deviceProfile.deviceName || 'Medical Device'}</h1>
<p><strong>K Number:</strong> ${documentId || 'DRAFT'}</p>
<p><strong>Date Prepared:</strong> ${new Date().toLocaleDateString()}</p>
<p><strong>Manufacturer:</strong> ${deviceProfile.manufacturer || 'Your Company Name'}</p>
<p><strong>Device Class:</strong> ${deviceProfile.mdClass || 'Class II'}</p>

<hr />

<h2>1. COVER LETTER (Required)</h2>
<p>This 510(k) submission is for ${deviceProfile.deviceName || '[Device Name]'}, manufactured by ${deviceProfile.manufacturer || '[Company Name]'}.</p>
<p>We request clearance for the following indications for use: ${deviceProfile.intendedUse || '[Intended Use Statement]'}</p>

<h2>2. INDICATIONS FOR USE STATEMENT (Required)</h2>
<p><strong>Device Name:</strong> ${deviceProfile.deviceName || '[Device Name]'}</p>
<p><strong>Intended Use:</strong> ${deviceProfile.intendedUse || '[Detailed intended use and indications]'}</p>
<p><strong>Prescription Use:</strong> ☐ Yes ☐ No</p>
<p><strong>Over-The-Counter Use:</strong> ☐ Yes ☐ No</p>

<h2>3. 510(k) SUMMARY (Required)</h2>
<h3>3.1 Submitter Information</h3>
<p><strong>Company:</strong> ${deviceProfile.manufacturer || '[Company Name]'}</p>
<p><strong>Address:</strong> [Complete Address]</p>
<p><strong>Contact Person:</strong> [Name, Title]</p>
<p><strong>Phone:</strong> [Phone Number]</p>
<p><strong>Email:</strong> [Email Address]</p>

<h3>3.2 Device Identification</h3>
<p><strong>Trade/Proprietary Name:</strong> ${deviceProfile.deviceName || '[Device Name]'}</p>
<p><strong>Common Name:</strong> [Common Name]</p>
<p><strong>Classification Name:</strong> [21 CFR Section]</p>
<p><strong>Product Code:</strong> ${deviceProfile.productCode || '[FDA Product Code]'}</p>

<h2>4. DEVICE DESCRIPTION (Required)</h2>
<h3>4.1 Physical Description</h3>
<p>${deviceProfile.description || '[Provide detailed physical description including dimensions, materials, components]'}</p>

<h3>4.2 Technical Specifications</h3>
<p>${deviceProfile.technicalSpecifications || '[Include all technical specifications, operating parameters, and performance characteristics]'}</p>

<h3>4.3 Principles of Operation</h3>
<p>[Describe how the device functions to achieve its intended use]</p>

<h2>5. SUBSTANTIAL EQUIVALENCE (Required)</h2>
<h3>5.1 Predicate Device Information</h3>
<p><strong>Predicate Device:</strong> ${deviceProfile.predicateDevice || '[K Number]'}</p>
<p><strong>Manufacturer:</strong> ${deviceProfile.predicateManufacturer || '[Predicate Manufacturer]'}</p>
<p><strong>Cleared Date:</strong> [Date]</p>

<h3>5.2 Comparison Table</h3>
<table border="1">
<tr><th>Feature</th><th>Subject Device</th><th>Predicate Device</th></tr>
<tr><td>Intended Use</td><td>${deviceProfile.intendedUse || '[Your Device]'}</td><td>[Predicate]</td></tr>
<tr><td>Technology</td><td>[Your Technology]</td><td>[Predicate Technology]</td></tr>
<tr><td>Materials</td><td>[Your Materials]</td><td>[Predicate Materials]</td></tr>
</table>

<h2>6. PERFORMANCE TESTING (Required)</h2>
<h3>6.1 Bench Testing</h3>
<p>[Describe all bench testing performed including test methods, acceptance criteria, and results]</p>

<h3>6.2 Electrical Safety & EMC</h3>
<p>[Include testing per IEC 60601-1 and IEC 60601-1-2 as applicable]</p>

<h3>6.3 Software Validation (if applicable)</h3>
<p>[Provide software validation summary per FDA software guidance]</p>

<h2>7. BIOCOMPATIBILITY (Required if patient contact)</h2>
<p>[Describe biocompatibility testing per ISO 10993 series]</p>

<h2>8. STERILIZATION (Required if sterile device)</h2>
<p>[Describe sterilization method, validation, and sterility assurance level]</p>

<h2>9. SHELF LIFE/STABILITY (Required if applicable)</h2>
<p>[Provide shelf life testing data and expiration dating]</p>

<h2>10. CLINICAL DATA (Required if needed)</h2>
<p>[Include clinical study summaries if clinical data is necessary]</p>

<h2>11. LABELING (Required)</h2>
<h3>11.1 Device Labeling</h3>
<p>[Include all device labels, instructions for use, and package inserts]</p>

<h3>11.2 Promotional Materials</h3>
<p>[Include any promotional materials if available]</p>

<h2>12. TRUTHFUL AND ACCURATE STATEMENT (Required)</h2>
<p>I certify that all information submitted in this premarket notification is truthful and accurate and that no material fact has been omitted.</p>
<p><strong>Signature:</strong> ______________________</p>
<p><strong>Name:</strong> [Name]</p>
<p><strong>Title:</strong> [Title]</p>
<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>

<h2>13. CLASS III CERTIFICATION (If applicable)</h2>
<p>[Required only for Class III devices subject to 510(k)]</p>

<h2>14. FINANCIAL DISCLOSURE</h2>
<p>[Include financial certification and disclosure statements]</p>

<h2>15. REFERENCES</h2>
<p>[List all referenced standards, guidances, and literature]</p>

<hr />
<h2>APPENDICES</h2>
<p>A. Device Photographs and Engineering Drawings</p>
<p>B. Test Reports and Certificates</p>
<p>C. Predicate Device Labeling</p>
<p>D. Standards Compliance Documentation</p>
      `.trim();

      setContent(fda510kContent);
      setIsDirty(true);

      toast({
        title: '510(k) Document Generated',
        description:
          'Complete FDA 510(k) template with all 25 sections has been created. Start editing to build your submission.',
        duration: 5000,
      });
    } else {
      // For other document types, use the existing logic
      const sections = docType.sections
        .map(section => {
          const requiredText = section.required ? ' (Required)' : ' (Optional)';
          return `<h2>${section.title}${requiredText}</h2>\n<p>Enter content for ${section.title}...</p>\n`;
        })
        .join('\n');

      const scaffoldContent = `
<h1>${docType.label} - ${deviceProfile.deviceName || 'New Device'}</h1>
<p><strong>Document ID:</strong> ${documentId || 'Draft'}</p>
<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
<p><strong>Status:</strong> Draft</p>

<hr />

${sections}

<hr />

<h2>Appendices</h2>
<p>Attach supporting documentation here.</p>
      `.trim();

      setContent(scaffoldContent);
      setIsDirty(true);

      toast({
        title: 'Template Generated',
        description: `${docType.label} template has been applied.`,
        duration: 3000,
      });
    }
  };

  // Handle content change (for text areas)
  const handleContentChange = e => {
    // No longer used - replaced by handleFieldChange for EMR forms
  };

  // OLD functions REMOVED to avoid duplicates - using EMR versions above

  // Generate eSTAR package (510k only)
  const handleGenerateESTAR = async () => {
    if (documentType !== 'cerv2_510k') {
      toast({
        title: 'Not Available',
        description: 'eSTAR package is only available for 510(k) submissions',
        variant: 'default',
      });
      return;
    }

    try {
      const response = await fetch('/api/510k/estar/build', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': localStorage.getItem('organizationId') || 'default',
        },
        body: JSON.stringify({
          meta: {
            id: documentId || 'draft',
            deviceName: deviceProfile.deviceName,
            manufacturer: deviceProfile.manufacturer,
          },
          content: content,
          attachments: [],
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${deviceProfile.deviceName || 'device'}_eSTAR_${new Date().toISOString().split('T')[0]}.zip`;
        a.click();
        window.URL.revokeObjectURL(url);

        toast({
          title: 'eSTAR Package Generated',
          description: 'FDA eSTAR submission package has been created',
        });
      }
    } catch (error) {
      console.error('eSTAR generation error:', error);
      toast({
        title: 'Generation Failed',
        description: 'Unable to generate eSTAR package. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Lock/unlock document
  const handleToggleLock = () => {
    setIsLocked(!isLocked);
    toast({
      title: isLocked ? 'Document Unlocked' : 'Document Locked',
      description: isLocked ? 'You can now edit the document' : 'Document is locked for editing',
    });
  };

  // EMR-STYLE RENDERING
  return (
    <div className="h-full w-full flex flex-col bg-gray-50" data-testid="document-editor">
      {/* EMR Header */}
      <div className="bg-white border-b px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">
                {documentType === 'cerv2_510k'
                  ? 'FDA 510(k) Submission'
                  : 'Clinical Evaluation Report'}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {deviceProfile.deviceName || 'New Medical Device'} •{' '}
                {deviceProfile.manufacturer || 'Manufacturer'}
              </p>
            </div>
            {/* Auto-save status indicator */}
            <div className="flex items-center gap-2">
              {isDirty && !isSaving && (
                <Badge variant="outline" className="gap-1">
                  <Circle className="h-2 w-2 fill-yellow-500" />
                  Unsaved changes
                </Badge>
              )}
              {isSaving && (
                <Badge variant="outline" className="gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Saving...
                </Badge>
              )}
              {!isDirty && lastSaved && (
                <Badge variant="outline" className="gap-1 text-green-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Saved {new Date(lastSaved).toLocaleTimeString()}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Progress Ring */}
            <div className="flex items-center gap-3 bg-gray-50 px-4 py-2 rounded-lg">
              <div className="relative h-12 w-12">
                <svg className="w-12 h-12 transform -rotate-90">
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    className="text-gray-200"
                  />
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    strokeDasharray={`${overallProgress * 1.26} 126`}
                    className="text-blue-600"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                  {overallProgress}%
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-500">Complete</p>
                <p className="text-sm font-medium">
                  {completedSections.size}/{sections.filter(s => s.required).length} Required
                </p>
              </div>
            </div>

            {/* Status */}
            {isDirty && (
              <Badge variant="outline" className="h-8">
                Unsaved Changes
              </Badge>
            )}
            {lastSaved && (
              <Badge variant="secondary" className="h-8">
                <Clock className="h-3 w-3 mr-1" />
                Saved {new Date(lastSaved).toLocaleTimeString()}
              </Badge>
            )}

            {/* Actions */}
            <Button
              onClick={handleSave}
              variant="default"
              size="default"
              disabled={!isDirty || readOnly || isSaving}
              className="px-6"
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Document'}
            </Button>

            <Button
              onClick={() => setViewMode(viewMode === 'preview' ? 'form' : 'preview')}
              variant={viewMode === 'preview' ? 'default' : 'outline'}
              size="default"
              className="px-6"
              data-testid="button-preview-report"
            >
              <FileText className="h-4 w-4 mr-2" />
              {viewMode === 'preview' ? 'Back to Form' : 'Preview Report'}
            </Button>

            <Button onClick={handleExport} variant="outline" size="default" className="px-6">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>

            <Button
              onClick={() => setShowAssignmentDialog(true)}
              variant="outline"
              size="default"
              className="px-6 border-green-500 text-green-700 hover:bg-green-50"
              data-testid="button-assign-document"
            >
              <Users className="h-4 w-4 mr-2" />
              Assign to Staff
            </Button>
          </div>
        </div>
      </div>

      {/* Assignment Dialog */}
      {showAssignmentDialog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowAssignmentDialog(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-green-600" />
              Assign Document to Staff
            </h3>

            <div className="space-y-4">
              <div>
                <Label htmlFor="assignTo">Assign To *</Label>
                <Select
                  value={assignmentData.assignTo}
                  onValueChange={value => setAssignmentData(prev => ({ ...prev, assignTo: value }))}
                >
                  <SelectTrigger id="assignTo" data-testid="select-assign-to">
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dr. Michael Chen - Quality Assurance">
                      Dr. Michael Chen - Quality Assurance
                    </SelectItem>
                    <SelectItem value="Lisa Rodriguez - Regulatory Manager">
                      Lisa Rodriguez - Regulatory Manager
                    </SelectItem>
                    <SelectItem value="James Park - Clinical Affairs">
                      James Park - Clinical Affairs
                    </SelectItem>
                    <SelectItem value="Emma Thompson - Technical Writer">
                      Emma Thompson - Technical Writer
                    </SelectItem>
                    <SelectItem value="David Kim - VP Regulatory">
                      David Kim - VP Regulatory
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={assignmentData.priority}
                  onValueChange={value => setAssignmentData(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger id="priority" data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low Priority</SelectItem>
                    <SelectItem value="normal">Normal Priority</SelectItem>
                    <SelectItem value="high">High Priority</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={assignmentData.notes}
                  onChange={e => setAssignmentData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Add any instructions or context for the assignee..."
                  rows={3}
                  data-testid="textarea-assignment-notes"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-900">
                  <strong>Document:</strong> {deviceProfile.deviceName || 'New Device'}
                  <br />
                  <strong>Progress:</strong> {overallProgress}% Complete
                  <br />
                  <strong>Sections Completed:</strong> {completedSections.size}/
                  {sections.filter(s => s.required).length}
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleAssignDocument}
                  className="flex-1"
                  data-testid="button-confirm-assignment"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Assign Document
                </Button>
                <Button
                  onClick={() => setShowAssignmentDialog(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EMR Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Section Tree Navigation */}
        <div className="w-80 bg-white border-r overflow-y-auto">
          <div className="p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">510(k) Sections</h3>
              <div className="space-y-1 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <Circle className="h-3 w-3 text-gray-400" />
                  <span>To Do</span>
                </div>
                <div className="flex items-center gap-2">
                  <Edit3 className="h-3 w-3 text-blue-500" />
                  <span>Drafting</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  <span>Validated</span>
                </div>
              </div>
            </div>
            <Separator className="my-3" />
            <div className="space-y-1" data-testid="section-tree-list">
              {sections.map((section, index) => {
                const isCompleted = completedSections.has(section.id);
                const isActive = activeSection === section.id;
                const hasErrors =
                  validationErrors[section.id] &&
                  Object.keys(validationErrors[section.id]).length > 0;
                const Icon = section.icon;

                // Determine status: validated (completed), drafting (has data), or todo
                let statusIcon;
                let statusColor;
                if (isCompleted) {
                  statusIcon = <CheckCircle2 className="h-4 w-4 text-green-600" />;
                  statusColor = 'text-green-600';
                } else if (
                  sectionData[section.id] &&
                  Object.keys(sectionData[section.id]).length > 0
                ) {
                  statusIcon = <Edit3 className="h-4 w-4 text-blue-500" />;
                  statusColor = 'text-blue-500';
                } else {
                  statusIcon = <Circle className="h-4 w-4 text-gray-400" />;
                  statusColor = 'text-gray-400';
                }

                return (
                  <button
                    key={section.id}
                    onClick={() => handleOpenSection(section.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md transition-all ${
                      openSections.includes(section.id)
                        ? 'bg-blue-50 border-l-2 border-blue-500'
                        : isActive
                          ? 'bg-accent border-l-2 border-primary'
                          : 'hover:bg-accent/50'
                    }`}
                    data-testid={`section-item-${section.id}`}
                  >
                    <div className="flex-shrink-0" data-testid={`status-icon-${section.id}`}>
                      {statusIcon}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p
                        className={`text-sm font-medium truncate ${isActive ? 'text-primary' : 'text-foreground'}`}
                      >
                        {section.title}
                      </p>
                      {section.required && (
                        <span className="text-xs text-muted-foreground">Required</span>
                      )}
                    </div>
                    {hasErrors && (
                      <Badge
                        variant="destructive"
                        className="h-5 w-5 rounded-full p-0 flex items-center justify-center"
                      >
                        !
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content - Section Editor with Tabs OR Preview */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {viewMode === 'form' ? (
            <>
              {/* Multi-Section Tab Bar */}
              <div className="bg-white border-b">
                <div className="flex items-center gap-1 px-4 overflow-x-auto">
                  {openSections.map(sectionId => {
                    const section = sections.find(s => s.id === sectionId);
                    if (!section) return null;

                    const isActive = activeSection === sectionId;
                    const isCompleted = completedSections.has(sectionId);
                    const hasErrors =
                      validationErrors[sectionId] &&
                      Object.keys(validationErrors[sectionId]).length > 0;
                    const SectionIcon = section.icon;

                    return (
                      <div
                        key={sectionId}
                        className={`flex items-center gap-2 px-4 py-3 border-b-2 cursor-pointer transition-colors min-w-0 ${
                          isActive
                            ? 'border-primary bg-primary/5'
                            : 'border-transparent hover:bg-gray-50'
                        }`}
                        data-testid={`section-tab-${sectionId}`}
                      >
                        <button
                          onClick={() => handleSwitchTab(sectionId)}
                          className="flex items-center gap-2 min-w-0 flex-1"
                        >
                          <SectionIcon
                            className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-primary' : 'text-gray-500'}`}
                          />
                          <span
                            className={`text-sm font-medium truncate max-w-[200px] ${
                              isActive ? 'text-primary' : 'text-gray-700'
                            }`}
                          >
                            {section.title.split(' ').slice(1).join(' ')}
                          </span>
                          {isCompleted && (
                            <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
                          )}
                          {hasErrors && (
                            <AlertCircle className="h-3 w-3 text-red-600 flex-shrink-0" />
                          )}
                        </button>
                        {openSections.length > 1 && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              handleCloseSection(sectionId);
                            }}
                            className="p-1 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                            data-testid={`close-tab-${sectionId}`}
                          >
                            <X className="h-3 w-3 text-gray-500" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Version History Toggle */}
                  <button
                    onClick={() => setShowVersionHistory(!showVersionHistory)}
                    className={`ml-auto px-4 py-3 flex items-center gap-2 text-sm font-medium transition-colors ${
                      showVersionHistory
                        ? 'text-primary bg-primary/5'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    data-testid="toggle-version-history"
                  >
                    <History className="h-4 w-4" />
                    Version History
                  </button>
                </div>
              </div>

              {/* Content Area with Optional Version History Panel */}
              <div className="flex-1 overflow-hidden flex">
                {/* Content/Sources/Compliance Tabs */}
                <div className={`flex-1 overflow-hidden ${showVersionHistory ? 'border-r' : ''}`}>
                  <Tabs defaultValue="content" className="h-full flex flex-col">
                    <div className="border-b px-6 bg-white">
                      <TabsList className="h-12">
                        <TabsTrigger value="content" className="gap-2" data-testid="tab-content">
                          <FileText className="h-4 w-4" />
                          Content
                        </TabsTrigger>
                        <TabsTrigger value="sources" className="gap-2" data-testid="tab-sources">
                          <BookOpen className="h-4 w-4" />
                          Sources
                        </TabsTrigger>
                        <TabsTrigger
                          value="compliance"
                          className="gap-2"
                          data-testid="tab-compliance"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          Compliance
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    {/* Content Tab */}
                    <TabsContent value="content" className="flex-1 overflow-y-auto p-6 mt-0">
                      <div>
                        {sections.map(section => {
                          if (section.id !== activeSection) return null;

                          return (
                            <div key={section.id} className="max-w-4xl">
                              {/* Main Section Content Editor - For FDA Template Content */}
                              {selectedSection && (
                                <div className="bg-white rounded-lg border p-6 mb-6">
                                  <div className="space-y-4">
                                    <div>
                                      <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-gray-700">
                                          Section Content
                                        </label>
                                        <div className="flex gap-2">
                                          {/* AI Content Generation with Auto-Citations */}
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={async () => {
                                              setIsAiProcessing(prev => ({
                                                ...prev,
                                                [section.id]: true,
                                              }));
                                              try {
                                                // Find relevant Device Data Center files for this section
                                                // Use section.section_number from local context, fall back to section.id
                                                const currentSectionNumber =
                                                  section.section_number ||
                                                  selectedSection?.section_number ||
                                                  section.id;

                                                const relevantFiles = deviceFiles.filter(file => {
                                                  // Match files based on section type and file category
                                                  const sectionKeywords = {
                                                    '7.0': ['device', 'specification', 'technical'],
                                                    '8.0': [
                                                      'equivalence',
                                                      'comparison',
                                                      'predicate',
                                                    ],
                                                    '9.0': [
                                                      'sterilization',
                                                      'biocompatibility',
                                                      'safety',
                                                    ],
                                                    '10.0': ['software', 'validation'],
                                                    '11.0': ['biocompatibility', 'safety'],
                                                    '12.0': ['bench', 'testing', 'performance'],
                                                    '13.0': ['clinical', 'data', 'studies'],
                                                  };

                                                  const keywords =
                                                    sectionKeywords[currentSectionNumber] || [];
                                                  return (
                                                    file.category &&
                                                    keywords.some(
                                                      kw =>
                                                        file.category.includes(kw) ||
                                                        file.tags?.some(tag =>
                                                          tag.toLowerCase().includes(kw)
                                                        )
                                                    )
                                                  );
                                                });

                                                const result =
                                                  await FDA510kAIService.generateSectionContent(
                                                    currentSectionNumber,
                                                    deviceProfile,
                                                    sectionData[section.id]?.['main_content'],
                                                    relevantFiles // Pass relevant files for auto-citations
                                                  );

                                                if (result.success) {
                                                  handleFieldChange(
                                                    section.id,
                                                    'main_content',
                                                    result.content
                                                  );

                                                  const citationCount = relevantFiles.length;
                                                  toast({
                                                    title: 'AI Content Generated',
                                                    description: `${result.source === 'ai' ? 'AI-powered' : 'Template-based'} content generated${citationCount > 0 ? ` with ${citationCount} auto-citations` : ''}.`,
                                                  });
                                                }
                                              } catch (error) {
                                                console.error('AI Generation Error:', error);
                                                toast({
                                                  title: 'Generation Failed',
                                                  description:
                                                    'Could not generate content. Please try again.',
                                                  variant: 'destructive',
                                                });
                                              } finally {
                                                setIsAiProcessing(prev => ({
                                                  ...prev,
                                                  [section.id]: false,
                                                }));
                                              }
                                            }}
                                            disabled={isAiProcessing[section.id]}
                                            className="gap-1"
                                            data-testid="button-ai-generate-section"
                                          >
                                            {isAiProcessing[section.id] ? (
                                              <>
                                                <RefreshCw className="h-3 w-3 animate-spin" />
                                                Generating...
                                              </>
                                            ) : (
                                              <>
                                                <Sparkles className="h-3 w-3" />
                                                Generate Section
                                              </>
                                            )}
                                          </Button>

                                          {/* AI Compliance Check */}
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={async () => {
                                              const content =
                                                sectionData[section.id]?.['main_content'];
                                              if (!content) {
                                                toast({
                                                  title: 'No Content',
                                                  description:
                                                    'Add content before checking compliance.',
                                                  variant: 'destructive',
                                                });
                                                return;
                                              }

                                              const compliance =
                                                await FDA510kAIService.checkCompliance(
                                                  selectedSection.section_number,
                                                  content
                                                );

                                              if (compliance.compliant) {
                                                toast({
                                                  title: 'Compliance Check Passed',
                                                  description: `Section meets FDA requirements (Score: ${compliance.score}%)`,
                                                });
                                              } else {
                                                toast({
                                                  title: 'Compliance Issues Found',
                                                  description: compliance.issues
                                                    .map(i => i.message)
                                                    .join(', '),
                                                  variant: 'destructive',
                                                });
                                              }
                                            }}
                                            className="gap-1"
                                          >
                                            <ShieldCheck className="h-3 w-3" />
                                            Check Compliance
                                          </Button>

                                          {/* AI Suggestions */}
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={async () => {
                                              const content =
                                                sectionData[section.id]?.['main_content'] || '';
                                              const suggestions =
                                                await FDA510kAIService.getSuggestions(
                                                  selectedSection.section_number,
                                                  content,
                                                  deviceProfile
                                                );

                                              if (suggestions.length > 0) {
                                                setAiSuggestions(prev => ({
                                                  ...prev,
                                                  [`${section.id}-main`]: suggestions[0].message,
                                                }));
                                              }

                                              toast({
                                                title: 'AI Suggestions',
                                                description: `${suggestions.length} suggestions available`,
                                              });
                                            }}
                                            className="gap-1"
                                          >
                                            <Bot className="h-3 w-3" />
                                            AI Suggestions
                                          </Button>
                                        </div>
                                      </div>

                                      {/* AI Suggestions Display */}
                                      {aiSuggestions[`${section.id}-main`] && (
                                        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                          <div className="flex items-start gap-2">
                                            <Sparkles className="h-4 w-4 text-blue-600 mt-0.5" />
                                            <div className="flex-1">
                                              <p className="text-sm text-blue-900">
                                                {aiSuggestions[`${section.id}-main`]}
                                              </p>
                                              <div className="flex gap-2 mt-2">
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  onClick={() => {
                                                    setAiSuggestions(prev => {
                                                      const updated = { ...prev };
                                                      delete updated[`${section.id}-main`];
                                                      return updated;
                                                    });
                                                  }}
                                                  className="h-7 text-xs"
                                                >
                                                  Dismiss
                                                </Button>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      <RegulatoryRichTextEditor
                                        value={
                                          sectionData[section.id]?.['main_content'] ||
                                          selectedSection.content ||
                                          ''
                                        }
                                        onChange={html =>
                                          handleFieldChange(section.id, 'main_content', html)
                                        }
                                        placeholder="Enter section content here..."
                                        readOnly={readOnly}
                                        minHeight="400px"
                                        maxHeight="800px"
                                        showToolbar={!readOnly}
                                        showWordCount={true}
                                        fieldId={`${section.id}-main-content`}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Form Fields */}
                              <div className="bg-white rounded-lg border p-6">
                                <div className="space-y-6">
                                  {section.fields.map(field => renderField(section, field))}
                                </div>
                              </div>

                              {/* Section Actions */}
                              <div className="mt-8 pt-6 border-t flex justify-between">
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    const idx = sections.findIndex(s => s.id === section.id);
                                    if (idx > 0) {
                                      setActiveSection(sections[idx - 1].id);
                                    }
                                  }}
                                  disabled={sections.findIndex(s => s.id === section.id) === 0}
                                >
                                  Previous Section
                                </Button>

                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={() => validateSection(section.id)}
                                  >
                                    Validate Section
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      // First save the current section data
                                      handleAutoSave();

                                      // Validate the section
                                      const isValid = validateSection(section.id);

                                      if (isValid) {
                                        // Mark section as completed
                                        setCompletedSections(
                                          prev => new Set([...prev, section.id])
                                        );

                                        // Update progress
                                        updateProgress();

                                        // Move to next section
                                        const idx = sections.findIndex(s => s.id === section.id);
                                        if (idx < sections.length - 1) {
                                          setActiveSection(sections[idx + 1].id);
                                        }

                                        toast({
                                          title: 'Section Complete',
                                          description: `${section.title} has been validated and saved`,
                                        });
                                      } else {
                                        toast({
                                          title: 'Validation Failed',
                                          description: 'Please complete all required fields',
                                          variant: 'destructive',
                                        });
                                      }
                                    }}
                                  >
                                    Save & Continue
                                    <ChevronRight className="ml-2 h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </TabsContent>

                    {/* Sources Tab - Device Data Center File Browser */}
                    <TabsContent value="sources" className="flex-1 overflow-y-auto p-6 mt-0">
                      <div className="max-w-6xl">
                        <div className="bg-white rounded-lg border">
                          <div className="p-6 border-b">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2">
                                <Link2 className="h-5 w-5 text-primary" />
                                <h3 className="text-lg font-semibold">Device Data Center Files</h3>
                                <Badge variant="outline">{filteredDeviceFiles.length} files</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Drag files to insert citations
                              </p>
                            </div>

                            {/* Search and Filter */}
                            <div className="flex gap-3">
                              <div className="flex-1">
                                <Input
                                  placeholder="Search files, devices, or tags..."
                                  value={deviceFileSearch}
                                  onChange={e => setDeviceFileSearch(e.target.value)}
                                  className="w-full"
                                  data-testid="input-search-device-files"
                                />
                              </div>
                              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                <SelectTrigger
                                  className="w-[200px]"
                                  data-testid="select-category-filter"
                                >
                                  <SelectValue placeholder="All Categories" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Categories</SelectItem>
                                  <SelectItem value="bench_test">Bench Testing</SelectItem>
                                  <SelectItem value="biocompatibility">Biocompatibility</SelectItem>
                                  <SelectItem value="electrical_safety">
                                    Electrical Safety
                                  </SelectItem>
                                  <SelectItem value="predicate_labeling">
                                    Predicate Labeling
                                  </SelectItem>
                                  <SelectItem value="software_validation">
                                    Software Validation
                                  </SelectItem>
                                  <SelectItem value="clinical_data">Clinical Data</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* File Grid */}
                          <div className="p-6">
                            {isLoadingDeviceDataFiles ? (
                              <div className="text-center py-12">
                                <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">Loading files...</p>
                              </div>
                            ) : filteredDeviceFiles.length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredDeviceFiles.map(file => (
                                  <div
                                    key={file.id}
                                    draggable
                                    onDragStart={() => setDraggedFile(file)}
                                    onDragEnd={() => setDraggedFile(null)}
                                    className="border rounded-lg p-4 cursor-move hover:shadow-md transition-shadow bg-white"
                                    data-testid={`file-card-${file.id}`}
                                  >
                                    <div className="flex items-start gap-3 mb-3">
                                      <FileText className="h-5 w-5 text-blue-600 mt-1 flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm line-clamp-2 mb-1">
                                          {file.file_name}
                                        </p>
                                        {file.device_name && (
                                          <p className="text-xs text-muted-foreground line-clamp-1">
                                            {file.device_name}
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    <div className="space-y-2">
                                      {file.category && (
                                        <Badge variant="secondary" className="text-xs">
                                          {file.category.replace(/_/g, ' ')}
                                        </Badge>
                                      )}

                                      {file.tags && file.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          {file.tags.slice(0, 3).map((tag, idx) => (
                                            <Badge key={idx} variant="outline" className="text-xs">
                                              {tag}
                                            </Badge>
                                          ))}
                                          {file.tags.length > 3 && (
                                            <Badge variant="outline" className="text-xs">
                                              +{file.tags.length - 3}
                                            </Badge>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    <div className="mt-3 pt-3 border-t flex items-center justify-between">
                                      <span className="text-xs text-muted-foreground">
                                        {file.file_size
                                          ? `${Math.round(file.file_size / 1024)} KB`
                                          : 'N/A'}
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2"
                                        onClick={() => {
                                          // Insert citation immediately using handleFieldChange
                                          const citation = `[${file.file_name}]`;
                                          const currentContent =
                                            sectionData[activeSection]?.['main_content'] || '';
                                          const newContent = currentContent
                                            ? `${currentContent} ${citation}`
                                            : citation;

                                          handleFieldChange(
                                            activeSection,
                                            'main_content',
                                            newContent
                                          );

                                          toast({
                                            title: 'Citation Added',
                                            description: `Added reference to ${file.file_name}`,
                                          });
                                        }}
                                        data-testid={`button-insert-citation-${file.id}`}
                                      >
                                        <Link2 className="h-3 w-3 mr-1" />
                                        Insert
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-12 text-muted-foreground">
                                <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                <p className="font-medium mb-1">No files found</p>
                                <p className="text-sm">
                                  {deviceFileSearch || selectedCategory !== 'all'
                                    ? 'Try adjusting your search or filter'
                                    : 'Upload files in the Device Data Center to add citations'}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    {/* Compliance Tab */}
                    <TabsContent value="compliance" className="flex-1 overflow-y-auto p-6 mt-0">
                      <div className="max-w-4xl">
                        <div className="bg-white rounded-lg border p-6 space-y-6">
                          <div className="flex items-center gap-2 mb-4">
                            <ShieldCheck className="h-5 w-5 text-primary" />
                            <h3 className="text-lg font-semibold">Regulatory Compliance</h3>
                          </div>

                          {sections.map(section => {
                            if (section.id !== activeSection) return null;
                            const errors = validationErrors[section.id] || {};
                            const hasErrors = Object.keys(errors).length > 0;
                            const isCompleted = completedSections.has(section.id);

                            return (
                              <div key={section.id}>
                                {isCompleted ? (
                                  <Alert className="border-green-200 bg-green-50">
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    <AlertTitle className="text-green-900">
                                      Section Validated
                                    </AlertTitle>
                                    <AlertDescription className="text-green-700">
                                      This section meets all 510(k) requirements.
                                    </AlertDescription>
                                  </Alert>
                                ) : hasErrors ? (
                                  <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Validation Errors</AlertTitle>
                                    <AlertDescription>
                                      <ul className="list-disc list-inside mt-2 space-y-1">
                                        {Object.entries(errors).map(([field, error]) => (
                                          <li key={field} className="text-sm">
                                            {error}
                                          </li>
                                        ))}
                                      </ul>
                                    </AlertDescription>
                                  </Alert>
                                ) : (
                                  <Alert>
                                    <Info className="h-4 w-4" />
                                    <AlertTitle>Pending Validation</AlertTitle>
                                    <AlertDescription>
                                      Complete all required fields to validate.
                                    </AlertDescription>
                                  </Alert>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Version History Panel - Only show when toggled */}
                {showVersionHistory && (
                  <div className="w-96 bg-white border-l overflow-y-auto p-4">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Version History
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Track all changes made to this document
                      </p>
                    </div>
                    <Separator className="my-4" />
                    <div className="space-y-4">
                      <p className="text-sm text-gray-500 text-center py-8">
                        Version history will appear here when you make changes to sections.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Preview Mode - Show Generated 510(k) Report */
            <div className="flex-1 overflow-y-auto bg-gray-50">
              <div className="max-w-5xl mx-auto p-8">
                <div className="bg-white rounded-lg shadow-lg p-12 border">
                  {/* Report Header */}
                  <div className="text-center border-b-2 border-gray-300 pb-6 mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">
                      FDA 510(k) PREMARKET NOTIFICATION
                    </h1>
                    <p className="text-lg text-gray-600 mt-4">
                      {sectionData['cover-letter']?.device_name ||
                        deviceProfile.deviceName ||
                        '[Device Name]'}
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                      {sectionData['cover-letter']?.manufacturer ||
                        deviceProfile.manufacturer ||
                        '[Manufacturer Name]'}
                    </p>
                    <div className="mt-4 flex justify-center gap-6 text-sm">
                      <div>
                        <span className="font-semibold">Document ID:</span> {documentId || 'DRAFT'}
                      </div>
                      <div>
                        <span className="font-semibold">Date:</span>{' '}
                        {new Date().toLocaleDateString()}
                      </div>
                      <div>
                        <span className="font-semibold">Progress:</span> {overallProgress}%
                      </div>
                    </div>
                  </div>

                  {/* Generated Sections */}
                  <div className="space-y-8">
                    {sections.map((section, idx) => {
                      const currentSectionData = sectionData[section.id] || {};
                      const hasData = Object.values(currentSectionData).some(
                        val => val && val !== ''
                      );
                      const isCompleted = completedSections.has(section.id);

                      if (!hasData) return null;

                      return (
                        <div key={section.id} className="border-l-4 border-blue-500 pl-6 py-2">
                          <div className="flex items-start justify-between mb-4">
                            <h2 className="text-2xl font-bold text-gray-900">{section.title}</h2>
                            {isCompleted && (
                              <Badge className="bg-green-100 text-green-700">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Validated
                              </Badge>
                            )}
                          </div>

                          <div className="prose max-w-none">
                            {section.fields.map((field, fieldIdx) => {
                              const value = currentSectionData[field.id];
                              if (!value) return null;

                              return (
                                <div key={fieldIdx} className="mb-4">
                                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                                    {field.label}
                                  </h3>
                                  <div
                                    className="text-gray-700 whitespace-pre-wrap leading-relaxed border border-transparent hover:border-blue-200 rounded p-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all cursor-text"
                                    contentEditable={!readOnly}
                                    suppressContentEditableWarning
                                    dangerouslySetInnerHTML={{ __html: value }}
                                    onBlur={e => {
                                      const newValue = e.currentTarget.textContent;
                                      if (newValue !== value) {
                                        setSectionData(prev => ({
                                          ...prev,
                                          [section.id]: {
                                            ...prev[section.id],
                                            [field.id]: newValue,
                                          },
                                        }));
                                        setIsDirty(true);
                                      }
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {sections.every(
                      s => !Object.values(sectionData[s.id] || {}).some(val => val && val !== '')
                    ) && (
                      <div className="text-center py-12">
                        <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">No Content Yet</h3>
                        <p className="text-gray-500">
                          Fill in the form sections to see your 510(k) report being generated in
                          real-time.
                        </p>
                        <Button onClick={() => setViewMode('form')} className="mt-4">
                          Start Filling Form
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Report Footer */}
                  {sections.some(s =>
                    Object.values(sectionData[s.id] || {}).some(val => val && val !== '')
                  ) && (
                    <div className="mt-12 pt-6 border-t text-center text-sm text-gray-500">
                      <p>
                        This is a draft 510(k) submission generated by CERV2 Medical Device Platform
                      </p>
                      <p className="mt-2">
                        Last Updated:{' '}
                        {lastSaved ? new Date(lastSaved).toLocaleString() : 'Not saved yet'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Data Room Dialog */}
      <Dialog open={showDataRoomDialog} onOpenChange={setShowDataRoomDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Data Room - Insert Citation
            </DialogTitle>
            <DialogDescription>
              Search for evidence and insert citations directly into your document
            </DialogDescription>
          </DialogHeader>

          <div className="h-[500px] overflow-hidden">
            <DocumentCitationHelper
              onCitationInsert={citation => {
                if (dataRoomTargetField) {
                  const { sectionId, fieldId } = dataRoomTargetField;
                  const currentValue = sectionData[sectionId]?.[fieldId] || '';
                  const newValue = currentValue + '\n\n' + citation.content + '\n\n';

                  handleFieldChange(sectionId, fieldId, newValue);

                  // Add to citations tracking
                  setCitations(prev => ({
                    ...prev,
                    [`${sectionId}-${fieldId}`]: [
                      ...(prev[`${sectionId}-${fieldId}`] || []),
                      citation,
                    ],
                  }));

                  setShowDataRoomDialog(false);
                  toast({
                    title: 'Citation Added',
                    description: 'Evidence citation has been inserted into the document',
                  });
                }
              }}
              editorContext={{
                section: dataRoomTargetField?.sectionId,
                field: dataRoomTargetField?.fieldId,
                suggestedCategories:
                  activeSection === 'device-description'
                    ? ['device_specification']
                    : activeSection === 'biocompatibility'
                      ? ['biocompatibility']
                      : activeSection === 'sterilization'
                        ? ['sterilization']
                        : activeSection === 'performance-testing'
                          ? ['bench_test', 'electrical_safety']
                          : [],
              }}
              compact={false}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MedicalDeviceDocumentEditor;

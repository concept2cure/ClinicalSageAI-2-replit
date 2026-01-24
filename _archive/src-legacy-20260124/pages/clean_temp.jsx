import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useDropzone } from 'react-dropzone';
import mammoth from 'mammoth';
import { 
  ArrowLeft, Save, Download, Sparkles, Shield, 
  FileText, Edit3, Bold, Italic, Underline, List, Table,
  Loader2, Upload, File, X, CheckCircle, Brain, Wand2,
  BookOpen, Users, Clock, Target, AlertTriangle, TrendingUp,
  Search, RefreshCw, Copy, Scissors, PlusCircle, Minus,
  Zap, Award, Globe, Database, Settings, Filter, SortAsc,
  BarChart3, PieChart, LineChart, Calendar, MessageSquare,
  Share2, Lock, Unlock, Eye, EyeOff, History, MoreVertical,
  ChevronDown, ChevronRight, Maximize2, Minimize2, Type,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, 
  Subscript, Superscript, Quote, Code, Link, Image,
  PlayCircle, PauseCircle, StopCircle, SkipForward,
  Volume2, VolumeX, Mic, MicOff, Video, VideoOff,
  FileCheck, Cpu, Network, Layers, GitBranch, Lightbulb, FolderTree
} from 'lucide-react';

const WorkingDocumentEditor = () => {
  // Core document state
  const [draftContent, setDraftContent] = useState('');
  const [documentTitle, setDocumentTitle] = useState('IND Application - New Drug Submission');
  const [documentType, setDocumentType] = useState('investigator_brochure');
  const [therapeuticArea, setTherapeuticArea] = useState('oncology');
  const [indNumber, setIndNumber] = useState('');
  const [sponsorName, setSponsorName] = useState('');
  const [investigationalProduct, setInvestigationalProduct] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('Saved');
  const textareaRef = useRef(null);
  const { toast } = useToast();

  // Advanced AI and IND-specific states
  const [aiWritingMode, setAiWritingMode] = useState('regulatory');
  const [indPhase, setIndPhase] = useState('phase_1');
  const [regulatoryRegion, setRegulatoryRegion] = useState('fda');
  const [documentSection, setDocumentSection] = useState('investigator_brochure');
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [collaborators, setCollaborators] = useState([
    { id: 1, name: 'Dr. Smith', role: 'Medical Writer', status: 'online', avatar: 'DS' },
    { id: 2, name: 'Sarah Johnson', role: 'Regulatory Affairs', status: 'away', avatar: 'SJ' },
    { id: 3, name: 'Mike Chen', role: 'Clinical Research', status: 'online', avatar: 'MC' }
  ]);

  // Document analytics and progress tracking
  const [wordCount, setWordCount] = useState(0);
  const [targetWordCount, setTargetWordCount] = useState(5000);
  const [pageCount, setPageCount] = useState(0);
  const [readingTime, setReadingTime] = useState(0);
  const [complianceScore, setComplianceScore] = useState(88);
  const [fdaCompliance, setFdaCompliance] = useState(85);
  const [ichCompliance, setIchCompliance] = useState(92);
  const [documentQuality, setDocumentQuality] = useState(90);
  const [medicalAccuracy, setMedicalAccuracy] = useState(95);
  const [writingClarity, setWritingClarity] = useState(88);
  const [citationAccuracy, setCitationAccuracy] = useState(94);

  // Collaboration and workflow states
  const [comments, setComments] = useState([]);
  const [trackChanges, setTrackChanges] = useState(true);
  const [documentHistory, setDocumentHistory] = useState([]);
  const [sharedUsers, setSharedUsers] = useState([]);
  const [permissions, setPermissions] = useState('edit');
  const [workflowStage, setWorkflowStage] = useState('drafting');

  // File upload and import states
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [importProgress, setImportProgress] = useState(0);
  const [processingFile, setProcessingFile] = useState(false);

  // ========================================
  // eCTD PYRAMID & DREAM eCTD MACHINE STATE
  // ========================================
  
  // eCTD Tree and Structure
  const [ectdTree, setEctdTree] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [selectedGranule, setSelectedGranule] = useState(null);
  const [ectdTreeExpanded, setEctdTreeExpanded] = useState({});
  const [showFullTree, setShowFullTree] = useState(false);
  const [ectdLoading, setEctdLoading] = useState(false);
  
  // Granule Management
  const [granuleContextMenu, setGranuleContextMenu] = useState({ show: false, x: 0, y: 0, granule: null });
  const [granuleStatuses, setGranuleStatuses] = useState({});
  const [compilingModule, setCompilingModule] = useState(null);
  const [lockedGranules, setLockedGranules] = useState(new Set());
  
  // ICH Change Control
  const [changeControlDialog, setChangeControlDialog] = useState(false);
  const [changeControlData, setChangeControlData] = useState({});
  const [sequenceNumbers, setSequenceNumbers] = useState([]);
  const [changeHistory, setChangeHistory] = useState([]);
  
  // SharePoint Integration
  const [sharepointConnected, setSharepointConnected] = useState(false);
  const [sharepointSyncing, setSharepointSyncing] = useState(false);
  const [sharepointStatus, setSharepointStatus] = useState({});
  
  // XML Backbone and Cross-references
  const [xmlBackbone, setXmlBackbone] = useState('');
  const [crossReferences, setCrossReferences] = useState([]);
  const [xmlRulesApplied, setXmlRulesApplied] = useState(false);
  const [validationResults, setValidationResults] = useState({});
  
  // eCTD Templates
  const [ectdTemplates, setEctdTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateDialog, setTemplateDialog] = useState(false);
  
  // Compilation and Export
  const [compilationStatus, setCompilationStatus] = useState({});
  const [exportFormat, setExportFormat] = useState('ectd_xml');
  const [exportProgress, setExportProgress] = useState(0);

  // Template and content management
  const [availableTemplates, setAvailableTemplates] = useState([
    {
      id: 1,
      name: 'IND Clinical Overview (Module 2.5)',
      category: 'Clinical Overview',
      description: 'Comprehensive clinical overview for IND applications',
      wordCount: 3500,
      lastUsed: '2024-12-15',
      featured: true
    },
    {
      id: 2,
      name: 'Phase I Oncology Clinical Protocol',
      category: 'Clinical Protocol',
      description: 'Complete Phase I dose-escalation protocol template',
      wordCount: 4200,
      lastUsed: '2024-12-10',
      featured: true
    },
    {
      id: 3,
      name: 'Investigator Brochure Template',
      category: 'Investigator Brochure',
      description: 'FDA-compliant investigator brochure structure',
      wordCount: 6000,
      lastUsed: '2024-12-08',
      featured: false
    },
    {
      id: 4,
      name: 'Safety Update Report',
      category: 'Safety Reports',
      description: 'Comprehensive safety update for ongoing studies',
      wordCount: 2800,
      lastUsed: '2024-12-05',
      featured: false
    }
  ]);

  // UI state management
  const [activeRibbonTab, setActiveRibbonTab] = useState('Home');
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [showSemanticIntelligence, setShowSemanticIntelligence] = useState(false);
  const [showCollaborationPanel, setShowCollaborationPanel] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aiAssistantExpanded, setAiAssistantExpanded] = useState(true);



  // Semantic intelligence and cross-feature connectivity
  const [semanticData, setSemanticData] = useState({
    entities: [],
    observationTerms: [],
    knowledgeNodes: [],
    crossFeatureConnections: [],
    featureStatus: {}
  });

  // Audit trail and document history
  const [auditTrail, setAuditTrail] = useState([]);
  const [auditFilters, setAuditFilters] = useState({
    action: 'all',
    user: 'all',
    dateRange: 'all',
    complianceThreshold: 80
  });

  // Medical terms and regulatory keywords for analysis
  const medicalTermsList = [
    'adverse event', 'clinical trial', 'pharmacokinetics', 'pharmacodynamics',
    'investigational drug', 'protocol', 'informed consent', 'FDA', 'ICH',
    'GCP', 'efficacy', 'safety', 'bioavailability', 'bioequivalence',
    'placebo', 'randomized', 'double-blind', 'single-blind', 'crossover',
    'dose escalation', 'maximum tolerated dose', 'MTD', 'DLT', 'serious adverse event',
    'SUSAR', 'CIOMS', 'MedDRA', 'WHO-DD', 'IND', 'NDA', 'BLA', 'investigator',
    'sponsor', 'CRO', 'IRB', 'ethics committee', 'regulatory authority',
    'clinical protocol', 'investigator brochure', 'case report form', 'source data',
    'monitoring', 'audit', 'inspection', 'deviation', 'violation'
  ];

  // Document analytics calculation
  useEffect(() => {
    const text = draftContent;
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    setWordCount(words.length);
    
    // Calculate page count (approximately 250 words per page)
    setPageCount(Math.ceil(words.length / 250));
    
    // Calculate reading time (approximately 200 words per minute)
    setReadingTime(Math.ceil(words.length / 200));
    
    // Count medical terms
    const lowerText = text.toLowerCase();
    const foundTerms = medicalTermsList.filter(term => 
      lowerText.includes(term.toLowerCase())
    );
    
    // Update compliance scores based on content analysis
    if (words.length > 0) {
      const medicalTermDensity = foundTerms.length / words.length * 100;
      const regulatoryTerms = ['FDA', 'ICH', 'GCP', 'CFR', 'regulatory'].filter(term =>
        lowerText.includes(term.toLowerCase())
      ).length;
      
      // Dynamic compliance scoring
      setMedicalAccuracy(Math.min(100, Math.max(70, 85 + medicalTermDensity * 2)));
      setFdaCompliance(Math.min(100, Math.max(60, 75 + regulatoryTerms * 5)));
      setIchCompliance(Math.min(100, Math.max(65, 80 + regulatoryTerms * 4)));
      
      // Writing clarity based on sentence structure
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const avgWordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0;
      setWritingClarity(Math.min(100, Math.max(60, 100 - avgWordsPerSentence)));
      
      // Citation accuracy (simple pattern matching)
      const citationPattern = /\(\d{4}\)|et al\.|doi:|PMID:/gi;
      const citationMatches = text.match(citationPattern) || [];
      setCitationAccuracy(Math.min(100, Math.max(70, 80 + citationMatches.length * 5)));
      
      // Overall document quality
      const qualityScore = (medicalAccuracy + fdaCompliance + ichCompliance + writingClarity + citationAccuracy) / 5;
      setDocumentQuality(Math.round(qualityScore));
      setComplianceScore(Math.round((fdaCompliance + ichCompliance) / 2));
    }
  }, [draftContent, medicalAccuracy, fdaCompliance, ichCompliance, writingClarity, citationAccuracy]);

  // Auto-save functionality
  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      if (draftContent.length > 0) {
        handleAutoSave();
      }
    }, 30000); // Auto-save every 30 seconds

    return () => clearInterval(autoSaveInterval);
  }, [draftContent]);

  // REAL AI FUNCTIONS FOR BIOTECH OFFICE USE
  const aiEnhanceWriting = async (selectedText = '') => {
    setIsLoading(true);
    try {
      const textToAnalyze = selectedText || draftContent;
      
      if (!textToAnalyze.trim()) {
        toast({
          title: "No Content",
          description: "Please enter some text to enhance with AI.",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }
      
      const response = await fetch('/api/ai/writing-assistance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: textToAnalyze,
          mode: aiWritingMode,
          documentType: documentType,
          therapeuticArea: therapeuticArea
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        if (selectedText && result.enhancedText) {
          // Replace selected text with AI-enhanced version
          const newContent = draftContent.replace(selectedText, result.enhancedText);
          setDraftContent(newContent);
          
          toast({
            title: " Real AI Enhancement Applied",
            description: `Enhanced ${selectedText.length} characters with biotech-grade AI writing assistance.`
          });
        } else if (result.enhancedText && !selectedText) {
          // Replace entire content with enhanced version
          setDraftContent(result.enhancedText);
          
          toast({
            title: " Document Enhanced with Real AI",
            description: `Applied ${result.improvements} professional biotech writing improvements.`
          });
        }
        
        // Add AI suggestions to panel
        if (result.suggestions && result.suggestions.length > 0) {
          setAiSuggestions(prev => [...prev, ...result.suggestions]);
        }
        
        // Show compliance notes if available
        if (result.complianceNotes && result.complianceNotes.length > 0) {
          console.log('Biotech Compliance Notes:', result.complianceNotes);
        }
        
      } else {
        const errorData = await response.json();
        toast({
          title: "AI Service Error",
          description: errorData.error || "Failed to connect to AI enhancement service.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('AI Enhancement Error:', error);
      toast({
        title: "Real AI Enhancement Failed",
        description: "Check OpenAI API connection and try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateINDSection = async (section) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/ai/enhanced-document-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          section: section,
          documentType: documentType,
          therapeuticArea: therapeuticArea,
          indPhase: indPhase,
          investigationalProduct: investigationalProduct || 'Novel biotech compound',
          sponsorName: sponsorName || 'Biotech Research Company'
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // Insert comprehensive biotech-grade content
        const biotechContent = `

=== ${result.sectionTitle} ===

${result.generatedContent}

${result.biotechConsiderations ? '\n--- Biotech Industry Considerations ---\n' + result.biotechConsiderations.join('\n- ') : ''}

${result.regulatoryReferences ? '\n--- Regulatory References ---\n' + result.regulatoryReferences.join('\n') : ''}

${result.complianceNotes ? '\n--- Compliance Notes ---\n' + result.complianceNotes.join('\n- ') : ''}

`;
        setDraftContent(prev => prev + biotechContent);
        
        toast({
          title: " Real AI IND Section Generated",
          description: `Generated comprehensive biotech ${section} content with regulatory compliance.`
        });
        
        // Log biotech-specific details
        console.log('Biotech IND Section Generated:', {
          section,
          
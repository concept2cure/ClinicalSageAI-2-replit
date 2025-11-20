import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  Upload,
  Search,
  FilePlus,
  Shield,
  File,
  Folder,
  FolderOpen,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  FileText,
  Plus,
  Database,
  AlertCircle,
  Settings,
  Users,
  Cog,
  Calendar,
  Mail,
  Clock,
  ChevronDown,
  Trash2,
  Star,
  PenTool,
  FolderPlus,
  FilePlus2,
  Inbox,
  SendHorizontal,
  Archive,
  Book,
  ClipboardList,
  Bookmark,
  BookOpen,
  CheckSquare,
  Download,
  PlusCircle,
  Filter,
  Layers,
  Paperclip,
  Share2,
  HelpCircle,
  Menu,
  LogOut,
  Info,
  Grid,
  LayoutDashboard,
  Circle,
  ArrowRight,
  Edit,
  Play,
  Loader2,
  ArrowLeft,
  ClipboardCheck,
  Check,
  FileDigit,
  Send,
  X,
  AlignJustify,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toaster';
import DeviceProfileDialog from './DeviceProfileDialog';
import PredicateDeviceComparison from './PredicateDeviceComparison';
import kAutomationController from '../../controllers/KAutomationController';

export default function KAutomationPanel() {
  const [selectedModule, setSelectedModule] = useState('510k');
  const [workflowSubTab, setWorkflowSubTab] = useState('device-profile');
  const [cerWorkflowTab, setCerWorkflowTab] = useState('builder');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [deviceProfiles, setDeviceProfiles] = useState([]);
  const [currentDeviceProfile, setCurrentDeviceProfile] = useState(null);
  const [showDeviceProfileDialog, setShowDeviceProfileDialog] = useState(false);
  const [showDeviceSetupDialog, setShowDeviceSetupDialog] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState({
    devices: true,
    templates: false,
    reports: false,
    submissions: false,
  });
  const [cerSections, setCerSections] = useState(0);
  const [reportTitle, setReportTitle] = useState('Clinical Evaluation Report');
  const [cerCompliant, setCerCompliant] = useState(true);

  // Predicate device states
  const [predicateDevices, setPredicateDevices] = useState([]);
  const [searchingPredicates, setSearchingPredicates] = useState(false);
  const [selectedPredicates, setSelectedPredicates] = useState([]);
  const [predicateComparisonReady, setPredicateComparisonReady] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    // Fetch device profiles from API
    const fetchDeviceProfiles = async () => {
      try {
        // Use the imported KAutomationController to fetch device profiles
        const profiles = await kAutomationController.fetchDeviceProfiles();
        setDeviceProfiles(profiles);
      } catch (error) {
        console.error('Error fetching device profiles:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch device profiles. Please try again later.',
          variant: 'destructive',
        });
      }
    };

    fetchDeviceProfiles();
  }, [toast]);

  const toggleFolder = folderName => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderName]: !prev[folderName],
    }));
  };

  const handleSelectDeviceProfile = profile => {
    setCurrentDeviceProfile(profile);

    // Auto-navigate to device profile tab
    setWorkflowSubTab('device-profile');

    toast({
      title: 'Device Profile Selected',
      description: `You've selected the ${profile.deviceName} profile.`,
      duration: 3000,
    });
  };

  // Handler for creating a new device profile
  const handleCreateDeviceProfile = async profileData => {
    try {
      // Create device profile using the controller
      const newProfile = await kAutomationController.createDeviceProfile(profileData);

      // Update the device profiles list
      setDeviceProfiles(prev => [...prev, newProfile]);

      // Auto-select the newly created profile
      setCurrentDeviceProfile(newProfile);

      // Close the dialog
      setShowDeviceProfileDialog(false);

      // Navigate to device profile tab
      setWorkflowSubTab('device-profile');

      toast({
        title: 'Device Profile Created',
        description: `${newProfile.deviceName} has been created successfully.`,
        duration: 3000,
      });
    } catch (error) {
      console.error('Error creating device profile:', error);

      toast({
        title: 'Error',
        description: 'Failed to create device profile. Please try again.',
        variant: 'destructive',
        duration: 3000,
      });
    }
  };

  // Handler for finding predicate devices
  const handleFindPredicateDevices = async () => {
    if (!currentDeviceProfile) {
      toast({
        title: 'No Device Selected',
        description: 'Please select or create a device profile first.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Navigate to predicate finder tab
      setWorkflowSubTab('predicate-finder');

      // Set searching state
      setSearchingPredicates(true);

      toast({
        title: 'Searching for Predicates',
        description: 'Finding similar predicate devices for your submission...',
        duration: 2000,
      });

      // Use the current device profile data for the search
      const searchCriteria = {
        deviceName: currentDeviceProfile.deviceName,
        deviceClass: currentDeviceProfile.deviceClass,
        manufacturer: currentDeviceProfile.manufacturer,
        intendedUse: currentDeviceProfile.intendedUse,
        technologyType: currentDeviceProfile.technologyType,
        limit: 10,
      };

      // Search for predicate devices
      const result = await kAutomationController.findPredicateDevices(searchCriteria);

      if (result.success && result.predicates && result.predicates.length > 0) {
        // Store the found predicate devices
        setPredicateDevices(result.predicates);

        // Reset selected predicates
        setSelectedPredicates([]);

        // Set comparison not ready yet (until user selects predicates)
        setPredicateComparisonReady(false);

        toast({
          title: 'Predicates Found',
          description: `Found ${result.predicates.length} potential predicate devices.`,
          duration: 3000,
        });
      } else {
        setPredicateDevices([]);
        setSelectedPredicates([]);
        setPredicateComparisonReady(false);

        toast({
          title: 'No Predicates Found',
          description:
            'No matching predicate devices were found. Try adjusting your device profile.',
          variant: 'destructive',
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Error finding predicate devices:', error);

      toast({
        title: 'Search Error',
        description: 'Failed to search for predicate devices. Please try again.',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setSearchingPredicates(false);
    }
  };

  // Handler for selecting a predicate device for comparison
  const handleSelectPredicate = predicateDevice => {
    setSelectedPredicates(prev => {
      // Check if already selected
      const isAlreadySelected = prev.some(p => p.id === predicateDevice.id);

      if (isAlreadySelected) {
        // Remove from selection
        const updated = prev.filter(p => p.id !== predicateDevice.id);
        setPredicateComparisonReady(updated.length > 0);
        return updated;
      } else {
        // Add to selection
        const updated = [...prev, predicateDevice];
        setPredicateComparisonReady(true);
        return updated;
      }
    });
  };

  // Handler for running a compliance check
  const handleRunComplianceCheck = async () => {
    if (!currentDeviceProfile) {
      toast({
        title: 'No Device Selected',
        description: 'Please select or create a device profile first.',
        variant: 'destructive',
      });
      return;
    }

    if (selectedPredicates.length === 0) {
      toast({
        title: 'No Predicates Selected',
        description: 'Please select at least one predicate device for comparison.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Navigate to compliance tab
      setWorkflowSubTab('compliance');

      toast({
        title: 'Running Compliance Check',
        description: 'Analyzing submission for FDA requirements and standards...',
        duration: 2000,
      });

      // Create project ID from device profile
      const projectId = currentDeviceProfile.id;

      // Run compliance check
      const result = await kAutomationController.runComplianceCheck(projectId, {
        predicateDevices: selectedPredicates,
        strictValidation: true,
        includeStandards: true,
      });

      if (result && result.valid) {
        toast({
          title: 'Compliance Check Passed',
          description: 'Your submission meets all FDA requirements.',
          duration: 3000,
        });
      } else if (result && result.issues) {
        toast({
          title: 'Compliance Issues Found',
          description: `Found ${result.issues.length} issues that need addressing.`,
          variant: 'destructive',
          duration: 3000,
        });
      } else {
        toast({
          title: 'Compliance Check Failed',
          description: 'Could not complete compliance check. Please try again.',
          variant: 'destructive',
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Error running compliance check:', error);

      toast({
        title: 'Error',
        description: 'Failed to run compliance check. Please try again.',
        variant: 'destructive',
        duration: 3000,
      });
    }
  };

  // Handler for generating eSTAR package
  const handleGenerateESTAR = async () => {
    if (!currentDeviceProfile) {
      toast({
        title: 'No Device Selected',
        description: 'Please select or create a device profile first.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Navigate to final review tab
      setWorkflowSubTab('final-review');

      toast({
        title: 'Generating eSTAR Package',
        description: 'Creating FDA-ready submission package...',
        duration: 3000,
      });

      // Create project ID from device profile
      const projectId = currentDeviceProfile.id;

      // Generate eSTAR package
      const result = await kAutomationController.generateESTARPackage(projectId, {
        includePredicates: selectedPredicates.length > 0,
        format: 'pdf',
      });

      if (result && result.success && result.downloadUrl) {
        toast({
          title: 'eSTAR Package Generated',
          description: 'Your FDA submission package is ready for download.',
          duration: 3000,
        });
      } else {
        toast({
          title: 'Generation Failed',
          description: 'Could not generate eSTAR package. Please try again.',
          variant: 'destructive',
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Error generating eSTAR package:', error);

      toast({
        title: 'Error',
        description: 'Failed to generate eSTAR package. Please try again.',
        variant: 'destructive',
        duration: 3000,
      });
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden border rounded-lg bg-white shadow-md w-full max-w-none mx-0">
      <div
        className={`bg-[#f3f2f1] border-r flex flex-col ${sidebarCollapsed ? 'w-16' : 'w-16 md:w-60'} transition-all duration-300`}
      >
        {/* Top app navigation */}
        <div className="flex justify-between items-center p-3 border-b border-gray-200">
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center w-full' : ''}`}>
            {!sidebarCollapsed && (
              <span className="font-semibold text-gray-800 ml-2">TrialSage</span>
            )}
            {sidebarCollapsed && <LayoutDashboard className="h-5 w-5 text-blue-700" />}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="p-1"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        {/* Main app navigation */}
        <div className="flex flex-col py-2">
          <Button
            variant={selectedModule === '510k' ? 'subtle' : 'ghost'}
            className={`flex items-center justify-${sidebarCollapsed ? 'center' : 'start'} mb-1 ${selectedModule === '510k' ? 'bg-blue-100 text-blue-800' : ''}`}
            onClick={() => setSelectedModule('510k')}
          >
            <FileCheck className="h-5 w-5 min-w-5" />
            {!sidebarCollapsed && <span className="ml-3 text-sm">510(k) Workflow</span>}
          </Button>

          <Button
            variant={selectedModule === 'cer' ? 'subtle' : 'ghost'}
            className={`flex items-center justify-${sidebarCollapsed ? 'center' : 'start'} mb-1 ${selectedModule === 'cer' ? 'bg-blue-100 text-blue-800' : ''}`}
            onClick={() => setSelectedModule('cer')}
          >
            <ClipboardList className="h-5 w-5 min-w-5" />
            {!sidebarCollapsed && <span className="ml-3 text-sm">CER Generator</span>}
          </Button>

          <Button
            variant="ghost"
            className={`flex items-center justify-${sidebarCollapsed ? 'center' : 'start'} mb-1`}
          >
            <BookOpen className="h-5 w-5 min-w-5" />
            {!sidebarCollapsed && <span className="ml-3 text-sm">Knowledge Base</span>}
          </Button>

          <Button
            variant="ghost"
            className={`flex items-center justify-${sidebarCollapsed ? 'center' : 'start'} mb-1`}
          >
            <Archive className="h-5 w-5 min-w-5" />
            {!sidebarCollapsed && <span className="ml-3 text-sm">Archives</span>}
          </Button>
        </div>

        {/* Bottom options */}
        <div className="mt-auto border-t border-gray-200 pt-2 pb-4">
          <Button
            variant="ghost"
            className={`flex items-center justify-${sidebarCollapsed ? 'center' : 'start'} mb-1 w-full`}
            size="sm"
          >
            <Cog className="h-5 w-5 min-w-5" />
            {!sidebarCollapsed && <span className="ml-3 text-sm">Settings</span>}
          </Button>

          <Button
            variant="ghost"
            className={`flex items-center justify-${sidebarCollapsed ? 'center' : 'start'} mb-1 w-full`}
            size="sm"
          >
            <HelpCircle className="h-5 w-5 min-w-5" />
            {!sidebarCollapsed && <span className="ml-3 text-sm">Help</span>}
          </Button>
        </div>
      </div>

      {/* File tree sidebar - Similar to Microsoft 365 Outlook folders */}
      <div
        className={`${selectedModule === '510k' ? 'block' : 'hidden'} w-60 border-r border-gray-200 bg-white`}
      >
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center">
            <FileCheck className="h-5 w-5 mr-2 text-blue-600" />
            510(k) Workflow
          </h2>
        </div>

        <div className="p-2">
          <Input type="search" placeholder="Search files..." className="mb-2 bg-gray-50" />
        </div>

        <ScrollArea className="h-[calc(100vh-12rem)]">
          <div className="p-2">
            {/* Devices folder */}
            <div className="mb-1">
              <button
                className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 flex items-center"
                onClick={() => toggleFolder('devices')}
              >
                <ChevronRight
                  className={`h-4 w-4 mr-1 transition-transform ${expandedFolders.devices ? 'rotate-90' : ''}`}
                />
                <Folder className="h-4 w-4 mr-2 text-yellow-500" />
                <span className="text-sm font-medium">Device Profiles</span>
                <Badge className="ml-auto text-xs bg-blue-100 text-blue-800 hover:bg-blue-200">
                  {deviceProfiles?.length || 0}
                </Badge>
              </button>

              {expandedFolders.devices && deviceProfiles && (
                <div className="ml-7 mt-1">
                  {deviceProfiles.map(profile => (
                    <button
                      key={profile.id}
                      className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center mb-1 ${
                        currentDeviceProfile?.id === profile.id
                          ? 'bg-blue-50 text-blue-700'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => handleSelectDeviceProfile(profile)}
                    >
                      <File className="h-4 w-4 mr-2 text-gray-500" />
                      <span className="truncate">{profile.deviceName}</span>
                    </button>
                  ))}

                  <button
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center text-blue-600"
                    onClick={() => {
                      // Open the device profile dialog
                      document.getElementById('create-profile-button')?.click();
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    <span>Add New Profile</span>
                  </button>
                </div>
              )}
            </div>

            {/* Templates folder */}
            <div className="mb-1">
              <button
                className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 flex items-center"
                onClick={() => toggleFolder('templates')}
              >
                <ChevronRight
                  className={`h-4 w-4 mr-1 transition-transform ${expandedFolders.templates ? 'rotate-90' : ''}`}
                />
                <Folder className="h-4 w-4 mr-2 text-yellow-500" />
                <span className="text-sm font-medium">Templates</span>
              </button>

              {expandedFolders.templates && (
                <div className="ml-7 mt-1">
                  <button className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center mb-1">
                    <File className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="truncate">510(k) Template</span>
                  </button>
                  <button className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center mb-1">
                    <File className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="truncate">eSTAR Template</span>
                  </button>
                  <button className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center mb-1">
                    <File className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="truncate">Predicate Comparison</span>
                  </button>
                </div>
              )}
            </div>

            {/* Reports folder */}
            <div className="mb-1">
              <button
                className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 flex items-center"
                onClick={() => toggleFolder('reports')}
              >
                <ChevronRight
                  className={`h-4 w-4 mr-1 transition-transform ${expandedFolders.reports ? 'rotate-90' : ''}`}
                />
                <Folder className="h-4 w-4 mr-2 text-yellow-500" />
                <span className="text-sm font-medium">Reports</span>
              </button>

              {expandedFolders.reports && (
                <div className="ml-7 mt-1">
                  <button className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center mb-1">
                    <File className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="truncate">Compliance Report</span>
                  </button>
                  <button className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center mb-1">
                    <File className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="truncate">Validation Report</span>
                  </button>
                </div>
              )}
            </div>

            {/* Submissions folder */}
            <div className="mb-1">
              <button
                className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 flex items-center"
                onClick={() => toggleFolder('submissions')}
              >
                <ChevronRight
                  className={`h-4 w-4 mr-1 transition-transform ${expandedFolders.submissions ? 'rotate-90' : ''}`}
                />
                <Folder className="h-4 w-4 mr-2 text-yellow-500" />
                <span className="text-sm font-medium">Submissions</span>
              </button>

              {expandedFolders.submissions && (
                <div className="ml-7 mt-1">
                  <button className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center mb-1">
                    <File className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="truncate">Draft Submissions</span>
                  </button>
                  <button className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center mb-1">
                    <File className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="truncate">Completed Submissions</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* CER file tree sidebar - Only visible when CER is selected */}
      <div
        className={`${selectedModule === 'cer' ? 'block' : 'hidden'} w-60 border-r border-gray-200 bg-white`}
      >
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center">
            <ClipboardList className="h-5 w-5 mr-2 text-blue-600" />
            CER Generator
          </h2>
        </div>

        <div className="p-2">
          <Input type="search" placeholder="Search files..." className="mb-2 bg-gray-50" />
        </div>

        <ScrollArea className="h-[calc(100vh-12rem)]">
          <div className="p-2">
            {/* CER Documents folder */}
            <div className="mb-1">
              <button
                className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 flex items-center"
                onClick={() => toggleFolder('devices')}
              >
                <ChevronRight
                  className={`h-4 w-4 mr-1 transition-transform ${expandedFolders.devices ? 'rotate-90' : ''}`}
                />
                <Folder className="h-4 w-4 mr-2 text-yellow-500" />
                <span className="text-sm font-medium">Clinical Documents</span>
              </button>

              {expandedFolders.devices && (
                <div className="ml-7 mt-1">
                  <button className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center mb-1">
                    <File className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="truncate">Clinical Documentation</span>
                  </button>
                  <button className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center mb-1">
                    <File className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="truncate">Literature Search</span>
                  </button>
                  <button className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center mb-1">
                    <File className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="truncate">Risk Analysis</span>
                  </button>
                </div>
              )}
            </div>

            {/* CER Templates folder */}
            <div className="mb-1">
              <button
                className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 flex items-center"
                onClick={() => toggleFolder('templates')}
              >
                <ChevronRight
                  className={`h-4 w-4 mr-1 transition-transform ${expandedFolders.templates ? 'rotate-90' : ''}`}
                />
                <Folder className="h-4 w-4 mr-2 text-yellow-500" />
                <span className="text-sm font-medium">CER Templates</span>
              </button>

              {expandedFolders.templates && (
                <div className="ml-7 mt-1">
                  <button className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center mb-1">
                    <File className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="truncate">MDR Template</span>
                  </button>
                  <button className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center mb-1">
                    <File className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="truncate">MEDDEV Template</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col bg-[#f5f5f5]">
        {/* Top header bar */}
        <div className="bg-white border-b flex items-center justify-between p-3">
          <div className="flex items-center">
            <h1 className="font-semibold text-xl text-gray-800 mr-8">
              {selectedModule === '510k' ? '510(k) Submission Workflow' : 'CER Generator'}
            </h1>

            <div className="hidden md:flex items-center space-x-1">
              <Button variant="ghost" size="sm">
                <PlusCircle className="h-4 w-4 mr-1" />
                <span className="text-sm">New</span>
              </Button>

              <Button variant="ghost" size="sm">
                <Download className="h-4 w-4 mr-1" />
                <span className="text-sm">Export</span>
              </Button>

              <Button variant="ghost" size="sm">
                <Bookmark className="h-4 w-4 mr-1" />
                <span className="text-sm">Save</span>
              </Button>
            </div>
          </div>

          <div className="flex items-center">
            <Avatar className="h-8 w-8">
              <AvatarImage src="" alt="User" />
              <AvatarFallback className="bg-blue-600 text-white">TR</AvatarFallback>
            </Avatar>
          </div>
        </div>

        {/* Main workflow panel */}
        <div className="flex-1 overflow-auto p-4">
          {/* 1. Device Profile Tab */}
          {selectedModule === '510k' && workflowSubTab === 'device-profile' && (
            <div className="grid gap-4">
              <div className="bg-white border rounded-lg p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-800">Device Profile</h2>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    Step 1 of 4
                  </Badge>
                </div>

                <div className="space-y-4">
                  {/* Device profile creation or selection UI */}
                  {!currentDeviceProfile ? (
                    <div className="border rounded-lg p-6 bg-blue-50 border-blue-100 text-center">
                      <FileText className="h-12 w-12 text-blue-500 mx-auto mb-3" />
                      <h3 className="text-lg font-medium text-gray-800 mb-2">
                        No Device Profile Selected
                      </h3>
                      <p className="text-gray-600 mb-4 max-w-md mx-auto">
                        Create or select a device profile to begin the 510(k) submission process.
                        This will be the basis for your regulatory submission.
                      </p>
                      <Button
                        id="create-profile-button"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => setShowDeviceProfileDialog(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create New Device Profile
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="border rounded-lg p-4">
                          <h3 className="text-md font-medium text-gray-700 mb-3 flex items-center">
                            <FileCheck className="h-4 w-4 mr-2 text-blue-600" />
                            Device Information
                          </h3>
                          <dl className="grid grid-cols-2 gap-3 text-sm">
                            <dt className="text-gray-500">Device Name:</dt>
                            <dd className="font-medium">{currentDeviceProfile.deviceName}</dd>

                            <dt className="text-gray-500">Device Class:</dt>
                            <dd className="font-medium">
                              {currentDeviceProfile.deviceClass || 'Class II'}
                            </dd>

                            <dt className="text-gray-500">Manufacturer:</dt>
                            <dd className="font-medium">{currentDeviceProfile.manufacturer}</dd>

                            <dt className="text-gray-500">Device Type:</dt>
                            <dd className="font-medium">
                              {currentDeviceProfile.deviceType || 'Medical Device'}
                            </dd>
                          </dl>
                        </div>

                        <div className="border rounded-lg p-4">
                          <h3 className="text-md font-medium text-gray-700 mb-3 flex items-center">
                            <ClipboardList className="h-4 w-4 mr-2 text-blue-600" />
                            Submission Information
                          </h3>
                          <dl className="grid grid-cols-2 gap-3 text-sm">
                            <dt className="text-gray-500">Submission Type:</dt>
                            <dd className="font-medium">Traditional 510(k)</dd>

                            <dt className="text-gray-500">eCopy ID:</dt>
                            <dd className="font-medium">{`K${Math.floor(Math.random() * 900000) + 100000}`}</dd>

                            <dt className="text-gray-500">Status:</dt>
                            <dd>
                              <Badge
                                variant="outline"
                                className="text-amber-600 border-amber-200 bg-amber-50"
                              >
                                In Progress
                              </Badge>
                            </dd>

                            <dt className="text-gray-500">Created:</dt>
                            <dd className="font-medium">May 15, 2025</dd>
                          </dl>
                        </div>
                      </div>

                      <div className="mt-6 flex justify-between">
                        <Button variant="outline">
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Profile
                        </Button>

                        <Button
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={() => {
                            setWorkflowSubTab('device-setup');
                            setShowDeviceSetupDialog(true);
                          }}
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Continue to Device Setup
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. Predicate Finder Tab */}
          {selectedModule === '510k' && workflowSubTab === 'predicate-finder' && (
            <div className="grid gap-4">
              <div className="bg-white border rounded-lg p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-800">Predicate Device Finder</h2>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    Step 2 of 4
                  </Badge>
                </div>

                <div className="space-y-4">
                  {currentDeviceProfile ? (
                    <div>
                      <div className="flex items-center mb-4">
                        <div className="flex-1">
                          <h3 className="text-md font-medium text-gray-700">
                            Finding predicates for:
                          </h3>
                          <p className="text-lg font-semibold text-gray-900">
                            {currentDeviceProfile.deviceName}
                          </p>
                        </div>

                        {searchingPredicates ? (
                          <Button disabled className="ml-4">
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Searching...
                          </Button>
                        ) : (
                          <Button
                            onClick={handleFindPredicateDevices}
                            className="bg-blue-600 hover:bg-blue-700 text-white ml-4"
                          >
                            <Search className="h-4 w-4 mr-2" />
                            Find Predicate Devices
                          </Button>
                        )}
                      </div>

                      {predicateDevices.length > 0 ? (
                        <div className="space-y-4">
                          <p className="text-sm text-gray-600">
                            Select at least one predicate device to compare with your subject
                            device. These will be used to establish substantial equivalence.
                          </p>

                          <div className="border rounded-lg overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th
                                    scope="col"
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                  >
                                    Select
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                  >
                                    Device Name
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                  >
                                    Manufacturer
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                  >
                                    510(k) Number
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                  >
                                    Match Score
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {predicateDevices.map(device => (
                                  <tr
                                    key={device.id}
                                    className={`hover:bg-gray-50 cursor-pointer ${
                                      selectedPredicates.some(p => p.id === device.id)
                                        ? 'bg-blue-50'
                                        : ''
                                    }`}
                                    onClick={() => handleSelectPredicate(device)}
                                  >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="flex items-center">
                                        <input
                                          type="checkbox"
                                          className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                          checked={selectedPredicates.some(p => p.id === device.id)}
                                          onChange={() => {}}
                                        />
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="text-sm font-medium text-gray-900">
                                        {device.deviceName}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="text-sm text-gray-500">
                                        {device.manufacturer}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="text-sm text-gray-500">
                                        {device.k510Number ||
                                          `K${Math.floor(Math.random() * 900000) + 100000}`}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="flex items-center">
                                        <div
                                          className="w-16 bg-gray-200 rounded-full h-2.5 mr-2"
                                          title={`${device.matchScore || Math.floor(device.relevance * 100) || 85}%`}
                                        >
                                          <div
                                            className="bg-blue-600 h-2.5 rounded-full"
                                            style={{
                                              width: `${device.matchScore || Math.floor(device.relevance * 100) || 85}%`,
                                            }}
                                          ></div>
                                        </div>
                                        <span className="text-sm font-medium text-gray-700">
                                          {device.matchScore ||
                                            Math.floor(device.relevance * 100) ||
                                            85}
                                          %
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {selectedPredicates.length > 0 && (
                            <div className="mt-4">
                              <PredicateDeviceComparison
                                subjectDevice={currentDeviceProfile}
                                predicateDevices={selectedPredicates}
                              />

                              <div className="flex justify-between mt-6">
                                <Button
                                  variant="outline"
                                  onClick={() => setWorkflowSubTab('device-profile')}
                                >
                                  <ArrowLeft className="h-4 w-4 mr-2" />
                                  Back to Device Profile
                                </Button>

                                <Button
                                  className="bg-blue-600 hover:bg-blue-700 text-white"
                                  onClick={handleRunComplianceCheck}
                                  disabled={!predicateComparisonReady}
                                >
                                  <ClipboardCheck className="h-4 w-4 mr-2" />
                                  Run Compliance Check
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="border rounded-lg p-6 bg-blue-50 border-blue-100 text-center">
                          <Search className="h-12 w-12 text-blue-500 mx-auto mb-3" />
                          <h3 className="text-lg font-medium text-gray-800 mb-2">
                            No Predicate Devices Found
                          </h3>
                          <p className="text-gray-600 mb-4 max-w-md mx-auto">
                            Use the "Find Predicate Devices" button to search for potential
                            predicate devices that are substantially equivalent to your subject
                            device.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="border rounded-lg p-6 bg-amber-50 border-amber-100 text-center">
                      <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
                      <h3 className="text-lg font-medium text-gray-800 mb-2">
                        No Device Profile Selected
                      </h3>
                      <p className="text-gray-600 mb-4 max-w-md mx-auto">
                        You need to create or select a device profile before finding predicate
                        devices.
                      </p>
                      <Button variant="outline" onClick={() => setWorkflowSubTab('device-profile')}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Go to Device Profile
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 3. Compliance Check Tab */}
          {selectedModule === '510k' && workflowSubTab === 'compliance' && (
            <div className="grid gap-4">
              <div className="bg-white border rounded-lg p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-800">Compliance Check</h2>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    Step 3 of 4
                  </Badge>
                </div>

                <div className="space-y-4">
                  {currentDeviceProfile && selectedPredicates.length > 0 ? (
                    <div>
                      <p className="text-gray-600 mb-4">
                        The system will analyze your submission for FDA compliance and verify your
                        predicate device comparison.
                      </p>

                      {/* Content will be implemented in the next iteration */}
                      <div className="border rounded-lg p-6 bg-blue-50 border-blue-100 text-center">
                        <ClipboardCheck className="h-12 w-12 text-blue-500 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-gray-800 mb-2">
                          Compliance Check in Progress
                        </h3>
                        <p className="text-gray-600 mb-4 max-w-md mx-auto">
                          Analyzing your submission for FDA requirements and standards compliance.
                        </p>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                          <div className="bg-blue-600 h-2.5 rounded-full w-3/4"></div>
                        </div>
                      </div>

                      <div className="flex justify-between mt-6">
                        <Button
                          variant="outline"
                          onClick={() => setWorkflowSubTab('predicate-finder')}
                        >
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          Back to Predicate Finder
                        </Button>

                        <Button
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={handleGenerateESTAR}
                        >
                          <FileDigit className="h-4 w-4 mr-2" />
                          Generate eSTAR Package
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="border rounded-lg p-6 bg-amber-50 border-amber-100 text-center">
                      <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
                      <h3 className="text-lg font-medium text-gray-800 mb-2">
                        Missing Required Information
                      </h3>
                      <p className="text-gray-600 mb-4 max-w-md mx-auto">
                        You need to complete the previous steps before running a compliance check.
                      </p>
                      <Button variant="outline" onClick={() => setWorkflowSubTab('device-profile')}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Start from Beginning
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 4. Final Review Tab */}
          {selectedModule === '510k' && workflowSubTab === 'final-review' && (
            <div className="grid gap-4">
              <div className="bg-white border rounded-lg p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-800">Final Review & Submission</h2>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    Step 4 of 4
                  </Badge>
                </div>

                <div className="space-y-4">
                  {/* Content will be implemented in the next iteration */}
                  <div className="border rounded-lg p-6 bg-green-50 border-green-100 text-center">
                    <Check className="h-12 w-12 text-green-500 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-gray-800 mb-2">
                      eSTAR Package Generated Successfully
                    </h3>
                    <p className="text-gray-600 mb-4 max-w-md mx-auto">
                      Your FDA submission package is ready for final review and submission.
                    </p>
                    <Button className="bg-green-600 hover:bg-green-700 text-white">
                      <Download className="h-4 w-4 mr-2" />
                      Download eSTAR Package
                    </Button>
                  </div>

                  <div className="flex justify-between mt-6">
                    <Button variant="outline" onClick={() => setWorkflowSubTab('compliance')}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Compliance Check
                    </Button>

                    <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                      <Send className="h-4 w-4 mr-2" />
                      Submit to FDA
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Device Setup Dialog */}
      <Dialog open={showDeviceSetupDialog} onOpenChange={setShowDeviceSetupDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Device Configuration</DialogTitle>
            <DialogDescription>
              Configure system parameters for your device submission workflow.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Validation Mode
              </Label>
              <Select defaultValue="standard">
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="username" className="text-right">
                eSTAR Template
              </Label>
              <Select defaultValue="standard">
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard Template</SelectItem>
                  <SelectItem value="abbreviated">Abbreviated 510(k)</SelectItem>
                  <SelectItem value="special">Special 510(k)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">AI Assistance</Label>
              <div className="flex items-center space-x-4 col-span-3">
                <Switch id="aiassist" />
                <Label htmlFor="aiassist">Enable AI-powered features</Label>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Auto-Validation</Label>
              <div className="flex items-center space-x-4 col-span-3">
                <Switch id="autovalidate" />
                <Label htmlFor="autovalidate">Enable automatic validation checks</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeviceSetupDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                toast({
                  title: 'Configuration Saved',
                  description: 'Your device setup has been configured successfully',
                });

                setShowDeviceSetupDialog(false);

                // Move to compliance tab
                setWorkflowSubTab('compliance');
              }}
            >
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Device Profile Dialog */}
      {showDeviceProfileDialog && (
        <DeviceProfileDialog
          buttonText="Create Device Profile"
          buttonVariant="default"
          buttonClassName="hidden"
          dialogTitle="Device Profile"
          dialogDescription="Enter the details for your medical device to begin the 510(k) submission process."
          onSuccessfulSubmit={handleCreateDeviceProfile}
          isStartingPoint={deviceProfiles.length === 0}
          showBadge={true}
        />
      )}
    </div>
  );
}

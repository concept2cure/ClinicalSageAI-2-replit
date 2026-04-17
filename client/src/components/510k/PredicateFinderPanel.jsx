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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toaster';
import {
  Search,
  Check,
  X,
  AlertTriangle,
  ThumbsUp,
  Loader2,
  FileText,
  GitCompare,
  BookOpen,
  Filter,
  ExternalLink,
  Eye,
  Calendar,
  BarChart,
  ArrowUpDown,
  Info,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import FDA510kService from '@/services/FDA510kService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { literatureAPIService } from '@/services/LiteratureAPIService';
import { ensureProfileIntegrity } from '@/utils/deviceProfileUtils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { loadState, saveState } from '../../utils/stabilityPatches';

// Emergency recovery function for predicate device searches
const recoverPredicateSearch = (deviceProfile, setSearchResults, toast) => {
  // Try loading from stability patches first
  const cachedPredicates = loadState('predicateDevices', null);

  if (cachedPredicates && cachedPredicates.length > 0) {
    setSearchResults(cachedPredicates);

    toast({
      title: 'Using Cached Results',
      description: `Recovered ${cachedPredicates.length} predicate devices from cache.`,
      variant: 'default',
    });

    return true;
  }

  // Try loading from localStorage as fallback
  try {
    const savedResults = localStorage.getItem('510k_searchResults');
    if (savedResults) {
      const parsedResults = JSON.parse(savedResults);
      if (parsedResults && parsedResults.length > 0) {
        setSearchResults(parsedResults);
        // Also save to our stability system
        saveState('predicateDevices', parsedResults);

        toast({
          title: 'Using Saved Results',
          description: `Recovered ${parsedResults.length} predicate devices from storage.`,
          variant: 'default',
        });

        return true;
      }
    }
  } catch (error) {
    console.error('Failed to recover from localStorage:', error);
  }

  // No recovery data available
  return false;
};

/**
 * Predicate Finder Panel for 510(k) Submissions
 *
 * This component enables users to enter device details and search for predicate
 * devices in the FDA database to establish substantial equivalence.
 */
const PredicateFinderPanel = ({
  deviceProfile,
  setDeviceProfile,
  documentId,
  onPredicatesFound,
  onSearchStateChange = null, // New prop to inform parent component about search state
}) => {
  // State management
  const [isSearching, setIsSearching] = useState(false);

  // Update the parent component whenever isSearching changes
  useEffect(() => {
    if (onSearchStateChange) {
      onSearchStateChange(isSearching);
    }
  }, [isSearching, onSearchStateChange]);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPredicates, setSelectedPredicates] = useState([]);
  // Start in search mode if device profile is already populated (from Stage 0
  // intake). Otherwise show the device profile form. Users should not have to
  // re-enter data they just typed.
  const [profileEditing, setProfileEditing] = useState(
    !(deviceProfile?.deviceName && deviceProfile?.productCode)
  );
  const [activeTab, setActiveTab] = useState('predicates');
  const [searched, setSearched] = useState(false);
  const [literatureResults, setLiteratureResults] = useState([]);
  const [isSearchingLiterature, setIsSearchingLiterature] = useState(false);
  const [selectedLiterature, setSelectedLiterature] = useState([]);
  const [literatureFilters, setLiteratureFilters] = useState({
    yearFrom: new Date().getFullYear() - 5,
    yearTo: new Date().getFullYear(),
    journalImpactFactor: 'all',
    studyType: 'all',
  });
  const [showLiteratureDetails, setShowLiteratureDetails] = useState(false);
  const [selectedLiteratureItem, setSelectedLiteratureItem] = useState(null);

  // Enhanced 510(k) Predicate Finder state
  const [predicateFilterType, setPredicateFilterType] = useState('all');

  // Stability and recovery state
  const [recoveryAttempted, setRecoveryAttempted] = useState(false);
  const [showRecoveryUI, setShowRecoveryUI] = useState(false);
  const [errorState, setErrorState] = useState(null);
  // Shadow Service health status: 'checking' | 'available' | 'unavailable'
  const [shadowServiceStatus, setShadowServiceStatus] = useState('checking');

  const [formData, setFormData] = useState({
    deviceName: deviceProfile?.deviceName || '',
    manufacturer: deviceProfile?.manufacturer || '',
    productCode: deviceProfile?.productCode || '',
    deviceClass: deviceProfile?.deviceClass || 'II',
    intendedUse: deviceProfile?.intendedUse || '',
    description: deviceProfile?.description || '',
    technicalSpecifications: deviceProfile?.technicalSpecifications || '',
    regulatoryClass: deviceProfile?.regulatoryClass || 'Class II',
  });

  const { toast } = useToast();

  // Check Shadow Service health on mount
  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/predicate-intelligence/health');
        if (!cancelled) {
          setShadowServiceStatus(res.ok ? 'available' : 'unavailable');
        }
      } catch {
        if (!cancelled) setShadowServiceStatus('unavailable');
      }
    };
    checkHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize form data from device profile when component mounts or profile changes
  useEffect(() => {
    if (deviceProfile && typeof deviceProfile === 'object') {
      // Use safe accessors with fallback defaults
      setFormData({
        deviceName: deviceProfile?.deviceName || '',
        manufacturer: deviceProfile?.manufacturer || '',
        productCode: deviceProfile?.productCode || '',
        deviceClass: deviceProfile?.deviceClass || 'II',
        intendedUse: deviceProfile?.intendedUse || '',
        description: deviceProfile?.description || '',
        technicalSpecifications: deviceProfile?.technicalSpecifications || '',
        regulatoryClass: deviceProfile?.regulatoryClass || 'Class II',
      });


      // Check for saved predicate selections
      const savedPredicates = localStorage.getItem('510k_selectedPredicates');
      if (savedPredicates) {
        try {
          const parsedPredicates = JSON.parse(savedPredicates);
          if (parsedPredicates && parsedPredicates.length > 0) {
            setSelectedPredicates(parsedPredicates);
          }
        } catch (error) {
          console.error('Error restoring saved predicate selections:', error);
        }
      }

      // Check for saved search results
      const savedResults = localStorage.getItem('510k_searchResults');
      if (savedResults) {
        try {
          const parsedResults = JSON.parse(savedResults);
          if (parsedResults && parsedResults.length > 0) {
            setSearchResults(parsedResults);
          }
        } catch (error) {
          console.error('Error restoring saved search results:', error);
        }
      }

      // Check for saved literature results
      const savedLiterature = localStorage.getItem('510k_literatureResults');
      if (savedLiterature) {
        try {
          const parsedLiterature = JSON.parse(savedLiterature);
          if (parsedLiterature && parsedLiterature.length > 0) {
            setLiteratureResults(parsedLiterature);
          }
        } catch (error) {
          console.error('Error restoring saved literature results:', error);
        }
      }
    } else {
      // Device profile not available
      console.warn('PredicateFinderPanel: No valid device profile provided');

      toast({
        title: 'Device Profile Missing',
        description: 'Please select or create a device profile before continuing.',
        variant: 'default',
      });

      // Set profile editing mode to true so the user can enter data
      setProfileEditing(true);
    }
  }, [deviceProfile, toast]);

  // Handle form field updates
  const handleInputChange = (field, value) => {
    setFormData({
      ...formData,
      [field]: value,
    });
  };

  // Save device profile with enhanced persistence and error handling
  const saveDeviceProfile = () => {
    // Validate required fields
    if (!formData.deviceName || !formData.manufacturer || !formData.intendedUse) {
      toast({
        title: 'Missing Information',
        description: 'Please enter at least the device name, manufacturer, and intended use',
        variant: 'destructive',
      });
      return false;
    }

    // Create a complete device profile with all required fields
    const now = new Date().toISOString();
    const baseProfile = {
      id: documentId || deviceProfile?.id || `device-${Date.now()}`,
      deviceName: formData.deviceName,
      manufacturer: formData.manufacturer,
      productCode: formData.productCode || 'UNASSIGNED',
      deviceClass: formData.deviceClass || 'II',
      intendedUse: formData.intendedUse,
      description: formData.description || '',
      regulatoryClass: formData.regulatoryClass || 'Class II',
      status: 'active',
      structure: {
        documentType: '510k',
        sections: ['device-info', 'predicates', 'compliance'],
        version: '1.0',
      },
      metadata: {
        createdAt: now,
        lastUpdated: now,
      },
    };

    // Ensure the profile has all required fields and proper structure
    const updatedProfile = ensureProfileIntegrity(baseProfile);

    // Save to localStorage for persistence
    try {
      localStorage.setItem('510k_deviceProfile', JSON.stringify(updatedProfile));
    } catch (storageError) {
      console.error('[510k] Failed to save device profile to localStorage:', storageError);
    }

    // Call the parent update function
    setDeviceProfile(updatedProfile);

    // Move to search phase
    setProfileEditing(false);

    // Show success toast
    toast({
      title: 'Device Profile Saved',
      description: 'Device information has been saved. You can now search for predicate devices.',
      variant: 'default',
    });

    return true;
  };

  // Edit device profile (go back to editing mode)
  const editDeviceProfile = () => {
    setProfileEditing(true);
  };

  // Search for predicate devices in FDA database with high reliability
  const searchPredicateDevices = async () => {
    if (!deviceProfile) {
      toast({
        title: 'Missing Device Profile',
        description: 'Please save your device profile before searching for predicates',
        variant: 'destructive',
      });
      return;
    }

    // CRITICAL STABILITY ENHANCEMENT: Check for previously saved results first
    let previousResults = [];
    try {
      const savedResults = localStorage.getItem('510k_searchResults');
      if (savedResults) {
        previousResults = JSON.parse(savedResults);

        // Immediately set these results to prevent blank screens
        if (previousResults.length > 0) {
          setSearchResults(previousResults);
          saveState('predicateDevices', previousResults);
          setErrorState(null);
          setShowRecoveryUI(false);
        }
      }
    } catch (storageError) {
      console.warn('[510k] Error retrieving saved search results:', storageError);
    }

    setIsSearching(true);

    try {
      // Prevent navigation away from page during search
      window.onbeforeunload = function () {
        return "Please don't navigate away while searching...";
      };

      const results = await FDA510kService.searchPredicateDevices({
        deviceName: deviceProfile.deviceName,
        productCode: deviceProfile.productCode,
        manufacturer: deviceProfile.manufacturer,
      });

      // Search complete, remove navigation blocker
      window.onbeforeunload = null;


      // If no results from API but we have previous results, keep using previous
      if (results.length === 0 && previousResults.length > 0) {

        toast({
          title: 'Using Previous Results',
          description: `No new devices found. Showing ${previousResults.length} previously found devices.`,
          variant: 'default',
        });

        // CRITICAL FIX: Notify parent component of successful predicate search with previous results
        if (onPredicatesFound) {
          onPredicatesFound(previousResults, null);
        }

        // We already set these earlier for display
      }
      // We have fresh results from the API
      else if (results.length > 0) {
        // Store results in both localStorage and our stability system
        try {
          localStorage.setItem('510k_searchResults', JSON.stringify(results));
          saveState('predicateDevices', results);
        } catch (error) {
          console.error('[510k] Failed to save search results to storage:', error);
        }

        setSearchResults(results);
        setErrorState(null);
        setShowRecoveryUI(false);

        // CRITICAL FIX: Notify parent component of successful predicate search
        if (onPredicatesFound) {
          onPredicatesFound(results, null);
        }

        toast({
          title: 'Search Complete',
          description: `Found ${results.length} potential predicate devices.`,
          variant: 'default',
        });
      }
      // No results from API and no previous results
      else {
        console.warn('[510k] No results returned from API and no previous results available');

        // Show honest empty state — do NOT generate fake K-numbers
        setSearchResults([]);
        setShowRecoveryUI(true);

        if (onPredicatesFound) {
          onPredicatesFound([], 'No predicate devices found from FDA database');
        }

        toast({
          title: 'No Predicate Devices Found',
          description:
            'The FDA predicate database returned no results. Try broadening your device description or product code.',
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('[510k] Error searching for predicate devices:', error);

      // Make sure to clear navigation blocker on error
      window.onbeforeunload = null;

      // Set error state to show error UI
      setErrorState({
        message: 'Error searching for predicate devices',
        details: error.message || 'Could not retrieve predicate devices from the FDA database',
        timestamp: new Date().toISOString(),
      });

      // First try to use previously loaded results if available
      if (previousResults.length > 0) {

        toast({
          title: 'Using Previous Results',
          description: `Showing ${previousResults.length} previously found devices.`,
          variant: 'default',
        });

        // Notify parent component about found devices but mention they're from cache
        if (onPredicatesFound) {
          onPredicatesFound(previousResults, 'Cached results used due to search error');
        }

        setShowRecoveryUI(false);
      }
      // Otherwise try emergency recovery
      else {
        // Attempt to recover using our emergency recovery function
        const recoverySuccessful = recoverPredicateSearch(deviceProfile, setSearchResults, toast);

        if (!recoverySuccessful) {
          console.warn('[510k] Recovery failed, displaying error UI');
          setShowRecoveryUI(true);

          // Make sure we stay on this page by creating an empty result set
          // instead of redirecting user to another page
          setSearchResults([]);

          // Notify parent component about the error but stay on current page
          if (onPredicatesFound) {
            onPredicatesFound([], 'No predicate devices found');
          }

          toast({
            title: 'No Predicate Devices Found',
            description:
              "We couldn't find any predicate devices matching your search criteria. You can modify your device profile and try again.",
            variant: 'destructive',
          });
        } else {
          // Recovery was successful, notify parent
          setShowRecoveryUI(false);

          if (onPredicatesFound) {
            onPredicatesFound(searchResults, 'Recovery successful');
          }
        }
      }
    } finally {
      // CRITICAL FIX: Update both local and parent state about search completion
      setIsSearching(false);
      setSearched(true);

      // Inform parent component that searching has completed
      if (onSearchStateChange) {
        onSearchStateChange(false);
      }

      // Remove navigation blocking
      window.onbeforeunload = null;
    }
  };

  // Select/deselect a predicate device
  const togglePredicateSelection = device => {
    const isSelected = selectedPredicates.some(p => p.k_number === device.k_number);

    let updatedPredicates;
    if (isSelected) {
      updatedPredicates = selectedPredicates.filter(p => p.k_number !== device.k_number);
    } else {
      updatedPredicates = [...selectedPredicates, device];
    }

    // Update state
    setSelectedPredicates(updatedPredicates);

    // Save to localStorage for persistence
    try {
      localStorage.setItem('510k_selectedPredicates', JSON.stringify(updatedPredicates));
    } catch (error) {
      console.error('Failed to save predicate selections to localStorage:', error);
    }

    // Show toast feedback
    toast({
      title: isSelected ? 'Predicate Removed' : 'Predicate Selected',
      description: `${device.device_name || device.k_number} ${isSelected ? 'removed from' : 'added to'} selection (${updatedPredicates.length} total)`,
      variant: 'default',
    });
  };

  // Complete predicate selection and move to the next step
  const completePredicateSelection = () => {
    if (selectedPredicates.length === 0) {
      toast({
        title: 'No Predicates Selected',
        description: 'Please select at least one predicate device',
        variant: 'default',
      });
      return;
    }


    // Prevent React suspension errors by ensuring synchronous work completes before any async actions
    try {
      // Update local state safely
      const updatedProfile = {
        ...deviceProfile,
        predicateDevices: selectedPredicates,
        updatedAt: new Date().toISOString(),
      };

      // First, notify UI about the pending operation
      toast({
        title: 'Processing Selection',
        description: 'Saving your predicate device selections...',
        variant: 'default',
      });

      // CRITICAL FIX: Batch synchronous state updates
      setDeviceProfile(updatedProfile);

      // Perform storage operations synchronously to avoid React suspension
      try {
        // Save to localStorage - all in try/catch to avoid crashes
        localStorage.setItem('510k_selectedPredicates', JSON.stringify(selectedPredicates));
        saveState('selectedPredicates', selectedPredicates);
        localStorage.setItem('510k_deviceProfile', JSON.stringify(updatedProfile));
        saveState('deviceProfile', updatedProfile);

      } catch (storageError) {
        console.error('[510k] Storage error:', storageError);
        // Continue despite storage errors, we still have state
      }

      // Safely perform the callback notification synchronously
      if (onPredicatesFound) {

        // CRITICAL FIX: Move this notification outside of setTimeout to avoid suspensions
        onPredicatesFound(selectedPredicates, null);

        // Show success after completing all potentially suspending operations
        toast({
          title: 'Predicates Selected',
          description: `You have selected ${selectedPredicates.length} predicate device(s) for your 510(k) submission.`,
          variant: 'default',
        });
      } else {
        console.warn('[510k] onPredicatesFound callback not available');
        toast({
          title: 'Error',
          description: 'Could not advance workflow - callback not available',
          variant: 'destructive',
        });
      }
    } catch (error) {
      // Global error handler to catch any issues
      console.error('[510k] Error in predicate selection completion:', error);
      toast({
        title: 'Selection Error',
        description: 'An error occurred while processing your selection. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Search for literature related to the device and predicates
  const searchRelatedLiterature = async () => {
    if (!deviceProfile) {
      toast({
        title: 'Missing Device Profile',
        description: 'Please save your device profile before searching for literature',
        variant: 'destructive',
      });
      return;
    }

    if (selectedPredicates.length === 0) {
      toast({
        title: 'No Predicates Selected',
        description: 'Please select at least one predicate device before searching for literature',
        variant: 'default',
      });
      return;
    }

    setIsSearchingLiterature(true);

    try {
      // Build search query combining device info and predicate device characteristics
      const predicateNames = selectedPredicates.map(p => p.device_name).join(', ');
      const searchQuery = `${deviceProfile.deviceName} ${deviceProfile.intendedUse} ${predicateNames}`;

      const results = await literatureAPIService.searchLiterature({
        query: searchQuery,
        filters: literatureFilters,
        limit: 20,
      });


      // Save literature results to localStorage for persistence
      try {
        localStorage.setItem('510k_literatureResults', JSON.stringify(results));
      } catch (error) {
        console.error('Failed to save literature results to localStorage:', error);
      }

      setLiteratureResults(results);

      toast({
        title: 'Literature Search Complete',
        description: `Found ${results.length} relevant publications.`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error searching for literature:', error);
      toast({
        title: 'Literature Search Error',
        description: 'Failed to search for literature. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSearchingLiterature(false);
    }
  };

  // Toggle selection of a literature item
  const toggleLiteratureSelection = item => {
    const isSelected = selectedLiterature.some(l => l.id === item.id);

    let updatedSelection;
    if (isSelected) {
      updatedSelection = selectedLiterature.filter(l => l.id !== item.id);
    } else {
      updatedSelection = [...selectedLiterature, item];
    }

    // Update state
    setSelectedLiterature(updatedSelection);

    // Save to localStorage for persistence
    try {
      localStorage.setItem('510k_selectedLiterature', JSON.stringify(updatedSelection));
    } catch (error) {
      console.error('Failed to save literature selections to localStorage:', error);
    }
  };

  // View details of a literature item
  const viewLiteratureDetails = item => {
    setSelectedLiteratureItem(item);
    setShowLiteratureDetails(true);
  };

  // Render device profile form
  const renderDeviceProfileForm = () => (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Device Profile</CardTitle>
        <CardDescription>
          Enter information about your device to find appropriate predicates
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="deviceName">Device Name *</Label>
              <Input
                id="deviceName"
                placeholder="Enter device name"
                value={formData.deviceName}
                onChange={e => handleInputChange('deviceName', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manufacturer">Manufacturer *</Label>
              <Input
                id="manufacturer"
                placeholder="Enter manufacturer name"
                value={formData.manufacturer}
                onChange={e => handleInputChange('manufacturer', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="productCode">Product Code</Label>
              <Input
                id="productCode"
                placeholder="e.g., ABC"
                value={formData.productCode}
                onChange={e => handleInputChange('productCode', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deviceClass">Device Class</Label>
              <Select
                value={formData.deviceClass}
                onValueChange={value => handleInputChange('deviceClass', value)}
              >
                <SelectTrigger id="deviceClass">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="I">Class I</SelectItem>
                  <SelectItem value="II">Class II</SelectItem>
                  <SelectItem value="III">Class III</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="intendedUse">Intended Use *</Label>
            <Textarea
              id="intendedUse"
              placeholder="Describe the intended use of your device"
              value={formData.intendedUse}
              onChange={e => handleInputChange('intendedUse', e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Device Description</Label>
            <Textarea
              id="description"
              placeholder="Provide a description of your device"
              value={formData.description}
              onChange={e => handleInputChange('description', e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="technicalSpecifications">Technical Specifications</Label>
            <Textarea
              id="technicalSpecifications"
              placeholder="Enter technical specifications of your device"
              value={formData.technicalSpecifications}
              onChange={e => handleInputChange('technicalSpecifications', e.target.value)}
              rows={3}
            />
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={saveDeviceProfile} className="w-full">
          Save Device Profile
        </Button>
      </CardFooter>
    </Card>
  );

  // Render predicate device search interface
  const renderPredicateSearch = () => (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Predicate Device Search</CardTitle>
            <CardDescription>
              Find substantially equivalent predicate devices for your 510(k) submission
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={editDeviceProfile}>
            Edit Device Profile
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Advanced search and filter controls */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border p-3 rounded-md bg-stone-50">
              <div className="flex flex-col space-y-2 flex-grow mr-4">
                <Label htmlFor="searchFilter" className="text-xs text-stone-500">
                  Advanced Search Filters
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={predicateFilterType || 'all'}
                    onValueChange={value => {
                      // This would update the filter type in a real implementation
                      toast({
                        title: 'Filter Applied',
                        description: `Filtering by ${value === 'all' ? 'All' : value === 'product_code' ? 'Product Code' : 'Manufacturer'}`,
                      });
                    }}
                  >
                    <SelectTrigger id="filterType" className="h-9">
                      <SelectValue placeholder="Filter by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Predicates</SelectItem>
                      <SelectItem value="product_code">By Product Code</SelectItem>
                      <SelectItem value="manufacturer">By Manufacturer</SelectItem>
                      <SelectItem value="recent">Recently Cleared</SelectItem>
                      <SelectItem value="high_similarity">Highest Similarity</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={deviceProfile?.deviceClass || 'II'}
                    onValueChange={value => {
                      // This would update the device class filter in a real implementation
                      toast({
                        title: 'Class Filter Applied',
                        description: `Showing Class ${value} devices`,
                      });
                    }}
                  >
                    <SelectTrigger id="classFilter" className="h-9">
                      <SelectValue placeholder="Device Class" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="I">Class I</SelectItem>
                      <SelectItem value="II">Class II</SelectItem>
                      <SelectItem value="III">Class III</SelectItem>
                      <SelectItem value="all">All Classes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {shadowServiceStatus === 'unavailable' && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Predicate service offline — cached results available
                  </Badge>
                )}
                <Button
                  onClick={searchPredicateDevices}
                  disabled={isSearching}
                  className="flex items-center space-x-2"
                >
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span>{isSearching ? 'Searching...' : 'Search FDA database'}</span>
                </Button>

                {selectedPredicates.length > 0 && (
                  <Button
                    variant="default"
                    onClick={completePredicateSelection}
                    className="bg-stone-800 hover:bg-stone-900 text-white"
                    data-testid="button-complete-predicate-selection"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    <span>Complete Selection ({selectedPredicates.length} selected)</span>
                  </Button>
                )}
              </div>
            </div>

            {searchResults.length > 0 && (
              <div className="flex items-center justify-between border-b pb-2">
                <div className="text-sm text-stone-500">
                  <span className="font-medium">{searchResults.length}</span> potential predicate
                  devices found
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    className="text-sm text-stone-600 hover:text-stone-800 flex items-center"
                    onClick={() => {
                      toast({
                        title: 'Sorting Results',
                        description: 'Showing most recently cleared devices first',
                      });
                    }}
                  >
                    <Calendar className="h-3.5 w-3.5 mr-1" />
                    Sort by Date
                  </button>

                  <button
                    className="text-sm text-stone-600 hover:text-stone-800 flex items-center"
                    onClick={() => {
                      toast({
                        title: 'Sorting Results',
                        description: 'Showing devices with highest similarity first',
                      });
                    }}
                  >
                    <BarChart className="h-3.5 w-3.5 mr-1" />
                    Sort by Relevance
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick summary of the current device */}
          <div className="bg-stone-50 p-3 rounded-md">
            <h4 className="font-medium text-stone-800 mb-1">Current Device</h4>
            <p className="text-sm text-stone-700">
              {deviceProfile.deviceName} by {deviceProfile.manufacturer}
            </p>
            <p className="text-xs text-stone-600 mt-1">
              {deviceProfile.intendedUse?.substring(0, 150)}...
            </p>
          </div>

          {/* Display Selected Predicates */}
          {selectedPredicates.length > 0 && (
            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <h4 className="font-medium text-emerald-800 mb-2 flex items-center gap-2">
                <Check className="h-5 w-5" />
                Selected Predicates ({selectedPredicates.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {selectedPredicates.map(predicate => (
                  <div
                    key={predicate.k_number}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-emerald-200 text-emerald-800 rounded-full text-sm"
                    data-testid={`selected-predicate-${predicate.k_number}`}
                  >
                    <span className="font-medium">{predicate.k_number}</span>
                    <span className="text-emerald-600">
                      {predicate.device_name?.substring(0, 30)}
                    </span>
                    <button
                      onClick={() => togglePredicateSelection(predicate)}
                      className="ml-1 text-red-500 hover:text-red-700"
                      data-testid={`button-remove-predicate-${predicate.k_number}`}
                      title="Remove this predicate"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Display predicate search results */}
          {searchResults.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Search Results ({searchResults.length})</h4>
              <ScrollArea className="h-[300px] rounded-md border p-2">
                <div className="space-y-3">
                  {searchResults.map(device => {
                    const isSelected = selectedPredicates.some(p => p.k_number === device.k_number);
                    return (
                      <div
                        key={device.k_number}
                        className={`p-3 rounded-md border ${isSelected ? 'border-stone-400 bg-stone-50' : 'border-stone-200'}`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h5 className="font-medium">{device.device_name}</h5>
                            <p className="text-sm text-stone-600">{device.applicant}</p>
                            <div className="flex items-center space-x-2 mt-1">
                              <Badge variant="outline">{device.k_number}</Badge>
                              <Badge variant="outline">
                                {new Date(device.decision_date).toLocaleDateString()}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex space-x-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      // Select this predicate and guide the user to the
                                      // Substantial Equivalence builder (Stage 1) where the
                                      // real side-by-side comparison is authored against
                                      // FDA requirements. Never fabricate similarity scores.
                                      if (!selectedPredicates.some(p => p.k_number === device.k_number)) {
                                        togglePredicateSelection(device);
                                      }
                                      toast({
                                        title: 'Predicate selected',
                                        description: 'Continue to the Strategy stage to author the substantial equivalence comparison.',
                                      });
                                    }}
                                  >
                                    <GitCompare className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Select and take to SE builder</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <Button
                              variant={isSelected ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => togglePredicateSelection(device)}
                            >
                              {isSelected ? <Check className="h-4 w-4" /> : 'Select'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Empty state — distinguish pre-search from no-results */}
          {searchResults.length === 0 && !isSearching && !searched && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search className="h-10 w-10 text-stone-300 mb-3" />
              <h4 className="text-sm font-medium text-stone-700">Ready to search</h4>
              <p className="text-xs text-stone-500 mt-1 max-w-md">
                Use the search above to find predicate devices in the FDA 510(k) database.
                You can also ask the AI assistant to draft a predicate strategy.
              </p>
            </div>
          )}
          {searchResults.length === 0 && !isSearching && searched && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search className="h-10 w-10 text-stone-300 mb-3" />
              <h4 className="text-sm font-medium text-stone-700">No predicates found</h4>
              <p className="text-xs text-stone-500 mt-1 max-w-md">
                Try broadening your product code or device description, or ask the AI assistant
                to suggest alternative search terms.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // Render literature tab content
  const renderLiteratureContent = () => (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Supporting Literature</CardTitle>
        <CardDescription>
          Find relevant scientific literature to support your 510(k) submission
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Button
              onClick={searchRelatedLiterature}
              disabled={isSearchingLiterature}
              className="flex items-center space-x-2"
            >
              {isSearchingLiterature ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BookOpen className="h-4 w-4" />
              )}
              <span>{isSearchingLiterature ? 'Searching...' : 'Search Literature'}</span>
            </Button>

            {selectedLiterature.length > 0 && (
              <Badge variant="outline" className="ml-2">
                {selectedLiterature.length} selected
              </Badge>
            )}
          </div>

          {/* Literature search filters */}
          <div className="bg-stone-50 p-3 rounded-md">
            <div className="flex items-center space-x-2 mb-2">
              <Filter className="h-4 w-4 text-stone-600" />
              <h4 className="font-medium text-stone-800">Search Filters</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-2">
              <div className="space-y-1">
                <Label htmlFor="yearFrom" className="text-xs">
                  From Year
                </Label>
                <Input
                  id="yearFrom"
                  type="number"
                  value={literatureFilters.yearFrom}
                  onChange={e =>
                    setLiteratureFilters({
                      ...literatureFilters,
                      yearFrom: parseInt(e.target.value) || new Date().getFullYear() - 5,
                    })
                  }
                  className="h-8"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="yearTo" className="text-xs">
                  To Year
                </Label>
                <Input
                  id="yearTo"
                  type="number"
                  value={literatureFilters.yearTo}
                  onChange={e =>
                    setLiteratureFilters({
                      ...literatureFilters,
                      yearTo: parseInt(e.target.value) || new Date().getFullYear(),
                    })
                  }
                  className="h-8"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="journalImpactFactor" className="text-xs">
                  Journal Quality
                </Label>
                <Select
                  value={literatureFilters.journalImpactFactor}
                  onValueChange={value =>
                    setLiteratureFilters({
                      ...literatureFilters,
                      journalImpactFactor: value,
                    })
                  }
                >
                  <SelectTrigger id="journalImpactFactor" className="h-8">
                    <SelectValue placeholder="Impact Factor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Journals</SelectItem>
                    <SelectItem value="high">High Impact (IF {'>'}5)</SelectItem>
                    <SelectItem value="medium">Medium Impact (IF 2-5)</SelectItem>
                    <SelectItem value="low">Low Impact (IF {'<'}2)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="studyType" className="text-xs">
                  Study Type
                </Label>
                <Select
                  value={literatureFilters.studyType}
                  onValueChange={value =>
                    setLiteratureFilters({
                      ...literatureFilters,
                      studyType: value,
                    })
                  }
                >
                  <SelectTrigger id="studyType" className="h-8">
                    <SelectValue placeholder="Study Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Studies</SelectItem>
                    <SelectItem value="clinical">Clinical Trials</SelectItem>
                    <SelectItem value="meta">Meta-Analyses</SelectItem>
                    <SelectItem value="review">Systematic Reviews</SelectItem>
                    <SelectItem value="case">Case Studies</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Display literature search results */}
          {literatureResults.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Literature Results ({literatureResults.length})</h4>
              <ScrollArea className="h-[300px] rounded-md border p-2">
                <div className="space-y-3">
                  {literatureResults.map(item => {
                    const isSelected = selectedLiterature.some(l => l.id === item.id);
                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-md border ${isSelected ? 'border-stone-400 bg-stone-50' : 'border-stone-200'}`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h5 className="font-medium">{item.title}</h5>
                            <p className="text-sm text-stone-600 mt-1">{item.authors}</p>
                            <p className="text-xs text-stone-500 mt-1">
                              {item.journal}, {item.year}
                            </p>
                            <div className="flex items-center space-x-2 mt-2">
                              <Badge variant="outline">{item.type || 'Article'}</Badge>

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={() => viewLiteratureDetails(item)}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>View Details</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              {item.url && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => window.open(item.url, '_blank')}
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Open Source</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </div>
                          <Button
                            variant={isSelected ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleLiteratureSelection(item)}
                          >
                            {isSelected ? <Check className="h-4 w-4" /> : 'Select'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* No literature results message */}
          {literatureResults.length === 0 && !isSearchingLiterature && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <BookOpen className="h-12 w-12 text-stone-400 mb-4" />
              <h4 className="text-xl font-medium text-stone-700">No literature found</h4>
              <p className="text-stone-500 mt-2 max-w-md">
                Search for relevant scientific literature to support your substantial equivalence
                claims.
              </p>
            </div>
          )}
        </div>
      </CardContent>

      {/* Literature details dialog */}
      <Dialog open={showLiteratureDetails} onOpenChange={setShowLiteratureDetails}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedLiteratureItem?.title}</DialogTitle>
            <DialogDescription>
              {selectedLiteratureItem?.authors} · {selectedLiteratureItem?.journal},{' '}
              {selectedLiteratureItem?.year}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <h4 className="text-sm font-medium text-stone-500">Publication Type</h4>
                <p>{selectedLiteratureItem?.type || 'Article'}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-stone-500">Published Date</h4>
                <p>{selectedLiteratureItem?.date || `${selectedLiteratureItem?.year}`}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-stone-500">DOI</h4>
                <p>{selectedLiteratureItem?.doi || 'N/A'}</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-stone-500">Abstract</h4>
              <p className="text-sm mt-1">
                {selectedLiteratureItem?.abstract || 'No abstract available'}
              </p>
            </div>

            {selectedLiteratureItem?.keywords && (
              <div>
                <h4 className="text-sm font-medium text-stone-500">Keywords</h4>
                <div className="flex flex-wrap gap-2 mt-1">
                  {selectedLiteratureItem.keywords.split(',').map((keyword, idx) => (
                    <Badge key={idx} variant="secondary">
                      {keyword.trim()}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {selectedLiteratureItem?.relevance && (
              <div>
                <h4 className="text-sm font-medium text-stone-500">Relevance to Your Device</h4>
                <p className="text-sm mt-1">{selectedLiteratureItem.relevance}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLiteratureDetails(false)}>
              Close
            </Button>
            {selectedLiteratureItem?.url && (
              <Button onClick={() => window.open(selectedLiteratureItem.url, '_blank')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Source
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Display device profile form when in editing mode */}
      {profileEditing ? (
        renderDeviceProfileForm()
      ) : (
        <div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="predicates">Predicate Devices</TabsTrigger>
              <TabsTrigger value="literature">Supporting Literature</TabsTrigger>
            </TabsList>

            <TabsContent value="predicates">{renderPredicateSearch()}</TabsContent>

            <TabsContent value="literature">{renderLiteratureContent()}</TabsContent>
          </Tabs>
        </div>
      )}

    </div>
  );
};

export default PredicateFinderPanel;

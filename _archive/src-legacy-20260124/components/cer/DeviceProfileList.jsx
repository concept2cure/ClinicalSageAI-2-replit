import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Pencil,
  Trash2,
  ChevronRight,
  PlusCircle,
  Search,
  Filter,
  SlidersHorizontal,
  FileText,
  Download,
  BarChart4,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTenant } from '@/contexts/TenantContext.tsx';
import { formatDistanceToNow } from 'date-fns';
import DeviceProfileDialog from './DeviceProfileDialog';
import { getDeviceProfiles, deleteDeviceProfile } from '@/api/cer';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';

const DeviceProfileList = ({ onSelectProfile }) => {
  const { currentOrganization } = useTenant();
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('all');
  const { toast } = useToast();

  // Fetch device profiles
  const {
    data: deviceProfiles,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['/api/cer/device-profile/organization', currentOrganization?.id],
    queryFn: () => getDeviceProfiles(currentOrganization?.id),
    enabled: !!currentOrganization?.id,
    staleTime: 60000, // 1 minute
  });

  // Create statistics for the profiles
  const profileStats = useMemo(() => {
    if (!deviceProfiles) return { total: 0, byClass: {} };

    const byClass = deviceProfiles.reduce((acc, profile) => {
      acc[profile.deviceClass] = (acc[profile.deviceClass] || 0) + 1;
      return acc;
    }, {});

    return {
      total: deviceProfiles.length,
      byClass,
    };
  }, [deviceProfiles]);

  // Filter and search the profiles
  const filteredProfiles = useMemo(() => {
    if (!deviceProfiles) return [];

    return deviceProfiles.filter(profile => {
      const matchesSearch =
        searchTerm === '' ||
        profile.deviceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (profile.manufacturer &&
          profile.manufacturer.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (profile.intendedUse &&
          profile.intendedUse.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesFilter = filterClass === 'all' || profile.deviceClass === filterClass;

      return matchesSearch && matchesFilter;
    });
  }, [deviceProfiles, searchTerm, filterClass]);

  const handleEditSuccess = updatedProfile => {
    refetch();
    // If this was the selected profile, update the selection
    if (selectedProfile?.id === updatedProfile.id) {
      setSelectedProfile(updatedProfile);
      if (onSelectProfile) onSelectProfile(updatedProfile);
    }
  };

  const handleSelectProfile = profile => {
    setSelectedProfile(profile);
    if (onSelectProfile) {
      onSelectProfile(profile);

      toast({
        title: 'Device Profile Selected',
        description: `${profile.deviceName} has been selected for your 510(k) submission.`,
      });
    }
  };

  const handleDeleteClick = profile => {
    setProfileToDelete(profile);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!profileToDelete) return;

    setIsDeleting(true);
    try {
      await deleteDeviceProfile(profileToDelete.id);
      toast({
        title: 'Device Profile deleted',
        description: `${profileToDelete.deviceName} has been successfully deleted.`,
      });

      // If we deleted the currently selected profile, deselect it
      if (selectedProfile?.id === profileToDelete.id) {
        setSelectedProfile(null);
        if (onSelectProfile) {
          onSelectProfile(null);
        }
      }

      refetch();
    } catch (error) {
      toast({
        title: 'Error deleting profile',
        description: error.message || 'An error occurred while deleting the device profile.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setProfileToDelete(null);
    }
  };

  const handleRefresh = () => {
    refetch();
    toast({
      title: 'Refreshing Device Profiles',
      description: 'Fetching the latest Device Profiles from the server.',
    });
  };

  const getDeviceClassBadge = deviceClass => {
    const variants = {
      I: { variant: 'outline', color: 'text-blue-600 border-blue-200' },
      II: { variant: 'outline', color: 'text-amber-600 border-amber-200' },
      III: { variant: 'outline', color: 'text-red-600 border-red-200' },
    };

    const { variant, color } = variants[deviceClass] || {
      variant: 'outline',
      color: 'text-gray-600 border-gray-200',
    };

    return (
      <Badge variant={variant} className={color}>
        Class {deviceClass}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Device Profiles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48">
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-2"></div>
              <p className="text-blue-600 font-medium">Loading device profiles...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Device Profiles</CardTitle>
            <CardDescription>
              Manage your medical device profiles for 510(k) submissions
            </CardDescription>
          </div>
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-center p-8 bg-red-50 border border-red-100 rounded-md">
            <div className="flex flex-col items-center">
              <div className="bg-red-100 p-3 rounded-full mb-3">
                <svg
                  className="h-6 w-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  ></path>
                </svg>
              </div>
              <h3 className="text-lg font-medium text-red-900 mb-1">Error Loading Profiles</h3>
              <p className="text-sm text-red-700 mb-4">
                We couldn't load your device profiles. This might be due to a network issue or
                server problem.
              </p>
              <Button variant="outline" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b bg-gradient-to-r from-blue-50 to-white">
        <div>
          <CardTitle className="flex items-center">
            <FileText className="h-5 w-5 mr-2 text-blue-600" />
            510(k) Device Profile Manager
          </CardTitle>
          <CardDescription>
            <span className="font-semibold text-blue-700">REQUIRED FIRST STEP:</span> Create or
            select a device profile to begin your FDA 510(k) submission
          </CardDescription>
        </div>
        <div className="flex space-x-2 items-center">
          <DeviceProfileDialog
            buttonText="Begin New 510(k) Submission"
            buttonIcon={<PlusCircle className="h-4 w-4 mr-1" />}
            buttonVariant="default"
            buttonClassName="bg-blue-600 hover:bg-blue-700 text-white"
            onSuccessfulSubmit={profile => {
              refetch();
              // Automatically select the newly created profile
              setSelectedProfile(profile);
              if (onSelectProfile) onSelectProfile(profile);
            }}
            showBadge={true}
            isStartingPoint={true}
            dialogTitle="Create Device Profile for 510(k) Submission"
            dialogDescription="Enter the details of your medical device to begin the 510(k) submission process. This information will be used throughout the FDA submission workflow."
          />
          <Button variant="outline" size="sm" onClick={handleRefresh} className="ml-2">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh List
          </Button>
        </div>
      </CardHeader>

      {/* Stats and filters */}
      <div className="px-6 py-3 bg-slate-50 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100">
            Total: {profileStats.total}
          </Badge>

          <div className="flex gap-2">
            {['I', 'II', 'III'].map(classNum => (
              <Badge
                key={classNum}
                variant="outline"
                className={`cursor-pointer ${filterClass === classNum ? 'bg-blue-100 border-blue-300' : ''}`}
                onClick={() => setFilterClass(filterClass === classNum ? 'all' : classNum)}
              >
                Class {classNum}: {profileStats.byClass[classNum] || 0}
              </Badge>
            ))}

            {filterClass !== 'all' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setFilterClass('all')}
              >
                Clear Filter
              </Button>
            )}
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search profiles..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      <CardContent className="p-0">
        {!deviceProfiles || deviceProfiles.length === 0 ? (
          <div className="text-center p-12 bg-gray-50">
            <div className="p-6 max-w-md mx-auto">
              <div className="rounded-full bg-green-100 w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <FileText className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-medium text-gray-900 mb-3">SETUP REQUIRED</h3>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 mb-5 max-w-xl mx-auto">
                <h4 className="font-medium text-blue-800 mb-2">FDA 510(k) Submission Process:</h4>
                <p className="text-blue-700 mb-2">
                  To begin your FDA 510(k) submission, you must first create a device profile with
                  essential information about your medical device.
                </p>
                <p className="text-sm text-blue-600">
                  This profile will be used throughout the submission process for predicate device
                  comparisons, testing requirements, and final submission documents.
                </p>
              </div>
              <DeviceProfileDialog
                buttonText="Create New Device Profile"
                buttonVariant="default"
                buttonClassName="bg-green-600 hover:bg-green-700 text-white px-6 py-3 text-lg shadow-md"
                dialogTitle="New 510(k) Device Profile"
                dialogDescription="Enter the details of your medical device to begin the 510(k) submission process."
                onSuccessfulSubmit={profile => {
                  refetch();
                  // Automatically select the newly created profile
                  setSelectedProfile(profile);
                  if (onSelectProfile) onSelectProfile(profile);
                  toast({
                    title: 'Device Profile Created',
                    description: `${profile.deviceName} has been created and selected for your 510(k) submission.`,
                  });
                }}
                isStartingPoint={false}
              />
            </div>
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="text-center p-8 bg-gray-50">
            <p className="text-gray-500">No device profiles match your search criteria.</p>
            <Button
              variant="link"
              className="mt-2"
              onClick={() => {
                setSearchTerm('');
                setFilterClass('all');
              }}
            >
              Clear all filters
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-16rem)] rounded-md">
            <div className="w-full">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="w-[40px] sticky top-0 bg-white z-10"></TableHead>
                    <TableHead className="w-[200px] sticky top-0 bg-white z-10">
                      Device Name
                    </TableHead>
                    <TableHead className="sticky top-0 bg-white z-10">Class</TableHead>
                    <TableHead className="sticky top-0 bg-white z-10">Manufacturer</TableHead>
                    <TableHead className="sticky top-0 bg-white z-10">Technology</TableHead>
                    <TableHead className="sticky top-0 bg-white z-10">Last Updated</TableHead>
                    <TableHead className="text-right sticky top-0 bg-white z-10">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProfiles.map(profile => (
                    <TableRow
                      key={profile.id}
                      className={`${selectedProfile?.id === profile.id ? 'bg-green-50 hover:bg-green-50/80' : 'hover:bg-slate-50'}`}
                    >
                      <TableCell className="w-[40px] text-center">
                        {selectedProfile?.id === profile.id && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <CheckCircle className="h-5 w-5 text-green-600" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right">
                                <p>Currently selected for 510(k) submission</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>
                          {profile.deviceName}
                          {profile.modelNumber && (
                            <div className="text-xs text-gray-500 mt-1">
                              Model: {profile.modelNumber}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getDeviceClassBadge(profile.deviceClass)}</TableCell>
                      <TableCell>{profile.manufacturer || 'N/A'}</TableCell>
                      <TableCell>{profile.technologyType || 'Not specified'}</TableCell>
                      <TableCell>
                        {profile.updatedAt
                          ? formatDistanceToNow(new Date(profile.updatedAt), { addSuffix: true })
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          {selectedProfile?.id === profile.id ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => {
                                setSelectedProfile(null);
                                if (onSelectProfile) onSelectProfile(null);
                                toast({
                                  title: 'Device Profile Deselected',
                                  description: `${profile.deviceName} has been deselected.`,
                                });
                              }}
                            >
                              Deselect
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-green-600 border-green-200 hover:bg-green-50"
                              onClick={() => handleSelectProfile(profile)}
                            >
                              Select
                            </Button>
                          )}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon">
                                <SlidersHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuGroup>
                                <DropdownMenuItem onClick={() => handleSelectProfile(profile)}>
                                  <ChevronRight className="h-4 w-4 mr-2" />
                                  Select for 510(k)
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                              <DropdownMenuSeparator />
                              <DropdownMenuGroup>
                                <DropdownMenuItem asChild>
                                  <DeviceProfileDialog
                                    buttonVariant="none"
                                    buttonText={
                                      <div className="flex items-center w-full">
                                        <Pencil className="h-4 w-4 mr-2" />
                                        Edit Profile
                                      </div>
                                    }
                                    existingData={profile}
                                    dialogTitle="Edit Device Profile"
                                    dialogDescription="Update the details for your medical device."
                                    onSuccessfulSubmit={handleEditSuccess}
                                  />
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => handleDeleteClick(profile)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Profile
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        )}
      </CardContent>

      {deviceProfiles && deviceProfiles.length > 0 && (
        <CardFooter className="border-t px-6 py-4 bg-slate-50 flex justify-between">
          <p className="text-sm text-muted-foreground">
            {filteredProfiles.length === deviceProfiles.length
              ? `Showing all ${deviceProfiles.length} device ${deviceProfiles.length === 1 ? 'profile' : 'profiles'}`
              : `Showing ${filteredProfiles.length} of ${deviceProfiles.length} device profiles`}
          </p>

          {searchTerm || filterClass !== 'all' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm('');
                setFilterClass('all');
              }}
            >
              Clear Filters
            </Button>
          ) : null}
        </CardFooter>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the Device Profile
              {profileToDelete && <strong> "{profileToDelete.deviceName}"</strong>} and remove it
              from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={e => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting ? (
                <>
                  <span className="animate-spin mr-2">⟳</span>
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default DeviceProfileList;

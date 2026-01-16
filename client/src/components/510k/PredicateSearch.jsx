import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toaster';
import { Loader2, Search, Filter, Info } from 'lucide-react'
import FDA510kService from '../../services/FDA510kService';

/**
 * PredicateSearch Component
 *
 * This component provides a search interface for finding predicate devices
 * to use in 510(k) substantial equivalence claims.
 *
 * @param {Object} props - Component props
 * @param {Object} props.deviceProfile - The current device profile
 * @param {Function} props.onSelect - Callback when a device is selected
 */
export const PredicateSearch = ({ deviceProfile = {}, onSelect }) => {
  const [searchTerm, setSearchTerm] = useState(deviceProfile.deviceName || '');
  const [productCodeFilter, setProductCodeFilter] = useState(deviceProfile.productCode || '');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const { toast } = useToast();

  // Query for predicate devices
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['predicateSearch', searchTerm, productCodeFilter],
    queryFn: () => FDA510kService.searchPredicateDevices(searchTerm, productCodeFilter || null),
    enabled: false, // Don't run automatically
  });

  // Handle search form submission
  const handleSearch = e => {
    e.preventDefault();
    if (!searchTerm.trim()) {
      toast({
        title: 'Search Term Required',
        description: 'Please enter a device name or keyword to search.',
        variant: 'destructive',
      });
      return;
    }

    refetch();
  };

  // Handle device selection
  const handleDeviceSelect = async device => {
    setSelectedDevice(device);

    try {
      // Get detailed information about the predicate device
      const details = await FDA510kService.getPredicateDetails(device.kNumber);

      if (onSelect) {
        onSelect({
          ...device,
          ...details,
        });
      }
    } catch (error) {
      console.error('Error fetching predicate details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load predicate device details. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Find Predicate Devices</CardTitle>
          <CardDescription>
            Search for predicate devices similar to your device that have received 510(k) clearance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Search by device name, manufacturer, etc."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="md:w-1/3">
                <Input
                  placeholder="Filter by product code (optional)"
                  value={productCodeFilter}
                  onChange={e => setProductCodeFilter(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex-shrink-0">
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </>
                  )}
                </Button>
              </div>
            </div>

            {productCodeFilter && (
              <div className="flex items-center">
                <Badge variant="secondary" className="mr-2">
                  <Filter className="h-3 w-3 mr-1" />
                  Product Code: {productCodeFilter}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setProductCodeFilter('')}
                  className="h-6 text-xs"
                >
                  Clear
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Search Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Failed to search for predicate devices: {error.message}</p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" onClick={() => refetch()}>
              Retry Search
            </Button>
          </CardFooter>
        </Card>
      )}

      {data && data.length === 0 && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle>No Results Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              No predicate devices found matching your search criteria. Try broadening your search
              terms.
            </p>
          </CardContent>
        </Card>
      )}

      {data && data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results</CardTitle>
            <CardDescription>
              {data.length} predicate devices found. Select a device to view details and analyze
              substantial equivalence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[250px]">Device Name</TableHead>
                    <TableHead>Manufacturer</TableHead>
                    <TableHead>K Number</TableHead>
                    <TableHead>Product Code</TableHead>
                    <TableHead>Decision Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map(device => (
                    <TableRow
                      key={device.kNumber}
                      className={selectedDevice?.kNumber === device.kNumber ? 'bg-muted' : ''}
                    >
                      <TableCell className="font-medium">{device.deviceName}</TableCell>
                      <TableCell>{device.manufacturer}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{device.kNumber}</Badge>
                      </TableCell>
                      <TableCell>
                        {device.productCode && (
                          <Badge variant="secondary">{device.productCode}</Badge>
                        )}
                      </TableCell>
                      <TableCell>{device.decisionDate}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant={
                            selectedDevice?.kNumber === device.kNumber ? 'default' : 'outline'
                          }
                          size="sm"
                          onClick={() => handleDeviceSelect(device)}
                        >
                          <Info className="h-4 w-4 mr-2" />
                          {selectedDevice?.kNumber === device.kNumber ? 'Selected' : 'Select'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {data.length} predicate devices
            </div>
            {selectedDevice && (
              <Button onClick={() => onSelect(selectedDevice)}>Use Selected Device</Button>
            )}
          </CardFooter>
        </Card>
      )}
    </div>
  );
};

export default PredicateSearch;

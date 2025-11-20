import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Plus, ArrowUpDown, Calendar, Search } from 'lucide-react';
import { Link } from 'wouter';

const ComparabilityStudiesPage = () => {
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch comparability studies
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['/api/comparability/studies', typeFilter, statusFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter) params.append('type', typeFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (searchQuery) params.append('search', searchQuery);

      const response = await fetch(`/api/comparability/studies?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch comparability studies');
      }
      return response.json();
    },
  });

  // Study type options
  const typeOptions = [
    'Method Transfer',
    'Product Comparability',
    'Process Comparability',
    'Site Transfer',
  ];

  // Status options
  const statusOptions = ['Complete', 'In Progress', 'Draft', 'On Hold'];

  // Handle filter reset
  const resetFilters = () => {
    setTypeFilter('');
    setStatusFilter('');
    setSearchQuery('');
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Comparability Studies</h1>
          <p className="text-muted-foreground">
            Track method transfers and product comparability assessments
          </p>
        </div>
        <Button asChild>
          <Link href="/comparability/new-study">
            <Plus className="mr-2 h-4 w-4" /> New Study
          </Link>
        </Button>
      </div>

      <Separator className="my-6" />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Narrow down studies by specific criteria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Study Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Types</SelectItem>
                  {typeOptions.map(type => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Statuses</SelectItem>
                  {statusOptions.map(status => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search studies..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <Button variant="outline" onClick={resetFilters}>
              Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <Card className="p-6 bg-destructive/10 border-destructive">
          <p className="text-destructive">Error loading studies: {error.message}</p>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Comparability Studies</CardTitle>
            <CardDescription>Showing {data?.studies?.length || 0} studies</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Method/Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <div className="flex items-center">
                      Start Date
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.studies?.length > 0 ? (
                  data.studies.map(study => (
                    <TableRow key={study.id}>
                      <TableCell className="font-medium">{study.name}</TableCell>
                      <TableCell>{study.type}</TableCell>
                      <TableCell>{study.methodName || study.referenceBatch || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            study.status === 'Complete'
                              ? 'success'
                              : study.status === 'In Progress'
                                ? 'default'
                                : study.status === 'On Hold'
                                  ? 'warning'
                                  : 'secondary'
                          }
                        >
                          {study.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                          {study.startDate || 'Not started'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="ghost" asChild>
                          <Link href={`/comparability/studies/${study.id}`}>View</Link>
                        </Button>
                        {study.status === 'Complete' && (
                          <Button variant="outline" asChild>
                            <Link href={`/comparability/studies/${study.id}/report`}>Report</Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      No comparability studies found. Try adjusting your filters or create a new
                      study.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ComparabilityStudiesPage;

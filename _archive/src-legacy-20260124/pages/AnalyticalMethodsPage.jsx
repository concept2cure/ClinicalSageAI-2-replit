import React, { useState, useEffect } from 'react';
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
import { Loader2, Plus, Filter, Search } from 'lucide-react';
import { Link } from 'wouter';

const AnalyticalMethodsPage = () => {
  const [categoryFilter, setCategoryFilter] = useState('');
  const [techniqueFilter, setTechniqueFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch analytical methods
  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      '/api/analytical/methods',
      categoryFilter,
      techniqueFilter,
      statusFilter,
      searchQuery,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryFilter) params.append('category', categoryFilter);
      if (techniqueFilter) params.append('technique', techniqueFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (searchQuery) params.append('search', searchQuery);

      const response = await fetch(`/api/analytical/methods?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch analytical methods');
      }
      return response.json();
    },
  });

  // Fetch categories for filter
  const { data: categoriesData } = useQuery({
    queryKey: ['/api/analytical/categories'],
    queryFn: async () => {
      const response = await fetch('/api/analytical/categories');
      if (!response.ok) {
        throw new Error('Failed to fetch categories');
      }
      return response.json();
    },
  });

  // Fetch techniques for filter
  const { data: techniquesData } = useQuery({
    queryKey: ['/api/analytical/techniques'],
    queryFn: async () => {
      const response = await fetch('/api/analytical/techniques');
      if (!response.ok) {
        throw new Error('Failed to fetch techniques');
      }
      return response.json();
    },
  });

  // Status options
  const statusOptions = ['Approved', 'In Development', 'Retired', 'Under Review'];

  // Handle filter reset
  const resetFilters = () => {
    setCategoryFilter('');
    setTechniqueFilter('');
    setStatusFilter('');
    setSearchQuery('');
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytical Method Repository</h1>
          <p className="text-muted-foreground">
            Manage and track analytical methods, validation status, and transfer activities
          </p>
        </div>
        <Button asChild>
          <Link href="/analytical/new-method">
            <Plus className="mr-2 h-4 w-4" /> New Method
          </Link>
        </Button>
      </div>

      <Separator className="my-6" />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Narrow down the methods by specific criteria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Categories</SelectItem>
                  {categoriesData?.categories?.map(category => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <Select value={techniqueFilter} onValueChange={setTechniqueFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Technique" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Techniques</SelectItem>
                  {techniquesData?.techniques?.map(technique => (
                    <SelectItem key={technique} value={technique}>
                      {technique}
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
                  placeholder="Search methods..."
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
          <p className="text-destructive">Error loading methods: {error.message}</p>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Analytical Methods</CardTitle>
            <CardDescription>Showing {data?.methods?.length || 0} methods</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Technique</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Validation</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.methods?.length > 0 ? (
                  data.methods.map(method => (
                    <TableRow key={method.id}>
                      <TableCell className="font-mono">{method.code}</TableCell>
                      <TableCell className="font-medium">{method.name}</TableCell>
                      <TableCell>{method.category}</TableCell>
                      <TableCell>{method.technique}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            method.status === 'Approved'
                              ? 'success'
                              : method.status === 'In Development'
                                ? 'default'
                                : method.status === 'Under Review'
                                  ? 'warning'
                                  : 'secondary'
                          }
                        >
                          {method.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            method.validation.status === 'Complete'
                              ? 'success'
                              : method.validation.status === 'In Progress'
                                ? 'warning'
                                : 'outline'
                          }
                        >
                          {method.validation.status}
                        </Badge>
                      </TableCell>
                      <TableCell>v{method.version}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" asChild>
                          <Link href={`/analytical/methods/${method.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                      No analytical methods found. Try adjusting your filters.
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

export default AnalyticalMethodsPage;

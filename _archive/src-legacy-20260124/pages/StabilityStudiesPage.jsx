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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  Plus,
  Thermometer,
  CalendarDays,
  FileText,
  Search,
  ArrowUpDown,
  Beaker,
} from 'lucide-react';
import { Link } from 'wouter';

const StabilityStudiesPage = () => {
  const [activeTab, setActiveTab] = useState('studies');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch stability studies
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['/api/stability/studies', statusFilter, typeFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (typeFilter) params.append('type', typeFilter);
      if (searchQuery) params.append('search', searchQuery);

      const response = await fetch(`/api/stability/studies?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch stability studies');
      }
      return response.json();
    },
  });

  // Study type options
  const typeOptions = [
    'Long-Term',
    'Accelerated',
    'Intermediate',
    'Photostability',
    'Stress',
    'In-Use',
  ];

  // Status options
  const statusOptions = ['Active', 'Complete', 'Draft', 'On Hold', 'Discontinued'];

  // Handle filter reset
  const resetFilters = () => {
    setStatusFilter('');
    setTypeFilter('');
    setSearchQuery('');
  };

  // Helper function to calculate study progress
  const calculateProgress = study => {
    // If study is complete, return 100%
    if (study.status === 'Complete') return 100;

    // Otherwise, calculate based on duration and start date
    const startDate = new Date(study.startDate);
    const completionDate = new Date(study.completionDate);
    const currentDate = new Date();

    if (currentDate >= completionDate) return 100;

    const totalDuration = completionDate - startDate;
    const elapsedDuration = currentDate - startDate;

    return Math.round((elapsedDuration / totalDuration) * 100);
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stability Study Management</h1>
          <p className="text-muted-foreground">
            Design, track, and analyze stability studies for product shelf-life determination
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/stability/shelf-life-predictor">
              <Thermometer className="mr-2 h-4 w-4" /> Shelf-Life Predictor
            </Link>
          </Button>
          <Button asChild>
            <Link href="/stability/new-study">
              <Plus className="mr-2 h-4 w-4" /> New Study
            </Link>
          </Button>
        </div>
      </div>

      <Separator className="my-6" />

      <Tabs defaultValue="studies" onValueChange={setActiveTab} value={activeTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="studies">
            <CalendarDays className="mr-2 h-4 w-4" /> Studies
          </TabsTrigger>
          <TabsTrigger value="data-entry">
            <Beaker className="mr-2 h-4 w-4" /> Data Entry
          </TabsTrigger>
          <TabsTrigger value="protocols">
            <FileText className="mr-2 h-4 w-4" /> Protocols
          </TabsTrigger>
        </TabsList>

        <TabsContent value="studies">
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
                <CardTitle>Stability Studies</CardTitle>
                <CardDescription>Showing {data?.studies?.length || 0} studies</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Study Code</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>
                        <div className="flex items-center">
                          Start Date
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.studies?.length > 0 ? (
                      data.studies.map(study => (
                        <TableRow key={study.id}>
                          <TableCell className="font-mono">{study.code}</TableCell>
                          <TableCell className="font-medium">
                            {study.product.name} {study.product.strength}
                          </TableCell>
                          <TableCell>{study.type}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                study.status === 'Active'
                                  ? 'default'
                                  : study.status === 'Complete'
                                    ? 'success'
                                    : study.status === 'On Hold'
                                      ? 'warning'
                                      : study.status === 'Discontinued'
                                        ? 'destructive'
                                        : 'secondary'
                              }
                            >
                              {study.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{study.startDate}</TableCell>
                          <TableCell>{study.duration} months</TableCell>
                          <TableCell>
                            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-primary h-full rounded-full"
                                style={{ width: `${calculateProgress(study)}%` }}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button variant="ghost" asChild>
                              <Link href={`/stability/studies/${study.id}`}>View</Link>
                            </Button>
                            <Button variant="outline" asChild>
                              <Link href={`/stability/studies/${study.id}/data`}>Data</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                          No stability studies found. Try adjusting your filters or create a new
                          study.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="data-entry">
          <Card>
            <CardHeader>
              <CardTitle>Stability Data Entry</CardTitle>
              <CardDescription>
                Enter test results for scheduled stability timepoints
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Beaker className="h-16 w-16 mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">Select a Study to Enter Data</h3>
                <p className="text-muted-foreground mb-6 max-w-md">
                  Choose a stability study from the Studies tab to enter or view test results
                </p>
                <Button variant="default" onClick={() => setActiveTab('studies')}>
                  View Studies
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="protocols">
          <Card>
            <CardHeader>
              <CardTitle>Stability Protocols</CardTitle>
              <CardDescription>Generate and manage stability study protocols</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-16 w-16 mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">Generate a Stability Protocol</h3>
                <p className="text-muted-foreground mb-6 max-w-md">
                  Select a study to generate a protocol or view existing protocols
                </p>
                <Button variant="default" onClick={() => setActiveTab('studies')}>
                  View Studies
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StabilityStudiesPage;

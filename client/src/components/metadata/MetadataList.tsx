import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  useTable, useSortBy, useFilters, usePagination, useGlobalFilter, } from '../lightweight-wrappers.js';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  List, ListItem, DatabaseZap, FileSearch, History, Filter, Download, MoreHorizontal, ArrowUpDown, ChevronLeft, ChevronRight, Search, Tags } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '../../hooks/use-toast';

interface MetadataRow {
  id: string;
  name: string;
  type: string;
  source: string;
  version: string;
  lastUpdated: string;
  status: string;
  tags: string[];
}

// Mock data for demonstration
const mockMetadataData: MetadataRow[] = [
  {
    id: '1',
    name: 'SDTM Demographics Domain',
    type: 'Domain',
    source: 'CDISC',
    version: '3.2',
    lastUpdated: '2025-03-15',
    status: 'Active',
    tags: ['Demographics', 'SDTM'],
  },
  {
    id: '2',
    name: 'SDTM Adverse Events Domain',
    type: 'Domain',
    source: 'CDISC',
    version: '3.2',
    lastUpdated: '2025-03-15',
    status: 'Active',
    tags: ['Adverse Events', 'SDTM'],
  },
  {
    id: '3',
    name: 'Protocol Template - Phase I',
    type: 'Template',
    source: 'Internal',
    version: '2.1',
    lastUpdated: '2025-01-20',
    status: 'Active',
    tags: ['Protocol', 'Phase I'],
  },
  {
    id: '4',
    name: 'ADaM Analysis Dataset',
    type: 'Schema',
    source: 'CDISC',
    version: '2.1',
    lastUpdated: '2024-11-05',
    status: 'Active',
    tags: ['Analysis', 'ADaM'],
  },
  {
    id: '5',
    name: 'Common Terminology - Oncology',
    type: 'Terminology',
    source: 'ICH',
    version: '1.4',
    lastUpdated: '2024-12-10',
    status: 'Active',
    tags: ['Oncology', 'Terminology'],
  },
  {
    id: '6',
    name: 'SDTM Implementation Guide',
    type: 'Guide',
    source: 'CDISC',
    version: '3.3',
    lastUpdated: '2025-02-22',
    status: 'Draft',
    tags: ['Implementation', 'SDTM'],
  },
  {
    id: '7',
    name: 'CRF Standard Library',
    type: 'Library',
    source: 'Internal',
    version: '4.0',
    lastUpdated: '2025-03-01',
    status: 'Active',
    tags: ['CRF', 'Standards'],
  },
  {
    id: '8',
    name: 'Medical Device Reporting Template',
    type: 'Template',
    source: 'FDA',
    version: '1.0',
    lastUpdated: '2024-09-15',
    status: 'Deprecated',
    tags: ['Medical Device', 'Reporting'],
  },
  {
    id: '9',
    name: 'Study Data Tabulation Model',
    type: 'Model',
    source: 'CDISC',
    version: '1.8',
    lastUpdated: '2025-01-10',
    status: 'Active',
    tags: ['SDTM', 'Model'],
  },
  {
    id: '10',
    name: 'EDC Field Definitions',
    type: 'Dictionary',
    source: 'Internal',
    version: '2.4',
    lastUpdated: '2024-11-20',
    status: 'Active',
    tags: ['EDC', 'Dictionary'],
  },
];

function DefaultColumnFilter({ column: { filterValue, setFilter, Header } }) {
  return (
    <Input
      value={filterValue || ''}
      onChange={e => setFilter(e.target.value)}
      placeholder={`Filter ${Header}`}
      className="mt-1 w-full text-xs"
    />
  );
}

function SelectColumnFilter({ column: { filterValue, setFilter, preFilteredRows, id } }) {
  const options = useMemo(() => {
    const optionsSet = new Set();
    preFilteredRows.forEach(row => {
      optionsSet.add(row.values[id]);
    });
    return [...optionsSet.values()];
  }, [id, preFilteredRows]);

  return (
    <Select value={filterValue || ''} onValueChange={value => setFilter(value || undefined)}>
      <SelectTrigger className="text-xs">
        <SelectValue placeholder="All" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">All</SelectItem>
        {options.map((option: string, i) => (
          <SelectItem key={i} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'active':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'draft':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'deprecated':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300';
  }
};

export default function MetadataList({
  onSelectMetadata,
}: {
  onSelectMetadata: (id: string) => void;
}) {
  const [selectedMetadata, setSelectedMetadata] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  const columns = useMemo(
    () => [
      {
        Header: 'Name',
        accessor: 'name',
        Filter: DefaultColumnFilter,
      },
      {
        Header: 'Type',
        accessor: 'type',
        Filter: SelectColumnFilter,
        filter: 'includes',
      },
      {
        Header: 'Source',
        accessor: 'source',
        Filter: SelectColumnFilter,
        filter: 'includes',
      },
      {
        Header: 'Version',
        accessor: 'version',
        Filter: DefaultColumnFilter,
      },
      {
        Header: 'Last Updated',
        accessor: 'lastUpdated',
        Filter: DefaultColumnFilter,
      },
      {
        Header: 'Status',
        accessor: 'status',
        Filter: SelectColumnFilter,
        filter: 'includes',
        Cell: ({ value }) => <Badge className={`text-xs ${getStatusColor(value)}`}>{value}</Badge>,
      },
      {
        Header: 'Actions',
        accessor: 'id',
        disableFilters: true,
        Cell: ({ value }) => (
          <div className="flex space-x-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => handleViewMetadata(value)}
            >
              <FileSearch className="h-4 w-4" />
              <span className="sr-only">View</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => handleDownloadMetadata(value)}
            >
              <Download className="h-4 w-4" />
              <span className="sr-only">Download</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => handleMoreOptions(value)}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">More</span>
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const data = useMemo(() => mockMetadataData, []);

  const filterTypes = useMemo(
    () => ({
      text: (rows, id, filterValue) => {
        return rows.filter(row => {
          const rowValue = row.values[id];
          return rowValue !== undefined
            ? String(rowValue).toLowerCase().includes(String(filterValue).toLowerCase())
            : true;
        });
      },
    }),
    []
  );

  const defaultColumn = useMemo(
    () => ({
      Filter: DefaultColumnFilter,
    }),
    []
  );

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    prepareRow,
    page,
    canPreviousPage,
    canNextPage,
    pageOptions,
    pageCount,
    gotoPage,
    nextPage,
    previousPage,
    setPageSize,
    setGlobalFilter,
    state: { pageIndex, pageSize, globalFilter },
  } = useTable(
    {
      columns,
      data,
      defaultColumn,
      filterTypes,
      initialState: { pageIndex: 0, pageSize: 5 },
    },
    useFilters,
    useGlobalFilter,
    useSortBy,
    usePagination
  );

  // Handle search input change
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setGlobalFilter(searchQuery);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, setGlobalFilter]);

  const handleViewMetadata = (id: string) => {
    setSelectedMetadata(id);
    if (onSelectMetadata) {
      onSelectMetadata(id);
    }
  };

  const handleDownloadMetadata = (id: string) => {
    toast({
      title: 'Download started',
      description: 'Metadata definition is being prepared for download.',
    });
  };

  const handleMoreOptions = (id: string) => {
    toast({
      title: 'More options',
      description: 'Additional options for this metadata item will be available soon.',
    });
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center">
          <DatabaseZap className="mr-2 h-5 w-5" />
          Clinical Metadata Repository
        </CardTitle>
        <CardDescription>
          Centralized repository for clinical study definitions and metadata
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-grow flex flex-col overflow-hidden">
        <div className="flex items-center space-x-2 mb-4">
          <div className="relative flex-grow">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search metadata..."
              className="pl-9"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-10 w-10">
                  <Filter className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Filter options</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-10 w-10">
                  <History className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>View history</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-10 w-10">
                  <Tags className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Manage tags</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="overflow-auto rounded-md border flex-grow">
          <table {...getTableProps()} className="w-full">
            <thead className="bg-muted/50">
              {headerGroups.map(headerGroup => (
                <tr {...headerGroup.getHeaderGroupProps()}>
                  {headerGroup.headers.map(column => (
                    <th
                      {...column.getHeaderProps(column.getSortByToggleProps())}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      <div className="flex items-center space-x-1">
                        <span>{column.render('Header')}</span>
                        <span>
                          {column.isSorted ? (
                            column.isSortedDesc ? (
                              <ArrowUpDown className="h-4 w-4 rotate-180" />
                            ) : (
                              <ArrowUpDown className="h-4 w-4" />
                            )
                          ) : (
                            column.canSort && <ArrowUpDown className="h-4 w-4 opacity-20" />
                          )}
                        </span>
                      </div>
                      {!column.disableFilters && (
                        <div>{column.canFilter ? column.render('Filter') : null}</div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody {...getTableBodyProps()} className="bg-white divide-y divide-gray-200">
              {page.map(row => {
                prepareRow(row);
                return (
                  <tr
                    {...row.getRowProps()}
                    className={`hover:bg-gray-50 ${selectedMetadata === row.original.id ? 'bg-blue-50' : ''}`}
                    onClick={() => handleViewMetadata(row.original.id)}
                  >
                    {row.cells.map(cell => (
                      <td {...cell.getCellProps()} className="px-4 py-3 text-sm">
                        {cell.render('Cell')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between space-x-2 py-4">
          <div className="flex items-center space-x-2">
            <Label htmlFor="perPage" className="text-xs">
              Per page
            </Label>
            <Select value={pageSize.toString()} onValueChange={val => setPageSize(Number(val))}>
              <SelectTrigger id="perPage" className="h-8 w-[70px]">
                <SelectValue placeholder={pageSize} />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 20, 30, 40, 50].map(size => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-gray-500">
              Page {pageIndex + 1} of {pageOptions.length}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => previousPage()}
              disabled={!canPreviousPage}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Previous page</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => nextPage()}
              disabled={!canNextPage}
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

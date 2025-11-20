import React, { useState } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { CalendarIcon, XCircle } from 'lucide-react';

/**
 * Document Filter Panel Component
 *
 * This component provides a comprehensive filtering interface for documents,
 * including filters for module, section, status, date range, and text search.
 *
 * @param {Object} props
 * @param {Function} props.onApply - Function to call when Apply button is clicked, receives filter object
 * @param {Object} props.initialFilters - Initial filter values
 * @param {Array} props.moduleOptions - List of available modules
 * @param {Array} props.sectionOptions - List of available sections
 * @param {Array} props.statusOptions - List of available statuses
 */
const DocumentFilterPanel = ({
  onApply,
  initialFilters = {},
  moduleOptions = [],
  sectionOptions = [],
  statusOptions = [],
}) => {
  const [filters, setFilters] = useState({
    module: initialFilters.module || '',
    section: initialFilters.section || '',
    status: initialFilters.status || '',
    owner: initialFilters.owner || '',
    search: initialFilters.search || '',
    dateFrom: initialFilters.dateFrom || null,
    dateTo: initialFilters.dateTo || null,
  });

  // Default options if none provided
  const defaultModules =
    moduleOptions.length > 0
      ? moduleOptions
      : [
          { value: 'cer', label: 'Clinical Evaluation Reports' },
          { value: 'ind', label: 'Investigational New Drug' },
          { value: 'csr', label: 'Clinical Study Reports' },
          { value: 'cmc', label: 'Chemistry, Manufacturing & Controls' },
          { value: 'protocol', label: 'Protocol Documents' },
        ];

  const defaultSections =
    sectionOptions.length > 0
      ? sectionOptions
      : [
          { value: 'executive', label: 'Executive Summary' },
          { value: 'device', label: 'Device Description' },
          { value: 'literature', label: 'Literature Review' },
          { value: 'clinical', label: 'Clinical Data' },
          { value: 'risk', label: 'Risk Analysis' },
          { value: 'conclusion', label: 'Conclusion' },
        ];

  const defaultStatuses =
    statusOptions.length > 0
      ? statusOptions
      : [
          { value: 'draft', label: 'Draft' },
          { value: 'review', label: 'In Review' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Needs Revision' },
        ];

  const handleChange = field => value => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleReset = () => {
    setFilters({
      module: '',
      section: '',
      status: '',
      owner: '',
      search: '',
      dateFrom: null,
      dateTo: null,
    });
  };

  const handleApply = () => {
    // Remove empty values to avoid unnecessary query params
    const cleanFilters = Object.entries(filters).reduce((acc, [key, value]) => {
      if (value !== null && value !== '') {
        acc[key] = value;
      }
      return acc;
    }, {});

    if (onApply) {
      onApply(cleanFilters);
    } else if (onChange) {
      onChange(cleanFilters);
    }
  };

  return (
    <Card className="document-filter-panel mb-6">
      <CardHeader>
        <CardTitle className="text-lg flex justify-between items-center">
          <span>Filter Documents</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs hover:bg-destructive/10"
            onClick={handleReset}
          >
            <XCircle className="h-4 w-4 mr-1" />
            Reset
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Module Filter */}
          <div className="space-y-2">
            <Label htmlFor="module-filter">Module</Label>
            <Select value={filters.module} onValueChange={handleChange('module')}>
              <SelectTrigger id="module-filter">
                <SelectValue placeholder="All Modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Modules</SelectItem>
                {defaultModules.map(module => (
                  <SelectItem key={module.value} value={module.value}>
                    {module.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Section Filter */}
          <div className="space-y-2">
            <Label htmlFor="section-filter">Section</Label>
            <Select value={filters.section} onValueChange={handleChange('section')}>
              <SelectTrigger id="section-filter">
                <SelectValue placeholder="All Sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Sections</SelectItem>
                {defaultSections.map(section => (
                  <SelectItem key={section.value} value={section.value}>
                    {section.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div className="space-y-2">
            <Label htmlFor="status-filter">Status</Label>
            <Select value={filters.status} onValueChange={handleChange('status')}>
              <SelectTrigger id="status-filter">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Statuses</SelectItem>
                {defaultStatuses.map(status => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date From Filter */}
          <div className="space-y-2">
            <Label htmlFor="date-from">From Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date-from"
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  {filters.dateFrom ? (
                    format(filters.dateFrom, 'PPP')
                  ) : (
                    <span className="text-muted-foreground">Pick a date</span>
                  )}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.dateFrom}
                  onSelect={handleChange('dateFrom')}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Date To Filter */}
          <div className="space-y-2">
            <Label htmlFor="date-to">To Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date-to"
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  {filters.dateTo ? (
                    format(filters.dateTo, 'PPP')
                  ) : (
                    <span className="text-muted-foreground">Pick a date</span>
                  )}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.dateTo}
                  onSelect={handleChange('dateTo')}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Owner Filter */}
          <div className="space-y-2">
            <Label htmlFor="owner-filter">Owner</Label>
            <Input
              id="owner-filter"
              value={filters.owner}
              onChange={e => handleChange('owner')(e.target.value)}
              placeholder="Filter by owner"
            />
          </div>

          {/* Search Filter */}
          <div className="space-y-2 md:col-span-2 lg:col-span-3">
            <Label htmlFor="search-filter">Search</Label>
            <Input
              id="search-filter"
              value={filters.search}
              onChange={e => handleChange('search')(e.target.value)}
              placeholder="Search by keywords or filename"
              className="w-full"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleApply} className="w-full md:w-auto">
            Apply Filters
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default DocumentFilterPanel;

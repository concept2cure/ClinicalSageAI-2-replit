import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { FileText, History, User, AlertTriangle, Check, Clock, CalendarClock } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { useTenant } from '../../contexts/TenantContext';
import { format } from 'date-fns';

/**
 * QMP Audit Trail Panel
 *
 * This component displays the Quality Management Plan audit trail,
 * showing all changes to QMP factors for compliance tracking.
 */
export default function QmpAuditTrailPanel({ qmpId, className }) {
  const [auditTrail, setAuditTrail] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const { toast } = useToast();
  const { currentTenant } = useTenant();

  // Fetch audit trail data
  useEffect(() => {
    const fetchAuditTrail = async () => {
      try {
        setLoading(true);

        const response = await fetch(`/api/qmp/${qmpId}/audit-trail`);

        if (!response.ok) {
          throw new Error('Failed to fetch audit trail');
        }

        const data = await response.json();
        setAuditTrail(data);
      } catch (error) {
        console.error('Error fetching audit trail:', error);
        toast({
          title: 'Error',
          description: 'Failed to load audit trail data. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    if (qmpId) {
      fetchAuditTrail();
    }
  }, [qmpId, toast]);

  // Filter audit trail based on criteria
  const filteredAuditTrail = auditTrail.filter(item => {
    // Filter by type if not 'all'
    if (filter !== 'all' && item.actionType !== filter) {
      return false;
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        item.description.toLowerCase().includes(query) ||
        item.actionType.toLowerCase().includes(query) ||
        item.entityType.toLowerCase().includes(query) ||
        (item.userName && item.userName.toLowerCase().includes(query))
      );
    }

    // Filter by date range
    if (dateRange.start && new Date(item.createdAt) < new Date(dateRange.start)) {
      return false;
    }

    if (dateRange.end && new Date(item.createdAt) > new Date(dateRange.end)) {
      return false;
    }

    return true;
  });

  // Get action badge color based on action type
  const getActionBadge = actionType => {
    const variants = {
      create: 'default',
      update: 'secondary',
      approve: 'success',
      review: 'outline',
      retire: 'destructive',
    };

    return (
      <Badge variant={variants[actionType] || 'default'}>
        {actionType.charAt(0).toUpperCase() + actionType.slice(1)}
      </Badge>
    );
  };

  // Get entity icon based on entity type
  const getEntityIcon = entityType => {
    switch (entityType) {
      case 'qmp':
        return <FileText className="h-4 w-4 mr-1" />;
      case 'ctq_factor':
        return <AlertTriangle className="h-4 w-4 mr-1" />;
      case 'section_gate':
        return <Check className="h-4 w-4 mr-1" />;
      default:
        return <FileText className="h-4 w-4 mr-1" />;
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center">
          <History className="mr-2" />
          Quality Management Audit Trail
        </CardTitle>
        <CardDescription>
          Track all changes to quality management factors and approvals
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="mb-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 mr-4">
              <Input
                placeholder="Search audit trail..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="approve">Approve</SelectItem>
                <SelectItem value="review">Review</SelectItem>
                <SelectItem value="retire">Retire</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="startDate">From</Label>
              <Input
                id="startDate"
                type="date"
                value={dateRange.start || ''}
                onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                className="w-auto"
              />
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="endDate">To</Label>
              <Input
                id="endDate"
                type="date"
                value={dateRange.end || ''}
                onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                className="w-auto"
              />
            </div>

            <Button variant="outline" onClick={() => setDateRange({ start: null, end: null })}>
              Clear Dates
            </Button>
          </div>
        </div>

        <Tabs defaultValue="list">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">List View</TabsTrigger>
            <TabsTrigger value="detail">Detail View</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4">
                        Loading audit trail data...
                      </TableCell>
                    </TableRow>
                  ) : filteredAuditTrail.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4">
                        No audit trail records found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAuditTrail.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            {format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <User className="h-4 w-4 mr-1" />
                            {item.userName || 'System'}
                          </div>
                        </TableCell>
                        <TableCell>{getActionBadge(item.actionType)}</TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            {getEntityIcon(item.entityType)}
                            {item.entityType.replace('_', ' ')}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-sm truncate">{item.description}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="detail">
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-4">Loading audit trail data...</div>
              ) : filteredAuditTrail.length === 0 ? (
                <div className="text-center py-4">No audit trail records found</div>
              ) : (
                filteredAuditTrail.map(item => (
                  <Card key={item.id}>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center">
                          {getEntityIcon(item.entityType)}
                          <CardTitle className="text-base">{item.description}</CardTitle>
                        </div>
                        {getActionBadge(item.actionType)}
                      </div>
                      <CardDescription className="flex justify-between">
                        <div className="flex items-center">
                          <User className="h-3 w-3 mr-1" />
                          {item.userName || 'System'}
                        </div>
                        <div className="flex items-center">
                          <CalendarClock className="h-3 w-3 mr-1" />
                          {format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm:ss')}
                        </div>
                      </CardDescription>
                    </CardHeader>
                    {(item.previousState || item.newState) && (
                      <CardContent className="pt-0">
                        {item.previousState && item.newState && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <h4 className="text-sm font-semibold mb-1">Previous State</h4>
                              <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                                {JSON.stringify(item.previousState, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold mb-1">New State</h4>
                              <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                                {JSON.stringify(item.newState, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                        {item.previousState && !item.newState && (
                          <div>
                            <h4 className="text-sm font-semibold mb-1">Previous State</h4>
                            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                              {JSON.stringify(item.previousState, null, 2)}
                            </pre>
                          </div>
                        )}
                        {!item.previousState && item.newState && (
                          <div>
                            <h4 className="text-sm font-semibold mb-1">New State</h4>
                            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                              {JSON.stringify(item.newState, null, 2)}
                            </pre>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="flex justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredAuditTrail.length} records found
        </div>

        <Button variant="outline" onClick={() => window.print()}>
          Export Audit Trail
        </Button>
      </CardFooter>
    </Card>
  );
}

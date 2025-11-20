import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Shield,
  Calendar,
  User,
  Activity,
  Search,
  Filter,
  Eye,
  Download,
  Edit,
  Upload,
  Trash2,
  Share,
} from 'lucide-react';

const AuditTrail = ({ selectedDocument, loading }) => {
  const [auditEvents, setAuditEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');

  useEffect(() => {
    if (selectedDocument?.id) {
      loadAuditTrail();
    }
  }, [selectedDocument]);

  useEffect(() => {
    filterEvents();
  }, [auditEvents, searchQuery, actionFilter, userFilter]);

  const loadAuditTrail = async () => {
    try {
      setLoadingAudit(true);
      // Mock audit data - replace with actual API call
      const mockAuditEvents = [
        {
          id: 'audit-001',
          action: 'view',
          description: 'Document viewed',
          user: 'Dr. Sarah Johnson',
          userRole: 'Principal Investigator',
          timestamp: '2024-01-15T14:30:00Z',
          ipAddress: '192.168.1.100',
          details: 'Accessed via web browser',
        },
        {
          id: 'audit-002',
          action: 'download',
          description: 'Document downloaded',
          user: 'Dr. Michael Chen',
          userRole: 'Clinical Researcher',
          timestamp: '2024-01-15T11:15:00Z',
          ipAddress: '192.168.1.105',
          details: 'Downloaded PDF version',
        },
        {
          id: 'audit-003',
          action: 'edit',
          description: 'Document metadata updated',
          user: 'Dr. Sarah Johnson',
          userRole: 'Principal Investigator',
          timestamp: '2024-01-15T10:30:00Z',
          ipAddress: '192.168.1.100',
          details: 'Updated tags and description',
        },
        {
          id: 'audit-004',
          action: 'share',
          description: 'Document shared with external reviewer',
          user: 'Dr. Emily Rodriguez',
          userRole: 'Study Coordinator',
          timestamp: '2024-01-14T16:20:00Z',
          ipAddress: '192.168.1.102',
          details: 'Shared with regulatory@example.com',
        },
        {
          id: 'audit-005',
          action: 'upload',
          description: 'New version uploaded',
          user: 'Dr. Sarah Johnson',
          userRole: 'Principal Investigator',
          timestamp: '2024-01-14T09:45:00Z',
          ipAddress: '192.168.1.100',
          details: 'Version 3.0 uploaded with safety updates',
        },
      ];
      setAuditEvents(mockAuditEvents);
    } catch (error) {
      console.error('Failed to load audit trail:', error);
    } finally {
      setLoadingAudit(false);
    }
  };

  const filterEvents = () => {
    let filtered = auditEvents;

    if (searchQuery) {
      filtered = filtered.filter(
        event =>
          event.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          event.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
          event.details.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (actionFilter) {
      filtered = filtered.filter(event => event.action === actionFilter);
    }

    if (userFilter) {
      filtered = filtered.filter(event =>
        event.user.toLowerCase().includes(userFilter.toLowerCase())
      );
    }

    setFilteredEvents(filtered);
  };

  const getActionIcon = action => {
    const icons = {
      view: Eye,
      download: Download,
      edit: Edit,
      upload: Upload,
      delete: Trash2,
      share: Share,
    };
    const Icon = icons[action] || Activity;
    return <Icon className="h-4 w-4" />;
  };

  const getActionColor = action => {
    const colors = {
      view: 'bg-blue-100 text-blue-800',
      download: 'bg-green-100 text-green-800',
      edit: 'bg-orange-100 text-orange-800',
      upload: 'bg-purple-100 text-purple-800',
      delete: 'bg-red-100 text-red-800',
      share: 'bg-indigo-100 text-indigo-800',
    };
    return colors[action] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = dateString => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const uniqueActions = [...new Set(auditEvents.map(event => event.action))];
  const uniqueUsers = [...new Set(auditEvents.map(event => event.user))];

  if (!selectedDocument) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <Shield className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>Select a document to view audit trail</p>
        </div>
      </div>
    );
  }

  if (loadingAudit) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading audit trail...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Audit Trail
            <Badge variant="outline">{auditEvents.length} events</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">
            Complete access and modification history for{' '}
            {selectedDocument.title || selectedDocument.filename}
          </p>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search audit events..."
                className="pl-10"
              />
            </div>

            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All actions</SelectItem>
                {uniqueActions.map(action => (
                  <SelectItem key={action} value={action}>
                    {action.charAt(0).toUpperCase() + action.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All users</SelectItem>
                {uniqueUsers.map(user => (
                  <SelectItem key={user} value={user}>
                    {user}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Audit Events */}
      <div className="space-y-3">
        {filteredEvents.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              <Shield className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No audit events found matching your criteria</p>
            </CardContent>
          </Card>
        ) : (
          filteredEvents.map((event, index) => (
            <Card key={event.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className={`p-2 rounded-full ${getActionColor(event.action)}`}>
                      {getActionIcon(event.action)}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">{event.description}</h4>
                        <p className="text-sm text-gray-600 mt-1">{event.details}</p>
                      </div>
                      <Badge className={getActionColor(event.action)}>{event.action}</Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span className="truncate">{event.user}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs">
                          {event.userRole}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(event.timestamp)}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-mono">{event.ipAddress}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {index < filteredEvents.length - 1 && (
                  <div className="absolute left-6 mt-4 w-px h-8 bg-gray-200"></div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Export Options */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Export Audit Trail</h4>
              <p className="text-sm text-gray-600">
                Download complete audit history for compliance reporting
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                Export CSV
              </Button>
              <Button variant="outline" size="sm">
                Export PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuditTrail;

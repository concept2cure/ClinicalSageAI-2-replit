import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Calendar as CalendarIcon, Clock, AlertCircle, Filter, Loader2 } from 'lucide-react';
import { format, addDays, differenceInDays, isSameDay, parseISO, startOfMonth, endOfMonth } from 'date-fns';

interface Submission {
  sub_id: string;
  product_id: string;
  title: string;
  sub_type: 'IND' | 'NDA' | 'BLA' | 'MAA';
  region: string;
  status: string;
  description?: string;
  created_at: string;
  updated_at?: string;
  target_date?: string;
}

interface CalendarEvent {
  id: string;
  date: string;
  submission_id: string;
  milestone_type: string;
  title: string;
  sub_type: 'IND' | 'NDA' | 'BLA' | 'MAA';
  region: string;
  status: string;
}

const SUBMISSION_TYPE_COLORS = {
  IND: 'bg-stone-100 text-stone-700 border-stone-200',
  NDA: 'bg-stone-100 text-stone-800 border-stone-200',
  BLA: 'bg-stone-100 text-stone-700 border-stone-200',
  MAA: 'bg-stone-100 text-stone-700 border-stone-200',
};

const SUBMISSION_TYPE_DOT_COLORS = {
  IND: 'bg-stone-1000',
  NDA: 'bg-stone-1000',
  BLA: 'bg-stone-1000',
  MAA: 'bg-stone-1000',
};

export default function SubmissionCalendar() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Fetch submissions data
  const { data: submissions = [], isLoading: submissionsLoading } = useQuery<Submission[]>({
    queryKey: ['/api/reg/submissions'],
  });

  // Calculate calendar events from submissions
  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    const events: CalendarEvent[] = [];
    
    submissions.forEach((sub) => {
      // Add creation date event (when submission was created in system)
      if (sub.created_at) {
        events.push({
          id: `${sub.sub_id}-created`,
          date: sub.created_at.split('T')[0], // Convert to YYYY-MM-DD format
          submission_id: sub.sub_id,
          milestone_type: 'Created',
          title: `${sub.sub_type} Created: ${sub.title}`,
          sub_type: sub.sub_type,
          region: sub.region,
          status: sub.status,
        });
      }

      // Add target date event (primary deadline)
      if (sub.target_date) {
        events.push({
          id: `${sub.sub_id}-target`,
          date: sub.target_date.split('T')[0], // Convert to YYYY-MM-DD format
          submission_id: sub.sub_id,
          milestone_type: 'Target Date',
          title: `${sub.sub_type} Target: ${sub.title}`,
          sub_type: sub.sub_type,
          region: sub.region,
          status: sub.status,
        });

        // Add calculated review milestones based on target date
        const targetDate = parseISO(sub.target_date);
        [-90, -60, -30].forEach((days) => {
          const reviewDate = addDays(targetDate, days);
          events.push({
            id: `${sub.sub_id}-review-${Math.abs(days)}`,
            date: format(reviewDate, 'yyyy-MM-dd'),
            submission_id: sub.sub_id,
            milestone_type: `Review (${Math.abs(days)}d before target)`,
            title: `${sub.sub_type} Review: ${sub.title}`,
            sub_type: sub.sub_type,
            region: sub.region,
            status: sub.status,
          });
        });
      }
    });

    return events;
  }, [submissions]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return calendarEvents.filter((event) => {
      if (typeFilter !== 'all' && event.sub_type !== typeFilter) return false;
      if (regionFilter !== 'all' && event.region !== regionFilter) return false;
      if (statusFilter !== 'all' && event.status !== statusFilter) return false;
      return true;
    });
  }, [calendarEvents, typeFilter, regionFilter, statusFilter]);

  // Get upcoming milestones (next 10)
  const upcomingMilestones = useMemo(() => {
    const today = new Date();
    return filteredEvents
      .filter((event) => new Date(event.date) >= today)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 10);
  }, [filteredEvents]);

  // Get events for selected date
  const eventsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return filteredEvents.filter((event) =>
      isSameDay(parseISO(event.date), selectedDate)
    );
  }, [filteredEvents, selectedDate]);

  // Get dates with events for calendar highlighting
  const datesWithEvents = useMemo(() => {
    return filteredEvents.map((event) => parseISO(event.date));
  }, [filteredEvents]);

  // Get unique values for filters
  const submissionTypes = useMemo(
    () => Array.from(new Set(submissions.map((s) => s.sub_type))),
    [submissions]
  );
  const regions = useMemo(
    () => Array.from(new Set(submissions.map((s) => s.region).filter(Boolean))),
    [submissions]
  );
  const statuses = useMemo(
    () => Array.from(new Set(submissions.map((s) => s.status).filter(Boolean))),
    [submissions]
  );

  const calculateDaysUntil = (date: string): number => {
    return differenceInDays(parseISO(date), new Date());
  };

  const getDaysUntilBadge = (days: number) => {
    if (days < 0)
      return <Badge variant="destructive" data-testid={`badge-overdue-${Math.abs(days)}`}>Overdue {Math.abs(days)}d</Badge>;
    if (days === 0) return <Badge variant="default" data-testid="badge-today">Today</Badge>;
    if (days <= 7)
      return <Badge variant="destructive" data-testid={`badge-urgent-${days}`}>{days}d</Badge>;
    if (days <= 30)
      return <Badge variant="secondary" data-testid={`badge-soon-${days}`}>{days}d</Badge>;
    return <Badge variant="outline" data-testid={`badge-future-${days}`}>{days}d</Badge>;
  };

  if (submissionsLoading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="loading-calendar">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400 mr-3" />
        <span className="text-stone-600">Loading submission calendar...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center">
            <CalendarIcon className="w-6 h-6 mr-2" />
            Submission Calendar
          </h2>
          <p className="text-stone-600 mt-1">
            Track submission timelines, milestones, and upcoming deadlines
          </p>
        </div>
        <Badge variant="secondary" className="bg-stone-100 text-stone-700" data-testid="badge-event-count">
          {filteredEvents.length} Events
        </Badge>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Submission Type</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger data-testid="select-submission-type">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {submissionTypes.map((type) => (
                    <SelectItem key={type} value={type} data-testid={`option-type-${type}`}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Region</label>
              <Select value={regionFilter} onValueChange={setRegionFilter}>
                <SelectTrigger data-testid="select-region">
                  <SelectValue placeholder="All Regions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  {regions.map((region) => (
                    <SelectItem key={region} value={region} data-testid={`option-region-${region}`}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status} data-testid={`option-status-${status}`}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(typeFilter !== 'all' || regionFilter !== 'all' || statusFilter !== 'all') && (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTypeFilter('all');
                  setRegionFilter('all');
                  setStatusFilter('all');
                }}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calendar View */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredEvents.length === 0 ? (
              <div className="text-center py-12" data-testid="empty-calendar">
                <CalendarIcon className="w-12 h-12 mx-auto mb-3 text-stone-300" />
                <p className="font-medium text-stone-500">No events to display</p>
                <p className="text-sm text-stone-400 mt-1">
                  {submissions.length === 0
                    ? 'No submissions available'
                    : 'Try adjusting your filters'}
                </p>
              </div>
            ) : (
              <div data-testid="calendar-view">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  className="rounded-md border"
                  modifiers={{
                    hasEvent: datesWithEvents,
                  }}
                  modifiersClassNames={{
                    hasEvent: 'font-bold',
                  }}
                  components={{
                    Day: ({ date, ...props }) => {
                      const dayEvents = filteredEvents.filter((event) =>
                        isSameDay(parseISO(event.date), date)
                      );
                      return (
                        <div className="relative">
                          <button {...props as any} />
                          {dayEvents.length > 0 && (
                            <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex gap-0.5">
                              {Array.from(
                                new Set(dayEvents.map((e) => e.sub_type))
                              ).map((type) => (
                                <div
                                  key={type}
                                  className={`w-1.5 h-1.5 rounded-full ${SUBMISSION_TYPE_DOT_COLORS[type as keyof typeof SUBMISSION_TYPE_DOT_COLORS]}`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    },
                  }}
                />

                {/* Events for selected date */}
                {selectedDate && eventsForSelectedDate.length > 0 && (
                  <div className="mt-4 space-y-2" data-testid="selected-date-events">
                    <h4 className="font-medium text-sm text-stone-700">
                      Events on {format(selectedDate, 'MMM d, yyyy')}:
                    </h4>
                    {eventsForSelectedDate.map((event) => (
                      <div
                        key={event.id}
                        className={`p-2 rounded border ${SUBMISSION_TYPE_COLORS[event.sub_type]}`}
                        data-testid={`event-${event.id}`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium text-sm">{event.milestone_type}</div>
                            <div className="text-xs mt-0.5">{event.title}</div>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {event.sub_type}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Milestones */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Clock className="w-5 h-5 mr-2" />
              Upcoming Milestones
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingMilestones.length === 0 ? (
              <div className="text-center py-12" data-testid="empty-milestones">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-stone-300" />
                <p className="font-medium text-stone-500">No upcoming milestones</p>
                <p className="text-sm text-stone-400 mt-1">
                  All milestones are in the past or filtered out
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead data-testid="header-date">Date</TableHead>
                      <TableHead data-testid="header-milestone">Milestone</TableHead>
                      <TableHead data-testid="header-type">Type</TableHead>
                      <TableHead data-testid="header-days-until" className="text-right">
                        Days Until
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingMilestones.map((milestone) => {
                      const daysUntil = calculateDaysUntil(milestone.date);
                      return (
                        <TableRow
                          key={milestone.id}
                          className="cursor-pointer hover:bg-stone-50"
                          onClick={() => setSelectedDate(parseISO(milestone.date))}
                          data-testid={`milestone-row-${milestone.id}`}
                        >
                          <TableCell className="font-medium" data-testid={`date-${milestone.id}`}>
                            {format(parseISO(milestone.date), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell data-testid={`title-${milestone.id}`}>
                            <div className="text-sm">
                              <div className="font-medium">{milestone.milestone_type}</div>
                              <div className="text-stone-500 text-xs truncate max-w-xs">
                                {milestone.title}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell data-testid={`type-${milestone.id}`}>
                            <Badge className={SUBMISSION_TYPE_COLORS[milestone.sub_type]}>
                              {milestone.sub_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right" data-testid={`days-${milestone.id}`}>
                            {getDaysUntilBadge(daysUntil)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Calendar Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 border rounded-lg" data-testid="stat-total-submissions">
              <div className="text-2xl font-bold text-stone-600">{submissions.length}</div>
              <div className="text-sm text-stone-600 mt-1">Total Submissions</div>
            </div>
            <div className="text-center p-4 border rounded-lg" data-testid="stat-total-events">
              <div className="text-2xl font-bold text-stone-600">{filteredEvents.length}</div>
              <div className="text-sm text-stone-600 mt-1">Total Events</div>
            </div>
            <div className="text-center p-4 border rounded-lg" data-testid="stat-upcoming-milestones">
              <div className="text-2xl font-bold text-stone-700">{upcomingMilestones.length}</div>
              <div className="text-sm text-stone-600 mt-1">Upcoming Milestones</div>
            </div>
            <div className="text-center p-4 border rounded-lg" data-testid="stat-urgent-deadlines">
              <div className="text-2xl font-bold text-stone-700">
                {upcomingMilestones.filter((m) => calculateDaysUntil(m.date) <= 7).length}
              </div>
              <div className="text-sm text-stone-600 mt-1">Urgent (≤7 days)</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

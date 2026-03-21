/**
 * @fileoverview Regulatory Calendar
 * @module concept2cure/components/calendar/RegulatoryCalendar
 * @version 1.0.0
 *
 * @description
 * Calendar view for regulatory milestones, PDUFA dates, commitments,
 * and agency interactions. This is a critical planning tool for RA teams.
 *
 * Event Types:
 * - PDUFA/Goal Dates: Regulatory decision deadlines
 * - Commitments: PMCs, PMEs, REMS, Annual Reports
 * - Meetings: Pre-IND, EOP, Pre-NDA, Advisory Committees
 * - Internal: Review deadlines, publication dates, filing targets
 *
 * @compliance
 * - FDA 21 CFR Part 11: All date changes tracked
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Flag,
  Users,
  FileText,
  AlertTriangle,
  Bell,
  Filter,
  Plus,
  MoreHorizontal,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type EventType = 
  | 'pdufa'           // PDUFA goal dates
  | 'commitment'      // PMC, PME, REMS
  | 'meeting'         // FDA meetings
  | 'filing'          // Submission targets
  | 'internal'        // Internal deadlines
  | 'renewal'         // License renewals
  | 'variation'       // Variation submissions
  | 'psur';           // Safety reports

export type EventPriority = 'low' | 'medium' | 'high' | 'critical';

export interface RegulatoryEvent {
  id: string;
  title: string;
  description?: string;
  type: EventType;
  date: string;
  endDate?: string;  // For multi-day events
  allDay: boolean;
  priority: EventPriority;
  
  // Context
  productId?: string;
  productName?: string;
  region?: string;
  submissionType?: string;
  
  // People
  owner?: string;
  attendees?: string[];
  
  // Status
  status?: 'scheduled' | 'confirmed' | 'tentative' | 'completed' | 'cancelled';
  
  // Additional
  location?: string;
  notes?: string;
  attachments?: string[];
}

interface RegulatoryCalendarProps {
  events: RegulatoryEvent[];
  onEventClick?: (event: RegulatoryEvent) => void;
  onDateClick?: (date: Date) => void;
  onAddEvent?: (date: Date) => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const EVENT_CONFIG: Record<EventType, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}> = {
  pdufa: {
    icon: CalendarIcon,
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-300',
    label: 'PDUFA Date',
  },
  commitment: {
    icon: Flag,
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    borderColor: 'border-amber-300',
    label: 'Commitment',
  },
  meeting: {
    icon: Users,
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-300',
    label: 'Meeting',
  },
  filing: {
    icon: FileText,
    color: 'text-violet-700',
    bgColor: 'bg-violet-100',
    borderColor: 'border-violet-300',
    label: 'Filing',
  },
  internal: {
    icon: Clock,
    color: 'text-zinc-700',
    bgColor: 'bg-zinc-100',
    borderColor: 'border-zinc-300',
    label: 'Internal',
  },
  renewal: {
    icon: Bell,
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-100',
    borderColor: 'border-emerald-300',
    label: 'Renewal',
  },
  variation: {
    icon: FileText,
    color: 'text-pink-700',
    bgColor: 'bg-pink-100',
    borderColor: 'border-pink-300',
    label: 'Variation',
  },
  psur: {
    icon: AlertTriangle,
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    borderColor: 'border-orange-300',
    label: 'PSUR/PBRER',
  },
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month + 1, 0).getDate();
};

const getFirstDayOfMonth = (year: number, month: number): number => {
  return new Date(year, month, 1).getDay();
};

const isSameDay = (d1: Date, d2: Date): boolean => {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
};

const isToday = (date: Date): boolean => {
  return isSameDay(date, new Date());
};

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT BADGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const EventBadge: React.FC<{
  event: RegulatoryEvent;
  compact?: boolean;
  onClick?: () => void;
}> = ({ event, compact = false, onClick }) => {
  const config = EVENT_CONFIG[event.type];
  const Icon = config.icon;
  
  if (compact) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'w-full text-left px-1.5 py-0.5 rounded text-xs truncate',
          config.bgColor,
          config.color,
          'hover:opacity-80 transition-opacity'
        )}
        title={event.title}
      >
        {event.title}
      </button>
    );
  }
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-2 rounded-lg border transition-all duration-150',
        config.bgColor,
        config.borderColor,
        'hover:shadow-md'
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', config.color)} />
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium truncate', config.color)}>
            {event.title}
          </p>
          {event.productName && (
            <p className="text-xs text-zinc-500 truncate">{event.productName}</p>
          )}
          {!event.allDay && (
            <p className="text-xs text-zinc-500 mt-1">
              {new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        {event.priority === 'critical' && (
          <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
        )}
      </div>
    </button>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// UPCOMING EVENTS SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════════

const UpcomingEventsSidebar: React.FC<{
  events: RegulatoryEvent[];
  selectedDate: Date;
  onEventClick?: (event: RegulatoryEvent) => void;
}> = ({ events, selectedDate, onEventClick }) => {
  // Get events for next 30 days
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    return events
      .filter(e => {
        const eventDate = new Date(e.date);
        return eventDate >= now && eventDate <= thirtyDaysLater;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events]);
  
  // Group by date
  const groupedEvents = useMemo(() => {
    const groups: Record<string, RegulatoryEvent[]> = {};
    
    upcomingEvents.forEach(event => {
      const dateKey = new Date(event.date).toDateString();
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(event);
    });
    
    return groups;
  }, [upcomingEvents]);
  
  return (
    <div className="w-80 border-l border-zinc-200 bg-zinc-50 p-4 overflow-y-auto">
      <h3 className="text-sm font-semibold text-zinc-900 mb-4">Upcoming Events</h3>
      
      {Object.keys(groupedEvents).length === 0 ? (
        <p className="text-sm text-zinc-500 italic">No upcoming events</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedEvents).slice(0, 10).map(([dateKey, dateEvents]) => {
            const date = new Date(dateKey);
            const isSelectedDay = isSameDay(date, selectedDate);
            
            return (
              <div key={dateKey}>
                <div className={cn(
                  'text-xs font-medium mb-2 px-2 py-1 rounded',
                  isToday(date) && 'bg-blue-100 text-blue-700',
                  isSelectedDay && !isToday(date) && 'bg-blue-100 text-blue-700',
                  !isToday(date) && !isSelectedDay && 'text-zinc-500'
                )}>
                  {isToday(date) ? 'Today' : date.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
                <div className="space-y-2">
                  {dateEvents.map(event => (
                    <EventBadge
                      key={event.id}
                      event={event}
                      onClick={() => onEventClick?.(event)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN CALENDAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const RegulatoryCalendar: React.FC<RegulatoryCalendarProps> = ({
  events,
  onEventClick,
  onDateClick,
  onAddEvent,
  className,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filterTypes, setFilterTypes] = useState<Set<EventType>>(new Set());
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  
  // Filter events by type
  const filteredEvents = useMemo(() => {
    if (filterTypes.size === 0) return events;
    return events.filter(e => filterTypes.has(e.type));
  }, [events, filterTypes]);
  
  // Get events for a specific date
  const getEventsForDate = (date: Date): RegulatoryEvent[] => {
    return filteredEvents.filter(event => {
      const eventDate = new Date(event.date);
      return isSameDay(eventDate, date);
    });
  };
  
  // Navigate months
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };
  
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };
  
  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };
  
  // Generate calendar grid
  const calendarDays = useMemo(() => {
    const days: (Date | null)[] = [];
    
    // Add empty cells for days before the first of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  }, [year, month, daysInMonth, firstDay]);
  
  // Toggle filter
  const toggleFilter = (type: EventType) => {
    setFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };
  
  return (
    <div className={cn('flex h-full bg-white', className)}>
      {/* Main Calendar */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-zinc-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-semibold text-zinc-900">
                {MONTHS[month]} {year}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={prevMonth}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors duration-150"
                >
                  <ChevronLeft className="w-5 h-5 text-zinc-600" />
                </button>
                <button
                  onClick={nextMonth}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors duration-150"
                >
                  <ChevronRight className="w-5 h-5 text-zinc-600" />
                </button>
              </div>
              <button
                onClick={goToToday}
                className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-150"
              >
                Today
              </button>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Event Type Filters */}
              <div className="flex items-center gap-1">
                {Object.entries(EVENT_CONFIG).slice(0, 4).map(([type, config]) => {
                  const isActive = filterTypes.size === 0 || filterTypes.has(type as EventType);
                  return (
                    <button
                      key={type}
                      onClick={() => toggleFilter(type as EventType)}
                      className={cn(
                        'px-2 py-1 text-xs rounded-full border transition-colors duration-150',
                        isActive ? cn(config.bgColor, config.borderColor, config.color) : 'bg-zinc-100 border-zinc-200 text-zinc-400'
                      )}
                    >
                      {config.label}
                    </button>
                  );
                })}
                <button className="px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 rounded-full">
                  More...
                </button>
              </div>
              
              {onAddEvent && (
                <button
                  onClick={() => onAddEvent(selectedDate)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors duration-150"
                >
                  <Plus className="w-4 h-4" />
                  Add Event
                </button>
              )}
            </div>
          </div>
        </div>
        
        {/* Calendar Grid */}
        <div className="flex-1 p-4 overflow-y-auto">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {DAYS.map(day => (
              <div
                key={day}
                className="text-center text-xs font-medium text-zinc-500 py-2"
              >
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar cells */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className="min-h-[100px]" />;
              }
              
              const dayEvents = getEventsForDate(date);
              const isSelected = isSameDay(date, selectedDate);
              const isTodayDate = isToday(date);
              const hasCritical = dayEvents.some(e => e.priority === 'critical');
              const hasPdufa = dayEvents.some(e => e.type === 'pdufa');
              
              return (
                <button
                  key={date.toISOString()}
                  onClick={() => {
                    setSelectedDate(date);
                    onDateClick?.(date);
                  }}
                  className={cn(
                    'min-h-[100px] p-1 text-left rounded-lg border transition-colors duration-150',
                    isSelected && 'border-blue-500 bg-blue-50',
                    !isSelected && 'border-zinc-200 hover:border-zinc-200 hover:bg-zinc-50',
                    hasPdufa && !isSelected && 'border-red-200 bg-red-50/50'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn(
                      'w-6 h-6 flex items-center justify-center text-sm rounded-full',
                      isTodayDate && 'bg-blue-600 text-white font-semibold',
                      !isTodayDate && isSelected && 'text-blue-700 font-medium',
                      !isTodayDate && !isSelected && 'text-zinc-700'
                    )}>
                      {date.getDate()}
                    </span>
                    {hasCritical && (
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                    )}
                  </div>
                  
                  {/* Events */}
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map(event => (
                      <EventBadge
                        key={event.id}
                        event={event}
                        compact
                        onClick={() => onEventClick?.(event)}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-xs text-zinc-500 pl-1">
                        +{dayEvents.length - 3} more
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Sidebar */}
      <UpcomingEventsSidebar
        events={filteredEvents}
        selectedDate={selectedDate}
        onEventClick={onEventClick}
      />
    </div>
  );
};

export default RegulatoryCalendar;

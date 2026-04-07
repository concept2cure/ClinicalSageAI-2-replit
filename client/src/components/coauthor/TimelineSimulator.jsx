import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  Calendar,
  Clock,
  CalendarDays,
  Check,
  Edit,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  ArrowRight,
} from 'lucide-react';

export default function TimelineSimulator() {
  const [duration, setDuration] = useState(120); // Default 120 days
  const [targetDate, setTargetDate] = useState(() => {
    // Default to 120 days from today
    const date = new Date();
    date.setDate(date.getDate() + 120);
    return date.toISOString().split('T')[0];
  });
  const [milestones, setMilestones] = useState([
    {
      id: 1,
      title: 'Initial Draft Completion',
      day: 30,
      completed: true,
    },
    {
      id: 2,
      title: 'Internal Review',
      day: 45,
      completed: false,
    },
    {
      id: 3,
      title: 'Quality Check',
      day: 60,
      completed: false,
    },
    {
      id: 4,
      title: 'Regulatory Review',
      day: 90,
      completed: false,
    },
    {
      id: 5,
      title: 'Final Approval',
      day: 105,
      completed: false,
    },
    {
      id: 6,
      title: 'Submission',
      day: 120,
      completed: false,
    },
  ]);
  const [editingMilestone, setEditingMilestone] = useState(null);
  const [newMilestone, setNewMilestone] = useState({ title: '', day: 0 });
  const [currentDay, setCurrentDay] = useState(30); // Simulate we're at day 30

  // Update target date when duration changes
  useEffect(() => {
    const date = new Date();
    date.setDate(date.getDate() + duration);
    setTargetDate(date.toISOString().split('T')[0]);
  }, [duration]);

  // Format date to display
  const formatDate = daysFromNow => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Handle adding a new milestone
  const handleAddMilestone = () => {
    if (!newMilestone.title.trim()) return;

    const id = Math.max(0, ...milestones.map(m => m.id)) + 1;
    setMilestones([...milestones, { ...newMilestone, id, completed: false }]);
    setNewMilestone({ title: '', day: 0 });
  };

  // Handle removing a milestone
  const handleRemoveMilestone = id => {
    setMilestones(milestones.filter(m => m.id !== id));
  };

  // Handle editing a milestone
  const handleEditMilestone = milestone => {
    setEditingMilestone(milestone);
  };

  // Handle saving edits
  const handleSaveEdit = () => {
    if (!editingMilestone || !editingMilestone.title.trim()) return;

    setMilestones(milestones.map(m => (m.id === editingMilestone.id ? editingMilestone : m)));
    setEditingMilestone(null);
  };

  // Handle toggling completion status
  const handleToggleComplete = id => {
    setMilestones(milestones.map(m => (m.id === id ? { ...m, completed: !m.completed } : m)));
  };

  // Calculate the percentage position for the timeline markers
  const calculatePosition = day => {
    return (day / duration) * 100;
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-800 flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-blue-600" />
            eCTD Submission Timeline Simulator
          </CardTitle>
          <span className="text-sm text-blue-600 font-medium flex items-center">
            <Clock className="h-4 w-4 mr-1" />
            Current day: {currentDay}
          </span>
        </div>
      </CardHeader>

      <CardContent>
        {/* Timeline visualization */}
        <div className="mb-6">
          <div className="relative">
            {/* Timeline bar */}
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="absolute h-full bg-blue-500"
                style={{ width: `${calculatePosition(currentDay)}%` }}
              />
            </div>

            {/* Current day marker */}
            <div
              className="absolute w-4 h-4 bg-white border-2 border-blue-600 rounded-full -top-1"
              style={{ left: `${calculatePosition(currentDay)}%`, transform: 'translateX(-50%)' }}
            />

            {/* Milestone markers */}
            {milestones.map(milestone => (
              <div
                key={milestone.id}
                className={`absolute w-3 h-3 rounded-full -top-0.5 ${
                  milestone.completed
                    ? 'bg-green-500'
                    : calculatePosition(milestone.day) <= calculatePosition(currentDay)
                      ? 'bg-yellow-500'
                      : 'bg-gray-400'
                }`}
                style={{
                  left: `${calculatePosition(milestone.day)}%`,
                  transform: 'translateX(-50%)',
                }}
                title={`${milestone.title} (Day ${milestone.day})`}
              />
            ))}
          </div>

          {/* Timeline dates */}
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <div>Today</div>
            <div>{formatDate(duration / 4)}</div>
            <div>{formatDate(duration / 2)}</div>
            <div>{formatDate((duration * 3) / 4)}</div>
            <div>{formatDate(duration)}</div>
          </div>
        </div>

        {/* Timeline duration control */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <Label className="text-sm font-medium">Timeline Duration (Days)</Label>
            <span className="text-sm text-blue-600 font-medium flex items-center">
              <CalendarDays className="h-4 w-4 mr-1" />
              Target: {formatDate(duration)}
            </span>
          </div>
          <div className="flex gap-4 items-center">
            <Slider
              value={[duration]}
              min={30}
              max={365}
              step={1}
              onValueChange={val => setDuration(val[0])}
              className="flex-1"
            />
            <Input
              type="number"
              min={30}
              max={365}
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              className="w-20"
            />
          </div>
        </div>

        {/* Milestones section */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <Label className="text-sm font-medium">Submission Milestones</Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs flex items-center text-blue-600"
              onClick={() => setCurrentDay(currentDay < duration ? currentDay + 5 : currentDay)}
            >
              <ArrowRight className="h-3.5 w-3.5 mr-1" />
              <span>Advance 5 days</span>
            </Button>
          </div>

          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {milestones.map(milestone => (
              <div
                key={milestone.id}
                className={`flex items-center justify-between p-2 rounded border ${
                  calculatePosition(milestone.day) <= calculatePosition(currentDay)
                    ? milestone.completed
                      ? 'bg-green-50 border-green-200'
                      : 'bg-yellow-50 border-yellow-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                {editingMilestone && editingMilestone.id === milestone.id ? (
                  <>
                    <div className="flex-1 flex gap-2">
                      <Input
                        value={editingMilestone.title}
                        onChange={e =>
                          setEditingMilestone({ ...editingMilestone, title: e.target.value })
                        }
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number"
                        min={0}
                        max={duration}
                        value={editingMilestone.day}
                        onChange={e =>
                          setEditingMilestone({ ...editingMilestone, day: Number(e.target.value) })
                        }
                        className="h-8 text-sm w-16"
                      />
                    </div>
                    <div className="flex">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-green-600"
                        onClick={handleSaveEdit}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 w-7 p-0 rounded-full ${
                          milestone.completed
                            ? 'bg-green-500 text-white hover:bg-green-600'
                            : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                        }`}
                        onClick={() => handleToggleComplete(milestone.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <div>
                        <div className="font-medium text-sm">{milestone.title}</div>
                        <div className="text-xs text-gray-500">
                          Day {milestone.day} ({formatDate(milestone.day)})
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-blue-600"
                        onClick={() => handleEditMilestone(milestone)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-600"
                        onClick={() => handleRemoveMilestone(milestone.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Add new milestone */}
          <div className="mt-3 border-t pt-3">
            <div className="flex gap-2">
              <Input
                placeholder="New milestone"
                value={newMilestone.title}
                onChange={e => setNewMilestone({ ...newMilestone, title: e.target.value })}
                className="h-8 text-sm"
              />
              <Input
                type="number"
                placeholder="Day"
                min={0}
                max={duration}
                value={newMilestone.day || ''}
                onChange={e => setNewMilestone({ ...newMilestone, day: Number(e.target.value) })}
                className="h-8 text-sm w-16"
              />
              <Button
                onClick={handleAddMilestone}
                className="h-8 bg-blue-600 hover:bg-blue-700"
                disabled={!newMilestone.title.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

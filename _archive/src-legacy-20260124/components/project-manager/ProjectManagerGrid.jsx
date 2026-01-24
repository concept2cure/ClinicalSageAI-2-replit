import React from 'react';
import {
  ChevronRight,
  Clock,
  BarChart2,
  FileText,
  Database,
  Search,
  Beaker,
  ClipboardList,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

/**
 * ProjectManagerGrid Component
 *
 * Displays a grid of projects with their status, progress, and relevant module information.
 */
const ProjectManagerGrid = ({ projects = [] }) => {
  // Get appropriate icon based on module
  const getModuleIcon = module => {
    switch (module) {
      case 'cer-generator':
      case 'cer2v':
        return <FileText className="h-4 w-4 text-green-600" />;
      case 'ind-wizard':
        return <FileText className="h-4 w-4 text-blue-600" />;
      case 'cmc-wizard':
      case 'cmc-module':
        return <Beaker className="h-4 w-4 text-amber-600" />;
      case 'study-architect':
        return <ClipboardList className="h-4 w-4 text-orange-600" />;
      case 'csr-intelligence':
        return <Search className="h-4 w-4 text-teal-600" />;
      case 'analytics':
        return <BarChart2 className="h-4 w-4 text-indigo-600" />;
      case 'trial-vault':
      case 'vault':
        return <Database className="h-4 w-4 text-slate-600" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  // Get badge variant based on status
  const getBadgeVariant = status => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'in_progress':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'not_started':
        return 'outline';
      case 'at_risk':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  // Status display text
  const getStatusDisplay = status => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      case 'pending':
        return 'Pending';
      case 'not_started':
        return 'Not Started';
      case 'at_risk':
        return 'At Risk';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
    }
  };

  // Calculate days remaining
  const getDaysRemaining = dueDate => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (!projects || projects.length === 0) {
    return (
      <div className="text-center p-8">
        <FileText className="h-12 w-12 mx-auto text-gray-300" />
        <h3 className="mt-4 text-lg font-medium text-gray-600">No Projects Found</h3>
        <p className="mt-1 text-gray-500">There are no projects to display.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {projects.map(project => (
        <div
          key={project.id}
          className="bg-white border rounded-lg shadow-sm hover:shadow transition-shadow p-4"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center">
                {getModuleIcon(project.module)}
                <h3 className="ml-2 font-medium text-gray-800">{project.name}</h3>
              </div>
              <div className="flex items-center mt-1 text-xs text-gray-500">
                <Clock className="h-3.5 w-3.5 mr-1" />
                <span>
                  Due:{' '}
                  {new Date(project.dueDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                <span className="mx-2">•</span>
                <span>{getDaysRemaining(project.dueDate)} days remaining</span>
              </div>
            </div>
            <Badge variant={getBadgeVariant(project.status)}>
              {getStatusDisplay(project.status)}
            </Badge>
          </div>

          <div className="mb-4">
            <div className="flex justify-between items-center text-xs mb-1">
              <span>Progress</span>
              <span>{project.progress}%</span>
            </div>
            <Progress value={project.progress} className="h-2" />
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <div className="flex items-center space-x-1">
                <Badge
                  variant="outline"
                  className={
                    project.priority === 'high'
                      ? 'text-red-700 border-red-200 bg-red-50'
                      : project.priority === 'medium'
                        ? 'text-amber-700 border-amber-200 bg-amber-50'
                        : 'text-green-700 border-green-200 bg-green-50'
                  }
                >
                  {project.priority.charAt(0).toUpperCase() + project.priority.slice(1)} Priority
                </Badge>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-primary">
              <span>View Details</span>
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ProjectManagerGrid;

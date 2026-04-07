/**
 * Quick Action Card Widget
 * 
 * Displays a clickable card for common portal actions.
 */

import { Link } from 'wouter';
import { 
  FileText, 
  Upload, 
  CheckCircle, 
  MessageCircle,
  BarChart,
  Users,
  Settings,
  Folder,
  LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap: Record<string, LucideIcon> = {
  'file-text': FileText,
  'upload': Upload,
  'check-circle': CheckCircle,
  'message-circle': MessageCircle,
  'bar-chart': BarChart,
  'users': Users,
  'settings': Settings,
  'folder': Folder,
};

interface QuickActionCardProps {
  title: string;
  description: string;
  href: string;
  icon: string;
  className?: string;
}

export function QuickActionCard({ 
  title, 
  description, 
  href, 
  icon,
  className 
}: QuickActionCardProps) {
  const Icon = iconMap[icon] || FileText;
  
  return (
    <Link href={href}>
      <div className={cn(
        "group flex items-center gap-4 p-4 rounded-lg border border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/50 transition-all cursor-pointer",
        className
      )}>
        <div className="h-10 w-10 rounded-lg bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
          <Icon className="h-5 w-5 text-gray-600 group-hover:text-blue-600 transition-colors" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-gray-900 group-hover:text-blue-900 transition-colors">
            {title}
          </p>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
    </Link>
  );
}

export default QuickActionCard;

import React from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';

interface StatCardProps {
  icon: React.ReactNode;
  count: number;
  label: string;
  onClick?: () => void;
  href?: string;
  className?: string;
  color?: 'default' | 'blue' | 'green' | 'purple' | 'orange' | 'red';
}

const StatCard: React.FC<StatCardProps> = ({
  icon,
  count,
  label,
  onClick,
  href,
  className,
  color = 'default',
}) => {
  const [, setLocation] = useLocation();

  const colorClasses = {
    default: 'bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700',
    blue: 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30',
    green: 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30',
    purple: 'bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/30',
    orange: 'bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/30',
    red: 'bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30',
  };

  const iconColors = {
    default: 'text-gray-500 dark:text-gray-400',
    blue: 'text-blue-500 dark:text-blue-400',
    green: 'text-emerald-500 dark:text-emerald-400',
    purple: 'text-purple-500 dark:text-purple-400',
    orange: 'text-orange-500 dark:text-orange-400',
    red: 'text-red-500 dark:text-red-400',
  };

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (href) {
      setLocation(href);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transition-colors cursor-pointer',
        colorClasses[color],
        className
      )}
      onClick={handleClick}
    >
      <div className={cn('mb-3', iconColors[color])}>{icon}</div>
      <div className="text-3xl font-bold text-gray-800 dark:text-gray-100">
        {count.toLocaleString()}
      </div>
      <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{label}</div>
    </div>
  );
};

export default StatCard;

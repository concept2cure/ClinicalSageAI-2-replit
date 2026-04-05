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
    default: 'bg-white hover:bg-stone-50 dark:bg-stone-800 dark:hover:bg-stone-700',
    blue: 'bg-stone-100 hover:bg-stone-100 dark:bg-stone-900/20 dark:hover:bg-stone-900/30',
    green: 'bg-stone-100 hover:bg-stone-100 dark:bg-stone-900/20 dark:hover:bg-stone-900/30',
    purple: 'bg-stone-100 hover:bg-stone-100 dark:bg-stone-900/20 dark:hover:bg-stone-900/30',
    orange: 'bg-stone-100 hover:bg-stone-100 dark:bg-stone-900/20 dark:hover:bg-stone-900/30',
    red: 'bg-stone-100 hover:bg-stone-100 dark:bg-stone-900/20 dark:hover:bg-stone-900/30',
  };

  const iconColors = {
    default: 'text-stone-500 dark:text-stone-400',
    blue: 'text-stone-1000 dark:text-stone-400',
    green: 'text-stone-1000 dark:text-stone-400',
    purple: 'text-stone-1000 dark:text-stone-400',
    orange: 'text-stone-1000 dark:text-stone-400',
    red: 'text-stone-1000 dark:text-stone-400',
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
        'flex flex-col items-center justify-center p-6 rounded-lg shadow-sm border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer',
        colorClasses[color],
        className
      )}
      onClick={handleClick}
    >
      <div className={cn('mb-3', iconColors[color])}>{icon}</div>
      <div className="text-3xl font-bold text-stone-800 dark:text-stone-100">
        {count.toLocaleString()}
      </div>
      <div className="mt-1 text-sm text-stone-600 dark:text-stone-400">{label}</div>
    </div>
  );
};

export default StatCard;

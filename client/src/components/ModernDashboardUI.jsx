import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  PlayCircle, Edit, CheckCircle, Package, Send, FileText, FlaskConical, Activity, BookOpen, TrendingUp, Users, Clock, AlertCircle, Shield, BarChart3, Target, Award, Zap } from 'lucide-react'
import { cn } from '@/lib/utils';

// Animated counter hook for metrics
const useAnimatedCounter = (end, duration = 2000) => {
  const [count, setCount] = useState(0);
  const countRef = useRef(null);

  useEffect(() => {
    const start = 0;
    const increment = end / (duration / 10);
    
    countRef.current = setInterval(() => {
      setCount(prevCount => {
        const newCount = prevCount + increment;
        if (newCount >= end) {
          clearInterval(countRef.current);
          return end;
        }
        return Math.floor(newCount);
      });
    }, 10);

    return () => clearInterval(countRef.current);
  }, [end, duration]);

  return count;
};

// Modern glassmorphic card component
export const GlassCard = ({ 
  children, 
  className = '', 
  gradient = 'from-white/10 to-white/5',
  hover = true,
  glow = false,
  glowColor = 'blue',
  onClick
}) => {
  return (
    <div
      className={cn(
        'glass-card relative overflow-hidden transition-all duration-300',
        hover && 'hover:scale-[1.02] hover:shadow-2xl',
        glow && `ring-2 ring-${glowColor}-400/30`,
        'cursor-pointer',
        className
      )}
      onClick={onClick}
      style={{
        background: `linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 8px 32px rgba(31, 38, 135, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
      }}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-50`} />
      <div className="relative z-10">{children}</div>
    </div>
  );
};

// Modern animated progress bar
export const AnimatedProgress = ({ value, className = '', showLabel = false, gradient = true }) => {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedValue(value), 100);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="relative">
      <div className="w-full bg-gray-200/20 rounded-full h-3 overflow-hidden backdrop-blur-sm">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden',
            gradient ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500' : 'bg-blue-500',
            className
          )}
          style={{ width: `${animatedValue}%` }}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
        </div>
      </div>
      {showLabel && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-white">
          {value}%
        </span>
      )}
    </div>
  );
};

// Modern stage-gate pipeline component
export const AnimatedPipeline = ({ stages, currentStage }) => {
  return (
    <div className="flex items-center justify-between p-6 rounded-2xl bg-gradient-to-r from-blue-50/50 to-purple-50/50 backdrop-blur-sm">
      {stages.map((stage, index) => {
        const isComplete = stage.status === 'complete';
        const isActive = stage.status === 'active';
        const isPending = stage.status === 'pending';
        
        return (
          <React.Fragment key={stage.name}>
            <div className="flex flex-col items-center flex-1 relative">
              {/* Stage circle with animations */}
              <div className="relative">
                {isActive && (
                  <div className="absolute inset-0 animate-ping">
                    <div className="w-14 h-14 rounded-full bg-blue-400 opacity-75" />
                  </div>
                )}
                <div
                  className={cn(
                    'w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 relative z-10',
                    isComplete && 'bg-gradient-to-br from-green-400 to-green-600 shadow-lg shadow-green-500/50',
                    isActive && 'bg-gradient-to-br from-blue-400 to-purple-600 shadow-lg shadow-blue-500/50 animate-pulse',
                    isPending && 'bg-gray-300 border-2 border-gray-400'
                  )}
                >
                  <stage.icon className={cn(
                    'w-7 h-7 transition-all duration-300',
                    (isComplete || isActive) && 'text-white',
                    isPending && 'text-gray-500'
                  )} />
                  {isComplete && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
              </div>
              
              {/* Stage label */}
              <span className={cn(
                'text-sm font-semibold mt-3 transition-colors duration-300',
                isComplete && 'text-green-700',
                isActive && 'text-blue-700',
                isPending && 'text-gray-500'
              )}>
                {stage.name}
              </span>
              
              {/* Stage description */}
              {stage.description && (
                <span className="text-xs text-gray-500 mt-1">
                  {stage.description}
                </span>
              )}
            </div>
            
            {/* Connector line with gradient */}
            {index < stages.length - 1 && (
              <div className="flex-1 mx-3 relative">
                <div className="h-1 bg-gray-300 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-1000',
                      stages[index].status === 'complete' 
                        ? 'bg-gradient-to-r from-green-400 to-blue-400 w-full' 
                        : 'w-0'
                    )}
                  >
                    {stages[index].status === 'complete' && (
                      <div className="h-full bg-gradient-to-r from-transparent via-white/50 to-transparent animate-flow" />
                    )}
                  </div>
                </div>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// Modern metrics card with animation
export const MetricCard = ({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  color = 'blue',
  suffix = '',
  animated = true 
}) => {
  const animatedValue = animated ? useAnimatedCounter(value) : value;
  const gradients = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    amber: 'from-amber-500 to-amber-600',
    rose: 'from-rose-500 to-rose-600',
    indigo: 'from-indigo-500 to-indigo-600'
  };

  return (
    <GlassCard className="group">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={cn(
            'p-3 rounded-xl bg-gradient-to-br',
            gradients[color],
            'shadow-lg group-hover:scale-110 transition-transform duration-300'
          )}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          {trend && (
            <Badge variant={trend > 0 ? 'success' : 'destructive'} className="animate-fade-in">
              {trend > 0 ? '+' : ''}{trend}%
            </Badge>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-3xl font-bold bg-gradient-to-r from-gray-700 to-gray-900 bg-clip-text text-transparent">
            {animatedValue}{suffix}
          </p>
        </div>
      </CardContent>
    </GlassCard>
  );
};

// Modern module status card
export const ModuleCard = ({ 
  module, 
  icon: Icon, 
  title, 
  description, 
  progress, 
  status, 
  stats,
  onClick 
}) => {
  const statusColors = {
    'complete': 'from-green-500/20 to-green-600/10',
    'in-progress': 'from-blue-500/20 to-purple-600/10',
    'pending': 'from-gray-400/20 to-gray-500/10'
  };

  const statusBadgeColors = {
    'complete': 'bg-green-500',
    'in-progress': 'bg-blue-500',
    'pending': 'bg-gray-400'
  };

  return (
    <GlassCard
      gradient={statusColors[status]}
      hover={true}
      glow={status === 'in-progress'}
      glowColor={status === 'in-progress' ? 'blue' : 'gray'}
      onClick={onClick}
      className="transform transition-all duration-500 hover:rotate-1"
    >
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-white/20 to-white/10 backdrop-blur-sm">
              <Icon className="w-6 h-6 text-gray-700" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-gray-800">{title}</CardTitle>
              <p className="text-sm text-gray-600 mt-0.5">{description}</p>
            </div>
          </div>
          <Badge className={cn('text-white', statusBadgeColors[status])}>
            {status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress section */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Progress</span>
            <span className="font-semibold text-gray-800">{progress}%</span>
          </div>
          <AnimatedProgress value={progress} gradient={true} />
        </div>
        
        {/* Stats grid */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 pt-3">
            {stats.map((stat, index) => (
              <div key={index} className="text-center p-2 rounded-lg bg-white/50 backdrop-blur-sm">
                <p className="text-xl font-bold text-gray-800">{stat.value}</p>
                <p className="text-xs text-gray-600">{stat.label}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
};

// Add shimmer animation to CSS
const shimmerStyle = `
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  .animate-shimmer {
    animation: shimmer 2s infinite;
  }
  @keyframes flow {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  .animate-flow {
    animation: flow 3s linear infinite;
  }
  @keyframes fade-in {
    0% { opacity: 0; transform: translateY(-10px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .animate-fade-in {
    animation: fade-in 0.5s ease-out;
  }
`;

// Export styles to be injected
export const modernStyles = shimmerStyle;

export default {
  GlassCard,
  AnimatedProgress,
  AnimatedPipeline,
  MetricCard,
  ModuleCard,
  modernStyles
};
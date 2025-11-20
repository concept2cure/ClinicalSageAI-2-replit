/**
 * Advanced Visualization Components for Enterprise Analytics
 *
 * This module exports highly specialized visualization components for
 * regulatory analytics that go beyond standard chart libraries like Recharts.
 */

import React, { useMemo } from 'react';
import { ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';

// Network visualization for document relationships
export const Network = ({ data, width = '100%', height = 400 }) => {
  // For a real implementation, we would use a library like react-force-graph
  // or vis-network to render the network graph
  return (
    <div
      style={{ width, height }}
      className="flex items-center justify-center bg-gray-50 rounded-md"
    >
      <div className="text-center text-gray-500">
        <svg
          className="w-16 h-16 mx-auto mb-2 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        <p className="text-sm font-medium">Network Graph Visualization</p>
        <p className="text-xs mt-1">Shows document relationships and dependencies</p>
      </div>
    </div>
  );
};

// Heat map grid for section completion status
export const HeatMapGrid = ({
  data,
  width = '100%',
  height = 400,
  xLabels = [],
  yLabels = [],
  colorScale = value => {
    if (value >= 90) return '#10B981'; // green-500
    if (value >= 70) return '#3B82F6'; // blue-500
    if (value >= 50) return '#F59E0B'; // amber-500
    if (value >= 30) return '#F97316'; // orange-500
    return '#EF4444'; // red-500
  },
}) => {
  // We would use a specialized heat map library in production
  return (
    <div style={{ width, height }} className="overflow-auto">
      <div className="grid grid-cols-1" style={{ minWidth: xLabels.length * 60 }}>
        {/* X-axis labels */}
        <div className="flex border-b">
          <div className="w-32 shrink-0"></div>
          {xLabels.map((label, i) => (
            <div key={i} className="w-16 text-center text-xs font-medium text-gray-500 py-1">
              {label}
            </div>
          ))}
        </div>

        {/* Grid cells */}
        {yLabels.map((yLabel, y) => (
          <div key={y} className="flex border-b">
            <div className="w-32 shrink-0 text-xs font-medium text-gray-700 p-2 flex items-center">
              {yLabel}
            </div>
            {data[y]?.map((value, x) => (
              <div
                key={x}
                className="w-16 h-16 flex items-center justify-center"
                style={{ backgroundColor: colorScale(value) }}
              >
                <span className="text-xs font-medium text-white">{value}%</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// Geographic visualization for regional performance
export const Choropleth = ({ data, width = '100%', height = 400 }) => {
  return (
    <div
      style={{ width, height }}
      className="flex items-center justify-center bg-gray-50 rounded-md"
    >
      <div className="text-center text-gray-500">
        <svg
          className="w-16 h-16 mx-auto mb-2 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2h2a2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2v1.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-sm font-medium">Geographic Performance Map</p>
        <p className="text-xs mt-1">Regional regulatory performance visualization</p>
      </div>
    </div>
  );
};

// GeoFeature for detailed geographic data
export const GeoFeature = ({ data, width = '100%', height = 400 }) => {
  return (
    <div
      style={{ width, height }}
      className="flex items-center justify-center bg-gray-50 rounded-md"
    >
      <div className="text-center text-gray-500">
        <svg
          className="w-16 h-16 mx-auto mb-2 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
          />
        </svg>
        <p className="text-sm font-medium">Geographic Feature Map</p>
        <p className="text-xs mt-1">Detailed regional performance metrics</p>
      </div>
    </div>
  );
};

// Stream graph for temporal patterns
export const StreamGraph = ({ data, width = '100%', height = 400 }) => {
  return (
    <div
      style={{ width, height }}
      className="flex items-center justify-center bg-gray-50 rounded-md"
    >
      <div className="text-center text-gray-500">
        <svg
          className="w-16 h-16 mx-auto mb-2 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
          />
        </svg>
        <p className="text-sm font-medium">Stream Graph</p>
        <p className="text-xs mt-1">Visualizes changes over time across categories</p>
      </div>
    </div>
  );
};

// Sunburst for hierarchical data
export const Sunburst = ({ data, width = '100%', height = 400 }) => {
  return (
    <div
      style={{ width, height }}
      className="flex items-center justify-center bg-gray-50 rounded-md"
    >
      <div className="text-center text-gray-500">
        <svg
          className="w-16 h-16 mx-auto mb-2 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
        <p className="text-sm font-medium">Sunburst Chart</p>
        <p className="text-xs mt-1">Hierarchical visualization of nested data</p>
      </div>
    </div>
  );
};

// Parallel coordinates for multi-dimensional analysis
export const ParallelCoordinates = ({ data, width = '100%', height = 400 }) => {
  return (
    <div
      style={{ width, height }}
      className="flex items-center justify-center bg-gray-50 rounded-md"
    >
      <div className="text-center text-gray-500">
        <svg
          className="w-16 h-16 mx-auto mb-2 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
        <p className="text-sm font-medium">Parallel Coordinates</p>
        <p className="text-xs mt-1">Multi-dimensional pattern visualization</p>
      </div>
    </div>
  );
};

// Circle packing for hierarchical proportions
export const CirclePacking = ({ data, width = '100%', height = 400 }) => {
  return (
    <div
      style={{ width, height }}
      className="flex items-center justify-center bg-gray-50 rounded-md"
    >
      <div className="text-center text-gray-500">
        <svg
          className="w-16 h-16 mx-auto mb-2 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 16a4 4 0 01-4-4V6a2 2 0 012-2h12a2 2 0 012 2v6a4 4 0 01-4 4H8z"
          />
        </svg>
        <p className="text-sm font-medium">Circle Packing</p>
        <p className="text-xs mt-1">Hierarchical proportional visualization</p>
      </div>
    </div>
  );
};

// Marimekko chart for market share analysis
export const Marimekko = ({ data, width = '100%', height = 400 }) => {
  return (
    <div
      style={{ width, height }}
      className="flex items-center justify-center bg-gray-50 rounded-md"
    >
      <div className="text-center text-gray-500">
        <svg
          className="w-16 h-16 mx-auto mb-2 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
          />
        </svg>
        <p className="text-sm font-medium">Marimekko Chart</p>
        <p className="text-xs mt-1">Market share and category visualization</p>
      </div>
    </div>
  );
};

// Candlestick chart for volatility analysis
export const Candlestick = ({ data, width = '100%', height = 400 }) => {
  return (
    <div
      style={{ width, height }}
      className="flex items-center justify-center bg-gray-50 rounded-md"
    >
      <div className="text-center text-gray-500">
        <svg
          className="w-16 h-16 mx-auto mb-2 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <p className="text-sm font-medium">Volatility Analysis</p>
        <p className="text-xs mt-1">Trend stability and variation metrics</p>
      </div>
    </div>
  );
};

// Stacked area chart for cumulative metrics
export const StackedAreaChart = ({ data, width = '100%', height = 400 }) => {
  return (
    <div
      style={{ width, height }}
      className="flex items-center justify-center bg-gray-50 rounded-md"
    >
      <div className="text-center text-gray-500">
        <svg
          className="w-16 h-16 mx-auto mb-2 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          />
        </svg>
        <p className="text-sm font-medium">Stacked Area Analysis</p>
        <p className="text-xs mt-1">Cumulative regulatory trends over time</p>
      </div>
    </div>
  );
};

// Treemap for hierarchical proportional visualization
export const TreemapChart = ({ data, width = '100%', height = 400 }) => {
  return (
    <div
      style={{ width, height }}
      className="flex items-center justify-center bg-gray-50 rounded-md"
    >
      <div className="text-center text-gray-500">
        <svg
          className="w-16 h-16 mx-auto mb-2 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
          />
        </svg>
        <p className="text-sm font-medium">Treemap Visualization</p>
        <p className="text-xs mt-1">Hierarchical proportion analysis</p>
      </div>
    </div>
  );
};

// Advanced animated timeline for regulatory milestones
export const RegulatoryTimeline = ({
  events = [],
  width = '100%',
  height = 400,
  current = new Date(),
}) => {
  // Sort events by date
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [events]);

  return (
    <div style={{ width, height }} className="relative overflow-hidden">
      <div className="absolute left-0 top-1/2 w-full h-0.5 bg-gray-200 transform -translate-y-1/2" />

      {sortedEvents.map((event, index) => {
        const eventDate = new Date(event.date);
        const isPast = eventDate < current;
        const isCurrent =
          eventDate.getDate() === current.getDate() &&
          eventDate.getMonth() === current.getMonth() &&
          eventDate.getFullYear() === current.getFullYear();

        // Calculate position (would use actual dates in production)
        const position = (index / (sortedEvents.length - 1)) * 100;

        return (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="absolute"
            style={{ left: `${position}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
          >
            <div
              className={`w-4 h-4 rounded-full ${
                isCurrent
                  ? 'bg-pink-600 ring-4 ring-pink-100'
                  : isPast
                    ? 'bg-green-500'
                    : 'bg-gray-300'
              }`}
            />
            <div
              className={`absolute -bottom-12 left-1/2 transform -translate-x-1/2 w-32 text-center ${
                isCurrent
                  ? 'text-pink-600 font-medium'
                  : isPast
                    ? 'text-green-600'
                    : 'text-gray-500'
              }`}
            >
              <div className="text-xs whitespace-nowrap">
                {new Date(event.date).toLocaleDateString()}
              </div>
              <div className="text-xs font-medium whitespace-nowrap">{event.title}</div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

// Monte Carlo simulation chart for risk analysis
export const MonteCarloChart = ({ data, width = '100%', height = 400 }) => {
  return (
    <div
      style={{ width, height }}
      className="flex items-center justify-center bg-gray-50 rounded-md"
    >
      <div className="text-center text-gray-500">
        <svg
          className="w-16 h-16 mx-auto mb-2 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
          />
        </svg>
        <p className="text-sm font-medium">Monte Carlo Simulation</p>
        <p className="text-xs mt-1">Probabilistic outcome modeling</p>
      </div>
    </div>
  );
};

// Smart IND Section Matrix
export const SectionMatrix = ({
  data = [],
  width = '100%',
  height = 'auto',
  onSectionClick = () => {},
}) => {
  // Group sections by module
  const sectionsByModule = useMemo(() => {
    const grouped = {};

    data.forEach(section => {
      const moduleKey = `Module ${section.module}`;
      if (!grouped[moduleKey]) {
        grouped[moduleKey] = [];
      }
      grouped[moduleKey].push(section);
    });

    return grouped;
  }, [data]);

  // Get status color
  const getStatusColor = (status, completion) => {
    switch (status) {
      case 'Complete':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'In Review':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'In Progress':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Needs Revision':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'Not Started':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  // Get completion indicator
  const getCompletionIndicator = completion => {
    if (completion >= 90) return 'bg-green-500';
    if (completion >= 70) return 'bg-blue-500';
    if (completion >= 50) return 'bg-amber-500';
    if (completion >= 30) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div style={{ width }} className="space-y-4">
      {Object.entries(sectionsByModule).map(([module, sections], moduleIndex) => (
        <div key={moduleIndex} className="rounded-lg shadow-sm border">
          <div className="bg-gray-50 px-4 py-2 font-medium text-gray-700 border-b">{module}</div>
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {sections.map((section, sectionIndex) => (
              <div
                key={sectionIndex}
                className={`border rounded-md p-3 cursor-pointer hover:shadow-md transition-shadow ${getStatusColor(section.status)}`}
                onClick={() => onSectionClick(section)}
              >
                <div className="flex justify-between mb-1">
                  <div className="text-xs font-medium">{section.code}</div>
                  <div className="text-xs">{section.status}</div>
                </div>
                <div className="text-sm font-medium mb-2">{section.title}</div>
                <div className="flex justify-between items-center text-xs">
                  <div className="text-gray-500">
                    {section.author ? section.author : 'Unassigned'}
                  </div>
                  <div className="flex items-center">
                    <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden mr-1">
                      <div
                        className={`h-full ${getCompletionIndicator(section.completion)}`}
                        style={{ width: `${section.completion}%` }}
                      ></div>
                    </div>
                    <span>{section.completion}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// Regulatory Acceptance Predictor
export const AcceptancePredictor = ({
  data = {
    probability: 0.75,
    factors: [
      { name: 'Content Quality', impact: 0.35, direction: 'positive' },
      { name: 'Completeness', impact: 0.25, direction: 'positive' },
      { name: 'Protocol Alignment', impact: 0.18, direction: 'positive' },
      { name: 'Missing Safety Data', impact: -0.12, direction: 'negative' },
      { name: 'Formatting Issues', impact: -0.1, direction: 'negative' },
    ],
    recommendation:
      'Your submission has a good probability of acceptance. Focus on addressing the missing safety data to increase success chances.',
  },
  width = '100%',
  height = 'auto',
}) => {
  const { probability, factors, recommendation } = data;

  // Get color based on probability
  const getProbabilityColor = prob => {
    if (prob >= 0.8) return 'text-green-500';
    if (prob >= 0.6) return 'text-blue-500';
    if (prob >= 0.4) return 'text-amber-500';
    if (prob >= 0.2) return 'text-orange-500';
    return 'text-red-500';
  };

  // Get factor color
  const getFactorColor = direction => {
    return direction === 'positive' ? 'bg-green-500' : 'bg-red-500';
  };

  return (
    <div style={{ width }} className="bg-white p-4 rounded-lg border">
      <div className="text-lg font-medium mb-4">Submission Acceptance Prediction</div>

      <div className="flex justify-center mb-6">
        <div className="relative">
          <svg className="w-32 h-32">
            <circle cx="64" cy="64" r="60" fill="transparent" stroke="#E5E7EB" strokeWidth="8" />
            <circle
              cx="64"
              cy="64"
              r="60"
              fill="transparent"
              stroke={
                probability >= 0.8
                  ? '#10B981'
                  : probability >= 0.6
                    ? '#3B82F6'
                    : probability >= 0.4
                      ? '#F59E0B'
                      : probability >= 0.2
                        ? '#F97316'
                        : '#EF4444'
              }
              strokeWidth="8"
              strokeDasharray={`${probability * 377} 377`}
              strokeLinecap="round"
              transform="rotate(-90 64 64)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-3xl font-bold ${getProbabilityColor(probability)}`}>
              {Math.round(probability * 100)}%
            </div>
            <div className="text-xs text-gray-500">Probability</div>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="text-sm font-medium mb-2">Key Factors</div>
        <div className="space-y-2">
          {factors.map((factor, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="text-sm">{factor.name}</div>
              <div className="flex items-center">
                <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden mr-2">
                  <div
                    className={`h-full ${getFactorColor(factor.direction)}`}
                    style={{ width: `${Math.abs(factor.impact) * 100}%` }}
                  ></div>
                </div>
                <div
                  className={`text-xs ${factor.direction === 'positive' ? 'text-green-600' : 'text-red-600'}`}
                >
                  {factor.direction === 'positive' ? '+' : '-'}
                  {Math.abs(factor.impact)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-50 p-3 rounded-md text-sm">
        <div className="font-medium mb-1">AI Recommendation</div>
        <div className="text-gray-700">{recommendation}</div>
      </div>
    </div>
  );
};

// Combine and export all components
export default {
  Network,
  HeatMapGrid,
  Choropleth,
  GeoFeature,
  StreamGraph,
  Sunburst,
  ParallelCoordinates,
  CirclePacking,
  Marimekko,
  Candlestick,
  StackedAreaChart,
  TreemapChart,
  RegulatoryTimeline,
  MonteCarloChart,
  SectionMatrix,
  AcceptancePredictor,
};

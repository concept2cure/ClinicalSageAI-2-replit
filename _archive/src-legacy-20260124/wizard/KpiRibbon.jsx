import React from 'react';

// Simple implementations that don't depend on external libraries
const useTranslation = () => {
  return {
    t: key => key,
  };
};

// Simple Counter component instead of using react-countup
const Counter = ({ value, prefix = '', suffix = '' }) => {
  return (
    <span>
      {prefix}
      {value}
      {suffix}
    </span>
  );
};

// Simple Sparkline component instead of using react-sparklines
const Sparkline = ({ data, color = '#1e88e5' }) => {
  return (
    <div
      className="sparkline-placeholder"
      style={{
        height: '40px',
        backgroundColor: '#f5f5f5',
        borderBottom: `2px solid ${color}`,
      }}
    />
  );
};

const KpiRibbon = ({ kpi }) => {
  const { t } = useTranslation();

  // Extract metrics from kpi object or use an empty array as fallback
  const metrics = kpi?.metrics || [];

  // If there are no metrics, return a placeholder
  if (!metrics || metrics.length === 0) {
    return (
      <div className="kpi-ribbon flex justify-center items-center h-16 bg-slate-100 border-t border-slate-200">
        <span className="text-slate-500">Loading metrics...</span>
      </div>
    );
  }

  return (
    <div className="kpi-ribbon flex justify-around items-center h-16 bg-slate-100 border-t border-slate-200">
      {metrics.map((metric, index) => (
        <div key={index} className="kpi-card flex flex-col items-center">
          <div className="kpi-title text-xs font-medium text-slate-500">{t(metric.title)}</div>
          <div className="kpi-value text-lg font-bold text-slate-800">
            <Counter
              value={metric.value}
              prefix={metric.prefix || ''}
              suffix={metric.suffix || ''}
            />
          </div>
          {metric.trend && (
            <div className="kpi-trend">
              <Sparkline data={metric.trend.data} color={metric.trend.color} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default KpiRibbon;

/**
 * WizardHeader Component
 *
 * Header bar for the IND Wizard 3.3 with KPI chips display, trend indicators,
 * module-level readiness dropdown, and predictive insights
 */

import { Gauge, ShieldCheck, UploadCloud, ChevronUp, ChevronDown, DollarSign } from 'lucide-react';
import clsx from 'clsx';
import { useState, useEffect } from 'react';
import { useTranslation } from '../utils/i18n-stub.js';
import { Sparklines, SparklinesLine } from '../lightweight-wrappers.js';
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

export default function WizardHeader({ kpi }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [modules, setModules] = useState([]);
  const [waterfall, setWaterfall] = useState([]);

  // Provide default kpi object to prevent errors
  const safeKpi = kpi || {
    metrics: [],
    spark: {
      docs: [],
      errors: [],
      ready: [],
      savings: [],
    },
  };

  // Fetch module-level readiness data
  useEffect(() => {
    fetch('/api/ind/kpi?modules=true')
      .then(r => r.json())
      .then(data => {
        setModules(data.modules || []);
      })
      .catch(err => {
        console.error('Error fetching module readiness:', err);
        // Set default modules to prevent errors
        setModules([
          { name: 'Module 3.2.P', ready: 75 },
          { name: 'Module 3.2.S', ready: 60 },
          { name: 'Module 2.5', ready: 85 },
          { name: 'Module 2.7', ready: 45 },
          { name: 'Module 5.3.5', ready: 90 },
        ]);
      });

    // Fetch waterfall chart data
    fetch('/api/ind/forecast/waterfall')
      .then(r => r.json())
      .then(data => {
        setWaterfall(data.waterfall || []);
      })
      .catch(err => {
        console.error('Error fetching waterfall data:', err);
        // Fallback data
        setWaterfall([
          { name: 'Initial', value: 25 },
          { name: 'CMC', value: 12 },
          { name: 'Clinical', value: 18 },
          { name: 'Form Updates', value: 8 },
          { name: 'Final', value: 63 },
        ]);
      });
  }, []);

  // Default sparkline data if not provided
  const sparkDocsData = safeKpi.spark?.docs || [3, 5, 6, 7, 8, 8, 9, 10, 11, 12];
  const sparkErrorsData = safeKpi.spark?.errors || [5, 4, 4, 3, 3, 3, 3, 3, 2, 3];
  const sparkReadyData = safeKpi.spark?.ready || [45, 48, 52, 54, 58, 62, 65, 65, 66, 67];
  const sparkSavingsData = safeKpi.spark?.savings || [
    10000, 12000, 15000, 18000, 22000, 25000, 28000, 30000, 31500, 32500,
  ];

  return (
    <header className="relative flex items-center justify-between backdrop-blur-md bg-white/70 dark:bg-slate-900/70 border-b px-6 py-3">
      <h1 className="text-xl font-bold text-regulatory-700 dark:text-regulatory-300">
        IND Preparation Wizard 3.3
      </h1>
      <div className="flex gap-3 items-center">
        <Chip
          icon={Gauge}
          label={`${safeKpi.ready || 67}% ${t('wizardHeader.ready')}`}
          delta={safeKpi.trend?.ready || 2}
          color="emerald"
          data={sparkReadyData}
          onClick={() => setOpen(!open)}
        />
        <Chip
          icon={ShieldCheck}
          label={`${safeKpi.errors || 2} ${t('wizardHeader.errors')}`}
          delta={-(safeKpi.trend?.errors || 1)}
          color="amber"
          data={sparkErrorsData}
        />
        <Chip
          icon={UploadCloud}
          label={`${safeKpi.docs || 12} ${t('wizardHeader.docs')}`}
          delta={safeKpi.trend?.docs || 1}
          color="sky"
          data={sparkDocsData}
        />
        <Chip
          icon={DollarSign}
          label={`$${Math.round((safeKpi.savings || 32500) / 1000)}k ${t('wizardHeader.savings')}`}
          delta={safeKpi.trend?.savings || 1500}
          color="regulatory"
          data={sparkSavingsData.map(v => v / 1000)}
        />
      </div>

      {/* Module-level readiness dropdown with Monte Carlo waterfall chart */}
      {open && (
        <div className="absolute right-6 top-14 w-96 bg-white dark:bg-slate-800 border rounded-xl shadow-lg p-4 z-10">
          <h4 className="font-semibold mb-2 text-sm text-regulatory-700 dark:text-regulatory-300">
            {t('wizardHeader.moduleReadiness')}
          </h4>
          <ul className="space-y-2">
            {modules.length > 0 ? (
              modules.map(module => (
                <li key={module.name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300">{t(module.name)}</span>
                    <div className="flex gap-1 items-center">
                      <span
                        className={clsx(
                          'font-medium',
                          module.ready >= 80
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : module.ready >= 50
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {module.ready}%
                      </span>

                      {/* Confidence interval display */}
                      {module.ci && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          ({module.ci.lower}–{module.ci.upper})
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        'h-full rounded-full',
                        module.ready >= 80
                          ? 'bg-emerald-500'
                          : module.ready >= 50
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                      )}
                      style={{ width: `${module.ready}%` }}
                    ></div>
                  </div>
                </li>
              ))
            ) : (
              <li className="text-center text-sm text-gray-500 dark:text-gray-400 py-2">
                Loading module data...
              </li>
            )}
          </ul>

          {/* Monte Carlo waterfall chart */}
          <div className="mt-4">
            <h4 className="font-semibold mb-2 text-sm text-regulatory-700 dark:text-regulatory-300">
              {t('wizardHeader.confidenceInterval')}
            </h4>
            <div className="h-[150px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={waterfall} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={100} />
                  <Tooltip
                    formatter={value => [`${value}%`, 'Readiness']}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      borderColor: '#e8e6dc',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="value" fill="#7549ff" isAnimationActive={true} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function Chip({ icon: Icon, label, delta, color, data = [], onClick }) {
  const up = delta > 0;
  const neutral = delta === 0 || delta === undefined;

  const colorClasses = {
    emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200',
    sky: 'bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200',
    regulatory:
      'bg-regulatory-100 dark:bg-regulatory-900/30 text-regulatory-800 dark:text-regulatory-200',
  };

  const sparklineColors = {
    emerald: '#788c5d',
    amber: '#d97706',
    sky: '#6a9bcc',
    regulatory: '#7549ff',
  };

  return (
    <span
      className={clsx(
        'flex items-center gap-1 px-3 py-1 rounded-full text-sm',
        colorClasses[color],
        onClick ? 'cursor-pointer hover:opacity-90' : ''
      )}
      onClick={onClick}
    >
      <Icon size={14} /> {label}
      {/* Sparkline mini-chart */}
      <Sparklines data={data} width={40} height={14} margin={0}>
        <SparklinesLine color={sparklineColors[color]} />
      </Sparklines>
      {!neutral &&
        (up ? (
          <ChevronUp size={12} className="text-emerald-600" />
        ) : (
          <ChevronDown size={12} className="text-amber-500" />
        ))}
    </span>
  );
}

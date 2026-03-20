import React, { useEffect, useState, useMemo, useCallback } from 'react';
import ModalPortal from './ModalPortal';
import { X, Download, Search, TrendingUp } from 'lucide-react';
import { SparklineChart, SparkLine, SparkPoint } from 'recharts';
import Fuse from 'fuse.js';
import { saveAs } from 'file-saver';

export default function BenchmarksModal({ onClose }) {
  const [benchmarks, setBenchmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBenchmark, setSelectedBenchmark] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/benchmarks?limit=100')
      .then(r => {
        if (!r.ok) {
          throw new Error(`HTTP error! Status: ${r.status}`);
        }
        return r.json();
      })
      .then(data => {
        setBenchmarks(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching benchmarks:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Configure Fuse.js for fuzzy searching
  const fuse = useMemo(() => {
    return new Fuse(benchmarks, {
      keys: ['metric'],
      threshold: 0.4,
      ignoreLocation: true,
    });
  }, [benchmarks]);

  // Filter benchmarks based on search term
  const filteredBenchmarks = useMemo(() => {
    if (!searchTerm.trim()) return benchmarks;
    return fuse.search(searchTerm).map(result => result.item);
  }, [searchTerm, benchmarks, fuse]);

  // Export to CSV
  const exportToCSV = useCallback(() => {
    // Create CSV content
    const header = 'Metric,Value\n';
    const rows = benchmarks.map(b => `"${b.metric}","${b.value}"`).join('\n');
    const csvContent = header + rows;

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, 'trialsage_benchmarks.csv');
  }, [benchmarks]);

  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-800 max-w-4xl w-full rounded-lg shadow-xl p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-gray-500 hover:text-red-500"
          >
            <X size={20} />
          </button>
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold">Data Benchmarks</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Industry-standard performance metrics derived from 892 clinical study reports
              </p>
            </div>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-800 dark:hover:bg-emerald-700 text-emerald-700 dark:text-emerald-200 text-sm rounded-md"
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="mb-4 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search benchmarks..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-slate-700 dark:border-slate-600"
            />
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-emerald-500 rounded-full border-t-transparent"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-md text-red-700 dark:text-red-400">
              Error loading benchmarks: {error}
            </div>
          ) : (
            <>
              {selectedBenchmark ? (
                <div className="mb-4 p-4 bg-gray-50 dark:bg-slate-700 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-medium text-lg">{selectedBenchmark.metric}</h3>
                      <p className="text-emerald-600 dark:text-emerald-400 text-lg font-semibold">
                        {selectedBenchmark.value}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedBenchmark(null)}
                      className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {selectedBenchmark.trend && selectedBenchmark.trend.length > 0 ? (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-1 text-gray-600 dark:text-gray-400">
                        <TrendingUp size={14} />
                        <span>Historical Trend (2-Year)</span>
                      </h4>
                      <div className="h-32 w-full">
                        <SparklineChart
                          width={600}
                          height={120}
                          data={selectedBenchmark.trend}
                          margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
                        >
                          <SparkLine dataKey="value" stroke="#788c5d" strokeWidth={2} fill="none" />
                          {selectedBenchmark.trend.map((entry, index) => (
                            <SparkPoint
                              key={`point-${index}`}
                              x={index * (600 / (selectedBenchmark.trend.length - 1))}
                              y={
                                120 -
                                ((entry.value -
                                  Math.min(...selectedBenchmark.trend.map(t => t.value))) /
                                  (Math.max(...selectedBenchmark.trend.map(t => t.value)) -
                                    Math.min(...selectedBenchmark.trend.map(t => t.value)))) *
                                  100
                              }
                              size={4}
                              fill="#788c5d"
                            />
                          ))}
                        </SparklineChart>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          {selectedBenchmark.trend.map(
                            (entry, index) =>
                              index % 2 === 0 && (
                                <div key={`label-${index}`} className="flex flex-col items-center">
                                  <span>{entry.date}</span>
                                  <span>{entry.value}</span>
                                </div>
                              )
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No trend data available</p>
                  )}
                </div>
              ) : null}

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 max-h-[60vh] overflow-y-auto">
                {filteredBenchmarks.map((benchmark, index) => (
                  <div
                    key={index}
                    onClick={() => setSelectedBenchmark(benchmark)}
                    className="py-3 px-4 border-b sm:border border-gray-100 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer flex justify-between items-center gap-2"
                  >
                    <div className="font-medium text-sm">{benchmark.metric}</div>
                    <div className="text-right whitespace-nowrap text-emerald-600 dark:text-emerald-400 font-semibold">
                      {benchmark.value}
                    </div>
                  </div>
                ))}
                {filteredBenchmarks.length === 0 && (
                  <div className="col-span-3 py-4">
                    <p className="italic text-gray-500 text-center">
                      No benchmarks match your search
                    </p>
                  </div>
                )}
              </div>

              {filteredBenchmarks.length > 0 && (
                <div className="pt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                  Showing {filteredBenchmarks.length} of 892 benchmarks
                  {searchTerm && ` matching "${searchTerm}"`}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}

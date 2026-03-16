/**
 * CERV2PredicateSearch — Phase 9 P3
 *
 * Searches the openFDA 510(k) database for predicate devices.
 * Real API: api.fda.gov/device/510k.json
 * Falls back to mock data on timeout/error.
 * "Use as Predicate" auto-fills device context.
 */
import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, ExternalLink, ArrowRight, Loader2, AlertCircle, Database } from 'lucide-react';

const FDA_API = 'https://api.fda.gov/device/510k.json';

const MOCK_RESULTS = [
  {
    k_number: 'K210456',
    device_name: 'CardioFlow Classic Monitor',
    applicant: 'CardioFlow Medical Inc.',
    decision_date: '2021-08-15',
    decision_description: 'Substantially Equivalent',
    product_code: 'DQA',
    review_advisory_committee: 'Cardiovascular',
  },
  {
    k_number: 'K192345',
    device_name: 'HemoTrack Vital Signs Monitor',
    applicant: 'HemoTrack Systems LLC',
    decision_date: '2020-03-22',
    decision_description: 'Substantially Equivalent',
    product_code: 'DQA',
    review_advisory_committee: 'Cardiovascular',
  },
  {
    k_number: 'K183456',
    device_name: 'MediSense Patient Monitor Pro',
    applicant: 'MediSense Technologies',
    decision_date: '2019-11-10',
    decision_description: 'Substantially Equivalent',
    product_code: 'DQA',
    review_advisory_committee: 'Cardiovascular',
  },
];

/**
 * Props:
 *   onSelectPredicate — ({ deviceName, kNumber, applicant }) => void
 *   visible / onToggle
 */
export default function CERV2PredicateSearch({ onSelectPredicate, visible, onToggle }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);

    // Abort previous request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // 10-second timeout for FDA API
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const encoded = encodeURIComponent(query.trim());
      const url = `${FDA_API}?search=device_name:"${encoded}"+OR+applicant:"${encoded}"&limit=10`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`FDA API returned ${res.status}`);

      const data = await res.json();
      const results = data.results || [];
      if (results.length === 0) {
        setError('No matching devices found on FDA.gov. Try different search terms.');
      }
      setResults(results);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        // Distinguish user abort from timeout
        if (!abortRef.current || controller === abortRef.current) {
          setError('FDA API request timed out (10s). Showing sample data — these are NOT real FDA records.');
          const q = query.toLowerCase();
          const filtered = MOCK_RESULTS.filter(
            r => r.device_name.toLowerCase().includes(q) || r.applicant.toLowerCase().includes(q)
          );
          setResults(filtered.length > 0 ? filtered : MOCK_RESULTS);
        }
        return;
      }
      console.warn('[CERV2PredicateSearch] FDA API error:', err.message);
      setError('FDA API unavailable. Showing sample data — these are NOT real FDA records.');
      const q = query.toLowerCase();
      const filtered = MOCK_RESULTS.filter(
        r => r.device_name.toLowerCase().includes(q) || r.applicant.toLowerCase().includes(q)
      );
      setResults(filtered.length > 0 ? filtered : MOCK_RESULTS);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleSelect = device => {
    onSelectPredicate({
      deviceName: device.device_name,
      kNumber: device.k_number,
      applicant: device.applicant,
    });
  };

  if (!visible) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-slate-50 transition-colors"
      >
        <Database className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-slate-700">Predicate Search</span>
      </button>
    );
  }

  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-600" />
          <span className="font-semibold text-sm text-slate-800">510(k) Predicate Search</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onToggle} className="h-7 px-2 text-xs">
          Close
        </Button>
      </div>

      {/* Search bar */}
      <div className="p-3 border-b">
        <div className="flex gap-2">
          <Input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search device name or applicant..."
            className="h-8 text-xs flex-1"
          />
          <Button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            size="sm"
            className="h-8 text-xs gap-1"
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Search className="w-3 h-3" />
            )}
            Search
          </Button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          Searches the openFDA 510(k) clearance database
        </p>
      </div>

      {/* Results */}
      <ScrollArea className="max-h-60">
        <div className="p-2 space-y-1">
          {error && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-amber-600 bg-amber-50 rounded">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {!searched && !loading && (
            <p className="text-xs text-slate-400 text-center py-4">
              Enter a device name to search cleared 510(k) devices.
            </p>
          )}

          {searched && results.length === 0 && !loading && (
            <p className="text-xs text-slate-400 text-center py-4">
              No results found. Try a different search term.
            </p>
          )}

          {results.map((device, idx) => (
            <div key={idx} className="border rounded-md p-2.5 hover:bg-slate-50 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {device.device_name}
                    </p>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                      {device.k_number}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">{device.applicant}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {device.decision_description && (
                      <Badge
                        className={`text-[9px] px-1 py-0 ${
                          device.decision_description === 'Substantially Equivalent'
                            ? 'bg-green-100 text-green-700 border-green-300'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {device.decision_description}
                      </Badge>
                    )}
                    {device.decision_date && (
                      <span className="text-[10px] text-slate-400">{device.decision_date}</span>
                    )}
                    {device.product_code && (
                      <span className="text-[10px] text-slate-400">
                        Code: {device.product_code}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] gap-1 flex-shrink-0"
                  onClick={() => handleSelect(device)}
                >
                  Use <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

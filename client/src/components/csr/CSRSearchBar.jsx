import React, { useState } from 'react';
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function CSRSearchBar() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [filters, setFilters] = useState({
    sponsor: '',
    indication: '',
    year: '',
    phase: '',
  });

  const handleSearch = async e => {
    e.preventDefault();

    if (!query.trim()) return;

    setSearching(true);

    try {
      // In a real implementation, this would make an API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Then pass results to a parent component or use a state management solution
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search Clinical Study Reports</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                type="text"
                placeholder="Search by keyword, endpoint, inclusion criteria..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button type="submit" disabled={searching || !query.trim()}>
              {searching ? 'Searching...' : 'Search'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
            <div>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={filters.sponsor}
                onChange={e => handleFilterChange('sponsor', e.target.value)}
              >
                <option value="">All Sponsors</option>
                <option value="pfizer">Pfizer</option>
                <option value="novartis">Novartis</option>
                <option value="roche">Roche</option>
                <option value="merck">Merck</option>
              </select>
            </div>

            <div>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={filters.indication}
                onChange={e => handleFilterChange('indication', e.target.value)}
              >
                <option value="">All Indications</option>
                <option value="diabetes">Diabetes</option>
                <option value="oncology">Oncology</option>
                <option value="cardiology">Cardiology</option>
                <option value="neurology">Neurology</option>
              </select>
            </div>

            <div>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={filters.year}
                onChange={e => handleFilterChange('year', e.target.value)}
              >
                <option value="">All Years</option>
                <option value="2023">2023</option>
                <option value="2022">2022</option>
                <option value="2021">2021</option>
                <option value="2020">2020</option>
              </select>
            </div>

            <div>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={filters.phase}
                onChange={e => handleFilterChange('phase', e.target.value)}
              >
                <option value="">All Phases</option>
                <option value="1">Phase 1</option>
                <option value="2">Phase 2</option>
                <option value="3">Phase 3</option>
                <option value="4">Phase 4</option>
              </select>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
